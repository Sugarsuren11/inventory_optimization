from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import text

from analytics.data_sync import sync_sales_to_postgres
from analytics.mba_engine import MbaResult, run_mba
from analytics.prophet_model import build_prophet_demand_forecast
from database import engine

logger = logging.getLogger(__name__)

ABC_DESC: dict[str, str] = {
    "AX": "Өндөр ач холбогдол, Бага хэлбэлзэл",
    "AY": "Өндөр ач холбогдол, Дунд хэлбэлзэл",
    "AZ": "Өндөр ач холбогдол, Өндөр хэлбэлзэл",
    "BX": "Дунд ач холбогдол, Бага хэлбэлзэл",
    "BY": "Дунд ач холбогдол, Дунд хэлбэлзэл",
    "BZ": "Дунд ач холбогдол, Өндөр хэлбэлзэл",
    "CX": "Бага ач холбогдол, Бага хэлбэлзэл",
    "CY": "Бага ач холбогдол, Дунд хэлбэлзэл",
    "CZ": "Бага ач холбогдол, Өндөр хэлбэлзэл",
}

_REORDER_PER_CATEGORY = 2    # нийт дээд тал ~18 мөр (A ангилалд 3 хүртэл)
_REORDER_PER_A_CATEGORY = 3  # A ангилалд илүү их харуулна

# ── Lift-д суурилсан Safety Stock коэффициентүүд ──────────────────────────
# Lift >= 1.5 : Нягт дагалдах бараа  → SS 20% нэмнэ
# Lift 1–1.5  : Дагалдах бараа       → SS өөрчлөхгүй
# Lift < 1.0  : Орлох бараа          → Inventory Pooling: SS 20% хасна
_SS_BOOST_LIFT_THRESHOLD  = 1.5   # дагалдах нягт хамаарал
_SS_BOOST_FACTOR          = 1.20  # +20%
_SS_POOL_FACTOR           = 0.80  # –20% (орлох бараанд)


def _sample_per_category(
    products: pd.DataFrame,
    per_category: int,
    *,
    a_override: int | None = None,
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for cat, grp in products.groupby("category", sort=False):
        limit = per_category
        if a_override is not None and str(cat).startswith("A"):
            limit = a_override
        frames.append(grp.head(limit))

    if not frames:
        return products.iloc[0:0]

    return pd.concat(frames).sort_values("revenue", ascending=False).reset_index(drop=True)


def _load_sales_dataframe_from_db() -> pd.DataFrame:
    df = pd.read_sql(
        text(
            """
            SELECT
                invoice AS "Invoice",
                product_id AS "StockCode",
                description AS "Description",
                quantity AS "Quantity",
                price AS "Price",
                invoice_date AS "InvoiceDate"
            FROM sales_transactions
            """
        ),
        engine,
    )
    if df.empty:
        return df

    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"], errors="coerce")
    df = df.dropna(subset=["InvoiceDate"])
    df["Revenue"] = df["Quantity"] * df["Price"]
    df["Month"] = df["InvoiceDate"].dt.to_period("M").astype(str)
    return df


def _build_product_metrics(sales: pd.DataFrame) -> pd.DataFrame:
    monthly_qty = (
        sales.groupby(["StockCode", "Description", "Month"], as_index=False)
        .agg(monthly_qty=("Quantity", "sum"))
    )

    cv = monthly_qty.groupby(["StockCode", "Description"], as_index=False).agg(
        monthly_mean=("monthly_qty", "mean"),
        monthly_std=("monthly_qty", "std"),
    )
    cv["monthly_std"] = cv["monthly_std"].fillna(0.0)
    cv["cv"] = np.where(cv["monthly_mean"] > 0, cv["monthly_std"] / cv["monthly_mean"], 0.0)

    metrics = (
        sales.groupby(["StockCode", "Description"], as_index=False)
        .agg(
            total_qty=("Quantity", "sum"),
            revenue=("Revenue", "sum"),
            unit_cost=("Price", "median"),
        )
        .merge(cv[["StockCode", "Description", "cv", "monthly_mean"]], on=["StockCode", "Description"], how="left")
    )

    metrics["cv"] = metrics["cv"].fillna(0.0)
    metrics["monthly_mean"] = metrics["monthly_mean"].fillna(0.0)
    metrics = metrics.sort_values("revenue", ascending=False).reset_index(drop=True)

    total_revenue = max(float(metrics["revenue"].sum()), 1.0)
    metrics["revenue_share"] = metrics["revenue"] / total_revenue
    metrics["cum_share"] = metrics["revenue_share"].cumsum()

    metrics["abc"] = np.select(
        [metrics["cum_share"] <= 0.80, metrics["cum_share"] <= 0.95],
        ["A", "B"],
        default="C",
    )
    # Олон улсын стандарт босго: X < 0.25, Y 0.25–0.75, Z > 0.75
    metrics["xyz"] = np.select(
        [metrics["cv"] <= 0.25, metrics["cv"] <= 0.75],
        ["X", "Y"],
        default="Z",
    )
    metrics["category"] = metrics["abc"] + metrics["xyz"]

    max_revenue = max(float(metrics["revenue"].max()), 1.0)
    metrics["value_score"]       = (metrics["revenue"] / max_revenue * 100).clip(5, 100)
    metrics["variability_score"] = (metrics["cv"] * 100).clip(5, 100)

    return metrics


def _build_demand_forecast(sales: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        return build_prophet_demand_forecast(sales)
    except Exception as exc:
        logger.warning("Prophet таамаглал амжилтгүй боллоо, fallback ашиглана: %s", exc)

    monthly = (
        sales.groupby("Month", as_index=False)
        .agg(actual=("Quantity", "sum"))
        .sort_values("Month")
    )

    if monthly.empty:
        return [], {"current_month": 0, "next_month_prediction": 0, "growth_pct": 0.0, "mape": 0.0}

    history     = monthly.tail(6).copy()
    last_actual = int(history["actual"].iloc[-1])
    recent      = monthly.tail(4)["actual"].to_numpy(dtype=float)
    moving_avg  = float(recent.mean()) if len(recent) else float(last_actual)
    trend       = float(recent[-1] - recent[0]) / max(len(recent) - 1, 1) if len(recent) > 1 else 0.0

    future_rows: list[dict[str, Any]] = []
    latest_period = pd.Period(monthly["Month"].iloc[-1], freq="M")
    for step in range(1, 5):
        month     = (latest_period + step).strftime("%Y-%m")
        predicted = max(0.0, moving_avg + trend * step)
        future_rows.append(
            {
                "month":     month,
                "actual":    None,
                "predicted": round(predicted, 0),
                "lower":     round(max(0.0, predicted * 0.88), 0),
                "upper":     round(predicted * 1.12, 0),
            }
        )

    chart: list[dict[str, Any]] = [
        {"month": row["Month"], "actual": int(row["actual"]), "predicted": None, "lower": None, "upper": None}
        for _, row in history.iterrows()
    ]
    chart.extend(future_rows)

    base             = history["actual"].shift(1).dropna()
    actual_for_mape  = history["actual"].iloc[1:]
    mape = float(
        (np.abs((actual_for_mape.to_numpy() - base.to_numpy()) / np.maximum(actual_for_mape.to_numpy(), 1))).mean() * 100
    ) if len(base) > 0 else 0.0

    next_pred  = int(future_rows[0]["predicted"]) if future_rows else last_actual
    growth_pct = ((next_pred - last_actual) / max(last_actual, 1)) * 100

    return chart, {
        "current_month":        last_actual,
        "next_month_prediction": next_pred,
        "growth_pct":           round(growth_pct, 1),
        "mape":                 round(mape, 1),
    }


def _to_rule_rows(sales: pd.DataFrame) -> tuple[list[dict[str, Any]], MbaResult]:
    """
    Буцаах утга:
        market_rows — dashboard-д харуулах нийлмэл дүрмүүд
                      (дагалдах + орлох)
        mba_result  — Safety Stock болон Pooling тооцоолоход хэрэглэх
    """
    mba = run_mba(sales, invoice_col="Invoice", desc_col="Description", qty_col="Quantity")
    market_rows = sorted(
        [*mba.complementary_rows, *mba.substitute_rows],
        key=lambda x: abs(float(x.get("lift", 0.0)) - 1.0),
        reverse=True,
    )
    return market_rows, mba


def _build_reordering_items(
    products: pd.DataFrame,
    mba: MbaResult,
) -> list[dict[str, Any]]:
    sampled = _sample_per_category(
        products,
        per_category=_REORDER_PER_CATEGORY,
        a_override=_REORDER_PER_A_CATEGORY,
    ).reset_index(drop=True)

    reordering: list[dict[str, Any]] = []

    for idx, (_, row) in enumerate(sampled.iterrows()):
        desc      = str(row["Description"])
        lead_time = 5 if row["xyz"] == "X" else 8 if row["xyz"] == "Y" else 12
        daily_demand = max(float(row["total_qty"]) / 365.0, 0.1)

        # ── ЗАСВАР Bug 3: Lift-д суурилсан динамик Safety Stock ──────────
        base_ss = daily_demand * lead_time * 0.5

        max_lift       = mba.lift_map.get(desc, 1.0)
        has_substitute = desc in mba.substitute_map

        if max_lift >= _SS_BOOST_LIFT_THRESHOLD:
            # Нягт дагалдах бараа: SS нэмнэ (+20%)
            # Учир нь нэг нь дуусахад нөгөөгийнхөө борлуулалт унах эрсдэл өндөр
            safety_stock   = base_ss * _SS_BOOST_FACTOR
            ss_reason      = f"Lift={max_lift:.2f} дагалдах → SS +20%"
        elif has_substitute:
            # Орлох бараа байгаа: Inventory Pooling → SS бага (–20%)
            # Учир нь нэг нь дуусахад хэрэглэгч орлох барааг авах тул
            # нийт ангилалынхаа хэмжээнд нөөцлөхөд хангалттай
            safety_stock   = base_ss * _SS_POOL_FACTOR
            ss_reason      = f"Орлох бараатай → Pooling SS –20%"
        else:
            safety_stock   = base_ss
            ss_reason      = "Стандарт SS"

        dynamic_rop  = int(round(daily_demand * lead_time + safety_stock))
        stock_factor = 0.55 + (idx % 4) * 0.15
        current_stock = int(max(1, round(dynamic_rop * stock_factor)))
        suggested_qty = int(max(dynamic_rop * 2 - current_stock, 1))

        cv = float(row["cv"])
        if cv > 1.0:
            seasonality: str | None = "high"
        elif cv > 0.6:
            seasonality = "medium"
        elif cv > 0.3:
            seasonality = "low"
        else:
            seasonality = None

        # Дагалдах барааны trigger холбоос (Synchronized ROP)
        complement_triggers = mba.complement_map.get(desc, [])
        # Орлох барааны холбоос (Inventory Pooling)
        substitute_links    = mba.substitute_map.get(desc, [])

        reordering.append(
            {
                "id":               str(idx + 1),
                "productName":      desc,
                "sku":              str(row["StockCode"]),
                "currentStock":     current_stock,
                "dynamicROP":       dynamic_rop,
                "suggestedOrderQty": suggested_qty,
                "unitCost":         round(float(row["unit_cost"]), 2),
                "leadTime":         lead_time,
                "category":         str(row["category"]),
                "seasonality":      seasonality,
                # Дагалдах барааны Synchronized ROP trigger
                "triggerLinks":     {"triggers": complement_triggers[:2]} if complement_triggers else {},
                # Орлох барааны Inventory Pooling холбоос
                "substituteLinks":  substitute_links[:2],
                # Safety Stock-ийн шийдвэрийн тайлбар
                "ssReason":         ss_reason,
                "liftFactor":       round(max_lift, 3),
                "selected":         current_stock < dynamic_rop,
            }
        )

    return reordering


def _build_alerts(
    reordering_items: list[dict[str, Any]],
    complementary_rows: list[dict[str, Any]],
    substitute_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    for item in reordering_items:
        if item["currentStock"] < item["dynamicROP"]:
            gap = item["dynamicROP"] - item["currentStock"]
            # Дагалдах бараатай бол Synchronized захиалгыг санал болго
            trigger_note = ""
            if item["triggerLinks"].get("triggers"):
                partners = ", ".join(item["triggerLinks"]["triggers"][:2])
                trigger_note = f" Дагалдах бараа ({partners})-г хамт шалгаарай."
            alerts.append(
                {
                    "id":       f"critical-{item['id']}",
                    "type":     "critical",
                    "category": "Нөөц дуусах эрсдэл",
                    "product":  f"{item['productName']} ({item['category']})",
                    "message":  f"ROP-оос {gap} нэгжээр бага байна. Яаралтай нөхөн захиалга шаардлагатай.{trigger_note}",
                    "action":   "Захиалга үүсгэх",
                    "priority": 1,
                }
            )
        elif item["seasonality"] in ("high", "medium"):
            alerts.append(
                {
                    "id":       f"warning-{item['id']}",
                    "type":     "warning",
                    "category": "Эрэлтийн хэлбэлзэл",
                    "product":  f"{item['productName']} ({item['category']})",
                    "message":  f"Энэ SKU-ийн эрэлт тогтворгүй байна. {item['ssReason']}.",
                    "action":   "Параметр шалгах",
                    "priority": 2,
                }
            )

    # Хамгийн нягт дагалдах дүрэм
    if complementary_rows:
        best = complementary_rows[0]
        alerts.append(
            {
                "id":       "mba-complementary",
                "type":     "success",
                "category": "Дагалдах бараа (Lift > 1)",
                "product":  f"{best['itemA']} + {best['itemB']}",
                "message":  f"Lift={best['lift']:.2f}, Confidence={best['confidence'] * 100:.1f}% — хамт байршуулж, Synchronized захиалга хийхэд үр ашигтай.",
                "action":   "Багц захиалга бэлтгэх",
                "priority": 3,
            }
        )

    # Хамгийн хүчтэй орлох бараа
    if substitute_rows:
        worst = substitute_rows[0]  # хамгийн бага Lift = хамгийн хүчтэй орлолт
        alerts.append(
            {
                "id":       "mba-substitute",
                "type":     "info",
                "category": "Орлох бараа (Lift < 1) — Inventory Pooling",
                "product":  f"{worst['itemA']} ↔ {worst['itemB']}",
                "message":  f"Lift={worst['lift']:.2f} — эдгээр бараа бие биеэ орлодог. Safety Stock-ийг хуваалцан барина.",
                "action":   "Pooling стратеги шалгах",
                "priority": 4,
            }
        )

    alerts.sort(key=lambda x: x["priority"])
    return alerts[:8]


def build_insights_payload(file_path: Path) -> dict[str, Any]:
    sync_sales_to_postgres(file_path)
    sales = _load_sales_dataframe_from_db()
    if sales.empty:
        raise ValueError("Өгөгдөл хоосон байна. Эх үүсвэр файлаа шалгана уу.")

    products = _build_product_metrics(sales)
    # Matrix дээр category тус бүрийг таслахгүй, бүх SKU-г харуулна.
    matrix_products = products.reset_index(drop=True)

    abc_xyz_matrix: list[dict[str, Any]] = []
    for idx, (_, row) in enumerate(matrix_products.iterrows()):
        abc_xyz_matrix.append(
            {
                "id":          str(idx + 1),
                "name":        str(row["Description"]),
                "sku":         str(row["StockCode"]),
                "category":    str(row["category"]),
                "description": ABC_DESC.get(str(row["category"]), "-"),
                "value":       round(float(row["value_score"]),       2),
                "variability": round(float(row["variability_score"]), 2),
                "revenue":     round(float(row["revenue"]),           2),
            }
        )

    # MBA — complementary (Lift >= 1) болон substitute (Lift < 1) зэрэг тооцоолно
    market_rows, mba = _to_rule_rows(sales)

    demand_forecast_chart, demand_summary = _build_demand_forecast(sales)

    # Safety Stock динамик коэффициенттэй захиалгын жагсаалт
    reordering_items = _build_reordering_items(products, mba)

    alerts = _build_alerts(reordering_items, mba.complementary_rows, mba.substitute_rows)

    summary = {
        "total_products":       int(products.shape[0]),
        "mape":                 demand_summary["mape"],
        "mba_rules":            len(market_rows),
        "substitute_rules":     len(mba.substitute_rows),
        "active_alerts":        len([a for a in alerts if a["type"] in ("critical", "warning")]),
    }

    return {
        "summary":          summary,
        "abc_xyz_matrix":   abc_xyz_matrix,
        # Dashboard-д дагалдах + орлох дүрмүүдийг хамт буцаана
        "market_basket_rules": market_rows,
        # Орлох бараануудыг тусдаа endpoint-д буцаана
        "substitute_rules": mba.substitute_rows,
        "demand_forecast": {
            "chart":   demand_forecast_chart,
            "summary": demand_summary,
        },
        "alerts":           alerts,
        "reordering":       reordering_items,
    }
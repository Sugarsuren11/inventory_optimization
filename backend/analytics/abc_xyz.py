from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import text

from analytics.data_sync import sync_sales_to_postgres
from analytics.mba_engine import MbaResult, run_mba
from analytics.prophet_model import build_prophet_demand_forecast, build_sku_demand_forecast
from database import engine, SessionLocal

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

# ── MBA Lift-д суурилсан шатлалт Safety Stock тохируулга ─────────────────
# Lift утга их байх тусам хамт авах хандлага хүчтэй → нэг нь дуусвал
# нөгөөгийнхөө борлуулалт мөн унадаг → SS-г пропорциональ нэмнэ.
#
# Lift > 3.0  : Маш хүчтэй хамаарал → SS +40%  (~98% SL)
# Lift 2–3    : Хүчтэй хамаарал     → SS +30%  (~97% SL)
# Lift 1.5–2  : Дунд хамаарал       → SS +20%  (~97% SL)
# Lift 1–1.5  : Сул хамаарал        → SS +10%  (~96% SL)
# Орлох бараа : Inventory Pooling    → SS –20%  (~92% SL)
_SS_POOL_FACTOR = 0.80           # орлох бараанд хэрэглэх
_SS_BOOST_LIFT_THRESHOLD = 1.5  # lift≥1.5 байвал MBA бараа ЗААВАЛ sample-д орно


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
    sku_demand: dict[str, float],
    sales: pd.DataFrame,   # ← ШИНЭ: currentStock симуляцид хэрэглэнэ
) -> list[dict[str, Any]]:
    # 1. Ердийн sample (category тус бүрээс 2–3)
    sampled = _sample_per_category(
        products,
        per_category=_REORDER_PER_CATEGORY,
        a_override=_REORDER_PER_A_CATEGORY,
    )

    # 2. MBA lift≥1.5 байгаа бараануудыг цуглуулах
    lift_products: set[str] = set()
    for desc, lift_val in mba.lift_map.items():
        if lift_val >= _SS_BOOST_LIFT_THRESHOLD:
            lift_products.add(desc)

    # 3. substitute_map-д байгаа бараануудыг нэмж оруулах
    for desc in mba.substitute_map:
        lift_products.add(desc)

    # 4. Sample-д байхгүй MBA бараануудыг products-оос олж нэмэх (хамгийн өндөр lift-тэй 10)
    sampled_descriptions: set[str] = set(sampled["Description"].tolist())
    missing_mba = lift_products - sampled_descriptions

    if missing_mba:
        mba_rows = products[products["Description"].isin(missing_mba)].copy()
        mba_rows["_lift"] = mba_rows["Description"].map(lambda d: mba.lift_map.get(d, 0.0))
        mba_rows = mba_rows.sort_values("_lift", ascending=False).head(10).drop(columns=["_lift"])
        sampled = (
            pd.concat([sampled, mba_rows])
            .drop_duplicates(subset=["Description"])
            .reset_index(drop=True)
        )

    # Борлуулалтын сүүлийн өдрийг тооцоолох (currentStock симуляцид хэрэглэнэ)
    sales = sales.copy()
    sales["InvoiceDate_dt"] = pd.to_datetime(sales["InvoiceDate"], errors="coerce")
    max_date = sales["InvoiceDate_dt"].max()

    reordering: list[dict[str, Any]] = []

    for idx, (_, row) in enumerate(sampled.iterrows()):
        desc      = str(row["Description"])
        lead_time = 5 if row["xyz"] == "X" else 8 if row["xyz"] == "Y" else 12

        # ── Prophet + MBA хослуулсан ROP ─────────────────────────────────
        # Prophet SKU-түвшний таамаглал байвал ашиглана, эс бол түүхийн дундаж
        historical_daily = max(float(row["total_qty"]) / 365.0, 0.1)
        prophet_daily    = sku_demand.get(desc)
        if prophet_daily is not None:
            daily_demand   = prophet_daily
            forecast_source = "prophet"
        else:
            daily_demand   = historical_daily
            forecast_source = "historical"

        # ── Стандарт Safety Stock: SS = Z × σ_d × √(L) ──────────────────
        # Z = 1.65 → 95% үйлчилгээний түвшин (service level)
        # σ_d = daily_demand × CV  (өдрийн эрэлтийн стандарт хазайлт)
        # L   = lead_time (хоногоор)
        _Z_SCORE = 1.65  # 95% SL
        cv       = float(row["cv"])
        sigma_d  = daily_demand * cv          # өдрийн эрэлтийн std
        base_ss  = _Z_SCORE * sigma_d * math.sqrt(lead_time)

        max_lift       = mba.lift_map.get(desc, 1.0)
        has_substitute = desc in mba.substitute_map

        # ── MBA Lift-д суурилсан шатлалт SS тохируулга ───────────────────
        # Lift утга их байх тусам SS пропорциональ өсдөг — энэ нь системийн
        # гол зорилго: MBA → динамик Safety Stock → сайжруулсан ROP
        if max_lift > 3.0:
            lift_factor  = 1.40
            ss_reason    = f"Lift={max_lift:.2f} > 3.0 → SS +40% (~98% SL)"
        elif max_lift >= 2.0:
            lift_factor  = 1.30
            ss_reason    = f"Lift={max_lift:.2f} ≥ 2.0 → SS +30% (~97% SL)"
        elif max_lift >= 1.5:
            lift_factor  = 1.20
            ss_reason    = f"Lift={max_lift:.2f} ≥ 1.5 → SS +20% (~97% SL)"
        elif max_lift > 1.0:
            lift_factor  = 1.10
            ss_reason    = f"Lift={max_lift:.2f} > 1.0 → SS +10% (~96% SL)"
        elif has_substitute:
            # Орлох бараа: Inventory Pooling → SS бага байж болно
            lift_factor  = _SS_POOL_FACTOR
            ss_reason    = f"Орлох бараатай → Pooling SS –20% (~92% SL)"
        else:
            lift_factor  = 1.0
            ss_reason    = f"Стандарт SS (Z=1.65, CV={cv:.2f}, 95% SL)"

        safety_stock = base_ss * lift_factor

        dynamic_rop = int(round(daily_demand * lead_time + safety_stock))

        # ── Борлуулалтын түүхэд суурилсан currentStock симуляци ──────────
        # Анхны нөөц: сүүлийн захиалга ирсэн гэж тооцож dynamic_rop × 1.5
        # Тухайн lead_time хоногт зарагдсан тоо хэмжээг хасна
        cutoff_date = max_date - pd.Timedelta(days=lead_time)
        recent = sales[
            (sales["Description"] == desc) &
            (sales["InvoiceDate_dt"] > cutoff_date)
        ]
        recent_sold   = max(0.0, float(recent["Quantity"].sum()))
        initial_stock = dynamic_rop * 1.5
        current_stock = int(max(0, round(initial_stock - recent_sold)))

        # ── EOQ (Economic Order Quantity) ─────────────────────────────────
        # EOQ = √(2 × D × S / H)
        # D = жилийн эрэлт,  S = захиалгын зардал,  H = нэгжийн хадгалах зардал/жил
        unit_cost    = max(float(row["unit_cost"]), 0.01)
        order_cost   = 50.0                         # захиалга тутмын зардал (₮)
        holding_rate = 0.25                         # жилийн хадгалах зардлын хувь
        holding_cost = holding_rate * unit_cost
        annual_demand = daily_demand * 365.0
        eoq = max(
            int(round(math.sqrt(2.0 * annual_demand * order_cost / holding_cost))),
            1,
        )
        suggested_qty = eoq

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
                # Prophet + MBA хослуулсан ROP мэдээлэл
                "forecastSource":       forecast_source,
                "prophetDailyDemand":   round(daily_demand, 4),
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


def _sync_products_to_db(reordering_items: list[dict]) -> None:
    """
    reordering жагсаалтаас products хүснэгтийг populate хийнэ.
    SKU-р upsert — байвал шинэчил, байхгүй бол шинээр нэм.
    Давтагдсан SKU-г нэг удаа л боловсруулна.
    """
    import models  # circular import-аас зайлсхийхийн тулд дотор import хийнэ
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    # SKU-р dedup — нэг SKU давтагдвал эхнийхийг авна
    seen: set[str] = set()
    unique_items: list[dict] = []
    for item in reordering_items:
        if item["sku"] not in seen:
            seen.add(item["sku"])
            unique_items.append(item)

    if not unique_items:
        return

    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        # Аль хэдийн байгаа SKU-уудыг bulk-аар авна
        existing_skus = {
            r.sku
            for r in session.query(models.Product.sku)
            .filter(models.Product.sku.in_([i["sku"] for i in unique_items]))
            .all()
        }

        to_insert = []
        for item in unique_items:
            if item["sku"] in existing_skus:
                # current_stock-г дарж бичихгүй — confirm/adjust API-р тохируулагдсан
                # нөөцийг хадгалахын тулд зөвхөн тооцоолсон талбаруудыг шинэчилнэ
                session.query(models.Product).filter_by(sku=item["sku"]).update({
                    "name":           item["productName"],
                    "dynamic_rop":    item["dynamicROP"],
                    "lead_time_days": item["leadTime"],
                    "unit_price":     item["unitCost"],
                    "category":       item.get("category"),
                    "updated_at":     now,
                })
            else:
                to_insert.append({
                    "sku":           item["sku"],
                    "name":          item["productName"],
                    "current_stock": item["currentStock"],
                    "dynamic_rop":   item["dynamicROP"],
                    "lead_time_days": item["leadTime"],
                    "unit_price":    item["unitCost"],
                    "category":      item.get("category"),
                    "created_at":    now,
                    "updated_at":    now,
                })

        if to_insert:
            # ON CONFLICT DO NOTHING — race condition-оос сэргийлнэ
            stmt = pg_insert(models.Product).values(to_insert).on_conflict_do_nothing(index_elements=["sku"])
            session.execute(stmt)

        session.commit()


def _sync_alerts_to_db(alerts: list[dict[str, Any]], reordering_items: list[dict[str, Any]]) -> None:
    """
    critical/warning alert-уудыг smart_alerts хүснэгтэд бичнэ.
    Давхардлаас сэргийлж product_id + alert_type-р шалгана.
    DB alert_id-г alert dict-д 'db_alert_id' талбараар нэмнэ.
    """
    import models  # circular import-аас зайлсхийхийн тулд дотор import хийнэ

    # SKU → product_id хайлтын map
    sku_to_id: dict[str, int] = {}
    skus = [item["sku"] for item in reordering_items]
    if not skus:
        return

    with SessionLocal() as session:
        rows = session.query(models.Product.sku, models.Product.product_id).filter(
            models.Product.sku.in_(skus)
        ).all()
        sku_to_id = {r.sku: r.product_id for r in rows}

        # id-г alert dict-с sku рүү харгалзуулах map
        id_to_sku = {item["id"]: item["sku"] for item in reordering_items}

        now = datetime.now(timezone.utc)
        for alert in alerts:
            alert_id_str: str = alert.get("id", "")
            # Зөвхөн critical/warning alert-уудыг DB-д хадгална
            if alert["type"] not in ("critical", "warning"):
                continue

            # alert id-с reorder item id-г задал (жишээ: "critical-3" → "3")
            parts = alert_id_str.split("-", 1)
            item_id = parts[1] if len(parts) == 2 else None
            if item_id is None:
                continue

            sku = id_to_sku.get(item_id)
            if sku is None:
                continue

            product_id = sku_to_id.get(sku)
            if product_id is None:
                continue

            alert_type = "LOW_STOCK" if alert["type"] == "critical" else "DEMAND_SPIKE"
            priority   = 1 if alert["type"] == "critical" else 2

            # Давхардал шалгалт
            existing = session.query(models.SmartAlert).filter_by(
                product_id  = product_id,
                alert_type  = alert_type,
                is_resolved = False,
            ).first()

            if existing:
                alert["db_alert_id"] = existing.alert_id
            else:
                new_alert = models.SmartAlert(
                    product_id  = product_id,
                    alert_type  = alert_type,
                    message     = alert["message"],
                    priority    = priority,
                    is_resolved = False,
                    created_at  = now,
                )
                session.add(new_alert)
                session.flush()  # alert_id авахын тулд flush хийнэ
                alert["db_alert_id"] = new_alert.alert_id

        session.commit()


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

    # Prophet SKU-түвшний эрэлт — зөвхөн захиалгад орох SKU-д ажиллуулна
    sampled_descriptions = _sample_per_category(
        products,
        per_category=_REORDER_PER_CATEGORY,
        a_override=_REORDER_PER_A_CATEGORY,
    )["Description"].tolist()
    sku_demand = build_sku_demand_forecast(sales, sampled_descriptions)

    # ROP = Prophet_daily × lead_time + MBA_dynamic_safety_stock
    reordering_items = _build_reordering_items(products, mba, sku_demand, sales)

    # Products хүснэгтийг reordering жагсаалтаас populate хийнэ (upsert)
    try:
        _sync_products_to_db(reordering_items)
    except Exception as exc:
        logger.warning("_sync_products_to_db алдаа (үргэлжлүүлнэ): %s", exc)

    # DB-с бодит current_stock-г уншиж reordering_items-г шинэчилнэ.
    # confirm/adjust API дуудалтаар өөрчлөгдсөн нөөц simulation-г дарж
    # хэрэглэгдэх тул энэ алхам ЗААВАЛ хийгдэх ёстой.
    try:
        import models as _models  # noqa: PLC0415
        sku_list = [i["sku"] for i in reordering_items]
        with SessionLocal() as _session:
            db_stocks: dict[str, int] = {
                r.sku: r.current_stock
                for r in _session.query(
                    _models.Product.sku,
                    _models.Product.current_stock,
                ).filter(
                    _models.Product.sku.in_(sku_list)
                ).all()
            }
        for item in reordering_items:
            if item["sku"] in db_stocks:
                item["currentStock"] = db_stocks[item["sku"]]
                item["selected"] = item["currentStock"] < item["dynamicROP"]
    except Exception as exc:
        logger.warning("DB нөөц унших алдаа (simulation утгыг ашиглана): %s", exc)

    alerts = _build_alerts(reordering_items, mba.complementary_rows, mba.substitute_rows)

    # Alert-уудыг DB-д бичнэ (давхардалгүйгээр)
    try:
        _sync_alerts_to_db(alerts, reordering_items)
    except Exception as exc:
        logger.warning("_sync_alerts_to_db алдаа (үргэлжлүүлнэ): %s", exc)

    summary = {
        "total_products":       int(products.shape[0]),
        "mape":                 demand_summary["mape"],
        "mba_rules":            len(market_rows),
        "substitute_rules":     len(mba.substitute_rows),
        "active_alerts":        len([a for a in alerts if a["type"] == "critical"]),
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
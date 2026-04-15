"""
Backtesting модуль — Train/Test хуваалтад суурилсан загварын үнэлгээ

Хуваалт:
  Train : 2009-12-01 — 2011-04-30  (~17 сар)
  Test  : 2011-05-01 — 2011-12-31  (~8 сар)

Гурван үнэлгээний блок:
  1. Prophet MAPE  — train дээр сургаж, test 8 сарыг таамаглах
  2. MBA Hit Rate  — train дүрмүүдийг test гүйлгээнд шалгах
  3. Stockout симуляц — MBA-тэй vs MBA-гүй ROP харьцуулалт
"""
from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from prophet import Prophet
from sqlalchemy import text

from analytics.data_sync import sync_sales_to_postgres
from analytics.mba_engine import MbaResult, run_mba
from database import engine

logger = logging.getLogger(__name__)
logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)

# ── Тогтмол утгууд ──────────────────────────────────────────────────────────
TRAIN_CUTOFF = pd.Timestamp("2011-05-01")

_SS_BOOST_LIFT_THRESHOLD = 1.5
_SS_BOOST_FACTOR = 1.20   # дагалдах бараа  → SS +20%
_SS_POOL_FACTOR = 0.80    # орлох бараа     → SS –20%

# Stockout симуляцид авах барааны дээд тоо (гүйцэтгэлийн оновчлол)
_MAX_SIMULATE_PRODUCTS = 100


# ── Туслах функцууд ──────────────────────────────────────────────────────────

def _load_all_sales() -> pd.DataFrame:
    """sales_transactions хүснэгтээс бүх өгөгдлийг уншина."""
    df = pd.read_sql(
        text("""
            SELECT
                invoice        AS "Invoice",
                product_id     AS "StockCode",
                description    AS "Description",
                quantity       AS "Quantity",
                price          AS "Price",
                invoice_date   AS "InvoiceDate"
            FROM sales_transactions
        """),
        engine,
    )
    if df.empty:
        return df

    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"], errors="coerce")
    df = df.dropna(subset=["InvoiceDate"])
    df["Revenue"] = df["Quantity"] * df["Price"]
    df["Month"]   = df["InvoiceDate"].dt.to_period("M").astype(str)
    df["Invoice"] = df["Invoice"].astype(str)
    return df


def _build_product_metrics(sales: pd.DataFrame) -> pd.DataFrame:
    """
    ABC-XYZ ангиллын метрик тооцоолно.
    abc_xyz.py-ийн нэг ижил логик — тусдаа модуль тул дахин бичсэн.
    """
    monthly_qty = (
        sales.groupby(["StockCode", "Description", "Month"], as_index=False)
        .agg(monthly_qty=("Quantity", "sum"))
    )
    cv_df = monthly_qty.groupby(["StockCode", "Description"], as_index=False).agg(
        monthly_mean=("monthly_qty", "mean"),
        monthly_std=("monthly_qty", "std"),
    )
    cv_df["monthly_std"] = cv_df["monthly_std"].fillna(0.0)
    cv_df["cv"] = np.where(
        cv_df["monthly_mean"] > 0,
        cv_df["monthly_std"] / cv_df["monthly_mean"],
        0.0,
    )

    metrics = (
        sales.groupby(["StockCode", "Description"], as_index=False)
        .agg(
            total_qty=("Quantity",  "sum"),
            revenue=("Revenue",     "sum"),
            unit_cost=("Price",     "median"),
        )
        .merge(
            cv_df[["StockCode", "Description", "cv", "monthly_mean"]],
            on=["StockCode", "Description"],
            how="left",
        )
    )
    metrics["cv"]           = metrics["cv"].fillna(0.0)
    metrics["monthly_mean"] = metrics["monthly_mean"].fillna(0.0)
    metrics = metrics.sort_values("revenue", ascending=False).reset_index(drop=True)

    total_revenue = max(float(metrics["revenue"].sum()), 1.0)
    metrics["revenue_share"] = metrics["revenue"] / total_revenue
    metrics["cum_share"]     = metrics["revenue_share"].cumsum()

    metrics["abc"] = np.select(
        [metrics["cum_share"] <= 0.80, metrics["cum_share"] <= 0.95],
        ["A", "B"],
        default="C",
    )
    metrics["xyz"] = np.select(
        [metrics["cv"] <= 0.25, metrics["cv"] <= 0.75],
        ["X", "Y"],
        default="Z",
    )
    metrics["category"] = metrics["abc"] + metrics["xyz"]
    return metrics


# ── 1. Prophet нарийвчлал ────────────────────────────────────────────────────

def _evaluate_prophet(
    train_sales: pd.DataFrame,
    test_sales: pd.DataFrame,
) -> dict[str, Any]:
    """
    Train дата дээр Prophet сургаж, test хугацааны 8 сарыг таамаглана.
    Бодит тест утгатай харьцуулж MAPE тооцоолно.
    """
    # Train-ийн сарын нийлбэр
    monthly_train = (
        train_sales.groupby("Month", as_index=False)["Quantity"]
        .sum()
        .rename(columns={"Month": "ds", "Quantity": "y"})
        .sort_values("ds")
    )
    monthly_train["ds"] = pd.to_datetime(monthly_train["ds"] + "-01", errors="coerce")
    monthly_train = monthly_train.dropna(subset=["ds"]).reset_index(drop=True)

    # Test-ийн бодит сарын нийлбэр
    monthly_test = (
        test_sales.groupby("Month", as_index=False)["Quantity"]
        .sum()
        .rename(columns={"Month": "ds", "Quantity": "actual"})
        .sort_values("ds")
    )
    monthly_test["ds"] = pd.to_datetime(monthly_test["ds"] + "-01", errors="coerce")
    monthly_test = monthly_test.dropna(subset=["ds"]).reset_index(drop=True)

    if len(monthly_train) < 3 or monthly_test.empty:
        return {"monthly_comparison": [], "mape": 0.0}

    n_periods = len(monthly_test)

    try:
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            interval_width=0.95,
        )
        model.fit(monthly_train[["ds", "y"]])
        future   = model.make_future_dataframe(periods=n_periods, freq="MS", include_history=False)
        forecast = model.predict(future)
    except Exception as exc:
        logger.warning("Prophet backtesting алдаа: %s", exc)
        return {"monthly_comparison": [], "mape": 0.0}

    forecast_df = forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
    forecast_df["ds"] = pd.to_datetime(forecast_df["ds"])
    monthly_test["ds"] = pd.to_datetime(monthly_test["ds"])

    merged = monthly_test.merge(forecast_df, on="ds", how="inner")

    monthly_comparison: list[dict[str, Any]] = []
    errors: list[float] = []

    for _, row in merged.iterrows():
        actual    = float(row["actual"])
        predicted = max(0.0, float(row["yhat"]))
        lower     = max(0.0, float(row["yhat_lower"]))
        upper     = max(0.0, float(row["yhat_upper"]))
        err_pct   = abs(actual - predicted) / max(actual, 1.0) * 100
        errors.append(err_pct)
        monthly_comparison.append(
            {
                "month":     row["ds"].strftime("%Y-%m"),
                "actual":    int(round(actual)),
                "predicted": int(round(predicted)),
                "lower":     int(round(lower)),
                "upper":     int(round(upper)),
                "error_pct": round(err_pct, 2),
            }
        )

    mape = round(float(np.mean(errors)), 2) if errors else 0.0
    return {"monthly_comparison": monthly_comparison, "mape": mape}


# ── 2. MBA баталгаажуулалт ───────────────────────────────────────────────────

def _compute_test_metrics(test_sales: pd.DataFrame) -> tuple[
    int,
    dict[str, int],
    dict[frozenset, int],
]:
    """
    Test датаас гүйлгээ тус бүрийн item support болон pair co-occurrence тооцоолно.
    Буцаах утга:
        n_transactions  — нийт гүйлгээний тоо
        item_counts     — {item: гүйлгээний тоо}
        pair_counts     — {frozenset(A,B): хамт гарсан гүйлгээний тоо}
    """
    item_counts: dict[str, int] = {}
    pair_counts: dict[frozenset, int] = {}
    n_transactions = 0

    for _, grp in test_sales.groupby("Invoice"):
        items = grp["Description"].unique().tolist()
        n_transactions += 1
        for item in items:
            item_counts[item] = item_counts.get(item, 0) + 1
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                key = frozenset([items[i], items[j]])
                pair_counts[key] = pair_counts.get(key, 0) + 1

    return n_transactions, item_counts, pair_counts


def _compute_test_lift(
    item_a: str,
    item_b: str,
    n: int,
    item_counts: dict[str, int],
    pair_counts: dict[frozenset, int],
) -> float | None:
    """
    Test датаас A→B дүрмийн lift тооцоолно.
    lift = P(A∩B) / (P(A) × P(B))
    Аль нэг нь тестэд байхгүй бол None буцаана.
    """
    if n == 0:
        return None
    cnt_a  = item_counts.get(item_a, 0)
    cnt_b  = item_counts.get(item_b, 0)
    cnt_ab = pair_counts.get(frozenset([item_a, item_b]), 0)
    if cnt_a == 0 or cnt_b == 0:
        return None
    p_a  = cnt_a  / n
    p_b  = cnt_b  / n
    p_ab = cnt_ab / n
    return round(p_ab / (p_a * p_b), 3)


def _validate_mba(
    test_sales: pd.DataFrame,
    mba_result: MbaResult,
) -> dict[str, Any]:
    """
    Train дүрмүүдийг test гүйлгээнд шалгана.

    Hit rate   : тестэд хос нь хамт гарсан дүрмийн хувь
    Test lift  : тест датаас бодит lift тооцоолж train lift-тай харьцуулна
                 → lift_delta > 0 бол тест-д хүчтэй хэвээрээ, < 0 бол суларсан
    """
    n, item_counts, pair_counts = _compute_test_metrics(test_sales)

    def _check(rules: list[dict]) -> tuple[int, int, float, list[dict]]:
        if not rules:
            return 0, 0, 0.0, []
        hits: list[dict] = []
        for rule in rules:
            key = frozenset([rule["itemA"], rule["itemB"]])
            if pair_counts.get(key, 0) > 0:
                hits.append(rule)
        rate = len(hits) / len(rules) * 100
        return len(rules), len(hits), round(rate, 2), hits

    comp_total, comp_hits, comp_rate, comp_hit_rules = _check(mba_result.complementary_rows)
    sub_total,  sub_hits,  sub_rate,  sub_hit_rules  = _check(mba_result.substitute_rows)

    # ── Top validated rules — train vs test lift харьцуулалт ─────────────────
    top_validated: list[dict[str, Any]] = []
    for rule in sorted(comp_hit_rules, key=lambda r: r["lift"], reverse=True)[:15]:
        item_a     = rule["itemA"]
        item_b     = rule["itemB"]
        train_lift = round(float(rule["lift"]), 3)
        test_lift  = _compute_test_lift(item_a, item_b, n, item_counts, pair_counts)
        lift_delta = round(test_lift - train_lift, 3) if test_lift is not None else None

        top_validated.append(
            {
                "itemA":            item_a,
                "itemB":            item_b,
                "train_lift":       train_lift,
                "test_lift":        test_lift,
                "lift_delta":       lift_delta,
                "train_support":    round(float(rule["support"]),    4),
                "train_confidence": round(float(rule["confidence"]), 4),
                # Тестэд lift > 1 хэвээр байвал "valid"
                "is_valid":         test_lift is not None and test_lift > 1.0,
            }
        )

    # ── Орлох дүрмийн тест lift (lift < 1 байвал зөв) ────────────────────────
    top_substitute_validated: list[dict[str, Any]] = []
    for rule in sorted(sub_hit_rules, key=lambda r: r["lift"])[:10]:
        item_a     = rule["itemA"]
        item_b     = rule["itemB"]
        train_lift = round(float(rule["lift"]), 3)
        test_lift  = _compute_test_lift(item_a, item_b, n, item_counts, pair_counts)
        lift_delta = round(test_lift - train_lift, 3) if test_lift is not None else None
        top_substitute_validated.append(
            {
                "itemA":      item_a,
                "itemB":      item_b,
                "train_lift": train_lift,
                "test_lift":  test_lift,
                "lift_delta": lift_delta,
                # Орлох дүрэм: тестэд ч lift < 1 байвал зөв
                "is_valid":   test_lift is not None and test_lift < 1.0,
            }
        )

    # ── Нийт lift тогтвортой байдал (хэдэн % дүрэм lift чиглэлээ хадгалсан) ─
    valid_comp  = sum(1 for r in top_validated if r["is_valid"])
    valid_sub   = sum(1 for r in top_substitute_validated if r["is_valid"])
    total_top   = len(top_validated) + len(top_substitute_validated)
    lift_stability_pct = round(
        (valid_comp + valid_sub) / max(total_top, 1) * 100, 1
    )

    return {
        "total_train_rules":              comp_total + sub_total,
        "complementary_rules_tested":     comp_total,
        "complementary_hit_rate":         comp_rate,
        "substitute_rules_tested":        sub_total,
        "substitute_hit_rate":            sub_rate,
        "lift_stability_pct":             lift_stability_pct,
        "top_validated_rules":            top_validated,
        "top_substitute_validated":       top_substitute_validated,
    }


# ── 3. Stockout симуляц ──────────────────────────────────────────────────────

def _simulate_stockouts(
    products: pd.DataFrame,
    test_sales: pd.DataFrame,
    mba_result: MbaResult,
) -> dict[str, Any]:
    """
    MBA-тэй болон MBA-гүй ROP-ийн stockout харьцуулалт.

    Эхний нөөц  : initial_stock = ROP × 1.5
    Replenishment: EOQ хэмжээгээр, хүлээх хугацаа = lead_time хоног
    Stockout event: нөөц 0 болж байхад борлуулалт гарвал +1
    """
    test_copy = test_sales.copy()
    test_copy["date"] = test_copy["InvoiceDate"].dt.normalize()

    daily_sales_df = (
        test_copy.groupby(["Description", "date"], as_index=False)["Quantity"].sum()
    )

    test_start = test_copy["date"].min()
    test_end   = test_copy["date"].max()
    all_dates  = pd.date_range(start=test_start, end=test_end, freq="D").tolist()
    n_days     = len(all_dates)

    sample = products.head(_MAX_SIMULATE_PRODUCTS)

    baseline_total = 0
    mba_total      = 0
    detail: list[dict[str, Any]] = []

    for _, row in sample.iterrows():
        desc      = str(row["Description"])
        xyz_class = str(row.get("xyz", "Y"))
        lead_time = 5 if xyz_class == "X" else 8 if xyz_class == "Y" else 12

        avg_daily = max(float(row["total_qty"]) / max(n_days, 1), 0.1)
        cv_val    = float(row.get("cv", 0.5))

        # ── Baseline ROP (MBA-гүй, стандарт Safety Stock) ────────────────
        # SS = Z × σ_d × √(L),  Z=1.65 (95% SL),  σ_d = avg_daily × CV
        _Z = 1.65
        base_ss      = _Z * avg_daily * cv_val * math.sqrt(lead_time)
        baseline_rop = max(1, int(round(avg_daily * lead_time + base_ss)))

        # ── MBA-тэй ROP ───────────────────────────────────────────────────
        max_lift = mba_result.lift_map.get(desc, 1.0)
        has_sub  = desc in mba_result.substitute_map
        # Шатлалт MBA lift → SS тохируулга (abc_xyz.py-тай ижил логик)
        if max_lift > 3.0:
            lift_factor = 1.40
        elif max_lift >= 2.0:
            lift_factor = 1.30
        elif max_lift >= 1.5:
            lift_factor = 1.20
        elif max_lift > 1.0:
            lift_factor = 1.10
        elif has_sub:
            lift_factor = _SS_POOL_FACTOR
        else:
            lift_factor = 1.0
        mba_ss  = base_ss * lift_factor
        mba_rop = max(1, int(round(avg_daily * lead_time + mba_ss)))

        # ── EOQ тооцоо ────────────────────────────────────────────────────
        unit_cost    = max(float(row.get("unit_cost", 1.0)), 0.01)
        holding_cost = max(0.2 * unit_cost, 0.01)
        order_cost   = 10.0
        annual_demand = avg_daily * 365.0
        eoq = max(
            int(round(math.sqrt(2.0 * annual_demand * order_cost / holding_cost))),
            max(1, int(lead_time * avg_daily)),
        )

        # ── Өдрийн борлуулалт dict ────────────────────────────────────────
        sku_daily: dict = (
            daily_sales_df[daily_sales_df["Description"] == desc]
            .set_index("date")["Quantity"]
            .to_dict()
        )

        def _simulate(rop: int) -> int:
            stock           = float(rop) * 1.5
            stockout_days   = 0
            pending_qty     = 0
            pending_arrival = -1

            for idx, day in enumerate(all_dates):
                # Захиалга ирэх өдөр
                if idx == pending_arrival and pending_qty > 0:
                    stock          += pending_qty
                    pending_qty     = 0
                    pending_arrival = -1

                qty_sold = float(sku_daily.get(day, 0.0))

                # Stockout шалгалт
                if stock <= 0.0 and qty_sold > 0.0:
                    stockout_days += 1

                stock = max(0.0, stock - qty_sold)

                # Захиалга өгөх шалгалт
                if stock <= rop and pending_qty == 0:
                    pending_qty     = eoq
                    pending_arrival = idx + lead_time

            return stockout_days

        base_so = _simulate(baseline_rop)
        mba_so  = _simulate(mba_rop)

        baseline_total += base_so
        mba_total      += mba_so

        # Achieved service level: хэдэн % өдөр stockout гараагүй вэ
        achieved_sl_base = round((1 - base_so / max(n_days, 1)) * 100, 1)
        achieved_sl_mba  = round((1 - mba_so  / max(n_days, 1)) * 100, 1)

        # ROP болон SS-ийн зөрүү (уламжлалт vs MBA)
        ss_deviation_pct  = round((mba_ss - base_ss)           / max(base_ss, 0.01)    * 100, 1)
        rop_deviation_pct = round((mba_rop - baseline_rop)     / max(baseline_rop, 1)  * 100, 1)

        detail.append(
            {
                "product":                desc,
                "category":               str(row["category"]),
                "avg_daily":              round(avg_daily, 2),
                "cv":                     round(cv_val, 3),
                "lead_time":              lead_time,
                "eoq":                    eoq,
                "baseline_ss":            round(base_ss, 1),
                "mba_ss":                 round(mba_ss, 1),
                "ss_deviation_pct":       ss_deviation_pct,
                "baseline_rop":           baseline_rop,
                "mba_rop":                mba_rop,
                "rop_deviation_pct":      rop_deviation_pct,
                "lift_factor":            round(lift_factor, 2),
                "baseline_stockout_days": base_so,
                "mba_stockout_days":      mba_so,
                "n_days":                 n_days,
                "achieved_sl_baseline":   achieved_sl_base,
                "achieved_sl_mba":        achieved_sl_mba,
                "target_sl":              95.0,
            }
        )

    reduction_pct = (
        (baseline_total - mba_total) / max(baseline_total, 1) * 100
    )

    sl_values_base   = [d["achieved_sl_baseline"]  for d in detail]
    sl_values_mba    = [d["achieved_sl_mba"]        for d in detail]
    rop_devs         = [abs(d["rop_deviation_pct"]) for d in detail]
    ss_devs          = [abs(d["ss_deviation_pct"])  for d in detail]

    avg_sl_base    = round(float(np.mean(sl_values_base)), 1) if sl_values_base else 0.0
    avg_sl_mba     = round(float(np.mean(sl_values_mba)),  1) if sl_values_mba  else 0.0
    avg_rop_dev    = round(float(np.mean(rop_devs)),        1) if rop_devs       else 0.0
    avg_ss_dev     = round(float(np.mean(ss_devs)),         1) if ss_devs        else 0.0

    products_meeting_target_base = sum(1 for v in sl_values_base if v >= 95.0)
    products_meeting_target_mba  = sum(1 for v in sl_values_mba  if v >= 95.0)

    return {
        "products_simulated":            len(detail),
        "baseline_stockouts":            baseline_total,
        "mba_stockouts":                 mba_total,
        "reduction_pct":                 round(reduction_pct, 2),
        "target_sl":                     95.0,
        "avg_achieved_sl_baseline":      avg_sl_base,
        "avg_achieved_sl_mba":           avg_sl_mba,
        "avg_rop_deviation_pct":         avg_rop_dev,
        "avg_ss_deviation_pct":          avg_ss_dev,
        "products_meeting_target_base":  products_meeting_target_base,
        "products_meeting_target_mba":   products_meeting_target_mba,
        "detail":                        sorted(
            detail,
            key=lambda x: abs(x["rop_deviation_pct"]),
            reverse=True,
        )[:50],
    }


# ── Гол функц ────────────────────────────────────────────────────────────────

def run_backtesting(file_path: Path) -> dict[str, Any]:
    """
    Backtesting дамжуулалт. ~30–90 секунд зарцуулна
    (MBA FP-Growth + Prophet нь хугацаа шаардана).

    Буцаах бүтэц: split_info | prophet_evaluation | mba_validation | stockout_simulation
    """
    sync_sales_to_postgres(file_path)

    all_sales = _load_all_sales()
    if all_sales.empty:
        raise ValueError("Өгөгдөл хоосон байна. Эх үүсвэрийг шалгана уу.")

    train_sales = all_sales[all_sales["InvoiceDate"] < TRAIN_CUTOFF].copy()
    test_sales  = all_sales[all_sales["InvoiceDate"] >= TRAIN_CUTOFF].copy()

    if train_sales.empty or test_sales.empty:
        raise ValueError(
            f"Train ({len(train_sales)}) эсвэл test ({len(test_sales)}) дата хоосон байна. "
            f"TRAIN_CUTOFF={TRAIN_CUTOFF} тогтмолыг шалгана уу."
        )

    logger.info(
        "Backtesting: train=%d мөр, test=%d мөр",
        len(train_sales),
        len(test_sales),
    )

    # ── Сургалтын үе шат ─────────────────────────────────────────────────────
    logger.info("ABC-XYZ метрик тооцоолж байна...")
    products = _build_product_metrics(train_sales)

    logger.info("MBA (FP-Growth) ажиллаж байна...")
    mba_result = run_mba(
        train_sales,
        invoice_col="Invoice",
        desc_col="Description",
        qty_col="Quantity",
    )

    # ── Тестийн үнэлгээ ──────────────────────────────────────────────────────
    logger.info("Prophet нарийвчлалыг шалгаж байна...")
    prophet_eval = _evaluate_prophet(train_sales, test_sales)

    logger.info("MBA дүрмийн hit rate шалгаж байна...")
    mba_val = _validate_mba(test_sales, mba_result)

    logger.info("Stockout симуляц хийж байна...")
    stockout_sim = _simulate_stockouts(products, test_sales, mba_result)

    return {
        "split_info": {
            "train_start": str(train_sales["InvoiceDate"].min().date()),
            "train_end":   str(train_sales["InvoiceDate"].max().date()),
            "test_start":  str(test_sales["InvoiceDate"].min().date()),
            "test_end":    str(test_sales["InvoiceDate"].max().date()),
            "train_rows":  int(len(train_sales)),
            "test_rows":   int(len(test_sales)),
        },
        "prophet_evaluation": prophet_eval,
        "mba_validation":     mba_val,
        "stockout_simulation": stockout_sim,
    }

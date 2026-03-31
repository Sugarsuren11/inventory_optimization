from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd
from mlxtend.frequent_patterns import fpgrowth, association_rules



@dataclass
class MbaResult:
    """FP-Growth-ийн үр дүнг нэг газарт цуглуулдаг."""
    # dashboard-д харуулах (Lift >= 1)
    complementary_rows: list[dict[str, Any]] = field(default_factory=list)
    # Inventory Pooling-д ашиглах (Lift < 1)
    substitute_rows: list[dict[str, Any]] = field(default_factory=list)
    # {item_name: max_lift}  — SS boost тооцоолоход
    lift_map: dict[str, float] = field(default_factory=dict)
    # {item_name: [orluulah_baraa, ...]}  — Inventory Pooling
    substitute_map: dict[str, list[str]] = field(default_factory=dict)
    # {item_name: [dagaldah_baraa, ...]}  — Synchronized ROP trigger
    complement_map: dict[str, list[str]] = field(default_factory=dict)


def run_mba(
    sales: pd.DataFrame,
    *,
    invoice_col: str = "invoice",
    desc_col: str = "description",
    qty_col: str = "quantity",
) -> MbaResult:
    """
    Market Basket Analysis-г DataFrame-г ашиглан гүйцэтгэнэ.

    Параметрүүд
    ----------
    sales : pd.DataFrame
        Борлуулалтын өгөгдөл.
    invoice_col : str
        Invoice дугаарын баганын нэр (default: "invoice").
    desc_col : str
        Бүтээгдэхүүний нэрийн баганын нэр (default: "description").
    qty_col : str
        Тоо хэмжээний баганын нэр (default: "quantity").

    Буцаах утга
    -----------
    MbaResult
        Дагалдах болон орлох бараануудын дүрмүүд.
    """
    result = MbaResult()

    basket = (
        sales.groupby([invoice_col, desc_col], as_index=False)[qty_col]
        .sum()
        .pivot(index=invoice_col, columns=desc_col, values=qty_col)
        .fillna(0)
    )
    basket_sets = basket.ge(1).astype(bool)

    frequent_itemsets = fpgrowth(basket_sets, min_support=0.01, use_colnames=True)
    if frequent_itemsets.empty:
        return result

    # Lift < 1 (орлох) дүрмийг алдахгүйн тулд 0 босгоос эхэлж авна.
    all_rules = association_rules(frequent_itemsets, metric="lift", min_threshold=0)
    if all_rules.empty:
        return result

    # ── Дагалдах бараа (Lift >= 1.0) ─────────────────────────────────────
    comp_df = all_rules[all_rules["lift"] >= 1.0].copy()
    comp_df = comp_df.sort_values("lift", ascending=False)

    for index, row in comp_df.iterrows():
        ants = sorted(list(row["antecedents"]))
        cons = sorted(list(row["consequents"]))
        item_a = " + ".join(ants) if ants else "Unknown"
        item_b = " + ".join(cons) if cons else "Unknown"
        lift_val = round(float(row["lift"]), 3)

        result.complementary_rows.append(
            {
                "id":         str(index),
                "itemA":      item_a,
                "itemB":      item_b,
                "support":    round(float(row["support"]),    4),
                "confidence": round(float(row["confidence"]), 4),
                "lift":       lift_val,
                "ruleType":   "complementary",
            }
        )

        # lift_map: бараа тус бүрийн хамгийн өндөр Lift-ийг хадгална
        for item in ants + cons:
            if lift_val > result.lift_map.get(item, 0.0):
                result.lift_map[item] = lift_val

        # complement_map: "A дуусахад B шалга" trigger
        for a in ants:
            result.complement_map.setdefault(a, []).extend(cons)

    # ── Орлох бараа (Lift < 1.0) — Inventory Pooling ─────────────────────
    sub_df = all_rules[all_rules["lift"] < 1.0].copy()
    sub_df = sub_df.sort_values("lift", ascending=True)

    for index, row in sub_df.iterrows():
        ants = sorted(list(row["antecedents"]))
        cons = sorted(list(row["consequents"]))
        item_a = " + ".join(ants) if ants else "Unknown"
        item_b = " + ".join(cons) if cons else "Unknown"

        result.substitute_rows.append(
            {
                "id":         str(index),
                "itemA":      item_a,
                "itemB":      item_b,
                "support":    round(float(row["support"]),    4),
                "confidence": round(float(row["confidence"]), 4),
                "lift":       round(float(row["lift"]),       3),
                "ruleType":   "substitute",
            }
        )

        # substitute_map: "A-г авахгүй бол B-г авна" → Inventory Pooling
        for a in ants:
            result.substitute_map.setdefault(a, []).extend(cons)

    return result

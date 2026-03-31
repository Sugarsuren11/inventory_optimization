from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt


def load_report(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "report" not in data:
        raise ValueError("Invalid report JSON: missing 'report' key")
    return data


def draw_stage_funnel(report: dict, out_path: Path) -> None:
    r = report["report"]

    labels = [
        "Эх өгөгдлийн мөр",
        "Суурь цэвэрлэгээний дараа",
        "Outlier шүүлтүүрийн дараа",
        "Цонхны шүүлтүүрийн дараа",
        "Синк хийгдсэн мөр",
    ]
    values = [
        int(r.get("source_rows", 0)),
        int(r.get("rows_after_cleaning", 0)),
        int(r.get("rows_after_outlier_filter", 0)),
        int(r.get("rows_after_window_filter", 0)),
        int(report.get("rows", 0)),
    ]

    plt.figure(figsize=(10, 5.5))
    bars = plt.bar(labels, values)
    plt.title("Өгөгдөл цэвэрлэгээний үе шатны үр дүн")
    plt.ylabel("Мөрийн тоо")
    plt.xticks(rotation=10)

    for bar, value in zip(bars, values):
        plt.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            f"{value:,}",
            ha="center",
            va="bottom",
            fontsize=9,
        )

    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=220)
    plt.close()


def draw_drop_reasons(report: dict, out_path: Path) -> None:
    r = report["report"]

    labels = [
        "Зайлшгүй талбар дутуу",
        "Тоо хэмжээ 0/сөрөг",
        "Үнэ 0/сөрөг",
        "Буцаалтын гүйлгээ",
        "Буруу огноо",
        "Тоо хэмжээний outlier",
        "Үнийн outlier",
        "Цонхны шүүлтүүрээр хасагдсан",
    ]

    values = [
        int(r.get("dropped_missing_required", 0)),
        int(r.get("dropped_non_positive_quantity", 0)),
        int(r.get("dropped_non_positive_price", 0)),
        int(r.get("dropped_credit_invoice", 0)),
        int(r.get("dropped_invalid_invoice_date", 0)),
        int(r.get("quantity_outliers_removed", 0)),
        int(r.get("price_outliers_removed", 0)),
        int(r.get("dropped_by_incremental_window", 0)),
    ]

    # Keep non-zero categories only for readability.
    filtered = [(label, value) for label, value in zip(labels, values) if value > 0]
    if not filtered:
        filtered = [("Хасагдсан мөр байхгүй", 0)]

    labels_filtered = [x[0] for x in filtered]
    values_filtered = [x[1] for x in filtered]

    plt.figure(figsize=(10, 6))
    bars = plt.barh(labels_filtered, values_filtered)
    plt.title("Цэвэрлэгээний дүрмээр хасагдсан мөрүүд")
    plt.xlabel("Хасагдсан мөрийн тоо")

    for bar, value in zip(bars, values_filtered):
        plt.text(
            value,
            bar.get_y() + bar.get_height() / 2,
            f" {value:,}",
            va="center",
            fontsize=9,
        )

    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=220)
    plt.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build PNG figures from cleaning report JSON")
    parser.add_argument("--input", type=Path, required=True, help="Path to cleaning_report_*.json")
    parser.add_argument("--outdir", type=Path, default=Path("."), help="Output directory for PNG files")
    args = parser.parse_args()

    report = load_report(args.input)

    draw_stage_funnel(report, args.outdir / "cleaning_stage_funnel_mn.png")
    draw_drop_reasons(report, args.outdir / "cleaning_drop_reasons_mn.png")

    print(f"Created: {(args.outdir / 'cleaning_stage_funnel_mn.png').resolve()}")
    print(f"Created: {(args.outdir / 'cleaning_drop_reasons_mn.png').resolve()}")


if __name__ == "__main__":
    main()

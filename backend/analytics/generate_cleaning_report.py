from __future__ import annotations

import argparse
import json
from pathlib import Path

from data_sync import sync_sales_to_postgres


def _default_data_file() -> Path:
    project_root = Path(__file__).resolve().parents[2]
    return project_root / "data" / "online_retail_II.xlsx"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync хийх явцын data cleaning тайлан гаргах скрипт"
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=_default_data_file(),
        help="Excel өгөгдлийн файлын зам",
    )
    parser.add_argument(
        "--source-name",
        default="online_retail_II",
        help="ingestion_state.source_name утга",
    )
    parser.add_argument(
        "--outlier-method",
        choices=["iqr", "zscore"],
        default="iqr",
        help="Outlier filter арга",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="JSON тайлан хадгалах файлын зам (сонголттой)",
    )

    args = parser.parse_args()
    result = sync_sales_to_postgres(
        file_path=args.file,
        source_name=args.source_name,
        outlier_method=args.outlier_method,
    )

    report_text = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    print(report_text)

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report_text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

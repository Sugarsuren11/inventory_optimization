from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import re

import pandas as pd
from sqlalchemy import text

from database import SessionLocal, engine
import models

_VALID_CUSTOMER_ID = re.compile(r"^\d{1,12}$")
_VALID_COUNTRY = re.compile(r"^[A-Za-z][A-Za-z .,'-]{1,63}$")

def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    # ✅ Нуугдмал алдаа 1: Online Retail II-д баганын нэр өөрөөр ирдэг → бүх хувилбарыг хамруулна
    rename_map = {
        "InvoiceNo": "Invoice",
        "Invoice": "Invoice",  # Зарим хувилбарт аль хэдийн "Invoice" гэж байдаг
        "StockCode": "StockCode",
        "Stock Code": "StockCode",  # Зай байдаг нэрлэлт
        "Desc": "Description",  # Богиносгосон хувилбар
        "Description": "Description",
        "Product Description": "Description",
        "Quantity": "Quantity",
        "Qty": "Quantity",
        "UnitPrice": "Price",  # Сольигдох хувилбар
        "Unit Price": "Price",
        "Price": "Price",
        "InvoiceDate": "InvoiceDate",  # Аль хэдийн стандартчилсан
        "Invoice Date": "InvoiceDate",
        "CustomerID": "Customer ID",  # "CustomerID" давхардсан key-г устгав
        "Customer ID": "Customer ID",
        "Country": "Country",
    }
    # ЗАСВАР: Баганын нэр integer байвал алдаа гарахаас сэргийлж str() ашиглав
    df = df.rename(columns={col: str(col).strip() for col in df.columns})
    return df.rename(columns=rename_map)


def _drop_iqr_outliers(df: pd.DataFrame, column: str) -> tuple[pd.DataFrame, int]:
    q1 = df[column].quantile(0.25)
    q3 = df[column].quantile(0.75)
    iqr = q3 - q1
    if pd.isna(iqr) or float(iqr) == 0.0:
        return df, 0

    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    mask = (df[column] >= lower) & (df[column] <= upper)
    removed = int((~mask).sum())
    return df[mask], removed


def _drop_zscore_outliers(df: pd.DataFrame, column: str, threshold: float = 3.0) -> tuple[pd.DataFrame, int]:
    mean = df[column].mean()
    std = df[column].std(ddof=0)
    if pd.isna(std) or float(std) == 0.0:
        return df, 0

    z = ((df[column] - mean) / std).abs()
    mask = z <= threshold
    removed = int((~mask).sum())
    return df[mask], removed


def _apply_outlier_filter(df: pd.DataFrame, method: str = "iqr") -> tuple[pd.DataFrame, dict[str, int | str]]:
    current = df.copy()
    method_normalized = method.strip().lower()
    if method_normalized not in {"iqr", "zscore"}:
        raise ValueError("outlier_method зөвхөн 'iqr' эсвэл 'zscore' байна")

    removed_qty = 0
    removed_price = 0
    if method_normalized == "iqr":
        current, removed_qty = _drop_iqr_outliers(current, "Quantity")
        current, removed_price = _drop_iqr_outliers(current, "Price")
    else:
        current, removed_qty = _drop_zscore_outliers(current, "Quantity")
        current, removed_price = _drop_zscore_outliers(current, "Price")

    return current, {
        "method": method_normalized,
        "quantity_outliers_removed": int(removed_qty),
        "price_outliers_removed": int(removed_price),
        "total_outliers_removed": int(removed_qty + removed_price),
    }


def _validate_country_and_customer(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    validated = df.copy()

    customer_invalid = 0
    customer_missing = 0
    if "Customer ID" in validated.columns:
        raw_customer = validated["Customer ID"].fillna("").astype(str).str.strip()
        is_missing = raw_customer.eq("")
        is_valid = raw_customer.apply(lambda value: bool(_VALID_CUSTOMER_ID.match(value)) if value else False)
        invalid_mask = (~is_missing) & (~is_valid)

        customer_missing = int(is_missing.sum())
        customer_invalid = int(invalid_mask.sum())
        raw_customer.loc[invalid_mask] = ""
        validated["Customer ID"] = raw_customer
    else:
        validated["Customer ID"] = ""
        customer_missing = int(len(validated))

    country_invalid = 0
    country_missing = 0
    if "Country" in validated.columns:
        raw_country = validated["Country"].fillna("").astype(str).str.strip()
        is_missing = raw_country.eq("")
        is_valid = raw_country.apply(lambda value: bool(_VALID_COUNTRY.match(value)) if value else False)
        invalid_mask = (~is_missing) & (~is_valid)

        country_missing = int(is_missing.sum())
        country_invalid = int(invalid_mask.sum())
        raw_country.loc[is_missing | invalid_mask] = "Unknown"
        validated["Country"] = raw_country

    return validated, {
        "customer_id_missing_count": customer_missing,
        "customer_id_invalid_count": customer_invalid,
        "country_missing_count": country_missing,
        "country_invalid_count": country_invalid,
    }


def _clean_sales_dataframe(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    required = ["Invoice", "StockCode", "Description", "Quantity", "Price", "InvoiceDate"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Дутуу багана байна: {', '.join(missing)}")

    cleaned = df.copy()
    stats = {
        "source_rows": int(len(cleaned)),
        "dropped_missing_required": 0,
        "dropped_non_positive_quantity": 0,
        "dropped_non_positive_price": 0,
        "dropped_credit_invoice": 0,
        "dropped_invalid_invoice_date": 0,
    }

    before = len(cleaned)
    cleaned = cleaned.dropna(subset=["Description", "Quantity", "Price", "InvoiceDate"])
    stats["dropped_missing_required"] = int(before - len(cleaned))

    before = len(cleaned)
    cleaned = cleaned[cleaned["Quantity"] > 0]
    stats["dropped_non_positive_quantity"] = int(before - len(cleaned))

    before = len(cleaned)
    cleaned = cleaned[cleaned["Price"] > 0]
    stats["dropped_non_positive_price"] = int(before - len(cleaned))

    before = len(cleaned)
    cleaned = cleaned[~cleaned["Invoice"].astype(str).str.startswith("C")]
    stats["dropped_credit_invoice"] = int(before - len(cleaned))

    cleaned["Description"] = cleaned["Description"].astype(str).str.strip()
    cleaned["InvoiceDate"] = pd.to_datetime(cleaned["InvoiceDate"], errors="coerce")
    before = len(cleaned)
    cleaned = cleaned.dropna(subset=["InvoiceDate"])
    stats["dropped_invalid_invoice_date"] = int(before - len(cleaned))
    stats["rows_after_base_cleaning"] = int(len(cleaned))
    return cleaned, stats

def _prepare_batch(df: pd.DataFrame) -> pd.DataFrame:
    batch = df.copy()
    batch["product_id"] = batch["StockCode"].astype(str)
    batch["invoice"] = batch["Invoice"].astype(str)
    # ЗАСВАР Bug 2: .get("Customer ID", "") нь баганагүй үед "" (str) буцаадаг бөгөөд
    # дараа нь .astype(str) дуудахад AttributeError өгнө → explicit шалгалт хийнэ
    if "Customer ID" in batch.columns:
        batch["customer_id"] = batch["Customer ID"].astype(str)
    else:
        batch["customer_id"] = ""

    batch["transaction_key"] = (
        batch["invoice"]
        + "|"
        + batch["product_id"]
        + "|"
        + batch["InvoiceDate"].dt.strftime("%Y-%m-%d %H:%M:%S")
    )

    prepared = batch[
        [
            "transaction_key",
            "invoice",
            "product_id",
            "Description",
            "Quantity",
            "Price",
            "customer_id",
            "InvoiceDate",
        ]
    ].rename(
        columns={
            "Description": "description",
            "Quantity": "quantity",
            "Price": "price",
            "InvoiceDate": "invoice_date",
        }
    )

    prepared = prepared.sort_values("invoice_date").drop_duplicates(
        subset=["transaction_key"], keep="last"
    )
    return prepared

def sync_sales_to_postgres(
    file_path: Path,
    source_name: str = "online_retail_II",
    outlier_method: str = "iqr",
) -> dict[str, object]:
    if not file_path.exists():
        raise FileNotFoundError(f"Файл олдсонгүй: {file_path}")

    file_mtime = file_path.stat().st_mtime

    db = SessionLocal()
    try:
        state = (
            db.query(models.IngestionState)
            .filter(models.IngestionState.source_name == source_name)
            .first()
        )

        if state is None:
            state = models.IngestionState(source_name=source_name)
            db.add(state)
            db.flush()

        row_count = db.query(models.SalesTransaction).count()
        if row_count > 0 and state.source_mtime == file_mtime:
            return {
                "synced": False,
                "reason": "unchanged-source",
                "rows": 0,
                "report": {
                    "source_rows": 0,
                    "rows_after_cleaning": 0,
                    "rows_after_window_filter": 0,
                    "rows_after_validation": 0,
                    "rows_after_outlier_filter": 0,
                    "inserted_rows": 0,
                    "updated_rows": 0,
                },
            }

        # ✅ Гол шалтгаан: sheet_name заагаагүй = зөвхөн Sheet 1 уншина
        # online_retail_II.xlsx нь 2 sheet-тэй (2009-2010, 2010-2011) → бүгийг нэгтгэнэ
        sheets_dict = pd.read_excel(file_path, sheet_name=None)
        df = pd.concat(sheets_dict.values(), ignore_index=True) if sheets_dict else pd.DataFrame()
        df = _normalize_columns(df)
        cleaned, base_stats = _clean_sales_dataframe(df)
        cleaned, validation_stats = _validate_country_and_customer(cleaned)
        rows_after_validation = int(len(cleaned))
        cleaned, outlier_stats = _apply_outlier_filter(cleaned, method=outlier_method)
        rows_after_outlier_filter = int(len(cleaned))

        rows_after_cleaning = int(base_stats["rows_after_base_cleaning"])
        dropped_by_window = 0

        if state.max_invoice_date is not None:
            cutoff = state.max_invoice_date - timedelta(days=7)
            before = len(cleaned)
            cleaned = cleaned[cleaned["InvoiceDate"] >= cutoff]
            dropped_by_window = int(before - len(cleaned))

        if cleaned.empty:
            state.source_mtime = file_mtime
            state.last_synced_at = datetime.now(timezone.utc)
            db.commit()
            return {
                "synced": True,
                "reason": "no-new-rows",
                "rows": 0,
                "report": {
                    **base_stats,
                    **validation_stats,
                    **outlier_stats,
                    "rows_after_cleaning": rows_after_cleaning,
                    "rows_after_validation": rows_after_validation,
                    "rows_after_window_filter": 0,
                    "rows_after_outlier_filter": rows_after_outlier_filter,
                    "dropped_by_incremental_window": dropped_by_window,
                    "inserted_rows": 0,
                    "updated_rows": 0,
                },
            }

        batch = _prepare_batch(cleaned)
        inserted_rows = 0
        updated_rows = 0

        # ✅ Нуугдмал алдаа 2: Exception үед staging table мушгиж үлддэг → try/finally нэм
        try:
            with engine.begin() as conn:
                batch.to_sql(
                    "sales_transactions_staging",
                    conn,
                    if_exists="replace",
                    index=False,
                    method="multi",
                    chunksize=5000,
                )

                total_rows = int(
                    conn.execute(text("SELECT COUNT(*) FROM sales_transactions_staging")).scalar() or 0
                )
                matched_rows = int(
                    conn.execute(
                        text(
                            """
                            SELECT COUNT(*)
                            FROM sales_transactions_staging s
                            JOIN sales_transactions t
                              ON t.transaction_key = s.transaction_key
                            """
                        )
                    ).scalar()
                    or 0
                )
                updated_rows = matched_rows
                inserted_rows = max(total_rows - matched_rows, 0)

                conn.execute(
                    text(
                        """
                        INSERT INTO sales_transactions (
                            transaction_key, invoice, product_id, description,
                            quantity, price, customer_id, invoice_date
                        )
                        SELECT
                            transaction_key, invoice, product_id, description,
                            quantity, price, customer_id, invoice_date
                        FROM sales_transactions_staging
                        ON CONFLICT (transaction_key) DO UPDATE SET
                            description = EXCLUDED.description,
                            quantity = EXCLUDED.quantity,
                            price = EXCLUDED.price,
                            customer_id = EXCLUDED.customer_id,
                            invoice_date = EXCLUDED.invoice_date
                        """
                    )
                )
        finally:
            # Exception гарсан ч staging table сэтгэлтээр хөлсүүлэх
            with engine.begin() as conn:
                conn.execute(text("DROP TABLE IF EXISTS sales_transactions_staging"))

        state.source_mtime = file_mtime
        state.max_invoice_date = cleaned["InvoiceDate"].max().to_pydatetime()
        state.last_synced_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "synced": True,
            "reason": "upserted",
            "rows": int(len(batch)),
            "report": {
                **base_stats,
                **validation_stats,
                **outlier_stats,
                "rows_after_cleaning": rows_after_cleaning,
                "rows_after_validation": rows_after_validation,
                "rows_after_window_filter": int(len(cleaned)),
                "rows_after_outlier_filter": rows_after_outlier_filter,
                "dropped_by_incremental_window": dropped_by_window,
                "inserted_rows": int(inserted_rows),
                "updated_rows": int(updated_rows),
            },
        }
    finally:
        db.close()
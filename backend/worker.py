from __future__ import annotations

import logging
import os
from pathlib import Path

from celery import Celery

logger = logging.getLogger(__name__)
from sqlalchemy import text

from analytics.mba_engine import run_mba
from analytics.data_sync import sync_sales_to_postgres
from database import SessionLocal, engine
import models
import pandas as pd

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("worker", broker=redis_url, backend=redis_url)


def _load_sales_from_db() -> pd.DataFrame:
    """
    PostgreSQL-с цэвэрлэгдсэн борлуулалтын өгөгдлийг уншиж DataFrame буцаана.
    data_sync.py-р аль хэдийн цэвэрлэгдсэн тул энд нэмэлт цэвэрлэлт хийхгүй.
    """
    df = pd.read_sql(
        text(
            """
            SELECT
                invoice,
                product_id   AS "StockCode",
                description,
                quantity,
                price,
                invoice_date
            FROM sales_transactions
            """
        ),
        engine,
    )
    if df.empty:
        return df
    # invoice_date-г datetime болгоно — давхар багана үүсгэхгүйн тулд шууд parse
    df["invoice_date"] = pd.to_datetime(df["invoice_date"], errors="coerce")
    return df.dropna(subset=["invoice_date"]).reset_index(drop=True)


@celery_app.task
def run_analytics_engine():
    """
    1. Файлаас DB рүү sync хийнэ (файл өөрчлөгдөөгүй бол алгасна)
    2. DB-с цэвэр өгөгдлийг уншина
    3. MBA-г DataFrame-г шууд дамжуулж ажиллуулна
    4. Үр дүнг DB-д хадгална
    """
    # DATA_FILE_PATH орчны хувьсагчийг ашиглана (main.py-тэй нийцүүлсэн)
    data_env = os.getenv("DATA_FILE_PATH")
    if data_env:
        file_path = Path(data_env)
    else:
        file_path = Path(__file__).resolve().parent / "data" / "online_retail_II.xlsx"

    # Sync — data_sync.py дотроо mtime шалгаж давхардлаас зайлсхийнэ
    sync_sales_to_postgres(file_path)

    # DB-с цэвэр өгөгдлийг уншина
    sales = _load_sales_from_db()
    if sales.empty:
        return {"status": "Skipped", "reason": "no-data", "rules_found": 0}

    # MBA — file_path биш DataFrame дамжуулна
    mba = run_mba(sales)
    all_rows = mba.complementary_rows + mba.substitute_rows

    # Үр дүнг DB-д хадгалах
    db = SessionLocal()
    try:
        # Давхар дүрэм хуримтлагдахаас сэргийлж өмнөхийг устгана
        db.query(models.AssociationRule).delete()

        for row in all_rows:
            db.add(
                models.AssociationRule(
                    antecedent=row["itemA"],
                    consequent=row["itemB"],
                    support=float(row["support"]),
                    confidence=float(row["confidence"]),
                    lift=float(row["lift"]),
                )
            )
        db.commit()
    except Exception:
        logger.exception("MBA үр дүнг DB-д хадгалахад алдаа гарлаа")
        db.rollback()
        raise
    finally:
        db.close()

    return {"status": "Complete", "rules_found": len(all_rows)}
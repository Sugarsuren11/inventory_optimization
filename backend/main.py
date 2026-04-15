import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import time
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
import pandas as pd
from database import engine, SessionLocal
import models
from worker import run_analytics_engine
from analytics import build_insights_payload
from analytics.data_sync import sync_sales_to_postgres


# ── Request body schemas (stock / order / alert endpoints) ───────────────────

class _StockAdjustRequest(BaseModel):
    sku: str
    quantity_change: int   # + нэмэх, - хасах
    reason: str = ""


class _OrderConfirmItem(BaseModel):
    sku: str
    order_qty: int


class _OrderConfirmRequest(BaseModel):
    items: list[_OrderConfirmItem]


# Өгөгдлийн сангийн хүснэгтүүдийг үүсгэх
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Inventory Optimization System API")

_insights_cache_lock = Lock()
_insights_cache: dict[str, Any] = {
    "payload": None,
    "file_mtime": None,
    "generated_at": 0.0,
}

_sync_cache: dict[str, Any] = {
    "last_mtime": None,
}

# Production орчинд debug endpoint-уудыг унтрааж болно
_DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"
_sync_cache_lock = Lock()


_ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Ухаалаг агуулахын систем ажиллаж байна!"}


def _get_default_file_path() -> Path:
    env_path = os.getenv("DATA_FILE_PATH")
    if env_path:
        return Path(env_path)
    return Path(__file__).resolve().parent / "data" / "online_retail_II.xlsx"


def _sync_once_if_changed(file_path: Path) -> None:
    """Файлын mtime өөрчлөгдсөн үед л sync хийнэ."""
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Файл олдсонгүй: {file_path}")

    current_mtime = file_path.stat().st_mtime

    with _sync_cache_lock:
        if _sync_cache["last_mtime"] == current_mtime:
            return

    # Sync lock-оос гадуур хийнэ — удаан операц тул
    # TODO: consider async sync with background task queue
    try:
        sync_sales_to_postgres(file_path)
        with _sync_cache_lock:
            _sync_cache["last_mtime"] = current_mtime
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sync алдаа: {exc}")


def _load_sales_for_metrics(file_path: Path) -> pd.DataFrame:
    _sync_once_if_changed(file_path)

    sales = pd.read_sql(
        text(
            """
            SELECT
                invoice,
                product_id,
                description,
                quantity,
                price,
                invoice_date
            FROM sales_transactions
            """
        ),
        engine,
    )

    if sales.empty:
        raise HTTPException(status_code=404, detail="Борлуулалтын өгөгдөл хоосон байна")

    sales["invoice_date"] = pd.to_datetime(sales["invoice_date"], errors="coerce")
    sales = sales.dropna(subset=["invoice_date"])
    if sales.empty:
        raise HTTPException(status_code=404, detail="invoice_date буруу форматтай байна")

    sales["invoice"] = sales["invoice"].astype(str)
    sales["product_id"] = sales["product_id"].astype(str)
    sales["description"] = sales["description"].fillna("Unknown")
    sales["quantity"] = pd.to_numeric(sales["quantity"], errors="coerce").fillna(0.0)
    sales["price"] = pd.to_numeric(sales["price"], errors="coerce").fillna(0.0)
    return sales


@app.post("/api/v1/analyze")
def start_analysis():
    # Хэрэглэгч товч дарахад Celery Worker руу ажлыг шиднэ
    task = run_analytics_engine.delay()
    return {"task_id": task.id, "message": "Шинжилгээ арын горимд эхэллээ. Түр хүлээнэ үү..."}


@app.get("/api/v1/statistics")
def get_statistics():
    """Legacy dashboard-тэй дүйцэх үндсэн статистикууд."""
    sales = _load_sales_for_metrics(_get_default_file_path())

    total_transactions = int(sales["invoice"].nunique())
    total_items_sold = float(sales["quantity"].sum())
    unique_products = int(sales["product_id"].nunique())
    avg_items_per_transaction = (
        total_items_sold / total_transactions if total_transactions > 0 else 0.0
    )

    return {
        "success": True,
        "statistics": {
            "total_transactions": total_transactions,
            "total_items_sold": int(round(total_items_sold)),
            "unique_products": unique_products,
            "avg_items_per_transaction": round(avg_items_per_transaction, 2),
        },
    }


@app.get("/api/v1/sales-trend")
def get_sales_trend():
    sales = _load_sales_for_metrics(_get_default_file_path())
    daily = (
        sales.groupby(sales["invoice_date"].dt.date, as_index=False)["quantity"]
        .sum()
        .rename(columns={"invoice_date": "date", "quantity": "value"})
        .sort_values("date")
    )

    # Chart-г хэт ачаалахгүй байх үүднээс сүүлийн 90 өдрийг буцаана.
    daily = daily.tail(90)
    dates = [str(d) for d in daily["date"].tolist()]
    values = [float(v) for v in daily["value"].tolist()]

    return {
        "success": True,
        "dates": dates,
        "values": values,
    }


@app.get("/api/v1/top-products")
def get_top_products(limit: int = 10):
    sales = _load_sales_for_metrics(_get_default_file_path())
    limit = max(1, min(limit, 50))
    sales["line_revenue"] = sales["quantity"] * sales["price"]

    grouped = (
        sales.groupby(["product_id", "description"], as_index=False)
        .agg(
            quantity=("quantity", "sum"),
            revenue=("line_revenue", "sum"),
        )
    )

    top = grouped.sort_values("quantity", ascending=False).head(limit)
    products: list[dict[str, Any]] = []
    for _, row in top.iterrows():
        products.append(
            {
                "product_id": str(row["product_id"]),
                "name": str(row["description"]),
                "quantity": float(row["quantity"]),
                "revenue": round(float(row["revenue"]), 2),
            }
        )

    return {"success": True, "products": products}


def _get_cached_insights_payload() -> dict[str, Any]:
    """Insights cache-ийг ашиглана. Cache хоосон бол дахин тооцоолно."""
    file_path = _get_default_file_path()
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Өгөгдлийн файл олдсонгүй")

    file_mtime = file_path.stat().st_mtime
    with _insights_cache_lock:
        cached_payload = _insights_cache["payload"]
        cached_mtime = _insights_cache["file_mtime"]

    if cached_payload is not None and cached_mtime == file_mtime:
        return cached_payload  # type: ignore[return-value]

    payload = build_insights_payload(file_path)
    now = time()
    with _insights_cache_lock:
        _insights_cache["payload"] = payload
        _insights_cache["file_mtime"] = file_mtime
        _insights_cache["generated_at"] = now
    return payload


@app.post("/api/v1/optimize-inventory")
def optimize_inventory():
    """Legacy төслийн optimize endpoint-тэй нийцэх inventory recommendation."""
    payload = _get_cached_insights_payload()  # Cache ашиглана — бүрэн шинжилгээ дахин ажиллахгүй
    recommendations: list[dict[str, Any]] = []

    for row in payload.get("reordering", []):
        current_stock = float(row.get("currentStock", 0))
        reorder_point = float(row.get("dynamicROP", 0))
        suggested = float(row.get("suggestedOrderQty", 0))
        daily_demand = reorder_point / max(float(row.get("leadTime", 1)), 1.0)

        risk_score = 0.0
        if reorder_point > 0:
            ratio = current_stock / reorder_point
            risk_score = max(0.0, min(100.0, (1.0 - ratio) * 100.0))

        if current_stock <= reorder_point:
            action = "ORDER_URGENT"
            priority = "CRITICAL"
        elif current_stock <= reorder_point * 1.2:
            action = "ORDER_SOON"
            priority = "HIGH"
        elif current_stock > reorder_point * 2.2:
            action = "REDUCE_STOCK"
            priority = "LOW"
        else:
            action = "MAINTAIN"
            priority = "MEDIUM"

        recommendations.append(
            {
                "product_id": row.get("sku"),
                "product_name": row.get("productName"),
                "current_stock": int(current_stock),
                "reorder_point": round(reorder_point, 2),
                "optimal_order_quantity": round(suggested, 2),
                "forecast_30_days": round(daily_demand * 30.0, 2),
                "avg_daily_sales": round(daily_demand, 2),
                "risk_score": round(risk_score, 1),
                "related_products": row.get("triggerLinks", {}).get("triggers", []),
                "action": action,
                "priority": priority,
            }
        )

    priority_value = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    recommendations.sort(key=lambda x: priority_value.get(x["priority"], 0), reverse=True)

    return {"success": True, "recommendations": recommendations}


@app.get("/api/v1/products")
def get_products_snapshot(limit: int = 200):
    sales = _load_sales_for_metrics(_get_default_file_path())
    limit = max(1, min(limit, 1000))

    product_metrics = (
        sales.groupby(["product_id", "description"], as_index=False)
        .agg(
            total_qty=("quantity", "sum"),
            avg_price=("price", "median"),
            transaction_count=("invoice", "nunique"),
        )
        .sort_values("total_qty", ascending=False)
        .head(limit)
    )

    products: list[dict[str, Any]] = []
    for _, row in product_metrics.iterrows():
        reorder_point = max(5, int(round(float(row["total_qty"]) / max(float(row["transaction_count"]), 1.0))))
        stock_level = max(1, int(round(reorder_point * 1.35)))
        products.append(
            {
                "id": str(row["product_id"]),
                "name": str(row["description"]),
                "category": None,
                "unit_cost": round(float(row["avg_price"]), 2),
                "selling_price": round(float(row["avg_price"]), 2),
                "stock_level": stock_level,
                "reorder_point": reorder_point,
                "transaction_count": int(row["transaction_count"]),
            }
        )

    return {"success": True, "products": products}


@app.get("/api/v1/debug")
def debug_info():  # type: ignore[misc]
    if not _DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    """
    ЗАСВАР: Шинжилгээний endpoint.
    Дараах мэдээлэл буцаана:
    - Өгөгдлийн файлын зам болон оршиж байгаа эсэх
    - Sync cache дахь сүүлсээр их засварлагдсан огноо (mtime)
    - Database-д sales_transactions хүснэгтэд орсон эргүүлэлтийн тоо
    """
    file_path = _get_default_file_path()

    try:
        row_count = None
        if file_path.exists():
            with engine.connect() as conn:
                result = conn.execute(text("SELECT COUNT(*) FROM sales_transactions"))
                row_count = result.scalar()

        return {
            "file_path": str(file_path),
            "file_exists": file_path.exists(),
            "sync_cache_mtime": _sync_cache.get("last_mtime"),
            "db_row_count": row_count,
            "status": "OK"
        }
    except Exception as e:
        return {
            "file_path": str(file_path),
            "file_exists": file_path.exists(),
            "sync_cache_mtime": _sync_cache.get("last_mtime"),
            "error": str(e),
            "status": "ERROR"
        }


@app.get("/api/v1/debug/sync")
def debug_sync():  # type: ignore[misc]
    if not _DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    """
    ✅ Шуурхай оношлох: Sheet бүрийн өгөгдлүүн байгаа эсэх + sync үр дүнг харуулна.
    Хэрэв db_row_count: 0 гарсан → sheets-г шалгаж аль sheet-д өгөгдөл байгаа тодотгодог.
    """
    file_path = _get_default_file_path()

    if not file_path.exists():
        return {"error": f"Файл олдсонгүй: {file_path}"}

    try:
        # Sheet-үүдийг шалгана
        sheets = pd.read_excel(file_path, sheet_name=None)
        sheet_info = {name: len(df) for name, df in sheets.items()}

        # Sync дуудана
        result = sync_sales_to_postgres(file_path)

        # DB-д байгаа нөхцөл
        with engine.connect() as conn:
            db_count = conn.execute(text("SELECT COUNT(*) FROM sales_transactions")).scalar()

        return {
            "file_path": str(file_path),
            "sheets": sheet_info,
            "sync_result": result,
            "db_row_count": db_count,
            "status": "OK"
        }
    except Exception as e:
        return {
            "error": type(e).__name__,
            "detail": str(e),
            "status": "ERROR"
        }


@app.get("/api/v1/insights")
def get_insights():
    try:
        file_path = _get_default_file_path()
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Өгөгдлийн файл олдсонгүй")

        file_mtime = file_path.stat().st_mtime

        with _insights_cache_lock:
            cached_at = _insights_cache["generated_at"]
            cached_mtime = _insights_cache["file_mtime"]
            cached_payload = _insights_cache["payload"]

        if cached_payload is not None and cached_mtime == file_mtime:
            return {**cached_payload, "meta": {"cached": True, "generated_at": cached_at}}

        payload = _get_cached_insights_payload()
        with _insights_cache_lock:
            generated_at = _insights_cache["generated_at"]

        return {**payload, "meta": {"cached": False, "generated_at": generated_at}}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Шинжилгээ хийхэд алдаа гарлаа: {exc}")


# ── Stock Management Endpoints ───────────────────────────────────────────────

def _invalidate_insights_cache() -> None:
    """Insights cache-г цэвэрлэнэ — дараагийн /insights дуудалт шинэ өгөгдөл авна."""
    with _insights_cache_lock:
        _insights_cache["payload"] = None


@app.post("/api/v1/stock/adjust")
def adjust_stock(body: _StockAdjustRequest):
    """
    Нөөцийн тохируулга — current_stock-г quantity_change-р өөрчилнэ.
    Шинэ stock < dynamic_rop бол LOW_STOCK alert үүсгэнэ.
    Шинэ stock >= dynamic_rop бол тухайн барааны LOW_STOCK alert-г resolve хийнэ.
    """
    with SessionLocal() as session:
        product = session.query(models.Product).filter_by(sku=body.sku).first()
        if product is None:
            raise HTTPException(status_code=404, detail=f"SKU олдсонгүй: {body.sku}")

        new_stock = product.current_stock + body.quantity_change
        if new_stock < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Нөөц 0-с бага болохгүй. Одоогийн нөөц: {product.current_stock}",
            )

        product.current_stock = new_stock
        product.updated_at = datetime.now(timezone.utc)

        alert_created = False
        dynamic_rop = product.dynamic_rop or 0

        if new_stock < dynamic_rop:
            # Давхардал шалгалт
            existing = session.query(models.SmartAlert).filter_by(
                product_id  = product.product_id,
                alert_type  = "LOW_STOCK",
                is_resolved = False,
            ).first()
            if not existing:
                gap = dynamic_rop - new_stock
                session.add(
                    models.SmartAlert(
                        product_id  = product.product_id,
                        alert_type  = "LOW_STOCK",
                        message     = f"ROP-оос {gap} нэгжээр бага байна. Яаралтай нөхөн захиалга шаардлагатай.",
                        priority    = 1,
                        is_resolved = False,
                        created_at  = datetime.now(timezone.utc),
                    )
                )
                alert_created = True
        else:
            # Stock сайн болсон тул unresolved LOW_STOCK alert-г resolve хийнэ
            session.query(models.SmartAlert).filter_by(
                product_id  = product.product_id,
                alert_type  = "LOW_STOCK",
                is_resolved = False,
            ).update({"is_resolved": True})

        session.commit()

    _invalidate_insights_cache()

    return {
        "success":       True,
        "product_id":    product.product_id,
        "sku":           body.sku,
        "new_stock":     new_stock,
        "alert_created": alert_created,
    }


@app.post("/api/v1/orders/confirm")
def confirm_orders(body: _OrderConfirmRequest):
    """
    Захиалга баталгаажуулах — бараа бүрийн current_stock-г order_qty-р нэмнэ.
    Нөөц ROP-оос дээш гарсан бол LOW_STOCK alert-г resolve хийнэ.
    """
    if not body.items:
        raise HTTPException(status_code=400, detail="items хоосон байна")

    updated_products: list[dict[str, Any]] = []

    with SessionLocal() as session:
        for item in body.items:
            if item.order_qty <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"order_qty эерэг байх ёстой (SKU: {item.sku})",
                )

            product = session.query(models.Product).filter_by(sku=item.sku).first()
            if product is None:
                raise HTTPException(status_code=404, detail=f"SKU олдсонгүй: {item.sku}")

            product.current_stock += item.order_qty
            product.updated_at = datetime.now(timezone.utc)

            dynamic_rop = product.dynamic_rop or 0
            if product.current_stock >= dynamic_rop:
                session.query(models.SmartAlert).filter_by(
                    product_id  = product.product_id,
                    alert_type  = "LOW_STOCK",
                    is_resolved = False,
                ).update({"is_resolved": True})

            updated_products.append({
                "product_id":    product.product_id,
                "sku":           product.sku,
                "name":          product.name,
                "new_stock":     product.current_stock,
                "dynamic_rop":   dynamic_rop,
                "order_qty":     item.order_qty,
            })

        session.commit()

    _invalidate_insights_cache()

    return {
        "success":          True,
        "confirmed_count":  len(updated_products),
        "updated_products": updated_products,
    }


@app.patch("/api/v1/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int):
    """Alert-г гараар шийдвэрлэгдсэн гэж тэмдэглэнэ."""
    with SessionLocal() as session:
        alert = session.query(models.SmartAlert).filter_by(alert_id=alert_id).first()
        if alert is None:
            raise HTTPException(status_code=404, detail=f"Alert олдсонгүй: {alert_id}")

        alert.is_resolved = True
        session.commit()

    return {"success": True, "alert_id": alert_id, "resolved": True}


@app.get("/api/v1/alerts/active")
def get_active_alerts():
    """DB-д байгаа шийдвэрлэгдээгүй alert бүрийг priority-р эрэмбэлж буцаана."""
    with SessionLocal() as session:
        rows = (
            session.query(models.SmartAlert, models.Product.sku, models.Product.name)
            .join(models.Product, models.SmartAlert.product_id == models.Product.product_id)
            .filter(models.SmartAlert.is_resolved == False)  # noqa: E712
            .order_by(models.SmartAlert.priority, models.SmartAlert.created_at)
            .all()
        )

    alerts = [
        {
            "alert_id":   r.SmartAlert.alert_id,
            "product_id": r.SmartAlert.product_id,
            "sku":        r.sku,
            "name":       r.name,
            "alert_type": r.SmartAlert.alert_type,
            "message":    r.SmartAlert.message,
            "priority":   r.SmartAlert.priority,
            "created_at": r.SmartAlert.created_at.isoformat() if r.SmartAlert.created_at else None,
        }
        for r in rows
    ]

    return {"success": True, "alerts": alerts, "total": len(alerts)}



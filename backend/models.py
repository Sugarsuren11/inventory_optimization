from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float,
    Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from database import Base


# ---------------------------------------------------------------------------
# 1. БҮТЭЭГДЭХҮҮН  (products)
# ---------------------------------------------------------------------------
class Product(Base):
    """
    Бүтээгдэхүүний үндсэн бүртгэл.
    Зургийн схемтэй бүрэн нийцүүлсэн.
    """
    __tablename__ = "products"

    product_id  = Column(Integer, primary_key=True, autoincrement=True, index=True)
    sku         = Column(String(50), unique=True, nullable=False, index=True)
    name        = Column(String(255))
    category    = Column(String(100))
    unit_price  = Column(Numeric(12, 2))
    current_stock = Column(Integer, default=0)
    dynamic_rop   = Column(Integer)          # Reorder Point (денормализацийн хуулбар)
    lead_time_days = Column(Integer, default=7)
    created_at  = Column(DateTime(timezone=True))
    updated_at  = Column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# 2. БОРЛУУЛАЛТЫН ТҮҮХ  (sales_history)
#    — data_sync.py sales_transactions хүснэгтэд бичдэг тул
#      SalesTransaction загварыг хэвээр үлдээж, нэмэлтээр
#      sales_history хүснэгтийг нэмлээ.
# ---------------------------------------------------------------------------
class SalesTransaction(Base):
    """
    Excel-с татаж авсан хэрэглэгчийн гүйлгээний мөр бүр.
    data_sync.py энэ хүснэгтэд бичдэг — өөрчлөхгүй.
    """
    __tablename__ = "sales_transactions"

    id              = Column(Integer, primary_key=True, index=True)
    transaction_key = Column(String, nullable=False)  # unique=True хасав: __table_args__ UniqueConstraint давхардаж 2 index үүсгэж байсан
    invoice         = Column(String, nullable=False)
    # FK-г хасаж индекс хадгалсан (Bug 4 засвар)
    product_id      = Column(String, nullable=False, index=True)
    description     = Column(String)
    quantity        = Column(Float, nullable=False)
    price           = Column(Float, nullable=False)
    customer_id     = Column(String)
    invoice_date    = Column(DateTime, nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("transaction_key", name="uq_sales_transaction_key"),
        Index("ix_sales_product_date", "product_id", "invoice_date"),
    )


class SalesHistory(Base):
    """
    Нэгтгэгдсэн борлуулалтын түүх — зургийн схемийн sales_history хүснэгт.
    """
    __tablename__ = "sales_history"

    sale_id        = Column(Integer, primary_key=True, autoincrement=True)
    product_id     = Column(Integer, nullable=False, index=True)
    sale_date      = Column(DateTime(timezone=True), nullable=False, index=True)
    quantity       = Column(Integer, nullable=False)
    total_amount   = Column(Numeric(12, 2))
    transaction_id = Column(String(100))
    created_at     = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_sales_history_product_date", "product_id", "sale_date"),
    )


# ---------------------------------------------------------------------------
# 3. НӨӨЦ ШИНЖИЛГЭЭ — ABC / XYZ  (inventory_analysis)
# ---------------------------------------------------------------------------
class InventoryAnalysis(Base):
    """
    Бүтээгдэхүүн бүрийн ABC-XYZ ангиллын үр дүн.
    """
    __tablename__ = "inventory_analysis"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    product_id       = Column(Integer, nullable=False, index=True)
    abc_class        = Column(String(1))          # A | B | C
    xyz_class        = Column(String(1))          # X | Y | Z
    combined_class   = Column(String(2))          # AX, BY гэх мэт
    value_score      = Column(Numeric(5, 2))
    variability_score = Column(Numeric(5, 2))
    calculated_at    = Column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# 4. НӨӨЦ НӨХӨН ЗАХИАЛАХ  (inventory_reorder)
# ---------------------------------------------------------------------------
class InventoryReorder(Base):
    """
    Динамик ROP, захиалах хэмжээ болон улирлын мэдээлэл.
    Зургийн схемд нийцүүлэн inventory_reorder хүснэгтийг ашиглана.
    """
    __tablename__ = "inventory_reorder"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    product_id     = Column(Integer, nullable=False, unique=True, index=True)
    lead_time      = Column(Integer, default=7)
    dynamic_rop    = Column(Integer)
    suggested_qty  = Column(Integer)
    seasonality    = Column(String(50))
    calculated_at  = Column(DateTime)         # timezone=False — зурагтай нийцүүлсэн


# ---------------------------------------------------------------------------
# 5. MARKET BASKET ANALYSIS  (mba_rules)
#    — worker.py AssociationRule загварыг ашигладаг тул
#      хуучин хүснэгтийг хэвээр үлдааж, шинийг нэмлээ.
# ---------------------------------------------------------------------------
class AssociationRule(Base):
    """
    worker.py-с бичигддэг MBA дүрмүүд (association_rules хүснэгт).
    Хэвээр үлдсэн — кодын нийцтэй байдлыг хангана.
    """
    __tablename__ = "association_rules"

    id         = Column(Integer, primary_key=True, index=True)
    antecedent = Column(String, index=True)
    consequent = Column(String, index=True)
    support    = Column(Float)
    confidence = Column(Float)
    lift       = Column(Float)


class MbaRule(Base):
    """
    Зургийн схемийн mba_rules хүснэгт.
    product_id-р холбогддог тоон индексийг ашиглана.
    """
    __tablename__ = "mba_rules"

    rule_id      = Column(Integer, primary_key=True, autoincrement=True)
    item_a_id    = Column(Integer, nullable=False, index=True)
    item_b_id    = Column(Integer, nullable=False, index=True)
    support      = Column(Numeric(6, 4))
    confidence   = Column(Numeric(6, 4))
    lift         = Column(Numeric(8, 2))
    calculated_at = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_mba_rules_ab", "item_a_id", "item_b_id"),
    )


# ---------------------------------------------------------------------------
# 6. ЭРЭЛТИЙН ТААМАГЛАЛ  (demand_forecasts)
# ---------------------------------------------------------------------------
class DemandForecast(Base):
    """
    Prophet AI моделийн ирээдүйн эрэлтийн таамаглал.
    Зургийн схемтэй нийцүүлэн баганын нэрийг шинэчиллээ.
    """
    __tablename__ = "demand_forecasts"

    forecast_id   = Column(Integer, primary_key=True, autoincrement=True)
    product_id    = Column(Integer, nullable=False, index=True)
    target_month  = Column(Date, nullable=False)   # Таамаглаж буй сар
    predicted_qty = Column(Integer)                # yhat
    lower_bound   = Column(Integer)                # yhat_lower
    upper_bound   = Column(Integer)                # yhat_upper
    calculated_at = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_demand_forecast_product_month", "product_id", "target_month"),
    )


# ---------------------------------------------------------------------------
# 7. УХААЛАГ АНХААРУУЛГА  (smart_alerts)
# ---------------------------------------------------------------------------
class SmartAlert(Base):
    """
    Системийн автомат анхааруулгууд (нөөц дуусч байна, эрэлт огцом өссөн гэх мэт).
    """
    __tablename__ = "smart_alerts"

    alert_id   = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, nullable=False, index=True)
    alert_type = Column(String(20))    # LOW_STOCK | OVERSTOCK | DEMAND_SPIKE гэх мэт
    message    = Column(Text)
    priority   = Column(Integer, default=1)   # 1 = өндөр, 3 = бага
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_smart_alerts_product_type", "product_id", "alert_type"),
    )


# ---------------------------------------------------------------------------
# 8. ДАТА СИНХРОНЧЛОЛЫН ТӨЛӨВ  (ingestion_state)
#    — data_sync.py болон _sync_once_if_changed() ашигладаг, хэвээр үлдсэн.
# ---------------------------------------------------------------------------
class IngestionState(Base):
    """
    Файлын mtime болон сүүлийн sync хийсэн огноог хадгална.
    """
    __tablename__ = "ingestion_state"

    id              = Column(Integer, primary_key=True, index=True)
    source_name     = Column(String, nullable=False, unique=True, index=True)
    source_mtime    = Column(Float, nullable=False, default=0.0)
    max_invoice_date = Column(DateTime)
    last_synced_at  = Column(DateTime)
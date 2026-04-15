from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float,
    Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from database import Base


class Product(Base):
    """Бүтээгдэхүүний үндсэн бүртгэл."""
    __tablename__ = "products"

    product_id    = Column(Integer, primary_key=True, autoincrement=True, index=True)
    sku           = Column(String(50), unique=True, nullable=False, index=True)
    name          = Column(String(255))
    category      = Column(String(100))
    unit_price    = Column(Numeric(12, 2))
    current_stock = Column(Integer, default=0)
    dynamic_rop   = Column(Integer)
    lead_time_days = Column(Integer, default=7)
    created_at    = Column(DateTime(timezone=True))
    updated_at    = Column(DateTime(timezone=True))


class SalesTransaction(Base):
    """Excel-с татаж авсан гүйлгээний мөр бүр. data_sync.py энд бичдэг."""
    __tablename__ = "sales_transactions"

    id              = Column(Integer, primary_key=True, index=True)
    transaction_key = Column(String, nullable=False)
    invoice         = Column(String, nullable=False)
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
    """Нэгтгэгдсэн борлуулалтын түүх."""
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


class InventoryAnalysis(Base):
    """Бүтээгдэхүүн бүрийн ABC-XYZ ангиллын үр дүн."""
    __tablename__ = "inventory_analysis"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    product_id        = Column(Integer, nullable=False, index=True)
    abc_class         = Column(String(1))
    xyz_class         = Column(String(1))
    combined_class    = Column(String(2))
    value_score       = Column(Numeric(5, 2))
    variability_score = Column(Numeric(5, 2))
    calculated_at     = Column(DateTime(timezone=True))


class InventoryReorder(Base):
    """Динамик ROP, захиалах хэмжээ болон улирлын мэдээлэл."""
    __tablename__ = "inventory_reorder"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    product_id    = Column(Integer, nullable=False, unique=True, index=True)
    lead_time     = Column(Integer, default=7)
    dynamic_rop   = Column(Integer)
    suggested_qty = Column(Integer)
    seasonality   = Column(String(50))
    calculated_at = Column(DateTime)


class AssociationRule(Base):
    """worker.py-с бичигддэг MBA дүрмүүд."""
    __tablename__ = "association_rules"

    id         = Column(Integer, primary_key=True, index=True)
    antecedent = Column(String, index=True)
    consequent = Column(String, index=True)
    support    = Column(Float)
    confidence = Column(Float)
    lift       = Column(Float)


class MbaRule(Base):
    """product_id-р холбогддог MBA дүрмүүд."""
    __tablename__ = "mba_rules"

    rule_id       = Column(Integer, primary_key=True, autoincrement=True)
    item_a_id     = Column(Integer, nullable=False, index=True)
    item_b_id     = Column(Integer, nullable=False, index=True)
    support       = Column(Numeric(6, 4))
    confidence    = Column(Numeric(6, 4))
    lift          = Column(Numeric(8, 2))
    calculated_at = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_mba_rules_ab", "item_a_id", "item_b_id"),
    )


class DemandForecast(Base):
    """Prophet моделийн ирээдүйн эрэлтийн таамаглал."""
    __tablename__ = "demand_forecasts"

    forecast_id   = Column(Integer, primary_key=True, autoincrement=True)
    product_id    = Column(Integer, nullable=False, index=True)
    target_month  = Column(Date, nullable=False)
    predicted_qty = Column(Integer)
    lower_bound   = Column(Integer)
    upper_bound   = Column(Integer)
    calculated_at = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_demand_forecast_product_month", "product_id", "target_month"),
    )


class SmartAlert(Base):
    """Системийн автомат анхааруулгууд."""
    __tablename__ = "smart_alerts"

    alert_id    = Column(Integer, primary_key=True, autoincrement=True)
    product_id  = Column(Integer, nullable=False, index=True)
    alert_type  = Column(String(20))    # LOW_STOCK | OVERSTOCK | DEMAND_SPIKE
    message     = Column(Text)
    priority    = Column(Integer, default=1)   # 1 = өндөр, 3 = бага
    is_resolved = Column(Boolean, default=False)
    created_at  = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_smart_alerts_product_type", "product_id", "alert_type"),
    )


class IngestionState(Base):
    """Файлын mtime болон сүүлийн sync хийсэн огноог хадгална."""
    __tablename__ = "ingestion_state"

    id               = Column(Integer, primary_key=True, index=True)
    source_name      = Column(String, nullable=False, unique=True, index=True)
    source_mtime     = Column(Float, nullable=False, default=0.0)
    max_invoice_date = Column(DateTime)
    last_synced_at   = Column(DateTime)

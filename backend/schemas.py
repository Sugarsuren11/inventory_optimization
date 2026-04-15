from pydantic import BaseModel
from typing import List, Optional, Any, Dict


class StatisticValues(BaseModel):
    total_transactions: int
    total_items_sold: int
    unique_products: int
    avg_items_per_transaction: float


class StatisticsResponse(BaseModel):
    success: bool
    statistics: StatisticValues


class TopProduct(BaseModel):
    product_id: str
    name: str
    quantity: float
    revenue: float


class TopProductsResponse(BaseModel):
    success: bool
    products: List[TopProduct]


class SalesTrendResponse(BaseModel):
    success: bool
    dates: List[str]
    values: List[float]


class ProductSnapshot(BaseModel):
    id: str
    name: str
    category: Optional[str]
    unit_cost: float
    selling_price: float
    stock_level: int
    reorder_point: int
    transaction_count: int


class ProductsResponse(BaseModel):
    success: bool
    products: List[ProductSnapshot]


class InventoryRecommendation(BaseModel):
    product_id: Optional[str]
    product_name: Optional[str]
    current_stock: int
    reorder_point: float
    optimal_order_quantity: float
    forecast_30_days: float
    avg_daily_sales: float
    risk_score: float
    related_products: List[str]
    action: str
    priority: str


class OptimizeInventoryResponse(BaseModel):
    success: bool
    recommendations: List[InventoryRecommendation]


class AnalyzeResponse(BaseModel):
    task_id: str
    message: str


class InsightsSummary(BaseModel):
    total_products: int
    mape: float
    mba_rules: int
    substitute_rules: int
    active_alerts: int


class AbcXyzItem(BaseModel):
    id: str
    name: str
    sku: str
    category: str
    description: str
    value: float
    variability: float
    revenue: float


class MbaRule(BaseModel):
    id: str
    itemA: str
    itemB: str
    support: float
    confidence: float
    lift: float
    ruleType: Optional[str] = None


class ForecastPoint(BaseModel):
    month: str
    actual: Optional[int]
    predicted: Optional[int]
    lower: Optional[int]
    upper: Optional[int]


class DemandForecastSummary(BaseModel):
    current_month: int
    next_month_prediction: int
    growth_pct: float
    mape: float


class DemandForecast(BaseModel):
    chart: List[ForecastPoint]
    summary: DemandForecastSummary


class Alert(BaseModel):
    id: str
    type: str
    category: str
    product: str
    message: str
    action: str
    priority: int


class ReorderItem(BaseModel):
    id: str
    productName: str
    sku: str
    currentStock: int
    dynamicROP: int
    suggestedOrderQty: int
    unitCost: float
    leadTime: int
    category: str
    seasonality: Optional[str]
    triggerLinks: Dict[str, Any]
    selected: bool


class InsightsMeta(BaseModel):
    cached: bool
    generated_at: float


class InsightsResponse(BaseModel):
    summary: InsightsSummary
    abc_xyz_matrix: List[AbcXyzItem]
    market_basket_rules: List[MbaRule]
    substitute_rules: List[MbaRule]
    demand_forecast: DemandForecast
    alerts: List[Alert]
    reordering: List[ReorderItem]
    meta: InsightsMeta

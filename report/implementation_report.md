# Ухаалаг Агуулахын Удирдлагын Системийн Хэрэгжүүлэлтийн Тайлан

## Агуулга

1. [Системийн Ерөнхий Архитектур](#1-системийн-ерөнхий-архитектур)
2. [Өгөгдлийн Урсгал — ETL Pipeline](#2-өгөгдлийн-урсгал--etl-pipeline)
3. [Өгөгдөл Цэвэрлэлтийн Дэлгэрэнгүй Алхмууд](#3-өгөгдөл-цэвэрлэлтийн-дэлгэрэнгүй-алхмууд)
4. [ABC-XYZ Ангиллын Алгоритм](#4-abc-xyz-ангиллын-алгоритм)
5. [Market Basket Analysis — FP-Growth](#5-market-basket-analysis--fp-growth)
6. [Prophet AI Эрэлтийн Таамаглал](#6-prophet-ai-эрэлтийн-таамаглал)
7. [Динамик ROP ба Safety Stock Тооцоолол](#7-динамик-rop-ба-safety-stock-тооцоолол)
8. [Системийн Кэш Стратеги](#8-системийн-кэш-стратеги)
9. [Өгөгдлийн Сангийн Схем](#9-өгөгдлийн-сангийн-схем)
10. [API Endpoint-уудын Тодорхойлолт](#10-api-endpoint-уудын-тодорхойлолт)
11. [Цэвэрлэлтийн Тайлан — Бодит Статистик](#11-цэвэрлэлтийн-тайлан--бодит-статистик)

---

## 1. Системийн Ерөнхий Архитектур

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose                               │
│                                                                     │
│  ┌──────────────┐    HTTP     ┌──────────────────────────────────┐  │
│  │   Frontend   │◄──────────►│           Backend                │  │
│  │  React+Vite  │  :5173     │        FastAPI :8000             │  │
│  │  TypeScript  │            │                                  │  │
│  │  Recharts    │            │  /api/v1/insights  (GET)         │  │
│  │  Tailwind    │            │  /api/v1/statistics (GET)        │  │
│  └──────────────┘            │  /api/v1/top-products (GET)      │  │
│                              │  /api/v1/sales-trend (GET)       │  │
│                              │  /api/v1/products (GET)          │  │
│                              │  /api/v1/optimize-inventory(POST)│  │
│                              │  /api/v1/analyze (POST)          │  │
│                              └──────────┬───────────────────────┘  │
│                                         │                           │
│                              ┌──────────▼───────────────────────┐  │
│                              │         PostgreSQL :5432          │  │
│                              │   sales_transactions              │  │
│                              │   ingestion_state                 │  │
│                              │   association_rules               │  │
│                              │   products, mba_rules, ...        │  │
│                              └──────────▲───────────────────────┘  │
│                                         │                           │
│  ┌──────────────┐   Celery    ┌──────────┴───────────────────────┐  │
│  │    Redis     │◄───────────►│      Worker (Celery)             │  │
│  │  :6379       │   Tasks     │  MBA Analysis (async)            │  │
│  │  Broker      │            └──────────────────────────────────┘  │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Бүрэлдэхүүн хэсэг бүрийн үүрэг

| Бүрэлдэхүүн | Технологи | Үүрэг |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind, Recharts | Хяналтын самбар UI, chart дүрслэл |
| **Backend** | FastAPI, SQLAlchemy 2.0, Pandas, NumPy | REST API, шинжилгээ, кэш удирдлага |
| **Worker** | Celery, Redis | Асинхрон MBA шинжилгээ |
| **PostgreSQL** | PostgreSQL 15 | Цэвэрлэгдсэн өгөгдөл, MBA дүрмүүд хадгалах |
| **Redis** | Redis 7 | Celery broker/backend |
| **Analytics** | Prophet, mlxtend (FP-Growth), scikit-learn | AI таамаглал, MBA, ABC-XYZ |

---

## 2. Өгөгдлийн Урсгал — ETL Pipeline

Системд өгөгдөл дараах дарааллаар урсна:

```
Excel файл (online_retail_II.xlsx)
         │
         ▼
┌─────────────────────────────┐
│  1. Хуудас нэгтгэх          │
│     pd.read_excel(sheet_name=None)  │
│     Sheet "2009-2010" + "2010-2011" │
│     → concat → 1,067,371 мөр        │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  2. Баганын нэр стандартчилал│
│     _normalize_columns()    │
│     "InvoiceNo"→"Invoice"   │
│     "UnitPrice"→"Price"     │
│     "Qty"→"Quantity" гэх мэт│
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  3. Суурь цэвэрлэлт         │
│     _clean_sales_dataframe()│
│     • Хоосон утга хасах     │
│     • Qty ≤ 0 хасах         │
│     • Price ≤ 0 хасах       │
│     • "C" invoice (буцаалт) │
│       хасах                 │
│     → 1,041,670 мөр үлдэнэ  │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  4. Хэрэглэгч/Улс баталгаажуулалт│
│     _validate_country_and_customer()│
│     • CustomerID regex шалгах│
│     • Country regex шалгах  │
│     → тоо өөрчлөгдөхгүй    │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  5. Outlier шүүлт (IQR)     │
│     _apply_outlier_filter() │
│     • Quantity: IQR ×1.5    │
│       111,341 мөр хасагдсан │
│     • Price: IQR ×1.5       │
│       63,593 мөр хасагдсан  │
│     → 866,736 мөр үлдэнэ    │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  6. Incremental window шүүлт│
│     (2-р болон дараагийн sync│
│      хийхэд хамааралтай)    │
│     max_invoice_date - 7 өдөр│
│     → 452,972 мөр үлдэнэ    │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  7. Batch бэлтгэх           │
│     _prepare_batch()        │
│     • transaction_key үүсгэх│
│       invoice|product_id|date│
│     • Давхардал хасах       │
│     → 428,695 мөр upsert   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  8. PostgreSQL UPSERT       │
│     ON CONFLICT(transaction_key)│
│     DO UPDATE SET ...       │
│     414,564 шинэ мөр орсон  │
│     14,131 мөр шинэчлэгдсэн │
└─────────────────────────────┘
```

### Incremental Sync ажиллах зарчим

`sync_sales_to_postgres()` функц нь дараах механизмаар давхардал болон хэт их боловсруулалтаас зайлсхийнэ:

1. **mtime шалгалт**: Файлын `os.stat().st_mtime` утгыг `ingestion_state` хүснэгтийн `source_mtime`-тэй харьцуулна. Хэрэв тэнцүү бол sync-г алгасна.
2. **Window шүүлт**: Дараагийн sync хийхэд зөвхөн `max_invoice_date - 7 хоног`-оос хойшхи мэдээллийг авч боловсруулна.
3. **UPSERT**: `ON CONFLICT (transaction_key) DO UPDATE` — давхардсан гүйлгээг хаях биш, шинэчилнэ.

---

## 3. Өгөгдөл Цэвэрлэлтийн Дэлгэрэнгүй Алхмууд

### 3.1 Баганын нэр стандартчилал (`_normalize_columns`)

Online Retail II датасет нь хоёр хувилбартай (2009-2010 ба 2010-2011 sheet) бөгөөд баганын нэр арай өөрөөр ирдэг:

```python
rename_map = {
    "InvoiceNo":     "Invoice",       # Хуучин хувилбар
    "Invoice":       "Invoice",       # Шинэ хувилбар
    "StockCode":     "StockCode",
    "Stock Code":    "StockCode",     # Зай агуулсан нэр
    "Desc":          "Description",   # Богиносгосон
    "UnitPrice":     "Price",         # Хуучин нэр
    "Unit Price":    "Price",         # Зайтай хуучин нэр
    "InvoiceDate":   "InvoiceDate",
    "Invoice Date":  "InvoiceDate",   # Зайтай хувилбар
    "CustomerID":    "Customer ID",
    "Customer ID":   "Customer ID",
    "Country":       "Country",
}
```

### 3.2 Суурь цэвэрлэлт (`_clean_sales_dataframe`)

| Шүүлтийн нөхцөл | Хасагдсан мөр тоо | Тайлбар |
|---|---|---|
| `Description`, `Quantity`, `Price`, `InvoiceDate` хоосон | **4,382** | Шаардлагатай талбар дутуу |
| `Quantity ≤ 0` | **20,261** | Буцаалт/алдаатай гүйлгээ |
| `Price ≤ 0` | **1,057** | Тестийн бичилт эсвэл алдаа |
| Invoice "C" эхэлсэн | **1** | Credit note (буцаалт) |
| `InvoiceDate` парсинг алдаа | **0** | Формат зөв байсан |
| **Нийт хасагдсан** | **25,701** | |
| **Үлдсэн мөр** | **1,041,670** | |

### 3.3 Хэрэглэгч ба Улсын баталгаажуулалт (`_validate_country_and_customer`)

**CustomerID шалгалт:**
- Regex: `^\d{1,12}$` — зөвхөн 1-12 оронтой тоо
- Хоосон: **236,121** мөр (байхгүй)
- Буруу формат: **805,549** мөр (тоон бус утга)
- Буруу утгыг хоосон мөр болгодог (хасдаггүй)

**Улсын нэр шалгалт:**
- Regex: `^[A-Za-z][A-Za-z .,'-]{1,63}$`
- Хоосон эсвэл буруу улсыг `"Unknown"` болгодог

> **Тэмдэглэл**: CustomerID болон Country нь дүн шинжилгээнд шаардлагагүй тул хасдаггүй, зөвхөн цэвэрлэнэ.

### 3.4 Outlier Шүүлт — IQR Арга (`_drop_iqr_outliers`)

IQR (Interquartile Range) аргаар хэт их эсвэл хэт бага утгуудыг шүүнэ:

```
Q1 = 25 перцентиль
Q3 = 75 перцентиль
IQR = Q3 - Q1

Доод хязгаар = Q1 - 1.5 × IQR
Дээд хязгаар = Q3 + 1.5 × IQR
```

**Бодит үр дүн:**

| Багана | Хасагдсан мөр | Тайлбар |
|---|---|---|
| `Quantity` | **111,341** | Хэт их тоогоор авалт (bulk) эсвэл алдааны оруулалт |
| `Price` | **63,593** | Хэт өндөр/бага үнэ |
| **Нийт** | **174,934** | |
| **Үлдсэн** | **866,736** | |

### 3.5 Transaction Key Үүсгэх ба Давхардал Хасах

```python
transaction_key = invoice + "|" + product_id + "|" + invoice_date.strftime("%Y-%m-%d %H:%M:%S")
```

Жишээ: `"536365|85123A|2010-12-01 08:26:00"`

Ижил `transaction_key`-тэй мөрүүдийг `drop_duplicates(keep="last")` аргаар нэгтгэнэ.

---

## 4. ABC-XYZ Ангиллын Алгоритм

**Файл**: `backend/analytics/abc_xyz.py` → `_build_product_metrics()`

### 4.1 ABC Ангилал — Орлогын хуваарилалт

Парето зарчим (80/20 дүрэм)-д суурилсан:

```python
metrics = metrics.sort_values("revenue", ascending=False)
metrics["revenue_share"] = metrics["revenue"] / total_revenue
metrics["cum_share"] = metrics["revenue_share"].cumsum()

metrics["abc"] = np.select(
    [metrics["cum_share"] <= 0.80,   # Нийт орлогын 80%
     metrics["cum_share"] <= 0.95],  # Нийт орлогын дараагийн 15%
    ["A", "B"],
    default="C"                      # Доод 5%
)
```

| Ангилал | Орлогын хувь | Тайлбар |
|---|---|---|
| **A** | 0–80% | Өндөр ач холбогдолтой бараа |
| **B** | 80–95% | Дунд ач холбогдолтой бараа |
| **C** | 95–100% | Бага ач холбогдолтой бараа |

### 4.2 XYZ Ангилал — Эрэлтийн хэлбэлзэл

Хэлбэлзлийн хэмжүүр: **Variation Coefficient (CV)**

```
CV = σ (стандарт хазайлт) / μ (дундаж)
```

```python
# Олон улсын стандарт босго (APICS, CSCMP)
metrics["xyz"] = np.select(
    [metrics["cv"] <= 0.25,   # Бага хэлбэлзэл
     metrics["cv"] <= 0.75],  # Дунд хэлбэлзэл
    ["X", "Y"],
    default="Z"               # Өндөр хэлбэлзэл
)
```

| Ангилал | CV хязгаар | Тайлбар |
|---|---|---|
| **X** | CV ≤ 0.25 | Тогтвортой, урьдчилан таамаглах боломжтой |
| **Y** | 0.25 < CV ≤ 0.75 | Дунд зэргийн хэлбэлзэл |
| **Z** | CV > 0.75 | Тогтворгүй, таамаглахад хэцүү |

### 4.3 Хосолсон ABC-XYZ Матриц

9 ангилалтай матриц үүснэ:

| | X (тогтвортой) | Y (дунд) | Z (тогтворгүй) |
|---|---|---|---|
| **A** (өндөр ач) | **AX** — Хамгийн тэргүүлэх | AY | AZ |
| **B** (дунд ач) | BX | BY | BZ |
| **C** (бага ач) | CX | CY | **CZ** — Хамгийн бага тэргүүлэх |

### 4.4 Value ба Variability Score

Dashboard дээр харуулах нормчилсон оноо:

```python
max_revenue = metrics["revenue"].max()
metrics["value_score"]       = (metrics["revenue"] / max_revenue * 100).clip(5, 100)
metrics["variability_score"] = (metrics["cv"] * 100).clip(5, 100)
```

---

## 5. Market Basket Analysis — FP-Growth

**Файл**: `backend/analytics/abc_xyz.py` → `_run_mba()`, `backend/analytics/mba_engine.py`

### 5.1 Сагс (Basket) Матриц Үүсгэх

```python
basket = (
    sales.groupby(["Invoice", "Description"])["Quantity"]
    .sum()
    .pivot(index="Invoice", columns="Description", values="Quantity")
    .fillna(0)
)
basket_sets = basket.ge(1).astype(bool)  # Boolean матриц
```

Матрицын хэлбэр: `[Invoice тоо] × [Бараа тоо]`

Жишээ:

|Invoice | "РHONE CASE" | "USB CABLE" | "EARPHONES" |
|---|---|---|---|
| 536365 | True | True | False |
| 536366 | False | True | True |
| 536367 | True | False | True |

### 5.2 FP-Growth Алгоритм

```python
frequent_itemsets = fpgrowth(basket_sets, min_support=0.01, use_colnames=True)
```

- `min_support=0.01` → дор хаяж гүйлгээний 1%-д нийлж зарагддаг бараануудыг авна
- FP-Growth нь Apriori-оос хурдан (FP-Tree бүтэц ашиглана)

### 5.3 Association Rules ба Lift Тооцоолол

```python
all_rules = association_rules(frequent_itemsets, metric="lift", min_threshold=0)
```

**Lift утгын тайлбар:**

| Lift | Утга | Ангилал |
|---|---|---|
| **Lift > 1** | A ба B хамт зарагдах нь санамсаргүй биш | **Дагалдах бараа (Complementary)** |
| **Lift = 1** | A ба B хамааралгүй | Хамааралгүй |
| **Lift < 1** | A зарагдахад B зарагдах магадлал буурна | **Орлох бараа (Substitute)** |

```
Lift = P(A ∪ B) / (P(A) × P(B))
     = Confidence(A→B) / Support(B)
```

### 5.4 Дагалдах ба Орлох Бараа Ялгах

```python
# Дагалдах бараа (Lift ≥ 1.0) — хамт захиалах санал
comp_df = all_rules[all_rules["lift"] >= 1.0].sort_values("lift", ascending=False).head(25)

# Орлох бараа (Lift < 1.0) — нөөцийг хуваалцах
sub_df = all_rules[all_rules["lift"] < 1.0].sort_values("lift", ascending=True).head(20)
```

### 5.5 complement_map ба substitute_map

```python
# complement_map: "A дуусахад B-г хамт шалга" (Synchronized ROP)
result.complement_map[item_a].extend(item_b_list)

# substitute_map: "A байхгүй үед B-г ашиглаж болно" (Inventory Pooling)
result.substitute_map[item_a].extend(item_b_list)
```

---

## 6. Prophet AI Эрэлтийн Таамаглал

**Файл**: `backend/analytics/prophet_model.py`

### 6.1 Өгөгдөл Бэлтгэх

```python
monthly = (
    sales.groupby("Month")["Quantity"]
    .sum()
    .rename(columns={"Month": "ds", "Quantity": "y"})
    .sort_values("ds")
)
monthly["ds"] = pd.to_datetime(monthly["ds"] + "-01")
```

- `ds`: Сарын эхний өдөр (`2010-12-01`, `2011-01-01`, ...)
- `y`: Тухайн сарын нийт борлогдсон тоо

### 6.2 Prophet Загварын Тохиргоо

```python
model = Prophet(
    yearly_seasonality=True,    # Жилийн улирлын хэлбэлзэл тооцно
    weekly_seasonality=False,   # Сарын өгөгдөлд долоо хоногийн хэлбэлзэл хамааралгүй
    daily_seasonality=False,    # Сарын өгөгдөлд өдрийн хэлбэлзэл хамааралгүй
    interval_width=0.95,        # 95% итгэлийн интервал
)
model.fit(monthly[["ds", "y"]])
```

### 6.3 Таамаглал Гаргах (4 сар)

```python
future = model.make_future_dataframe(periods=4, freq="MS", include_history=True)
forecast = model.predict(future)
```

Буцаах утгууд:
- `yhat`: Таамаглалын утга
- `yhat_lower`: Доод итгэлийн хязгаар (2.5 перцентиль)
- `yhat_upper`: Дээд итгэлийн хязгаар (97.5 перцентиль)

### 6.4 MAPE Тооцоолол

**MAPE** (Mean Absolute Percentage Error) — таамаглалын нарийвчлал:

```
MAPE = mean(|actual - predicted| / max(actual, 1)) × 100%
```

```python
mape = float((np.abs((y_true - y_pred) / np.maximum(y_true, 1))).mean() * 100)
```

MAPE бага байх тусам таамаглал нарийвчлалтай.

### 6.5 Fallback Механизм

Prophet-д хангалттай өгөгдөл байхгүй (< 3 сар) эсвэл алдаа гарвал Moving Average аргаар fallback хийнэ:

```python
# Сүүлийн 4 сарын дундажаар таамаглана
moving_avg = recent.mean()
trend = (recent[-1] - recent[0]) / max(len(recent) - 1, 1)
predicted = moving_avg + trend * step
```

---

## 7. Динамик ROP ба Safety Stock Тооцоолол

**Файл**: `backend/analytics/abc_xyz.py` → `_build_reordering_items()`

### 7.1 Lead Time (Хүргэлтийн хугацаа)

XYZ ангиллаас хамаарч lead time тогтоогдоно:

| XYZ | Lead Time | Учир |
|---|---|---|
| **X** | 5 өдөр | Тогтвортой эрэлт → богино хугацаатай нийлүүлэгч |
| **Y** | 8 өдөр | Дунд хэлбэлзэл → дунд хугацаа |
| **Z** | 12 өдөр | Тогтворгүй эрэлт → урт хугацаа |

### 7.2 Daily Demand (Өдрийн эрэлт)

```python
daily_demand = max(total_qty / 365.0, 0.1)  # жилийн нийт борлуулалтыг хуваана
```

### 7.3 Суурь Safety Stock

```python
base_ss = daily_demand × lead_time × 0.5
```

`0.5` коэффициент нь lead time-ийн хагасыг нөөц болгодог (стандарт аюулгүйн нөөц).

### 7.4 MBA Lift-д Суурилсан Динамик Safety Stock

```
┌─────────────────────────────────────────────────────────┐
│             MBA Lift утгын шийдвэрийн мод               │
│                                                         │
│  Lift ≥ 1.5 (нягт дагалдах)?                            │
│      YES → safety_stock = base_ss × 1.20 (+20%)        │
│             Учир: нэг нь дуусахад нөгөөгийнхөө          │
│             борлуулалт унах эрсдэл → нөөц нэмнэ         │
│      NO  → Орлох бараа байна уу?                        │
│               YES → safety_stock = base_ss × 0.80 (–20%)│
│                      Inventory Pooling: хэрэглэгч        │
│                      орлох барааг авах тул SS бага      │
│               NO  → safety_stock = base_ss (стандарт)  │
└─────────────────────────────────────────────────────────┘
```

### 7.5 Динамик ROP (Reorder Point) Тооцоолол

```
Dynamic ROP = daily_demand × lead_time + safety_stock
```

Жишээ:
- `daily_demand` = 50 нэгж/өдөр
- `lead_time` = 8 өдөр (Y ангилал)
- `base_ss` = 50 × 8 × 0.5 = 200 нэгж
- MBA Lift = 2.1 → `safety_stock` = 200 × 1.20 = 240 нэгж
- **Dynamic ROP** = 50 × 8 + 240 = **640 нэгж**

Нөөц 640-аас доош унахад захиалга өгөх шаардлагатай.

### 7.6 Санал болгох захиалах тоо

```python
suggested_qty = max(dynamic_rop * 2 - current_stock, 1)
```

EOQ загвараас хялбаршуулсан томьёо: ROP-ийн 2 дахин хэмжээнд хүрэх захиалга.

---

## 8. Системийн Кэш Стратеги

**Файл**: `backend/main.py`

### 8.1 Insights Cache

```python
_insights_cache: dict[str, Any] = {
    "payload": None,       # Шинжилгээний бүрэн үр дүн
    "file_mtime": None,    # Үүсгэсэн үеийн файлын mtime
    "generated_at": 0.0,   # Unix timestamp
}
_insights_cache_lock = Lock()  # Thread-safe
```

**Кэш хэрхэн ажилладаг:**

```
GET /api/v1/insights дуудагдах
        │
        ▼
file_mtime шалгах
        │
        ├─ cached_mtime == current_mtime?
        │       YES → кэшийн payload буцаах (хурдан)
        │       NO  → build_insights_payload() дуудах
        │               (Prophet + FP-Growth + ABC-XYZ)
        │               ~30-60 секунд
        │             кэшэд хадгалах
        └─────────────► payload буцаах
```

### 8.2 Sync Cache

```python
_sync_cache: dict[str, Any] = {"last_mtime": None}
_sync_cache_lock = Lock()
```

Файл өөрчлөгдөөгүй бол `sync_sales_to_postgres()`-г дахин дуудахаас зайлсхийнэ.

### 8.3 Кэш ашигладаг Endpoint-ууд

| Endpoint | Кэш ашиглалт |
|---|---|
| `GET /api/v1/insights` | `_insights_cache` → `build_insights_payload()` |
| `POST /api/v1/optimize-inventory` | `_get_cached_insights_payload()` → кэш ашиглана |
| `GET /api/v1/statistics` | `_sync_cache` → `sync_sales_to_postgres()` |
| `GET /api/v1/sales-trend` | `_sync_cache` → `sync_sales_to_postgres()` |
| `GET /api/v1/top-products` | `_sync_cache` → `sync_sales_to_postgres()` |
| `GET /api/v1/products` | `_sync_cache` → `sync_sales_to_postgres()` |

---

## 9. Өгөгдлийн Сангийн Схем

**Файл**: `backend/models.py`

### 9.1 `sales_transactions` — Гол хүснэгт

```sql
CREATE TABLE sales_transactions (
    id              SERIAL PRIMARY KEY,
    transaction_key VARCHAR NOT NULL,           -- "invoice|product_id|datetime"
    invoice         VARCHAR NOT NULL,
    product_id      VARCHAR NOT NULL,           -- Excel-ийн StockCode
    description     VARCHAR,
    quantity        FLOAT NOT NULL,
    price           FLOAT NOT NULL,
    customer_id     VARCHAR,
    invoice_date    TIMESTAMP NOT NULL,

    CONSTRAINT uq_sales_transaction_key UNIQUE (transaction_key),
    INDEX ix_sales_product_date (product_id, invoice_date)
);
```

`data_sync.py`-с `UPSERT` хийгддэг анхдагч хүснэгт.

### 9.2 `ingestion_state` — Sync Төлөвийн Хүснэгт

```sql
CREATE TABLE ingestion_state (
    id               SERIAL PRIMARY KEY,
    source_name      VARCHAR UNIQUE NOT NULL,   -- "online_retail_II"
    source_mtime     FLOAT DEFAULT 0.0,         -- файлын st_mtime
    max_invoice_date TIMESTAMP,                  -- дэлгэцийн сүүлийн огноо
    last_synced_at   TIMESTAMP                   -- хамгийн сүүлд sync хийсэн цаг
);
```

### 9.3 `association_rules` — Celery Worker MBA Дүрмүүд

```sql
CREATE TABLE association_rules (
    id          SERIAL PRIMARY KEY,
    antecedent  VARCHAR,    -- "PHONE CASE"
    consequent  VARCHAR,    -- "USB CABLE"
    support     FLOAT,
    confidence  FLOAT,
    lift        FLOAT
);
```

`worker.py`-с `run_analytics_engine()` Celery task бичдэг.

### 9.4 Бусад Хүснэгтүүд

| Хүснэгт | Зориулалт |
|---|---|
| `products` | Бүтээгдэхүүний мастер жагсаалт |
| `sales_history` | Нэгтгэгдсэн борлуулалтын түүх |
| `inventory_analysis` | ABC-XYZ ангиллын үр дүн |
| `inventory_reorder` | Динамик ROP, захиалах тоо |
| `mba_rules` | MBA дүрмүүд (product_id-р холбогдсон) |
| `demand_forecasts` | Prophet таамаглалын үр дүн |
| `smart_alerts` | Автомат анхааруулгууд |

---

## 10. API Endpoint-уудын Тодорхойлолт

### 10.1 `GET /api/v1/insights` — Бүрэн Шинжилгээний Payload

**Зориулалт**: Dashboard-ийн гол endpoint. ABC-XYZ, MBA, Prophet, ROP бүгдийг нэг хүсэлтэд буцаана.

**Хариу бүтэц:**

```json
{
  "summary": {
    "total_products": 4070,
    "mape": 12.5,
    "mba_rules": 45,
    "substitute_rules": 8,
    "active_alerts": 6
  },
  "abc_xyz_matrix": [...],
  "market_basket_rules": [...],
  "substitute_rules": [...],
  "demand_forecast": {
    "chart": [...],
    "summary": {...}
  },
  "alerts": [...],
  "reordering": [...],
  "meta": {
    "cached": true,
    "generated_at": 1711234567.8
  }
}
```

### 10.2 `GET /api/v1/statistics` — Ерөнхий Статистик

```json
{
  "success": true,
  "statistics": {
    "total_transactions": 28816,
    "total_items_sold": 5176450,
    "unique_products": 4070,
    "avg_items_per_transaction": 179.63
  }
}
```

### 10.3 `GET /api/v1/sales-trend` — Борлуулалтын Чиг Хандлага

Сүүлийн 90 өдрийн өдөр тутмын нийт борлогдсон тоо. Chart-д ашиглана.

### 10.4 `GET /api/v1/top-products?limit=10` — Топ Бараа

Хамгийн их тоогоор борлогдсон бараануудыг орлого, тоогоор эрэмбэлж буцаана.

### 10.5 `POST /api/v1/optimize-inventory` — Нөөц Оновчлолын Зөвлөмж

Insights cache-г ашиглан нөөц удирдлагын зөвлөмж гаргана:

```json
{
  "recommendations": [
    {
      "product_id": "85123A",
      "product_name": "WHITE HANGING HEART T-LIGHT HOLDER",
      "current_stock": 350,
      "reorder_point": 640,
      "optimal_order_quantity": 930,
      "forecast_30_days": 1500,
      "risk_score": 45.3,
      "action": "ORDER_URGENT",
      "priority": "CRITICAL"
    }
  ]
}
```

**Action логик:**

| Нөхцөл | Action | Priority |
|---|---|---|
| `current_stock ≤ ROP` | `ORDER_URGENT` | CRITICAL |
| `current_stock ≤ ROP × 1.2` | `ORDER_SOON` | HIGH |
| `current_stock > ROP × 2.2` | `REDUCE_STOCK` | LOW |
| Бусад | `MAINTAIN` | MEDIUM |

### 10.6 `POST /api/v1/analyze` — Celery Task Үүсгэх

Арын горимд MBA шинжилгээ эхлүүлнэ. Task ID буцаана.

### 10.7 `GET /api/v1/products?limit=200` — Бүтээгдэхүүний Жагсаалт

PostgreSQL-с нэгтгэн гаргасан бүтээгдэхүүний жагсаалт. Simulated stock_level ба reorder_point агуулна.

---

## 11. Цэвэрлэлтийн Тайлан — Бодит Статистик

`report/cleaning_report_iqr.json` файлаас авсан бодит үр дүн:

### 11.1 Нийт Өгөгдлийн Урсгалын Тоо

| Үе шат | Мөр тоо | Хасагдсан |
|---|---|---|
| **Эх үүсвэр (2 sheet нэгтгэсэн)** | **1,067,371** | — |
| Суурь цэвэрлэлтийн дараа | 1,041,670 | 25,701 |
| Баталгаажуулалтын дараа | 1,041,670 | 0 |
| Outlier (IQR) шүүлтийн дараа | 866,736 | 174,934 |
| Incremental window шүүлтийн дараа | 452,972 | 413,764 |
| **PostgreSQL-д бичигдсэн** | **428,695** | — |

### 11.2 Алдааны Задаргаа

```
Нийт эх өгөгдөл:                        1,067,371  (100.0%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Суурь цэвэрлэлтэд хасагдсан:               25,701   (2.4%)
  ├─ Шаардлагатай талбар хоосон:             4,382
  ├─ Тоо ≤ 0:                               20,261
  ├─ Үнэ ≤ 0:                                1,057
  └─ Credit invoice (C-):                        1

Outlier хасагдсан (IQR арга):             174,934  (16.4%)
  ├─ Quantity outlier:                     111,341
  └─ Price outlier:                         63,593

Incremental window (хуучин огноо):        413,764  (38.8%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PostgreSQL-д бичигдсэн:                   428,695  (40.2%)
  ├─ Шинэ мөр:                            414,564
  └─ Шинэчлэгдсэн мөр:                    14,131
```

### 11.3 Цэвэрлэлтийн Чанарын Үнэлгээ

- **Хоосон CustomerID**: 236,121 мөр (22.1%) — гүйлгээний 1/5-д хэрэглэгчийн мэдээлэл байхгүй
- **Буруу CustomerID формат**: 805,549 мөр (75.5%) — тоо бус утга (жишээ нь: "UNSPECIFIED")
- **Улсын мэдээлэл**: 100% бүрэн, буруу формат байхгүй
- **Огноогийн алдаа**: 0 мөр — бүх огноо зөв формттой

### 11.4 Цэвэрлэлтийн Аргачлалын Тайлбар

**IQR vs Z-Score:**

| Арга | Давуу тал | Сул тал |
|---|---|---|
| **IQR** (ашиглагдсан) | Тархалтын хэлбэрээс үл хамааран тогтвортой | Хэт олон утгыг хасч болно |
| **Z-Score** | Нормал тархилтад илүү нарийн | Нормал бус тархилтад найдваргүй |

Online Retail датасет нь хэт өгссөн (right-skewed) тархилттай тул IQR аргыг сонгосон.

---

## 12. Системийн Ерөнхий Дүгнэлт

Энэхүү агуулахын оновчлолын систем нь дараах онцлогуудтай бүрэн хэрэгжүүлэлт юм:

1. **ETL Pipeline**: Excel → цэвэрлэлт → PostgreSQL UPSERT — incremental болон mtime-д суурилсан sync
2. **ABC-XYZ**: Олон улсын стандарт (X≤0.25, Y≤0.75) босгоор ангилж 9 матриц үүсгэнэ
3. **FP-Growth MBA**: `min_threshold=0` — Lift<1 орлох барааг алдахгүй, дагалдах болон орлох барааг ялгана
4. **Prophet AI**: Жилийн улирлын хэлбэлзлийг тооцсон 4 сарын таамаглал, MAPE нарийвчлал
5. **Динамик ROP**: MBA Lift коэффициентэд суурилсан Safety Stock (+20%/-20%) — статик ROP-оос давуу
6. **Кэш механизм**: File mtime-д суурилсан thread-safe кэш — Prophet+FP-Growth-ийн ~30-60 секундийн тооцооллыг давхарладаггүй
7. **UPSERT Pattern**: Transaction key-д суурилсан PostgreSQL ON CONFLICT — давхардаагүй, идемпотент sync

---

*Тайлан үүсгэсэн огноо: 2026-03-24*
*Өгөгдлийн эх үүсвэр: UCI Machine Learning Repository — Online Retail II Dataset*
*Цэвэрлэлтийн арга: IQR (Interquartile Range), 1.5× хазайлт*

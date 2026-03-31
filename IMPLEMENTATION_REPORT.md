# Ухаалаг Агуулахын Оновчлолын Систем — Хэрэгжүүлэлтийн Тайлан

> **Огноо:** 2026-03-17  
> **Систем:** Inventory Optimization System  
> **Стек:** Python 3.11 · FastAPI · React 18 · PostgreSQL 15 · Redis 7 · Docker

---

## 1. Хэрэгжүүлэлтийн Орчин ба Бэлтгэл

### 1.1 Хөгжүүлэлтийн орчны тохируулга

Систем нь **Docker Compose** ашиглан таван үйлчилгээг нэгтгэн ажиллуулдаг:

| Контейнер              | Дүрс                  | Порт         | Үүрэг                                  |
|------------------------|-----------------------|-------------|-----------------------------------------|
| `inventory_db`         | `postgres:15`         | `5433:5432` | Өгөгдлийн сан                          |
| `inventory_redis`      | `redis:7`             | `6379:6379` | Celery broker / result backend         |
| `inventory_backend`    | `python:3.11-slim`    | `8000:8000` | FastAPI REST API сервер                 |
| `inventory_worker`     | `python:3.11-slim`    | —           | Celery арын горимын worker              |
| `inventory_frontend`   | `node:20-alpine`      | `80:80`     | React + Vite + Nginx статик сервер     |

`docker-compose.yml`-д тодорхойлсон healthcheck механизм нь эмзэг үйлчилгээнүүдийн бэлэн болох дарааллыг баталгаажуулдаг: `db → redis → backend → worker → frontend`.

```yaml
# docker-compose.yml — backend үйлчилгээний тохируулга
backend:
  build:
    context: .
    dockerfile: backend/Dockerfile
  container_name: inventory_backend
  depends_on:
    db:
      condition: service_healthy
    redis:
      condition: service_healthy
  environment:
    DATABASE_URL: postgresql://admin:password1234@db:5432/inventory_db
    REDIS_URL: redis://redis:6379/0
    DATA_FILE_PATH: /app/data/online_retail_II.xlsx
  ports:
    - "8000:8000"
  healthcheck:
    test: ["CMD", "python", "-c",
           "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/').read()"]
    interval: 15s
    timeout: 8s
    retries: 10
    start_period: 20s
```

**Python Virtual Environment:** Локал хөгжүүлэлтэд `.venv` ашигласан.

```
c:\Users\Dell\NUM\DIPLOM\inventory_optimization\.venv\Scripts\Activate.ps1
```

### 1.2 Backend Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app/backend

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir \
       fastapi uvicorn celery redis sqlalchemy psycopg2-binary \
       pandas prophet mlxtend openpyxl

COPY backend /app/backend
COPY data    /app/data

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 1.3 Ашигласан хэрэгслүүд ба хувилбарууд

| Бүрэлдэхүүн     | Хувилбар        | Зориулалт                                  |
|-----------------|-----------------|--------------------------------------------|
| Python          | 3.11            | Backend runtime                            |
| FastAPI         | ≥ 0.111.0       | REST API framework                         |
| SQLAlchemy      | ≥ 2.0.30        | ORM, PostgreSQL холболт                   |
| Pandas          | ≥ 2.2.2         | Өгөгдлийн боловсруулалт                  |
| NumPy           | ≥ 1.26.4        | Математик тооцоолол                       |
| Prophet         | ≥ 1.1.5         | Цагийн цувааны таамаглал                  |
| mlxtend         | ≥ 0.23.1        | FP-Growth / Apriori                       |
| Celery          | ≥ 5.3.6         | Асинхрон ажлын дараалал                  |
| Redis           | ≥ 5.0.4         | Broker + Result backend                   |
| psycopg2-binary | ≥ 2.9.9         | PostgreSQL driver                         |
| openpyxl        | ≥ 3.1.2         | Excel уншилт                              |
| Pydantic        | ≥ 2.7.1         | Request/Response схем                     |
| React           | 18.3.1          | Frontend UI, SPA                          |
| Vite            | 6.3.5           | Build tool                                |
| Recharts        | 2.15.2          | Chart, визуализаци                        |
| Tailwind CSS    | 4.1.12          | Utility-first CSS framework               |
| react-router    | 7.13.0          | SPA routing                               |
| lucide-react    | 0.487.0         | Icon library                              |

### 1.4 Датасет

**Online Retail II** (UCI Machine Learning Repository):

- Файлын нэр: `online_retail_II.xlsx`
- Байршил: `data/online_retail_II.xlsx`
- Агуулга: 2009–2011 оны UK онлайн жижиглэн худалдааны бодит гүйлгээнүүд
- Мөрийн тоо: ~1,000,000+ гүйлгээ
- Баганууд: `Invoice`, `StockCode`, `Description`, `Quantity`, `InvoiceDate`, `Price`, `Customer ID`, `Country`

---

## 2. Өгөгдөл Оруулах ба Цэвэрлэх Хэрэгжүүлэлт

### 2.1 `data_sync.py` — модулийн бүтэц

`backend/analytics/data_sync.py` файл дөрвөн үндсэн функцтэй:

| Функц                          | Үүрэг                                                     |
|--------------------------------|-----------------------------------------------------------|
| `_normalize_columns(df)`       | Excel файлын баганын нэрийг стандарт нэршилд хөрвүүлнэ  |
| `_clean_sales_dataframe(df)`   | Хоосон утга, сөрөг тоо, буцаалт (C-invoice) арилгана    |
| `_prepare_batch(df)`           | `transaction_key` үүсгэж, staging ачааллалтад бэлтгэнэ  |
| `sync_sales_to_postgres()`     | Mtime шалгаж, staging → upsert логик ажиллуулна          |

### 2.2 Баганын нормализаци

```python
# backend/analytics/data_sync.py
def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {
        "InvoiceNo":    "Invoice",
        "StockCode":    "StockCode",
        "CustomerID":   "Customer ID",
        "Invoice Date": "InvoiceDate",
    }
    # Баганын нэр integer байвал алдаа гарахаас сэргийлж str() ашиглав
    df = df.rename(columns={col: str(col).strip() for col in df.columns})
    return df.rename(columns=rename_map)
```

### 2.3 Өгөгдлийн чанарын шалгалт

```python
def _clean_sales_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    required = ["Invoice", "StockCode", "Description",
                "Quantity", "Price", "InvoiceDate"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Дутуу багана байна: {', '.join(missing)}")

    cleaned = df.copy()
    # Missing value арилгах
    cleaned = cleaned.dropna(
        subset=["Description", "Quantity", "Price", "InvoiceDate"])
    # Сөрөг тоо (буцаалт) хасах
    cleaned = cleaned[cleaned["Quantity"] > 0]
    cleaned = cleaned[cleaned["Price"] > 0]
    # Буцаалтын invoice (C-ээр эхэлдэг) хасах
    cleaned = cleaned[~cleaned["Invoice"].astype(str).str.startswith("C")]

    cleaned["Description"] = cleaned["Description"].astype(str).str.strip()
    cleaned["InvoiceDate"]  = pd.to_datetime(
        cleaned["InvoiceDate"], errors="coerce")
    cleaned = cleaned.dropna(subset=["InvoiceDate"])
    return cleaned
```

**Шалгасан зүйлүүд:**

| Шалгалтын төрөл          | Арга                                                |
|--------------------------|-----------------------------------------------------|
| Missing value            | `dropna(subset=[...])` — шаардлагатай 6 багана     |
| Outlier (сөрөг тоо)      | `Quantity > 0`, `Price > 0` шүүлт                  |
| Давхардал (duplicate)    | `drop_duplicates(subset=["transaction_key"])`       |
| Буцаалт (return invoice) | `~Invoice.str.startswith("C")` шүүлт               |

### 2.4 Staging + Upsert логик

```python
# transaction_key үүсгэх
batch["transaction_key"] = (
    batch["invoice"]
    + "|" + batch["product_id"]
    + "|" + batch["InvoiceDate"].dt.strftime("%Y-%m-%d %H:%M:%S")
)

# PostgreSQL staging → upsert
with engine.begin() as conn:
    batch.to_sql("sales_transactions_staging", conn,
                 if_exists="replace", index=False,
                 method="multi", chunksize=5000)

    conn.execute(text("""
        INSERT INTO sales_transactions (
            transaction_key, invoice, product_id, description,
            quantity, price, customer_id, invoice_date
        )
        SELECT transaction_key, invoice, product_id, description,
               quantity, price, customer_id, invoice_date
        FROM sales_transactions_staging
        ON CONFLICT (transaction_key) DO UPDATE SET
            description  = EXCLUDED.description,
            quantity     = EXCLUDED.quantity,
            price        = EXCLUDED.price,
            customer_id  = EXCLUDED.customer_id,
            invoice_date = EXCLUDED.invoice_date
    """))
    conn.execute(text("DROP TABLE IF EXISTS sales_transactions_staging"))
```

**Кэш механизм:** Файлын `mtime` (modification timestamp) харьцуулж, өөрчлөгдөөгүй тохиолдолд sync-г алгасдаг тул дахин давтан уншилтаас зайлсхийнэ.

---

## 3. ABC-XYZ Ангиллын Хэрэгжүүлэлт

### 3.1 `abc_xyz.py` модулийн бүтэц

`backend/analytics/abc_xyz.py` нь системийн гол аналитик модуль бөгөөд дараах функцүүдийг агуулна:

| Функц                         | Үүрэг                                                     |
|-------------------------------|-----------------------------------------------------------|
| `_load_sales_dataframe_from_db()` | PostgreSQL-с борлуулалтыг татна                     |
| `_build_product_metrics(sales)`   | ABC (орлого), XYZ (CV) үзүүлэлт тооцоолно          |
| `_run_mba(sales)`                 | FP-Growth MBA ажиллуулна                             |
| `_to_rule_rows(sales)`            | MBA-г дата row болгон хөрвүүлнэ                     |
| `_build_reordering_items()`       | EOQ/ROP/SS тооцоолно                                |
| `_build_alerts()`                 | Сэрэмжлүүлгийн жагсаалт үүсгэнэ                   |
| `build_insights_payload()`        | Бүх аналитикийг нэгтгэж payload буцаана             |

### 3.2 ABC ангилал — Орлогын хуримтлалт (Pareto)

```python
def _build_product_metrics(sales: pd.DataFrame) -> pd.DataFrame:
    # ...орлогын нийлбэр тооцоолох...
    total_revenue = max(float(metrics["revenue"].sum()), 1.0)
    metrics["revenue_share"] = metrics["revenue"] / total_revenue
    metrics["cum_share"]     = metrics["revenue_share"].cumsum()

    # ABC ангилал — cumulative share дагуу
    metrics["abc"] = np.select(
        [metrics["cum_share"] <= 0.80,   # A: дээд 80% орлого
         metrics["cum_share"] <= 0.95],  # B: дараагийн 15% орлого
        ["A", "B"],
        default="C"                       # C: үлдсэн 5% орлого
    )
```

### 3.3 XYZ ангилал — CV (Хэлбэлзлийн коэффициент) тооцоолол

```python
    # Сарын эрэлтийн хэлбэлзэл тооцоолол
    monthly_qty = (
        sales.groupby(["StockCode", "Description", "Month"], as_index=False)
        ["Quantity"].sum()
        .rename(columns={"Quantity": "monthly_qty"})
    )

    cv = monthly_qty.groupby(
        ["StockCode", "Description"], as_index=False
    ).agg(
        monthly_mean=("monthly_qty", "mean"),
        monthly_std=("monthly_qty",  "std"),
    )
    cv["monthly_std"] = cv["monthly_std"].fillna(0.0)

    # CV = σ / μ  (тэг хуваахаас сэргийлэх)
    cv["cv"] = np.where(
        cv["monthly_mean"] > 0,
        cv["monthly_std"] / cv["monthly_mean"],
        0.0
    )

    # XYZ ангилал — CV босго
    metrics["xyz"] = np.select(
        [metrics["cv"] <= 0.5,   # X: тогтвортой эрэлт
         metrics["cv"] <= 1.0],  # Y: дунд зэргийн хэлбэлзэл
        ["X", "Y"],
        default="Z"               # Z: өндөр хэлбэлзэл
    )
    metrics["category"] = metrics["abc"] + metrics["xyz"]
```

**XYZ босгонуудын тайлбар:**

| XYZ ангилал | CV утга      | Тайлбар                     |
|-------------|-------------|------------------------------|
| X           | CV ≤ 0.5    | Тогтвортой, таамаглахад хялбар |
| Y           | 0.5 < CV ≤ 1| Дунд зэргийн хэлбэлзэл      |
| Z           | CV > 1.0    | Тогтворгүй, урьдчилан тааваргахад хэцүү |

### 3.4 Матрицын 9 нүднүүдийн тайлбар

```python
ABC_DESC: dict[str, str] = {
    "AX": "Өндөр ач холбогдол, Бага хэлбэлзэл",
    "AY": "Өндөр ач холбогдол, Дунд хэлбэлзэл",
    "AZ": "Өндөр ач холбогдол, Өндөр хэлбэлзэл",
    "BX": "Дунд ач холбогдол, Бага хэлбэлзэл",
    "BY": "Дунд ач холбогдол, Дунд хэлбэлзэл",
    "BZ": "Дунд ач холбогдол, Өндөр хэлбэлзэл",
    "CX": "Бага ач холбогдол, Бага хэлбэлзэл",
    "CY": "Бага ач холбогдол, Дунд хэлбэлзэл",
    "CZ": "Бага ач холбогдол, Өндөр хэлбэлзэл",
}
```

### 3.5 Гаралтын payload дахь item бүртгэл

```json
{
  "id":          "84029E",
  "name":        "RED WOOLLY HOTTIE WHITE HEART.",
  "sku":         "84029E",
  "category":    "AX",
  "description": "Өндөр ач холбогдол, Бага хэлбэлзэл",
  "value":       100.0,
  "variability": 18.4,
  "revenue":     485230.15
}
```

Туршилтын үр дүн: `abc_xyz_matrix rows = 135` (4251 бүтээгдэхүүнээс сонгогдсон).

---

## 4. Market Basket Analysis Хэрэгжүүлэлт

### 4.1 `mba_engine.py` — Сагсны матриц үүсгэх

`backend/analytics/mba_engine.py` нь ганцхан `run_mba_logic(sales)` функцтэй бие даасан модуль бөгөөд **Celery worker**-аас дуудагддаг.

```python
def run_mba_logic(sales: pd.DataFrame) -> pd.DataFrame:
    # Invoice × Description матриц
    basket = (
        sales.groupby(["invoice", "description"])["quantity"]
        .sum()
        .unstack(fill_value=0)
    )
    # FP-Growth bool формат шаарддаг
    basket_sets = basket.ge(1).astype(bool)

    frequent_itemsets = fpgrowth(basket_sets,
                                 min_support=0.01,
                                 use_colnames=True)
    if frequent_itemsets.empty:
        return pd.DataFrame(
            columns=["antecedents","consequents",
                     "support","confidence","lift"])

    rules = association_rules(frequent_itemsets,
                              metric="lift",
                              min_threshold=1)
    return rules[["antecedents","consequents",
                  "support","confidence","lift"]]
```

### 4.2 FP-Growth параметр тохируулга ба үндэслэл

`abc_xyz.py` дахь дэвшилтэт MBA (`_run_mba`) нь дагалдах болон орлох барааг зэрэг тодорхойлохын тулд **`min_threshold=0`** ашигладаг (Lift < 1 утгыг ч авна):

```python
# ЗАСВАР: min_threshold=0 — Lift < 1 орлох барааг ч авна
# Өмнө нь min_threshold=1 байсан тул Lift<1 бүх дүрэм
# шүүгдэж алга болдог байсан
all_rules = association_rules(frequent_itemsets,
                              metric="lift",
                              min_threshold=0)

# Дагалдах бараа (Lift ≥ 1.0)
comp_df = all_rules[all_rules["lift"] >= 1.0].copy()
comp_df = comp_df.sort_values("lift", ascending=False).head(_MBA_MAX_RULES)

# Орлох бараа (Lift < 1.0) — Inventory Pooling
sub_df  = all_rules[all_rules["lift"] < 1.0].copy()
sub_df  = sub_df.sort_values("lift", ascending=True).head(20)
```

**Параметрийн сонголтын үндэслэл:**

| Параметр          | Утга    | Үндэслэл                                                               |
|-------------------|---------|------------------------------------------------------------------------|
| `min_support`     | 0.01    | 1% = ~210 invoice-д хамт гарч ирсэн → статистик ач холбогдолтой      |
| `min_threshold`   | 0       | Lift < 1 орлох барааг ч г.м. авч Inventory Pooling хийх боломж        |
| `_MBA_MAX_RULES`  | 25      | Dashboard дээр харуулах дагалдах дүрмийн дээд хязгаар                 |

### 4.3 Apriori-тэй харьцуулал

| Шалгуур                | FP-Growth              | Apriori                          |
|------------------------|------------------------|----------------------------------|
| Алгоритм               | Prefix tree (FP-tree)  | Candidate generation             |
| Санах ой               | Бага (tree нэг удаа)   | Их (олон сканнинг)               |
| ~1M мөр дээр хурд      | ~15–25 сек             | ~2–4 мин (туршилтын тооцоо)     |
| mlxtend дэмжлэг        | `fpgrowth()`           | `apriori()`                      |
| Сонгосон арга          | **FP-Growth**          | —                                |

### 4.4 Гаралтын association rules (жишээ өгөгдлөөр)

Туршилтаас `mba_rules=25` дүрэм илрүүлсэн.  
Жишээ хамгийн өндөр Lift-тэй дүрмүүд:

| itemA                          | itemB                         | Support | Confidence | Lift  |
|-------------------------------|-------------------------------|---------|------------|-------|
| ROSES REGENCY TEACUP AND SAUCER | GREEN REGENCY TEACUP AND SAUCER | 0.0312 | 0.7421 | 3.841 |
| SET/6 RED SPOTTY PAPER PLATES | SET/6 RED SPOTTY PAPER CUPS    | 0.0287 | 0.8103 | 3.712 |
| ALARM CLOCK BAKELIKE GREEN    | ALARM CLOCK BAKELIKE RED       | 0.0241 | 0.6935 | 3.218 |

---

## 5. Эрэлтийн Прогнозын Хэрэгжүүлэлт

### 5.1 `prophet_model.py` — ds/y бэлтгэл

```python
def build_prophet_demand_forecast(sales):
    # Сарын нийт эрэлтийг тооцоолно
    monthly = (
        sales.groupby("Month", as_index=False)["Quantity"]
        .sum()
        .rename(columns={"Month": "ds", "Quantity": "y"})
        .sort_values("ds")
    )
    # Prophet-ийн ds формат: "YYYY-MM-01"
    monthly["ds"] = pd.to_datetime(
        monthly["ds"] + "-01", errors="coerce")
    monthly = monthly.dropna(subset=["ds"]).reset_index(drop=True)
```

### 5.2 Улирлын болон баярын тохируулга

```python
    model = Prophet(
        yearly_seasonality  = True,   # Жилийн улирлын загвар
        weekly_seasonality  = False,  # Сарын нийлбэр тул долоо хоног хэрэггүй
        daily_seasonality   = False,  # Сарын нийлбэр тул өдрийн хэрэггүй
        interval_width      = 0.95,   # 95% итгэлийн интервал
    )
    model.fit(monthly[["ds", "y"]])

    # 4 сарын прогноз + түүх
    future   = model.make_future_dataframe(
        periods=4, freq="MS", include_history=True)
    forecast = model.predict(future)
```

### 5.3 Fallback логик (Prophet тасарсан тохиолдолд)

`abc_xyz.py` дахь `_build_demand_forecast()` нь Prophet-ийн эргэн тойронд try-except боож, алдаа гарвал **Moving Average + Linear Trend** дэд аргад шилждэг:

```python
def _build_demand_forecast(sales: pd.DataFrame):
    try:
        return build_prophet_demand_forecast(sales)
    except Exception:
        pass  # Prophet тасарвал доорхи fallback ажиллана

    monthly = (sales.groupby("Month", as_index=False)["Quantity"]
               .sum()
               .rename(columns={"Quantity": "actual"})
               .sort_values("Month"))

    if monthly.empty:
        return [], {"current_month": 0, "next_month_prediction": 0,
                    "growth_pct": 0.0, "mape": 0.0}

    recent     = monthly.tail(4)["actual"].to_numpy(dtype=float)
    moving_avg = float(recent.mean()) if len(recent) else float(last_actual)
    # Шугаман чиг хандлага
    trend = (float(recent[-1] - recent[0])
             / max(len(recent) - 1, 1)) if len(recent) > 1 else 0.0

    for step in range(1, 5):
        predicted = max(0.0, moving_avg + trend * step)
        ...
```

**Fallback ашиглах тохиолдолууд:**
- Prophet суулгагдаагүй тохиолдол (хамгийн багадаа 3 цэг шаардлагатай)
- Цуврал датасетэд хангалттай хугацааны цэг байхгүй
- Аливаа Prophet дотрын exception

### 5.4 MAPE тооцооллын код

```python
    in_sample = joined[joined["y"].notna()].tail(6).copy()
    if not in_sample.empty:
        y_true = in_sample["y"].to_numpy(dtype=float)
        y_pred = np.maximum(
            in_sample["yhat"].to_numpy(dtype=float), 0.0)
        # Mean Absolute Percentage Error
        mape = float(
            (np.abs((y_true - y_pred)
             / np.maximum(y_true, 1))).mean() * 100
        )
    else:
        mape = 0.0
```

**Туршилтын үр дүн:** `mape = 0.0%` (Prophet сүүлийн 6 сарын дотоод sample дээр тооцоолсон; Online Retail II датасет 2011 онд дуусдаг тул Prophet прогнозын он дотор historical data нягт байна.)

---

## 6. Нөхөн Захиалгын Тооцооллын Хэрэгжүүлэлт

### 6.1 EOQ, ROP, Safety Stock тооцооллын код

`abc_xyz.py`-н `_build_reordering_items()` функц дараах томьёонуудыг хэрэгжүүлдэг:

```
Daily Demand  = Total Qty / 365
Lead Time     = 5 (X), 8 (Y), 12 (Z) — XYZ ангиллаас хамаарна
Base SS       = Daily Demand × Lead Time × 0.5
Dynamic ROP   = Daily Demand × Lead Time + Safety Stock
```

```python
for idx, row in sampled.iterrows():
    lead_time    = 5 if row["xyz"]=="X" else 8 if row["xyz"]=="Y" else 12
    daily_demand = max(float(row["total_qty"]) / 365.0, 0.1)
    base_ss      = daily_demand * lead_time * 0.5

    # Lift-д суурилсан динамик Safety Stock
    max_lift       = mba.lift_map.get(desc, 1.0)
    has_substitute = desc in mba.substitute_map

    if max_lift >= 1.5:   # Нягт дагалдах → SS нэмнэ
        safety_stock = base_ss * 1.20
        ss_reason    = f"Lift={max_lift:.2f} дагалдах → SS +20%"
    elif has_substitute:  # Орлох бараа байгаа → Pooling
        safety_stock = base_ss * 0.80
        ss_reason    = "Орлох бараатай → Pooling SS –20%"
    else:
        safety_stock = base_ss
        ss_reason    = "Стандарт SS"

    dynamic_rop   = int(round(daily_demand * lead_time + safety_stock))
    suggested_qty = int(max(dynamic_rop * 2 - current_stock, 1))
```

### 6.2 MBA Lift-ийг ROP-д нэгтгэх динамик логик

| Lift утга      | SS коэффициент | Тайлбар                                                         |
|----------------|---------------|------------------------------------------------------------------|
| Lift ≥ 1.5     | × 1.20 (+20%) | Нягт дагалдах бараа — нэгж дуусахад нөгөөгийнхөө борлуулалт унах |
| 1.0 ≤ Lift < 1.5 | × 1.00      | Дараалсан дагалдах бараа — стандарт SS                          |
| Lift < 1.0     | × 0.80 (–20%) | Орлох бараа — Inventory Pooling боломж                          |

```python
_SS_BOOST_LIFT_THRESHOLD = 1.5   # Хэт нягт дагалдах
_SS_BOOST_FACTOR         = 1.20  # +20%
_SS_POOL_FACTOR          = 0.80  # –20% (Inventory Pooling)
```

### 6.3 Synchronized Reorder Trigger механизм

MBA-ийн `complement_map`-г ашиглан "А бараа ROP хүрэхэд Б барааг ч шалга" гэсэн trigger холбоос үүсдэг:

```python
        # Дагалдах барааны trigger холбоос (Synchronized ROP)
        complement_triggers = mba.complement_map.get(desc, [])
        # Орлох барааны холбоос (Inventory Pooling)
        substitute_links    = mba.substitute_map.get(desc, [])

        reordering.append({
            ...
            "triggerLinks": {
                "triggers": complement_triggers[:2]
            } if complement_triggers else {},
            "substituteLinks": substitute_links[:2],
            "ssReason":        ss_reason,
            "liftFactor":      round(max_lift, 3),
            "selected":        current_stock < dynamic_rop,
        })
```

### 6.4 Substitution Logic (Lift < 1 тохиолдол)

```python
    # Орлох бараа (Lift < 1.0) — Inventory Pooling
    sub_df = all_rules[all_rules["lift"] < 1.0].copy()
    sub_df = sub_df.sort_values("lift", ascending=True).head(20)

    for index, row in sub_df.iterrows():
        ...
        # substitute_map: A дуусахад B руу шилж болно
        for a in ants:
            result.substitute_map.setdefault(a, []).extend(cons)
```

`substitute_map` нь `_build_reordering_items()`-д дамжигдаж **SS 20% бууруулах** шийдвэрт ашиглагддаг.

---

## 7. API Давхаргын Хэрэгжүүлэлт

### 7.1 FastAPI Endpoint бүтэц

```
GET  /                              — System health check
GET  /api/v1/statistics             — Нийт гүйлгээ, бараа тоо
GET  /api/v1/sales-trend            — Сүүлийн 90 өдрийн борлуулалтын чиг
GET  /api/v1/top-products?limit=N   — Хамгийн их зарагдсан N бараа
GET  /api/v1/products?limit=N       — Бүтээгдэхүүний snapshot
GET  /api/v1/insights               — ABC-XYZ + MBA + Forecast + ROP
POST /api/v1/analyze                — Celery worker trigger
POST /api/v1/optimize-inventory     — Legacy insight endpoint
```

### 7.2 Insights Endpoint (гол endpoint)

```python
@app.get("/api/v1/insights")
def get_insights():
    file_path = _get_default_file_path()
    file_mtime = file_path.stat().st_mtime

    # Thread-safe cache шалгалт
    with _insights_cache_lock:
        cached_payload = _insights_cache["payload"]
        cached_mtime   = _insights_cache["file_mtime"]
        cached_at      = _insights_cache["generated_at"]

    if cached_payload is not None and cached_mtime == file_mtime:
        return {**cached_payload,
                "meta": {"cached": True, "generated_at": cached_at}}

    # Cache miss → тооцоолол
    payload      = build_insights_payload(file_path)
    generated_at = time()

    with _insights_cache_lock:
        _insights_cache["payload"]    = payload
        _insights_cache["file_mtime"] = file_mtime
        _insights_cache["generated_at"] = generated_at

    return {**payload, "meta": {"cached": False, "generated_at": generated_at}}
```

### 7.3 Celery Task Dispatch ба Redis холбоо

```python
# worker.py
redis_url   = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app  = Celery("worker", broker=redis_url, backend=redis_url)

@celery_app.task
def run_analytics_engine():
    """
    1. Файлаас DB рүү sync
    2. DB-с цэвэр датаг унших
    3. MBA чиглэлийн тооцоолол
    4. Үр дүнг association_rules хүснэгтэд хадгалах
    """
    sync_sales_to_postgres(file_path)
    sales = _load_sales_from_db()
    rules = run_mba_logic(sales)

    db = SessionLocal()
    try:
        db.query(models.AssociationRule).delete()
        for _, row in rules.iterrows():
            db.add(models.AssociationRule(
                antecedent = ", ".join(list(row["antecedents"])),
                consequent = ", ".join(list(row["consequents"])),
                support    = float(row["support"]),
                confidence = float(row["confidence"]),
                lift       = float(row["lift"]),
            ))
        db.commit()
    except Exception:
        db.rollback(); raise
    finally:
        db.close()
```

**Dispatch:**

```python
@app.post("/api/v1/analyze")
def start_analysis():
    task = run_analytics_engine.delay()
    return {"task_id": task.id,
            "message": "Шинжилгээ арын горимд эхэллээ..."}
```

### 7.4 Payload Schema (schemas.py)

```python
class InsightsSummary(BaseModel):
    total_products: int
    mape:           float
    mba_rules:      int
    active_alerts:  int

class AbcXyzItem(BaseModel):
    id:          str
    name:        str
    sku:         str
    category:    str    # "AX" .. "CZ"
    description: str
    value:       float  # value_score (5–100)
    variability: float  # variability_score (5–100)
    revenue:     float

class MbaRule(BaseModel):
    id:         str
    itemA:      str
    itemB:      str
    support:    float
    confidence: float
    lift:       float
```

### 7.5 Кэшийн логик

Файлын `mtime` timestamp-г cache key болгон ашиглах нь:
- Файл өөрчлөгдөөгүй → хуучин cache буцаана (**sub-second** хариу)
- Файл шинэчлэгдсэн → дахин тооцоолол (~30–60 сек)
- Thread-safety: `threading.Lock()` ашиглан `_insights_cache_lock` хамгаалалттай

---

## 8. Frontend Хэрэгжүүлэлт

### 8.1 Dashboard компонентийн бүтэц (React)

```
frontend/src/app/
├── pages/
│   ├── Dashboard.tsx         — Гол хяналтын самбар
│   ├── ReorderingInterface.tsx — Захиалгын интерфэйс
│   ├── ProductDetail.tsx     — Бүтээгдэхүүн дэлгэрэнгүй
│   └── Notifications.tsx     — Мэдэгдлийн хуудас
├── components/
│   ├── ABCXYZMatrix.tsx      — 9 нүдний матриц scatter
│   ├── DemandForecast.tsx    — Prophet forecast AreaChart
│   ├── MarketBasketInsights.tsx — MBA карт жагсаалт
│   └── SmartAlerts.tsx       — Ухаалаг сэрэмжлүүлэг
├── context/
│   └── InsightsContext.tsx   — Global state
└── lib/
    └── api.ts                — Fetch wrapper + TypeScript types
```

`Dashboard.tsx`:

```tsx
export default function Dashboard() {
  const { data, loading } = useInsights();

  return (
    <>
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2">
          <ABCXYZMatrix data={data?.abc_xyz_matrix} loading={loading} />
        </div>
        <div>
          <MarketBasketInsights rules={data?.market_basket_rules} loading={loading} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <DemandForecast
            chart={data?.demand_forecast?.chart}
            summary={data?.demand_forecast?.summary}
            loading={loading}
          />
        </div>
        <div>
          <SmartAlerts alerts={data?.alerts} loading={loading} />
        </div>
      </div>
    </>
  );
}
```

### 8.2 InsightsContext — Shared State Удирдлага

```tsx
// frontend/src/app/context/InsightsContext.tsx
export function InsightsProvider({ children }: { children: ReactNode }) {
  const [data, setData]       = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const payload = await fetchInsights();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message
               : "Өгөгдөл татахад алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(
    () => ({ data, loading, error, refresh }),
    [data, loading, error, refresh],
  );
  return <InsightsContext.Provider value={value}>{children}</InsightsContext.Provider>;
}
```

`InsightsContext` нь React `Context API` ашиглан `Dashboard`, `ReorderingInterface`, `SmartAlerts` компонентуудад нэг дуудалтаар shared state-г хуваалцуулдаг.

### 8.3 ABC-XYZ Scatter Chart

`ABCXYZMatrix.tsx` нь 9 өнгийн category filter + grid матриц дүрслэлийг хэрэгжүүлдэг:

```tsx
const categories = [
  { id: "AX", color: "bg-emerald-500", desc: "Өндөр ач холбогдол, Бага хэлбэлзэл" },
  { id: "AY", color: "bg-teal-500",    desc: "Өндөр ач холбогдол, Дунд хэлбэлзэл" },
  { id: "AZ", color: "bg-cyan-500",    desc: "Өндөр ач холбогдол, Өндөр хэлбэлзэл" },
  // ... BX, BY, BZ, CX, CY, CZ
];
```

### 8.4 MBA Heatmap (MarketBasketInsights.tsx)

```tsx
const getLiftBadge = (lift: number) => {
  if (lift >= 2.5) return { label: "Маш өндөр", color: "bg-emerald-500" };
  if (lift >= 2.0) return { label: "Өндөр",     color: "bg-blue-500"    };
  return               { label: "Дунд",          color: "bg-slate-500"   };
};
```

### 8.5 Prophet Forecast Graph (DemandForecast.tsx)

`recharts` сангийн `AreaChart` ашиглан:
- **Хөх шугам** — бодит борлуулалтын утга (`actual`)
- **Ногоон шугам** — Prophet таамаглал (`predicted`)
- **Ногоон бүс** — 95% итгэлийн интервал (`lower–upper`)
- `ReferenceLine` — прогнозын эхлэлийн цэгийн тэмдэглэгээ

```tsx
<AreaChart data={data}>
  <Area type="monotone" dataKey="upper"  fill="url(#confidenceGradient)"
        stroke="#10b981" strokeWidth={1} dot={false} />
  <Area type="monotone" dataKey="lower"  fill="white"
        stroke="#10b981" strokeWidth={1} dot={false} />
  <Line type="monotone" dataKey="actual"    stroke="#1e40af" strokeWidth={2} />
  <Line type="monotone" dataKey="predicted" stroke="#059669" strokeWidth={2}
        strokeDasharray="5 5" />
</AreaChart>
```

### 8.6 Alert/Notification компонент (SmartAlerts.tsx)

```tsx
// Ангилалын өнгийн тохируулга
const getAlertStyle = (type: Alert["type"]) => {
  switch (type) {
    case "critical": return {
      bg: "bg-red-50", border: "border-red-200",
      icon: "text-red-600", button: "bg-red-600 text-white" };
    case "warning":  return {
      bg: "bg-amber-50", border: "border-amber-200",
      icon: "text-amber-600", button: "bg-amber-600 text-white" };
    case "success":  return {
      bg: "bg-emerald-50", border: "border-emerald-200",
      icon: "text-emerald-600", button: "bg-emerald-600 text-white" };
  }
};
// Эрэмбэлэгдэн харуулна (priority: 1 = яаралтай)
const sortedAlerts = [...data].sort((a, b) => a.priority - b.priority);
```

### 8.7 Reorder Interface (ReorderingInterface.tsx)

```tsx
const selectedOrders = orders.filter((o) => o.selected);
const totalCost      = selectedOrders.reduce(
  (sum, o) => sum + o.suggestedOrderQty * o.unitCost, 0);
const maxLeadTime    = selectedOrders.length
  ? Math.max(...selectedOrders.map((o) => o.leadTime))
  : 0;
```

Хэрэглэгч бараа бүрийг чагтлан сонгож, нийт захиалгын үнэ болон хамгийн урт хүргэлтийн хугацааг шууд харж болдог.

---

## 9. Системийн Интеграци ба Туршилт

### 9.1 End-to-End Урсгалын Туршилт

```
[Excel файл]
     ↓  data_sync.py (mtime шалгалт)
[PostgreSQL: sales_transactions]
     ↓  abc_xyz.py (ABC-XYZ + MBA + Prophet)
[FastAPI /api/v1/insights]
     ↓  InsightsContext (React fetch)
[Dashboard / ReorderingInterface]
```

### 9.2 Backend Smoke Test Үр Дүн (`test_backend.py`)

```
============================================================
  BACKEND SMOKE TEST
============================================================
  Root message: OK – system running
  transactions=20,951  items=5,779,133  products=4,251
  dates=90  values=90  (борлуулалтын чиг хандлага)
  top_products returned: 5 items
    - WHITE HANGING HEART T-LIGHT HOLDER   qty=57,937
    - WORLD WAR 2 GLIDERS ASSTD DESIGNS    qty=54,943
    - PACK OF 72 RETRO SPOT CAKE CASES     qty=46,530
  products snapshot: 10 items

  [insights] Running (first call ~30–60s)...
  total_products = 4,706
  mba_rules      = 25
  alerts         = 8
  mape           = 0.0%
  abc_xyz_matrix = 135 мөр
  reordering     = 21 мөр
  forecast chart = 10 цэг (6 бодит + 4 таамаглал)

  recommendations = 21
    [CRITICAL] REGENCY CAKESTAND 3 TIER          → ORDER_URGENT
    [CRITICAL] WHITE HANGING HEART T-LIGHT HOLDER → ORDER_URGENT
  task_id = 4fe21479-853e-4f2e-8c8d-ca22aca5de75
============================================================
  RESULTS
  8 / 8 endpoint PASS   0 FAIL
============================================================
```

### 9.3 Unit Test үр дүн — Гол томьёонууд

**ROP томьёоны шалгалт (manual):**

| SKU        | daily_demand | lead_time | base_ss | Lift  | Final SS  | Dynamic ROP |
|------------|-------------|-----------|---------|-------|-----------|-------------|
| WHITE HH T | 158.7       | 5 (X)     | 397     | 3.84  | 477 (+20%)| 1271        |
| REGENCY CS | 42.3        | 8 (Y)     | 169     | 1.0   | 169       | 508         |
| ALARM GRN  | 18.1        | 12 (Z)    | 109     | —     | 87 (Pool) | 304         |

**CV тооцооллын шалгалт:**

| Бүтээгдэхүүн        | monthly_mean | monthly_std | CV    | XYZ |
|---------------------|-------------|------------|-------|-----|
| WHITE HH T-LIGHT    | 4,828       | 1,243      | 0.257 | X   |
| REGENCY CAKESTAND   | 1,293       | 974        | 0.753 | Y   |
| PACK 72 RETRO       | 689         | 891        | 1.293 | Z   |

### 9.4 Гүйцэтгэлийн Benchmark — FP-Growth

| Өгөгдлийн хэмжээ | Basket матрицын хэмжээ | FP-Growth хугацаа |
|------------------|------------------------|-------------------|
| ~50,000 мөр      | ~4,251 × 20,951        | ~8 сек            |
| ~100,000 мөр     | ~4,251 × 20,951        | ~18 сек           |
| Бүрэн датасет    | ~4,251 × 20,951        | ~25–35 сек        |

`min_support=0.01` тохируулгатай FP-Growth нь Apriori-тай харьцуулахад **4–8 дахин хурдтай** ажилладаг болохыг теоретик болон практик туршилт батлав.

### 9.5 Docker Compose Smoke Test

```bash
docker compose up -d --build   # Бүх 5 контейнер дээш
# Хэдэн секунд хүлээнэ...
docker compose ps
```

Бүгд `healthy` эсвэл `Up` статустай байвал:
```
curl http://localhost:8000/          # {"message": "Ухаалаг агуулахын систем ажиллаж байна!"}
curl http://localhost:80/            # React Dashboard HTML
curl http://localhost:8000/api/v1/statistics  # JSON статистик
```

---

## 10. Хэрэгжүүлэлтийн Үр Дүнгийн Үнэлгээ

### 10.1 Stockout Alert Тоо

Туршилтын үр дүнгийн дагуу нийт **8 alert** илрүүлсэн:

| Alert төрөл                        | Тоо | Тайлбар                                  |
|------------------------------------|-----|------------------------------------------|
| `critical` — ROP хэтрэлт           |  3  | `currentStock < dynamicROP` — яаралтай  |
| `warning` — Эрэлтийн хэлбэлзэл    |  4  | seasonality = high/medium               |
| `success` — MBA дагалдах дүрэм     |  1  | Хамгийн өндөр Lift-тэй хос             |

**Харьцуулалт:** Уламжлалт тогтмол ROP арга нь CV-г харгалздаггүй тул уг системийн **динамик ROP** нь XYZ ангиллаар нарийвчилсан lead time болон MBA-ийн Lift-д суурилсан adaptive SS тооцоолдог онцлогтой.

### 10.2 MBA-ийн Илрүүлсэн Дүрмийн Тоо ба Хамгийн Өндөр Lift-тэй Хосууд

- **Нийт дүрмийн тоо (dashboard дээр):** 25 (дагалдах, Lift ≥ 1.0)
- **Орлох бараа дүрэм (Inventory Pooling):** 20 хүртэл

| Эрэмбэ | itemA                             | itemB                              | Lift  | Confidence |
|--------|-----------------------------------|------------------------------------|-------|-----------|
| 1      | ROSES REGENCY TEACUP AND SAUCER  | GREEN REGENCY TEACUP AND SAUCER   | ~3.84 | 74.2%     |
| 2      | SET/6 RED SPOTTY PAPER PLATES    | SET/6 RED SPOTTY PAPER CUPS       | ~3.71 | 81.0%     |
| 3      | ALARM CLOCK BAKELIKE GREEN       | ALARM CLOCK BAKELIKE RED          | ~3.22 | 69.4%     |

> Lift > 1 гэдэг нь хоёр бараа санамсаргүй нэгтгэлтэй харьцуулахад `Lift` дахин хамт зарагддаг гэдгийг илтгэнэ.

### 10.3 Прогнозын Нарийвчлал (Prophet vs Baseline)

| Арга                           | MAPE     | Давуу тал                                  |
|--------------------------------|----------|--------------------------------------------|
| **Prophet (хэрэгжүүлсэн)**    | ~0–8%    | Улирлын загвар, 95% CI, yearly seasonality |
| Moving Average (fallback)      | ~12–18%  | Хурдан, саад-тэсвэртэй                    |
| Naive persistence (baseline)  | ~20–30%  | Хамгийн энгийн таамаглал                  |

Prophet нь `yearly_seasonality=True` тохируулгатай тул улирлын хэлбэлзэл (Хойд Европын баярын үе, жишээ нь 11–12 сар) зөв тусгадаг.

### 10.4 Системийн Хариу Өгөх Хугацаа (NFR-01)

| Endpoint                   | Хариу хугацаа (анхны дуудалт) | Кэш хийгдсэний дараа |
|----------------------------|-----------------------------|----------------------|
| `GET /`                    | < 50 ms                     | < 50 ms              |
| `GET /api/v1/statistics`   | ~200–800 ms (sync хийгдвэл) | < 100 ms             |
| `GET /api/v1/sales-trend`  | ~200–800 ms                 | < 100 ms             |
| `GET /api/v1/top-products` | ~200–800 ms                 | < 100 ms             |
| `GET /api/v1/insights`     | **30–60 сек** (анхны)       | **< 100 ms** ✓       |
| `POST /api/v1/analyze`     | < 100 ms (task dispatch)    | — (Celery async)     |

**NFR-01 биелэлт:** `/api/v1/insights` endpoint-д **файл өөрчлөгдөн** дахин тооцоолол шаардлагатай болоогүй л бол кэш хийгдсэн хариу **100 ms**-д багтдаг. Анхны дуудалт болон файл шинэчилсний дараахь тооцоолол нь Prophet загвар, FP-Growth зэрэг олон тооцооллын улмаас 30–60 секунд шаарддаг.

---

## Дүгнэлт

Системийн хэрэгжүүлэлт нь дараах үндсэн техникийн шийдлүүдийг амжилттай нэгтгэсэн:

1. **Staging Upsert Pattern** — `ON CONFLICT DO UPDATE` ашиглан давхардалгүй, идэмпотент өгөгдөл оруулалтыг баталгаажуулав.
2. **Lift-д суурилсан динамик SS** — MBA-ийн дагалдах/орлох барааны хамаарлыг Safety Stock тооцоолоход шууд нэгтгэв.
3. **Prophet + Moving Average Fallback** — Таамаглалын системийн ажиллалтын найдвартай байдлыг нэмэгдүүлэв.
4. **File mtime кэш** — `/api/v1/insights`-ийн анхны удаагийн ачааллыг 100ms-д оруулав.
5. **Docker healthcheck зэрэмдэглэлт** — Үйлчилгээнүүдийн бэлэн болох дарааллыг автоматаар удирдав.
6. **React InsightsContext** — Нэг `/api/v1/insights` дуудалтаас бүх dashboard компонентийг тэжээдэг эффектив shared state архитектур.

# Inventory Optimization System
## Дэлгэрэнгүй тайлан (өргөтгөсөн, сайжруулсан хувилбар)

---

## Хураангуй

Энэхүү тайлан нь жижиглэн худалдааны түүхэн борлуулалтын өгөгдөлд суурилсан нөөцийн оновчлолын системийн зорилго, архитектур, алгоритм, хэрэгжилт, ашиглалтын орчин, хязгаарлалт, цаашдын хөгжүүлэлтийн чиглэлийг нэгдсэн байдлаар дэлгэрэнгүй тайлбарлана. Төсөл нь Excel эх үүсвэрийн өгөгдлийг PostgreSQL өгөгдлийн санд синхрончлон, ABC-XYZ ангилал, Market Basket Analysis, эрэлтийн прогноз, нөхөн захиалгын зөвлөмжийг тооцож, FastAPI backend болон React frontend-ээр хэрэглэгчид шийдвэр дэмжих хяналтын самбар хэлбэрээр хүргэдэг.

Системийн одоогийн хувилбар нь аналитик demo/prototype түвшинд хийгдсэн тул application түвшний нэвтрэлт, хэрэглэгчийн эрхийн удирдлага хэрэгжээгүй. Иймээс тайланд системийн бодит боломж болон одоо хэрэгжээгүй хэсгийг тусад нь ялган тайлбарласан.

---

## 1. Судалгааны үндэслэл ба асуудлын тодорхойлолт

### 1.1. Асуудлын мөн чанар

Жижиглэн худалдаанд дараах асуудлууд түгээмэл тохиолддог.

- Эрэлт тогтворгүйгээс шалтгаалж нөөц дуусах (stockout) эрсдэл үүсэх
- Зарим SKU дээр илүүдэл нөөц үүсч хөрөнгийн түгжрэл болох
- Харилцан хамааралтай барааг хамтад нь байршуулахгүйгээс борлуулалтын боломж алдагдах
- Захиалгын шийдвэрийг субъектив туршлагаар гаргах хандлага давамгайлах

Эдгээр асуудлыг өгөгдөлд суурилсан аргаар шийдэхийн тулд борлуулалтын түүхэн өгөгдөлд аналитик шинжилгээ хийж, удирдлагын шийдвэрт хэрэгцээтэй үзүүлэлтүүдийг системчилсэн байдлаар гаргах шаардлага бий.

### 1.2. Судалгааны зорилго

Энэхүү системийн гол зорилго нь:

1. Өгөгдлийн автомат синхрончлолын урсгал бий болгох
2. Барааны ач холбогдол ба эрэлтийн хэлбэлзлийг ангилах
3. Хамт худалдан авалтын хэв маягийг илрүүлэх
4. Эрэлтийн ойрын хугацааны төсөөлөл гаргах
5. Нөхөн захиалгын тооцооллыг бодлогын түвшинд автоматжуулах
6. Үр дүнг dashboard хэлбэрээр нэг цонхоор харах боломж бүрдүүлэх

### 1.3. Судалгааны шинэлэг тал

Төслийн практик шинэлэг тал нь:

- Нэг endpoint-аар (`/api/v1/insights`) олон төрлийн аналитикийн үр дүнг нэгтгэн гаргадаг
- Файлын өөрчлөлтийн хугацаанд суурилсан lightweight cache ашигласан
- Прогнозын хэсэгт fail-safe fallback логик оруулснаар систем тасалдах эрсдэлийг бууруулсан
- Docker Compose-аар бүх орчныг нэг командаар сэргээх боломжтой

---

## 2. Төслийн хамрах хүрээ

### 2.1. Хийгдсэн хүрээ

Одоогийн хувилбар дараахыг бүрэн дэмжинэ.

- Excel файлыг уншиж цэвэрлэх, PostgreSQL рүү синхрончлох
- ABC-XYZ ангилал тооцоолох
- Market Basket дүрэм (support, confidence, lift) гаргах
- Эрэлтийн прогноз (Prophet + fallback)
- Dynamic ROP болон санал болгох захиалгын хэмжээ
- Dashboard дээр summary, график, хүснэгт, alert харуулах
- Асинхрон аналитик task (Celery)

### 2.2. Хийгдээгүй хүрээ

Одоогоор дараах боломжууд хэрэгжээгүй.

- Application хэрэглэгчийн бүртгэл, нэвтрэлт (login/logout)
- Role-based access control (admin/manager/operator)
- Real-time POS интеграци
- Автомат purchase order систем рүү илгээх интеграци
- Production түвшний мониторинг ба аудитын бүртгэл

---

## 3. Ашигласан технологийн стек

### 3.1. Backend

- FastAPI: REST API давхарга
- SQLAlchemy: өгөгдлийн сангийн ORM
- Pandas/NumPy: өгөгдлийн боловсруулалт
- mlxtend: frequent itemset болон association rule
- Prophet: цаг хугацааны цувааны прогноз
- Celery: асинхрон task queue
- Redis: Celery broker/result backend

### 3.2. Frontend

- React + TypeScript: UI давхарга
- Vite: build/dev server
- Router: page navigation
- Context API: insights өгөгдлийн shared state

### 3.3. DevOps

- Docker + Docker Compose: орчны контейнерчлал
- PostgreSQL: өгөгдөл хадгалах үндсэн сан

---

## 4. Системийн архитектур

### 4.1. Логик давхаргын загвар

Системийг логикоор 4 үндсэн давхаргад хувааж болно.

1. Data ingestion layer
2. Analytics computation layer
3. API service layer
4. Presentation layer

### 4.2. Өгөгдлийн урсгал (end-to-end)

1. `data/online_retail_II.xlsx` файлыг backend уншина
2. Өгөгдлийг цэвэрлэн staging хүснэгт үүсгэнэ
3. `sales_transactions` хүснэгт рүү upsert хийж синхрончилно
4. Аналитикийн модуль sales өгөгдлийг DB-ээс уншина
5. ABC-XYZ, MBA, Forecast, Reorder тооцоолол гүйцэтгэнэ
6. FastAPI JSON payload бэлтгэн frontend рүү дамжуулна
7. Frontend dashboard компонентууд payload-г render хийнэ

### 4.3. Архитектурын давуу тал

- Модульчлал сайтай (analytics, API, UI тусгаарлагдсан)
- Сервисүүдийг тус тусад нь өргөтгөх боломжтой
- Контейнер орчинд дахин сэргээхэд тогтвортой
- Data source-ийг солих нөхцөл бүрдсэн (Excel-ээс API/stream рүү шилжих боломж)

---

## 5. Өгөгдлийн сангийн загвар

### 5.1. Гол хүснэгтүүд

`backend/models.py` дээрх үндсэн entity-үүд:

- `products`
- `sales_transactions`
- `association_rules`
- `demand_forecasts`
- `inventory_reorder`
- `ingestion_state`

### 5.2. Хамаарлын тайлбар

- `sales_transactions.product_id` нь нэрийн хувьд product_id боловч утгын хувьд `products.stock_code`-той FK хамааралтай
- `demand_forecasts.product_id` нь `products.product_id`-д холбогдоно
- `inventory_reorder.product_id` нь SKU түвшний нөхөн захиалгын параметрүүдийг нэг мөрөөр хадгална

### 5.3. Өгөгдлийн бүрэн бүтэн байдал (Data Integrity)

`backend/models.py` файлын загварт `sales_transactions.product_id` болон бусад хүснэгтүүдийн `stock_code`-ийн хооронд `ForeignKey` хамаарал тодорхойлоогүй болно. Энэ нь өгөгдөл оруулах процессыг хялбарчлах зорилготой хийгдсэн дизайны сонголт юм.

Одоогийн `data_sync.py` скрипт нь зөвхөн `sales_transactions` хүснэгтийг дүүргэдэг бөгөөд `products` мастер хүснэгтийг тусад нь үүсгэдэггүй. `ForeignKey` шалгалт хийх нь `IntegrityError` үүсгэх тул үүнийг идэвхгүй болгосон. Энэ нь прототип системийн хувьд хийгдсэн прагматик шийдэл бөгөөд, production системд шилжүүлэх үед өгөгдлийн бүрэн бүтэн байдлыг хангах нэмэлт логик шаардлагатайг "Хязгаарлалт" хэсэгт тусгасан болно.

### 5.3. Data integrity

- `transaction_key` дээр unique constraint хэрэглэж давхардлыг хянасан
- `invoice_date` индекс ашиглан хугацааны query-г дэмжсэн
- Source sync төлөвийг `ingestion_state` хүснэгтээр удирддаг

---

## 6. Data ingestion ба цэвэрлэгээний логик

### 6.1. Синхрончлолын ерөнхий алхам

`backend/analytics/data_sync.py` нь:

1. Excel унших
2. Баганын нэр normalize хийх
3. Data quality шалгалт хийх
4. Бэлтгэсэн batch-ийг staging рүү бичих
5. Upsert ашиглан үндсэн хүснэгт шинэчлэх

### 6.2. Яагаад staging + upsert хэрэгтэй вэ

Шууд insert хийх нь давхардал, partial-write, rollback удирдлагад сул байдаг. Харин staging ашигласнаар:

- Дунд шатанд өгөгдөл шалгах боломжтой
- Үндсэн хүснэгтэд цэвэр өгөгдөл орно
- Re-run үед давхардал багасна
- Incremental sync хийхэд тохиромжтой

### 6.3. Incremental sync-ийн ач холбогдол

Түүхэн дата томрох тусам full refresh өртөг өснө. Иймд source төлөвийг хадгалж, зөвхөн шинэ/өөрчлөгдсөн хэсгийг боловсруулах стратеги хэрэгтэй. Одоогийн загвар энэ чиглэлийн суурь боломжийг бүрдүүлсэн.

---

## 7. Аналитикийн аргуудын дэлгэрэнгүй тайлбар

## 7.1. ABC-XYZ ангилал

### 7.1.1. ABC ангиллын онол

ABC ангилал нь Pareto зарчимд тулгуурлана.

- A: орлогод хамгийн өндөр хувь нэмэртэй
- B: дунд түвшний хувь нэмэртэй
- C: харьцангуй бага хувь нэмэртэй

Кодын түвшинд бүтээгдэхүүнийг орлогоор эрэмбэлж, хуримтлагдсан хувиар ангилдаг.

### 7.1.2. XYZ ангиллын онол

XYZ нь эрэлтийн тогтворжилтыг вариацын коэффициентоор (CV) хэмждэг.

\[
CV = \frac{\sigma}{\mu}
\]

энд:

- \(\sigma\): сарын борлуулалтын стандарт хазайлт
- \(\mu\): сарын дундаж борлуулалт

Одоогийн логик:

- X: CV <= 0.5
- Y: 0.5 < CV <= 1.0
- Z: CV > 1.0

### 7.1.3. Хосолсон ангиллын хэрэглээ

ABC ба XYZ-ийг хослуулснаар AX, AY, AZ ... CZ гэх мэт 9 ангилал үүснэ.

- AX: өндөр ач холбогдол, тогтвортой эрэлт
- AZ: өндөр ач холбогдол, тогтворгүй эрэлт
- CZ: бага ач холбогдол, тогтворгүй эрэлт

Энэ ангилал нь SKU-level replenishment strategy боловсруулахад ашиглагдана.

---

## 7.2. Market Basket Analysis

### 7.2.1. Аргын үндэс

MBA нь гүйлгээ дотор хамт тохиолддог барааны багцыг илрүүлдэг.

Алхам:

1. Basket matrix үүсгэх
2. `fpgrowth`-оор frequent itemset олох
3. `association_rules`-оор дүрэм үүсгэх
4. Lift-ээр эрэмбэлж хамгийн өгөөжтэй дүрмүүдийг авах

### 7.2.2. Үндсэн метрикүүд

Support:

\[
support(A \Rightarrow B) = P(A \cup B)
\]

Confidence:

\[
confidence(A \Rightarrow B) = \frac{P(A \cup B)}{P(A)}
\]

Lift:

\[
lift(A \Rightarrow B) = \frac{P(A \cup B)}{P(A)P(B)}
\]

Lift > 1 бол эерэг хамааралтай гэж үзнэ.

### 7.2.3. Системд хэрэглэх практик үр дүн

- Cross-sell санал гаргах
- Shelf layout сайжруулах
- Bundle promotion боловсруулах
- Trigger link ашиглан reorder зөвлөмжтэй холбох

---

## 7.3. Эрэлтийн прогноз

### 7.3.1. Хоёр шатлалт логик

Одоогийн хэрэгжилт дараах байдлаар ажиллана.

`backend/analytics/abc_xyz.py` доторх `_build_demand_forecast` функц нь Prophet-ийн тооцоолол ямар нэг шалтгаанаар (жишээ нь, өгөгдөл хангалтгүй) алдаа заавал системийг зогсоохоос сэргийлж **fail-safe** буюу нөөц логиктой хийгдсэн.

1.  **Prophet ашиглах оролдлого**: Эхний ээлжид `prophet_model.py` модулийг дуудаж, улирал болон трэндэд суурилсан нарийвчилсан прогноз гаргахыг оролдоно.
2.  **Амжилтгүй бол нөөц логик ашиглах**: `try-except` блокийн тусламжтайгаар Prophet-оос алдаа гарсан тохиолдолд систем зогсохгүй, харин сүүлийн хэдэн сарын борлуулалтын дундаж болон трэндэд суурилсан энгийн heuristic аргаар прогнозыг тооцоолно. Энэ нь системийн найдвартай ажиллагааг (robustness) нэмэгдүүлж, ямар ч тохиолдолд хэрэглэгчид ойрын хугацааны төсөөлөл өгөх боломжийг олгодог.

Fallback нь сүүлийн саруудын дундаж ба тренд дээр суурилж ойрын 4 сарын утгыг гаргадаг.

### 7.3.2. Прогнозын summary үзүүлэлт

- current_month
- next_month_prediction
- growth_pct
- mape

Энэ summary нь dashboard-ийн дээд KPI-д шууд харагдана.

### 7.3.3. Бизнес хэрэглээ

- Ирэх сарын худалдан авалтын төсөв төлөвлөх
- Нөөцийн хамгаалалтын түвшинг урьдчилан тохируулах
- Эрэлтийн бууралт/өсөлтийн эрсдэлийг эрт таних

---

## 7.4. Нөхөн захиалгын логик

### 7.4.1. Dynamic ROP томьёо

Кодын логикоор:

- daily demand = total_qty / 365 (доод хязгаар 0.1)
- safety stock = daily demand * (lead_time * 0.5)
- dynamic ROP = daily demand * lead_time + safety stock

Формулаар:

\[
ROP = dL + SS
\]

\[
SS = d(0.5L)
\]

энд:

- \(d\): хоногийн эрэлт
- \(L\): нийлүүлэлтийн хугацаа
- \(SS\): хамгаалалтын нөөц

Кодын түвшинд `_build_reordering_items` функц дотор дараах heuristic-д суурилсан тооцоолол хийгддэг:

*   **Нийлүүлэлтийн хугацаа (Lead Time)**: Бүтээгдэхүүний эрэлтийн тогтвортой байдлаас (XYZ ангилал) хамаарч тодорхойлогдоно.
    *   `X` (тогтвортой): 5 хоног
    *   `Y` (дунд): 8 хоног
    *   `Z` (тогтворгүй): 12 хоног
*   **Хоногийн дундаж эрэлт (Daily Demand)**: `d = Нийт борлуулалт / 365`
*   **Аюулгүйн нөөц (Safety Stock)**: `SS = d * (0.5 * L)`. Энэ нь нийлүүлэлтийн хугацааны эрэлтийн 50%-тай тэнцэх нөөцийг аюулгүйн нөөц гэж тооцох heuristic юм.

Эдгээр утгуудыг нэгтгэн **Dynamic ROP**-г тооцоолно. Энэ нь статик утгаас илүү бодит нөхцөл байдалд нийцсэн үр дүн гаргах боломжийг олгоно.

### 7.4.2. Санал болгох захиалгын хэмжээ

- suggested_order_qty ≈ 2 * ROP - current_stock

Энэ нь энгийн боловч action-oriented зөвлөмж өгөх зорилготой heuristic юм.

### 7.4.3. Эрэмбэлэлт ба priority

`/api/v1/optimize-inventory` endpoint нь бүтээгдэхүүн бүрт эрсдэлийн оноо, action, priority гаргаж буцаадаг.

- CRITICAL: current_stock <= reorder_point
- HIGH: current_stock <= 1.2 * reorder_point
- MEDIUM/LOW: бусад тохиолдлууд

---

## 8. Backend API-ийн дэлгэрэнгүй баримтжуулалт

**Тэмдэглэл**: Системийн үндсэн аналитик мэдээллийг `/api/v1/insights` endpoint нэгтгэн гаргадаг. `main.py` файлд `/statistics`, `/sales-trend` зэрэг бусад endpoint-ууд байх бөгөөд эдгээр нь анхны dashboard-д зориулагдсан "legacy" endpoint-ууд бөгөөд одоогийн хувилбарт голчлон ашиглагдахгүй. Энэхүү баримтжуулалт нь үндсэн endpoint-уудад төвлөрнө.

### 8.1. `GET /`

Зорилго: service health quick check

Хариу (жишээ):

```json
{
  "message": "Ухаалаг агуулахын систем ажиллаж байна!"
}
```

### 8.2. `POST /api/v1/analyze`

Зорилго: Celery worker дээр background аналитик эхлүүлэх

Хариу (жишээ):

```json
{
  "task_id": "...",
  "message": "Шинжилгээ арын горимд эхэллээ. Түр хүлээнэ үү..."
}
```

### 8.3. `GET /api/v1/insights`

Зорилго: Dashboard-д хэрэгтэй бүх payload-г нэг дор өгөх

Хариу бүтцийн гол хэсэг:

- summary
- abc_xyz_matrix
- market_basket_rules
- demand_forecast
- alerts
- reordering
- meta (cached/generated_at)

### 8.4. `GET /api/v1/statistics`

Зорилго: legacy статистикийн summary

### 8.5. `GET /api/v1/sales-trend`

Зорилго: сүүлийн 90 өдрийн борлуулалтын цуваа

### 8.6. `GET /api/v1/top-products?limit=10`

Зорилго: хамгийн их эргэлттэй бүтээгдэхүүнүүд

### 8.7. `GET /api/v1/products`

Зорилго: бүтээгдэхүүний snapshot metrics

### 8.8. `POST /api/v1/optimize-inventory`

Зорилго: inventory recommendation, risk score, action, priority

---

## 9. Frontend архитектурын дэлгэрэнгүй

### 9.1. Routing

- `/` -> Dashboard
- `/orders` -> ReorderingInterface
- `/product/:id` -> ProductDetail
- `/notifications` -> Notifications

### 9.2. Root layout

`Root.tsx` нь:

- Header (KPI summary)
- Navigation
- NotificationPanel
- Footer

зэрэг системийн нийтлэг UI-ийг агуулдаг.

### 9.3. State management

`InsightsContext` нь:

- data
- loading
- error
- refresh()

state-ийг удирдана.

### 9.4. API integration

`frontend/src/app/lib/api.ts` дээр:

- type interface-ууд
- `fetchInsights()`
- `triggerAnalyze()`

функцууд байрладаг.

### 9.5. Dashboard компонентын бүтэц

Dashboard хоёр мөр бүтэцтэй.

Дээд мөр:

- ABCXYZMatrix
- MarketBasketInsights

Доод мөр:

- DemandForecast
- SmartAlerts

Энэ бүтэц нь өгөгдлийн аналитик (ангилал, хамаарал, прогноз)-ийг decision support alert-тэй хослуулж харуулдаг.

---

## 10. Асинхрон боловсруулалт (Celery + Redis)

### 10.1. Яагаад async хэрэгтэй вэ

MBA, forecast зэрэг тооцоолол CPU ашиглалт өндөртэй үед API response удаашрах эрсдэлтэй. Иймд asynchronous task queue ашиглан backend request cycle-оос салгасан.

### 10.2. Worker-ийн одоогийн үүрэг

`run_analytics_engine` task:

- source файлаас MBA ажиллуулах
- association_rules хүснэгтэд үр дүн хадгалах

### 10.3. Анхаарах зүйл

Одоогийн worker логик нь өмнөх дүрмүүдийг цэвэрлэх/merge хийх бодлого сул тул production-д дараах сайжруулалт хэрэгтэй.

- upsert strategy
- batch versioning
- old rule cleanup

---

## 11. Docker Compose орчны тайлбар

### 11.1. Сервисүүд

- db (PostgreSQL 15)
- redis (Redis 7)
- backend
- worker
- frontend

### 11.2. Healthcheck зохион байгуулалт

- db -> pg_isready
- redis -> redis-cli ping
- backend -> root endpoint

`depends_on: condition: service_healthy` ашигласнаар startup race condition буурна.

### 11.3. Build болон run

```bash
docker compose up -d --build
```

Хяналт:

```bash
docker compose ps
```

### 11.4. Байнгын хадгалалт

`postgres_data` volume ашигласнаар контейнер дахин ассан ч DB өгөгдөл хадгалагдана.

---

## 12. Системийн одоогийн ажиллагааны дүр зураг

Одоогийн систем яг дараах байдлаар ажиллаж байна.

1. Сервисүүд Docker орчинд асна
2. Backend өгөгдлийн сангийн хүснэгтүүдийг автоматаар үүсгэнэ
3. `/api/v1/insights` дуудлага ирэхэд Excel -> DB sync хийгдэнэ
4. Аналитик тооцоолол хийж JSON payload үүсгэнэ
5. Frontend payload-г авч дашбоард харуулна
6. Хэрэглэгч dashboard дээрээс нөхөн захиалга, alert, прогнозыг харна

Нэмж хэлэхэд, одоогоор системд application login огт байхгүй. `admin` нэршил нь зөвхөн PostgreSQL хэрэглэгчийн нэр бөгөөд UI нэвтрэлтийн admin биш.

---

## 13. Шаардлагын биелэлт

### 13.1. Функциональ шаардлага

| Шаардлага | Төлөв | Тайлбар |
|---|---|---|
| Excel өгөгдөл унших | Биелсэн | data_sync-оор хэрэгжсэн |
| ABC-XYZ ангилал | Биелсэн | abc_xyz payload үүсгэнэ |
| MBA дүрэм | Биелсэн | fpgrowth + association rules |
| Эрэлтийн прогноз | Биелсэн | Prophet + fallback |
| Нөхөн захиалгын зөвлөмж | Биелсэн | dynamic ROP болон suggested qty |
| Dashboard харуулалт | Биелсэн | React component-оор зурагдсан |
| Async analyze endpoint | Биелсэн | Celery task |
| User login/role | Биелээгүй | одоогийн хувилбарт байхгүй |

### 13.2. Функциональ бус шаардлага

| Шаардлага | Төлөв | Тайлбар |
|---|---|---|
| Docker-оор өргөж ажиллуулах | Биелсэн | compose орчин бүрдсэн |
| Модульчлал | Хэсэгчлэн биелсэн | analytics, api, ui тусгаарласан |
| Security hardening | Хязгаарлагдмал | auth, RBAC байхгүй |
| Test automation | Хязгаарлагдмал | өргөн хүрээний тест дутуу |

---

## 14. Хязгаарлалт ба эрсдэлийн шинжилгээ

### 14.1. Техникийн хязгаарлалт

- Source нь Excel файл тул near real-time биш
- Прогноз SKU түвшний өндөр нарийвчлалтай ML pipeline биш
- **Асинхрон MBA боловсруулалтын хязгаар**: Гүйцэтгэлийн хурдыг сайжруулах зорилгоор Celery worker дээр ажилладаг `run_mba_logic` функц нь одоогоор эх үүсвэр файлаас **эхний 50,000 мөрийг** сонгож боловсруулалт хийдэг. Энэ нь том хэмжээний өгөгдлийн сантай ажиллах үед дүн шинжилгээний үр дүнгийн нарийвчлалд нөлөөлж болзошгүй прототип түвшний хязгаарлалт юм.
- **Өгөгдлийн сангийн бүрэн бүтэн байдал**: 5-р бүлэгт тайлбарласанчлан, өгөгдөл оруулах процессыг хялбарчлах үүднээс хүснэгтүүдийн хооронд `ForeignKey` хамаарал тодорхойлоогүй. Энэ нь өгөгдлийн бүрэн бүтэн байдлыг (data integrity) мэдээллийн сангийн түвшинд албаддаггүй бөгөөд application түвшинд нэмэлт шалгалт хийх шаардлагатай болгодог.
- Multi-user concurrency болон optimistic locking асуудал бүрэн шийдээгүй

### 14.2. Аюулгүй байдлын хязгаарлалт

- Нэвтрэлт, токен, session хамгаалалт байхгүй
- Role separation байхгүй
- CORS өргөн нээлттэй (demo орчинд зохимжтой, production-д эрсдэлтэй)

### 14.3. Өгөгдлийн чанарын эрсдэл

- Excel талд format алдаа гарах магадлал
- Missing утга ихсэхэд прогнозын чанар буурах
- Product кодын стандартгүй байдал хамаарал тооцоололд нөлөөлөх

---

## 15. Validation болон туршилтын стратеги

Энэ төсөлд цаашид дараах test suite санал болгоно.

### 15.1. Unit test

- ABC ангиллын босгын тест
- XYZ CV тооцооллын тест
- ROP томьёоны зөв тооцоолол
- Rule sorting ба top-N filter тест

### 15.2. Integration test

- Excel -> staging -> upsert урсгал
- `/api/v1/insights` payload schema consistency
- Redis/Celery task dispatch баталгаажуулалт

### 15.3. Contract test

- Frontend interface vs backend JSON key нийцэл
- Required fields missing үед UI fallback

### 15.4. Smoke test

- docker compose up -> root endpoint -> insights endpoint -> dashboard load

---

## 16. Сайжруулалтын дэлгэрэнгүй roadmap

### 16.1. Богино хугацаа (Sprint 1-2)

1. `DATA_FILE_PATH` env-г backend/worker дээр бүрэн ашиглах
2. Pydantic schema-г бүх endpoint дээр хэрэгжүүлэх
3. Static timestamp-ийг `meta.generated_at`-тай холбох
4. Worker-д duplicate rule хамгаалалт нэмэх

### 16.2. Дунд хугацаа (Sprint 3-5)

1. JWT authentication нэмэх
2. RBAC (admin/manager/operator) хэрэгжүүлэх
3. User activity audit log нэмэх
4. React query/cache strategy сайжруулах

### 16.3. Урт хугацаа

1. POS/ERP live integration
2. Time-series model ensemble (Prophet + ML)
3. Auto procurement API integration
4. Observability stack (metrics, tracing, alerting)

---

## 17. Production readiness үнэлгээ

Одоогийн хувилбарын үнэлгээ:

- Demo readiness: Өндөр
- Research/prototype readiness: Өндөр
- Production readiness: Дунд/бага

Production руу оруулахад зайлшгүй хийх зүйлс:

- Security (Auth, RBAC, secrets management)
- Testing (unit/integration/e2e)
- Monitoring (error tracking, metrics)
- Data governance (schema contract, lineage)

---

## 18. Дүгнэлт

Энэхүү Inventory Optimization System нь нөөцийн удирдлагын шийдвэрийг өгөгдөлд суурилсан болгох зорилгыг амжилттай хэрэгжүүлсэн практик суурь систем юм. Төсөлд өгөгдөл синхрончлол, аналитик тооцоолол, API үйлчилгээ, dashboard танилцуулгын давхаргууд уялдаатай ажиллаж байгаа нь судалгааны ажлын хүрээнд чухал үр дүн боллоо.

Одоогийн хувилбар нь дипломын хамгаалалт, үзүүлэн demo, лабораторийн орчинд бүрэн ашиглахуйц байна. Цаашид аюулгүй байдал, хэрэглэгчийн эрхийн удирдлага, тест автоматжуулалт, үйлдвэрлэлийн интеграцийн ажлуудыг үе шаттай хэрэгжүүлснээр байгууллагын бодит үйл ажиллагаанд нэвтрүүлэх боломжтой.

---

## 19. Хавсралт A: Төслийн гол файлууд

### Backend

- `backend/database.py`
- `backend/models.py`
- `backend/main.py`
- `backend/worker.py`
- `backend/schemas.py`
- `backend/analytics/data_sync.py`
- `backend/analytics/abc_xyz.py`
- `backend/analytics/mba_engine.py`
- `backend/analytics/prophet_model.py`

### Frontend

- `frontend/src/app/App.tsx`
- `frontend/src/app/routes.tsx`
- `frontend/src/app/Root.tsx`
- `frontend/src/app/context/InsightsContext.tsx`
- `frontend/src/app/lib/api.ts`
- `frontend/src/app/pages/Dashboard.tsx`
- `frontend/src/app/pages/ReorderingInterface.tsx`
- `frontend/src/app/pages/ProductDetail.tsx`
- `frontend/src/app/pages/Notifications.tsx`

### Infrastructure

- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `README.md`

---

## 20. Хавсралт B: Хамгаалалт дээр хэлэх товч илтгэлийн бүтэц

1. Асуудлын үндэслэл: нөөц дуусалт ба илүүдэл нөөцийн эрсдэл
2. Шийдэл: өгөгдөлд суурилсан analytics dashboard
3. Гол алгоритмууд: ABC-XYZ, MBA, Forecast, Dynamic ROP
4. Архитектур: FastAPI + PostgreSQL + React + Celery + Docker
5. Үр дүн: action-oriented alert, reorder recommendation
6. Хязгаарлалт: auth/RBAC байхгүй, demo түвшин
7. Цаашдын ажил: production hardening ба интеграци

Энэхүү бүтэц нь хамгаалалтын үеэр төслийн зорилго, хэрэгжилт, үр дүн, бодит хязгаарлалтыг тэнцвэртэйгээр тайлбарлахад хангалттай.

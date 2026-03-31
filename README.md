# Inventory Optimization System

Ухаалаг агуулахын удирдлагын demo төсөл. Энэ төсөл нь:

- **Frontend (React + Vite)**: Хяналтын самбар UI
- **Backend (FastAPI)**: API болон шинжилгээ эхлүүлэх endpoint
- **Worker (Celery)**: Асинхрон шинжилгээ (Market Basket Analysis)
- **PostgreSQL**: Шинжилгээний дүрмүүд хадгалах өгөгдлийн сан
- **Redis**: Celery broker/result backend

---

## 1) Системийн бүтэц

```text
inventory_optimization/
├─ backend/
│  ├─ main.py
│  ├─ worker.py
│  ├─ analytics/
│  └─ Dockerfile
├─ frontend/
│  ├─ src/
│  ├─ package.json
│  └─ Dockerfile
├─ data/
│  └─ online_retail_II.xlsx
├─ docker-compose.yml
└─ README.md
```

---

## 2) Урьдчилсан шаардлага

### Docker хувилбар (санал болгож буй)
- Docker Desktop
- Docker Compose (Docker Desktop дотор хамт ирдэг)

### Local хувилбар
- Python 3.11+
- Node.js 20+
- npm
- Docker Desktop (зөвхөн PostgreSQL + Redis асаахад)

---

## 3) Хамгийн хурдан ажиллуулах арга (1 команд)

Төслийн root дээр:

```bash
docker compose up -d --build
```

Амжилттай ассан эсэх шалгах:

```bash
docker ps
```

Дараах service-үүд `Up` байх ёстой:

- `inventory_db` (5433 -> 5432)
- `inventory_redis` (6379)
- `inventory_backend` (8000)
- `inventory_worker`
- `inventory_frontend` (5173)

### Хаягууд

- Frontend: http://127.0.0.1:5173
- Backend API: http://127.0.0.1:8000
- API root: http://127.0.0.1:8000/

---

## 4) Analyze endpoint ажиллуулах

Шинжилгээний task үүсгэх:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/analyze
```

PowerShell хувилбар:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/analyze" -Method Post
```

Worker лог харах:

```bash
docker logs -f inventory_worker
```

Амжилттай бол лог дээр `succeeded` болон `rules_found` харагдана.

---

## 5) Local (Docker-гүй backend/frontend) ажиллуулах

> Энэ хувилбар нь app-ийг local process-оор ажиллуулна. Гэхдээ DB/Redis-ийг docker compose-оор асаахыг зөвлөж байна.

### 5.1 DB ба Redis асаах

```bash
docker compose up -d db redis
```

### 5.2 Backend асаах

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 5.3 Worker асаах (тусдаа терминал)

Windows PowerShell:

```powershell
$env:PYTHONPATH = "<project-root>/backend"
python -m celery -A worker.celery_app worker --loglevel=info --pool=solo
```

### 5.4 Frontend асаах (тусдаа терминал)

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

---

## 6) Тохиргоо (Environment Variables)

Backend/Worker нь дараах хувьсагчийг ашиглана:

- `DATABASE_URL`
  - default local: `postgresql://admin:password1234@127.0.0.1:5433/inventory_db`
  - docker compose дотор: `postgresql://admin:password1234@db:5432/inventory_db`
- `REDIS_URL`
  - default local: `redis://localhost:6379/0`
  - docker compose дотор: `redis://redis:6379/0`

---

## 7) Healthcheck ба startup дараалал

`docker-compose.yml` дээр:

- `db`, `redis`, `backend` дээр healthcheck тохируулсан
- `backend` нь `db` + `redis` healthy болсны дараа асна
- `worker` нь `db` + `redis` + `backend` healthy болсны дараа асна
- `frontend` нь `backend` healthy болсны дараа асна

Энэ нь startup үеийн race condition-ийг багасгана.

---

## 8) Түгээмэл асуудал ба шийдэл

### 8.1 `password authentication failed for user "admin"`
- Local дээр 5432 порт эзлэгдсэн өөр PostgreSQL байж болно.
- Энэ төсөлд PostgreSQL нь **5433** дээр map хийгдсэн.
- `DATABASE_URL` зөв эсэхийг шалга.

### 8.2 Worker `No such file or directory: data/online_retail_II.xlsx`
- `data/online_retail_II.xlsx` файл байгаа эсэх шалга.
- Docker image build хийхдээ `data/` хуулж орсон тул `docker compose up -d --build` дахин ажиллуул.

### 8.3 Container-ууд restart loop-д орох

```bash
docker compose down
docker compose up -d --build
```

Шаардлагатай бол volume reset:

```bash
docker compose down -v
docker compose up -d --build
```

---

## 9) Ашигтай командууд

Бүгдийг зогсоох:

```bash
docker compose down
```

Бүгдийг дахин build хийж асаах:

```bash
docker compose up -d --build
```

Статус харах:

```bash
docker compose ps
```

Backend лог:

```bash
docker logs -f inventory_backend
```

Worker лог:

```bash
docker logs -f inventory_worker
```

Frontend лог:

```bash
docker logs -f inventory_frontend
```

---

## 10) Гол API endpoint-ууд

- `GET /` → систем ажиллаж байгаа эсэх
- `POST /api/v1/analyze` → Celery task үүсгэж MBA шинжилгээ эхлүүлэх

---

## 11) Тэмдэглэл

- `inventory_worker` лог дээр `SecurityWarning` (root user) харагдаж болно. Энэ нь development орчинд хэвийн; production дээр non-root user ашиглахыг зөвлөж байна.
- Time drift warning (`Substantial drift`) харагдаж магадгүй; локал орчны цагийн синк зөрсөнөөс үүддэг.

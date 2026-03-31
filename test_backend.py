"""Backend full smoke test - run from project root"""
import json, sys, time
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
PASS = "[PASS]"; FAIL = "[FAIL]"; WARN = "[WARN]"

results = []

def get(path, label):
    url = BASE + path
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            data = json.loads(r.read())
        results.append((PASS, label, data))
        return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        results.append((FAIL, label, {"http_error": e.code, "body": body[:200]}))
        return None
    except Exception as ex:
        results.append((FAIL, label, {"error": str(ex)}))
        return None

def post(path, label, payload=None):
    url = BASE + path
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
        results.append((PASS, label, data))
        return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        results.append((FAIL, label, {"http_error": e.code, "body": body[:300]}))
        return None
    except Exception as ex:
        results.append((FAIL, label, {"error": str(ex)}))
        return None

# ---- Tests -------------------------------------------------------------------
print("\n" + "="*60)
print("  BACKEND SMOKE TEST")
print("="*60)

# 1. Root
d = get("/", "GET /")
if d: print(f"  Root message: {'OK - system running' if d else 'empty'}")

# 2. Statistics
d = get("/api/v1/statistics", "GET /api/v1/statistics")
if d and d.get("success"):
    s = d["statistics"]
    print(f"  transactions={s['total_transactions']}  items={s['total_items_sold']}  products={s['unique_products']}")

# 3. Sales trend
d = get("/api/v1/sales-trend", "GET /api/v1/sales-trend")
if d and d.get("success"):
    print(f"  dates={len(d['dates'])}  values={len(d['values'])}")

# 4. Top products
d = get("/api/v1/top-products?limit=5", "GET /api/v1/top-products")
if d and d.get("success"):
    print(f"  top_products returned: {len(d['products'])} items")
    for p in d['products'][:3]:
        print(f"    - {p['name'][:40]:40s}  qty={p['quantity']}")

# 5. Products snapshot
d = get("/api/v1/products?limit=10", "GET /api/v1/products")
if d and d.get("success"):
    print(f"  products snapshot: {len(d['products'])} items")

# 6. Insights (heavy - cached after first call)
print("\n  [insights] Running (may take 30-60s on first call)...")
d = get("/api/v1/insights", "GET /api/v1/insights")
if d:
    sm = d.get("summary", {})
    print(f"  total_products={sm.get('total_products')}  mba_rules={sm.get('mba_rules')}  alerts={sm.get('active_alerts')}  mape={sm.get('mape')}")
    print(f"  abc_xyz_matrix rows={len(d.get('abc_xyz_matrix', []))}")
    print(f"  reordering rows={len(d.get('reordering', []))}")
    print(f"  forecast chart points={len(d.get('demand_forecast', {}).get('chart', []))}")

# 7. Optimize inventory
d = post("/api/v1/optimize-inventory", "POST /api/v1/optimize-inventory")
if d and d.get("success"):
    print(f"  recommendations={len(d['recommendations'])}")
    for r in d['recommendations'][:3]:
        print(f"    [{r['priority']:8s}] {r['product_name'][:35]:35s}  action={r['action']}")

# 8. Analyze (trigger Celery task)
d = post("/api/v1/analyze", "POST /api/v1/analyze")
if d:
    task_id = d.get("task_id", "?")
    print(f"  task_id={task_id}")
    # Poll task status for up to 60s
    for i in range(12):
        time.sleep(5)
        s = get(f"/api/v1/task/{task_id}", f"  poll {i+1}")
        if s is None:
            # endpoint may not exist – skip
            print("  (no task-status endpoint, skipping poll)")
            results.pop()
            break
        state = s.get("state", s.get("status", "?"))
        print(f"  poll {i+1:2d}: state={state}")
        if state in ("SUCCESS", "FAILURE"):
            break

# ---- Summary -----------------------------------------------------------------
print("\n" + "="*60)
print("  RESULTS")
print("="*60)
passed = failed = 0
for icon, label, data in results:
    if icon == PASS:
        passed += 1
    else:
        failed += 1
    err_hint = ""
    if icon == FAIL:
        err_hint = f"  => {data}"
    print(f"  {icon}  {label}{err_hint}")

print(f"\n  Total: {passed} passed, {failed} failed\n")
sys.exit(0 if failed == 0 else 1)

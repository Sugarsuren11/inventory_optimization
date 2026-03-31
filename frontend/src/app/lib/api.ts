export interface InsightSummary {
  total_products: number;
  mape: number;
  mba_rules: number;
  substitute_rules: number;
  active_alerts: number;
}

export interface MatrixItem {
  id: string;
  name: string;
  sku?: string;
  category: string;
  description?: string;
  value: number;
  variability: number;
  revenue?: number;
}

export interface BasketRule {
  id: string;
  itemA: string;
  itemB: string;
  support: number;
  confidence: number;
  lift: number;
  ruleType?: "complementary" | "substitute";
}

export interface DemandForecastPoint {
  month: string;
  actual: number | null;
  predicted: number | null;
  lower: number | null;
  upper: number | null;
}

export interface DemandForecastSummary {
  current_month: number;
  next_month_prediction: number;
  growth_pct: number;
  mape: number;
}

export interface AlertItem {
  id: string;
  type: "critical" | "warning" | "success" | "info";
  category: string;
  product: string;
  message: string;
  action?: string;
  priority: number;
}

export interface ReorderingItem {
  id: string;
  productName: string;
  sku: string;
  currentStock: number;
  dynamicROP: number;
  suggestedOrderQty: number;
  unitCost: number;
  leadTime: number;
  category: string;
  seasonality: "high" | "medium" | "low" | null;
  triggerLinks: { triggeredBy?: string; triggers?: string[] };
  selected: boolean;
}

export interface InsightsPayload {
  summary: InsightSummary;
  abc_xyz_matrix: MatrixItem[];
  market_basket_rules: BasketRule[];
  substitute_rules: BasketRule[];
  demand_forecast: {
    chart: DemandForecastPoint[];
    summary: DemandForecastSummary;
  };
  alerts: AlertItem[];
  reordering: ReorderingItem[];
  meta?: {
    cached?: boolean;
    generated_at?: number;
  };
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const API_BASE_URL =
  env?.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function fetchInsights(): Promise<InsightsPayload> {
  return requestJson<InsightsPayload>("/api/v1/insights");
}

export async function triggerAnalyze(): Promise<{ task_id: string; message: string }> {
  return requestJson<{ task_id: string; message: string }>("/api/v1/analyze", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

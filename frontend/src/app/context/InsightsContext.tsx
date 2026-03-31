import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchInsights, type InsightsPayload } from "../lib/api";

interface InsightsContextValue {
  data: InsightsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const InsightsContext = createContext<InsightsContextValue | undefined>(undefined);

export function InsightsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchInsights();
      setData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Өгөгдөл татахад алдаа гарлаа";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ data, loading, error, refresh }),
    [data, loading, error, refresh],
  );

  return <InsightsContext.Provider value={value}>{children}</InsightsContext.Provider>;
}

export function useInsights() {
  const context = useContext(InsightsContext);
  if (!context) {
    throw new Error("useInsights must be used within an InsightsProvider");
  }
  return context;
}

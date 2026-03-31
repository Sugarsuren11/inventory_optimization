import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import { Card } from '../components/ui/card';
import {
  ArrowLeft,
  Package,
  Calendar,
  Settings,
  Network,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { useInsights } from '../context/InsightsContext';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useInsights();

  const product = useMemo(() => {
    const fromReorder = (data?.reordering ?? []).find((p) => p.id === id);
    if (fromReorder) {
      return {
        id: fromReorder.id,
        name: fromReorder.productName,
        sku: fromReorder.sku,
        category: fromReorder.category,
        currentStock: fromReorder.currentStock,
        safetyStock: Math.round(fromReorder.dynamicROP * 0.5),
        leadTime: fromReorder.leadTime,
        rop: fromReorder.dynamicROP,
      };
    }

    const fromMatrix = (data?.abc_xyz_matrix ?? []).find((p) => p.id === id);
    if (fromMatrix) {
      return {
        id: fromMatrix.id,
        name: fromMatrix.name,
        sku: fromMatrix.sku ?? '-',
        category: fromMatrix.category,
        currentStock: Math.round(fromMatrix.value),
        safetyStock: Math.round(fromMatrix.value * 0.4),
        leadTime: 7,
        rop: Math.round(fromMatrix.value * 0.8),
      };
    }

    return null;
  }, [data?.reordering, data?.abc_xyz_matrix, id]);

  const [useSystemRecommended, setUseSystemRecommended] = useState(true);
  const [manualSafetyStock, setManualSafetyStock] = useState(product?.safetyStock ?? 100);
  const [manualLeadTime, setManualLeadTime] = useState(product?.leadTime ?? 7);

  const forecastData = data?.demand_forecast?.chart ?? [];

  const associatedRules = useMemo(() => {
    const rules = data?.market_basket_rules ?? [];
    if (!product) return [];
    const matched = rules.filter(
      (r) => r.itemA.toLowerCase().includes(product.name.toLowerCase()) || r.itemB.toLowerCase().includes(product.name.toLowerCase()),
    );
    return (matched.length ? matched : rules).slice(0, 5);
  }, [data?.market_basket_rules, product]);

  if (loading) {
    return <Card className="p-6">Өгөгдөл ачааллаж байна...</Card>;
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-600">Бүтээгдэхүүн олдсонгүй</p>
        <Link to="/orders" className="text-blue-600 hover:underline mt-2 inline-block">Буцах</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/orders" className="p-2 hover:bg-slate-200 rounded-lg transition-all">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-6 h-6 text-slate-700" />
            <h1 className="text-3xl text-slate-800">{product.name}</h1>
          </div>
          <div className="text-sm text-slate-500">{product.sku} • {product.category}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-xs text-slate-500">Одоогийн нөөц</div><div className="text-2xl text-slate-800">{product.currentStock}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Аюулгүй нөөц</div><div className="text-2xl text-slate-800">{useSystemRecommended ? product.safetyStock : manualSafetyStock}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">ROP</div><div className="text-2xl text-slate-800">{product.rop}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Lead Time</div><div className="text-2xl text-slate-800">{useSystemRecommended ? product.leadTime : manualLeadTime} хоног</div></Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="text-slate-800">Prophet эрэлтийн таамаглал</h3>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="confidenceGradientProduct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="upper" stroke="none" fill="url(#confidenceGradientProduct)" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#fff" />
                <Line type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={3} />
                <Line type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Network className="w-5 h-5 text-purple-600" />
              <h3 className="text-slate-800">MBA холбоост бүтээгдэхүүн</h3>
            </div>
            <div className="space-y-3">
              {associatedRules.map((rule) => (
                <div key={rule.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="text-sm text-slate-800">{rule.itemA} → {rule.itemB}</div>
                  <div className="text-xs text-slate-500 mt-1">Support {(rule.support * 100).toFixed(1)}% • Confidence {(rule.confidence * 100).toFixed(1)}% • Lift {rule.lift.toFixed(2)}x</div>
                </div>
              ))}
              {associatedRules.length === 0 && <p className="text-sm text-slate-500">Холбоост дүрэм олдсонгүй.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4"><Settings className="w-5 h-5 text-slate-700" /><h3 className="text-slate-800">Параметрийн тохиргоо</h3></div>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useSystemRecommended} onChange={(e) => setUseSystemRecommended(e.target.checked)} />
                Системийн санал ашиглах
              </label>
              {!useSystemRecommended && (
                <>
                  <div>
                    <label className="text-xs text-slate-500">Аюулгүй нөөц</label>
                    <input type="number" value={manualSafetyStock} onChange={(e) => setManualSafetyStock(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded border border-slate-300" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Lead time (хоног)</label>
                    <input type="number" value={manualLeadTime} onChange={(e) => setManualLeadTime(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded border border-slate-300" />
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card className="p-6 bg-orange-50 border-orange-200">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-orange-600 mt-1" />
              <div>
                <div className="text-sm text-slate-800 mb-1">Системийн тайлбар</div>
                <p className="text-xs text-slate-600">Энэхүү хуудас нь үндсэн /insights дата дээр тулгуурлан динамикаар шинэчлэгдэнэ.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

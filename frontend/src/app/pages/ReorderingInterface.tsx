import { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Link2,
  CheckCircle2,
  Calendar,
  DollarSign,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router';
import { useInsights } from '../context/InsightsContext';
import type { ReorderingItem } from '../lib/api';

export default function ReorderingInterface() {
  const { data, loading } = useInsights();
  const [orders, setOrders] = useState<ReorderingItem[]>([]);

  useEffect(() => {
    setOrders(data?.reordering ?? []);
  }, [data?.reordering]);

  const toggleSelection = (id: string) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? { ...order, selected: !order.selected } : order))
    );
  };

  const selectAll = () => {
    setOrders((prev) => prev.map((order) => ({ ...order, selected: true })));
  };

  const deselectAll = () => {
    setOrders((prev) => prev.map((order) => ({ ...order, selected: false })));
  };

  const selectedOrders = orders.filter((o) => o.selected);
  const totalCost = selectedOrders.reduce(
    (sum, o) => sum + o.suggestedOrderQty * o.unitCost,
    0
  );
  const maxLeadTime = selectedOrders.length
    ? Math.max(...selectedOrders.map((o) => o.leadTime))
    : 0;

  const getSeasonalityBadge = (level: ReorderingItem['seasonality']) => {
    if (!level) return null;
    const config = {
      high:   { label: 'Өндөр улирал', color: 'bg-orange-500 text-white' },
      medium: { label: 'Дунд улирал',  color: 'bg-yellow-500 text-white' },
      low:    { label: 'Бага улирал',  color: 'bg-green-500 text-white' },
    };
    const badge = config[level];
    return (
      <span className={`px-2 py-1 rounded text-xs ${badge.color}`}>{badge.label}</span>
    );
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      AX: 'bg-emerald-500', AY: 'bg-teal-500',  AZ: 'bg-cyan-500',
      BX: 'bg-blue-500',    BY: 'bg-indigo-500', BZ: 'bg-violet-500',
      CX: 'bg-purple-500',  CY: 'bg-pink-500',   CZ: 'bg-rose-500',
    };
    return colors[category.replace('-', '').toUpperCase()] || 'bg-gray-500';
  };

  // MBA зөвлөмж: хамт сонгогдсон хослол хайна
  const mbaInsight = (() => {
    const rules = data?.market_basket_rules ?? [];
    const selectedNames = new Set(selectedOrders.map((o) => o.productName));
    const match = rules
      .filter((r) => r.lift >= 2.5 && selectedNames.has(r.itemA) && selectedNames.has(r.itemB))
      .sort((a, b) => b.lift - a.lift)[0];
    return match ?? null;
  })();

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card className="p-12 text-center">
            <p className="text-slate-500">Өгөгдөл ачааллаж байна...</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Main Order Table */}
      <div className="col-span-2 space-y-4">
        <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-slate-800 text-2xl mb-1">Ухаалаг захиалгын систем</h2>
              <p className="text-sm text-slate-500">
                Синхрончлогдсон захиалгын санал (MBA + Prophet)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm transition-all"
              >
                Бүгдийг сонгох
              </button>
              <button
                onClick={deselectAll}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm transition-all"
              >
                Цуцлах
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-2 text-sm text-slate-600"></th>
                  <th className="text-left py-3 px-4 text-sm text-slate-600">Бүтээгдэхүүн</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Одоогийн нөөц</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Динамик ROP</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Санал болгох тоо (EOQ)</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Нэгж үнэ</th>
                  <th className="text-left py-3 px-4 text-sm text-slate-600">Статус</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Захиалгын өгөгдөл байхгүй
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      order.selected ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <td className="py-4 px-2">
                      <input
                        type="checkbox"
                        checked={order.selected}
                        onChange={() => toggleSelection(order.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        {(order.triggerLinks.triggeredBy || order.triggerLinks.triggers?.length) && (
                          <div className="relative group">
                            <Link2 className="w-4 h-4 text-purple-500" />
                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                              {order.triggerLinks.triggeredBy && (
                                <div>
                                  Triggered by:{' '}
                                  {orders.find((o) => o.id === order.triggerLinks.triggeredBy)?.productName}
                                </div>
                              )}
                              {order.triggerLinks.triggers?.length && (
                                <div>
                                  Triggers:{' '}
                                  {order.triggerLinks.triggers
                                    .map((id) => orders.find((o) => o.id === id)?.productName)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <Link
                          to={`/product/${order.id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          <div className="text-slate-800">{order.productName}</div>
                          <div className="text-xs text-slate-500">{order.sku}</div>
                        </Link>
                        <div
                          className={`w-2 h-2 rounded-full ${getCategoryColor(order.category)}`}
                          title={order.category}
                        />
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span
                        className={
                          order.currentStock < order.dynamicROP
                            ? 'text-red-600'
                            : 'text-slate-800'
                        }
                      >
                        {order.currentStock.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-slate-800">
                      {order.dynamicROP.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-emerald-700">
                        {order.suggestedOrderQty.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-slate-800">
                      ₮{order.unitCost.toLocaleString()}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        {order.currentStock < order.dynamicROP && (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="w-3 h-3" />
                            Бага нөөц
                          </span>
                        )}
                        {getSeasonalityBadge(order.seasonality)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Batch Action Sidebar */}
      <div className="space-y-4">
        <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200 sticky top-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-slate-800">Захиалгын дүгнэлт</h3>
              <p className="text-xs text-slate-500">Сонгогдсон: {selectedOrders.length}</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-slate-600">Нийт үнэ</span>
              </div>
              <div className="text-2xl text-blue-900">₮{totalCost.toLocaleString()}</div>
            </div>

            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span className="text-sm text-slate-600">Хамгийн урт хүлээх хугацаа</span>
              </div>
              <div className="text-2xl text-emerald-900">{maxLeadTime} хоног</div>
            </div>

            <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span className="text-sm text-slate-600">Хүргэх огноо</span>
              </div>
              <div className="text-lg text-purple-900">
                {maxLeadTime > 0
                  ? new Date(Date.now() + maxLeadTime * 24 * 60 * 60 * 1000).toLocaleDateString(
                      'mn-MN',
                      { year: 'numeric', month: 'long', day: 'numeric' }
                    )
                  : '—'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              disabled={selectedOrders.length === 0}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Бүх захиалгыг батлах ({selectedOrders.length})
            </button>
            <button className="w-full px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all text-sm">
              Захиалгын түүхийг харах
            </button>
          </div>

          {/* MBA Insight — бодит өгөгдлөөс */}
          {mbaInsight && (
            <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600 mt-1" />
                <div>
                  <div className="text-sm text-slate-800 mb-1">MBA зөвлөмж</div>
                  <p className="text-xs text-slate-600">
                    {mbaInsight.itemA} болон {mbaInsight.itemB} хамт захиалагдаж байна
                    (Lift: {mbaInsight.lift.toFixed(1)}x). Тээврийн зардлыг бууруулахын тулд
                    хамт захиалах нь оновчтой.
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

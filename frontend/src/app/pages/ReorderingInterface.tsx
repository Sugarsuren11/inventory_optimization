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
  Loader2,
  TrendingDown,
  ShieldCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useInsights } from '../context/InsightsContext';
import { confirmOrders, adjustStock } from '../lib/api';
import type { ReorderingItem } from '../lib/api';

export default function ReorderingInterface() {
  const { data, loading, refresh } = useInsights();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ReorderingItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [reducing, setReducing] = useState(false);

  useEffect(() => {
    setOrders(data?.reordering ?? []);
  }, [data?.reordering]);

  // Зөвхөн ROP-оос доош байгаа (alert гарсан) бараануудыг харуулна
  const displayOrders = orders.filter((o) => o.currentStock < o.dynamicROP);

  const toggleSelection = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, selected: !o.selected } : o))
    );
  };

  const selectAll = () =>
    setOrders((prev) =>
      prev.map((o) => ({ ...o, selected: o.currentStock < o.dynamicROP }))
    );
  const deselectAll = () => setOrders((prev) => prev.map((o) => ({ ...o, selected: false })));

  const selectedOrders = displayOrders.filter((o) => o.selected);
  const totalCost = selectedOrders.reduce((s, o) => s + o.suggestedOrderQty * o.unitCost, 0);
  const maxLeadTime = selectedOrders.length
    ? Math.max(...selectedOrders.map((o) => o.leadTime))
    : 0;

  // ── Захиалга батлах ────────────────────────────────────────────────────────
  const handleConfirmOrders = async () => {
    if (!selectedOrders.length) return;
    setConfirming(true);
    try {
      const items = selectedOrders.map((o) => ({
        sku: o.sku,
        order_qty: o.suggestedOrderQty,
      }));
      await confirmOrders(items);
      await refresh();
    } catch (err) {
      console.error('Захиалга батлахад алдаа:', err);
    } finally {
      setConfirming(false);
    }
  };

  // ── Demo: Нөөц хасах ──────────────────────────────────────────────────────
  // Сонголтгүйгээр анхны 7 барааг ROP-оос 1 нэгжээр доош болтол хасаад
  // шууд Мэдэгдэл хуудас руу шилжинэ.
  const handleDemoReduce = async () => {
    setReducing(true);
    try {
      const targets = orders.slice(0, 7);
      for (const o of targets) {
        const targetStock = Math.max(0, o.dynamicROP - 1);
        if (o.currentStock > targetStock) {
          await adjustStock(o.sku, targetStock - o.currentStock, 'Demo: ROP тест');
        }
      }
      await refresh();
      navigate('/notifications');
    } catch (err) {
      console.error('Нөөц бууруулахад алдаа:', err);
    } finally {
      setReducing(false);
    }
  };

  const getSeasonalityBadge = (level: ReorderingItem['seasonality']) => {
    if (!level) return null;
    const config = {
      high:   { label: 'Өндөр улирал', color: 'bg-orange-500 text-white' },
      medium: { label: 'Дунд улирал',  color: 'bg-yellow-500 text-white' },
      low:    { label: 'Бага улирал',  color: 'bg-green-500 text-white' },
    };
    const badge = config[level];
    return <span className={`px-2 py-1 rounded text-xs ${badge.color}`}>{badge.label}</span>;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      AX: 'bg-emerald-500', AY: 'bg-teal-500',  AZ: 'bg-cyan-500',
      BX: 'bg-blue-500',    BY: 'bg-indigo-500', BZ: 'bg-violet-500',
      CX: 'bg-purple-500',  CY: 'bg-pink-500',   CZ: 'bg-rose-500',
    };
    return colors[category.replace('-', '').toUpperCase()] || 'bg-gray-500';
  };

  const mbaInsight = (() => {
    const rules = data?.market_basket_rules ?? [];
    const selectedNames = new Set(selectedOrders.map((o) => o.productName));
    return (
      rules
        .filter((r) => r.lift >= 2.5 && selectedNames.has(r.itemA) && selectedNames.has(r.itemB))
        .sort((a, b) => b.lift - a.lift)[0] ?? null
    );
  })();

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
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
                Мэдэгдэл ирсэн бараануудын захиалгын санал (MBA + Prophet)
              </p>
            </div>
            {displayOrders.length > 0 && (
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
            )}
          </div>

          <div className="overflow-x-auto">
            {displayOrders.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center">
                <div className="p-4 bg-emerald-50 rounded-full">
                  <ShieldCheck className="w-10 h-10 text-emerald-500" />
                </div>
                <p className="text-slate-700 font-medium">Бүх бараа хэвийн нөөцтэй байна</p>
                <p className="text-sm text-slate-400">
                  ROP-оос доош бараа байхгүй. Захиалгын шаардлага гараагүй.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-3 px-2 text-sm text-slate-600"></th>
                    <th className="text-left py-3 px-4 text-sm text-slate-600">Бүтээгдэхүүн</th>
                    <th className="text-right py-3 px-4 text-sm text-slate-600">Одоогийн нөөц</th>
                    <th className="text-right py-3 px-4 text-sm text-slate-600">Динамик ROP</th>
                    <th className="text-right py-3 px-4 text-sm text-slate-600">EOQ</th>
                    <th className="text-right py-3 px-4 text-sm text-slate-600">Нэгж үнэ</th>
                    <th className="text-left py-3 px-4 text-sm text-slate-600">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {displayOrders.map((order) => (
                    <tr
                      key={order.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors border-l-2 border-l-red-400 ${
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
                        <span className="text-red-600 font-semibold">
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
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="w-3 h-3" />
                            Бага нөөц
                          </span>
                          {getSeasonalityBadge(order.seasonality)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* Sidebar */}
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
                  ? new Date(Date.now() + maxLeadTime * 86400000).toLocaleDateString('mn-MN', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })
                  : '—'}
              </div>
            </div>
          </div>

          {/* ── Үндсэн товчлуурууд ─────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Захиалга батлах */}
            <button
              onClick={handleConfirmOrders}
              disabled={selectedOrders.length === 0 || confirming || reducing}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Батлаж байна...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Захиалга батлах ({selectedOrders.length})
                </>
              )}
            </button>

            {/* Demo: Нөөц хасах */}
            <div className="relative">
              <div className="absolute -top-2 left-3 bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full z-10">
                DEMO
              </div>
              <button
                onClick={handleDemoReduce}
                disabled={confirming || reducing}
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {reducing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Хасаж байна...
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-4 h-4" />
                    Нөөц хасах
                  </>
                )}
              </button>
            </div>
          </div>

          {/* MBA зөвлөмж */}
          {mbaInsight && (
            <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
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

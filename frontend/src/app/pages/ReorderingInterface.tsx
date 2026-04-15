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
  Bell,
} from 'lucide-react';
import { Link } from 'react-router';
import { useInsights } from '../context/InsightsContext';
import { confirmOrders, adjustStock } from '../lib/api';
import type { ReorderingItem } from '../lib/api';

type ActionMsg = { type: 'success' | 'error'; text: string } | null;

export default function ReorderingInterface() {
  const { data, loading, refresh } = useInsights();
  const [orders, setOrders] = useState<ReorderingItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [reducing, setReducing] = useState(false);
  const [actionMsg, setActionMsg] = useState<ActionMsg>(null);

  useEffect(() => {
    setOrders(data?.reordering ?? []);
  }, [data?.reordering]);

  const toggleSelection = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, selected: !o.selected } : o))
    );
  };

  const selectAll = () => setOrders((prev) => prev.map((o) => ({ ...o, selected: true })));
  const deselectAll = () => setOrders((prev) => prev.map((o) => ({ ...o, selected: false })));

  const selectedOrders = orders.filter((o) => o.selected);
  const totalCost = selectedOrders.reduce((s, o) => s + o.suggestedOrderQty * o.unitCost, 0);
  const maxLeadTime = selectedOrders.length
    ? Math.max(...selectedOrders.map((o) => o.leadTime))
    : 0;

  // ── Захиалга батлах ────────────────────────────────────────────────────────
  const handleConfirmOrders = async () => {
    if (!selectedOrders.length) return;
    setConfirming(true);
    setActionMsg(null);
    try {
      const items = selectedOrders.map((o) => ({
        sku: o.sku,
        order_qty: o.suggestedOrderQty,
      }));
      const res = await confirmOrders(items);
      await refresh();
      setActionMsg({
        type: 'success',
        text: `✓ ${res.confirmed_count} барааны захиалга баталгаажлаа. Нөөц нэмэгдэж, alert-ууд арилсан.`,
      });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Захиалга баталгаажуулахад алдаа гарлаа.',
      });
    } finally {
      setConfirming(false);
    }
  };

  // ── Demo: Нөөц хасах (ROP-оос доош буулгах) ──────────────────────────────
  const handleDemoReduce = async () => {
    if (!selectedOrders.length) return;
    setReducing(true);
    setActionMsg(null);
    try {
      let done = 0;
      for (const o of selectedOrders) {
        // Нөөцийг ROP-ын 50%-д буулгана (тодорхой ROP-оос доош)
        const target = Math.max(0, Math.floor(o.dynamicROP * 0.5));
        const qty_change = target - o.currentStock;
        if (qty_change < 0) {
          await adjustStock(o.sku, qty_change, 'Demo: ROP тест');
          done++;
        }
      }
      await refresh();
      setActionMsg({
        type: 'error', // улаан өнгөөр харуулж alert гарсныг онцолно
        text: `⚠ ${done} барааны нөөц ROP-оос доош буулгасан. Шинэ alert-ууд үүслээ!`,
      });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Нөөц бууруулахад алдаа гарлаа.',
      });
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

  // Хэдэн бараа ROP-оос доош байгааг тоолно
  const belowRopCount = orders.filter((o) => o.currentStock < o.dynamicROP).length;

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

        {/* Demo flow алхам харуулах */}
        <Card className="p-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl border-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-medium">ROP Alert Demo</span>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${belowRopCount > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
                <span className="text-slate-300">
                  {belowRopCount > 0
                    ? `${belowRopCount} бараа ROP-оос доош`
                    : 'Бүх нөөц ROP-оос дээш'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${(data?.summary.active_alerts ?? 0) > 0 ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400'}`} />
                <span className="text-slate-300">
                  {data?.summary.active_alerts ?? 0} идэвхтэй alert
                </span>
              </div>
            </div>
          </div>
        </Card>

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
                  <th className="text-right py-3 px-4 text-sm text-slate-600">EOQ</th>
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
                {orders.map((order) => {
                  const isBelowRop = order.currentStock < order.dynamicROP;
                  return (
                    <tr
                      key={order.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                        order.selected ? 'bg-blue-50/50' : ''
                      } ${isBelowRop ? 'border-l-2 border-l-red-400' : ''}`}
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
                        <span className={isBelowRop ? 'text-red-600 font-semibold' : 'text-slate-800'}>
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
                          {isBelowRop && (
                            <span className="flex items-center gap-1 text-xs text-red-600">
                              <AlertTriangle className="w-3 h-3" />
                              Бага нөөц
                            </span>
                          )}
                          {getSeasonalityBadge(order.seasonality)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

          {/* Action feedback */}
          {actionMsg && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                actionMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {actionMsg.text}
            </div>
          )}

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

            {/* Demo: Нөөц хасах — ROP alert гарч ирэхийг харуулна */}
            <div className="relative">
              <div className="absolute -top-2 left-3 bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full z-10">
                DEMO
              </div>
              <button
                onClick={handleDemoReduce}
                disabled={selectedOrders.length === 0 || confirming || reducing}
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
                    Нөөц хасах → Alert гарах
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── Demo заавар ─────────────────────────────────────────────────── */}
          <div className="mt-5 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 font-medium mb-2">Demo дараалал:</p>
            <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
              <li>Бараанууд сонгоод <span className="text-blue-600 font-medium">Захиалга батлах</span></li>
              <li>Alert-ууд арилсныг Мэдэгдэл хуудаснаас харна</li>
              <li>Дахин сонгоод <span className="text-orange-600 font-medium">Нөөц хасах</span></li>
              <li>Шинэ ROP alert-ууд гарсныг шалгана</li>
            </ol>
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

import { useEffect, useMemo, useState } from 'react';
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
import type { BasketRule, ReorderingItem } from '../lib/api';

export default function ReorderingInterface() {
  const { data, loading } = useInsights();
  const [orders, setOrders] = useState<ReorderingItem[]>([]);

  useEffect(() => {
    setOrders(data?.reordering ?? []);
  }, [data?.reordering]);

  const toggleSelection = (id: string) => {
    setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, selected: !order.selected } : order)));
  };

  const selectAll = () => {
    setOrders((prev) => prev.map((order) => ({ ...order, selected: true })));
  };

  const deselectAll = () => {
    setOrders((prev) => prev.map((order) => ({ ...order, selected: false })));
  };

  const selectedOrders = useMemo(() => orders.filter((o) => o.selected), [orders]);
  const totalCost = selectedOrders.reduce((sum, o) => sum + o.suggestedOrderQty * o.unitCost, 0);
  const maxLeadTime = selectedOrders.length ? Math.max(...selectedOrders.map((o) => o.leadTime)) : 0;
  const topRule = (data?.market_basket_rules ?? []).reduce((best, rule) => {
    if (!best || rule.lift > best.lift) return rule;
    return best;
  }, null as BasketRule | null);

  const approveSelectedOrders = () => {
    setOrders((prev) => prev.map((order) => (order.selected ? { ...order, selected: false } : order)));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      AX: 'bg-emerald-500',
      AY: 'bg-teal-500',
      AZ: 'bg-cyan-500',
      BX: 'bg-blue-500',
      BY: 'bg-indigo-500',
      BZ: 'bg-violet-500',
      CX: 'bg-purple-500',
      CY: 'bg-pink-500',
      CZ: 'bg-rose-500',
    };
    return colors[category] || 'bg-gray-500';
  };

  if (loading) {
    return <Card className="p-6">Өгөгдөл ачааллаж байна...</Card>;
  }

  if (orders.length === 0) {
    return <Card className="p-6">Захиалгын өгөгдөл олдсонгүй.</Card>;
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-slate-800 text-2xl mb-1">Ухаалаг захиалгын систем</h2>
              <p className="text-sm text-slate-500">Үндсэн дата дээрх захиалгын санал</p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm transition-all">Бүгдийг сонгох</button>
              <button onClick={deselectAll} className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm transition-all">Цуцлах</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-2 text-sm text-slate-600"></th>
                  <th className="text-left py-3 px-4 text-sm text-slate-600">Бүтээгдэхүүн</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Одоогийн нөөц</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">ROP</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Санал тоо</th>
                  <th className="text-right py-3 px-4 text-sm text-slate-600">Нэгж үнэ</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className={`border-b border-slate-100 hover:bg-slate-50 ${order.selected ? 'bg-blue-50/50' : ''}`}>
                    <td className="py-4 px-2">
                      <input type="checkbox" checked={order.selected} onChange={() => toggleSelection(order.id)} className="w-4 h-4" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        {(order.triggerLinks.triggeredBy || order.triggerLinks.triggers?.length) && <Link2 className="w-4 h-4 text-purple-500" />}
                        <Link to={`/product/${order.id}`} className="hover:text-blue-600">
                          <div className="text-slate-800">{order.productName}</div>
                          <div className="text-xs text-slate-500">{order.sku}</div>
                        </Link>
                        <div className={`w-2 h-2 rounded-full ${getCategoryColor(order.category)}`}></div>
                      </div>
                    </td>
                    <td className={`py-4 px-4 text-right ${order.currentStock < order.dynamicROP ? 'text-red-600' : 'text-slate-800'}`}>{order.currentStock.toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-slate-800">{order.dynamicROP.toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-emerald-700">{order.suggestedOrderQty.toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-slate-800">₮{order.unitCost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

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
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-blue-600" /><span className="text-sm text-slate-600">Нийт үнэ</span></div>
              <div className="text-2xl text-blue-900">₮{totalCost.toLocaleString()}</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-emerald-600" /><span className="text-sm text-slate-600">Хүлээх хугацаа</span></div>
              <div className="text-2xl text-emerald-900">{maxLeadTime} хоног</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-purple-600" /><span className="text-sm text-slate-600">Хүргэх огноо</span></div>
              <div className="text-lg text-purple-900">
                {maxLeadTime > 0
                  ? new Date(Date.now() + maxLeadTime * 24 * 60 * 60 * 1000).toLocaleDateString('mn-MN')
                  : '-'}
              </div>
            </div>
            {selectedOrders.length === 0 && (
              <div className="text-xs text-slate-500 flex items-center gap-2"><AlertTriangle className="w-3 h-3" />Захиалга сонгоно уу</div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={approveSelectedOrders}
              disabled={selectedOrders.length === 0}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Бүх захиалгыг батлах ({selectedOrders.length})
            </button>

            <Link
              to="/notifications"
              className="block w-full px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all text-sm text-center"
            >
              Захиалгын түүхийг харах
            </Link>
          </div>

          <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600 mt-1" />
              <div>
                <div className="text-sm text-slate-800 mb-1">MBA зөвлөмж</div>
                <p className="text-xs text-slate-600">
                  {topRule
                    ? `${topRule.itemA} болон ${topRule.itemB} хослолын Lift ${topRule.lift.toFixed(1)}x байна. Хамт захиалбал ложистикийн зардал буурах боломжтой.`
                    : 'MBA дүрэм олдоогүй тул сонгосон бараануудын lead time ба ROP дээр тулгуурлан захиалгаа баталгаажуулна уу.'}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import { Card } from '../components/ui/card';
import {
  ArrowLeft,
  Package,
  TrendingUp,
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
    if (!fromReorder) return null;
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
  }, [data?.reordering, id]);

  const forecastData = data?.demand_forecast?.chart ?? [];

  const associatedProducts = useMemo(() => {
    if (!product) return [];
    const rules = data?.market_basket_rules ?? [];
    return rules
      .filter((r) => r.itemA === product.name || r.itemB === product.name)
      .map((r) => ({
        id: r.id,
        name: r.itemA === product.name ? r.itemB : r.itemA,
        support: r.support,
        confidence: r.confidence,
        lift: r.lift,
      }))
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 5);
  }, [data?.market_basket_rules, product]);

  const [useSystemRecommended, setUseSystemRecommended] = useState(true);
  const [manualSafetyStock, setManualSafetyStock] = useState<number | null>(null);
  const [manualLeadTime, setManualLeadTime] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Өгөгдөл ачааллаж байна...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-600">Бүтээгдэхүүн олдсонгүй</p>
        <Link to="/orders" className="text-blue-600 hover:underline mt-2 inline-block">
          Буцах
        </Link>
      </div>
    );
  }

  const effectiveSafetyStock = useSystemRecommended
    ? product.safetyStock
    : (manualSafetyStock ?? product.safetyStock);
  const effectiveLeadTime = useSystemRecommended
    ? product.leadTime
    : (manualLeadTime ?? product.leadTime);

  const getCategoryColor = (category: string) => {
    const cat = category.replace('-', '').toUpperCase();
    if (cat === 'AX') return 'bg-emerald-500';
    if (cat === 'AY') return 'bg-teal-500';
    if (cat === 'AZ') return 'bg-cyan-500';
    if (cat === 'BX') return 'bg-blue-500';
    if (cat === 'BY') return 'bg-indigo-500';
    if (cat === 'BZ') return 'bg-violet-500';
    return 'bg-gray-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/orders" className="p-2 hover:bg-slate-200 rounded-lg transition-all">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-6 h-6 text-slate-700" />
            <h1 className="text-3xl text-slate-800">{product.name}</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{product.sku}</span>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${getCategoryColor(product.category)}`} />
              <span className="text-sm text-slate-700">Ангилал: {product.category}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="text-xs text-slate-500 mb-1">Одоогийн нөөц</div>
          <div className="text-2xl text-slate-800">{product.currentStock.toLocaleString()}</div>
          <div className={`text-xs mt-1 ${product.currentStock < product.rop ? 'text-red-600' : 'text-emerald-600'}`}>
            {product.currentStock < product.rop ? 'Бага нөөц' : 'Хэвийн'}
          </div>
        </Card>
        <Card className="p-4 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="text-xs text-slate-500 mb-1">Аюулгүй нөөц</div>
          <div className="text-2xl text-slate-800">{effectiveSafetyStock.toLocaleString()}</div>
          <div className="text-xs mt-1 text-blue-600">
            {useSystemRecommended ? 'Системийн санал' : 'Гар захиалга'}
          </div>
        </Card>
        <Card className="p-4 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="text-xs text-slate-500 mb-1">ROP (Динамик)</div>
          <div className="text-2xl text-slate-800">{product.rop.toLocaleString()}</div>
          <div className="text-xs mt-1 text-purple-600">Prophet + MBA тооцоо</div>
        </Card>
        <Card className="p-4 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="text-xs text-slate-500 mb-1">Lead Time</div>
          <div className="text-2xl text-slate-800">{effectiveLeadTime} хоног</div>
          <div className="text-xs mt-1 text-orange-600">Дундаж хугацаа</div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Charts */}
        <div className="col-span-2 space-y-6">
          {/* Prophet Forecasting Chart */}
          <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-slate-800">Prophet эрэлтийн таамаглал</h3>
                <p className="text-sm text-slate-500">Улирлын болон баярын нөлөөлөл</p>
              </div>
            </div>

            {forecastData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400">
                Таамаглалын өгөгдөл байхгүй
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={forecastData}>
                    <defs>
                      <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg">
                              <div className="text-xs text-slate-500 mb-2">{d.month}</div>
                              {d.actual != null && (
                                <div className="text-sm text-blue-700">
                                  Бодит: {d.actual.toLocaleString()}
                                </div>
                              )}
                              {d.predicted != null && (
                                <div className="text-sm text-emerald-700">
                                  Таамаглал: {d.predicted.toLocaleString()}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="url(#confGrad)" fillOpacity={1} />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="#fff" fillOpacity={1} />
                    <Line type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={3} dot={{ fill: '#2563eb', r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-orange-600 mt-1" />
                    <p className="text-xs text-slate-600">
                      Цагаан сар болон Наадмын баяруудад эрэлт 20-35% нэмэгддэг. Урьдчилан нөөцлөхийг зөвлөж байна.
                    </p>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Association Network */}
          <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Network className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-slate-800">Хамааралын сүлжээ (MBA)</h3>
                <p className="text-sm text-slate-500">Хамт худалдан авагддаг бүтээгдэхүүн</p>
              </div>
            </div>

            {associatedProducts.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
                Холбоотой бүтээгдэхүүн олдсонгүй
              </div>
            ) : (
              <>
                <div className="relative h-64 bg-slate-50 rounded-lg p-6 mb-4">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-lg flex items-center justify-center border-4 border-white">
                      <div className="text-center">
                        <Package className="w-6 h-6 text-white mx-auto mb-1" />
                        <div className="text-xs text-white truncate px-2 font-medium">
                          {product.name.split(' ')[0]}
                        </div>
                      </div>
                    </div>
                  </div>
                  {associatedProducts.map((assoc, idx) => {
                    const angle = (idx / associatedProducts.length) * 2 * Math.PI;
                    const x = 50 + Math.cos(angle) * 35;
                    const y = 50 + Math.sin(angle) * 50;
                    return (
                      <div key={assoc.id}>
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                          <line x1="50%" y1="50%" x2={`${x}%`} y2={`${y}%`} stroke="#a855f7" strokeWidth="2.5" strokeDasharray="3 3" />
                        </svg>
                        <div
                          className="absolute w-20 h-20 bg-white rounded-full shadow-lg flex flex-col items-center justify-center border-2 border-purple-400 hover:scale-110 transition-all cursor-pointer group"
                          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          <div className="text-xs text-center px-2 text-slate-700 truncate w-full font-medium">
                            {assoc.name.split(' ')[0]}
                          </div>
                          <div className="text-xs text-purple-600 mt-1 font-semibold">{assoc.lift.toFixed(1)}x</div>
                          <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-20 shadow-xl">
                            <div className="font-medium">{assoc.name}</div>
                            <div className="text-purple-300">Lift: {assoc.lift.toFixed(2)}</div>
                            <div className="text-slate-300">Confidence: {(assoc.confidence * 100).toFixed(1)}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {associatedProducts.map((assoc) => (
                    <div key={assoc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-600" />
                        <span className="text-sm text-slate-800">{assoc.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div><span className="text-slate-500">Support: </span><span className="text-slate-800">{(assoc.support * 100).toFixed(1)}%</span></div>
                        <div><span className="text-slate-500">Conf: </span><span className="text-slate-800">{(assoc.confidence * 100).toFixed(1)}%</span></div>
                        <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded">Lift: {assoc.lift.toFixed(1)}x</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Right Column - Settings */}
        <div className="space-y-6">
          <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Settings className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h3 className="text-slate-800">Динамик нөөцийн тохиргоо</h3>
                <p className="text-sm text-slate-500">Системийн санал эсвэл гар захиалга</p>
              </div>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSystemRecommended}
                  onChange={(e) => setUseSystemRecommended(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm text-slate-800">Системийн санал ашиглах</div>
                  <div className="text-xs text-slate-500">AI болон Prophet-н таамаглал дээр үндэслэсэн</div>
                </div>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-600 mb-2 block">Аюулгүй нөөц (Safety Stock)</label>
                <input
                  type="number"
                  value={effectiveSafetyStock}
                  onChange={(e) => setManualSafetyStock(Number(e.target.value))}
                  disabled={useSystemRecommended}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
                {useSystemRecommended && (
                  <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Системийн санал: {product.safetyStock.toLocaleString()}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-2 block">Lead Time (хоног)</label>
                <input
                  type="number"
                  value={effectiveLeadTime}
                  onChange={(e) => setManualLeadTime(Number(e.target.value))}
                  disabled={useSystemRecommended}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
                {useSystemRecommended && (
                  <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Дундаж: {product.leadTime} хоног
                  </div>
                )}
              </div>
              {!useSystemRecommended && (
                <button className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all">
                  Өөрчлөлтийг хадгалах
                </button>
              )}
            </div>

            <div className="mt-6 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600 mt-1" />
                <div>
                  <div className="text-sm text-slate-800 mb-1">Системийн зөвлөмж</div>
                  <p className="text-xs text-slate-600">
                    Таны бүтээгдэхүүн "{product.category}" ангиллын. Системийн санал ашиглах нь тогтвортой нөөцийг хангана.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <h3 className="text-slate-800 mb-4">Түргэн үйлдлүүд</h3>
            <div className="space-y-2">
              <button className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all text-sm">
                Захиалга үүсгэх
              </button>
              <button className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all text-sm">
                Түүхийг харах
              </button>
              <Link
                to="/orders"
                className="block w-full px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-all text-sm text-center border border-slate-300"
              >
                Захиалгын хуудас руу буцах
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

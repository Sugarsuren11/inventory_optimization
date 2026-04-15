import { useState, useMemo } from 'react';
import { Card } from '../components/ui/card';
import {
  Package,
  Search,
  Filter,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useInsights } from '../context/InsightsContext';

const PAGE_SIZE = 50;

export default function InventoryOverview() {
  const { data, loading } = useInsights();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [page, setPage] = useState(1);

  const allProducts = useMemo(() => {
    return (data?.reordering ?? []).map((item) => ({
      id: item.id,
      name: item.productName,
      sku: item.sku,
      category: item.category,
      currentStock: item.currentStock,
      safetyStock: Math.round(item.dynamicROP * 0.5),
      leadTime: item.leadTime,
      rop: item.dynamicROP,
    }));
  }, [data?.reordering]);

  const categories = useMemo(() => {
    const cats = new Set(allProducts.map((p) => p.category));
    return ['all', ...Array.from(cats).sort()];
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    setPage(1);
    return allProducts.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [allProducts, searchQuery, selectedCategory]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const pagedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getStockStatus = (currentStock: number, rop: number) => {
    const percentage = (currentStock / rop) * 100;
    if (percentage < 50) {
      return { status: 'critical', label: 'Маш бага', color: 'text-red-600', bg: 'bg-red-50' };
    } else if (percentage < 100) {
      return { status: 'low', label: 'Бага', color: 'text-orange-600', bg: 'bg-orange-50' };
    } else {
      return { status: 'healthy', label: 'Хэвийн', color: 'text-emerald-600', bg: 'bg-emerald-50' };
    }
  };

  const getCategoryColor = (category: string) => {
    const cat = category.replace('-', '').toUpperCase();
    if (cat === 'AX') return '#10b981';
    if (cat === 'AY') return '#14b8a6';
    if (cat === 'AZ') return '#06b6d4';
    if (cat === 'BX') return '#3b82f6';
    if (cat === 'BY') return '#6366f1';
    if (cat === 'BZ') return '#8b5cf6';
    if (cat === 'CX') return '#64748b';
    if (cat === 'CY') return '#71717a';
    return '#94a3b8';
  };

  const stockSummary = useMemo(() => {
    const critical = filteredProducts.filter(
      (p) => getStockStatus(p.currentStock, p.rop).status === 'critical'
    ).length;
    const low = filteredProducts.filter(
      (p) => getStockStatus(p.currentStock, p.rop).status === 'low'
    ).length;
    const healthy = filteredProducts.filter(
      (p) => getStockStatus(p.currentStock, p.rop).status === 'healthy'
    ).length;
    return { critical, low, healthy };
  }, [filteredProducts]);

  // Chart: зөвхөн сонгосон хуудасны барааг харуулна (хэт олон бол удаан)
  const chartData = pagedProducts.map((p) => ({
    name: p.name.length > 15 ? p.name.substring(0, 12) + '...' : p.name,
    stock: p.currentStock,
    rop: p.rop,
    category: p.category,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Package className="w-7 h-7 text-slate-700" />
          <h1 className="text-3xl text-slate-800">Нөөцийн хяналт</h1>
        </div>
        <Card className="p-12 text-center">
          <p className="text-slate-500">Өгөгдөл ачааллаж байна...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-7 h-7 text-slate-700" />
            <h1 className="text-3xl text-slate-800">Нөөцийн хяналт</h1>
          </div>
          <p className="text-slate-500">Бүх барааны одоогийн нөөц болон ROP хэмжээ</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-5 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500 mb-1">Нийт бараа</div>
              <div className="text-3xl text-slate-800">{filteredProducts.length.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500 mb-1">Хэвийн нөөц</div>
              <div className="text-3xl text-emerald-600">{stockSummary.healthy.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-emerald-100 rounded-xl">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500 mb-1">Бага нөөц</div>
              <div className="text-3xl text-orange-600">{stockSummary.low.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-orange-100 rounded-xl">
              <TrendingDown className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-white shadow-md rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500 mb-1">Маш бага нөөц</div>
              <div className="text-3xl text-red-600">{stockSummary.critical.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-red-100 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-6 bg-white shadow-md rounded-xl border border-gray-200">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Бараа эсвэл SKU хайх..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="relative min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white cursor-pointer"
            >
              <option value="all">Бүх ангилал</option>
              {categories
                .filter((c) => c !== 'all')
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Stock vs ROP Chart */}
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-slate-800">Нөөц ба ROP харьцаа</h3>
            <p className="text-sm text-slate-500">
              Одоогийн хуудасны {pagedProducts.length} бараа харуулж байна
            </p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="stock" name="Одоогийн нөөц">
              {pagedProducts.map((product, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    product.currentStock < product.rop * 0.5
                      ? '#dc2626'
                      : product.currentStock < product.rop
                      ? '#f97316'
                      : getCategoryColor(product.category)
                  }
                />
              ))}
            </Bar>
            <Bar dataKey="rop" name="ROP түвшин" fill="#cbd5e1" opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Products Table */}
      <Card className="bg-white shadow-lg rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-800 to-blue-900 text-white">
              <tr>
                <th className="px-6 py-4 text-left text-sm">SKU</th>
                <th className="px-6 py-4 text-left text-sm">Барааны нэр</th>
                <th className="px-6 py-4 text-center text-sm">Ангилал</th>
                <th className="px-6 py-4 text-right text-sm">Одоогийн нөөц</th>
                <th className="px-6 py-4 text-right text-sm">ROP</th>
                <th className="px-6 py-4 text-right text-sm">Аюулгүй нөөц</th>
                <th className="px-6 py-4 text-center text-sm">Нөөцийн төлөв</th>
                <th className="px-6 py-4 text-center text-sm">ROP харьцаа</th>
                <th className="px-6 py-4 text-center text-sm">Үйлдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pagedProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    Бараа олдсонгүй
                  </td>
                </tr>
              )}
              {pagedProducts.map((product, index) => {
                const stockStatusInfo = getStockStatus(product.currentStock, product.rop);
                const ropPercentage = Math.min(
                  100,
                  Math.round((product.currentStock / product.rop) * 100)
                );

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-slate-600">{product.sku}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-800">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs text-white"
                        style={{ backgroundColor: getCategoryColor(product.category) }}
                      >
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-800">
                      {product.currentStock.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-800">
                      {product.rop.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-600">
                      {product.safetyStock.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${stockStatusInfo.color} ${stockStatusInfo.bg}`}
                      >
                        {stockStatusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-full max-w-[100px] bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ropPercentage < 50
                                ? 'bg-red-500'
                                : ropPercentage < 100
                                ? 'bg-orange-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${ropPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600">{ropPercentage}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        to={`/product/${product.id}`}
                        className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-all"
                      >
                        Дэлгэрэнгүй
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-500">
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(page * PAGE_SIZE, filteredProducts.length).toLocaleString()} /{' '}
              {filteredProducts.length.toLocaleString()} бараа
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-9 h-9 rounded-lg text-sm transition-all ${
                      pageNum === page
                        ? 'bg-blue-600 text-white shadow'
                        : 'border border-slate-300 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="text-sm text-slate-500">
              {page} / {totalPages} хуудас
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from 'recharts';
import {
  FlaskConical,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { fetchBacktesting, type BacktestingPayload } from '../lib/api';

export default function Backtesting() {
  const [data, setData] = useState<BacktestingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBacktesting()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Алдаа гарлаа'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="p-6 bg-indigo-100 rounded-full">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl text-slate-800 mb-2">Backtesting ажиллаж байна</h2>
          <p className="text-slate-500 max-w-md">
            MBA, Prophet, Stockout симуляц тооцоолж байна. 30–90 секунд зарцуулж болно.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          {['MBA дүрэм сургалт', 'Prophet таамаглал', 'Lift баталгаажуулалт', 'Stockout симуляц'].map((s) => (
            <div key={s} className="px-4 py-2 bg-slate-100 rounded-lg text-sm text-slate-500 animate-pulse">{s}</div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-6 bg-red-100 rounded-full">
          <AlertTriangle className="w-12 h-12 text-red-600" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl text-slate-800 mb-2">Алдаа гарлаа</h2>
          <p className="text-red-600 text-sm font-mono bg-red-50 px-4 py-2 rounded max-w-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { split_info, prophet_evaluation, mba_validation, stockout_simulation } = data;

  const mbaVal = mba_validation as typeof mba_validation & {
    lift_stability_pct?: number;
    top_substitute_validated?: Array<{
      itemA: string; itemB: string; train_lift: number;
      test_lift: number | null; lift_delta: number | null; is_valid: boolean;
    }>;
  };

  // Lift scatter chart дата: x=train_lift, y=test_lift
  const liftScatterData = (mbaVal.top_validated_rules ?? [])
    .filter((r) => r.test_lift != null)
    .map((r) => ({
      name: `${r.itemA} → ${r.itemB}`,
      train: r.train_lift,
      test: r.test_lift as number,
      delta: r.lift_delta,
      valid: (r as { is_valid?: boolean }).is_valid,
    }));

  // Lift bar chart дата
  const liftBarData = (mbaVal.top_validated_rules ?? [])
    .filter((r) => r.test_lift != null)
    .slice(0, 10)
    .map((r) => ({
      name:
        r.itemA.length > 18
          ? r.itemA.substring(0, 16) + '…'
          : r.itemA,
      train_lift: r.train_lift,
      test_lift: r.test_lift as number,
    }));

  // SS харьцуулалтын chart дата (уламжлалт vs MBA)
  const ssCompareData = stockout_simulation.detail.slice(0, 15).map((d) => ({
    name: d.product.length > 16 ? d.product.substring(0, 14) + '…' : d.product,
    traditional: d.baseline_ss,
    mba: d.mba_ss,
    eoq: d.eoq,
  }));

  // ROP харьцуулалтын chart дата
  const ropCompareData = stockout_simulation.detail.slice(0, 15).map((d) => ({
    name: d.product.length > 16 ? d.product.substring(0, 14) + '…' : d.product,
    traditional: d.baseline_rop,
    mba: d.mba_rop,
    dev: d.rop_deviation_pct,
  }));

  const validRules = (mbaVal.top_validated_rules ?? []).filter((r) => (r as { is_valid?: boolean }).is_valid).length;
  const totalTopRules = (mbaVal.top_validated_rules ?? []).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-100 rounded-xl">
          <FlaskConical className="w-7 h-7 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl text-slate-800">Backtesting үнэлгээ</h1>
          <p className="text-slate-500 text-sm mt-1">
            Train/Test хуваалтад суурилсан MBA болон Prophet загварын нарийвчлал
            {data.cached && <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded">cache</span>}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-blue-700">Train дата</span>
          </div>
          <div className="text-2xl text-blue-900">{split_info.train_rows.toLocaleString()}</div>
          <div className="text-xs text-blue-500 mt-1">{split_info.train_start} — {split_info.train_end}</div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-purple-700">Test дата</span>
          </div>
          <div className="text-2xl text-purple-900">{split_info.test_rows.toLocaleString()}</div>
          <div className="text-xs text-purple-500 mt-1">{split_info.test_start} — {split_info.test_end}</div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-emerald-700">Prophet MAPE</span>
          </div>
          <div className="text-2xl text-emerald-900">{prophet_evaluation.mape}%</div>
          <div className="text-xs text-emerald-500 mt-1">
            {prophet_evaluation.mape < 15 ? '✓ Сайн' : prophet_evaluation.mape < 30 ? '~ Хэвийн' : '✗ Муу'}
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
            <span className="text-xs text-indigo-700">MBA Lift тогтвортой</span>
          </div>
          <div className="text-2xl text-indigo-900">{mbaVal.lift_stability_pct ?? '—'}%</div>
          <div className="text-xs text-indigo-500 mt-1">
            {validRules}/{totalTopRules} дүрэм хүчтэй хэвээрээ
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            <span className="text-xs text-orange-700">Stockout бууралт</span>
          </div>
          <div className="text-2xl text-orange-900">
            {stockout_simulation.reduction_pct > 0 ? '-' : ''}{stockout_simulation.reduction_pct}%
          </div>
          <div className="text-xs text-orange-500 mt-1">MBA-тай vs MBA-гүй</div>
        </Card>
      </div>

      {/* MBA LIFT VALIDATION — гол блок */}
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-slate-800 text-xl">MBA дүрмийн зөв эсэх — Train vs Test Lift</h2>
            <p className="text-sm text-slate-500">
              Train дата дээр олсон lift утга тест датад ч хадгалагдсан бол MBA дүрэм найдвартай
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 mt-4">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <div className="text-3xl text-slate-800">{mbaVal.complementary_rules_tested}</div>
            <div className="text-xs text-slate-500 mt-1">Нийт дагалдах дүрэм</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
            <div className="text-3xl text-emerald-700">{mbaVal.complementary_hit_rate}%</div>
            <div className="text-xs text-slate-500 mt-1">Hit Rate (тестэд давтагдсан)</div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
            <div className="text-3xl text-indigo-700">{mbaVal.lift_stability_pct ?? '—'}%</div>
            <div className="text-xs text-slate-500 mt-1">Lift тогтвортой байдал</div>
          </div>
        </div>

        {/* Train vs Test Lift Bar Chart */}
        {liftBarData.length > 0 && (
          <>
            <h3 className="text-sm text-slate-600 mb-3">Train lift vs Test lift — Топ 10 дүрэм</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={liftBarData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(v: number, name: string) => [
                    v.toFixed(3),
                    name === 'train_lift' ? 'Train Lift' : 'Test Lift',
                  ]}
                />
                <Legend formatter={(v) => (v === 'train_lift' ? 'Train Lift' : 'Test Lift')} />
                <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: 'Lift=1', fill: '#94a3b8', fontSize: 11 }} />
                <Bar dataKey="train_lift" name="train_lift" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="test_lift"  name="test_lift"  fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Detailed rule table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-xs">
                <th className="text-left py-2 px-3 text-slate-500">Дүрэм (A → B)</th>
                <th className="text-right py-2 px-3 text-slate-500">Train Lift</th>
                <th className="text-right py-2 px-3 text-slate-500">Test Lift</th>
                <th className="text-right py-2 px-3 text-slate-500">Өөрчлөлт</th>
                <th className="text-center py-2 px-3 text-slate-500">Дүгнэлт</th>
              </tr>
            </thead>
            <tbody>
              {(mbaVal.top_validated_rules ?? []).map((rule, i) => {
                const r = rule as typeof rule & { test_lift?: number | null; lift_delta?: number | null; is_valid?: boolean };
                const testLift = r.test_lift;
                const delta    = r.lift_delta;
                const valid    = r.is_valid;
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <div className="text-slate-700 text-xs">
                        <span className="text-indigo-700">{rule.itemA}</span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className="text-emerald-700">{rule.itemB}</span>
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">
                        Conf: {(rule.train_confidence * 100).toFixed(1)}%
                        · Sup: {(rule.train_support * 100).toFixed(2)}%
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-indigo-700">{rule.train_lift.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right">
                      {testLift != null ? (
                        <span className={testLift > 1 ? 'text-emerald-700' : 'text-red-600'}>
                          {testLift.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-xs">
                      {delta != null ? (
                        <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          {delta >= 0 ? '+' : ''}{delta.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {testLift == null ? (
                        <span className="text-xs text-slate-400 flex items-center justify-center gap-1">
                          <Minus className="w-3 h-3" /> Тестэд байхгүй
                        </span>
                      ) : valid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Хүчинтэй
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                          <TrendingDown className="w-3 h-3" /> Суларсан
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(mbaVal.top_validated_rules ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Баталгаажсан дүрэм олдсонгүй
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Lift stability interpretation */}
        <div className="mt-4 p-4 rounded-lg border text-sm" style={{
          backgroundColor: (mbaVal.lift_stability_pct ?? 0) >= 70 ? '#f0fdf4' : (mbaVal.lift_stability_pct ?? 0) >= 50 ? '#fffbeb' : '#fef2f2',
          borderColor: (mbaVal.lift_stability_pct ?? 0) >= 70 ? '#bbf7d0' : (mbaVal.lift_stability_pct ?? 0) >= 50 ? '#fde68a' : '#fecaca',
        }}>
          <strong className="text-slate-700">Дүгнэлт: </strong>
          {(mbaVal.lift_stability_pct ?? 0) >= 70 ? (
            <span className="text-emerald-700">
              MBA дүрмүүд найдвартай — {mbaVal.lift_stability_pct}% нь тест датад ч lift &gt; 1 хэвээрээ байна.
              Энэ нь MBA-д суурилсан Safety Stock тооцоолол зөв гэдгийг нотолж байна.
            </span>
          ) : (mbaVal.lift_stability_pct ?? 0) >= 50 ? (
            <span className="text-yellow-700">
              MBA дүрмүүд дундаж тогтвортой байна ({mbaVal.lift_stability_pct}%). Зарим дүрэм тестэд суларсан тул
              Safety Stock тохиргоог нарийвчлах боломжтой.
            </span>
          ) : (
            <span className="text-red-700">
              MBA дүрмүүдийн {mbaVal.lift_stability_pct}% нь тестэд хүчинтэй — lift тогтворгүй байна.
              Илүү их дата эсвэл min_support босгыг өсгөж MBA-г дахин ажиллуулахыг зөвлөнө.
            </span>
          )}
        </div>
      </Card>

      {/* Prophet Chart */}
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-slate-800 text-xl">Prophet нарийвчлал — Actual vs Predicted</h2>
            <p className="text-sm text-slate-500">
              Train ({split_info.train_start} — {split_info.train_end}) дата дээр сургаж, тестийн {prophet_evaluation.monthly_comparison.length} сарыг таамаглав
            </p>
          </div>
          <div className="ml-auto px-4 py-2 bg-emerald-100 rounded-lg">
            <span className="text-emerald-700 text-sm">MAPE: {prophet_evaluation.mape}%</span>
          </div>
        </div>

        {prophet_evaluation.monthly_comparison.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Тестийн дата хангалтгүй</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={prophet_evaluation.monthly_comparison}>
                <defs>
                  <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gPred" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gConf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(v: number, name: string) => [
                    v?.toLocaleString(),
                    name === 'actual' ? 'Бодит' : name === 'predicted' ? 'Таамаглал' : name === 'upper' ? '95% Дээд' : '95% Доод',
                  ]}
                />
                <Legend formatter={(v) => ({ actual: 'Бодит', predicted: 'Таамаглал', upper: '95% Дээд', lower: '95% Доод' }[v] ?? v)} />
                <Area type="monotone" dataKey="upper"     stroke="#a78bfa" strokeWidth={0} fill="url(#gConf)" name="upper" />
                <Area type="monotone" dataKey="lower"     stroke="#a78bfa" strokeWidth={0} fill="#fff"        name="lower" />
                <Area type="monotone" dataKey="actual"    stroke="#3b82f6" strokeWidth={2.5} fill="url(#gActual)" name="actual"    dot={{ r: 5 }} />
                <Area type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={2.5} fill="url(#gPred)"   name="predicted" strokeDasharray="6 3" dot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-3 text-slate-500">Сар</th>
                    <th className="text-right py-2 px-3 text-slate-500">Бодит</th>
                    <th className="text-right py-2 px-3 text-slate-500">Таамаглал</th>
                    <th className="text-right py-2 px-3 text-slate-500">Алдаа %</th>
                    <th className="text-center py-2 px-3 text-slate-500">Үнэлгээ</th>
                  </tr>
                </thead>
                <tbody>
                  {prophet_evaluation.monthly_comparison.map((row) => (
                    <tr key={row.month} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-700">{row.month}</td>
                      <td className="py-2 px-3 text-right text-blue-700">{row.actual.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-emerald-700">{row.predicted.toLocaleString()}</td>
                      <td className={`py-2 px-3 text-right ${row.error_pct < 15 ? 'text-emerald-600' : row.error_pct < 30 ? 'text-orange-600' : 'text-red-600'}`}>
                        {row.error_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-center">
                        {row.error_pct < 15 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="w-3 h-3" /> Сайн
                          </span>
                        ) : row.error_pct < 30 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                            <Clock className="w-3 h-3" /> Дунд
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="w-3 h-3" /> Муу
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Уламжлалт vs MBA харьцуулалт */}
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-orange-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-slate-800 text-xl">Уламжлалт томьёо vs MBA — Иж бүрэн харьцуулалт</h2>
            <p className="text-sm text-slate-500">
              {stockout_simulation.products_simulated} бараа · тестийн {stockout_simulation.detail[0]?.n_days ?? '—'} өдөр ·
              SS = 1.65×σ_d×√L (уламжлалт) vs SS×lift_factor (MBA)
            </p>
          </div>
        </div>

        {/* 6 KPI */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <div className="text-xs text-slate-400 mb-1">Эрэлтийн MAPE</div>
            <div className="text-2xl text-slate-700">{prophet_evaluation.mape}%</div>
            <div className="text-xs text-slate-400 mt-0.5">Prophet</div>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
            <div className="text-xs text-slate-400 mb-1">MBA Lift тогтвор</div>
            <div className="text-2xl text-indigo-700">{mbaVal.lift_stability_pct ?? '—'}%</div>
            <div className="text-xs text-slate-400 mt-0.5">Тест vs Train</div>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-center">
            <div className="text-xs text-slate-400 mb-1">SS дундаж зөрүү</div>
            <div className="text-2xl text-purple-700">+{stockout_simulation.avg_ss_deviation_pct}%</div>
            <div className="text-xs text-slate-400 mt-0.5">MBA нэмэлт</div>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
            <div className="text-xs text-slate-400 mb-1">ROP дундаж зөрүү</div>
            <div className="text-2xl text-amber-700">+{stockout_simulation.avg_rop_deviation_pct}%</div>
            <div className="text-xs text-slate-400 mt-0.5">MBA нэмэлт</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <div className="text-xs text-slate-400 mb-1">Бодит SL уламжлалт</div>
            <div className={`text-2xl ${stockout_simulation.avg_achieved_sl_baseline >= 93 ? 'text-emerald-700' : 'text-red-600'}`}>
              {stockout_simulation.avg_achieved_sl_baseline}%
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Зорилт 95%</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
            <div className="text-xs text-slate-400 mb-1">Бодит SL MBA</div>
            <div className={`text-2xl ${stockout_simulation.avg_achieved_sl_mba >= 93 ? 'text-emerald-700' : 'text-orange-600'}`}>
              {stockout_simulation.avg_achieved_sl_mba}%
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Stockout -{stockout_simulation.reduction_pct}%
            </div>
          </div>
        </div>

        {/* Charts — SS болон ROP харьцуулалт */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Safety Stock */}
          <div>
            <h3 className="text-sm text-slate-600 mb-2">Safety Stock — Уламжлалт vs MBA</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ssCompareData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(v: number, name: string) => [
                    v.toFixed(1),
                    name === 'traditional' ? 'Уламжлалт SS' : 'MBA SS',
                  ]}
                />
                <Legend formatter={(v) => v === 'traditional' ? 'Уламжлалт SS' : 'MBA SS'} />
                <Bar dataKey="traditional" name="traditional" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="mba"         name="mba"         fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ROP */}
          <div>
            <h3 className="text-sm text-slate-600 mb-2">ROP — Уламжлалт vs MBA (EOQ нь ижил)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ropCompareData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(v: number, name: string) => [
                    name === 'dev' ? `${v > 0 ? '+' : ''}${v}%` : v,
                    name === 'traditional' ? 'Уламжлалт ROP' : name === 'mba' ? 'MBA ROP' : 'Зөрүү %',
                  ]}
                />
                <Legend formatter={(v) => v === 'traditional' ? 'Уламжлалт ROP' : 'MBA ROP'} />
                <Bar dataKey="traditional" name="traditional" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="mba"         name="mba"         fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Service Level chart */}
        {stockout_simulation.detail.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-slate-600 mb-2">
              Бодит Service Level % — Уламжлалт vs MBA (зорилт 95%)
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={stockout_simulation.detail.slice(0, 20).map((d) => ({
                  name: d.product.length > 16 ? d.product.substring(0, 14) + '…' : d.product,
                  traditional: d.achieved_sl_baseline,
                  mba: d.achieved_sl_mba,
                }))}
                margin={{ bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} angle={-35} textAnchor="end" height={70} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(v: number, name: string) => [`${v}%`, name === 'traditional' ? 'Уламжлалт SL' : 'MBA SL']}
                />
                <Legend formatter={(v) => v === 'traditional' ? 'Уламжлалт SL' : 'MBA SL'} />
                <ReferenceLine y={95} stroke="#f59e0b" strokeDasharray="5 3"
                  label={{ value: '95%', fill: '#f59e0b', fontSize: 11, position: 'insideTopRight' }} />
                <Bar dataKey="traditional" name="traditional" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="mba"         name="mba"         fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Иж бүрэн хүснэгт */}
        <div className="overflow-x-auto">
          <p className="text-xs text-slate-400 mb-2">
            ROP зөрүүгаар буурах дарааллаар · EOQ = √(2DS/H) — уламжлалт болон MBA-д ижил
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-500 bg-slate-50">
                <th className="text-left py-2 px-2">Бараа</th>
                <th className="text-center py-2 px-1">Cat</th>
                <th className="text-right py-2 px-1">d̄</th>
                <th className="text-right py-2 px-1">CV</th>
                <th className="text-right py-2 px-1">L</th>
                <th className="text-right py-2 px-1">EOQ</th>
                <th className="text-right py-2 px-1 text-slate-400">SS (улам)</th>
                <th className="text-right py-2 px-1 text-indigo-500">SS (MBA)</th>
                <th className="text-right py-2 px-1 text-purple-500">SS Δ%</th>
                <th className="text-right py-2 px-1 text-slate-400">ROP (улам)</th>
                <th className="text-right py-2 px-1 text-indigo-500">ROP (MBA)</th>
                <th className="text-right py-2 px-1 text-amber-500">ROP Δ%</th>
                <th className="text-right py-2 px-1">Lift×</th>
                <th className="text-right py-2 px-1 text-slate-400">SL улам</th>
                <th className="text-right py-2 px-1 text-indigo-500">SL MBA</th>
              </tr>
            </thead>
            <tbody>
              {stockout_simulation.detail.map((row, i) => {
                const baseOk = row.achieved_sl_baseline >= 93;
                const mbaOk  = row.achieved_sl_mba >= 93;
                const ssUp   = row.ss_deviation_pct > 0;
                const ropUp  = row.rop_deviation_pct > 0;
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-slate-700 max-w-[120px] truncate" title={row.product}>{row.product}</td>
                    <td className="py-1.5 px-1 text-center">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{row.category}</span>
                    </td>
                    <td className="py-1.5 px-1 text-right text-slate-500">{row.avg_daily}</td>
                    <td className="py-1.5 px-1 text-right text-slate-500">{row.cv}</td>
                    <td className="py-1.5 px-1 text-right text-slate-500">{row.lead_time}д</td>
                    <td className="py-1.5 px-1 text-right text-emerald-700">{row.eoq}</td>
                    <td className="py-1.5 px-1 text-right text-slate-400">{row.baseline_ss}</td>
                    <td className="py-1.5 px-1 text-right text-indigo-600">{row.mba_ss}</td>
                    <td className={`py-1.5 px-1 text-right ${ssUp ? 'text-indigo-600' : 'text-orange-500'}`}>
                      {ssUp ? '+' : ''}{row.ss_deviation_pct}%
                    </td>
                    <td className="py-1.5 px-1 text-right text-slate-500">{row.baseline_rop}</td>
                    <td className="py-1.5 px-1 text-right text-indigo-600">{row.mba_rop}</td>
                    <td className={`py-1.5 px-1 text-right ${ropUp ? 'text-amber-600' : 'text-orange-500'}`}>
                      {ropUp ? '+' : ''}{row.rop_deviation_pct}%
                    </td>
                    <td className="py-1.5 px-1 text-right">
                      <span className={row.lift_factor > 1 ? 'text-indigo-600' : row.lift_factor < 1 ? 'text-orange-600' : 'text-slate-400'}>
                        ×{row.lift_factor}
                      </span>
                    </td>
                    <td className={`py-1.5 px-1 text-right ${baseOk ? 'text-emerald-600' : 'text-red-500'}`}>
                      {row.achieved_sl_baseline}%
                    </td>
                    <td className={`py-1.5 px-1 text-right ${mbaOk ? 'text-emerald-600' : 'text-orange-500'}`}>
                      {row.achieved_sl_mba}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Нэгдсэн дүгнэлт */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div className={`p-3 rounded-lg border text-xs ${prophet_evaluation.mape < 20 ? 'bg-emerald-50 border-emerald-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="font-medium text-slate-700 mb-1">Эрэлтийн таамаглал</div>
            <span className={prophet_evaluation.mape < 20 ? 'text-emerald-700' : 'text-yellow-700'}>
              Prophet MAPE = {prophet_evaluation.mape}% →{' '}
              {prophet_evaluation.mape < 15 ? 'Сайн нарийвчлал' : prophet_evaluation.mape < 30 ? 'Хэвийн нарийвчлал' : 'Сайжруулах шаардлагатай'}
            </span>
          </div>
          <div className={`p-3 rounded-lg border text-xs ${stockout_simulation.avg_achieved_sl_baseline >= 90 ? 'bg-emerald-50 border-emerald-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="font-medium text-slate-700 mb-1">ROP & Safety Stock</div>
            <span className={stockout_simulation.avg_achieved_sl_baseline >= 90 ? 'text-emerald-700' : 'text-yellow-700'}>
              Уламжлалт SL {stockout_simulation.avg_achieved_sl_baseline}% →
              MBA +{stockout_simulation.avg_ss_deviation_pct}% SS →
              SL {stockout_simulation.avg_achieved_sl_mba}%
            </span>
          </div>
          <div className={`p-3 rounded-lg border text-xs ${(mbaVal.lift_stability_pct ?? 0) >= 70 ? 'bg-emerald-50 border-emerald-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="font-medium text-slate-700 mb-1">MBA дүрмийн үнэн зөв</div>
            <span className={(mbaVal.lift_stability_pct ?? 0) >= 70 ? 'text-emerald-700' : 'text-yellow-700'}>
              Hit rate {mbaVal.complementary_hit_rate}% · Lift тогтвор {mbaVal.lift_stability_pct}% →
              {(mbaVal.lift_stability_pct ?? 0) >= 70 ? ' Найдвартай' : ' Дунд зэрэг'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

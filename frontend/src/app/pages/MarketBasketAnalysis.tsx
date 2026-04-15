import { useMemo, useState } from 'react';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ShoppingCart, TrendingUp, Package, Search, ArrowUpDown, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useInsights } from '../context/InsightsContext';
import type { BasketRule } from '../lib/api';

type SortKey = 'lift' | 'confidence' | 'support';
type SortOrder = 'asc' | 'desc';
type RuleKind = 'complementary' | 'substitute';
type SupportMode = 'detailed' | 'balanced' | 'brief';

const MODE_LABELS: Record<SupportMode, string> = {
  detailed: 'Дэлгэрэнгүй',
  balanced: 'Тэнцвэртэй',
  brief:    'Товч',
};

const MODE_SUPPORT_PERCENTILE: Record<SupportMode, number> = {
  detailed: 0,
  balanced: 0.33,
  brief:    0.66,
};

function applyModeFilter(rules: BasketRule[], mode: SupportMode): BasketRule[] {
  if (rules.length === 0) return rules;
  if (mode === 'detailed') return rules;

  const sortedSupports = [...rules.map((r) => r.support)].sort((a, b) => a - b);
  const cutIdx = Math.floor(sortedSupports.length * MODE_SUPPORT_PERCENTILE[mode]);
  const minSupport = sortedSupports[cutIdx] ?? 0;
  const bySupport = rules.filter((r) => r.support >= minSupport);

  if (bySupport.length === 0) return rules;

  const filterGroup = (group: BasketRule[]): BasketRule[] => {
    if (group.length === 0) return group;
    const devs  = group.map((r) => Math.abs(r.lift - 1)).sort((a, b) => a - b);
    const confs = group.map((r) => r.confidence).sort((a, b) => a - b);
    const medDev  = devs[Math.floor(devs.length / 2)];
    const medConf = confs[Math.floor(confs.length / 2)];
    return group.filter((r) => Math.abs(r.lift - 1) >= medDev && r.confidence >= medConf);
  };

  const comp = bySupport.filter((r) => r.lift >= 1);
  const subs = bySupport.filter((r) => r.lift < 1);
  return [...filterGroup(comp), ...filterGroup(subs)];
}

const getRuleKind = (rule: BasketRule): RuleKind => {
  if (rule.ruleType) return rule.ruleType;
  return rule.lift < 1 ? 'substitute' : 'complementary';
};

export default function MarketBasketAnalysis() {
  const { data, loading } = useInsights();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy]           = useState<SortKey>('lift');
  const [sortOrder, setSortOrder]     = useState<SortOrder>('desc');
  const [activeTab, setActiveTab]     = useState<RuleKind>('complementary');
  const [mode, setMode]               = useState<SupportMode>('balanced');

  const allRules = data?.market_basket_rules ?? [];

  const modeFilteredRules = useMemo(
    () => applyModeFilter(allRules, mode),
    [allRules, mode],
  );

  const complementaryRules = useMemo(
    () => modeFilteredRules.filter((r) => getRuleKind(r) === 'complementary'),
    [modeFilteredRules],
  );
  const substituteRules = useMemo(
    () => modeFilteredRules.filter((r) => getRuleKind(r) === 'substitute'),
    [modeFilteredRules],
  );

  const currentRules = activeTab === 'complementary' ? complementaryRules : substituteRules;

  const filteredAndSortedRules = useMemo(() => {
    return currentRules
      .filter(
        (rule) =>
          rule.itemA.toLowerCase().includes(searchQuery.toLowerCase()) ||
          rule.itemB.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      .sort((a, b) => {
        const multiplier = sortOrder === 'asc' ? 1 : -1;
        return (a[sortBy] - b[sortBy]) * multiplier;
      });
  }, [currentRules, searchQuery, sortBy, sortOrder]);

  const avgConfidence = modeFilteredRules.length
    ? modeFilteredRules.reduce((sum, r) => sum + r.confidence, 0) / modeFilteredRules.length
    : 0;

  const getLiftColor = (lift: number) => {
    if (lift < 1) {
      if (lift <= 0.4) return 'text-red-600 bg-red-50';
      if (lift <= 0.6) return 'text-orange-600 bg-orange-50';
      return 'text-amber-600 bg-amber-50';
    } else {
      if (lift >= 2.5) return 'text-emerald-600 bg-emerald-50';
      if (lift >= 2.0) return 'text-blue-600 bg-blue-50';
      return 'text-slate-600 bg-slate-50';
    }
  };

  const getLiftBadge = (lift: number) => {
    if (lift < 1) {
      if (lift <= 0.4) return { label: 'Хүчтэй орлох', color: 'bg-red-500' };
      if (lift <= 0.6) return { label: 'Орлох', color: 'bg-orange-500' };
      return { label: 'Сул орлох', color: 'bg-amber-500' };
    } else {
      if (lift >= 2.5) return { label: 'Маш өндөр', color: 'bg-emerald-500' };
      if (lift >= 2.0) return { label: 'Өндөр', color: 'bg-blue-500' };
      return { label: 'Дунд', color: 'bg-slate-500' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-xl">
            <ShoppingCart className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-slate-800 text-2xl">Сагсны Шинжилгээ (MBA)</h1>
            <p className="text-slate-500">
              Market Basket Analysis - Хамт авагддаг ба орлох бүтээгдэхүүнүүдийн харилцан хамаарал
            </p>
          </div>
        </div>
      </div>

      {/* Mode selector */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 shrink-0">Харагдах хэмжээ:</span>
          <div className="flex gap-2">
            {(['detailed', 'balanced', 'brief'] as SupportMode[]).map((m) => (
              <Button
                key={m}
                variant={mode === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(m)}
              >
                {MODE_LABELS[m]}
              </Button>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-2">
            {mode === 'detailed' && 'Бүх дүрэм min_support > 1%'}
            {mode === 'balanced' && 'Дунд зэргийн support + динамик lift/confidence босго'}
            {mode === 'brief'    && 'Өндөр support + динамик lift/confidence босго'}
          </span>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="text-sm text-purple-700 mb-1">Нийт дүрэм</div>
          <div className="text-3xl text-purple-800">{modeFilteredRules.length}</div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="text-sm text-emerald-700 mb-1">Хамт зарагдах</div>
          <div className="text-3xl text-emerald-800">{complementaryRules.length}</div>
          <div className="text-xs text-emerald-600 mt-1">Lift &gt; 1</div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="text-sm text-orange-700 mb-1">Орлох бараа</div>
          <div className="text-3xl text-orange-800">{substituteRules.length}</div>
          <div className="text-xs text-orange-600 mt-1">Lift &lt; 1</div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="text-sm text-blue-700 mb-1">Дундаж Confidence</div>
          <div className="text-3xl text-blue-800">{(avgConfidence * 100).toFixed(0)}%</div>
        </Card>
      </div>

      {/* Tabs for Complementary vs Substitute */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RuleKind)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="complementary" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Хамт зарагдах бараа ({complementaryRules.length})
          </TabsTrigger>
          <TabsTrigger value="substitute" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Орлох бараа ({substituteRules.length})
          </TabsTrigger>
        </TabsList>

        {(['complementary', 'substitute'] as RuleKind[]).map((kind) => (
          <TabsContent key={kind} value={kind} className="space-y-4">
            {/* Search + sort toolbar */}
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Бүтээгдэхүүн хайх..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-slate-500" />
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Эрэмбэлэх" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lift">Lift</SelectItem>
                      <SelectItem value="confidence">Confidence</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    <TrendingUp
                      className={`w-4 h-4 transition-transform ${
                        sortOrder === 'asc' ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Rules List */}
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-slate-800">
                  Дүрмүүд ({filteredAndSortedRules.length})
                </h2>
                {kind === 'complementary' ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      Маш өндөр
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      Өндөр
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                      Дунд
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      Хүчтэй орлох
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      Орлох
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      Сул орлох
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {loading && <p className="text-sm text-slate-500">Өгөгдөл ачааллаж байна...</p>}
                {!loading && filteredAndSortedRules.length === 0 && (
                  <p className="text-sm text-slate-500">Дүрэм олдсонгүй.</p>
                )}
                {filteredAndSortedRules.map((rule) => {
                  const badge = getLiftBadge(rule.lift);
                  return (
                    <div
                      key={rule.id}
                      className={`p-4 bg-slate-50 rounded-lg border border-slate-200 hover:shadow-md transition-all cursor-pointer ${
                        kind === 'complementary'
                          ? 'hover:border-slate-400'
                          : 'hover:border-orange-400'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-slate-600" />
                            <span className="text-slate-800">{rule.itemA}</span>
                          </div>
                          <div className={`text-lg font-bold ${kind === 'complementary' ? 'text-emerald-500' : 'text-orange-500'}`}>
                            {kind === 'complementary' ? '+' : '⇄'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-slate-600" />
                            <span className="text-slate-800">{rule.itemB}</span>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs text-white ${badge.color}`}>
                          {badge.label}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <div className="text-xs text-slate-500 mb-1">Support</div>
                          <div className="text-slate-800">
                            {(rule.support * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Хамт авагдах давтамж
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <div className="text-xs text-slate-500 mb-1">Confidence</div>
                          <div className="text-slate-800">
                            {(rule.confidence * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Хамааралын магадлал
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                            {kind === 'complementary' ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            Lift
                          </div>
                          <div className={`px-2 py-1 rounded ${getLiftColor(rule.lift)}`}>
                            {rule.lift.toFixed(2)}x
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {kind === 'complementary' ? 'Хамааралын хүч' : 'Орлох хүч'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Insights */}
            {kind === 'complementary' ? (
              <Card className="p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border-emerald-200">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-slate-800 mb-2">Зөвлөмж ба дүгнэлт (Хамт зарагдах)</h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5"></div>
                        <span>
                          <strong>Lift үзүүлэлт өндөр бүтээгдэхүүнүүдийг хамт байрлуулах</strong> нь
                          борлуулалтыг нэмэгдүүлнэ.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5"></div>
                        <span>
                          <strong>Cross-selling стратеги</strong> боловсруулахдаа confidence өндөр
                          дүрмүүдийг ашигла.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5"></div>
                        <span>
                          <strong>Багцын урамшуулал</strong> үүсгэхдээ lift 2.5-аас дээш дүрмүүдийг
                          сонгоно.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-6 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <AlertTriangle className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-slate-800 mb-2">Зөвлөмж ба дүгнэлт (Орлох бараа)</h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5"></div>
                        <span>
                          <strong>Орлох барааг ойр ойр байрлуулахгүй байх</strong> - хэрэглэгч хоёрын
                          аль нэгийг л сонгох учраас зай авч байрлуулах нь зүйтэй.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5"></div>
                        <span>
                          <strong>Үнийн өрсөлдөөнийг ашиглах</strong> - орлох бараануудын нэгийг
                          урамшуулалд оруулах нь хэрэглэгчдийн анхааралыг татна.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5"></div>
                        <span>
                          <strong>Нөөцийн удирдлага</strong> - орлох бараа байвал хоёулаа нь өндөр
                          нөөцтэй байх шаардлагагүй.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

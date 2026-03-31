import { Card } from './ui/card';
import { Button } from './ui/button';
import { ShoppingCart, TrendingUp, Package, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { BasketRule } from '../lib/api';

interface MarketBasketInsightsProps {
  rules?: BasketRule[];
  loading?: boolean;
}

export function MarketBasketInsights({ rules = [], loading = false }: MarketBasketInsightsProps) {
  const navigate = useNavigate();
  
  if (loading && rules.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">Өгөгдөл ачааллаж байна...</p>
      </Card>
    );
  }

  if (!loading && rules.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">MBA дүрэм олдсонгүй.</p>
      </Card>
    );
  }
  
  const getLiftColor = (lift: number) => {
    if (lift >= 2.5) return 'text-emerald-600 bg-emerald-50';
    if (lift >= 2.0) return 'text-blue-600 bg-blue-50';
    return 'text-slate-600 bg-slate-50';
  };

  const getLiftBadge = (lift: number) => {
    if (lift >= 2.5) return { label: 'Маш өндөр', color: 'bg-emerald-500' };
    if (lift >= 2.0) return { label: 'Өндөр', color: 'bg-blue-500' };
    return { label: 'Дунд', color: 'bg-slate-500' };
  };

  // Show only top 3 rules
  const topRules = rules.slice(0, 3);

  return (
    <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <ShoppingCart className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-slate-800">Сагсны Шинжилгээ (MBA)</h3>
            <p className="text-sm text-slate-500">Хамт авагддаг бүтээгдэхүүнүүд</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Нийт дүрэм</div>
          <div className="text-2xl text-slate-800">{rules.length}</div>
        </div>
      </div>

      <div className="space-y-3">
        {topRules.map((rule) => {
          const badge = getLiftBadge(rule.lift);
          return (
            <div
              key={rule.id}
              className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-400 transition-all cursor-pointer"
              onClick={() => navigate('/market-basket')}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-600" />
                    <span className="text-slate-800">{rule.itemA}</span>
                  </div>
                  <div className="text-slate-400">→</div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-600" />
                    <span className="text-slate-800">{rule.itemB}</span>
                  </div>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs text-white ${badge.color}`}
                >
                  {badge.label}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Support</div>
                  <div className="text-sm text-slate-800">
                    {(rule.support * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Confidence</div>
                  <div className="text-sm text-slate-800">
                    {(rule.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Lift
                  </div>
                  <div className={`text-sm px-2 py-1 rounded ${getLiftColor(rule.lift)}`}>
                    {rule.lift.toFixed(1)}x
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        onClick={() => navigate('/market-basket')}
        className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white"
      >
        <span>Бүх дүрмүүдийг харах</span>
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>

      <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="text-sm text-slate-800 mb-1">Зөвлөмж</div>
            <p className="text-xs text-slate-600">
              Lift үзүүлэлт өндөр бүтээгдэхүүнүүдийг хамт байрлуулах нь борлуулалтыг
              нэмэгдүүлнэ. Жишээ: Шампунь болон бальзамыг зэргэлдүүлэн байрлуулна уу.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
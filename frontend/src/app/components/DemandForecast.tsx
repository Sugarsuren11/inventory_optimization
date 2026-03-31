import { Card } from './ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import type { DemandForecastPoint, DemandForecastSummary } from '../lib/api';

interface DemandForecastProps {
  chart?: DemandForecastPoint[];
  summary?: DemandForecastSummary;
  loading?: boolean;
}

export function DemandForecast({ chart = [], summary, loading = false }: DemandForecastProps) {
  if (loading && chart.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">Өгөгдөл ачааллаж байна...</p>
      </Card>
    );
  }

  if (!loading && chart.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">Өгөгдөл олдсонгүй.</p>
      </Card>
    );
  }

  const historicalData = chart || [];
  return (
    <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-slate-800 mb-1">Эрэлтийн Таамаглал (Prophet)</h3>
          <p className="text-sm text-slate-500">Өнгөрсөн болон ирээдүйн борлуулалт</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span className="text-xs text-slate-600">Бодит</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-slate-600">Таамаглал</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-200/40"></div>
            <span className="text-xs text-slate-600">Итгэлийн интервал</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={historicalData}>
          <defs>
            <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="month"
            tick={{ fill: '#64748b', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="url(#confidenceGradient)"
            fillOpacity={1}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#fff"
            fillOpacity={1}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#2563eb"
            strokeWidth={3}
            dot={{ fill: '#2563eb', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="#10b981"
            strokeWidth={3}
            strokeDasharray="5 5"
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="text-xs text-blue-600 mb-1">Одоогийн сар</div>
          <div className="text-2xl text-blue-900">{summary?.current_month?.toLocaleString() || '-'}</div>
          <div className="text-xs text-blue-600 mt-1">ширхэг</div>
        </div>
        <div className="p-4 bg-emerald-50 rounded-lg">
          <div className="text-xs text-emerald-600 mb-1">Дараагийн сарын таамаглал</div>
          <div className="text-2xl text-emerald-900">{summary?.next_month_prediction?.toLocaleString() || '-'}</div>
          <div className="text-xs text-emerald-600 mt-1">({summary ? `${summary.growth_pct > 0 ? '+' : ''}${summary.growth_pct}%` : '-'})</div>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg">
          <div className="text-xs text-purple-600 mb-1">Нарийвчлал</div>
          <div className="text-2xl text-purple-900">{summary?.mape?.toFixed(1)}%</div>
          <div className="text-xs text-purple-600 mt-1">MAPE үзүүлэлт</div>
        </div>
      </div>
    </Card>
  );
}

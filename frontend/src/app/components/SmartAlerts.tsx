import { Card } from './ui/card';
import { AlertTriangle, Package, TrendingDown, Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router';
import type { AlertItem } from '../lib/api';

interface SmartAlertsProps {
  alerts?: AlertItem[];
  loading?: boolean;
}

export function SmartAlerts({ alerts = [], loading = false }: SmartAlertsProps) {
  if (loading && alerts.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">Өгөгдөл ачааллаж байна...</p>
      </Card>
    );
  }

  if (!loading && alerts.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">Сэрэмжлүүлэг байхгүй.</p>
      </Card>
    );
  }

  const getAlertStyle = (type: AlertItem['type']) => {
    switch (type) {
      case 'critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: 'text-red-600',
          iconBg: 'bg-red-100',
          button: 'bg-red-600 hover:bg-red-700 text-white',
        };
      case 'warning':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          icon: 'text-amber-600',
          iconBg: 'bg-amber-100',
          button: 'bg-amber-600 hover:bg-amber-700 text-white',
        };
      case 'success':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          icon: 'text-emerald-600',
          iconBg: 'bg-emerald-100',
          button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        };
    }
  };

  const getIcon = (type: AlertItem['type']) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5" />;
      case 'warning':
        return <TrendingDown className="w-5 h-5" />;
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
    }
  };

  const sortedAlerts = [...alerts].sort((a, b) => a.priority - b.priority);

  return (
    <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-slate-800">Ухаалаг Сэрэмжлүүлэг</h3>
            <p className="text-sm text-slate-500">AI-н зөвлөмж ба анхааруулга</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs">
            {alerts.filter((a) => a.type === 'critical').length} Яаралтай
          </div>
          <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs">
            {alerts.filter((a) => a.type === 'warning').length} Анхааруулга
          </div>
        </div>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
        {sortedAlerts.map((alert) => {
          const style = getAlertStyle(alert.type);
          return (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border-2 ${style.bg} ${style.border} transition-all hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${style.iconBg} ${style.icon} flex-shrink-0`}>
                  {getIcon(alert.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 uppercase tracking-wide">
                      {alert.category}
                    </span>
                    <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-400">Саяхан</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-slate-600" />
                    <span className="text-slate-800">{alert.product}</span>
                  </div>
                  <p className="text-sm text-slate-700 mb-3">{alert.message}</p>
                  {alert.action && (
                    <Link to="/orders">
                      <button
                        className={`px-4 py-2 rounded-lg text-sm transition-all ${style.button} shadow-sm`}
                      >
                        {alert.action}
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-slate-800">Синхрончлогдсон захиалгын санал</div>
              <p className="text-xs text-slate-500">
                MBA болон Prophet-н үр дүн дээр үндэслэн
              </p>
            </div>
          </div>
          <Link to="/orders">
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all shadow-sm">
              Санал үзэх
            </button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

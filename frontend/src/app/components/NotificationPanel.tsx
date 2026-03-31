import { AlertTriangle, Package, TrendingDown, Clock, CheckCircle, X } from 'lucide-react';
import { Link } from 'react-router';
import { useInsights } from '../context/InsightsContext';
import type { AlertItem } from '../lib/api';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { data } = useInsights();
  const alerts = data?.alerts ?? [];

  if (!isOpen) return null;

  const getAlertStyle = (type: AlertItem['type']) => {
    switch (type) {
      case 'critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: 'text-red-600',
          iconBg: 'bg-red-100',
        };
      case 'warning':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          icon: 'text-amber-600',
          iconBg: 'bg-amber-100',
        };
      case 'success':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          icon: 'text-emerald-600',
          iconBg: 'bg-emerald-100',
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
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-slate-800 text-xl">Мэдэгдлүүд</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs">
              {alerts.filter((a) => a.type === 'critical').length} Яаралтай
            </div>
            <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs">
              {alerts.filter((a) => a.type === 'warning').length} Анхааруулга
            </div>
            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs">
              {alerts.filter((a) => a.type === 'success').length} Санал
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {sortedAlerts.map((alert) => {
            const style = getAlertStyle(alert.type);
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border-2 ${style.bg} ${style.border} transition-all hover:shadow-md cursor-pointer`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${style.iconBg} ${style.icon} flex-shrink-0`}>
                    {getIcon(alert.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-500 uppercase tracking-wide">
                        {alert.category}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400">Саяхан</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <span className="text-sm text-slate-800 truncate">{alert.product}</span>
                    </div>
                    <p className="text-sm text-slate-700 mb-3 leading-relaxed">{alert.message}</p>
                    {alert.action && (
                      <Link to="/orders" onClick={onClose}>
                        <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition-all shadow-sm">
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

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <Link
            to="/notifications"
            onClick={onClose}
            className="block w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all text-sm text-center"
          >
            Бүх мэдэгдлийг унших
          </Link>
        </div>
      </div>
    </>
  );
}
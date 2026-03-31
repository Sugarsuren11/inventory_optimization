import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card } from '../components/ui/card';
import {
  ArrowLeft,
  AlertCircle,
  TrendingUp,
  Package,
  CheckCircle,
  Bell,
  Filter,
  Search,
} from 'lucide-react';
import { useInsights } from '../context/InsightsContext';
import type { AlertItem } from '../lib/api';

type NotificationType = 'critical' | 'warning' | 'info' | 'success';

interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  product?: string;
  action?: { label: string; link: string };
}

function mapAlertToNotification(alert: AlertItem): NotificationView {
  const mappedType: NotificationType =
    alert.type === 'critical' ? 'critical' : alert.type === 'warning' ? 'warning' : 'success';

  return {
    id: alert.id,
    type: mappedType,
    title: alert.category,
    message: alert.message,
    product: alert.product,
    action: alert.action ? { label: alert.action, link: '/orders' } : undefined,
  };
}

export default function Notifications() {
  const { data, loading } = useInsights();
  const [filterType, setFilterType] = useState<'all' | NotificationType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [readIds, setReadIds] = useState<Record<string, boolean>>({});

  const notifications = useMemo(() => {
    const alerts = data?.alerts ?? [];
    return alerts.map(mapAlertToNotification);
  }, [data?.alerts]);

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <TrendingUp className="w-5 h-5 text-orange-600" />;
      case 'info':
        return <Package className="w-5 h-5 text-blue-600" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-600" />;
      default:
        return <Bell className="w-5 h-5 text-slate-600" />;
    }
  };

  const getTypeBgColor = (type: NotificationType) => {
    switch (type) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-orange-50 border-orange-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
      case 'success':
        return 'bg-emerald-50 border-emerald-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  const markAsRead = (id: string) => {
    setReadIds((prev) => ({ ...prev, [id]: true }));
  };

  const markAllAsRead = () => {
    const next: Record<string, boolean> = {};
    notifications.forEach((n) => {
      next[n.id] = true;
    });
    setReadIds(next);
  };

  const filteredNotifications = notifications.filter((notif) => {
    const isRead = !!readIds[notif.id];
    if (filterType !== 'all' && notif.type !== filterType) return false;
    if (showUnreadOnly && isRead) return false;
    if (
      searchQuery &&
      !notif.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !notif.message.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !readIds[n.id]).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-slate-200 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <Bell className="w-7 h-7 text-slate-700" />
              <h1 className="text-3xl text-slate-800">Бүх мэдэгдлүүд</h1>
              {unreadCount > 0 && (
                <span className="px-3 py-1 bg-red-500 text-white text-sm rounded-full">{unreadCount} шинэ</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">Нийт {notifications.length} мэдэгдэл</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all text-sm">
            Бүгдийг унших
          </button>
        )}
      </div>

      <Card className="p-4 bg-white shadow-md rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[280px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Мэдэгдэл хайх..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as 'all' | NotificationType)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
              <option value="all">Бүгд</option>
              <option value="critical">Онцгой</option>
              <option value="warning">Анхааруулга</option>
              <option value="info">Мэдээлэл</option>
              <option value="success">Амжилттай</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showUnreadOnly} onChange={(e) => setShowUnreadOnly(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-slate-700">Зөвхөн уншаагүй</span>
          </label>
        </div>
      </Card>

      <div className="space-y-3">
        {loading && <Card className="p-6">Өгөгдөл ачааллаж байна...</Card>}
        {!loading && filteredNotifications.length === 0 && <Card className="p-6">Мэдэгдэл олдсонгүй.</Card>}

        {filteredNotifications.map((notif) => {
          const isRead = !!readIds[notif.id];
          return (
            <Card key={notif.id} className={`p-4 border ${getTypeBgColor(notif.type)} ${isRead ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div>{getTypeIcon(notif.type)}</div>
                  <div>
                    <div className="text-slate-800">{notif.title}</div>
                    {notif.product && <div className="text-xs text-slate-500 mt-1">{notif.product}</div>}
                    <p className="text-sm text-slate-700 mt-2">{notif.message}</p>
                    <div className="text-xs text-slate-400 mt-2">Саяхан</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isRead && (
                    <button onClick={() => markAsRead(notif.id)} className="px-3 py-1 text-xs rounded bg-slate-200 hover:bg-slate-300">
                      Уншсан
                    </button>
                  )}
                  {notif.action && (
                    <Link to={notif.action.link} className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                      {notif.action.label}
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

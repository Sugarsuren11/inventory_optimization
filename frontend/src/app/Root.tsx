import { Outlet, Link, useLocation } from "react-router";
import { useState } from "react";
import {
  BarChart3,
  Bell,
  Package,
  ShoppingCart,
  Activity,
  Network,
} from "lucide-react";
import { NotificationPanel } from "./components/NotificationPanel";
import { useInsights } from "./context/InsightsContext";

export default function Root() {
  const location = useLocation();
  const [isNotificationOpen, setIsNotificationOpen] =
    useState(false);
  const { data } = useInsights();
  const summary = data?.summary;
  const alertCount = data?.alerts?.length ?? 0;
  const generatedAt = data?.meta?.generated_at;

  const formattedGeneratedAt = generatedAt
    ? new Date(generatedAt < 1_000_000_000_000 ? generatedAt * 1000 : generatedAt).toLocaleString('mn-MN')
    : '-';

  const navItems = [
    { path: "/", label: "Dashboard", icon: BarChart3 },
    { path: "/inventory", label: "Нөөцийн хяналт", icon: Package },
    { path: "/orders", label: "Захиалга", icon: ShoppingCart },
    { path: "/market-basket", label: "MBA Шинжилгээ", icon: Network },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 shadow-lg border-b border-slate-700">
        <div className="max-w-[1440px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500 rounded-xl shadow-lg">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-white text-3xl">
                  Агуулахын Нөөцийг Оновчтой Удирдах Систем
                </h1>
                <p className="text-blue-200 text-sm mt-1">
                  MBA+ABC-XYZ+Prophet+ROP+EOQ
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-blue-200">
                  Сүүлд шинэчлэгдсэн
                </div>
                <div className="text-white text-sm">
                  {formattedGeneratedAt}
                </div>
              </div>
              <button
                onClick={() => setIsNotificationOpen(true)}
                className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all relative"
              >
                <Bell className="w-5 h-5 text-white" />
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                  {alertCount}
                </div>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex gap-2 mt-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
                    isActive
                      ? "bg-blue-500 text-white shadow-lg"
                      : "bg-slate-800/50 text-blue-200 hover:bg-slate-700"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Stats Bar - only on dashboard */}
          {location.pathname === "/" && (
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Package className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-200">
                      Нийт бүтээгдэхүүн
                    </div>
                    <div className="text-white text-xl">
                      {summary?.total_products?.toLocaleString() || "-"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-200">
                      Нарийвчлал (MAPE)
                    </div>
                    <div className="text-white text-xl">
                      {summary ? `${summary.mape}%` : "-"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-200">
                      MBA дүрэм
                    </div>
                    <div className="text-white text-xl">
                      {summary?.mba_rules?.toLocaleString() || "-"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <Bell className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-200">
                      Идэвхтэй сэрэмжлүүлэг
                    </div>
                    <div className="text-white text-xl">{summary?.active_alerts ?? alertCount}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-8">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div>
              © 2026 Intelligence Hub. Бүх эрх хуулиар
              хамгаалагдсан.
            </div>
            <div className="flex gap-6">
              <a
                href="#"
                className="hover:text-slate-700 transition-colors"
              >
                Тусламж
              </a>
              <a
                href="#"
                className="hover:text-slate-700 transition-colors"
              >
                API документ
              </a>
              <a
                href="#"
                className="hover:text-slate-700 transition-colors"
              >
                Холбоо барих
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Notification Panel */}
      <NotificationPanel
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </div>
  );
}
import { createBrowserRouter, Navigate } from "react-router";
import Root from "./Root";
import Dashboard from "./pages/Dashboard";
import ReorderingInterface from "./pages/ReorderingInterface";
import ProductDetail from "./pages/ProductDetail";
import Notifications from "./pages/Notifications";
import MarketBasketAnalysis from "./pages/MarketBasketAnalysis";
import InventoryOverview from "./pages/InventoryOverview";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "orders", element: <ReorderingInterface /> },
      { path: "product/:id", element: <ProductDetail /> },
      { path: "notifications", element: <Notifications /> },
      { path: "market-basket", element: <MarketBasketAnalysis /> },
      { path: "inventory", element: <InventoryOverview /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
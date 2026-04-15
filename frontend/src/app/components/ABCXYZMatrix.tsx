import { useState } from "react";
import { Card } from "./ui/card";
import type { MatrixItem } from "../lib/api";

interface ABCXYZMatrixProps {
  data?: MatrixItem[];
  loading?: boolean;
}

const categories = [
  {
    id: "AX",
    label: "AX",
    color: "bg-emerald-500",
    desc: "Өндөр ач холбогдол, Бага хэлбэлзэл",
  },
  {
    id: "AY",
    label: "AY",
    color: "bg-teal-500",
    desc: "Өндөр ач холбогдол, Дунд хэлбэлзэл",
  },
  {
    id: "AZ",
    label: "AZ",
    color: "bg-cyan-500",
    desc: "Өндөр ач холбогдол, Өндөр хэлбэлзэл",
  },
  {
    id: "BX",
    label: "BX",
    color: "bg-blue-500",
    desc: "Дунд ач холбогдол, Бага хэлбэлзэл",
  },
  {
    id: "BY",
    label: "BY",
    color: "bg-indigo-500",
    desc: "Дунд ач холбогдол, Дунд хэлбэлзэл",
  },
  {
    id: "BZ",
    label: "BZ",
    color: "bg-violet-500",
    desc: "Дунд ач холбогдол, Өндөр хэлбэлзэл",
  },
  {
    id: "CX",
    label: "CX",
    color: "bg-purple-500",
    desc: "Бага ач холбогдол, Бага хэлбэлзэл",
  },
  {
    id: "CY",
    label: "CY",
    color: "bg-pink-500",
    desc: "Бага ач холбогдол, Дунд хэлбэлзэл",
  },
  {
    id: "CZ",
    label: "CZ",
    color: "bg-rose-500",
    desc: "Бага ач холбогдол, Өндөр хэлбэлзэл",
  },
];

export function ABCXYZMatrix({
  data = [],
  loading = false,
}: ABCXYZMatrixProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    string | null
  >(null);

  const displayData = data;

  const getCategoryColor = (category: string) => {
    return (
      categories.find((c) => c.id === category)?.color ||
      "bg-gray-500"
    );
  };

  const filteredData = selectedCategory
    ? displayData.filter(
        (item) => item.category === selectedCategory
      )
    : displayData;

  if (loading) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">
          Өгөгдөл ачааллаж байна...
        </p>
      </Card>
    );
  }

  if (displayData.length === 0) {
    return (
      <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
        <p className="text-sm text-slate-500">
          Өгөгдөл олдсонгүй.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-slate-800">ABC-XYZ Ангилал</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 text-sm rounded-lg transition-all ${
              selectedCategory === null
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Бүгд
          </button>
        </div>
      </div>

      {/* 3x3 Grid View */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {["X", "Y", "Z"].map((varLevel) =>
          ["A", "B", "C"].map((valLevel) => {
            const cat = `${valLevel}${varLevel}`;
            const categoryInfo = categories.find(
              (c) => c.id === cat
            );
            const count = displayData.filter(
              (item) => item.category === cat
            ).length;

            return (
              <div
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCategory === cat
                    ? "border-slate-800 shadow-md scale-105"
                    : "border-gray-200 hover:border-gray-400 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-3 h-3 rounded-full ${categoryInfo?.color}`}
                  ></div>
                  <span className="text-slate-800">{cat}</span>
                </div>
                <div className="text-xs text-slate-600 mb-2">
                  {categoryInfo?.desc}
                </div>
                <div className="text-2xl text-slate-800">
                  {count}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  бүтээгдэхүүн
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Scatter Plot Simulation */}
      <div className="relative h-80 bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-xs text-slate-500">
          Хэлбэлзэл (Variability)
        </div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-slate-500">
          Ач холбогдол (Value)
        </div>

        {/* Grid Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <line
            x1="33%"
            y1="0"
            x2="33%"
            y2="100%"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <line
            x1="66%"
            y1="0"
            x2="66%"
            y2="100%"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <line
            x1="0"
            y1="33%"
            x2="100%"
            y2="33%"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <line
            x1="0"
            y1="66%"
            x2="100%"
            y2="66%"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        </svg>

        {/* Data Points */}
        {filteredData.map((item) => (
          <div
            key={item.id}
            className={`absolute w-3 h-3 rounded-full ${getCategoryColor(
              item.category
            )} shadow-md hover:scale-150 transition-transform cursor-pointer`}
            style={{
              left: `${item.variability}%`,
              bottom: `${item.value}%`,
            }}
            title={`${item.name} (${item.category})`}
          ></div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-2 text-xs"
          >
            <div
              className={`w-3 h-3 rounded-full ${cat.color}`}
            ></div>
            <span className="text-slate-600">{cat.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

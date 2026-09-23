"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from "chart.js";
import type { DayMetrics } from "@/types";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
);

export default function MetricsChart({ days }: { days: DayMetrics[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const labels = days.map((d) =>
      new Date(d.day).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
      }),
    );
    const values = days.map((d) => d.total_conversations);

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Consultas",
            data: values,
            borderColor: "#8a0c3c",
            backgroundColor: "rgba(138, 12, 60, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [days]);

  return (
    <div className="h-64 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

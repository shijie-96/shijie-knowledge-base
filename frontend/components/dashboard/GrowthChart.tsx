"use client";

import { useEffect } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { isAliveChart, useEChartsChart } from "@/hooks/useEChartsChart";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

interface GrowthChartProps {
  /** 图表标题 */
  title: string;
  /** 副标题（数据口径说明） */
  subtitle?: string;
  /** X 轴日期 */
  days: string[];
  /** 系列数据 */
  series: Array<{
    name: string;
    data: number[];
    color?: string;
  }>;
}

/** 近 30 天趋势折线图（基于 ECharts，客户端渲染） */
export default function GrowthChart({
  title,
  subtitle,
  days,
  series,
}: GrowthChartProps) {
  // init / ResizeObserver / 卸载 dispose 由 useEChartsChart 统一安全托管
  const { wrapRef, chartRef } = useEChartsChart();

  useEffect(() => {
    const chart = chartRef.current;
    if (!isAliveChart(chart)) return;
    const option: EChartsCoreOption = {
      color: series.map((s) => s.color ?? "#6366f1"),
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderWidth: 0,
        textStyle: { color: "#f1f5f9", fontSize: 12 },
      },
      legend: {
        top: 2,
        right: 4,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: "#94a3b8", fontSize: 11 },
      },
      grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: days,
        axisLine: { lineStyle: { color: "#334155" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          formatter: (v: string) => v.slice(5),
        },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: "#1e293b", type: "dashed" } },
        axisLabel: { color: "#64748b", fontSize: 10 },
      },
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        smooth: true,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.08 },
        data: s.data,
      })),
    };
    chart.setOption(option, true);
  }, [days, series]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-mist-800 dark:text-mist-200">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-mist-400 dark:text-mist-500">{subtitle}</p>
        )}
      </div>
      <div ref={wrapRef} className="h-52 w-full" />
    </div>
  );
}

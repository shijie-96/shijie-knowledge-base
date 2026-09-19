"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";

export type EChartsInstance = ReturnType<typeof echarts.init>;

/**
 * 判断 ECharts 实例是否仍存活（未被 dispose / 容器未分离）。
 *
 * dispose 后 ECharts/zrender 的 isDisposed() 在某些销毁路径上仍返回 false，
 * 因此同时校验 getDom()，任何异常一律按“已失效”处理。
 */
export function isAliveChart(c: EChartsInstance | null | undefined): c is EChartsInstance {
  if (!c) return false;
  try {
    return !(c.isDisposed?.() ?? false) && Boolean(c.getDom?.());
  } catch {
    return false;
  }
}

/**
 * ECharts 实例生命周期安全托管。
 *
 * 为什么需要它：图表组件反复挂载/卸载（视图切换、路由跳转、React StrictMode 二次挂载）
 * 时，ResizeObserver / 事件回调 / 数据更新极易命中“已 dispose 的旧实例”，在 ECharts 内部
 * 抛空指针错误（曾见 "Cannot read properties of null (reading '0')" / "reading
 * 'setTemplate'" 等），且这些错误发生在异步回调里，外层 try/catch 根本拦不到。
 *
 * 统一防御约定：
 * 1. 只有 chartRef 持有当前实例，dispose 时先置 null，杜绝任何残留闭包再拿到旧实例；
 * 2. ResizeObserver 回调每次经 isAliveChart 校验，内部异常就地吞掉，不抛到页面；
 * 3. 卸载清理先断 observer，再 dispatch hideTip 把“显示中”的 tooltip DOM 同步摘掉
 *    （避免其内部 show/hide 定时器在实例销毁后空转），最后 dispose，全程 try/catch。
 *
 * 用法：wrapRef 绑定到“始终渲染”的容器 div；数据更新 effect 里先判 isAliveChart。
 */
export function useEChartsChart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const chart = echarts.init(wrap);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      const c = chartRef.current;
      if (!isAliveChart(c)) return;
      try {
        c.resize();
      } catch {
        // 实例内部状态异常（销毁中/已清空），放弃本次调整并清除引用
        chartRef.current = null;
      }
    });
    observer.observe(wrap);

    return () => {
      observer.disconnect();
      const c = chartRef.current;
      chartRef.current = null; // 先置空，杜绝后续任何回调再命中旧实例
      if (!isAliveChart(c)) return;
      try {
        // 同步摘掉仍在显示的 tooltip，避免其内部动画/定时器在销毁后空转报错
        c.dispatchAction({ type: "hideTip" });
      } catch {
        /* 忽略：销毁路径上的内部错误不上抛 */
      }
      try {
        c.dispose();
      } catch {
        /* 忽略：实例已在销毁路径上 */
      }
    };
    // init/dispose 只在首次挂载做一次；chartRef 为 ref，无闭包过期问题
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { wrapRef, chartRef };
}

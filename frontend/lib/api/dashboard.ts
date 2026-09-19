import { http } from "@/lib/axios";
import type {
  DashboardOverview,
  DashboardTrends,
  RecordShareParams,
} from "@/types";

/** 数据总览（GET /user/me/dashboard） */
export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const { data } = await http.get<DashboardOverview>("/user/me/dashboard");
  return data;
}

/** 近 30 天趋势（GET /user/me/dashboard/trends） */
export async function fetchDashboardTrends(): Promise<DashboardTrends> {
  const { data } = await http.get<DashboardTrends>("/user/me/dashboard/trends");
  return data;
}

/** 分享事件埋点（POST /user/me/dashboard/share） */
export async function recordShareEvent(
  params: RecordShareParams = {},
): Promise<void> {
  await http.post("/user/me/dashboard/share", params);
}

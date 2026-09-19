import { http } from "@/lib/axios";
import type {
  NotificationListParams,
  NotificationListResult,
} from "@/types";

/**
 * 消息中心 API
 * 全平台系统通知（不做私信，产品红线 1）。
 */

/** 通知列表（支持分类/类型筛选与分页，返回未读总数） */
export async function fetchNotifications(
  params: NotificationListParams = {},
): Promise<NotificationListResult> {
  const { data } = await http.get<NotificationListResult>("/notifications", {
    params,
  });
  return data;
}

/** 未读数量 */
export async function fetchUnreadCount(): Promise<{ count: number }> {
  const { data } = await http.get<{ count: number }>(
    "/notifications/unread-count",
  );
  return data;
}

/** 单条标记已读 */
export async function readNotification(
  id: string,
): Promise<{ id: string; isRead: boolean }> {
  const { data } = await http.put<{ id: string; isRead: boolean }>(
    `/notifications/${id}/read`,
  );
  return data;
}

/** 全部标记已读 */
export async function readAllNotifications(): Promise<{ updated: number }> {
  const { data } = await http.put<{ updated: number }>(
    "/notifications/read-all",
  );
  return data;
}

/** 删除单条通知 */
export async function deleteNotification(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  const { data } = await http.delete<{ id: string; deleted: boolean }>(
    `/notifications/${id}`,
  );
  return data;
}

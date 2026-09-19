import { http } from "@/lib/axios";
import type {
  PublicProfileResult,
  PublicSort,
  VisitStatsResult,
} from "@/types";

/**
 * 获取公开主页数据（访客视角，未登录可访问）。
 * @param userId 被访问用户 ID
 * @param sort 排序方式：latest=最新 / hot=最热 / reuse=复用最多
 */
export async function fetchPublicProfile(
  userId: string,
  sort?: PublicSort,
): Promise<PublicProfileResult> {
  const { data } = await http.get<PublicProfileResult>(
    `/users/${userId}/public_profile`,
    {
      params: sort ? { sort } : undefined,
    },
  );
  return data;
}

/** 获取自己的访问数据（需登录） */
export async function fetchMyVisitStats(): Promise<VisitStatsResult> {
  const { data } = await http.get<VisitStatsResult>("/users/me/visit_stats");
  return data;
}

import { http } from "@/lib/axios";
import type {
  AtomInteractionStatus,
  FavoriteResult,
  FollowResult,
  InteractionUser,
  LikeResult,
  MyFavoriteItem,
  UserInteractionStatus,
} from "@/types";

/** 点赞（仅公开原子） */
export async function likeAtom(id: string): Promise<LikeResult> {
  const { data } = await http.post<LikeResult>(`/atoms/${id}/like`);
  return data;
}

/** 取消点赞 */
export async function unlikeAtom(id: string): Promise<LikeResult> {
  const { data } = await http.delete<LikeResult>(`/atoms/${id}/like`);
  return data;
}

/** 收藏（仅公开原子，不导入素材池） */
export async function favoriteAtom(id: string): Promise<FavoriteResult> {
  const { data } = await http.post<FavoriteResult>(`/atoms/${id}/favorite`);
  return data;
}

/** 取消收藏 */
export async function unfavoriteAtom(id: string): Promise<FavoriteResult> {
  const { data } = await http.delete<FavoriteResult>(`/atoms/${id}/favorite`);
  return data;
}

/** 当前用户对某原子的互动状态（点赞 / 收藏） */
export async function fetchAtomInteractionStatus(
  id: string,
): Promise<AtomInteractionStatus> {
  const { data } = await http.get<AtomInteractionStatus>(
    `/atoms/${id}/interaction_status`,
  );
  return data;
}

/** 关注某人 */
export async function followUser(userId: string): Promise<FollowResult> {
  const { data } = await http.post<FollowResult>(`/users/${userId}/follow`);
  return data;
}

/** 取消关注 */
export async function unfollowUser(userId: string): Promise<FollowResult> {
  const { data } = await http.delete<FollowResult>(
    `/users/${userId}/follow`,
  );
  return data;
}

/** 与某用户的互动状态（是否关注 + 关注 / 粉丝数） */
export async function fetchUserInteractionStatus(
  userId: string,
): Promise<UserInteractionStatus> {
  const { data } = await http.get<UserInteractionStatus>(
    `/users/${userId}/interaction_status`,
  );
  return data;
}

/** 我的收藏列表 */
export async function fetchMyFavorites(): Promise<MyFavoriteItem[]> {
  const { data } = await http.get<MyFavoriteItem[]>("/users/me/favorites");
  return data;
}

/** 我的关注列表 */
export async function fetchMyFollowing(): Promise<InteractionUser[]> {
  const { data } = await http.get<InteractionUser[]>("/users/me/following");
  return data;
}

/** 我的粉丝列表 */
export async function fetchMyFollowers(): Promise<InteractionUser[]> {
  const { data } = await http.get<InteractionUser[]>("/users/me/followers");
  return data;
}

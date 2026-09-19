import { http } from "@/lib/axios";
import type {
  AuthorizationRecord,
  AuthorizationRequestInput,
  AuthorizationRequestResult,
  HandleAuthorizationInput,
  HandleAuthorizationResult,
} from "@/types";

/** 发起授权申请（访问他人私有原子） */
export async function requestAuthorization(
  atomId: string,
  input: AuthorizationRequestInput,
): Promise<AuthorizationRequestResult> {
  const { data } = await http.post<AuthorizationRequestResult>(
    `/atoms/${atomId}/authorization_request`,
    input,
  );
  return data;
}

/** 所有者查看收到的授权申请列表（可按状态筛选） */
export async function fetchMyAuthorizationRequests(
  status?: string,
): Promise<AuthorizationRecord[]> {
  const { data } = await http.get<AuthorizationRecord[]>(
    "/users/me/authorization_requests",
    {
      params: status ? { status } : undefined,
    },
  );
  return data;
}

/** 处理授权申请：同意（设置有效期天数）或拒绝 */
export async function handleAuthorization(
  id: string,
  input: HandleAuthorizationInput,
): Promise<HandleAuthorizationResult> {
  const { data } = await http.put<HandleAuthorizationResult>(
    `/authorizations/${id}`,
    input,
  );
  return data;
}

/** 撤销授权 */
export async function revokeAuthorization(
  id: string,
): Promise<HandleAuthorizationResult> {
  const { data } = await http.post<HandleAuthorizationResult>(
    `/authorizations/${id}/revoke`,
  );
  return data;
}

/**
 * JWT 载荷类型。
 * sub: 用户 ID；phone: 手机号。
 */
export interface JwtPayload {
  sub: string;
  phone: string;
}

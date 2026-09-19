import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 授权状态常量 */
export const AUTH_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

/** 发起授权申请 */
export class CreateAuthorizationRequestDto {
  /** 申请理由 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

/** 处理授权申请：同意（设置有效期天数）或拒绝 */
export class HandleAuthorizationDto {
  /** 处理动作：approve=同意 / reject=拒绝 */
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  /** 同意时设置的有效期天数（1-365），拒绝时忽略 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays?: number;
}

import { SetMetadata } from '@nestjs/common';

/** 标记接口为公开（无需 JWT）的元数据键 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() 装饰器：标记接口跳过 JWT 全局鉴权。
 * 用于登录/注册/发送验证码等公开接口。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

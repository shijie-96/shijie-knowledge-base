import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_PAGE_SIZE_DEFAULT,
  NOTIFICATION_PAGE_SIZE_MAX,
  NOTIFICATION_TYPE,
} from './notification.constants';

/**
 * 通知列表查询参数
 * GET /notifications
 */
export class ListNotificationsQueryDto {
  /** 按通知类型筛选（reference/question/answer/authorization/like/favorite/follow/digest_remind） */
  @IsOptional()
  @IsIn(Object.values(NOTIFICATION_TYPE))
  type?: string;

  /** 按分类筛选（all/reference/question/authorization/system） */
  @IsOptional()
  @IsIn(Object.values(NOTIFICATION_CATEGORY))
  category?: string;

  /** 页码，从 1 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 每页条数（1~50） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_PAGE_SIZE_MAX)
  pageSize?: number;

  /** 归一化后的页码（未传时使用默认值） */
  get pageNumber(): number {
    return Math.max(1, this.page ?? 1);
  }

  /** 归一化后的每页条数（未传时使用默认值） */
  get pageSizeNumber(): number {
    return Math.min(
      NOTIFICATION_PAGE_SIZE_MAX,
      Math.max(1, this.pageSize ?? NOTIFICATION_PAGE_SIZE_DEFAULT),
    );
  }
}

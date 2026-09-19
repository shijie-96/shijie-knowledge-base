import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * 全量导出请求 DTO
 *
 * 产品红线：所有会员等级均支持全量导出，无等级限制。
 * 导出格式固定为 Markdown + HTML 通用包，不提供格式选择（保证完整、可离线浏览）。
 */
export class CreateExportDto {
  /** 预留字段：请求的格式（默认 full 全量包） */
  @IsOptional()
  @IsString()
  @IsIn(['full'])
  format?: string;
}

/** 导出任务状态 */
export type ExportStatus = 'processing' | 'completed' | 'failed';

/**
 * 导出任务 DTO（对外返回，不含敏感内部字段）
 * - exportId: 导出任务 ID，用于查询状态与获取下载链接
 * - status: processing / completed / failed
 * - progress: 0~100，异步任务进度
 * - message: 进度/失败说明
 * - downloadUrl: 完成后的下载链接（带过期时间）
 * - expiresAt: 链接过期时间
 * - stats: 包内数据统计（原子数 / 版本数 / 引用数）
 */
export interface ExportTaskDto {
  exportId: string;
  status: ExportStatus;
  progress: number;
  message: string;
  downloadUrl: string | null;
  expiresAt: string | null;
  error?: string;
  stats: {
    atomCount: number;
    versionCount: number;
    referenceCount: number;
    fileSizeBytes: number;
  };
  createdAt: string;
  completedAt: string | null;
}

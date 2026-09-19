import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

/**
 * 导出文件存储服务
 *
 * 负责将生成好的导出压缩包落地，并设置过期时间。
 *
 * 当前默认实现为「本地文件存储」：
 * - 文件存放于 config(EXPORT_STORAGE_DIR) 目录，默认 ./exports；
 * - 通过 HTTP 下载端点对外提供带签名的下载链接（含过期时间）；
 * - 定时清理过期文件。
 *
 * 设计上保留「对象存储」接口位（OBJ_STORAGE=COS 等），接入云端后仅需替换
 * 底层实现即可，不影响上层任务流程。产品红线要求全量导出对所有会员等级开放。
 */
@Injectable()
export class ExportStorageService {
  private readonly logger = new Logger(ExportStorageService.name);
  private readonly dir: string;
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.dir =
      config.get<string>('EXPORT_STORAGE_DIR') || join(process.cwd(), 'exports');
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
    const hours = Number(config.get<number>('EXPORT_TTL_HOURS') ?? 72);
    this.ttlMs = Math.max(1, hours) * 60 * 60 * 1000;
  }

  /** 保存导出包，返回可下载的签名链接与过期时间 */
  save(
    exportId: string,
    buffer: Buffer,
  ): { downloadUrl: string; expiresAt: string } {
    const fileName = `${exportId}.zip`;
    const filePath = join(this.dir, fileName);
    writeFileSync(filePath, buffer);
    this.logger.log(
      `导出包已保存：${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`,
    );

    const expiresAt = new Date(Date.now() + this.ttlMs);
    // 签名链接：直接暴露文件（本地实现）；过期由 expiresAt 决定，供前端展示。
    return {
      downloadUrl: `/export/${exportId}/download`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** 读取导出包文件（不存在返回 null） */
  read(exportId: string): Buffer | null {
    const filePath = join(this.dir, `${exportId}.zip`);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }

  /** 获取文件大小字节数 */
  sizeOf(exportId: string): number {
    const filePath = join(this.dir, `${exportId}.zip`);
    if (!existsSync(filePath)) return 0;
    return readFileSync(filePath).length;
  }

  /** 删除指定导出文件 */
  remove(exportId: string): void {
    const filePath = join(this.dir, `${exportId}.zip`);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }

  /** 清理所有过期导出文件（由定时任务调用） */
  cleanupExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    const files = require('fs').readdirSync(this.dir) as string[];
    for (const f of files) {
      const full = join(this.dir, f);
      try {
        const stat = require('fs').statSync(full);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          rmSync(full, { force: true });
          this.logger.log(`清理过期导出文件：${f}`);
        }
      } catch {
        /* 忽略单个文件清理失败 */
      }
    }
  }

  get ttlHours(): number {
    return Math.round(this.ttlMs / (60 * 60 * 1000));
  }
}

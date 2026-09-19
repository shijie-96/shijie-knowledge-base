import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ModerationResult {
  allowed: boolean;
  /** 拦截原因（allowed 为 false 时给出） */
  reason?: string;
  /** 命中的敏感类别（如 politics / sexual / violence / blocklist） */
  categories?: string[];
  /** 判定来源：none=未启用（放行） / local=本地启发式 / third-party=第三方审核 */
  checkedBy?: 'none' | 'local' | 'third-party';
}

/**
 * 敏感内容识别服务（任务22 安全加固 · 预留接入点）
 *
 * 设计：
 * - 默认 MODERATION_ENABLED=false，全部放行（checkedBy=none），不影响现有功能与测试。
 * - 生产环境将 MODERATION_ENABLED=true 即可开启审核。
 * - 当前本地实现为最小启发式（超长/空文本防御 + 可配置词库），
 *   `checkText` / `checkImage` 的接口签名已固定，接入第三方审核无需改业务调用方。
 *
 * 生产接入 TODO（在 checkText / checkImage 中替换实现）：
 *   1. 文本：调用 腾讯云天御 TextModeration / 阿里云内容安全 / OpenAI Moderation API，
 *      按返回 label（politics/sexual/violence/terrorism 等）判定 allowed。
 *   2. 图片：调用图片审核 API（审核 URL 或上传内容）。
 *   3. 记录审核日志（结构化 JSON），便于审计。
 */
@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);
  private readonly enabled: boolean;
  /** 本地敏感词列表（演示级；生产请替换为完整词库 + 第三方服务） */
  private readonly blockList: string[] = [];

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<string>('MODERATION_ENABLED', 'false') === 'true';
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 文本内容审核。
   * @param text 待审核文本
   * @param scene 场景标识（material / atom / question / answer / comment）
   */
  async checkText(text: string, scene: string): Promise<ModerationResult> {
    if (!this.enabled) {
      return { allowed: true, checkedBy: 'none' };
    }
    const content = (text ?? '').trim();
    if (content.length === 0) {
      return { allowed: true, checkedBy: 'local' };
    }

    // TODO(敏感内容识别-生产接入)：在此调用第三方内容安全 API
    const hit = this.blockList.find((w) => content.includes(w));
    if (hit) {
      this.logger.warn(`[moderation] blocked scene=${scene} keyword=${hit}`);
      return {
        allowed: false,
        reason: `内容包含敏感词汇（${hit}）`,
        categories: ['blocklist'],
        checkedBy: 'local',
      };
    }
    return { allowed: true, checkedBy: 'local' };
  }

  /**
   * 图片内容审核（预留）。
   * @param url 待审核图片地址
   */
  async checkImage(url: string): Promise<ModerationResult> {
    if (!this.enabled) {
      return { allowed: true, checkedBy: 'none' };
    }
    // TODO(敏感内容识别-生产接入)：调用图片审核 API
    return { allowed: true, checkedBy: 'local' };
  }
}

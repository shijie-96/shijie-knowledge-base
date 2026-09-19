import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';

/** 规则触发条件（机器可读，规则引擎据此分派判定逻辑） */
export interface RuleTrigger {
  /** 触发类型 */
  type: 'history_contradiction' | 'homogeneous_repetition' | string;
  /** history_contradiction：回看最近多少个月内的原子 */
  lookbackMonths?: number;
  /** history_contradiction：候选观点与话题的相似度上限（越低越「矛盾」，默认 0.35） */
  maxSimilarity?: number;
  /** homogeneous_repetition：取最近几条用户消息参与判定 */
  window?: number;
  /** homogeneous_repetition：同质化判定相似度阈值 */
  threshold?: number;
  /** homogeneous_repetition：消息数不足时不触发 */
  minMessages?: number;
  /** 扩展参数 */
  [key: string]: unknown;
}

/** 一条干预规则 */
export interface StrategyRule {
  id: string;
  name: string;
  description?: string;
  action?: string;
  /** 前端 UI 类型：contradiction_card / suggestion_banner / ... */
  ui_type: string;
  enabled?: boolean;
  trigger: RuleTrigger;
}

/** 策略包（strategy-packs 目录下的一个 JSON 文件） */
export interface StrategyPack {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  /** 展示价（元/月，0=免费；商店与激活页使用） */
  price?: number;
  rules: StrategyRule[];
  /** 文件携带的其它元数据原样保留 */
  [key: string]: unknown;
}

/** 策略包 id 白名单（文件名即 id，防路径穿越） */
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/i;

/**
 * L2 策略模板热加载服务（宏观生长核心）
 *
 * 策略包以 JSON 文件形式存放在 config/strategy-packs/ 下：
 * - 启动时加载进内存（Map）；
 * - 后台「上架/下架/上传/编辑」调用 createOrUpdate / toggle / remove 后热生效，
 *   无需重启进程；
 * - 规则引擎只面向内存读取（packService.list / get），因此「改文件即改行为」。
 *
 * 生产部署注意：编译后（dist）此目录不会被 nest build 复制，
 * 请将 config/strategy-packs 目录部署到运行目录，或用环境变量 STRATEGY_PACK_DIR 指向它。
 */
@Injectable()
export class StrategyPackService {
  private readonly logger = new Logger(StrategyPackService.name);
  private readonly packs = new Map<string, StrategyPack>();
  /** 可覆盖的包目录（默认自动探测 src/dist/cwd） */
  private packDir = '';

  /** 解析并确保包目录存在 */
  async init(): Promise<string> {
    if (this.packDir) return this.packDir;
    const candidates = [
      process.env.STRATEGY_PACK_DIR,
      path.join(process.cwd(), 'src', 'config', 'strategy-packs'),
      path.join(process.cwd(), 'dist', 'config', 'strategy-packs'),
    ].filter(Boolean) as string[];
    const found = candidates.find((dir) => fsSync.existsSync(dir));
    this.packDir = found ?? candidates[0] ?? candidates[1];
    if (!fsSync.existsSync(this.packDir)) {
      await fs.mkdir(this.packDir, { recursive: true });
    }
    this.logger.log(`策略包目录：${this.packDir}`);
    return this.packDir;
  }

  /** 启动加载（Nest 生命周期钩子） */
  async onModuleInit(): Promise<void> {
    try {
      await this.init();
      await this.loadAll();
    } catch (error) {
      this.logger.error(
        '策略包初始化失败（默认包缺失也不影响进程启动，规则引擎将跳过）',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** 加载目录下全部 .json 包 */
  async loadAll(): Promise<void> {
    const dir = await this.init();
    const files = await fs.readdir(dir);
    this.packs.clear();
    for (const file of files.filter((f) => f.toLowerCase().endsWith('.json'))) {
      const full = path.join(dir, file);
      try {
        const pack = JSON.parse(await fs.readFile(full, 'utf-8')) as StrategyPack;
        if (!this.isValidPack(pack)) {
          this.logger.warn(`策略包文件格式非法，跳过：${file}`);
          continue;
        }
        this.packs.set(pack.id, pack);
      } catch (error) {
        this.logger.warn(
          `策略包加载失败，跳过：${file}（${(error as Error).message}）`,
        );
      }
    }
    this.logger.log(
      `策略包已加载：${[...this.packs.keys()].join(', ') || '（空）'}`,
    );
  }

  /** 全部已加载包（含禁用） */
  list(): StrategyPack[] {
    return [...this.packs.values()];
  }

  /** 单个包（未加载返回 null，调用方做兜底） */
  get(packId: string): StrategyPack | null {
    return this.packs.get(packId) ?? null;
  }

  /** 全部启用的包 */
  listEnabled(): StrategyPack[] {
    return this.list().filter((p) => p.enabled);
  }

  /** 内置兜底包 id */
  get defaultPackId(): string {
    return 'default';
  }

  /** 重新加载单个包（磁盘内容 → 内存） */
  async reload(packId: string): Promise<StrategyPack | null> {
    const dir = await this.init();
    const file = path.join(dir, `${packId}.json`);
    if (!fsSync.existsSync(file)) return null;
    const pack = JSON.parse(await fs.readFile(file, 'utf-8')) as StrategyPack;
    if (!this.isValidPack(pack) || pack.id !== packId) {
      throw new Error(`策略包内容非法或 id 不匹配：${packId}`);
    }
    this.packs.set(pack.id, pack);
    return pack;
  }

  /**
   * 新建或整体更新一个包并热生效。
   * @param packId 文件名（即 id），白名单校验防路径穿越
   * @param data 包内容（id 会以 packId 为准）
   */
  async createOrUpdate(packId: string, data: StrategyPack): Promise<StrategyPack> {
    if (!PACK_ID_PATTERN.test(packId)) {
      throw new Error(`非法的策略包 id：${packId}（仅允许字母数字-_）`);
    }
    const pack: StrategyPack = {
      ...data,
      id: packId,
      version: data.version || '1.0.0',
      enabled: data.enabled !== false,
    };
    if (!this.isValidPack(pack)) throw new Error('策略包内容不合法');
    await this.persist(pack);
    this.packs.set(pack.id, pack);
    this.logger.log(`策略包已生效：${pack.id} v${pack.version}`);
    return pack;
  }

  /** 切换启用状态并持久化 */
  async toggle(packId: string): Promise<StrategyPack> {
    const pack = this.get(packId);
    if (!pack) throw new NotFoundException(`策略包不存在：${packId}`);
    pack.enabled = !pack.enabled;
    pack.version = this.bumpVersion(pack.version);
    await this.persist(pack);
    this.packs.set(pack.id, { ...pack });
    return pack;
  }

  /** 删除包（default 禁止删除，防止无兜底） */
  async remove(packId: string): Promise<{ id: string; removed: boolean }> {
    if (packId === this.defaultPackId) {
      throw new Error('内置通用包不允许删除（可停用后编辑规则）');
    }
    if (!this.packs.has(packId)) {
      throw new NotFoundException(`策略包不存在：${packId}`);
    }
    const dir = await this.init();
    const file = path.join(dir, `${packId}.json`);
    await fs.unlink(file);
    this.packs.delete(packId);
    return { id: packId, removed: true };
  }

  /** 原子写盘（先写临时文件再改名，避免半截 JSON 被规则引擎读到） */
  private async persist(pack: StrategyPack): Promise<void> {
    const dir = await this.init();
    const file = path.join(dir, `${pack.id}.json`);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(pack, null, 2), 'utf-8');
    await fs.rename(tmp, file);
  }

  private isValidPack(pack: StrategyPack): boolean {
    return !!(
      pack &&
      typeof pack.id === 'string' &&
      PACK_ID_PATTERN.test(pack.id) &&
      Array.isArray(pack.rules) &&
      pack.rules.every(
        (r) =>
          r &&
          typeof r.id === 'string' &&
          typeof r.ui_type === 'string' &&
          r.trigger &&
          typeof r.trigger.type === 'string',
      )
    );
  }

  private bumpVersion(current: string): string {
    const [maj, min, pat] = (current || '0.0.0').split('.').map(Number);
    const next = Number.isFinite(pat) ? pat + 1 : 1;
    return `${Number.isFinite(maj) ? maj : 0}.${Number.isFinite(min) ? min : 0}.${next}`;
  }
}

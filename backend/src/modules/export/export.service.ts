import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { UserCognitiveProfile } from '../../entities/user-cognitive-profile.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';
import { ExportTaskDto, ExportStatus } from './dto/export.dto';
import {
  ExportBundleInput,
  ExportAtomView,
  ExportGeneratorService,
} from './export-generator.service';
import { ExportStorageService } from './export-storage.service';

interface ExportTaskRecord {
  userId: string;
  dto: ExportTaskDto;
}

/**
 * 全量导出服务
 *
 * 产品红线：
 * 1. 所有会员等级均支持全量导出，无等级限制；
 * 2. 导出内容完整：知识原子 / 版本历史 / 引用关系 / 个人设置全部包含；
 * 3. 导出格式通用（Markdown + HTML + JSON），可离线浏览，不依赖平台。
 *
 * 实现：发起导出即创建异步任务（立即返回 exportId），后台生成压缩包，
 * 前端通过 GET /export/{id} 轮询状态。任务状态保存在进程内存中（重启即失效，
 * 但导出文件持久化在存储目录；生产可平滑替换为队列 + 状态库）。
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly tasks = new Map<string, ExportTaskRecord>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(AtomVersion)
    private readonly versionRepo: Repository<AtomVersion>,
    @InjectRepository(Reference)
    private readonly referenceRepo: Repository<Reference>,
    @InjectRepository(UserCognitiveProfile)
    private readonly profileRepo: Repository<UserCognitiveProfile>,
    @InjectRepository(AiStrategyMemory)
    private readonly strategyRepo: Repository<AiStrategyMemory>,
    private readonly generator: ExportGeneratorService,
    private readonly storage: ExportStorageService,
  ) {
    // 定时清理过期导出文件（每 10 分钟一次，仅本地存储实现需要）
    this.cleanupTimer = setInterval(() => {
      try {
        this.storage.cleanupExpired();
      } catch {
        /* ignore */
      }
    }, 10 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  /** 发起全量导出（异步，立即返回 exportId） */
  createExport(userId: string, format = 'full'): ExportTaskDto {
    const exportId = randomUUID();
    const now = new Date();
    const task: ExportTaskRecord = {
      userId,
      dto: {
        exportId,
        status: 'processing',
        progress: 0,
        message: '导出任务已创建，正在准备数据…',
        downloadUrl: null,
        expiresAt: null,
        stats: {
          atomCount: 0,
          versionCount: 0,
          referenceCount: 0,
          fileSizeBytes: 0,
        },
        createdAt: now.toISOString(),
        completedAt: null,
      },
    };
    this.tasks.set(exportId, task);

    // 异步执行（不阻塞请求）
    void this.runExport(exportId, userId, format);
    return task.dto;
  }

  /** 获取导出状态（校验归属，防止越权） */
  getExport(exportId: string, userId: string): ExportTaskDto {
    const task = this.tasks.get(exportId);
    if (!task || task.userId !== userId) {
      throw new NotFoundException('导出任务不存在或已过期');
    }
    return task.dto;
  }

  /** 获取导出文件（供下载端点使用） */
  getDownloadBuffer(exportId: string): Buffer | null {
    return this.storage.read(exportId);
  }

  /**
   * 清除 AI 记忆（认知画像 + 沟通策略）
   *
   * 产品红线：记忆数据属于用户，用户可随时一键清除。
   * 清除后平台侧不再保留任何画像 / 策略信息；下次对话将从头重新学习。
   */
  async clearMemory(userId: string): Promise<{
    profileDeleted: boolean;
    strategyDeleted: boolean;
  }> {
    const [profile, strategy] = await Promise.all([
      this.profileRepo.delete({ userId }),
      this.strategyRepo.delete({ userId }),
    ]);
    return {
      profileDeleted: (profile.affected ?? 0) > 0,
      strategyDeleted: (strategy.affected ?? 0) > 0,
    };
  }

  // ============ 异步任务 ============

  private async runExport(
    exportId: string,
    userId: string,
    format: string,
  ): Promise<void> {
    try {
      const task = this.tasks.get(exportId);
      if (!task) return;
      const set = (patch: Partial<ExportTaskDto>) => {
        const t = this.tasks.get(exportId);
        if (t) Object.assign(t.dto, patch);
      };

      // 1. 采集用户与设置
      set({ progress: 10, message: '正在采集用户信息与个人设置…' });
      const user = await this.userRepo.findOne({ where: { id: userId } });
      const setting = await this.settingRepo.findOne({ where: { userId } });
      if (!user) {
        set({
          status: 'failed',
          progress: 100,
          message: '用户不存在',
          error: '用户不存在',
          completedAt: new Date().toISOString(),
        });
        return;
      }

      // 2. 采集原子 / 版本 / 引用（仅自己的）
      set({ progress: 30, message: '正在汇总知识原子…' });
      const atoms = await this.atomRepo.find({
        where: { userId },
        order: { updatedAt: 'DESC' },
      });
      const atomIds = atoms.map((a) => a.id);

      const versions = atomIds.length
        ? await this.versionRepo
            .createQueryBuilder('v')
            .where('v.userId = :userId', { userId })
            .andWhere('v.atomId IN (:...ids)', { ids: atomIds })
            .orderBy('v.version', 'ASC')
            .getMany()
        : [];

      const references = atomIds.length
        ? await this.referenceRepo
            .createQueryBuilder('r')
            .where('r.citerUserId = :userId', { userId })
            .andWhere('r.citerAtomId IN (:...ids)', { ids: atomIds })
            .getMany()
        : [];

      set({ progress: 50, message: '正在生成 Markdown 文档…' });

      // 3. 组装每个原子的聚合视图
      const versionMap = new Map<string, AtomVersion[]>();
      for (const v of versions) {
        const list = versionMap.get(v.atomId) || [];
        list.push(v);
        versionMap.set(v.atomId, list);
      }
      const refOutMap = new Map<string, Reference[]>();
      const refInMap = new Map<string, Reference[]>();
      for (const r of references) {
        const out = refOutMap.get(r.citerAtomId) || [];
        out.push(r);
        refOutMap.set(r.citerAtomId, out);
        const inList = refInMap.get(r.citedAtomId) || [];
        inList.push(r);
        refInMap.set(r.citedAtomId, inList);
      }

      const citedIds = new Set(references.map((r) => r.citedAtomId));
      const citerIds = new Set(references.map((r) => r.citerAtomId));
      const briefIds = [...citedIds, ...citerIds].filter(
        (id) => id !== undefined,
      );
      const briefAtoms = briefIds.length
        ? await this.atomRepo
            .createQueryBuilder('a')
            .select(['a.id', 'a.coreQuestion'])
            .whereInIds(briefIds)
            .getMany()
        : [];
      const briefMap = new Map(
        briefAtoms.map((a) => [a.id, a.coreQuestion]),
      );

      const atomViews: ExportAtomView[] = atoms.map((atom) => ({
        atom,
        versions: versionMap.get(atom.id) || [],
        references: {
          outgoing: (refOutMap.get(atom.id) || []).map((r) => ({
            citerAtomId: r.citerAtomId,
            citedAtomId: r.citedAtomId,
            note: r.note,
            createdAt: r.createdAt,
            citedCoreQuestion: briefMap.get(r.citedAtomId),
          })),
          incoming: (refInMap.get(atom.id) || []).map((r) => ({
            citerAtomId: r.citerAtomId,
            citedAtomId: r.citedAtomId,
            note: r.note,
            createdAt: r.createdAt,
            citerCoreQuestion: briefMap.get(r.citerAtomId),
          })),
        },
      }));

      // 3.5 采集 AI 记忆层（认知画像 + 沟通策略）
      set({ progress: 55, message: '正在汇总 AI 记忆…' });
      const [profile, strategy] = await Promise.all([
        this.profileRepo.findOne({ where: { userId } }),
        this.strategyRepo.findOne({ where: { userId } }),
      ]);

      // 4. 生成文本文件
      set({ progress: 65, message: '正在生成 HTML 离线页…' });
      const input: ExportBundleInput = {
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          createdAt: user.createdAt,
        },
        settings: {
          defaultPermission: setting?.defaultPermission ?? 'private',
          publicReminder: setting?.publicReminder ?? false,
          sensitiveDetection: setting?.sensitiveDetection ?? false,
          authorizationToggle: setting?.authorizationToggle ?? true,
          referenceToggle: setting?.referenceToggle ?? true,
          reminderFrequency: setting?.reminderFrequency ?? 'weekly',
          notificationSettings: setting?.notificationSettings ?? null,
          weatherPreference: setting?.weatherPreference ?? null,
          themePreference: setting?.themePreference ?? 'light',
          decorationConfig: setting?.decorationConfig ?? null,
        },
        atoms: atomViews,
        memory: { profile, strategy },
        exportedAt: new Date(),
      };
      const files = this.generator.generateFiles(input);

      // 5. 打包 zip
      set({ progress: 80, message: '正在打包导出包…' });
      const zip = new JSZip();
      for (const [path, content] of Object.entries(files)) {
        zip.file(path, content);
      }
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // 6. 保存到存储并设置过期时间
      set({ progress: 92, message: '正在上传导出包…' });
      const { downloadUrl, expiresAt } = this.storage.save(exportId, buffer);

      // 7. 完成
      const atomCount = atomViews.length;
      const versionCount = versions.length;
      const refCount = references.length;
      set({
        status: 'completed',
        progress: 100,
        message: `导出完成：${atomCount} 个原子 · ${versionCount} 条版本 · ${refCount} 条引用`,
        downloadUrl,
        expiresAt,
        stats: {
          atomCount,
          versionCount,
          referenceCount: refCount,
          fileSizeBytes: buffer.length,
        },
        completedAt: new Date().toISOString(),
      });
      this.logger.log(
        `导出完成 ${exportId}：${atomCount} atoms, ${buffer.length} bytes`,
      );
    } catch (e) {
      // 技术细节只进日志（含错误 message），不展示给用户
      this.logger.error(
        `导出任务失败 ${exportId}：${(e as Error)?.message || '未知错误'}`,
        (e as Error)?.stack,
      );
      const task = this.tasks.get(exportId);
      if (task) {
        task.dto.status = 'failed' as ExportStatus;
        task.dto.progress = 100;
        task.dto.message = '导出失败，请稍后重试';
        task.dto.error = '导出过程中出现异常，请稍后重试';
        task.dto.completedAt = new Date().toISOString();
      }
    }
  }
}

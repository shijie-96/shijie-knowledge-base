/**
 * 一次性运维脚本：把指定账号当前的名片装扮设为「平台默认装扮」。
 *
 * 用法（在 backend 目录下）：
 *   npx ts-node scripts/set-platform-default.ts [手机号]
 *
 * - 未传手机号时默认取 13800138000（当前上传装扮的账号）。
 * - 重复执行会覆盖平台默认（以最新一次执行为准）。
 * - 自定义背景图会复制到 uploads/platform-bg/（独立于原账号
 *   “只保留最新一张”的清理规则，避免后续被该账号新上传误删）。
 *
 * 生效逻辑：所有「从未保存过装扮」的公开主页将默认使用该装扮；
 * 已自己保存过装扮的用户不受影响。
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { UserSetting } from '../src/entities/user-settings.entity';
import { SystemSetting } from '../src/entities/system-settings.entity';

const PLATFORM_DECORATION_KEY = 'platform_profile_decoration';

async function main(): Promise<void> {
  loadEnv({ path: ['.env', '../.env'] });

  const phone = process.argv[2] ?? '13800138000';
  const cwd = process.cwd();

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'zhishi',
    entities: [User, UserSetting, SystemSetting],
    // 确保 system_settings 表存在（后端运行环境 DB_SYNC=true）
    synchronize: true,
  });
  await ds.initialize();

  try {
    const userRepo = ds.getRepository(User);
    const settingRepo = ds.getRepository(UserSetting);
    const sysRepo = ds.getRepository(SystemSetting);

    const user = await userRepo.findOne({ where: { phone } });
    if (!user) {
      throw new Error(`未找到手机号为 ${phone} 的用户`);
    }

    const setting = await settingRepo.findOneBy({ userId: user.id });
    const raw = (setting?.profileDecoration ?? null) as Record<string, unknown> | null;
    if (!raw || Object.keys(raw).length === 0) {
      throw new Error(
        `用户「${user.nickname}」(${phone}) 尚未保存过任何装扮，无法设为平台默认`,
      );
    }

    const platform: Record<string, unknown> = { ...raw };

    // 自定义背景图：复制到平台专用目录，避免被该账号后续上传清理
    const bg = typeof raw.customBackground === 'string' ? raw.customBackground : null;
    if (bg && /^\/uploads\/decoration-bg\//.test(bg)) {
      const srcFile = path.join(cwd, bg.replace(/^\//, ''));
      try {
        await fs.access(srcFile);
        const extMatch = bg.split('.').pop()?.toLowerCase().match(/[a-z0-9]+/);
        const ext = extMatch ? extMatch[0] : 'png';
        const bgDir = path.join(cwd, 'uploads', 'platform-bg');
        await fs.mkdir(bgDir, { recursive: true });
        // 清理旧的平台默认背景，避免文件堆积
        const olds = await fs.readdir(bgDir);
        await Promise.all(
          olds.map((n) => fs.unlink(path.join(bgDir, n)).catch(() => undefined)),
        );
        const filename = `${Date.now()}.${ext}`;
        await fs.copyFile(srcFile, path.join(bgDir, filename));
        platform.customBackground = `/uploads/platform-bg/${filename}`;
        console.log(`背景图已复制为平台默认：/uploads/platform-bg/${filename}`);
      } catch (err) {
        console.warn(
          `背景图文件不可用（${bg}），沿用原地址：${(err as Error).message}`,
        );
        platform.customBackground = bg;
      }
    }

    const existing = await sysRepo.findOneBy({ key: PLATFORM_DECORATION_KEY });
    if (existing) {
      existing.value = platform;
      await sysRepo.save(existing);
    } else {
      await sysRepo.save(
        sysRepo.create({ key: PLATFORM_DECORATION_KEY, value: platform }),
      );
    }

    console.log('已把以下装扮写入平台默认：');
    console.log(JSON.stringify(platform, null, 2));
    console.log('');
    console.log(
      '完成。此后所有「从未保存过装扮」的用户公开主页将默认使用该装扮；已自定义的用户不受影响。',
    );
  } finally {
    await ds.destroy();
  }
}

void main().catch((err: Error) => {
  console.error(`[失败] ${err.message}`);
  process.exit(1);
});

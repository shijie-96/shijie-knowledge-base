import { Injectable } from '@nestjs/common';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { UserCognitiveProfile } from '../../entities/user-cognitive-profile.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';

/**
 * 导出数据包中每个原子的聚合视图（纯数据，不含原始素材内容）
 */
export interface ExportAtomView {
  atom: Partial<KnowledgeAtom>;
  versions: AtomVersion[];
  references: {
    outgoing: Array<{
      citerAtomId: string;
      citedAtomId: string;
      note: string | null;
      createdAt: Date;
      citedCoreQuestion?: string;
    }>;
    incoming: Array<{
      citerAtomId: string;
      citedAtomId: string;
      note: string | null;
      createdAt: Date;
      citerCoreQuestion?: string;
    }>;
  };
}

export interface ExportBundleInput {
  user: {
    id: string;
    nickname?: string | null;
    email?: string | null;
    createdAt?: Date;
  };
  settings: Record<string, unknown>;
  atoms: ExportAtomView[];
  /** AI 记忆层（认知画像 + 沟通策略），可能为空 */
  memory?: {
    profile: UserCognitiveProfile | null;
    strategy: AiStrategyMemory | null;
  };
  exportedAt: Date;
}

/**
 * 导出内容生成器
 *
 * 负责将「知识原子 / 版本历史 / 引用关系 / 用户信息」渲染为：
 * - atoms/*.md       每个知识原子一个独立 Markdown 文件（按核心格式排版）
 * - versions/versions.md  版本历史汇总
 * - references.json  完整引用关系（机器可读）
 * - user_info.json   用户基础信息
 * - README.md        导出说明
 * - index.html       可离线浏览的单页 HTML
 *
 * 产品红线：
 * 1. 导出内容完整，不依赖平台即可离线浏览；
 * 2. 导出仅包含用户自己的数据；不含关联原始素材内容（物理分离）；
 * 3. 通用格式（Markdown + HTML + JSON）。
 */
@Injectable()
export class ExportGeneratorService {
  /** 生成导出包内所有文本文件内容（key = 包内相对路径，value = 文件内容） */
  generateFiles(input: ExportBundleInput): Record<string, string> {
    const { atoms } = input;
    const files: Record<string, string> = {};

    // README.md 导出说明
    files['README.md'] = this.buildReadme(input);

    // atoms/*.md 每个原子一个文件
    for (const item of atoms) {
      files[`atoms/${this.safeFileName(item.atom.id || 'atom')}.md`] =
        this.buildAtomMarkdown(item);
    }

    // versions 版本历史汇总
    files['versions/versions.md'] = this.buildVersionsMarkdown(atoms);

    // references.json 完整引用关系
    files['references.json'] = JSON.stringify(
      this.buildReferencesJson(atoms),
      null,
      2,
    );

    // user_info.json
    files['user_info.json'] = JSON.stringify(
      {
        id: input.user.id,
        nickname: input.user.nickname || null,
        email: input.user.email || null,
        registeredAt: input.user.createdAt
          ? input.user.createdAt.toISOString()
          : null,
        exportedAt: input.exportedAt.toISOString(),
        exportVersion: 1,
        format: 'zhishi-export',
      },
      null,
      2,
    );

    // memory/ AI 记忆层（认知画像 + 沟通策略）
    files['memory/cognitive-profile.json'] = JSON.stringify(
      {
        exportVersion: 1,
        exportedAt: input.exportedAt.toISOString(),
        hasProfile: !!input.memory?.profile,
        profile: this.buildProfileJson(input.memory?.profile ?? null),
      },
      null,
      2,
    );
    files['memory/ai-strategy-memory.json'] = JSON.stringify(
      {
        exportVersion: 1,
        exportedAt: input.exportedAt.toISOString(),
        hasStrategy: !!input.memory?.strategy,
        strategy: this.buildStrategyJson(input.memory?.strategy ?? null),
      },
      null,
      2,
    );

    // index.html 可离线浏览单页
    files['index.html'] = this.buildHtml(input);

    return files;
  }

  /** 每个原子的文件全名（id 开头便于索引） */
  private atomFileName(item: ExportAtomView): string {
    const core = (item.atom.coreQuestion || '')
      .slice(0, 30)
      .replace(/[\\/:*?"<>|\s？。，！!、]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${this.safeFileName(item.atom.id || 'atom')}${core ? '-' + core : ''}.md`;
  }

  private safeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, '_');
  }

  // ============ README.md ============
  private buildReadme(input: ExportBundleInput): string {
    const atomCount = input.atoms.length;
    const versionCount = input.atoms.reduce(
      (sum, a) => sum + a.versions.length,
      0,
    );
    const refCount = input.atoms.reduce(
      (sum, a) =>
        sum + a.references.outgoing.length + a.references.incoming.length,
      0,
    );
    return `# 认知资产库导出包

> 由「认知资产库」平台生成 · 数据主权属于你
> 导出时间：${input.exportedAt.toISOString()}

本导出包包含你的全部知识原子、版本历史、引用关系与个人设置，使用通用格式（Markdown + HTML + JSON），**可离线浏览，不依赖任何平台**。

## 包结构

\`\`\`
.
├── README.md            本说明文件
├── index.html           可离线浏览的单页 HTML（双击即可打开）
├── user_info.json       用户基础信息
├── references.json      完整引用关系（机器可读）
├── atoms/               每个知识原子一个独立 .md 文件（核心格式排版）
├── versions/
│   └── versions.md      版本历史汇总
└── memory/
    ├── cognitive-profile.json   用户认知画像（强项 / 盲区 / 活跃话题）
    └── ai-strategy-memory.json  AI 沟通策略记忆（偏好风格 / 学习规则）
\`\`\`

## 数据统计

- 知识原子数：${atomCount}
- 版本记录数：${versionCount}
- 引用关系数：${refCount}
- AI 认知画像：${this.profileSummary(input)}
- AI 沟通策略：${this.strategySummary(input)}

## 目录索引

| # | 原子 | 文件 |
|---|------|------|
${input.atoms
  .map((a, i) => {
    const name = this.atomFileName(a);
    return `| ${i + 1} | ${this.escapeMd((a.atom.coreQuestion || '未命名').slice(0, 40))} | atoms/${name} |`;
  })
  .join('\n')}

## 说明

- 所有原子均为**你自己的私有资产**，导出后请妥善保管。
- 导出包不含平台素材库的原始内容，仅包含知识原子本身。
- 若需再次使用，可将本包内容导入其他支持 Markdown 的工具。
`;
  }

  // ============ atoms/*.md ============
  private buildAtomMarkdown(item: ExportAtomView): string {
    const a = item.atom;
    const lines: string[] = [];

    lines.push(`# ${a.coreQuestion || '（未命名原子）'}`);
    lines.push('');
    lines.push(`> 原子 ID：\`${a.id}\``);
    lines.push(`> 分类：${this.paraLabel(a.paraCategory)}`);
    lines.push(`> 权限：${this.permissionLabel(a.permission)}`);
    lines.push(`> 状态：${a.status}`);
    lines.push(`> 版本：v${a.version}`);
    lines.push(
      `> 创建：${this.fmt(a.createdAt)} · 更新：${this.fmt(a.updatedAt)}`,
    );
    lines.push(
      `> 复用 ${a.reuseCount ?? 0} 次 · 迭代 ${a.iterationCount ?? 0} 次 · 被引用 ${a.referencedCount ?? 0} 次`,
    );
    lines.push('');

    // 标签
    if (a.tags && a.tags.length) {
      lines.push(`**标签**：${a.tags.map((t) => `\`${t}\``).join(' ')}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('## 核心问题');
    lines.push('');
    lines.push(a.coreQuestion || '（空）');
    lines.push('');

    lines.push('## 我的观点 / 方案');
    lines.push('');
    lines.push(a.myViewpoint || '（空）');
    lines.push('');

    lines.push('## 证据 / 出处');
    lines.push('');
    lines.push(a.evidence || '（空）');
    lines.push('');

    lines.push('## 实践案例');
    lines.push('');
    lines.push(a.practiceCase || '（空）');
    lines.push('');

    // 引用关系
    const outgoing = item.references.outgoing;
    const incoming = item.references.incoming;
    lines.push('---');
    lines.push('');
    lines.push('## 引用关系');
    lines.push('');
    if (outgoing.length === 0 && incoming.length === 0) {
      lines.push('暂无引用关联。');
    } else {
      if (outgoing.length) {
        lines.push('### 引用了');
        lines.push('');
        for (const r of outgoing) {
          lines.push(
            `- [${r.citedCoreQuestion || r.citedAtomId}](${this.safeFileName(r.citedAtomId)}.md)  （${this.fmt(r.createdAt)}）`,
          );
        }
        lines.push('');
      }
      if (incoming.length) {
        lines.push('### 被引用');
        lines.push('');
        for (const r of incoming) {
          lines.push(
            `- 由 ${r.citerCoreQuestion || r.citerAtomId} 引用（${this.fmt(r.createdAt)}）`,
          );
        }
        lines.push('');
      }
    }

    // 版本历史（本原子）
    if (item.versions.length) {
      lines.push('---');
      lines.push('');
      lines.push('## 版本历史');
      lines.push('');
      lines.push('| 版本 | 类型 | 说明 | 时间 |');
      lines.push('|------|------|------|------|');
      for (const v of item.versions) {
        lines.push(
          `| v${v.version} | ${this.changeTypeLabel(v.changeType)} | ${this.escapeMd(v.changeNote || '')} | ${this.fmt(v.createdAt)} |`,
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ============ versions/versions.md ============
  private buildVersionsMarkdown(atoms: ExportAtomView[]): string {
    const lines: string[] = [];
    lines.push('# 版本历史汇总');
    lines.push('');
    lines.push('> 汇总所有知识原子的版本迭代轨迹。');
    lines.push('');

    const all: Array<{
      atomCore: string;
      atomId: string;
      version: number;
      changeType: string;
      changeNote: string;
      createdAt: Date;
    }> = [];
    for (const item of atoms) {
      for (const v of item.versions) {
        all.push({
          atomCore: item.atom.coreQuestion || '（未命名原子）',
          atomId: item.atom.id || '',
          version: v.version,
          changeType: v.changeType,
          changeNote: v.changeNote || '',
          createdAt: v.createdAt,
        });
      }
    }
    all.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());

    if (all.length === 0) {
      lines.push('暂无版本记录。');
      return lines.join('\n');
    }

    lines.push('| 时间 | 原子 | 版本 | 类型 | 说明 |');
    lines.push('|------|------|------|------|------|');
    for (const v of all) {
      lines.push(
        `| ${this.fmt(v.createdAt)} | ${this.escapeMd(v.atomCore.slice(0, 30))} | v${v.version} | ${this.changeTypeLabel(v.changeType)} | ${this.escapeMd(v.changeNote)} |`,
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  // ============ references.json ============
  private buildReferencesJson(atoms: ExportAtomView[]): Record<string, unknown> {
    const references: Array<Record<string, unknown>> = [];
    for (const item of atoms) {
      for (const r of item.references.outgoing) {
        references.push({
          citerAtomId: r.citerAtomId,
          citedAtomId: r.citedAtomId,
          citerCoreQuestion: item.atom.coreQuestion || null,
          citedCoreQuestion: r.citedCoreQuestion || null,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        });
      }
    }
    return {
      exportVersion: 1,
      referenceCount: references.length,
      references,
    };
  }

  // ============ memory/ 记忆数据 ============
  private buildProfileJson(
    p: UserCognitiveProfile | null | undefined,
  ): Record<string, unknown> | null {
    if (!p) return null;
    return {
      strengths: p.strengths || [],
      weaknesses: p.weaknesses || [],
      activeTopics: p.activeTopics || [],
      gaps: p.gaps || [],
      lastGeneratedAt: p.lastGeneratedAt
        ? p.lastGeneratedAt.toISOString()
        : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private buildStrategyJson(
    s: AiStrategyMemory | null | undefined,
  ): Record<string, unknown> | null {
    if (!s) return null;
    return {
      preferredStyle: s.preferredStyle,
      learnedRules: s.learnedRules || [],
      avoidPatterns: s.avoidPatterns || [],
      reflectionLog: s.reflectionLog || [],
      chatCount: s.chatCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private profileSummary(input: ExportBundleInput): string {
    const p = input.memory?.profile;
    if (!p) return '无';
    return `有（强项 ${(p.strengths || []).length} · 盲区 ${(p.weaknesses || []).length} · 活跃话题 ${(p.activeTopics || []).length}）`;
  }

  private strategySummary(input: ExportBundleInput): string {
    const s = input.memory?.strategy;
    if (!s) return '无';
    return `有（${s.preferredStyle} 风格 · ${(s.learnedRules || []).length} 条规则 · 已对话 ${s.chatCount} 次）`;
  }

  // ============ index.html ============
  private buildHtml(input: ExportBundleInput): string {
    const { atoms, user } = input;
    const versionCount = atoms.reduce((s, a) => s + a.versions.length, 0);
    const refCount = atoms.reduce(
      (s, a) => s + a.references.outgoing.length + a.references.incoming.length,
      0,
    );

    const atomCards = atoms
      .map((item) => {
        const a = item.atom;
        const tags = (a.tags || []).map(
          (t) =>
            `<span class="tag">${this.escapeHtml(t)}</span>`,
        );
        const refs =
          item.references.outgoing.length + item.references.incoming.length;
        const versions = item.versions
          .slice(-5)
          .reverse()
          .map(
            (v) =>
              `<div class="ver-row"><span class="ver-badge">v${v.version}</span><span class="ver-note">${this.escapeHtml(v.changeNote || '')}</span><span class="ver-time">${this.escapeHtml(this.fmt(v.createdAt))}</span></div>`,
          )
          .join('');
        return `<article class="atom">
  <header class="atom-head">
    <div>
      <h2>${this.escapeHtml(a.coreQuestion || '（未命名原子）')}</h2>
      <div class="meta">
        <span class="chip ${this.paraClass(a.paraCategory)}">${this.paraLabel(a.paraCategory)}</span>
        <span class="chip ${this.permissionClass(a.permission)}">${this.permissionLabel(a.permission)}</span>
        <span class="meta-text">v${a.version} · 复用 ${a.reuseCount ?? 0} · 迭代 ${a.iterationCount ?? 0} · 被引用 ${a.referencedCount ?? 0}</span>
      </div>
    </div>
    ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
  </header>
  <section class="field">
    <h4>核心问题</h4>
    <p>${this.escapeHtml(a.coreQuestion || '（空）')}</p>
  </section>
  <section class="field">
    <h4>我的观点 / 方案</h4>
    <p>${this.escapeHtml(a.myViewpoint || '（空）')}</p>
  </section>
  <section class="field">
    <h4>证据 / 出处</h4>
    <p>${this.escapeHtml(a.evidence || '（空）')}</p>
  </section>
  <section class="field">
    <h4>实践案例</h4>
    <p>${this.escapeHtml(a.practiceCase || '（空）')}</p>
  </section>
  <section class="field">
    <h4>引用关系 <span class="count">${refs}</span></h4>
    ${item.references.outgoing.length ? `<p class="ref">引用了 ${item.references.outgoing.length} 个原子</p>` : ''}
    ${item.references.incoming.length ? `<p class="ref">被 ${item.references.incoming.length} 个原子引用</p>` : ''}
    ${refs === 0 ? '<p class="muted">暂无引用关联。</p>' : ''}
  </section>
  <section class="field">
    <h4>最近版本</h4>
    ${versions || '<p class="muted">暂无版本记录。</p>'}
  </section>
</article>`;
      })
      .join('\n');

    const statCards = [
      this.statCard('知识原子', String(atoms.length)),
      this.statCard('版本记录', String(versionCount)),
      this.statCard('引用关系', String(refCount)),
    ].join('');

    const memoryBlock = this.buildMemoryHtml(input);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>认知资产库 · 离线导出</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0A0E1A; color: #e2e8f0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }
  .hero { margin-bottom: 32px; }
  .hero h1 { font-size: 28px; font-weight: 800; color: #f8fafc; }
  .hero p { color: #64748b; font-size: 14px; margin-top: 6px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .stat { background: #1A2233; border: 1px solid rgba(148,163,184,.15); border-radius: 12px; padding: 16px; }
  .stat .num { font-size: 26px; font-weight: 800; color: #818cf8; }
  .stat .label { font-size: 12px; color: #64748b; }
  .atom { background: #1A2233; border: 1px solid rgba(148,163,184,.15); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  .atom-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .atom h2 { font-size: 17px; font-weight: 700; color: #f8fafc; margin-bottom: 6px; }
  .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .chip { font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 600; }
  .chip.projects { background: rgba(56,189,248,.15); color: #38bdf8; }
  .chip.areas { background: rgba(52,211,153,.15); color: #34d399; }
  .chip.resources { background: rgba(129,140,248,.15); color: #818cf8; }
  .chip.archives { background: rgba(148,163,184,.15); color: #94a3b8; }
  .chip.skills { background: rgba(250,204,21,.15); color: #facc15; }
  .chip.public { background: rgba(52,211,153,.15); color: #34d399; }
  .chip.private { background: rgba(148,163,184,.15); color: #94a3b8; }
  .chip.authorized { background: rgba(250,204,21,.15); color: #facc15; }
  .meta-text { font-size: 12px; color: #64748b; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { background: rgba(56,189,248,.12); color: #7dd3fc; font-size: 11px; padding: 2px 8px; border-radius: 6px; }
  .field { margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(148,163,184,.15); }
  .field h4 { font-size: 12px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
  .field h4 .count { color: #94a3b8; font-weight: 600; }
  .field p { font-size: 14px; color: #cbd5e1; white-space: pre-wrap; }
  .field p.ref { color: #a78bfa; }
  .muted { color: #64748b; }
  .ver-row { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 4px 0; }
  .ver-badge { background: rgba(129,140,248,.15); color: #818cf8; font-weight: 700; padding: 0 6px; border-radius: 4px; font-size: 11px; }
  .ver-note { flex: 1; color: #cbd5e1; }
  .ver-time { color: #64748b; font-size: 12px; white-space: nowrap; }
  .memory { background: #1A2233; border: 1px solid rgba(148,163,184,.15); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  .mem-title { font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 12px; }
  .mem-col { padding-top: 12px; margin-top: 12px; border-top: 1px dashed rgba(148,163,184,.15); }
  .mem-col:first-of-type { padding-top: 0; margin-top: 0; border-top: none; }
  .mem-col h5 { font-size: 12px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .mem-col p { font-size: 13px; color: #cbd5e1; margin: 4px 0; }
  .mem-col p b { color: #94a3b8; font-weight: 600; }
  .footer { text-align: center; color: #475569; font-size: 12px; margin-top: 40px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>认知资产库 · 离线导出</h1>
    <p>用户：${this.escapeHtml(user.nickname || user.id || '未命名')} · 导出时间：${this.escapeHtml(input.exportedAt.toISOString())}</p>
  </header>
  <div class="stats">${statCards}</div>
  ${memoryBlock}
  ${atomCards || '<p class="muted">暂无知识原子。</p>'}
  <footer class="footer">本文件由「认知资产库」生成，数据主权属于你 · 可离线浏览</footer>
</div>
</body>
</html>`;
  }

  private buildMemoryHtml(input: ExportBundleInput): string {
    const p = input.memory?.profile;
    const s = input.memory?.strategy;
    if (!p && !s) {
      return '<section class="memory"><h3 class="mem-title">AI 记忆</h3><p class="muted">暂无记忆数据。</p></section>';
    }

    const parts: string[] = ['<section class="memory">'];
    parts.push('<h3 class="mem-title">AI 记忆</h3>');

    if (p) {
      const strengths = (p.strengths || []).map((d) => d.domain);
      const weaknesses = (p.weaknesses || []).map((d) => d.domain);
      parts.push(
        '<div class="mem-col">' +
          '<h5>认知画像</h5>' +
          `<p><b>强项：</b>${this.escapeHtml(strengths.join('、') || '暂无')}</p>` +
          `<p><b>盲区：</b>${this.escapeHtml(weaknesses.join('、') || '暂无')}</p>` +
          `<p><b>活跃话题：</b>${this.escapeHtml((p.activeTopics || []).join('、') || '暂无')}</p>` +
          '</div>',
      );
    }

    if (s) {
      const styleLabel =
        ({ socratic: '苏格拉底式追问', direct: '直接给结论', narrative: '讲故事', concise: '极简回复' } as Record<string, string>)[
          s.preferredStyle
        ] || s.preferredStyle;
      parts.push(
        '<div class="mem-col">' +
          '<h5>沟通策略</h5>' +
          `<p><b>偏好风格：</b>${this.escapeHtml(styleLabel)}</p>` +
          `<p><b>学习规则：</b>${this.escapeHtml((s.learnedRules || []).join('；') || '暂无')}</p>` +
          `<p><b>已对话：</b>${s.chatCount || 0} 次</p>` +
          '</div>',
      );
    }

    parts.push('</section>');
    return parts.join('\n');
  }

  private statCard(label: string, num: string): string {
    return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
  }

  // ============ 工具方法 ============
  private fmt(d?: Date | string): string {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
  }

  private escapeMd(s: string): string {
    return s.replace(/([|])/g, '\\$1');
  }

  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private paraLabel(cat?: string): string {
    const map: Record<string, string> = {
      projects: '项目 Projects',
      areas: '领域 Areas',
      resources: '资源 Resources',
      archives: '归档 Archives',
      skills: '技能 Skills',
    };
    return map[cat || ''] || '资源 Resources';
  }

  private paraClass(cat?: string): string {
    const valid = ['projects', 'areas', 'resources', 'archives', 'skills'];
    return valid.includes(cat || '') ? (cat as string) : 'resources';
  }

  private permissionLabel(p?: string): string {
    return p === 'public' ? '公开' : p === 'authorized' ? '授权' : '私有';
  }

  private permissionClass(p?: string): string {
    return p === 'public' || p === 'authorized' ? (p as string) : 'private';
  }

  private changeTypeLabel(t?: string): string {
    return t === 'iterate'
      ? '迭代'
      : t === 'update'
        ? '更新'
        : t === 'create'
          ? '创建'
          : t || '-';
  }
}

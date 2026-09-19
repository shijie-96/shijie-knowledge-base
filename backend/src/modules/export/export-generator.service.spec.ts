import { ExportGeneratorService, ExportBundleInput } from './export-generator.service';

describe('ExportGeneratorService', () => {
  let service: ExportGeneratorService;

  beforeEach(() => {
    service = new ExportGeneratorService();
  });

  const baseInput = (overrides: Partial<ExportBundleInput> = {}): ExportBundleInput => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const atom = {
      atom: {
        id: 'atom-1',
        userId: 'user-1',
        coreQuestion: '如何构建知识体系？',
        myViewpoint: '用 PARA 组织原子',
        evidence: '《卡片笔记写作法》',
        practiceCase: '三个月实践后复用提升',
        paraCategory: 'projects',
        permission: 'private',
        status: 'active',
        version: 2,
        reuseCount: 5,
        iterationCount: 3,
        referencedCount: 1,
        tags: ['效率', '知识管理'],
        createdAt: now,
        updatedAt: now,
      },
      versions: [
        {
          id: 'v-1',
          atomId: 'atom-1',
          userId: 'user-1',
          version: 1,
          coreQuestion: '如何构建知识体系？',
          myViewpoint: '初版',
          evidence: null,
          practiceCase: null,
          paraCategory: 'projects',
          permission: 'private',
          changeNote: '创建',
          changeType: 'create',
          createdAt: now,
          deletedAt: null,
        },
        {
          id: 'v-2',
          atomId: 'atom-1',
          userId: 'user-1',
          version: 2,
          coreQuestion: '如何构建知识体系？',
          myViewpoint: '用 PARA 组织原子',
          evidence: '《卡片笔记写作法》',
          practiceCase: null,
          paraCategory: 'projects',
          permission: 'private',
          changeNote: '补充证据',
          changeType: 'iterate',
          createdAt: now,
          deletedAt: null,
        },
      ],
      references: {
        outgoing: [
          {
            citerAtomId: 'atom-1',
            citedAtomId: 'atom-2',
            note: '引用关系',
            createdAt: now,
            citedCoreQuestion: '如何迭代原子？',
          },
        ],
        incoming: [],
      },
    };

    return {
      user: {
        id: 'user-1',
        nickname: '测试用户',
        email: 'test@example.com',
        createdAt: now,
      },
      settings: {
        defaultPermission: 'private',
        publicReminder: false,
      },
      atoms: [atom],
      exportedAt: now,
      ...overrides,
    };
  };

  /** 找到 atoms 目录下唯一的原子 Markdown 文件键 */
  function atomKey(files: Record<string, string>): string {
    const key = Object.keys(files).find((k) => k.startsWith('atoms/'));
    if (!key) throw new Error('缺少 atoms/ 目录');
    return key;
  }

  it('生成完整包结构：README / atoms / versions / references.json / user_info.json / index.html', () => {
    const files = service.generateFiles(baseInput());
    expect(files['README.md']).toBeDefined();
    expect(atomKey(files)).toContain('atom-1');
    expect(files['versions/versions.md']).toBeDefined();
    expect(files['references.json']).toBeDefined();
    expect(files['user_info.json']).toBeDefined();
    expect(files['index.html']).toBeDefined();
  });

  it('Markdown 原子文档核心字段齐全', () => {
    const files = service.generateFiles(baseInput());
    const md = files[atomKey(files)];
    expect(md).toContain('如何构建知识体系？');
    expect(md).toContain('用 PARA 组织原子');
    expect(md).toContain('《卡片笔记写作法》');
    expect(md).toContain('三个月实践后复用提升');
    expect(md).toContain('权限：私有');
    expect(md).toContain('分类：项目 Projects');
    expect(md).toContain('v2');
    expect(md).toContain('如何迭代原子？');
    // 版本历史
    expect(md).toContain('v1');
    expect(md).toContain('补充证据');
  });

  it('references.json 完整引用关系', () => {
    const files = service.generateFiles(baseInput());
    const parsed = JSON.parse(files['references.json']);
    expect(parsed.referenceCount).toBe(1);
    expect(parsed.references[0].citerAtomId).toBe('atom-1');
    expect(parsed.references[0].citedAtomId).toBe('atom-2');
    expect(parsed.references[0].citedCoreQuestion).toBe('如何迭代原子？');
  });

  it('user_info.json 包含用户基础信息', () => {
    const files = service.generateFiles(baseInput());
    const parsed = JSON.parse(files['user_info.json']);
    expect(parsed.id).toBe('user-1');
    expect(parsed.nickname).toBe('测试用户');
    expect(parsed.exportVersion).toBe(1);
  });

  it('index.html 可离线浏览（含统计卡片与原子卡片）', () => {
    const files = service.generateFiles(baseInput());
    const html = files['index.html'];
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('认知资产库 · 离线导出');
    expect(html).toContain('知识原子');
    expect(html).toContain('如何构建知识体系？');
    expect(html).toContain('用 PARA 组织原子');
  });

  it('空数据也能生成合法包', () => {
    const input = baseInput({ atoms: [] });
    const files = service.generateFiles(input);
    const parsedRef = JSON.parse(files['references.json']);
    expect(parsedRef.referenceCount).toBe(0);
    expect(files['index.html']).toContain('暂无知识原子');
  });
});

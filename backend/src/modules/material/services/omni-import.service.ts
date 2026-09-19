import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream';
import {
  UrlParserService,
  detectPlatform,
  extractUrlFromText,
  isShortLinkUrl,
  resolveRedirectUrl,
  parseShareText,
} from './url-parser.service';
import type { LinkPlatform } from './url-parser.service';
import { FileParserService } from './file-parser.service';

const execFileAsync = promisify(execFile);
const pipelineAsync = promisify(pipeline);

export type OmniImportType = 'url' | 'file';

export interface OmniImportResult {
  /** 素材 id */
  id: string;
  /** 标题 */
  title: string;
  /** 预览（前 300 字符） */
  preview: string;
  /** 解析消耗耗时（ms） */
  durationMs: number;
  /** 完整 markdown（用于前端预览确认） */
  markdown: string;
  /** 标签 */
  tags: string[];
  /** 平台标签 */
  platformLabel?: string;
}

/**
 * OmniImport 统一导入服务（对标 Obsidian AnyContent Vault Importer）
 *
 * 设计原则：
 * 1. 粘贴链接 / 上传文件 → 本地解析 → 输出干净的 Github-Flavored-Markdown
 * 2. 输出内容头部附加 YAML frontmatter 元数据（title/source/author/platform/import_time/tags）
 * 3. 所有产物一律存入 source_materials 素材池（status=pending，仅素材，非个人认知）
 * 4. 隐私优先：视频转录受 ENABLE_LOCAL_ASR 开关控制；
 *    关闭时仅读取平台官方字幕（yt-dlp --write-auto-subs），不运行本地 ASR 模型
 * 5. 大段降噪：连续空行压缩、重复分割线清除、广告/推荐/页脚残留删除、base64 图片剔除
 */
@Injectable()
export class OmniImportService {
  private readonly logger = new Logger(OmniImportService.name);

  /** 解析耗时上限 */
  private readonly MAX_PARSE_MS = 120_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly urlParserService: UrlParserService,
    private readonly fileParserService: FileParserService,
  ) {}

  /**
   * 统一解析入口：URL / 文件 → 清洗后的 Markdown（含 YAML frontmatter）
   */
  async parseToMarkdown(params: {
    importType: OmniImportType;
    sourceUrl?: string;
    rawInput?: string;
    file?: { buffer: Buffer; originalname: string };
  }): Promise<{
    title: string;
    markdown: string;
    tags: string[];
    platformLabel?: string;
  }> {
    const startedAt = Date.now();

    if (params.importType === 'url') {
      const url = (params.sourceUrl || '').trim();
      if (!url) {
        throw new BadRequestException('链接导入时必须提供 source_url');
      }
      // 抖音/快手等分享口令必须按整段文本解析，URL 仅用于展开后的真实地址
      const rawInput = (params.rawInput || params.sourceUrl || '').trim();
      return this.importFromUrl(rawInput);
    }

    // 文件导入
    const file = params.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('文件导入时必须上传文件');
    }
    const fileResult = await this.importFromFile(file.buffer, file.originalname);

    const elapsed = Date.now() - startedAt;
    if (elapsed > this.MAX_PARSE_MS) {
      this.logger.warn(`导入耗时较长：${elapsed}ms`);
    }
    return fileResult;
  }

  // ==================== URL 分支 ====================

  private async importFromUrl(rawInput: string): Promise<{
    title: string;
    markdown: string;
    tags: string[];
    platformLabel?: string;
  }> {
    // 1. App 分享的是一整段「口令 + 短链」混合文本（抖音/小红书/快手/视频号均如此），
    //    先把真实 http(s) 链接抠出来；纯链接则原样使用。
    const extracted = extractUrlFromText(rawInput);
    const rawUrl = (extracted || rawInput).trim();
    if (!rawUrl) {
      throw new BadRequestException(
        '未识别到链接，请粘贴包含 https:// 链接的完整分享内容',
      );
    }

    // 2. 短链展开为最终页面 URL（让 source 元数据规范、便于后续按页面结构解析）。
    //    展开失败不阻塞主流程：fetch / yt-dlp 自身也会跟随重定向。
    let url = rawUrl;
    if (isShortLinkUrl(rawUrl)) {
      const canonical = await resolveRedirectUrl(rawUrl);
      if (canonical) url = canonical;
      this.logger.debug(
        `短链展开：${rawUrl.slice(0, 80)} → ${url.slice(0, 120)}`,
      );
    }

    const platform = detectPlatform(url);
    this.logger.log(`OmniImport URL 解析：${platform.label} ${url}`);

    // 视频平台：走「元数据型导入」——解析分享口令文本 / 调平台公开 API，
    // 不下载视频、不转录语音（抖音等公开页面实测不吐任何元数据，纯链接也能收藏为卡片）
    if (platform.kind === 'video') {
      const videoResult = await this.tryImportVideoMeta(
        rawInput,
        url,
        platform.platform,
        platform.label,
      );
      if (videoResult) return videoResult;
      // 其余视频平台（如 YouTube）交给常规网页抓取
    }

    // 常规网页 / 公众号 / 知乎 / 小红书图文：抓取 HTML → Readability 正文 → Turndown Markdown
    const html = await this.fetchHtml(url);
    return this.parseHtmlToMarkdown(html, url, platform.label);
  }

  /** 抓取网页 HTML */
  private async fetchHtml(rawUrl: string): Promise<string> {
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        });
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        this.logger.warn(`抓取页面网络失败：${url}，${reason}`);
        throw new BadRequestException(
          `无法访问该链接，请检查链接是否可在浏览器打开（${reason}）`,
        );
      }
      if (!res.ok) {
        throw new BadRequestException(`页面请求失败：HTTP ${res.status}`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        throw new BadRequestException('链接不是网页页面（非 HTML 资源），请改用文件导入');
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      // 简单编码检测
      const sample = buffer.subarray(0, 2048).toString('latin1');
      const m = sample.match(/charset=["']?([\w-]+)/i);
      const charset = m ? m[1].toLowerCase() : 'utf-8';
      try {
        if (charset && !['utf-8', 'utf8'].includes(charset)) {
          return new TextDecoder(charset as BufferEncoding).decode(buffer);
        }
      } catch {
        /* 回退 utf-8 */
      }
      return buffer.toString('utf-8');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * HTML → 清洗后的 Markdown
   * 用 Readability 语义化提取正文容器，cheerio 清理噪声 DOM，Turndown 输出 GFM Markdown。
   */
  private parseHtmlToMarkdown(
    html: string,
    url: string,
    platformLabel: string,
  ): { title: string; markdown: string; tags: string[]; platformLabel: string } {
    const $ = cheerio.load(html);

    // 标题提取
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
    const docTitle = $('title').first().text().trim();
    const h1 = $('h1').first().text().trim();
    const title = ogTitle || docTitle || h1 || new URL(url).hostname;

    // 作者（og:author / 公众号 author）
    // 注意：微信等平台常把 <meta name="author"> 塞成"点这里关注→"等引导噪声，
    // 必须过 cleanAuthorName 过滤，避免污染 frontmatter。
    const ogAuthor =
      $('meta[property="og:article:author"]').attr('content')?.trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      '';
    let author = this.cleanAuthorName(ogAuthor);

    // 第一轮：全局噪声 DOM 移除
    $(
      'script, style, noscript, iframe, nav, header, footer, aside, form, .nav, .menu, ' +
        '.ad, [class*="ad-"], [id*="ad-"], [class*="banner"], [class*="popup"], ' +
        '[class*="cookie"], [id*="cookie"], [class*="subscribe"], [class*="newsletter"], ' +
        '[class*="related"], [class*="recommend"], [class*="hot-"], [class*="footer-"]',
    ).remove();

    // 第二轮：平台常见尾部噪声容器
    $(
      '#js_praise_btn, #js_reward_area, #js_author_name, #js_profile_article, ' +
        '#js_comment_area, #comment, .comment, .comments, .qr_code_pc, .qr_code, ' +
        '[class*="reward"], [class*="praise"], [class*="like"], ' +
        '[class*="share"], [class*="follow"]',
    ).remove();

    // 选择正文根容器
    const root = this.selectRoot($, url);
    root
      .find(
        'button, .btn, [class*="toolbar"], [class*="read-more"], ' +
          '[class*="related"], [class*="promo"], [class*="banner"]',
      )
      .remove();

    // 移除 base64 内联图片（保留外部链接图片），符合降噪规则 5
    root.find('img').each((_i, el) => {
      const src = $(el).attr('src') || '';
      if (src.startsWith('data:image/')) {
        $(el).remove();
      }
    });

    // Readability 语义化降噪：仅当其提取的正文【不少于】cheerio 容器时才采用。
    // 原因：Readability 对动态渲染 / 复杂结构的页面可能误判，只提取到标题 + 首段；
    // 若无条件覆盖，会把 cheerio 提取的完整正文截短（这是"导入内容太短"的根因）。
    let articleHtml = root.html() || '';
    try {
      const { Readability } = require('@mozilla/readability') as {
        Readability: new (doc: Document) => {
          parse: () => { content: string; title?: string } | null;
        };
      };
      const { JSDOM } = require('jsdom') as {
        JSDOM: new (
          html: string,
          options?: { url?: string },
        ) => { window: { document: Document } };
      };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dom = new JSDOM(html, { url });
      const article = new Readability(dom.window.document).parse();
      if (article && article.content) {
        const rootTextLen = (root.text() || '').replace(/\s+/g, '').length;
        const readTextLen = this.stripHtml(article.content)
          .replace(/\s+/g, '')
          .length;
        if (readTextLen >= rootTextLen) {
          articleHtml = article.content;
          this.logger.debug(
            `Readability 采用（${readTextLen} 字 ≥ cheerio ${rootTextLen} 字）`,
          );
        } else {
          this.logger.debug(
            `Readability 内容更短（${readTextLen} 字 < cheerio ${rootTextLen} 字），保留完整正文`,
          );
        }
      }
    } catch (e) {
      this.logger.debug(`Readability 解析跳过：${(e as Error).message}`);
    }

    // Turndown 输出 GFM Markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });
    // 图片链接保留原始 URL，不生成 base64（base64 已在上面移除）
    turndown.remove(['script', 'style', 'noscript']);
    let markdown = turndown.turndown(articleHtml || root.html() || '');

    // 平台专用：作者名提取（按优先级依次尝试，避免命中"点这里关注→"等引导噪声）
    if (!author) {
      const authorCandidates = [
        '#js_name', // 微信公众号名（id 稳定，优先）
        '.rich_media_meta_text', // 微信标准作者/发布账号
        '.author',
        '[class*="author"]',
      ];
      for (const sel of authorCandidates) {
        const el = $(sel).first();
        if (el.length) {
          const t = this.cleanAuthorName(el.text().trim());
          if (t && t.length < 30) {
            author = t;
            break;
          }
        }
      }
    }

    markdown = this.cleanMarkdown(markdown);

    const tags = [platformLabel];
    return {
      title: this.cleanTitle(title),
      markdown: this.buildFrontmatter({
        title: this.cleanTitle(title),
        source: url,
        author,
        platform: platformLabel,
        tags,
      }) + '\n\n' + markdown,
      tags,
      platformLabel,
    };
  }

  /** 挑选正文容器（平台感知） */
  private selectRoot($: cheerio.CheerioAPI, url: string): cheerio.Cheerio<any> {
    const host = new URL(url).hostname.toLowerCase();
    const pickFirst = (selectors: string[]): cheerio.Cheerio<any> | null => {
      for (const sel of selectors) {
        const el = $(sel).first();
        if (el.length && el.text().trim().length > 0) return el;
      }
      return null;
    };
    if (host.includes('mp.weixin.qq.com')) {
      return (
        pickFirst(['#js_content', '.rich_media_content']) ||
        pickFirst(['article']) ||
        $('body')
      );
    }
    if (host.includes('zhihu.com')) {
      return (
        pickFirst(['.Post-RichText', '.RichText', '.ArticleContent']) ||
        pickFirst(['article']) ||
        $('body')
      );
    }
    // 通用页面：覆盖常见博客 / 文章正文容器（命中失败时回退 body，保证内容完整）
    return (
      pickFirst([
        'article',
        'main',
        '#content',
        '.content',
        '.post-content',
        '.entry-content',
        '.post-body',
        '.article-body',
        '.article-content',
        '.markdown-body',
        '.single-content',
        '.post',
        '.entry',
        '[class*="article-content"]',
        '[class*="post-content"]',
        '[class*="rich-text"]',
        // 小红书图文笔记（SSR 正文容器，分享链接通常可无需登录阅读）
        '.note-content',
        '.note-text',
        '#detail-desc',
        '[class*="note-desc"]',
      ]) || $('body')
    );
  }

  // ==================== 视频分支（元数据型导入） ====================

  /** 是否启用本地 ASR（whisper 转录，仅用于本地上传的音频/视频文件） */
  private get enableLocalAsr(): boolean {
    const v = this.configService.get<string>('ENABLE_LOCAL_ASR', 'false');
    return v === 'true' || v === '1' || v === 'yes';
  }

  /**
   * 视频平台「元数据型」导入：不下载视频、不转录语音。
   * 用户回看时点开原始链接即可，素材只需可靠的标题/作者/简介/链接。
   * - 抖音/快手/微信视频号：公开页面实测不吐任何元数据（JS 反爬壳），
   *   只能依赖 App 分享口令文本解析出的作者/标题/话题；纯链接则生成收藏卡片。
   * - B站：官方公开 API（x/web-interface/view）直取标题/UP主/简介/发布时间/封面/时长。
   * - 其他视频平台（如 YouTube）：返回 null，交给常规网页抓取（og 元数据一般可用）。
   */
  private async tryImportVideoMeta(
    rawInput: string,
    url: string,
    platform: LinkPlatform,
    platformLabel: string,
  ): Promise<{
    title: string;
    markdown: string;
    tags: string[];
    platformLabel: string;
  } | null> {
    if (platform === 'bilibili') {
      return this.importBilibiliVideo(rawInput, url, platformLabel);
    }
    if (platform === 'douyin' || platform === 'kuaishou' || platform === 'shipinhao') {
      // 口令文本是唯一可靠字段；纯链接也能正常收藏（点击来源即达）
      return await this.buildVideoLinkCard(rawInput, url, platformLabel);
    }
    return null; // YouTube 等 → 常规网页抓取
  }

  /**
   * 生成「视频链接收藏卡片」：字段来自分享口令文本（作者/标题/话题），
   * 不请求平台页面。纯链接无任何字段时标题用平台占位，保证回看可达。
   */
  private async buildVideoLinkCard(
    rawInput: string,
    url: string,
    platformLabel: string,
  ): Promise<{
    title: string;
    markdown: string;
    tags: string[];
    platformLabel: string;
  }> {
    const share = parseShareText(rawInput);
    let pageTitle = '';
    let pageDescription = '';
    // 只有纯链接、没有分享文案时，尝试抓取页面标题兜底
    if (!share.title) {
      try {
        const parsed = await this.urlParserService.fetchUrlContent(url);
        const fetchedTitle = this.cleanTitle(parsed.title);
        // 过滤平台首页/通用占位标题（如 www.douyin.com、抖音 - 记录美好生活）
        if (
          fetchedTitle &&
          fetchedTitle !== new URL(url).hostname &&
          !/记录美好生活|抖音短视频|快手短视频/.test(fetchedTitle)
        ) {
          pageTitle = fetchedTitle;
        }
        pageDescription = parsed.description || '';
      } catch (e) {
        this.logger.debug(
          `视频页面标题抓取失败：${(e as Error).message}`,
        );
      }
    }
    const tags = [platformLabel, ...(share.tags || [])].filter(
      (t, i, arr) => arr.indexOf(t) === i,
    ).slice(0, 8);
    const title = this.cleanTitle(
      share.title || pageTitle || `${platformLabel}视频`,
    );
    const linkOnly = !share.hasShareMeta;
    const infoLines = [
      `## 视频信息`,
      ``,
      share.author ? `- **作者**：${share.author}` : '',
      `- **来源**：[${url}](${url})`,
      `- **说明**：${
        linkOnly
          ? '该平台公开页面不提供元数据，已收藏链接，点击上方来源即可观看原视频。'
          : '以下信息来自分享文案（该平台公开页面不提供元数据），点击上方来源即可观看原视频。'
      }`,
    ]
      .filter((line) => line !== '')
      .join('\n');
    const descriptionText = share.rawDescription || pageDescription;
    const body = [
      infoLines,
      '',
      descriptionText
        ? `> ${descriptionText.replace(/\n+/g, ' ').slice(0, 800)}`
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
    const markdown = this.cleanMarkdown(
      this.buildFrontmatter({
        title,
        source: url,
        author: share.author || '',
        platform: platformLabel,
        tags,
      }) +
        '\n\n' +
        body,
    );
    return { title, markdown, tags, platformLabel };
  }

  /** B站官方公开 API（x/web-interface/view）：标题/UP主/简介/发布时间/封面/时长 */
  private async importBilibiliVideo(
    rawInput: string,
    url: string,
    platformLabel: string,
  ): Promise<{
    title: string;
    markdown: string;
    tags: string[];
    platformLabel: string;
  }> {
    const bvid = url.match(/BV[0-9A-Za-z]{10}/)?.[0] || '';
    if (!bvid) return await this.buildVideoLinkCard(rawInput, url, platformLabel);
    try {
      const res = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        {
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            referer: 'https://www.bilibili.com/',
            accept: 'application/json, text/plain, */*',
          },
          redirect: 'follow',
        },
      );
      const json = (await res.json()) as {
        code?: number;
        message?: string;
        data?: {
          title?: string;
          desc?: string;
          pic?: string;
          duration?: number;
          pubdate?: number;
          owner?: { name?: string };
          stat?: { view?: number; danmaku?: number; like?: number };
        };
      };
      if (!res.ok || !json || json.code !== 0 || !json.data) {
        throw new Error(
          `B站 API 异常 code=${json?.code ?? res.status} ${json?.message ?? ''}`,
        );
      }
      const d = json.data;
      const title = this.cleanTitle(String(d.title || ''));
      const author = String(d.owner?.name || '');
      const desc = this.cleanVideoText(String(d.desc || ''));
      const published = d.pubdate
        ? new Date(d.pubdate * 1000).toISOString().slice(0, 10)
        : '';
      const duration = this.formatDuration(Number(d.duration || 0));
      const pic = String(d.pic || '')
        .replace(/^http:\/\//i, 'https://')
        .replace(/^\/\//, 'https://');
      const stat = d.stat || {};
      const tags = [platformLabel];
      const infoLines = [
        `## 视频信息`,
        ``,
        `- **标题**：${title}`,
        author ? `- **UP主**：${author}` : '',
        `- **来源**：[${url}](${url})`,
        duration !== '未知' ? `- **时长**：${duration}` : '',
        published ? `- **发布时间**：${published}` : '',
        `- **数据**：播放 ${stat.view ?? '?'} · 弹幕 ${stat.danmaku ?? '?'} · 点赞 ${stat.like ?? '?'}`,
      ]
        .filter((line) => line !== '')
        .join('\n');
      const body = [
        infoLines,
        '',
        pic ? `![视频封面](${pic})` : '',
        '',
        desc ? `> 简介\n\n${desc}` : '',
      ]
        .filter((line) => line !== '')
        .join('\n');
      const markdown = this.cleanMarkdown(
        this.buildFrontmatter({
          title,
          source: url,
          author,
          platform: platformLabel,
          tags,
        }) +
          '\n\n' +
          body,
      );
      return { title, markdown, tags, platformLabel };
    } catch (e) {
      this.logger.warn(`B站 API 获取失败，降级为链接收藏：${(e as Error).message}`);
      return await this.buildVideoLinkCard(rawInput, url, platformLabel);
    }
  }

  /** 查找命令路径（yt-dlp / ffmpeg / whisper 等） */
  private async findCommand(names: string[]): Promise<string> {
    // 1. 环境变量显式指定：如 YTDLP_PATH、FFMPEG_PATH、WHISPER_PATH
    for (const name of names) {
      const envKey = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_PATH';
      const envVal = process.env[envKey];
      if (envVal && fs.existsSync(envVal)) return envVal;
    }
    // 2. 本地自带目录 backend/bin（放 yt-dlp.exe / ffmpeg.exe 免装系统 PATH）
    const binDir = path.join(process.cwd(), 'bin');
    for (const name of names) {
      for (const exe of [name, name + '.exe']) {
        const p = path.join(binDir, exe);
        if (fs.existsSync(p)) return p;
      }
    }
    // 3. npm 依赖 ffmpeg-static 自带的 ffmpeg 二进制
    if (names.includes('ffmpeg')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegPath = require.resolve('ffmpeg-static');
        if (ffmpegPath) return ffmpegPath;
      } catch {
        /* 未安装 ffmpeg-static */
      }
    }
    // 4. 系统 PATH
    const { execFile } = await import('child_process');
    const execFileAsyncLocal = promisify(execFile);
    for (const name of names) {
      try {
        if (process.platform === 'win32') {
          const { spawnSync } = require('child_process') as typeof import('child_process');
          const r = spawnSync('where', [name], { encoding: 'utf-8' });
          if (r.status === 0 && r.stdout.trim()) return name;
        } else {
          await execFileAsyncLocal('which', [name]);
          return name;
        }
      } catch {
        /* 继续尝试下一个 */
      }
    }
    throw new Error(`未找到命令：${names.join(' / ')}`);
  }

  private formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '未知';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  /** 视频文案/简介清洗：压缩空行与行尾空白，控制长度 */
  private cleanVideoText(text: string, max = 15_000): string {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, max);
  }

  // ==================== 文件分支 ====================

  private async importFromFile(
    buffer: Buffer,
    originalName: string,
  ): Promise<{ title: string; markdown: string; tags: string[]; platformLabel?: string }> {
    const ext = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();
    const audioVideoExts = ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.mp4', '.mov', '.webm', '.mkv'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    // 音频/视频：受 ENABLE_LOCAL_ASR 控制，仅当开关打开且 whisper 可用时转录
    if (audioVideoExts.includes(ext)) {
      const result = await this.importAudioVideo(buffer, originalName);
      if (result) return result;
    }

    // PDF / Word / Markdown / 图片 / TXT：现有 FileParserService
    const parsed = await this.fileParserService.parse(buffer, originalName);
    const text = parsed.text || '';
    if (!text.trim()) {
      throw new BadRequestException(`文件解析失败：未能从「${originalName}」提取到内容`);
    }

    // 清洗连续空行/乱码占位符
    const cleanedText = this.cleanPlainText(text);
    const baseName = originalName.replace(/\.[^.]+$/, '').trim() || '未命名文件';
    const tags: string[] = ['本地文件'];

    const kindLabel: Record<string, string> = {
      pdf: 'PDF 文档',
      word: 'Word 文档',
      markdown: 'Markdown',
      text: '纯文本',
      image: '图片',
    };
    const markdown =
      this.buildFrontmatter({
        title: baseName,
        source: '',
        author: '',
        platform: 'local-file',
        tags,
      }) +
      '\n\n' +
      `> 本地文件：**${originalName}**（${kindLabel[parsed.kind] || '文件'}）\n\n` +
      cleanedText;

    return {
      title: baseName,
      markdown: this.cleanMarkdown(markdown),
      tags,
      platformLabel: '本地文件',
    };
  }

  /** 音频/视频转录（ENABLE_LOCAL_ASR=true 时） */
  private async importAudioVideo(
    buffer: Buffer,
    originalName: string,
  ): Promise<{ title: string; markdown: string; tags: string[]; platformLabel?: string } | null> {
    if (!this.enableLocalAsr) {
      // 关闭时保存为「音频/视频素材」占位
      const baseName = originalName.replace(/\.[^.]+$/, '').trim() || '未命名媒体';
      const tags: string[] = ['本地文件'];
      const markdown =
        this.buildFrontmatter({
          title: baseName,
          source: '',
          author: '',
          platform: 'local-file',
          tags,
        }) +
        '\n\n' +
        `> 本地媒体文件：**${originalName}**\n\n` +
        `> 当前未启用本地 ASR（ENABLE_LOCAL_ASR=false），未做语音转录。如需语音转文字，请在后端 .env 中设置 ENABLE_LOCAL_ASR=true（需安装 whisper 本地模型）。`;
      return {
        title: baseName,
        markdown: this.cleanMarkdown(markdown),
        tags,
        platformLabel: '本地文件',
      };
    }

    // 开启 ASR：尝试本地 whisper
    try {
      const whisperPath = await this.findCommand(['whisper']);
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimport-audio-'));
      const mediaFile = path.join(tmpDir, 'media' + path.extname(originalName).toLowerCase());
      fs.writeFileSync(mediaFile, buffer);
      try {
        await execFileAsync(whisperPath, [
          mediaFile,
          '--output_format',
          'srt',
          '--output_dir',
          tmpDir,
          '--language',
          'auto',
          '--verbose',
          'False',
        ], { timeout: this.MAX_PARSE_MS, maxBuffer: 16 * 1024 * 1024 });
        const srtFile = fs.existsSync(path.join(tmpDir, 'media.srt'))
          ? fs.readFileSync(path.join(tmpDir, 'media.srt'), 'utf-8')
          : '';
        if (srtFile) {
          const baseName = originalName.replace(/\.[^.]+$/, '').trim() || '未命名媒体';
          const tags: string[] = ['本地文件'];
          const markdown =
            this.buildFrontmatter({
              title: baseName,
              source: '',
              author: '',
              platform: 'local-file',
              tags,
            }) +
            '\n\n' +
            `> 本地媒体文件：**${originalName}**（本地 Whisper 转录，带时间戳）\n\n` +
            srtFile;
          return {
            title: baseName,
            markdown: this.cleanMarkdown(markdown),
            tags,
            platformLabel: '本地文件',
          };
        }
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* 忽略 */
        }
      }
    } catch (e) {
      this.logger.warn(`音频/视频本地转录失败：${(e as Error).message}`);
    }
    return null;
  }

  // ==================== 降噪 + frontmatter ====================

  /** 构建 YAML frontmatter 元数据块 */
  private buildFrontmatter(meta: {
    title: string;
    source: string;
    author: string;
    platform: string;
    tags: string[];
  }): string {
    const importTime = new Date().toISOString().slice(0, 10);
    const esc = (s: string) => s.replace(/["\\]/g, '').replace(/\n/g, ' ');
    const lines = [
      '---',
      `title: "${esc(meta.title)}"`,
      `source: "${esc(meta.source)}"`,
      `author: "${esc(meta.author)}"`,
      `platform: "${esc(meta.platform)}"`,
      `import_time: ${importTime}`,
      `tags: [${meta.tags.map((t) => `"${esc(t)}"`).join(', ')}]`,
      '---',
    ];
    return lines.join('\n');
  }

  /** 标题清理：去掉换行/前后空白/超长截断 */
  private cleanTitle(title: string): string {
    const t = (title || '').replace(/\s+/g, ' ').trim();
    return t.length > 200 ? t.slice(0, 200) + '…' : t || '未命名素材';
  }

  /** Markdown 降噪（核心） */
  private cleanMarkdown(markdown: string): string {
    if (!markdown) return '';
    let md = markdown;

    // 1. 连续 3 行及以上空行 → 1 个空行
    md = md.replace(/\n{3,}/g, '\n\n');

    // 2. 行首/行尾多余空白
    md = md.replace(/[ \t]+\n/g, '\n');

    // 3. 清除 cookie/订阅/隐私弹窗残留文字
    md = md
      .replace(/^(接受并继续|接受|同意并继续|拒绝|知道了|仅接受必要|Cookie 设置|隐私政策)[\s\S]{0,200}?$/gm, '')
      .replace(/(接受并继续|同意并继续|仅接受必要|Cookie 设置)[\s\S]{0,60}(确定|同意)/g, '');

    // 4. 清除关注/分享/推荐等无意义尾巴（微信公众号常见）
    md = md
      .replace(/^点这里(关注|赞|在看|收藏|赞赏|分享)[\s\S]{0,50}$/gm, '')
      .replace(/^点击(这里)?(关注|赞|在看|收藏|赞赏|分享)[\s\S]{0,50}$/gm, '')
      .replace(/^长按.{0,15}(二维码|识别)[\s\S]{0,50}$/gm, '')
      .replace(/^(微信扫一扫|扫一扫|识别二维码)[\s\S]{0,30}$/gm, '')
      .replace(/^在小说阅读器(中)?阅读本章$/gm, '')
      .replace(/^(阅读原文|继续阅读|展开全文|收起全文|更多精彩|推荐阅读|往期精选)[\s\S]{0,80}$/gm, '');

    // 5. 重复分割线（--- 连续出现 2 行以上 → 保留 1 个）
    md = md.replace(/(^\s*---\s*$){2,}/gm, '\n---\n');

    // 6. 无效空列表项 / 残留的纯分隔符行
    md = md.replace(/^\s*[-*]\s*$/gm, '');
    md = md.replace(/^([-—_=])\1{4,}$/gm, '');

    // 7. 空行净化 + 首尾 trim
    md = md.replace(/\n{3,}/g, '\n\n').trim();

    return md;
  }

  /** 粗略剥离 HTML 标签，仅用于文本长度对比（Readability vs cheerio） */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ');
  }

  /**
   * 作者名去噪：剔除"点这里关注→"等平台引导文本残留。
   * 微信等平台常把 meta author 或页面文案塞入关注引导语。
   */
  private cleanAuthorName(name: string): string {
    return name
      .replace(
        /点这里关注|点击关注|扫码关注|长按识别|关注我们|关注公众号|，看更多|，防走失|防迷路|微信扫一扫|识别二维码/gi,
        '',
      )
      .replace(/[→➜>»·\s]+$/g, '')
      .trim();
  }

  /** 纯文本（文件提取）降噪 */
  private cleanPlainText(text: string): string {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\f/g, '\n') // PDF 分页符
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

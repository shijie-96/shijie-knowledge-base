import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface ParsedUrlContent {
  /** 网页标题 */
  title: string;
  /** 提取后的正文纯文本 */
  text: string;
  /** 原始 URL */
  url: string;
  /** 语言编码（检测用） */
  encoding?: string;
  /** 页面描述（og:description，视频平台通常在此提供简介） */
  description?: string;
  /** 平台识别信息 */
  platform: LinkPlatformInfo;
}

export type LinkPlatform =
  | 'weixin'
  | 'zhihu'
  | 'youtube'
  | 'douyin'
  | 'bilibili'
  | 'xiaohongshu'
  | 'kuaishou'
  | 'shipinhao'
  | 'generic';

export interface LinkPlatformInfo {
  platform: LinkPlatform;
  /** 中文名称（可直接用作标签） */
  label: string;
  /** 内容类型：article 可抓正文；video 只能取标题/描述；unknown 视情况 */
  kind: 'article' | 'video' | 'unknown';
}

/**
 * 短链域名 → 平台映射（App 分享出去的短链，域名即平台，无需展开即可判定归属）
 */
export const SHORT_LINK_PLATFORMS: Record<string, LinkPlatform> = {
  'b23.tv': 'bilibili', // B站
  'v.douyin.com': 'douyin', // 抖音
  'z.douyin.com': 'douyin', // 抖音安全验证落地域
  'iesdouyin.com': 'douyin',
  'xhslink.com': 'xiaohongshu', // 小红书
  'v.kuaishou.com': 'kuaishou', // 快手
  'youtu.be': 'youtube',
};

/**
 * 识别链接所属平台（微信公众号 / 知乎 / YouTube / 抖音 / B站 / 小红书 / 快手 / 微信视频号 / 其他网页）
 */
export function detectPlatform(rawUrl: string): LinkPlatformInfo {
  let host = '';
  try {
    const normalized = /^https?:\/\//i.test(rawUrl.trim())
      ? rawUrl.trim()
      : 'https://' + rawUrl.trim();
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return { platform: 'generic', label: '网页', kind: 'unknown' };
  }

  // 纯短链域（无需展开即可归属平台）
  for (const [shortHost, platform] of Object.entries(SHORT_LINK_PLATFORMS)) {
    if (host === shortHost || host.endsWith('.' + shortHost)) {
      return {
        platform,
        label: PLATFORM_LABEL[platform],
        kind: PLATFORM_KIND[platform],
      };
    }
  }

  if (/mp\.weixin\.qq\.com$/.test(host)) {
    return { platform: 'weixin', label: '微信公众号', kind: 'article' };
  }
  if (/channels\.weixin\.qq\.com$/.test(host)) {
    // 微信视频号：作品内容在视频画面，正文基本为空
    return { platform: 'shipinhao', label: '微信视频号', kind: 'video' };
  }
  if (/(^|\.)zhihu\.com$/.test(host)) {
    return { platform: 'zhihu', label: '知乎', kind: 'article' };
  }
  if (/(^|\.)youtube\.com$/.test(host)) {
    return { platform: 'youtube', label: 'YouTube', kind: 'video' };
  }
  if (/(^|\.)douyin\.com$/.test(host)) {
    return { platform: 'douyin', label: '抖音', kind: 'video' };
  }
  if (/(^|\.)bilibili\.com$/.test(host)) {
    return { platform: 'bilibili', label: 'B站', kind: 'video' };
  }
  if (/(^|\.)xiaohongshu\.com$/.test(host)) {
    // 小红书图文正文 SSR 可抓，视频语音需另做 ASR；归 article 保证图文能落内容
    return { platform: 'xiaohongshu', label: '小红书', kind: 'article' };
  }
  if (/(^|\.)kuaishou\.com$/.test(host)) {
    return { platform: 'kuaishou', label: '快手', kind: 'video' };
  }
  return { platform: 'generic', label: '网页', kind: 'unknown' };
}

const PLATFORM_LABEL: Record<LinkPlatform, string> = {
  weixin: '微信公众号',
  zhihu: '知乎',
  youtube: 'YouTube',
  douyin: '抖音',
  bilibili: 'B站',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  shipinhao: '微信视频号',
  generic: '网页',
};

const PLATFORM_KIND: Record<LinkPlatform, LinkPlatformInfo['kind']> = {
  weixin: 'article',
  zhihu: 'article',
  youtube: 'video',
  douyin: 'video',
  bilibili: 'video',
  xiaohongshu: 'article',
  kuaishou: 'video',
  shipinhao: 'video',
  generic: 'unknown',
};

/**
 * 从用户粘贴的「App 分享口令」整段文本中提取第一个 http(s) 链接。
 * 抖音/小红书/快手等 App 复制的是一段中文口令 + https 短链混合文本，
 * 必须先把 URL 抠出来才能交给后续识别。
 */
export function extractUrlFromText(text: string): string | null {
  if (!text) return null;
  // 直接就是干净 URL
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    const m = trimmed.match(/^https?:\/\/[^\s"'<>，。；、！？）】]+/i);
    return m ? m[0].replace(/[),.。;，;！!？?]+$/g, '') : trimmed;
  }
  // 从混合口令文本中提取
  const m = text.match(/https?:\/\/[^\s"'<>，。；、！？）】]+/i);
  if (!m) return null;
  return m[0].replace(/[),.。;，;！!？?]+$/g, '');
}

/** App 分享口令的结构化解析结果 */
export interface ShareTextMeta {
  /** 抠出的真实链接（无则 null） */
  url: string | null;
  /** 【】块内作者名（形如「作者的作品/分享」） */
  author: string | null;
  /** 清洗后的标题：优先作者块后的文案，无文案时取首个话题 */
  title: string | null;
  /** 话题标签（#tag，支持 # 与文字间有空格） */
  tags: string[];
  /** 作者块之后、链接之前的原始描述文本（可能全为话题，去首尾噪声但保留 #） */
  rawDescription: string | null;
  /** 是否解析到作者/标题/话题任一结构化信息 */
  hasShareMeta: boolean;
}

/**
 * 结构化解析 App 分享口令/分享文本（抖音/快手/B站等）。
 *
 * 典型抖音格式：
 *   "8.88 复制打开抖音，看看【道源的作品】40岁阿霞重生录 #女性成长
 *    https://v.douyin.com/xxx/ 复制此链接，打开Dou音搜索，直接观看视频！"
 *
 * 字段来源：
 * - 作者：取【】内「xx的作品」的 xx
 * - 标题：取【】结束到 URL 之间的文案（剔除话题标签与首尾噪声）
 * - 话题：整段中所有 #tag
 * - 描述：作者块到 URL 之间的原始文本（保留话题，供正文展示）
 *
 * 实测抖音公开页面不吐任何元数据（JS 反爬壳），口令文本是第三方唯一可靠的字段来源。
 */
export function parseShareText(text: string): ShareTextMeta {
  const full = (text || '').replace(/\r\n/g, '\n');
  const url = extractUrlFromText(full);

  // 1. 作者：【xx的作品/分享/视频/直播】；无「的xx」后缀则取【】内容并清理前缀/后缀
  let author: string | null = null;
  const authorWork = full.match(/【\s*([^【】\n]{1,60}?)\s*的(作品|分享|视频|直播)】/);
  if (authorWork) {
    author = authorWork[1].trim() || null;
  } else {
    const bracket = full.match(/【\s*([^【】\n]{1,80})】/);
    if (bracket) {
      const inner = bracket[1]
        .replace(/^(看看|分享)?\s*/, '')
        .replace(/(的视频|的分享|的作品|的直播)$/, '')
        .trim();
      author = inner || null;
    }
  }

  // 2. 描述区：作者块结束 → URL 开始 之间的文本
  const closeIdx = full.indexOf('】');
  const urlIdx = url ? full.indexOf(url) : -1;
  let descZone = '';
  if (closeIdx > -1) {
    descZone = full.slice(closeIdx + 1, urlIdx > closeIdx ? urlIdx : full.length);
  } else if (urlIdx > -1) {
    descZone = full.slice(0, urlIdx);
  }
  descZone = descZone
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，。.、:：;；\-—_]+/, '')
    .replace(/[\s,，。.、:：;；\-—_]+$/, '')
    .trim();

  // 3. 话题标签（# 与文字间允许空格；排除紧跟的 URL）
  const tags: string[] = [];
  const tagRe = /#\s*([^\s#，,。.!?！？;；、:：)）】]+)/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(full)) !== null) {
    const t = tm[1].trim();
    if (!t || /^https?:\/\//i.test(t)) continue;
    if (!tags.includes(t)) tags.push(t);
  }

  // 4. 标题：描述区剔除话题后的文案优先，否则首个话题
  let descText = descZone
    .replace(/#\s*([^\s#，,。.!?！？;；、:：)）】]+)/g, '')
    .trim();
  descText = descText
    .replace(/^[\s,，。.、:：;；]+/, '')
    .replace(/[\s,，。.、:：;；]+$/, '')
    .replace(/^(看看|分享)\s*/, '')
    .replace(/(复制此链接|打开Dou音|打开抖音搜索|打开抖音|直接观看视频|长按复制此条消息)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let title = descText.length > 0 ? descText : tags[0] || null;
  if (title) title = title.replace(/\s+/g, ' ').slice(0, 200);

  const hasShareMeta = Boolean(author || title || tags.length);
  return {
    url,
    author,
    title: title || null,
    tags,
    rawDescription: descZone || null,
    hasShareMeta,
  };
}

/** 是否为已知短链（需要展开重定向获得真实页面 URL） */
export function isShortLinkUrl(rawUrl: string): boolean {
  try {
    const normalized = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : 'https://' + rawUrl;
    const host = new URL(normalized).hostname.toLowerCase();
    return Object.keys(SHORT_LINK_PLATFORMS).some(
      (h) => host === h || host.endsWith('.' + h),
    );
  } catch {
    return false;
  }
}

/**
 * 跟随重定向展开短链，返回最终 URL（如 v.douyin.com/xxx → www.douyin.com/video/xxx）。
 * 仅用于把 source 元数据规范化；解析主流程不受影响（fetch / yt-dlp 本身会跟随重定向）。
 */
export async function resolveRedirectUrl(
  rawUrl: string,
  timeoutMs = 8_000,
): Promise<string | null> {
  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (res.body) {
      try {
        await res.body.cancel();
      } catch {
        /* 忽略 */
      }
    }
    return res.url || url;
  } catch {
    return null; // 展开失败不阻塞主流程
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULT_TIMEOUT = 15000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * URL 内容提取服务
 *
 * 使用 Node 原生 fetch + cheerio 解析 HTML，自动处理字符编码（UTF-8 / GBK 等）
 * 并剥离脚本、样式与导航噪声，返回标题与正文纯文本。
 *
 * 平台感知：
 * - 文章类（微信/知乎/普通网页）：提取正文全文
 * - 视频类（YouTube/B站/抖音）：页面正文为 JS 渲染，退化为提取标题 + 页面描述
 * - 非 HTML 资源：返回结构化占位文本
 */
@Injectable()
export class UrlParserService {
  private readonly logger = new Logger(UrlParserService.name);

  async fetchUrlContent(rawUrl: string): Promise<ParsedUrlContent> {
    // URL 规范化（协议缺失时补全）
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    const parsed = new URL(url);
    const platform = detectPlatform(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    try {
      let res: Response;
      try {
        res = await fetch(parsed.href, {
          signal: controller.signal,
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          redirect: 'follow',
        });
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        this.logger.warn(`抓取页面网络失败：${parsed.href}，${reason}`);
        throw new Error(`无法访问该链接：${reason}`);
      }

      if (!res.ok) {
        throw new Error(`请求失败：HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        // 非 HTML（如 PDF/图片）直接作为原始输入存入，仍可提取标题
        return this.parseNonHtml(url, contentType, platform);
      }

      // 读取并解析编码
      const buffer = Buffer.from(await res.arrayBuffer());
      const html = this.decodeBuffer(buffer);
      return this.parseHtml(html, url, platform);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 解析 HTML：提取标题与正文纯文本 */
  parseHtml(
    html: string,
    url: string,
    platform: LinkPlatformInfo = detectPlatform(url),
  ): ParsedUrlContent {
    const $ = cheerio.load(html);

    // 标题：优先 og:title，其次 title 标签
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
    const docTitle = $('title').first().text().trim();
    const h1 = $('h1').first().text().trim();
    const title = ogTitle || docTitle || h1 || new URL(url).hostname;

    // 页面描述（视频平台常用 og:description 提供简介）
    const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
    const description =
      ogDesc || $('meta[name="description"]').attr('content')?.trim() || '';

    // 第一轮：移除明显噪声元素（脚本/样式/导航/广告/表单/侧边栏）
    $(
      'script, style, noscript, iframe, nav, header, footer, aside, form, .nav, .menu, ' +
        '.ad, [class*="ad-"], [id*="ad-"], [class*="banner"], [class*="popup"]',
    ).remove();

    // 第二轮：移除平台常见的尾部噪声容器
    $(
      '#js_praise_btn, #js_reward_area, #js_author_name, #js_profile_article, ' +
        '#js_comment_area, #comment, .comment, .comments, .qr_code_pc, .qr_code, ' +
        '[class*="reward"], [class*="praise"], [class*="like"], ' +
        '[class*="share"], [class*="follow"], [class*="related"]',
    ).remove();

    // 第三轮：选平台特定正文容器
    const root = this.selectContentRoot($, platform);
    // 在容器内再做一次清理（去掉残余的小工具块）
    root
      .find(
        'button, .btn, [class*="toolbar"], [class*="footer-article"], ' +
          '[class*="read-more"], [class*="related"]',
      )
      .remove();

    let rawText = root.text();
    // 第四轮：清洗文本——空行、大量空格、噪声短行
    let text = this.cleanBodyText(rawText);

    // 视频/动态渲染平台：正文通常为空，退化为「标题 + 描述」说明
    if (platform.kind === 'video' && !text) {
      text = description
        ? `[${platform.label}视频，正文由页面动态渲染，已提取以下简介]\n\n${description}`
        : `[${platform.label}视频链接。页面正文为动态渲染，无法直接提取全文，已保存视频信息。]`;
    }
    // 文章平台但正文过短（多为登录/验证拦截），附上描述兜底
    if (platform.kind === 'article' && text.length < 50 && description) {
      text = text ? `${description}\n\n${text}`.trim() : description;
    }

    return {
      title,
      text,
      url,
      encoding: 'utf-8',
      description,
      platform,
    };
  }

  /**
   * 按平台挑选正文容器节点。
   * - 微信公众号：#js_content（最权威）
   * - 知乎答案或文章：.RichText / .Post-RichText / .ArticleContent
   * - 通用：<article> 优先，其次 main / #content / body
   */
  private selectContentRoot(
    $: cheerio.CheerioAPI,
    platform: LinkPlatformInfo,
  ): cheerio.Cheerio<any> {
    const pickFirst = (selectors: string[]): cheerio.Cheerio<any> | null => {
      for (const sel of selectors) {
        const el = $(sel).first();
        if (el.length && el.text().trim().length > 0) return el;
      }
      return null;
    };

    if (platform.platform === 'weixin') {
      return (
        pickFirst(['#js_content']) ||
        pickFirst(['.rich_media_content']) ||
        pickFirst(['article']) ||
        $('body')
      );
    }
    if (platform.platform === 'zhihu') {
      return (
        pickFirst([
          '.Post-RichText',
          '.RichText',
          '.ArticleContent',
          '.Answer .RichText',
        ]) ||
        pickFirst(['article']) ||
        $('body')
      );
    }
    return (
      pickFirst([
        'article',
        'main',
        '#content',
        '.content',
        '.post-content',
        // 小红书图文笔记 SSR 正文容器
        '.note-content',
        '.note-text',
        '#detail-desc',
      ]) || $('body')
    );
  }

  /**
   * 正文文本清洗：
   * - 按空行切段
   * - 段内按中英句末标点拆句，逐句剔除「原创/点这里/收藏/在小说阅读器」等碎片噪声
   * - 残余的极短纯符号/空白行一并剔除
   */
  private cleanBodyText(raw: string): string {
    if (!raw) return '';

    // 1. 行级拆分：行内多余空白归一化为单空格，保留空行作为段落分隔
    const rawLines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) =>
        line.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').trim(),
      );

    // 2. 段落切分：连续空行作为段落边界
    const paragraphsRaw: string[][] = [];
    let buf: string[] = [];
    const pushParagraph = () => {
      if (buf.length) paragraphsRaw.push(buf);
      buf = [];
    };
    for (const line of rawLines) {
      if (line.length === 0) {
        pushParagraph();
        continue;
      }
      buf.push(line);
    }
    pushParagraph();

    // 3. 在更细的子句粒度上识别噪声
    //    - 微信常见的碎片短语（原创 / 关注 / 阅读器提示 等）
    const NOISE_PHRASES = [
      '原创',
      '点这里关注',
      '点这里赞',
      '点这里在看',
      '点这里收藏',
      '点这里赞赏',
      '点这里分享',
      '点击这里关注',
      '点击关注',
      '关注公众号',
      '扫码关注',
      '微信扫一扫',
      '扫一扫',
      '识别二维码',
      '长按识别',
      '赞赏作者',
      '喜欢作者',
      '已赞赏',
      '在小说阅读器阅读本章',
      '在小说阅读器中沉浸阅读',
      '在小说阅读器中阅读',
      '去阅读',
      '继续阅读',
      '展开全文',
      '收起全文',
      '收起',
      '展开',
      '阅读原文',
      '本文为原创',
      '作者声明',
      '本文原创',
      '禁止转载',
      '更多精彩',
      '点击查看',
      '精彩推荐',
      '推荐阅读',
      '往期精选',
    ];
    const NOISE_LINE_PATTERNS: RegExp[] = [
      /^点这里(关注|收藏|赞|在看|赞赏|分享)/,
      /^点击(这里)?(关注|收藏|赞|在看|赞赏|分享)/,
      /^(长按|扫描|扫一扫).{0,15}?(二维码|关注)/,
      /^长按.{0,8}?识别.{0,8}?(二维码|关注)/,
      /^在(.*?)阅读(器中)?(阅读|查看|继续|沉浸)/,
      /^(原创|作者声明|本文为原创)/,
      /^(赞赏|打赏|喜欢作者|已赞赏)/,
      /^(收起|展开|阅读原文|更多精彩|推荐阅读)$/,
      /^(微信扫一扫|扫一扫|识别二维码)$/,
      /^>>$/,
      /^<\/?[a-z]+>$/i,
      /^[\u2192\u2190\u2191\u2193\-—_=]{2,}$/,
    ];
    const isPureNoise = (s: string): boolean => {
      const stripped = s.replace(/[\s\p{P}]+/gu, '');
      if (stripped.length === 0) return true;
      const norm = s.replace(/\s+/g, '');
      if (NOISE_PHRASES.includes(norm)) return true;
      if (NOISE_LINE_PATTERNS.some((re) => re.test(s.trim()))) return true;
      // 仅含箭头/分隔符/单字符（如 >>、--）的纯符号行
      if (s.length <= 4 && /^[\s\W_]+$/.test(s)) return true;
      return false;
    };

    // 4. 按句末标点 + 箭头拆分子句（保留分隔符以便重组）
    const SPLIT_RE = /([。！？!?；;\n]+|→|阅读全文)/g;

    // 用来切分 token：中英文空白、箭头、分隔符、引号。注意要去掉括号内的英文括号
    const TOKEN_RE = /[\s→←↑↓,，。；：、!?！？：;“”"'『』/()（）{}\[\]【】<>《》]+/g;

    // 匹配 token 是否为已知的「碎片噪声」
    const NOISE_TOKEN_PATTERNS: RegExp[] = [
      /^原创$/,
      /^点这里(关注|收藏|赞|在看|赞赏|分享)$/,
      /^点击(这里)?(关注|收藏|赞|在看|赞赏|分享)$/,
      /^关注$/,
      /^关注公众号$/,
      /^扫码$/,
      /^扫码关注$/,
      /^扫码关注公众号$/,
      /^长按二维码$/,
      /^微信扫一扫$/,
      /^扫一扫$/,
      /^识别二维码$/,
      /^长按识别$/,
      /^赞赏作者$/,
      /^喜欢作者$/,
      /^已赞赏$/,
      /^在小说阅读器阅读本章$/,
      /^在小说阅读器中沉浸阅读$/,
      /^在小说阅读器中阅读$/,
      /^在小说阅读器阅读$/,
      /^去阅读$/,
      /^继续阅读$/,
      /^展开全文$/,
      /^收起全文$/,
      /^收起$/,
      /^展开$/,
      /^阅读原文$/,
      /^本文为原创$/,
      /^本文原创$/,
      /^作者声明$/,
      /^禁止转载$/,
      /^更多精彩$/,
      /^推荐阅读$/,
      /^往期精选$/,
      /^[\u2192\u2190\u2191\u2193\-—_=]{1,}$/,
      /^>>$/,
      /^[\d]+$/,
    ];
    const isNoiseToken = (t: string): boolean => {
      const stripped = t.replace(/[\s\p{P}]+/gu, '');
      if (stripped.length === 0) return true;
      return NOISE_TOKEN_PATTERNS.some((re) => re.test(t));
    };

    /**
     * 在子句内按 token 拆分，丢弃噪声 token，保留其余；
     * 若整句被噪声 token 覆盖（无保留），返回空数组。
     */
    const stripNoiseTokens = (sentence: string): string[] => {
      const tokens = sentence
        .split(TOKEN_RE)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const kept = tokens.filter((t) => !isNoiseToken(t));
      return kept;
    };

    // 递归切句：按 SPLIT_RE 拆成 (文本, 分隔符) 对，分隔符保留为句末标点
    const SPLIT_KEEPS_DELIMS = /(。|！|？|；|!|\?|;|\n|→|阅读全文)/g;
    const cleanSentences = (line: string): string[] => {
      const segs: string[] = [];
      let lastIndex = 0;
      const matches: { start: number; end: number; token: string }[] = [];
      let m: RegExpExecArray | null;
      const re = new RegExp(SPLIT_KEEPS_DELIMS);
      while ((m = re.exec(line)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, token: m[0] });
      }
      for (const cur of matches) {
        const textPart = line.slice(lastIndex, cur.start);
        const tail = line.slice(lastIndex, cur.end); // 包含分隔符
        // 主体按 token 去噪声（不包含分隔符，保留结尾标点附加）
        const cleaned = stripNoiseTokens(textPart);
        if (cleaned.length > 0) {
          let seg = cleaned.join(' ').replace(/\s{2,}/g, ' ').trim();
          if (cur.token) {
            // 末尾追加分隔符作为句子结尾标点（换行视作段尾，不拼接）
            if (cur.token !== '\n') seg += cur.token;
          }
          if (seg.length > 0) segs.push(seg);
        }
        lastIndex = cur.end;
      }
      // 处理无分隔符的尾巴
      const tailText = line.slice(lastIndex).trim();
      if (tailText.length > 0) {
        const cleaned = stripNoiseTokens(tailText);
        if (cleaned.length > 0) {
          segs.push(cleaned.join(' ').replace(/\s{2,}/g, ' ').trim());
        }
      }
      return segs;
    };

    // 5. 段内子句过滤 + 段内子句以逗号/分号合并成段
    const cleanParagraphs: string[] = [];
    for (const lines of paragraphsRaw) {
      const sentences: string[] = [];
      for (const line of lines) {
        const kept = cleanSentences(line);
        for (const s of kept) {
          // 同段落内不要再加 ' ' 之类的，保留原标点
          sentences.push(s);
        }
      }
      if (sentences.length) {
        cleanParagraphs.push(sentences.join(' ').replace(/\s{2,}/g, ' ').trim());
      }
    }

    // 6. 段落之间用「双换行」分隔
    return cleanParagraphs.filter((p) => p.length > 0).join('\n\n');
  }

  /** 非 HTML 资源：仅返回标题（URL 的 hostname/path 信息） */
  private parseNonHtml(
    url: string,
    contentType: string,
    platform: LinkPlatformInfo = detectPlatform(url),
  ): ParsedUrlContent {
    const parsed = new URL(url);
    const name = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    let title = '';
    if (ext) {
      title = `${name || '文件'}（${ext.toUpperCase()}）`;
    } else if (contentType) {
      title = `网页资源：${parsed.hostname}`;
    } else {
      title = parsed.hostname;
    }
    return {
      title,
      text: `[非 HTML 资源，无法提取正文。类型：${contentType || '未知'}]\nURL: ${parsed.href}`,
      url: parsed.href,
      encoding: 'binary',
      platform,
    };
  }

  /** 根据 HTML 声明的 charset 解码字节 */
  private decodeBuffer(buffer: Buffer): string {
    const headSample = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('latin1');
    const charsetMatch = headSample.match(/charset=["']?([\w-]+)/i);
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : '';

    // Node 原生 TextDecoder 支持 UTF-8 / gbk / gb18030 等
    try {
      if (charset && charset !== 'utf-8' && charset !== 'utf8') {
        const decoder = new TextDecoder(charset as BufferEncoding);
        return decoder.decode(buffer);
      }
    } catch (e) {
      // 回退 UTF-8
    }
    return buffer.toString('utf-8');
  }

  /** 规范化正文：压缩空白、合并空行 */
  private normalizeText(raw: string): string {
    return (raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

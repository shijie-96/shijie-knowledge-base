import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedFileContent {
  /** 提取的纯文本 */
  text: string;
  /** 处理成功的文件名 */
  fileName: string;
  /** 检测到的文件类型 */
  kind: string;
}

/** 支持的文件类型清单 */
export const ALLOWED_FILE_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.md',
  '.markdown',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

/**
 * 文件解析服务：将上传文件（PDF/Word/Markdown/图片）解析为纯文本
 *
 * - PDF：pdf-parse 提取文本
 * - Word(docx)：mammoth 提取文本
 * - Markdown/TXT：直接读取
 * - 图片：开发环境 OCR 简化，预留 OCR 接口（生产可接第三方 OCR）
 */
@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  /** OCR worker 单例（首次识别时创建，模型缓存本地 .ocr 目录） */
  private ocrWorker: unknown = null;
  /** OCR 模型缓存目录（backend/.ocr，首次联网下载一次，之后离线可用） */
  private readonly ocrCacheDir = path.join(process.cwd(), '.ocr');

  /**
   * 解析文件为纯文本
   * @param buffer 文件字节
   * @param originalName 原始文件名（含扩展名）
   */
  async parse(buffer: Buffer, originalName: string): Promise<ParsedFileContent> {
    const ext = this.getExtension(originalName);
    const fileName = originalName || '未命名文件';

    switch (ext) {
      case '.pdf':
        return { text: await this.parsePdf(buffer), fileName, kind: 'pdf' };
      case '.docx':
        return { text: await this.parseDocx(buffer), fileName, kind: 'word' };
      case '.doc':
        return {
          text: `[旧版 Word(.doc) 文档：${fileName}] 暂不支持解析，已作为原始文件保存。请转换为 .docx 后重新导入。`,
          fileName,
          kind: 'word',
        };
      case '.md':
      case '.markdown':
        return { text: buffer.toString('utf-8'), fileName, kind: 'markdown' };
      case '.txt':
        return { text: buffer.toString('utf-8'), fileName, kind: 'text' };
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.webp':
        return { text: await this.parseImage(buffer, fileName), fileName, kind: 'image' };
      default:
        throw new Error(`不支持的文件类型：${ext || '未知'}（支持 PDF/Word/Markdown/TXT/图片）`);
    }
  }

  /** 提取文件扩展名 */
  private getExtension(name: string): string {
    const idx = name.lastIndexOf('.');
    if (idx < 0) return '';
    return name.slice(idx).toLowerCase();
  }

  /** 解析 PDF 文本 */
  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      // pdf-parse v2 类式 API（动态 require 避免启动时加载 worker）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result?.text || '').trim();
        if (!text) {
          return '[PDF 文档未提取到文本（可能是扫描件/纯图片 PDF）]';
        }
        return text;
      } finally {
        try {
          await parser.destroy();
        } catch {
          /* 忽略 destroy 错误 */
        }
      }
    } catch (e) {
      this.logger.warn(`PDF 解析失败：${(e as Error).message}`);
      return `[PDF 文本解析失败：${(e as Error).message}]\n该文件包含 ${buffer.length} 字节二进制内容，已作为原始素材保存。`;
    }
  }

  /** 解析 Word(docx) 文本 */
  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value || '').trim();
      if (!text) {
        return '[Word 文档未提取到可见文本]';
      }
      return text;
    } catch (e) {
      this.logger.warn(`Word 解析失败：${(e as Error).message}`);
      return `[Word 文档解析失败：${(e as Error).message}]`;
    }
  }

  /**
   * 解析图片文本（本地 OCR）
   *
   * 使用 tesseract.js 在本地识别（图片不上传任何第三方），中英文混合识别。
   * 模型首次使用需联网下载一次（缓存到 backend/.ocr），之后全程离线。
   */
  private async parseImage(buffer: Buffer, fileName: string): Promise<string> {
    try {
      const worker = await this.getOcrWorker();
      const { data } = await (worker as { recognize(b: Buffer): Promise<{ data?: { text?: string } }> }).recognize(buffer);
      const text = (data?.text || '').trim();
      if (!text) {
        return `[图片素材：${fileName}] 未识别出文字（可能是纯图形/照片）。`;
      }
      return `[图片素材：${fileName} 的 OCR 识别结果]\n\n${text}`;
    } catch (e) {
      this.logger.warn(`图片 OCR 失败：${(e as Error).message}`);
      return `[图片素材：${fileName}] OCR 识别失败：${(e as Error).message}。图片已作为原始素材保存。`;
    }
  }

  /** 获取 OCR worker（单例复用，模型缓存本地） */
  private async getOcrWorker(): Promise<unknown> {
    if (this.ocrWorker) return this.ocrWorker;
    // 动态加载，避免启动时引入重依赖
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createWorker } = require('tesseract.js') as {
      createWorker(
        langs: string,
        oem: number,
        options?: {
          cachePath?: string;
          logger?: (m: { status?: string; progress?: number }) => void;
        },
      ): Promise<unknown>;
    };
    try {
      fs.mkdirSync(this.ocrCacheDir, { recursive: true });
    } catch {
      /* 目录创建失败时使用默认缓存 */
    }
    const worker = await createWorker('chi_sim+eng', 1, {
      cachePath: this.ocrCacheDir,
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress) {
          const pct = Math.min(100, Math.round(m.progress * 100));
          if (pct % 20 === 0 || pct === 100) {
            this.logger.log(`图片 OCR 识别中… ${pct}%`);
          }
        }
      },
    });
    this.ocrWorker = worker;
    return worker;
  }
}

import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * OmniImport 统一导入（对标 Obsidian AnyContent Vault Importer）
 *
 * 流程：粘贴链接 / 上传文件 → 解析预览（parse）→ 用户确认 → 保存入库（save）
 * parse 仅返回解析结果，不写库；save 将确认后的 markdown 写入 source_materials。
 */

/** OmniImport 解析入参（链接 / 文件二选一） */
export class OmniImportParseDto {
  /** 导入类型：url=链接，file=文件；默认按是否携带文件自动判断 */
  @IsOptional()
  @IsIn(['url', 'file'], { message: 'import_type 只能为 url 或 file' })
  importType?: 'url' | 'file';

  /** 链接地址（import_type=url 时必填） */
  @IsOptional()
  @IsUrl({}, { message: 'source_url 必须为合法 URL' })
  sourceUrl?: string;

  /**
   * 用户粘贴的原始输入（完整 App 分享口令 / 纯链接）。
   * 抖音/快手等视频平台需要从整段口令文本里提取作者、标题、话题，
   * 因此不能仅传抠出来的 URL。
   */
  @IsOptional()
  @IsString()
  @MaxLength(3000, { message: '原始输入过长（最大 3000 字符）' })
  rawInput?: string;

  /** 用户补充标签（逗号分隔或 JSON 数组，解析后合并） */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '标签过长（最大 500 字符）' })
  tags?: string;
}

/** OmniImport 保存入参（前端预览确认后提交） */
export class OmniImportSaveDto {
  /** 带 YAML frontmatter 的完整 markdown */
  @IsNotEmpty({ message: 'markdown 内容不能为空' })
  @IsString()
  @MaxLength(200000, { message: '内容过长（最大 200000 字符）' })
  markdown: string;

  /** 可选标题覆盖（缺省时取 frontmatter.title） */
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '标题过长（最大 300 字符）' })
  title?: string;

  /** 可选来源覆盖（缺省时取 frontmatter.source） */
  @IsOptional()
  @IsUrl({}, { message: 'source_url 必须为合法 URL' })
  sourceUrl?: string;

  /** 用户补充标签（逗号分隔或 JSON 数组，优先于 frontmatter.tags） */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '标签过长（最大 500 字符）' })
  tags?: string;
}

/** 批量更新素材状态（标记 / 归档） */
export class BatchUpdateStatusDto {
  @IsNotEmpty({ message: 'ids 不能为空' })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsNotEmpty({ message: 'status 不能为空' })
  @IsIn(['pending', 'digesting', 'digested', 'archived'], {
    message: 'status 仅支持 pending / digesting / digested / archived',
  })
  status: string;
}

export class BatchDeleteDto {
  @IsNotEmpty({ message: 'ids 不能为空' })
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

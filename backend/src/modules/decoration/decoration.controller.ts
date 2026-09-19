import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DecorationService } from './decoration.service';
import { UpdateProfileDecorationDto } from './dto/decoration.dto';

/** 名片背景图上传白名单（与头像一致，另收 AVIF/高分辨率场景可选） */
const BG_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/**
 * 名片装扮控制器。
 * 仅本人可读写自己的装扮配置；装扮只影响主页外观，不涉及知识原子内容。
 * 所有接口均需登录（全局 JWT 守卫保护）。
 */
@Controller('decoration')
export class DecorationController {
  constructor(private readonly decorationService: DecorationService) {}

  /** 读取当前用户装扮配置 */
  @Get()
  async getMyDecoration(@CurrentUser('sub') userId: string) {
    return this.decorationService.getDecoration(userId);
  }

  /** 获取全部装扮选项（会员体系已取消，全部免费可用） */
  @Get('options')
  async getOptions() {
    return this.decorationService.getOptions();
  }

  /**
   * 认知星图：自己 + 关注的人 + 粉丝。
   * 仅自己的光点携带装扮光效，其他用户一律默认外观（红线）。
   */
  @Get('star-map')
  async getStarMap(@CurrentUser('sub') userId: string) {
    return this.decorationService.getStarMap(userId);
  }

  /**
   * 上传名片自定义背景图（所有用户可用）。
   * - multipart/form-data 字段名：file
   * - 限制：12MB，PNG / JPEG / WebP / GIF
   * - 返回：{ url } 路径相对，前端 img src 直用（Next dev / Nginx prod 都做了反代）
   * 上传本身不落库，前端随后用 PUT /decoration 保存 customBackground 引用。
   */
  @Post('background')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 12 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!BG_MIMETYPES.includes(file.mimetype as never)) {
          return cb(new BadRequestException('只支持 PNG / JPEG / WebP / GIF'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadBackground(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请选择图片');
    }
    return this.decorationService.uploadBackground(userId, file);
  }

  /** 更新名片装扮 */
  @Put()
  async updateDecoration(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDecorationDto,
  ) {
    const { decoration, rejected } =
      await this.decorationService.updateDecoration(userId, dto);
    return { decoration, rejected };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import {
  ChangePasswordDto,
  DeleteMeDto,
  UpdateMeDto,
  UpdateSettingsDto,
} from './dto/user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/** 头像上传白名单 */
const AVATAR_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const AVATAR_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

/**
 * 当前用户相关接口。
 * 所有接口均需登录（全局 JWT 守卫保护）。
 */
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** 获取当前用户信息（含用户设置） */
  @Get('me')
  getMe(@CurrentUser('sub') userId: string) {
    return this.userService.getMe(userId);
  }

  /** 更新当前用户基础信息 */
  @Put('me')
  updateMe(@CurrentUser('sub') userId: string, @Body() dto: UpdateMeDto) {
    return this.userService.updateMe(userId, dto);
  }

  /**
   * 更新当前用户偏好设置（主题 / 默认权限 / 提醒等，写入 user_settings）
   * 全部字段可选，仅更新传入字段；其余保持原值。
   */
  @Put('me/settings')
  updateSettings(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.userService.updateSettings(userId, dto);
  }

  /**
   * 修改当前用户登录密码（需校验当前密码）。
   * 老账号默认密码同样作为“当前密码”可被校验通过。
   */
  @Put('me/password')
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(userId, dto);
  }

  /** 注销账号（二次确认） */
  @Delete('me')
  deleteMe(@CurrentUser('sub') userId: string, @Body() dto: DeleteMeDto) {
    return this.userService.deleteMe(userId, dto.confirm);
  }

  /**
   * 上传并设置当前用户头像
   * - multipart/form-data 字段名：file
   * - 限制：5MB，PNG / JPEG / WebP / GIF
   * - 返回：{ url }  路径相对，前端 img src 直用（Next.js dev / Nginx prod 都做了反代）
   */
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!AVATAR_MIMETYPES.includes(file.mimetype as never)) {
          return cb(new BadRequestException('只支持 PNG / JPEG / WebP / GIF'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请选择图片');
    }
    return this.userService.uploadAvatar(userId, file);
  }
}

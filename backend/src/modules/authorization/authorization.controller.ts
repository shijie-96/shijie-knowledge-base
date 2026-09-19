import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthorizationService } from './authorization.service';
import {
  CreateAuthorizationRequestDto,
  HandleAuthorizationDto,
} from './dto/authorization.dto';

/**
 * 授权访问控制器（私有内容的可信开放通道）
 * 所有接口均需登录（全局 JWT 守卫），未登录访客无法发起申请。
 */
@Controller()
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  /** 1. 发起授权申请：创建申请记录 + 通知所有者 */
  @Post('atoms/:id/authorization_request')
  request(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) atomId: string,
    @Body() dto: CreateAuthorizationRequestDto,
  ) {
    return this.authorizationService.request(userId, atomId, dto);
  }

  /** 2. 所有者查看收到的授权申请列表（可按状态筛选） */
  @Get('users/me/authorization_requests')
  listIncoming(
    @CurrentUser('sub') ownerId: string,
    @Query('status') status?: string,
  ) {
    return this.authorizationService.listIncoming(ownerId, status);
  }

  /** 3. 处理授权申请：同意（设置有效期天数）或拒绝 */
  @Put('authorizations/:id')
  handle(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandleAuthorizationDto,
  ) {
    return this.authorizationService.handle(ownerId, id, dto);
  }

  /** 4. 所有者撤销授权（随时可撤销） */
  @Post('authorizations/:id/revoke')
  revoke(
    @CurrentUser('sub') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.authorizationService.revoke(ownerId, id);
  }
}

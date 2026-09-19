import { Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InteractionService } from './interaction.service';

/**
 * 社交互动控制器
 * 无前缀，显式完整路径（路由分布在 /atoms 与 /users 下）。
 *
 * 红线：仅公开原子可点赞 / 收藏；收藏不导入素材池；不做评论区；唯一约束防重复。
 */
@Controller()
export class InteractionController {
  constructor(private readonly interactionService: InteractionService) {}

  // ============ 点赞 / 收藏 ============

  /** 点赞（仅公开原子） */
  @Post('atoms/:id/like')
  like(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interactionService.like(userId, id);
  }

  /** 取消点赞 */
  @Delete('atoms/:id/like')
  unlike(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interactionService.unlike(userId, id);
  }

  /** 收藏（仅公开原子，不导入素材池） */
  @Post('atoms/:id/favorite')
  favorite(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interactionService.favorite(userId, id);
  }

  /** 取消收藏 */
  @Delete('atoms/:id/favorite')
  unfavorite(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interactionService.unfavorite(userId, id);
  }

  /** 当前用户对某原子的互动状态 */
  @Get('atoms/:id/interaction_status')
  atomInteractionStatus(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.interactionService.atomInteractionStatus(userId, id);
  }

  /** 我的收藏列表（仅公开原子） */
  @Get('users/me/favorites')
  myFavorites(@CurrentUser('sub') userId: string) {
    return this.interactionService.myFavorites(userId);
  }

  // ============ 关注 / 粉丝 ============

  /** 关注某人 */
  @Post('users/:userId/follow')
  follow(
    @CurrentUser('sub') userId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.interactionService.follow(userId, targetUserId);
  }

  /** 取消关注 */
  @Delete('users/:userId/follow')
  unfollow(
    @CurrentUser('sub') userId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.interactionService.unfollow(userId, targetUserId);
  }

  /** 与某用户的互动状态（是否关注 + 关注/粉丝数） */
  @Get('users/:userId/interaction_status')
  userInteractionStatus(
    @CurrentUser('sub') userId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.interactionService.userInteractionStatus(userId, targetUserId);
  }

  /** 我的关注列表 */
  @Get('users/me/following')
  following(@CurrentUser('sub') userId: string) {
    return this.interactionService.following(userId);
  }

  /** 我的粉丝列表 */
  @Get('users/me/followers')
  followers(@CurrentUser('sub') userId: string) {
    return this.interactionService.followers(userId);
  }
}

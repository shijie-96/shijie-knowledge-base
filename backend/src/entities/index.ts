import { User } from './user.entity';
import { SourceMaterial } from './source-material.entity';
import { KnowledgeAtom } from './knowledge-atom.entity';
import { AtomVersion } from './atom-version.entity';
import { Reference } from './reference.entity';
import { Question } from './question.entity';
import { Answer } from './answer.entity';
import { Like } from './like.entity';
import { Favorite } from './favorite.entity';
import { Follow } from './follow.entity';
import { Authorization } from './authorization.entity';
import { Notification } from './notification.entity';
import { Payment } from './payment.entity';
import { UserSetting } from './user-settings.entity';
import { PageVisit } from './page-visit.entity';
import { ShareEvent } from './share-event.entity';
import { MaterialAnnotation } from './material-annotation.entity';
import { UserAiConfig } from './user-ai-config.entity';
import { UserCognitiveProfile } from './user-cognitive-profile.entity';
import { AiStrategyMemory } from './ai-strategy-memory.entity';
import { SystemSetting } from './system-settings.entity';
import { UserMentalModel } from './user-mental-model.entity';
import { UserStrategyPack } from './user-strategy-pack.entity';
import { InterventionEvent } from './intervention-event.entity';
import { AiSuggestion } from './ai-suggestion.entity';

/**
 * 全部数据表实体统一出口。
 * 用于 AppModule 的 autoLoadEntities / 迁移 DataSource 的 entities 配置。
 */
export const entities = [
  User,
  SourceMaterial,
  KnowledgeAtom,
  AtomVersion,
  Reference,
  Question,
  Answer,
  Like,
  Favorite,
  Follow,
  Authorization,
  Notification,
  Payment,
  UserSetting,
  PageVisit,
  ShareEvent,
  MaterialAnnotation,
  UserAiConfig,
  UserCognitiveProfile,
  AiStrategyMemory,
  SystemSetting,
  UserMentalModel,
  UserStrategyPack,
  InterventionEvent,
  AiSuggestion,
];

export {
  User,
  SourceMaterial,
  KnowledgeAtom,
  AtomVersion,
  Reference,
  Question,
  Answer,
  Like,
  Favorite,
  Follow,
  Authorization,
  Notification,
  Payment,
  UserSetting,
  PageVisit,
  ShareEvent,
  MaterialAnnotation,
  UserAiConfig,
  UserCognitiveProfile,
  AiStrategyMemory,
  SystemSetting,
  UserMentalModel,
  UserStrategyPack,
  InterventionEvent,
  AiSuggestion,
};

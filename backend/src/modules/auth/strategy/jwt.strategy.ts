import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { resolveJwtSecret } from '../jwt-secret';

/**
 * JWT 策略：从 Authorization: Bearer <token> 中提取并校验 token。
 * 校验通过后会将 payload 挂到 request.user。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  /**
   * 校验成功后返回的用户信息，会写入 request.user。
   * 此处直接返回 payload（含 sub/phone）。
   */
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}

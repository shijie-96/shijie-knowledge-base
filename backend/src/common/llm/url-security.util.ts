import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

/**
 * 大模型接口地址安全校验（防 SSRF）。
 *
 * 背景：匿名访客可在请求体中自填 baseUrl，由服务端代发请求到任意地址。
 * 若不校验，该通道可被用于探测/攻击内网服务（Redis、管理后台等）。
 *
 * 策略（匿名外部凭据）：
 * - 仅允许 http/https；
 * - 禁止私网/环回/链路本地/保留地址与明显内网主机名（localhost、*.local、*.internal 等）；
 * - 非环回地址要求 https（生产流量加密，降低中间人风险）。
 *
 * 说明：登录用户使用「自己存储的配置」发起请求，风险自担，不做强制校验；
 * 本工具仅用于匿名分支（用户提供 baseUrl 的来源不可信）。
 */

/** IPv4 点分是否为私网/环回/链路本地/组播/保留地址 */
function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 环回
    a === 0 || // 0.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 链路本地
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0 && ip.startsWith('192.0.0')) || // 192.0.0.0/24
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 基准测试
    a >= 224 // 组播/保留
  );
}

/** IPv6 是否为环回/链路本地/ULA/IPv4 映射私网 */
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('::ffff:')) {
    // ::1 环回；:: 未指定；::ffff:x.x.x.x 映射 IPv4 需单独判断
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice('::ffff:'.length);
      return isIP(v4) === 4 && isPrivateIpv4(v4);
    }
    return lower === '::1' || lower === '::';
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(lower)) return true; // 链路本地 fe80::/10
  return false;
}

/** 主机名字面量是否命中明显内网命名 */
function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa')
  );
}

/**
 * 校验匿名来源的 baseUrl 是否安全（不满足时抛出 400）。
 * @param baseUrl 用户提交的大模型接口地址
 */
export function assertSafePublicLlmBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new BadRequestException('baseUrl 不是合法的 URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('baseUrl 仅支持 http/https');
  }
  if (url.username || url.password) {
    throw new BadRequestException('baseUrl 不允许携带用户名/密码');
  }

  const hostname = url.hostname;
  const family = isIP(hostname);
  const privateAddr =
    family === 4 ? isPrivateIpv4(hostname) : family === 6 ? isPrivateIpv6(hostname) : false;

  if (privateAddr || isInternalHostname(hostname)) {
    throw new BadRequestException('baseUrl 不允许指向内网/本机地址');
  }

  // 非环回/非 IP 直连场景一律要求 https（已是公开地址）
  if (url.protocol !== 'https:') {
    throw new BadRequestException('匿名访问的大模型接口必须使用 https');
  }
}

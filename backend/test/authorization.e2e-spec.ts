/**
 * 权限穿透测试（任务22 安全加固 · 验收：越权访问全部返回 403/404/401）
 *
 * 场景：用户 A 创建私有资源，用户 B 尝试越权访问。
 * - B 访问 A 的素材 → 404（不泄露存在性）
 * - B 更新/删除/复用/迭代 A 的原子 → 403
 * - B 查看 A 的私有原子详情 → 受限元信息（绝不泄露 myViewpoint）
 * - 未登录访问 → 401
 * - B 的原子列表仅包含自己的数据
 *
 * 依赖：PostgreSQL（DB_ENABLED=true）。DB 不可用时自动跳过。
 */
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

const DB_AVAILABLE = process.env.DB_ENABLED === 'true';
const describeDb = DB_AVAILABLE ? describe : describe.skip;

/** 生成 e2e 专用随机手机号（199 号段，避免与真实数据冲突） */
const randPhone = () =>
  `199${String(Math.floor(10000000 + Math.random() * 90000000))}`;

/** 注册流程：手机号 + 用户名 + 密码注册（测试统一密码 e2e-pass-123） */
async function register(
  app: INestApplication,
  phone: string,
  username: string,
): Promise<{ token: string; id: string }> {
  const server = app.getHttpServer();
  const res = await request(server)
    .post('/auth/register')
    .send({ phone, username, password: 'e2e-pass-123' })
    .expect(201);
  return { token: res.body.token as string, id: res.body.user.id as string };
}

describeDb('权限穿透测试：越权访问全部返回 403/404/401', () => {
  let app: INestApplication;
  let userA: { token: string; id: string };
  let userB: { token: string; id: string };
  let atomId: string;
  let materialId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('前置：注册用户 A、B，A 创建私有素材与私有原子', async () => {
    const [a, b] = await Promise.all([
      register(app, randPhone(), '越权测试A'),
      register(app, randPhone(), '越权测试B'),
    ]);
    userA = a;
    userB = b;

    // A 创建素材
    const material = await request(app.getHttpServer())
      .post('/materials')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'A的私有素材', originalText: '这是A的私有素材正文内容' })
      .expect(201);
    materialId = material.body.id as string;

    // A 创建私有原子（默认 permission=private）
    const atom = await request(app.getHttpServer())
      .post('/atoms')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ coreQuestion: 'A的私有问题是什么？', myViewpoint: 'A的私有观点内容' })
      .expect(201);
    atomId = atom.body.id as string;
    expect(atomId).toBeTruthy();
    expect(materialId).toBeTruthy();
  });

  it('B 访问 A 的私有素材返回 404（不泄露存在性）', async () => {
    await request(app.getHttpServer())
      .get(`/materials/${materialId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);
  });

  it('B 更新 A 的原子返回 403', async () => {
    await request(app.getHttpServer())
      .put(`/atoms/${atomId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ myViewpoint: '恶意篡改内容' })
      .expect(403);
  });

  it('B 删除 A 的原子返回 403', async () => {
    await request(app.getHttpServer())
      .delete(`/atoms/${atomId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(403);
  });

  it('B 迭代 A 的原子返回 403', async () => {
    await request(app.getHttpServer())
      .post(`/atoms/${atomId}/iterate`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(403);
  });

  it('B 查看 A 的私有原子详情：仅返回受限元信息，绝不泄露 myViewpoint', async () => {
    const res = await request(app.getHttpServer())
      .get(`/atoms/${atomId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(200);
    const body = res.body as { atom?: { myViewpoint?: unknown }; access?: unknown };
    expect(body.atom?.myViewpoint).toBeUndefined();
    expect(body.access).toBeDefined();
  });

  it('未登录访问原子接口返回 401', async () => {
    await request(app.getHttpServer()).get('/atoms').expect(401);
    await request(app.getHttpServer()).get(`/atoms/${atomId}`).expect(401);
  });

  it('B 的原子列表只包含自己的数据', async () => {
    const res = await request(app.getHttpServer())
      .get('/atoms')
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(200);
    const items = Array.isArray(res.body)
      ? (res.body as Array<{ userId: string }>)
      : ((res.body as { items?: Array<{ userId: string }> }).items ?? []);
    expect(items.length).toBeGreaterThanOrEqual(0);
    for (const item of items) {
      expect(item.userId).toBe(userB.id);
    }
  });
});

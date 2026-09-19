/**
 * 核心流程集成测试（任务22 测试覆盖 · 验收：核心流程全链路跑通）
 *
 * 链路：注册 → 导入素材 → 消化素材 → 沉淀知识原子（公开 + 私有）→
 *       公开主页可被访问 → 语义检索：本人可搜到自己的原子、
 *       他人只能搜到公开原子（私有内容永不泄露）。
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

const randPhone = () =>
  `198${String(Math.floor(10000000 + Math.random() * 90000000))}`;

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

interface SearchHit {
  atom?: { id?: string; permission?: string };
}

function extractHits(body: unknown): SearchHit[] {
  if (Array.isArray(body)) return body as SearchHit[];
  return ((body as { items?: SearchHit[] })?.items ?? []) as SearchHit[];
}

describeDb('核心流程集成测试：素材导入 → 消化 → 原子沉淀 → 公开 → 检索', () => {
  let app: INestApplication;
  let user: { token: string; id: string };
  let other: { token: string; id: string };
  let materialId: string;
  let publicAtomId: string;
  let privateAtomId: string;
  const uniqueMark = `闭环测试${Date.now()}`;

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

  it('1. 注册闭环用户与旁观用户', async () => {
    [user, other] = await Promise.all([
      register(app, randPhone(), '闭环测试员'),
      register(app, randPhone(), '旁观测试员'),
    ]);
    expect(user.token).toBeTruthy();
    expect(other.token).toBeTruthy();
  });

  it('2. 导入素材（文本粘贴）', async () => {
    const res = await request(app.getHttpServer())
      .post('/materials')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: `${uniqueMark}素材`,
        originalText: `${uniqueMark}：这是用于闭环验证的素材正文，讲述认知与行动的关系。`,
      })
      .expect(201);
    materialId = res.body.id as string;
    expect(materialId).toBeTruthy();
  });

  it('3. 消化素材（生成摘要与结构化观点）', async () => {
    const res = await request(app.getHttpServer())
      .post(`/materials/${materialId}/digest`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(201);
    expect(res.body).toBeDefined();
  });

  it('4. 沉淀知识原子：一份公开 + 一份私有', async () => {
    const pub = await request(app.getHttpServer())
      .post('/atoms')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        coreQuestion: `${uniqueMark}的核心问题是什么？`,
        myViewpoint: `${uniqueMark}的观点：认知促进行动，行动验证认知。`,
        evidence: `${uniqueMark}的证据：来自闭环测试素材。`,
        permission: 'public',
        sourceMaterialId: materialId,
      })
      .expect(201);
    publicAtomId = pub.body.id as string;

    // 发布公开原子（draft → active，才能出现在公开主页）
    await request(app.getHttpServer())
      .put(`/atoms/${publicAtomId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ status: 'active' })
      .expect(200);

    const pri = await request(app.getHttpServer())
      .post('/atoms')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        coreQuestion: `${uniqueMark}的私有问题是什么？`,
        myViewpoint: `${uniqueMark}的私有观点：仅自己可见。`,
      })
      .expect(201);
    privateAtomId = pri.body.id as string;

    expect(publicAtomId).toBeTruthy();
    expect(privateAtomId).toBeTruthy();
    expect(publicAtomId).not.toBe(privateAtomId);
  });

  it('5. 公开主页可访问且包含公开原子（访客视角）', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users/${user.id}/public_profile`)
      .expect(200);
    const atoms = (res.body as { atoms: Array<{ id: string }> }).atoms ?? [];
    const found = atoms.find((a) => a.id === publicAtomId);
    expect(found).toBeDefined();
  });

  it('6. 本人语义检索命中自己的原子（含公开与私有）', async () => {
    const res = await request(app.getHttpServer())
      .post('/atoms/search')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ query: uniqueMark, limit: 10 })
      .expect(201);
    const hits = extractHits(res.body);
    const ids = hits.map((h) => h.atom?.id);
    expect(ids).toContain(publicAtomId);
    expect(ids).toContain(privateAtomId);
  });

  it('7. 他人语义检索只能命中公开原子（私有内容永不泄露）', async () => {
    const res = await request(app.getHttpServer())
      .post('/atoms/search')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ query: uniqueMark, limit: 10 })
      .expect(201);
    const hits = extractHits(res.body);
    const ids = hits.map((h) => h.atom?.id);
    expect(ids).toContain(publicAtomId);
    expect(ids).not.toContain(privateAtomId);
    for (const hit of hits) {
      expect(hit.atom?.permission).toBe('public');
    }
  });

  it('8. 他人查看私有原子详情：仅受限元信息（不泄露观点）', async () => {
    const res = await request(app.getHttpServer())
      .get(`/atoms/${privateAtomId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    const body = res.body as { atom?: { myViewpoint?: unknown } };
    expect(body.atom?.myViewpoint).toBeUndefined();
  });
});

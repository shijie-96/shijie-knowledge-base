const { chromium } = require("playwright-core");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, tag) {
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${tag}] console: ${m.text()}`);
  });
}

async function open() {
  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  return { browser, ctx };
}

(async () => {
  // ===== 场景 1：桌面端未登录首页 =====
  const { browser, ctx } = await open();
  const page = await ctx.newPage();
  watch(page, "home");

  console.log("[1] 打开首页 / ...");
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByText("把读过的，").first().waitFor({ timeout: 180000 });
  await sleep(1200);

  const titleVisible = await page.getByText("把读过的，").first().isVisible();
  const subVisible = await page.getByText("一个人的认知闭环工作台").first().isVisible();
  const loopVisible = await page.getByText("知识原子", { exact: true }).first().isVisible().catch(() => false);
  console.log("[1] 标题可见:", titleVisible, "| eyebrow:", subVisible, "| 闭环图中心文字:", loopVisible);

  await page.screenshot({ path: "d:/zhishi2.0/.codebuddy/lnd-home-top.png" });

  // ===== 场景 2：滚动 + 各区内容 =====
  for (const [sel, txt] of [
    ["#loop", "必须自己想"],
    ["#why", "它会当场拆穿你的敷衍"],
    ["#screens", "真实界面，不是概念图"],
    ["#scenes", "把知识连成网"],
    ["#start", "别再让"],
  ]) {
    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});
    await sleep(350);
    const ok = await page.getByText(txt, { exact: false }).first().isVisible().catch(() => false);
    console.log(`[2] 区块 ${sel} 文案「${txt}」可见:`, ok);
  }
  await page.screenshot({ path: "d:/zhishi2.0/.codebuddy/lnd-home-full.png", fullPage: true });

  // ===== 场景 3：打开登录弹层并提交 =====
  const navCta = page.getByRole("button", { name: "开启我的认知闭环" }).first();
  await navCta.click();
  await sleep(600);
  const dlg = page.locator('[role="dialog"]');
  const dlgVisible = await dlg.isVisible().catch(() => false);
  const loginTab = await dlg.getByText("手机号").first().isVisible().catch(() => false);
  console.log("[3] 弹层可见:", dlgVisible, "| 弹层含手机号输入:", loginTab);
  await page.screenshot({ path: "d:/zhishi2.0/.codebuddy/lnd-dialog.png" });

  // 切到注册 tab
  await dlg.getByRole("button", { name: "注册", exact: true }).first().click();
  await sleep(300);
  const regUser = await dlg.getByText("用户名").first().isVisible().catch(() => false);
  console.log("[3] 切到注册后出现「用户名」:", regUser);

  // 切回登录并填机器人账号
  await dlg.getByRole("button", { name: "登录", exact: true }).first().click();
  await sleep(300);
  await dlg.getByPlaceholder("请输入 11 位手机号").fill("13600136001");
  await dlg.getByPlaceholder("至少 6 位密码").fill("123456");
  await dlg.locator('button[type="submit"]').click();

  let toDashboard = false;
  try {
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    toDashboard = true;
  } catch (e) {}
  console.log("[3] 登录后跳转 /dashboard:", toDashboard);

  // ===== 场景 4：已登录访问 / 应自动跳工作台 =====
  if (toDashboard) {
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
    let redirected = false;
    try {
      await page.waitForURL("**/dashboard", { timeout: 12000 });
      redirected = true;
    } catch (e) {}
    console.log("[4] 已登录访问首页自动跳工具台:", redirected);
  }

  await ctx.close();

  // ===== 场景 5：移动端视口 =====
  const mb = await chromium.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox"],
  });
  const mctx = await mb.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const mp = await mctx.newPage();
  watch(mp, "mobile");
  await mp.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 180000 });
  await mp.getByText("把读过的，").first().waitFor({ timeout: 180000 });
  await sleep(1000);
  await mp.screenshot({ path: "d:/zhishi2.0/.codebuddy/lnd-mobile-top.png" });

  // 打开汉堡菜单
  await mp.getByRole("button", { name: "打开菜单" }).click();
  await sleep(400);
  const menuLink = await mp.getByText("怎么用").first().isVisible().catch(() => false);
  console.log("[5] 移动端菜单可展开，含「怎么用」:", menuLink);
  await mp.getByRole("button", { name: "关闭菜单" }).click();

  // 移动端从 hero CTA 打开底部弹层
  await mp.getByText("看看它长什么样").first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  const heroCta = mp.getByRole("button", { name: "开启我的认知闭环" }).last();
  await heroCta.click().catch(async () => {
    // 若 hero CTA 不可点（滚动后）就用最终区
    const finalCta = mp.getByRole("button", { name: "导入第一条素材" }).first();
    await finalCta.click();
  });
  await sleep(800);
  const mDlgVisible = await mp.locator('[role="dialog"]').isVisible().catch(() => false);
  console.log("[5] 移动端底部弹层可见:", mDlgVisible);
  await mp.screenshot({ path: "d:/zhishi2.0/.codebuddy/lnd-mobile-dialog.png" });

  await mctx.close();
  await mb.close();
  await browser.close();

  console.log("\n===== console/page 错误汇总 =====");
  if (errors.length === 0) console.log("（无）");
  else errors.forEach((e) => console.log(e));
})();

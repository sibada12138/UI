# 充值发卡系统（无支付首版）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个支持 token 开卡、用户提交、进度查询、后台人工充值处理的前后端系统，UI 严格遵循项目 `DESIGN.md`。

**Architecture:** 采用单体分层方案：`Next.js` 负责前台+后台页面，`NestJS` 提供业务 API，`SQLite` 本地持久化主数据（Ubuntu/宝塔环境单机部署），`Redis` 处理验证码/风控计数/热点缓存（可选）。通过 token 状态机与事务幂等保证并发一致性，通过 RBAC 控制后台权限。

**Tech Stack:** Next.js 16 + TypeScript + Tailwind(Apple 主题变量) + NestJS 11 + Prisma + SQLite + Redis(可选) + BullMQ(预留) + Playwright + Vitest/Jest

---

## File Structure

- `apps/web`
  - `src/app/(public)/t/[token]/page.tsx` token 提交页
  - `src/app/(public)/query/page.tsx` 查询页
  - `src/app/(admin)/admin/login/page.tsx` 管理登录
  - `src/app/(admin)/admin/dashboard/page.tsx` 系统运行看板
  - `src/app/(admin)/admin/tokens/page.tsx` 开 token
  - `src/app/(admin)/admin/recharge/page.tsx` 充值工作台
  - `src/app/(admin)/admin/admin-users/page.tsx` 管理员管理
  - `src/lib/theme/apple-theme.css` DESIGN.md 主题变量
- `apps/api`
  - `src/modules/auth/*` 管理员认证
  - `src/modules/token/*` token 生命周期
  - `src/modules/submission/*` 用户提交
  - `src/modules/query/*` 查询 + 风控 + 图形验证码
  - `src/modules/recharge/*` 充值任务与二维码
  - `src/modules/dashboard/*` 运行指标
  - `src/modules/admin-user/*` 管理员管理
  - `src/modules/audit/*` 审计日志
  - `prisma/schema.prisma`
- `infra`
  - `docker-compose.yml`（redis，可选）

---

### Task 1: 初始化项目与基础工程

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`
- Create: `apps/web/*`
- Create: `apps/api/*`
- Create: `infra/docker-compose.yml`

- [ ] **Step 1: 初始化 monorepo**

Run: `pnpm init && pnpm add -D turbo typescript`
Expected: 根目录生成基础 `package.json`。

- [ ] **Step 2: 创建 Next.js 与 NestJS 应用骨架**

Run: `pnpm create next-app apps/web --ts --eslint --app --src-dir --tailwind --use-pnpm`
Run: `pnpm dlx @nestjs/cli new apps/api --package-manager pnpm`
Expected: `apps/web` 和 `apps/api` 可独立启动。

- [ ] **Step 3: 添加开发基础配置**

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  }
}
```

- [ ] **Step 4: 启动基础依赖容器（可选）**

Run: `docker compose -f infra/docker-compose.yml up -d`
Expected: Redis 健康检查通过；SQLite 为本地文件无需独立容器。

- [ ] **Step 5: Commit**

Run: `git add . && git commit -m "chore: bootstrap monorepo with web api and infra"`

---

### Task 2: 实现 DESIGN.md 主题系统（Apple 风格）

**Files:**
- Create: `apps/web/src/lib/theme/apple-theme.css`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: 写主题变量文件**

```css
:root {
  --bg-dark: #000000;
  --bg-light: #f5f5f7;
  --text-dark: #1d1d1f;
  --text-light: #ffffff;
  --accent: #0071e3;
  --link: #0066cc;
  --radius-pill: 980px;
}
```

- [ ] **Step 2: 注入全局排版与组件基线**

```css
body {
  background: var(--bg-light);
  color: var(--text-dark);
  font-family: "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}
.h-display {
  font-family: "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
  letter-spacing: -0.28px;
}
```

- [ ] **Step 3: 新增通用 Apple 按钮组件样式类**

```css
.btn-primary {
  background: var(--accent);
  color: #fff;
  border-radius: 8px;
}
.btn-pill {
  border-radius: var(--radius-pill);
  border: 1px solid var(--link);
  color: var(--link);
}
```

- [ ] **Step 4: Commit**

Run: `git add apps/web/src/lib/theme apps/web/src/app/globals.css apps/web/tailwind.config.ts && git commit -m "feat(web): add apple inspired theme tokens and typography"`

---

### Task 3: 后端数据模型与迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/*`

- [ ] **Step 1: 定义核心表模型**

```prisma
model IssueToken {
  id         String   @id @default(cuid())
  token      String   @unique
  status     String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())
}
```

```prisma
model UserSubmission {
  id           String   @id @default(cuid())
  issueTokenId String
  phoneEnc     String
  smsCodeEnc   String
  submittedAt  DateTime @default(now())
}
```

- [ ] **Step 2: 增加管理员、充值任务、审计表**

```prisma
model AdminUser {
  id           String @id @default(cuid())
  username     String @unique
  passwordHash String
  role         String
  status       String
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 3: 执行迁移**

Run: `pnpm --filter api prisma migrate dev --name init_recharge_card`
Expected: migration 成功并生成客户端。

- [ ] **Step 4: Commit**

Run: `git add apps/api/prisma && git commit -m "feat(api): add core prisma schema for token submission and admin"`

---

### Task 4: Token 提交链路（用户侧）

**Files:**
- Create: `apps/api/src/modules/token/*`
- Create: `apps/api/src/modules/submission/*`
- Create: `apps/web/src/app/(public)/t/[token]/page.tsx`

- [ ] **Step 1: 编写 token 状态查询与消费接口测试**

```ts
it('consumes token once after successful submit', async () => {
  // active token -> submit -> consumed
});
```

- [ ] **Step 2: 实现提交接口幂等事务**

```ts
await prisma.$transaction(async (tx) => {
  const token = await tx.issueToken.findUnique({ where: { token: dto.token } });
  if (!token || token.status !== 'active') throw new BadRequestException('TOKEN_INVALID');
  await tx.userSubmission.create({ data: { issueTokenId: token.id, phoneEnc, smsCodeEnc } });
  await tx.issueToken.update({ where: { id: token.id }, data: { status: 'consumed', consumedAt: new Date() } });
});
```

- [ ] **Step 3: 实现前端 token 页面**

```tsx
export default function TokenPage() {
  return <main className="min-h-screen bg-black text-white">{/* 手机号+验证码表单 */}</main>;
}
```

- [ ] **Step 4: 联调并验证 token 成功即失效**

Run: `pnpm test --filter api`
Expected: token 重复提交测试失败返回 `TOKEN_INVALID`。

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/token apps/api/src/modules/submission apps/web/src/app/(public)/t/[token] && git commit -m "feat: implement token submission flow with one-time consume"`

---

### Task 5: 进度查询 + 图形验证码 + IP 封禁

**Files:**
- Create: `apps/api/src/modules/query/*`
- Create: `apps/web/src/app/(public)/query/page.tsx`

- [ ] **Step 1: 写查询风控测试**

```ts
it('bans ip for 1h after 5 consecutive failed queries', async () => {
  // fail x5 then expect banned
});
```

- [ ] **Step 2: 实现验证码与封禁逻辑**

```ts
const banKey = `query_ban:${ip}`;
if (await redis.exists(banKey)) throw new ForbiddenException('QUERY_BANNED');
```

```ts
if (failed) {
  const count = await redis.incr(`query_fail:${ip}`);
  await redis.expire(`query_fail:${ip}`, 3600);
  if (count >= 5) await redis.set(`query_ban:${ip}`, '1', 'EX', 3600);
}
```

- [ ] **Step 3: 实现查询页面 UI**

```tsx
// 方式切换: token/手机号 + 图形验证码 + 结果卡片
```

- [ ] **Step 4: Commit**

Run: `git add apps/api/src/modules/query apps/web/src/app/(public)/query && git commit -m "feat: add query endpoint with captcha and ip ban control"`

---

### Task 6: 管理后台认证与权限

**Files:**
- Create: `apps/api/src/modules/auth/*`
- Create: `apps/api/src/modules/admin-user/*`
- Create: `apps/web/src/app/(admin)/admin/login/page.tsx`
- Create: `apps/web/src/middleware.ts`

- [ ] **Step 1: 实现管理员登录（账号密码）**

```ts
const ok = await argon2.verify(user.passwordHash, dto.password);
if (!ok) throw new UnauthorizedException();
```

- [ ] **Step 2: 实现 RBAC 守卫**

```ts
if (requiredRole === 'admin' && req.user.role !== 'admin') {
  throw new ForbiddenException('ADMIN_ONLY');
}
```

- [ ] **Step 3: 实现“仅 admin 可创建管理员”接口**

```ts
@Post('admin-users')
@Roles('admin')
createAdmin(@Body() dto: CreateAdminDto) {}
```

- [ ] **Step 4: Commit**

Run: `git add apps/api/src/modules/auth apps/api/src/modules/admin-user apps/web/src/app/(admin)/admin/login apps/web/src/middleware.ts && git commit -m "feat: add admin auth and role-based access control"`

---

### Task 7: 后台开 Token 页面

**Files:**
- Create: `apps/web/src/app/(admin)/admin/tokens/page.tsx`
- Create: `apps/api/src/modules/token/admin-token.controller.ts`

- [ ] **Step 1: 实现开 token 接口（默认 30 分钟）**

```ts
const expiresAt = dayjs().add(30, 'minute').toDate();
```

- [ ] **Step 2: 页面提供 token 列表与复制链接**

```tsx
// 列表列: token, 状态, 过期时间, 操作(复制/作废)
```

- [ ] **Step 3: 实现作废操作与审计**

```ts
await audit.log({ action: 'TOKEN_REVOKE', targetId: tokenId, actorId: adminId });
```

- [ ] **Step 4: Commit**

Run: `git add apps/web/src/app/(admin)/admin/tokens apps/api/src/modules/token && git commit -m "feat: add admin token issuing and revoke"`

---

### Task 8: 账户充值工作台（手动充值链路）

**Files:**
- Create: `apps/web/src/app/(admin)/admin/recharge/page.tsx`
- Create: `apps/api/src/modules/recharge/*`

- [ ] **Step 1: 实现任务列表接口**

```ts
// 返回 user_submission + 当前充值状态 + 操作人 + 更新时间
```

- [ ] **Step 2: 实现生成充值链接与二维码接口**

```ts
const link = `${baseUrl}/recharge/${task.id}/${nanoid(24)}`;
const qrPayload = await qrService.toDataUrl(link);
```

- [ ] **Step 3: 前端实现工作台页面**

```tsx
// 表格 + 侧边详情抽屉 + 生成链接按钮 + 二维码弹窗
```

- [ ] **Step 4: Commit**

Run: `git add apps/web/src/app/(admin)/admin/recharge apps/api/src/modules/recharge && git commit -m "feat: add manual recharge workbench and qr generation"`

---

### Task 9: 系统运行看板与审计

**Files:**
- Create: `apps/web/src/app/(admin)/admin/dashboard/page.tsx`
- Create: `apps/api/src/modules/dashboard/*`
- Create: `apps/api/src/modules/audit/*`

- [ ] **Step 1: 实现 metrics 聚合接口**

```ts
return {
  activeTokens,
  consumedToday,
  queryFailRate,
  bannedIpCount,
  pendingRechargeTasks,
};
```

- [ ] **Step 2: 页面实现卡片与趋势图占位**

```tsx
// 黑白分区 + 蓝色交互；卡片显示实时指标
```

- [ ] **Step 3: 审计日志列表接口与页面入口**

```ts
// action, actor, target, createdAt
```

- [ ] **Step 4: Commit**

Run: `git add apps/web/src/app/(admin)/admin/dashboard apps/api/src/modules/dashboard apps/api/src/modules/audit && git commit -m "feat: add dashboard metrics and audit trail"`

---

### Task 10: 性能、压测与上线准备

**Files:**
- Create: `apps/api/test/load/query-load.k6.js`
- Create: `apps/api/test/e2e/*.spec.ts`
- Create: `docs/runbook.md`

- [ ] **Step 1: 编写关键 e2e 测试**

```ts
it('token submit success then token invalid on retry', async () => {});
it('query blocked after 5 failures from same ip', async () => {});
```

- [ ] **Step 2: 压测查询与提交接口（500 并发目标）**

Run: `k6 run apps/api/test/load/query-load.k6.js`
Expected: 错误率低于约定阈值，P95 满足目标。

- [ ] **Step 3: 输出上线 runbook**

```md
- 启动顺序
- 环境变量
- 数据库迁移
- 回滚步骤
```

- [ ] **Step 4: Commit**

Run: `git add apps/api/test docs/runbook.md && git commit -m "test: add e2e load tests and deployment runbook"`

---

## Spec Coverage Check

- token 生命周期（30 分钟、成功即失效、可追溯）: Task 3 + Task 4 + Task 7 + Task 9
- 查询能力（token/手机号）: Task 5
- 查询风控（验证码 + IP 连续失败封禁）: Task 5
- 后台功能（运行情况、开 token、充值页面、管理员管理）: Task 6 + Task 7 + Task 8 + Task 9
- 高并发目标（500）: Task 10
- UI 遵循 DESIGN.md: Task 2 + 各页面任务

## 执行顺序建议

1. Task 1-3（基础设施 + 数据模型）
2. Task 4-5（用户主链路）
3. Task 6-9（后台体系）
4. Task 10（测试与上线）

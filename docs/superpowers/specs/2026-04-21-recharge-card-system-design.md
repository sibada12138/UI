# 充值发卡系统设计文档（无支付首版）

- 日期：2026-04-21
- 状态：已确认可执行
- 技术栈：Next.js + NestJS + SQLite（本地）+ Redis（可选）
- 视觉规范来源：项目根目录 `DESIGN.md`（Apple 风格）

## 1. 目标与范围

### 1.1 业务目标
- 提供基于 `token` 的用户提交入口：用户打开 token 链接，输入手机号和验证码（外部 API 后续对接）。
- 用户提交成功后，后端自动保存登录信息并将 token 立即置为失效。
- 后台“账户充值页面”可以查看用户提交信息，并生成充值链接与二维码，供客服手动处理充值。
- 用户支持通过 `token` 或手机号查询开卡/充值进度。

### 1.2 首版范围（In Scope）
- token 生命周期管理：创建、过期、消费失效、审计可追溯。
- 用户侧两类页面：token 提交页、进度查询页。
- 管理侧页面：系统运行情况、开 token、账户充值、管理员管理。
- 查询风控：图形验证码 + IP 失败封禁策略。
- 并发目标：峰值 500（同时活跃不超过 500）。

### 1.3 非范围（Out of Scope）
- 实际支付通道对接。
- 实际短信网关/验证码服务实现（仅预留 Provider 接口）。
- 财务结算、对账报表。

## 2. 角色与权限

### 2.1 角色
- 用户：通过 token 或手机号查询进度，提交登录信息。
- 管理员（admin）：系统超级管理员，可创建其他管理员。
- 普通管理员（operator_admin）：可操作业务，但不可创建管理员。

### 2.2 权限矩阵
- `admin`
  - 登录后台
  - 创建/禁用 token
  - 查看系统运行与业务列表
  - 生成充值链接和二维码
  - 创建其他管理员
- `operator_admin`
  - 登录后台
  - 查看系统运行与业务列表
  - 生成充值链接和二维码
  - 不可创建管理员

## 3. 关键业务流程

### 3.1 token 发放与使用
1. 管理员在后台创建 token（默认有效期 30 分钟，可手动调整但不得超过配置上限）。
2. 系统生成链接：`/t/{token}`。
3. 用户打开链接并提交手机号+短信验证码。
4. 提交成功：
   - 写入用户提交记录。
   - token 状态从 `active` 变为 `consumed`。
   - 写入审计日志。
5. 提交失败：返回错误，不改变 token 状态（除非达到失效条件）。

### 3.2 用户查询进度
1. 用户进入 `/query`。
2. 选择查询方式：`token` 或 `手机号`。
3. 必填图形验证码。
4. 后端执行风控：
   - 同 IP 在 1 小时窗口连续失败达到 5 次，则封禁 1 小时。
5. 查询成功返回：开卡状态、充值状态、最近更新时间、处理备注（可选脱敏）。

### 3.3 后台充值处理
1. 后台“账户充值页面”展示已提交用户信息及当前状态。
2. 客服点击“生成充值链接”。
3. 系统生成可追踪的充值任务链接与二维码（后续可挂接外部 API）。
4. 客服线下执行充值，并在后台更新处理状态与备注。

## 4. 逻辑状态机

### 4.1 Token 状态
- `active`：可用。
- `expired`：超过有效期。
- `consumed`：用户提交成功后失效。
- `revoked`：管理员手动作废。

状态转换：
- `active -> consumed`（成功提交）
- `active -> expired`（超时）
- `active -> revoked`（手动作废）

### 4.2 充值任务状态
- `pending`：待处理。
- `link_generated`：已生成充值链接/二维码。
- `processing`：人工处理中。
- `completed`：已完成。
- `failed`：失败。
- `cancelled`：取消。

## 5. 数据模型（首版）

### 5.1 SQLite 表（Prisma 模型）
- `admins`
  - `id`, `username`, `password_hash`, `role`, `status`, `created_by`, `created_at`, `updated_at`
- `admin_sessions`
  - `id`, `admin_id`, `token_hash`, `ip`, `user_agent`, `expires_at`, `created_at`
- `issue_tokens`
  - `id`, `token`, `status`, `expires_at`, `consumed_at`, `revoked_at`, `created_by`, `created_at`
- `user_submissions`
  - `id`, `issue_token_id`, `phone_encrypted`, `sms_code_encrypted`, `submit_ip`, `user_agent`, `submitted_at`
- `recharge_tasks`
  - `id`, `user_submission_id`, `status`, `recharge_link`, `qr_payload`, `operator_id`, `remark`, `updated_at`, `created_at`
- `query_logs`
  - `id`, `query_type`, `query_key_hash`, `ip`, `result`, `fail_reason`, `created_at`
- `audit_logs`
  - `id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `metadata_json`, `created_at`

### 5.2 Redis Key 设计
- `captcha:{captcha_id}` -> 验证码答案（TTL 5 分钟）
- `query_fail:{ip}` -> 失败计数与连续失败状态（TTL 1 小时）
- `query_ban:{ip}` -> 封禁标记（TTL 1 小时）
- `token_cache:{token}` -> token 热状态缓存（TTL 与 token 过期对齐）

## 6. API 设计（首版）

### 6.1 用户侧 API
- `POST /api/public/captcha/create`
- `POST /api/public/query`
- `GET /api/public/token/:token/status`
- `POST /api/public/token/:token/submit`

### 6.2 后台 API
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/dashboard/metrics`
- `POST /api/admin/tokens`
- `GET /api/admin/tokens`
- `POST /api/admin/tokens/:id/revoke`
- `GET /api/admin/recharge/tasks`
- `POST /api/admin/recharge/tasks/:id/generate-link`
- `POST /api/admin/recharge/tasks/:id/status`
- `POST /api/admin/admin-users`（仅 admin）
- `GET /api/admin/audit-logs`

## 7. 页面信息架构（IA）

### 7.1 用户侧
- `/t/[token]`
  - 模块：token 校验、手机号输入、短信验证码输入、提交状态提示。
- `/query`
  - 模块：查询方式切换（token/手机号）、图形验证码、查询结果卡片。

### 7.2 后台
- `/admin/login`
  - 账号密码登录。
- `/admin/dashboard`
  - 系统运行指标：QPS、token 有效/失效、查询失败率、封禁 IP 数。
- `/admin/tokens`
  - 开 token、查看有效期、状态筛选、复制链接。
- `/admin/recharge`
  - 账户充值工作台：展示提交记录、生成充值链接/二维码、状态流转。
- `/admin/admin-users`
  - 管理员管理：仅 `admin` 可新增管理员。

## 8. UI 规范落地（严格遵循 DESIGN.md）

- 色彩：仅使用 `#000000` / `#f5f5f7` / `#1d1d1f` + 蓝色交互色 `#0071e3`。
- 排版：标题用 SF Pro Display 风格，正文 SF Pro Text 风格（无 SF 字体时使用 fallback）。
- 布局：全宽分段、中心容器、黑白交替区块、极简卡片。
- 交互：按钮以圆角/胶囊形态，hover 与 focus 仅做克制反馈。
- 禁止：花哨渐变、彩色噪点背景、多主色并用。

## 9. 并发与稳定性设计（500 峰值）

- 应用层无状态，前后端可横向扩展。
- token 消费用数据库事务 + 唯一约束/行锁保证幂等，避免重复消费。
- 查询风控使用 Redis 原子计数与 TTL。
- 为高频查询字段建立索引：`issue_tokens.token`、`issue_tokens.status`、`user_submissions.submitted_at`。
- 列表页采用游标分页避免深翻页性能下降。

## 10. 安全设计

- 管理员密码：`Argon2id` 哈希。
- 管理后台会话：HttpOnly + SameSite + 短期会话。
- 手机号、短信码敏感字段加密存储（应用层加密）。
- 审计日志不可修改，只可追加。
- 查询接口统一返回模糊错误，避免枚举攻击。

## 11. API 代理扩展预留

- 在外部 Provider 层定义统一接口：`SmsProvider`, `RechargeProvider`。
- Provider 请求支持按租户或按任务设置代理：HTTP/SOCKS。
- 代理配置放在 `provider_configs`，可热更新（缓存+版本号）。

## 12. 验收标准

- 用户能通过有效 token 成功提交，提交后 token 立刻失效。
- 后台可查到提交记录并生成充值链接/二维码。
- 用户可通过 token 或手机号 + 图形验证码查询状态。
- 同 IP 连续失败 5 次后封禁 1 小时。
- 在 500 峰值下系统无明显功能错误与状态错乱。

## 13. 风险与缓解

- 风险：外部短信 API 不稳定。
  - 缓解：Provider 接口 + 重试策略 + 熔断。
- 风险：高并发下 token 重复提交。
  - 缓解：事务幂等 + 状态机约束 + 审计。
- 风险：查询接口被刷。
  - 缓解：验证码 + IP 失败封禁 + 速率限制。

## 14. 里程碑

- M1：UI 骨架 + 路由 + 假数据联调。
- M2：后端核心模块（token、提交、查询、后台管理）联通。
- M3：风控、审计、二维码、压测与上线准备。

## 15. 部署基线（Ubuntu + 宝塔）

- 运行环境：Ubuntu + 宝塔（aaPanel）+ PM2。
- Web 与 API 分离进程：
  - `web`：3000
  - `api`：3001
- 宝塔反向代理：
  - `/` -> `127.0.0.1:3000`
  - `/api/` -> `127.0.0.1:3001/api/`
- 数据库：SQLite 本地文件（`apps/api/dev.db`），后续可平滑迁移 PostgreSQL。

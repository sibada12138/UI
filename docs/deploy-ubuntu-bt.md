# Ubuntu + 宝塔（aaPanel）部署指南

## 1. 环境要求
- Ubuntu 20.04/22.04
- 宝塔面板已安装
- Docker + Docker Compose 插件（推荐一键部署）
- 可选：Node.js 20+、pnpm、PM2（非 Docker 方案）

## 2. 项目目录建议
- 项目根目录：`/www/wwwroot/recharge-card-system`
- SQLite 文件：`/www/wwwroot/recharge-card-system/apps/api/dev.db`

## 3. Docker 一键部署（推荐）

在服务器项目根目录执行：
```bash
cd /www/wwwroot/recharge-card-system
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

启动后：
- Web: `http://服务器IP:3090`
- API: 通过 Web 内置 `/api` 转发到容器内 API

默认管理员账号来自 `infra/.env`：
- `ADMIN_INIT_USERNAME`
- `ADMIN_INIT_PASSWORD`

首次上线请立刻改密码。

## 4. 宝塔反向代理（Docker 场景）

站点 `your-domain.com` 反向代理到：
- `/` -> `http://127.0.0.1:3090/`

因为 Web 容器已内置 `/api/*` 转发到 API 容器，所以宝塔层只需要代理 3090。

## 5. 非 Docker 部署（备用）
如果你不走 Docker，再用下面方式：

### 5.1 安装依赖
```bash
cd /www/wwwroot/recharge-card-system
npm i -g pnpm pm2
pnpm install
```

### 5.2 配置环境变量
在 `apps/api/.env` 写入：
```env
DATABASE_URL="file:./dev.db"
REDIS_URL="redis://127.0.0.1:6379"
ADMIN_JWT_SECRET="change-this-to-long-random"
APP_BASE_URL="https://your-domain.com"
ADMIN_INIT_USERNAME="admin"
ADMIN_INIT_PASSWORD="change-me"
```

在项目根目录 `.env` 增加前端 API 地址：
```env
NEXT_PUBLIC_API_BASE="https://your-domain.com/api"
```

### 5.3 初始化数据库（本地SQLite）
```bash
cd /www/wwwroot/recharge-card-system/apps/api
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

### 5.4 构建项目
```bash
cd /www/wwwroot/recharge-card-system
pnpm build
```

### 5.5 使用 PM2 启动
```bash
cd /www/wwwroot/recharge-card-system
pm2 start "pnpm --filter api start:prod" --name recharge-api
pm2 start "pnpm --filter web start -- --port 3000" --name recharge-web
pm2 save
pm2 startup
```

API 默认端口 `3001`，Web 默认端口 `3000`。

### 5.6 宝塔站点反向代理
建议域名统一代理到 Web（3000），API 走 `/api` 转发到 3001：

- 站点：`your-domain.com`
- 反向代理规则：
  - `/api/` -> `http://127.0.0.1:3001/api/`
  - `/` -> `http://127.0.0.1:3000/`

确保转发头包含：
- `X-Forwarded-For`
- `X-Forwarded-Proto`
- `Host`

## 6. 首次登录
- 管理后台：`https://your-domain.com/admin/login`
- 默认账号密码来自 `infra/.env`（Docker）或 `apps/api/.env`（非 Docker）：
  - `ADMIN_INIT_USERNAME`
  - `ADMIN_INIT_PASSWORD`

首次上线后请立即修改默认管理员密码。

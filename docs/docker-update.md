# Docker 直接更新指南（Ubuntu/宝塔）

## 1. 首次部署
```bash
cd /lishuai/rx
cp infra/.env.example infra/.env
```

编辑 `infra/.env`：
```env
WEB_PORT=3090
APP_BASE_URL=http://你的服务器IP:3090
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=admin123
ADMIN_JWT_SECRET=请替换为长随机字符串
```

启动：
```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

访问：
`http://你的服务器IP:3090`

## 2. 日常更新（推荐）
```bash
cd /lishuai/rx
git pull
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build api web
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
```

说明：
- 第 2 行只重建 `api/web`，避免每次重建 redis。
- 第 3 行用于应用最新镜像并拉起服务。

## 3. 仅改端口时
只改 `infra/.env` 的 `WEB_PORT` 与 `APP_BASE_URL`，然后执行：
```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
```

## 4. 查看运行状态
```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env ps
docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f api web
```

## 5. 重置管理员默认密码（会清空数据）
```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env down -v
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

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

启动（首次不建议一次性全量 build）：
```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env build api --progress=plain
docker compose -f infra/docker-compose.yml --env-file infra/.env build web --progress=plain
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
```

访问：
`http://你的服务器IP:3090`

## 2. 日常更新（推荐）
```bash
cd /lishuai/rx
git pull
docker compose -f infra/docker-compose.yml --env-file infra/.env build api --progress=plain
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d api
docker compose -f infra/docker-compose.yml --env-file infra/.env build web --progress=plain
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d web
```

说明：
- 按 `api -> web` 拆分，明显降低服务器瞬时负载。
- `redis` 无改动时不需要重建。
- SQLite 已固定到持久化目录 `/app/apps/api/data/dev.db`，容器重启不会丢 CDK。
- 若你是从旧版本升级，`infra/update.sh` 会自动尝试把旧路径数据库迁移到新持久化目录。

### 一键更新脚本（推荐）
仓库已提供脚本：`infra/update.sh`

使用方式：
```bash
cd /lishuai/rx/rx
bash infra/update.sh
```
说明：默认是 `auto` 模式，会自动分步执行，且每次都按 `api -> web` 逐条重建并启动（不再依赖是否检测到代码改动）。

可选参数：
```bash
# 不执行 git pull（仅构建并启动）
bash infra/update.sh --no-pull

# 仅更新 API（最稳，资源占用最低）
bash infra/update.sh api

# 仅更新 Web
bash infra/update.sh web

# 只重启，不构建
bash infra/update.sh api --no-build
bash infra/update.sh web --no-build

# 分阶段（手动拆分，防卡）
bash infra/update.sh api-build
bash infra/update.sh api-up --no-pull
bash infra/update.sh web-build
bash infra/update.sh web-up --no-pull

# 自动模式增加重试能力
bash infra/update.sh auto --retry=3 --sleep=5

# 自动模式只重启（不构建）
bash infra/update.sh auto --no-build
```

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

## 6. API 对接环境变量（可选）
在 `infra/.env` 里可调整第三方对接参数：
```env
OUTBOUND_PROXY_URL=
EXTERNAL_SUGGEST_CLIENT_ID=1189857434
EXTERNAL_APP_CLIENT_ID=1089867636
EXTERNAL_ZIP_VERSION=2.9.91
EXTERNAL_WEB_VERSION=2.9.0
EXTERNAL_DEFAULT_DEVICE_ID=web-default-device
RECHARGE_CHANNELS_FILE=./data/recharge-channels.txt
EXTERNAL_RECHARGE_H5_TRANSACTION_URL=https://api-h5-sub.meitu.com/h5/transaction/v2/create.json
EXTERNAL_RECHARGE_ORDER_CREATE_URL=https://api.xiuxiu.meitu.com/v1/vip/subscription/order/create.json
EXTERNAL_RECHARGE_CASHIER_URL=https://api.wallet.meitu.com/payment/cashier/agreement.json
```

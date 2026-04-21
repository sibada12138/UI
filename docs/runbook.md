# Recharge Card System Runbook

## 1. Environment
- OS: Ubuntu 20.04/22.04 (Baota/aaPanel)
- Node.js: 20 LTS
- Package manager: pnpm 10+
- Process manager: PM2

## 2. Required Environment Variables
Create `apps/api/.env`:

```env
DATABASE_URL="file:./dev.db"
REDIS_URL="redis://127.0.0.1:6379"
ADMIN_JWT_SECRET="replace-with-long-random-string"
APP_BASE_URL="https://your-domain.com"
ADMIN_INIT_USERNAME="admin"
ADMIN_INIT_PASSWORD="change-me"
```

Frontend side (`.env` at project root):

```env
NEXT_PUBLIC_API_BASE="https://your-domain.com/api"
```

## 3. Build and Start
```bash
pnpm install
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma generate
pnpm build
pm2 start "pnpm --filter api start:prod" --name recharge-api
pm2 start "pnpm --filter web start -- --port 3000" --name recharge-web
pm2 save
```

## 4. Health Checks
- API:
  - `POST /api/public/captcha/create`
  - `POST /api/admin/auth/login`
- Web:
  - `/`
  - `/query`
  - `/admin/login`

## 5. Common Operations
- Rebuild and restart:
```bash
pnpm build
pm2 restart recharge-api recharge-web
```

- Check logs:
```bash
pm2 logs recharge-api --lines 200
pm2 logs recharge-web --lines 200
```

## 6. Rollback
1. Switch to previous release directory.
2. Restore previous `apps/api/dev.db` backup.
3. Restart PM2 apps.

## 7. Test and Load Verification
- Unit/integration:
```bash
pnpm --filter api test
pnpm --filter api test:e2e
```
- Load test:
```bash
k6 run apps/api/test/load/query-load.k6.js
```


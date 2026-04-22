#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/infra/.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/infra/.env.example"

NO_PULL=0
for arg in "$@"; do
  case "$arg" in
    --no-pull)
      NO_PULL=1
      ;;
    *)
      ;;
  esac
done

log() {
  printf '[update] %s\n' "$*"
}

warn() {
  printf '[update][warn] %s\n' "$*" >&2
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return 0
  fi
  if [ -x /usr/bin/docker-compose ]; then
    /usr/bin/docker-compose "$@"
    return 0
  fi
  return 127
}

ensure_compose() {
  if compose version >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    log "未检测到 Docker Compose，尝试安装 docker-compose-plugin..."
    apt-get update -y
    apt-get install -y docker-compose-plugin
  fi

  if ! compose version >/dev/null 2>&1; then
    warn "仍未找到 Docker Compose，请手动安装后重试。"
    exit 1
  fi
}

main() {
  ensure_compose

  if [ ! -f "$COMPOSE_FILE" ]; then
    warn "未找到 compose 文件: $COMPOSE_FILE"
    exit 1
  fi

  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE_FILE" ]; then
      cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
      log "已创建环境文件: $ENV_FILE"
    else
      warn "未找到环境文件与示例文件，请手动创建: $ENV_FILE"
      exit 1
    fi
  fi

  if [ "$NO_PULL" -eq 0 ] && command -v git >/dev/null 2>&1; then
    log "拉取最新代码..."
    git -C "$ROOT_DIR" pull --ff-only || warn "git pull 失败，请检查仓库状态。"
  fi

  log "构建 API 镜像..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build api
  log "启动 API 服务..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d api

  log "构建 Web 镜像..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build web
  log "启动 Web 服务..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d web

  log "当前服务状态："
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
  log "更新完成。"
}

main "$@"

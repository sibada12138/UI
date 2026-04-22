#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/infra/.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/infra/.env.example"

STAGE="all"
NO_PULL=0
NO_BUILD=0

usage() {
  cat <<'EOF'
用法:
  bash infra/update.sh [阶段] [选项]

阶段:
  all        拉代码 + 构建并启动 api/web（默认）
  prepare    仅检查环境并 git pull
  api        仅构建并启动 api（会同时拉起 redis）
  web        仅构建并启动 web
  api-build  仅构建 api
  web-build  仅构建 web
  api-up     仅启动 api（会同时拉起 redis）
  web-up     仅启动 web
  status     查看 compose 服务状态

选项:
  --no-pull   跳过 git pull
  --no-build  跳过 build（对 all/api/web 有效，仅 up）
  -h, --help  显示帮助
EOF
}

for arg in "$@"; do
  case "$arg" in
    all|prepare|api|web|api-build|web-build|api-up|web-up|status)
      STAGE="$arg"
      ;;
    --no-pull)
      NO_PULL=1
      ;;
    --no-build)
      NO_BUILD=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[update][warn] 未识别参数: %s\n' "$arg" >&2
      usage
      exit 1
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

ensure_paths() {
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
}

pull_latest() {
  if [ "$NO_PULL" -eq 1 ]; then
    return
  fi
  if command -v git >/dev/null 2>&1; then
    log "拉取最新代码..."
    git -C "$ROOT_DIR" pull --ff-only || warn "git pull 失败，请检查仓库状态。"
  fi
}

build_service() {
  local service="$1"
  log "构建 ${service} 镜像..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$service"
}

up_service() {
  local service="$1"
  if [ "$service" = "api" ]; then
    log "启动 redis + api..."
    compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d redis api
    return
  fi
  log "启动 ${service}..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d "$service"
}

show_status() {
  log "当前服务状态："
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

main() {
  ensure_compose
  ensure_paths

  case "$STAGE" in
    prepare)
      pull_latest
      show_status
      ;;
    api-build)
      pull_latest
      build_service api
      show_status
      ;;
    web-build)
      pull_latest
      build_service web
      show_status
      ;;
    api-up)
      pull_latest
      up_service api
      show_status
      ;;
    web-up)
      pull_latest
      up_service web
      show_status
      ;;
    api)
      pull_latest
      if [ "$NO_BUILD" -eq 0 ]; then
        build_service api
      fi
      up_service api
      show_status
      ;;
    web)
      pull_latest
      if [ "$NO_BUILD" -eq 0 ]; then
        build_service web
      fi
      up_service web
      show_status
      ;;
    status)
      show_status
      ;;
    all)
      pull_latest
      if [ "$NO_BUILD" -eq 0 ]; then
        build_service api
      fi
      up_service api
      if [ "$NO_BUILD" -eq 0 ]; then
        build_service web
      fi
      up_service web
      show_status
      ;;
    *)
      warn "未知阶段: $STAGE"
      usage
      exit 1
      ;;
  esac

  log "完成阶段: $STAGE"
}

main "$@"

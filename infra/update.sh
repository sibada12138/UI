#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/infra/.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/infra/.env.example"

STAGE="auto"
NO_PULL=0
NO_BUILD=0
RETRY_COUNT=2
SLEEP_SEC=3
CHANGED_FILES=""

usage() {
  cat <<'EOF'
用法:
  bash infra/update.sh [阶段] [选项]

阶段:
  auto      默认。自动 pull 后始终按顺序重建 api/web 并启动（推荐）
  all       拉代码 + 构建并启动 api/web
  prepare   仅检查环境并 git pull
  api       仅构建并启动 api（会同时拉起 redis）
  web       仅构建并启动 web
  api-build 仅构建 api
  web-build 仅构建 web
  api-up    仅启动 api（会同时拉起 redis）
  web-up    仅启动 web
  status    查看 compose 服务状态

选项:
  --no-pull        跳过 git pull
  --no-build       跳过 build（对 auto/all/api/web 有效，仅 up）
  --retry=N        失败重试次数（默认 2）
  --sleep=N        每次重试等待秒数（默认 3）
  -h, --help       显示帮助
EOF
}

for arg in "$@"; do
  case "$arg" in
    auto|all|prepare|api|web|api-build|web-build|api-up|web-up|status)
      STAGE="$arg"
      ;;
    --no-pull)
      NO_PULL=1
      ;;
    --no-build)
      NO_BUILD=1
      ;;
    --retry=*)
      RETRY_COUNT="${arg#*=}"
      ;;
    --sleep=*)
      SLEEP_SEC="${arg#*=}"
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

run_with_retry() {
  local step_name="$1"
  shift
  local attempt=1
  local max_attempt=$((RETRY_COUNT + 1))
  until "$@"; do
    if [ "$attempt" -ge "$max_attempt" ]; then
      warn "步骤失败且达到重试上限: $step_name"
      return 1
    fi
    warn "步骤失败，${SLEEP_SEC}s 后重试 (${attempt}/${RETRY_COUNT}): $step_name"
    sleep "$SLEEP_SEC"
    attempt=$((attempt + 1))
  done
}

pull_latest() {
  if [ "$NO_PULL" -eq 1 ] || ! command -v git >/dev/null 2>&1; then
    return
  fi

  local old_head
  local new_head
  old_head="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"

  log "拉取最新代码..."
  if ! git -C "$ROOT_DIR" pull --ff-only; then
    warn "git pull 失败，请检查仓库状态。"
    return
  fi

  new_head="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [ -n "$old_head" ] && [ -n "$new_head" ] && [ "$old_head" != "$new_head" ]; then
    CHANGED_FILES="$(git -C "$ROOT_DIR" diff --name-only "$old_head..$new_head" || true)"
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

running_service_count() {
  local count
  count="$(compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q | grep -c . || true)"
  printf '%s' "$count"
}

ensure_stack_up_no_build() {
  log "未检测到变更，执行服务兜底拉起（redis/api/web）..."
  compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d redis api web
}

detect_need_api() {
  local files="$1"
  if [ -z "$files" ]; then
    return 1
  fi
  printf '%s\n' "$files" | grep -Eq \
    '^(apps/api/|Dockerfile\.api$|infra/docker-compose\.yml$|pnpm-lock\.yaml$|package\.json$|pnpm-workspace\.yaml$|turbo\.json$|infra/\.env\.example$|\.env\.example$)'
}

detect_need_web() {
  local files="$1"
  if [ -z "$files" ]; then
    return 1
  fi
  printf '%s\n' "$files" | grep -Eq \
    '^(apps/web/|Dockerfile\.web$|infra/docker-compose\.yml$|pnpm-lock\.yaml$|package\.json$|pnpm-workspace\.yaml$|turbo\.json$|infra/\.env\.example$|\.env\.example$)'
}

run_auto() {
  pull_latest

  # 强制逐条更新：不依赖 git pull 结果与代码差异，避免“看起来没更新”导致遗漏。
  local need_api=1
  local need_web=1

  if [ "$NO_BUILD" -eq 1 ]; then
    if [ "$need_api" -eq 1 ]; then run_with_retry "api-up" up_service api; fi
    if [ "$need_web" -eq 1 ]; then run_with_retry "web-up" up_service web; fi
    show_status
    log "完成阶段: auto（no-build，已按顺序重启服务）"
    return
  fi

  if [ "$need_api" -eq 1 ]; then
    run_with_retry "api-build" build_service api
    run_with_retry "api-up" up_service api
  fi
  if [ "$need_web" -eq 1 ]; then
    run_with_retry "web-build" build_service web
    run_with_retry "web-up" up_service web
  fi

  show_status
  log "完成阶段: auto（已按顺序重建 api -> web）"
}

main() {
  ensure_compose
  ensure_paths

  case "$STAGE" in
    auto)
      run_auto
      ;;
    prepare)
      pull_latest
      show_status
      log "完成阶段: prepare"
      ;;
    api-build)
      pull_latest
      run_with_retry "api-build" build_service api
      show_status
      log "完成阶段: api-build"
      ;;
    web-build)
      pull_latest
      run_with_retry "web-build" build_service web
      show_status
      log "完成阶段: web-build"
      ;;
    api-up)
      pull_latest
      run_with_retry "api-up" up_service api
      show_status
      log "完成阶段: api-up"
      ;;
    web-up)
      pull_latest
      run_with_retry "web-up" up_service web
      show_status
      log "完成阶段: web-up"
      ;;
    api)
      pull_latest
      if [ "$NO_BUILD" -eq 0 ]; then run_with_retry "api-build" build_service api; fi
      run_with_retry "api-up" up_service api
      show_status
      log "完成阶段: api"
      ;;
    web)
      pull_latest
      if [ "$NO_BUILD" -eq 0 ]; then run_with_retry "web-build" build_service web; fi
      run_with_retry "web-up" up_service web
      show_status
      log "完成阶段: web"
      ;;
    status)
      show_status
      log "完成阶段: status"
      ;;
    all)
      pull_latest
      if [ "$NO_BUILD" -eq 0 ]; then run_with_retry "api-build" build_service api; fi
      run_with_retry "api-up" up_service api
      if [ "$NO_BUILD" -eq 0 ]; then run_with_retry "web-build" build_service web; fi
      run_with_retry "web-up" up_service web
      show_status
      log "完成阶段: all"
      ;;
    *)
      warn "未知阶段: $STAGE"
      usage
      exit 1
      ;;
  esac
}

main "$@"

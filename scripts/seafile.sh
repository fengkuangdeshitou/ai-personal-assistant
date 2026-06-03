#!/bin/bash

# Seafile 服务管理脚本
# 管理本机 Docker Compose 部署的 Seafile 私有云

SEAFILE_DIR="/Users/maiyou001/seafile"
COMPOSE_CMD="docker compose"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[Seafile]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[Seafile]${NC} $1"; }
log_error()   { echo -e "${RED}[Seafile]${NC} $1"; }
log_section() { echo -e "\n${CYAN}=== $1 ===${NC}"; }

# 检查 Docker 是否运行
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker 未运行，请先启动 Docker Desktop"
        exit 1
    fi
}

# 检查 compose 文件是否存在
check_compose() {
    if [ ! -f "$SEAFILE_DIR/docker-compose.yml" ]; then
        log_error "找不到 $SEAFILE_DIR/docker-compose.yml"
        exit 1
    fi
}

# 获取容器状态
get_status() {
    docker ps --filter "name=seafile" --format "{{.Names}}\t{{.Status}}" 2>/dev/null
}

# 检查 Seafile 是否已在运行
is_running() {
    docker ps --filter "name=seafile" --filter "status=running" -q 2>/dev/null | grep -q .
}

cmd_start() {
    log_section "启动 Seafile"
    check_docker
    check_compose

    if is_running; then
        log_warn "Seafile 已在运行"
        cmd_status
        return 0
    fi

    log_info "正在启动容器..."
    cd "$SEAFILE_DIR" && $COMPOSE_CMD up -d

    if [ $? -eq 0 ]; then
        log_info "等待服务就绪..."
        sleep 5
        log_info "Seafile 启动成功 ✓"
        cmd_status
    else
        log_error "Seafile 启动失败"
        exit 1
    fi
}

cmd_stop() {
    log_section "停止 Seafile"
    check_docker
    check_compose

    if ! is_running; then
        log_warn "Seafile 未在运行"
        return 0
    fi

    log_info "正在停止容器..."
    cd "$SEAFILE_DIR" && $COMPOSE_CMD down

    if [ $? -eq 0 ]; then
        log_info "Seafile 已停止 ✓"
    else
        log_error "Seafile 停止失败"
        exit 1
    fi
}

cmd_restart() {
    log_section "重启 Seafile"
    check_docker
    check_compose
    log_info "正在重启..."
    cd "$SEAFILE_DIR" && $COMPOSE_CMD restart
    if [ $? -eq 0 ]; then
        log_info "Seafile 重启成功 ✓"
        cmd_status
    else
        log_error "Seafile 重启失败"
        exit 1
    fi
}

cmd_status() {
    log_section "Seafile 状态"
    check_docker

    local status
    status=$(get_status)

    if [ -z "$status" ]; then
        log_warn "没有找到 Seafile 相关容器"
    else
        echo -e "${CYAN}容器名称\t\t\t状态${NC}"
        echo "----------------------------------------"
        echo "$status"
        echo ""

        # 显示访问地址
        if is_running; then
            LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
            log_info "本机访问: http://localhost"
            [ -n "$LOCAL_IP" ] && log_info "局域网访问: http://$LOCAL_IP"
        fi
    fi
}

cmd_logs() {
    check_docker
    log_section "Seafile 日志 (Ctrl+C 退出)"
    cd "$SEAFILE_DIR" && $COMPOSE_CMD logs -f seafile
}

cmd_autostart_on() {
    local plist_src="$HOME/Library/LaunchAgents/com.maiyou001.seafile.plist"
    if [ -f "$plist_src" ]; then
        launchctl load "$plist_src" 2>/dev/null
        log_info "开机自启已启用 ✓"
    else
        log_error "未找到 LaunchAgent 配置文件，请重新运行安装脚本"
        exit 1
    fi
}

cmd_autostart_off() {
    local plist_src="$HOME/Library/LaunchAgents/com.maiyou001.seafile.plist"
    if [ -f "$plist_src" ]; then
        launchctl unload "$plist_src" 2>/dev/null
        log_warn "开机自启已禁用"
    else
        log_warn "未找到 LaunchAgent 配置文件"
    fi
}

usage() {
    echo ""
    echo -e "${CYAN}Seafile 服务管理${NC}"
    echo ""
    echo "用法: seafile <命令>"
    echo ""
    echo "命令:"
    echo "  start          启动 Seafile"
    echo "  stop           停止 Seafile"
    echo "  restart        重启 Seafile"
    echo "  status         查看运行状态"
    echo "  logs           查看实时日志"
    echo "  autostart on   启用开机自启"
    echo "  autostart off  禁用开机自启"
    echo ""
}

case "$1" in
    start)        cmd_start ;;
    stop)         cmd_stop ;;
    restart)      cmd_restart ;;
    status)       cmd_status ;;
    logs)         cmd_logs ;;
    autostart)
        case "$2" in
            on)   cmd_autostart_on ;;
            off)  cmd_autostart_off ;;
            *)    usage ;;
        esac
        ;;
    *)            usage ;;
esac

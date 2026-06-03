#!/bin/bash

# Seafile 开机自启动脚本
# 由 macOS LaunchAgent 在用户登录时调用
# 会等待 Docker Desktop 启动后再启动 Seafile 容器

SEAFILE_DIR="/Users/maiyou001/seafile"
LOG_PREFIX="[Seafile AutoStart]"
MAX_WAIT=120   # 最多等待 Docker 120 秒
INTERVAL=5     # 每 5 秒检测一次

echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') 开始等待 Docker..."

# 等待 Docker 就绪
elapsed=0
while ! docker info > /dev/null 2>&1; do
    if [ $elapsed -ge $MAX_WAIT ]; then
        echo "$LOG_PREFIX Docker 等待超时（${MAX_WAIT}s），放弃启动 Seafile"
        exit 1
    fi
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
    echo "$LOG_PREFIX 等待 Docker... ${elapsed}s"
done

echo "$LOG_PREFIX Docker 已就绪，正在启动 Seafile..."

# 启动 Seafile
cd "$SEAFILE_DIR" && docker compose up -d

if [ $? -eq 0 ]; then
    echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') Seafile 启动成功"
else
    echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') Seafile 启动失败"
    exit 1
fi

#!/bin/bash

# AI 助理 - 主启动入口
# 这是打开 AI 助理的唯一入口，会自动处理后端服务

cd "$(dirname "$0")"

# 静默检查并启动后端服务
if ! lsof -i :5178 > /dev/null 2>&1; then
    cd server
    node server.js > /tmp/ai-assistant-server.log 2>&1 &
    cd ..
    sleep 2
fi

# 打开前端页面
open index.html

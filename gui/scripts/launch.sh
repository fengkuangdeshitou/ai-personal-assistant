#!/bin/bash

# AI 助理 - 一键启动脚本
# 自动启动后端服务和前端React应用

# 进入项目目录
cd "$(dirname "$0")"

# 静默检查并启动后端服务
if ! lsof -i :5178 > /dev/null 2>&1; then
    # 后台启动服务器
    cd server
    node server.js > /tmp/ai-assistant-server.log 2>&1 &
    cd ..
    
    # 等待服务启动
    sleep 2
fi

# 检查并启动React前端应用
if ! pgrep -f "react-scripts" > /dev/null 2>&1; then
    cd frontend
    npm start &
    disown
    # 等待React服务器启动
    sleep 10
    # 打开浏览器
    open http://localhost:3000
fi

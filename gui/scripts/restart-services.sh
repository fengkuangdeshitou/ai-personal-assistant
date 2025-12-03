#!/bin/bash

# 重启所有服务脚本（开发模式）

echo "🛑 正在停止所有服务..."

# 停止后端服务
pkill -f "node.*server.js"

# 停止前端服务（开发模式）
pkill -f "react-scripts start"

echo "⏳ 等待服务完全停止..."
sleep 3

cd "$(dirname "$0")/.." || exit

echo "🚀 正在启动后端服务..."
cd server || exit
nohup node server.js > /tmp/ai-assistant-server.log 2>&1 &
BACKEND_PID=$!
echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"

echo "🚀 正在启动前端开发服务（支持热更新）..."
cd ../frontend || exit
nohup npm start > /tmp/ai-assistant-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ 前端开发服务已启动 (PID: $FRONTEND_PID)"

echo "✨ 所有服务重启完成！"
echo "📝 后端日志: /tmp/ai-assistant-server.log"
echo "📝 前端日志: /tmp/ai-assistant-frontend.log"
echo "🌐 访问地址: http://localhost:4000"
echo "⚡ 开发模式已启用，修改代码将自动刷新"

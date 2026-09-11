#!/bin/bash
# 生产环境启动脚本

cd "$(dirname "$0")"

echo "🚀 启动 AI Personal Assistant 生产环境服务..."
echo ""

# 检查是否已有服务在运行
if pgrep -f "node.*server.js" > /dev/null; then
    echo "⚠️  检测到服务已在运行，正在停止..."
    pkill -f "node.*server.js"
    sleep 2
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install --production
    echo ""
fi

# 设置生产环境端口 (后端API使用5178)
export PORT=5178

# 检查 OSS 配置
echo "🔍 检查 OSS 配置..."
if [ -f "oss-connection-config.json" ]; then
    echo "✅ 发现 oss-connection-config.json"
else
    echo "❌ 未发现 oss-connection-config.json（项目管理上传 OSS 需要此文件）"
fi
if [ -f "oss-credentials.json" ]; then
    echo "✅ 发现 oss-credentials.json"
else
    echo "❌ 未发现 oss-credentials.json"
fi
echo ""

# 启动服务
echo "▶️  启动生产环境服务..."
node server.js > /tmp/ai-assistant-server.log 2>&1 &
PID=$!

sleep 3

# 检查服务是否成功启动
if curl -s --max-time 5 http://localhost:3000/api/health > /dev/null 2>&1; then
    echo ""
    echo "✅ 生产环境服务启动成功！"
    echo ""
    echo "📋 服务信息："
    echo "   - PID: $PID"
    echo "   - 端口: http://0.0.0.0:3000"
    echo "   - 日志: /tmp/ai-assistant-server.log"
    echo ""
else
    echo ""
    echo "❌ 服务启动失败"
    echo "📋 查看日志: tail /tmp/ai-assistant-server.log"
    exit 1
fi
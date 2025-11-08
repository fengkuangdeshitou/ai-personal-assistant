#!/bin/bash
# 启动 AI Personal Assistant 后端服务

cd "$(dirname "$0")"

echo "🚀 启动 AI Personal Assistant 后端服务..."
echo ""

# 检查是否已有服务在运行
if pgrep -f "node.*server.js" > /dev/null; then
    echo "⚠️  检测到服务已在运行"
    read -p "是否重启服务? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 停止旧服务..."
        pkill -f "node.*server.js"
        sleep 1
    else
        echo "❌ 取消启动"
        exit 0
    fi
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，安装依赖..."
    npm install
    echo ""
fi

# 启动服务
echo "▶️  启动服务..."
node server.js > /tmp/ai-assistant-backend.log 2>&1 &
PID=$!

sleep 2

# 检查服务是否成功启动
if curl -s http://localhost:5178/api/health > /dev/null 2>&1; then
    echo ""
    echo "✅ 服务启动成功！"
    echo ""
    echo "📋 服务信息："
    echo "   - PID: $PID"
    echo "   - 端口: http://localhost:5178"
    echo "   - 日志: /tmp/ai-assistant-backend.log"
    echo ""
    
    # 显示项目数量
    PROJECT_COUNT=$(curl -s http://localhost:5178/api/projects | jq '.projects | length' 2>/dev/null)
    if [ -n "$PROJECT_COUNT" ]; then
        echo "   - 项目数: $PROJECT_COUNT 个"
    fi
    
    echo ""
    echo "💡 提示："
    echo "   - 查看日志: tail -f /tmp/ai-assistant-backend.log"
    echo "   - 停止服务: pkill -f 'node.*server.js'"
    echo "   - 扫描项目: ./scan-projects.sh"
    echo ""
    echo "🌐 现在可以打开前端页面了！"
else
    echo ""
    echo "❌ 服务启动失败"
    echo "📋 查看日志: tail /tmp/ai-assistant-backend.log"
    exit 1
fi

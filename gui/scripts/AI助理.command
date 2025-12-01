#!/bin/bash

# AI 助理 - 主启动入口
# 这是打开 AI 助理的唯一入口，会自动处理后端服务和前端静态应用

# 获取项目根目录（脚本所在目录的上级目录）
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 AI 助理启动中..."

# 1. 检查并启动后端服务（端口 5178, 5179）
if pgrep -f "node server\.js" > /dev/null 2>&1; then
    echo "✅ 后端服务已在运行"
else
    echo "📡 启动后端服务..."
    cd "$PROJECT_ROOT/server"
    nohup node server.js > /tmp/ai-assistant-server.log 2>&1 &
    cd "$PROJECT_ROOT"
    # 等待服务启动
    for i in {1..10}; do
        if lsof -i :5178 > /dev/null 2>&1; then
            echo "✅ 后端服务已启动（端口 5178, 5179）"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "❌ 后端服务启动超时，请查看日志: /tmp/ai-assistant-server.log"
            exit 1
        fi
        sleep 1
    done
fi

# 2. 检查前端构建文件是否存在
if [ ! -d "$PROJECT_ROOT/frontend/build" ]; then
    echo "📦 首次运行，正在构建前端..."
    cd "$PROJECT_ROOT/frontend"
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ 前端构建失败"
        exit 1
    fi
    cd "$PROJECT_ROOT"
fi

# 3. 检查并启动前端静态服务（端口 4000）
if pgrep -f "serve.*build" > /dev/null 2>&1; then
    echo "✅ 前端服务已在运行"
else
    echo "🌐 启动前端服务..."
    cd "$PROJECT_ROOT/frontend"
    npx serve -s build -l 4000 > /tmp/ai-assistant-frontend.log 2>&1 &
    cd "$PROJECT_ROOT"
    # 等待服务启动
    for i in {1..10}; do
        if curl -s http://localhost:4000 > /dev/null 2>&1; then
            echo "✅ 前端服务已启动（端口 4000）"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "❌ 前端服务启动超时，请查看日志: /tmp/ai-assistant-frontend.log"
            exit 1
        fi
        sleep 1
    done
fi

# 4. 打开浏览器
echo "🌐 正在打开浏览器..."
if curl -s http://localhost:4000 > /dev/null 2>&1; then
    # 使用 AppleScript 打开并激活浏览器
    osascript -e '
        tell application "Google Chrome"
            activate
            open location "http://localhost:4000"
        end tell
    ' 2>/dev/null || \
    osascript -e '
        tell application "Safari"
            activate
            open location "http://localhost:4000"
        end tell
    ' 2>/dev/null || \
    open http://localhost:4000
    
    echo ""
    echo "✨ AI 助理已启动成功！"
    echo "📱 访问地址: http://localhost:4000"
    echo "📝 后端日志: /tmp/ai-assistant-server.log"
    echo "📝 前端日志: /tmp/ai-assistant-frontend.log"
else
    echo "❌ 无法连接到前端服务"
    exit 1
fi

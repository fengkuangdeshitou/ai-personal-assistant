#!/bin/bash

# AI 助理 - 主启动入口
# 这是打开 AI 助理的唯一入口，会自动处理后端服务和前端React应用

# 获取项目根目录（脚本所在目录的上级目录）
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 静默检查并启动后端服务
if ! lsof -i :5178 > /dev/null 2>&1; then
    cd server
    node server.js > /tmp/ai-assistant-server.log 2>&1 &
    cd ..
    sleep 2
fi

# 检查并启动React前端应用
if ! pgrep -f "react-scripts" > /dev/null 2>&1; then
    echo "🔄 正在启动React前端应用..."
    cd frontend
    npm start &
    disown
    # 等待React服务器启动
    sleep 10
    # 检查服务器是否启动成功
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo "🌐 正在打开浏览器..."
        # 使用AppleScript直接打开Chrome
        osascript -e "tell application \"Google Chrome\" to open location \"http://localhost:4000\"" 2>/dev/null || \
        osascript -e "tell application \"Safari\" to open location \"http://localhost:4000\"" 2>/dev/null || \
        open http://localhost:4000
        echo "📱 如果浏览器没有自动打开，请手动访问: http://localhost:4000"
        # 获取本机IP并显示局域网访问地址
        LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
        if [ -n "$LOCAL_IP" ]; then
            echo "🌍 局域网内其他设备可访问: http://$LOCAL_IP:4000"
        fi
    else
        echo "❌ React服务器启动失败"
    fi
else
    echo "✅ React前端应用已在运行"
    # 即使服务器已在运行，也尝试打开浏览器
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo "🌐 正在打开浏览器..."
        # 使用AppleScript激活应用并打开URL
        osascript -e "
            tell application \"Google Chrome\"
                activate
                open location \"http://localhost:4000\"
            end tell
        " 2>/dev/null || \
        osascript -e "
            tell application \"Safari\"
                activate
                open location \"http://localhost:4000\"
            end tell
        " 2>/dev/null || \
        open http://localhost:4000
        echo "📱 如果浏览器没有自动打开，请手动访问: http://localhost:4000"
        # 获取本机IP并显示局域网访问地址
        LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
        if [ -n "$LOCAL_IP" ]; then
            echo "🌍 局域网内其他设备可访问: http://$LOCAL_IP:4000"
        fi
    fi
fi

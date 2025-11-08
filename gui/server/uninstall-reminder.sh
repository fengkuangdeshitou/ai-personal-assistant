#!/bin/bash

# AI助理桌面提醒卸载脚本

PLIST_FILE="$HOME/Library/LaunchAgents/com.ai-assistant.reminder.plist"

echo "🗑️  卸载 AI 助理桌面提醒服务..."

if [ -f "$PLIST_FILE" ]; then
    # 卸载服务
    launchctl unload "$PLIST_FILE" 2>/dev/null
    
    # 删除 plist 文件
    rm "$PLIST_FILE"
    
    echo "✅ 卸载完成！"
    echo "📁 日志文件保留在: $HOME/.ai-assistant/logs/"
    echo "   如需删除日志: rm -rf $HOME/.ai-assistant/logs/reminder.*"
else
    echo "⚠️  未找到已安装的服务"
fi

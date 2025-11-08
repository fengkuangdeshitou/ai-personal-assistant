#!/bin/bash

# AI助理桌面提醒安装脚本
# 使用 launchd 在 macOS 上设置定时任务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMINDER_SCRIPT="$SCRIPT_DIR/reminder.js"
PLIST_FILE="$HOME/Library/LaunchAgents/com.ai-assistant.reminder.plist"

echo "🚀 安装 AI 助理桌面提醒服务..."
echo "📍 脚本路径: $REMINDER_SCRIPT"

# 检查 node 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

NODE_PATH=$(which node)
echo "✅ Node.js 路径: $NODE_PATH"

# 创建 LaunchAgent plist 文件
cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ai-assistant.reminder</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$REMINDER_SCRIPT</string>
    </array>
    
    <key>StartCalendarInterval</key>
    <array>
        <!-- 09:30 早安提醒 -->
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <!-- 12:30 午休提醒 -->
        <dict>
            <key>Hour</key>
            <integer>12</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <!-- 14:00 下午工作 -->
        <dict>
            <key>Hour</key>
            <integer>14</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <!-- 18:30 下班提醒 -->
        <dict>
            <key>Hour</key>
            <integer>18</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
    </array>
    
    <key>StandardOutPath</key>
    <string>$HOME/.ai-assistant/logs/reminder.log</string>
    
    <key>StandardErrorPath</key>
    <string>$HOME/.ai-assistant/logs/reminder.error.log</string>
    
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

# 创建日志目录
mkdir -p "$HOME/.ai-assistant/logs"

# 设置正确的权限
chmod 644 "$PLIST_FILE"

# 如果已经加载，先卸载
launchctl unload "$PLIST_FILE" 2>/dev/null || true

# 加载新的配置
launchctl load "$PLIST_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 安装成功！"
    echo ""
    echo "📅 提醒时间表:"
    echo "  • 09:30 - ☕ 早安提醒"
    echo "  • 12:30 - 🍱 午休提醒"
    echo "  • 14:00 - 💼 下午工作"
    echo "  • 18:30 - 🎉 下班提醒"
    echo ""
    echo "📋 管理命令:"
    echo "  启动服务: launchctl load $PLIST_FILE"
    echo "  停止服务: launchctl unload $PLIST_FILE"
    echo "  查看日志: tail -f $HOME/.ai-assistant/logs/reminder.log"
    echo "  测试运行: node $REMINDER_SCRIPT"
    echo ""
    echo "🔔 提醒: 请确保系统通知权限已开启"
    echo "   设置 > 通知 > 终端/脚本编辑器 > 允许通知"
else
    echo "❌ 安装失败，请检查错误信息"
    exit 1
fi

#!/bin/bash

# AI 助理 - 快速命令菜单

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          🤖 AI 私人助理 - 快速命令菜单 v1.6.0                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 可用命令："
echo ""
echo "  1️⃣  启动后端服务"
echo "     cd server && ./start.sh"
echo ""
echo "  2️⃣  测试提醒弹窗"
echo "     node server/reminder-web.js"
echo ""
echo "  3️⃣  安装桌面提醒（开机自启动）"
echo "     cd server && ./install-reminder.sh"
echo ""
echo "  4️⃣  卸载桌面提醒"
echo "     cd server && ./uninstall-reminder.sh"
echo ""
echo "  5️⃣  查看提醒日志"
echo "     tail -f ~/.ai-assistant/logs/reminder.log"
echo ""
echo "  6️⃣  扫描并更新项目列表"
echo "     cd server && ./scan-projects.sh"
echo ""
echo "  7️⃣  在浏览器中打开 GUI"
echo "     open index.html"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""
read -p "请输入选项 (1-7) 或按 Ctrl+C 退出: " choice

case $choice in
    1)
        echo "🚀 启动后端服务..."
        cd server && ./start.sh
        ;;
    2)
        echo "📤 发送测试通知..."
        node server/test-notification.js
        ;;
    3)
        echo "📥 安装桌面提醒..."
        cd server && ./install-reminder.sh
        ;;
    4)
        echo "🗑️  卸载桌面提醒..."
        cd server && ./uninstall-reminder.sh
        ;;
    5)
        echo "📋 查看提醒日志..."
        tail -f ~/.ai-assistant/logs/reminder.log
        ;;
    6)
        echo "🔍 扫描项目..."
        cd server && ./scan-projects.sh
        ;;
    7)
        echo "🌐 打开 GUI..."
        open index.html
        ;;
    *)
        echo "❌ 无效选项"
        ;;
esac

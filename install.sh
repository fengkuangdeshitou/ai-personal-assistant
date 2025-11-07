#!/bin/bash

# 🚀 AI 私人助理安装配置脚本
# ============================

echo "🤖 正在配置 AI 私人助理..."
echo ""

# 添加别名到 .zshrc
ZSHRC_FILE="$HOME/.zshrc"

# 备份原有配置
if [ -f "$ZSHRC_FILE" ]; then
    cp "$ZSHRC_FILE" "$ZSHRC_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ 已备份原有 .zshrc 配置"
fi

# 检查是否已存在 AI 助理配置
if ! grep -q "AI 私人助理" "$ZSHRC_FILE" 2>/dev/null; then
    cat >> "$ZSHRC_FILE" << 'EOF'

# ====================================
# 🤖 AI 私人助理配置
# ====================================

# AI 助理别名
alias ai='bash ~/.ai-assistant/scripts/ai-assistant.sh'
alias ai-assistant='bash ~/.ai-assistant/scripts/ai-assistant.sh'
alias ai-env='bash ~/.ai-assistant/scripts/env_check.sh'
alias ai-status='bash ~/.ai-assistant/scripts/project_status.sh'
alias ai-backup='bash ~/.ai-assistant/scripts/backup_projects.sh'
alias ai-remind='bash ~/.ai-assistant/scripts/smart_reminders.sh'

# 快捷开发命令
alias dev='cd ~/Project && code .'
alias newproject='bash ~/.ai-assistant/scripts/ai-assistant.sh'
alias projects='cd ~/Project && ls -la'

# Git 增强别名
alias gst='git status'
alias gca='git commit -am'
alias gp='git push'
alias gl='git pull'
alias gb='git branch'
alias gco='git checkout'

# 项目快捷方式
alias vue-create='npm create vue@latest'
alias react-create='npx create-react-app'

# 实用工具
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'

# AI 助理启动问候
ai_greeting() {
    local current_hour=$(date +%H)
    local greeting=""
    
    if [ $current_hour -lt 12 ]; then
        greeting="🌅 早上好"
    elif [ $current_hour -lt 18 ]; then
        greeting="☀️ 下午好"
    else
        greeting="🌙 晚上好"
    fi
    
    echo "$greeting，$(whoami)！AI 助理随时为您服务 🤖"
    echo "💡 输入 'ai' 启动助理，'ai-env' 检查环境"
}

# 自动显示问候 (仅在交互式 shell 中)
if [[ $- == *i* ]]; then
    # ai_greeting
fi

EOF

    echo "✅ 已添加 AI 助理别名和配置"
else
    echo "ℹ️  AI 助理配置已存在"
fi

# 创建必要目录
mkdir -p ~/.ai-assistant/{logs,templates,backup}

# 设置定时提醒
echo "⚙️ 设置智能提醒系统..."
bash ~/.ai-assistant/scripts/smart_reminders.sh --setup

echo ""
echo "🎉 AI 私人助理配置完成！"
echo ""
echo "📋 可用命令："
echo "   ai               - 启动 AI 助理"
echo "   ai-env          - 检查开发环境"
echo "   ai-status       - 查看项目状态"
echo "   ai-backup       - 备份项目"
echo "   ai-remind       - 智能提醒"
echo ""
echo "🔄 请重启终端或运行以下命令使配置生效："
echo "   source ~/.zshrc"
echo ""
echo "🚀 然后输入 'ai' 开始使用您的私人助理！"
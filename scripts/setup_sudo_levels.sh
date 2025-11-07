#!/bin/bash

# 🔐 AI 助理分级权限配置
# =======================

# 加载自动确认函数
source ~/.ai-assistant/scripts/auto_confirm.sh

USER=$(whoami)
SUDOERS_FILE="/etc/sudoers.d/ai-assistant"

echo "🔐 AI 助理分级权限配置"
echo "====================="
echo "用户: $USER"
echo ""

echo "请选择权限级别:"
echo ""
echo "1. 🟢 基础级别 - 仅包管理和开发工具"
echo "   • npm, yarn, pip, brew"
echo "   • git 操作"
echo "   • 基本文件操作"
echo ""
echo "2. 🟡 标准级别 - 基础 + 系统工具"
echo "   • 基础级别所有权限"
echo "   • launchctl (服务管理)"
echo "   • 进程管理 (pkill, killall)"
echo ""
echo "3. 🟠 完整级别 - 标准 + 高级功能"
echo "   • 标准级别所有权限"
echo "   • 系统配置修改"
echo "   • 软件安装权限"
echo ""
echo "4. 🔴 管理员级别 - 完全 sudo 免密"
echo "   • 所有 sudo 命令免密"
echo "   • ⚠️ 仅推荐专业开发者使用"
echo ""

read -p "请选择权限级别 (1-4): " level

case $level in
    1)
        CONFIG_NAME="基础级别"
        cat > /tmp/ai-sudo-config << 'EOF'
# AI 助理基础权限配置
# 包管理和开发工具

# 包管理器
maiyou001 ALL=(ALL) NOPASSWD: /opt/homebrew/bin/npm, /opt/homebrew/bin/yarn, /opt/homebrew/bin/pnpm
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/npm, /usr/bin/yarn, /usr/bin/pnpm
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/pip, /usr/bin/pip3, /usr/local/bin/pip, /usr/local/bin/pip3
maiyou001 ALL=(ALL) NOPASSWD: /opt/homebrew/bin/pip, /opt/homebrew/bin/pip3
maiyou001 ALL=(ALL) NOPASSWD: /opt/homebrew/bin/brew

# Git 操作
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/git, /opt/homebrew/bin/git, /usr/local/bin/git

# 基本文件操作 (限制在用户目录和常用位置)
maiyou001 ALL=(ALL) NOPASSWD: /bin/mkdir -p /Users/maiyou001/*, /tmp/*, /usr/local/*
maiyou001 ALL=(ALL) NOPASSWD: /bin/cp * /Users/maiyou001/*, /bin/cp * /tmp/*
maiyou001 ALL=(ALL) NOPASSWD: /bin/mv * /Users/maiyou001/*, /bin/mv * /tmp/*
EOF
        ;;
    2)
        CONFIG_NAME="标准级别"
        cat > /tmp/ai-sudo-config << 'EOF'
# AI 助理标准权限配置
# 基础权限 + 系统服务管理

# 开发工具 (所有路径)
maiyou001 ALL=(ALL) NOPASSWD: /opt/homebrew/bin/*, /usr/local/bin/*

# 包管理器
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/npm, /usr/bin/yarn, /usr/bin/pnpm
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/pip, /usr/bin/pip3

# Git 和版本控制
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/git

# 文件操作
maiyou001 ALL=(ALL) NOPASSWD: /bin/mkdir, /bin/cp, /bin/mv, /bin/rm
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/chmod, /usr/bin/chown

# 系统服务管理
maiyou001 ALL=(ALL) NOPASSWD: /bin/launchctl
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/pkill, /usr/bin/killall

# 网络工具
maiyou001 ALL=(ALL) NOPASSWD: /usr/bin/curl, /usr/bin/wget
EOF
        ;;
    3)
        CONFIG_NAME="完整级别"
        cat > /tmp/ai-sudo-config << 'EOF'
# AI 助理完整权限配置
# 标准权限 + 高级系统功能

Cmnd_Alias AI_DEV_TOOLS = /opt/homebrew/bin/*, /usr/local/bin/*, /usr/bin/npm, /usr/bin/yarn, /usr/bin/pnpm, /usr/bin/pip*, /usr/bin/git
Cmnd_Alias AI_FILE_OPS = /bin/mkdir, /bin/cp, /bin/mv, /bin/rm, /usr/bin/chmod, /usr/bin/chown, /usr/bin/rsync, /usr/bin/tar, /usr/bin/unzip, /usr/bin/zip
Cmnd_Alias AI_SYSTEM = /bin/launchctl, /usr/bin/pkill, /usr/bin/killall, /usr/bin/curl, /usr/bin/wget
Cmnd_Alias AI_INSTALL = /usr/sbin/installer, /usr/bin/xcode-select

# 用户权限
maiyou001 ALL=(ALL) NOPASSWD: AI_DEV_TOOLS, AI_FILE_OPS, AI_SYSTEM, AI_INSTALL

# 环境变量保持
Defaults:maiyou001 env_keep += "PATH HOME USER"
EOF
        ;;
    4)
        CONFIG_NAME="管理员级别"
        cat > /tmp/ai-sudo-config << 'EOF'
# AI 助理管理员权限配置
# 完全 sudo 免密 - 仅限开发环境使用

# 完全权限
maiyou001 ALL=(ALL) NOPASSWD: ALL

# 保持环境变量
Defaults:maiyou001 env_keep += "PATH HOME USER SHELL"
Defaults:maiyou001 !lecture
EOF
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "📋 将应用 $CONFIG_NAME 配置:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat /tmp/ai-sudo-config
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 验证语法
if sudo visudo -c -f /tmp/ai-sudo-config; then
    echo "✅ 配置语法正确"
    
    # 使用自动确认功能
    if auto_confirm "🔐 确认应用 $CONFIG_NAME 权限配置？" 5 "y"; then
        # 备份现有配置
        if [ -f "$SUDOERS_FILE" ]; then
            sudo cp "$SUDOERS_FILE" "${SUDOERS_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
            echo "📦 已备份现有配置"
        fi
        
        # 应用配置
        sudo cp /tmp/ai-sudo-config "$SUDOERS_FILE"
        sudo chmod 440 "$SUDOERS_FILE"
        sudo chown root:wheel "$SUDOERS_FILE"
        
        echo "✅ $CONFIG_NAME 配置已应用"
        
        # 测试权限
        echo ""
        echo "🧪 测试配置..."
        
        if sudo -n true 2>/dev/null; then
            echo "✅ sudo 免密权限配置成功"
            
            # 更新 AI 助理配置
            echo ""
            echo "🔄 更新 AI 助理状态..."
            
            # 运行环境检查验证
            if command -v ai-env &> /dev/null; then
                echo "🔍 重新检查环境..."
                ai-env | grep -E "(sudo|权限)" || echo "权限检查完成"
            fi
            
        else
            echo "❌ sudo 免密配置失败，请检查"
        fi
        
        echo ""
        echo "🎉 权限配置完成！"
        echo ""
        echo "📖 管理说明:"
        echo "   🔍 检查权限: sudo -l"
        echo "   ✏️  编辑配置: sudo visudo -f $SUDOERS_FILE"
        echo "   🗑️  删除配置: sudo rm $SUDOERS_FILE"
        
    else
        echo "⏹️  配置已取消"
    fi
else
    echo "❌ 配置语法错误"
fi

# 清理
rm -f /tmp/ai-sudo-config
#!/bin/bash

# 🔐 AI 助理 sudo 免密配置脚本
# ===============================

USER=$(whoami)
SUDOERS_FILE="/etc/sudoers.d/ai-assistant"

echo "🔐 为 AI 助理配置 sudo 免密权限..."
echo "用户: $USER"
echo ""

# 创建增强的 sudoers 配置
cat > /tmp/ai-assistant-sudo << EOF
# AI 助理增强权限配置
# 创建时间: $(date)
# 用户: $USER

# 定义命令组
Cmnd_Alias AI_DEV_TOOLS = \\
    /opt/homebrew/bin/*, \\
    /usr/local/bin/*, \\
    /usr/bin/npm, /usr/bin/yarn, /usr/bin/pnpm, \\
    /usr/bin/pip, /usr/bin/pip3, \\
    /usr/bin/git, \\
    /bin/mkdir, /bin/cp, /bin/mv, /bin/rm, \\
    /usr/bin/chmod, /usr/bin/chown, \\
    /usr/bin/curl, /usr/bin/wget, \\
    /usr/sbin/installer, \\
    /usr/bin/xcode-select, \\
    /usr/bin/dscl, /usr/bin/dseditgroup

Cmnd_Alias AI_SYSTEM_TOOLS = \\
    /bin/launchctl, \\
    /usr/bin/pkill, \\
    /usr/bin/killall, \\
    /sbin/mount, /sbin/umount

Cmnd_Alias AI_FILE_OPS = \\
    /bin/mkdir -p *, \\
    /bin/cp -r *, \\
    /bin/mv *, \\
    /bin/rm -rf *, \\
    /usr/bin/rsync *, \\
    /usr/bin/tar *, \\
    /usr/bin/unzip *, \\
    /usr/bin/zip *

# 用户权限配置
$USER ALL=(ALL) NOPASSWD: AI_DEV_TOOLS, AI_SYSTEM_TOOLS, AI_FILE_OPS

# 特殊权限：允许编辑系统配置（谨慎使用）
$USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/sudoers.d/*

# 环境变量保持
Defaults:$USER env_keep += "PATH HOME USER SHELL"
EOF

echo "📋 生成的配置内容:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat /tmp/ai-assistant-sudo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 验证配置语法
echo "🔍 验证 sudoers 文件语法..."
if sudo visudo -c -f /tmp/ai-assistant-sudo; then
    echo "✅ Sudoers 文件语法正确"
    
    read -p "📝 是否应用此配置？这将替换现有的 AI 权限配置 (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 备份现有配置
        if [ -f "$SUDOERS_FILE" ]; then
            sudo cp "$SUDOERS_FILE" "$SUDOERS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            echo "📦 已备份现有配置"
        fi
        
        # 应用新配置
        sudo cp /tmp/ai-assistant-sudo "$SUDOERS_FILE"
        sudo chmod 440 "$SUDOERS_FILE"
        sudo chown root:wheel "$SUDOERS_FILE"
        
        echo "✅ 新配置已应用: $SUDOERS_FILE"
        
        # 测试配置
        echo ""
        echo "🧪 测试配置..."
        
        # 测试基本 sudo
        if sudo -n true 2>/dev/null; then
            echo "✅ 基本 sudo 权限正常"
        else
            echo "❌ 基本 sudo 权限失败"
        fi
        
        # 测试具体命令
        echo "🔧 测试常用命令..."
        
        # 测试 homebrew
        if sudo -n brew --version >/dev/null 2>&1; then
            echo "✅ Homebrew 命令可免密执行"
        else
            echo "⚠️  Homebrew 命令测试失败（可能未安装）"
        fi
        
        # 测试 npm
        if sudo -n npm --version >/dev/null 2>&1; then
            echo "✅ npm 命令可免密执行"
        else
            echo "⚠️  npm 命令测试失败"
        fi
        
        # 测试文件操作
        if sudo -n mkdir -p /tmp/ai-test && sudo -n rmdir /tmp/ai-test 2>/dev/null; then
            echo "✅ 文件操作命令可免密执行"
        else
            echo "⚠️  文件操作命令测试失败"
        fi
        
        echo ""
        echo "🎉 AI 助理 sudo 免密配置完成！"
        
    else
        echo "⏹️  配置已取消"
    fi
    
else
    echo "❌ Sudoers 文件语法错误，请检查配置"
    echo "🔍 详细语法检查:"
    sudo visudo -c -f /tmp/ai-assistant-sudo
fi

# 清理临时文件
rm -f /tmp/ai-assistant-sudo

echo ""
echo "📖 使用说明："
echo "   ✅ 配置文件位置: $SUDOERS_FILE"
echo "   🗑️  撤销配置: sudo rm $SUDOERS_FILE"
echo "   ✏️  编辑配置: sudo visudo -f $SUDOERS_FILE"
echo "   🔍 检查权限: sudo -l"
echo ""
echo "⚠️  安全提醒："
echo "   - 此配置仅适用于开发环境"
echo "   - 定期检查和更新权限配置"
echo "   - 避免在生产环境使用"
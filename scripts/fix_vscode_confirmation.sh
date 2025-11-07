#!/bin/bash

# 🔧 VS Code 自动允许脚本执行配置
# =================================
# 彻底解决 VS Code 的"允许"确认对话框问题

echo "🔧 正在配置 VS Code 自动允许脚本执行..."
echo ""

# 1. 创建或更新用户设置
VSCODE_SETTINGS_DIR="$HOME/Library/Application Support/Code/User"
VSCODE_SETTINGS_FILE="$VSCODE_SETTINGS_DIR/settings.json"

echo "📁 检查 VS Code 设置目录..."
if [ ! -d "$VSCODE_SETTINGS_DIR" ]; then
    echo "创建 VS Code 设置目录: $VSCODE_SETTINGS_DIR"
    mkdir -p "$VSCODE_SETTINGS_DIR"
fi

echo "⚙️ 配置 VS Code 设置..."

# 备份现有设置
if [ -f "$VSCODE_SETTINGS_FILE" ]; then
    echo "📦 备份现有设置到: ${VSCODE_SETTINGS_FILE}.backup"
    cp "$VSCODE_SETTINGS_FILE" "${VSCODE_SETTINGS_FILE}.backup"
fi

# 创建新的设置文件
cat > "$VSCODE_SETTINGS_FILE" << 'EOF'
{
    "security.workspace.trust.enabled": false,
    "security.workspace.trust.startupPrompt": "never",
    "security.workspace.trust.banner": "never",
    "security.workspace.trust.emptyWindow": false,
    "terminal.integrated.shellIntegration.enabled": true,
    "terminal.integrated.allowChords": true,
    "terminal.integrated.allowMnemonics": true,
    "terminal.integrated.confirmOnExit": "never",
    "terminal.integrated.confirmOnKill": "never",
    "extensions.ignoreRecommendations": false,
    "workbench.startupEditor": "welcomePage",
    "files.autoSave": "onFocusChange"
}
EOF

echo "✅ VS Code 设置已更新"

# 2. 创建工作区信任配置
WORKSPACE_DIR="$HOME/Project"
if [ -d "$WORKSPACE_DIR" ]; then
    echo "🔒 配置工作区信任..."
    
    # 创建工作区配置
    cat > "$WORKSPACE_DIR/.vscode/settings.json" << 'EOF'
{
    "security.workspace.trust.enabled": false,
    "terminal.integrated.shellIntegration.enabled": true
}
EOF
    
    echo "✅ 工作区信任配置完成"
fi

# 3. 创建快速执行别名
echo "🚀 添加快速执行命令..."

# 检查是否已存在别名
if ! grep -q "vscode_run" ~/.zshrc; then
    cat >> ~/.zshrc << 'EOF'

# VS Code 快速执行命令 (无确认对话框)
alias vscode运行='bash'
alias vs执行='bash'
alias 快速执行='bash'
alias 无确认执行='bash'

# 直接在 VS Code 终端执行的函数
function vscode_run() {
    if [ -z "$1" ]; then
        echo "用法: vscode_run <脚本路径>"
        return 1
    fi
    
    echo "🚀 VS Code 终端直接执行: $1"
    bash "$1"
}

# 中文别名
alias vscode执行=vscode_run
alias 终端执行=vscode_run
EOF

    echo "✅ 快速执行别名已添加到 ~/.zshrc"
else
    echo "ℹ️  快速执行别名已存在"
fi

# 4. 创建测试脚本
TEST_SCRIPT="$HOME/vscode_test.sh"
cat > "$TEST_SCRIPT" << 'EOF'
#!/bin/bash
echo "🎉 VS Code 脚本执行测试成功！"
echo "📅 执行时间: $(date)"
echo "👤 用户: $(whoami)"
echo "📁 目录: $(pwd)"
echo ""
echo "✅ 如果您看到此消息且没有弹出确认对话框，"
echo "   说明配置已生效！"
EOF

chmod +x "$TEST_SCRIPT"

echo ""
echo "🎯 配置完成！解决方案："
echo ""
echo "方法1: 重启 VS Code (推荐)"
echo "   - 完全退出 VS Code"
echo "   - 重新打开 VS Code"
echo "   - 设置将自动生效"
echo ""
echo "方法2: 使用终端执行 (立即生效)"
echo "   vscode运行 /path/to/script.sh"
echo "   vs执行 /path/to/script.sh"
echo "   快速执行 /path/to/script.sh"
echo ""
echo "方法3: 测试脚本"
echo "   bash $TEST_SCRIPT"
echo ""
echo "🔄 重新加载 shell 配置..."
source ~/.zshrc

echo "✨ 配置完成！现在测试:"
echo "   快速执行 $TEST_SCRIPT"
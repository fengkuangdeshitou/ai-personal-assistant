#!/bin/bash

# 🔤 VS Code 字体修复工具
# =====================
# 修复 VS Code 字体变小的问题

echo "🔤 VS Code 字体修复工具"
echo "===================="
echo ""

# 检查当前字体设置
echo "🔍 检查 VS Code 设置..."

VSCODE_SETTINGS="/Users/maiyou001/.vscode/settings.json"
USER_SETTINGS="$HOME/Library/Application Support/Code/User/settings.json"

echo "📁 设置文件位置:"
echo "   工作区设置: $VSCODE_SETTINGS"
echo "   用户设置: $USER_SETTINGS"
echo ""

# 备份当前设置
if [ -f "$VSCODE_SETTINGS" ]; then
    echo "📦 备份当前工作区设置..."
    cp "$VSCODE_SETTINGS" "${VSCODE_SETTINGS}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# 创建包含字体设置的完整配置
echo "🎨 创建优化的字体设置..."

cat > "$VSCODE_SETTINGS" << 'EOF'
{
  // 字体设置
  "editor.fontSize": 14,
  "editor.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "editor.fontWeight": "normal",
  "editor.lineHeight": 1.5,
  "editor.fontLigatures": true,
  
  // 终端字体设置
  "terminal.integrated.fontSize": 13,
  "terminal.integrated.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "terminal.integrated.fontWeight": "normal",
  "terminal.integrated.lineHeight": 1.2,
  
  // 界面字体设置
  "workbench.fontAliasing": "auto",
  "debug.console.fontSize": 13,
  "markdown.preview.fontSize": 14,
  
  // 缩放设置
  "window.zoomLevel": 0,
  
  // 保持之前的安全设置
  "security.workspace.trust.enabled": false,
  "security.workspace.trust.startupPrompt": "never",
  "security.workspace.trust.banner": "never",
  "security.workspace.trust.emptyWindow": false,
  
  // 终端设置
  "terminal.integrated.allowChords": true,
  "terminal.integrated.allowMnemonics": true,
  "terminal.integrated.shellIntegration.enabled": true,
  "terminal.integrated.commandsToSkipShell": [],
  
  // 工作台设置
  "workbench.startupEditor": "welcomePage",
  "extensions.ignoreRecommendations": false,
  
  // 编辑器增强
  "editor.minimap.enabled": true,
  "editor.scrollBeyondLastLine": false,
  "editor.wordWrap": "on",
  "editor.tabSize": 2,
  "editor.insertSpaces": true
}
EOF

echo "✅ 字体设置已更新！"
echo ""

echo "🎯 字体配置详情："
echo "   编辑器字体大小: 14px"
echo "   终端字体大小: 13px"
echo "   字体家族: Menlo, Monaco"
echo "   行高: 1.5 (编辑器), 1.2 (终端)"
echo "   缩放级别: 0 (默认)"
echo ""

echo "🔧 如需调整字体大小，可以："
echo ""
echo "方法1: 使用 VS Code 快捷键"
echo "   放大: Cmd + +"
echo "   缩小: Cmd + -"
echo "   重置: Cmd + 0"
echo ""
echo "方法2: 修改设置文件中的数值"
echo "   editor.fontSize: 编辑器字体大小"
echo "   terminal.integrated.fontSize: 终端字体大小"
echo "   window.zoomLevel: 整体缩放级别"
echo ""

echo "🚀 推荐字体大小："
echo "   • 13px - 适合小屏幕"
echo "   • 14px - 标准大小 (当前)"
echo "   • 15px - 适合大屏幕"
echo "   • 16px - 更易阅读"
echo ""

# 创建字体调节快捷命令
echo "💡 创建字体调节命令..."

cat > "$HOME/.ai-assistant/scripts/vscode_font_adjuster.sh" << 'EOF'
#!/bin/bash

# VS Code 字体调节器
echo "🔤 VS Code 字体调节器"
echo "=================="

case "$1" in
    "large"|"大")
        SIZE=16
        TERM_SIZE=15
        echo "🔍 设置大字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    "medium"|"中")
        SIZE=14
        TERM_SIZE=13
        echo "🔍 设置中等字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    "small"|"小")
        SIZE=12
        TERM_SIZE=11
        echo "🔍 设置小字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    *)
        echo "用法: vscode字体调节 [large|medium|small] 或 [大|中|小]"
        echo "当前设置:"
        grep -E "(fontSize|zoomLevel)" ~/.vscode/settings.json 2>/dev/null || echo "未找到字体设置"
        exit 1
        ;;
esac

# 更新设置文件中的字体大小
sed -i '' "s/\"editor.fontSize\": [0-9]*/\"editor.fontSize\": $SIZE/" ~/.vscode/settings.json
sed -i '' "s/\"terminal.integrated.fontSize\": [0-9]*/\"terminal.integrated.fontSize\": $TERM_SIZE/" ~/.vscode/settings.json

echo "✅ 字体大小已更新！请重启 VS Code 以应用更改。"
EOF

chmod +x "$HOME/.ai-assistant/scripts/vscode_font_adjuster.sh"

echo "📋 新增命令："
echo "   vscode字体调节 大    # 设置大字体"
echo "   vscode字体调节 中    # 设置中等字体" 
echo "   vscode字体调节 小    # 设置小字体"
echo ""

echo "🔄 请重启 VS Code 以应用新的字体设置！"
echo ""
echo "✨ 字体修复完成！"
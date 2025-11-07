#!/bin/bash

# 🔤 VS Code 字体加大工具
# =======================

echo "🔤 正在加大 VS Code 字体..."
echo ""

VSCODE_SETTINGS="/Users/maiyou001/.vscode/settings.json"

echo "📏 当前字体设置:"
grep -E "(fontSize|zoomLevel)" "$VSCODE_SETTINGS"
echo ""

echo "🎯 推荐的大字体方案："
echo "   方案1: 超大字体 (编辑器18px, 终端17px)"
echo "   方案2: 特大字体 (编辑器20px, 终端18px)"  
echo "   方案3: 巨大字体 (编辑器22px, 终端20px)"
echo "   方案4: 自定义大小"
echo ""

read -p "请选择方案 (1-4): " choice

case $choice in
    1)
        EDITOR_SIZE=18
        TERMINAL_SIZE=17
        DEBUG_SIZE=16
        MARKDOWN_SIZE=17
        echo "🔍 设置为超大字体"
        ;;
    2)
        EDITOR_SIZE=20
        TERMINAL_SIZE=18
        DEBUG_SIZE=17
        MARKDOWN_SIZE=19
        echo "🔍 设置为特大字体"
        ;;
    3)
        EDITOR_SIZE=22
        TERMINAL_SIZE=20
        DEBUG_SIZE=19
        MARKDOWN_SIZE=21
        echo "🔍 设置为巨大字体"
        ;;
    4)
        echo "请输入编辑器字体大小 (当前16px):"
        read -p "编辑器字体大小: " EDITOR_SIZE
        read -p "终端字体大小: " TERMINAL_SIZE
        DEBUG_SIZE=$((EDITOR_SIZE - 1))
        MARKDOWN_SIZE=$((EDITOR_SIZE + 1))
        echo "🔍 设置为自定义大小"
        ;;
    *)
        echo "❌ 无效选择，使用默认超大字体"
        EDITOR_SIZE=18
        TERMINAL_SIZE=17
        DEBUG_SIZE=16
        MARKDOWN_SIZE=17
        ;;
esac

echo ""
echo "🎨 应用字体设置:"
echo "   编辑器: ${EDITOR_SIZE}px"
echo "   终端: ${TERMINAL_SIZE}px"
echo "   调试控制台: ${DEBUG_SIZE}px"
echo "   Markdown预览: ${MARKDOWN_SIZE}px"
echo ""

# 更新字体设置
sed -i '' "s/\"editor.fontSize\": [0-9]*/\"editor.fontSize\": $EDITOR_SIZE/" "$VSCODE_SETTINGS"
sed -i '' "s/\"terminal.integrated.fontSize\": [0-9]*/\"terminal.integrated.fontSize\": $TERMINAL_SIZE/" "$VSCODE_SETTINGS"
sed -i '' "s/\"debug.console.fontSize\": [0-9]*/\"debug.console.fontSize\": $DEBUG_SIZE/" "$VSCODE_SETTINGS"
sed -i '' "s/\"markdown.preview.fontSize\": [0-9]*/\"markdown.preview.fontSize\": $MARKDOWN_SIZE/" "$VSCODE_SETTINGS"

echo "✅ 字体设置已更新！"
echo ""
echo "📏 新的字体设置:"
grep -E "(fontSize|zoomLevel)" "$VSCODE_SETTINGS"
echo ""
echo "🔄 请重启 VS Code 以应用新的字体大小！"
echo ""
echo "💡 如果还觉得小，可以："
echo "   • 再次运行此脚本选择更大字体"
echo "   • 在 VS Code 中使用 Cmd + + 临时放大"
echo "   • 调整 window.zoomLevel 进行整体缩放"
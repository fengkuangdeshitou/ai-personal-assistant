#!/bin/bash

# 🔤 VS Code 字体微调工具
# ======================

VSCODE_SETTINGS="/Users/maiyou001/.vscode/settings.json"

echo "🔤 VS Code 字体微调工具"
echo "===================="
echo ""

# 获取当前字体大小
CURRENT_EDITOR=$(grep "editor.fontSize" "$VSCODE_SETTINGS" | grep -o '[0-9]\+')
CURRENT_TERMINAL=$(grep "terminal.integrated.fontSize" "$VSCODE_SETTINGS" | grep -o '[0-9]\+')
CURRENT_DEBUG=$(grep "debug.console.fontSize" "$VSCODE_SETTINGS" | grep -o '[0-9]\+')
CURRENT_MARKDOWN=$(grep "markdown.preview.fontSize" "$VSCODE_SETTINGS" | grep -o '[0-9]\+')

echo "📏 当前字体大小:"
echo "   编辑器: ${CURRENT_EDITOR}px"
echo "   终端: ${CURRENT_TERMINAL}px"
echo "   调试控制台: ${CURRENT_DEBUG}px"
echo "   Markdown: ${CURRENT_MARKDOWN}px"
echo ""

case "$1" in
    "加一号"|"+1"|"bigger")
        NEW_EDITOR=$((CURRENT_EDITOR + 1))
        NEW_TERMINAL=$((CURRENT_TERMINAL + 1))
        NEW_DEBUG=$((CURRENT_DEBUG + 1))
        NEW_MARKDOWN=$((CURRENT_MARKDOWN + 1))
        echo "📈 增大一号字体..."
        ;;
    "减一号"|"-1"|"smaller")
        NEW_EDITOR=$((CURRENT_EDITOR - 1))
        NEW_TERMINAL=$((CURRENT_TERMINAL - 1))
        NEW_DEBUG=$((CURRENT_DEBUG - 1))
        NEW_MARKDOWN=$((CURRENT_MARKDOWN - 1))
        echo "📉 减小一号字体..."
        ;;
    "加两号"|"+2")
        NEW_EDITOR=$((CURRENT_EDITOR + 2))
        NEW_TERMINAL=$((CURRENT_TERMINAL + 2))
        NEW_DEBUG=$((CURRENT_DEBUG + 2))
        NEW_MARKDOWN=$((CURRENT_MARKDOWN + 2))
        echo "📈 增大两号字体..."
        ;;
    "减两号"|"-2")
        NEW_EDITOR=$((CURRENT_EDITOR - 2))
        NEW_TERMINAL=$((CURRENT_TERMINAL - 2))
        NEW_DEBUG=$((CURRENT_DEBUG - 2))
        NEW_MARKDOWN=$((CURRENT_MARKDOWN - 2))
        echo "📉 减小两号字体..."
        ;;
    *)
        echo "用法: 字体微调 [加一号|减一号|+1|-1|加两号|减两号|+2|-2]"
        echo ""
        echo "示例:"
        echo "   字体微调 加一号    # 所有字体增大1px"
        echo "   字体微调 减一号    # 所有字体减小1px"
        echo "   字体微调 +1        # 同加一号"
        echo "   字体微调 -1        # 同减一号"
        exit 1
        ;;
esac

# 确保字体不会太小
if [ $NEW_EDITOR -lt 10 ]; then
    echo "⚠️ 字体不能小于10px，设置为最小值"
    NEW_EDITOR=10
    NEW_TERMINAL=9
    NEW_DEBUG=9
    NEW_MARKDOWN=10
fi

# 更新字体设置
sed -i '' "s/\"editor.fontSize\": [0-9]*/\"editor.fontSize\": $NEW_EDITOR/" "$VSCODE_SETTINGS"
sed -i '' "s/\"terminal.integrated.fontSize\": [0-9]*/\"terminal.integrated.fontSize\": $NEW_TERMINAL/" "$VSCODE_SETTINGS"
sed -i '' "s/\"debug.console.fontSize\": [0-9]*/\"debug.console.fontSize\": $NEW_DEBUG/" "$VSCODE_SETTINGS"
sed -i '' "s/\"markdown.preview.fontSize\": [0-9]*/\"markdown.preview.fontSize\": $NEW_MARKDOWN/" "$VSCODE_SETTINGS"

echo ""
echo "✅ 字体已调整！"
echo ""
echo "📏 新的字体大小:"
echo "   编辑器: ${CURRENT_EDITOR}px → ${NEW_EDITOR}px"
echo "   终端: ${CURRENT_TERMINAL}px → ${NEW_TERMINAL}px"
echo "   调试控制台: ${CURRENT_DEBUG}px → ${NEW_DEBUG}px"
echo "   Markdown: ${CURRENT_MARKDOWN}px → ${NEW_MARKDOWN}px"
echo ""
echo "🔄 请重启 VS Code 以应用更改！"
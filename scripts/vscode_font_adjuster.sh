#!/bin/bash

# VS Code 字体调节器
echo "🔤 VS Code 字体调节器"
echo "=================="

case "$1" in
    "huge"|"超大")
        SIZE=20
        TERM_SIZE=18
        DEBUG_SIZE=17
        MARKDOWN_SIZE=19
        echo "🔍 设置超大字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    "large"|"大")
        SIZE=18
        TERM_SIZE=17
        DEBUG_SIZE=16
        MARKDOWN_SIZE=17
        echo "🔍 设置大字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    "medium"|"中")
        SIZE=14
        TERM_SIZE=13
        DEBUG_SIZE=12
        MARKDOWN_SIZE=14
        echo "🔍 设置中等字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    "small"|"小")
        SIZE=12
        TERM_SIZE=11
        DEBUG_SIZE=10
        MARKDOWN_SIZE=12
        echo "🔍 设置小字体: 编辑器${SIZE}px, 终端${TERM_SIZE}px"
        ;;
    *)
        echo "用法: 字体调节 [huge|large|medium|small] 或 [超大|大|中|小]"
        echo "当前设置:"
        grep -E "(fontSize|zoomLevel)" ~/.vscode/settings.json 2>/dev/null || echo "未找到字体设置"
        exit 1
        ;;
esac

# 更新设置文件中的字体大小
sed -i '' "s/\"editor.fontSize\": [0-9]*/\"editor.fontSize\": $SIZE/" ~/.vscode/settings.json
sed -i '' "s/\"terminal.integrated.fontSize\": [0-9]*/\"terminal.integrated.fontSize\": $TERM_SIZE/" ~/.vscode/settings.json
sed -i '' "s/\"debug.console.fontSize\": [0-9]*/\"debug.console.fontSize\": $DEBUG_SIZE/" ~/.vscode/settings.json
sed -i '' "s/\"markdown.preview.fontSize\": [0-9]*/\"markdown.preview.fontSize\": $MARKDOWN_SIZE/" ~/.vscode/settings.json

echo "✅ 字体大小已更新！请重启 VS Code 以应用更改。"
echo ""
echo "📏 新设置:"
echo "   编辑器: ${SIZE}px"
echo "   终端: ${TERM_SIZE}px"
echo "   调试控制台: ${DEBUG_SIZE}px"
echo "   Markdown预览: ${MARKDOWN_SIZE}px"

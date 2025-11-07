#!/bin/bash

# 🔍 VS Code 字体不生效诊断工具
# ===============================

echo "🔍 VS Code 字体不生效诊断工具"
echo "============================"
echo ""

echo "📋 正在检查可能的原因..."
echo ""

# 1. 检查设置文件
echo "1️⃣ 检查设置文件"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

VSCODE_SETTINGS="/Users/maiyou001/.vscode/settings.json"
USER_SETTINGS="$HOME/Library/Application Support/Code/User/settings.json"

echo "📁 工作区设置 ($VSCODE_SETTINGS):"
if [ -f "$VSCODE_SETTINGS" ]; then
    echo "   ✅ 文件存在"
    echo "   📏 字体设置:"
    grep -E "(fontSize|fontFamily|zoomLevel)" "$VSCODE_SETTINGS" | sed 's/^/      /'
else
    echo "   ❌ 工作区设置文件不存在"
fi

echo ""
echo "📁 用户设置 ($USER_SETTINGS):"
if [ -f "$USER_SETTINGS" ]; then
    echo "   ✅ 文件存在"
    if grep -q "fontSize" "$USER_SETTINGS"; then
        echo "   ⚠️  用户设置中也有字体配置，可能产生冲突:"
        grep -E "(fontSize|fontFamily|zoomLevel)" "$USER_SETTINGS" | sed 's/^/      /'
    else
        echo "   ✅ 用户设置中没有字体冲突"
    fi
else
    echo "   ℹ️  用户设置文件不存在（正常）"
fi

echo ""
echo "2️⃣ 检查 VS Code 进程"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查VS Code是否在运行
VSCODE_PROCESSES=$(ps aux | grep -i "visual studio code" | grep -v grep | wc -l)
echo "🔍 VS Code 进程数量: $VSCODE_PROCESSES"

if [ $VSCODE_PROCESSES -gt 0 ]; then
    echo "   ⚠️  VS Code 正在运行中"
    echo "   💡 字体设置需要重启 VS Code 才能生效"
    echo ""
    echo "   🔄 请执行以下步骤:"
    echo "      1. 完全退出 VS Code (Cmd + Q)"
    echo "      2. 等待几秒钟"
    echo "      3. 重新打开 VS Code"
else
    echo "   ✅ VS Code 已关闭"
fi

echo ""
echo "3️⃣ 检查设置优先级"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📊 VS Code 设置优先级 (从高到低):"
echo "   1. 工作区设置 (.vscode/settings.json)"
echo "   2. 用户设置 (~/Library/Application Support/Code/User/settings.json)"
echo "   3. 默认设置"
echo ""

# 检查哪个设置会生效
if [ -f "$VSCODE_SETTINGS" ] && grep -q "fontSize" "$VSCODE_SETTINGS"; then
    echo "   🎯 当前生效的应该是工作区设置"
    EFFECTIVE_SIZE=$(grep "editor.fontSize" "$VSCODE_SETTINGS" | grep -o '[0-9]\+')
    echo "   📏 编辑器字体大小: ${EFFECTIVE_SIZE}px"
elif [ -f "$USER_SETTINGS" ] && grep -q "fontSize" "$USER_SETTINGS"; then
    echo "   🎯 当前生效的应该是用户设置"
    EFFECTIVE_SIZE=$(grep "editor.fontSize" "$USER_SETTINGS" | grep -o '[0-9]\+' | head -1)
    echo "   📏 编辑器字体大小: ${EFFECTIVE_SIZE}px"
else
    echo "   ❓ 使用默认字体设置"
    EFFECTIVE_SIZE="14"
fi

echo ""
echo "4️⃣ 常见问题诊断"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔍 可能的问题原因:"
echo ""

# 问题1: 没有重启
echo "❓ 问题1: 没有重启 VS Code"
echo "   💡 解决方案: 完全退出并重启 VS Code"
echo ""

# 问题2: 设置文件语法错误
echo "❓ 问题2: JSON 语法错误"
echo "   🔍 检查设置文件语法..."
if python3 -c "import json; json.load(open('$VSCODE_SETTINGS'))" 2>/dev/null; then
    echo "   ✅ 设置文件语法正确"
else
    echo "   ❌ 设置文件可能有语法错误"
    echo "   💡 解决方案: 检查并修复 JSON 语法"
fi
echo ""

# 问题3: 缓存问题
echo "❓ 问题3: VS Code 缓存问题"
echo "   💡 解决方案: 清除 VS Code 缓存"
echo ""

# 问题4: 扩展冲突
echo "❓ 问题4: 扩展冲突"
echo "   💡 解决方案: 禁用字体相关扩展"
echo ""

echo "5️⃣ 快速修复方案"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🚀 立即尝试以下解决方案:"
echo ""

read -p "是否要强制重启 VS Code？(y/n): " restart_choice
if [[ $restart_choice == "y" || $restart_choice == "Y" ]]; then
    echo "🔄 正在强制退出 VS Code..."
    pkill -f "Visual Studio Code" 2>/dev/null
    sleep 2
    echo "✅ VS Code 已退出"
    echo ""
    echo "⏳ 等待3秒后重新启动..."
    sleep 3
    echo "🚀 正在启动 VS Code..."
    open -a "Visual Studio Code"
    echo "✅ VS Code 已重新启动"
    echo ""
    echo "💡 请检查字体是否已生效"
    exit 0
fi

echo ""
read -p "是否要验证当前字体设置？(y/n): " verify_choice
if [[ $verify_choice == "y" || $verify_choice == "Y" ]]; then
    echo "📏 当前有效字体设置:"
    echo "   编辑器: ${EFFECTIVE_SIZE}px"
    echo ""
    echo "🎯 如果 VS Code 中的字体与此不符，说明:"
    echo "   1. VS Code 需要重启"
    echo "   2. 或者有其他配置冲突"
    echo "   3. 或者存在缓存问题"
fi

echo ""
echo "💡 额外提示:"
echo "   • 某些扩展可能会影响字体显示"
echo "   • 检查 VS Code 的缩放级别 (Cmd + 0 重置)"
echo "   • 确保在正确的工作区中修改了设置"
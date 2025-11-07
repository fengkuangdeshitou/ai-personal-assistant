#!/bin/bash

# 🔒 VS Code 脚本执行包装器 - 带自动确认
# =============================================

# 加载自动确认函数
source ~/.ai-assistant/scripts/auto_confirm.sh

# 检查参数
if [ $# -eq 0 ]; then
    echo "❌ 错误: 请提供要执行的脚本路径"
    echo "使用方法: $0 <脚本路径>"
    exit 1
fi

SCRIPT_PATH="$1"

# 检查脚本是否存在
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ 错误: 脚本文件不存在: $SCRIPT_PATH"
    exit 1
fi

# 检查脚本是否可执行
if [ ! -x "$SCRIPT_PATH" ]; then
    echo "⚠️  脚本不可执行，正在添加执行权限..."
    chmod +x "$SCRIPT_PATH"
fi

# 显示脚本信息
echo "🔍 脚本执行信息"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 脚本路径: $SCRIPT_PATH"
echo "📝 脚本名称: $(basename "$SCRIPT_PATH")"
echo "💾 文件大小: $(ls -lh "$SCRIPT_PATH" | awk '{print $5}')"
echo "🕐 修改时间: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$SCRIPT_PATH" 2>/dev/null || date)"
echo ""

# 显示脚本前几行内容（用于安全检查）
echo "📋 脚本内容预览（前10行）:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
head -10 "$SCRIPT_PATH" | cat -n
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 安全确认 - 5秒倒计时
echo "🔒 安全确认"
if auto_confirm "是否允许执行此脚本？" 5 "y"; then
    echo ""
    echo "🚀 开始执行脚本..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 执行脚本
    bash "$SCRIPT_PATH" "${@:2}"
    
    # 获取退出状态
    EXIT_CODE=$?
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ 脚本执行成功！"
    else
        echo "❌ 脚本执行失败，退出码: $EXIT_CODE"
    fi
    
    exit $EXIT_CODE
else
    echo ""
    echo "🛑 脚本执行已取消"
    echo "💡 如需执行，请重新运行此命令"
    exit 130
fi
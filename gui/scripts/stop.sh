#!/bin/bash

# AI 助理 - 停止所有服务脚本

echo "🛑 正在停止 AI 助理服务..."

# 停止后端服务（端口 5178, 5179）
if lsof -ti :5178 > /dev/null 2>&1; then
    pkill -f '^node server\.js$'
    echo "✅ 后端服务已停止（端口 5178, 5179）"
else
    echo "⚠️  后端服务未运行"
fi

# 停止前端静态服务（端口 4000）
if lsof -ti :4000 > /dev/null 2>&1; then
    pkill -f 'serve.*build'
    echo "✅ 前端服务已停止（端口 4000）"
else
    echo "⚠️  前端服务未运行"
fi

echo "✨ 所有服务已停止"

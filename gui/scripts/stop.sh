#!/bin/bash

# AI 助理 - 停止后端服务脚本

if lsof -ti :5178 > /dev/null 2>&1; then
    lsof -ti :5178 | xargs kill
    echo "✅ 后端服务已停止"
else
    echo "⚠️  后端服务未运行"
fi

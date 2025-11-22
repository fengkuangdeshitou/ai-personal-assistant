#!/bin/bash

# AI Assistant GUI Launcher
# 检查项目目录是否存在

PROJECT_PATH="/Users/maiyou001/.ai-assistant/gui"

if [ ! -d "$PROJECT_PATH" ]; then
    echo "错误: AI助理项目目录不存在: $PROJECT_PATH"
    exit 1
fi

# 启动AI助理
echo "启动AI助理..."
exec "$PROJECT_PATH/AI助理.command"
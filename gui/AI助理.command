#!/bin/bash

# AI 助理 - 主启动入口
# 重定向到正确的脚本位置

# 获取脚本所在目录的上级目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="$SCRIPT_DIR/scripts/AI助理.command"

# 检查目标脚本是否存在
if [ ! -f "$TARGET_SCRIPT" ]; then
    echo "❌ 错误：找不到启动脚本 $TARGET_SCRIPT"
    exit 1
fi

# 执行正确的脚本
exec "$TARGET_SCRIPT" "$@"
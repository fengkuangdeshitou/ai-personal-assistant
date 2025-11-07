#!/bin/bash
# AI 主动助理
ASSISTANT_DIR="$HOME/.ai-assistant"
GREETING_FILE="$ASSISTANT_DIR/last_greeting.txt"
current_hour=$(date +%H)
current_date=$(date +%Y-%m-%d)

if [ -f "$GREETING_FILE" ]; then
    last_greeting=$(cat "$GREETING_FILE")
    if [ "$last_greeting" == "$current_date" ]; then
        exit 0
    fi
fi

if [ $current_hour -lt 12 ]; then
    greeting="☀️ 早上好！准备开始新的一天了吗？"
elif [ $current_hour -lt 18 ]; then
    greeting="🌆 下午好！今天的开发进展如何？"
else
    greeting="🌃 晚上好！还有什么需要处理的吗？"
fi

osascript -e "display notification \"$greeting 输入 'ai' 或 '助理' 启动助理\" with title \"🤖 AI 私人助理\" sound name \"Glass\""
echo "$current_date" > "$GREETING_FILE"

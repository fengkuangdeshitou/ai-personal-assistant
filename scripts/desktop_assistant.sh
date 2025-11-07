#!/bin/bash
current_hour=$(date +%H)
title=""
msg=""
case $current_hour in
  9|10) title="☀️ 早安" msg="准备好今天的开发任务了吗？" ;;
  12) title="�� 午餐时间" msg="记得吃午饭哦～" ;;
  15) title="☕ 下午茶" msg="来杯咖啡继续战斗？" ;;
  18) title="🌆 下班啦" msg="别忘了提交代码～" ;;
  21) title="🌙 该休息了" msg="注意休息哦！" ;;
  *) exit 0 ;;
esac
response=$(osascript -e "button returned of (display dialog \"$msg\" with title \"$title\" buttons {\"稍后\", \"打开助理\"} default button \"打开助理\")")
if [ "$response" == "打开助理" ]; then
  osascript -e 'tell application "Terminal" to do script "ai"'
fi

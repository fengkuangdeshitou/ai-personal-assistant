#!/bin/bash
current_hour=$(date +%H)
title=""
msg=""

case $current_hour in
  9|10) title="☀️ 早安" msg="准备好今天的开发任务了吗？" ;;
  11) title="☀️ 上午好" msg="工作进展顺利吗？" ;;
  12) title="🍱 午餐时间" msg="记得吃午饭哦～" ;;
  13|14) title="🌤️ 下午好" msg="午休后继续加油！" ;;
  15) title="☕ 下午茶" msg="来杯咖啡继续战斗？" ;;
  16|17) title="🌆 傍晚了" msg="今天的任务完成得怎么样？" ;;
  18) title="🌆 下班啦" msg="别忘了提交代码～" ;;
  19|20) title="🌃 晚上好" msg="还在努力工作吗？" ;;
  21|22) title="🌙 该休息了" msg="注意休息哦！" ;;
  *) title="🤖 AI 助理" msg="随时为您服务！需要帮助吗？" ;;
esac

response=$(osascript -e "button returned of (display dialog \"$msg\" with title \"$title\" buttons {\"稍后\", \"打开助理\"} default button \"打开助理\")")

if [ "$response" == "打开助理" ]; then
  osascript -e 'tell application "Terminal" to do script "ai"'
fi

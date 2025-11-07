#!/bin/bash
# 获取今日工作统计

# 获取今日日期
TODAY=$(date +%Y-%m-%d)

# Git 统计
cd ~/Project 2>/dev/null || cd ~
GIT_COMMITS=$(git log --all --since="$TODAY 00:00" --oneline 2>/dev/null | wc -l | tr -d ' ')
GIT_CHANGES=$(git diff --stat 2>/dev/null | tail -1 | grep -o '[0-9]* insertion' | grep -o '[0-9]*')
GIT_DELETIONS=$(git diff --stat 2>/dev/null | tail -1 | grep -o '[0-9]* deletion' | grep -o '[0-9]*')

# 默认值
GIT_COMMITS=${GIT_COMMITS:-0}
GIT_CHANGES=${GIT_CHANGES:-0}
GIT_DELETIONS=${GIT_DELETIONS:-0}

# 输出 JSON
cat << JSON
{
  "commits": $GIT_COMMITS,
  "insertions": $GIT_CHANGES,
  "deletions": $GIT_DELETIONS,
  "date": "$TODAY",
  "time": "$(date +%H:%M:%S)"
}
JSON

#!/bin/bash

# 🔔 智能提醒和日程管理
# =====================

source ~/.ai-assistant/config.sh

# 提醒配置
REMINDERS_FILE="$HOME/.ai-assistant/reminders.json"
DAILY_LOG="$HOME/.ai-assistant/logs/daily_$(date +%Y%m%d).log"

# 确保日志目录存在
mkdir -p "$(dirname "$DAILY_LOG")"

# 初始化提醒文件
if [ ! -f "$REMINDERS_FILE" ]; then
    cat > "$REMINDERS_FILE" << 'EOF'
{
  "dailyReminders": [
    {
      "time": "09:00",
      "message": "🌅 早上好！开始新的一天，检查今日任务",
      "type": "greeting"
    },
    {
      "time": "10:00",
      "message": "📥 定时同步：检查项目更新和邮件",
      "type": "sync"
    },
    {
      "time": "12:00", 
      "message": "🍽️ 午餐时间！记得休息一下",
      "type": "break"
    },
    {
      "time": "14:00",
      "message": "💡 下午提醒：回顾上午进度，规划下午任务",
      "type": "review"
    },
    {
      "time": "17:00",
      "message": "📊 日程总结：准备今日工作总结",
      "type": "summary"
    },
    {
      "time": "18:00",
      "message": "🏠 下班提醒：备份重要文件，计划明日任务",
      "type": "end"
    }
  ],
  "weeklyReminders": [
    {
      "day": "monday",
      "time": "09:30",
      "message": "📅 周一计划：设置本周目标和优先级",
      "type": "planning"
    },
    {
      "day": "friday",
      "time": "16:00", 
      "message": "🎯 周五回顾：总结本周成果，规划下周",
      "type": "review"
    }
  ]
}
EOF
fi

# 显示当前时间和提醒
show_current_status() {
    local current_time=$(date +%H:%M)
    local current_date=$(date +%Y-%m-%d)
    local current_day=$(date +%A | tr '[:upper:]' '[:lower:]')
    
    echo "🕐 当前时间: $current_time"
    echo "📅 今天日期: $current_date"
    
    # 检查是否有当前时间的提醒
    if command -v jq &> /dev/null; then
        local reminder_message=$(jq -r --arg time "$current_time" '.dailyReminders[] | select(.time == $time) | .message' "$REMINDERS_FILE" 2>/dev/null)
        
        if [ -n "$reminder_message" ] && [ "$reminder_message" != "null" ]; then
            echo ""
            echo "🔔 当前提醒:"
            echo "   $reminder_message"
            
            # 记录到日志
            echo "$(date '+%H:%M:%S') - REMINDER: $reminder_message" >> "$DAILY_LOG"
            
            # 发送系统通知 (macOS)
            if [[ "$OSTYPE" == "darwin"* ]]; then
                osascript -e "display notification \"$reminder_message\" with title \"AI 助理提醒\""
            fi
        fi
    fi
}

# 显示今日任务概览
show_daily_overview() {
    echo ""
    echo "📋 今日任务概览"
    echo "================"
    
    # 从配置文件获取今日提醒
    if command -v jq &> /dev/null; then
        echo "⏰ 今日提醒时间表:"
        jq -r '.dailyReminders[] | "   \(.time) - \(.message)"' "$REMINDERS_FILE" 2>/dev/null
    fi
    
    # 检查项目状态
    if [ -d "$PROJECT_BASE_DIR" ]; then
        echo ""
        echo "📁 项目快速状态:"
        
        cd "$PROJECT_BASE_DIR"
        local project_count=0
        local git_changes=0
        
        for dir in */; do
            if [ -d "$dir" ]; then
                ((project_count++))
                
                cd "$dir"
                if [ -d ".git" ] && ! git diff-index --quiet HEAD 2>/dev/null; then
                    ((git_changes++))
                fi
                cd ..
            fi
        done
        
        echo "   📊 总项目: $project_count 个"
        if [ $git_changes -gt 0 ]; then
            echo "   ⚠️  未提交更改: $git_changes 个项目"
        else
            echo "   ✅ Git 状态: 所有项目都已提交"
        fi
    fi
}

# 生成智能建议
generate_suggestions() {
    echo ""
    echo "💡 智能建议"
    echo "=========="
    
    local suggestions=()
    local current_hour=$(date +%H)
    
    # 根据时间生成建议
    if [ $current_hour -lt 10 ]; then
        suggestions+=("☀️ 早晨是最佳的编程时间，考虑处理复杂任务")
        suggestions+=("📧 检查和回复重要邮件")
    elif [ $current_hour -lt 14 ]; then
        suggestions+=("🚀 上午精力充沛，适合创造性工作")
        suggestions+=("📝 更新项目文档和注释")
    elif [ $current_hour -lt 18 ]; then
        suggestions+=("🔍 下午适合代码审查和测试")
        suggestions+=("🔧 处理 bug 修复和优化")
    else
        suggestions+=("📊 整理今日工作成果")
        suggestions+=("💾 备份重要文件和提交代码")
    fi
    
    # 检查项目相关建议
    if [ -d "$PROJECT_BASE_DIR" ]; then
        cd "$PROJECT_BASE_DIR"
        
        # 检查是否有未提交的更改
        for dir in */; do
            if [ -d "$dir" ]; then
                cd "$dir"
                if [ -d ".git" ] && ! git diff-index --quiet HEAD 2>/dev/null; then
                    suggestions+=("📤 项目 '$dir' 有未提交更改，建议及时提交")
                    break
                fi
                cd ..
            fi
        done
        
        # 检查依赖更新
        for dir in */; do
            if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
                suggestions+=("📦 检查 Node.js 项目的依赖更新")
                break
            fi
        done
    fi
    
    # 显示建议
    for i in "${!suggestions[@]}"; do
        echo "   $((i+1)). ${suggestions[i]}"
    done
}

# 设置定时提醒
setup_reminders() {
    echo "⚙️ 设置定时提醒"
    echo "================"
    
    # 创建 launchd 配置文件
    local plist_file="$HOME/Library/LaunchAgents/com.ai-assistant.reminders.plist"
    
    cat > "$plist_file" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ai-assistant.reminders</string>
    <key>ProgramArguments</key>
    <array>
        <string>bash</string>
        <string>$HOME/.ai-assistant/scripts/smart_reminders.sh</string>
        <string>--check</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

    # 加载服务
    launchctl unload "$plist_file" 2>/dev/null || true
    launchctl load "$plist_file"
    
    echo "✅ 定时提醒服务已设置 (每15分钟检查一次)"
}

# 主函数
main() {
    case "${1:-}" in
        --check)
            # 静默检查模式 (由定时任务调用)
            show_current_status > /dev/null 2>&1
            ;;
        --setup)
            setup_reminders
            ;;
        --status)
            show_current_status
            ;;
        --overview)
            show_daily_overview
            ;;
        --suggestions)
            generate_suggestions
            ;;
        *)
            # 默认显示完整信息
            echo "🤖 AI 助理 - 智能提醒系统"
            echo "============================="
            
            show_current_status
            show_daily_overview
            generate_suggestions
            
            echo ""
            echo "📖 使用说明:"
            echo "   $0 --check      # 检查当前提醒"
            echo "   $0 --setup      # 设置定时提醒"
            echo "   $0 --status     # 显示当前状态"
            echo "   $0 --overview   # 显示今日概览"
            echo "   $0 --suggestions # 显示智能建议"
            ;;
    esac
}

# 运行主函数
main "$@"
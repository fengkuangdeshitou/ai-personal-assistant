#!/bin/bash

# 🎯 VS Code 脚本执行助手
# ========================
# 专门用于处理 VS Code 的"运行 zsh 命令？"对话框
# 通过智能脚本执行器提供5秒自动确认功能

# 检查是否有参数传入
if [ $# -gt 0 ]; then
    echo "🚀 直接执行脚本: $1"
    bash ~/.ai-assistant/scripts/smart_execute.sh "$1"
    exit 0
fi

# 加载自动确认函数
source ~/.ai-assistant/scripts/auto_confirm.sh

# 显示说明
echo "📋 VS Code 脚本执行助手"
echo "======================"
echo ""
echo "💡 解决方案："
echo "   当 VS Code 询问'运行 zsh 命令？'时："
echo "   1. 点击 '允许' 或等待5秒自动允许"
echo "   2. 使用智能执行器获得更好的体验"
echo ""

# 检查当前目录是否有脚本
echo "🔍 检测当前目录中的可执行脚本："
SCRIPTS_FOUND=()

for file in *.sh; do
    if [ -f "$file" ]; then
        SCRIPTS_FOUND+=("$file")
    fi
done

# AI 助理脚本
AI_SCRIPTS=(
    "~/.ai-assistant/scripts/ai-assistant.sh"
    "~/.ai-assistant/scripts/auto_confirm_demo.sh"
    "~/.ai-assistant/scripts/chinese_demo.sh"
    "~/.ai-assistant/scripts/env_check.sh"
    "~/.ai-assistant/scripts/project_status.sh"
    "~/.ai-assistant/scripts/backup_projects.sh"
)

echo ""
if [ ${#SCRIPTS_FOUND[@]} -gt 0 ]; then
    echo "📁 当前目录脚本:"
    for i in "${!SCRIPTS_FOUND[@]}"; do
        echo "   $((i+1)). ${SCRIPTS_FOUND[i]}"
    done
else
    echo "📁 当前目录没有找到 .sh 脚本"
fi

echo ""
echo "🤖 AI 助理脚本:"
for i in "${!AI_SCRIPTS[@]}"; do
    script_name=$(basename "${AI_SCRIPTS[i]}")
    echo "   $((i+1)). $script_name"
done

echo ""
echo "🚀 推荐使用方法："
echo ""
echo "方法1: 使用智能执行器 (推荐)"
echo "   智能执行 /path/to/script.sh"
echo "   # 提供安全分析 + 5秒自动确认"
echo ""
echo "方法2: 直接在终端运行"
echo "   bash /path/to/script.sh"
echo "   # VS Code 会询问确认，点击'允许'即可"
echo ""
echo "方法3: 使用中文命令"
echo "   执行脚本 /path/to/script.sh"
echo "   # 同智能执行器"
echo ""

# 交互式选择
echo "🎯 快速执行选项："

if auto_confirm "是否要快速执行一个脚本？" 5 "y"; then
    echo ""
    echo "请选择要执行的脚本类型："
    echo "1. AI 助理演示脚本"
    echo "2. 当前目录脚本"
    echo "3. 自定义脚本路径"
    echo ""
    
    auto_select "选择脚本类型:" "AI 助理演示脚本" "当前目录脚本" "自定义脚本路径" 5 1
    choice=$?
    
    case $choice in
        0) # AI 助理脚本
            echo ""
            echo "AI 助理脚本列表:"
            for i in "${!AI_SCRIPTS[@]}"; do
                script_name=$(basename "${AI_SCRIPTS[i]}")
                echo "  $((i+1)). $script_name"
            done
            echo ""
            
            auto_select "选择 AI 助理脚本:" "auto_confirm_demo.sh" "chinese_demo.sh" "env_check.sh" "project_status.sh" 5 1
            ai_choice=$?
            
            selected_script="${AI_SCRIPTS[ai_choice]}"
            # 展开路径
            selected_script="${selected_script/#\~/$HOME}"
            
            echo ""
            echo "🚀 执行脚本: $(basename "$selected_script")"
            bash ~/.ai-assistant/scripts/smart_execute.sh "$selected_script"
            ;;
            
        1) # 当前目录脚本
            if [ ${#SCRIPTS_FOUND[@]} -eq 0 ]; then
                echo "❌ 当前目录没有找到脚本文件"
                exit 1
            fi
            
            echo ""
            echo "当前目录脚本:"
            options_array=("${SCRIPTS_FOUND[@]}")
            
            auto_select "选择当前目录脚本:" "${options_array[@]}" 5 1
            local_choice=$?
            
            selected_script="${SCRIPTS_FOUND[local_choice]}"
            echo ""
            echo "🚀 执行脚本: $selected_script"
            bash ~/.ai-assistant/scripts/smart_execute.sh "./$selected_script"
            ;;
            
        2) # 自定义路径
            echo ""
            read -p "请输入脚本完整路径: " custom_path
            
            if [ -f "$custom_path" ]; then
                echo "🚀 执行脚本: $custom_path"
                bash ~/.ai-assistant/scripts/smart_execute.sh "$custom_path"
            else
                echo "❌ 脚本文件不存在: $custom_path"
                exit 1
            fi
            ;;
    esac
else
    echo ""
    echo "📚 使用提示:"
    echo ""
    echo "如需在 VS Code 中执行脚本时避免每次手动确认:"
    echo "1. 使用 '智能执行' 命令"
    echo "2. 或者在 VS Code 设置中配置信任工作区"
    echo ""
    echo "💡 常用命令:"
    echo "   智能执行 ~/.ai-assistant/scripts/auto_confirm_demo.sh"
    echo "   执行脚本 /path/to/your/script.sh"
fi

echo ""
echo "✨ VS Code 脚本执行助手完成！"
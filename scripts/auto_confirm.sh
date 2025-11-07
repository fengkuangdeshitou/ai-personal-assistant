#!/bin/bash

# 🕐 自动确认倒计时函数
# =====================

# 带倒计时的自动确认函数
auto_confirm() {
    local message="$1"
    local seconds="${2:-5}"
    local default_choice="${3:-y}"
    
    echo "$message"
    echo -n "倒计时 $seconds 秒，默认选择 [$default_choice] (按 y/n 可立即选择): "
    
    # 倒计时
    for (( i=$seconds; i>0; i-- )); do
        printf "\r倒计时 %d 秒，默认选择 [%s] (按 y/n 可立即选择): " $i "$default_choice"
        
        # 检查用户是否有输入
        if read -t 1 -n 1 user_input 2>/dev/null; then
            echo ""
            case $user_input in
                [Yy]* ) 
                    echo "✅ 用户选择: 是"
                    return 0 
                    ;;
                [Nn]* ) 
                    echo "❌ 用户选择: 否"
                    return 1 
                    ;;
                * ) 
                    echo ""
                    echo "请输入 y 或 n"
                    read -p "$message (y/n): " -n 1 -r
                    echo ""
                    [[ $REPLY =~ ^[Yy]$ ]] && return 0 || return 1
                    ;;
            esac
        fi
    done
    
    # 倒计时结束，自动选择默认选项
    printf "\r⏰ 时间到！自动选择: %s                                           \n" "$default_choice"
    
    [[ $default_choice =~ ^[Yy]$ ]] && return 0 || return 1
}

# 带倒计时的多选确认函数
auto_select() {
    local message="$1"
    local options=("${@:2:$#-2}")
    local seconds="${@: -2:1}"
    local default_choice="${@: -1}"
    
    echo "$message"
    for i in "${!options[@]}"; do
        echo "  $((i+1)). ${options[i]}"
    done
    echo ""
    
    # 倒计时
    for (( i=$seconds; i>0; i-- )); do
        printf "\r倒计时 %d 秒，默认选择 [%d] (请输入 1-%d): " $i $default_choice ${#options[@]}
        
        # 检查用户是否有输入
        if read -t 1 -n 1 user_input 2>/dev/null; then
            echo ""
            if [[ $user_input =~ ^[0-9]$ ]] && [ $user_input -ge 1 ] && [ $user_input -le ${#options[@]} ]; then
                echo "✅ 用户选择: $user_input. ${options[$((user_input-1))]}"
                return $((user_input-1))
            else
                echo "无效选择，请重新输入"
                read -p "请选择 (1-${#options[@]}): " user_input
                if [[ $user_input =~ ^[0-9]+$ ]] && [ $user_input -ge 1 ] && [ $user_input -le ${#options[@]} ]; then
                    echo "✅ 用户选择: $user_input. ${options[$((user_input-1))]}"
                    return $((user_input-1))
                fi
            fi
        fi
    done
    
    # 倒计时结束，自动选择默认选项
    printf "\r⏰ 时间到！自动选择: %d. %s                                    \n" $default_choice "${options[$((default_choice-1))]}"
    
    return $((default_choice-1))
}

# 智能等待函数（显示进度条）
smart_wait() {
    local message="$1"
    local seconds="${2:-5}"
    
    echo "$message"
    echo -n "进度: "
    
    for (( i=0; i<=$seconds; i++ )); do
        # 计算百分比
        local percent=$((i * 100 / seconds))
        local filled=$((percent / 5))
        
        # 清除当前行
        echo -ne "\r进度: ["
        
        # 绘制进度条
        for (( j=0; j<20; j++ )); do
            if [ $j -lt $filled ]; then
                echo -n "█"
            else
                echo -n "░"
            fi
        done
        
        echo -n "] ${percent}%"
        
        sleep 1
    done
    
    echo ""
    echo "✅ 完成！"
}

# 导出函数供其他脚本使用
export -f auto_confirm
export -f auto_select  
export -f smart_wait
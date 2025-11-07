#!/bin/bash

# 🎯 智能脚本执行器 - VS Code 集成版
# ====================================

# 加载自动确认函数
source ~/.ai-assistant/scripts/auto_confirm.sh

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 显示使用帮助
show_help() {
    echo -e "${PURPLE}🎯 智能脚本执行器${NC}"
    echo "===================="
    echo ""
    echo "用法:"
    echo "  $0 <脚本路径> [参数...]"
    echo ""
    echo "功能:"
    echo "  • 5秒倒计时自动确认执行"
    echo "  • 脚本安全性预览"
    echo "  • 自动权限检查和修复"
    echo "  • 执行结果监控"
    echo ""
    echo "示例:"
    echo "  $0 ~/.ai-assistant/scripts/auto_confirm_demo.sh"
    echo "  执行脚本 /path/to/script.sh"
    echo "  安全执行 ./local_script.sh"
}

# 分析脚本安全性
analyze_script_safety() {
    local script_path="$1"
    local safety_score=100
    local warnings=()
    
    echo -e "${BLUE}🔍 安全性分析${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 检查危险命令
    local dangerous_commands=("rm -rf" "sudo rm" "dd if=" "mkfs" "fdisk" "format" "> /dev/")
    
    for cmd in "${dangerous_commands[@]}"; do
        if grep -q "$cmd" "$script_path" 2>/dev/null; then
            warnings+=("⚠️ 发现潜在危险命令: $cmd")
            ((safety_score -= 20))
        fi
    done
    
    # 检查网络操作
    if grep -qE "(curl|wget|nc|telnet)" "$script_path" 2>/dev/null; then
        warnings+=("🌐 脚本包含网络操作")
        ((safety_score -= 5))
    fi
    
    # 检查系统修改
    if grep -qE "(chmod|chown|usermod|passwd)" "$script_path" 2>/dev/null; then
        warnings+=("🔧 脚本会修改系统权限")
        ((safety_score -= 10))
    fi
    
    # 检查文件操作
    if grep -qE "(cp|mv|ln)" "$script_path" 2>/dev/null; then
        warnings+=("📁 脚本包含文件操作")
        ((safety_score -= 2))
    fi
    
    # 显示安全评分
    if [ $safety_score -ge 80 ]; then
        echo -e "安全评分: ${GREEN}$safety_score/100 (安全)${NC}"
    elif [ $safety_score -ge 60 ]; then
        echo -e "安全评分: ${YELLOW}$safety_score/100 (需注意)${NC}"
    else
        echo -e "安全评分: ${RED}$safety_score/100 (高风险)${NC}"
    fi
    
    # 显示警告
    if [ ${#warnings[@]} -gt 0 ]; then
        echo ""
        echo "发现的问题:"
        for warning in "${warnings[@]}"; do
            echo "  $warning"
        done
    else
        echo -e "${GREEN}✅ 未发现明显安全问题${NC}"
    fi
    
    echo ""
    return $safety_score
}

# 主函数
main() {
    # 检查参数
    if [ $# -eq 0 ]; then
        show_help
        exit 1
    fi
    
    local script_path="$1"
    shift
    
    # 处理相对路径
    if [[ ! "$script_path" =~ ^/ ]]; then
        script_path="$(pwd)/$script_path"
    fi
    
    # 检查脚本是否存在
    if [ ! -f "$script_path" ]; then
        echo -e "${RED}❌ 错误: 脚本文件不存在: $script_path${NC}"
        exit 1
    fi
    
    echo -e "${PURPLE}🎯 AI 助理智能脚本执行器${NC}"
    echo "================================="
    echo ""
    
    # 显示脚本信息
    echo -e "${CYAN}📋 脚本信息${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📁 完整路径: $script_path"
    echo "📝 脚本名称: $(basename "$script_path")"
    echo "💾 文件大小: $(ls -lh "$script_path" | awk '{print $5}')"
    echo "🕐 修改时间: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$script_path" 2>/dev/null || date)"
    
    # 检查执行权限
    if [ ! -x "$script_path" ]; then
        echo -e "${YELLOW}⚠️ 脚本不可执行${NC}"
        if auto_confirm "是否添加执行权限？" 3 "y"; then
            chmod +x "$script_path"
            echo -e "${GREEN}✅ 已添加执行权限${NC}"
        else
            echo -e "${RED}❌ 无法执行没有权限的脚本${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ 脚本可执行${NC}"
    fi
    
    echo ""
    
    # 安全性分析
    analyze_script_safety "$script_path"
    
    # 显示脚本内容预览
    echo -e "${CYAN}📖 内容预览 (前15行)${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    head -15 "$script_path" | nl -ba
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # 最终确认 - 5秒倒计时
    echo -e "${PURPLE}🔒 执行确认${NC}"
    if auto_confirm "确认执行此脚本？" 5 "y"; then
        echo ""
        echo -e "${GREEN}🚀 开始执行脚本...${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        # 记录开始时间
        start_time=$(date +%s)
        
        # 执行脚本
        bash "$script_path" "$@"
        
        # 获取退出状态和结束时间
        exit_code=$?
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "${CYAN}📊 执行结果${NC}"
        
        if [ $exit_code -eq 0 ]; then
            echo -e "${GREEN}✅ 脚本执行成功！${NC}"
        else
            echo -e "${RED}❌ 脚本执行失败，退出码: $exit_code${NC}"
        fi
        
        echo "⏱️  执行时间: ${duration}秒"
        echo "📅 完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
        
        exit $exit_code
    else
        echo ""
        echo -e "${YELLOW}🛑 脚本执行已取消${NC}"
        echo -e "${BLUE}💡 如需执行，请重新运行此命令${NC}"
        exit 130
    fi
}

# 执行主函数
main "$@"
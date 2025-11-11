#!/bin/bash

# AI 私人助理 - 一键卸载脚本
# 版本: v1.7.0

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

# 配置
INSTALL_DIR="$HOME/.ai-assistant"

echo -e "${RED}${BOLD}"
echo "╔═══════════════════════════════════════════╗"
echo "║   🗑️  AI 私人助理 - 一键卸载工具          ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# 停止运行的服务
stop_services() {
    echo -e "${BLUE}🛑 停止运行的服务...${NC}"

    # 停止 Node.js 进程
    NODE_PROCESSES=$(pgrep -f "node.*server.js" | head -5)
    if [ ! -z "$NODE_PROCESSES" ]; then
        echo -e "${YELLOW}发现运行中的 Node.js 服务，正在停止...${NC}"
        kill $NODE_PROCESSES 2>/dev/null
        sleep 2
        echo -e "${GREEN}✅ 服务已停止${NC}"
    else
        echo -e "${GREEN}✅ 没有发现运行中的服务${NC}"
    fi

    # 清理 LaunchAgent 服务
    if [ -d "$HOME/Library/LaunchAgents" ]; then
        AI_PLISTS=$(ls $HOME/Library/LaunchAgents/com.ai-assistant.*.plist 2>/dev/null)
        if [ ! -z "$AI_PLISTS" ]; then
            echo -e "${YELLOW}卸载 LaunchAgent 服务...${NC}"
            for plist in $AI_PLISTS; do
                launchctl unload "$plist" 2>/dev/null
            done
            echo -e "${GREEN}✅ LaunchAgent 服务已卸载${NC}"
        fi
    fi

    echo ""
}

# 清理Shell配置
clean_shell_config() {
    echo -e "${BLUE}🧹 清理 Shell 配置...${NC}"

    # 检测 Shell 类型
    if [ -n "$ZSH_VERSION" ]; then
        SHELL_RC="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        if [ -f "$HOME/.bash_profile" ]; then
            SHELL_RC="$HOME/.bash_profile"
        else
            SHELL_RC="$HOME/.bashrc"
        fi
    else
        echo -e "${YELLOW}⚠️  无法检测 Shell 类型，跳过配置清理${NC}"
        return
    fi

    # 检查并清理配置
    if [ -f "$SHELL_RC" ] && grep -q "# AI Assistant Aliases" "$SHELL_RC"; then
        echo -e "${YELLOW}发现 AI 助理配置，正在清理...${NC}"
        sed -i.bak '/# AI Assistant Aliases/,/# End AI Assistant Aliases/d' "$SHELL_RC"
        echo -e "${GREEN}✅ Shell 配置已清理${NC}"
    else
        echo -e "${GREEN}✅ 没有发现需要清理的配置${NC}"
    fi

    echo ""
}

# 删除文件
remove_files() {
    echo -e "${BLUE}🗑️  删除安装文件...${NC}"

    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}删除目录: $INSTALL_DIR${NC}"
        rm -rf "$INSTALL_DIR"
        echo -e "${GREEN}✅ 安装文件已删除${NC}"
    else
        echo -e "${GREEN}✅ 没有发现安装文件${NC}"
    fi

    # 删除 plist 文件
    if [ -d "$HOME/Library/LaunchAgents" ]; then
        PLIST_FILES=$(ls $HOME/Library/LaunchAgents/com.ai-assistant.*.plist 2>/dev/null)
        if [ ! -z "$PLIST_FILES" ]; then
            echo -e "${YELLOW}删除 LaunchAgent 配置文件...${NC}"
            rm -f $HOME/Library/LaunchAgents/com.ai-assistant.*.plist
            echo -e "${GREEN}✅ LaunchAgent 配置已删除${NC}"
        fi
    fi

    echo ""
}

# 验证卸载
verify_uninstallation() {
    echo -e "${BLUE}🔍 验证卸载...${NC}"

    # 检查目录
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}⚠️  安装目录仍存在: $INSTALL_DIR${NC}"
    else
        echo -e "${GREEN}✅ 安装目录已删除${NC}"
    fi

    # 检查进程
    NODE_PROCESSES=$(pgrep -f "node.*server.js" | wc -l)
    if [ "$NODE_PROCESSES" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  仍有 $NODE_PROCESSES 个 Node.js 进程运行${NC}"
    else
        echo -e "${GREEN}✅ 没有运行中的服务进程${NC}"
    fi

    # 检查别名
    if grep -q "alias ai=" "$HOME/.zshrc" 2>/dev/null || grep -q "alias ai=" "$HOME/.bash_profile" 2>/dev/null || grep -q "alias ai=" "$HOME/.bashrc" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  命令别名可能仍存在${NC}"
    else
        echo -e "${GREEN}✅ 命令别名已清理${NC}"
    fi

    echo ""
}

# 显示完成信息
show_completion() {
    echo -e "${GREEN}${BOLD}🎉 卸载完成！${NC}"
    echo ""
    echo -e "${BLUE}💡 提示:${NC}"
    echo "   • AI 私人助理已完全卸载"
    echo "   • 如需重新安装，请运行部署脚本"
    echo "   • 可能需要重启终端以使配置生效"
    echo ""
}

# 确认卸载
confirm_uninstallation() {
    echo -e "${YELLOW}⚠️  警告: 此操作将完全卸载 AI 私人助理${NC}"
    echo -e "${RED}   • 停止所有相关服务"
    echo "   • 删除所有配置文件"
    echo "   • 清理命令别名"
    echo "   • 删除安装目录 (~/.ai-assistant)${NC}"
    echo ""
    read -p "确定要继续卸载吗? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}取消卸载${NC}"
        exit 0
    fi
}

# 主函数
main() {
    confirm_uninstallation
    stop_services
    clean_shell_config
    remove_files
    verify_uninstallation
    show_completion
}

# 运行主函数
main "$@"
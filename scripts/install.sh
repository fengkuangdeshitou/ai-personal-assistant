#!/bin/bash

# AI 私人助理 - 安装脚本
# 配置命令行快捷方式

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}"
echo "╔═══════════════════════════════════════════╗"
echo "║   🚀 AI 私人助理 - 安装配置工具          ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# 检测当前 shell
detect_shell() {
    if [ -n "$ZSH_VERSION" ]; then
        echo "zsh"
    elif [ -n "$BASH_VERSION" ]; then
        echo "bash"
    else
        echo "unknown"
    fi
}

CURRENT_SHELL=$(detect_shell)
echo -e "${BLUE}🔍 检测到的 Shell:${NC} ${GREEN}$CURRENT_SHELL${NC}"
echo ""

# 确定配置文件
if [ "$CURRENT_SHELL" == "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ "$CURRENT_SHELL" == "bash" ]; then
    if [ -f "$HOME/.bash_profile" ]; then
        SHELL_RC="$HOME/.bash_profile"
    else
        SHELL_RC="$HOME/.bashrc"
    fi
else
    echo -e "${RED}❌ 不支持的 Shell 类型${NC}"
    echo -e "${YELLOW}💡 请手动添加配置到您的 shell 配置文件${NC}"
    exit 1
fi

echo -e "${BLUE}📝 配置文件:${NC} ${GREEN}$SHELL_RC${NC}"
echo ""

# 检查是否已经配置
if grep -q "# AI Assistant Aliases" "$SHELL_RC" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  检测到已有配置${NC}"
    read -p "是否要重新配置? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}取消配置${NC}"
        exit 0
    fi
    
    # 删除旧配置
    echo -e "${YELLOW}🗑️  删除旧配置...${NC}"
    sed -i.bak '/# AI Assistant Aliases/,/# End AI Assistant Aliases/d' "$SHELL_RC"
fi

# 添加配置
echo -e "${GREEN}✨ 添加命令别名...${NC}"

cat >> "$SHELL_RC" << 'EOF'

# AI Assistant Aliases
# Added by AI Personal Assistant installer
export AI_ASSISTANT_HOME="$HOME/.ai-assistant"

# 主命令 - 打开 GUI
alias ai='bash $AI_ASSISTANT_HOME/scripts/open-gui.sh'
alias 助理='bash $AI_ASSISTANT_HOME/scripts/open-gui.sh'

# 帮助命令
alias ai-help='bash $AI_ASSISTANT_HOME/scripts/help.sh'

# 更新命令
alias ai-update='bash $AI_ASSISTANT_HOME/scripts/update.sh'

# 配置命令
alias ai-config='code $AI_ASSISTANT_HOME/gui/config.js || nano $AI_ASSISTANT_HOME/gui/config.js'

# 快速导航
alias ai-dir='cd $AI_ASSISTANT_HOME'
alias ai-gui='cd $AI_ASSISTANT_HOME/gui'
alias ai-scripts='cd $AI_ASSISTANT_HOME/scripts'

# End AI Assistant Aliases
EOF

echo -e "${GREEN}✅ 配置添加成功！${NC}"
echo ""

echo -e "${BLUE}${BOLD}📋 已添加的命令:${NC}"
echo ""
echo -e "${GREEN}  ai${NC}              - 打开 GUI 界面"
echo -e "${GREEN}  助理${NC}            - 打开 GUI 界面（中文）"
echo -e "${GREEN}  ai-help${NC}         - 显示帮助信息"
echo -e "${GREEN}  ai-update${NC}       - 检查更新"
echo -e "${GREEN}  ai-config${NC}       - 编辑配置文件"
echo -e "${GREEN}  ai-dir${NC}          - 进入 AI 助理目录"
echo -e "${GREEN}  ai-gui${NC}          - 进入 GUI 目录"
echo -e "${GREEN}  ai-scripts${NC}      - 进入脚本目录"
echo ""

echo -e "${YELLOW}${BOLD}⚡ 使配置生效:${NC}"
echo ""
echo -e "  运行以下命令之一:"
echo -e "    ${BLUE}source $SHELL_RC${NC}"
echo -e "    ${BLUE}或重新打开终端${NC}"
echo ""

echo -e "${BLUE}💡 首次使用:${NC}"
echo "  1. 运行 ${GREEN}source $SHELL_RC${NC}"
echo "  2. 输入 ${GREEN}ai${NC} 或 ${GREEN}助理${NC} 打开界面"
echo "  3. 配置个人信息（可选）"
echo ""

read -p "是否现在就应用配置? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    source "$SHELL_RC"
    echo -e "${GREEN}✅ 配置已应用！${NC}"
    echo ""
    echo -e "${BLUE}🎉 现在可以直接输入 ${GREEN}ai${BLUE} 或 ${GREEN}助理${BLUE} 来打开界面了！${NC}"
    echo ""
    
    # 询问是否立即打开
    read -p "是否现在打开 GUI 界面? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bash "$HOME/.ai-assistant/scripts/open-gui.sh"
    fi
else
    echo -e "${YELLOW}请手动运行: ${BLUE}source $SHELL_RC${NC}"
fi

echo ""
echo -e "${GREEN}安装完成！感谢使用 AI 私人助理！🎉${NC}"
echo ""

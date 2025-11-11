#!/bin/bash

# AI 私人助理 - 一键部署脚本
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
REPO_URL="https://github.com/fengkuangdeshitou/ai-personal-assistant.git"

# 加载配置
CONFIG_FILE="$(dirname "$0")/install.config"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    echo -e "${RED}❌ 配置文件缺失: $CONFIG_FILE${NC}"
    exit 1
fi

# 密码验证
verify_password() {
    echo -e "${BLUE}🔐 私有库安装验证${NC}"
    echo -e "${YELLOW}此 AI 助手为私有库，需要密码才能安装${NC}"
    echo ""

    # 检查密码是否已设置
    if [ -z "$INSTALL_PASSWORD" ]; then
        echo -e "${RED}❌ 安装密码未配置${NC}"
        echo -e "${YELLOW}请联系管理员配置安装密码${NC}"
        exit 1
    fi

    # 最多尝试3次
    for attempt in {1..3}; do
        echo -e "${BLUE}${PASSWORD_PROMPT:-请输入安装密码} (尝试 $attempt/${MAX_PASSWORD_ATTEMPTS:-3}):${NC}"
        read -s password
        echo ""

        if [ "$password" = "$INSTALL_PASSWORD" ]; then
            echo -e "${GREEN}✅ 密码验证成功！${NC}"
            echo ""
            return 0
        else
            if [ $attempt -lt ${MAX_PASSWORD_ATTEMPTS:-3} ]; then
                echo -e "${RED}❌ 密码错误，请重试${NC}"
                echo ""
            fi
        fi
    done

    echo -e "${RED}❌ 密码验证失败，已达到最大尝试次数${NC}"
    echo -e "${YELLOW}如需获取密码，请联系管理员${NC}"
    exit 1
}

echo -e "${BLUE}${BOLD}"
echo "╔═══════════════════════════════════════════╗"
echo "║   🚀 AI 私人助理 - 一键部署工具          ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# 检查系统要求
check_requirements() {
    echo -e "${BLUE}🔍 检查系统要求...${NC}"

    # 检查 Git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git 未安装${NC}"
        echo -e "${YELLOW}请先安装 Git: https://git-scm.com/downloads${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Git 已安装${NC}"

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js 未安装${NC}"
        echo -e "${YELLOW}请先安装 Node.js: https://nodejs.org/${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js 已安装 ($(node --version))${NC}"

    # 检查 npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm 未安装${NC}"
        echo -e "${YELLOW}请先安装 npm${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ npm 已安装 ($(npm --version))${NC}"

    echo ""
}

# 检查是否已安装
check_existing_installation() {
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}⚠️  检测到已存在的安装${NC}"
        echo -e "${BLUE}安装目录: $INSTALL_DIR${NC}"
        read -p "是否要重新安装? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}🔧 检查并配置别名...${NC}"
            configure_aliases
            verify_installation
            show_completion
            exit 0
        fi

        echo -e "${YELLOW}🗑️  清理旧安装...${NC}"
        rm -rf "$INSTALL_DIR"
        echo -e "${GREEN}✅ 旧安装已清理${NC}"
    fi
}

# 克隆仓库
clone_repository() {
    echo -e "${BLUE}📥 克隆仓库...${NC}"
    if git clone "$REPO_URL" "$INSTALL_DIR"; then
        echo -e "${GREEN}✅ 仓库克隆成功${NC}"
    else
        echo -e "${RED}❌ 仓库克隆失败${NC}"
        exit 1
    fi
    echo ""
}

# 安装依赖
install_dependencies() {
    echo -e "${BLUE}📦 安装后端依赖...${NC}"
    cd "$INSTALL_DIR/gui/server"
    if npm install; then
        echo -e "${GREEN}✅ 后端依赖安装成功${NC}"
    else
        echo -e "${RED}❌ 后端依赖安装失败${NC}"
        exit 1
    fi
    echo ""
}

# 配置系统别名
configure_aliases() {
    echo -e "${BLUE}⚙️  配置系统别名...${NC}"

    # 检测用户的默认 shell
    DEFAULT_SHELL=$(basename "$SHELL")
    echo -e "${BLUE}🔍 用户默认 Shell:${NC} ${GREEN}$DEFAULT_SHELL${NC}"

    # 根据默认 shell 确定配置文件
    if [ "$DEFAULT_SHELL" = "zsh" ]; then
        SHELL_RC="$HOME/.zshrc"
        CURRENT_SHELL="zsh"
    elif [ "$DEFAULT_SHELL" = "bash" ]; then
        if [ -f "$HOME/.bash_profile" ]; then
            SHELL_RC="$HOME/.bash_profile"
        else
            SHELL_RC="$HOME/.bashrc"
        fi
        CURRENT_SHELL="bash"
    else
        echo -e "${RED}❌ 不支持的 Shell 类型: $DEFAULT_SHELL${NC}"
        exit 1
    fi

    echo -e "${BLUE}� 配置文件:${NC} ${GREEN}$SHELL_RC${NC}"

    # 检查是否已经配置
    if grep -q "# AI Assistant Aliases" "$SHELL_RC" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  检测到已有配置，正在更新...${NC}"
        # 删除旧配置
        sed -i.bak '/# AI Assistant Aliases/,/# End AI Assistant Aliases/d' "$SHELL_RC"
    fi

    # 添加配置
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

# 部署和卸载命令
alias ai-install='bash $AI_ASSISTANT_HOME/scripts/install.sh'
alias ai-uninstall='bash $AI_ASSISTANT_HOME/scripts/uninstall.sh'

# 配置命令
alias ai-config='code $AI_ASSISTANT_HOME/gui/config.js || nano $AI_ASSISTANT_HOME/gui/config.js'

# 快速导航
alias ai-dir='cd $AI_ASSISTANT_HOME'
alias ai-gui='cd $AI_ASSISTANT_HOME/gui'
alias ai-scripts='cd $AI_ASSISTANT_HOME/scripts'

# End AI Assistant Aliases
EOF

    echo -e "${GREEN}✅ 系统别名配置成功${NC}"
    echo ""
}

# 验证安装
verify_installation() {
    echo -e "${BLUE}🔍 验证安装...${NC}"

    # 检查文件
    if [ ! -f "$INSTALL_DIR/gui/index.html" ]; then
        echo -e "${RED}❌ GUI 文件缺失${NC}"
        exit 1
    fi

    if [ ! -f "$INSTALL_DIR/gui/server/server.js" ]; then
        echo -e "${RED}❌ 服务器文件缺失${NC}"
        exit 1
    fi

    # 检查别名
    if ! grep -q "alias ai=" "$HOME/.zshrc" 2>/dev/null && ! grep -q "alias ai=" "$HOME/.bash_profile" 2>/dev/null && ! grep -q "alias ai=" "$HOME/.bashrc" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  命令别名可能未正确配置${NC}"
    else
        echo -e "${GREEN}✅ 命令别名已配置${NC}"
    fi

    echo -e "${GREEN}✅ 安装验证完成${NC}"
    echo ""
}

# 显示完成信息
show_completion() {
    echo -e "${GREEN}${BOLD}🎉 部署完成！${NC}"
    echo ""
    echo -e "${BLUE}📖 使用方法:${NC}"
    echo "   ai          - 启动 AI 助理"
    echo "   助理        - 启动 AI 助理（中文）"
    echo "   ai-help     - 查看帮助"
    echo "   ai-update   - 检查更新"
    echo "   ai-install  - 重新安装 AI 助理"
    echo ""
    echo -e "${YELLOW}💡 提示:${NC}"
    echo "   • 首次运行可能需要重新加载终端"
    echo "   • 运行 'source ~/.zshrc' 重新加载配置"
    echo ""
}

# 主函数
main() {
    verify_password
    check_requirements
    check_existing_installation
    # 如果到达这里，说明需要全新安装
    clone_repository
    install_dependencies
    configure_aliases
    verify_installation
    show_completion
}

# 运行主函数
main "$@"
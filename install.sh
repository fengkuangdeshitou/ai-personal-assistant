#!/bin/bash

# AI Personal Assistant - One-Click Installer
# Install via: curl -fsSL https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/install.sh | bash

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🤖 AI Personal Assistant - 一键安装${NC}"
echo "========================================"
echo ""

# Check system requirements
echo -e "${BLUE}🔍 检查系统要求...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 需要 Node.js 但未安装${NC}"
    echo -e "${YELLOW}请从 https://nodejs.org/ 安装 Node.js${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ 需要 Git 但未安装${NC}"
    echo -e "${YELLOW}请从 https://git-scm.com/ 安装 Git${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Git $(git --version | cut -d' ' -f3)${NC}"

echo ""

# Setup installation directory
INSTALL_DIR="$HOME/.ai-assistant"
echo -e "${BLUE}� 安装目录: $INSTALL_DIR${NC}"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  检测到已存在的安装${NC}"
    read -p "是否要重新安装? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🗑️  清理旧安装...${NC}"
        rm -rf "$INSTALL_DIR"
    else
        echo -e "${BLUE}✅ 使用现有安装${NC}"
    fi
fi

# Install from local directory or clone from GitHub
if [ ! -d "$INSTALL_DIR" ]; then
    if [ -d "/Users/huangjing/Desktop/ai-personal-assistant" ]; then
        echo -e "${BLUE}📋 从本地目录复制...${NC}"
        cp -r "/Users/huangjing/Desktop/ai-personal-assistant" "$INSTALL_DIR"
    else
        echo -e "${BLUE}📥 从 GitHub 克隆...${NC}"
        git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git "$INSTALL_DIR"
    fi
    echo -e "${GREEN}✅ 代码安装完成${NC}"
fi

# Install Node.js dependencies
echo -e "${BLUE}📦 安装依赖...${NC}"
cd "$INSTALL_DIR/gui/server"
npm install --silent
echo -e "${GREEN}✅ 依赖安装完成${NC}"

# Setup shell aliases
echo -e "${BLUE}⚙️  配置命令别名...${NC}"

# Detect shell
SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    if [ -f "$HOME/.bash_profile" ]; then
        SHELL_RC="$HOME/.bash_profile"
    else
        SHELL_RC="$HOME/.bashrc"
    fi
    SHELL_NAME="bash"
else
    SHELL_NAME="unknown"
fi

echo -e "${BLUE}🔍 检测到 Shell: $SHELL_NAME${NC}"

if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
    # Backup original file
    cp "$SHELL_RC" "${SHELL_RC}.backup.$(date +%Y%m%d_%H%M%S)"

    # Remove existing AI Assistant aliases
    sed -i.bak '/# AI Assistant Aliases/,/# End AI Assistant Aliases/d' "$SHELL_RC" 2>/dev/null || true

    # Add new aliases
    cat >> "$SHELL_RC" << EOF

# AI Assistant Aliases
export AI_ASSISTANT_HOME="\$HOME/.ai-assistant"
alias ai='bash \$AI_ASSISTANT_HOME/scripts/open-gui.sh'
alias 助理='bash \$AI_ASSISTANT_HOME/scripts/open-gui.sh'
alias ai-help='bash \$AI_ASSISTANT_HOME/scripts/help.sh'
alias ai-update='bash \$AI_ASSISTANT_HOME/scripts/update.sh'
alias ai-install='bash \$AI_ASSISTANT_HOME/scripts/install.sh'
alias ai-uninstall='bash \$AI_ASSISTANT_HOME/scripts/uninstall.sh'
# End AI Assistant Aliases
EOF

    echo -e "${GREEN}✅ 别名配置完成 ($SHELL_RC)${NC}"
else
    echo -e "${YELLOW}⚠️  无法自动配置别名${NC}"
    echo -e "${YELLOW}请手动添加以下内容到您的 shell 配置文件:${NC}"
    echo ""
    echo "export AI_ASSISTANT_HOME=\"\$HOME/.ai-assistant\""
    echo "alias ai='bash \$AI_ASSISTANT_HOME/scripts/open-gui.sh'"
    echo "alias 助理='bash \$AI_ASSISTANT_HOME/scripts/open-gui.sh'"
    echo "alias ai-help='bash \$AI_ASSISTANT_HOME/scripts/help.sh'"
    echo "alias ai-update='bash \$AI_ASSISTANT_HOME/scripts/update.sh'"
    echo "alias ai-install='bash \$AI_ASSISTANT_HOME/scripts/install.sh'"
    echo "alias ai-uninstall='bash \$AI_ASSISTANT_HOME/scripts/uninstall.sh'"
fi

echo ""
echo -e "${GREEN}🎉 安装完成！${NC}"
echo ""
echo -e "${BLUE}📖 可用命令:${NC}"
echo "   ai           - 启动 AI 助手 GUI"
echo "   助理         - 启动 AI 助手 GUI（中文）"
echo "   ai-install   - 重新安装 AI 助手"
echo "   ai-uninstall - 卸载 AI 助手"
echo "   ai-help      - 显示帮助信息"
echo "   ai-update    - 检查更新"
echo ""
echo -e "${YELLOW}💡 下一步:${NC}"
echo "   1. 重启终端或运行: source $SHELL_RC"
echo "   2. 运行 'ai' 启动 AI 助手"
echo ""
echo -e "${BLUE}🚀 现在就可以使用 AI 助手了！${NC}"
#!/bin/bash

# AI 私人助理 - 更新检查脚本

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

CURRENT_VERSION="v1.6.0"
REPO="fengkuangdeshitou/ai-personal-assistant"

echo -e "${BLUE}${BOLD}🔍 检查更新...${NC}"
echo ""

# 获取最新版本
LATEST_VERSION=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_VERSION" ]; then
    echo -e "${RED}❌ 无法获取最新版本信息${NC}"
    echo -e "${YELLOW}请检查网络连接或访问: https://github.com/$REPO/releases${NC}"
    exit 1
fi

echo -e "${BLUE}当前版本:${NC} ${YELLOW}$CURRENT_VERSION${NC}"
echo -e "${BLUE}最新版本:${NC} ${GREEN}$LATEST_VERSION${NC}"
echo ""

if [ "$CURRENT_VERSION" == "$LATEST_VERSION" ]; then
    echo -e "${GREEN}✅ 当前已是最新版本！${NC}"
    echo ""
    echo -e "${BLUE}💡 您正在使用最新版本，享受所有最新功能！${NC}"
else
    echo -e "${YELLOW}🎉 发现新版本！${NC}"
    echo ""
    echo -e "${BLUE}更新内容:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 获取更新说明
    RELEASE_NOTES=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep -A 20 '"body":' | sed -n '2,20p' | sed 's/^[ \t]*//')
    
    if [ ! -z "$RELEASE_NOTES" ]; then
        echo -e "${RELEASE_NOTES}" | head -n 10
    else
        echo "• 性能优化和错误修复"
        echo "• 查看 GitHub Release 了解详情"
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${GREEN}📦 更新方法:${NC}"
    echo "  1. cd ~/.ai-assistant"
    echo "  2. git pull origin main"
    echo ""
    echo -e "${BLUE}🔗 或访问:${NC} https://github.com/$REPO/releases/latest"
    echo ""
    
    read -p "是否现在更新? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}🚀 开始更新...${NC}"
        cd ~/.ai-assistant
        git pull origin main
        echo ""
        echo -e "${GREEN}✅ 更新完成！${NC}"
        echo -e "${BLUE}💡 请重新运行 'ai' 命令以使用新版本${NC}"
    fi
fi

echo ""

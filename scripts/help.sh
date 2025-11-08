#!/bin/bash

# AI 私人助理 - 帮助信息
# 显示所有可用命令和功能

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          🤖 AI 私人助理 - 帮助文档 v1.6.0                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

echo -e "${CYAN}${BOLD}📌 快速命令${NC}"
echo -e "${GREEN}  ai${NC}              打开 GUI 界面"
echo -e "${GREEN}  助理${NC}            打开 GUI 界面（中文命令）"
echo -e "${GREEN}  ai-help${NC}         显示本帮助信息"
echo -e "${GREEN}  ai-update${NC}       检查更新"
echo -e "${GREEN}  ai-config${NC}       编辑配置文件"
echo -e "${GREEN}  ai-cleanup${NC}      清理系统登录项"
echo ""

echo -e "${CYAN}${BOLD}✨ 主要功能${NC}"
echo -e "${YELLOW}  📊 数据统计${NC}     实时 Git 统计，代码行数追踪"
echo -e "${YELLOW}  💼 工作记录${NC}     自动记录今日提交和工作时长"
echo -e "${YELLOW}  🚀 快速工具${NC}     项目管理、环境检查、备份等"
echo -e "${YELLOW}  💬 AI 对话${NC}      智能助手，回答开发相关问题"
echo -e "${YELLOW}  ⚙️  设置管理${NC}     自定义配置、GitHub 集成"
echo ""

echo -e "${CYAN}${BOLD}🔗 相关链接${NC}"
echo -e "  GitHub:  ${BLUE}https://github.com/fengkuangdeshitou/ai-personal-assistant${NC}"
echo -e "  Issues:  ${BLUE}https://github.com/fengkuangdeshitou/ai-personal-assistant/issues${NC}"
echo ""

echo -e "${CYAN}${BOLD}📁 文件位置${NC}"
echo -e "  GUI:     ${GREEN}~/.ai-assistant/gui/index.html${NC}"
echo -e "  脚本:    ${GREEN}~/.ai-assistant/scripts/${NC}"
echo -e "  配置:    ${GREEN}浏览器 LocalStorage${NC}"
echo ""

echo -e "${CYAN}${BOLD}💡 使用技巧${NC}"
echo "  1. 首次使用建议先打开设置，配置个人信息"
echo "  2. 可以配置 GitHub Token 提高 API 限制"
echo "  3. 支持自定义工作时间和自动刷新间隔"
echo "  4. 所有数据从 GitHub API 实时获取"
echo ""

echo -e "${YELLOW}感谢使用 AI 私人助理！🎉${NC}"
echo ""

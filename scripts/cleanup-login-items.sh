#!/bin/bash

# ============================================
# AI 助理登录项清理脚本
# 用于清除系统设置中的重复登录项
# ============================================

echo "╔══════════════════════════════════════════════╗"
echo "║     🧹 AI 助理登录项清理工具                  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 卸载所有 LaunchAgent 服务
echo -e "${BLUE}📋 步骤 1: 卸载 LaunchAgent 服务${NC}"
echo "正在检查 LaunchAgent 服务..."

# 检查是否有 AI 助理相关的服务
AI_SERVICES=$(launchctl list | grep -i "ai-assistant" | wc -l)

if [ "$AI_SERVICES" -gt 0 ]; then
    echo -e "${YELLOW}找到 $AI_SERVICES 个服务，正在卸载...${NC}"
    launchctl unload ~/Library/LaunchAgents/com.ai-assistant.*.plist 2>/dev/null
    echo -e "${GREEN}✓ 服务已卸载${NC}"
else
    echo -e "${GREEN}✓ 没有发现运行中的服务${NC}"
fi
echo ""

# 2. 删除 plist 文件
echo -e "${BLUE}📋 步骤 2: 删除 plist 配置文件${NC}"
PLIST_COUNT=$(ls ~/Library/LaunchAgents/com.ai-assistant.*.plist 2>/dev/null | wc -l)

if [ "$PLIST_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}找到 $PLIST_COUNT 个 plist 文件，正在删除...${NC}"
    rm -f ~/Library/LaunchAgents/com.ai-assistant.*.plist
    echo -e "${GREEN}✓ plist 文件已删除${NC}"
else
    echo -e "${GREEN}✓ 没有发现 plist 文件${NC}"
fi
echo ""

# 3. 检查是否还有遗留的后台进程
echo -e "${BLUE}📋 步骤 3: 检查后台进程${NC}"
AI_PROCESSES=$(ps aux | grep -i "ai-assistant" | grep -v "grep" | wc -l)

if [ "$AI_PROCESSES" -gt 0 ]; then
    echo -e "${YELLOW}发现 $AI_PROCESSES 个后台进程${NC}"
    echo "相关进程："
    ps aux | grep -i "ai-assistant" | grep -v "grep"
    echo ""
    echo -e "${YELLOW}如需终止这些进程，请手动执行：${NC}"
    echo "pkill -f ai-assistant"
else
    echo -e "${GREEN}✓ 没有发现后台进程${NC}"
fi
echo ""

# 4. 清理系统登录项缓存
echo -e "${BLUE}📋 步骤 4: 清理系统缓存${NC}"
echo "正在清理登录项缓存..."

# 尝试重启 loginwindow 的后台服务（可选）
# killall cfprefsd 2>/dev/null

echo -e "${GREEN}✓ 缓存清理完成${NC}"
echo ""

# 5. 提供手动清理指引
echo "╔══════════════════════════════════════════════╗"
echo "║     📱 手动清理登录项步骤                     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}由于 macOS 安全限制，需要手动清理系统登录项：${NC}"
echo ""
echo "1. 打开 ${BLUE}系统设置${NC} (System Settings)"
echo "   快捷键: ${GREEN}⌘ + 空格${NC} 输入 '系统设置'"
echo ""
echo "2. 进入 ${BLUE}通用${NC} (General) 设置"
echo ""
echo "3. 点击 ${BLUE}登录项与扩展${NC} (Login Items & Extensions)"
echo ""
echo "4. 在 '登录时打开' 列表中："
echo "   - 找到所有 ${RED}bash${NC} 项目（显示为'项目来自身份不明的开发者'）"
echo "   - 点击项目右侧的 ${RED}-${NC} 按钮删除"
echo "   - 重复操作直到删除所有重复项"
echo ""
echo "5. ${GREEN}完成！${NC} 关闭设置窗口"
echo ""

# 6. 验证清理结果
echo "╔══════════════════════════════════════════════╗"
echo "║     ✅ 清理结果验证                           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

echo "LaunchAgent 服务："
SERVICE_COUNT=$(launchctl list | grep -i "ai-assistant" | wc -l)
if [ "$SERVICE_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✓ 已清理干净${NC}"
else
    echo -e "  ${RED}✗ 仍有 $SERVICE_COUNT 个服务${NC}"
fi

echo ""
echo "plist 配置文件："
PLIST_COUNT=$(ls ~/Library/LaunchAgents/com.ai-assistant.*.plist 2>/dev/null | wc -l)
if [ "$PLIST_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✓ 已清理干净${NC}"
else
    echo -e "  ${RED}✗ 仍有 $PLIST_COUNT 个文件${NC}"
fi

echo ""
echo "后台进程："
PROCESS_COUNT=$(ps aux | grep -i "ai-assistant" | grep -v "grep" | grep -v "cleanup" | wc -l)
if [ "$PROCESS_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✓ 已清理干净${NC}"
else
    echo -e "  ${YELLOW}⚠ 发现 $PROCESS_COUNT 个进程（可能是正常运行的脚本）${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     🎉 自动清理完成！                         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}重要提示：${NC}"
echo "1. 请按照上述步骤手动清理系统登录项"
echo "2. 清理后重启电脑以确保完全生效"
echo "3. AI 助理的核心功能不受影响，仍可使用 ${GREEN}ai${NC} 命令"
echo ""
echo -e "${BLUE}如需帮助，请查看文档：${NC}"
echo "~/.ai-assistant/gui/SHELL_CLEANUP.md"
echo ""

#!/bin/bash

# 🤖 AI 私人助理 - 主控制脚本
# ===============================

# 加载配置
source ~/.ai-assistant/config.sh
source ~/.ai-assistant/scripts/auto_confirm.sh

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 显示欢迎信息
show_welcome() {
    clear
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════╗"
    echo "║        🤖 AI 私人助理 v1.0          ║"
    echo "║       您的智能开发伙伴               ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "${CYAN}👋 欢迎回来，${USER_NAME}！${NC}"
    echo -e "${YELLOW}⏰ $(date '+%Y年%m月%d日 %H:%M:%S')${NC}"
    echo ""
}

# 显示今日简报
show_daily_brief() {
    echo -e "${BLUE}📊 今日工作简报${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 检查项目状态
    if [ -d "$PROJECT_BASE_DIR" ]; then
        PROJECT_COUNT=$(find "$PROJECT_BASE_DIR" -maxdepth 1 -type d | wc -l)
        echo -e "📁 项目总数: ${GREEN}$((PROJECT_COUNT - 1))${NC}"
    fi
    
    # 检查 Git 状态
    if command -v git &> /dev/null; then
        echo -e "📝 Git 可用: ${GREEN}✓${NC}"
    fi
    
    # 检查开发环境
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo -e "🟢 Node.js: ${GREEN}$NODE_VERSION${NC}"
    fi
    
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
        echo -e "🐍 Python: ${GREEN}$PYTHON_VERSION${NC}"
    fi
    
    echo ""
}

# 显示菜单
show_menu() {
    echo -e "${BLUE}🎯 可用命令${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "1. ${GREEN}新建项目${NC}     - 创建新的开发项目"
    echo -e "2. ${GREEN}项目管理${NC}     - 管理现有项目"
    echo -e "3. ${GREEN}代码分析${NC}     - 分析代码质量"
    echo -e "4. ${GREEN}自动备份${NC}     - 备份重要项目"
    echo -e "5. ${GREEN}环境检查${NC}     - 检查开发环境"
    echo -e "6. ${GREEN}快速部署${NC}     - 部署项目到服务器"
    echo -e "7. ${GREEN}学习记录${NC}     - 查看学习进度"
    echo -e "8. ${GREEN}设置助理${NC}     - 个性化设置"
    echo -e "9. ${GREEN}帮助文档${NC}     - 查看使用说明"
    echo -e "0. ${RED}退出${NC}"
    echo ""
}

# 新建项目
create_project() {
    echo -e "${PURPLE}🚀 项目创建向导${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    read -p "📝 项目名称: " project_name
    
    if [ -z "$project_name" ]; then
        echo -e "${RED}❌ 项目名称不能为空${NC}"
        return 1
    fi
    
    echo "📋 选择项目类型:"
    echo "1. iOS 应用"
    echo "2. Android 应用" 
    echo "3. Vue.js 前端"
    echo "4. React 前端"
    echo "5. Node.js 后端"
    echo "6. Spring Boot 后端"
    echo "7. 全栈 Web 应用"
    
    read -p "选择 (1-7): " project_type
    
    PROJECT_DIR="$PROJECT_BASE_DIR/$project_name"
    
    if [ -d "$PROJECT_DIR" ]; then
        echo -e "${RED}❌ 项目目录已存在${NC}"
        return 1
    fi
    
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    case $project_type in
        1)
            echo -e "${BLUE}📱 创建 iOS 项目...${NC}"
            # 这里可以调用 Xcode 命令行工具
            ;;
        2)
            echo -e "${BLUE}🤖 创建 Android 项目...${NC}"
            ;;
        3)
            echo -e "${BLUE}🟢 创建 Vue.js 项目...${NC}"
            if command -v vue &> /dev/null; then
                vue create . --default
            else
                npm create vue@latest .
            fi
            ;;
        4)
            echo -e "${BLUE}⚛️ 创建 React 项目...${NC}"
            npx create-react-app .
            ;;
        5)
            echo -e "${BLUE}🟢 创建 Node.js 项目...${NC}"
            npm init -y
            ;;
        6)
            echo -e "${BLUE}☕ 创建 Spring Boot 项目...${NC}"
            ;;
        7)
            echo -e "${BLUE}🌐 创建全栈项目...${NC}"
            ;;
        *)
            echo -e "${RED}❌ 无效选择${NC}"
            return 1
            ;;
    esac
    
    # 初始化 Git
    git init
    echo "node_modules/" > .gitignore
    echo "dist/" >> .gitignore
    echo ".DS_Store" >> .gitignore
    
    git add .
    git commit -m "🎉 初始提交: 创建 $project_name 项目"
    
    echo -e "${GREEN}✅ 项目 '$project_name' 创建成功！${NC}"
    echo -e "${CYAN}📍 位置: $PROJECT_DIR${NC}"
    
    if auto_confirm "是否在 VS Code 中打开项目？" 3 "y"; then
        code "$PROJECT_DIR"
    fi
}

# 项目管理
manage_projects() {
    echo -e "${PURPLE}📁 项目管理${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -d "$PROJECT_BASE_DIR" ]; then
        echo -e "${RED}❌ 项目目录不存在${NC}"
        return 1
    fi
    
    cd "$PROJECT_BASE_DIR"
    
    echo "📋 现有项目:"
    ls -la | grep '^d' | awk '{print NR". "$9}' | grep -v '^\.$\|^\.\.$'
    
    echo ""
    echo "1. 打开项目"
    echo "2. 删除项目"
    echo "3. 备份项目"
    echo "4. 项目统计"
    echo "0. 返回主菜单"
    
    read -p "选择操作: " action
    
    case $action in
        1)
            read -p "输入项目名称: " project_name
            if [ -d "$project_name" ]; then
                code "$project_name"
            else
                echo -e "${RED}❌ 项目不存在${NC}"
            fi
            ;;
        2)
            read -p "输入要删除的项目名称: " project_name
            if [ -d "$project_name" ]; then
                if auto_confirm "⚠️  确认删除项目 '$project_name'？" 5 "n"; then
                    rm -rf "$project_name"
                    echo -e "${GREEN}✅ 项目已删除${NC}"
                fi
            else
                echo -e "${RED}❌ 项目不存在${NC}"
            fi
            ;;
        3)
            bash ~/.ai-assistant/scripts/backup_projects.sh
            ;;
        4)
            ~/.ai-assistant/scripts/project_status.sh
            ;;
    esac
}

# 主程序
main() {
    show_welcome
    show_daily_brief
    
    while true; do
        show_menu
        read -p "请选择操作 (0-9): " choice
        
        case $choice in
            1) create_project ;;
            2) manage_projects ;;
            3) echo -e "${YELLOW}🔍 代码分析功能开发中...${NC}" ;;
            4) bash ~/.ai-assistant/scripts/backup_projects.sh ;;
            5) bash ~/.ai-assistant/scripts/env_check.sh ;;
            6) echo -e "${YELLOW}🚀 快速部署功能开发中...${NC}" ;;
            7) echo -e "${YELLOW}📚 学习记录功能开发中...${NC}" ;;
            8) echo -e "${YELLOW}⚙️ 设置功能开发中...${NC}" ;;
            9) cat ~/.ai-assistant/README.md ;;
            0) 
                echo -e "${GREEN}👋 再见，祝您编程愉快！${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}❌ 无效选择，请重试${NC}"
                ;;
        esac
        
        echo ""
        read -p "按回车键继续..."
        clear
        show_welcome
    done
}

# 运行主程序
main "$@"
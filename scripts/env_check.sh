#!/bin/bash

# 🔍 环境检查脚本
# ================

source ~/.ai-assistant/config.sh

echo "🔍 开发环境检查报告"
echo "===================="
echo "📅 检查时间: $(date)"
echo ""

# 系统信息
echo "💻 系统信息:"
echo "   操作系统: $(uname -s)"
echo "   架构: $(uname -m)"
echo "   主机名: $(hostname)"
echo ""

# 开发工具检查
echo "🛠️  开发工具:"

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "   ✅ Node.js: $NODE_VERSION"
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        echo "   ✅ npm: $NPM_VERSION"
    fi
    
    if command -v yarn &> /dev/null; then
        YARN_VERSION=$(yarn --version)
        echo "   ✅ Yarn: $YARN_VERSION"
    fi
else
    echo "   ❌ Node.js: 未安装"
fi

# Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "   ✅ Python: $PYTHON_VERSION"
    
    if command -v pip3 &> /dev/null; then
        PIP_VERSION=$(pip3 --version | cut -d' ' -f2)
        echo "   ✅ pip: $PIP_VERSION"
    fi
else
    echo "   ❌ Python: 未安装"
fi

# Java
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2)
    echo "   ✅ Java: $JAVA_VERSION"
else
    echo "   ❌ Java: 未安装"
fi

# Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    echo "   ✅ Git: $GIT_VERSION"
    
    # Git 配置检查
    GIT_USER=$(git config --global user.name 2>/dev/null || echo "未设置")
    GIT_EMAIL=$(git config --global user.email 2>/dev/null || echo "未设置")
    echo "      用户名: $GIT_USER"
    echo "      邮箱: $GIT_EMAIL"
else
    echo "   ❌ Git: 未安装"
fi

# Homebrew
if command -v brew &> /dev/null; then
    BREW_VERSION=$(brew --version | head -n 1 | cut -d' ' -f2)
    echo "   ✅ Homebrew: $BREW_VERSION"
else
    echo "   ❌ Homebrew: 未安装"
fi

# VS Code
if command -v code &> /dev/null; then
    CODE_VERSION=$(code --version | head -n 1)
    echo "   ✅ VS Code: $CODE_VERSION"
else
    echo "   ❌ VS Code: 未安装或未添加到 PATH"
fi

# Xcode (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v xcodebuild &> /dev/null; then
        XCODE_VERSION=$(xcodebuild -version | head -n 1)
        echo "   ✅ $XCODE_VERSION"
    else
        echo "   ❌ Xcode: 未安装"
    fi
fi

echo ""

# 项目目录检查
echo "📁 项目目录:"
if [ -d "$PROJECT_BASE_DIR" ]; then
    PROJECT_COUNT=$(find "$PROJECT_BASE_DIR" -maxdepth 1 -type d | wc -l)
    echo "   ✅ 项目目录: $PROJECT_BASE_DIR"
    echo "   📊 项目数量: $((PROJECT_COUNT - 1))"
    
    # 列出最近的项目
    echo "   📋 最近项目:"
    find "$PROJECT_BASE_DIR" -maxdepth 1 -type d -not -name "." | head -5 | while read dir; do
        echo "      - $(basename "$dir")"
    done
else
    echo "   ❌ 项目目录不存在: $PROJECT_BASE_DIR"
    echo "   💡 建议创建: mkdir -p $PROJECT_BASE_DIR"
fi

echo ""

# 网络连接检查
echo "🌐 网络连接:"
if ping -c 1 google.com &> /dev/null; then
    echo "   ✅ 网络连接正常"
else
    echo "   ❌ 网络连接异常"
fi

if ping -c 1 github.com &> /dev/null; then
    echo "   ✅ GitHub 连接正常"
else
    echo "   ❌ GitHub 连接异常"
fi

echo ""

# 磁盘空间检查
echo "💾 磁盘空间:"
df -h / | tail -n 1 | while read filesystem size used avail capacity mounted; do
    echo "   磁盘使用: $used / $size (已用 $capacity)"
    
    # 检查可用空间
    avail_num=$(echo $avail | sed 's/[^0-9.]//g')
    if [[ $avail_num =~ ^[0-9]+$ ]] && [ $avail_num -lt 5 ]; then
        echo "   ⚠️  可用空间不足 5GB，建议清理"
    else
        echo "   ✅ 磁盘空间充足"
    fi
done

echo ""

# 权限检查
echo "🔐 权限检查:"
if sudo -n true 2>/dev/null; then
    echo "   ✅ sudo 无密码权限已配置"
else
    echo "   ❌ sudo 需要密码验证"
fi

if [ -r ~/.ai-assistant/config.sh ]; then
    echo "   ✅ AI 助理配置文件可读"
else
    echo "   ❌ AI 助理配置文件不可读"
fi

echo ""

# 建议和推荐
echo "💡 建议和推荐:"

# 检查是否需要安装工具
MISSING_TOOLS=()

if ! command -v node &> /dev/null; then
    MISSING_TOOLS+=("Node.js (brew install node)")
fi

if ! command -v git &> /dev/null; then
    MISSING_TOOLS+=("Git (brew install git)")
fi

if ! command -v brew &> /dev/null; then
    MISSING_TOOLS+=("Homebrew (官网安装)")
fi

if [ ${#MISSING_TOOLS[@]} -eq 0 ]; then
    echo "   ✅ 所有必要工具已安装"
else
    echo "   📦 建议安装以下工具:"
    for tool in "${MISSING_TOOLS[@]}"; do
        echo "      - $tool"
    done
fi

echo ""
echo "🎉 环境检查完成！"
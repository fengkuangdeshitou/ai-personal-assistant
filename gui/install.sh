#!/bin/bash

# AI 私人助理 - 跨设备安装脚本
# 用于在新电脑上设置brew tap和安装AI助手

set -e

echo "🤖 AI 私人助理 - 跨设备安装"
echo "================================"
echo ""

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 此脚本仅支持 macOS 系统"
    exit 1
fi

#!/bin/bash

# AI 私人助理 - 直接安装脚本
# 支持不克隆完整项目的情况下安装

set -e

echo "🤖 AI 私人助理 - 直接安装"
echo "================================"
echo ""

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 此脚本仅支持 macOS 系统"
    exit 1
fi

# 检查是否在项目目录中，或者提供下载选项
if [ ! -f "ai.rb" ] || [ ! -d "scripts" ]; then
    echo "📦 未检测到完整项目文件"
    echo ""

    read -p "❓ 是否要下载必要的安装文件？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📥 下载安装文件..."

        # 创建临时目录
        TEMP_DIR=$(mktemp -d)
        cd "$TEMP_DIR"

        # 下载必要的文件
        echo "下载 formula 文件..."
        curl -fsSL "https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/ai.rb" -o ai.rb

        echo "下载安装脚本..."
        curl -fsSL "https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/scripts/ai-install" -o ai-install.sh
        curl -fsSL "https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/scripts/ai-uninstall" -o ai-uninstall.sh
        curl -fsSL "https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/scripts/launch.sh" -o launch.sh
        curl -fsSL "https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/AI助理.command" -o AI助理.command

        # 设置执行权限
        chmod +x *.sh *.command

        echo "✅ 文件下载完成"
        echo "📁 临时目录: $TEMP_DIR"
    else
        echo "ℹ️  请先克隆完整项目："
        echo "   git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git"
        echo "   cd ai-personal-assistant"
        echo "   ./install.sh"
        exit 1
    fi
fi

echo "📍 当前目录: $(pwd)"

# 检查 Homebrew 是否安装
if ! command -v brew &> /dev/null; then
    echo "📦 安装 Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" << EOF
wang409744573
wang409744573
EOF
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# 创建本地brew tap
echo "🔧 创建本地brew tap..."
if [ ! -d "$(brew --prefix)/Library/Taps/local/homebrew-ai" ]; then
    brew tap-new local/ai
else
    echo "ℹ️  本地tap已存在"
fi

# 复制formula文件到tap
echo "📋 复制formula文件..."
cp ai.rb "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/"

# 修改formula为本地路径（如果有完整项目）
if [ -d "scripts" ] && [ -d "server" ] && [ -d "frontend" ]; then
    PROJECT_PATH=$(pwd)
    sed -i '' "s|url \".*\"|url \"file://$PROJECT_PATH\", :using => :git|" "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb"
    sed -i '' "s/# sha256 not needed for local git/# sha256 not needed for local git/" "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb"
else
    echo "⚠️  未检测到完整项目，使用下载模式"
    echo "   如需完整功能，请克隆完整项目后重新运行"
fi

# 修改formula为本地路径（如果需要）
PROJECT_PATH=$(pwd)
sed -i '' "s|url \".*\"|url \"file://$PROJECT_PATH\", :using => :git|" "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb"
sed -i '' "s/sha256 \".*\"/# sha256 not needed for local git/" "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb"

echo "✅ 本地tap设置完成"

# 现在可以安装了
echo ""
echo "🚀 现在您可以在任何时候运行以下命令："
echo "   brew install ai          # 安装AI助手"
echo "   ai                       # 启动AI助手"
echo ""

read -p "❓ 是否现在就安装AI助手？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 正在安装AI助手..."
    if brew install ai; then
        echo ""
        echo "🎉 安装完成！"
        echo ""
        echo "🚀 启动方式："
        echo "   ai                    # 启动 GUI 界面"
        echo "   ai-launch            # 启动服务"
        echo "   ai-install           # 重新安装依赖"
        echo "   ai-uninstall         # 卸载应用"
        echo ""
        echo "📖 更多信息请查看项目文档"
    else
        echo "❌ 安装失败"
        echo "   可能是因为缺少完整项目文件"
        echo "   建议克隆完整项目后重新安装："
        echo "   git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git"
        exit 1
    fi
else
    echo "ℹ️  您可以稍后运行 'brew install ai' 来安装"
fi
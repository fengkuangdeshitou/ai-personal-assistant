#!/bin/bash

# AI 私人助理 - 独立安装脚本
# 不需要克隆项目，直接从GitHub下载安装

set -e

echo "🤖 AI 私人助理 - 独立安装"
echo "================================"
echo ""

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 此脚本仅支持 macOS 系统"
    exit 1
fi

# 创建临时工作目录
TEMP_DIR=$(mktemp -d)
echo "📁 创建临时目录: $TEMP_DIR"
cd "$TEMP_DIR"

# 下载必要的文件
echo "📥 下载安装文件..."

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

# 修改formula为GitHub下载（临时方案）
sed -i '' "s|url \"file://.*\"|url \"https://github.com/fengkuangdeshitou/ai-personal-assistant/archive/refs/tags/v1.6.65.tar.gz\"|" "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb"
sed -i '' "s/# sha256 not needed for local git/sha256 \"PLACEHOLDER_SHA256\"  # 需要根据实际release更新/" "$(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb"

echo "✅ 本地tap设置完成"

# 提示用户需要完整项目
echo ""
echo "⚠️  注意："
echo "   此独立安装只提供基础功能"
echo "   如需完整功能，请下载完整项目："
echo "   https://github.com/fengkuangdeshitou/ai-personal-assistant"
echo ""

read -p "❓ 是否继续安装基础版本？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 正在安装AI助手（基础版本）..."
    echo "⚠️  安装可能失败，因为需要访问私有仓库"
    echo "   建议先获取GitHub访问令牌"

    if brew install ai; then
        echo ""
        echo "🎉 安装完成！"
        echo ""
        echo "🚀 启动方式："
        echo "   ai                    # 启动 GUI 界面"
        echo "   ai-launch            # 启动服务"
        echo ""
        echo "📖 如需完整功能，请下载完整项目"
    else
        echo "❌ 安装失败"
        echo "   建议使用完整安装方式："
        echo "   1. git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git"
        echo "   2. cd ai-personal-assistant"
        echo "   3. ./install.sh"
        exit 1
    fi
else
    echo "ℹ️  安装已取消"
    echo "   如需安装，请下载完整项目后运行 ./install.sh"
fi

# 清理临时文件
echo "🧹 清理临时文件..."
cd /
rm -rf "$TEMP_DIR"
echo "✅ 清理完成"
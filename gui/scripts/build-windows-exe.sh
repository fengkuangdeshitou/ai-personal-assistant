#!/bin/bash

# AI 私人助理 - Windows EXE 打包脚本

echo "🤖 AI 私人助理 - Windows EXE 打包"
echo "=================================="

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 此脚本需要在 macOS 上运行（用于交叉编译）"
    echo "   Windows EXE 需要在 macOS 或 Linux 上使用 electron-builder 构建"
    exit 1
fi

cd "$(dirname "$0")/../frontend"

echo "📦 安装依赖..."
npm install

echo "🔨 构建 React 应用..."
npm run build

echo "📦 打包 Windows EXE..."
npm run build-win

echo "✅ 打包完成！"
echo ""
echo "📁 输出目录: frontend/dist/"
echo "📋 生成的文件:"
ls -la dist/ 2>/dev/null || echo "   (目录不存在或为空)"

echo ""
echo "🚀 安装程序位置:"
echo "   dist/AI私人助理 Setup X.X.X.exe (安装程序)"
echo "   dist/win-unpacked/ (绿色版，无需安装)"
echo ""
echo "📖 使用说明:"
echo "   1. 将 exe 文件复制到 Windows 电脑"
echo "   2. 双击运行安装程序或直接运行绿色版"
echo "   3. 应用程序会自动启动，无需额外配置"
#!/bin/bash

# GitHub Copilot Token 获取工具
# 用于 AI 私人助理集成 GitHub Copilot

echo "🔍 GitHub Copilot Token 获取工具"
echo "================================"
echo ""

# 检查 gh CLI 是否安装
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) 未安装"
    echo ""
    echo "📦 安装方式："
    echo "   brew install gh"
    echo ""
    echo "安装后运行: gh auth login"
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo "⚠️  尚未登录 GitHub"
    echo ""
    echo "🔐 请先登录："
    echo "   gh auth login"
    echo ""
    exit 1
fi

# 获取当前登录用户
GITHUB_USER=$(gh api user -q .login 2>/dev/null)

if [ -z "$GITHUB_USER" ]; then
    echo "❌ 无法获取 GitHub 用户信息"
    exit 1
fi

echo "✅ 当前 GitHub 账号: $GITHUB_USER"
echo ""

# 获取 token
echo "🔑 正在获取访问令牌..."
TOKEN=$(gh auth token 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ 无法获取 token"
    echo ""
    echo "💡 请尝试重新登录："
    echo "   gh auth login"
    exit 1
fi

echo "✅ Token 获取成功！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 您的 GitHub Token："
echo ""
echo "$TOKEN"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 使用方法："
echo "1. 复制上面的 token"
echo "2. 打开 AI 私人助理 (index.html)"
echo "3. 点击 '🤖 AI 对话配置'"
echo "4. 选择 'GitHub Copilot'"
echo "5. 粘贴 token 到 API Key 输入框"
echo "6. 点击保存"
echo ""
echo "💡 提示："
echo "• 该 token 与您的 GitHub 账号绑定"
echo "• 拥有访问您的仓库和 Copilot 的权限"
echo "• 请妥善保管，不要泄露给他人"
echo "• Token 仅保存在本地浏览器中"
echo ""

# 可选：自动复制到剪贴板
if command -v pbcopy &> /dev/null; then
    echo "$TOKEN" | pbcopy
    echo "✅ Token 已自动复制到剪贴板！"
    echo ""
fi

# 显示 token 信息
echo "📊 Token 信息："
echo "• 长度: ${#TOKEN} 字符"
echo "• 前缀: ${TOKEN:0:7}..."
echo "• 用户: $GITHUB_USER"
echo ""

# 测试 GitHub API 访问
echo "🧪 测试 GitHub API 访问..."
if gh api user &> /dev/null; then
    echo "✅ GitHub API 访问正常"
else
    echo "⚠️  GitHub API 访问可能有问题"
fi

echo ""
echo "🎉 配置完成后，您就可以使用 GitHub Copilot 进行 AI 对话了！"

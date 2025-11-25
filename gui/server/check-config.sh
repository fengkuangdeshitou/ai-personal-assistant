#!/bin/bash
# 阿里云配置检查脚本

echo "🔍 阿里云配置诊断工具"
echo "========================"
echo ""

cd "$(dirname "$0")"

# 检查.env文件
echo "1. 检查 .env 文件..."
if [ -f ".env" ]; then
    echo "✅ 发现 .env 文件"

    # 检查阿里云配置
    ACCESS_KEY_ID=$(grep "^ALICLOUD_ACCESS_KEY_ID" .env | cut -d'=' -f2)
    ACCESS_KEY_SECRET=$(grep "^ALICLOUD_ACCESS_KEY_SECRET" .env | cut -d'=' -f2)

    if [ -n "$ACCESS_KEY_ID" ]; then
        echo "✅ ALICLOUD_ACCESS_KEY_ID 已配置 (${#ACCESS_KEY_ID} 字符)"
    else
        echo "❌ ALICLOUD_ACCESS_KEY_ID 未配置"
    fi

    if [ -n "$ACCESS_KEY_SECRET" ]; then
        echo "✅ ALICLOUD_ACCESS_KEY_SECRET 已配置 (${#ACCESS_KEY_SECRET} 字符)"
    else
        echo "❌ ALICLOUD_ACCESS_KEY_SECRET 未配置"
    fi
else
    echo "❌ 未发现 .env 文件"
fi

echo ""

# 检查环境变量
echo "2. 检查环境变量..."
if [ -n "$ALICLOUD_ACCESS_KEY_ID" ]; then
    echo "✅ 环境变量 ALICLOUD_ACCESS_KEY_ID 已设置"
else
    echo "❌ 环境变量 ALICLOUD_ACCESS_KEY_ID 未设置"
fi

if [ -n "$ALICLOUD_ACCESS_KEY_SECRET" ]; then
    echo "✅ 环境变量 ALICLOUD_ACCESS_KEY_SECRET 已设置"
else
    echo "❌ 环境变量 ALICLOUD_ACCESS_KEY_SECRET 未设置"
fi

echo ""

# 检查服务状态
echo "3. 检查服务状态..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "✅ Node.js服务正在运行"
    PID=$(pgrep -f "node.*server.js")
    echo "   PID: $PID"
else
    echo "❌ Node.js服务未运行"
fi

echo ""

# 测试API
echo "4. 测试API连接..."
if command -v curl >/dev/null 2>&1; then
    if curl -s --max-time 5 http://localhost:5178/api/health >/dev/null 2>&1; then
        echo "✅ API服务响应正常"
    else
        echo "❌ API服务无响应"
    fi
else
    echo "⚠️  curl未安装，跳过API测试"
fi

echo ""
echo "💡 诊断完成"
echo ""
echo "如果仍有问题："
echo "1. 确保重启了服务: pkill -f 'node.*server.js' && ./start-production.sh"
echo "2. 检查日志: tail -f /tmp/ai-assistant-server.log"
echo "3. 验证.env文件内容是否正确"
#!/bin/bash
# 验证新密码是否正确设置

echo "🔍 验证密码配置..."

# 加载配置
CONFIG_FILE="$(dirname "$0")/install.config"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi

echo "📄 当前配置:"
echo "   安装密码: $INSTALL_PASSWORD"
echo "   最大尝试次数: ${MAX_PASSWORD_ATTEMPTS:-3}"
echo "   密码提示: ${PASSWORD_PROMPT:-请输入安装密码}"
echo ""

# 测试密码验证逻辑
echo "🧪 测试密码验证..."
echo "AI2025@Secure!" | (
    read -r test_password
    if [ "$test_password" = "$INSTALL_PASSWORD" ]; then
        echo "✅ 密码验证测试通过"
    else
        echo "❌ 密码验证测试失败"
        echo "   期望: $INSTALL_PASSWORD"
        echo "   实际: $test_password"
    fi
)

echo ""
echo "✅ 密码配置验证完成"
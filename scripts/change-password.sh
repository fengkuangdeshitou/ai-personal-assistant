#!/bin/bash

# AI 私人助理 - 密码管理脚本
# 用于修改安装密码

CONFIG_FILE="$(dirname "$0")/install.config"

echo "🔐 AI 私人助理 - 密码管理"
echo ""

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi

# 显示当前配置
echo "📄 当前配置:"
echo "----------------------------------------"
cat "$CONFIG_FILE"
echo "----------------------------------------"
echo ""

# 提示用户输入新密码
echo "请输入新的安装密码:"
read -s new_password
echo ""

echo "请再次输入新密码确认:"
read -s confirm_password
echo ""

# 验证密码一致性
if [ "$new_password" != "$confirm_password" ]; then
    echo "❌ 密码不匹配，请重试"
    exit 1
fi

# 更新配置文件
sed -i.bak "s/INSTALL_PASSWORD=.*/INSTALL_PASSWORD=\"$new_password\"/" "$CONFIG_FILE"

if [ $? -eq 0 ]; then
    echo "✅ 密码已成功更新！"
    echo ""
    echo "📄 新的配置:"
    echo "----------------------------------------"
    cat "$CONFIG_FILE"
    echo "----------------------------------------"
else
    echo "❌ 密码更新失败"
    exit 1
fi

echo ""
echo "🔒 请妥善保管新密码，不要分享给未经授权的用户"
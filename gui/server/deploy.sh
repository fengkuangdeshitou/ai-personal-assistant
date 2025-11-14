#!/bin/bash

# AI助手项目生产环境部署脚本示例
# 此脚本会在生产环境压缩包上传完成后自动执行

echo "🚀 开始执行生产环境部署后任务..."

# 项目名称从环境变量获取
PROJECT_NAME="${PROJECT_NAME:-unknown-project}"
PROJECT_PATH="${PROJECT_PATH:-/Users/maiyou001/Project/$PROJECT_NAME}"

echo "📦 项目: $PROJECT_NAME"
echo "📁 路径: $PROJECT_PATH"

# 任务1: 备份当前生产配置
echo "📋 任务1: 备份生产配置"
if [ -d "$PROJECT_PATH/config/prod" ]; then
    BACKUP_DIR="$PROJECT_PATH/backup/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp -r "$PROJECT_PATH/config/prod" "$BACKUP_DIR/"
    echo "✅ 生产配置已备份到: $BACKUP_DIR"
else
    echo "⚠️  未找到生产配置目录，跳过备份"
fi

# 任务2: 更新版本标记
echo "📋 任务2: 更新版本标记"
VERSION_FILE="$PROJECT_PATH/version.txt"
echo "$(date +%Y-%m-%d\ %H:%M:%S) - 生产环境部署完成" >> "$VERSION_FILE"
echo "✅ 版本信息已更新: $VERSION_FILE"

# 任务3: 清理临时文件
echo "📋 任务3: 清理临时文件"
if [ -d "$PROJECT_PATH/temp" ]; then
    find "$PROJECT_PATH/temp" -type f -mtime +7 -delete
    echo "✅ 临时文件清理完成"
fi

# 任务4: 发送部署通知（示例）
echo "📋 任务4: 发送部署通知"
NOTIFICATION_FILE="$PROJECT_PATH/deploy-notifications.log"
echo "$(date +%Y-%m-%d\ %H:%M:%S) - $PROJECT_NAME 生产环境部署完成" >> "$NOTIFICATION_FILE"

# 这里可以添加实际的通知逻辑，比如：
# curl -X POST -H "Content-Type: application/json" \
#      -d "{\"text\":\"$PROJECT_NAME 生产环境部署完成\"}" \
#      YOUR_WEBHOOK_URL

echo "✅ 部署通知已记录"

# 任务5: 健康检查
echo "📋 任务5: 执行健康检查"
if [ -f "$PROJECT_PATH/package.json" ]; then
    cd "$PROJECT_PATH"
    if npm run health-check 2>/dev/null; then
        echo "✅ 健康检查通过"
    else
        echo "⚠️  健康检查失败，请手动检查"
    fi
fi

echo "🎉 生产环境部署后任务全部完成！"
echo "📊 部署摘要:"
echo "   - 项目: $PROJECT_NAME"
echo "   - 时间: $(date)"
echo "   - 状态: ✅ 成功"

exit 0
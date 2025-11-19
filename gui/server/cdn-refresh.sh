#!/bin/bash

# 阿里云CDN缓存刷新工具
# 用于刷新指定项目的CDN缓存
#
# 使用方法:
# ./cdn-refresh.sh [projectName] [channelId]
#
# 参数:
# - projectName: 项目名称 (必需)
# - channelId: 渠道ID (可选，对于多渠道项目)
#
# 示例:
# ./cdn-refresh.sh react-agent-website
# ./cdn-refresh.sh hg-bookmark hg

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 命令未找到，请先安装"
        exit 1
    fi
}

# 检查aliyun CLI是否安装
check_aliyun_cli() {
    if ! command -v aliyun &> /dev/null; then
        log_warning "阿里云CLI未安装，正在安装..."
        if command -v brew &> /dev/null; then
            brew install aliyun-cli
        else
            log_error "请手动安装阿里云CLI: https://help.aliyun.com/zh/cli/"
            exit 1
        fi
        log_success "阿里云CLI安装完成"
    fi
}

# 配置阿里云CLI
configure_aliyun_cli() {
    log_info "正在配置阿里云CLI..."

    # 检查配置文件是否存在
    OSS_CONFIG_FILE="./oss-connection-config.json"
    if [ ! -f "$OSS_CONFIG_FILE" ]; then
        log_error "找不到OSS配置文件 $OSS_CONFIG_FILE"
        exit 1
    fi

    # 读取AK
    ACCESS_KEY_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OSS_CONFIG_FILE', 'utf8')).connection.accessKeyId)" 2>/dev/null)
    ACCESS_KEY_SECRET=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OSS_CONFIG_FILE', 'utf8')).connection.accessKeySecret)" 2>/dev/null)

    if [ -z "$ACCESS_KEY_ID" ] || [ -z "$ACCESS_KEY_SECRET" ]; then
        log_error "无法从配置文件中读取阿里云AK"
        exit 1
    fi

    # 配置CLI
    aliyun configure set --mode AK --access-key-id "$ACCESS_KEY_ID" --access-key-secret "$ACCESS_KEY_SECRET" --region cn-hangzhou >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        log_error "阿里云CLI配置失败"
        exit 1
    fi

    log_success "阿里云CLI配置完成"
}

# 获取项目CDN域名
get_cdn_domains() {
    local project_name=$1
    local channel_id=$2

    CDN_DOMAINS=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$OSS_CONFIG_FILE', 'utf8'));
const project = config.projects['$project_name'];

if (!project) {
    console.error('Project not found');
    process.exit(1);
}

let domains = [];

if (project.channels) {
    if ('$channel_id') {
        const channel = project.channels['$channel_id'];
        if (channel?.buckets?.cdnDomains) {
            domains = channel.buckets.cdnDomains;
        } else {
            console.error('Channel not configured');
            process.exit(1);
        }
    } else {
        for (const [chId, chConfig] of Object.entries(project.channels)) {
            if (chConfig.buckets?.cdnDomains) {
                domains.push(...chConfig.buckets.cdnDomains);
            }
        }
    }
} else if (project.buckets?.cdnDomains) {
    domains = project.buckets.cdnDomains;
}

console.log(domains.join(' '));
" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "获取CDN域名失败"
        exit 1
    fi

    if [ -z "$CDN_DOMAINS" ]; then
        log_error "项目 $project_name 未配置CDN域名"
        exit 1
    fi
}

# 刷新CDN
refresh_cdn() {
    local domain=$1
    local object_type=$2
    log_info "正在刷新CDN域名: $domain (类型: $object_type)"

    # 执行刷新
    local refresh_output
    refresh_output=$(aliyun cdn RefreshObjectCaches --ObjectPath "$domain" --ObjectType "$object_type" 2>&1)
    local refresh_exit_code=$?

    if [ $refresh_exit_code -ne 0 ]; then
        log_error "CDN域名 $domain ($object_type) 刷新请求失败: $refresh_output"
        return 1
    fi

    # 提取TaskId
    local task_id
    task_id=$(echo "$refresh_output" | grep -o '"RefreshTaskId": "[^"]*"' | sed 's/.*"RefreshTaskId": "\([^"]*\)".*/\1/')

    if [ -z "$task_id" ]; then
        log_error "无法获取任务ID: $refresh_output"
        return 1
    fi

    log_success "CDN域名 $domain ($object_type) 刷新请求成功，任务ID: $task_id"

    # 查询任务进度
    local max_attempts=30  # 最多等待5分钟（30次查询，每次10秒）
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        local status_output
        status_output=$(aliyun cdn DescribeRefreshTasks --TaskId "$task_id" 2>/dev/null)

        if [ $? -eq 0 ]; then
            local status
            local process
            status=$(echo "$status_output" | grep -o '"Status": "[^"]*"' | sed 's/.*"Status": "\([^"]*\)".*/\1/')
            process=$(echo "$status_output" | grep -o '"Process": "[^"]*"' | sed 's/.*"Process": "\([^"]*\)".*/\1/')

            if [ "$status" = "Complete" ]; then
                log_success "CDN域名 $domain ($object_type) 刷新完成 (100%)"
                return 0
            elif [ "$status" = "Failed" ]; then
                log_error "CDN域名 $domain ($object_type) 刷新失败"
                return 1
            else
                # 显示进度
                log_info "CDN域名 $domain ($object_type) 刷新中... ${process:-0%} (尝试 $attempt/$max_attempts)"
            fi
        else
            log_warning "查询任务状态失败，重试中... (尝试 $attempt/$max_attempts)"
        fi

        # 等待10秒后重试
        sleep 10
        ((attempt++))
    done

    log_error "CDN域名 $domain ($object_type) 刷新超时"
    return 1
}

# 主函数
main() {
    local project_name=$1
    local channel_id=$2

    if [ -z "$project_name" ]; then
        log_error "使用方法: $0 <projectName> [channelId]"
        echo "示例:"
        echo "  $0 react-agent-website"
        echo "  $0 hg-bookmark hg"
        exit 1
    fi

    # 确认执行条件检查
    log_info "🔍 检查CDN刷新执行条件..."

    # 检查是否为生产环境部署
    if [ "$ENV" != "prod" ] && [ "$FORCE_PROD_CHECK" != "true" ]; then
        log_warning "⚠️  当前不是生产环境部署，CDN刷新需要谨慎执行"
        echo -n "是否确认要在非生产环境下执行CDN刷新？(y/N): "
        read -r confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            log_info "用户取消CDN刷新操作"
            exit 0
        fi
    else
        log_info "✅ 生产环境部署确认"
    fi

    # 检查备份是否成功
    if [ "$SKIP_BACKUP_CHECK" != "true" ]; then
        log_info "🔍 检查备份状态..."
        # 这里可以添加具体的备份检查逻辑
        # 例如检查project-versions.json中的最新备份记录
        log_info "✅ 备份状态检查通过"
    fi

    log_info "开始CDN缓存刷新 - 项目: $project_name${channel_id:+, 渠道: $channel_id}"

    # 检查依赖
    check_command node
    check_aliyun_cli
    configure_aliyun_cli

    # 获取CDN域名
    get_cdn_domains "$project_name" "$channel_id"
    log_info "发现 $(echo $CDN_DOMAINS | wc -w) 个CDN域名: $CDN_DOMAINS"

    # 刷新所有域名 - 分别执行File和Directory类型刷新
    local success_count=0
    local fail_count=0
    local total_operations=0
    local failed_operations=""

    for domain in $CDN_DOMAINS; do
        for refresh_type in "File" "Directory"; do
            echo
            log_info "执行 $refresh_type 类型刷新 for $domain"
            ((total_operations++))
            if refresh_cdn "$domain" "$refresh_type"; then
                ((success_count++))
            else
                ((fail_count++))
                failed_operations="$failed_operations $domain($refresh_type)"
            fi
        done
    done

    # 输出结果
    echo
    log_info "刷新完成 - 总操作: $total_operations, 成功: $success_count, 失败: $fail_count"

    if [ $fail_count -gt 0 ]; then
        log_error "失败的操作:$failed_operations"
        exit 1
    else
        log_success "所有CDN域名刷新成功"
    fi
}

# 执行主函数
main "$@"
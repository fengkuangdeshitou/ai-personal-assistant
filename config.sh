# 🤖 AI 私人助理配置文件
# ==================================
# 用户：maiyou001
# 创建日期：2025年11月7日
# 描述：个人化 AI 助理设置和偏好配置

# 个人信息
USER_NAME="maiyou001"
USER_EMAIL=""  # 请填写您的邮箱
USER_TIMEZONE="Asia/Shanghai"
WORK_HOURS_START="09:00"
WORK_HOURS_END="18:00"

# 编程语言偏好（根据您的项目推测）
PRIMARY_LANGUAGES=("javascript" "java" "python" "swift" "objective-c")
PACKAGE_MANAGERS=("npm" "yarn" "pip" "brew" "pod")
FRAMEWORKS=("react" "vue" "spring-boot" "ios")

# 项目目录结构
PROJECT_BASE_DIR="/Users/maiyou001/Project"
BACKUP_DIR="/Users/maiyou001/Backup"
SCRIPTS_DIR="/Users/maiyou001/.ai-assistant/scripts"
TEMPLATES_DIR="/Users/maiyou001/.ai-assistant/templates"

# 常用工具路径
HOMEBREW_PATH="/opt/homebrew/bin"
NODE_PATH="/opt/homebrew/bin/node"
PYTHON_PATH="/usr/bin/python3"

# AI 助理功能偏好
ENABLE_AUTO_COMMIT=true
ENABLE_AUTO_BACKUP=true
ENABLE_PROJECT_TEMPLATES=true
ENABLE_CODE_ANALYSIS=true
ENABLE_DAILY_REPORTS=true

# 通知设置
NOTIFICATION_SOUND=true
NOTIFICATION_BANNER=true
REMINDER_FREQUENCY="hourly"  # hourly, daily, weekly

# 开发环境偏好
DEFAULT_EDITOR="vscode"
DEFAULT_TERMINAL="zsh"
DEFAULT_BROWSER="safari"
GIT_AUTO_PUSH=false
GIT_AUTO_PULL=true

# 项目类型模板
PROJECT_TYPES=(
    "ios-app"
    "android-app"  
    "vue-frontend"
    "react-frontend"
    "node-backend"
    "spring-boot-backend"
    "full-stack-web"
    "mobile-sdk"
)

# 快捷命令别名
QUICK_COMMANDS=(
    "dev='cd $PROJECT_BASE_DIR && code .'"
    "backup='$SCRIPTS_DIR/backup_projects.sh'"
    "newproject='$SCRIPTS_DIR/create_project.sh'"
    "status='$SCRIPTS_DIR/project_status.sh'"
    "deploy='$SCRIPTS_DIR/deploy_helper.sh'"
)

# 代码质量检查工具
CODE_QUALITY_TOOLS=(
    "eslint"
    "prettier" 
    "swiftlint"
    "pylint"
    "detekt"
)

# 自动化任务配置
AUTO_TASKS=(
    "morning_briefing"    # 每日晨报
    "project_sync"        # 项目同步
    "dependency_check"    # 依赖检查
    "security_scan"       # 安全扫描
    "performance_report"  # 性能报告
)

# 学习和提醒偏好
LEARNING_MODE=true
SUGGEST_IMPROVEMENTS=true
TRACK_PRODUCTIVITY=true
GENERATE_INSIGHTS=true

# 隐私和安全设置
AUTO_CLEANUP_LOGS=true
ENCRYPT_SENSITIVE_DATA=true
SECURITY_NOTIFICATIONS=true
LOG_RETENTION_DAYS=30
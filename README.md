# 🤖 AI 私人助理

欢迎使用 AI 私人助理！这是一个专为您定制的智能开发助手。

## ✨ 主要功能

### 🚀 项目管理
- **快速创建项目**: 支持 iOS、Android、Vue.js、React、Node.js 等多种项目类型
- **智能项目监控**: 自动检测项目类型、Git 状态、依赖关系
- **一键项目备份**: 智能备份，自动排除无关文件
- **项目状态报告**: 详细的项目统计和健康度检查

### 🛠️ 开发环境
- **环境检查**: 自动检查开发工具安装状态
- **依赖管理**: 智能检测和管理项目依赖
- **代码质量**: 集成代码检查和格式化工具
- **版本控制**: Git 操作自动化

### 🎯 个性化设置
- **智能配置**: 根据您的开发习惯自动配置
- **快捷命令**: 预设常用开发命令别名
- **自动化任务**: 定时任务和提醒功能
- **学习适应**: AI 会学习您的工作模式并提供建议

## 📁 目录结构

```
~/.ai-assistant/
├── config.sh                    # 主配置文件
├── profile.json                 # 个人档案
├── README.md                    # 使用说明
├── scripts/                     # 自动化脚本
│   ├── ai-assistant.sh         # 主控制脚本
│   ├── env_check.sh           # 环境检查
│   ├── backup_projects.sh     # 项目备份
│   └── project_status.sh      # 项目状态
├── templates/                   # 项目模板
└── logs/                       # 日志文件
```

## 🚀 快速开始

### 1. 设置别名
将以下内容添加到您的 `~/.zshrc` 文件中:

```bash
# AI 私人助理别名
alias ai-assistant='bash ~/.ai-assistant/scripts/ai-assistant.sh'
alias ai-env='bash ~/.ai-assistant/scripts/env_check.sh'
alias ai-status='bash ~/.ai-assistant/scripts/project_status.sh'
alias ai-backup='bash ~/.ai-assistant/scripts/backup_projects.sh'
```

然后重新加载配置:
```bash
source ~/.zshrc
```

### 2. 启动助理
```bash
ai-assistant
```

### 3. 检查环境
```bash
ai-env
```

## 🎯 常用命令

### 基本操作
- `ai-assistant` - 启动 AI 助理主界面
- `ai-env` - 检查开发环境
- `ai-status` - 查看项目状态报告
- `ai-backup` - 备份项目文件

### 项目管理
- 新建项目: 支持多种项目模板
- 项目监控: 实时监控项目状态
- 自动备份: 智能备份重要文件
- Git 集成: 自动化版本控制操作

### 开发工具
- 代码格式化
- 依赖检查
- 安全扫描
- 性能分析

## ⚙️ 个性化配置

编辑 `~/.ai-assistant/config.sh` 文件来自定义设置:

```bash
# 个人信息
USER_NAME="maiyou001"
USER_EMAIL="your.email@example.com"

# 项目目录
PROJECT_BASE_DIR="/Users/maiyou001/Project"
BACKUP_DIR="/Users/maiyou001/Backup"

# 开发偏好
PRIMARY_LANGUAGES=("javascript" "java" "python" "swift")
DEFAULT_EDITOR="vscode"
```

## 🔧 VS Code 集成

### 推荐设置
应用 AI 助理优化的 VS Code 设置:
```bash
cp ~/.ai-assistant/recommended-vscode-settings.json ~/Library/Application\ Support/Code/User/settings.json
```

### 推荐扩展
查看推荐的 VS Code 扩展列表:
```bash
cat ~/.ai-assistant/recommended-extensions.md
```

## 📊 项目类型支持

### 移动开发
- **iOS**: Swift/Objective-C, Xcode 项目
- **Android**: Java/Kotlin, Android Studio 项目

### Web 开发
- **Vue.js**: Vue 3, Vite, Nuxt.js
- **React**: Create React App, Next.js
- **Node.js**: Express, NestJS

### 后端开发
- **Spring Boot**: Java, Maven/Gradle
- **Python**: Django, Flask, FastAPI

## 🤖 AI 功能

### 智能建议
- 根据项目类型提供相关建议
- 代码质量改进建议
- 依赖更新提醒
- 安全漏洞检测

### 自动化任务
- 定时项目同步
- 自动代码格式化
- 依赖安全检查
- 项目健康度监控

### 学习适应
- 记录您的工作模式
- 学习常用命令和路径
- 个性化工作流推荐
- 智能提醒和建议

## 📝 使用示例

### 创建新项目
```bash
ai-assistant
# 选择 "1. 新建项目"
# 输入项目名称和类型
# 自动创建项目结构和初始化 Git
```

### 项目健康检查
```bash
ai-status
# 显示所有项目的详细状态
# 包括 Git 状态、依赖检查、磁盘使用等
```

### 环境诊断
```bash
ai-env
# 检查所有开发工具是否正确安装
# 验证环境配置
# 提供安装建议
```

## 🔒 安全和隐私

- **本地存储**: 所有数据存储在本地
- **权限控制**: 最小权限原则
- **数据加密**: 敏感数据自动加密
- **日志清理**: 自动清理过期日志

## 🆘 故障排除

### 常见问题

**Q: 命令未找到**
```bash
# 确保脚本有执行权限
chmod +x ~/.ai-assistant/scripts/*.sh

# 重新加载 shell 配置
source ~/.zshrc
```

**Q: 权限拒绝**
```bash
# 检查文件权限
ls -la ~/.ai-assistant/

# 重新设置权限
chmod 755 ~/.ai-assistant/scripts/
```

**Q: 配置文件损坏**
```bash
# 重新生成配置
cp ~/.ai-assistant/config.sh ~/.ai-assistant/config.sh.backup
# 然后重新运行安装脚本
```

## 📞 技术支持

如遇到问题，请检查:
1. 配置文件是否正确
2. 脚本权限是否设置
3. 依赖工具是否安装
4. 系统环境是否支持

## 🎉 更新日志

### v1.0.0 (2025-11-07)
- 🎉 首次发布
- ✨ 项目管理功能
- 🛠️ 开发环境检查
- 📦 自动备份系统
- 🤖 AI 智能建议

---

**AI 私人助理** - 让开发更智能，让工作更高效！ 🚀
## 🚀 快速访问命令

现在您可以使用以下命令快速访问 AI 私人助理：

```bash
# 英文命令
ai

# 中文命令
助理
```

两个命令完全等效，选择您喜欢的方式即可！

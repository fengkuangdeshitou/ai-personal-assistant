# 🤖 AI 私人助理

一个功能强大的开发者助手系统，集成了实时数据统计、工作记录追踪、智能对话和快速工具。

## 🚀 快速启动

### 使用 Homebrew 一键安装（推荐）
```bash
# 安装 AI 私人助理
brew install ai

# 启动应用
ai
```

### 一键安装和卸载
```bash
# 安装所有依赖
./scripts/ai-install

# 卸载应用
./scripts/ai-uninstall

# 跨设备安装（推荐）
./install.sh

# 独立安装（无需克隆项目）
curl -fsSL https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/install-standalone.sh | bash
```

### 桌面应用程序
```bash
# 构建 Windows EXE
cd frontend && npm run build-win

# 或使用专用脚本
./scripts/build-windows-exe.sh
```

### 使用 macOS App（推荐）
```bash
# 双击打开
AI助理.app

# 或在终端输入
助理
```

### 使用启动脚本
```bash
./scripts/launch.sh
```

### 手动启动
```bash
# 启动后端服务
cd server && node server.js

# 打开前端页面
open index.html
```

## 🎯 核心功能

- **📊 实时数据统计**: 真实的 Git 提交历史和代码统计
- **💼 工作记录时间线**: 基于 Git 提交的工作记录追踪
- **⏰ 桌面提醒系统**: 系统级通知，开机自启动
- **🚀 快速开发工具**: 项目管理、环境检查、备份功能
- **💬 智能 AI 对话**: 基于真实数据回答问题
- **⚙️ 配置管理**: 个性化设置和 GitHub 集成

## 📋 命令行工具

| 命令 | 说明 |
|------|------|
| `ai` / `助理` | 打开 GUI 界面 |
| `ai-help` | 显示帮助信息 |
| `ai-update` | 检查更新 |
| `ai-install` | 一键安装 |
| `ai-uninstall` | 一键卸载 |

## 📖 详细文档

- [安装指南](INSTALL.md)
- [直接安装指南](DIRECT_INSTALL.md)
- [Windows EXE 打包指南](WINDOWS_BUILD_GUIDE.md)
- [团队部署指南](TEAM_DEPLOYMENT.md)
- [多渠道构建系统](README-CHANNELS.md)
- [服务器端文档](server/README.md)

## 🔧 技术栈

- **后端**: Node.js + Express
- **前端**: HTML/CSS/JavaScript
- **存储**: OSS (阿里云对象存储)
- **版本控制**: Git

---

**当前版本**: v1.7.0

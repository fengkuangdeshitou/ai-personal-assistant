# AI 私人助理 - 安装指南

## 🌐 跨设备安装（推荐）

### 适用场景
- 在新电脑上安装AI助手
- 在多台设备间同步安装
- 团队成员安装

### 安装步骤

#### 1. 下载项目代码
```bash
# 克隆私有仓库（需要访问权限）
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git
cd ai-personal-assistant
```

#### 2. 运行跨设备安装脚本
```bash
# 自动设置brew tap和安装
./install.sh
```

#### 3. 使用AI助手
```bash
# 启动应用
ai

# 或使用其他命令
ai-launch            # 启动服务
ai-install           # 重新安装依赖
ai-uninstall         # 卸载应用
```

### 脚本功能
- ✅ 检查并安装Homebrew
- ✅ 创建本地brew tap
- ✅ 配置formula文件
- ✅ 可选立即安装AI助手

## 📦 Homebrew 一键安装

### 直接安装（推荐）
```bash
# 安装 AI 私人助理
brew install ai

# 启动应用
ai
```

### 私有仓库说明
⚠️ **重要**: 此仓库为私有仓库，安装时需要有效的GitHub访问令牌。

#### 设置GitHub Token
```bash
# 设置GitHub Token (用于访问私有仓库)
export HOMEBREW_GITHUB_API_TOKEN=your_github_token_here

# 或添加到 ~/.zshrc 或 ~/.bash_profile
echo 'export HOMEBREW_GITHUB_API_TOKEN=your_github_token_here' >> ~/.zshrc
source ~/.zshrc
```

## 🔧 手动安装

### 运行安装脚本
```bash
# 进入项目目录
cd /path/to/ai-personal-assistant

# 运行一键安装脚本
./scripts/ai-install
```

### 安装脚本功能
- ✅ 检查并安装 Homebrew
- ✅ 检查并安装 Node.js (v16+)
- ✅ 检查并安装 GitHub CLI
- ✅ 检查并安装 watchman
- ✅ 安装前端和后端依赖
- ✅ 构建前端应用
- ✅ 创建必要的配置文件
- ✅ 设置脚本执行权限
- ✅ 可选：创建桌面快捷方式

## 🗑️ 卸载

### 使用卸载脚本
```bash
# 运行一键卸载脚本
./scripts/ai-uninstall
```

### 卸载脚本功能
- ✅ 停止所有运行中的服务
- ✅ 删除日志文件
- ✅ 清理 node_modules 和构建文件
- ✅ 可选：删除配置文件
- ✅ 删除桌面快捷方式
- ✅ 清理 LaunchAgents
- ✅ 可选：卸载安装的软件
- ✅ 可选：删除整个项目目录

## ⚙️ 配置

### 环境变量
创建 `server/.env` 文件配置以下选项：

```bash
# 服务器端口
PORT=5178

# 环境
NODE_ENV=production

# GitHub 配置 (可选)
GITHUB_TOKEN=your_github_token_here

# 阿里云配置 (可选)
ALICLOUD_ACCESS_KEY_ID=your_access_key
ALICLOUD_ACCESS_KEY_SECRET=your_secret
```

### 日志位置
- 日志文件：`~/.ai-assistant/logs/`
- 临时日志：`/tmp/ai-assistant-*.log`

## 🚀 启动方式

### 1. GUI 启动
```bash
# 双击桌面图标或运行
AI助理.command
# 或
ai-assistant
```

### 2. 命令行启动
```bash
# 启动所有服务
./scripts/launch.sh
```

### 3. 手动启动
```bash
# 启动后端
cd server && node server.js

# 启动前端
cd frontend && npm start
```

## 🔍 故障排除

### 常见问题

1. **Node.js 版本问题**
   ```bash
   # 检查版本
   node --version
   # 升级 Node.js
   brew upgrade node
   ```

2. **端口占用**
   ```bash
   # 检查端口
   lsof -i :5178
   lsof -i :3000
   # 杀死进程
   kill -9 <PID>
   ```

3. **权限问题**
   ```bash
   # 设置执行权限
   chmod +x scripts/*.sh
   chmod +x AI助理.command
   ```

4. **依赖安装失败**
   ```bash
   # 清理缓存重新安装
   cd frontend && rm -rf node_modules && npm install
   cd ../server && rm -rf node_modules && npm install
   ```

## 📞 支持

如果遇到问题，请查看：
- [GitHub Issues](https://github.com/fengkuangdeshitou/ai-personal-assistant/issues)
- 项目 README.md
- 服务器端文档：`server/README.md`
# 🤖 AI 私人助理 - 完整使用指南

## 项目概述

AI 私人助理是一个功能强大的开发者助手系统，集成了实时数据统计、工作记录追踪、智能对话和快速工具，帮助提高开发效率。

**当前版本**: v1.7.0  
**仓库地址**: https://github.com/fengkuangdeshitou/ai-personal-assistant

**🎉 新功能**: 现在显示真实的 Git 提交历史数据！

---

## 🚀 快速启动

### 方式一：使用 macOS App（最推荐）

```bash
# 双击打开
AI助理.app

# 或在终端输入
助理
```

### 方式二：使用启动脚本

```bash
./launch.sh
```

此脚本会：
- ✅ 自动检查并启动后端服务
- ✅ 自动打开 GUI 页面
- ✅ 静默运行，无干扰

### 方式三：手动启动

1. 启动后端服务：
```bash
cd server
node server.js
```

2. 打开前端页面：
```bash
open index.html
```

---

## 🎯 核心功能

### 1. 实时数据统计 📊 ✨ 新功能
- **真实 Git 数据**: 从本地所有 Git 仓库获取实际提交历史
- **精确统计**: 显示真实的代码行数变化（插入+删除）
- **多项目支持**: 聚合显示所有项目的数据
- **智能回退**: 本地数据不可用时自动使用 GitHub API
- 今日代码行数和提交次数
- 工作时长自动计算
- 生产力指数实时更新

### 2. 工作记录时间线 💼 ✨ 增强
- **真实提交历史**: 显示本地所有 Git 仓库的提交记录
- **详细信息**: 包含项目名、作者、哈希值
- **代码统计**: 显示每次提交的插入/删除行数
- **文件列表**: 显示修改的文件（最多5个）
- 基于 Git 提交的工作记录
- 自动标记上班、午休、下班时间
- 显示提交详情（作者、SHA、消息）
- 统计今日提交次数和工作时长

### 3. 桌面提醒系统 ⏰ **NEW!**
- **即使 GUI 未打开也能提醒**
- 系统级通知（macOS）
- 四个关键时间点自动提醒：
  - 09:30 ☕ 早安提醒
  - 12:30 🍱 午休提醒
  - 14:00 💼 下午工作
  - 18:30 🎉 下班提醒
- 后台服务，开机自启动
- 详见 `server/REMINDER_README.md`

### 4. 快速开发工具 🚀
- **新建项目**: 交互式创建并初始化项目
- **项目列表**: 显示 GitHub 最近更新的仓库
- **环境检查**: 检测浏览器、系统、网络信息
- **备份项目**: 生成完整备份命令
- **打开 VS Code**: 多种方式启动编辑器

### 5. 智能 AI 对话 💬
- 基于真实数据回答问题
- 支持工作查询、项目管理、时间管理
- 自然语言交互
- 一键刷新数据

### 6. 配置管理 ⚙️
- 个性化设置（用户名、工作时间）
- GitHub 集成（仓库配置、Token）
- 自动刷新设置
- 数据导出和备份

### 7. 美化界面 🎨
- 自定义模态弹框
- 流畅动画效果
- 响应式设计
- 现代化 UI

---

## 🚀 快速开始

### 安装方法

#### 自动安装（推荐）

```bash
# 1. 克隆仓库到 home 目录
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git ~/.ai-assistant

# 2. 运行安装脚本
bash ~/.ai-assistant/scripts/install.sh

# 3. 重新加载 shell 配置
source ~/.zshrc  # 或 source ~/.bash_profile
```

#### 手动安装

```bash
# 1. 克隆仓库
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git ~/.ai-assistant

# 2. 添加执行权限
chmod +x ~/.ai-assistant/scripts/*.sh

# 3. 编辑 shell 配置文件
# 对于 Zsh（macOS Catalina+）
echo 'export AI_ASSISTANT_HOME="$HOME/.ai-assistant"' >> ~/.zshrc
echo 'alias ai="bash $AI_ASSISTANT_HOME/scripts/open-gui.sh"' >> ~/.zshrc
echo 'alias 助理="bash $AI_ASSISTANT_HOME/scripts/open-gui.sh"' >> ~/.zshrc
echo 'alias ai-help="bash $AI_ASSISTANT_HOME/scripts/help.sh"' >> ~/.zshrc
echo 'alias ai-update="bash $AI_ASSISTANT_HOME/scripts/update.sh"' >> ~/.zshrc

# 对于 Bash
echo 'export AI_ASSISTANT_HOME="$HOME/.ai-assistant"' >> ~/.bash_profile
echo 'alias ai="bash $AI_ASSISTANT_HOME/scripts/open-gui.sh"' >> ~/.bash_profile
echo 'alias 助理="bash $AI_ASSISTANT_HOME/scripts/open-gui.sh"' >> ~/.bash_profile
echo 'alias ai-help="bash $AI_ASSISTANT_HOME/scripts/help.sh"' >> ~/.bash_profile
echo 'alias ai-update="bash $AI_ASSISTANT_HOME/scripts/update.sh"' >> ~/.bash_profile

# 4. 重新加载配置
source ~/.zshrc  # 或 source ~/.bash_profile
```

### 首次使用

```bash
# 打开 GUI 界面
ai

# 或使用中文命令
助理

# 查看帮助
ai-help

# 检查更新
ai-update
```

---

## 📋 命令行工具

### 主要命令

| 命令 | 说明 | 用法 |
|------|------|------|
| `ai` | 打开 AI 助理 GUI | `ai` |
| `助理` | 打开 GUI（中文） | `助理` |
| `ai-help` | 显示帮助信息 | `ai-help` |
| `ai-update` | 检查更新 | `ai-update` |
| `ai-config` | 编辑配置 | `ai-config` |

### 快速导航

| 命令 | 说明 | 等同于 |
|------|------|--------|
| `ai-dir` | 进入主目录 | `cd ~/.ai-assistant` |
| `ai-gui` | 进入 GUI 目录 | `cd ~/.ai-assistant/gui` |
| `ai-scripts` | 进入脚本目录 | `cd ~/.ai-assistant/scripts` |

---

## 📖 详细使用说明

### 1. 数据统计

#### 查看今日统计
1. 打开 GUI (`ai` 命令)
2. 左侧面板自动显示：
   - 今日提交次数
   - 代码行数
   - 工作时长
   - 生产力指数

#### 查看详细图表
1. 点击"数据统计"选项卡
2. 查看本周趋势图表
3. 点击刷新按钮更新数据

#### 数据来源
- **GitHub API**: 真实的 Git 提交数据
- **本地计算**: 基于提交时间计算工作时长
- **智能分析**: 自动生成生产力指数

### 2. 工作记录

#### 查看时间线
1. 点击"工作记录"选项卡
2. 自动显示今日所有提交
3. 时间线包括：
   - 提交时间
   - 提交消息
   - 提交作者
   - 提交 SHA

#### 工作时长统计
- 自动计算上班到下班时长
- 智能标记关键时间点：
  - 🌅 上班打卡
  - 🍜 午休时间
  - 🌙 下班时间

#### 数据更新
- 点击"刷新时间线"按钮
- 或启用自动刷新功能
- 每次提交后会自动更新

### 3. 快速工具

#### 新建项目
1. 点击"新建项目"
2. 输入项目名称和描述
3. 选择项目路径
4. 自动生成并复制 Git 初始化命令：
   ```bash
   mkdir project-name
   cd project-name
   git init
   echo "# project-name" > README.md
   git add .
   git commit -m "Initial commit"
   ```
5. 在终端粘贴执行

#### 查看项目列表
1. 点击"项目列表"
2. 显示 GitHub 最近更新的 10 个仓库
3. 点击仓库卡片在新窗口打开
4. 包含仓库信息：
   - 仓库名称和描述
   - 主要语言
   - Stars 数量
   - 最后更新时间

#### 环境检查
1. 点击"环境检查"
2. 弹出美化的信息窗口显示：
   - 浏览器类型和版本
   - 操作系统
   - 屏幕分辨率
   - 当前时间
   - 时区信息
   - 在线状态

#### 备份项目
1. 点击"备份项目"
2. 输入项目路径
3. 自动生成备份命令：
   ```bash
   # 压缩备份
   tar -czf backup-20240101.tar.gz /path/to/project
   
   # 移动到备份目录
   mv backup-20240101.tar.gz ~/Backups/
   
   # 推送到远程
   git push --all origin
   ```
4. 复制命令到终端执行

#### 打开 VS Code
- **方法 1**: 命令行打开当前目录
  ```bash
  code .
  ```
- **方法 2**: 打开指定文件
  ```bash
  code filename.js
  ```
- **方法 3**: 使用 URL scheme
  ```
  vscode://file/path/to/file
  ```

### 4. AI 对话

#### 支持的问题类型

**工作查询**:
- "今天做了什么？"
- "今日工作内容"
- "今天的工作"

**代码统计**:
- "代码统计"
- "今日统计"
- "数据统计"

**时间管理**:
- "工作多久了？"
- "工作时长"
- "现在几点？"
- "当前时间"

**数据刷新**:
- "刷新数据"
- "更新数据"
- "重新加载"

#### 使用方法
1. 点击"AI 对话"选项卡
2. 在输入框输入问题
3. 按回车或点击发送
4. AI 基于真实数据回答
5. 查看对话历史

### 5. 配置管理

#### 基本设置

**修改用户名**:
1. 点击"设置"选项卡
2. 找到"个性化称呼"
3. 输入新的名称
4. 点击保存
5. 界面问候语立即更新

**工作时间设置**:
1. 点击"工作时间设置"
2. 设置上班时间（默认 09:00）
3. 设置下班时间（默认 18:00）
4. 保存后自动计算工作时长

**自动刷新**:
1. 启用"自动刷新数据"
2. 设置刷新间隔（建议 30 分钟）
3. 数据将自动更新

#### GitHub 配置

**基本配置**:
1. 点击"GitHub 配置"
2. 输入 GitHub 用户名
3. 输入默认仓库名
4. 保存设置

**配置 Token（提高 API 限制）**:
1. 访问 https://github.com/settings/tokens
2. 点击"Generate new token (classic)"
3. 选择权限：`public_repo`
4. 生成并复制 Token
5. 在设置中粘贴 Token
6. 保存后 API 限制提升：
   - 无 Token: 60 次/小时
   - 有 Token: 5000 次/小时

#### 数据管理

**导出数据**:
1. 点击"导出数据"按钮
2. 自动下载 JSON 文件
3. 包含所有设置和统计数据
4. 用于备份或迁移

**清除缓存**:
1. 点击"清除缓存"按钮
2. 确认清除
3. 清除内容：
   - Git 统计缓存
   - 提交记录缓存
   - 保留用户设置
4. 刷新数据后重新缓存

#### 系统信息

查看当前系统信息：
- 版本号
- 浏览器类型
- 操作系统
- 同步状态
- 最后更新时间

---

## 🎯 使用场景

### 场景 1: 日常开发流程

**早上开始工作**:
```bash
# 1. 打开助理查看昨日工作
ai

# 2. 查看工作记录和统计
# （在 GUI 中操作）

# 3. 开始编码
code .

# 4. 提交代码
git add .
git commit -m "feat: 实现新功能"
git push

# 5. GUI 自动刷新显示最新提交
```

**中午休息**:
- 工作记录自动标记午休时间
- 统计上午工作时长和提交次数

**下午继续**:
- 查看上午完成的工作
- 继续开发和提交
- 实时查看代码行数统计

**下班前**:
- 导出今日数据
- 查看生产力指数
- 备份重要项目

### 场景 2: 项目管理

**新建项目**:
```bash
# 1. 打开助理
ai

# 2. 使用快速工具 → 新建项目
# 3. 输入项目信息
# 4. 复制生成的命令
# 5. 在终端执行初始化
```

**管理多个项目**:
```bash
# 1. 查看项目列表
# （在 GUI 中点击"项目列表"）

# 2. 快速打开项目
# （点击仓库卡片）

# 3. 检查项目环境
# （使用"环境检查"工具）

# 4. 定期备份
# （使用"备份项目"工具）
```

### 场景 3: 团队协作

**查看团队进度**:
1. 配置团队仓库
2. 查看提交统计
3. 追踪工作记录
4. 导出数据用于汇报

**代码审查**:
1. 查看项目列表
2. 点击仓库打开 GitHub
3. 进行 Code Review
4. 记录审查时间

---

## 💡 最佳实践

### 1. 每日工作流程

✅ **推荐流程**:
```bash
# 早上
ai                    # 打开助理
# 查看昨日工作总结
# 计划今日任务

# 开发中
# 定期提交代码
# Git 提交会自动记录

# 下班前
# 导出今日数据
# 备份重要项目
```

### 2. 配置优化

✅ **必做配置**:
- [ ] 配置 GitHub 用户名和仓库
- [ ] 设置工作时间（上下班时间）
- [ ] 配置个性化称呼
- [ ] 启用自动刷新（30 分钟）

✅ **可选配置**:
- [ ] 配置 GitHub Token（提高 API 限制）
- [ ] 自定义刷新间隔
- [ ] 配置多个常用仓库

### 3. 数据管理

✅ **定期维护**:
- 每周导出数据备份
- 每月清理缓存
- 定期检查更新
- 备份配置文件

### 4. 效率技巧

✅ **快捷操作**:
```bash
ai              # 快速打开 GUI
ai-help         # 查看帮助
助理             # 中文命令
```

✅ **快速查询**:
- 使用 AI 对话快速获取信息
- 利用快速工具管理项目
- 查看工作记录进行复盘

---

## 🐛 常见问题

### Q1: 命令不可用

**问题**: 输入 `ai` 提示 "command not found"

**原因**: Shell 配置未加载或路径错误

**解决方案**:
```bash
# 方案 1: 重新加载配置
source ~/.zshrc  # 或 source ~/.bash_profile

# 方案 2: 检查别名
which ai
alias | grep ai

# 方案 3: 重新安装
bash ~/.ai-assistant/scripts/install.sh
```

### Q2: API 请求限制

**问题**: 显示 "API rate limit exceeded"

**原因**: GitHub API 默认限制 60 次/小时

**解决方案**:
```bash
# 配置 Personal Access Token
# 1. 访问 https://github.com/settings/tokens
# 2. 生成 Token（权限：public_repo）
# 3. 在 GUI 设置中配置 Token
# 4. 限制提升到 5000 次/小时
```

### Q3: 数据不更新

**问题**: 统计数据不显示或不更新

**原因**: 可能是缓存或网络问题

**解决方案**:
```bash
# 方案 1: 点击刷新按钮
# （GUI 右上角刷新图标）

# 方案 2: 清除缓存
# 设置 → 清除缓存

# 方案 3: 检查网络
# 使用"环境检查"工具

# 方案 4: 检查配置
# 确认 GitHub 用户名和仓库名正确
```

### Q4: GUI 打不开

**问题**: 运行 `ai` 后浏览器没有打开

**原因**: 浏览器路径配置问题

**解决方案**:
```bash
# macOS
open ~/.ai-assistant/gui/index.html

# Linux
xdg-open ~/.ai-assistant/gui/index.html

# 或直接在浏览器打开文件
# file:///Users/yourusername/.ai-assistant/gui/index.html
```

### Q5: 工作记录为空

**问题**: 工作记录没有显示提交

**原因**: 今日可能还没有提交

**解决方案**:
```bash
# 1. 确认今天有提交
git log --since="today"

# 2. 检查仓库配置
# 确认配置的是当前工作的仓库

# 3. 手动刷新
# 点击"刷新时间线"按钮
```

---

## 🔧 高级技巧

### 1. 自定义配置文件

编辑 `config.js` 自定义配置:

```javascript
const CONFIG = {
    user: {
        name: '你的名字',
        github: {
            username: 'your-username',
            defaultRepo: 'your-repo'
        }
    },
    workTime: {
        start: '09:00',
        end: '18:00'
    },
    autoRefresh: {
        enabled: true,
        interval: 30
    }
};
```

### 2. 批量管理多个仓库

创建脚本批量获取数据:

```bash
# 在 ~/.ai-assistant/scripts/ 创建 sync-all.sh
#!/bin/bash
repos=("repo1" "repo2" "repo3")
for repo in "${repos[@]}"; do
    echo "Syncing $repo..."
    # 你的同步逻辑
done
```

### 3. 集成其他工具

**集成 Slack**:
```bash
# 将每日统计发送到 Slack
# 在 crontab 中添加定时任务
0 18 * * * bash ~/.ai-assistant/scripts/send-daily-report.sh
```

**集成 Notion**:
- 使用 Notion API 导入数据
- 创建工作日志数据库
- 自动同步统计信息

---

## 📂 项目结构

```
~/.ai-assistant/
├── gui/                          # GUI 界面文件
│   ├── index.html               # 主界面文件（包含所有功能）
│   ├── config.js                # 配置文件（可自定义）
│   ├── UPDATES.md               # 更新日志
│   └── README.md                # GUI 使用说明（本文件）
├── scripts/                      # 脚本文件
│   ├── install.sh               # 安装脚本
│   ├── open-gui.sh              # GUI 启动脚本
│   ├── help.sh                  # 帮助信息脚本
│   ├── update.sh                # 更新检查脚本
│   └── README.md                # 脚本文档
└── README.md                     # 项目主文档
```

### 文件说明

**index.html** (2700+ 行):
- 包含完整的 HTML、CSS、JavaScript
- 所有功能都在这一个文件中
- 无需额外依赖
- 可直接在浏览器打开

**config.js**:
- 用户自定义配置
- 包含默认设置
- 提供辅助函数
- 可根据需求修改

**UPDATES.md**:
- 详细的版本更新记录
- 功能变更说明
- 修复的问题列表

**scripts/**:
- Shell 脚本集合
- 提供命令行工具
- 自动化安装和更新
- 跨平台支持

---

## 🆕 更新日志

### v1.6.0 (Latest)
✨ **新功能**:
- 完整的命令行工具集
- 自动安装脚本
- 一键打开 GUI (`ai` 命令)
- 帮助系统 (`ai-help`)
- 更新检查 (`ai-update`)

🎨 **UI 改进**:
- 美化所有模态弹框
- 优化动画效果
- 响应式设计改进

🐛 **问题修复**:
- 修复数据刷新问题
- 优化 API 调用
- 改进错误处理

详细更新记录请查看 [UPDATES.md](UPDATES.md)

---

## 🔗 相关链接

- **GitHub 仓库**: https://github.com/fengkuangdeshitou/ai-personal-assistant
- **问题反馈**: https://github.com/fengkuangdeshitou/ai-personal-assistant/issues
- **脚本文档**: [scripts/README.md](../scripts/README.md)
- **更新日志**: [UPDATES.md](UPDATES.md)

---

## 📞 获取帮助

### 命令行帮助
```bash
ai-help         # 查看帮助信息
ai-update       # 检查更新
```

### 在线支持
- 提交 Issue: https://github.com/fengkuangdeshitou/ai-personal-assistant/issues
- 查看文档: https://github.com/fengkuangdeshitou/ai-personal-assistant

### 社区
- GitHub Discussions
- 问题反馈
- 功能建议

---

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

特别感谢：
- GitHub API 提供的数据支持
- 开源社区的帮助和建议
- 所有用户的反馈和支持

---

<div align="center">

**⭐ 如果觉得有用，请给项目点个 Star ⭐**

Made with ❤️ by [fengkuangdeshitou](https://github.com/fengkuangdeshitou)

[⬆ 回到顶部](#-ai-私人助理---完整使用指南)

</div>

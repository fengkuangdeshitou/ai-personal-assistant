# AI 私人助理 - 团队部署指南

## 🎯 团队部署场景

### 适用情况
- 开发团队需要统一安装AI助手
- 多台设备需要同步配置
- CI/CD环境集成

## 📋 部署步骤

### 方式1：使用跨设备安装脚本（推荐）

#### 1. 准备工作
```bash
# 确保所有团队成员有仓库访问权限
# 设置GitHub Token（如果需要）
export HOMEBREW_GITHUB_API_TOKEN=your_team_token
```

#### 2. 在每台设备上执行
```bash
# 克隆项目
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git
cd ai-personal-assistant

# 运行跨设备安装
./install.sh

# 验证安装
ai --version
```

### 方式2：手动设置brew tap

#### 1. 下载项目
```bash
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git
cd ai-personal-assistant
```

#### 2. 设置本地tap
```bash
# 创建本地tap
brew tap-new local/ai

# 复制formula
cp ai.rb $(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/

# 修改为本地路径
PROJECT_PATH=$(pwd)
sed -i '' "s|url \".*\"|url \"file://$PROJECT_PATH\", :using => :git|" $(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb
```

#### 3. 安装
```bash
brew install ai
```

## 🔧 配置管理

### 环境变量
为团队创建统一的配置文件：

```bash
# 创建团队配置
cat > ~/.ai-assistant-team-config << EOF
# AI助手团队配置
GITHUB_TOKEN=team_github_token
NODE_ENV=production
LOG_LEVEL=info
EOF

# 在启动脚本中加载
source ~/.ai-assistant-team-config
```

### 共享配置
```bash
# 服务器配置（如果有）
cp server/oss-connection-config.json /shared/config/
cp server/channel-config.json /shared/config/

# 符号链接到共享配置
ln -sf /shared/config/oss-connection-config.json server/
ln -sf /shared/config/channel-config.json server/
```

## 🚀 批量部署

### 使用脚本批量安装
```bash
#!/bin/bash
# batch-install.sh

DEVICES=("macbook-pro-1" "macbook-pro-2" "imac-studio")
REPO_URL="https://github.com/fengkuangdeshitou/ai-personal-assistant.git"

for device in "${DEVICES[@]}"; do
    echo "📦 部署到 $device..."
    ssh $device << EOF
        git clone $REPO_URL
        cd ai-personal-assistant
        ./install.sh
        echo "✅ $device 部署完成"
EOF
done
```

### Ansible自动化部署
```yaml
# deploy-ai-assistant.yml
---
- name: Deploy AI Assistant
  hosts: development_machines
  tasks:
    - name: Clone repository
      git:
        repo: https://github.com/fengkuangdeshitou/ai-personal-assistant.git
        dest: ~/ai-personal-assistant

    - name: Run cross-device installer
      command: ./install.sh
      args:
        chdir: ~/ai-personal-assistant

    - name: Verify installation
      command: ai --version
```

## 🔍 验证安装

### 检查安装状态
```bash
# 检查brew tap
brew tap

# 检查安装的formula
brew list | grep ai

# 检查命令可用性
which ai
ai --help

# 检查服务状态
brew services list | grep ai
```

### 功能测试
```bash
# 测试基本功能
ai

# 测试后端服务
curl http://localhost:5178/api/health

# 测试前端
curl http://localhost:3000
```

## 🛠️ 故障排除

### 常见问题

1. **权限问题**
   ```bash
   # 修复脚本权限
   chmod +x install.sh
   chmod +x scripts/*.sh
   ```

2. **Tap已存在**
   ```bash
   # 清理旧tap
   brew untap local/ai
   rm -rf $(brew --prefix)/Library/Taps/local/homebrew-ai
   ```

3. **依赖冲突**
   ```bash
   # 更新brew
   brew update
   brew upgrade

   # 清理缓存
   brew cleanup
   ```

4. **网络问题**
   ```bash
   # 检查网络连接
   ping github.com

   # 设置代理（如果需要）
   export http_proxy=http://proxy.company.com:8080
   export https_proxy=http://proxy.company.com:8080
   ```

## 📊 监控和维护

### 日志管理
```bash
# 查看日志
tail -f ~/.ai-assistant/logs/*.log

# 日志轮转
logrotate -f /etc/logrotate.d/ai-assistant
```

### 更新管理
```bash
# 检查更新
cd ~/ai-personal-assistant
git pull

# 重新安装
brew reinstall ai
```

### 性能监控
```bash
# 检查资源使用
ps aux | grep ai
top -pid $(pgrep -f ai)

# 检查端口占用
lsof -i :5178
lsof -i :3000
```

## 📞 支持

如果在团队部署过程中遇到问题：
1. 检查此文档的故障排除部分
2. 查看项目GitHub Issues
3. 联系技术支持团队
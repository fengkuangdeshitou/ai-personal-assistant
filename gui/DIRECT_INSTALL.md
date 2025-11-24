# AI 私人助理 - 直接安装指南

## 🚀 直接安装（无需克隆项目）

### 方式1：添加公开Tap（推荐）

如果项目有公开的tap仓库，可以直接安装：

```bash
# 添加AI助手tap
brew tap fengkuangdeshitou/ai-assistant

# 直接安装
brew install ai

# 启动
ai
```

### 方式2：一键独立安装脚本（推荐）

下载并运行独立安装脚本，无需克隆项目：

```bash
# 下载独立安装脚本
curl -fsSL https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/install-standalone.sh -o install-standalone.sh

# 运行安装脚本
chmod +x install-standalone.sh
./install-standalone.sh
```

**脚本功能**：
- ✅ 自动下载必要文件
- ✅ 检查并安装Homebrew
- ✅ 创建本地brew tap
- ✅ 配置formula文件
- ✅ 可选立即安装AI助手
- ✅ 自动清理临时文件

### 方式3：手动设置本地Tap

如果需要完全离线安装：

```bash
# 创建本地tap
brew tap-new local/ai

# 下载formula文件
curl -fsSL https://raw.githubusercontent.com/fengkuangdeshitou/ai-personal-assistant/main/ai.rb -o $(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb

# 安装（需要先克隆项目到本地）
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git ~/ai-assistant-source
sed -i '' "s|file:///Users/[^/]*/\.ai-assistant/gui|file://$HOME/ai-assistant-source|" $(brew --prefix)/Library/Taps/local/homebrew-ai/Formula/ai.rb

# 安装
brew install ai
```

## 📦 创建公开Tap仓库

要支持直接 `brew install ai`，需要创建一个公开的GitHub仓库作为tap：

### 1. 创建Tap仓库
```bash
# 创建新的GitHub仓库
# 命名：homebrew-ai-assistant

# 本地创建tap
brew tap-new ai-assistant
cd $(brew --prefix)/Library/Taps/fengkuangdeshitou/homebrew-ai-assistant

# 添加formula
cat > Formula/ai.rb << 'EOF'
class Ai < Formula
  desc "AI Personal Assistant - A powerful developer assistant system"
  homepage "https://github.com/fengkuangdeshitou/ai-personal-assistant"

  # 使用GitHub releases
  url "https://github.com/fengkuangdeshitou/ai-personal-assistant/archive/refs/tags/v1.6.65.tar.gz"
  sha256 "PLACEHOLDER_SHA256"  # 需要计算实际的sha256

  license "MIT"

  depends_on "node" => :recommended
  depends_on "gh" => :recommended

  def install
    # 安装脚本到 bin 目录
    bin.install "scripts/ai-install" => "ai-install"
    bin.install "scripts/ai-uninstall" => "ai-uninstall"
    bin.install "scripts/launch.sh" => "ai-launch"
    bin.install "AI助理.command" => "ai"

    # 复制整个项目到 prefix 目录
    prefix.install Dir["*"]

    # 创建配置文件目录
    (var/"ai-assistant").mkpath
    (var/"ai-assistant/logs").mkpath
  end

  def caveats
    <<~EOS
      AI Personal Assistant 已安装！

      🚀 启动方式：
        ai                    # 启动 GUI 界面
        ai-launch            # 启动服务
        ai-install           # 重新安装依赖
        ai-uninstall         # 卸载应用

      📁 项目位置：#{prefix}
      📋 日志位置：#{var}/ai-assistant/logs

      📖 更多信息：https://github.com/fengkuangdeshitou/ai-personal-assistant
    EOS
  end

  test do
    assert_predicate bin/"ai-install", :exist?
    assert_predicate bin/"ai-uninstall", :exist?
    assert_predicate bin/"ai", :exist?
  end
end
EOF

# 提交到GitHub
git add .
git commit -m "Add AI assistant formula"
git push origin main
```

### 2. 使用公开Tap
```bash
# 用户现在可以直接安装
brew tap fengkuangdeshitou/ai-assistant
brew install ai
```

## 🔧 当前限制

由于项目是私有的，目前不支持完全不克隆项目的直接安装。建议使用以下方案：

### 推荐方案：混合安装
```bash
# 1. 克隆项目（获取最新代码）
git clone https://github.com/fengkuangdeshitou/ai-personal-assistant.git
cd ai-personal-assistant

# 2. 运行一键安装
./install.sh

# 3. 现在可以直接使用 brew install ai
brew install ai
```

### 临时方案：创建本地Bottle
```bash
# 在有项目代码的机器上创建bottle
cd ai-personal-assistant
brew install --build-bottle ai
brew bottle ai

# 将生成的bottle文件分享给其他用户
# 其他用户可以直接安装bottle
brew install ./ai--1.6.65.arm64_sonoma.bottle.tar.gz
```

## 📋 总结

**当前最佳方案**：
1. 克隆项目 → 运行 `./install.sh` → 使用 `brew install ai`

**未来支持直接安装**：
- 创建公开tap仓库
- 发布正式releases
- 用户可以直接 `brew tap && brew install`

这样既保证了私有仓库的安全性，又提供了便捷的安装方式。
class Ai < Formula
  desc "AI Personal Assistant - A powerful developer assistant system"
  homepage "https://github.com/fengkuangdeshitou/ai-personal-assistant"
  url "https://github.com/fengkuangdeshitou/ai-personal-assistant/archive/refs/tags/v1.6.65.tar.gz"
  sha256 "PLACEHOLDER_SHA256"  # 需要根据实际发布版本更新
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
    # 基本测试
    assert_predicate bin/"ai-install", :exist?
    assert_predicate bin/"ai-uninstall", :exist?
    assert_predicate bin/"ai", :exist?
  end
end
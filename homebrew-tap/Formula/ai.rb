class Ai < Formula
  desc "AI Personal Assistant - Intelligent Dev Partner"
  homepage "https://github.com/fengkuangdeshitou/ai-personal-assistant"
  url "https://github.com/fengkuangdeshitou/ai-personal-assistant/archive/refs/heads/main.zip"
  version "1.7.0"
  license "MIT"

  depends_on "node" => :recommended
  depends_on "git" => :recommended

  def install
    # 安装到用户目录而不是系统目录
    ai_home = "#{ENV['HOME']}/.ai-assistant"

    # 复制所有文件到安装目录
    prefix.install Dir["*"]

    # 创建启动脚本
    (bin/"ai").write <<~EOS
      #!/bin/bash
      # AI Personal Assistant Launcher
      set -e

      AI_HOME="#{ai_home}"

      # Check if installed
      if [ ! -d "$AI_HOME" ]; then
        echo "AI Assistant not found. Installing..."
        mkdir -p "$AI_HOME"
        cp -r "#{prefix}"/* "$AI_HOME/"
        cd "$AI_HOME/gui/server"
        npm install --production
      fi

      # Launch the assistant
      exec bash "$AI_HOME/scripts/open-gui.sh" "$@"
    EOS

    (bin/"ai-install").write <<~EOS
      #!/bin/bash
      AI_HOME="#{ai_home}"
      # 运行原始安装脚本（包含密码验证）
      exec bash "$AI_HOME/scripts/install.sh" "$@"
    EOS

    (bin/"ai-uninstall").write <<~EOS
      #!/bin/bash
      AI_HOME="#{ai_home}"
      exec bash "$AI_HOME/scripts/uninstall.sh" "$@"
    EOS

    (bin/"ai-help").write <<~EOS
      #!/bin/bash
      AI_HOME="#{ai_home}"
      exec bash "$AI_HOME/scripts/help.sh" "$@"
    EOS

    (bin/"ai-password").write <<~EOS
      #!/bin/bash
      AI_HOME="#{ai_home}"
      exec bash "$AI_HOME/scripts/change-password.sh" "$@"
    EOS

    # 设置执行权限
    chmod 0755, bin/"ai"
    chmod 0755, bin/"ai-install"
    chmod 0755, bin/"ai-uninstall"
    chmod 0755, bin/"ai-help"
    chmod 0755, bin/"ai-update"
    chmod 0755, bin/"ai-password"
  end

  def caveats
    <<~EOS
      AI Personal Assistant has been installed!

      First run will automatically set up the assistant in your home directory.

      Available commands:
        ai           - Start AI Assistant GUI
        ai-install   - Reinstall AI Assistant
        ai-uninstall - Uninstall AI Assistant
        ai-help      - Show help information
        ai-update    - Check for updates
        ai-password  - Change installation password

      Note: Homebrew installation may require your password for system access.
    EOS
  end

  test do
    # 基本测试
    assert_predicate bin/"ai", :exist?
    assert_predicate bin/"ai-install", :exist?
    assert_predicate bin/"ai-uninstall", :exist?
    assert_predicate bin/"ai-help", :exist?
    assert_predicate bin/"ai-update", :exist?
    assert_predicate bin/"ai-password", :exist?
  end
end
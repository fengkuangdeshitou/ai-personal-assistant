class AiPersonalAssistant < Formula
  desc "AI Personal Assistant - Intelligent Dev Partner"
  homepage "https://github.com/fengkuangdeshitou/ai-personal-assistant"
  head "https://github.com/fengkuangdeshitou/ai-personal-assistant.git"
  license "MIT"

  depends_on "node" => :recommended
  depends_on "git" => :recommended

  def install
    # 安装目录
    ai_home = "#{HOMEBREW_PREFIX}/opt/ai-personal-assistant"

    # 复制所有文件到安装目录
    prefix.install Dir["*"]

    # 安装Node.js依赖
    system "cd #{prefix}/gui/server && npm install --production"

    # 创建启动脚本
    (bin/"ai").write <<~EOS
      #!/bin/bash
      AI_ASSISTANT_HOME="#{ai_home}"
      exec bash "#{ai_home}/scripts/open-gui.sh" "$@"
    EOS

    (bin/"ai-install").write <<~EOS
      #!/bin/bash
      AI_ASSISTANT_HOME="#{ai_home}"
      exec bash "#{ai_home}/scripts/install.sh" "$@"
    EOS

    (bin/"ai-uninstall").write <<~EOS
      #!/bin/bash
      AI_ASSISTANT_HOME="#{ai_home}"
      exec bash "#{ai_home}/scripts/uninstall.sh" "$@"
    EOS

    (bin/"ai-help").write <<~EOS
      #!/bin/bash
      AI_ASSISTANT_HOME="#{ai_home}"
      exec bash "#{ai_home}/scripts/help.sh" "$@"
    EOS

    (bin/"ai-update").write <<~EOS
      #!/bin/bash
      AI_ASSISTANT_HOME="#{ai_home}"
      exec bash "#{ai_home}/scripts/update.sh" "$@"
    EOS

    # 设置执行权限
    chmod 0755, bin/"ai"
    chmod 0755, bin/"ai-install"
    chmod 0755, bin/"ai-uninstall"
    chmod 0755, bin/"ai-help"
    chmod 0755, bin/"ai-update"
  end

  def caveats
    <<~EOS
      AI Personal Assistant has been installed!

      To complete setup, run:
        ai-install

      Available commands:
        ai           - Start AI Assistant GUI
        ai-install   - Reinstall AI Assistant
        ai-uninstall - Uninstall AI Assistant
        ai-help      - Show help information
        ai-update    - Check for updates

      The AI Assistant will be installed to:
        #{HOMEBREW_PREFIX}/opt/ai-personal-assistant
    EOS
  end

  test do
    # 基本测试
    assert_predicate bin/"ai", :exist?
    assert_predicate bin/"ai-install", :exist?
    assert_predicate bin/"ai-uninstall", :exist?
    assert_predicate bin/"ai-help", :exist?
    assert_predicate bin/"ai-update", :exist?
  end
end
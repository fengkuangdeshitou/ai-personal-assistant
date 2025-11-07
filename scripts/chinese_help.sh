#!/bin/bash

# 📚 中文命令帮助系统
# ==================

echo "🇨🇳 AI 助理中文命令大全"
echo "======================="
echo ""

echo "🤖 AI 助理核心功能"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  助理          启动 AI 助理主控制台"
echo "  智能助理       启动 AI 助理主控制台"  
echo "  检查环境       检查开发环境状态"
echo "  环境检查       检查开发环境状态"
echo "  项目状态       查看项目详细状态报告"
echo "  查看项目       查看项目详细状态报告"
echo "  备份项目       智能备份重要项目"
echo "  项目备份       智能备份重要项目"
echo "  获取建议       获取智能提醒和建议"
echo "  智能提醒       获取智能提醒和建议"
echo "  权限设置       配置 sudo 免密权限"
echo "  使用说明       查看详细使用指南"
echo "  帮助          查看详细使用指南"
echo ""

echo "🚀 项目管理命令"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  新建项目       创建新的开发项目"
echo "  创建项目       创建新的开发项目"
echo "  打开项目       在 VS Code 中打开项目目录"
echo "  项目列表       查看所有项目列表"
echo "  查看项目列表    查看所有项目列表"
echo ""

echo "📝 Git 版本控制命令"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  提交代码 '消息'  添加并提交所有更改"
echo "  推送代码        推送到远程仓库"
echo "  拉取代码        从远程仓库拉取更新"
echo "  查看状态        查看 Git 工作状态"
echo "  查看分支        查看所有分支"
echo "  切换分支 分支名   切换到指定分支"
echo ""

echo "📦 开发工具命令"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  清理缓存       清理 npm 和 yarn 缓存"
echo "  安装依赖       安装项目依赖包"
echo "  启动服务       启动开发服务器"
echo "  构建项目       构建生产版本"
echo ""

echo "💡 使用示例"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 日常工作流："
echo "  1. 获取建议        # 查看今日工作建议"
echo "  2. 检查环境        # 确认开发环境正常"
echo "  3. 项目状态        # 查看项目健康度"
echo "  4. 新建项目 或 打开项目"
echo "  5. 提交代码 '完成功能开发'"
echo "  6. 推送代码"
echo "  7. 备份项目        # 下班前备份"
echo ""

echo "🚀 快速操作："
echo "  创建 React 项目:"
echo "  └─ 新建项目 → 选择 React → 输入名称"
echo ""
echo "  检查项目问题:"
echo "  └─ 项目状态 → 查看红色警告 → 处理问题"
echo ""
echo "  提交代码流程:"
echo "  ├─ 查看状态"
echo "  ├─ 提交代码 '修复登录bug'"
echo "  └─ 推送代码"
echo ""

echo "📊 当前系统状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 显示快速状态
if command -v ai-status &> /dev/null; then
    echo "正在获取项目状态..."
    project_info=$(ai-status 2>/dev/null | head -20 | tail -10 | grep -E "(总项目数|未提交更改)" | head -2)
    if [ -n "$project_info" ]; then
        echo "$project_info"
    else
        echo "📁 项目目录: ~/Project"
        if [ -d ~/Project ]; then
            count=$(find ~/Project -maxdepth 1 -type d | wc -l)
            echo "📊 项目总数: $((count - 1)) 个"
        fi
    fi
else
    echo "📁 AI 助理未完全配置"
fi

echo ""
echo "🎊 开始使用中文命令"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 现在您可以用中文命令操作了："
echo "   助理           # 启动主界面"
echo "   获取建议        # 查看今日建议"  
echo "   检查环境        # 检查开发环境"
echo "   项目状态        # 查看项目情况"
echo ""
echo "🌟 提示: 中文命令支持 Tab 补全"
echo "📚 输入 '帮助' 随时查看此帮助"
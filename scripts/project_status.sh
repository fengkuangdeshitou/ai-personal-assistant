#!/bin/bash

# 📊 项目状态监控脚本
# ===================

source ~/.ai-assistant/config.sh

echo "📊 项目状态报告"
echo "==============="
echo "📅 生成时间: $(date)"
echo ""

if [ ! -d "$PROJECT_BASE_DIR" ]; then
    echo "❌ 项目目录不存在: $PROJECT_BASE_DIR"
    exit 1
fi

cd "$PROJECT_BASE_DIR"

# 统计信息
TOTAL_PROJECTS=0
GIT_PROJECTS=0
NODE_PROJECTS=0
PYTHON_PROJECTS=0
IOS_PROJECTS=0
JAVA_PROJECTS=0
UNCOMMITTED_CHANGES=0

echo "🔍 扫描项目..."

# 项目详情数组
declare -a PROJECT_DETAILS

for dir in */; do
    if [ -d "$dir" ]; then
        PROJECT_NAME=$(basename "$dir")
        ((TOTAL_PROJECTS++))
        
        cd "$dir"
        
        # 项目类型检测
        PROJECT_TYPE="Unknown"
        PROJECT_SIZE=$(du -sh . | cut -f1)
        
        # 检测项目类型
        if [ -f "package.json" ]; then
            PROJECT_TYPE="Node.js"
            ((NODE_PROJECTS++))
        elif [ -f "*.xcodeproj" ] || [ -f "*.xcworkspace" ]; then
            PROJECT_TYPE="iOS"
            ((IOS_PROJECTS++))
        elif [ -f "pom.xml" ] || [ -f "build.gradle" ]; then
            PROJECT_TYPE="Java"
            ((JAVA_PROJECTS++))
        elif [ -f "requirements.txt" ] || [ -f "setup.py" ]; then
            PROJECT_TYPE="Python"
            ((PYTHON_PROJECTS++))
        elif [ -f "vue.config.js" ] || grep -q "vue" package.json 2>/dev/null; then
            PROJECT_TYPE="Vue.js"
        elif grep -q "react" package.json 2>/dev/null; then
            PROJECT_TYPE="React"
        fi
        
        # Git 状态
        GIT_STATUS="No Git"
        GIT_BRANCH=""
        UNCOMMITTED=""
        
        if [ -d ".git" ]; then
            ((GIT_PROJECTS++))
            GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
            
            # 检查未提交的更改
            if ! git diff-index --quiet HEAD 2>/dev/null; then
                UNCOMMITTED="有未提交更改"
                ((UNCOMMITTED_CHANGES++))
            else
                UNCOMMITTED="干净"
            fi
            
            GIT_STATUS="$GIT_BRANCH ($UNCOMMITTED)"
        fi
        
        # 最后修改时间
        LAST_MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d" . 2>/dev/null || date +%Y-%m-%d)
        
        # 存储项目详情
        PROJECT_DETAILS+=("$PROJECT_NAME|$PROJECT_TYPE|$PROJECT_SIZE|$GIT_STATUS|$LAST_MODIFIED")
        
        cd ..
    fi
done

echo ""
echo "📈 项目统计"
echo "----------"
echo "📁 总项目数: $TOTAL_PROJECTS"
echo "📝 Git 项目: $GIT_PROJECTS"
echo "🟢 Node.js: $NODE_PROJECTS"
echo "🐍 Python: $PYTHON_PROJECTS"
echo "📱 iOS: $IOS_PROJECTS"
echo "☕ Java: $JAVA_PROJECTS"
echo "⚠️  未提交更改: $UNCOMMITTED_CHANGES"
echo ""

if [ $UNCOMMITTED_CHANGES -gt 0 ]; then
    echo "⚠️  需要注意的项目:"
    for detail in "${PROJECT_DETAILS[@]}"; do
        IFS='|' read -r name type size git_status last_modified <<< "$detail"
        if [[ $git_status == *"有未提交更改"* ]]; then
            echo "   🔴 $name - $git_status"
        fi
    done
    echo ""
fi

echo "📋 项目详情列表"
echo "==============="

# 表头
printf "%-20s %-12s %-10s %-25s %-12s\n" "项目名称" "类型" "大小" "Git状态" "最后修改"
echo "$(printf '%.0s-' {1..85})"

# 项目列表
for detail in "${PROJECT_DETAILS[@]}"; do
    IFS='|' read -r name type size git_status last_modified <<< "$detail"
    printf "%-20s %-12s %-10s %-25s %-12s\n" "$name" "$type" "$size" "$git_status" "$last_modified"
done

echo ""

# 磁盘使用分析
echo "💾 磁盘使用分析"
echo "==============="

# 找出最大的项目
echo "🗂️  最大的项目:"
du -sh */ 2>/dev/null | sort -hr | head -5 | while read size dir; do
    echo "   $size - $dir"
done

echo ""

# 依赖检查
echo "📦 依赖状态检查"
echo "==============="

NODE_MODULES_COUNT=0
PYTHON_VENV_COUNT=0

for dir in */; do
    if [ -d "$dir" ]; then
        cd "$dir"
        
        # 检查 Node.js 依赖
        if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
            echo "⚠️  $dir: package.json 存在但 node_modules 缺失"
        elif [ -d "node_modules" ]; then
            ((NODE_MODULES_COUNT++))
        fi
        
        # 检查 Python 虚拟环境
        if [ -f "requirements.txt" ] && [ ! -d "venv" ] && [ ! -d ".venv" ]; then
            echo "⚠️  $dir: requirements.txt 存在但虚拟环境缺失"
        elif [ -d "venv" ] || [ -d ".venv" ]; then
            ((PYTHON_VENV_COUNT++))
        fi
        
        cd ..
    fi
done

echo "📊 依赖统计:"
echo "   Node.js 项目 (有 node_modules): $NODE_MODULES_COUNT"
echo "   Python 项目 (有虚拟环境): $PYTHON_VENV_COUNT"

echo ""

# 最近活跃项目
echo "🔥 最近活跃项目 (按修改时间)"
echo "============================="

find . -maxdepth 1 -type d -not -name "." -exec stat -f "%Sm %N" -t "%Y-%m-%d %H:%M" {} \; | sort -r | head -5 | while read date time path; do
    project_name=$(basename "$path")
    echo "   $date $time - $project_name"
done

echo ""

# 建议和推荐
echo "💡 建议和推荐"
echo "============"

if [ $UNCOMMITTED_CHANGES -gt 0 ]; then
    echo "🔴 有 $UNCOMMITTED_CHANGES 个项目存在未提交的更改，建议及时提交"
fi

if [ $TOTAL_PROJECTS -gt 20 ]; then
    echo "📁 项目较多 ($TOTAL_PROJECTS 个)，建议定期清理不需要的项目"
fi

# 检查是否有空项目
EMPTY_PROJECTS=0
for dir in */; do
    if [ -d "$dir" ]; then
        FILE_COUNT=$(find "$dir" -type f | wc -l)
        if [ $FILE_COUNT -lt 3 ]; then
            ((EMPTY_PROJECTS++))
        fi
    fi
done

if [ $EMPTY_PROJECTS -gt 0 ]; then
    echo "🗑️  发现 $EMPTY_PROJECTS 个几乎为空的项目，可以考虑清理"
fi

echo ""
echo "🎉 项目状态报告完成！"
echo ""
echo "💡 提示:"
echo "   - 使用 'ai-assistant' 命令启动项目管理工具"
echo "   - 使用 'backup_projects.sh' 备份重要项目"
echo "   - 定期运行此脚本监控项目状态"
#!/bin/bash

# 📦 项目备份脚本
# ===============

source ~/.ai-assistant/config.sh
source ~/.ai-assistant/scripts/auto_confirm.sh

# 创建备份目录
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$BACKUP_DATE"

echo "📦 项目备份工具"
echo "==============="
echo "📅 备份时间: $(date)"
echo "📍 备份位置: $BACKUP_PATH"
echo ""

# 创建备份目录
mkdir -p "$BACKUP_PATH"

# 获取项目列表
if [ ! -d "$PROJECT_BASE_DIR" ]; then
    echo "❌ 项目目录不存在: $PROJECT_BASE_DIR"
    exit 1
fi

cd "$PROJECT_BASE_DIR"
PROJECTS=($(find . -maxdepth 1 -type d -not -name "." | sed 's|./||'))

if [ ${#PROJECTS[@]} -eq 0 ]; then
    echo "❌ 没有找到项目"
    exit 1
fi

echo "📋 找到 ${#PROJECTS[@]} 个项目:"
for i in "${!PROJECTS[@]}"; do
    echo "   $((i+1)). ${PROJECTS[i]}"
done
echo ""

# 选择备份模式
echo "🎯 备份模式:"
echo "1. 全部备份"
echo "2. 选择性备份"
echo "3. 重要项目备份"
echo ""

# 使用自动选择功能
auto_select "选择备份模式:" "全部备份" "选择性备份" "重要项目备份" 5 1
backup_mode=$(($? + 1))

SELECTED_PROJECTS=()

case $backup_mode in
    1)
        SELECTED_PROJECTS=("${PROJECTS[@]}")
        echo "✅ 已选择全部项目"
        ;;
    2)
        echo "📝 请选择要备份的项目 (用空格分隔项目编号):"
        read -p "项目编号: " project_numbers
        
        for num in $project_numbers; do
            if [[ $num =~ ^[0-9]+$ ]] && [ $num -ge 1 ] && [ $num -le ${#PROJECTS[@]} ]; then
                SELECTED_PROJECTS+=("${PROJECTS[$((num-1))]}")
            fi
        done
        ;;
    3)
        # 定义重要项目 (可以根据需要修改)
        IMPORTANT_KEYWORDS=("boot" "main" "prod" "release" "important")
        
        for project in "${PROJECTS[@]}"; do
            for keyword in "${IMPORTANT_KEYWORDS[@]}"; do
                if [[ $project == *"$keyword"* ]]; then
                    SELECTED_PROJECTS+=("$project")
                    break
                fi
            done
        done
        
        if [ ${#SELECTED_PROJECTS[@]} -eq 0 ]; then
            echo "⚠️  未找到重要项目，备份全部项目"
            SELECTED_PROJECTS=("${PROJECTS[@]}")
        fi
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "📦 开始备份 ${#SELECTED_PROJECTS[@]} 个项目..."
echo ""

# 备份进度
TOTAL=${#SELECTED_PROJECTS[@]}
CURRENT=0

for project in "${SELECTED_PROJECTS[@]}"; do
    ((CURRENT++))
    
    echo -n "[$CURRENT/$TOTAL] 备份 $project ... "
    
    if [ ! -d "$project" ]; then
        echo "❌ 项目不存在"
        continue
    fi
    
    # 创建项目备份目录
    PROJECT_BACKUP_DIR="$BACKUP_PATH/$project"
    mkdir -p "$PROJECT_BACKUP_DIR"
    
    # 复制项目文件 (排除不必要的文件)
    rsync -av \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='build' \
        --exclude='.git' \
        --exclude='DerivedData' \
        --exclude='*.log' \
        --exclude='.DS_Store' \
        "$project/" "$PROJECT_BACKUP_DIR/" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅"
        
        # 保存项目信息
        cat > "$PROJECT_BACKUP_DIR/.backup_info" << EOF
项目名称: $project
备份时间: $(date)
备份来源: $PROJECT_BASE_DIR/$project
备份工具: AI 私人助理
EOF
        
        # 如果是 Git 项目，保存分支信息
        if [ -d "$project/.git" ]; then
            cd "$project"
            git branch > "$PROJECT_BACKUP_DIR/.git_branches" 2>/dev/null
            git status --porcelain > "$PROJECT_BACKUP_DIR/.git_status" 2>/dev/null
            git log --oneline -10 > "$PROJECT_BACKUP_DIR/.git_recent_commits" 2>/dev/null
            cd ..
        fi
        
    else
        echo "❌ 失败"
    fi
done

# 创建备份清单
cat > "$BACKUP_PATH/backup_manifest.md" << EOF
# 项目备份清单

**备份时间**: $(date)  
**备份位置**: $BACKUP_PATH  
**项目数量**: ${#SELECTED_PROJECTS[@]}

## 备份项目列表

EOF

for project in "${SELECTED_PROJECTS[@]}"; do
    if [ -d "$BACKUP_PATH/$project" ]; then
        PROJECT_SIZE=$(du -sh "$BACKUP_PATH/$project" | cut -f1)
        echo "- ✅ $project (大小: $PROJECT_SIZE)" >> "$BACKUP_PATH/backup_manifest.md"
    else
        echo "- ❌ $project (备份失败)" >> "$BACKUP_PATH/backup_manifest.md"
    fi
done

cat >> "$BACKUP_PATH/backup_manifest.md" << EOF

## 备份说明

- 已排除: node_modules, dist, build, .git, DerivedData
- 包含源代码、配置文件、文档
- 保存了 Git 分支和提交信息 (如适用)

## 恢复方法

\`\`\`bash
# 恢复单个项目
cp -r "$BACKUP_PATH/[项目名]" "$PROJECT_BASE_DIR/"

# 恢复所有项目  
cp -r "$BACKUP_PATH"/* "$PROJECT_BASE_DIR/"
\`\`\`

---
*由 AI 私人助理自动生成*
EOF

# 压缩备份 (可选)
if auto_confirm "🗜️  是否压缩备份文件？" 5 "y"; then
    echo "🗜️  正在压缩备份..."
    cd "$BACKUP_DIR"
    tar -czf "backup_$BACKUP_DATE.tar.gz" "backup_$BACKUP_DATE" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        COMPRESSED_SIZE=$(du -sh "backup_$BACKUP_DATE.tar.gz" | cut -f1)
        echo "✅ 压缩完成: backup_$BACKUP_DATE.tar.gz ($COMPRESSED_SIZE)"
        
        if auto_confirm "🗑️  删除原始备份目录？" 3 "n"; then
            rm -rf "backup_$BACKUP_DATE"
            echo "✅ 原始目录已删除"
        fi
    else
        echo "❌ 压缩失败"
    fi
fi

echo ""
echo "🎉 备份完成！"
echo "📍 备份位置: $BACKUP_PATH"
echo "📊 备份统计:"
echo "   - 项目数量: ${#SELECTED_PROJECTS[@]}"
echo "   - 备份大小: $(du -sh "$BACKUP_PATH" 2>/dev/null | cut -f1 || echo "未知")"
echo ""

# 清理旧备份 (保留最近 10 个)
OLD_BACKUPS=$(find "$BACKUP_DIR" -name "backup_*" -type d | wc -l)
if [ $OLD_BACKUPS -gt 10 ]; then
    echo "🧹 清理旧备份..."
    find "$BACKUP_DIR" -name "backup_*" -type d | sort | head -n -10 | xargs rm -rf
    echo "✅ 已清理旧备份，保留最近 10 个"
fi

echo "💡 提示: 可以使用 'cat $BACKUP_PATH/backup_manifest.md' 查看详细清单"
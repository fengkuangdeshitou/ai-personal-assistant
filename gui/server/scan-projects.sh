#!/bin/bash
# 自动扫描并生成 projects.json

echo "🔍 扫描本地 Git 仓库..."
echo ""

PROJECTS_JSON="$(dirname "$0")/projects.json"
SEARCH_DIRS=(
  "$HOME/.ai-assistant"
  "$HOME/Project"
  "$HOME/Projects"
  "$HOME/Documents/Projects"
  "$HOME/workspace"
  "$HOME/code"
  "$HOME/dev"
  "$HOME/github"
  "$HOME/Desktop"
)

# 临时存储找到的项目
FOUND_PROJECTS=()

for dir in "${SEARCH_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "📂 扫描目录: $dir"
    # 查找包含 .git 的目录（最多2层深度）
    while IFS= read -r git_dir; do
      project_dir=$(dirname "$git_dir")
      project_name=$(basename "$project_dir")
      FOUND_PROJECTS+=("$project_name|$project_dir")
      echo "  ✅ 找到: $project_name ($project_dir)"
    done < <(find "$dir" -maxdepth 2 -type d -name ".git" 2>/dev/null)
  fi
done

echo ""
echo "📝 生成 projects.json..."

# 生成 JSON
echo '{' > "$PROJECTS_JSON"
echo '  "projects": [' >> "$PROJECTS_JSON"

first=true
for project in "${FOUND_PROJECTS[@]}"; do
  IFS='|' read -r name path <<< "$project"
  
  if [ "$first" = true ]; then
    first=false
  else
    echo ',' >> "$PROJECTS_JSON"
  fi
  
  echo -n "    { \"name\": \"$name\", \"path\": \"$path\" }" >> "$PROJECTS_JSON"
done

echo '' >> "$PROJECTS_JSON"
echo '  ]' >> "$PROJECTS_JSON"
echo '}' >> "$PROJECTS_JSON"

echo ""
echo "✅ 完成！共找到 ${#FOUND_PROJECTS[@]} 个项目"
echo "📄 配置文件: $PROJECTS_JSON"
echo ""
echo "🔄 请重启后端服务："
echo "   pkill -f 'node.*server.js'"
echo "   node $(dirname "$0")/server.js"

#!/bin/bash

# 🔧 VS Code 配置选择性恢复工具
# ===============================

source ~/.ai-assistant/scripts/auto_confirm.sh

echo "🔧 VS Code 配置选择性恢复工具"
echo "============================"
echo ""

CURRENT_SETTINGS="/Users/maiyou001/.vscode/settings.json"
BACKUP_SETTINGS="/Users/maiyou001/.vscode/settings.json.backup.20251107_161501"

if [ ! -f "$BACKUP_SETTINGS" ]; then
    echo "❌ 未找到备份文件: $BACKUP_SETTINGS"
    exit 1
fi

echo "📋 检测到的配置变化："
echo ""
echo "🔤 字体设置 (新增)"
echo "   • 编辑器字体: 16px"
echo "   • 终端字体: 15px" 
echo "   • 字体家族: Menlo, Monaco"
echo ""

echo "🖥️ 工作台设置 (已修改)"
echo "   • 启动编辑器: none → welcomePage"
echo "   • 扩展推荐: 忽略 → 显示"
echo ""

echo "🔧 终端设置 (已修改)"
echo "   • Shell 集成: 关闭 → 开启"
echo "   • 快捷键组合: 关闭 → 开启"
echo ""

echo "✨ 编辑器增强 (新增)"
echo "   • 代码折行、小地图、缩进等"
echo ""

echo "🎯 恢复选项："
echo ""

# 选项1: 保持所有新设置
if auto_confirm "1. 保持所有新设置 (推荐)" 5 "y"; then
    echo "✅ 保持当前配置，所有改进都将生效"
    exit 0
fi

echo ""

# 选项2: 只恢复工作台设置
if auto_confirm "2. 只恢复工作台设置 (启动页面 + 扩展推荐)" 5 "n"; then
    echo "🔄 恢复工作台设置..."
    
    # 恢复启动编辑器设置
    sed -i '' 's/"workbench.startupEditor": "welcomePage"/"workbench.startupEditor": "none"/' "$CURRENT_SETTINGS"
    
    # 恢复扩展推荐设置
    sed -i '' 's/"extensions.ignoreRecommendations": false/"extensions.ignoreRecommendations": true/' "$CURRENT_SETTINGS"
    
    echo "✅ 工作台设置已恢复，字体和编辑器增强保留"
    exit 0
fi

echo ""

# 选项3: 完全恢复到备份状态 (但保留字体)
if auto_confirm "3. 完全恢复原始设置但保留字体配置" 5 "n"; then
    echo "🔄 创建混合配置..."
    
    # 创建临时文件保存字体设置
    TEMP_FONTS="/tmp/vscode_fonts.json"
    cat > "$TEMP_FONTS" << 'EOF'
{
  "editor.fontSize": 16,
  "editor.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "editor.fontWeight": "normal",
  "editor.lineHeight": 1.5,
  "editor.fontLigatures": true,
  "terminal.integrated.fontSize": 15,
  "terminal.integrated.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "terminal.integrated.fontWeight": "normal",
  "terminal.integrated.lineHeight": 1.2,
  "workbench.fontAliasing": "auto",
  "debug.console.fontSize": 13,
  "markdown.preview.fontSize": 14,
  "window.zoomLevel": 0
}
EOF
    
    # 恢复原始设置
    cp "$BACKUP_SETTINGS" "$CURRENT_SETTINGS"
    
    # 合并字体设置 (这里需要手动添加字体设置)
    # 创建合并后的设置文件
    python3 -c "
import json
import sys

# 读取原始设置
with open('$CURRENT_SETTINGS', 'r') as f:
    original = json.load(f)

# 读取字体设置
with open('$TEMP_FONTS', 'r') as f:
    fonts = json.load(f)

# 合并设置
original.update(fonts)

# 写回文件
with open('$CURRENT_SETTINGS', 'w') as f:
    json.dump(original, f, indent=2)
" 2>/dev/null || {
    echo "⚠️  Python 合并失败，手动添加字体设置..."
    # 手动方式：在原始设置基础上添加字体
    sed -i '' '2i\
  "editor.fontSize": 16,\
  "editor.fontFamily": "Menlo, Monaco, '\''Courier New'\'', monospace",\
  "editor.fontWeight": "normal",\
  "editor.lineHeight": 1.5,\
  "editor.fontLigatures": true,\
  "terminal.integrated.fontSize": 15,\
  "terminal.integrated.fontFamily": "Menlo, Monaco, '\''Courier New'\'', monospace",\
  "terminal.integrated.fontWeight": "normal",\
  "terminal.integrated.lineHeight": 1.2,\
  "workbench.fontAliasing": "auto",\
  "debug.console.fontSize": 13,\
  "markdown.preview.fontSize": 14,\
  "window.zoomLevel": 0,
' "$CURRENT_SETTINGS"
}
    
    rm -f "$TEMP_FONTS"
    echo "✅ 已恢复原始设置并保留字体配置"
    exit 0
fi

echo ""

# 选项4: 完全恢复到原始状态
if auto_confirm "4. 完全恢复到修改前状态 (将失去字体设置)" 10 "n"; then
    echo "⚠️  警告：这将完全恢复到原始状态，您需要重新配置字体！"
    
    if auto_confirm "确定要完全恢复吗？" 5 "n"; then
        cp "$BACKUP_SETTINGS" "$CURRENT_SETTINGS"
        echo "✅ 已完全恢复到原始设置"
        echo "💡 如果字体过小，请运行: 字体调节 大"
    else
        echo "❌ 取消恢复操作"
    fi
    exit 0
fi

echo ""
echo "💡 您选择了保持当前设置"
echo "   如需单独调整某些设置，可以："
echo "   • 修改 ~/.vscode/settings.json 文件"
echo "   • 或在 VS Code 中通过 Cmd+, 打开设置"
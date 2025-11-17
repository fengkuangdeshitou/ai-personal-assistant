#!/bin/bash

# AI助手前端构建脚本
# 设置构建输出为绿色

echo "🧹 清空build文件夹..."
rm -rf build
echo "✅ build文件夹已清空"

echo "🏗️  开始构建..."

# 设置React Scripts的颜色为绿色
export FORCE_COLOR=1
export REACT_APP_BUILD_COLOR=green

# 执行构建
npx react-scripts build

echo "🎉 构建完成！"
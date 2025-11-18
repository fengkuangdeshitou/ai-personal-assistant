# 版本管理系统

## 概述

本项目实现了基于Git提交次数的自动版本管理。每次Git提交时，版本号会自动递增，确保版本信息在所有界面中保持一致。

## 版本号规则

- **基础版本**: 1.6.0
- **递增规则**: 每次Git提交，patch版本 +1
- **版本格式**: `1.6.{提交次数}`

## 自动更新位置

版本号会在以下位置自动更新：

1. **左侧导航栏顶部** (`frontend/src/components/Sidebar.tsx`)
2. **工作台页面副标题** (`frontend/src/pages/Dashboard.tsx`)
3. **设置页面版本信息** (`frontend/src/pages/Settings.tsx`)

## 工作流程

### 1. Git提交时自动更新
当执行 `git commit` 时，pre-commit hook会自动：
- 计算新的版本号（基于提交次数）
- 更新所有相关文件
- 将版本文件添加到暂存区

### 2. 构建时自动更新
当执行 `npm run build` 时，会自动：
- 更新版本号
- 构建项目

## 手动更新版本

如果需要手动更新版本，可以运行：

```bash
cd /path/to/project
node scripts/update-version.mjs
```

## 技术实现

- **版本计算**: 基于 `git rev-list --count HEAD` 获取提交次数
- **文件更新**: 使用正则表达式替换版本字符串
- **Git集成**: pre-commit hook自动执行版本更新

## 注意事项

- 版本号只在patch位递增 (1.6.x)
- 所有版本信息位置都会同步更新
- 版本更新会自动包含在Git提交中
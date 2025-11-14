# Scripts 脚本文件夹

这个文件夹包含了AI助手项目的各种脚本文件，用于启动、管理和维护应用。

## 📁 文件说明

### 🚀 启动脚本
- **`AI助理.command`** - macOS主启动脚本，启动后端服务和React前端应用
- **`launch.sh`** - Linux/Unix启动脚本
- **`启动AI助理.scpt`** - AppleScript启动脚本（macOS专用）

### 🛠️ 管理脚本
- **`stop.sh`** - 停止所有相关服务
- **`quick-menu.sh`** - 快速操作菜单

### 🔧 工具脚本
- **`get-github-token.sh`** - 获取GitHub个人访问令牌的辅助脚本

## 📖 使用方法

### macOS用户
双击 `AI助理.command` 文件即可启动整个应用。

### Linux/Unix用户
```bash
./scripts/launch.sh  # 启动应用
./scripts/stop.sh    # 停止应用
```

## ⚠️ 注意事项

- 确保脚本文件具有执行权限：`chmod +x scripts/*.sh`
- 脚本可能需要根据你的环境调整路径配置
- 某些脚本可能依赖特定的系统环境或工具

## 🔗 相关文档

- [主项目README](../README.md)
- [生产部署说明](../README-PRODUCTION-DEPLOY.md)
- [多渠道构建说明](../README-CHANNELS.md)
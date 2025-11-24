# AI 私人助理 - Windows EXE 打包指南

## 📦 打包概述

将 React Web 应用打包成 Windows 可执行文件 (.exe)，让用户无需安装 Node.js 或浏览器即可运行。

## 🛠️ 技术栈

- **Electron**: 将 Web 应用转换为桌面应用
- **electron-builder**: 专业的 Electron 应用打包工具
- **NSIS**: Windows 安装程序生成器

## 📋 系统要求

### 构建环境
- **操作系统**: macOS (推荐) 或 Linux
- **Node.js**: v16 或更高版本
- **npm**: v7 或更高版本

### 目标平台
- **Windows**: 7, 8, 10, 11 (x64 和 x86)

## 🚀 快速开始

### 1. 安装依赖
```bash
cd frontend
npm install
```

### 2. 开发测试
```bash
# 启动 Electron 开发环境
npm run electron-dev

# 或分别启动
npm start              # 启动 React 开发服务器
npm run electron       # 启动 Electron 应用
```

### 3. 构建生产版本
```bash
# 构建 React 应用
npm run build

# 打包 Windows 绿色版EXE (推荐)
npm run build-win

# 或使用专用脚本
../scripts/build-windows-exe.sh
```

## 📁 输出文件

打包完成后，在 `frontend/dist/` 目录下会生成：

### 绿色便携版 (默认)
- `AI私人助理 X.X.X.exe` - 绿色便携版
  - 无需安装，下载即用
  - 双击直接运行
  - 包含所有必要文件
  - 自动创建开始菜单项
  - 支持卸载

### 绿色版（便携版）
- `win-unpacked/` 目录 - 无需安装的绿色版本
  - `AI私人助理.exe` - 主程序
  - 所有文件都在一个目录中
  - 可以直接复制到其他电脑使用

## ⚙️ 配置说明

### Electron 主进程配置 (`public/electron.js`)
```javascript
// 窗口配置
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  // Windows 特定配置
  icon: path.join(__dirname, 'public/favicon.ico'),
  titleBarStyle: 'default',
});
```

### 打包配置 (`package.json`)
```json
"build": {
  "win": {
    "target": [
      {
        "target": "nsis",    // 安装程序
        "arch": ["x64", "ia32"]  // 64位和32位
      },
      {
        "target": "portable",    // 绿色版
        "arch": ["x64"]
      }
    ],
    "icon": "public/favicon.ico"
  },
  "nsis": {
    "createDesktopShortcut": true,      // 桌面快捷方式
    "createStartMenuShortcut": true,    // 开始菜单
    "shortcutName": "AI私人助理"        // 快捷方式名称
  }
}
```

## 🎨 自定义图标

### 1. 准备图标文件
- 格式: `.ico` (Windows 图标)
- 尺寸: 256x256, 128x128, 64x64, 32x32, 16x16
- 位置: `frontend/public/favicon.ico`

### 2. 从 PNG 转换
```bash
# 使用 ImageMagick 转换
convert logo.png -define icon:auto-resize favicon.ico

# 或使用在线工具
# https://favicon.io/favicon-converter/
```

## 🔧 故障排除

### 构建失败
```bash
# 清理缓存重新构建
rm -rf node_modules dist
npm install
npm run build
npm run build-win
```

### 图标不显示
```bash
# 检查图标文件
ls -la public/favicon.ico

# 确保路径正确
grep -n "icon" package.json
```

### 应用程序无法启动
```bash
# 检查构建产物
ls -la dist/win-unpacked/

# 查看错误日志
# Windows: 事件查看器 > Windows 日志 > 应用程序
```

### 网络请求失败
如果应用需要访问后端 API，需要修改 CSP 策略：

```javascript
// electron.js 中添加
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self' http://localhost:5178"]
    }
  });
});
```

## 🚀 部署和分发

### 1. 测试安装程序
```bash
# 在 Windows 虚拟机或测试机上测试
# 检查安装、运行、卸载是否正常
```

### 2. 代码签名（推荐）
```bash
# 为安装程序添加数字签名
# 防止 Windows 安全警告
```

### 3. 自动更新
考虑添加自动更新功能：
- 使用 `electron-updater`
- 设置更新服务器
- 配置更新检查逻辑

### 4. 分发渠道
- 官网下载
- 应用商店
- 内部部署

## 📊 文件大小优化

### 优化策略
1. **排除 node_modules**: 通过 `files` 配置排除开发依赖
2. **压缩设置**: 使用 `compression: "maximum"`
3. **文件清理**: 移除不必要的源文件和文档
4. **Asar 优化**: 压缩应用资源包

### 优化结果
- **绿色便携版**: 从 113MB 优化到 84MB (减少 26%)
- **应用资源包**: 从 157MB 优化到 1.3MB (减少 99%)

### 当前大小参考
- 绿色便携版: ~84MB (最新优化)
- 主要由 Electron 运行时决定

### 进一步优化建议
1. **自定义 Electron 版本**: 考虑使用更小的 Electron 版本
2. **资源优化**: 压缩图片，使用 WebP 格式
3. **代码分割**: 实现路由级别的代码分割
4. **移除本地化**: 只保留中文语言包

## 🔧 已知问题及解决方案

### 绿色便携版路由问题
**问题**: 绿色便携版exe打开只有左侧导航区，右侧没有页面内容

**原因**: Electron应用使用BrowserRouter在文件协议下无法正常工作

**解决方案**: 
1. 将 `BrowserRouter` 改为 `HashRouter`
2. HashRouter使用URL的hash部分(#)来保持UI与URL同步，适合文件协议环境

**修复代码**:
```typescript
// src/App.tsx
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
```

## 📞 支持

如果在打包过程中遇到问题：
1. 检查此文档的故障排除部分
2. 查看 Electron 和 electron-builder 官方文档
3. 检查 GitHub Issues
4. 联系技术支持团队
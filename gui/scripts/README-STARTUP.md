# AI 助理启动流程说明

## 快速启动

在终端中输入：
```bash
ai
```

该命令会自动完成以下操作：
1. ✅ 检查并启动后端服务（端口 5178, 5179）
2. ✅ 检查前端构建文件（首次运行会自动构建）
3. ✅ 启动前端静态服务（端口 4000）
4. ✅ 自动打开浏览器访问 http://localhost:4000

## 服务架构

### 后端服务
- **端口**: 5178 (HTTP), 5179 (WebSocket)
- **进程**: `node server.js`
- **日志**: `/tmp/ai-assistant-server.log`
- **功能**: 
  - APK 加固处理
  - 文件上传管理
  - WebSocket 实时通信

### 前端服务
- **端口**: 4000
- **进程**: `npx serve -s build -l 4000`
- **日志**: `/tmp/ai-assistant-frontend.log`
- **类型**: 静态文件服务（React 构建产物）

## 常用命令

### 启动服务
```bash
ai                                    # 启动 AI 助理（推荐）
bash ~/.ai-assistant/gui/scripts/AI助理.command
```

### 停止服务
```bash
bash ~/.ai-assistant/gui/scripts/stop.sh
```

### 重启服务
```bash
bash ~/.ai-assistant/gui/scripts/stop.sh && sleep 2 && ai
```

### 查看日志
```bash
# 查看后端日志
tail -f /tmp/ai-assistant-server.log

# 查看前端日志
tail -f /tmp/ai-assistant-frontend.log
```

### 检查服务状态
```bash
# 检查端口占用
lsof -i :4000 -i :5178 -i :5179

# 检查进程
ps aux | grep -E "(node.*server\.js|serve.*build)"
```

## 启动流程详解

### 1. 后端服务启动
```bash
cd ~/.ai-assistant/gui/server
nohup node server.js > /tmp/ai-assistant-server.log 2>&1 &
```
- 检查端口 5178 是否被占用
- 如未运行，启动 Node.js 后端服务
- 后台运行，日志输出到 `/tmp/ai-assistant-server.log`

### 2. 前端构建检查
```bash
if [ ! -d "frontend/build" ]; then
    cd frontend && npm run build
fi
```
- 首次运行时会自动执行 `npm run build`
- 构建产物存放在 `frontend/build/` 目录
- 后续启动跳过此步骤（除非手动删除 build 目录）

### 3. 前端服务启动
```bash
cd ~/.ai-assistant/gui/frontend
npx serve -s build -l 4000 > /tmp/ai-assistant-frontend.log 2>&1 &
```
- 使用 `serve` 包提供静态文件服务
- 监听端口 4000
- 服务于 `build/` 目录的构建产物

### 4. 浏览器打开
```applescript
osascript -e 'tell application "Google Chrome"
    activate
    open location "http://localhost:4000"
end tell'
```
- 优先使用 Google Chrome
- 降级到 Safari
- 最后使用系统默认浏览器

## 故障排查

### 服务启动失败

**症状**: 提示"后端服务启动失败"
```bash
# 查看后端日志
cat /tmp/ai-assistant-server.log

# 检查端口占用
lsof -i :5178 -i :5179

# 手动停止占用端口的进程
pkill -f 'node.*server\.js'
```

**症状**: 提示"前端服务启动失败"
```bash
# 查看前端日志
cat /tmp/ai-assistant-frontend.log

# 检查端口占用
lsof -i :4000

# 手动停止占用端口的进程
pkill -f 'serve.*build'
```

### 浏览器未自动打开

**手动访问**: http://localhost:4000

### 首次启动较慢

首次运行需要构建前端（1-2分钟），这是正常现象。

### 构建失败

```bash
# 清理并重新构建
cd ~/.ai-assistant/gui/frontend
rm -rf build node_modules
npm install
npm run build
```

## 开发模式 vs 生产模式

### 当前模式：生产模式（静态文件）
- ✅ 启动快速（~2秒）
- ✅ 资源占用低
- ✅ 适合日常使用
- ❌ 需要手动重新构建代码更改

### 开发模式（仅开发时使用）
```bash
cd ~/.ai-assistant/gui/frontend
npm start
```
- ✅ 热重载，代码即改即生效
- ✅ 详细的错误提示
- ❌ 启动慢（~30秒）
- ❌ 资源占用高

## 相关文件

- **启动脚本**: `~/.ai-assistant/gui/scripts/AI助理.command`
- **停止脚本**: `~/.ai-assistant/gui/scripts/stop.sh`
- **后端代码**: `~/.ai-assistant/gui/server/server.js`
- **前端构建**: `~/.ai-assistant/gui/frontend/build/`
- **配置文件**: `~/.zshrc` (包含 `ai` 别名定义)

## 更新历史

- **2025-12-01**: 从开发模式切换到生产模式（静态文件 + serve）
- **2025-12-01**: 移除 Electron 桌面应用支持
- **2025-12-01**: 优化启动流程，添加详细日志和错误处理

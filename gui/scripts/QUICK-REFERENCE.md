# AI 助理 - 快速参考

## 🚀 启动
```bash
ai
```

## 🛑 停止
```bash
bash ~/.ai-assistant/gui/scripts/stop.sh
```

## 🔄 重启
```bash
bash ~/.ai-assistant/gui/scripts/stop.sh && sleep 3 && ai
```

## 📊 状态检查
```bash
# 查看端口占用
lsof -i :4000 -i :5178 -i :5179

# 查看进程
ps aux | grep -E "(node server\.js|serve -s build)" | grep -v grep
```

## 📝 日志查看
```bash
# 后端日志
tail -f /tmp/ai-assistant-server.log

# 前端日志
tail -f /tmp/ai-assistant-frontend.log
```

## 🌐 访问地址
- **前端**: http://localhost:4000
- **后端 API**: http://localhost:5178
- **WebSocket**: ws://localhost:5179

## 🔧 故障排查
```bash
# 1. 清理进程
pkill -f "node server\.js"
pkill -f "serve.*build"

# 2. 重新构建前端
cd ~/.ai-assistant/gui/frontend
npm run build

# 3. 重启服务
ai
```

## 📚 详细文档
- **启动流程**: `scripts/README-STARTUP.md`
- **检查结果**: `scripts/STARTUP-CHECK-RESULTS.md`

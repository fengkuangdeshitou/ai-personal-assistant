# AI聊天API演示服务器

这是一个独立的演示服务器，用于展示如何为AI助手项目添加聊天API功能。

## 🚀 启动演示服务器

```bash
# 在server目录下运行
cd server
node chat-api-demo.js
```

服务器将在 `http://localhost:5179` 启动。

## 📋 可用API端点

### 发送聊天消息
```http
POST /api/chat/send
Content-Type: application/json

{
  "message": "你好，测试消息",
  "model": "gpt-3.5-turbo"  // 可选
}
```

### 获取聊天历史
```http
GET /api/chat/history?limit=20
```

### 清空聊天历史
```http
DELETE /api/chat/clear
```

### 健康检查
```http
GET /health
```

## 🧪 测试示例

```bash
# 发送消息
curl -X POST http://localhost:5179/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'

# 获取历史
curl http://localhost:5179/api/chat/history

# 健康检查
curl http://localhost:5179/health
```

## 📝 功能特性

- ✅ 模拟AI对话回复
- ✅ 聊天历史存储（内存中）
- ✅ 关键词智能回复
- ✅ 完整的错误处理
- ✅ RESTful API设计

## 🔧 集成到主服务器

如果要将这些功能集成到主服务器 (`server.js`)，可以：

1. 将 `chat-api-demo.js` 中的路由代码复制到 `server.js`
2. 将相关函数添加到 `server.js` 中
3. 确保依赖正确安装

## ⚠️ 注意事项

- 这是一个演示服务器，仅用于测试
- 聊天历史存储在内存中，重启服务器会丢失
- 生产环境建议使用数据库存储聊天历史
- 可以集成真实的AI API（如OpenAI、Claude等）

## 🎯 架构说明

```
ai-assistant/
├── frontend/          # React前端项目
│   └── src/api/       # API客户端 (axios)
└── server/
    ├── server.js      # 主服务器 (不修改)
    └── chat-api-demo.js # 演示服务器 (独立运行)
```
# React前端API集成

本项目已经集成了axios来访问后端server的API接口。

## 📦 已安装依赖

- `axios`: HTTP客户端库，用于API请求
- `@types/axios`: axios的TypeScript类型定义（已内置）

## 🏗️ 项目结构

```
src/api/
├── client.ts      # axios实例配置和API方法
├── hooks.ts       # React hooks for API调用
└── index.ts       # 导出文件
```

## 🚀 API客户端使用

### 基础用法

```typescript
import { chatApi, projectApi } from '../api';

// 发送聊天消息
const response = await chatApi.sendMessage({
  message: '你好',
  model: 'gpt-3.5-turbo'
});

// 获取聊天历史
const history = await chatApi.getHistory(20);

// 获取项目列表
const projects = await projectApi.getProjects();
```

### 使用React Hooks

```typescript
import { useChat, useProjects } from '../api';

function ChatComponent() {
  const { messages, isLoading, error, sendMessage } = useChat();
  const { projects, loadProjects } = useProjects();

  const handleSend = async (message: string) => {
    await sendMessage(message);
  };

  return (
    // 你的组件代码
  );
}
```

## ⚙️ 配置

### 环境变量

在`.env`文件中配置API基础URL：

```env
REACT_APP_API_URL=http://localhost:5178
```

### API端点

当前支持的API端点：

#### 聊天API
- `POST /api/chat/send` - 发送消息
- `GET /api/chat/history` - 获取历史
- `DELETE /api/chat/clear` - 清空历史

#### 项目API
- `GET /api/projects` - 获取项目列表
- `POST /api/projects/scan` - 扫描项目

#### Git API
- `GET /api/git/stats` - 获取Git统计
- `GET /api/git/commits` - 获取提交历史

#### 构建API
- `POST /api/build` - 构建项目
- `POST /api/build/clear` - 清空构建目录

#### OSS API
- `POST /api/oss/upload` - 上传文件

## 🎨 聊天界面

Chat页面已经完全集成API，支持：

- ✅ 实时聊天
- ✅ 消息历史
- ✅ 加载状态
- ✅ 错误处理
- ✅ 清空历史
- ✅ 响应式设计

## 🔧 开发说明

### 添加新的API端点

1. 在`client.ts`中添加API方法
2. 在`hooks.ts`中创建对应的React hook
3. 在组件中使用新的hook

### 错误处理

所有API调用都包含错误处理：

```typescript
try {
  const response = await api.method();
  if (response.success) {
    // 处理成功
  } else {
    // 处理业务错误
  }
} catch (error) {
  // 处理网络错误
}
```

## 🚀 启动项目

```bash
# 启动后端服务器
cd server
node server.js

# 启动前端开发服务器
cd frontend
npm start
```

前端将在 `http://localhost:3003` 启动，后端API在 `http://localhost:5178`。
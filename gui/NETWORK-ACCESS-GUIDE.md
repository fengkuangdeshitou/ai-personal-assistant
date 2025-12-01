# 局域网访问指南

## 概述

本项目支持在局域网内多设备访问，前端会自动根据访问 IP 地址动态适配后端 API 和 WebSocket 地址。

**更新日期**: 2025年12月1日

---

## 🌐 网络架构

### 服务端口
- **前端服务**: 4000 (静态文件)
- **后端 API**: 5178 (HTTP)
- **WebSocket**: 5179 (实时通信)

### 自动适配机制
前端使用 `getApiBaseUrl()` 函数动态获取 API 地址：

```typescript
// frontend/src/utils/api.ts
export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // 浏览器环境：使用当前访问的 hostname
    return `${window.location.protocol}//${window.location.hostname}:5178`;
  }
  // 服务端渲染环境：使用 localhost
  return process.env.REACT_APP_API_URL || 'http://localhost:5178';
};
```

---

## 📱 访问方式

### 本机访问
```
http://localhost:4000
```

### 局域网访问
假设服务器 IP 为 `192.168.8.158`，局域网内其他设备可访问：

```
http://192.168.8.158:4000
```

前端会自动将 API 请求发送到：
- API: `http://192.168.8.158:5178`
- WebSocket: `ws://192.168.8.158:5179`

### 多网卡支持
如果服务器有多个网络接口（如网线 + WiFi），每个 IP 都可以访问：

**网线 IP**: `192.168.8.158`
```
http://192.168.8.158:4000
```

**WiFi IP**: `192.168.110.158`
```
http://192.168.110.158:4000
```

---

## 📂 已适配的组件

### ✅ 完成适配

| 组件 | 文件路径 | API 调用 |
|------|---------|---------|
| APK 加固 | `pages/ApkHardening.tsx` | ✅ 历史记录<br>✅ 加固请求<br>✅ 文件下载<br>✅ WebSocket 连接 |
| 系统设置 | `pages/Settings.tsx` | ✅ 系统状态 |
| API 客户端 | `api/client.ts` | ✅ 所有 axios 请求 |
| 工具函数 | `utils/api.ts` | ✅ getApiBaseUrl() |

---

## 🧪 测试验证

### 1. 查看本机 IP
```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}'

# Windows
ipconfig | findstr IPv4
```

### 2. 启动服务
```bash
ai
```

### 3. 测试访问

**本机测试**:
```
http://localhost:4000
```

**局域网测试**（从其他设备）:
```
http://192.168.8.158:4000
```

打开浏览器开发者工具 Network 面板，确认请求地址：
- `http://192.168.8.158:5178/api/...`
- `ws://192.168.8.158:5179`

---

## 🐛 故障排查

### 无法从局域网访问

```bash
# 1. 检查服务是否运行
lsof -i :4000 -i :5178 -i :5179

# 2. 检查防火墙
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# 3. 测试端口连通性（从其他设备）
telnet 192.168.8.158 4000
```

### API 请求失败

```bash
# 查看后端日志
tail -f /tmp/ai-assistant-server.log

# 测试 API
curl http://192.168.8.158:5178/api/health
```

### WebSocket 连接失败

```bash
# 检查 WebSocket 服务
lsof -i :5179

# 测试连接（需要 wscat）
npm install -g wscat
wscat -c ws://192.168.8.158:5179
```

---

## 📝 代码示例

### 使用动态 API 地址

```typescript
import { getApiBaseUrl } from '../utils/api';

// HTTP 请求
const response = await fetch(`${getApiBaseUrl()}/api/endpoint`);

// WebSocket 连接
const wsUrl = getApiBaseUrl().replace(/^http/, 'ws').replace(':5178', ':5179');
const ws = new WebSocket(wsUrl);

// 下载链接
const downloadUrl = `${getApiBaseUrl()}/api/download/${filename}`;
```

---

## ✅ 验证清单

- [x] 移除所有硬编码的 `localhost`
- [x] 使用 `getApiBaseUrl()` 动态获取 API 地址
- [x] WebSocket 地址动态适配
- [x] 下载链接动态适配
- [x] 后端启用 CORS 支持
- [x] 支持多网卡场景（网线 + WiFi）

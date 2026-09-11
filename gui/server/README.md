# AI Personal Assistant Backend

后端服务为前端提供真实的 Git 项目数据。

## 🚀 快速启动

```bash
cd server
./start.sh
```

或手动启动：
```bash
cd server
npm install  # 首次运行
node server.js
```

服务默认监听 `http://localhost:5178`，支持局域网访问（其他设备可通过 `http://<服务器IP>:5178` 访问）

## 🔍 自动扫描项目

首次使用或想添加新项目时，运行扫描脚本：

```bash
cd server
./scan-projects.sh
```

脚本会自动扫描以下目录中的Git仓库：
- `~/.ai-assistant`
- `~/Project`
- `~/Projects`
- `~/Documents/Projects`
- `~/workspace`
- `~/code`
- `~/dev`
- `~/github`
- `~/Desktop`

扫描完成后会自动生成 `projects.json`，然后重启服务即可。

## ☁️ OSS 上传配置

以下文件均可提交 git（**请确保仓库为私有**，否则 AccessKey 会泄露）：

| 文件 | 说明 |
|---|---|
| `oss-connection-config.json` | region、项目/渠道 bucket、cdnDomains |
| `oss-credentials.json` | AccessKeyId / AccessKeySecret |

`oss-credentials.json` 示例：

```json
{
  "accessKeyId": "YOUR_ACCESS_KEY_ID",
  "accessKeySecret": "YOUR_ACCESS_KEY_SECRET"
}
```

检查配置：

```bash
cd server
./check-config.sh
```

## 📋 API 接口

### GET /api/health
健康检查

**响应示例：**
```json
{
  "ok": true,
  "port": 5178,
  "projectsDir": "/Users/maiyou001/Projects"
}
```

### GET /api/projects
获取项目列表（含最后提交时间）

**响应示例：**
```json
{
  "projects": [
    {
      "name": "ai-personal-assistant",
      "path": "/Users/maiyou001/Projects/ai-personal-assistant",
      "lastCommitTime": "2025-01-08T10:30:00.000Z"
    }
  ]
}
```

### GET /api/status?path=<项目路径>
获取Git状态（modified/added/deleted文件数）

**参数：**
- `path`: 项目的绝对路径

**响应示例：**
```json
{
  "modified": 3,
  "added": 1,
  "deleted": 0,
  "isClean": false
}
```

### POST /api/git/pull
执行 git pull

**请求体：**
```json
{
  "path": "/Users/maiyou001/Projects/ai-personal-assistant"
}
```

**响应示例：**
```json
{
  "ok": true,
  "result": {...},
  "status": {
    "modified": 0,
    "added": 0,
    "deleted": 0,
    "isClean": true
  },
  "lastCommitTime": "2025-01-08T10:35:00.000Z"
}
```

### POST /api/git/push
执行 git add . && git commit && git push

**请求体：**
```json
{
  "path": "/Users/maiyou001/Projects/ai-personal-assistant",
  "message": "可选的提交信息"
}
```

**响应示例：**
```json
{
  "ok": true,
  "result": {...},
  "status": {
    "modified": 0,
    "added": 0,
    "deleted": 0,
    "isClean": true
  },
  "lastCommitTime": "2025-01-08T10:40:00.000Z"
}
```

## ⚙️ 配置

### 方式1：扫描目录（默认）
服务会自动扫描 `~/Projects`（或环境变量 `PROJECTS_DIR`）下的所有 Git 仓库。

```bash
PROJECTS_DIR=/path/to/your/projects node server.js
```

### 方式2：指定项目列表
在 `server/projects.json` 中定义：

```json
{
  "projects": [
    { "name": "project-name", "path": "~/Projects/project-name" },
    { "name": "another-project", "path": "/absolute/path/to/another" }
  ]
}
```

路径中的 `~` 会自动展开为用户主目录。

## 🔧 故障排查

### 端口被占用
```bash
# 查看谁在占用5178端口
lsof -i :5178

# 修改端口
PORT=8080 node server.js
```

### 服务无响应
```bash
# 检查进程
ps aux | grep "node.*server.js"

# 查看日志（如果使用后台运行）
tail -f server.log

# 重启服务
pkill -f "node.*server.js"
node server.js
```

### 项目列表为空
1. 确认 `~/Projects` 目录存在且包含 Git 仓库
2. 或创建 `server/projects.json` 明确指定项目路径
3. 检查路径权限

### CORS 错误
前端和后端需在同一域或已配置 CORS（当前已启用）。

## 📦 依赖

- `express`: Web 框架
- `simple-git`: Git 操作库
- `cors`: 跨域支持
- `chokidar`: 文件监控（预留）

## 🛡️ 安全注意

- 当前版本未做身份验证，仅供本地使用
- Git 操作直接在服务器端执行，请确保项目路径可信
- 生产环境需增加：认证、权限检查、操作审计

## 📝 开发建议

- 前端通过 fetch 调用 API
- 建议在前端缓存项目列表，仅定期刷新状态
- Push 操作前可增加确认对话框
- 考虑增加 WebSocket 实时推送状态变更


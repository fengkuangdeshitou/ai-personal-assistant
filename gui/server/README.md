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

## ☁️ 阿里云API测试脚本

项目包含阿里云号码认证服务(Dypnsapi)的测试脚本：

### QuerySchemeSecret - 查询方案秘钥 ✅
```bash
cd server
export $(cat .env | grep -v '^#' | xargs)
node query-scheme-secret.js [SCHEME_CODE]
```

此脚本可以成功查询现有认证方案的秘钥信息。

### CreateVerifyScheme - 创建认证方案 ✅
```bash
cd server
export $(cat .env | grep -v '^#' | xargs)
node test-create-verify-scheme.js
```

#### API集成状态
- ✅ 已集成到 `/api/create-scheme` 端点
- ✅ 支持前端表单提交
- ✅ 自动处理Android/iOS包名参数
- ✅ API密钥有效，已通过身份验证
- ✅ 参数格式已更新为阿里云标准（OsType字符串转换）
- ✅ 支持PackSign、Origin、Url等完整参数
- ⚠️ API调用返回"InvalidParameters"错误

**当前状态**: 系统已完全集成阿里云API，参数格式正确，但阿里云返回参数无效错误。

**已实现的参数处理**:
- `SchemeName`: 方案名称
- `AppName`: 应用名称
- `OsType`: 自动转换 ("1"→"Android", "2"→"iOS")
- `PackName`: Android包名 (Android时必需)
- `PackSign`: Android包签名MD5 (Android时必需)
- `BundleId`: iOS Bundle ID (iOS时必需)
- `Origin`: H5页面源地址
- `Url`: H5页面地址

**可能原因**:
1. **服务未开通**: 阿里云账户可能未开通号码认证服务
2. **实名认证**: 账户需要完成企业实名认证（个人认证可能不支持）
3. **地域限制**: 可能需要特定的地域配置
4. **资源包**: 可能需要购买号码认证资源包

**建议检查**:
- 在阿里云控制台搜索"号码认证服务"确认是否已开通
- 确认账户已完成企业实名认证（个人认证可能不支持）
- 检查AccessKey是否有调用Dypnsapi的权限
- 确认所在地域是否支持号码认证服务
- 联系阿里云客服确认账户配置和服务开通状态

**参数说明** (已更新):
- `SchemeName`: 方案名称
- `AppName`: 应用名称
- `OsType`: 操作系统 ("Android"/"iOS"/"Harmony"/"Web")
- `PackName`: Android包名 (Android时必需)
- `PackSign`: Android包签名MD5 (Android时必需)
- `BundleId`: iOS Bundle ID (iOS时必需)
- `Origin`: H5页面源地址
- `Url`: H5页面地址

### 环境配置
在 `.env` 文件中配置阿里云凭据：
```bash
ALICLOUD_ACCESS_KEY_ID=your-access-key-id
ALICLOUD_ACCESS_KEY_SECRET=your-access-key-secret
ALICLOUD_REGION=cn-hangzhou
ALICLOUD_ENDPOINT=dypnsapi.aliyuncs.com
SCHEME_CODE=your-scheme-code
```

**功能**: 创建号码认证方案，支持短信和语音认证。

**文档**: [CREATE_VERIFY_SCHEME_README.md](CREATE_VERIFY_SCHEME_README.md)

### QuerySchemeSecret - 查询方案认证秘钥
```bash
cd server
node query-scheme-secret.js FC220000012470042
```

**功能**: 查询指定方案代码的认证秘钥（AccessToken和JwtToken）。

**文档**: [QUERY_SCHEME_SECRET_README.md](QUERY_SCHEME_SECRET_README.md)

### 配置说明
1. 编辑 `.env` 文件，设置阿里云AccessKey
2. 确保已开通阿里云号码认证服务
3. 运行相应脚本进行测试

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


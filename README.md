# 🤖 AI 私人助理

> 专为开发者定制的智能助手，集项目管理、构建部署、私有云管理于一体。

---

## 目录

- [目录结构](#-目录结构)
- [技术栈](#-技术栈)
- [页面功能](#-页面功能)
- [后端 API](#-后端-api)
- [启动方式](#-启动方式)
- [Seafile 管理](#-seafile-管理)
- [配置文件](#-配置文件)
- [注意事项](#-注意事项)
- [故障排除](#-故障排除)

---

## 📁 目录结构

```
~/.ai-assistant/
├── README.md                # 本文档
├── install.sh               # 安装脚本
│
├── scripts/                 # Shell 管理脚本
│   ├── open-gui.sh          # 启动 GUI 入口
│   ├── seafile.sh           # Seafile 服务管理（start/stop/restart/status/logs）
│   ├── seafile-autostart.sh # 等待 Docker 就绪后自动启动 Seafile
│   ├── change-password.sh   # 修改登录密码
│   ├── verify-password.sh   # 验证密码
│   ├── update.sh            # 更新脚本
│   └── uninstall.sh         # 卸载脚本
│
├── gui/                     # GUI 应用主体
│   ├── AI助理.command        # macOS 双击启动入口
│   ├── frontend/            # React 前端（端口 4000）
│   ├── server/              # Node.js 后端（端口 5178）
│   └── scripts/
│       ├── AI助理.command    # 实际启动逻辑（启动后端 + 前端）
│       ├── stop.sh          # 停止所有服务
│       └── update-version.mjs
│
├── homebrew/                # Homebrew Formula
└── homebrew-tap/            # Homebrew Tap 仓库
```

---

## 🛠 技术栈

### 前端（`gui/frontend/`）

| 库 | 说明 |
|---|---|
| React 18 | UI 框架 |
| TypeScript 4.9 | 类型安全 |
| Ant Design 5 | 组件库 |
| React Router v6 | 路由（HashRouter） |
| Axios | HTTP 请求，baseURL 指向 `:5178` |
| crypto-js | AES 数据解密 |
| react-json-view | JSON 结构化展示 |
| react-scripts | 开发/构建工具（CRA） |

> 开发端口：**4000**（通过 `setupProxy.js` 将 `/api` 代理到 `:5178`）

### 后端（`gui/server/`）

| 库 | 说明 |
|---|---|
| Node.js ESM | 运行时，`"type": "module"` |
| Express 4 | HTTP 服务，监听 **0.0.0.0:5178** |
| simple-git | Git 操作封装 |
| ali-oss | 阿里云 OSS 上传 |
| archiver | ZIP 打包 |
| @alicloud/dypnsapi | 阿里云号码认证 |
| less | Less 文件编译 |
| dotenv | 环境变量（`server/.env`） |

---

## 📱 页面功能

| 路由 | 页面 | 说明 |
|---|---|---|
| `/dashboard` | 工作台 | Git 周报、今日操作、项目统计 |
| `/projects` | 项目管理 | 扫描/列出本机项目，Git pull/push |
| `/data-decrypt` | 数据解密 | AES-ECB 解密（SDK/Box 两套 Key），支持上传抓包文件自动解析 |
| `/seafile` | Seafile 管理 | Docker Compose 容器启动/停止/重启/状态，显示局域网访问地址 |
| `/timeline` | 工作记录 | 时间轴形式的工作日志 |
| `/auth-schemes` | 认证方案 | 阿里云号码认证方案管理 |
| `/create-scheme` | 新建认证方案 | 创建号码认证配置 |
| `/settings` | 设置 | 应用配置 |

---

## 🔌 后端 API

### 通用
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |

### 项目管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects/scan` | 扫描本机项目目录 |
| GET | `/api/status` | 项目状态 |

### Git 操作
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/commits/weekly` | 本周提交统计 |
| GET | `/api/stats` | Git 统计 |
| GET | `/api/git/today-operations` | 今日 Git 操作 |
| GET | `/api/git/pull-stream` | SSE 流式 Git Pull |
| GET | `/api/git/push-stream` | SSE 流式 Git Push |

### 构建 & 部署
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/check-build` | 检查构建产物 |
| POST | `/api/build-channel` | 按渠道构建 |
| GET | `/api/build-stream` | SSE 流式构建输出 |
| POST | `/api/clear-build` | 清空构建目录 |
| POST | `/api/copy-and-push` | 拷贝并推送 |
| POST | `/api/backup-build` | 备份构建产物 |

### OSS 上传
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/upload-stream` | SSE 流式上传到 OSS |
| GET | `/api/upload-zip-stream` | SSE 流式 ZIP 上传 |
| POST | `/api/oss/upload-channel` | 按渠道上传 |
| POST | `/api/oss/upload-simple` | 简单上传 |
| POST | `/api/oss/upload-stream` | 流式上传 |
| POST | `/api/oss/upload` | 直接上传 |
| POST | `/api/oss/get-bucket-info` | 获取 Bucket 信息 |
| GET | `/api/project-buckets/:name` | 获取项目 Bucket 配置 |

### 渠道管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/channels/:projectName` | 获取项目渠道列表 |
| POST | `/api/switch-channel` | 切换渠道配置 |

### 号码认证
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/create-scheme` | 创建认证方案 |
| POST | `/api/query-scheme-secret` | 查询方案密钥 |

### Seafile 管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/seafile/status` | 获取容器状态和局域网 IP |
| POST | `/api/seafile/start` | 启动（`docker compose up -d`） |
| POST | `/api/seafile/stop` | 停止（`docker compose down --timeout 10`） |
| POST | `/api/seafile/restart` | 重启（`docker compose restart`） |

---

## 🚀 启动方式

### 日常使用

```bash
# 终端命令
ai

# 或双击 macOS 文件
~/.ai-assistant/gui/AI助理.command
```

启动脚本会自动：
1. 检测 `:5178` 是否已有后端，没有则启动 `node server.js`
2. 检测 `react-scripts` 是否已运行，没有则启动前端
3. 等待服务就绪后自动打开浏览器

### 手动分别启动

```bash
# 后端
cd ~/.ai-assistant/gui/server && node server.js

# 前端
cd ~/.ai-assistant/gui/frontend && npm start
```

### 停止服务

```bash
bash ~/.ai-assistant/gui/scripts/stop.sh
```

---

## ☁️ Seafile 管理

Seafile 私有云部署在 `~/seafile/docker-compose.yml`，包含三个容器：

| 容器 | 镜像 | 说明 |
|---|---|---|
| `seafile` | seafileltd/seafile-mc:11.0 | 主服务，端口 80 |
| `seafile-mysql` | mariadb:10.11 | 数据库 |
| `seafile-memcached` | memcached:1.6 | 缓存 |

**命令行管理：**

```bash
seafile start          # 启动
seafile stop           # 停止
seafile restart        # 重启
seafile status         # 查看状态和局域网地址
seafile logs           # 实时日志
```

> Seafile 需要 Docker Desktop 运行后才能启停，前端操作超时上限为 60 秒。

---

## ⚙️ 配置文件

| 文件 | 说明 |
|---|---|
| `gui/server/.env` | 阿里云 AccessKey、OSS 配置等敏感信息（**不入库**） |
| `gui/server/projects.json` | 手动定义的项目路径列表 |
| `gui/server/project-versions.json` | 各项目最后部署记录（自动更新） |
| `gui/server/oss-connection-config.json` | OSS Bucket 连接配置 |
| `gui/server/channel-config.json` | 多渠道打包配置 |

---

## ⚠️ 注意事项

1. **后端必须运行**：前端所有功能依赖 `:5178` 后端，页面操作报错时先确认后端是否存在：
   ```bash
   lsof -i :5178
   ```

2. **敏感配置不入库**：`gui/server/.env` 含阿里云密钥，已在 `.gitignore` 中排除，切勿手动提交。

3. **Seafile 依赖 Docker**：点击启动/停止前须确保 Docker Desktop 已运行，否则操作会失败。

4. **前端代理配置**：`src/setupProxy.js` 将 `/api` 请求代理到 `localhost:5178`，生产环境需单独配置反向代理。

5. **TypeScript 版本**：项目固定使用 TS 4.9.5（由 react-scripts 锁定），`tsconfig.json` 中不要使用 TS 5.x+ 专有选项。

6. **ESM 模块**：后端 `server.js` 使用 ES Module（`"type": "module"`），不可混用 `require()`。

7. **流式接口**：构建和上传相关接口使用 SSE 推送进度，前端超时时间需适当放宽。

8. **端口冲突**：前端 4000、后端 5178，启动前可用以下命令检查：
   ```bash
   lsof -i :4000
   lsof -i :5178
   ```

---

## 🆘 故障排除

**Q: 点击功能提示失败 / 网络错误**
```bash
# 确认后端是否在运行
lsof -i :5178
# 没有输出则重新启动
ai
```

**Q: 命令 `ai` 未找到**
```bash
# 重新加载 shell 配置
source ~/.zshrc
# 或检查别名是否存在
grep "alias ai=" ~/.zshrc
```

**Q: 脚本权限不足**
```bash
chmod +x ~/.ai-assistant/scripts/*.sh
chmod +x ~/.ai-assistant/gui/scripts/*.sh
```

**Q: Seafile 启动失败**
```bash
# 确认 Docker Desktop 已运行
docker info
# 手动启动
seafile start
```

---

## 🎉 更新日志

### v1.6.x
- 新增 Seafile 私有云管理页面（启动/停止/重启/状态）
- 新增数据解密功能（支持 SDK/Box AES 解密、Stream 抓包文件解析）
- 新增认证方案管理

### v1.0.0 (2025-11-07)
- 首次发布，项目管理、Git 集成、OSS 部署核心功能

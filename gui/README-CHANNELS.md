# 多渠道构建与上传系统

## 功能概述

本系统为项目 `hg-bookmark` 配置了多渠道构建和上传功能，支持：
- 4 个渠道：嘿咕游戏 (hg)、0.05折手游 (05)、0.01折游戏 (01)、惠爪游戏 (hz)
- 2 个环境：开发环境 (dev)、生产环境 (prod)
- 自动配置文件切换
- 渠道级别的 OSS 上传

## 渠道配置

### 嘿咕游戏 (hg)
- 开发环境 Bucket: `testagentmilu`
- 生产环境 Bucket: `hgagentmilu`

### 0.05折手游 (05)
- 开发环境 Bucket: `test05zhe`
- 生产环境 Bucket: `prod05zhe`

### 0.01折游戏 (01)
- 开发环境 Bucket: `test01zhe`
- 生产环境 Bucket: `prod01zhe`

### 惠爪游戏 (hz)
- 开发环境 Bucket: `testhuizhua`
- 生产环境 Bucket: `prodhuizhua`

## 使用方法

### 1. 构建项目
1. 点击项目卡片上的 🔨 **Build** 按钮
2. 在弹出的渠道选择窗口中选择目标渠道
3. 系统会自动切换配置文件并执行 `npm run build`

### 2. 上传到 OSS
1. 点击项目卡片上的 ☁️ **OSS Upload** 按钮
2. 在弹出的窗口中选择渠道和环境（开发/生产）
3. 系统会自动上传 build 目录到对应的 OSS bucket

## 配置文件说明

### 自动切换的文件
每个渠道会自动修改以下 5 个文件：
1. `public/index.html` - 网站标题和元信息
2. `src/css/css.less` - 主题色配置
3. `src/BoxType.js` - 渠道类型标识
4. `src/env.js` - API 地址配置
5. `src/general.js` - 代理商标识

### 配置文件位置
- 渠道配置：`server/channel-config.json`
- OSS 配置：`server/oss-connection-config.json` (已加入 .gitignore)

## API 端点

### 获取项目渠道配置
```bash
GET /api/channels/:projectName
```

### 切换渠道配置
```bash
POST /api/switch-channel
Body: { "projectName": "hg-bookmark", "channel": "hg" }
```

### 按渠道构建
```bash
POST /api/build-channel
Body: { "projectName": "hg-bookmark", "channel": "hg" }
```

### 按渠道和环境上传
```bash
POST /api/oss/upload-channel
Body: { 
  "projectName": "hg-bookmark", 
  "path": "/Users/maiyou001/Project/hg-bookmark",
  "channelId": "hg", 
  "env": "dev" 
}
```

## 注意事项

1. **构建前确认**：构建前会自动切换配置文件，请确保当前修改已提交
2. **环境选择**：开发环境用于测试，生产环境用于正式发布
3. **权限配置**：确保 OSS AccessKey 有对应 bucket 的写入权限
4. **构建目录**：上传前确保已执行构建，系统会上传 `build/` 目录下的所有文件

## 扩展新渠道

在 `server/channel-config.json` 中添加新渠道配置：

```json
"new-channel": {
  "name": "新渠道名称",
  "buckets": {
    "dev": "test-new-channel",
    "prod": "prod-new-channel"
  },
  "files": {
    "public/index.html": {
      "rules": [
        {
          "action": "uncomment",
          "pattern": "<!-- (新渠道的HTML内容) -->"
        }
      ]
    }
  }
}
```

同时在 `server/oss-connection-config.json` 中添加对应的 bucket 配置。

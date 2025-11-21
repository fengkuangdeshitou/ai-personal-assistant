# 阿里云号码认证集成

## 📋 概述

本项目集成了阿里云号码认证服务(DypnsAPI)，支持创建iOS和Web应用的认证方案。

## 🏗️ 架构

### 文件结构
```
server/
├── aliyun-dypns-sdk.js    # 阿里云SDK模块
├── server.js             # 主服务器文件
└── .env                  # 环境变量配置

frontend/src/pages/
└── CreateScheme.tsx      # 前端创建方案界面
```

### SDK模块 (aliyun-dypns-sdk.js)

提供阿里云DypnsAPI的核心功能：

- `createAliCloudClient()` - 创建阿里云客户端
- `createVerifyScheme()` - 创建认证方案

### API参数要求

CreateVerifyScheme API最多支持5个参数：

#### 必传参数 (所有类型)
- `schemeName` - 方案名称
- `osType` - 操作系统类型
- `appName` - 应用名称

#### iOS专用参数
- `bundleId` - iOS应用包ID

#### Web专用参数
- `origin` - Web应用源地址
- `url` - Web应用页面地址

## 🔧 配置

### 环境变量 (.env)
```bash
ALICLOUD_ACCESS_KEY_ID=your_access_key_id
ALICLOUD_ACCESS_KEY_SECRET=your_access_key_secret
```

### 前端界面

支持两种接入端类型：
- **iOS**: 需要应用名称和包名
- **Web**: 需要应用名称、页面地址和源地址

## 🚀 使用方法

### 1. 后端API调用

```javascript
import { createVerifyScheme } from './aliyun-dypns-sdk.js';

// iOS配置
const iosResult = await createVerifyScheme(accessKeyId, accessKeySecret, {
  schemeName: 'MyIOSApp',
  appName: '我的iOS应用',
  osType: 'iOS',
  bundleId: 'com.example.myapp'
});

// Web配置
const webResult = await createVerifyScheme(accessKeyId, accessKeySecret, {
  schemeName: 'MyWebApp',
  appName: '我的Web应用',
  osType: 'Web',
  origin: 'https://example.com',
  url: 'https://example.com/page.html'
});
```

### 2. 前端界面

访问 `/create-scheme` 页面，选择接入端类型并填写相应信息。

## ✅ 支持的功能

- ✅ iOS应用认证方案创建
- ✅ Web应用认证方案创建
- ✅ 参数验证和错误处理
- ✅ 响应数据解析

## 📊 API响应格式

成功响应：
```json
{
  "success": true,
  "data": {
    "schemeCode": "FC220000012525055",
    "schemeName": "MyApp",
    "osType": "iOS",
    "requestId": "D0ECEF82-8062-516D-85F9-E10D1FE7B2E0"
  }
}
```

失败响应：
```json
{
  "success": false,
  "error": "错误信息"
}
```

## 🔒 安全说明

- 阿里云访问密钥通过环境变量配置
- 支持HMAC-SHA256签名认证
- 避免在代码中硬编码敏感信息

## 📝 注意事项

- 每个账号每天创建方案数量有限制
- 相同URL的Web应用不能重复创建方案
- 建议在生产环境中使用RAM用户访问密钥
# 阿里云CreateVerifyScheme API测试脚本

这个脚本用于测试阿里云号码认证服务的CreateVerifyScheme API。

**API文档**: https://next.api.aliyun.com/document/Dypnsapi/2017-05-25/CreateVerifyScheme

## 实现方式

本脚本使用简化实现方式，直接通过HTTP请求调用阿里云API，避免了复杂的SDK导入问题。

## 使用前准备

### 1. 获取阿里云AccessKey

1. 登录 [阿里云控制台](https://www.aliyun.com/)
2. 进入 [AccessKey管理](https://usercenter.console.aliyun.com/#/manage/ak)
3. 创建或查看您的AccessKey ID和Secret

### 2. 配置环境变量

编辑 `server/.env` 文件，填入您的阿里云配置：

```env
ALICLOUD_ACCESS_KEY_ID=your-access-key-id
ALICLOUD_ACCESS_KEY_SECRET=your-access-key-secret
ALICLOUD_REGION=cn-hangzhou
```

### 3. 确保依赖已安装

项目已包含必要的依赖，无需额外安装。

## 运行测试

### 方法1：直接运行脚本

```bash
cd server
node test-create-verify-scheme.js
```

### 方法2：在代码中调用

```javascript
import { testCreateVerifyScheme } from './test-create-verify-scheme.js';

// 调用测试函数
testCreateVerifyScheme()
  .then(result => {
    console.log('测试成功:', result);
  })
  .catch(error => {
    console.error('测试失败:', error);
  });
```

## 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| SchemeName | String | 否 | 认证方案名称 |
| Description | String | 否 | 认证方案描述 |
| AppType | String | 是 | 应用类型：1-网站、2-App、3-公众号、4-小程序、5-H5 |
| OsType | String | 否 | 操作系统：1-Android、2-iOS |
| SchemeType | String | 是 | 方案类型：1-短信认证、2-语音认证 |
| SchemeContent | String | 否 | 方案内容配置（JSON字符串） |

## 响应结果

成功创建后会返回：

```json
{
  "SchemeCode": "方案ID",
  "SchemeName": "方案名称",
  "AppType": "应用类型",
  "RequestId": "请求ID"
}
```

## 错误处理

脚本包含完整的错误处理，会显示：
- 错误信息
- 错误代码
- 请求ID
- 推荐解决方案

常见错误：
- `InvalidAccessKeyId.NotFound`：AccessKey ID不存在
- `SignatureDoesNotMatch`：AccessKey Secret错误
- `InvalidRegionId`：地域ID无效

## 示例输出

```
=== 阿里云CreateVerifyScheme API测试 ===

正在调用CreateVerifyScheme API...
请求参数: {
  SchemeName: '测试认证方案',
  Description: '用于测试的号码认证方案',
  AppType: '2',
  OsType: '1',
  SchemeType: '1',
  SchemeContent: '{"smsTemplate":"您的验证码是：${code}，请在5分钟内完成验证。","codeLength":6,"expireTime":300}'
}
请求URL: https://dypnsapi.aliyuncs.com/?Action=CreateVerifyScheme&...

API调用成功!
响应状态码: 200
响应结果: {
  "SchemeCode": "SCHEME_123456",
  "SchemeName": "测试认证方案",
  "AppType": "2",
  "RequestId": "15D9F8CC-CA38-55E8-BD07-7BFD01AAA661"
}

=== 认证方案创建成功 ===
方案ID: SCHEME_123456
方案名称: 测试认证方案
应用类型: 2

=== 测试完成 ===
```

## 注意事项

1. 请确保您的阿里云账户已开通号码认证服务
2. AccessKey需要有相应权限
3. 不同地域可能有不同的服务可用性
4. 建议在测试环境使用，避免产生实际费用

## 安全提醒

- 不要在代码中硬编码AccessKey
- 定期轮换AccessKey
- 使用最小权限原则配置AccessKey权限
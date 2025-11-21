# 查询认证方案秘钥脚本

这个脚本用于查询指定阿里云号码认证方案代码对应的认证秘钥（AccessToken和JwtToken）。

## 功能特点

- 🔍 **方案详情查询**: 获取认证方案的完整信息
- 🔑 **秘钥获取**: 获取认证令牌（AccessToken/JwtToken）
- 📊 **状态检查**: 验证方案是否正常可用
- 🛡️ **安全验证**: 检查AccessKey配置

## 使用方法

### 1. 配置阿里云AccessKey

```bash
# 编辑 server/.env 文件或设置环境变量
export ALICLOUD_ACCESS_KEY_ID=your-real-access-key-id
export ALICLOUD_ACCESS_KEY_SECRET=your-real-access-key-secret
export ALICLOUD_REGION=cn-hangzhou
```

### 2. 运行查询脚本

#### 方法1：命令行指定方案代码
```bash
cd server
node query-scheme-secret.js FC220000012470042
```

#### 方法2：环境变量指定方案代码
```bash
cd server
export SCHEME_CODE=FC220000012470042
node query-scheme-secret.js
```

#### 方法3：在代码中调用
```javascript
import { querySchemeSecret } from './query-scheme-secret.js';

// 查询指定方案的秘钥
querySchemeSecret('FC220000012470042')
  .then(result => {
    console.log('查询成功:', result);
  })
  .catch(error => {
    console.error('查询失败:', error);
  });
```

## 输出示例

```
=== 查询方案代码 FC220000012470042 的认证秘钥 ===

正在查询方案代码 FC220000012470042 的认证秘钥...

📋 第一步：查询方案详情
==================================================
✅ 方案详情查询成功
方案代码: FC220000012470042
方案名称: 测试认证方案
应用类型: 2 (1-网站、2-App、3-公众号、4-小程序、5-H5)
操作系统: 1 (1-Android、2-iOS)
方案类型: 1 (1-短信认证、2-语音认证)
方案状态: 1 (1-正常、2-停用)
创建时间: 2025-11-19T07:30:00Z
方案内容配置:
  - 短信模板: 您的验证码是：${code}，请在5分钟内完成验证。
  - 验证码长度: 6
  - 过期时间: 300秒

🔑 第二步：获取认证令牌（秘钥）
==================================================
✅ 认证令牌获取成功
🔐 AccessToken (访问令牌):
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
🔐 JwtToken (JWT令牌):
  eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
⏰ 过期时间: 2025/11/19 15:45:30

🎉 查询完成！
==================================================
上述令牌即可作为该方案的认证秘钥使用
```

## 返回数据说明

### 方案详情 (SchemeQueryResultDTO)
- `SchemeCode`: 方案代码
- `SchemeName`: 方案名称
- `AppType`: 应用类型
- `OsType`: 操作系统
- `SchemeType`: 认证类型
- `SchemeStatus`: 方案状态
- `SchemeContent`: 方案配置（JSON）
- `GmtCreate`: 创建时间
- `GmtModified`: 修改时间

### 认证令牌 (TokenInfo)
- `AccessToken`: 访问令牌，用于API调用
- `JwtToken`: JWT令牌，用于前端验证
- `ExpireTime`: 过期时间戳

## 错误处理

脚本会自动检测并提示以下错误：

1. **AccessKey未配置**: 提示配置阿里云凭据
2. **方案不存在**: 方案代码无效或无权限
3. **API调用失败**: 网络错误或参数错误
4. **权限不足**: AccessKey权限不足

## 安全注意事项

- 🔐 **保护秘钥**: 不要在日志或代码中暴露真实的令牌
- ⏰ **过期处理**: 令牌有过期时间，需要定期刷新
- 🔒 **权限控制**: 确保AccessKey有足够的权限
- 🌐 **HTTPS使用**: 在生产环境中使用HTTPS

## 相关脚本

- `test-create-verify-scheme.js` - 创建认证方案
- `test-get-auth-token.js` - 获取认证令牌
- `test-describe-verify-scheme.js` - 查询方案详情

## API文档

- [CreateVerifyScheme](https://next.api.aliyun.com/document/Dypnsapi/2017-05-25/CreateVerifyScheme)
- [GetAuthToken](https://next.api.aliyun.com/document/Dypnsapi/2017-05-25/GetAuthToken)
- [DescribeVerifyScheme](https://next.api.aliyun.com/document/Dypnsapi/2017-05-25/DescribeVerifyScheme)
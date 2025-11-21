import crypto from 'crypto';
import https from 'https';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 加载环境变量
dotenv.config();

// 使用require导入阿里云SDK
const sdk = require('@alicloud/dypnsapi20170525');
const Dypnsapi20170525 = sdk.default || sdk;
const CreateVerifySchemeRequest = sdk.CreateVerifySchemeRequest;

/**
 * 阿里云CreateVerifyScheme API测试脚本 - 使用官方SDK
 * 使用阿里云官方SDK进行API调用，避免手动签名问题
 *
 * API文档: https://next.api.aliyun.com/document/Dypnsapi/2017-05-25/CreateVerifyScheme
 */

async function testCreateVerifySchemeWithSDK() {
  try {
    // 阿里云配置
    const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID || 'your-access-key-id';
    const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET || 'your-access-key-secret';
    const regionId = process.env.ALICLOUD_REGION || 'cn-hangzhou';

    console.log('正在使用阿里云SDK调用CreateVerifyScheme API...');

    // 导入SDK
    const { default: Dypnsapi20170525, CreateVerifySchemeRequest } = await import('@alicloud/dypnsapi20170525');

    // 创建客户端
    const client = new Dypnsapi20170525({
      accessKeyId: accessKeyId,
      accessKeySecret: accessKeySecret,
      regionId: regionId
    });

    // 创建请求对象
    const request = new CreateVerifySchemeRequest({
      schemeName: 'TestScheme_' + Date.now(),
      appType: '2', // 应用类型：2-App
      schemeType: '1', // 方案类型：1-短信认证
      osType: 'Android',
      appName: 'TestApp'
    });

    console.log('请求参数:', request);

    // 调用API
    const response = await client.createVerifyScheme(request);

    console.log('API调用成功!');
    console.log('响应结果:', JSON.stringify(response, null, 2));

    if (response.body && response.body.schemeCode) {
      console.log('\n=== 认证方案创建成功 ===');
      console.log('方案ID:', response.body.schemeCode);
      console.log('方案名称:', response.body.schemeName);
      console.log('应用类型:', response.body.appType);
    }

    return response;

  } catch (error) {
    console.error('API调用失败:');
    console.error('错误信息:', error.message);

    if (error.code) {
      console.error('错误代码:', error.code);
    }

    if (error.data) {
      console.error('错误详情:', error.data);
    }

    throw error;
  }
}

// 如果直接运行此脚本，则执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== 阿里云CreateVerifyScheme API测试 (使用SDK) ===\n');

  // 检查环境变量
  if (!process.env.ALICLOUD_ACCESS_KEY_ID || !process.env.ALICLOUD_ACCESS_KEY_SECRET) {
    console.log('请设置环境变量:');
    console.log('export ALICLOUD_ACCESS_KEY_ID=your-access-key-id');
    console.log('export ALICLOUD_ACCESS_KEY_SECRET=your-access-key-secret');
    console.log('export ALICLOUD_REGION=cn-hangzhou\n');
  }

  testCreateVerifySchemeWithSDK()
    .then(() => {
      console.log('\n=== 测试完成 ===');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n=== 测试失败 ===');
      process.exit(1);
    });
}

export { testCreateVerifySchemeWithSDK };
import crypto from 'crypto';
import https from 'https';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 阿里云CreateVerifyScheme API测试脚本 - 简化版本
 * 直接使用HTTP请求调用API，避免SDK导入问题
 *
 * API文档: https://next.api.aliyun.com/document/Dypnsapi/2017-05-25/CreateVerifyScheme
 */

async function testCreateVerifyScheme() {
  try {
    // 阿里云配置
    const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID || 'your-access-key-id';
    const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET || 'your-access-key-secret';
    const regionId = process.env.ALICLOUD_REGION || 'cn-hangzhou';
    const endpoint = process.env.ALICLOUD_ENDPOINT || 'dypnsapi.aliyuncs.com';

    // API参数 - 根据用户反馈，只有三个字段是必传的
    const params = {
      SchemeName: 'TestScheme_' + Date.now(),
      AppName: 'TestApp',
      OsType: '1',  // Android - 使用数字值
      SchemeType: '1',
      AppType: '2'
      // 移除AuthType试试
    };

    console.log('正在调用CreateVerifyScheme API...');
    console.log('请求参数:', params);

    // 构建请求签名
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString('hex');

    // 阿里云RFC3986编码函数
    function percentEncode(str) {
      return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
    }

    // 构建待签名的字符串
    const signParams = {
      Action: 'CreateVerifyScheme',
      Version: '2017-05-25',
      Format: 'JSON',
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA256',
      SignatureVersion: '1.0',
      SignatureNonce: nonce,
      Timestamp: timestamp,
      RegionId: regionId,
      ...params
    };

    // 按照参数名的字典序排序
    const sortedKeys = Object.keys(signParams).sort();
    const canonicalizedQueryString = sortedKeys
      .map(key => `${key}=${percentEncode(signParams[key])}`)
      .join('&');

    const stringToSign = `POST&%2F&${percentEncode(canonicalizedQueryString)}`;

    const signature = crypto
      .createHmac('sha256', accessKeySecret + '&')
      .update(stringToSign)
      .digest('base64');

    // 构建请求URL
    const queryParams = new URLSearchParams();
    sortedKeys.forEach(key => {
      queryParams.append(key, signParams[key]);
    });
    queryParams.append('Signature', signature);

    const url = `https://${endpoint}/?${queryParams.toString()}`;

    console.log('请求URL:', url.replace(/Signature=[^&]*/, 'Signature=***'));

    // 发送HTTP请求
    const response = await new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({ statusCode: res.statusCode, body: result });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    console.log('API调用成功!');
    console.log('响应状态码:', response.statusCode);
    console.log('响应结果:', JSON.stringify(response.body, null, 2));

    if (response.body && response.body.SchemeCode) {
      console.log('\n=== 认证方案创建成功 ===');
      console.log('方案ID:', response.body.SchemeCode);
      console.log('方案名称:', response.body.SchemeName);
      console.log('应用类型:', response.body.AppType);
    }

    return response;

  } catch (error) {
    console.error('API调用失败:');
    console.error('错误信息:', error.message);

    if (error.code) {
      console.error('错误代码:', error.code);
    }

    throw error;
  }
}

// 如果直接运行此脚本，则执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== 阿里云CreateVerifyScheme API测试 ===\n');

  // 检查环境变量
  if (!process.env.ALICLOUD_ACCESS_KEY_ID || !process.env.ALICLOUD_ACCESS_KEY_SECRET) {
    console.log('请设置环境变量:');
    console.log('export ALICLOUD_ACCESS_KEY_ID=your-access-key-id');
    console.log('export ALICLOUD_ACCESS_KEY_SECRET=your-access-key-secret');
    console.log('export ALICLOUD_REGION=cn-hangzhou\n');
  }

  testCreateVerifyScheme()
    .then(() => {
      console.log('\n=== 测试完成 ===');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n=== 测试失败 ===');
      process.exit(1);
    });
}

export { testCreateVerifyScheme };
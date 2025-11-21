import crypto from 'crypto';
import https from 'https';

/**
 * 查询指定方案代码的认证秘钥
 * 结合DescribeVerifyScheme和GetAuthToken API
 */

async function querySchemeSecret(schemeCode) {
  try {
    console.log(`正在查询方案代码 ${schemeCode} 的认证秘钥...\n`);

    // 阿里云配置
    const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID || 'your-access-key-id';
    const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET || 'your-access-key-secret';
    const regionId = process.env.ALICLOUD_REGION || 'cn-hangzhou';
    const endpoint = process.env.ALICLOUD_ENDPOINT || 'dypnsapi.aliyuncs.com';

    // 检查AccessKey配置
    if (!accessKeyId || !accessKeySecret || accessKeyId === 'your-access-key-id' || accessKeySecret === 'your-access-key-secret') {
      console.log('❌ 请先配置阿里云AccessKey:');
      console.log('export ALICLOUD_ACCESS_KEY_ID=your-real-access-key-id');
      console.log('export ALICLOUD_ACCESS_KEY_SECRET=your-real-access-key-secret');
      console.log('export ALICLOUD_REGION=cn-hangzhou');
      return;
    }

    console.log('📋 第一步：查询方案详情');
    console.log('=' .repeat(50));

    // 1. 查询方案详情
    const describeParams = {
      SchemeCode: schemeCode,
      CustomerId: process.env.CUSTOMER_ID || ''
    };

    const describeResponse = await callAliyunAPI('DescribeVerifyScheme', describeParams, accessKeyId, accessKeySecret, regionId, endpoint);

    if (describeResponse.statusCode !== 200) {
      console.log('❌ 查询方案详情失败:', describeResponse.body.Message || '未知错误');
      return;
    }

    if (!describeResponse.body.SchemeQueryResultDTO) {
      console.log('❌ 方案不存在或无权限访问');
      return;
    }

    const scheme = describeResponse.body.SchemeQueryResultDTO;
    console.log('✅ 方案详情查询成功');

    if (scheme.AppEncryptInfo) {
      console.log('🔐 应用加密信息 (AppEncryptInfo):');
      console.log(`  ${scheme.AppEncryptInfo}`);
      console.log('\n🎉 查询完成！');
      console.log('=' .repeat(50));
      console.log('上述AppEncryptInfo即为该方案的认证秘钥，可用于应用端集成');

      return {
        success: true,
        data: {
          scheme: scheme,
          secretKey: scheme.AppEncryptInfo
        }
      };
    } else {
      console.log('❌ 未找到应用加密信息');
      return {
        success: false,
        error: '未找到应用加密信息'
      };
    }

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 通用的阿里云API调用函数
async function callAliyunAPI(action, params, accessKeyId, accessKeySecret, regionId, endpoint) {
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
    Action: action,
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

  const queryParams = new URLSearchParams();
  sortedKeys.forEach(key => {
    queryParams.append(key, signParams[key]);
  });
  queryParams.append('Signature', signature);

  const url = `https://${endpoint}/?${queryParams.toString()}`;

  return new Promise((resolve, reject) => {
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
}

// 如果直接运行此脚本，则查询指定的方案代码
if (import.meta.url === `file://${process.argv[1]}`) {
  const schemeCode = process.argv[2] || process.env.SCHEME_CODE || 'FC220000012470042';

  console.log(`=== 查询方案代码 ${schemeCode} 的认证秘钥 ===\n`);

  querySchemeSecret(schemeCode)
    .then(() => {
      console.log('\n=== 查询完成 ===');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n=== 查询失败 ===');
      process.exit(1);
    });
}

export { querySchemeSecret };
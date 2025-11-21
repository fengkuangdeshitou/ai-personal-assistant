#!/usr/bin/env node

/**
 * 测试上传接口
 * 测试阿里云认证方案参数上传到外部接口的功能
 */

const https = require('https');

// 测试数据
const testCases = [
  {
    name: 'iOS测试方案',
    description: '测试iOS类型的认证方案上传',
    data: {
      name: '测试iOS方案',
      code: 'TEST_IOS_001',
      appname: '测试iOS应用',
      type: 'ios',
      secret_key: 'test_ios_secret_key_123456789',
      bundle_id: 'com.test.ios.app'
    }
  },
  {
    name: 'Web测试方案',
    description: '测试Web类型的认证方案上传',
    data: {
      name: '测试Web方案',
      code: 'TEST_WEB_001',
      appname: '测试Web应用',
      type: 'h5',
      secret_key: 'test_web_secret_key_123456789',
      url: 'https://example.com/login',
      origin: 'https://example.com'
    }
  },
  {
    name: '最小参数测试',
    description: '测试只包含必要参数的情况',
    data: {
      name: '最小参数方案',
      code: 'TEST_MIN_001',
      appname: '最小参数应用',
      type: 'ios',
      secret_key: 'test_min_secret_key_123456789'
    }
  }
];

function testUploadInterface(testCase) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 测试: ${testCase.name}`);
    console.log(`📝 描述: ${testCase.description}`);
    console.log(`📤 发送数据:`, JSON.stringify(testCase.data, null, 2));

    const postData = JSON.stringify(testCase.data);

    const options = {
      hostname: 'api.mlgamebox.my16api.com',
      port: 443,
      path: '/sdkIosOneLoginConfig',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      console.log(`📥 响应状态码: ${res.statusCode}`);
      console.log(`📥 响应头:`, res.headers);

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const responseData = JSON.parse(data);
          console.log(`📥 响应数据:`, JSON.stringify(responseData, null, 2));

          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ 测试通过: ${testCase.name}`);
            resolve({ success: true, statusCode: res.statusCode, data: responseData });
          } else {
            console.log(`❌ 测试失败: ${testCase.name} - 状态码: ${res.statusCode}`);
            resolve({ success: false, statusCode: res.statusCode, data: responseData });
          }
        } catch (parseError) {
          console.log(`📥 原始响应:`, data);
          console.log(`❌ 解析响应失败: ${testCase.name} - ${parseError.message}`);
          resolve({ success: false, statusCode: res.statusCode, rawData: data, error: parseError.message });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ 请求失败: ${testCase.name} - ${error.message}`);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 开始测试上传接口: https://api.mlgamebox.my16api.com/sdkIosOneLoginConfig');
  console.log('=' .repeat(80));

  const results = [];

  for (const testCase of testCases) {
    try {
      const result = await testUploadInterface(testCase);
      results.push({ testCase: testCase.name, ...result });
    } catch (error) {
      console.log(`💥 测试异常: ${testCase.name} - ${error.message}`);
      results.push({ testCase: testCase.name, success: false, error: error.message });
    }

    // 等待1秒，避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '=' .repeat(80));
  console.log('📊 测试结果汇总:');

  let successCount = 0;
  results.forEach(result => {
    const status = result.success ? '✅ 通过' : '❌ 失败';
    console.log(`${status} ${result.testCase}`);
    if (result.success) successCount++;
  });

  console.log(`\n🎯 测试完成: ${successCount}/${results.length} 个测试通过`);

  if (successCount === results.length) {
    console.log('🎉 所有测试通过！上传接口工作正常。');
  } else {
    console.log('⚠️  部分测试失败，请检查接口或网络连接。');
  }
}

// 运行测试
runTests().catch(error => {
  console.error('💥 测试执行失败:', error);
  process.exit(1);
});
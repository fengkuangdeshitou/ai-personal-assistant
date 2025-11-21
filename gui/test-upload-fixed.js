#!/usr/bin/env node

/**
 * 测试修复后的上传接口
 * 验证Web类型也包含bundle_id参数
 */

const https = require('https');

// 测试修复后的Web类型数据
const testCases = [
  {
    name: '修复后的Web测试方案',
    description: '测试Web类型包含bundle_id参数的上传',
    data: {
      name: '修复后的Web方案',
      code: 'TEST_WEB_FIXED_001',
      appname: '修复后的Web应用',
      type: 'h5',
      secret_key: 'test_web_secret_key_fixed_123456789',
      bundle_id: 'https://example.com/login',  // 使用URL作为bundle_id
      url: 'https://example.com/login',
      origin: 'https://example.com'
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

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const responseData = JSON.parse(data);
          console.log(`📥 响应数据:`, JSON.stringify(responseData, null, 2));

          if (res.statusCode >= 200 && res.statusCode < 300 && responseData.status?.succeed === 1) {
            console.log(`✅ 测试通过: ${testCase.name}`);
            resolve({ success: true, statusCode: res.statusCode, data: responseData });
          } else {
            console.log(`❌ 测试失败: ${testCase.name} - 状态码: ${res.statusCode}, succeed: ${responseData.status?.succeed}`);
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
  console.log('🚀 测试修复后的上传接口');
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
    console.log('🎉 修复成功！现在Web类型上传也正常工作了。');
  } else {
    console.log('⚠️  修复仍有问题，请进一步检查。');
  }
}

// 运行测试
runTests().catch(error => {
  console.error('💥 测试执行失败:', error);
  process.exit(1);
});
#!/usr/bin/env node

/**
 * 测试重新上传功能的参数验证
 * 验证iOS类型必须有bundle_id，Web类型必须有URL等参数
 */

const https = require('https');

// 测试用例：不同场景的参数验证
const testCases = [
  {
    name: '有效的iOS方案',
    description: 'iOS方案包含所有必要参数',
    data: {
      name: '测试iOS方案',
      code: 'TEST_IOS_VALID_001',
      appname: '测试iOS应用',
      type: 'ios',
      secret_key: 'test_ios_secret_valid_123456789',
      bundle_id: 'com.test.ios.valid.app'
    },
    expectSuccess: true
  },
  {
    name: '无效的iOS方案（缺少bundle_id）',
    description: 'iOS方案缺少bundle_id参数',
    data: {
      name: '测试iOS方案',
      code: 'TEST_IOS_INVALID_001',
      appname: '测试iOS应用',
      type: 'ios',
      secret_key: 'test_ios_secret_invalid_123456789'
      // 缺少bundle_id
    },
    expectSuccess: false,
    expectError: '缺少参数：bundle_id'
  },
  {
    name: '有效的Web方案',
    description: 'Web方案包含所有必要参数',
    data: {
      name: '测试Web方案',
      code: 'TEST_WEB_VALID_001',
      appname: '测试Web应用',
      type: 'h5',
      secret_key: 'test_web_secret_valid_123456789',
      bundle_id: 'https://example.com/login',
      url: 'https://example.com/login',
      origin: 'https://example.com'
    },
    expectSuccess: true
  },
  {
    name: '无效的Web方案（缺少URL和bundle_id）',
    description: 'Web方案缺少URL和bundle_id参数',
    data: {
      name: '测试Web方案',
      code: 'TEST_WEB_INVALID_001',
      appname: '测试Web应用',
      type: 'h5',
      secret_key: 'test_web_secret_invalid_123456789'
      // 缺少url和bundle_id
    },
    expectSuccess: false,
    expectError: '缺少参数：bundle_id'
  },
  {
    name: '缺少secret_key的方案',
    description: '任何类型方案缺少secret_key',
    data: {
      name: '测试方案',
      code: 'TEST_NO_SECRET_001',
      appname: '测试应用',
      type: 'ios',
      bundle_id: 'com.test.no.secret.app'
      // 缺少secret_key
    },
    expectSuccess: false,
    expectError: '缺少参数：secret_key'
  }
];

function testUploadWithValidation(testCase) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 测试: ${testCase.name}`);
    console.log(`📝 描述: ${testCase.description}`);
    console.log(`🎯 期望结果: ${testCase.expectSuccess ? '成功' : '失败'}`);
    if (testCase.expectError) {
      console.log(`❌ 期望错误: ${testCase.expectError}`);
    }
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

          const actualSuccess = res.statusCode >= 200 && res.statusCode < 300 && responseData.status?.succeed === 1;
          const expectedSuccess = testCase.expectSuccess;

          if (actualSuccess === expectedSuccess) {
            console.log(`✅ 测试结果符合预期: ${testCase.name}`);
            resolve({
              success: true,
              testCase: testCase.name,
              actualSuccess,
              expectedSuccess,
              statusCode: res.statusCode,
              data: responseData
            });
          } else {
            console.log(`❌ 测试结果不符合预期: ${testCase.name}`);
            console.log(`   期望: ${expectedSuccess ? '成功' : '失败'}, 实际: ${actualSuccess ? '成功' : '失败'}`);
            resolve({
              success: false,
              testCase: testCase.name,
              actualSuccess,
              expectedSuccess,
              statusCode: res.statusCode,
              data: responseData
            });
          }
        } catch (parseError) {
          console.log(`📥 原始响应:`, data);
          console.log(`❌ 解析响应失败: ${parseError.message}`);
          resolve({
            success: false,
            testCase: testCase.name,
            error: parseError.message,
            rawData: data
          });
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
  console.log('🚀 测试重新上传功能的参数验证');
  console.log('=' .repeat(100));

  const results = [];
  let passedTests = 0;

  for (const testCase of testCases) {
    try {
      const result = await testUploadWithValidation(testCase);
      results.push(result);
      if (result.success) passedTests++;

      // 等待1秒，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`💥 测试异常: ${testCase.name} - ${error.message}`);
      results.push({
        success: false,
        testCase: testCase.name,
        error: error.message
      });
    }
  }

  console.log('\n' + '=' .repeat(100));
  console.log('📊 测试结果汇总:');

  results.forEach(result => {
    const status = result.success ? '✅ 通过' : '❌ 失败';
    console.log(`${status} ${result.testCase}`);
  });

  console.log(`\n🎯 测试完成: ${passedTests}/${results.length} 个测试通过`);

  if (passedTests === results.length) {
    console.log('🎉 所有参数验证测试通过！');
    console.log('💡 前端重新上传功能现在会正确验证参数：');
    console.log('   - iOS方案必须有bundle_id');
    console.log('   - Web方案必须有url或bundle_id');
    console.log('   - 所有方案必须有secret_key');
  } else {
    console.log('⚠️  部分测试失败，请检查参数验证逻辑');
  }
}

// 运行测试
runTests().catch(error => {
  console.error('💥 测试执行失败:', error);
  process.exit(1);
});
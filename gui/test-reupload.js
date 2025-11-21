#!/usr/bin/env node

/**
 * 测试重新上传功能
 * 模拟用户提到的FC220000012490068方案重新上传
 */

const https = require('https');

// 模拟用户提到的方案数据
const testScheme = {
  name: '测试重新上传方案',
  code: 'FC220000012490068',  // 用户提到的代码（可能是错误码或方案码）
  appname: '测试iOS应用',
  type: 'ios',
  secret_key: 'test_ios_secret_reupload_123456789',
  bundle_id: 'com.test.reupload.app'
};

function testReupload(schemeData) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 测试重新上传方案: ${schemeData.code}`);
    console.log(`📝 方案信息:`, JSON.stringify(schemeData, null, 2));

    const postData = JSON.stringify(schemeData);

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
            console.log(`✅ 重新上传成功: ${schemeData.code}`);
            resolve({ success: true, statusCode: res.statusCode, data: responseData });
          } else {
            console.log(`❌ 重新上传失败: ${schemeData.code} - ${responseData.status?.error_desc || '未知错误'}`);
            resolve({ success: false, statusCode: res.statusCode, data: responseData });
          }
        } catch (parseError) {
          console.log(`📥 原始响应:`, data);
          console.log(`❌ 解析响应失败: ${parseError.message}`);
          resolve({ success: false, statusCode: res.statusCode, rawData: data, error: parseError.message });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ 请求失败: ${error.message}`);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log('🚀 测试重新上传功能');
  console.log('=' .repeat(80));

  try {
    const result = await testReupload(testScheme);

    console.log('\n' + '=' .repeat(80));
    console.log('📊 测试结果:');

    if (result.success) {
      console.log('✅ 重新上传功能测试通过');
      console.log('🎉 现在您可以在前端界面中使用"重新上传"按钮来重新上传方案了');
    } else {
      console.log('❌ 重新上传功能测试失败');
      console.log('⚠️  请检查接口或参数配置');
    }

  } catch (error) {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
  }
}

// 运行测试
runTest();
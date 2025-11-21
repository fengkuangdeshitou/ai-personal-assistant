// 设置环境变量避免dotenv启动服务器
process.env.ALICLOUD_ACCESS_KEY_ID = 'YOUR_ACCESS_KEY_ID';
process.env.ALICLOUD_ACCESS_KEY_SECRET = 'YOUR_ACCESS_KEY_SECRET';

async function testCreateSchemeAPI() {
  try {
    console.log('测试完整的创建方案API...');

    const testData = {
      SchemeName: 'APITest_' + Date.now(),
      AccessEnd: 'iOS',
      AppName: '测试应用',
      PackName: 'com.example.testapp'
    };

    console.log('发送数据:', testData);

    const response = await fetch('http://localhost:5178/api/create-scheme', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    console.log('API响应:', result);

    if (result.success) {
      console.log('✅ API调用成功!');
      console.log('方案ID:', result.data.schemeCode);
    } else {
      console.log('❌ API调用失败:', result.error);
    }

  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testCreateSchemeAPI();
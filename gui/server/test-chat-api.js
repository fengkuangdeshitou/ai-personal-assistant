// 简单的API测试脚本 (ES模块版本)
import http from 'http';

console.log('🧪 开始测试AI聊天API演示服务器...\n');

// 测试健康检查
const testHealth = () => {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5179/health', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('✅ 健康检查:', response.status);
          resolve(true);
        } catch (e) {
          console.log('❌ 健康检查失败');
          resolve(false);
        }
      });
    });
    req.on('error', () => {
      console.log('❌ 连接失败 - 服务器未启动');
      resolve(false);
    });
  });
};

// 测试发送消息
const testSendMessage = () => {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      message: '你好，测试API'
    });

    const options = {
      hostname: 'localhost',
      port: 5179,
      path: '/api/chat/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('✅ 发送消息:', response.success ? '成功' : '失败');
          if (response.message) {
            console.log('   AI回复:', response.message.content.substring(0, 30) + '...');
          }
          resolve(true);
        } catch (e) {
          console.log('❌ 发送消息失败');
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      console.log('❌ 发送消息连接失败');
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
};

// 运行测试
async function runTests() {
  const healthOk = await testHealth();
  if (healthOk) {
    await testSendMessage();
  }
  console.log('\n🎉 测试完成！');
}

runTests();
const http = require('http');

// 测试聊天API
function testChatAPI() {
  const postData = JSON.stringify({
    message: '你好，测试API功能'
  });

  const options = {
    hostname: 'localhost',
    port: 5178,
    path: '/api/chat/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`状态码: ${res.statusCode}`);
    console.log(`响应头:`, res.headers);

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log('API响应成功:');
        console.log(JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('响应数据:', data);
        console.error('解析JSON失败:', e.message);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`请求失败: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

// 延迟执行，确保服务器启动
setTimeout(testChatAPI, 1000);
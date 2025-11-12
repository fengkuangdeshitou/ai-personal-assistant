import http from 'http';

function testSwitch() {
  const postData = JSON.stringify({
    projectName: 'hg-bookmark',
    channel: 'hz'
  });

  const options = {
    hostname: 'localhost',
    port: 5178,
    path: '/api/switch-channel',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('切换结果:', JSON.stringify(result, null, 2));
      } catch (e) {
        console.log('响应数据:', data);
      }
    });
  });

  req.on('error', (e) => {
    console.error('请求失败:', e.message);
  });

  req.write(postData);
  req.end();
}

testSwitch();
import http from 'http';
import fs from 'fs';
import path from 'path';

// 检查项目结构
const projectPath = '/Users/maiyou001/Project/hg-bookmark';
console.log('检查项目结构...');

try {
  const srcPath = path.join(projectPath, 'src');
  if (fs.existsSync(srcPath)) {
    console.log('✅ src目录存在');
    const envPath = path.join(srcPath, 'env.js');
    if (fs.existsSync(envPath)) {
      console.log('✅ env.js文件存在');
      const content = fs.readFileSync(envPath, 'utf-8');
      console.log('env.js内容:');
      console.log(content);
    } else {
      console.log('❌ env.js文件不存在');
    }
  } else {
    console.log('❌ src目录不存在');
  }
} catch (e) {
  console.error('检查项目结构时出错:', e.message);
}

// 测试API
console.log('\n测试API调用...');
const data = JSON.stringify({
  projectName: 'hg-bookmark',
  channel: '01'
});

const options = {
  hostname: 'localhost',
  port: 5178,
  path: '/api/switch-channel',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log('API响应状态:', res.statusCode);

  res.on('data', (chunk) => {
    console.log('API响应内容:', chunk.toString());
  });
});

req.on('error', (e) => {
  console.error('API调用失败:', e.message);
});

req.write(data);
req.end();
import fs from 'fs';
import path from 'path';

const envPath = '/Users/maiyou001/Project/hg-bookmark/src/env.js';
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  console.log('当前env.js内容:');
  console.log(content);
} else {
  console.log('env.js文件不存在');
}
#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 基础版本号
const BASE_VERSION = '1.6.0';

// 获取git提交次数
function getGitCommitCount() {
  try {
    const output = execSync('git rev-list --count HEAD', { encoding: 'utf8' });
    return parseInt(output.trim());
  } catch (error) {
    console.error('获取git提交次数失败:', error.message);
    return 0;
  }
}

// 计算版本号
function calculateVersion() {
  const commitCount = getGitCommitCount();
  const [major, minor, patch] = BASE_VERSION.split('.').map(Number);

  // 每次提交增加patch版本
  const newPatch = patch + commitCount;
  return `${major}.${minor}.${newPatch}`;
}

// 更新文件中的版本号
function updateVersionInFile(filePath, oldVersion, newVersion) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(new RegExp(oldVersion.replace(/\./g, '\\.'), 'g'), newVersion);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ 更新 ${filePath}: ${oldVersion} → ${newVersion}`);
  } catch (error) {
    console.error(`❌ 更新 ${filePath} 失败:`, error.message);
  }
}

// 主函数
function main() {
  const newVersion = calculateVersion();
  console.log(`📦 当前版本: ${newVersion}`);

  // 需要更新的文件和位置
  const filesToUpdate = [
    {
      path: path.join(__dirname, '../frontend/src/components/Sidebar.tsx'),
      pattern: 'v1\\.[0-9]+\\.[0-9]+'
    },
    {
      path: path.join(__dirname, '../frontend/src/pages/Dashboard.tsx'),
      pattern: 'v1\\.[0-9]+\\.[0-9]+'
    },
    {
      path: path.join(__dirname, '../frontend/src/pages/Settings.tsx'),
      pattern: 'v1\\.[0-9]+\\.[0-9]+'
    }
  ];

  // 获取当前版本号进行替换
  const currentVersion = '1.6.0';

  filesToUpdate.forEach(({ path: filePath, pattern }) => {
    if (fs.existsSync(filePath)) {
      updateVersionInFile(filePath, `v${currentVersion}`, `v${newVersion}`);
      updateVersionInFile(filePath, currentVersion, newVersion);
    } else {
      console.log(`⚠️ 文件不存在: ${filePath}`);
    }
  });

  console.log('🎉 版本更新完成!');
}

main();
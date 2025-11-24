#!/usr/bin/env node

// Electron Builder 优化脚本
// 移除不必要的文件以减小包大小

const fs = require('fs');
const path = require('path');

function removeUnnecessaryFiles(context) {
  const appOutDir = context.appOutDir;

  console.log('🧹 开始优化构建文件...');

  // 需要保留的文件和目录
  const keepPatterns = [
    'build/',
    'electron.js',
    'preload.js',
    'package.json',
    'node_modules/'
  ];

  // 需要删除的文件类型
  const removePatterns = [
    '**/*.map',           // 源码映射文件
    '**/*.md',            // 文档文件
    '**/.DS_Store',       // macOS 系统文件
    '**/.*',              // 隐藏文件（除了必要的）
    '**/*.log',           // 日志文件
    '**/*.lock',          // 锁文件
    '**/coverage/',       // 测试覆盖率
    '**/test*/',          // 测试文件
    '**/spec*/',          // 测试规格
    '**/example*/',       // 示例文件
    '**/demo*/',          // 演示文件
    '**/doc*/',           // 文档目录
    '**/README*',         // README文件
    '**/CHANGELOG*',      // 更新日志
    '**/LICENSE*',        // 许可证（保留主要许可证）
  ];

  function shouldRemove(filePath) {
    const relativePath = path.relative(appOutDir, filePath);

    // 保留必要的文件
    for (const pattern of keepPatterns) {
      if (relativePath.startsWith(pattern)) {
        return false;
      }
    }

    // 删除不必要的文件
    for (const pattern of removePatterns) {
      if (relativePath.includes(pattern.replace('**/', ''))) {
        return true;
      }
    }

    return false;
  }

  function cleanDirectory(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (shouldRemove(itemPath)) {
          if (stat.isDirectory()) {
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log(`🗑️  删除目录: ${path.relative(appOutDir, itemPath)}`);
          } else {
            fs.unlinkSync(itemPath);
            console.log(`🗑️  删除文件: ${path.relative(appOutDir, itemPath)}`);
          }
        } else if (stat.isDirectory()) {
          cleanDirectory(itemPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  清理目录失败: ${dirPath}`, error.message);
    }
  }

  // 清理应用目录
  const appDir = path.join(appOutDir, 'resources', 'app');
  if (fs.existsSync(appDir)) {
    cleanDirectory(appDir);
  }

  console.log('✅ 构建文件优化完成');
}

module.exports = function(context) {
  // 只在打包时运行优化
  if (context.electronPlatformName) {
    removeUnnecessaryFiles(context);
  }
  return Promise.resolve();
};
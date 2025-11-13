#!/usr/bin/env node

/**
 * 自定义提醒脚本 - 预约疫苗提醒
 */

import { exec } from 'child_process';

// 计算明天中午12点的毫秒数
const now = new Date();
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);
tomorrow.setHours(12, 0, 0, 0);

const delay = tomorrow.getTime() - now.getTime();

console.log(`⏰ 设置提醒: ${tomorrow.toLocaleString('zh-CN')}`);
console.log(`⏳ 延迟时间: ${Math.round(delay / 1000 / 60)} 分钟`);

setTimeout(() => {
    console.log('🔔 提醒时间到！');

    // 使用 macOS 通知
    const message = '请在小程序上预约疫苗';
    const title = '疫苗预约提醒';

    exec(`osascript -e 'display notification "${message}" with title "${title}" sound name "Glass"'`, (error) => {
        if (error) {
            console.error('❌ 通知发送失败:', error.message);
        } else {
            console.log('✅ 提醒已发送');
        }
    });

    // 也可以打开提醒页面（可选）
    // const { fileURLToPath } from 'url';
    // const { dirname, join } from 'path';
    // const __filename = fileURLToPath(import.meta.url);
    // const __dirname = dirname(__filename);
    // const htmlPath = join(__dirname, '../reminder-popup.html');
    // const url = `file://${htmlPath}?type=custom&message=${encodeURIComponent(message)}`;
    // exec(`/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --new-window --app="${url}"`);

}, delay);
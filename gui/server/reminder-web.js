#!/usr/bin/env node

/**
 * 网页版提醒弹窗
 */

import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 提醒类型映射
const reminderTypes = {
    '9:30': 'morning',
    '12:30': 'lunch',
    '14:0': 'afternoon',
    '18:30': 'evening'
};

// 获取当前时间
const now = new Date();
const timeKey = `${now.getHours()}:${now.getMinutes()}`;
const reminderType = reminderTypes[timeKey] || 'morning';

// HTML文件路径
const htmlPath = join(__dirname, '../reminder-popup.html');
const url = `file://${htmlPath}?type=${reminderType}`;

console.log('⏰ 打开提醒页面...');
console.log('📍 类型:', reminderType);

// 播放音效
exec('afplay /System/Library/Sounds/Glass.aiff', (err) => {
    if (err) console.warn('⚠️  音效播放失败');
});

// 在浏览器中打开提醒页面
// 使用 Chrome 的应用模式打开，看起来像原生弹窗（更大尺寸）
// 添加 --new-window 确保可以关闭
const chromeCommand = `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --new-window --app="${url}" --window-size=640,820`;

let chromeProcess;
exec(chromeCommand, (error) => {
    if (error) {
        // 如果 Chrome 失败，尝试用 Safari
        console.log('⚠️  Chrome 打开失败，使用 Safari...');
        exec(`open -a Safari "${url}"`, (err2) => {
            if (err2) {
                console.error('❌ 打开失败:', err2.message);
                process.exit(1);
            } else {
                console.log('✅ 已用 Safari 打开提醒');
            }
        });
    } else {
        console.log('✅ 提醒已打开！');
        console.log('💡 点击关闭按钮或按 ⌘W 可关闭窗口');
    }
});

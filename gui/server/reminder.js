#!/usr/bin/env node

/**
 * 定时提醒系统 - 网页版弹窗
 * 每天4个时间点弹出提醒
 */

import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 提醒配置
const reminders = [
    { 
        hour: 9, 
        minute: 30, 
        type: 'morning',
        icon: '☕',
        title: '早安时刻'
    },
    { 
        hour: 12, 
        minute: 30, 
        type: 'lunch',
        icon: '🍱',
        title: '午休时间'
    },
    { 
        hour: 14, 
        minute: 0, 
        type: 'afternoon',
        icon: '💼',
        title: '下午工作开始'
    },
    { 
        hour: 18, 
        minute: 30, 
        type: 'evening',
        icon: '🎉',
        title: '下班啦'
    }
];

// 获取当前时间
const now = new Date();
const currentHour = now.getHours();
const currentMinute = now.getMinutes();

// 查找匹配的提醒
const reminder = reminders.find(r => r.hour === currentHour && r.minute === currentMinute);

if (reminder) {
    console.log(`🌸 触发提醒: ${reminder.icon} ${reminder.title}`);
    
    // HTML文件路径
    const htmlPath = join(__dirname, '../reminder-popup.html');
    const url = `file://${htmlPath}?type=${reminder.type}`;
    
    // 播放音效
    exec('afplay /System/Library/Sounds/Glass.aiff', (err) => {
        if (err) console.warn('⚠️  音效播放失败');
    });
    
    // 在 Chrome 中打开提醒页面（应用模式）
    const chromeCommand = `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --new-window --app="${url}" --window-size=640,820`;
    
    exec(chromeCommand, (error) => {
        if (error) {
            // 如果 Chrome 失败，尝试 Safari
            exec(`open -a Safari "${url}"`, (err2) => {
                if (err2) {
                    console.error('❌ 打开失败:', err2.message);
                } else {
                    console.log('✅ 已用 Safari 打开提醒');
                }
            });
        } else {
            console.log('✅ 提醒已发送:', reminder.icon, reminder.title);
        }
    });
} else {
    console.log(`⏰ 当前时间 ${currentHour}:${String(currentMinute).padStart(2, '0')} - 无提醒任务`);
}

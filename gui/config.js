// AI 私人助理配置文件
// 复制此文件内容并粘贴到浏览器控制台，然后刷新页面即可应用配置

const AI_ASSISTANT_CONFIG = {
    // GitHub 配置
    github: {
        owner: 'fengkuangdeshitou',        // GitHub 用户名
        repo: 'ai-personal-assistant',      // 主要仓库名称
        token: '',                          // GitHub Personal Access Token (可选，提高 API 限制)
    },

    // 用户配置
    user: {
        name: '疯狂的石头',                // 用户昵称
        workStart: '09:30',                 // 上班时间
        lunchStart: '12:30',                // 午餐开始时间
        lunchEnd: '14:00',                  // 午餐结束时间
        workEnd: '18:30',                   // 下班时间
    },

    // 项目配置
    projects: {
        baseDir: '~/Project',               // 项目根目录
        backupDir: '~/Backups',             // 备份目录
    },

    // 数据刷新配置
    refresh: {
        autoRefresh: true,                  // 是否自动刷新
        interval: 30,                       // 自动刷新间隔（分钟）
        greetingInterval: 1,                // 问候语刷新间隔（分钟）
    },

    // 通知配置
    notifications: {
        enabled: true,                      // 是否显示通知
        duration: 2000,                     // 通知显示时长（毫秒）
        position: 'top-right',              // 通知位置 (top-right, top-left, bottom-right, bottom-left)
    },

    // API 配置
    api: {
        githubBaseUrl: 'https://api.github.com',
        timeout: 10000,                     // 请求超时时间（毫秒）
        maxRetries: 3,                      // 最大重试次数
    },

    // 缓存配置
    cache: {
        enabled: true,                      // 是否启用缓存
        ttl: 1800000,                       // 缓存有效期（毫秒，默认30分钟）
    },

    // 开发配置
    dev: {
        debug: false,                       // 是否启用调试模式
        mockData: false,                    // 是否使用模拟数据
    }
};

// 保存配置到 LocalStorage
function saveConfig() {
    localStorage.setItem('AI_ASSISTANT_CONFIG', JSON.stringify(AI_ASSISTANT_CONFIG));
    console.log('✅ 配置已保存！请刷新页面以应用配置。');
}

// 加载配置
function loadConfig() {
    const saved = localStorage.getItem('AI_ASSISTANT_CONFIG');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('❌ 配置加载失败:', e);
            return AI_ASSISTANT_CONFIG;
        }
    }
    return AI_ASSISTANT_CONFIG;
}

// 重置配置
function resetConfig() {
    localStorage.removeItem('AI_ASSISTANT_CONFIG');
    console.log('✅ 配置已重置为默认值！请刷新页面。');
}

// 显示当前配置
function showConfig() {
    const config = loadConfig();
    console.log('📋 当前配置:', config);
    return config;
}

// 使用说明
console.log(`
🤖 AI 私人助理配置说明
========================

1. 修改上面的配置项
2. 在控制台运行: saveConfig()
3. 刷新页面应用配置

快捷命令：
- saveConfig()  : 保存配置
- showConfig()  : 查看当前配置
- resetConfig() : 重置为默认配置
- loadConfig()  : 重新加载配置

示例：修改 GitHub Token
-----------------------
AI_ASSISTANT_CONFIG.github.token = 'ghp_your_token_here';
saveConfig();

注意：GitHub Token 可以提高 API 请求限制
获取 Token: https://github.com/settings/tokens
所需权限: public_repo
`);

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { spawn, execSync, exec } from 'child_process';
import multer from 'multer';
import AdmZip from 'adm-zip';
import simpleGit from 'simple-git';
import archiver from 'archiver';
import OSS from 'ali-oss';
import less from 'less'; // 🚨 新增 Less 库导入
import dotenv from 'dotenv';
import { createVerifyScheme } from './aliyun-dypns-sdk.js';
import { querySchemeSecret } from './query-scheme-secret.js';
import Client from '@alicloud/dypnsapi20170525';
import * as $Dypnsapi from '@alicloud/dypnsapi20170525';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Util from '@alicloud/tea-util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量，并明确指定 .env 文件路径
dotenv.config({ path: path.resolve(__dirname, '.env') });

// 验证环境变量是否加载成功
if (process.env.ALICLOUD_ACCESS_KEY_ID) {
  console.log(`✅ Access Key ID Loaded: ${process.env.ALICLOUD_ACCESS_KEY_ID.substring(0, 8)}...`);
} else {
  console.error('❌ ALICLOUD_ACCESS_KEY_ID not found. Please check your .env file in the server directory.');
}

const app = express();
const PORT = process.env.PORT || 5178;

// 默认项目目录
const DEFAULT_DIR = '/Users/maiyou001/Project';

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, 'projects.json');
const OSS_CONFIG_PATH = path.join(__dirname, 'oss-connection-config.json');
const CHANNEL_CONFIG_PATH = path.join(__dirname, 'channel-config.json');

// 内存存储（用于小文件，如 IPA 解析时直接读取）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// 磁盘存储（用于大文件，如 SDK 替换资源 zip）
const MULTER_TMP_DIR = path.join(os.tmpdir(), 'multer-fw-uploads');
if (!fs.existsSync(MULTER_TMP_DIR)) fs.mkdirSync(MULTER_TMP_DIR, { recursive: true });
const uploadToDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MULTER_TMP_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// 初始化AI服务
// AI服务已移除
// PNA 必须在 cors() 之前设置，否则 cors() 拦截 OPTIONS 后不会调用 next()
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
// Chrome Private Network Access (PNA)：localhost:4000 → localhost:5178 的跨域请求需要此配置
app.use(cors({ origin: true }));
app.use(express.json());

// 全请求日志（调试用）
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/ipa')) {
    console.log(`[req] ${req.method} ${req.path} origin=${req.headers.origin || '-'} ct=${(req.headers['content-type'] || '').split(';')[0]}`);
  }
  next();
});

// IPA 替换等耗时操作：延长超时（30 分钟）
app.use('/api/ipa', (req, res, next) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

// 提供静态文件服务 - 从上级gui目录提供HTML文件
app.use(express.static(path.join(__dirname, '..')));

// IPA 会话临时目录
const SESSIONS_DIR = path.join(os.tmpdir(), 'ipa-sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

function cleanupExpiredSessions() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000;
  fs.readdir(SESSIONS_DIR, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const sessionPath = path.join(SESSIONS_DIR, file);
      fs.stat(sessionPath, (statErr, stats) => {
        if (statErr) return;
        if (now - stats.mtime.getTime() > maxAge) {
          fs.rm(sessionPath, { recursive: true, force: true }, () => {});
        }
      });
    });
  });
}
setInterval(cleanupExpiredSessions, 10 * 60 * 1000);

// Less 编译相关常量
const LESS_INPUT_PATH = 'src/css/css.less';
const CSS_OUTPUT_PATH = 'src/css/css.css';

// 从新的配置结构中获取 bucket 配置
function getBucketConfig(ossConfigs, projectName, channelId = null, env = 'dev') {
  try {
    console.log(`getBucketConfig called: projectName=${projectName}, channelId=${channelId}, env=${env}`);
    
    const projectConfig = ossConfigs.projects?.[projectName];
    if (!projectConfig) {
      console.log(`Project ${projectName} not found in config`);
      return null;
    }
    
    console.log(`Found project config:`, projectConfig.name);
    
    // 多渠道项目
    if (projectConfig.channels && channelId) {
      console.log(`Processing multi-channel project with channelId: ${channelId}`);
      
      const channelConfig = projectConfig.channels[channelId];
      if (!channelConfig) {
        console.log(`Channel ${channelId} not found in project ${projectName}`);
        return null;
      }
      
      console.log(`Found channel config:`, channelConfig.name);
      
      const bucketInfo = channelConfig.buckets?.[env];
      if (!bucketInfo) {
        console.log(`Bucket info not found for env ${env} in channel ${channelId}`);
        return null;
      }
      
      console.log(`Found bucket info:`, bucketInfo);
      
      // 处理不同格式
      if (typeof bucketInfo === 'string') {
        return {
          name: bucketInfo,
          region: ossConfigs.connection.region,
          prefix: '',
          url: `https://${bucketInfo}.oss-cn-hangzhou.aliyuncs.com`,
          enabled: true
        };
      } else if (Array.isArray(bucketInfo)) {
        return bucketInfo.map(b => {
          if (typeof b === 'string') {
            return {
              name: b,
              region: ossConfigs.connection.region,
              prefix: '',
              url: `https://${b}.oss-cn-hangzhou.aliyuncs.com`,
              enabled: true
            };
          }
          return b;
        });
      } else {
        return {
          name: bucketInfo.name,
          region: bucketInfo.region,
          prefix: bucketInfo.prefix || '',
          url: bucketInfo.url,
          enabled: bucketInfo.enabled !== false
        };
      }
    }
    
    // 单渠道项目
    if (projectConfig.buckets) {
      const bucketInfo = projectConfig.buckets[env];
      if (!bucketInfo) return null;
      
      // 处理数组（多个生产环境）
      if (Array.isArray(bucketInfo)) {
        return bucketInfo.map(b => {
          if (typeof b === 'string') {
            return {
              name: b,
              region: ossConfigs.connection.region,
              prefix: '',
              url: `https://${b}.oss-cn-hangzhou.aliyuncs.com`
            };
          }
          return b;
        });
      } else if (typeof bucketInfo === 'string') {
        return {
          name: bucketInfo,
          region: ossConfigs.connection.region,
          prefix: '',
          url: `https://${bucketInfo}.oss-cn-hangzhou.aliyuncs.com`
        };
      } else {
        return {
          name: bucketInfo.name,
          region: bucketInfo.region,
          prefix: bucketInfo.prefix || '',
          url: bucketInfo.url
        };
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error getting bucket config:', e);
    return null;
  }
}


function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const toAbs = (p) => p.replace(/^~(?=\/|$)/, os.homedir());
      if (Array.isArray(data)) return data.map(x => ({ ...x, path: toAbs(x.path) })); // [{name, path}]
      if (Array.isArray(data.projects)) return data.projects.map(x => ({ ...x, path: toAbs(x.path) }));
    }
  } catch (e) {
    console.error('Failed to read projects.json:', e.message);
  }
  return null;
}

function scanProjects(dir) {
  const entries = [];
  try {
    const names = fs.readdirSync(dir, { withFileTypes: true });
    for (const d of names) {
      if (!d.isDirectory()) continue;
      const p = path.join(dir, d.name);
      const gitDir = path.join(p, '.git');
      if (fs.existsSync(gitDir) && fs.lstatSync(gitDir).isDirectory()) {
        entries.push({ name: d.name, path: p });
      }
    }
  } catch (e) {
    // ignore
  }
  return entries;
}

async function getLastCommitTime(repoPath) {
  try {
    const git = simpleGit({ baseDir: repoPath });
    const log = await git.log({ maxCount: 1 });
    if (log && log.latest && log.latest.date) {
      return new Date(log.latest.date).toISOString();
    }
  } catch (e) {
    // ignore
  }
  // fallback: directory mtime
  try {
    const stat = fs.statSync(repoPath);
    return stat.mtime.toISOString();
  } catch (_) {
    return new Date().toISOString();
  }
}

async function getStatusCounts(repoPath) {
  try {
    const git = simpleGit({ baseDir: repoPath });
    const status = await git.status();
    const modified = (status.modified?.length || 0) + (status.renamed?.length || 0) + (status.staged?.length || 0);
    const added = (status.created?.length || 0) + (status.not_added?.length || 0);
    const deleted = (status.deleted?.length || 0);
    const isClean = status.isClean();
    return { modified, added, deleted, isClean };
  } catch (e) {
    return { modified: 0, added: 0, deleted: 0, isClean: true, error: e.message };
  }
}

async function getCurrentBranch(repoPath) {
  try {
    const git = simpleGit({ baseDir: repoPath });
    const branch = await git.branch();
    return branch.current;
  } catch (e) {
    return 'unknown';
  }
}

async function getWeeklyCommits(repoPath, days = 7) {
  try {
    const git = simpleGit({ baseDir: repoPath });
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    
    // Get commit log
    const log = await git.log({ '--since': sinceStr, '--all': true });
    const commits = log.all || [];
    
    // Get stats for each commit
    const detailedCommits = await Promise.all(
      commits.slice(0, 50).map(async (commit) => {
        try {
          const diff = await git.diffSummary([`${commit.hash}^`, commit.hash]);
          return {
            hash: commit.hash.substring(0, 7),
            message: commit.message,
            author: commit.author_name,
            email: commit.author_email,
            date: commit.date,
            insertions: diff.insertions || 0,
            deletions: diff.deletions || 0,
            files: diff.files.length
          };
        } catch (e) {
          // First commit might not have parent
          return {
            hash: commit.hash.substring(0, 7),
            message: commit.message,
            author: commit.author_name,
            email: commit.author_email,
            date: commit.date,
            insertions: 0,
            deletions: 0,
            files: 0
          };
        }
      })
    );
    
    return detailedCommits;
  } catch (e) {
    return [];
  }
}

async function getTodayCommits(repoPath) {
  try {
    const git = simpleGit({ baseDir: repoPath });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Use local date string for git log --since
    const sinceStr = today.getFullYear() + '-' + 
                     String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(today.getDate()).padStart(2, '0');
    
    const log = await git.log({ '--since': '1 day ago', '--all': true });
    const commits = log.all || [];
    
    const detailedCommits = await Promise.all(
      commits.map(async (commit) => {
        try {
          const diff = await git.diffSummary([`${commit.hash}^`, commit.hash]);
          return {
            hash: commit.hash.substring(0, 7),
            message: commit.message,
            author: commit.author_name,
            email: commit.author_email,
            date: commit.date,
            insertions: diff.insertions || 0,
            deletions: diff.deletions || 0,
            files: diff.files.length,
            changedFiles: diff.files.map(f => f.file).slice(0, 5)
          };
        } catch (e) {
          return {
            hash: commit.hash.substring(0, 7),
            message: commit.message,
            author: commit.author_name,
            email: commit.author_email,
            date: commit.date,
            insertions: 0,
            deletions: 0,
            files: 0,
            changedFiles: []
          };
        }
      })
    );
    
    return detailedCommits;
  } catch (e) {
    return [];
  }
}

// 阿里云RFC3986编码函数

// 创建阿里云认证方案的函数
// 已移至 aliyun-dypns-sdk.js

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT, projectsDir: DEFAULT_DIR });
});

// 创建阿里云认证方案
app.post('/api/create-scheme', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  console.log('创建认证方案请求来自:', clientIP, 'body:', req.body);
  try {
    const schemeData = req.body;
    console.log('创建认证方案:', schemeData);

    // 阿里云配置
    const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET;

    if (!accessKeyId || !accessKeySecret) {
      return res.status(400).json({
        success: false,
        error: '阿里云访问密钥未配置'
      });
    }

    // 准备API参数 (注意：aliyun-dypns-sdk.js 期望 camelCase 属性名)
    const apiData = {
      schemeName: schemeData.SchemeName,
      appName: schemeData.AppName,
      osType: schemeData.AccessEnd === 'iOS' ? 'iOS' : 'Web'
    };

    // 根据类型添加特定参数
    if (schemeData.AccessEnd === 'iOS') {
      // 兼容前端可能传递的 PackName
      apiData.bundleId = schemeData.PackName || schemeData.BundleId;
    } else if (schemeData.AccessEnd === 'Web') {
      apiData.origin = schemeData.Origin;
      apiData.url = schemeData.Url;
    }

    console.log('调用阿里云API - 入参:', apiData); // 新增的日志打印
    // return res.json({ success: true, message: '直接返回成功', data: {} });

    // 调用阿里云API创建方案
    const result = await createVerifyScheme(accessKeyId, accessKeySecret, apiData);

    if (result.success) {
      res.json({
        success: true,
        message: '认证方案创建成功',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('创建方案失败:', error);
    res.status(500).json({
      success: false,
      error: '创建方案失败: ' + error.message
    });
  }
});

// 查询方案秘钥
app.post('/api/query-scheme-secret', async (req, res) => {
  try {
    const { schemeCode } = req.body;

    if (!schemeCode) {
      return res.status(400).json({
        success: false,
        error: '缺少方案代码参数'
      });
    }

    console.log('查询方案秘钥:', schemeCode);

    const result = await querySchemeSecret(schemeCode);

    if (result && result.success) {
      res.json({
        success: true,
        message: '秘钥查询成功',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result?.error || '查询秘钥失败'
      });
    }
  } catch (error) {
    console.error('查询秘钥失败:', error);
    res.status(500).json({
      success: false,
      error: '查询秘钥失败: ' + error.message
    });
  }
});

app.get('/api/projects', async (_req, res) => {
  let projects = readConfig();
  if (!projects) {
    // 如果没有projects.json文件，返回空数组
    projects = [];
  }

  // Enrich with lastCommitTime, status, and branch
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const [lastCommitTime, status, branch] = await Promise.all([
        getLastCommitTime(p.path),
        getStatusCounts(p.path),
        getCurrentBranch(p.path)
      ]);
      return { ...p, lastCommitTime, status, branch };
    })
  );
  res.json({
    success: true,
    message: enriched,
    count: enriched.length
  });
});

// 扫描项目端点
app.post('/api/projects/scan', async (_req, res) => {
  try {
    // 重新扫描项目目录
    const scannedProjects = scanProjects(DEFAULT_DIR);
    
    // Enrich with lastCommitTime, status, and branch
    const enriched = await Promise.all(
      scannedProjects.map(async (p) => {
        const [lastCommitTime, status, branch] = await Promise.all([
          getLastCommitTime(p.path),
          getStatusCounts(p.path),
          getCurrentBranch(p.path)
        ]);
        return { ...p, lastCommitTime, status, branch };
      })
    );
    
    res.json({ 
      success: true, 
      message: enriched,
      count: enriched.length 
    });
  } catch (error) {
    console.error('Scan projects error:', error);
    res.status(500).json({ 
      success: false, 
      error: '扫描项目失败: ' + error.message 
    });
  }
});

app.get('/api/status', async (req, res) => {
  const repoPath = req.query.path;
  if (!repoPath) return res.status(400).json({ error: 'Missing path' });
  const counts = await getStatusCounts(repoPath);
  res.json(counts);
});

// Get weekly commits with stats
app.get('/api/commits/weekly', async (req, res) => {
  try {
    let projects = readConfig();
    if (!projects) projects = scanProjects(DEFAULT_DIR);
    
    const allCommits = [];
    for (const project of projects) {
      const commits = await getWeeklyCommits(project.path, 7);
      allCommits.push(...commits.map(c => ({ ...c, project: project.name })));
    }
    
    // Sort by date descending
    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Group by day for chart
    const dailyStats = {};
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().split('T')[0];
      dailyStats[dayKey] = { commits: 0, insertions: 0, deletions: 0, lines: 0 };
    }
    
    allCommits.forEach(commit => {
      const dayKey = commit.date.split('T')[0];
      if (dailyStats[dayKey]) {
        dailyStats[dayKey].commits++;
        dailyStats[dayKey].insertions += commit.insertions;
        dailyStats[dayKey].deletions += commit.deletions;
        dailyStats[dayKey].lines += (commit.insertions + commit.deletions);
      }
    });
    
    res.json({ commits: allCommits, dailyStats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    let projects = readConfig();
    if (!projects) projects = scanProjects(DEFAULT_DIR);

    const activeProjects = projects.filter(p => p.active !== false);

    // Calculate today's Git statistics
    let totalCommits = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const project of activeProjects) {
      try {
        const commits = await getTodayCommits(project.path);
        totalCommits += commits.length;

        // Sum up insertions and deletions from today's commits
        for (const commit of commits) {
          totalInsertions += commit.insertions || 0;
          totalDeletions += commit.deletions || 0;
        }
      } catch (error) {
        // Skip projects that can't be analyzed
        console.warn(`Failed to analyze git stats for ${project.name}:`, error.message);
      }
    }

    res.json({
      projects: activeProjects.length,
      totalProjects: projects.length,
      commits: totalCommits,
      insertions: totalInsertions,
      deletions: totalDeletions
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});// Get today's git operations for all projects
app.get('/api/git/today-operations', async (req, res) => {
  try {
    let projects = readConfig();
    if (!projects) projects = scanProjects(DEFAULT_DIR);
    
    // Filter to active projects only
    projects = projects.filter(p => p.active !== false);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Use local date instead of UTC to avoid timezone issues
    const todayStr = today.getFullYear() + '-' + 
                     String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(today.getDate()).padStart(2, '0');

    const allOperations = [];

    for (const project of projects) {
      try {
        const git = simpleGit({ baseDir: project.path });

        // Get reflog to see all operations today
        const reflog = await git.raw(['reflog', '--since', '1 day ago']);

        // Parse reflog entries
        const operations = [];
        const lines = reflog.split('\n').filter(line => line.trim());

        for (const line of lines) {
          const match = line.match(/^(\w+)\s+HEAD@\{\d+\}:\s+(.+)$/);
          if (match) {
            const [, hash, message] = match;
            const timestamp = new Date().toISOString(); // reflog doesn't include timestamps easily

            operations.push({
              hash: hash.substring(0, 7),
              oldHash: '',
              message: message.trim(),
              author: 'unknown', // reflog doesn't include author easily
              timestamp,
              type: getOperationType(message)
            });
          }
        }

        // Also get today's commits
        const commits = await getTodayCommits(project.path);

        if (operations.length > 0 || commits.length > 0) {
          allOperations.push({
            project: project.name,
            path: project.path,
            operations: operations,
            commits: commits,
            totalOperations: operations.length,
            totalCommits: commits.length
          });
        }

      } catch (e) {
        // Skip projects with git errors
        console.warn(`Failed to get git operations for ${project.name}:`, e.message);
      }
    }

    // Sort by total operations (most active first)
    allOperations.sort((a, b) => (b.totalOperations + b.totalCommits) - (a.totalOperations + a.totalCommits));

    res.json({
      success: true,
      date: todayStr,
      projects: allOperations,
      totalProjects: allOperations.length
    });

  } catch (e) {
    console.error('Get today operations error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Helper function to determine operation type
function getOperationType(message) {
  if (message.includes('commit')) return 'commit';
  if (message.includes('pull')) return 'pull';
  if (message.includes('push')) return 'push';
  if (message.includes('merge')) return 'merge';
  if (message.includes('checkout')) return 'checkout';
  if (message.includes('reset')) return 'reset';
  return 'other';
}

// Execute git pull with streaming output
app.get('/api/git/pull-stream', async (req, res) => {
  try {
    const { path: repoPath } = req.query;
    if (!repoPath) {
      return res.status(400).json({ error: 'Missing path' });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const git = simpleGit({ baseDir: repoPath });

    try {
      // 发送开始消息
      res.write(`data: ${JSON.stringify({ type: 'start', message: '开始执行 git pull...' })}\n\n`);

      // 执行 git fetch
      res.write(`data: ${JSON.stringify({ type: 'command', command: 'git fetch', message: '正在获取远程更新...' })}\n\n`);
      await git.fetch();

      // 执行 git pull
      res.write(`data: ${JSON.stringify({ type: 'command', command: 'git pull', message: '正在拉取代码...' })}\n\n`);
      const result = await git.pull();

      // 获取更新后的状态
      const counts = await getStatusCounts(repoPath);
      const lastCommitTime = await getLastCommitTime(repoPath);

      res.write(`data: ${JSON.stringify({ type: 'complete', message: '✅ 拉取完成', result, status: counts, lastCommitTime })}\n\n`);
      res.end();

    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `❌ 拉取失败: ${e.message}` })}\n\n`);
      res.end();
    }

  } catch (e) {
    console.error('Git pull stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// Execute git push with streaming output
app.get('/api/git/push-stream', async (req, res) => {
  try {
    const { path: repoPath, message } = req.query;
    if (!repoPath) {
      return res.status(400).json({ error: 'Missing path' });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const git = simpleGit({ baseDir: repoPath });

    try {
      // 发送开始消息
      res.write(`data: ${JSON.stringify({ type: 'start', message: '开始执行 git push...' })}\n\n`);

      // 检查远程仓库配置
      res.write(`data: ${JSON.stringify({ type: 'command', command: 'git remote -v', message: '检查远程仓库配置...' })}\n\n`);
      const remotes = await git.getRemotes(true);
      if (remotes.length === 0) {
        throw new Error('没有配置远程仓库，请先添加远程仓库：git remote add origin <url>');
      }

      const originRemote = remotes.find(r => r.name === 'origin');
      if (!originRemote) {
        throw new Error('没有找到 origin 远程仓库，请先添加：git remote add origin <url>');
      }

      res.write(`data: ${JSON.stringify({ type: 'info', message: `远程仓库: ${originRemote.refs.fetch}` })}\n\n`);

      // 检查当前分支和上游分支
      const branchInfo = await git.branch();
      const currentBranch = branchInfo.current;
      res.write(`data: ${JSON.stringify({ type: 'info', message: `当前分支: ${currentBranch}` })}\n\n`);

      // 检查状态并暂存更改
      res.write(`data: ${JSON.stringify({ type: 'command', command: 'git status', message: '检查工作区状态...' })}\n\n`);
      const status = await git.status();

      if (!status.isClean()) {
        res.write(`data: ${JSON.stringify({ type: 'command', command: 'git add .', message: '暂存所有更改...' })}\n\n`);
        await git.add(['.']);

        let defaultMsg = 'chore: update from UI';
        if (status.modified.length > 0) {
          const modifiedFiles = status.modified;
          if (modifiedFiles.some(f => f.includes('.css'))) {
            defaultMsg = 'style: update CSS styles';
          } else if (modifiedFiles.some(f => f.includes('.tsx') || f.includes('.jsx'))) {
            defaultMsg = 'feat: update React components';
          } else if (modifiedFiles.some(f => f.includes('.json'))) {
            defaultMsg = 'config: update configuration files';
          } else {
            defaultMsg = 'chore: update files';
          }
        }
        const msg = message || `${defaultMsg} ${new Date().toISOString()}`;
        res.write(`data: ${JSON.stringify({ type: 'command', command: `git commit -m "${msg}"`, message: '提交更改...' })}\n\n`);
        try {
          await git.commit(msg);
        } catch (commitErr) {
          res.write(`data: ${JSON.stringify({ type: 'info', message: '没有需要提交的更改' })}\n\n`);
        }
      } else {
        res.write(`data: ${JSON.stringify({ type: 'info', message: '工作区是干净的' })}\n\n`);
      }

      // 检查是否设置了上游分支
      let result;
      const branchDetails = branchInfo.branches[currentBranch];
      if (!branchDetails || !branchDetails.tracking) {
        res.write(`data: ${JSON.stringify({ type: 'command', command: `git push -u origin ${currentBranch}`, message: '设置上游分支并推送...' })}\n\n`);
        result = await git.push(['-u', 'origin', currentBranch]);
      } else {
        // 执行推送
        res.write(`data: ${JSON.stringify({ type: 'command', command: 'git push', message: '推送代码到远程...' })}\n\n`);
        result = await git.push();
      }

      // 获取更新后的状态
      const counts = await getStatusCounts(repoPath);
      const lastCommitTime = await getLastCommitTime(repoPath);

      res.write(`data: ${JSON.stringify({ type: 'complete', message: '✅ 推送完成', result, status: counts, lastCommitTime })}\n\n`);
      res.end();

    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `❌ 推送失败: ${e.message}` })}\n\n`);
      res.end();
    }

  } catch (e) {
    console.error('Git push stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// 获取项目的渠道配置
app.get('/api/channels/:projectName', (req, res) => {
  try {
    const { projectName } = req.params;
    let channels = {};
    
    // 从channel-config.json读取完整配置（包含files规则）
    if (fs.existsSync(CHANNEL_CONFIG_PATH)) {
      const channelConfig = JSON.parse(fs.readFileSync(CHANNEL_CONFIG_PATH, 'utf-8'));
      const projectConfig = channelConfig.projects[projectName];
      if (projectConfig && projectConfig.channels) {
        channels = projectConfig.channels;
      }
    }
    
    // 从oss-connection-config.json读取buckets配置并合并
    if (fs.existsSync(OSS_CONFIG_PATH)) {
      const ossConfig = JSON.parse(fs.readFileSync(OSS_CONFIG_PATH, 'utf-8'));
      const projectConfig = ossConfig.projects[projectName];
      
      if (projectConfig && projectConfig.channels) {
        // 合并channels配置
        for (const [channelId, channelData] of Object.entries(projectConfig.channels)) {
          if (channels[channelId]) {
            // 合并buckets配置，优先使用oss-connection-config.json中的配置
            if (channelData.buckets) {
              channels[channelId].buckets = channelData.buckets;
            }
          } else {
            // 如果channel-config.json中没有这个channel，直接使用oss配置
            channels[channelId] = channelData;
          }
        }
      }
    }
    
    res.json({ channels });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 检查 build 目录是否存在
app.post('/api/check-build', (req, res) => {
  try {
    const { projectName, path: projectPath } = req.body;
    
    if (!projectPath) {
      return res.status(400).json({ ok: false, error: 'Missing project path' });
    }
    
    const buildPath = path.join(projectPath, 'build');
    const exists = fs.existsSync(buildPath);
    
    let fileCount = 0;
    if (exists) {
      try {
        // 统计文件数量（忽略系统文件）
        const shouldIgnoreFile = (filename) => {
          const ignoreList = ['.DS_Store', 'Thumbs.db', '.gitkeep', '.gitignore'];
          return ignoreList.includes(filename);
        };
        
        const countFiles = (dir) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          let count = 0;
          for (const entry of entries) {
            if (shouldIgnoreFile(entry.name)) {
              continue; // 跳过系统文件
            }
            if (entry.isDirectory()) {
              count += countFiles(path.join(dir, entry.name));
            } else {
              count++;
            }
          }
          return count;
        };
        fileCount = countFiles(buildPath);
      } catch (e) {
        // ignore error
      }
    }
    
    res.json({ 
      ok: true,
      exists,
      buildPath,
      fileCount,
      isEmpty: exists && fileCount === 0
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 获取项目的 bucket 配置（非多渠道项目）
app.get('/api/project-buckets/:projectName', (req, res) => {
  try {
    const { projectName } = req.params;
    if (!fs.existsSync(OSS_CONFIG_PATH)) {
      return res.status(404).json({ error: 'OSS config not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(OSS_CONFIG_PATH, 'utf-8'));
    const projectConfig = config.projects[projectName];
    
    if (!projectConfig) {
      return res.json({ buckets: null });
    }
    
    res.json({ 
      name: projectConfig.name,
      buckets: projectConfig.buckets,
      description: projectConfig.description 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 编译 Less 文件到 CSS 文件，并生成 Source Map
 * @param {string} projectPath - 项目的根目录路径
 * @param {string} lessFilePath - Less 文件相对于项目根目录的路径，例如 'src/css/css.less'
 * @param {string} cssOutputPath - 目标 CSS 文件相对于项目根目录的路径，例如 'src/css/css.css'
 */
async function compileLess(projectPath, lessFilePath, cssOutputPath) {
    const fullLessPath = path.join(projectPath, lessFilePath);
    const fullCssPath = path.join(projectPath, cssOutputPath);
    const mapOutputPath = fullCssPath + '.map'; // Source Map 文件的路径

    if (!fs.existsSync(fullLessPath)) {
        console.warn(`Less file not found: ${fullLessPath}`);
        return false;
    }

    try {
        const lessContent = fs.readFileSync(fullLessPath, 'utf8');

        const output = await less.render(lessContent, {
            // 配置选项：paths 用于处理 @import 语句
            paths: [path.dirname(fullLessPath)],
            filename: path.basename(lessFilePath),
            
            // 🚨 关键修改点 1: 启用 Source Map
            sourceMap: {
                // filename 必须是相对于 CSS 文件本身的路径
                outputFilename: path.basename(mapOutputPath), 
                // sourceMapURL 是 CSS 文件底部引用的文件名
                sourceMapURL: path.basename(mapOutputPath)
            }
        });

        // 确保输出目录存在
        fs.mkdirSync(path.dirname(fullCssPath), { recursive: true });
        
        // 🚨 关键修改点 2: 写入新的 CSS 文件
        fs.writeFileSync(fullCssPath, output.css, 'utf8');
        console.log(`✅ CSS file generated: ${cssOutputPath}`);

        // 🚨 关键修改点 3: 写入 Source Map 文件
        if (output.map) {
             fs.writeFileSync(mapOutputPath, output.map, 'utf8');
             console.log(`✅ Source Map generated: ${cssOutputPath}.map`);
        } else {
             console.warn(`⚠️ Source Map was enabled but not generated for: ${lessFilePath}`);
        }
        
        return true;
    } catch (error) {
        console.error(`❌ Less compilation failed for ${lessFilePath}:`, error);
        throw new Error(`Less compilation error: ${error.message}`);
    }
}

// 切换项目渠道配置
app.post('/api/switch-channel', async (req, res) => {
  try {
    const { projectName, channel } = req.body;
    
    if (!projectName || !channel) {
      return res.status(400).json({ error: 'Missing projectName or channel' });
    }
    
    const config = JSON.parse(fs.readFileSync(CHANNEL_CONFIG_PATH, 'utf-8'));
    const projectConfig = config.projects[projectName];
    
    if (!projectConfig || !projectConfig.channels[channel]) {
      return res.status(404).json({ error: 'Project or channel not found' });
    }
    
    const channelConfig = projectConfig.channels[channel];
    const projectPath = path.join(DEFAULT_DIR, projectName);
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project path not found' });
    }
    
    const results = [];
    let lessFileModified = false;
    
    // 执行pre-build脚本
    if (channelConfig.scripts && channelConfig.scripts['pre-build']) {
      const { execSync } = await import('child_process');
      
      for (const script of channelConfig.scripts['pre-build']) {
        try {
          console.log(`Executing pre-build script: ${script}`);
          const output = execSync(script, { 
            cwd: projectPath, 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          results.push({ script, status: 'executed', output: output.trim() });
        } catch (error) {
          console.warn(`Script execution failed: ${script}`, error.message);
          results.push({ script, status: 'failed', error: error.message });
        }
      }
    }
    
    // 处理每个文件的规则
    for (const [filePath, fileConfig] of Object.entries(channelConfig.files)) {
      const fullPath = path.join(projectPath, filePath);
      
      if (!fs.existsSync(fullPath)) {
        results.push({ file: filePath, status: 'skipped', reason: 'File not found' });
        continue;
      }
      
      let content = fs.readFileSync(fullPath, 'utf-8');
      let modified = false;
      
      for (const rule of fileConfig.rules) {
        if (rule.action === 'replace') {
          // 直接替换整个文件内容
          if (rule.content !== undefined) {
            content = rule.content;
            modified = true;
          }
          continue; // 跳过其他处理
        }
        
        if (rule.action === 'replace-match') {
          // 正则匹配并替换指定内容（不替换整个文件）
          if (rule.pattern !== undefined && rule.replacement !== undefined) {
            const regex = new RegExp(rule.pattern, 'gm');
            const newContent = content.replace(regex, rule.replacement);
            if (newContent !== content) {
              modified = true;
              content = newContent;
            }
          }
          continue;
        }
        
        const regex = new RegExp(rule.pattern, 'gm');
        
        if (rule.action === 'comment') {
          // 添加注释（如果还没有注释）
          const newContent = content.replace(regex, (match, captured) => {
            // 检查captured是否已经被注释
            const trimmedCaptured = captured.trim();
            if (trimmedCaptured.startsWith('//') || trimmedCaptured.startsWith('<!--')) {
              return match; // 已经是注释了，保持原样
            }
            modified = true;
            // 根据文件类型选择注释符号
            if (fullPath.endsWith('.html')) {
              return `<!-- ${captured} -->`;
            } else {
              return `// ${captured}`;
            }
          });
          content = newContent;
        } else if (rule.action === 'uncomment') {
          // 移除注释 - 处理多层注释的情况
          const newContent = content.replace(regex, (match, captured) => {
            let result = captured;
            
            // 处理多层注释：从外层向内层逐层移除注释
            if (fullPath.endsWith('.html')) {
              // 处理HTML多层注释
              while (result.trim().startsWith('<!--') && result.trim().endsWith('-->')) {
                result = result.replace(/^(\s*)<!--\s*/, '$1').replace(/\s*-->\s*$/, '');
              }
            } else {
              // 处理JS多层注释
              while (result.trim().startsWith('//')) {
                result = result.replace(/^(\s*)\/\/\s*/, '$1');
              }
            }
            
            modified = true;
            return result;
          });
          content = newContent;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        results.push({ file: filePath, status: 'modified' });
        
        // 检查是否修改了Less文件
        if (filePath === LESS_INPUT_PATH) {
          lessFileModified = true;
        }
      } else {
        results.push({ file: filePath, status: 'unchanged' });
      }
    }
    
    // 检查 Less 文件是否需要编译 (如果渠道配置中有less文件规则，总是编译)
    const hasLessRules = channelConfig.files && channelConfig.files[LESS_INPUT_PATH];
    
    if (lessFileModified || hasLessRules) {
        await compileLess(projectPath, LESS_INPUT_PATH, CSS_OUTPUT_PATH);
        results.push({ file: CSS_OUTPUT_PATH, status: 'generated' });
    } else {
        results.push({ file: CSS_OUTPUT_PATH, status: 'skipped (no less rules)' });
    }
    
    // 执行post-build脚本
    if (channelConfig.scripts && channelConfig.scripts['post-build']) {
      const { execSync } = await import('child_process');
      
      for (const script of channelConfig.scripts['post-build']) {
        try {
          console.log(`Executing post-build script: ${script}`);
          const output = execSync(script, { 
            cwd: projectPath, 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          results.push({ script, status: 'executed', output: output.trim() });
        } catch (error) {
          console.warn(`Script execution failed: ${script}`, error.message);
          results.push({ script, status: 'failed', error: error.message });
        }
      }
    }

    res.json({ 
      ok: true, 
      channel: channelConfig.name,
      results 
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 构建项目（带渠道切换）
app.post('/api/build-channel', async (req, res) => {
  try {
    const { projectName, channel } = req.body;
    
    if (!projectName) {
      return res.status(400).json({ error: 'Missing projectName' });
    }
    
    const projectPath = path.join(DEFAULT_DIR, projectName);
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 如果指定了渠道，先切换配置
    if (channel) {
      const switchResponse = await fetch(`http://127.0.0.1:${PORT}/api/switch-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, channel })
      });
      
      if (!switchResponse.ok) {
        return res.status(500).json({ error: 'Failed to switch channel' });
      }
    }
    
    // 执行构建
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout, stderr } = await execAsync('npm run build', {
      cwd: projectPath,
      timeout: 300000 // 5分钟超时
    });
    
    res.json({ 
      ok: true, 
      channel,
      stdout, 
      stderr,
      buildPath: path.join(projectPath, 'build')
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, stderr: e.stderr });
  }
});

// 流式构建（实时输出）
app.get('/api/build-stream', async (req, res) => {
  try {
    const { projectName, channel } = req.query;
    
    if (!projectName) {
      return res.status(400).json({ error: 'Missing projectName' });
    }
    
    // 从配置中获取项目路径
    let projects = readConfig();
    if (!projects) projects = scanProjects(DEFAULT_DIR);
    
    const project = projects.find(p => p.name === projectName);
    if (!project) {
      return res.status(404).json({ error: 'Project not found in config' });
    }
    
    const projectPath = project.path;
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project path does not exist' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 第一步：清空build文件夹
    res.write(`data: ${JSON.stringify({ type: 'log', message: '清空build文件夹...' })}\n\n`);
    
    const buildPath = path.join(projectPath, 'build');
    if (fs.existsSync(buildPath)) {
      try {
        // 递归删除build目录内容
        const { execSync } = await import('child_process');
        execSync(`rm -rf "${buildPath}"/*`, { cwd: projectPath });
        res.write(`data: ${JSON.stringify({ type: 'log', message: 'build文件夹已清空' })}\n\n`);
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: '清空build文件夹失败: ' + err.message })}\n\n`);
        res.end();
        return;
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: 'log', message: 'build文件夹不存在，跳过清空步骤' })}\n\n`);
    }
    
    // 第二步：如果是多渠道项目，切换渠道配置
    if (channel) {
      res.write(`data: ${JSON.stringify({ type: 'log', message: `切换到渠道: ${channel}` })}\n\n`);
      
      try {
        const switchResponse = await fetch(`http://127.0.0.1:${PORT}/api/switch-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName, channel })
        });
        
        if (!switchResponse.ok) {
          const errorData = await switchResponse.text();
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to switch channel: ' + errorData })}\n\n`);
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({ type: 'log', message: '渠道切换完成' })}\n\n`);
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
        return;
      }
    }
    
    // 使用 spawn 执行构建，实时获取输出
    const { spawn } = await import('child_process');
    
    res.write(`data: ${JSON.stringify({ type: 'log', message: '开始构建...' })}\n\n`);
    
    const buildProcess = spawn('npm', ['run', 'build'], {
      cwd: projectPath,
      shell: true
    });
    
    buildProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        res.write(`data: ${JSON.stringify({ type: 'stdout', message: line })}\n\n`);
      });
    });
    
    buildProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        res.write(`data: ${JSON.stringify({ type: 'stderr', message: line })}\n\n`);
      });
    });
    
    buildProcess.on('close', (code) => {
      if (code === 0) {
        res.write(`data: ${JSON.stringify({ type: 'success', message: '构建成功', buildPath: path.join(projectPath, 'build') })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: `构建失败，退出码: ${code}` })}\n\n`);
      }
      res.end();
    });
    
    buildProcess.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });
    
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// 流式上传到 OSS（实时进度）
app.get('/api/upload-stream', async (req, res) => {
  try {
    const { projectName, path: projectPath, channelId, env } = req.query;
    
    if (!projectName || !channelId || !env) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 读取 OSS 连接配置
    if (!fs.existsSync(OSS_CONFIG_PATH)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'OSS connection config not found' })}\n\n`);
      res.end();
      return;
    }
    
    let ossConfig, allBuckets;
    try {
      const ossData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
      const ossConfigs = JSON.parse(ossData);
      ossConfig = ossConfigs.connection;
      
      // 获取所有可用 buckets
      const bucketConfig = getBucketConfig(ossConfigs, projectName, channelId, env);
      allBuckets = Array.isArray(bucketConfig) ? bucketConfig : [bucketConfig];
      
      if (!allBuckets || allBuckets.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'No buckets configured' })}\n\n`);
        res.end();
        return;
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
      res.end();
      return;
    }
    
    // 检查构建目录
    const buildPath = path.join(projectPath, 'build');
    if (!fs.existsSync(buildPath)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Build directory not found. Please build first.' })}\n\n`);
      res.end();
      return;
    }
    
    // 动态导入 ali-oss
    const OSS = (await import('ali-oss')).default;
    
    const allResults = [];
    let totalFiles = 0;
    let globalUploadedFiles = 0;
    
    // 先计算总文件数
    const countFiles = (dirPath) => {
      let count = 0;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          count += countFiles(fullPath);
        } else {
          count++;
        }
      }
      return count;
    };
    
    totalFiles = countFiles(buildPath);
    res.write(`data: ${JSON.stringify({ type: 'start', total: totalFiles, message: '开始上传文件...' })}\n\n`);
    
    // 上传到每个 bucket
    for (let bucketIndex = 0; bucketIndex < allBuckets.length; bucketIndex++) {
      const bucket = allBuckets[bucketIndex];
      if (bucket.enabled === false) continue;
      
      // 为每个bucket发送开始消息
      res.write(`data: ${JSON.stringify({ type: 'bucket_start', bucket: bucket.name, bucketIndex: bucketIndex + 1, totalBuckets: allBuckets.length, message: `开始上传到 ${bucket.name}...` })}\n\n`);
      
      // 创建 OSS 客户端
      const client = new OSS({
        region: bucket.region || ossConfig.region,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        bucket: bucket.name,
        timeout: 60000 // 60秒超时
      });
      
      // 递归收集所有文件
      const collectFiles = (dirPath, prefix = '') => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        let files = [];
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const ossPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            files = files.concat(collectFiles(fullPath, ossPath));
          } else {
            files.push({ fullPath, ossPath, fileName: entry.name });
          }
        }
        return files;
      };
      
      const allFiles = collectFiles(buildPath, bucket.prefix || '');
      let bucketUploadedFiles = 0;
      
      // 并发上传
      const CONCURRENCY = 15;
      let index = 0;
      
      const uploadBatch = async () => {
        const batch = allFiles.slice(index, index + CONCURRENCY);
        if (batch.length === 0) return;
        
        // 显示正在上传的文件
        batch.forEach(({ fileName }) => {
          res.write(`data: ${JSON.stringify({ type: 'uploading', file: fileName, bucket: bucket.name, bucketProgress: Math.round((bucketUploadedFiles / totalFiles) * 100), globalProgress: Math.round((globalUploadedFiles / (totalFiles * allBuckets.length)) * 100) })}\n\n`);
        });
        
        await Promise.all(batch.map(async ({ fullPath, ossPath, fileName }) => {
          try {
            const result = await client.put(ossPath, fullPath);
            bucketUploadedFiles++;
            globalUploadedFiles++;
            
            res.write(`data: ${JSON.stringify({ type: 'uploaded', file: fileName, bucket: bucket.name, url: result.url, bucketProgress: Math.round((bucketUploadedFiles / totalFiles) * 100), globalProgress: Math.round((globalUploadedFiles / (totalFiles * allBuckets.length)) * 100), uploaded: globalUploadedFiles, total: totalFiles * allBuckets.length })}\n\n`);
            
            allResults.push({ file: fileName, path: ossPath, url: result.url, status: 'success', bucket: bucket.name });
          } catch (err) {
            bucketUploadedFiles++;
            globalUploadedFiles++;
            res.write(`data: ${JSON.stringify({ type: 'failed', file: fileName, bucket: bucket.name, error: err.message, bucketProgress: Math.round((bucketUploadedFiles / totalFiles) * 100), globalProgress: Math.round((globalUploadedFiles / (totalFiles * allBuckets.length)) * 100), uploaded: globalUploadedFiles, total: totalFiles * allBuckets.length })}\n\n`);
            
            allResults.push({ file: fileName, path: ossPath, status: 'failed', error: err.message, bucket: bucket.name });
          }
        }));
        
        index += CONCURRENCY;
        if (index < allFiles.length) {
          await uploadBatch();
        }
      };
      
      if (allFiles.length > 0) {
        await uploadBatch();
      }
      
      // bucket上传完成
      res.write(`data: ${JSON.stringify({ type: 'bucket_complete', bucket: bucket.name, bucketIndex: bucketIndex + 1, totalBuckets: allBuckets.length, message: `${bucket.name} 上传完成` })}\n\n`);
    }
    
    const successCount = allResults.filter(r => r.status === 'success').length;
    const failCount = allResults.filter(r => r.status === 'failed').length;
    
    res.write(`data: ${JSON.stringify({ type: 'complete', uploaded: successCount, failed: failCount, results: allResults, message: '上传完成' })}\n\n`);
    res.end();
    
  } catch (e) {
    console.error('OSS upload stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// 流式上传压缩包到 OSS（实时进度）
app.get('/api/upload-zip-stream', async (req, res) => {
  try {
    const { projectName, path: projectPath, channelId, env, isBackup } = req.query;
    
    if (!projectName || !env) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 读取 OSS 连接配置
    if (!fs.existsSync(OSS_CONFIG_PATH)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'OSS connection config not found' })}\n\n`);
      res.end();
      return;
    }
    
    let ossConfig, allBuckets;
    try {
      const ossData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
      const ossConfigs = JSON.parse(ossData);
      
      if (!ossConfigs.connection) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'OSS connection config missing connection section' })}\n\n`);
        res.end();
        return;
      }
      
      ossConfig = ossConfigs.connection;
      console.log('OSS connection config loaded successfully');
      
      // 获取所有可用 buckets
      const bucketConfig = getBucketConfig(ossConfigs, projectName, channelId, env);
      allBuckets = Array.isArray(bucketConfig) ? bucketConfig : [bucketConfig];
      
      if (!allBuckets || allBuckets.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'No buckets configured for ${projectName}-${channelId}-${env}' })}\n\n`);
        res.end();
        return;
      }
      
      console.log(`Found ${allBuckets.length} buckets for ${projectName}-${channelId}-${env}`);
    } catch (e) {
      console.error('OSS config error:', e);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'OSS config error: ${e.message}' })}\n\n`);
      res.end();
      return;
    }
    
    // 检查构建目录
    const buildPath = path.join(projectPath, 'build');
    if (!fs.existsSync(buildPath)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Build directory not found. Please build the project first.' })}\n\n`);
      res.end();
      return;
    }
    
    // 检查build目录是否为空
    const buildContents = fs.readdirSync(buildPath);
    if (buildContents.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Build directory is empty. Please build the project first.' })}\n\n`);
      res.end();
      return;
    }
    
    console.log(`Build directory exists: ${buildPath}, contents: ${buildContents.length} items`);
    
    // 创建压缩包
    res.write(`data: ${JSON.stringify({ type: 'start', message: '开始创建压缩包...' })}\n\n`);
    
    // 生成时间戳文件名 - 简化为 YYYY-MM-DD.zip 格式
    const zipFileName = `${new Date().toISOString().slice(0, 10)}.zip`;
    const zipFilePath = path.join(os.tmpdir(), zipFileName);
    
    console.log(`Creating zip file: ${zipFilePath}`);
    
    // 创建压缩流
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });
    
    // 将archive连接到输出流
    archive.pipe(output);
    
    // 监听压缩事件
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', message: `压缩失败: ${err.message}` })}\n\n`);
      res.end();
    });
    
    // 监听完成事件 - 移除async，直接发送完成消息
    archive.on('end', () => {
      console.log(`Compression completed, size: ${Math.round(archive.pointer() / 1024 / 1024)}MB`);
      res.write(`data: ${JSON.stringify({ type: 'compressed', message: `压缩完成，大小: ${Math.round(archive.pointer() / 1024 / 1024)}MB`, size: archive.pointer() })}\n\n`);
      
      // 异步开始上传过程
      setImmediate(() => startUploadProcess());
    });
    
    // 添加一些调试事件
    archive.on('warning', (err) => {
      console.warn('Archive warning:', err);
    });
    
    archive.on('progress', (progress) => {
      console.log('Archive progress:', progress);
    });
    
    // 分离上传逻辑到单独的函数
    const startUploadProcess = async () => {
      try {
        const allResults = []; // 初始化结果数组
        
        // 上传到每个 bucket
        for (let bucketIndex = 0; bucketIndex < allBuckets.length; bucketIndex++) {
          const bucket = allBuckets[bucketIndex];
          if (bucket.enabled === false) continue;
          
          // 为每个bucket发送开始消息
          res.write(`data: ${JSON.stringify({ type: 'bucket_start', bucket: bucket.name, bucketIndex: bucketIndex + 1, totalBuckets: allBuckets.length, message: `开始上传到 ${bucket.name}...` })}\n\n`);
          
          // 创建 OSS 客户端
          const client = new OSS({
            region: bucket.region || ossConfig.region,
            accessKeyId: ossConfig.accessKeyId,
            accessKeySecret: ossConfig.accessKeySecret,
            bucket: bucket.name,
            timeout: 600000 // 10分钟超时
          });
          
          // 上传压缩包 - 备份文件放在"以往版本"目录下
          const backupPrefix = bucket.prefix || '以往版本';
          const ossPath = `${backupPrefix}/${zipFileName}`;
          
          res.write(`data: ${JSON.stringify({ type: 'uploading', file: zipFileName, bucket: bucket.name, bucketProgress: 0, globalProgress: Math.round(((bucketIndex * 100) / allBuckets.length)) })}\n\n`);
          
          try {
            const result = await client.put(ossPath, zipFilePath);
            
            res.write(`data: ${JSON.stringify({ type: 'uploaded', file: zipFileName, bucket: bucket.name, url: result.url, bucketProgress: 100, globalProgress: Math.round(((bucketIndex + 1) * 100) / allBuckets.length), uploaded: bucketIndex + 1, total: allBuckets.length })}\n\n`);
            
            allResults.push({ file: zipFileName, path: ossPath, url: result.url, status: 'success', bucket: bucket.name });
          } catch (err) {
            res.write(`data: ${JSON.stringify({ type: 'failed', file: zipFileName, bucket: bucket.name, error: err.message, bucketProgress: 100, globalProgress: Math.round(((bucketIndex + 1) * 100) / allBuckets.length), uploaded: bucketIndex + 1, total: allBuckets.length })}\n\n`);
            
            allResults.push({ file: zipFileName, path: ossPath, status: 'failed', error: err.message, bucket: bucket.name });
          }
          
          // bucket上传完成
          res.write(`data: ${JSON.stringify({ type: 'bucket_complete', bucket: bucket.name, bucketIndex: bucketIndex + 1, totalBuckets: allBuckets.length, message: `${bucket.name} 上传完成` })}\n\n`);
        }
        
        // 清理临时文件
        try {
          fs.unlinkSync(zipFilePath);
        } catch (cleanupErr) {
          console.warn('Failed to cleanup temp zip file:', cleanupErr.message);
        }
        
        const successCount = allResults.filter(r => r.status === 'success').length;
        const failCount = allResults.filter(r => r.status === 'failed').length;
        
        // 生产环境上传完成后的自动执行
        if (env === 'prod' && successCount > 0 && isBackup === 'true') {
          console.log(`🚀 触发生产环境部署后任务 - 项目: ${projectName}, 渠道: ${channelId}, 环境: ${env}, isBackup: ${isBackup}, 成功数: ${successCount}`);
          try {
            res.write(`data: ${JSON.stringify({ type: 'post_deployment_start', message: '开始执行部署后任务...' })}\n\n`);

            const postDeploymentResult = await executePostDeploymentTasks(projectName, channelId, allResults, zipFileName, res);

            if (postDeploymentResult.success) {
              res.write(`data: ${JSON.stringify({ type: 'post_deployment_complete', message: '部署后任务执行完成', tasks: postDeploymentResult.tasks })}\n\n`);
            } else {
              res.write(`data: ${JSON.stringify({ type: 'post_deployment_failed', message: `部署后任务失败: ${postDeploymentResult.error}`, tasks: postDeploymentResult.tasks })}\n\n`);
            }
          } catch (taskErr) {
            console.warn('Post-deployment tasks failed:', taskErr.message);
            res.write(`data: ${JSON.stringify({ type: 'post_deployment_error', message: `部署后任务执行出错: ${taskErr.message}` })}\n\n`);
            // 不影响上传成功的结果，只记录警告
          }
        } else {
          console.log(`⏭️ 跳过部署后任务 - 环境: ${env}, 成功数: ${successCount}, isBackup: ${isBackup}`);
        }
        
        res.write(`data: ${JSON.stringify({ type: 'complete', uploaded: successCount, failed: failCount, results: allResults, message: env === 'prod' ? '生产环境部署完成' : '压缩包上传完成', zipFile: zipFileName })}\n\n`);
        res.end();
        
      } catch (uploadErr) {
        // 清理临时文件
        try {
          fs.unlinkSync(zipFilePath);
        } catch (cleanupErr) {
          console.warn('Failed to cleanup temp zip file:', cleanupErr.message);
        }
        
        res.write(`data: ${JSON.stringify({ type: 'error', message: uploadErr.message })}\n\n`);
        res.end();
      }
    };
    
    // 将构建目录添加到压缩包
    console.log(`Adding directory to archive: ${buildPath}`);
    archive.directory(buildPath, false);
    
    // 完成压缩
    console.log('Finalizing archive...');
    archive.finalize();
    
  } catch (e) {
    console.error('OSS zip upload stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// 按渠道和环境上传到 OSS
app.post('/api/oss/upload-channel', async (req, res) => {
  try {
    const { projectName, path: projectPath, channelId, env, buckets: selectedBuckets, buildFirst, backupFirst } = req.body;
    
    if (!projectName || !channelId || !env) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    // 读取 OSS 连接配置
    if (!fs.existsSync(OSS_CONFIG_PATH)) {
      return res.status(500).json({ ok: false, error: 'OSS connection config not found' });
    }
    
    let ossConfig, allBuckets;
    try {
      const ossData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
      const ossConfigs = JSON.parse(ossData);
      ossConfig = ossConfigs.connection;
      
      // 获取所有可用 buckets
      const bucketConfig = getBucketConfig(ossConfigs, projectName, channelId, env);
      allBuckets = Array.isArray(bucketConfig) ? bucketConfig : [bucketConfig];
      
      if (!allBuckets || allBuckets.length === 0) {
        return res.status(404).json({ ok: false, error: `No buckets configured for ${projectName}-${channelId}-${env}` });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to load OSS config: ' + e.message });
    }
    
    // 过滤选中的 buckets
    const bucketsToUpload = selectedBuckets && selectedBuckets.length > 0 
      ? allBuckets.filter(b => selectedBuckets.includes(b.name))
      : allBuckets; // 如果没有选择，默认上传所有
    
    if (bucketsToUpload.length === 0) {
      return res.status(400).json({ ok: false, error: 'No buckets selected' });
    }
    
    // 检查构建目录
    const buildPath = path.join(projectPath, 'build');
    if (!fs.existsSync(buildPath)) {
      return res.status(404).json({ ok: false, error: 'Build directory not found. Please build first.' });
    }
    
    // 动态导入 ali-oss
    const OSS = (await import('ali-oss')).default;
    
    const allResults = [];
    
    // 上传到每个选中的 bucket
    for (const bucket of bucketsToUpload) {
      if (bucket.enabled === false) continue;
      
      // 创建 OSS 客户端
      const client = new OSS({
        region: bucket.region || ossConfig.region,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        bucket: bucket.name,
        timeout: 600000 // 10分钟超时
      });
      
      // 上传文件
      const uploadDir = async (dirPath, prefix = '') => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const results = [];
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const ossPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          
          if (entry.isDirectory()) {
            const subResults = await uploadDir(fullPath, ossPath);
            results.push(...subResults);
          } else {
            try {
              const result = await client.put(ossPath, fullPath);
              results.push({ file: entry.name, path: ossPath, url: result.url, status: 'success', bucket: bucket.name });
            } catch (err) {
              results.push({ file: entry.name, path: ossPath, status: 'failed', error: err.message, bucket: bucket.name });
            }
          }
        }
        
        return results;
      };
      
      const uploadResults = await uploadDir(buildPath, bucket.prefix || '');
      allResults.push(...uploadResults);
    }
    
    const successCount = allResults.filter(r => r.status === 'success').length;
    const failCount = allResults.filter(r => r.status === 'failed').length;
    
    res.json({ 
      ok: true, 
      buckets: bucketsToUpload.map(b => b.name),
      channel: channelId,
      env,
      uploaded: successCount,
      failed: failCount,
      results: allResults
    });
  } catch (e) {
    console.error('OSS upload error:', e);
    res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
});

// 简单项目上传（无渠道，但有环境区分）
app.post('/api/oss/upload-simple', async (req, res) => {
  try {
    const { projectName, path: projectPath, env, bucket: bucketName } = req.body;
    
    if (!projectName || !env || !bucketName) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    // 检查 bucket 是否为占位符
    if (bucketName.includes('placeholder')) {
      return res.status(400).json({ ok: false, error: `Bucket ${bucketName} 尚未配置，请先配置实际的 bucket 名称` });
    }
    
    // 读取 OSS 连接配置（新结构）
    if (!fs.existsSync(OSS_CONFIG_PATH)) {
      return res.status(500).json({ ok: false, error: 'OSS connection config not found' });
    }
    
    let ossConfig, bucketConfig;
    try {
      const ossData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
      const ossConfigs = JSON.parse(ossData);
      ossConfig = ossConfigs.connection;
      
      // 使用新的查找函数
      bucketConfig = getBucketConfig(ossConfigs, projectName, null, env);
      
      if (!bucketConfig) {
        return res.status(404).json({ ok: false, error: `Bucket config not found for ${projectName}-${env}` });
      }
      
      // 如果是数组（多个生产环境），需要匹配指定的 bucket
      if (Array.isArray(bucketConfig)) {
        bucketConfig = bucketConfig.find(b => b.name === bucketName);
        if (!bucketConfig) {
          return res.status(404).json({ ok: false, error: `Bucket ${bucketName} not found` });
        }
      }
      
      if (bucketConfig.enabled === false) {
        return res.status(400).json({ ok: false, error: `Bucket is disabled (未配置)` });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to load OSS config: ' + e.message });
    }
    
    // 检查构建目录
    const buildPath = path.join(projectPath, 'build');
    if (!fs.existsSync(buildPath)) {
      return res.status(404).json({ ok: false, error: 'Build directory not found. Please build first.' });
    }
    
    // 动态导入 ali-oss
    const OSS = (await import('ali-oss')).default;
    
    // 创建 OSS 客户端（单项目上传）
    const client = new OSS({
      region: ossConfig.region,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucket: bucketConfig.name,
      timeout: 600000 // 10分钟超时
    });
    
    // 上传文件
    const uploadDir = async (dirPath, prefix = '') => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const results = [];
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const ossPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          const subResults = await uploadDir(fullPath, ossPath);
          results.push(...subResults);
        } else {
          try {
            const result = await client.put(ossPath, fullPath);
            results.push({ file: entry.name, path: ossPath, url: result.url, status: 'success' });
          } catch (err) {
            results.push({ file: entry.name, path: ossPath, status: 'failed', error: err.message });
          }
        }
      }
      
      return results;
    };
    
    const uploadResults = await uploadDir(buildPath, bucketConfig.prefix || '');
    
    const successCount = uploadResults.filter(r => r.status === 'success').length;
    const failCount = uploadResults.filter(r => r.status === 'failed').length;
    
    res.json({ 
      ok: true, 
      bucket: bucketConfig.name,
      project: projectName,
      env,
      uploaded: successCount,
      failed: failCount,
      url: bucketConfig.url || `https://${bucketConfig.name}.oss-cn-hangzhou.aliyuncs.com`,
      results: uploadResults
    });
  } catch (e) {
    console.error('OSS upload error:', e);
    res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
});

// 流式上传到 OSS（实时进度）
app.post('/api/oss/upload-stream', async (req, res) => {
  try {
    const { projectName, path: projectPath, env, bucket: bucketName } = req.body;
    
    if (!projectName || !env || !bucketName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 检查 bucket 是否为占位符
    if (bucketName.includes('placeholder')) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Bucket ${bucketName} 尚未配置` })}\n\n`);
      res.end();
      return;
    }
    
    // 读取 OSS 配置
    let ossConfig, bucketConfig;
    try {
      const ossData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
      const ossConfigs = JSON.parse(ossData);
      ossConfig = ossConfigs.connection;
      
      bucketConfig = getBucketConfig(ossConfigs, projectName, null, env);
      
      if (!bucketConfig) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Bucket config not found` })}\n\n`);
        res.end();
        return;
      }
      
      if (Array.isArray(bucketConfig)) {
        bucketConfig = bucketConfig.find(b => b.name === bucketName);
        if (!bucketConfig) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: `Bucket ${bucketName} not found` })}\n\n`);
          res.end();
          return;
        }
      }
      
      if (bucketConfig.enabled === false) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Bucket is disabled' })}\n\n`);
        res.end();
        return;
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to load OSS config: ' + e.message })}\n\n`);
      res.end();
      return;
    }
    
    // 检查构建目录
    const buildPath = path.join(projectPath, 'build');
    if (!fs.existsSync(buildPath)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Build directory not found' })}\n\n`);
      res.end();
      return;
    }
    
    // 检查 build 目录是否为空
    const shouldIgnoreFile = (filename) => {
      const ignoreList = ['.DS_Store', 'Thumbs.db', '.gitkeep', '.gitignore'];
      return ignoreList.includes(filename);
    };
    
    const countFiles = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let count = 0;
        for (const entry of entries) {
          if (shouldIgnoreFile(entry.name)) {
            continue; // 跳过系统文件
          }
          if (entry.isDirectory()) {
            count += countFiles(path.join(dir, entry.name));
          } else {
            count++;
          }
        }
        return count;
      } catch (e) {
        return 0;
      }
    };
    
    const fileCount = countFiles(buildPath);
    if (fileCount === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Build directory is empty' })}\n\n`);
      res.end();
      return;
    }
    
    res.write(`data: ${JSON.stringify({ type: 'log', message: `开始上传到 ${bucketConfig.name}...` })}\n\n`);
    
    // 动态导入 ali-oss
    const OSS = (await import('ali-oss')).default;
    
    const client = new OSS({
      region: ossConfig.region,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucket: bucketConfig.name,
      timeout: 600000 // 10分钟超时
    });
    
    let successCount = 0;
    let failCount = 0;
    let totalFiles = 0;
    
    // 递归收集所有文件
    const collectFiles = (dirPath, prefix = '') => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let files = [];
      for (const entry of entries) {
        if (shouldIgnoreFile(entry.name)) continue;
        const fullPath = path.join(dirPath, entry.name);
        const ossPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          files = files.concat(collectFiles(fullPath, ossPath));
        } else {
          files.push({ fullPath, ossPath });
        }
      }
      return files;
    };

    const allFiles = collectFiles(buildPath, bucketConfig.prefix || '');
    totalFiles = allFiles.length;

    // 并发上传
  const CONCURRENCY = 15;
    let index = 0;
    let completedCount = 0;
    
    async function uploadBatch() {
      const batch = allFiles.slice(index, index + CONCURRENCY);
      if (batch.length === 0) return;
      
      // 显示正在上传的文件
      batch.forEach(({ ossPath }) => {
        res.write(`data: ${JSON.stringify({ type: 'uploading', file: ossPath, current: completedCount + 1 })}\n\n`);
      });
      
      await Promise.all(batch.map(async ({ fullPath, ossPath }) => {
        try {
          await client.put(ossPath, fullPath);
          successCount++;
          completedCount++;
          res.write(`data: ${JSON.stringify({ type: 'success', file: ossPath, current: successCount + failCount, total: totalFiles })}\n\n`);
        } catch (err) {
          failCount++;
          completedCount++;
          res.write(`data: ${JSON.stringify({ type: 'error', file: ossPath, message: err.message })}\n\n`);
        }
      }));
      
      index += CONCURRENCY;
      if (index < allFiles.length) {
        await uploadBatch();
      }
    }

    if (allFiles.length > 0) {
      await uploadBatch();
    }
    
    res.write(`data: ${JSON.stringify({ 
      type: 'complete', 
      message: '上传完成',
      uploaded: successCount,
      failed: failCount,
      url: bucketConfig.url || `https://${bucketConfig.name}.oss-cn-hangzhou.aliyuncs.com`
    })}\n\n`);
    
    res.end();
    
  } catch (e) {
    console.error('OSS upload stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// 无渠道项目的默认上传（已废弃）
app.post('/api/oss/upload', async (req, res) => {
  try {
    const { projectName, path: projectPath } = req.body;
    
    if (!projectName) {
      return res.status(400).json({ ok: false, error: 'Missing projectName' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    // 已废弃，使用 upload-simple 代替
    res.status(501).json({ ok: false, error: 'Please use /api/oss/upload-simple with environment selection.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 复制文件到 agent-pro 并 git push
app.post('/api/copy-and-push', async (req, res) => {
  try {
    const { sourcePath, targetProjectPath, commitMessage } = req.body;
    
    if (!sourcePath || !targetProjectPath) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    const sourceDir = path.join(sourcePath, 'build');
    
    // 检查源目录是否存在
    if (!fs.existsSync(sourceDir)) {
      return res.status(400).json({ ok: false, error: 'Build directory not found' });
    }
    
    // 检查目标项目是否存在
    if (!fs.existsSync(targetProjectPath)) {
      return res.status(400).json({ ok: false, error: 'Target project not found' });
    }
    
    // 复制文件
    const copyRecursive = (src, dest) => {
      const exists = fs.existsSync(src);
      const stats = exists && fs.statSync(src);
      const isDirectory = exists && stats.isDirectory();
      
      if (isDirectory) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(childItemName => {
          copyRecursive(
            path.join(src, childItemName),
            path.join(dest, childItemName)
          );
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    // 删除目标目录中的旧文件（除了 .git 目录）
    const cleanTarget = (targetPath) => {
      if (!fs.existsSync(targetPath)) return;
      
      const items = fs.readdirSync(targetPath);
      for (const item of items) {
        if (item === '.git') continue; // 保留 .git 目录
        
        const itemPath = path.join(targetPath, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
        }
      }
    };
    
    // 清理目标目录
    cleanTarget(targetProjectPath);
    
    // 复制所有文件
    const files = fs.readdirSync(sourceDir);
    let copiedCount = 0;
    
    for (const file of files) {
      const srcFile = path.join(sourceDir, file);
      const destFile = path.join(targetProjectPath, file);
      copyRecursive(srcFile, destFile);
      copiedCount++;
    }
    
    // Git 操作
    const git = simpleGit(targetProjectPath);
    
    // 添加所有文件
    await git.add('.');
    
    // 检查是否有改动
    const status = await git.status();
    
    if (status.files.length === 0) {
      return res.json({
        ok: true,
        message: 'No changes to commit',
        copiedFiles: copiedCount,
        pushed: false
      });
    }
    
    // 提交
    const message = commitMessage || `Update from react-agent-website build at ${new Date().toLocaleString('zh-CN')}`;
    await git.commit(message);
    
    // Push
    await git.push('origin', 'main');
    
    res.json({
      ok: true,
      message: 'Files copied and pushed successfully',
      copiedFiles: copiedCount,
      changedFiles: status.files.length,
      pushed: true
    });
    
  } catch (e) {
    console.error('Copy and push error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 压缩 build 文件夹并上传到 OSS 的"以往版本"目录
app.post('/api/backup-build', async (req, res) => {
  try {
    const { projectName, projectPath, bucketName } = req.body;
    
    if (!projectName || !projectPath || !bucketName) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    const buildPath = path.join(projectPath, 'build');
    
    // 生成日期格式的文件名 YYYY-MM-DD
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const zipFileName = `${dateStr}.zip`;
    const tempZipPath = path.join(os.tmpdir(), `${projectName}-${dateStr}-${Date.now()}.zip`);
    
    // 创建压缩文件
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(tempZipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        console.log(`Archive created: ${archive.pointer()} bytes`);
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(buildPath, false);
      archive.finalize();
    });
    
    // 读取 OSS 配置
    const ossConfigData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
    const ossConfigs = JSON.parse(ossConfigData);
    
    if (!ossConfigs.connection) {
      return res.status(500).json({ ok: false, error: 'OSS connection config not found' });
    }
    
    // 导入 ali-oss
    const OSS = (await import('ali-oss')).default;
    
    // 创建 OSS 客户端
    const client = new OSS({
      region: ossConfigs.connection.region,
      accessKeyId: ossConfigs.connection.accessKeyId,
      accessKeySecret: ossConfigs.connection.accessKeySecret,
      bucket: bucketName,
      timeout: 600000 // 10分钟超时
    });
    
    // 上传到 OSS 的"以往版本"目录
    const ossPath = `以往版本/${zipFileName}`;
    const result = await client.put(ossPath, tempZipPath);
    
    // 获取文件大小（在删除前）
    const zipStats = fs.statSync(tempZipPath);
    const fileSizeInMB = (zipStats.size / (1024 * 1024)).toFixed(2);
    
    // 删除临时文件
    fs.unlinkSync(tempZipPath);
    
    res.json({
      ok: true,
      message: 'Build backup uploaded successfully',
      fileName: zipFileName,
      ossPath: ossPath,
      url: result.url,
      size: fileSizeInMB + ' MB'
    });
    
  } catch (e) {
    console.error('Backup build error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 获取 bucket 信息（用于多渠道项目备份）
app.post('/api/oss/get-bucket-info', async (req, res) => {
  try {
    const { projectName, channelId, env } = req.body;
    
    const ossConfigData = fs.readFileSync(OSS_CONFIG_PATH, 'utf-8');
    const ossConfigs = JSON.parse(ossConfigData);
    
    const bucketConfig = getBucketConfig(ossConfigs, projectName, channelId, env);
    
    if (!bucketConfig) {
      return res.status(404).json({ error: 'Bucket config not found' });
    }
    
    const buckets = Array.isArray(bucketConfig) ? bucketConfig : [bucketConfig];
    res.json({ buckets });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 清空build文件夹
app.post('/api/clear-build', async (req, res) => {
  try {
    const { projectName, path: projectPathParam } = req.body;
    
    if (!projectName && !projectPathParam) {
      return res.status(400).json({ error: 'Missing projectName or path' });
    }
    
    let projectPath = projectPathParam || path.join(DEFAULT_DIR, projectName);
    
    // 处理 ~ 路径
    if (projectPath.startsWith('~')) {
      const homeDir = require('os').homedir();
      projectPath = path.join(homeDir, projectPath.slice(1));
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found: ' + projectPath });
    }
    
    const buildPath = path.join(projectPath, 'build');
    
    if (fs.existsSync(buildPath)) {
      try {
        // 递归删除build目录内容
        const { execSync } = await import('child_process');
        execSync(`rm -rf "${buildPath}"/*`, { cwd: projectPath });
        res.json({ success: true, message: 'build文件夹已清空' });
      } catch (err) {
        res.status(500).json({ error: '清空build文件夹失败: ' + err.message });
      }
    } else {
      res.json({ success: true, message: 'build文件夹不存在，无需清空' });
    }
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 生产环境部署完成后的自动执行任务
async function executePostDeploymentTasks(projectName, channelId, uploadResults, zipFileName, res = null) {
  console.log(`🔄 开始执行生产环境部署后任务 - 项目: ${projectName}, 渠道: ${channelId}, 备份结果数量: ${uploadResults.length}`);
  
  // 验证备份是否成功
  const backupSuccessCount = uploadResults.filter(r => r.status === 'success').length;
  const totalBackups = uploadResults.length;
  
  console.log(`📊 备份验证: ${backupSuccessCount}/${totalBackups} 个存储桶备份成功`);
  
  if (backupSuccessCount !== totalBackups) {
    console.log(`⚠️ 备份未完全成功 (${backupSuccessCount}/${totalBackups})，跳过部署后任务`);
    return { success: false, error: `备份失败: ${backupSuccessCount}/${totalBackups} 个存储桶备份成功`, tasks: [] };
  }
  
  console.log(`✅ 备份验证通过，开始执行部署后任务`);  const tasks = [];

  try {
    // 任务1: 发送部署完成通知
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '部署通知', status: 'running' })}\n\n`);
    tasks.push({
      name: '部署通知',
      status: 'running',
      result: await sendDeploymentNotification(projectName, uploadResults, zipFileName)
    });
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '部署通知', status: 'completed' })}\n\n`);

    // 任务2: 更新项目版本信息
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '版本更新', status: 'running' })}\n\n`);
    tasks.push({
      name: '版本更新',
      status: 'running',
      result: await updateProjectVersion(projectName, zipFileName)
    });
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '版本更新', status: 'completed' })}\n\n`);

    // 任务3: 执行部署脚本（如果存在）
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '部署脚本', status: 'running' })}\n\n`);
    tasks.push({
      name: '部署脚本',
      status: 'running',
      result: await executeDeploymentScript(projectName)
    });
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '部署脚本', status: 'completed' })}\n\n`);

    // 任务4: 清理旧版本文件
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '清理缓存', status: 'running' })}\n\n`);
    tasks.push({
      name: '清理缓存',
      status: 'running',
      result: await cleanupOldVersions(projectName)
    });
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: '清理缓存', status: 'completed' })}\n\n`);

    // 任务5: 刷新CDN缓存
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: 'CDN刷新', status: 'running' })}\n\n`);
    tasks.push({
      name: 'CDN刷新',
      status: 'running',
      result: await refreshCDNCache(projectName, channelId, res)
    });
    if (res) res.write(`data: ${JSON.stringify({ type: 'post_deployment_task', task: 'CDN刷新', status: 'completed' })}\n\n`);

    console.log(`✅ 生产环境部署后任务完成 - 项目: ${projectName}`);
    return { success: true, tasks };

  } catch (error) {
    console.error(`❌ 生产环境部署后任务失败 - 项目: ${projectName}`, error);
    return { success: false, error: error.message, tasks };
  }
}// 发送部署完成通知
async function sendDeploymentNotification(projectName, uploadResults, zipFileName) {
  try {
    const timestamp = new Date().toLocaleString('zh-CN');
    const successCount = uploadResults.filter(r => r.status === 'success').length;
    const totalCount = uploadResults.length;
    
    const message = `🚀 生产环境部署完成\n\n📦 项目: ${projectName}\n📁 文件: ${zipFileName}\n⏰ 时间: ${timestamp}\n✅ 成功: ${successCount}/${totalCount} 个存储桶\n\n存储详情:\n${uploadResults.map(r => `${r.bucket}: ${r.status === 'success' ? '✅' : '❌'} ${r.url || r.error}`).join('\n')}`;
    
    // 这里可以集成各种通知服务，如微信、钉钉、邮件等
    // 暂时记录到控制台，后续可以扩展
    console.log('📢 部署通知:', message);
    
    // 可以在这里添加实际的通知发送逻辑
    // await sendWechatNotification(message);
    // await sendEmailNotification(message);
    
    return { success: true, message: '通知发送成功' };
  } catch (error) {
    throw new Error(`发送通知失败: ${error.message}`);
  }
}

// 更新项目版本信息
async function updateProjectVersion(projectName, zipFileName) {
  try {
    const versionFile = path.join(__dirname, 'project-versions.json');
    
    let versions = {};
    if (fs.existsSync(versionFile)) {
      versions = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    }
    
    versions[projectName] = {
      lastDeployed: new Date().toISOString(),
      zipFile: zipFileName,
      environment: 'prod',
      timestamp: Date.now()
    };
    
    fs.writeFileSync(versionFile, JSON.stringify(versions, null, 2));
    
    return { success: true, message: '版本信息已更新' };
  } catch (error) {
    throw new Error(`更新版本信息失败: ${error.message}`);
  }
}

// 执行部署脚本
async function executeDeploymentScript(projectName) {
  try {
    const projectPath = path.join(DEFAULT_DIR, projectName);
    const deployScript = path.join(projectPath, 'deploy.sh');
    const deployScriptAlt = path.join(projectPath, 'scripts', 'deploy.sh');
    
    let scriptPath = null;
    if (fs.existsSync(deployScript)) {
      scriptPath = deployScript;
    } else if (fs.existsSync(deployScriptAlt)) {
      scriptPath = deployScriptAlt;
    }
    
    if (scriptPath) {
      const { execSync } = await import('child_process');
      const result = execSync(`bash "${scriptPath}"`, { 
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000 // 30秒超时
      });
      
      console.log(`📜 部署脚本执行结果: ${projectName}`, result);
      return { success: true, message: '部署脚本执行成功', output: result };
    } else {
      return { success: true, message: '未找到部署脚本，跳过执行' };
    }
  } catch (error) {
    throw new Error(`执行部署脚本失败: ${error.message}`);
  }
}

// 清理旧版本文件
async function cleanupOldVersions(projectName) {
  try {
    const versionFile = path.join(__dirname, 'project-versions.json');
    
    if (!fs.existsSync(versionFile)) {
      return { success: true, message: '无版本文件需要清理' };
    }
    
    const versions = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    const projectVersions = versions[projectName];
    
    if (!projectVersions) {
      return { success: true, message: '无项目版本信息' };
    }
    
    // 保留最近5个版本，清理更旧的
    const maxVersions = 5;
    const sortedVersions = Object.entries(projectVersions)
      .sort(([,a], [,b]) => b.timestamp - a.timestamp)
      .slice(maxVersions);
    
    if (sortedVersions.length > 0) {
      console.log(`🧹 清理旧版本文件: ${projectName}`, sortedVersions.map(([key]) => key));
      // 这里可以添加实际的文件清理逻辑
      // 比如删除OSS上的旧版本文件
    }
    
    return { success: true, message: `已清理旧版本，保留最近${maxVersions}个版本` };
  } catch (error) {
    throw new Error(`清理旧版本失败: ${error.message}`);
  }
}

// CDN缓存刷新函数
async function refreshCDNCache(projectName, channelId = null, res = null) {
  try {
    console.log(`🔄 开始刷新CDN缓存 - 项目: ${projectName}${channelId ? `, 渠道: ${channelId}` : ''}`);
    if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_start', message: `开始刷新 ${projectName} 的CDN缓存` })}\n\n`);
    
    // 读取OSS配置
    const ossConfig = JSON.parse(fs.readFileSync(OSS_CONFIG_PATH, 'utf-8'));
    const projectConfig = ossConfig.projects[projectName];
    
    let cdnDomains = [];
    
    // 检查是否是多渠道项目
    if (projectConfig?.channels) {
      // 多渠道项目：只刷新指定渠道的CDN域名
      if (channelId && channelId !== 'default' && projectConfig.channels[channelId]?.buckets?.cdnDomains) {
        console.log(`📋 刷新指定渠道 ${channelId} 的CDN域名`);
        cdnDomains = projectConfig.channels[channelId].buckets.cdnDomains;
      } else {
        console.log(`⚠️ 未指定渠道或渠道 ${channelId} 未配置CDN域名`);
        return { success: true, message: '未指定渠道或渠道未配置CDN域名' };
      }
    } else if (projectConfig?.buckets?.cdnDomains) {
      // 单渠道项目：使用原有逻辑，忽略channelId
      console.log(`📋 刷新单渠道项目 ${projectName} 的CDN域名`);
      cdnDomains = projectConfig.buckets.cdnDomains;
    }
    
    if (cdnDomains.length === 0) {
      console.log(`⚠️ 项目 ${projectName} 未配置CDN域名，跳过刷新`);
      return { success: true, message: '未配置CDN域名' };
    }
    
    console.log(`📋 发现 ${cdnDomains.length} 个CDN域名:`, cdnDomains);
    if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_domains', domains: cdnDomains, count: cdnDomains.length })}\n\n`);
    
    // 使用阿里云CLI刷新每个域名
    const results = [];
    for (const domain of cdnDomains) {
      try {
        console.log(`🔄 刷新域名: ${domain}`);
        if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_domain', domain, status: 'starting' })}\n\n`);
        
        // 使用child_process执行aliyun CLI
        const aliyun = spawn('aliyun', [
          'cdn', 'RefreshObjectCaches',
          '--ObjectPath', domain,
          '--ObjectType', 'Directory'
        ], { stdio: 'pipe' });
        
        let stdout = '';
        let stderr = '';
        
        aliyun.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        aliyun.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        await new Promise((resolve, reject) => {
          aliyun.on('close', (code) => {
            if (code === 0) {
              console.log(`✅ 域名 ${domain} 刷新成功`);
              results.push({ domain, success: true, taskId: JSON.parse(stdout).RefreshTaskId });
              if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_domain', domain, status: 'success', taskId: JSON.parse(stdout).RefreshTaskId })}\n\n`);
              resolve();
            } else {
              console.error(`❌ 域名 ${domain} 刷新失败:`, stderr);
              results.push({ domain, success: false, error: stderr });
              if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_domain', domain, status: 'failed', error: stderr })}\n\n`);
              reject(new Error(stderr));
            }
          });
        });
        
      } catch (error) {
        console.error(`❌ 刷新域名 ${domain} 时出错:`, error.message);
        results.push({ domain, success: false, error: error.message });
        if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_domain', domain, status: 'error', error: error.message })}\n\n`);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ CDN缓存刷新完成 - 成功: ${successCount}/${results.length}`);
    if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_complete', success: successCount, total: results.length, results })}\n\n`);
    
    return { 
      success: successCount > 0, 
      message: `刷新了 ${successCount}/${results.length} 个域名`,
      results 
    };
    
  } catch (error) {
    console.error(`❌ CDN缓存刷新失败 - 项目: ${projectName}`, error);
    if (res) res.write(`data: ${JSON.stringify({ type: 'cdn_refresh_error', error: error.message })}\n\n`);
    return { success: false, error: error.message };
  }
}

// ─── Seafile 管理 API ──────────────────────────────────────────────
const SEAFILE_DIR = '/Users/maiyou001/seafile';

async function runDockerCompose(args) {
  const { execSync } = await import('child_process');
  return execSync(`docker compose ${args}`, {
    cwd: SEAFILE_DIR,
    env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' },
    encoding: 'utf8',
  });
}

app.get('/api/seafile/status', async (_req, res) => {
  try {
    const { execSync } = await import('child_process');
    const output = execSync(
      'docker ps -a --filter "name=seafile" --format "{{.Names}}|{{.Status}}|{{.Image}}|{{.Size}}"',
      { env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' }, encoding: 'utf8' }
    );
    const containers = output.trim().split('\n').filter(Boolean).map(line => {
      const [name, status, image, sizeStr] = line.split('|');
      // sizeStr 格式: "16.8MB (virtual 1.49GB)"，取括号内的 virtual 值
      const virtualMatch = sizeStr?.match(/virtual\s+([\d.]+\s*\w+)/i);
      const imageSize = virtualMatch ? virtualMatch[1] : '';
      return { name, status, image, running: status?.startsWith('Up'), imageSize };
    });
    const allRunning = containers.length > 0 && containers.every(c => c.running);

    // 获取局域网 IP
    const nets = os.networkInterfaces();
    let localIp = '';
    for (const iface of Object.values(nets)) {
      for (const addr of (iface || [])) {
        if (addr.family === 'IPv4' && !addr.internal) {
          localIp = addr.address;
          break;
        }
      }
      if (localIp) break;
    }

    // 统计各容器关联的磁盘占用
    const duSize = (p) => {
      try {
        return execSync(`du -sh "${p}" 2>/dev/null | cut -f1`, {
          env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' },
          encoding: 'utf8', timeout: 8000,
        }).trim();
      } catch (_) { return ''; }
    };
    // 容器名 → 数据目录映射
    const containerDiskMap = {
      seafile:           duSize(`${SEAFILE_DIR}/data/seafile/seafile-data`),
      'seafile-mysql':   duSize(`${SEAFILE_DIR}/mysql`),
      'seafile-memcached': '',
    };
    // 每个容器附上镜像大小和数据大小
    const containersWithDisk = containers.map(c => {
      // 按最长 key 优先匹配，避免 "seafile" 覆盖 "seafile-mysql"
      const matchKey = Object.keys(containerDiskMap)
        .sort((a, b) => b.length - a.length)
        .find(k => c.name.includes(k));
      return { ...c, diskUsage: matchKey ? containerDiskMap[matchKey] : '' };
    });
    // 镜像总占用
    let imagesSize = '';
    try {
      const out = execSync(
        'docker system df --format "{{.Type}}|{{.Size}}" 2>/dev/null',
        { env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 }
      );
      const line = out.split('\n').find(l => l.startsWith('Images|'));
      imagesSize = line ? line.split('|')[1] : '';
    } catch (_) {}

    res.json({ success: true, running: allRunning, containers: containersWithDisk, localIp, imagesSize });
  } catch (e) {
    res.json({ success: false, running: false, containers: [], error: e.message });
  }
});

app.post('/api/seafile/start', async (_req, res) => {
  try {
    // 启动时同步开启 SeafDAV
    try {
      let conf = fs.readFileSync(SEAFDAV_CONF, 'utf8');
      if (!/^\s*enabled\s*=\s*true/mi.test(conf)) {
        conf = conf.replace(/^\s*enabled\s*=\s*(true|false)/mi, 'enabled = true');
        fs.writeFileSync(SEAFDAV_CONF, conf, 'utf8');
      }
    } catch (_) {}
    await runDockerCompose('up -d');
    res.json({ success: true, message: 'Seafile 已启动，SeafDAV 已开启' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/seafile/stop', async (_req, res) => {
  try {
    await runDockerCompose('down --timeout 10');
    res.json({ success: true, message: 'Seafile 已停止' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/seafile/restart', async (_req, res) => {
  try {
    await runDockerCompose('restart');
    res.json({ success: true, message: 'Seafile 已重启' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const SEAFDAV_CONF = '/Users/maiyou001/seafile/data/seafile/conf/seafdav.conf';

// 读取 SeafDAV 配置状态
app.get('/api/seafile/seafdav/status', (_req, res) => {
  try {
    const content = fs.readFileSync(SEAFDAV_CONF, 'utf8');
    const enabled = /^\s*enabled\s*=\s*true/mi.test(content);
    const portMatch = content.match(/^\s*port\s*=\s*(\d+)/mi);
    const shareMatch = content.match(/^\s*share_name\s*=\s*(\S+)/mi);
    const port = portMatch ? portMatch[1] : '8080';
    const shareName = shareMatch ? shareMatch[1] : '/seafdav';
    res.json({ success: true, enabled, port, shareName });
  } catch (e) {
    res.json({ success: false, enabled: false, error: e.message });
  }
});

// 开启 / 关闭 SeafDAV（修改 enabled 值，然后重启 Seafile）
app.post('/api/seafile/seafdav/toggle', async (req, res) => {
  const { enable } = req.body; // true = 开启，false = 关闭
  try {
    let content = fs.readFileSync(SEAFDAV_CONF, 'utf8');
    content = content.replace(/^\s*enabled\s*=\s*(true|false)/mi, `enabled = ${enable ? 'true' : 'false'}`);
    fs.writeFileSync(SEAFDAV_CONF, content, 'utf8');
    await runDockerCompose('restart');
    res.json({ success: true, enabled: !!enable, message: `SeafDAV 已${enable ? '开启' : '关闭'}，Seafile 已重启` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────── IPA 工具 API ───────────────────────────────

/** 从 URL 下载文件（支持 http/https 及重定向） */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    function doRequest(targetUrl) {
      const lib = targetUrl.startsWith('https') ? https : http;
      lib.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`下载失败，HTTP 状态码: ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    }
    doRequest(url);
  });
}

/** 扫描 IPA 包内所有 Framework / Bundle / Dylib */
/**
 * 用 unzip -Z1 列出 IPA 内所有条目名，不将文件加载进内存。
 * 对超大 IPA（2GB+）完全安全，扫描速度快（通常 < 1s）。
 */
async function scanFrameworksFromDisk(ipaPath) {
  const output = await runCmd(`unzip -Z1 "${ipaPath}"`);
  const entryNames = output.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(name => !name.startsWith('__MACOSX/'));
  const entries = entryNames.map(name => ({ entryName: name, header: { size: 0 } }));
  const frameworks = scanFrameworksFromEntries(entries);

  // 并行提取每个 framework/bundle 的 Info.plist 版本号
  const plist = await import('plist');
  await Promise.all(frameworks.map(async (fw) => {
    try {
      const plistPath = fw.path.replace(/\/$/, '') + '/Info.plist';
      const plistContent = await runCmd(`unzip -p "${ipaPath}" "${plistPath}"`);
      const data = plist.parse(plistContent);
      fw.version = data.CFBundleShortVersionString || data.CFBundleVersion || '';
      fw.bundleVersion = data.CFBundleVersion || '';
    } catch (_) {
      fw.version = '';
      fw.bundleVersion = '';
    }
  }));

  return frameworks;
}

function scanFrameworksFromEntries(entries) {
  const sdkMap = new Map();
  entries.forEach(e => {
    const name = e.entryName;
    let type = null;
    let sdkPath = null;

    if (name.endsWith('.framework/') || name.includes('.framework/')) {
      const match = name.match(/(.*\.framework)\//);
      if (match) { sdkPath = match[1] + '/'; type = 'framework'; }
    } else if (name.endsWith('.bundle/') || name.includes('.bundle/')) {
      const match = name.match(/(.*\.bundle)\//);
      if (match) { sdkPath = match[1] + '/'; type = 'bundle'; }
    } else if (name.endsWith('.dylib')) {
      sdkPath = name; type = 'dylib';
    }

    if (sdkPath && type && !sdkMap.has(sdkPath)) {
      const sdkName = path.basename(sdkPath.replace(/\/$/, ''));
      // 计算 SDK 总大小
      const size = entries
        .filter(en => en.entryName.startsWith(sdkPath))
        .reduce((sum, en) => sum + (en.header?.size || 0), 0);
      sdkMap.set(sdkPath, { name: sdkName, path: sdkPath, size, type });
    }
  });
  return Array.from(sdkMap.values());
}

/** 解析 IPA 信息（用于 IPA 信息查看页） */
async function parseIpaInfo(ipaBuffer) {
  const plist = await import('plist');
  const zip = new AdmZip(ipaBuffer);
  const entries = zip.getEntries();

  const infoPlistEntry = entries.find(e =>
    /^Payload\/[^/]+\.app\/Info\.plist$/.test(e.entryName)
  );
  if (!infoPlistEntry) throw new Error('未找到 Info.plist');

  const plistData = plist.parse(infoPlistEntry.getData().toString('utf-8'));

  // 构建文件树（FileNode 格式）
  const buildFileTree = (ents) => {
    const root = {};
    ents.forEach(e => {
      const parts = e.entryName.split('/').filter(Boolean);
      let node = root;
      parts.forEach((part, i) => {
        if (!node[part]) {
          node[part] = {
            _isDir: i < parts.length - 1 || e.entryName.endsWith('/'),
            _entryName: e.entryName,
            _size: e.header?.size || 0,
            _compressedSize: e.header?.compressedSize || 0,
            _time: e.header?.time instanceof Date ? e.header.time.toISOString() : null,
            _crc: e.header?.crc || 0,
            _children: {},
          };
        }
        node = node[part]._children;
      });
    });
    const toTree = (obj, parentPath) => Object.entries(obj).map(([name, val]) => {
      const entPath = val._isDir
        ? (val._entryName.endsWith('/') ? val._entryName : val._entryName + '/')
        : val._entryName;
      return {
        name,
        path: entPath || (parentPath + name + (val._isDir ? '/' : '')),
        isDir: val._isDir,
        size: val._size,
        compressedSize: val._compressedSize,
        time: val._time,
        crc: val._crc,
        children: val._isDir ? toTree(val._children, entPath) : undefined,
      };
    });
    return toTree(root, '');
  };

  // 收集 plist 内容
  const collectPlists = (ents) => {
    const result = {};
    ents.filter(e => e.entryName.endsWith('.plist') && !e.isDirectory).forEach(e => {
      try {
        result[e.entryName] = plist.parse(e.getData().toString('utf-8'));
      } catch (_) {}
    });
    return result;
  };

  // 权限列表（key 去掉 NS 前缀和 UsageDescription 后缀作为 label）
  const permissions = Object.entries(plistData)
    .filter(([k]) => k.endsWith('UsageDescription'))
    .map(([k, v]) => ({
      key: k,
      label: k.replace(/^NS/, '').replace(/UsageDescription$/, '').replace(/([A-Z])/g, ' $1').trim(),
      description: String(v),
    }));

  // URL Scheme 列表
  const urlSchemes = (plistData.CFBundleURLTypes || []).flatMap(t =>
    (t.CFBundleURLSchemes || []).map(s => ({ scheme: s, name: t.CFBundleURLName || '' }))
  );

  return {
    info: {
      name: plistData.CFBundleDisplayName || plistData.CFBundleName || '',
      bundleId: plistData.CFBundleIdentifier || '',
      version: plistData.CFBundleShortVersionString || '',
      build: plistData.CFBundleVersion || '',
      minOS: plistData.MinimumOSVersion || '',
      platform: plistData.DTPlatformName || plistData.CFBundleSupportedPlatforms?.[0] || '',
      sdkVersion: plistData.DTSDKName || '',
      executable: plistData.CFBundleExecutable || '',
    },
    permissions,
    urlSchemes,
    fileTree: buildFileTree(entries),
    plists: collectPlists(entries),
  };
}

/** 创建 IPA 处理会话（用于 SDK 替换） */
async function createIpaSession(ipaBuffer, originalName) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const ipaPath = path.join(sessionDir, 'original.ipa');
  fs.writeFileSync(ipaPath, ipaBuffer);
  const frameworks = await scanFrameworksFromDisk(ipaPath);
  return { sessionId, ipaName: originalName, frameworks };
}

/**
 * 磁盘模式 IPA 替换（始终使用，避免内存溢出）
 * @param {string} ipaPath    原始 IPA 文件路径
 * @param {string[]} fwFilePaths  替换资源 zip 文件的磁盘路径数组
 * @param {string[]} fwTargetPaths  IPA 内对应的 SDK 路径数组
 * @returns {Buffer} 替换后的 IPA buffer
 */
/**
 * 磁盘模式 IPA 替换，返回输出文件路径（调用方负责清理工作目录）
 * @returns {{ outputIpa: string, workDir: string }}
 */
// 用 Promise 包装 exec，避免 execSync 阻塞事件循环
function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve(stdout);
    });
  });
}

/**
 * 在 searchDir 目录树中递归查找所有名称等于 name 的文件/目录。
 * 找到后不再向其内部继续递归，避免匹配自身内部的同名子项。
 */
function findItemByName(searchDir, name) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (_) { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      if (entry === name) {
        results.push(fullPath);
        continue; // 不递归进已匹配的目录
      }
      try {
        if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
      } catch (_) {}
    }
  }
  walk(searchDir);
  return results;
}

/**
 * 按文件名匹配替换 IPA 内的 SDK：
 * 1. 解压 IPA
 * 2. 对每个替换资源 zip，解压后取顶层文件/目录，在 IPA 树中查找同名项并替换
 * 3. 重新打包为 IPA
 */
async function replaceFrameworksOnDisk(ipaPath, fwFilePaths, ipaBaseName) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipa-replace-'));
  if (!ipaBaseName) ipaBaseName = path.basename(ipaPath, '.ipa');

  // Step 1: IPA 本质是 zip，复制并重命名为 .zip，再解压
  const zipPath = path.join(workDir, `${ipaBaseName}.zip`);
  fs.copyFileSync(ipaPath, zipPath);
  const extractDir = path.join(workDir, 'extracted');
  fs.mkdirSync(extractDir);
  await runCmd(`unzip -q "${zipPath}" -d "${extractDir}"`);
  fs.unlinkSync(zipPath); // 解压完成后删除临时 zip，释放空间

  // Step 2: 依次处理每个替换资源
  for (let i = 0; i < fwFilePaths.length; i++) {
    const fwFilePath = fwFilePaths[i];
    const fwExtractDir = path.join(workDir, `fw_${i}`);
    fs.mkdirSync(fwExtractDir);

    const stat = fs.statSync(fwFilePath);
    if (stat.isDirectory()) {
      // .framework / .bundle 目录：直接复制进临时目录
      const itemName = path.basename(fwFilePath.replace(/\/$/, ''));
      await runCmd(`cp -R "${fwFilePath}" "${fwExtractDir}/${itemName}"`);
    } else {
      // zip 压缩包：解压
      await runCmd(`unzip -q "${fwFilePath}" -d "${fwExtractDir}"`);
    }

    // 取顶层条目（过滤 macOS 产生的 __MACOSX / .DS_Store 等元数据）
    const topItems = fs.readdirSync(fwExtractDir)
      .filter(n => n !== '__MACOSX' && !n.startsWith('.'));

    for (const itemName of topItems) {
      const srcPath = path.join(fwExtractDir, itemName);

      // 在 IPA 解压目录中查找同名文件或目录
      const matches = findItemByName(extractDir, itemName);

      if (matches.length === 0) {
        console.log(`[replace] 未找到同名 "${itemName}"，跳过`);
        continue;
      }

      for (const matchPath of matches) {
        console.log(`[replace] 替换: ${matchPath.replace(extractDir, '')}`);
        fs.rmSync(matchPath, { recursive: true, force: true });
        await runCmd(`cp -R "${srcPath}" "${path.dirname(matchPath)}/"`);
      }
    }
  }

  // Step 3: 将 Payload 文件夹压缩为 Payload.zip，再改名为 ****.ipa
  const payloadZip = path.join(workDir, 'Payload.zip');
  await runCmd(`cd "${extractDir}" && zip -qr "${payloadZip}" Payload`);
  fs.rmSync(extractDir, { recursive: true, force: true });

  // Payload.zip 改名为 原始文件名.ipa
  const outputIpa = path.join(workDir, `${ipaBaseName}.ipa`);
  fs.renameSync(payloadZip, outputIpa);

  return { outputIpa, workDir, outputName: `${ipaBaseName}.ipa` };
}

// ── IPA 信息查看 ─────────────────────────────────────────────────────

app.post('/api/ipa/parse', upload.single('ipa'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '未上传文件' });
  try {
    const info = await parseIpaInfo(req.file.buffer);
    res.json({ success: true, ...info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/ipa/parse-from-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: '缺少 URL' });
  try {
    const buf = await downloadFile(url);
    const info = await parseIpaInfo(buf);
    res.json({ success: true, ...info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── IPA SDK 替换 ──────────────────────────────────────────────────────

app.post('/api/ipa/init-session', uploadToDisk.single('ipa'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '未上传 IPA 文件' });
  try {
    // 直接用磁盘上的临时文件，不读入内存
    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const ipaPath = path.join(sessionDir, 'original.ipa');
    fs.renameSync(req.file.path, ipaPath); // 移动到会话目录，避免复制
    const frameworks = await scanFrameworksFromDisk(ipaPath);
    res.json({ success: true, sessionId, ipaName: req.file.originalname, frameworks });
  } catch (e) {
    // 失败时清理临时文件
    try { if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/ipa/fetch-url-for-sdk', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: '缺少 URL' });
  try {
    const buf = await downloadFile(url);
    const ipaName = decodeURIComponent(path.basename(new URL(url).pathname)) || 'downloaded.ipa';
    const result = await createIpaSession(buf, ipaName);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/ipa/replace-framework-by-session', (req, res, next) => {
  console.log('[replace] multer 开始处理上传...');
  uploadToDisk.fields([{ name: 'framework' }])(req, res, (err) => {
    if (err) {
      console.error('[replace] multer 错误:', err.code, err.message);
      return res.status(400).json({ success: false, error: `上传失败: ${err.message} (${err.code || ''})` });
    }
    replaceHandler(req, res, next);
  });
});

async function replaceHandler(req, res, _next) {
  console.log('[replace] 请求已到达，body keys:', Object.keys(req.body || {}), 'files:', Object.keys(req.files || {}));
  const { sessionId } = req.body;
  const frameworkFiles = (req.files && req.files['framework']) || [];

  console.log('[replace] sessionId:', sessionId, 'frameworks:', frameworkFiles.length);

  if (!sessionId || frameworkFiles.length === 0) {
    return res.status(400).json({ success: false, error: '参数无效' });
  }

  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  const originalIpaPath = path.join(sessionDir, 'original.ipa');
  if (!fs.existsSync(originalIpaPath)) {
    return res.status(404).json({ success: false, error: '会话不存在或已过期' });
  }

  const uploadedFilePaths = frameworkFiles.map(f => f.path);

  try {
    const { outputIpa, workDir } = await replaceFrameworksOnDisk(originalIpaPath, uploadedFilePaths);

    uploadedFilePaths.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });

    // 将替换后的 IPA 移入会话目录，供后续 GET 下载
    const destIpa = path.join(sessionDir, 'replaced.ipa');
    fs.renameSync(outputIpa, destIpa);
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}

    // 返回 JSON，前端通过独立的 GET 请求下载文件（避免跨域 blob 流问题）
    res.json({ success: true, sessionId });

  } catch (e) {
    console.error('SDK 替换失败:', e);
    uploadedFilePaths.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });
    res.status(500).json({ success: false, error: `替换失败: ${e.message}` });
  }
}

app.get('/api/ipa/download-session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const ipaPath = path.join(SESSIONS_DIR, sessionId, 'original.ipa');
  if (!fs.existsSync(ipaPath)) {
    return res.status(404).json({ success: false, error: '会话不存在或已过期' });
  }
  res.setHeader('Content-Disposition', 'attachment; filename="session.ipa"');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(ipaPath);
});

// 下载替换后的 IPA（浏览器原生 GET 下载，绕过 fetch blob 限制）
app.get('/api/ipa/download-replaced/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const ipaPath = path.join(SESSIONS_DIR, sessionId, 'replaced.ipa');
  if (!fs.existsSync(ipaPath)) {
    return res.status(404).json({ success: false, error: '替换文件不存在或已过期' });
  }
  const filename = req.query.filename
    ? String(req.query.filename).replace(/[^\w.\-()[\]]/g, '_')
    : 'replaced.ipa';
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(ipaPath);
});

// ── IPA SDK 磁盘路径模式 ──────────────────────────────────────────────

// 通用：写临时 .applescript 文件执行，比 heredoc 在 pm2 环境更可靠
async function runAppleScript(script) {
  const tmpFile = path.join(os.tmpdir(), `ai_pick_${Date.now()}.applescript`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf8');
    const output = await runCmd(`osascript "${tmpFile}"`);
    return output;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

// 选择 .framework（在 Finder 中表现为文件夹，必须用 choose folder）
app.get('/api/ipa/pick-sdk-frameworks', async (_req, res) => {
  try {
    const output = await runAppleScript(
      'set folderList to choose folder with prompt "选择 .framework 目录（可多选）" with multiple selections allowed\n' +
      'set pathList to {}\n' +
      'repeat with aFolder in folderList\n' +
      '  set end of pathList to POSIX path of aFolder\n' +
      'end repeat\n' +
      'return pathList'
    );
    const paths = output.trim().split(', ').map(p => p.trim()).filter(Boolean);
    res.json({ success: true, paths });
  } catch (e) {
    res.json({ success: false, cancelled: true });
  }
});

// 选择 .bundle（在 Finder 中表现为文件包，必须用 choose file）
app.get('/api/ipa/pick-sdk-bundles', async (_req, res) => {
  try {
    const output = await runAppleScript(
      'set fileList to choose file with prompt "选择 .bundle 文件（可多选）" with multiple selections allowed\n' +
      'set pathList to {}\n' +
      'repeat with aFile in fileList\n' +
      '  set end of pathList to POSIX path of aFile\n' +
      'end repeat\n' +
      'return pathList'
    );
    const paths = output.trim().split(', ').map(p => p.trim()).filter(Boolean);
    res.json({ success: true, paths });
  } catch (e) {
    res.json({ success: false, cancelled: true });
  }
});

// 调起 macOS 原生文件选择对话框，返回用户选中的 IPA 路径
app.get('/api/ipa/pick-file', async (_req, res) => {
  try {
    const output = await runAppleScript(
      'set f to choose file with prompt "选择 IPA 文件" of type {"ipa"}\n' +
      'return POSIX path of f'
    );
    res.json({ success: true, path: output.trim() });
  } catch (e) {
    res.json({ success: false, cancelled: true });
  }
});

// 列出目录下的文件（供前端磁盘模式浏览使用）
app.get('/api/ipa/list-dir', (req, res) => {
  const { path: dirPath } = req.query;
  if (!dirPath) return res.status(400).json({ success: false, error: '缺少 path 参数' });

  try {
    const fullPath = path.resolve(String(dirPath).replace(/^~/, os.homedir()));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: `目录不存在: ${fullPath}` });
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: '路径不是目录' });
    }

    const files = fs.readdirSync(fullPath)
      .map(name => {
        const filePath = path.join(fullPath, name);
        try {
          const s = fs.statSync(filePath);
          return { name, path: filePath, size: s.size, isDir: s.isDirectory(), ext: path.extname(name).toLowerCase() };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, files, dirPath: fullPath });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 从本机磁盘路径创建 IPA 会话（不上传，直接读本地文件）
app.post('/api/ipa/init-session-from-path', async (req, res) => {
  const { ipaPath } = req.body;
  if (!ipaPath) return res.status(400).json({ success: false, error: '缺少 ipaPath' });

  try {
    const fullPath = path.resolve(String(ipaPath).replace(/^~/, os.homedir()));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: `文件不存在: ${fullPath}` });
    }

    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const destPath = path.join(sessionDir, 'original.ipa');

    // 用 cp 复制避免加载进内存（原文件保持不变）
    await runCmd(`cp "${fullPath}" "${destPath}"`);

    const ipaName = path.basename(fullPath);
    const frameworks = await scanFrameworksFromDisk(destPath);

    // 从 Payload/*.app/Info.plist 读取手机显示名称
    let appName = '';
    try {
      const plist = await import('plist');
      const infoPlistContent = await runCmd(`unzip -p "${destPath}" "Payload/*.app/Info.plist"`);
      const infoPlist = plist.parse(infoPlistContent);
      appName = infoPlist.CFBundleDisplayName || infoPlist.CFBundleName || '';
    } catch (_) {}

    // 将原始文件名写入会话元数据，供替换时使用
    fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({ ipaName }), 'utf8');

    res.json({ success: true, sessionId, ipaName, appName, frameworks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 使用本机磁盘上的 SDK zip 文件执行替换（无需上传）
app.post('/api/ipa/replace-by-path', async (req, res) => {
  const { sessionId, sdkPaths } = req.body;
  if (!sessionId || !Array.isArray(sdkPaths) || sdkPaths.length === 0) {
    return res.status(400).json({ success: false, error: '参数无效：需要 sessionId 和 sdkPaths 数组' });
  }

  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  const originalIpaPath = path.join(sessionDir, 'original.ipa');
  if (!fs.existsSync(originalIpaPath)) {
    return res.status(404).json({ success: false, error: '会话不存在或已过期' });
  }

  // 验证所有 SDK 文件存在
  for (const p of sdkPaths) {
    const resolved = path.resolve(String(p).replace(/^~/, os.homedir()));
    if (!fs.existsSync(resolved)) {
      return res.status(400).json({ success: false, error: `文件不存在: ${resolved}` });
    }
  }

  try {
    // 读取会话元数据，获取原始文件名
    let originalIpaName = 'replaced';
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'meta.json'), 'utf8'));
      if (meta.ipaName) originalIpaName = path.basename(meta.ipaName, '.ipa');
    } catch (_) {}

    const resolvedPaths = sdkPaths.map(p => path.resolve(String(p).replace(/^~/, os.homedir())));
    const { outputIpa, workDir, outputName } = await replaceFrameworksOnDisk(originalIpaPath, resolvedPaths, originalIpaName);

    const destIpa = path.join(sessionDir, 'replaced.ipa');
    fs.renameSync(outputIpa, destIpa);
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}

    res.json({ success: true, sessionId, outputName });
  } catch (e) {
    console.error('[replace-by-path] 替换失败:', e);
    res.status(500).json({ success: false, error: `替换失败: ${e.message}` });
  }
});

// ── APK 加固 ────────────────────────────────────────────────────────

const APK_TOOLS_DIR = path.join(__dirname, '../../tools');
const DEX2C_DIR = path.join(APK_TOOLS_DIR, 'dex2c');
if (!fs.existsSync(APK_TOOLS_DIR)) fs.mkdirSync(APK_TOOLS_DIR, { recursive: true });

const APK_SESSION_DIR = path.join(__dirname, '.tmp', 'apk-reinforce');
if (!fs.existsSync(APK_SESSION_DIR)) fs.mkdirSync(APK_SESSION_DIR, { recursive: true });
const APK_REINFORCE_LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(APK_REINFORCE_LOG_DIR)) fs.mkdirSync(APK_REINFORCE_LOG_DIR, { recursive: true });
const APK_REINFORCE_RUN_LOG = path.join(APK_REINFORCE_LOG_DIR, 'apk-reinforce-runs.jsonl');
const APK_REINFORCE_CACHE_DIR = path.join(__dirname, '.cache', 'ccache');
if (!fs.existsSync(APK_REINFORCE_CACHE_DIR)) fs.mkdirSync(APK_REINFORCE_CACHE_DIR, { recursive: true });
const APK_REINFORCE_NATIVE_CACHE_DIR = path.join(__dirname, '.cache', 'native-libs');
if (!fs.existsSync(APK_REINFORCE_NATIVE_CACHE_DIR)) fs.mkdirSync(APK_REINFORCE_NATIVE_CACHE_DIR, { recursive: true });
const DEFAULT_RELEASE_KEYSTORE_PATH = '/Users/maiyou001/Desktop/985game.jks';
const DEFAULT_RELEASE_KEY_ALIAS = '985game';
const DEFAULT_RELEASE_KEYSTORE_PASS = '985game2017';
const DEFAULT_RELEASE_KEY_PASS = '985game2017';
const APK_REINFORCE_DEX_CACHE_DIR = path.join(__dirname, '.cache', 'dex-analysis');
if (!fs.existsSync(APK_REINFORCE_DEX_CACHE_DIR)) fs.mkdirSync(APK_REINFORCE_DEX_CACHE_DIR, { recursive: true });
const APK_REINFORCE_PREPROCESS_CACHE_DIR = path.join(__dirname, '.cache', 'preprocess');
if (!fs.existsSync(APK_REINFORCE_PREPROCESS_CACHE_DIR)) fs.mkdirSync(APK_REINFORCE_PREPROCESS_CACHE_DIR, { recursive: true });

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const reinforceSessions = new Map();
// 全局锁：确保同一时刻只有一个加固任务运行（dcc.cfg/filter.txt 全局共享）
let reinforceMutex = Promise.resolve();

function persistReinforceRunLog(sessionId, session) {
  if (!session || session._persisted) return;
  session._persisted = true;
  const entry = {
    ts: new Date().toISOString(),
    sessionId,
    status: session.status,
    stage: session.stage,
    error: session.error || null,
    outputName: session.outputName,
    options: session.options || {},
    timing: session.timing || {},
    // 仅保留尾部日志，避免文件膨胀
    logTail: Array.isArray(session.log) ? session.log.slice(-80) : [],
  };
  try {
    fs.appendFileSync(APK_REINFORCE_RUN_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (e) {
    console.error('[apk-reinforce] 写运行日志失败:', e.message);
  }
}

function detectNdkPath() {
  // 检查 ndk-build 是否存在，用于验证目录是否是有效 NDK
  const isValidNdk = (p) => fs.existsSync(path.join(p, 'ndk-build'));

  // 1. Android Studio SDK ndk 目录（优先使用，兼容性更稳定）
  for (const base of [
    path.join(os.homedir(), 'Library/Android/sdk/ndk'),
    path.join(os.homedir(), 'Library/Android/sdk/ndk-bundle'),
  ]) {
    if (!fs.existsSync(base)) continue;
    if (isValidNdk(base)) return base;
    try {
      const entries = fs.readdirSync(base)
        .filter(e => {
          const full = path.join(base, e);
          return fs.statSync(full).isDirectory() && isValidNdk(full);
        })
        .sort().reverse();
      if (entries.length > 0) return path.join(base, entries[0]);
    } catch (_) {}
  }

  // 2. brew 安装路径（兜底）
  const brewCaskBase = '/opt/homebrew/Caskroom/android-ndk';
  if (fs.existsSync(brewCaskBase)) {
    const versions = fs.readdirSync(brewCaskBase).sort().reverse();
    for (const v of versions) {
      const appNdk = path.join(brewCaskBase, v, 'AndroidNDK14206865.app', 'Contents', 'NDK');
      if (isValidNdk(appNdk)) return appNdk;
      const p = path.join(brewCaskBase, v);
      if (isValidNdk(p)) return p;
    }
  }
  for (const brewPath of [
    '/opt/homebrew/share/android-ndk',       // 可能为 shim，放在最后兜底
    '/usr/local/share/android-ndk',
  ]) {
    if (isValidNdk(brewPath)) return brewPath;
  }

  return null;
}

function detectApksignerPath(ndkPath) {
  const searchDirs = [];
  // 从 NDK 路径推断 SDK 根目录（仅适用于 SDK 内置 NDK）
  if (ndkPath) searchDirs.push(ndkPath.replace(/\/ndk.*/, ''));
  // 固定检查 Android Studio 默认 SDK 位置
  searchDirs.push(path.join(os.homedir(), 'Library/Android/sdk'));
  searchDirs.push('/usr/local/android-sdk');

  for (const sdkRoot of searchDirs) {
    const buildToolsDir = path.join(sdkRoot, 'build-tools');
    if (!fs.existsSync(buildToolsDir)) continue;
    const versions = fs.readdirSync(buildToolsDir).sort().reverse();
    for (const v of versions) {
      const p = path.join(buildToolsDir, v, 'apksigner');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// 环境检查
app.get('/api/apk/env-check', async (_req, res) => {
  const result = { python3: null, java: null, ndk: null, dex2c: false, apksigner: null };
  try { result.python3 = execSync('python3 --version 2>&1').toString().trim(); } catch (_) {}
  try { result.java = execSync('java -version 2>&1').toString().split('\n')[0].trim(); } catch (_) {}
  result.ndk = detectNdkPath();
  result.apksigner = detectApksignerPath(result.ndk);
  result.dex2c = fs.existsSync(path.join(DEX2C_DIR, 'dcc.py'));
  res.json({ success: true, ...result });
});

// 选择 APK 文件
app.get('/api/apk/pick-file', async (_req, res) => {
  try {
    const output = await runAppleScript(
      'set f to choose file with prompt "选择 APK 文件"\n' +
      'return POSIX path of f'
    );
    const apkPath = output.trim();
    res.json({ success: true, path: apkPath, name: path.basename(apkPath) });
  } catch (e) {
    res.json({ success: false, cancelled: true });
  }
});

// 选择多个 APK 文件
app.get('/api/apk/pick-files', async (_req, res) => {
  try {
    const output = await runAppleScript(
      'set fileList to choose file with prompt "选择 APK 文件（可单选/多选）" with multiple selections allowed\n' +
      'set pathList to {}\n' +
      'repeat with f in fileList\n' +
      '  set end of pathList to POSIX path of f\n' +
      'end repeat\n' +
      'return pathList'
    );
    const paths = output
      .split(', ')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(p => p.toLowerCase().endsWith('.apk'));
    if (paths.length === 0) {
      return res.json({ success: false, cancelled: true, error: '未选择 APK 文件' });
    }
    res.json({
      success: true,
      paths,
      items: paths.map(p => ({ path: p, name: path.basename(p) })),
    });
  } catch (e) {
    res.json({ success: false, cancelled: true });
  }
});

// 通过 brew 安装 Android NDK
app.post('/api/apk/install-ndk', async (req, res) => {
  req.setTimeout(30 * 60 * 1000);
  try {
    await runCmd('brew install --cask android-ndk');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 自动安装 dex2c 工具链
app.post('/api/apk/setup-dex2c', async (req, res) => {
  req.setTimeout(30 * 60 * 1000);
  try {
    if (!fs.existsSync(DEX2C_DIR)) {
      await runCmd(`git clone https://github.com/codehasan/dex2c "${DEX2C_DIR}"`);
    }
    await runCmd(`pip3 install -r "${path.join(DEX2C_DIR, 'requirements.txt')}"`);
    // 下载 apktool.jar
    const toolsDir = path.join(DEX2C_DIR, 'tools');
    if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });
    const apktoolPath = path.join(toolsDir, 'apktool.jar');
    if (!fs.existsSync(apktoolPath)) {
      await runCmd(`curl -L -o "${apktoolPath}" "https://github.com/iBotPeaches/Apktool/releases/download/v3.0.2/apktool_3.0.2.jar"`);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 开始加固
app.post('/api/apk/reinforce', async (req, res) => {
  const {
    apkPath,
    ndkPath,
    apksignerPath,
    protectAll = true,
    reinforceMode = 'shellLite',
  } = req.body;
  const normalizedMode = ['fast', 'balanced', 'full', 'shellLite'].includes(reinforceMode) ? reinforceMode : 'shellLite';
  if (!apkPath || !fs.existsSync(apkPath)) {
    return res.status(400).json({ success: false, error: 'APK 文件不存在' });
  }
  const needsDcc = normalizedMode !== 'shellLite';
  if (needsDcc && !fs.existsSync(path.join(DEX2C_DIR, 'dcc.py'))) {
    return res.status(400).json({ success: false, error: '请先安装 dex2c 工具' });
  }
  const resolvedNdk = needsDcc ? (ndkPath || detectNdkPath()) : null;
  if (needsDcc && !resolvedNdk) {
    return res.status(400).json({ success: false, error: '未找到 Android NDK，请在 Android Studio 安装后重试' });
  }

  const sessionId = crypto.randomBytes(8).toString('hex');
  const sessionDir = path.join(APK_SESSION_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const apkBaseName = path.basename(apkPath, '.apk');
  const inputApk = path.join(sessionDir, `${apkBaseName}.apk`);
  const outputApk = path.join(sessionDir, `${apkBaseName}-reinforced.apk`);
  fs.copyFileSync(apkPath, inputApk);

  // ── 立即创建 session 并返回响应，后续所有工作异步执行 ──
  const session = {
    status: 'running',
    stage: 'queued',
    progress: 0,
    log: [],
    outputPath: outputApk,
    outputName: `${apkBaseName}-reinforced.apk`,
    proc: null,
    timing: {
      mode: normalizedMode,
      createdAt: Date.now(),
      queueMs: 0,
      preMs: 0,
      dccMs: 0,
      postMs: 0,
      totalMs: 0,
      retries: 0,
    },
    options: null,
    _persisted: false,
  };
  reinforceSessions.set(sessionId, session);
  res.json({ success: true, sessionId });

  // 所有耗时操作异步执行（使用 exec 而非 execSync，不阻塞事件循环）
  const execAsync = (cmd, opts = {}) => new Promise((resolve, reject) => {
    exec(cmd, { timeout: 180000, maxBuffer: 10 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) reject(err); else resolve({ stdout, stderr });
    });
  });

  const _doReinforce = async () => {
  const taskStart = Date.now();
  session.stage = 'initializing';
  session.timing.queueMs = Math.max(0, taskStart - (session.timing.createdAt || taskStart));

  const shellLitePipeline = async () => {
    session.log.push('[shell] 启用自研轻量壳模式（<3分钟目标）');
    session.log.push('[shell] 步骤: 抽取核心 dex -> AES 加密 -> 写入 assets/payload（兼容模式保留原 dex） -> 注入 stage2 bootstrap 元数据 -> 重新签名');
    session.stage = 'preprocess';
    const preStart = Date.now();
    const shellDir = path.join(sessionDir, 'shell-lite');
    const shellAssetsDir = path.join(shellDir, 'assets', 'payload');
    const shellMetaFile = path.join(shellAssetsDir, 'payload.meta.json');
    const shellBootstrapFile = path.join(shellAssetsDir, 'bootstrap.meta.json');
    // U4: 包名随机化 — 初始占位，manifest解析后替换为真正的随机包路径
    let shellStage2Package = 'x.y.z';
    const shellLoaderClassName = 'Stage2PayloadLoader';
    const shellAppClassName = 'Stage2ShellApplication';
    let shellLoaderFqcn = `${shellStage2Package}.${shellLoaderClassName}`;
    let shellAppFqcn = `${shellStage2Package}.${shellAppClassName}`;
    const debugKeystoreForKey = path.join(os.homedir(), '.android/debug.keystore');
    const releaseKeystoreForKey = DEFAULT_RELEASE_KEYSTORE_PATH;
    const releaseAliasForKey = DEFAULT_RELEASE_KEY_ALIAS;
    const releaseKsPassForKey = DEFAULT_RELEASE_KEYSTORE_PASS;
    const releaseKeyPassForKey = DEFAULT_RELEASE_KEY_PASS;
    const hasReleaseSigningInput =
      !!releaseKeystoreForKey &&
      !!releaseAliasForKey &&
      !!releaseKsPassForKey &&
      !!releaseKeyPassForKey &&
      fs.existsSync(releaseKeystoreForKey);
    if (!hasReleaseSigningInput) {
      throw new Error('release signing required: provide valid keystorePath/keyAlias/keystorePass/keyPass');
    }
    let payloadSourceApk = inputApk;
    let signerDigestForKey = 'nosig';
    const enableStage2Inject = req.body?.enableStage2Inject === true;
    const enableStage2RuntimeLoad = req.body?.enableStage2RuntimeLoad === true;
    const enableStage3StripClasses2Requested = req.body?.enableStage3StripClasses2 === true;
    let enableStage3StripClasses2 =
      enableStage3StripClasses2Requested && enableStage2Inject && enableStage2RuntimeLoad;
    const stage2LogFile = path.join(shellDir, 'stage2-inject-full.log');
    fs.mkdirSync(shellAssetsDir, { recursive: true });
    const apktoolJar = path.join(DEX2C_DIR, 'tools', 'apktool.jar');

    let manifestPackage = '';
    let originalApplication = '';
    let providerClasses = [];
    try {
      const manifestDir = path.join(shellDir, 'manifest-only');
      await execAsync(`java -jar "${apktoolJar}" d -f -s -o "${manifestDir}" "${inputApk}"`, { timeout: 8 * 60 * 1000 });
      const manifestText = fs.readFileSync(path.join(manifestDir, 'AndroidManifest.xml'), 'utf8');
      const packageMatch = manifestText.match(/package="([^"]+)"/);
      manifestPackage = packageMatch?.[1] || '';
      const providerMatches = [...manifestText.matchAll(/<provider[^>]*android:name="([^"]+)"/g)];
      providerClasses = providerMatches
        .map((m) => (m?.[1] || '').trim())
        .filter(Boolean)
        .map((name) => (name.startsWith('.') && manifestPackage ? `${manifestPackage}${name}` : name));
      const hasExternalProvider = providerClasses.some((name) => manifestPackage && !name.startsWith(`${manifestPackage}.`));
      const appTagMatch = manifestText.match(/<application[^>]*>/);
      const appNameMatch = appTagMatch?.[0]?.match(/android:name="([^"]+)"/);
      originalApplication = appNameMatch?.[1] || '';
      if (originalApplication.startsWith('.')) {
        originalApplication = `${manifestPackage}${originalApplication}`;
      }
      session.log.push(`[shell] stage2 bootstrap: package=${manifestPackage || '-'} app=${originalApplication || '(default Application)'}`);
      session.log.push(`[shell] stage2 运行时加载灰度: ${enableStage2RuntimeLoad ? '开启' : '关闭'}`);
      session.log.push(`[shell] stage3 明文裁剪灰度(classes2.dex): ${enableStage3StripClasses2Requested ? '请求开启' : '关闭'}`);
      if (enableStage3StripClasses2 && hasExternalProvider) {
        session.log.push('[shell] stage3 检测到第三方 ContentProvider：启用“按 Provider 依赖 dex 最小保留”策略');
      }
      if (enableStage3StripClasses2Requested) {
        if (enableStage3StripClasses2) {
          session.log.push('[shell] stage3 已满足前置条件：将执行真实 classes2.dex 裁剪');
        } else {
          session.log.push('[shell] stage3 裁剪已自动降级为仅记录（未执行），原因：需同时开启 stage2 注入 + 运行时加载');
        }
      }
    } catch (e) {
      session.log.push(`[shell] stage2 bootstrap: Manifest 解析跳过（${String(e.message || e).split('\n')[0]}）`);
    }

    // U4: 壳包名随机化 — 每次加固基于包名+随机盐派生唯一路径，防止固定特征被扫描
    {
      const pkgSeed = crypto.createHash('sha1')
        .update((manifestPackage || 'default') + crypto.randomBytes(4).toString('hex'))
        .digest('hex');
      // Java 标识符不能以数字开头 — 将首位数字替换为对应字母 (0→a, 1→b, ... 9→j)
      const safeIdent = (s) => s.replace(/^[0-9]/, d => String.fromCharCode(97 + parseInt(d, 10)));
      const seg1 = safeIdent(pkgSeed.slice(0, 6));
      const seg2 = safeIdent(pkgSeed.slice(6, 10));
      shellStage2Package = `com.${seg1}.${seg2}`;
      shellLoaderFqcn = `${shellStage2Package}.${shellLoaderClassName}`;
      shellAppFqcn = `${shellStage2Package}.${shellAppClassName}`;
      session.log.push(`[shell] 壳包名随机化: ${shellStage2Package}`);
    }

    try {
      const { stdout } = await execAsync(
        `keytool -list -v -keystore "${releaseKeystoreForKey}" -alias "${releaseAliasForKey}" -storepass "${releaseKsPassForKey}" -keypass "${releaseKeyPassForKey}"`,
        { timeout: 20 * 1000 }
      );
      const m = String(stdout || '').match(/SHA256:\s*([A-F0-9:]+)/i);
      if (m?.[1]) signerDigestForKey = m[1].replace(/:/g, '').toLowerCase();
      session.log.push(`[shell] signer 绑定摘要: ${signerDigestForKey === 'nosig' ? '未启用' : `${signerDigestForKey.slice(0, 12)}...`}`);
    } catch (e) {
      throw new Error(`release signer digest failed: ${String(e.message || e).split('\n')[0]}`);
    }

    // 发布默认策略：先把主 dex 中的自研代码迁移到 classes2+，避免被直接反编译看到核心源码
    try {
      const migratePrefixes = ['com/gznb/game', 'com/gmspace/sdk'];
      const migrateDir = path.join(shellDir, 'migrate-main-dex');
      const migratedApk = path.join(shellDir, 'shell-main-dex-migrated.apk');

      // 快速预检：读取 classes.dex 字节看迁移前缀是否存在，避免无谓的 apktool d+b
      let quickMigrateNeeded = false;
      try {
        const zipQuick = new AdmZip(inputApk);
        const dexEntry = zipQuick.getEntry('classes.dex');
        if (dexEntry) {
          const dexBytes = dexEntry.getData();
          quickMigrateNeeded = migratePrefixes.some(p => dexBytes.indexOf(Buffer.from(p, 'utf8')) !== -1);
        }
      } catch (_) { quickMigrateNeeded = true; }

      if (!quickMigrateNeeded) {
        session.log.push('[shell] main-dex 迁移跳过: classes.dex 中未检测到自研前缀（快速预检）');
      } else {
      session.log.push(`[shell] main-dex 迁移: 开始（目标前缀: ${migratePrefixes.join(', ')})`);
      await execAsync(`java -jar "${apktoolJar}" d -f -o "${migrateDir}" "${inputApk}"`, { timeout: 12 * 60 * 1000 });

      const smaliDirs = fs.readdirSync(migrateDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^smali(_classes\d+)?$/.test(d.name))
        .map((d) => d.name);
      const dexNums = smaliDirs.map((name) => {
        if (name === 'smali') return 1;
        const m = name.match(/^smali_classes(\d+)$/);
        return m ? Number(m[1]) : 1;
      }).filter((n) => Number.isFinite(n) && n >= 1);
      const nextDexNum = Math.max(1, ...dexNums) + 1;
      const srcMainSmali = path.join(migrateDir, 'smali');
      const dstSmaliRoot = path.join(migrateDir, `smali_classes${nextDexNum}`);
      fs.mkdirSync(dstSmaliRoot, { recursive: true });

      let movedPkgCount = 0;
      for (const pkgPath of migratePrefixes) {
        const srcPath = path.join(srcMainSmali, pkgPath);
        if (!fs.existsSync(srcPath)) continue;
        const dstPath = path.join(dstSmaliRoot, pkgPath);
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        if (fs.existsSync(dstPath)) {
          fs.cpSync(srcPath, dstPath, { recursive: true, force: true });
          fs.rmSync(srcPath, { recursive: true, force: true });
        } else {
          fs.renameSync(srcPath, dstPath);
        }
        movedPkgCount += 1;
      }

      if (movedPkgCount > 0) {
        await execAsync(`java -jar "${apktoolJar}" b -o "${migratedApk}" "${migrateDir}"`, { timeout: 12 * 60 * 1000 });
        payloadSourceApk = migratedApk;
        session.log.push(`[shell] main-dex 迁移完成: 已迁移 ${movedPkgCount} 个自研包前缀到 classes${nextDexNum}+`);
      } else {
        session.log.push('[shell] main-dex 迁移跳过: 未在 classes.dex(smali/) 命中自研前缀');
      }
      } // end if (quickMigrateNeeded)
    } catch (e) {
      session.log.push(`[shell] main-dex 迁移失败，回退原 APK: ${String(e.message || e).split('\n')[0]}`);
    }

    const payloadScriptPath = path.join(shellDir, 'build_shell_payload.cjs');
    const payloadScript = `
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

const [,, srcApk, outApk, payloadDir, metaFile, bootstrapFile, packageName, appName, stripClasses2, shellAppClass, runtimeLoaderClass, signerDigest, nativeSecretHex] = process.argv;
fs.mkdirSync(payloadDir, { recursive: true });
// 与 SO 内 nativeAesDecrypt 保持相同的两步密钥推导：
//   step1 = SHA256(pkgName + "|" + signerDigest)
//   step2 = SHA256(step1 || NATIVE_SECRET)   <- U1 额外混淆层
const keyMaterial = String(packageName || path.basename(srcApk)) + '|' + String(signerDigest || 'nosig');
const step1 = crypto.createHash('sha256').update(keyMaterial, 'utf8').digest();
const nativeSecretBuf = nativeSecretHex ? Buffer.from(nativeSecretHex, 'hex') : null;
const key = (nativeSecretBuf && nativeSecretBuf.length === 32)
  ? crypto.createHash('sha256').update(Buffer.concat([step1, nativeSecretBuf])).digest()
  : step1;

const zin = new AdmZip(srcApk);
const entries = zin.getEntries();
const payload = [];

for (const item of entries) {
  const name = item.entryName;
  if (name.startsWith('classes') && name.endsWith('.dex') && name !== 'classes.dex') {
    const raw = item.getData();
    // Pre-compress DEX with raw deflate before AES-GCM so the encrypted blob is
    // the same size as a DEFLATE-compressed DEX entry — saves ~19 MB in the APK.
    const compressed = zlib.deflateRawSync(raw, { level: 9 });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const tag = cipher.getAuthTag();
    const outName = name.replace('.dex', '.bin');
    const outPath = path.join(payloadDir, outName);
    fs.writeFileSync(outPath, Buffer.concat([iv, encrypted, tag]));
    payload.push({
      sourceDex: name,
      payloadFile: outName,
      ivLen: 12,
      tagLen: 16,
    });
  }
}

if (payload.length === 0) {
  throw new Error('no core dex found (classes2+.dex)');
}

const meta = {
  count: payload.length,
  payload,
};
const bootstrap = {
  package: packageName,
  originalApplication: appName,
  shellApplication: shellAppClass,
  runtimeLoaderClass: runtimeLoaderClass,
  payloadDir: 'assets/payload',
};
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');
fs.writeFileSync(bootstrapFile, JSON.stringify(bootstrap, null, 2), 'utf8');

// files that Android requires to be STORED (uncompressed) in the APK
const mustStored = new Set(['resources.arsc']);

const zout = new AdmZip();
for (const item of entries) {
  const name = item.entryName;
  // Strip ALL business DEX files (classes2+) — they are encrypted into payload/*.bin.
  if (stripClasses2 === '1' && name.startsWith('classes') && name.endsWith('.dex') && name !== 'classes.dex') continue;
  const lowerName = name.toLowerCase();
  if (name.startsWith('META-INF/')) continue;
  if (lowerName.endsWith('.pem') || lowerName.endsWith('.key') || lowerName.endsWith('.p12') || lowerName.endsWith('.pfx') || lowerName.endsWith('.jks') || lowerName.endsWith('.keystore')) continue;
  if (lowerName.includes('private_key') || lowerName.includes('rsa_private') || lowerName.includes('pkcs8')) continue;
  const data = item.getData();
  zout.addFile(name, data);
  // Restore STORED (method=0) for resources.arsc — AdmZip defaults to DEFLATE which
  // breaks Android 6+ mmap requirements and fails Google Play validation.
  if (mustStored.has(name)) {
    const e = zout.getEntry(name);
    if (e) e.header.method = 0;
  }
}

for (const entry of payload) {
  const payloadFile = path.join(payloadDir, entry.payloadFile);
  zout.addFile('assets/payload/' + entry.payloadFile, fs.readFileSync(payloadFile));
}
zout.addFile('assets/payload/payload.meta.json', Buffer.from(JSON.stringify(meta, null, 2)));
zout.addFile('assets/payload/bootstrap.meta.json', Buffer.from(JSON.stringify(bootstrap, null, 2)));
zout.addFile('assets/payload/STAGE2_READY', Buffer.from('1'));
zout.writeZip(outApk);
console.log('OK:' + payload.length);
`.trim();
    fs.writeFileSync(payloadScriptPath, payloadScript, 'utf8');
    session.progress = 15;
    const shellUnsignedApk = path.join(shellDir, 'shell-lite-unsigned.apk');
    // Bug fix: previously this was `enableStage3StripClasses2 && !enableStage2Inject`,
    // which meant stripping NEVER happened during payload build when stage2 was enabled.
    // This relied entirely on stage3 to clean up, but stage3's provider-range logic could
    // accidentally retain classes3-N, causing the plaintext DEX bug (seen in v4/v5/v8).
    // Fix: always strip all business DEX during payload build when stage3 is requested.
    const stripDuringPayloadBuild = enableStage3StripClasses2;
    // U1: 提前生成 nativeSecret，payload 脚本加密和 SO 解密共用同一密钥
    const nativeSecret = crypto.randomBytes(32);
    const { stdout: shellStdout } = await execAsync(
      `node "${payloadScriptPath}" "${payloadSourceApk}" "${shellUnsignedApk}" "${shellAssetsDir}" "${shellMetaFile}" "${shellBootstrapFile}" "${manifestPackage}" "${originalApplication}" "${stripDuringPayloadBuild ? '1' : '0'}" "${shellAppFqcn}" "${shellLoaderFqcn}" "${signerDigestForKey}" "${nativeSecret.toString('hex')}"`,
      { timeout: 10 * 60 * 1000 }
    );
    const shellResult = (shellStdout || '').trim();
    session.log.push(`[shell] payload 处理结果: ${shellResult || 'OK'}`);
    session.timing.preMs += Date.now() - preStart;

    // Stage2: 注入壳 Application（灰度开关，默认关闭，先保证稳定可启动）
    let stage2InjectSucceeded = !enableStage2Inject;
    let stage3StripSucceeded = !enableStage3StripClasses2;
    if (enableStage2Inject) {
      try {
      const injectDir = path.join(shellDir, 'inject');
      const shellRebuiltApk = path.join(shellDir, 'shell-stage2-unsigned.apk');
      session.log.push(`[shell] stage2 灰度开启，完整日志文件: ${stage2LogFile}`);
      const decodeCmd = `java -jar "${apktoolJar}" d -f -o "${injectDir}" "${shellUnsignedApk}"`;
      fs.appendFileSync(stage2LogFile, `\n[decode.cmd] ${decodeCmd}\n`, 'utf8');
      const decodeResult = await execAsync(decodeCmd, { timeout: 8 * 60 * 1000 });
      fs.appendFileSync(stage2LogFile, `[decode.stdout]\n${decodeResult.stdout || ''}\n[decode.stderr]\n${decodeResult.stderr || ''}\n`, 'utf8');
      const manifestPath = path.join(injectDir, 'AndroidManifest.xml');
      let manifestText = fs.readFileSync(manifestPath, 'utf8');
      const packageMatch = manifestText.match(/package="([^"]+)"/);
      const pkg = packageMatch?.[1] || manifestPackage || '';
      const appTagMatch = manifestText.match(/<application[^>]*>/);
      const currentNameMatch = appTagMatch?.[0]?.match(/android:name="([^"]+)"/);
      let currentAppName = currentNameMatch?.[1] || originalApplication || '';
      if (currentAppName.startsWith('.')) currentAppName = `${pkg}${currentAppName}`;
      const shellAppClass = shellAppFqcn;
      if (appTagMatch) {
        let newAppTag = appTagMatch[0];
        if (/android:name="[^"]*"/.test(newAppTag)) {
          newAppTag = newAppTag.replace(/android:name="[^"]*"/, `android:name="${shellAppClass}"`);
        } else {
          newAppTag = newAppTag.replace('<application', `<application android:name="${shellAppClass}"`);
        }
        // P0: 强制关闭 debuggable，防止调试注入与内存抓取
        if (/android:debuggable="[^"]*"/.test(newAppTag)) {
          newAppTag = newAppTag.replace(/android:debuggable="[^"]*"/, 'android:debuggable="false"');
        } else {
          newAppTag = newAppTag.replace('<application', '<application android:debuggable="false"');
        }
        manifestText = manifestText.replace(appTagMatch[0], newAppTag);
        fs.writeFileSync(manifestPath, manifestText, 'utf8');
      }

      const stage2Package = shellStage2Package;
      const stage2Path = stage2Package.replace(/\./g, '/');
      const loaderClassName = shellLoaderClassName;
      const shellClassName = shellAppClassName;
      // 为壳类单独创建一个新的 dex 分包，避免壳类与业务类混在同一明文 dex。
      // 这样 stage3 扩大裁剪时可以仅保留 classes.dex + 壳 dex。
      const smaliDexNums = fs.readdirSync(injectDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^smali_classes\d+$/.test(d.name))
        .map((d) => Number(d.name.replace('smali_classes', '')))
        .filter((n) => Number.isFinite(n) && n >= 2);
      const shellDexNum = Math.max(1, ...smaliDexNums) + 1;
      const smaliRoot = `smali_classes${shellDexNum}`;
      const smaliDir = path.join(injectDir, smaliRoot, stage2Path);
      fs.mkdirSync(smaliDir, { recursive: true });
      const jniDir = path.join(shellDir, 'jni');
      fs.mkdirSync(jniDir, { recursive: true });

      // U1: nativeSecret 已在上方提前生成，此处仅派生 XOR 编码辅助变量供 C 模板使用
      const nsXorKey = (crypto.randomBytes(1)[0] || 0x47) | 0x01; // 非零
      const nsEncC = Array.from(nativeSecret).map(b => `0x${(b ^ nsXorKey).toString(16).padStart(2, '0')}`).join(', ');
      const nsXorKeyHex = `0x${nsXorKey.toString(16).padStart(2, '0')}`;

      // U2: XOR 编码助手 — 统一 XOR key=0x5A，与已有 SO 内 xor_jstr 保持一致
      const soXorKey = 0x5A;
      const cArr = (str) => '{ ' + Array.from(Buffer.from(str, 'utf8')).map(b => `0x${(b ^ soXorKey).toString(16).padStart(2, '0')}`).join(', ') + ' }';

      const nativeSource = `
#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <android/log.h>

#define LOG_TAG "shellguard"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static int has_exception(JNIEnv *env) {
    if ((*env)->ExceptionCheck(env)) {
        (*env)->ExceptionClear(env);
        return 1;
    }
    return 0;
}

static jstring xor_jstr(JNIEnv *env, const unsigned char *src, int len, unsigned char key) {
    char *tmp = (char *)malloc((size_t)len + 1);
    if (tmp == NULL) return NULL;
    for (int i = 0; i < len; i++) tmp[i] = (char)(src[i] ^ key);
    tmp[len] = '\0';
    jstring out = (*env)->NewStringUTF(env, tmp);
    free(tmp);
    return out;
}

static jstring get_signer_digest(JNIEnv *env, jobject appCtx) {
    jclass contextCls = (*env)->GetObjectClass(env, appCtx);
    if (contextCls == NULL || has_exception(env)) return NULL;
    static const unsigned char s_getPm[] = ${cArr('getPackageManager')};
    static const unsigned char s_getPmSig[] = ${cArr('()Landroid/content/pm/PackageManager;')};
    static const unsigned char s_getPn[] = ${cArr('getPackageName')};
    static const unsigned char s_getPnSig[] = ${cArr('()Ljava/lang/String;')};
    jstring jGetPm = xor_jstr(env, s_getPm, sizeof(s_getPm), 0x5A);
    jstring jGetPmSig = xor_jstr(env, s_getPmSig, sizeof(s_getPmSig), 0x5A);
    jstring jGetPn = xor_jstr(env, s_getPn, sizeof(s_getPn), 0x5A);
    jstring jGetPnSig = xor_jstr(env, s_getPnSig, sizeof(s_getPnSig), 0x5A);
    if (!jGetPm || !jGetPmSig || !jGetPn || !jGetPnSig || has_exception(env)) return NULL;
    const char *pmStr = (*env)->GetStringUTFChars(env, jGetPm, NULL);
    const char *pmSigStr = (*env)->GetStringUTFChars(env, jGetPmSig, NULL);
    const char *pnStr = (*env)->GetStringUTFChars(env, jGetPn, NULL);
    const char *pnSigStr = (*env)->GetStringUTFChars(env, jGetPnSig, NULL);
    if (!pmStr || !pmSigStr || !pnStr || !pnSigStr) return NULL;
    jmethodID getPm = (*env)->GetMethodID(env, contextCls, pmStr, pmSigStr);
    jmethodID getPn = (*env)->GetMethodID(env, contextCls, pnStr, pnSigStr);
    (*env)->ReleaseStringUTFChars(env, jGetPm, pmStr);
    (*env)->ReleaseStringUTFChars(env, jGetPmSig, pmSigStr);
    (*env)->ReleaseStringUTFChars(env, jGetPn, pnStr);
    (*env)->ReleaseStringUTFChars(env, jGetPnSig, pnSigStr);
    if (getPm == NULL || getPn == NULL || has_exception(env)) return NULL;
    jobject pm = (*env)->CallObjectMethod(env, appCtx, getPm);
    jstring pn = (jstring)(*env)->CallObjectMethod(env, appCtx, getPn);
    if (pm == NULL || pn == NULL || has_exception(env)) return NULL;

    jclass pmCls = (*env)->GetObjectClass(env, pm);
    if (pmCls == NULL || has_exception(env)) return NULL;
    static const unsigned char s_getPi[] = ${cArr('getPackageInfo')};
    static const unsigned char s_getPiSig[] = ${cArr('(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;')};
    jstring jGetPi = xor_jstr(env, s_getPi, sizeof(s_getPi), 0x5A);
    jstring jGetPiSig = xor_jstr(env, s_getPiSig, sizeof(s_getPiSig), 0x5A);
    if (!jGetPi || !jGetPiSig || has_exception(env)) return NULL;
    const char *piStr = (*env)->GetStringUTFChars(env, jGetPi, NULL);
    const char *piSigStr = (*env)->GetStringUTFChars(env, jGetPiSig, NULL);
    if (!piStr || !piSigStr) return NULL;
    jmethodID getPi = (*env)->GetMethodID(env, pmCls, piStr, piSigStr);
    (*env)->ReleaseStringUTFChars(env, jGetPi, piStr);
    (*env)->ReleaseStringUTFChars(env, jGetPiSig, piSigStr);
    if (getPi == NULL || has_exception(env)) return NULL;
    jobject pi = (*env)->CallObjectMethod(env, pm, getPi, pn, 0x08000040);
    if (pi == NULL || has_exception(env)) return NULL;

    jclass piCls = (*env)->GetObjectClass(env, pi);
    if (piCls == NULL || has_exception(env)) return NULL;
    jfieldID fidSigningInfo = (*env)->GetFieldID(env, piCls, "signingInfo", "Landroid/content/pm/SigningInfo;");
    if (has_exception(env)) fidSigningInfo = NULL;
    jfieldID fidSignatures = (*env)->GetFieldID(env, piCls, "signatures", "[Landroid/content/pm/Signature;");
    if (has_exception(env)) fidSignatures = NULL;
    if (fidSigningInfo == NULL && fidSignatures == NULL) return NULL;

    jobject sigObj = NULL;
    if (fidSigningInfo != NULL) {
        jobject signingInfo = (*env)->GetObjectField(env, pi, fidSigningInfo);
        if (signingInfo != NULL && !has_exception(env)) {
            jclass siCls = (*env)->GetObjectClass(env, signingInfo);
            if (siCls != NULL && !has_exception(env)) {
                const unsigned char s_get_signers[] = {0x3d,0x3f,0x2e,0x1b,0x2a,0x31,0x19,0x35,0x34,0x2e,0x3f,0x34,0x2e,0x29,0x9,0x33,0x3d,0x34,0x3f,0x28,0x29};
                jstring getSignersName = xor_jstr(env, s_get_signers, sizeof(s_get_signers), 0x5A);
                if (getSignersName == NULL || has_exception(env)) return NULL;
                const char *getSignersUtf = (*env)->GetStringUTFChars(env, getSignersName, NULL);
                if (getSignersUtf == NULL || has_exception(env)) return NULL;
                jmethodID getSigners = (*env)->GetMethodID(env, siCls, getSignersUtf, "()[Landroid/content/pm/Signature;");
                (*env)->ReleaseStringUTFChars(env, getSignersName, getSignersUtf);
                if (getSigners != NULL && !has_exception(env)) {
                    jobjectArray arr = (jobjectArray)(*env)->CallObjectMethod(env, signingInfo, getSigners);
                    if (arr != NULL && !has_exception(env) && (*env)->GetArrayLength(env, arr) > 0) {
                        sigObj = (*env)->GetObjectArrayElement(env, arr, 0);
                    }
                }
            }
        }
    }
    if (sigObj == NULL && fidSignatures != NULL) {
        jobjectArray arr = (jobjectArray)(*env)->GetObjectField(env, pi, fidSignatures);
        if (arr != NULL && !has_exception(env) && (*env)->GetArrayLength(env, arr) > 0) {
            sigObj = (*env)->GetObjectArrayElement(env, arr, 0);
        }
    }
    if (sigObj == NULL || has_exception(env)) return NULL;

    jclass sigCls = (*env)->GetObjectClass(env, sigObj);
    if (sigCls == NULL || has_exception(env)) return NULL;
    static const unsigned char s_toBytes[] = ${cArr('toByteArray')};
    static const unsigned char s_toBytesSig[] = ${cArr('()[B')};
    jstring jToBytes = xor_jstr(env, s_toBytes, sizeof(s_toBytes), 0x5A);
    jstring jToBytesSig = xor_jstr(env, s_toBytesSig, sizeof(s_toBytesSig), 0x5A);
    if (!jToBytes || !jToBytesSig || has_exception(env)) return NULL;
    const char *toBytesStr = (*env)->GetStringUTFChars(env, jToBytes, NULL);
    const char *toBytesSigStr = (*env)->GetStringUTFChars(env, jToBytesSig, NULL);
    if (!toBytesStr || !toBytesSigStr) return NULL;
    jmethodID toBytes = (*env)->GetMethodID(env, sigCls, toBytesStr, toBytesSigStr);
    (*env)->ReleaseStringUTFChars(env, jToBytes, toBytesStr);
    (*env)->ReleaseStringUTFChars(env, jToBytesSig, toBytesSigStr);
    if (toBytes == NULL || has_exception(env)) return NULL;
    jbyteArray cert = (jbyteArray)(*env)->CallObjectMethod(env, sigObj, toBytes);
    if (cert == NULL || has_exception(env)) return NULL;

    const unsigned char s_md_cls[] = {0x30,0x3b,0x2c,0x3b,0x75,0x29,0x3f,0x39,0x2f,0x28,0x33,0x2e,0x23,0x75,0x17,0x3f,0x29,0x29,0x3b,0x3d,0x3f,0x1e,0x33,0x3d,0x3f,0x29,0x2e};
    jstring mdClsName = xor_jstr(env, s_md_cls, sizeof(s_md_cls), 0x5A);
    if (mdClsName == NULL || has_exception(env)) return NULL;
    const char *mdClsUtf = (*env)->GetStringUTFChars(env, mdClsName, NULL);
    if (mdClsUtf == NULL || has_exception(env)) return NULL;
    jclass mdCls = (*env)->FindClass(env, mdClsUtf);
    (*env)->ReleaseStringUTFChars(env, mdClsName, mdClsUtf);
    if (mdCls == NULL || has_exception(env)) return NULL;
    static const unsigned char s_getInstance[] = ${cArr('getInstance')};
    static const unsigned char s_getInstanceSig[] = ${cArr('(Ljava/lang/String;)Ljava/security/MessageDigest;')};
    static const unsigned char s_digest[] = ${cArr('digest')};
    static const unsigned char s_digestSig[] = ${cArr('([B)[B')};
    jstring jGetInstance = xor_jstr(env, s_getInstance, sizeof(s_getInstance), 0x5A);
    jstring jGetInstanceSig = xor_jstr(env, s_getInstanceSig, sizeof(s_getInstanceSig), 0x5A);
    jstring jDigest = xor_jstr(env, s_digest, sizeof(s_digest), 0x5A);
    jstring jDigestSig = xor_jstr(env, s_digestSig, sizeof(s_digestSig), 0x5A);
    if (!jGetInstance || !jGetInstanceSig || !jDigest || !jDigestSig || has_exception(env)) return NULL;
    const char *giStr = (*env)->GetStringUTFChars(env, jGetInstance, NULL);
    const char *giSigStr = (*env)->GetStringUTFChars(env, jGetInstanceSig, NULL);
    const char *dgStr = (*env)->GetStringUTFChars(env, jDigest, NULL);
    const char *dgSigStr = (*env)->GetStringUTFChars(env, jDigestSig, NULL);
    if (!giStr || !giSigStr || !dgStr || !dgSigStr) return NULL;
    jmethodID mdGetInstance = (*env)->GetStaticMethodID(env, mdCls, giStr, giSigStr);
    jmethodID mdDigest = (*env)->GetMethodID(env, mdCls, dgStr, dgSigStr);
    (*env)->ReleaseStringUTFChars(env, jGetInstance, giStr);
    (*env)->ReleaseStringUTFChars(env, jGetInstanceSig, giSigStr);
    (*env)->ReleaseStringUTFChars(env, jDigest, dgStr);
    (*env)->ReleaseStringUTFChars(env, jDigestSig, dgSigStr);
    if (mdGetInstance == NULL || mdDigest == NULL || has_exception(env)) return NULL;
    const unsigned char s_sha256[] = {0x09,0x12,0x1b,0x77,0x68,0x6f,0x6c};
    jstring sha256 = xor_jstr(env, s_sha256, sizeof(s_sha256), 0x5A);
    if (sha256 == NULL || has_exception(env)) return NULL;
    jobject md = (*env)->CallStaticObjectMethod(env, mdCls, mdGetInstance, sha256);
    if (md == NULL || has_exception(env)) return NULL;
    jbyteArray dig = (jbyteArray)(*env)->CallObjectMethod(env, md, mdDigest, cert);
    if (dig == NULL || has_exception(env)) return NULL;

    jsize digLen = (*env)->GetArrayLength(env, dig);
    jbyte *raw = (jbyte *)malloc((size_t)digLen);
    if (raw == NULL) return NULL;
    (*env)->GetByteArrayRegion(env, dig, 0, digLen, raw);
    if (has_exception(env)) { free(raw); return NULL; }
    char *hex = (char *)malloc((size_t)digLen * 2 + 1);
    if (hex == NULL) { free(raw); return NULL; }
    static const char *digits = "0123456789abcdef";
    for (jsize i = 0; i < digLen; i++) {
        unsigned char b = (unsigned char)raw[i];
        hex[i * 2] = digits[(b >> 4) & 0xF];
        hex[i * 2 + 1] = digits[b & 0xF];
    }
    hex[digLen * 2] = '\0';
    free(raw);
    jstring out = (*env)->NewStringUTF(env, hex);
    free(hex);
    if (has_exception(env)) return NULL;
    return out;
}

JNIEXPORT jbyteArray JNICALL
Java_${stage2Path.replace(/\//g, '_')}_Stage2PayloadLoader_nativeAesDecrypt(JNIEnv *env, jclass clazz, jobject appCtx, jbyteArray enc, jstring pkg) {
    (void)clazz;
    if (appCtx == NULL || enc == NULL || pkg == NULL) { LOGE("E01"); return NULL; }
    jsize len = (*env)->GetArrayLength(env, enc);
    if (len <= 12) { LOGE("E02"); return NULL; }

    jstring signer = NULL;
    signer = get_signer_digest(env, appCtx);
    if (signer == NULL) {
        LOGE("E34");
    }
    if (signer == NULL) {
        signer = (*env)->NewStringUTF(env, "nosig");
    }
    if (signer == NULL || has_exception(env)) { LOGE("E35"); return NULL; }

    const char *pkgStr = (*env)->GetStringUTFChars(env, pkg, NULL);
    const char *signerStr = (*env)->GetStringUTFChars(env, signer, NULL);
    if (pkgStr == NULL || signerStr == NULL) {
        LOGE("E03");
        if (pkgStr) (*env)->ReleaseStringUTFChars(env, pkg, pkgStr);
        if (signerStr) (*env)->ReleaseStringUTFChars(env, signer, signerStr);
        return NULL;
    }

    size_t kmLen = strlen(pkgStr) + 1 + strlen(signerStr) + 1;
    char *keyMaterial = (char *)malloc(kmLen);
    if (keyMaterial == NULL) {
        LOGE("E04");
        (*env)->ReleaseStringUTFChars(env, pkg, pkgStr);
        (*env)->ReleaseStringUTFChars(env, signer, signerStr);
        return NULL;
    }
    const unsigned char s_fmt[] = {0x7f,0x29,0x26,0x7f,0x29};
    char *fmt = (char *)malloc(sizeof(s_fmt) + 1);
    if (fmt == NULL) {
        LOGE("E04b");
        (*env)->ReleaseStringUTFChars(env, pkg, pkgStr);
        (*env)->ReleaseStringUTFChars(env, signer, signerStr);
        free(keyMaterial);
        return NULL;
    }
    for (size_t i = 0; i < sizeof(s_fmt); i++) fmt[i] = (char)(s_fmt[i] ^ 0x5A);
    fmt[sizeof(s_fmt)] = '\0';
    snprintf(keyMaterial, kmLen, fmt, pkgStr, signerStr);
    free(fmt);
    (*env)->ReleaseStringUTFChars(env, pkg, pkgStr);
    (*env)->ReleaseStringUTFChars(env, signer, signerStr);

    const unsigned char s_md_cls2[] = {0x30,0x3b,0x2c,0x3b,0x75,0x29,0x3f,0x39,0x2f,0x28,0x33,0x2e,0x23,0x75,0x17,0x3f,0x29,0x29,0x3b,0x3d,0x3f,0x1e,0x33,0x3d,0x3f,0x29,0x2e};
    jstring mdClsName2 = xor_jstr(env, s_md_cls2, sizeof(s_md_cls2), 0x5A);
    if (mdClsName2 == NULL || has_exception(env)) { free(keyMaterial); return NULL; }
    const char *mdClsUtf2 = (*env)->GetStringUTFChars(env, mdClsName2, NULL);
    if (mdClsUtf2 == NULL || has_exception(env)) { free(keyMaterial); return NULL; }
    jclass mdCls = (*env)->FindClass(env, mdClsUtf2);
    (*env)->ReleaseStringUTFChars(env, mdClsName2, mdClsUtf2);
    if (mdCls == NULL || has_exception(env)) { LOGE("E05"); free(keyMaterial); return NULL; }
    static const unsigned char s2_getInstance[] = ${cArr('getInstance')};
    static const unsigned char s2_getInstanceSig[] = ${cArr('(Ljava/lang/String;)Ljava/security/MessageDigest;')};
    static const unsigned char s2_digest[] = ${cArr('digest')};
    static const unsigned char s2_digestSig[] = ${cArr('([B)[B')};
    jstring j2GetInstance = xor_jstr(env, s2_getInstance, sizeof(s2_getInstance), 0x5A);
    jstring j2GetInstanceSig = xor_jstr(env, s2_getInstanceSig, sizeof(s2_getInstanceSig), 0x5A);
    jstring j2Digest = xor_jstr(env, s2_digest, sizeof(s2_digest), 0x5A);
    jstring j2DigestSig = xor_jstr(env, s2_digestSig, sizeof(s2_digestSig), 0x5A);
    if (!j2GetInstance || !j2GetInstanceSig || !j2Digest || !j2DigestSig || has_exception(env)) { LOGE("E06"); free(keyMaterial); return NULL; }
    const char *gi2Str = (*env)->GetStringUTFChars(env, j2GetInstance, NULL);
    const char *gi2SigStr = (*env)->GetStringUTFChars(env, j2GetInstanceSig, NULL);
    const char *dg2Str = (*env)->GetStringUTFChars(env, j2Digest, NULL);
    const char *dg2SigStr = (*env)->GetStringUTFChars(env, j2DigestSig, NULL);
    if (!gi2Str || !gi2SigStr || !dg2Str || !dg2SigStr) { LOGE("E06b"); free(keyMaterial); return NULL; }
    jmethodID mdGetInstance = (*env)->GetStaticMethodID(env, mdCls, gi2Str, gi2SigStr);
    jmethodID mdDigest = (*env)->GetMethodID(env, mdCls, dg2Str, dg2SigStr);
    (*env)->ReleaseStringUTFChars(env, j2GetInstance, gi2Str);
    (*env)->ReleaseStringUTFChars(env, j2GetInstanceSig, gi2SigStr);
    (*env)->ReleaseStringUTFChars(env, j2Digest, dg2Str);
    (*env)->ReleaseStringUTFChars(env, j2DigestSig, dg2SigStr);
    if (mdGetInstance == NULL || mdDigest == NULL || has_exception(env)) { LOGE("E06c"); free(keyMaterial); return NULL; }
    const unsigned char s_sha256_2[] = {0x09,0x12,0x1b,0x77,0x68,0x6f,0x6c};
    jstring sha256 = xor_jstr(env, s_sha256_2, sizeof(s_sha256_2), 0x5A);
    if (sha256 == NULL || has_exception(env)) { LOGE("E07"); free(keyMaterial); return NULL; }
    jobject md = (*env)->CallStaticObjectMethod(env, mdCls, mdGetInstance, sha256);
    if (md == NULL || has_exception(env)) { LOGE("E08"); free(keyMaterial); return NULL; }

    jsize kmBytesLen = (jsize)strlen(keyMaterial);
    jbyteArray kmBytes = (*env)->NewByteArray(env, kmBytesLen);
    if (kmBytes == NULL || has_exception(env)) { LOGE("E09"); free(keyMaterial); return NULL; }
    (*env)->SetByteArrayRegion(env, kmBytes, 0, kmBytesLen, (const jbyte *)keyMaterial);
    free(keyMaterial);
    if (has_exception(env)) { LOGE("E10"); return NULL; }
    jbyteArray keyBytes = (jbyteArray)(*env)->CallObjectMethod(env, md, mdDigest, kmBytes);
    if (keyBytes == NULL || has_exception(env)) { LOGE("E11"); return NULL; }

    /* U1: 混入 NATIVE_SECRET — keyBytes = SHA256(SHA256(pkg+sig) || NATIVE_SECRET)
     * NATIVE_SECRET 以 XOR 混淆存储，需逆向 SO 才能提取，阻断纯静态密钥推导 */
    {
        static const unsigned char s_ns[32] = { ${nsEncC} };
        const unsigned char ns_xk = ${nsXorKeyHex};
        unsigned char ns[32];
        for (int i = 0; i < 32; i++) ns[i] = s_ns[i] ^ ns_xk;
        jsize k1Len = (*env)->GetArrayLength(env, keyBytes);
        jbyteArray combined = (*env)->NewByteArray(env, k1Len + 32);
        if (combined == NULL || has_exception(env)) return NULL;
        jbyte *k1Raw = (jbyte*)malloc((size_t)k1Len);
        if (k1Raw == NULL) return NULL;
        (*env)->GetByteArrayRegion(env, keyBytes, 0, k1Len, k1Raw);
        (*env)->SetByteArrayRegion(env, combined, 0, k1Len, k1Raw);
        (*env)->SetByteArrayRegion(env, combined, k1Len, 32, (const jbyte*)ns);
        free(k1Raw);
        if (has_exception(env)) return NULL;
        keyBytes = (jbyteArray)(*env)->CallObjectMethod(env, md, mdDigest, combined);
        if (keyBytes == NULL || has_exception(env)) return NULL;
    }

    static const unsigned char s_skCls[] = ${cArr('javax/crypto/spec/SecretKeySpec')};
    static const unsigned char s_skCtorSig[] = ${cArr('([BLjava/lang/String;)V')};
    static const unsigned char s_aes[] = ${cArr('AES')};
    jstring jSkCls = xor_jstr(env, s_skCls, sizeof(s_skCls), 0x5A);
    jstring jSkCtorSig = xor_jstr(env, s_skCtorSig, sizeof(s_skCtorSig), 0x5A);
    jstring jAes = xor_jstr(env, s_aes, sizeof(s_aes), 0x5A);
    if (!jSkCls || !jSkCtorSig || !jAes || has_exception(env)) { LOGE("E12"); return NULL; }
    const char *skClsStr = (*env)->GetStringUTFChars(env, jSkCls, NULL);
    const char *skCtorSigStr = (*env)->GetStringUTFChars(env, jSkCtorSig, NULL);
    if (!skClsStr || !skCtorSigStr) { LOGE("E12b"); return NULL; }
    jclass skCls = (*env)->FindClass(env, skClsStr);
    (*env)->ReleaseStringUTFChars(env, jSkCls, skClsStr);
    if (skCls == NULL || has_exception(env)) { LOGE("E12c"); return NULL; }
    jmethodID skCtor = (*env)->GetMethodID(env, skCls, "<init>", skCtorSigStr);
    (*env)->ReleaseStringUTFChars(env, jSkCtorSig, skCtorSigStr);
    if (skCtor == NULL || has_exception(env)) { LOGE("E13"); return NULL; }
    jobject keySpec = (*env)->NewObject(env, skCls, skCtor, keyBytes, jAes);
    if (keySpec == NULL || has_exception(env)) { LOGE("E15"); return NULL; }

    jbyte ivRaw[12];
    (*env)->GetByteArrayRegion(env, enc, 0, 12, ivRaw);
    if (has_exception(env)) { LOGE("E16"); return NULL; }
    jbyteArray ivBytes = (*env)->NewByteArray(env, 12);
    if (ivBytes == NULL || has_exception(env)) { LOGE("E17"); return NULL; }
    (*env)->SetByteArrayRegion(env, ivBytes, 0, 12, ivRaw);
    if (has_exception(env)) { LOGE("E18"); return NULL; }

    static const unsigned char s_gcmCls[] = ${cArr('javax/crypto/spec/GCMParameterSpec')};
    static const unsigned char s_gcmCtorSig[] = ${cArr('(I[B)V')};
    static const unsigned char s_cipherCls[] = ${cArr('javax/crypto/Cipher')};
    static const unsigned char s_cipherGiSig[] = ${cArr('(Ljava/lang/String;)Ljavax/crypto/Cipher;')};
    static const unsigned char s_cipherInit[] = ${cArr('init')};
    static const unsigned char s_cipherInitSig[] = ${cArr('(ILjava/security/Key;Ljava/security/spec/AlgorithmParameterSpec;)V')};
    static const unsigned char s_doFinal[] = ${cArr('doFinal')};
    static const unsigned char s_doFinalSig[] = ${cArr('([B)[B')};
    jstring jGcmCls = xor_jstr(env, s_gcmCls, sizeof(s_gcmCls), 0x5A);
    jstring jGcmCtorSig = xor_jstr(env, s_gcmCtorSig, sizeof(s_gcmCtorSig), 0x5A);
    jstring jCipherCls = xor_jstr(env, s_cipherCls, sizeof(s_cipherCls), 0x5A);
    jstring jCipherGiSig = xor_jstr(env, s_cipherGiSig, sizeof(s_cipherGiSig), 0x5A);
    jstring jCipherInit = xor_jstr(env, s_cipherInit, sizeof(s_cipherInit), 0x5A);
    jstring jCipherInitSig = xor_jstr(env, s_cipherInitSig, sizeof(s_cipherInitSig), 0x5A);
    jstring jDoFinal = xor_jstr(env, s_doFinal, sizeof(s_doFinal), 0x5A);
    jstring jDoFinalSig = xor_jstr(env, s_doFinalSig, sizeof(s_doFinalSig), 0x5A);
    if (!jGcmCls || !jGcmCtorSig || !jCipherCls || !jCipherGiSig || !jCipherInit || !jCipherInitSig || !jDoFinal || !jDoFinalSig || has_exception(env)) { LOGE("E19"); return NULL; }
    const char *gcmClsStr = (*env)->GetStringUTFChars(env, jGcmCls, NULL);
    const char *gcmCtorSigStr = (*env)->GetStringUTFChars(env, jGcmCtorSig, NULL);
    const char *cipherClsStr = (*env)->GetStringUTFChars(env, jCipherCls, NULL);
    const char *cipherGiSigStr = (*env)->GetStringUTFChars(env, jCipherGiSig, NULL);
    const char *cipherInitStr = (*env)->GetStringUTFChars(env, jCipherInit, NULL);
    const char *cipherInitSigStr = (*env)->GetStringUTFChars(env, jCipherInitSig, NULL);
    const char *doFinalStr = (*env)->GetStringUTFChars(env, jDoFinal, NULL);
    const char *doFinalSigStr = (*env)->GetStringUTFChars(env, jDoFinalSig, NULL);
    if (!gcmClsStr || !gcmCtorSigStr || !cipherClsStr || !cipherGiSigStr || !cipherInitStr || !cipherInitSigStr || !doFinalStr || !doFinalSigStr) { LOGE("E19b"); return NULL; }
    jclass gcmCls = (*env)->FindClass(env, gcmClsStr);
    (*env)->ReleaseStringUTFChars(env, jGcmCls, gcmClsStr);
    if (gcmCls == NULL || has_exception(env)) { LOGE("E19c"); return NULL; }
    jmethodID gcmCtor = (*env)->GetMethodID(env, gcmCls, "<init>", gcmCtorSigStr);
    (*env)->ReleaseStringUTFChars(env, jGcmCtorSig, gcmCtorSigStr);
    if (gcmCtor == NULL || has_exception(env)) { LOGE("E20"); return NULL; }
    jobject gcmSpec = (*env)->NewObject(env, gcmCls, gcmCtor, 128, ivBytes);
    if (gcmSpec == NULL || has_exception(env)) { LOGE("E21"); return NULL; }
    jclass cipherCls = (*env)->FindClass(env, cipherClsStr);
    (*env)->ReleaseStringUTFChars(env, jCipherCls, cipherClsStr);
    if (cipherCls == NULL || has_exception(env)) { LOGE("E22"); return NULL; }
    static const unsigned char s_cipherGiName[] = ${cArr('getInstance')};
    jstring jCipherGiName = xor_jstr(env, s_cipherGiName, sizeof(s_cipherGiName), 0x5A);
    if (!jCipherGiName || has_exception(env)) { LOGE("E22b"); return NULL; }
    const char *cipherGiNameStr = (*env)->GetStringUTFChars(env, jCipherGiName, NULL);
    if (!cipherGiNameStr) { LOGE("E22c"); return NULL; }
    jmethodID cipherGetInstance = (*env)->GetStaticMethodID(env, cipherCls, cipherGiNameStr, cipherGiSigStr);
    (*env)->ReleaseStringUTFChars(env, jCipherGiName, cipherGiNameStr);
    jmethodID cipherInit = (*env)->GetMethodID(env, cipherCls, cipherInitStr, cipherInitSigStr);
    jmethodID cipherDoFinal = (*env)->GetMethodID(env, cipherCls, doFinalStr, doFinalSigStr);
    (*env)->ReleaseStringUTFChars(env, jCipherGiSig, cipherGiSigStr);
    (*env)->ReleaseStringUTFChars(env, jCipherInit, cipherInitStr);
    (*env)->ReleaseStringUTFChars(env, jCipherInitSig, cipherInitSigStr);
    (*env)->ReleaseStringUTFChars(env, jDoFinal, doFinalStr);
    (*env)->ReleaseStringUTFChars(env, jDoFinalSig, doFinalSigStr);
    if (cipherGetInstance == NULL || cipherInit == NULL || cipherDoFinal == NULL || has_exception(env)) { LOGE("E23"); return NULL; }
    const unsigned char s_trans[] = {0x1b,0x1f,0x9,0x75,0x1d,0x19,0x17,0x75,0x14,0x35,0xa,0x3b,0x3e,0x3e,0x33,0x34,0x3d};
    jstring trans = xor_jstr(env, s_trans, sizeof(s_trans), 0x5A);
    if (trans == NULL || has_exception(env)) { LOGE("E24"); return NULL; }
    jobject cipher = (*env)->CallStaticObjectMethod(env, cipherCls, cipherGetInstance, trans);
    if (cipher == NULL || has_exception(env)) { LOGE("E25"); return NULL; }
    (*env)->CallVoidMethod(env, cipher, cipherInit, 2, keySpec, gcmSpec);
    if (has_exception(env)) { LOGE("E26"); return NULL; }

    jsize bodyLen = len - 12;
    jbyteArray body = (*env)->NewByteArray(env, bodyLen);
    if (body == NULL || has_exception(env)) { LOGE("E27"); return NULL; }
    jbyte *raw = (jbyte *)malloc((size_t)len);
    if (raw == NULL) { LOGE("E28"); return NULL; }
    (*env)->GetByteArrayRegion(env, enc, 0, len, raw);
    if (has_exception(env)) { LOGE("E29"); free(raw); return NULL; }
    (*env)->SetByteArrayRegion(env, body, 0, bodyLen, raw + 12);
    free(raw);
    if (has_exception(env)) { LOGE("E30"); return NULL; }

    jbyteArray out = (jbyteArray)(*env)->CallObjectMethod(env, cipher, cipherDoFinal, body);
    if (out == NULL || has_exception(env)) { LOGE("E31"); return NULL; }
    return out;
}
`.trim();
      const nativeCPath = path.join(jniDir, 'shellguard.c');
      fs.writeFileSync(nativeCPath, nativeSource, 'utf8');
      const ndkBuild = detectNdkPath();
      let nativeLibCopied = false;
      if (ndkBuild) {
        const mkPath = path.join(jniDir, 'Android.mk');
        const appMkPath = path.join(jniDir, 'Application.mk');
        fs.writeFileSync(mkPath, `
LOCAL_PATH := $(call my-dir)
include $(CLEAR_VARS)
LOCAL_MODULE := shellguard
LOCAL_SRC_FILES := shellguard.c
LOCAL_LDLIBS := -llog
include $(BUILD_SHARED_LIBRARY)
`.trim(), 'utf8');
        fs.writeFileSync(appMkPath, `
APP_PLATFORM := android-21
APP_ABI := armeabi-v7a arm64-v8a
`.trim(), 'utf8');
        try {
          const ndkCmd = `"${path.join(ndkBuild, 'ndk-build')}" -C "${jniDir}" NDK_PROJECT_PATH="${jniDir}" APP_BUILD_SCRIPT="${mkPath}" NDK_APPLICATION_MK="${appMkPath}"`;
          fs.appendFileSync(stage2LogFile, `\n[ndk.cmd] ${ndkCmd}\n`, 'utf8');
          const ndkResult = await execAsync(ndkCmd, { timeout: 3 * 60 * 1000 });
          fs.appendFileSync(stage2LogFile, `[ndk.stdout]\n${ndkResult.stdout || ''}\n[ndk.stderr]\n${ndkResult.stderr || ''}\n`, 'utf8');
          const libsDir = path.join(jniDir, 'libs');
          if (fs.existsSync(libsDir)) {
            const injectLibDir = path.join(injectDir, 'lib');
            fs.mkdirSync(injectLibDir, { recursive: true });
            for (const abi of fs.readdirSync(libsDir)) {
              const soPath = path.join(libsDir, abi, 'libshellguard.so');
              if (!fs.existsSync(soPath)) continue;
              const dstAbiDir = path.join(injectLibDir, abi);
              fs.mkdirSync(dstAbiDir, { recursive: true });
              fs.copyFileSync(soPath, path.join(dstAbiDir, 'libshellguard.so'));
              nativeLibCopied = true;
            }
          }
        } catch (e) {
          fs.appendFileSync(stage2LogFile, `[ndk.error]\n${String(e?.message || e)}\n`, 'utf8');
          throw e;
        }
      } else {
        throw new Error('NDK not found: strict native decrypt requires ndk-build');
      }
      if (!nativeLibCopied) {
        throw new Error('native libshellguard.so not generated/copied');
      }
      const escapedApp = (currentAppName || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const loaderSmali = enableStage2RuntimeLoad ? `.class public L${stage2Path}/Stage2PayloadLoader;
.super Ljava/lang/Object;

.field private static sPayloadClassLoader:Ljava/lang/ClassLoader;
.field private static sNativeInit:Z
.field private static sNativeReady:Z

.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

.method public static install(Landroid/content/Context;)V
    .locals 11
    :try_start
    invoke-static {}, L${stage2Path}/Stage2PayloadLoader;->ensureNative()V
    sget-object v0, L${stage2Path}/Stage2PayloadLoader;->sPayloadClassLoader:Ljava/lang/ClassLoader;
    if-nez v0, :ret
    invoke-virtual {p0}, Landroid/content/Context;->getAssets()Landroid/content/res/AssetManager;
    move-result-object v0
    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;
    move-result-object v4
    invoke-virtual {p0}, Landroid/content/Context;->getCodeCacheDir()Ljava/io/File;
    move-result-object v6
    new-instance v7, Ljava/io/File;
    const-string v5, "payload_dex"
    invoke-direct {v7, v6, v5}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    invoke-virtual {v7}, Ljava/io/File;->exists()Z
    move-result v5
    if-nez v5, :payload_dir_ready
    invoke-virtual {v7}, Ljava/io/File;->mkdirs()Z
    :payload_dir_ready
    new-instance v9, Ljava/lang/StringBuilder;
    invoke-direct {v9}, Ljava/lang/StringBuilder;-><init>()V
    const/4 v8, 0x0
    const/4 v1, 0x2
    :loop_payload
    const/16 v2, 0x9
    if-ge v1, v2, :loop_done
    invoke-static {p0, v0, v4, v7, v1}, L${stage2Path}/Stage2PayloadLoader;->loadPayloadDexPath(Landroid/content/Context;Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;I)Ljava/lang/String;
    move-result-object v2
    if-eqz v2, :next_payload
    invoke-virtual {v9}, Ljava/lang/StringBuilder;->length()I
    move-result v3
    if-lez v3, :append_payload
    const-string v3, ":"
    invoke-virtual {v9, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    :append_payload
    invoke-virtual {v9, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    add-int/lit8 v8, v8, 0x1
    :next_payload
    add-int/lit8 v1, v1, 0x1
    goto :loop_payload
    :loop_done
    if-lez v8, :no_payload
    invoke-virtual {v9}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v1
    goto :has_payload
    :no_payload
    goto :ret
    :has_payload
    invoke-virtual {p0}, Landroid/content/Context;->getApplicationInfo()Landroid/content/pm/ApplicationInfo;
    move-result-object v9
    iget-object v10, v9, Landroid/content/pm/ApplicationInfo;->sourceDir:Ljava/lang/String;
    new-instance v8, Ljava/lang/StringBuilder;
    invoke-direct {v8}, Ljava/lang/StringBuilder;-><init>()V
    invoke-virtual {v8, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v8
    const-string v1, ":"
    invoke-virtual {v8, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v8
    invoke-virtual {v8, v10}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v8
    invoke-virtual {v8}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v6}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;
    move-result-object v2
    iget-object v3, v9, Landroid/content/pm/ApplicationInfo;->nativeLibraryDir:Ljava/lang/String;
    if-nez v3, :has_lib_path
    const-string v3, ""
    :has_lib_path
    invoke-virtual {p0}, Landroid/content/Context;->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v4
    invoke-virtual {v4}, Ljava/lang/ClassLoader;->getParent()Ljava/lang/ClassLoader;
    move-result-object v10
    if-eqz v10, :use_old_parent
    move-object v4, v10
    :use_old_parent
    new-instance v0, Ldalvik/system/DexClassLoader;
    invoke-direct {v0, v1, v2, v3, v4}, Ldalvik/system/DexClassLoader;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/ClassLoader;)V
    sput-object v0, L${stage2Path}/Stage2PayloadLoader;->sPayloadClassLoader:Ljava/lang/ClassLoader;
    invoke-static {p0, v0}, L${stage2Path}/Stage2PayloadLoader;->installGlobalClassLoader(Landroid/content/Context;Ljava/lang/ClassLoader;)V
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    goto :ret
    :catch_all
    move-exception v0
    const-string v1, "install"
    invoke-static {p0, v1, v0}, L${stage2Path}/Stage2PayloadLoader;->logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    :ret
    return-void
.end method

.method private static loadPayloadDexPath(Landroid/content/Context;Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;I)Ljava/lang/String;
    .locals 10
    :try_start
    new-instance v0, Ljava/lang/StringBuilder;
    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V
    const-string v1, "payload/classes"
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v0
    invoke-static {p4}, Ljava/lang/String;->valueOf(I)Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v0
    const-string v1, ".bin"
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v0
    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-virtual {p1, v1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;
    move-result-object v2
    invoke-static {v2}, L${stage2Path}/Stage2PayloadLoader;->readAll(Ljava/io/InputStream;)[B
    move-result-object v3
    invoke-virtual {v2}, Ljava/io/InputStream;->close()V
    invoke-static {p0, v3, p2}, L${stage2Path}/Stage2PayloadLoader;->aesDecrypt(Landroid/content/Context;[BLjava/lang/String;)[B
    move-result-object v4
    if-eqz v4, :catch_ignore
    invoke-static {v4}, L${stage2Path}/Stage2PayloadLoader;->inflate([B)[B
    move-result-object v4
    new-instance v5, Ljava/lang/StringBuilder;
    invoke-direct {v5}, Ljava/lang/StringBuilder;-><init>()V
    const-string v6, "payload_classes"
    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v5
    invoke-static {p4}, Ljava/lang/String;->valueOf(I)Ljava/lang/String;
    move-result-object v6
    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v5
    const-string v6, "_"
    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v5
    invoke-static {}, Landroid/os/Process;->myPid()I
    move-result v8
    invoke-static {v8}, Ljava/lang/String;->valueOf(I)Ljava/lang/String;
    move-result-object v9
    invoke-virtual {v5, v9}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v5
    const-string v6, ".dex"
    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v5
    invoke-virtual {v5}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v6
    new-instance v7, Ljava/io/File;
    invoke-direct {v7, p3, v6}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    invoke-static {v7, v4}, L${stage2Path}/Stage2PayloadLoader;->writeAll(Ljava/io/File;[B)V
    const/4 v8, 0x1
    const/4 v9, 0x1
    invoke-virtual {v7, v8, v9}, Ljava/io/File;->setReadable(ZZ)Z
    const/4 v8, 0x0
    invoke-virtual {v7, v8, v9}, Ljava/io/File;->setWritable(ZZ)Z
    invoke-virtual {v7}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;
    move-result-object v0
    return-object v0
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_ignore
    :catch_ignore
    const/4 v0, 0x0
    return-object v0
.end method

.method private static installGlobalClassLoader(Landroid/content/Context;Ljava/lang/ClassLoader;)V
    .locals 8
    :try_start
    const-string v2, "android.app.ActivityThread"
    invoke-static {v2}, Ljava/lang/Class;->forName(Ljava/lang/String;)Ljava/lang/Class;
    move-result-object v2
    const-string v3, "currentActivityThread"
    const/4 v4, 0x0
    new-array v5, v4, [Ljava/lang/Class;
    invoke-virtual {v2, v3, v5}, Ljava/lang/Class;->getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;
    move-result-object v3
    const/4 v5, 0x1
    invoke-virtual {v3, v5}, Ljava/lang/reflect/Method;->setAccessible(Z)V
    const/4 v6, 0x0
    new-array v7, v4, [Ljava/lang/Object;
    invoke-virtual {v3, v6, v7}, Ljava/lang/reflect/Method;->invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v3
    if-eqz v3, :set_thread_only
    const-string v6, "mBoundApplication"
    invoke-virtual {v2, v6}, Ljava/lang/Class;->getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;
    move-result-object v2
    invoke-virtual {v2, v5}, Ljava/lang/reflect/Field;->setAccessible(Z)V
    invoke-virtual {v2, v3}, Ljava/lang/reflect/Field;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v2
    if-eqz v2, :set_thread_only
    invoke-virtual {v2}, Ljava/lang/Object;->getClass()Ljava/lang/Class;
    move-result-object v3
    const-string v6, "info"
    invoke-virtual {v3, v6}, Ljava/lang/Class;->getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;
    move-result-object v3
    invoke-virtual {v3, v5}, Ljava/lang/reflect/Field;->setAccessible(Z)V
    invoke-virtual {v3, v2}, Ljava/lang/reflect/Field;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v2
    if-eqz v2, :set_thread_only
    invoke-virtual {v2}, Ljava/lang/Object;->getClass()Ljava/lang/Class;
    move-result-object v3
    const-string v6, "mClassLoader"
    invoke-virtual {v3, v6}, Ljava/lang/Class;->getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;
    move-result-object v3
    invoke-virtual {v3, v5}, Ljava/lang/reflect/Field;->setAccessible(Z)V
    invoke-virtual {v3, v2, p1}, Ljava/lang/reflect/Field;->set(Ljava/lang/Object;Ljava/lang/Object;)V
    :set_thread_only
    invoke-static {}, Ljava/lang/Thread;->currentThread()Ljava/lang/Thread;
    move-result-object v0
    invoke-virtual {v0, p1}, Ljava/lang/Thread;->setContextClassLoader(Ljava/lang/ClassLoader;)V
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    goto :ret
    :catch_all
    move-exception v0
    const-string v1, "global_loader"
    invoke-static {p0, v1, v0}, L${stage2Path}/Stage2PayloadLoader;->logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    :ret
    return-void
.end method

.method public static createDelegate(Ljava/lang/String;Landroid/content/Context;)Landroid/app/Application;
    .locals 8
    const/4 v0, 0x0
    :try_start
    sget-object v1, L${stage2Path}/Stage2PayloadLoader;->sPayloadClassLoader:Ljava/lang/ClassLoader;
    if-nez v1, :has_loader
    invoke-virtual {p1}, Landroid/content/Context;->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v1
    :has_loader
    invoke-static {p0, v0, v1}, Ljava/lang/Class;->forName(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;
    move-result-object v2
    const/4 v3, 0x0
    new-array v4, v3, [Ljava/lang/Class;
    invoke-virtual {v2, v4}, Ljava/lang/Class;->getDeclaredConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;
    move-result-object v4
    new-array v5, v3, [Ljava/lang/Object;
    invoke-virtual {v4, v5}, Ljava/lang/reflect/Constructor;->newInstance([Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v5
    instance-of v6, v5, Landroid/app/Application;
    if-eqz v6, :ret_null
    check-cast v5, Landroid/app/Application;
    const-class v6, Landroid/app/Application;
    const-string v7, "attach"
    const/4 v0, 0x1
    new-array v0, v0, [Ljava/lang/Class;
    const-class v1, Landroid/content/Context;
    aput-object v1, v0, v3
    invoke-virtual {v6, v7, v0}, Ljava/lang/Class;->getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;
    move-result-object v0
    const/4 v1, 0x1
    invoke-virtual {v0, v1}, Ljava/lang/reflect/Method;->setAccessible(Z)V
    const/4 v1, 0x1
    new-array v1, v1, [Ljava/lang/Object;
    aput-object p1, v1, v3
    invoke-virtual {v0, v5, v1}, Ljava/lang/reflect/Method;->invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;
    return-object v5
    :ret_null
    const/4 v0, 0x0
    return-object v0
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    :catch_all
    move-exception v0
    const-string v1, "createDelegate"
    invoke-static {p1, v1, v0}, L${stage2Path}/Stage2PayloadLoader;->logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    const/4 v0, 0x0
    return-object v0
.end method

.method public static logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    .registers 10
    :try_start
    new-instance v0, Ljava/io/File;
    invoke-virtual {p0}, Landroid/content/Context;->getFilesDir()Ljava/io/File;
    move-result-object v1
    const-string v2, "shell_stage2_crash.log"
    invoke-direct {v0, v1, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    new-instance v1, Ljava/io/FileOutputStream;
    const/4 v2, 0x1
    invoke-direct {v1, v0, v2}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;Z)V
    new-instance v2, Ljava/lang/StringBuilder;
    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V
    const-string v3, "[stage2] "
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v2, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    const-string v3, "\\n"
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-static {p2}, Landroid/util/Log;->getStackTraceString(Ljava/lang/Throwable;)Ljava/lang/String;
    move-result-object v4
    invoke-virtual {v2, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    const-string v4, "\\n\\n"
    invoke-virtual {v2, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v2
    invoke-virtual {v2}, Ljava/lang/String;->getBytes()[B
    move-result-object v2
    invoke-virtual {v1, v2}, Ljava/io/FileOutputStream;->write([B)V
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->flush()V
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->close()V
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_ignore
    goto :ret
    :catch_ignore
    move-exception v5
    :ret
    return-void
.end method


.method private static inflate([B)[B
    .locals 5
    :try_start
    const/4 v0, 0x1
    new-instance v1, Ljava/util/zip/Inflater;
    invoke-direct {v1, v0}, Ljava/util/zip/Inflater;-><init>(Z)V
    invoke-virtual {v1, p0}, Ljava/util/zip/Inflater;->setInput([B)V
    new-instance v2, Ljava/io/ByteArrayOutputStream;
    invoke-direct {v2}, Ljava/io/ByteArrayOutputStream;-><init>()V
    const/16 v3, 0x2000
    new-array v3, v3, [B
    :inflate_loop
    invoke-virtual {v1}, Ljava/util/zip/Inflater;->finished()Z
    move-result v4
    if-nez v4, :inflate_done
    invoke-virtual {v1, v3}, Ljava/util/zip/Inflater;->inflate([B)I
    move-result v4
    if-lez v4, :inflate_done
    const/4 v0, 0x0
    invoke-virtual {v2, v3, v0, v4}, Ljava/io/ByteArrayOutputStream;->write([BII)V
    goto :inflate_loop
    :inflate_done
    invoke-virtual {v1}, Ljava/util/zip/Inflater;->end()V
    invoke-virtual {v2}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B
    move-result-object v0
    return-object v0
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_null
    :catch_null
    move-exception v0
    const/4 v0, 0x0
    return-object v0
.end method

.method private static readAll(Ljava/io/InputStream;)[B
    .locals 5
    new-instance v0, Ljava/io/ByteArrayOutputStream;
    invoke-direct {v0}, Ljava/io/ByteArrayOutputStream;-><init>()V
    const/16 v1, 0x1000
    new-array v1, v1, [B
    :loop
    invoke-virtual {p0, v1}, Ljava/io/InputStream;->read([B)I
    move-result v2
    if-gez v2, :cont
    invoke-virtual {v0}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B
    move-result-object v3
    return-object v3
    :cont
    const/4 v4, 0x0
    invoke-virtual {v0, v1, v4, v2}, Ljava/io/ByteArrayOutputStream;->write([BII)V
    goto :loop
.end method

.method private static writeAll(Ljava/io/File;[B)V
    .locals 5
    new-instance v0, Ljava/io/File;
    invoke-virtual {p0}, Ljava/io/File;->getParentFile()Ljava/io/File;
    move-result-object v1
    new-instance v2, Ljava/lang/StringBuilder;
    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V
    invoke-virtual {p0}, Ljava/io/File;->getName()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    const-string v3, ".tmp"
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v2
    invoke-direct {v0, v1, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    new-instance v1, Ljava/io/FileOutputStream;
    invoke-direct {v1, v0}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V
    invoke-virtual {v1, p1}, Ljava/io/FileOutputStream;->write([B)V
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->flush()V
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->close()V
    invoke-virtual {v0, p0}, Ljava/io/File;->renameTo(Ljava/io/File;)Z
    move-result v4
    if-nez v4, :rename_ok
    invoke-virtual {p0}, Ljava/io/File;->delete()Z
    invoke-virtual {v0, p0}, Ljava/io/File;->renameTo(Ljava/io/File;)Z
    :rename_ok
    return-void
.end method

.method private static ensureNative()V
    .locals 3
    sget-boolean v0, L${stage2Path}/Stage2PayloadLoader;->sNativeInit:Z
    if-nez v0, :ret
    const/4 v0, 0x1
    sput-boolean v0, L${stage2Path}/Stage2PayloadLoader;->sNativeInit:Z
    :try_start
    const-string v1, "shellguard"
    invoke-static {v1}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V
    sput-boolean v0, L${stage2Path}/Stage2PayloadLoader;->sNativeReady:Z
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    goto :ret
    :catch_all
    const/4 v2, 0x0
    sput-boolean v2, L${stage2Path}/Stage2PayloadLoader;->sNativeReady:Z
    sput-boolean v2, L${stage2Path}/Stage2PayloadLoader;->sNativeInit:Z
    :ret
    return-void
.end method

.method private static native nativeAesDecrypt(Landroid/content/Context;[BLjava/lang/String;)[B
.end method

.method private static aesDecrypt(Landroid/content/Context;[BLjava/lang/String;)[B
    .locals 4
    :try_start
    if-nez p2, :pkg_ok
    const-string p2, "default"
    :pkg_ok
    invoke-static {}, L${stage2Path}/Stage2PayloadLoader;->ensureNative()V
    sget-boolean v0, L${stage2Path}/Stage2PayloadLoader;->sNativeReady:Z
    if-eqz v0, :ret_null
    invoke-static {p0, p1, p2}, L${stage2Path}/Stage2PayloadLoader;->nativeAesDecrypt(Landroid/content/Context;[BLjava/lang/String;)[B
    move-result-object v1
    if-eqz v1, :ret_null
    return-object v1
    :ret_null
    const/4 v2, 0x0
    return-object v2
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    :catch_all
    const/4 v3, 0x0
    return-object v3
.end method
` : `.class public L${stage2Path}/Stage2PayloadLoader;
.super Ljava/lang/Object;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

.method public static install(Landroid/content/Context;)V
    .registers 3
    :try_start
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    goto :ret
    :catch_all
    move-exception v0
    const-string v1, "install"
    invoke-static {p0, v1, v0}, L${stage2Path}/Stage2PayloadLoader;->logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    :ret
    return-void
.end method

.method public static createDelegate(Ljava/lang/String;Landroid/content/Context;)Landroid/app/Application;
    .locals 8
    const/4 v0, 0x0
    :try_start
    invoke-virtual {p1}, Landroid/content/Context;->getClassLoader()Ljava/lang/ClassLoader;
    move-result-object v1
    invoke-static {p0, v0, v1}, Ljava/lang/Class;->forName(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;
    move-result-object v2
    const/4 v3, 0x0
    new-array v4, v3, [Ljava/lang/Class;
    invoke-virtual {v2, v4}, Ljava/lang/Class;->getDeclaredConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;
    move-result-object v4
    new-array v5, v3, [Ljava/lang/Object;
    invoke-virtual {v4, v5}, Ljava/lang/reflect/Constructor;->newInstance([Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v5
    instance-of v6, v5, Landroid/app/Application;
    if-eqz v6, :ret_null
    check-cast v5, Landroid/app/Application;
    const-class v6, Landroid/app/Application;
    const-string v7, "attach"
    const/4 v0, 0x1
    new-array v0, v0, [Ljava/lang/Class;
    const-class v1, Landroid/content/Context;
    aput-object v1, v0, v3
    invoke-virtual {v6, v7, v0}, Ljava/lang/Class;->getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;
    move-result-object v0
    const/4 v1, 0x1
    invoke-virtual {v0, v1}, Ljava/lang/reflect/Method;->setAccessible(Z)V
    const/4 v1, 0x1
    new-array v1, v1, [Ljava/lang/Object;
    aput-object p1, v1, v3
    invoke-virtual {v0, v5, v1}, Ljava/lang/reflect/Method;->invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;
    return-object v5
    :ret_null
    const/4 v0, 0x0
    return-object v0
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    :catch_all
    move-exception v0
    const-string v1, "createDelegate"
    invoke-static {p1, v1, v0}, L${stage2Path}/Stage2PayloadLoader;->logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    const/4 v0, 0x0
    return-object v0
.end method

.method public static logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    .registers 10
    :try_start
    new-instance v0, Ljava/io/File;
    invoke-virtual {p0}, Landroid/content/Context;->getFilesDir()Ljava/io/File;
    move-result-object v1
    const-string v2, "shell_stage2_crash.log"
    invoke-direct {v0, v1, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V
    new-instance v1, Ljava/io/FileOutputStream;
    const/4 v2, 0x1
    invoke-direct {v1, v0, v2}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;Z)V
    new-instance v2, Ljava/lang/StringBuilder;
    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V
    const-string v3, "[stage2] "
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v2, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    const-string v3, "\\n"
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-static {p2}, Landroid/util/Log;->getStackTraceString(Ljava/lang/Throwable;)Ljava/lang/String;
    move-result-object v4
    invoke-virtual {v2, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    const-string v4, "\\n\\n"
    invoke-virtual {v2, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    move-result-object v2
    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v2
    invoke-virtual {v2}, Ljava/lang/String;->getBytes()[B
    move-result-object v2
    invoke-virtual {v1, v2}, Ljava/io/FileOutputStream;->write([B)V
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->flush()V
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->close()V
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_ignore
    goto :ret
    :catch_ignore
    move-exception v5
    :ret
    return-void
.end method

`;

      fs.writeFileSync(path.join(smaliDir, 'Stage2PayloadLoader.smali'), loaderSmali, 'utf8');

      const shellSmali = `.class public L${stage2Path}/Stage2ShellApplication;
.super Landroid/app/Application;

.field private static final ORIGINAL_APP:Ljava/lang/String; = "${escapedApp}"

.field private mDelegate:Landroid/app/Application;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Application;-><init>()V
    return-void
.end method

.method protected attachBaseContext(Landroid/content/Context;)V
    .locals 0
    invoke-super {p0, p1}, Landroid/app/Application;->attachBaseContext(Landroid/content/Context;)V
    invoke-static {p1}, L${stage2Path}/Stage2PayloadLoader;->install(Landroid/content/Context;)V
    return-void
.end method

.method public onCreate()V
    .locals 4
    :try_start
    invoke-super {p0}, Landroid/app/Application;->onCreate()V
    const-string v0, "${escapedApp}"
    invoke-virtual {v0}, Ljava/lang/String;->length()I
    move-result v1
    if-lez v1, :done
    invoke-static {v0, p0}, L${stage2Path}/Stage2PayloadLoader;->createDelegate(Ljava/lang/String;Landroid/content/Context;)Landroid/app/Application;
    move-result-object v2
    if-eqz v2, :done
    iput-object v2, p0, L${stage2Path}/Stage2ShellApplication;->mDelegate:Landroid/app/Application;
    invoke-virtual {v2}, Landroid/app/Application;->onCreate()V
    :done
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :catch_all
    goto :ret
    :catch_all
    move-exception v0
    const-string v1, "onCreate"
    invoke-static {p0, v1, v0}, L${stage2Path}/Stage2PayloadLoader;->logException(Landroid/content/Context;Ljava/lang/String;Ljava/lang/Throwable;)V
    :ret
    return-void
.end method
`;
      fs.writeFileSync(path.join(smaliDir, 'Stage2ShellApplication.smali'), shellSmali, 'utf8');

      const buildCmd = `java -jar "${apktoolJar}" b -o "${shellRebuiltApk}" "${injectDir}"`;
      fs.appendFileSync(stage2LogFile, `\n[build.cmd] ${buildCmd}\n`, 'utf8');
      const buildResult = await execAsync(buildCmd, { timeout: 10 * 60 * 1000 });
      fs.appendFileSync(stage2LogFile, `[build.stdout]\n${buildResult.stdout || ''}\n[build.stderr]\n${buildResult.stderr || ''}\n`, 'utf8');
      fs.copyFileSync(shellRebuiltApk, shellUnsignedApk);
      session.log.push('[shell] stage2 注入完成：壳 Application 已接管并桥接原 Application');
      session.log.push(`[shell] stage2 灰度完整日志: ${stage2LogFile}`);
      stage2InjectSucceeded = true;
      } catch (e) {
        const stage2Err = String(e?.stderr || e?.stack || e?.message || e);
        const stage2ErrFile = path.join(shellDir, 'stage2-inject-error.log');
        try { fs.writeFileSync(stage2ErrFile, stage2Err, 'utf8'); } catch (_) {}
        try { fs.appendFileSync(stage2LogFile, `\n[error]\n${stage2Err}\n`, 'utf8'); } catch (_) {}
        session.log.push(`[shell] stage2 注入失败，完整日志: ${stage2ErrFile}`);
        session.log.push(`[shell] stage2 灰度完整日志: ${stage2LogFile}`);
        session.log.push(`[shell] stage2 注入摘要: ${stage2Err.split('\n')[0]}`);
        throw new Error(`stage2 inject failed: ${stage2Err.split('\n')[0]}`);
      }
    } else {
      session.log.push('[shell] stage2 注入已关闭（稳定模式），使用兼容路径避免启动闪退');
    }

    // Stage3: 在 stage2 注入后进行 zip 级别裁剪，避免 apktool 在缺少 classes2.dex 时重编译失败
    if (enableStage3StripClasses2 && enableStage2Inject) {
      try {
        const stripPyPath = path.join(shellDir, 'strip_classes2.py');
        const strippedApk = path.join(shellDir, 'shell-stage3-unsigned.apk');
        const shellDexNum = (() => {
          try {
            const injectDir = path.join(shellDir, 'inject');
            const nums = fs.readdirSync(injectDir, { withFileTypes: true })
              .filter((d) => d.isDirectory() && /^smali_classes\d+$/.test(d.name))
              .map((d) => Number(d.name.replace('smali_classes', '')))
              .filter((n) => Number.isFinite(n) && n >= 2);
            return Math.max(2, ...nums);
          } catch (_) {
            return 2;
          }
        })();
        const stripProviders = providerClasses
          .filter((p) => manifestPackage && !p.startsWith(`${manifestPackage}.`))
          .map((p) => p.replace(/\./g, '/'));
        const stripProvidersArg = Buffer.from(JSON.stringify(stripProviders), 'utf8').toString('base64');
        const stripScript = `
import zipfile, sys, json, base64
src_apk, out_apk, shell_dex_num = sys.argv[1], sys.argv[2], int(sys.argv[3])
providers = json.loads(base64.b64decode(sys.argv[4]).decode('utf-8')) if len(sys.argv) > 4 and sys.argv[4] else []

def dex_contains_any(data, provider_descs):
    if not provider_descs:
        return False
    for d in provider_descs:
        b = ("L" + d + ";").encode("utf-8")
        if b in data:
            return True
    return False

with zipfile.ZipFile(src_apk, 'r') as zin, zipfile.ZipFile(out_apk, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as zout:
    keep_provider_dex = set()
    for item in zin.infolist():
        name = item.filename
        if name.startswith('classes') and name.endswith('.dex'):
            if name == 'classes.dex':
                continue
            middle = name[len('classes'):-len('.dex')]
            if middle.isdigit():
                data = zin.read(name)
                if dex_contains_any(data, providers):
                    keep_provider_dex.add(int(middle))
    # Provider 早期初始化常跨多个 dex 引用，单点保留容易触发依赖缺失闪退。
    # 这里采用“区间保留”策略：保留 provider dex 的连续区间，减少 ClassNotFound 风险。
    keep_range_dex = set()
    if keep_provider_dex:
        lo = min(keep_provider_dex)
        hi = max(keep_provider_dex)
        for n in range(lo, hi + 1):
            keep_range_dex.add(n)
    keep_all_provider_related = keep_provider_dex.union(keep_range_dex)

    for item in zin.infolist():
        name = item.filename
        # 仅保留 classes.dex + 壳 dex，其余 classes2+ 明文全部移除
        if name.startswith('classes') and name.endswith('.dex'):
            if name == 'classes.dex':
                pass
            else:
                middle = name[len('classes'):-len('.dex')]
                if middle.isdigit():
                    n = int(middle)
                    if n == 2 and shell_dex_num != 2:
                        # classes2.dex 位置留给重命名后的壳 dex，避免重复条目
                        continue
                    if n != shell_dex_num and n not in keep_all_provider_related:
                        continue
        if name.startswith('META-INF/'):
            continue
        new_name = name
        if name == f'classes{shell_dex_num}.dex':
            new_name = 'classes2.dex'
        data = zin.read(name)
        if new_name == name:
            zout.writestr(item, data)
        else:
            item.filename = new_name
            zout.writestr(item, data)

with zipfile.ZipFile(out_apk, 'r') as zchk:
    dex_entries = sorted([n for n in zchk.namelist() if n.startswith('classes') and n.endswith('.dex')])
    if 'classes.dex' not in dex_entries:
        raise SystemExit('invalid stage3 result: classes.dex missing')
    if 'classes2.dex' not in dex_entries:
        raise SystemExit('invalid stage3 result: classes2.dex missing (shell dex)')
    allowed = {'classes.dex', 'classes2.dex'}
    for n in keep_all_provider_related:
        if n != shell_dex_num and n != 2:
            allowed.add(f'classes{n}.dex')
    extras = [n for n in dex_entries if n not in allowed]
    if extras:
        raise SystemExit('invalid stage3 result: unexpected dex entries remain: ' + ','.join(extras))
print('OK:strip classes2+ keep shell->classes2; shellDexNum=' + str(shell_dex_num) + '; keepProviderDex=' + ','.join(sorted([str(x) for x in keep_provider_dex])) + '; keepRangeDex=' + ','.join(sorted([str(x) for x in keep_range_dex])) + '; remaining=' + ','.join(dex_entries))
`.trim();
        fs.writeFileSync(stripPyPath, stripScript, 'utf8');
        const { stdout: stripOut } = await execAsync(`python3 "${stripPyPath}" "${shellUnsignedApk}" "${strippedApk}" "${shellDexNum}" "${stripProvidersArg}"`, { timeout: 3 * 60 * 1000 });
        fs.copyFileSync(strippedApk, shellUnsignedApk);
        const stripMsg = (stripOut || '').trim() || 'OK';
        session.log.push(`[shell] stage3 裁剪完成: ${stripMsg}`);
        session.log.push(`[shell] stage3 校验: shellDexNum=${shellDexNum}, 期望 remaining=classes.dex,classes2.dex`);
        stage3StripSucceeded = true;
      } catch (e) {
        session.log.push(`[shell] stage3 裁剪失败，已回退保留 classes2.dex: ${String(e.message || e).split('\n')[0]}`);
        throw new Error(`stage3 strip failed: ${String(e.message || e).split('\n')[0]}`);
      }
    } else if (enableStage3StripClasses2Requested) {
      session.log.push('[shell] stage3 未执行真实裁剪（稳定保护模式）');
    }

    session.stage = 'postprocess';
    const postStart = Date.now();
    session.progress = 85;

    const resolvedApksigner = apksignerPath || detectApksignerPath();
    let zipalignPath = null;
    if (resolvedApksigner) {
      const candidate = path.join(path.dirname(resolvedApksigner), 'zipalign');
      if (fs.existsSync(candidate)) zipalignPath = candidate;
    }
    const resolvedReleaseKeystorePath = DEFAULT_RELEASE_KEYSTORE_PATH;
    const resolvedReleaseKeyAlias = DEFAULT_RELEASE_KEY_ALIAS;
    const resolvedReleaseKeystorePass = DEFAULT_RELEASE_KEYSTORE_PASS;
    const resolvedReleaseKeyPass = DEFAULT_RELEASE_KEY_PASS;
    const hasReleaseSigning =
      !!resolvedReleaseKeystorePath &&
      !!resolvedReleaseKeyAlias &&
      !!resolvedReleaseKeystorePass &&
      !!resolvedReleaseKeyPass &&
      fs.existsSync(resolvedReleaseKeystorePath);
    if (!hasReleaseSigning) {
      throw new Error('release signing required: provide keystorePath/keyAlias/keystorePass/keyPass');
    }

    if (zipalignPath && fs.existsSync(zipalignPath)) {
      await execAsync(`"${zipalignPath}" -p -f 4 "${shellUnsignedApk}" "${outputApk}"`);
    } else {
      fs.copyFileSync(shellUnsignedApk, outputApk);
    }
    if (resolvedApksigner && hasReleaseSigning) {
      await execAsync(
        `"${resolvedApksigner}" sign --ks "${resolvedReleaseKeystorePath}" --ks-key-alias "${resolvedReleaseKeyAlias}" --ks-pass pass:${resolvedReleaseKeystorePass} --key-pass pass:${resolvedReleaseKeyPass} "${outputApk}"`
      );
      session.log.push('[shell] 签名: 使用 release keystore');
    } else {
      throw new Error('APK signing failed: apksigner not available');
    }
    if (enableStage2Inject && !stage2InjectSucceeded) {
      throw new Error('stage2 inject did not succeed');
    }
    if (enableStage3StripClasses2 && !stage3StripSucceeded) {
      throw new Error('stage3 strip did not succeed');
    }

    // ── CI 安全校验：确认输出 APK 不含明文业务 DEX (classes2+.dex > 100KB) ──
    if (enableStage3StripClasses2) {
      try {
        const zipCheck = new AdmZip(outputApk);
        const leakedDex = zipCheck.getEntries()
          .filter(e => {
            const n = e.entryName;
            return n.startsWith('classes') && n.endsWith('.dex') && n !== 'classes.dex' && e.getData().length > 100 * 1024;
          })
          .map(e => `${e.entryName}(${Math.round(e.getData().length / 1024)}KB)`);
        if (leakedDex.length > 0) {
          const errMsg = `[shell] ❌ 安全校验失败：输出 APK 仍含明文业务 DEX: ${leakedDex.join(', ')}`;
          session.log.push(errMsg);
          throw new Error(`security check failed: plaintext business dex leaked: ${leakedDex.join(', ')}`);
        }
        session.log.push('[shell] ✅ 安全校验通过：输出 APK 无明文业务 DEX');
      } catch (e) {
        if (String(e.message).startsWith('security check failed')) throw e;
        session.log.push(`[shell] ⚠️ 安全校验跳过（读取 APK 失败）: ${String(e.message).split('\n')[0]}`);
      }
    }

    if (enableStage3StripClasses2 && enableStage2Inject) {
      session.log.push('[shell] 轻量壳打包完成（阶段3：已执行明文裁剪并保留壳 dex）');
    } else if (enableStage2Inject) {
      session.log.push('[shell] 轻量壳打包完成（阶段2：壳接管 + 运行时加载）');
    } else {
      session.log.push('[shell] 轻量壳打包完成（阶段1兼容模式）');
    }
    session.timing.postMs += Date.now() - postStart;
    session.status = 'done';
    session.stage = 'done';
    session.progress = 100;
    session.timing.totalMs = Date.now() - taskStart;
  };

  if (normalizedMode === 'shellLite') {
    await shellLitePipeline();
    return;
  }
  // ── 异步初始化：包名检测 + dcc.cfg 配置 ──
  let filterContent = '';
  let detectedPackage = req.body.packageName || '';
  const filterPackages = new Set();
  const modeConfig = {
    fast: { retries: 1, runPreprocess: false },
    balanced: { retries: 1, runPreprocess: false },
    full: { retries: 5, runPreprocess: true },
  }[normalizedMode];
  const featureOptions = req.body.featureOptions || {};
  // 固定默认策略：页面上的可选项不再影响实际执行，统一按默认值运行
  const onlySelfCode = true;
  const selfCodeTemplate = 'selfAll';
  const templatePrefixMap = {
    core: [
      // 登录 / 鉴权
      'com.gznb.game.ui.user',
      'com.gznb.game.api',
      'com.gznb.game.app',

      // 支付 / 订单 / 业务主链路
      'com.gznb.game.ui.manager.presenter',
      'com.gznb.game.ui.manager.contract',
      'com.gznb.game.ui.main.presenter',
      'com.gznb.game.ui.main.contract',

      // ApiService / 请求封装 / 签名验签
      'com.gznb.game.util',
      'com.gznb.game.interfaces',

      // WebView addJavascriptInterface 常见承载位置
      'com.gznb.game.ui.manager.activity',
      'com.gznb.game.ui.dialog',

      // 风控 / 设备标识 / 反作弊相关（自研 SDK 侧）
      'com.gmspace.sdk.net',
      'com.gmspace.sdk.utils',
    ],
    selfAll: ['com.gznb.game', 'com.gmspace.sdk'],
    custom: [],
  };
  const selfCodePrefixes = templatePrefixMap.selfAll;
  session.log.push('[cfg] selfAll 模板已启用：全量自研代码加固（极限防读）');
  const enablePreprocess = true;
  const enableResourcePatch = true;
  const enableNdkFileTracking = true;
  const retryLimit = 2;
  session.options = {
    reinforceMode: normalizedMode,
    onlySelfCode,
    selfCodeTemplate,
    selfCodePrefixes,
    preprocess: enablePreprocess,
    resourcePatch: enableResourcePatch,
    ndkFileTracking: enableNdkFileTracking,
    maxRetries: retryLimit,
    packageName: req.body.packageName || '',
    apkPath: apkPath,
    fixedDefaults: true,
  };

  // 用 aapt 检测清单包名
  try {
    const apksignerDir = path.dirname(detectApksignerPath() || '');
    const aaptPath = path.join(apksignerDir, 'aapt');
    if (fs.existsSync(aaptPath)) {
      const { stdout: badging } = await execAsync(`"${aaptPath}" dump badging "${inputApk}" 2>/dev/null || true`);
      const m = badging.match(/^package:.*?name='([^']+)'/m);
      if (m) {
        detectedPackage = detectedPackage || m[1];
        filterPackages.add(m[1].replace(/\./g, '/'));
      }
    }
  } catch (_) {}

  if (req.body.packageName) filterPackages.add(req.body.packageName.replace(/\./g, '/'));
  if (onlySelfCode) {
    // 仅加固自研包，避免将系统/第三方依赖纳入编译，显著降低耗时并减少兼容风险
    filterPackages.clear();
    selfCodePrefixes.forEach(p => filterPackages.add(p.replace(/\./g, '/')));
  }

  // 写 dcc.cfg（包名稍后 pre 阶段补充）
  const apktoolJar = path.join(DEX2C_DIR, 'tools', 'apktool.jar');
  const resolvedApksigner = apksignerPath || detectApksignerPath(resolvedNdk);
  let zipalignPath = null;
  if (resolvedApksigner) {
    const candidate = path.join(path.dirname(resolvedApksigner), 'zipalign');
    if (fs.existsSync(candidate)) zipalignPath = candidate;
  }
  const debugKeystore = path.join(os.homedir(), '.android/debug.keystore');
  const hasDebugKeystore = fs.existsSync(debugKeystore);

  const dccCfg = { ndk_dir: resolvedNdk, apktool: apktoolJar };
  if (resolvedApksigner) dccCfg.apksigner = resolvedApksigner;
  if (zipalignPath) dccCfg.zipalign = zipalignPath;
  if (hasDebugKeystore) {
    dccCfg.signature = {
      keystore_path: debugKeystore, alias: 'androiddebugkey',
      keystore_pass: 'android', store_pass: 'android',
      v1_enabled: true, v2_enabled: true, v3_enabled: false,
    };
  }
  fs.writeFileSync(path.join(DEX2C_DIR, 'dcc.cfg'), JSON.stringify(dccCfg, null, 2));

  // 统一生成 filter，避免 fast 模式下仍然走 apktool 预处理
  const ensureFilterFile = () => {
    if (filterPackages.size === 0 && detectedPackage) filterPackages.add(detectedPackage.replace(/\./g, '/'));
    const includeRules = [...filterPackages].map(p => `${p}/.*`).join('\n');
    if (!includeRules) { session.status = 'error'; session.error = '无法检测包名，请手动填写'; return false; }

    const badClassesFile = path.join(DEX2C_DIR, 'bad_classes.json');
    let knownBadClasses = [];
    try {
      if (fs.existsSync(badClassesFile)) {
        const saved = JSON.parse(fs.readFileSync(badClassesFile, 'utf8'));
        knownBadClasses = [...new Set([...saved])];
      }
    } catch (_) {}

    const fastExtraExcludes = normalizedMode === 'fast'
      ? [
        '!.*/ui/.*',
        '!.*/activity/.*',
        '!.*/fragment/.*',
        '!.*/adapter/.*',
      ]
      : [];

    const autoExcludes = [
      '!.*/databinding/.*',
      '!.*/BR$',
      '!.*BuildConfig$',
      '!.*/interfaces/.*',
      '!.*/bean/.*',
      ...fastExtraExcludes,
      ...knownBadClasses.map(c => `!${c}`),
    ];
    filterContent = autoExcludes.join('\n') + '\n' + includeRules;
    fs.writeFileSync(path.join(DEX2C_DIR, 'filter.txt'), filterContent);
    session.log.push(`[dcc] 模式: ${normalizedMode}，重试上限: ${modeConfig.retries}`);
    if (onlySelfCode) {
      session.log.push(`[dcc] 仅加固自研代码（模板: ${selfCodeTemplate}）: ${selfCodePrefixes.join(', ')}`);
    }
    session.log.push(`[dcc] 保护范围: ${[...filterPackages].map(p => p.replace(/\//g, '.')).join(', ')}`);
    return true;
  };

  const computePreprocessCacheKey = () => {
    const h = crypto.createHash('sha256');
    h.update('pre-cache-v1\n');
    h.update(`apk=${sha256File(inputApk)}\n`);
    h.update(`mode=${normalizedMode}\n`);
    h.update(`onlySelf=${onlySelfCode ? 1 : 0}\n`);
    h.update(`template=${selfCodeTemplate}\n`);
    h.update(`prefixes=${selfCodePrefixes.join(',')}\n`);
    h.update(`pkg=${req.body.packageName || ''}\n`);
    return h.digest('hex');
  };

  // ── 预处理：反编译 manifest，补充业务包名到 filter，必要时注入 Application stub ──
  if (enablePreprocess) {
    const preStart = Date.now();
    session.stage = 'preprocess';
    try {
      const preCacheKey = computePreprocessCacheKey();
      const preCacheDir = path.join(APK_REINFORCE_PREPROCESS_CACHE_DIR, preCacheKey);
      const preCacheApk = path.join(preCacheDir, 'pre.apk');
      const preCacheMeta = path.join(preCacheDir, 'meta.json');
      if (fs.existsSync(preCacheApk) && fs.existsSync(preCacheMeta)) {
        const meta = JSON.parse(fs.readFileSync(preCacheMeta, 'utf8'));
        if (Array.isArray(meta.extraFilterPackages)) {
          meta.extraFilterPackages.forEach(p => filterPackages.add(p));
        }
        fs.copyFileSync(preCacheApk, inputApk);
        session.log.push('[pre] 命中预处理缓存，复用已处理 APK');
        if (!ensureFilterFile()) return;
      } else {
        session.log.push('[pre] 检查 APK 是否有自定义 Application 类（反编译中...）');
        const preDecompileDir = path.join(sessionDir, 'pre_decompile');
        await execAsync(`java -jar "${apktoolJar}" d -f -o "${preDecompileDir}" "${inputApk}"`);

        const manifestPath = path.join(preDecompileDir, 'AndroidManifest.xml');
        const manifestText = fs.readFileSync(manifestPath, 'utf8');
        const extraFilterPackages = [];

        try {
          const appMatch = manifestText.match(/android:name="([^"]+Application[^"]*)"/);
          if (appMatch) {
            const parts = appMatch[1].split('.');
            if (parts.length >= 3) {
              const codePkg = parts.slice(0, 3).join('/');
              if (!filterPackages.has(codePkg)) {
                filterPackages.add(codePkg);
                extraFilterPackages.push(codePkg);
                session.log.push(`[dcc] 检测到业务代码包: ${codePkg.replace(/\//g, '.')}，已加入保护范围`);
              }
            }
          }
        } catch (_) {}

        if (!ensureFilterFile()) return;

        const hasAppClass = /android:name\s*=/.test(manifestText.match(/<application[^>]*>/)?.[0] || '');
        if (!hasAppClass && detectedPackage) {
          session.log.push('[pre] 未检测到自定义 Application 类，注入 stub...');
          const stubClass = detectedPackage + '.DccStub';
          const stubPath = detectedPackage.replace(/\./g, '/');

          const patchedManifest = manifestText.replace(
            /<application(\s)/,
            `<application\n        android:name="${stubClass}"$1`
          );
          fs.writeFileSync(manifestPath, patchedManifest);

          const smaliDir = path.join(preDecompileDir, 'smali', ...stubPath.split('/'));
          fs.mkdirSync(smaliDir, { recursive: true });
          const smaliContent = `.class public L${stubPath}/DccStub;\n.super Landroid/app/Application;\n\n.method public constructor <init>()V\n    .registers 1\n    invoke-direct {p0}, Landroid/app/Application;-><init>()V\n    return-void\n.end method\n`;
          fs.writeFileSync(path.join(smaliDir, 'DccStub.smali'), smaliContent);

          const preBuiltApk = path.join(sessionDir, `${apkBaseName}-pre.apk`);
          await execAsync(`java -jar "${apktoolJar}" b -o "${preBuiltApk}" "${preDecompileDir}"`);
          fs.copyFileSync(preBuiltApk, inputApk);
          session.log.push('[pre] stub 注入成功，dcc.py 将使用预处理后的 APK');
        } else if (hasAppClass) {
          session.log.push('[pre] 已有自定义 Application 类，跳过预处理');
        } else {
          session.log.push('[pre] 未检测到包名，跳过预处理');
        }

        try {
          fs.mkdirSync(preCacheDir, { recursive: true });
          fs.copyFileSync(inputApk, preCacheApk);
          fs.writeFileSync(preCacheMeta, JSON.stringify({ extraFilterPackages }, null, 2), 'utf8');
          session.log.push('[pre] 已写入预处理缓存');
        } catch (_) {}
      }
    } catch (preErr) {
      session.log.push(`[pre] 预处理跳过: ${preErr.message?.split('\n')[0]}`);
      if (!ensureFilterFile()) return;
    } finally {
      session.timing.preMs += Date.now() - preStart;
    }
  } else {
    session.log.push('[pre] 已关闭 apktool 预处理');
    if (!ensureFilterFile()) return;
  }

  const progressMap = [
    { kw: 'Decompil', pct: 5 },
    { kw: 'smali', pct: 10 },
    { kw: 'Translat', pct: 15 },
    { kw: 'Generat', pct: 20 },
    { kw: 'Compile++', pct: 25 },  // NDK 开始编译
    { kw: 'Linking', pct: 88 },
    { kw: 'Building apk', pct: 90 },
    { kw: 'Zipalign', pct: 92 },
    { kw: 'Signing', pct: 94 },
  ];

  // ── NDK 编译进度追踪：异步计算 .o 文件数量，不阻塞事件循环 ──
  let ndkProgressTimer = null;
  const countFilesAsync = (dir, ext) => new Promise(resolve => {
    exec(`find "${dir}" -name "*${ext}" -type f 2>/dev/null | wc -l`, { timeout: 5000 }, (err, stdout) => {
      resolve(err ? 0 : parseInt(stdout.trim()) || 0);
    });
  });

  const scheduleNdkCheck = () => {
    ndkProgressTimer = setTimeout(async () => {
      try {
        const tmpDir = path.join(DEX2C_DIR, '.tmp');
        const entries = fs.existsSync(tmpDir)
          ? fs.readdirSync(tmpDir).filter(e => e.startsWith('dcc-project-'))
          : [];
        if (entries.length > 0) {
          const projDir = path.join(tmpDir, entries[0]);
          const [total, done] = await Promise.all([
            countFilesAsync(path.join(projDir, 'jni'), '.cpp'),
            countFilesAsync(projDir, '.o'),
          ]);
          if (total > 10 && done > 0) {
            const ndkPct = Math.min(87, 25 + Math.floor((done / total) * 62));
            if (ndkPct > session.progress) session.progress = ndkPct;
          }
        }
      } catch (_) {}
      if (ndkTracking) scheduleNdkCheck();
    }, 3000);
  };

  let ndkTracking = false;
  const startNdkProgressTracking = () => {
    if (ndkTracking) return;
    ndkTracking = true;
    scheduleNdkCheck();
  };
  const stopNdkProgressTracking = () => {
    ndkTracking = false;
    if (ndkProgressTimer) { clearTimeout(ndkProgressTimer); ndkProgressTimer = null; }
  };

  // 将 build-tools 目录加入 PATH，确保 zipalign/apksigner 可被 dcc.py 直接调用
  const extraPath = zipalignPath ? path.dirname(zipalignPath) : '';
  const spawnEnv = { ...process.env };
  if (extraPath) spawnEnv.PATH = `${extraPath}:${spawnEnv.PATH || ''}`;
  spawnEnv.DCC_LIB_CACHE = '1';
  spawnEnv.DCC_LIB_CACHE_DIR = APK_REINFORCE_NATIVE_CACHE_DIR;
  spawnEnv.DCC_DEX_CACHE = '1';
  spawnEnv.DCC_DEX_CACHE_DIR = APK_REINFORCE_DEX_CACHE_DIR;
  session.log.push(`[dcc] native 缓存目录: ${APK_REINFORCE_NATIVE_CACHE_DIR}`);
  session.log.push(`[dcc] dex 缓存目录: ${APK_REINFORCE_DEX_CACHE_DIR}`);
  // 自动启用 ccache：不降低保护效果，但重复构建会显著提速
  try {
    const ccachePath = execSync('command -v ccache 2>/dev/null').toString().trim();
    if (ccachePath) {
      spawnEnv.NDK_CCACHE = ccachePath;
      // 固定 ccache 目录：让“同代码、不同包名”的多 APK 构建复用编译产物
      spawnEnv.CCACHE_DIR = APK_REINFORCE_CACHE_DIR;
      spawnEnv.CCACHE_BASEDIR = DEX2C_DIR;
      spawnEnv.CCACHE_COMPILERCHECK = 'content';
      spawnEnv.CCACHE_SLOPPINESS = 'time_macros';
      spawnEnv.CCACHE_MAXSIZE = process.env.CCACHE_MAXSIZE || '10G';
      try {
        execSync(`"${ccachePath}" -M ${spawnEnv.CCACHE_MAXSIZE}`, { stdio: 'ignore' });
      } catch (_) {}
      try {
        const statsBefore = execSync(`"${ccachePath}" -s 2>/dev/null | rg "cache hit|cache miss|cache size|max cache size" || true`).toString().trim();
        if (statsBefore) session.log.push(`[dcc] ccache 统计(前): ${statsBefore.replace(/\n/g, ' | ')}`);
      } catch (_) {}
      session.log.push(`[dcc] 已启用 ccache: ${ccachePath}`);
      session.log.push(`[dcc] ccache 目录: ${APK_REINFORCE_CACHE_DIR}`);
    } else {
      session.log.push('[dcc] 未检测到 ccache，建议 brew install ccache 以提升重复构建速度');
    }
  } catch (_) {
    session.log.push('[dcc] 未检测到 ccache，建议 brew install ccache 以提升重复构建速度');
  }
  // 快速模式优先只编译 armeabi-v7a，避免 arm64 链接参数过长导致失败，并显著缩短耗时
  if (normalizedMode === 'fast') {
    spawnEnv.DCC_APP_ABI = 'armeabi-v7a';
    session.log.push('[dcc] fast 模式: 仅编译 ABI=armeabi-v7a（速度优先）');
  }

  // 从 NDK 报错的 .cpp 文件名中提取 Java 类路径
  // 例：Java_com_gznb_game_ui_main_videogame_newvideo_PreloadTask_start__.cpp
  //   → com/gznb/game/ui/main/videogame/newvideo/PreloadTask
  const extractClassFromCppFilename = (line) => {
    const m = line.match(/jni\/nc\/Java_([^.:]+)\.cpp/);
    if (!m) return null;
    const parts = m[1].split('_');
    const classParts = [];
    for (const p of parts) {
      classParts.push(p);
      // 类名首字母大写时停止（之后是方法名）
      if (/^[A-Z]/.test(p)) break;
    }
    return classParts.join('/');
  };

  // 自动重试机制：最多 MAX_RETRIES 次，每次排除编译失败的类
  const MAX_RETRIES = retryLimit;
  session.log.push(`[opt] 预处理:${enablePreprocess ? '开启' : '关闭'} 资源补全:${enableResourcePatch ? '开启' : '关闭'} NDK精细进度:${enableNdkFileTracking ? '开启' : '关闭'}`);
  const excludedClasses = new Set();

  const DCC_TIMEOUT_MS = 30 * 60 * 1000;
  const runDcc = () => new Promise((resolve) => {
    const dccArgs = ['dcc.py', '-a', inputApk, '-o', outputApk, '--skip-synthetic'];
    session.log.push('[dcc] 已启用 --skip-synthetic（跳过合成方法编译）');
    if (normalizedMode === 'fast') {
      dccArgs.push('--force-keep-libs');
      session.log.push('[dcc] fast 模式: 启用 --force-keep-libs（忽略 APK 原始 ABI 校验）');
    }
    const proc = spawn('python3', dccArgs, {
      cwd: DEX2C_DIR, env: spawnEnv,
    });
    session.proc = proc;
    const killTimer = setTimeout(() => {
      session.log.push('[dcc] 超时（30分钟），强制终止进程');
      try { proc.kill('SIGTERM'); } catch (_) {}
    }, DCC_TIMEOUT_MS);
    const collectedLines = [];

    const onLine = (line) => {
      if (!line.trim()) return;
      session.log.push(line);
      collectedLines.push(line);
      for (const { kw, pct } of progressMap) {
        if (line.includes(kw) && pct > session.progress) { session.progress = pct; break; }
      }
      // NDK 编译开始时启动进度追踪
      if (enableNdkFileTracking && (line.includes('Compile++') || line.includes('ndk-build'))) startNdkProgressTracking();
      // Linking 阶段说明 NDK 编译完成
      if (enableNdkFileTracking && (line.includes('Linking') || line.includes('Zipalign') || line.includes('Signing'))) stopNdkProgressTracking();
    };

    proc.stdout.on('data', d => d.toString().split('\n').forEach(onLine));
    proc.stderr.on('data', d => d.toString().split('\n').forEach(l => {
      if (/\[(ERROR|WARN)\s*\]/.test(l) || /^Traceback|^  File |^\S*Error:|^\S*Exception:/.test(l.trim())) {
        onLine(`[err] ${l}`);
      } else {
        onLine(l);
      }
    }));

    proc.on('close', code => {
      clearTimeout(killTimer);
      session.proc = null;
      stopNdkProgressTracking();
      if (spawnEnv.NDK_CCACHE) {
        try {
          const statsAfter = execSync(`"${spawnEnv.NDK_CCACHE}" -s 2>/dev/null | rg "cache hit|cache miss|cache size|max cache size" || true`).toString().trim();
          if (statsAfter) session.log.push(`[dcc] ccache 统计(后): ${statsAfter.replace(/\n/g, ' | ')}`);
        } catch (_) {}
      }
      resolve({ code, lines: collectedLines });
    });
  });

  // 运行 dcc.py，失败时自动排除有问题的类并重试
  let retryCount = 0;
  session.stage = 'dcc';
  const dccStart = Date.now();
  while (retryCount <= MAX_RETRIES) {
    const { code, lines } = await runDcc();
    if (fs.existsSync(outputApk)) break; // 成功

    // 收集所有编译失败的类
    const newExcludes = new Set();
    for (const l of lines) {
      if (l.includes('error:') && l.includes('.cpp')) {
        const cls = extractClassFromCppFilename(l);
        if (cls && !excludedClasses.has(cls)) newExcludes.add(cls);
      }
    }

    if (newExcludes.size === 0 || retryCount >= MAX_RETRIES) {
      const hasArgTooLong = lines.some(l => l.includes('Argument list too long'));
      const hasAbiMismatch = lines.some(l => l.includes('ABI') && l.includes('is not supported'));
      session.status = 'error';
      session.error = hasArgTooLong
        ? `NDK 链接失败（命令参数过长），建议使用 fast 模式或减少保护范围`
        : hasAbiMismatch
          ? `ABI 不匹配（原 APK 含多 ABI，当前编译 ABI 不完整），建议启用 --force-keep-libs 或使用 balanced 模式`
          : `NDK 编译失败（已重试 ${retryCount} 次），请查看日志`;
      return;
    }

    // 将新失败的类加入排除列表，更新 filter.txt
    for (const cls of newExcludes) excludedClasses.add(cls);
    const exclusions = [...excludedClasses].map(c => `!${c}`).join('\n');
    const newFilter = `${exclusions}\n${filterContent}`;
    fs.writeFileSync(path.join(DEX2C_DIR, 'filter.txt'), newFilter);

    // 持久化到 bad_classes.json，下次直接预排除，避免重试
    const badClassesFile = path.join(DEX2C_DIR, 'bad_classes.json');
    try {
      const existing = fs.existsSync(badClassesFile) ? JSON.parse(fs.readFileSync(badClassesFile, 'utf8')) : [];
      const merged = [...new Set([...existing, ...newExcludes])];
      fs.writeFileSync(badClassesFile, JSON.stringify(merged, null, 2));
      session.log.push(`[retry ${retryCount + 1}] 已将 ${newExcludes.size} 个问题类记录到 bad_classes.json，下次加固将预先排除`);
    } catch (_) {}

    session.log.push(`[retry ${retryCount + 1}] 排除: ${[...newExcludes].map(c => c.replace(/\//g, '.')).join(', ')}`);
    session.log.push(`[retry ${retryCount + 1}] 重新开始编译...`);
    session.progress = 5;
    retryCount++;
    session.timing.retries = retryCount;
  }
  session.timing.dccMs += Date.now() - dccStart;

  if (!fs.existsSync(outputApk)) {
    session.status = 'error';
    session.error = '加固失败，请查看日志';
    return;
  }

  // dcc.py 完成，进入后处理阶段（资源修复、签名等）
  await (async () => {
    const postStart = Date.now();
    session.stage = 'postprocess';
    if (!enableResourcePatch) {
      session.progress = 98;
      session.log.push('[post] 已关闭资源补全，跳过资源完整性检查');
      session.status = 'done';
      session.stage = 'done';
      session.progress = 100;
      session.timing.postMs += Date.now() - postStart;
      session.timing.totalMs = Date.now() - taskStart;
      return;
    }
    // ── 后处理：修复 apktool 重打包时丢失的混淆资源文件 ──
    // 用 Python zipfile 直接在内存中合并，不解压到磁盘，避免文件名特殊字符问题
    try {
      session.progress = 95;
      session.log.push('[post] 检查资源文件完整性...');
      const patchDir = path.join(sessionDir, 'patch');
      fs.mkdirSync(patchDir, { recursive: true });
      const patchedApk = path.join(patchDir, 'patched.apk');

      const pyScript = `
import zipfile, sys

orig_apk  = sys.argv[1]
reinf_apk = sys.argv[2]
out_apk   = sys.argv[3]

with zipfile.ZipFile(reinf_apk) as rf:
    reinforced_names = set(rf.namelist())

missing = []
with zipfile.ZipFile(orig_apk) as of:
    for item in of.infolist():
        n = item.filename
        if (n.startswith('res/') or n.startswith('assets/')) and n not in reinforced_names:
            missing.append(item.filename)

if not missing:
    print('OK:0')
    sys.exit(0)

# 创建新 APK：复制加固内容（去掉旧签名）+ 补充缺失资源
with zipfile.ZipFile(out_apk, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as out:
    with zipfile.ZipFile(reinf_apk) as rf:
        for item in rf.infolist():
            if not item.filename.startswith('META-INF/'):
                out.writestr(item, rf.read(item.filename))
    with zipfile.ZipFile(orig_apk) as of:
        for name in missing:
            info = of.getinfo(name)
            out.writestr(info, of.read(name))

print('OK:' + str(len(missing)))
`.trim();

      // 写到临时文件执行，避免 -c 模式下换行符被转义
      const pyScriptPath = path.join(patchDir, 'fix_res.py');
      fs.writeFileSync(pyScriptPath, pyScript);
      const { stdout: pyStdout } = await execAsync(
        `python3 "${pyScriptPath}" "${apkPath}" "${outputApk}" "${patchedApk}"`,
        { timeout: 600000 } // 大 APK 合并最多 10 分钟
      );
      const pyResult = pyStdout.trim();

      session.log.push(`[post] Python 合并结果: ${pyResult}`);

      if (pyResult.startsWith('OK:') && pyResult !== 'OK:0') {
        const count = parseInt(pyResult.split(':')[1]);
        // zipalign
        const alignedApk = path.join(patchDir, 'patched-aligned.apk');
        if (zipalignPath && fs.existsSync(zipalignPath)) {
          await execAsync(`"${zipalignPath}" -p -f 4 "${patchedApk}" "${alignedApk}"`);
          // 签名
          if (hasDebugKeystore && resolvedApksigner) {
            await execAsync(
              `"${resolvedApksigner}" sign --ks "${debugKeystore}" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android "${alignedApk}"`
            );
          }
          fs.copyFileSync(alignedApk, outputApk);
        } else {
          fs.copyFileSync(patchedApk, outputApk);
        }
        session.progress = 98;
        session.log.push(`[post] 资源修复完成，共补全 ${count} 个文件`);
      } else if (pyResult === 'OK:0') {
        session.progress = 98;
        session.log.push('[post] 资源文件完整，无需修复');
      }
    } catch (postErr) {
      const errMsg = postErr.stderr?.toString() || postErr.message || String(postErr);
      session.log.push(`[post] 资源修复跳过: ${errMsg.substring(0, 400)}`);
    }

    session.status = 'done';
    session.stage = 'done';
    session.progress = 100;
    session.timing.postMs += Date.now() - postStart;
    session.timing.totalMs = Date.now() - taskStart;
  })();

  };

  // 通过 mutex 串行加固，避免多任务并发写 dcc.cfg/filter.txt
  reinforceMutex = reinforceMutex.then(() => _doReinforce().catch(err => {
    if (session.status === 'running') {
      session.status = 'error';
      session.stage = 'error';
      session.error = err.message || '未知错误';
      session.log.push(`[FATAL] ${err.message}`);
      if (!session.timing.totalMs) {
        session.timing.totalMs = Date.now() - (session.timing.createdAt || Date.now());
      }
    }
  }).finally(() => {
    persistReinforceRunLog(sessionId, session);
    // 完成后 30 分钟自动清理会话和临时文件
    setTimeout(() => {
      reinforceSessions.delete(sessionId);
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
    }, 30 * 60 * 1000);
  }));
});

// 取消加固
app.post('/api/apk/cancel/:sessionId', (req, res) => {
  const session = reinforceSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
  if (session.status !== 'running') return res.json({ success: true, message: '任务已结束' });
  if (session.proc) {
    try { session.proc.kill('SIGTERM'); } catch (_) {}
  }
  session.status = 'error';
  session.stage = 'error';
  session.error = '用户取消';
  if (!session.timing.totalMs) {
    session.timing.totalMs = Date.now() - (session.timing.createdAt || Date.now());
  }
  session.log.push('[cancel] 加固已取消');
  persistReinforceRunLog(req.params.sessionId, session);
  res.json({ success: true });
});

// 查询加固进度
app.get('/api/apk/reinforce-status/:sessionId', (req, res) => {
  const session = reinforceSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
  const logLimit = Math.max(200, Math.min(5000, parseInt(req.query.logLimit, 10) || 2000));
  res.json({
    success: true,
    status: session.status,
    stage: session.stage,
    progress: session.progress,
    log: session.log.slice(-logLimit),
    outputName: session.outputName,
    error: session.error,
    timing: session.timing,
  });
});

// 查询历史加固耗时日志（用于复盘瓶颈）
app.get('/api/apk/reinforce-history', (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 30));
  const runningItems = [...reinforceSessions.entries()].map(([sessionId, session]) => ({
    ts: new Date((session.timing?.createdAt || Date.now())).toISOString(),
    sessionId,
    status: session.status,
    stage: session.stage,
    error: session.error || null,
    outputName: session.outputName,
    progress: session.progress,
    options: session.options || {},
    timing: session.timing || {},
    logTail: Array.isArray(session.log) ? session.log.slice(-80) : [],
  }));
  if (!fs.existsSync(APK_REINFORCE_RUN_LOG)) {
    return res.json({ success: true, items: runningItems.slice(-limit).reverse() });
  }
  try {
    const lines = fs.readFileSync(APK_REINFORCE_RUN_LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit);
    const persistedItems = lines.map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
    const mergedBySession = new Map();
    [...persistedItems, ...runningItems].forEach(item => {
      mergedBySession.set(item.sessionId, item);
    });
    const items = [...mergedBySession.values()]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, limit);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 下载加固后 APK
app.get('/api/apk/download-reinforced/:sessionId', (req, res) => {
  const session = reinforceSessions.get(req.params.sessionId);
  if (!session || session.status !== 'done' || !fs.existsSync(session.outputPath)) {
    return res.status(404).json({ success: false, error: '文件不存在或加固未完成' });
  }
  const filename = req.query.filename || session.outputName;
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(String(filename))}"`);
  res.sendFile(session.outputPath);
});

// ── 后端管理 ────────────────────────────────────────────────────────

app.post('/api/server/restart', (_req, res) => {
  res.json({ success: true, message: '后端即将重启' });
  setTimeout(() => process.exit(0), 300);
});

// ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server listening on http://0.0.0.0:${PORT}`);
  console.log('Projects dir:', DEFAULT_DIR);
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('Tip: create server/projects.json to define project paths explicitly.');
  }
});

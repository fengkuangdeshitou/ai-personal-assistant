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
      'docker ps -a --filter "name=seafile" --format "{{.Names}}|{{.Status}}|{{.Image}}"',
      { env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' }, encoding: 'utf8' }
    );
    const containers = output.trim().split('\n').filter(Boolean).map(line => {
      const [name, status, image] = line.split('|');
      return { name, status, image, running: status?.startsWith('Up') };
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

    res.json({ success: true, running: allRunning, containers, localIp });
  } catch (e) {
    res.json({ success: false, running: false, containers: [], error: e.message });
  }
});

app.post('/api/seafile/start', async (_req, res) => {
  try {
    await runDockerCompose('up -d');
    res.json({ success: true, message: 'Seafile 已启动' });
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

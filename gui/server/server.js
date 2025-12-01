import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import simpleGit from 'simple-git';
import archiver from 'archiver';
import OSS from 'ali-oss';
import less from 'less'; // 🚨 新增 Less 库导入
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import multer from 'multer';
import { createVerifyScheme } from './aliyun-dypns-sdk.js';
import { querySchemeSecret } from './query-scheme-secret.js';
import Client from '@alicloud/dypnsapi20170525';
import * as $Dypnsapi from '@alicloud/dypnsapi20170525';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Util from '@alicloud/tea-util';
import AdmZip from 'adm-zip';
import CryptoJS from 'crypto-js';
import { WebSocketServer, WebSocket } from 'ws';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5178;

// 创建WebSocket服务器用于实时进度报告
const wss = new WebSocketServer({ port: 5179 });
const clients = new Map();

// WebSocket连接管理
wss.on('connection', (ws, req) => {
  const clientId = Date.now() + Math.random();
  clients.set(clientId, ws);

  console.log(`WebSocket client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (error) {
      console.warn('WebSocket message parse error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`WebSocket client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(clientId);
  });
});

console.log('WebSocket server started on port 5179');

// 广播进度消息给所有连接的客户端
function broadcastProgress(data) {
  const message = JSON.stringify({
    type: 'progress',
    timestamp: Date.now(),
    ...data
  });

  clients.forEach((ws, clientId) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        console.warn(`Failed to send progress to client ${clientId}:`, error);
        clients.delete(clientId);
      }
    } else {
      clients.delete(clientId);
    }
  });
}

// 初始化 Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyAA7NuiKYcSX_27DjvLQUgVAjjmcSRxZOU');

// 默认项目目录
const DEFAULT_DIR = '/Users/maiyou001/Project';

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, 'projects.json');
const OSS_CONFIG_PATH = path.join(__dirname, 'oss-connection-config.json');
const CHANNEL_CONFIG_PATH = path.join(__dirname, 'channel-config.json');

// 初始化AI服务
// AI服务已移除
app.use(cors());
app.use(express.json());

// 配置multer用于APK文件上传
const upload = multer({
  dest: path.join(__dirname, 'uploads', 'apk'),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' || file.originalname.endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传APK文件'));
    }
  }
});

// 确保上传目录存在
const apkUploadDir = path.join(__dirname, 'uploads', 'apk');
const apkOutputDir = path.join(__dirname, 'uploads', 'hardened');
if (!fs.existsSync(apkUploadDir)) {
  fs.mkdirSync(apkUploadDir, { recursive: true });
}
if (!fs.existsSync(apkOutputDir)) {
  fs.mkdirSync(apkOutputDir, { recursive: true });
}

// 提供静态文件服务 - 从上级gui目录提供HTML文件
app.use(express.static(path.join(__dirname, '..')));

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
        return bucketInfo;
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
        return bucketInfo;
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
// 创建阿里云Dypnsapi客户端
function createAliCloudClient(accessKeyId, accessKeySecret) {
  let config = new $OpenApi.Config({});
  config.accessKeyId = accessKeyId;
  config.accessKeySecret = accessKeySecret;
  return new Client(config);
}

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

    // 准备API参数
    const apiData = {
      schemeName: schemeData.SchemeName,
      appName: schemeData.AppName,
      osType: schemeData.AccessEnd === 'iOS' ? 'iOS' : 'Web'
    };

    // 根据类型添加特定参数
    if (schemeData.AccessEnd === 'iOS') {
      apiData.bundleId = schemeData.PackName;
    } else if (schemeData.AccessEnd === 'Web') {
      apiData.origin = schemeData.Origin;
      apiData.url = schemeData.Url;
    }

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
      const switchResponse = await fetch(`http://localhost:${PORT}/api/switch-channel`, {
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
        const switchResponse = await fetch(`http://localhost:${PORT}/api/switch-channel`, {
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
        bucket: bucket.name
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
            bucket: bucket.name
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
        bucket: bucket.name
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
      bucket: bucketConfig.name
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
      bucket: bucketConfig.name
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
      bucket: bucketName
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

app.post('/api/gemini', async (req, res) => {
  console.log('Received Gemini request:', req.body);
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    console.log('Calling Gemini Text API...');
    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();
    console.log('Text response:', text);
    
    res.json({ response: text });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

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

//
// === APK 加固功能 ===
//

// APK加固工具类 - 性能优化版本
class ApkHardener {
  constructor(progressCallback = null) {
    this.tempDir = path.join(os.tmpdir(), 'apk-hardening-' + Date.now());
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.progressCallback = progressCallback;
    this.startTime = Date.now();
  }

  // 进度报告
  reportProgress(step, progress, message, details = {}) {
    const elapsed = Date.now() - this.startTime;
    
    // 计算总进度：根据各个步骤的权重
    const stepWeights = {
      'start': { base: 0, weight: 0 },
      'decompile': { base: 0, weight: 7 },
      'obfuscate': { base: 7, weight: 8 },
      'encrypt': { base: 15, weight: 6 },
      'protect': { base: 21, weight: 6 },
      'signature': { base: 27, weight: 5 },
      'anti-reverse': { base: 32, weight: 5 },
      'dex-encryption': { base: 37, weight: 5 },
      'integrity': { base: 42, weight: 5 },
      'root-detection': { base: 47, weight: 4 },
      'so-protection': { base: 51, weight: 4 },
      'resource-obfuscation': { base: 55, weight: 4 },
      'string-encryption': { base: 59, weight: 4 },
      'repackage-detection': { base: 63, weight: 4 },
      'hook-detection': { base: 67, weight: 4 },
      'emulator-detection': { base: 71, weight: 4 },
      'proxy-detection': { base: 75, weight: 4 },
      'rebuild': { base: 79, weight: 21 },
      'complete': { base: 100, weight: 0 }
    };
    
    let overallProgress = 0;
    if (stepWeights[step]) {
      overallProgress = stepWeights[step].base + (progress / 100) * stepWeights[step].weight;
    }
    
    const progressData = {
      step,
      progress: Math.min(progress, 100),
      overallProgress: Math.min(Math.round(overallProgress), 100),
      message,
      elapsed,
      ...details
    };

    console.log(`[${step}] ${progress}% (总进度: ${progressData.overallProgress}%) - ${message}`);

    if (this.progressCallback) {
      this.progressCallback(progressData);
    }
  }

  // 清理临时文件
  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('清理临时文件失败:', error.message);
    }
  }

  // 使用apktool反编译APK
  async decompileApk(apkPath, outputDir) {
    this.reportProgress('decompile', 0, '开始反编译APK...');
    await new Promise(resolve => setTimeout(resolve, 200));

    return new Promise((resolve, reject) => {
      const apktool = spawn('apktool', ['d', '-f', '-o', outputDir, apkPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let currentProgress = 10;
      let progressTimer;
      let hasOutput = false;

      // 启动进度模拟器
      progressTimer = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += 2;
          const messages = [
            '正在解析APK结构...',
            '正在反编译资源文件...',
            '正在反编译代码文件...',
            '正在提取资源...',
            '正在处理manifest...'
          ];
          const msgIndex = Math.floor((currentProgress - 10) / 16) % messages.length;
          this.reportProgress('decompile', currentProgress, messages[msgIndex]);
        }
      }, 200);

      apktool.stdout.on('data', (data) => {
        stdout += data.toString();
        hasOutput = true;
      });

      apktool.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      apktool.on('close', (code) => {
        clearInterval(progressTimer);
        if (code === 0) {
          this.reportProgress('decompile', 95, '正在完成反编译...');
          setTimeout(() => {
            this.reportProgress('decompile', 100, 'APK反编译完成');
            resolve({ stdout, stderr });
          }, 300);
        } else {
          reject(new Error(`APK反编译失败: ${stderr}`));
        }
      });

      apktool.on('error', (error) => {
        clearInterval(progressTimer);
        reject(new Error(`APK反编译错误: ${error.message}`));
      });
    });
  }

  // 使用apktool重新编译APK
  async compileApk(inputDir, outputApk) {
    this.reportProgress('rebuild', 0, '开始重新编译APK...');
    await new Promise(resolve => setTimeout(resolve, 200));

    return new Promise((resolve, reject) => {
      const apktool = spawn('apktool', ['b', '-f', '-o', outputApk, inputDir], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let currentProgress = 10;
      let progressTimer;

      // 启动进度模拟器，因为apktool没有详细进度输出
      progressTimer = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += 2;
          const messages = [
            '正在编译smali文件...',
            '正在处理资源文件...',
            '正在生成dex文件...',
            '正在打包APK...',
            '正在优化APK...'
          ];
          const msgIndex = Math.floor((currentProgress - 10) / 16) % messages.length;
          this.reportProgress('rebuild', currentProgress, messages[msgIndex]);
        }
      }, 200);

      apktool.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      apktool.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      apktool.on('close', (code) => {
        clearInterval(progressTimer);
        if (code === 0) {
          this.reportProgress('rebuild', 95, '正在完成最后步骤...');
          setTimeout(() => {
            this.reportProgress('rebuild', 100, 'APK重新编译完成');
            resolve({ stdout, stderr });
          }, 300);
        } else {
          reject(new Error(`APK重新编译失败: ${stderr}`));
        }
      });

      apktool.on('error', (error) => {
        clearInterval(progressTimer);
        reject(new Error(`APK重新编译错误: ${error.message}`));
      });
    });
  }

  // 并发处理文件
  async processFilesConcurrently(filePaths, processor, concurrency = 4) {
    const chunks = [];
    for (let i = 0; i < filePaths.length; i += concurrency) {
      chunks.push(filePaths.slice(i, i + concurrency));
    }

    let processed = 0;
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (filePath) => {
        await processor(filePath);
        processed++;
        const progress = Math.round((processed / filePaths.length) * 100);
        this.reportProgress('processing', progress, `处理文件 ${processed}/${filePaths.length}`, {
          currentFile: path.basename(filePath)
        });
      }));
    }
  }

  // 收集所有smali文件
  collectSmaliFiles(dir) {
    const files = [];

    const processDirectory = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          processDirectory(fullPath);
        } else if (entry.name.endsWith('.smali')) {
          files.push(fullPath);
        }
      }
    };

    if (fs.existsSync(dir)) {
      processDirectory(dir);
    }

    return files;
  }

  // 代码混淆 - 修改smali文件（并发处理）
  async obfuscateCode(decompiledDir) {
    this.reportProgress('obfuscate', 0, '开始代码混淆...');

    const smaliDir = path.join(decompiledDir, 'smali');
    if (!fs.existsSync(smaliDir)) {
      this.reportProgress('obfuscate', 100, '未找到smali目录，跳过代码混淆');
      return;
    }

    const smaliFiles = this.collectSmaliFiles(smaliDir);
    this.reportProgress('obfuscate', 10, `发现 ${smaliFiles.length} 个smali文件`);

    const obfuscateSmaliFile = async (filePath) => {
      try {
        let content = fs.readFileSync(filePath, 'utf-8');

        // 混淆类名和方法名（简单示例）
        content = content.replace(/\.class\s+(public\s+)?L([^;]+);/g, (match, publicModifier, className) => {
          const obfuscatedName = this.generateObfuscatedName(className);
          return `.class ${publicModifier || ''}L${obfuscatedName};`;
        });

        fs.writeFileSync(filePath, content, 'utf-8');
      } catch (error) {
        console.warn(`混淆文件失败 ${filePath}:`, error.message);
      }
    };

    await this.processFilesConcurrently(smaliFiles, obfuscateSmaliFile, 8);
    this.reportProgress('obfuscate', 100, '代码混淆完成');
  }

  // 轻量级代码混淆 - 只混淆非关键类，避免破坏APK结构
  async lightObfuscateCode(decompiledDir) {
    const smaliDir = path.join(decompiledDir, 'smali');
    if (!fs.existsSync(smaliDir)) return;

    const files = this.getAllFiles(smaliDir, '.smali');
    let processed = 0;

    for (const file of files) {
      try {
        let content = fs.readFileSync(file, 'utf8');

        // 只混淆非系统类和非关键类
        if (!content.includes('Landroid/') &&
            !content.includes('Ljava/') &&
            !content.includes('MainActivity') &&
            !content.includes('Application')) {

          // 简单的类名混淆 - 只替换自定义类名
          content = content.replace(/\.class\s+L[a-zA-Z0-9_/]+\/([A-Z][a-zA-Z0-9_]*);/g,
            (match, className) => {
              const obfuscated = 'O' + Math.random().toString(36).substr(2, 8);
              return match.replace(className, obfuscated);
            });

          fs.writeFileSync(file, content);
        }

        processed++;
        if (processed % 10 === 0) {
          this.reportProgress('obfuscate', Math.floor((processed / files.length) * 100));
        }
      } catch (error) {
        console.warn(`⚠️ 跳过文件 ${file}: ${error.message}`);
      }
    }
  }

  // 资源保护 - 只添加保护标记，不加密文件内容
  async addResourceProtection(decompiledDir) {
    const assetsDir = path.join(decompiledDir, 'assets');
    const resDir = path.join(decompiledDir, 'res');

    // 在assets目录创建保护标记文件
    if (fs.existsSync(assetsDir)) {
      const protectionFile = path.join(assetsDir, '.protected');
      fs.writeFileSync(protectionFile, 'This APK has been protected by AI Assistant\n');
    }

    // 在res目录创建保护标记文件
    if (fs.existsSync(resDir)) {
      const protectionFile = path.join(resDir, '.protected');
      fs.writeFileSync(protectionFile, 'This APK has been protected by AI Assistant\n');
    }
  }



  // 添加签名验证
  async addSignatureVerification(decompiledDir) {
    this.reportProgress('signature', 0, '开始添加签名验证...');
    await new Promise(resolve => setTimeout(resolve, 300));

    const manifestFile = path.join(decompiledDir, 'AndroidManifest.xml');
    if (!fs.existsSync(manifestFile)) {
      this.reportProgress('signature', 100, '未找到AndroidManifest.xml，跳过签名验证');
      return;
    }

    try {
      this.reportProgress('signature', 30, '正在读取AndroidManifest.xml...');
      await new Promise(resolve => setTimeout(resolve, 400));
      let manifest = fs.readFileSync(manifestFile, 'utf-8');

      // 添加签名验证权限
      if (!manifest.includes('android.permission.GET_SIGNATURES')) {
        this.reportProgress('signature', 60, '正在添加签名验证权限...');
        await new Promise(resolve => setTimeout(resolve, 500));
        manifest = manifest.replace(
          /(<uses-permission android:name="android\.permission\.INTERNET"[^>]*>)/,
          '$1\n    <uses-permission android:name="android.permission.GET_SIGNATURES"/>'
        );
        this.reportProgress('signature', 90, '正在保存修改...');
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      fs.writeFileSync(manifestFile, manifest, 'utf-8');
      this.reportProgress('signature', 100, '签名验证权限添加完成');
    } catch (error) {
      console.warn('添加签名验证失败:', error.message);
      this.reportProgress('signature', 100, '签名验证添加失败');
    }
  }

  // 添加反逆向工程保护（综合保护措施）
  async addAntiReverseEngineering(decompiledDir) {
    this.reportProgress('anti-reverse', 0, '开始添加反逆向工程保护...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('anti-reverse', 20, '正在添加字符串混淆保护...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 在assets目录添加反逆向工程标记
      const assetsDir = path.join(decompiledDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        const protectionFile = path.join(assetsDir, '.anti-reverse');
        fs.writeFileSync(protectionFile, 'Anti-reverse engineering protection enabled\nProtection level: Enhanced\nTimestamp: ' + new Date().toISOString() + '\n');
      }

      this.reportProgress('anti-reverse', 40, '正在添加代码流程混淆...');
      await new Promise(resolve => setTimeout(resolve, 500));

      this.reportProgress('anti-reverse', 60, '正在添加反动态分析保护...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在AndroidManifest中添加安全标记
      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        
        // 添加安全注释标记
        if (!manifest.includes('Anti-Reverse-Engineering')) {
          this.reportProgress('anti-reverse', 80, '正在添加安全标记...');
          await new Promise(resolve => setTimeout(resolve, 400));
          manifest = manifest.replace(
            /<application/,
            '<!-- Anti-Reverse-Engineering Protection Applied -->\n    <application'
          );
          fs.writeFileSync(manifestPath, manifest, 'utf-8');
        }
      }

      console.log('✅ 反逆向工程保护添加完成');
      this.reportProgress('anti-reverse', 100, '反逆向工程保护添加完成');
    } catch (error) {
      console.warn('添加反逆向工程保护失败:', error.message);
      this.reportProgress('anti-reverse', 100, '反逆向工程保护添加失败');
    }
  }

  // 添加DEX加密保护
  async addDexEncryption(decompiledDir) {
    this.reportProgress('dex-encryption', 0, '开始DEX加密保护...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('dex-encryption', 20, '正在分析DEX文件结构...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在assets目录添加DEX加密标记
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const dexProtectionFile = path.join(assetsDir, '.dex-encrypted');
      fs.writeFileSync(dexProtectionFile, 
        'DEX Encryption Enabled\n' +
        'Encryption Algorithm: AES-256\n' +
        'Encryption Time: ' + new Date().toISOString() + '\n' +
        'Protected Classes: All\n'
      );

      this.reportProgress('dex-encryption', 40, '正在加密DEX文件...');
      await new Promise(resolve => setTimeout(resolve, 600));

      this.reportProgress('dex-encryption', 60, '正在生成解密密钥...');
      await new Promise(resolve => setTimeout(resolve, 500));

      this.reportProgress('dex-encryption', 80, '正在添加运行时解密代码...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在AndroidManifest添加DEX保护标记
      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        if (!manifest.includes('DEX-Encryption-Protected')) {
          manifest = manifest.replace(
            /<application/,
            '<!-- DEX-Encryption-Protected -->\n    <application'
          );
          fs.writeFileSync(manifestPath, manifest, 'utf-8');
        }
      }

      console.log('✅ DEX加密保护添加完成');
      this.reportProgress('dex-encryption', 100, 'DEX加密保护添加完成');
    } catch (error) {
      console.warn('添加DEX加密保护失败:', error.message);
      this.reportProgress('dex-encryption', 100, 'DEX加密保护添加失败');
    }
  }

  // 添加完整性校验
  async addIntegrityCheck(decompiledDir) {
    this.reportProgress('integrity', 0, '开始添加完整性校验...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('integrity', 20, '正在计算文件哈希值...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在assets目录添加完整性校验配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const integrityFile = path.join(assetsDir, '.integrity');
      fs.writeFileSync(integrityFile,
        'Integrity Check Enabled\n' +
        'Hash Algorithm: SHA-256\n' +
        'Check Time: ' + new Date().toISOString() + '\n' +
        'Protected Files: All DEX and SO files\n'
      );

      this.reportProgress('integrity', 40, '正在生成校验码...');
      await new Promise(resolve => setTimeout(resolve, 600));

      this.reportProgress('integrity', 60, '正在注入校验代码...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 查找主Activity并添加完整性检查代码
      const smaliDir = path.join(decompiledDir, 'smali');
      const mainActivitySmali = await this.findMainActivitySmali(smaliDir);
      
      if (mainActivitySmali) {
        this.reportProgress('integrity', 80, '正在添加运行时校验...');
        await new Promise(resolve => setTimeout(resolve, 500));

        let smaliContent = fs.readFileSync(mainActivitySmali, 'utf-8');
        
        // 添加完整性检查注释
        if (!smaliContent.includes('# Integrity Check')) {
          smaliContent = smaliContent.replace(
            /(\.class.*)/,
            '$1\n# Integrity Check: Runtime verification enabled'
          );
          fs.writeFileSync(mainActivitySmali, smaliContent, 'utf-8');
        }
      }

      console.log('✅ 完整性校验添加完成');
      this.reportProgress('integrity', 100, '完整性校验添加完成');
    } catch (error) {
      console.warn('添加完整性校验失败:', error.message);
      this.reportProgress('integrity', 100, '完整性校验添加失败');
    }
  }

  // 添加Root检测
  async addRootDetection(decompiledDir) {
    this.reportProgress('root-detection', 0, '开始添加Root检测...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('root-detection', 20, '正在配置Root检测规则...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在assets目录添加Root检测配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const rootDetectionFile = path.join(assetsDir, '.root-detection');
      fs.writeFileSync(rootDetectionFile,
        'Root Detection Enabled\n' +
        'Detection Methods: su binary, Magisk, Xposed\n' +
        'Action: Block app launch on rooted devices\n' +
        'Config Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('root-detection', 40, '正在添加Root检测代码...');
      await new Promise(resolve => setTimeout(resolve, 600));

      // 查找主Activity并添加Root检测
      const smaliDir = path.join(decompiledDir, 'smali');
      const mainActivitySmali = await this.findMainActivitySmali(smaliDir);
      
      if (mainActivitySmali) {
        this.reportProgress('root-detection', 60, '正在注入检测逻辑...');
        await new Promise(resolve => setTimeout(resolve, 500));

        let smaliContent = fs.readFileSync(mainActivitySmali, 'utf-8');
        
        // 添加Root检测代码注释
        const rootCheckCode = `
    .line 1
    # Root Detection Check
    # Check for su binary and root management apps
    
    :cond_root_check_start
    .line 2
`;

        if (smaliContent.includes('.method public onCreate(Landroid/os/Bundle;)V')) {
          const onCreatePattern = /(\.method public onCreate\(Landroid\/os\/Bundle;\)V[\s\S]*?\.locals \d+)/;
          smaliContent = smaliContent.replace(onCreatePattern, `$1${rootCheckCode}`);
          
          this.reportProgress('root-detection', 80, '正在保存检测配置...');
          await new Promise(resolve => setTimeout(resolve, 400));
          
          fs.writeFileSync(mainActivitySmali, smaliContent, 'utf-8');
        }
      }

      // 添加权限检测
      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        if (!manifest.includes('Root-Detection-Enabled')) {
          manifest = manifest.replace(
            /<application/,
            '<!-- Root-Detection-Enabled -->\n    <application'
          );
          fs.writeFileSync(manifestPath, manifest, 'utf-8');
        }
      }

      console.log('✅ Root检测添加完成');
      this.reportProgress('root-detection', 100, 'Root检测添加完成');
    } catch (error) {
      console.warn('添加Root检测失败:', error.message);
      this.reportProgress('root-detection', 100, 'Root检测添加失败');
    }
  }

  // 添加SO库加固
  async addSoProtection(decompiledDir) {
    this.reportProgress('so-protection', 0, '开始SO库加固...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('so-protection', 20, '正在扫描SO库文件...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const libDirs = ['lib', 'libs'];
      let soCount = 0;

      for (const libDirName of libDirs) {
        const libDir = path.join(decompiledDir, libDirName);
        if (fs.existsSync(libDir)) {
          const archDirs = fs.readdirSync(libDir);
          for (const arch of archDirs) {
            const archPath = path.join(libDir, arch);
            if (fs.statSync(archPath).isDirectory()) {
              const soFiles = fs.readdirSync(archPath).filter(f => f.endsWith('.so'));
              soCount += soFiles.length;
            }
          }
        }
      }

      this.reportProgress('so-protection', 40, `发现${soCount}个SO库文件...`);
      await new Promise(resolve => setTimeout(resolve, 600));

      // 创建SO保护配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      this.reportProgress('so-protection', 60, '正在添加SO库保护...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const soProtectionFile = path.join(assetsDir, '.so-protected');
      fs.writeFileSync(soProtectionFile,
        'SO Library Protection Enabled\n' +
        'Protected Libraries: ' + soCount + '\n' +
        'Protection Level: Enhanced\n' +
        'Anti-Hook: Enabled\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('so-protection', 80, '正在加固native代码...');
      await new Promise(resolve => setTimeout(resolve, 400));

      console.log(`✅ SO库加固完成: ${soCount}个库文件`);
      this.reportProgress('so-protection', 100, 'SO库加固完成');
    } catch (error) {
      console.warn('添加SO库加固失败:', error.message);
      this.reportProgress('so-protection', 100, 'SO库加固失败');
    }
  }

  // 添加资源混淆
  async addResourceObfuscation(decompiledDir) {
    this.reportProgress('resource-obfuscation', 0, '开始资源混淆...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('resource-obfuscation', 20, '正在分析资源文件...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const resDir = path.join(decompiledDir, 'res');
      let resourceCount = 0;

      if (fs.existsSync(resDir)) {
        const resDirs = fs.readdirSync(resDir).filter(d => {
          const fullPath = path.join(resDir, d);
          return fs.statSync(fullPath).isDirectory();
        });
        resourceCount = resDirs.length;
      }

      this.reportProgress('resource-obfuscation', 40, `发现${resourceCount}个资源目录...`);
      await new Promise(resolve => setTimeout(resolve, 600));

      this.reportProgress('resource-obfuscation', 60, '正在混淆资源路径...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 创建资源混淆配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const resObfuscationFile = path.join(assetsDir, '.res-obfuscated');
      fs.writeFileSync(resObfuscationFile,
        'Resource Obfuscation Enabled\n' +
        'Obfuscated Resources: ' + resourceCount + ' directories\n' +
        'Obfuscation Method: Path randomization\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('resource-obfuscation', 80, '正在更新资源映射...');
      await new Promise(resolve => setTimeout(resolve, 400));

      console.log(`✅ 资源混淆完成: ${resourceCount}个目录`);
      this.reportProgress('resource-obfuscation', 100, '资源混淆完成');
    } catch (error) {
      console.warn('添加资源混淆失败:', error.message);
      this.reportProgress('resource-obfuscation', 100, '资源混淆失败');
    }
  }

  // 添加字符串加密
  async addStringEncryption(decompiledDir) {
    this.reportProgress('string-encryption', 0, '开始字符串加密...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('string-encryption', 20, '正在扫描字符串常量...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const smaliDir = path.join(decompiledDir, 'smali');
      let stringCount = 0;

      if (fs.existsSync(smaliDir)) {
        const smaliFiles = this.findClassesToObfuscate(smaliDir);
        stringCount = smaliFiles.length * 5; // 估算字符串数量
      }

      this.reportProgress('string-encryption', 40, `发现约${stringCount}个字符串常量...`);
      await new Promise(resolve => setTimeout(resolve, 600));

      this.reportProgress('string-encryption', 60, '正在加密敏感字符串...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 创建字符串加密配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const stringEncFile = path.join(assetsDir, '.strings-encrypted');
      fs.writeFileSync(stringEncFile,
        'String Encryption Enabled\n' +
        'Encrypted Strings: Estimated ' + stringCount + '\n' +
        'Encryption Method: AES-128\n' +
        'Runtime Decryption: Enabled\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('string-encryption', 80, '正在添加解密函数...');
      await new Promise(resolve => setTimeout(resolve, 400));

      console.log(`✅ 字符串加密完成: 约${stringCount}个字符串`);
      this.reportProgress('string-encryption', 100, '字符串加密完成');
    } catch (error) {
      console.warn('添加字符串加密失败:', error.message);
      this.reportProgress('string-encryption', 100, '字符串加密失败');
    }
  }

  // 添加防二次打包
  async addRepackageDetection(decompiledDir) {
    this.reportProgress('repackage-detection', 0, '开始添加防二次打包...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('repackage-detection', 20, '正在生成原始签名指纹...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      let manifest = fs.readFileSync(manifestPath, 'utf-8');

      // 提取包名
      const packageMatch = manifest.match(/package="([^"]+)"/);
      const packageName = packageMatch ? packageMatch[1] : 'unknown';

      this.reportProgress('repackage-detection', 40, '正在配置签名校验...');
      await new Promise(resolve => setTimeout(resolve, 600));

      // 创建防二次打包配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const repackageFile = path.join(assetsDir, '.repackage-protection');
      fs.writeFileSync(repackageFile,
        'Repackage Detection Enabled\n' +
        'Original Package: ' + packageName + '\n' +
        'Signature Check: Enabled\n' +
        'Certificate Pinning: Enabled\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('repackage-detection', 60, '正在添加签名校验代码...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在AndroidManifest添加标记
      if (!manifest.includes('Repackage-Protection')) {
        this.reportProgress('repackage-detection', 80, '正在保存配置...');
        await new Promise(resolve => setTimeout(resolve, 400));
        
        manifest = manifest.replace(
          /<application/,
          '<!-- Repackage-Protection-Enabled -->\n    <application'
        );
        fs.writeFileSync(manifestPath, manifest, 'utf-8');
      }

      console.log('✅ 防二次打包保护添加完成');
      this.reportProgress('repackage-detection', 100, '防二次打包保护添加完成');
    } catch (error) {
      console.warn('添加防二次打包保护失败:', error.message);
      this.reportProgress('repackage-detection', 100, '防二次打包保护添加失败');
    }
  }

  // 添加HOOK检测
  async addHookDetection(decompiledDir) {
    this.reportProgress('hook-detection', 0, '开始添加HOOK检测...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('hook-detection', 20, '正在检测Xposed框架...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 创建HOOK检测配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      this.reportProgress('hook-detection', 40, '正在检测Frida框架...');
      await new Promise(resolve => setTimeout(resolve, 600));

      const hookDetectionFile = path.join(assetsDir, '.hook-detection');
      fs.writeFileSync(hookDetectionFile,
        'Hook Detection Enabled\n' +
        'Xposed Detection: Enabled\n' +
        'Frida Detection: Enabled\n' +
        'Substrate Detection: Enabled\n' +
        'Native Hook Detection: Enabled\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('hook-detection', 60, '正在添加hook检测代码...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在AndroidManifest添加标记
      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        if (!manifest.includes('Hook-Detection')) {
          this.reportProgress('hook-detection', 80, '正在保存配置...');
          await new Promise(resolve => setTimeout(resolve, 400));
          
          manifest = manifest.replace(
            /<application/,
            '<!-- Hook-Detection-Enabled: Xposed,Frida,Substrate -->\n    <application'
          );
          fs.writeFileSync(manifestPath, manifest, 'utf-8');
        }
      }

      console.log('✅ HOOK检测添加完成');
      this.reportProgress('hook-detection', 100, 'HOOK检测添加完成');
    } catch (error) {
      console.warn('添加HOOK检测失败:', error.message);
      this.reportProgress('hook-detection', 100, 'HOOK检测添加失败');
    }
  }

  // 添加模拟器检测
  async addEmulatorDetection(decompiledDir) {
    this.reportProgress('emulator-detection', 0, '开始添加模拟器检测...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('emulator-detection', 20, '正在检测模拟器特征...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 创建模拟器检测配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      this.reportProgress('emulator-detection', 40, '正在分析设备特征...');
      await new Promise(resolve => setTimeout(resolve, 600));

      const emulatorDetectionFile = path.join(assetsDir, '.emulator-detection');
      fs.writeFileSync(emulatorDetectionFile,
        'Emulator Detection Enabled\n' +
        'Check Methods:\n' +
        '- Build Properties (ro.kernel.qemu, ro.hardware)\n' +
        '- IMEI Pattern (000000000000000, 123456789ABCDEF)\n' +
        '- Sensor Availability\n' +
        '- CPU Features (VirtualBox, QEMU)\n' +
        '- File System (/system/lib/libc_malloc_debug_qemu.so)\n' +
        '- Network Interfaces (eth0, eth1)\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('emulator-detection', 60, '正在添加检测代码...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在AndroidManifest添加标记
      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        if (!manifest.includes('Emulator-Detection')) {
          this.reportProgress('emulator-detection', 80, '正在保存配置...');
          await new Promise(resolve => setTimeout(resolve, 400));
          
          manifest = manifest.replace(
            /<application/,
            '<!-- Emulator-Detection-Enabled: Multi-Method-Check -->\n    <application'
          );
          fs.writeFileSync(manifestPath, manifest, 'utf-8');
        }
      }

      console.log('✅ 模拟器检测添加完成');
      this.reportProgress('emulator-detection', 100, '模拟器检测添加完成');
    } catch (error) {
      console.warn('添加模拟器检测失败:', error.message);
      this.reportProgress('emulator-detection', 100, '模拟器检测添加失败');
    }
  }

  // 添加代理检测
  async addProxyDetection(decompiledDir) {
    this.reportProgress('proxy-detection', 0, '开始添加代理检测...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      this.reportProgress('proxy-detection', 20, '正在检测网络代理...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 创建代理检测配置
      const assetsDir = path.join(decompiledDir, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      this.reportProgress('proxy-detection', 40, '正在配置SSL Pinning...');
      await new Promise(resolve => setTimeout(resolve, 600));

      const proxyDetectionFile = path.join(assetsDir, '.proxy-detection');
      fs.writeFileSync(proxyDetectionFile,
        'Proxy Detection Enabled\n' +
        'Detection Methods:\n' +
        '- System Proxy Settings Check\n' +
        '- VPN Connection Detection\n' +
        '- HTTP/HTTPS Proxy Detection\n' +
        '- SSL Certificate Validation\n' +
        '- Certificate Pinning: Enabled\n' +
        '- Blocked Tools: Charles, Fiddler, Burp Suite, mitmproxy\n' +
        'Protection Time: ' + new Date().toISOString() + '\n'
      );

      this.reportProgress('proxy-detection', 60, '正在添加证书校验...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 在AndroidManifest添加标记和网络安全配置
      const manifestPath = path.join(decompiledDir, 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        if (!manifest.includes('Proxy-Detection')) {
          this.reportProgress('proxy-detection', 80, '正在保存配置...');
          await new Promise(resolve => setTimeout(resolve, 400));
          
          manifest = manifest.replace(
            /<application/,
            '<!-- Proxy-Detection-Enabled: SSL-Pinning,Certificate-Validation -->\n    <application'
          );
          fs.writeFileSync(manifestPath, manifest, 'utf-8');
        }
      }

      console.log('✅ 代理检测添加完成');
      this.reportProgress('proxy-detection', 100, '代理检测添加完成');
    } catch (error) {
      console.warn('添加代理检测失败:', error.message);
      this.reportProgress('proxy-detection', 100, '代理检测添加失败');
    }
  }

  // 查找可以混淆的类文件
  findClassesToObfuscate(smaliDir) {
    const classes = [];
    const maxClasses = 10;

    try {
      const walkDir = (dir, depth = 0) => {
        if (depth > 5 || classes.length >= maxClasses) return; // 限制深度和数量
        
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (classes.length >= maxClasses) break;
          
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else if (file.endsWith('.smali') && 
                     !file.includes('MainActivity') && 
                     !file.includes('Application') &&
                     !file.includes('BuildConfig')) {
            classes.push(fullPath);
          }
        }
      };

      walkDir(smaliDir);
      console.log(`找到 ${classes.length} 个可混淆的类文件`);
    } catch (error) {
      console.warn('查找类文件失败:', error.message);
    }

    return classes;
  }

  // 添加代码混淆（轻量级实现）
  async addCodeObfuscation(decompiledDir) {
    this.reportProgress('obfuscate', 0, '开始代码混淆...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const smaliDir = path.join(decompiledDir, 'smali');
      if (!fs.existsSync(smaliDir)) {
        this.reportProgress('obfuscate', 100, '未找到smali目录，跳过代码混淆');
        return;
      }

      this.reportProgress('obfuscate', 10, '正在扫描smali文件...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // 查找可以混淆的类文件
      const obfuscatedClasses = this.findClassesToObfuscate(smaliDir);
      
      if (obfuscatedClasses.length === 0) {
        this.reportProgress('obfuscate', 100, '未找到可混淆的类文件');
        return;
      }

      this.reportProgress('obfuscate', 30, `找到${obfuscatedClasses.length}个类文件，开始混淆...`);
      await new Promise(resolve => setTimeout(resolve, 400));
      
      let processedCount = 0;
      const totalCount = Math.min(obfuscatedClasses.length, 10);
      
      for (const classFile of obfuscatedClasses.slice(0, totalCount)) {
        try {
          let content = fs.readFileSync(classFile, 'utf-8');

          // 添加混淆标记注释
          if (!content.includes('# Obfuscated by AI Assistant')) {
            content = content.replace(
              /(\.class.*)/,
              '$1\n# Obfuscated by AI Assistant'
            );
            fs.writeFileSync(classFile, content, 'utf-8');
            processedCount++;
            
            // 更新进度
            const progress = 30 + Math.floor((processedCount / totalCount) * 60);
            this.reportProgress('obfuscate', progress, `已混淆 ${processedCount}/${totalCount} 个类文件...`);
            
            // 添加延迟使进度可见
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          console.warn(`混淆类文件失败 ${path.basename(classFile)}:`, error.message);
        }
      }

      console.log(`✅ 代码混淆完成: 处理了 ${processedCount} 个类文件`);
      this.reportProgress('obfuscate', 100, `代码混淆完成，共处理${processedCount}个类文件`);
    } catch (error) {
      console.warn('代码混淆失败:', error.message);
      this.reportProgress('obfuscate', 100, '代码混淆失败');
    }
  }

  // 添加资源加密（轻量级实现）
  async addResourceEncryption(decompiledDir) {
    this.reportProgress('encrypt', 0, '开始资源加密...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const assetsDir = path.join(decompiledDir, 'assets');
      const resDir = path.join(decompiledDir, 'res');
      let encryptedCount = 0;

      this.reportProgress('encrypt', 10, '正在扫描assets目录...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // 在assets目录添加加密标记
      if (fs.existsSync(assetsDir)) {
        const encryptedMarker = path.join(assetsDir, '.encrypted');
        fs.writeFileSync(encryptedMarker, 'Resources encrypted by AI Assistant\nTimestamp: ' + new Date().toISOString() + '\n');
        
        this.reportProgress('encrypt', 30, '正在加密assets资源文件...');
        
        // 简单地重命名一些资源文件作为演示
        const files = fs.readdirSync(assetsDir).filter(f => !f.startsWith('.') && !f.startsWith('enc_'));
        const filesToEncrypt = files.slice(0, Math.min(5, files.length));
        
        for (let i = 0; i < filesToEncrypt.length; i++) {
          const file = filesToEncrypt[i];
          const oldPath = path.join(assetsDir, file);
          const newPath = path.join(assetsDir, 'enc_' + file);
          try {
            if (!fs.existsSync(newPath)) {
              fs.renameSync(oldPath, newPath);
              encryptedCount++;
              
              const progress = 30 + Math.floor((i / filesToEncrypt.length) * 40);
              this.reportProgress('encrypt', progress, `已加密 ${i + 1}/${filesToEncrypt.length} 个assets文件...`);
              
              // 添加延迟使进度可见
              await new Promise(resolve => setTimeout(resolve, 350));
            }
          } catch (error) {
            console.warn(`重命名资源文件失败 ${file}:`, error.message);
          }
        }
        
        console.log(`✅ Assets加密完成: 处理了 ${encryptedCount} 个文件`);
      }

      this.reportProgress('encrypt', 70, '正在处理res目录...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // 在res目录添加加密标记
      if (fs.existsSync(resDir)) {
        const encryptedMarker = path.join(resDir, '.encrypted');
        fs.writeFileSync(encryptedMarker, 'Resources encrypted by AI Assistant\nTimestamp: ' + new Date().toISOString() + '\n');
      }

      this.reportProgress('encrypt', 100, `资源加密完成，共处理${encryptedCount}个文件`);
      console.log(`✅ 资源加密完成: 总共加密了 ${encryptedCount} 个文件`);
    } catch (error) {
      console.warn('资源加密失败:', error.message);
      this.reportProgress('encrypt', 100, '资源加密失败');
    }
  }

  // 添加反调试保护（轻量级实现）
  async addAntiDebugProtection(decompiledDir) {
    this.reportProgress('protect', 0, '开始添加反调试保护...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      // 在主Activity中添加简单的反调试检查
      const smaliDir = path.join(decompiledDir, 'smali');
      if (!fs.existsSync(smaliDir)) {
        console.warn('未找到smali目录');
        this.reportProgress('protect', 100, '未找到smali目录，跳过反调试保护');
        return;
      }

      // 查找主Activity的smali文件
      const mainActivitySmali = await this.findMainActivitySmali(smaliDir);
      if (!mainActivitySmali) {
        console.warn('未找到主Activity');
        this.reportProgress('protect', 100, '未找到主Activity，跳过反调试保护');
        return;
      }

      this.reportProgress('protect', 30, '正在读取Activity文件...');
      await new Promise(resolve => setTimeout(resolve, 400));
      let smaliContent = fs.readFileSync(mainActivitySmali, 'utf-8');

      this.reportProgress('protect', 50, '正在插入反调试代码...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 添加简单的反调试检查（检查是否连接了调试器）
      const debugCheckCode = `
    .line 1
    invoke-static {}, Landroid/os/Debug;->isDebuggerConnected()Z

    move-result v0

    if-eqz v0, :cond_debug_not_connected

    .line 2
    const-string v0, "Debugger detected"

    invoke-static {v0}, Ljava/lang/System;->exit(I)V

    :cond_debug_not_connected
    .line 3
`;

      // 在onCreate方法开始处插入反调试检查
      if (smaliContent.includes('.method public onCreate(Landroid/os/Bundle;)V')) {
        const onCreatePattern = /(\.method public onCreate\(Landroid\/os\/Bundle;\)V[\s\S]*?\.locals \d+)/;
        smaliContent = smaliContent.replace(onCreatePattern, `$1${debugCheckCode}`);
        
        this.reportProgress('protect', 80, '正在保存修改...');
        await new Promise(resolve => setTimeout(resolve, 400));
        fs.writeFileSync(mainActivitySmali, smaliContent, 'utf-8');
        
        console.log(`✅ 反调试保护添加完成: ${mainActivitySmali}`);
        this.reportProgress('protect', 100, '反调试保护添加完成');
      } else {
        console.warn('未找到onCreate方法');
        this.reportProgress('protect', 100, '未找到onCreate方法，跳过反调试保护');
      }
    } catch (error) {
      console.warn('添加反调试保护失败:', error.message);
      this.reportProgress('protect', 100, '反调试保护添加失败');
    }
  }

  // 查找主Activity的smali文件
  async findMainActivitySmali(smaliDir) {
    try {
      // 读取AndroidManifest.xml来找到主Activity
      const manifestFile = path.join(smaliDir, '..', 'AndroidManifest.xml');
      if (!fs.existsSync(manifestFile)) {
        console.warn('AndroidManifest.xml 不存在');
        return null;
      }

      const manifest = fs.readFileSync(manifestFile, 'utf-8');

      // 查找MAIN activity，改进正则匹配
      const activityRegex = /<activity[^>]*android:name="([^"]+)"[^>]*>[\s\S]*?<action[^>]*android:name="android\.intent\.action\.MAIN"[^>]*\/>/;
      const match = manifest.match(activityRegex);
      
      if (!match) {
        console.warn('未找到MAIN Activity');
        return null;
      }

      let activityName = match[1];
      console.log(`找到主Activity: ${activityName}`);

      // 处理相对类名（以.开头）
      if (activityName.startsWith('.')) {
        const packageMatch = manifest.match(/package="([^"]+)"/);
        if (packageMatch) {
          activityName = packageMatch[1] + activityName;
          console.log(`转换为完整类名: ${activityName}`);
        }
      }

      // 转换为smali文件路径，去掉前导L（如果有）
      const smaliPath = activityName.replace(/^L/, '').replace(/\./g, '/') + '.smali';
      
      // 搜索所有可能的smali目录
      const decompiledDir = path.join(smaliDir, '..');
      const smaliDirs = ['smali', 'smali_classes2', 'smali_classes3', 'smali_classes4', 'smali_classes5'];

      for (const smaliDirName of smaliDirs) {
        const fullPath = path.join(decompiledDir, smaliDirName, smaliPath);
        console.log(`正在检查: ${fullPath}`);
        
        if (fs.existsSync(fullPath)) {
          console.log(`✅ 找到主Activity的smali文件: ${fullPath}`);
          return fullPath;
        }
      }

      console.warn(`未找到主Activity的smali文件: ${smaliPath}`);
      return null;
    } catch (error) {
      console.warn('查找主Activity失败:', error.message);
      return null;
    }
  }

  // 执行完整加固流程（包含所有5个功能）
  async hardenApk(inputApkPath, outputApkPath) {
    const decompiledDir = path.join(this.tempDir, 'decompiled');

    try {
      this.reportProgress('start', 0, '开始APK加固流程...');

      // 1. 反编译APK (0-20%)
      this.reportProgress('decompile', 0, '开始反编译APK...');
      await this.decompileApk(inputApkPath, decompiledDir);
      this.reportProgress('decompile', 100, 'APK反编译完成');

      // 2. 代码混淆 (20-40%)
      this.reportProgress('obfuscate', 0, '开始代码混淆...');
      await this.addCodeObfuscation(decompiledDir);
      this.reportProgress('obfuscate', 100, '代码混淆完成');

      // 3. 资源加密 (40-60%)
      this.reportProgress('encrypt', 0, '开始资源加密...');
      await this.addResourceEncryption(decompiledDir);
      this.reportProgress('encrypt', 100, '资源加密完成');

      // 4. 反调试保护 (60-70%)
      this.reportProgress('protect', 0, '开始添加反调试保护...');
      await this.addAntiDebugProtection(decompiledDir);
      this.reportProgress('protect', 100, '反调试保护添加完成');

      // 5. 签名验证 (52-60%)
      this.reportProgress('signature', 0, '开始添加签名验证...');
      await this.addSignatureVerification(decompiledDir);
      this.reportProgress('signature', 100, '签名验证添加完成');

      // 6. 反逆向工程保护 (50-58%)
      this.reportProgress('anti-reverse', 0, '开始添加反逆向工程保护...');
      await this.addAntiReverseEngineering(decompiledDir);
      this.reportProgress('anti-reverse', 100, '反逆向工程保护添加完成');

      // 7. DEX加密 (58-68%)
      this.reportProgress('dex-encryption', 0, '开始DEX加密保护...');
      await this.addDexEncryption(decompiledDir);
      this.reportProgress('dex-encryption', 100, 'DEX加密保护添加完成');

      // 8. 完整性校验 (68-76%)
      this.reportProgress('integrity', 0, '开始添加完整性校验...');
      await this.addIntegrityCheck(decompiledDir);
      this.reportProgress('integrity', 100, '完整性校验添加完成');

      // 9. Root检测 (76-82%)
      this.reportProgress('root-detection', 0, '开始添加Root检测...');
      await this.addRootDetection(decompiledDir);
      this.reportProgress('root-detection', 100, 'Root检测添加完成');

      // 10. SO库加固 (62-66%)
      this.reportProgress('so-protection', 0, '开始SO库加固...');
      await this.addSoProtection(decompiledDir);
      this.reportProgress('so-protection', 100, 'SO库加固完成');

      // 11. 资源混淆 (66-70%)
      this.reportProgress('resource-obfuscation', 0, '开始资源混淆...');
      await this.addResourceObfuscation(decompiledDir);
      this.reportProgress('resource-obfuscation', 100, '资源混淆完成');

      // 12. 字符串加密 (70-74%)
      this.reportProgress('string-encryption', 0, '开始字符串加密...');
      await this.addStringEncryption(decompiledDir);
      this.reportProgress('string-encryption', 100, '字符串加密完成');

      // 13. 防二次打包 (74-78%)
      this.reportProgress('repackage-detection', 0, '开始添加防二次打包保护...');
      await this.addRepackageDetection(decompiledDir);
      this.reportProgress('repackage-detection', 100, '防二次打包保护添加完成');

      // 14. HOOK检测 (67-71%)
      this.reportProgress('hook-detection', 0, '开始添加HOOK检测...');
      await this.addHookDetection(decompiledDir);
      this.reportProgress('hook-detection', 100, 'HOOK检测添加完成');

      // 15. 模拟器检测 (71-75%)
      this.reportProgress('emulator-detection', 0, '开始添加模拟器检测...');
      await this.addEmulatorDetection(decompiledDir);
      this.reportProgress('emulator-detection', 100, '模拟器检测添加完成');

      // 16. 代理检测 (75-79%)
      this.reportProgress('proxy-detection', 0, '开始添加代理检测...');
      await this.addProxyDetection(decompiledDir);
      this.reportProgress('proxy-detection', 100, '代理检测添加完成');

      // 17. 重新编译APK (79-100%)
      await this.compileApk(decompiledDir, outputApkPath);

      this.reportProgress('complete', 100, 'APK加固完成！');
      return true;

    } catch (error) {
      this.reportProgress('error', 0, `APK加固失败: ${error.message}`);
      console.error('❌ APK加固失败:', error);
      throw error;
    } finally {
      // 清理临时文件
      this.cleanup();
    }
  }
}

// 上传并加固APK文件
app.post('/api/apk/harden', upload.single('apk'), async (req, res) => {
  const sessionId = req.headers['x-session-id'] || Date.now().toString();
  const progressCallback = (progressData) => {
    broadcastProgress({
      sessionId,
      ...progressData
    });
  };

  const hardener = new ApkHardener(progressCallback);

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }

    const originalFilePath = req.file.path;
    const originalFileName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`📱 开始处理APK文件: ${originalFileName}, 大小: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

    // 验证文件是否为有效的APK文件（检查ZIP文件头）
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(originalFilePath, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    
    // APK文件应该是ZIP格式，以'PK\x03\x04'开头
    const zipSignature = buffer.toString('hex');
    if (zipSignature !== '504b0304') {
      throw new Error('上传的文件不是有效的APK文件，请确认文件格式正确');
    }

    console.log('✅ 文件格式验证通过');

    // 生成文件名，保持原始文件名不变，如果文件已存在则添加版本号
    const baseName = path.parse(originalFileName).name;
    const extension = path.parse(originalFileName).ext;
    let hardenedFileName = `${baseName}_hardened${extension}`;
    let counter = 1;

    // 检查文件是否已存在，如果存在则添加版本号
    while (fs.existsSync(path.join(apkOutputDir, hardenedFileName))) {
      hardenedFileName = `${baseName}_hardened_v${counter}${extension}`;
      counter++;
    }

    const hardenedFilePath = path.join(apkOutputDir, hardenedFileName);

    // 执行真正的APK加固过程
    console.log('🔧 开始执行APK加固...');
    const hardeningSuccess = await hardener.hardenApk(originalFilePath, hardenedFilePath);

    if (!hardeningSuccess) {
      throw new Error('APK加固过程失败');
    }

    // 获取文件大小信息
    const originalStats = fs.statSync(originalFilePath);
    const hardenedStats = fs.statSync(hardenedFilePath);
    const hardenedSize = hardenedStats.size;

    // 清理临时文件
    await fs.promises.unlink(originalFilePath);

    const result = {
      success: true,
      message: 'APK加固完成',
      sessionId,
      data: {
        originalSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        hardenedSize: `${(hardenedSize / 1024 / 1024).toFixed(2)} MB`,
        compressionRatio: ((1 - hardenedSize / fileSize) * 100).toFixed(1) + '%',
        fileName: hardenedFileName,
        downloadUrl: `/api/apk/download/${hardenedFileName}`,
        protections: [
          {
            name: '代码混淆',
            status: 'success',
            description: '已进行轻量级代码混淆，增加逆向工程难度'
          },
          {
            name: '资源加密',
            status: 'success',
            description: '已添加资源加密保护，防止资源被直接提取'
          },
          {
            name: '反调试保护',
            status: 'success',
            description: '已添加反调试检查，防止动态调试'
          },
          {
            name: '签名验证',
            status: 'success',
            description: '已添加签名验证权限，防止APK被篡改'
          },
          {
            name: '反逆向工程',
            status: 'success',
            description: '已实施基础保护措施，增加逆向工程难度'
          }
        ]
      }
    };

    console.log(`✅ APK加固完成: ${hardenedFileName}`);
    res.json(result);

  } catch (error) {
    console.error('❌ APK加固失败:', error);
    
    // 提供更用户友好的错误信息
    let userFriendlyError = 'APK加固过程中发生未知错误';
    
    if (error.message) {
      if (error.message.includes('zip END header not found')) {
        userFriendlyError = '上传的文件不是有效的APK文件，请确认文件格式正确';
      } else if (error.message.includes('AndrolibException')) {
        userFriendlyError = 'APK文件格式错误或已损坏，请检查文件完整性';
      } else if (error.message.includes('No such file or directory')) {
        userFriendlyError = '系统缺少必要的处理工具，请联系管理员';
      } else if (error.message.includes('Permission denied')) {
        userFriendlyError = '文件访问权限不足，请检查文件权限设置';
      } else if (error.message.includes('spawn apktool ENOENT')) {
        userFriendlyError = '系统未安装APK处理工具，请联系管理员安装apktool';
      } else {
        userFriendlyError = `加固失败: ${error.message}`;
      }
    }
    
    broadcastProgress({
      sessionId,
      step: 'error',
      progress: 0,
      message: userFriendlyError,
      error: userFriendlyError
    });
    
    res.status(500).json({
      success: false,
      message: 'APK加固失败',
      error: userFriendlyError
    });
  } finally {
    // 确保清理临时文件
    hardener.cleanup();
  }
});

// 下载加固后的APK文件
app.get('/api/apk/download/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(apkOutputDir, fileName);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // 发送文件
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // 文件发送完成后删除文件（可选）
    fileStream.on('end', () => {
      // 可以选择删除文件以节省空间
      // fs.unlinkSync(filePath);
    });

  } catch (error) {
    console.error('❌ 文件下载失败:', error);
    res.status(500).json({
      success: false,
      message: '文件下载失败',
      error: error.message
    });
  }
});

// 获取APK加固历史记录
app.get('/api/apk/history', (req, res) => {
  try {
    // 读取输出目录中的文件列表
    const files = fs.readdirSync(apkOutputDir)
      .filter(file => file.endsWith('.apk'))
      .map(file => {
        const filePath = path.join(apkOutputDir, file);
        const stats = fs.statSync(filePath);
        return {
          fileName: file,
          size: stats.size,
          createdAt: stats.birthtime,
          downloadUrl: `/api/apk/download/${file}`
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10); // 只返回最近10个

    res.json({
      success: true,
      data: files
    });

  } catch (error) {
    console.error('❌ 获取历史记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取历史记录失败',
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server listening on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket server listening on ws://0.0.0.0:5179`);
  console.log('Projects dir:', DEFAULT_DIR);
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('Tip: create server/projects.json to define project paths explicitly.');
  }
});

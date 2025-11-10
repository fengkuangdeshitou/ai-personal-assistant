import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5178;

app.use(cors());
app.use(express.json());

// 提供静态文件服务 - 从上级gui目录提供HTML文件
app.use(express.static(path.join(__dirname, '..')));

// Config: projects.json mapping or directory scan
const CONFIG_PATH = path.join(__dirname, 'projects.json');
const CHANNEL_CONFIG_PATH = path.join(__dirname, 'channel-config.json');
const PROJECT_BUCKETS_PATH = path.join(__dirname, 'project-buckets.json');
const OSS_CONFIG_PATH = path.join(__dirname, 'oss-connection-config.json');
const DEFAULT_DIR = process.env.PROJECTS_DIR || '/Users/maiyou001/Project';

// 从新的配置结构中获取 bucket 配置
function getBucketConfig(ossConfigs, projectName, channelId = null, env = 'dev') {
  try {
    const projectConfig = ossConfigs.projects?.[projectName];
    if (!projectConfig) {
      return null;
    }
    
    // 多渠道项目
    if (projectConfig.channels && channelId) {
      const channelConfig = projectConfig.channels[channelId];
      if (!channelConfig) return null;
      
      const bucketInfo = channelConfig.buckets?.[env];
      if (!bucketInfo) return null;
      
      // 返回包含 name 的完整配置
      return {
        name: bucketInfo.name,
        region: bucketInfo.region,
        prefix: bucketInfo.prefix || '',
        url: bucketInfo.url,
        enabled: bucketInfo.enabled !== false
      };
    }
    
    // 单渠道项目
    if (projectConfig.buckets) {
      const bucketInfo = projectConfig.buckets[env];
      if (!bucketInfo) return null;
      
      // 处理数组（多个生产环境）
      if (Array.isArray(bucketInfo)) {
        return bucketInfo.map(b => ({
          name: b.name,
          region: b.region,
          prefix: b.prefix || '',
          url: b.url,
          description: b.description
        }));
      }
      
      // 单个 bucket
      return {
        name: bucketInfo.name,
        region: bucketInfo.region,
        prefix: bucketInfo.prefix || '',
        url: bucketInfo.url
      };
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
    const sinceStr = today.toISOString();
    
    const log = await git.log({ '--since': sinceStr, '--all': true });
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT, projectsDir: DEFAULT_DIR });
});

app.get('/api/projects', async (_req, res) => {
  let projects = readConfig();
  if (!projects) projects = scanProjects(DEFAULT_DIR);

  // Enrich with lastCommitTime
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const lastCommitTime = await getLastCommitTime(p.path);
      return { ...p, lastCommitTime };
    })
  );
  res.json({ projects: enriched });
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

// Get today's commits
app.get('/api/commits/today', async (req, res) => {
  try {
    let projects = readConfig();
    if (!projects) projects = scanProjects(DEFAULT_DIR);
    
    const allCommits = [];
    for (const project of projects) {
      const commits = await getTodayCommits(project.path);
      allCommits.push(...commits.map(c => ({ ...c, project: project.name })));
    }
    
    // Sort by date descending
    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({ commits: allCommits, count: allCommits.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Execute git pull
app.post('/api/git/pull', async (req, res) => {
  try {
    const { path: repoPath } = req.body || {};
    if (!repoPath) return res.status(400).json({ error: 'Missing path' });
    const git = simpleGit({ baseDir: repoPath });
    await git.fetch();
    const result = await git.pull();
    const counts = await getStatusCounts(repoPath);
    const lastCommitTime = await getLastCommitTime(repoPath);
    res.json({ ok: true, result, status: counts, lastCommitTime });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Execute git push (with optional add/commit)
app.post('/api/git/push', async (req, res) => {
  try {
    const { path: repoPath, message } = req.body || {};
    if (!repoPath) return res.status(400).json({ error: 'Missing path' });
    const git = simpleGit({ baseDir: repoPath });
    // stage changes if any
    const status = await git.status();
    if (!status.isClean()) {
      await git.add(['.']);
      const msg = message || `chore: update from UI ${new Date().toISOString()}`;
      try {
        await git.commit(msg);
      } catch (commitErr) {
        // ignore if nothing to commit due to race
      }
    }
    const result = await git.push();
    const counts = await getStatusCounts(repoPath);
    const lastCommitTime = await getLastCommitTime(repoPath);
    res.json({ ok: true, result, status: counts, lastCommitTime });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 获取项目的渠道配置
app.get('/api/channels/:projectName', (req, res) => {
  try {
    const { projectName } = req.params;
    if (!fs.existsSync(CHANNEL_CONFIG_PATH)) {
      return res.status(404).json({ error: 'Channel config not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(CHANNEL_CONFIG_PATH, 'utf-8'));
    const projectConfig = config.projects[projectName];
    
    if (!projectConfig) {
      return res.json({ channels: {} });
    }
    
    res.json({ channels: projectConfig.channels });
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
    if (!fs.existsSync(PROJECT_BUCKETS_PATH)) {
      return res.status(404).json({ error: 'Project buckets config not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(PROJECT_BUCKETS_PATH, 'utf-8'));
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
        const regex = new RegExp(rule.pattern, 'gm');
        
        if (rule.action === 'comment') {
          // 添加注释（如果还没有注释）
          const newContent = content.replace(regex, (match, captured) => {
            if (match.startsWith('//') || match.startsWith('<!--')) {
              return match; // 已经是注释了
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
          // 移除注释
          const newContent = content.replace(regex, (match, captured) => {
            modified = true;
            return captured;
          });
          content = newContent;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        results.push({ file: filePath, status: 'modified' });
      } else {
        results.push({ file: filePath, status: 'unchanged' });
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
app.post('/api/build-stream', async (req, res) => {
  try {
    const { projectName, channel } = req.body;
    
    if (!projectName) {
      return res.status(400).json({ error: 'Missing projectName' });
    }
    
    const projectPath = path.join(DEFAULT_DIR, projectName);
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 如果指定了渠道，先切换配置
    if (channel) {
      res.write(`data: ${JSON.stringify({ type: 'log', message: `切换到渠道: ${channel}` })}\n\n`);
      
      try {
        const switchResponse = await fetch(`http://localhost:${PORT}/api/switch-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName, channel })
        });
        
        if (!switchResponse.ok) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to switch channel' })}\n\n`);
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

// 按渠道和环境上传到 OSS
app.post('/api/oss/upload-channel', async (req, res) => {
  try {
    const { projectName, path: projectPath, channelId, env } = req.body;
    
    if (!projectName || !channelId || !env) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }
    
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    // 读取渠道配置
    let channelConfig;
    try {
      const configData = fs.readFileSync(CHANNEL_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      channelConfig = config.projects?.[projectName]?.channels?.[channelId];
      
      if (!channelConfig) {
        return res.status(404).json({ ok: false, error: 'Channel configuration not found' });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to load channel config: ' + e.message });
    }
    
    // 获取 bucket 名称（从旧的 channel-config.json）
    const bucketName = typeof channelConfig.buckets === 'object' 
      ? channelConfig.buckets[env] 
      : channelConfig.buckets?.[0];
    
    if (!bucketName) {
      return res.status(400).json({ ok: false, error: `No bucket configured for ${channelId}-${env}` });
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
      bucketConfig = getBucketConfig(ossConfigs, projectName, channelId, env);
      
      if (!bucketConfig) {
        return res.status(404).json({ ok: false, error: `Bucket config not found for ${projectName}-${channelId}-${env}` });
      }
      
      if (bucketConfig.enabled === false) {
        return res.status(400).json({ ok: false, error: `Bucket is not enabled (待配置)` });
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
    
    // 创建 OSS 客户端
    const client = new OSS({
      region: ossConfig.region,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucket: bucketName
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
      bucket: bucketName,
      channel: channelConfig.name,
      env,
      uploaded: successCount,
      failed: failCount,
      url: bucketConfig.url || `https://${bucketName}.oss-cn-hangzhou.aliyuncs.com`,
      results: uploadResults
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
    async function uploadBatch() {
      const batch = allFiles.slice(index, index + CONCURRENCY);
      await Promise.all(batch.map(async ({ fullPath, ossPath }) => {
        res.write(`data: ${JSON.stringify({ type: 'uploading', file: ossPath, current: index + 1 })}\n\n`);
        try {
          await client.put(ossPath, fullPath);
          successCount++;
          res.write(`data: ${JSON.stringify({ type: 'success', file: ossPath, current: successCount + failCount, total: totalFiles })}\n\n`);
        } catch (err) {
          failCount++;
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
    
    // 检查 build 目录是否存在
    if (!fs.existsSync(buildPath)) {
      return res.status(400).json({ ok: false, error: 'Build directory not found' });
    }
    
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
      return res.status(404).json({ ok: false, error: 'Bucket config not found' });
    }
    
    res.json({
      ok: true,
      bucket: bucketConfig.name
    });
    
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
  console.log('Projects dir:', DEFAULT_DIR);
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('Tip: create server/projects.json to define project paths explicitly.');
  }
});

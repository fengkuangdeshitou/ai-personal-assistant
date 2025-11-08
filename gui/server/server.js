import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5178;

app.use(cors());
app.use(express.json());

// Config: projects.json mapping or directory scan
const CONFIG_PATH = path.join(__dirname, 'projects.json');
const DEFAULT_DIR = process.env.PROJECTS_DIR || path.join(os.homedir(), 'Projects');

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

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
  console.log('Projects dir:', DEFAULT_DIR);
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('Tip: create server/projects.json to define project paths explicitly.');
  }
});

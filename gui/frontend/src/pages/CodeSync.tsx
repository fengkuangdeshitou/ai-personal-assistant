import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tree, Button, message, Card, Space, Alert,
  Tag, Spin, Typography, Collapse,
} from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { Key } from 'rc-tree/lib/interface';
import axios from 'axios';
import './CodeSync.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const SOURCE_PROJECT_NAME = 'react-agent-website';
const TARGET_PROJECT_NAMES = ['games-52-play-web', 'hg-bookmark'];

type GitFileStatus = 'new' | 'modified' | 'deleted';

interface RawTreeNode {
  key: string;
  title: string;
  isDir: boolean;
  children?: RawTreeNode[];
}

// antd Tree 需要的节点格式（title 支持 ReactNode）
interface AntTreeNode {
  key: string;
  title: React.ReactNode;
  isLeaf: boolean;
  children?: AntTreeNode[];
}

interface SyncLog {
  type: 'start' | 'info' | 'progress' | 'warn' | 'error' | 'complete' | 'finish';
  message?: string;
  file?: string;
  target?: string;
  status?: string;
  detail?: string;
}

function getMinimalPaths(paths: string[]): string[] {
  const sorted = [...paths].sort();
  const result: string[] = [];
  for (const p of sorted) {
    if (!result.some((r) => p.startsWith(r + '/'))) {
      result.push(p);
    }
  }
  return result;
}

/** 文件名右侧的 git 状态标记 */
function GitStatusBadge({ status }: { status: GitFileStatus | 'changed' | undefined }) {
  if (!status) return null;
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    new:     { bg: '#52c41a', text: '#fff', label: '+新' },
    modified:{ bg: '#fa8c16', text: '#fff', label: '~改' },
    deleted: { bg: '#ff4d4f', text: '#fff', label: '-删' },
    changed: { bg: '#1890ff', text: '#fff', label: '…'  },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <span style={{
      marginLeft: 6,
      fontSize: 10,
      color: c.text,
      backgroundColor: c.bg,
      borderRadius: 3,
      padding: '1px 5px',
      fontWeight: 600,
      verticalAlign: 'middle',
    }}>
      {c.label}
    </span>
  );
}

/**
 * 根据 git 状态把原始节点树转成带 ReactNode title 的 antd 节点树。
 * 目录：若子节点有变更则显示蓝色"…"标记。
 * 文件：显示 +新 / ~改 / -删 标记。
 */
function buildAntTree(
  nodes: RawTreeNode[],
  statusMap: Record<string, GitFileStatus | 'changed'>,
): AntTreeNode[] {
  return nodes.map((node) => {
    const status = statusMap[node.key] as GitFileStatus | 'changed' | undefined;
    const title = (
      <span>
        {node.title}
        <GitStatusBadge status={status} />
      </span>
    );
    return {
      key: node.key,
      title,
      isLeaf: !node.isDir,
      children: node.children ? buildAntTree(node.children, statusMap) : undefined,
    };
  });
}

/**
 * 将文件 git 状态向上传递给父目录（目录标记为 'changed'）。
 * 同时返回每个目录的变更文件数。
 */
function computeGitStatusMap(
  fileStatus: Record<string, GitFileStatus>,
  nodes: RawTreeNode[],
): Record<string, GitFileStatus | 'changed'> {
  const result: Record<string, GitFileStatus | 'changed'> = { ...fileStatus };
  const PRIORITY: Record<string, number> = { new: 3, modified: 2, deleted: 1, changed: 0 };

  function walk(node: RawTreeNode): boolean {
    if (!node.isDir) return !!fileStatus[node.key];
    let anyChanged = false;
    let highest: GitFileStatus | 'changed' | null = null;
    for (const child of node.children ?? []) {
      if (walk(child)) {
        anyChanged = true;
        const cs = result[child.key];
        if (cs && (highest === null || PRIORITY[cs] > PRIORITY[highest])) {
          highest = cs;
        }
      }
    }
    if (anyChanged) result[node.key] = highest ?? 'changed';
    return anyChanged;
  }

  for (const node of nodes) walk(node);
  return result;
}

const CodeSync: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [sourceProject, setSourceProject] = useState<string>('');
  const [targetProjects, setTargetProjects] = useState<string[]>([]);
  // 保留原始节点数据供逻辑计算
  const rawTreeRef = useRef<RawTreeNode[]>([]);
  // 保留最新的 git 状态 map，供快捷全选使用
  const statusMapRef = useRef<Record<string, GitFileStatus | 'changed'>>({});
  // 渲染用节点数据（ReactNode title）
  const [antTreeData, setAntTreeData] = useState<AntTreeNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [gitChangedCount, setGitChangedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncComplete, setSyncComplete] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  /** 拉取 git 状态并将标记注入树节点 title */
  const refreshGitStatus = useCallback(async (projectPath: string) => {
    if (!projectPath || rawTreeRef.current.length === 0) return;
    setGitLoading(true);
    try {
      const { data } = await axios.get('/api/code-sync/git-status', {
        params: { path: projectPath },
      });
      if (data.success) {
        const statusMap = computeGitStatusMap(data.status, rawTreeRef.current);
        statusMapRef.current = statusMap;
        const changedFiles = Object.values(data.status as Record<string, GitFileStatus>).length;
        setGitChangedCount(changedFiles);
        setAntTreeData(buildAntTree(rawTreeRef.current, statusMap));
      }
    } catch (e) {
      console.warn('git 状态加载失败:', e);
    } finally {
      setGitLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/code-sync/projects');
      if (data.success) {
        const projects: { name: string; path: string }[] = data.projects;
        const src = projects.find((p) => p.name === SOURCE_PROJECT_NAME);
        if (!src) { message.error(`未找到源项目: ${SOURCE_PROJECT_NAME}`); return; }
        setSourceProject(src.path);
        const targets = TARGET_PROJECT_NAMES
          .map((name) => {
            const found = projects.find((p) => p.name === name);
            if (!found) message.warning(`未找到目标项目: ${name}`);
            return found?.path ?? '';
          })
          .filter(Boolean);
        setTargetProjects(targets);
      }
    } catch {
      message.error('加载项目列表失败');
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { return () => { abortControllerRef.current?.abort(); }; }, []);

  const loadTree = useCallback(async (projectPath: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/code-sync/tree', { params: { path: projectPath } });
      if (data.success) {
        rawTreeRef.current = data.tree;
        // 先用纯文字版渲染，随后 refreshGitStatus 会带标记重建
        setAntTreeData(buildAntTree(data.tree, {}));
        setExpandedKeys(data.tree.map((n: RawTreeNode) => n.key));
        setCheckedKeys([]);
        setSyncComplete(false);
        setLogs([]);
      }
    } catch {
      message.error('加载文件树失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sourceProject) loadTree(sourceProject);
  }, [sourceProject, loadTree]);

  // 树加载完毕后自动拉取 git 状态
  useEffect(() => {
    if (sourceProject && rawTreeRef.current.length > 0) {
      refreshGitStatus(sourceProject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antTreeData.length, sourceProject]);

  const handleSync = async () => {
    if (checkedKeys.length === 0) { message.warning('请至少选择一个文件或文件夹'); return; }
    if (targetProjects.length === 0) { message.warning('目标项目未就绪'); return; }

    setSyncing(true);
    setSyncComplete(false);
    setLogs([]);
    let finished = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const params = new URLSearchParams({
      source: sourceProject,
      targets: targetProjects.join(','),
      selected: getMinimalPaths(checkedKeys).join(','),
    });

    try {
      const response = await fetch(`/api/code-sync/sync?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const log: SyncLog = JSON.parse(line.slice(6));
              setLogs((prev) => [...prev, log]);
              if (log.type === 'finish') finished = true;
            } catch { /* ignore */ }
          }
        }
      }

      if (finished) {
        setSyncComplete(true);
        message.success('同步完成');
        refreshGitStatus(sourceProject);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        message.error(`同步失败: ${(e as Error).message}`);
        setLogs((prev) => [...prev, { type: 'error', message: `连接中断: ${(e as Error).message}` }]);
      }
    } finally {
      setSyncing(false);
      abortControllerRef.current = null;
    }
  };

  const hasErrors = logs.some((l) => l.type === 'error');

  /** 从原始树中收集所有指定状态的文件 key */
  function collectKeysByStatus(nodes: RawTreeNode[], status: GitFileStatus): string[] {
    const result: string[] = [];
    function walk(node: RawTreeNode) {
      if (!node.isDir && statusMapRef.current[node.key] === status) {
        result.push(node.key);
      }
      for (const child of node.children ?? []) walk(child);
    }
    for (const node of nodes) walk(node);
    return result;
  }

  function selectByStatus(status: GitFileStatus) {
    const keys = collectKeysByStatus(rawTreeRef.current, status);
    if (keys.length === 0) {
      message.info(`没有状态为"${status === 'new' ? '新增' : status === 'modified' ? '改动' : '删除'}"的文件`);
      return;
    }
    setCheckedKeys(keys);
    message.success(`已选中 ${keys.length} 个文件`);
  }

  return (
    <div className="code-sync-page">
      <Title level={4}><SyncOutlined spin={syncing} /> 代码同步</Title>
      <Text type="secondary">从源项目勾选需要同步的文件/文件夹，点击同步后自动同步到目标项目</Text>

      <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 16 }}>
        {/* 同步配置 */}
        <Card size="small" title="同步配置">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">源项目：</Text>
              <Tag color="blue">{SOURCE_PROJECT_NAME}</Tag>
              {sourceProject && <Text type="secondary" style={{ fontSize: 12 }}>{sourceProject}</Text>}
            </div>
            <div>
              <Text type="secondary">同步目标：</Text>
              {TARGET_PROJECT_NAMES.map((n) => <Tag key={n} color="green">{n}</Tag>)}
            </div>
            <Space size={16} style={{ marginTop: 4 }}>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => selectByStatus('new')}>
                <GitStatusBadge status="new" /><Text style={{ fontSize: 12, marginLeft: 4 }}>新增文件（点击全选）</Text>
              </Button>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => selectByStatus('modified')}>
                <GitStatusBadge status="modified" /><Text style={{ fontSize: 12, marginLeft: 4 }}>有改动（点击全选）</Text>
              </Button>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => selectByStatus('deleted')}>
                <GitStatusBadge status="deleted" /><Text style={{ fontSize: 12, marginLeft: 4 }}>已删除（点击全选）</Text>
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 文件选择 + 同步操作 */}
        <Card
          size="small"
          title={
            <Space>
              选择同步内容
              {gitChangedCount > 0 && (
                <Tag color="orange">{gitChangedCount} 个文件有变更</Tag>
              )}
            </Space>
          }
          extra={
            <Button
              size="small"
              icon={<ReloadOutlined spin={gitLoading} />}
              onClick={() => refreshGitStatus(sourceProject)}
              disabled={!sourceProject || gitLoading}
            >
              刷新 Git 状态
            </Button>
          }
        >
          <div className="code-sync-body">
            {/* 左侧：文件树 */}
            <div className="code-sync-tree-panel">
              <Text strong>文件选择</Text>
              <Spin spinning={loading}>
                <Tree.DirectoryTree
                  checkable
                  treeData={antTreeData}
                  checkedKeys={checkedKeys}
                  expandedKeys={expandedKeys}
                  onCheck={(keys) => {
                    const keyList = Array.isArray(keys)
                      ? keys
                      : (keys as { checked: Key[]; halfChecked: Key[] }).checked;
                    setCheckedKeys(keyList as string[]);
                  }}
                  onExpand={(keys) => setExpandedKeys(keys as string[])}
                  showIcon
                  blockNode
                />
              </Spin>
            </div>

            {/* 右侧：同步操作 + 进度 */}
            <div className="code-sync-target-panel">
              <div className="code-sync-actions">
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={handleSync}
                  loading={syncing}
                  disabled={checkedKeys.length === 0 || targetProjects.length === 0}
                  size="large"
                >
                  确认同步 ({getMinimalPaths(checkedKeys).length} 项 → {TARGET_PROJECT_NAMES.length} 个项目)
                </Button>
              </div>

              {logs.length > 0 && (
                <div className="code-sync-logs">
                  <Text strong>同步日志</Text>
                  <Collapse defaultActiveKey={[]} accordion className="code-sync-collapse">
                    {logs.map((log, index) => {
                      let icon = null;
                      let color = '';
                      switch (log.type) {
                        case 'start':    icon = <SyncOutlined />;         color = '#1890ff'; break;
                        case 'info':     icon = <FolderOpenOutlined />;   color = '#52c41a'; break;
                        case 'progress': icon = <CheckCircleOutlined />;  color = '#52c41a'; break;
                        case 'warn':     icon = <WarningOutlined />;      color = '#faad14'; break;
                        case 'error':    icon = <CloseCircleOutlined />;  color = '#ff4d4f'; break;
                        case 'complete': icon = <CheckCircleOutlined />;  color = '#52c41a'; break;
                        case 'finish':   icon = <CheckCircleOutlined />;  color = '#52c41a'; break;
                        default: break;
                      }
                      return (
                        <Panel
                          key={index}
                          header={
                            <Space>
                              {icon}
                              <Text style={{ color }}>{log.message || log.file}</Text>
                              {log.target && <Tag color="blue">{log.target.split('/').pop()}</Tag>}
                              {log.status === 'ok' && <Tag color="green">成功</Tag>}
                            </Space>
                          }
                        >
                          {log.detail && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{log.detail}</pre>}
                          {log.file && <Text type="secondary">文件: {log.file}</Text>}
                          {log.target && <Text type="secondary"> 目标: {log.target}</Text>}
                        </Panel>
                      );
                    })}
                  </Collapse>
                </div>
              )}

              {syncComplete && !hasErrors && (
                <Alert message="同步完成" description="所有文件已成功同步到目标项目" type="success" showIcon closable />
              )}
              {hasErrors && (
                <Alert message="同步完成（有错误）" description="部分文件同步失败，请查看上方日志" type="error" showIcon closable />
              )}
            </div>
          </div>
        </Card>
      </Space>
    </div>
  );
};

export default CodeSync;

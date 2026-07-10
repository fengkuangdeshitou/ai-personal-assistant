import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tree, Button, message, Card, Space, Alert,
  Tag, Spin, Typography, Collapse, Modal, List,
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

/** 源项目文件树（可勾选）—— 独立 memo 组件，expandedKeys 内部管理 */
const SourceTree = React.memo(({
  treeData,
  checkedKeys,
  onCheck,
}: {
  treeData: AntTreeNode[];
  checkedKeys: string[];
  onCheck: (keys: string[]) => void;
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (treeData.length === 0) return;
    setExpandedKeys(treeData.map((n) => n.key));
  }, [treeData]);

  return (
    <Tree.DirectoryTree
      checkable
      virtual
      treeData={treeData}
      checkedKeys={checkedKeys}
      expandedKeys={expandedKeys}
      onCheck={(keys) => {
        const keyList = Array.isArray(keys)
          ? keys
          : (keys as { checked: Key[]; halfChecked: Key[] }).checked;
        onCheck(keyList as string[]);
      }}
      onExpand={(keys) => setExpandedKeys(keys as string[])}
      showIcon
      blockNode
    />
  );
});
const TargetTree = React.memo(({
  projectPath,
  name,
  treeData,
  loading,
  onRefresh,
}: {
  projectPath: string;
  name: string;
  treeData: AntTreeNode[];
  loading: boolean;
  onRefresh: () => void;
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // treeData 更新时（首次加载或同步后刷新）展开所有目录
  useEffect(() => {
    if (treeData.length === 0) return;
    const keys: string[] = [];
    function collect(nodes: AntTreeNode[]) {
      for (const node of nodes) {
        if (!node.isLeaf) {
          keys.push(node.key);
          if (node.children) collect(node.children);
        }
      }
    }
    collect(treeData);
    setExpandedKeys(keys);
  }, [treeData]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          <Tag color="green">{name}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>（目标，只读）</Text>
        </span>
        <Button
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          onClick={onRefresh}
          disabled={loading}
        />
      </div>
      <Spin spinning={loading}>
        <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: '4px 0' }}>
          <Tree.DirectoryTree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            showIcon
            blockNode
            virtual
          />
        </div>
      </Spin>
    </div>
  );
});

/** 递归收集所有目录节点的 key，确保树刷新后全部展开 */
function collectAllDirKeys(nodes: RawTreeNode[]): string[] {
  const keys: string[] = [];
  function walk(node: RawTreeNode) {
    if (node.isDir) {
      keys.push(node.key);
      for (const child of node.children ?? []) walk(child);
    }
  }
  for (const node of nodes) walk(node);
  return keys;
}


const CodeSync: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [sourceProject, setSourceProject] = useState<string>('');
  const [targetProjects, setTargetProjects] = useState<string[]>([]);
  const rawTreeRef = useRef<RawTreeNode[]>([]);
  const statusMapRef = useRef<Record<string, GitFileStatus | 'changed'>>({});
  const [antTreeData, setAntTreeData] = useState<AntTreeNode[]>([]);
  // 目标项目文件树 key=项目路径
  const [targetTreeData, setTargetTreeData] = useState<Record<string, AntTreeNode[]>>({});
  const [targetTreeLoading, setTargetTreeLoading] = useState<Record<string, boolean>>({});
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [gitChangedCount, setGitChangedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
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

  /** 加载单个目标项目的文件树（只读展示） */
  const loadTargetTree = useCallback(async (projectPath: string) => {
    setTargetTreeLoading((prev) => ({ ...prev, [projectPath]: true }));
    try {
      const { data } = await axios.get('/api/code-sync/tree', { params: { path: projectPath } });
      if (data.success) {
        setTargetTreeData((prev) => ({
          ...prev,
          [projectPath]: buildAntTree(data.tree, {}),
        }));
        // 展开逻辑交由 TargetTree 内部 useEffect 处理
      }
    } catch (e) {
      console.error('目标项目树加载失败:', projectPath, e);
      message.warning(`目标项目文件树加载失败: ${projectPath.split('/').pop()}`);
    } finally {
      setTargetTreeLoading((prev) => ({ ...prev, [projectPath]: false }));
    }
  }, []);

  useEffect(() => {
    targetProjects.forEach((p) => loadTargetTree(p));
  }, [targetProjects, loadTargetTree]);

  const loadTree = useCallback(async (projectPath: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/code-sync/tree', { params: { path: projectPath } });
      if (data.success) {
        rawTreeRef.current = data.tree;
        setAntTreeData(buildAntTree(data.tree, {}));
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

  /** 点击"确认同步"按钮：先预检，再弹确认框 */
  const handleSyncClick = () => {
    if (checkedKeys.length === 0) { message.warning('请至少选择一个文件或文件夹'); return; }
    if (targetProjects.length === 0) { message.warning('目标项目未就绪'); return; }
    const minimal = getMinimalPaths(checkedKeys);
    setPendingKeys(minimal);
    setConfirmVisible(true);
  };

  /** 确认后执行实际同步 */
  const handleSync = async () => {
    setConfirmVisible(false);

    setSyncing(true);
    setSyncComplete(false);
    setLogs([]);
    let finished = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const params = new URLSearchParams({
      source: sourceProject,
      targets: targetProjects.join(','),
      selected: pendingKeys.join(','),
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
        // 同步完成后刷新目标项目文件树
        targetProjects.forEach((p) => loadTargetTree(p));
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
    // 判断当前是否已全选该状态的文件，是则取消，否则全选
    const allSelected = keys.every((k) => checkedKeys.includes(k));
    if (allSelected) {
      setCheckedKeys((prev) => prev.filter((k) => !keys.includes(k)));
      message.info(`已取消选中 ${keys.length} 个文件`);
    } else {
      setCheckedKeys((prev) => Array.from(new Set([...prev, ...keys])));
      message.success(`已选中 ${keys.length} 个文件`);
    }
  }

  return (
    <div className="code-sync-page">
      <Title level={4}><SyncOutlined spin={syncing} /> 代码同步</Title>
      <Text type="secondary">从源项目勾选需要同步的文件/文件夹，点击同步后自动同步到目标项目</Text>

      <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 16 }}>
        {/* 同步配置 — 右侧放确认同步按钮 */}
        <Card
          size="small"
          title="同步配置"
          extra={
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleSyncClick}
              loading={syncing}
              disabled={checkedKeys.length === 0 || targetProjects.length === 0}
            >
              确认同步 ({getMinimalPaths(checkedKeys).length} 项 → {TARGET_PROJECT_NAMES.length} 个项目)
            </Button>
          }
        >
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

        {/* 选择同步内容 — 并排展示 3 棵文件树 */}
        <Card
          size="small"
          title={
            <Space>
              选择同步内容
              {gitChangedCount > 0 && <Tag color="orange">{gitChangedCount} 个文件有变更</Tag>}
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* 源项目树 — 可勾选 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                <Tag color="blue">{SOURCE_PROJECT_NAME}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>（勾选要同步的内容）</Text>
              </div>
              <Spin spinning={loading}>
                <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: '4px 0' }}>
                  <SourceTree
                    treeData={antTreeData}
                    checkedKeys={checkedKeys}
                    onCheck={setCheckedKeys}
                  />
                </div>
              </Spin>
            </div>

            {/* 目标项目树 — 只读，使用独立 memo 组件避免父组件重渲染 */}
            {targetProjects.map((tp, idx) => (
              <TargetTree
                key={tp}
                projectPath={tp}
                name={TARGET_PROJECT_NAMES[idx] ?? tp.split('/').pop() ?? tp}
                treeData={targetTreeData[tp] ?? []}
                loading={!!targetTreeLoading[tp]}
                onRefresh={() => loadTargetTree(tp)}
              />
            ))}
          </div>

          {/* 同步日志 & 结果 */}
          {(logs.length > 0 || syncComplete || hasErrors) && (
            <div style={{ marginTop: 16 }}>
              {logs.length > 0 && (
                <div className="code-sync-logs">
                  <Text strong>同步日志</Text>
                  <Collapse defaultActiveKey={[]} accordion className="code-sync-collapse">
                    {logs.map((log, index) => {
                      let icon = null;
                      let color = '';
                      switch (log.type) {
                        case 'start':    icon = <SyncOutlined />;        color = '#1890ff'; break;
                        case 'info':     icon = <FolderOpenOutlined />;  color = '#52c41a'; break;
                        case 'progress': icon = <CheckCircleOutlined />; color = '#52c41a'; break;
                        case 'warn':     icon = <WarningOutlined />;     color = '#faad14'; break;
                        case 'error':    icon = <CloseCircleOutlined />; color = '#ff4d4f'; break;
                        case 'complete': icon = <CheckCircleOutlined />; color = '#52c41a'; break;
                        case 'finish':   icon = <CheckCircleOutlined />; color = '#52c41a'; break;
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
                <Alert message="同步完成" description="所有文件已成功同步到目标项目" type="success" showIcon closable style={{ marginTop: 8 }} />
              )}
              {hasErrors && (
                <Alert message="同步完成（有错误）" description="部分文件同步失败，请查看上方日志" type="error" showIcon closable style={{ marginTop: 8 }} />
              )}
            </div>
          )}
        </Card>
      </Space>

      {/* 同步路径确认弹窗 */}
      <Modal
        title={<span><SyncOutlined /> 确认同步路径</span>}
        open={confirmVisible}
        onOk={handleSync}
        onCancel={() => setConfirmVisible(false)}
        okText="确认同步"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <Text>以下文件/文件夹将按<Text strong>相同的相对路径</Text>同步到目标项目：</Text>
        </div>
        <List
          size="small"
          bordered
          style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}
          dataSource={pendingKeys}
          renderItem={(key) => (
            <List.Item style={{ padding: '4px 12px' }}>
              <Space>
                <Tag color="blue" style={{ fontFamily: 'monospace' }}>{key}</Tag>
                <Text type="secondary">→</Text>
                {TARGET_PROJECT_NAMES.map((name) => (
                  <Tag key={name} color="green" style={{ fontFamily: 'monospace' }}>
                    {name}/{key}
                  </Tag>
                ))}
              </Space>
            </List.Item>
          )}
        />
        <Alert
          type="info"
          showIcon
          message="目标项目中不存在的中间目录将自动创建，已存在的同名文件将被覆盖。"
        />
      </Modal>
    </div>
  );
};

export default CodeSync;

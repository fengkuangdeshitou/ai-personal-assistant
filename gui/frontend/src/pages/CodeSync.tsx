import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tree, Button, message, Card, Space, Alert,
  Tag, Spin, Typography, Collapse, Badge,
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

// 固定的源项目和同步目标项目名称
const SOURCE_PROJECT_NAME = 'react-agent-website';
const TARGET_PROJECT_NAMES = ['games-52-play-web', 'hg-bookmark'];

type GitFileStatus = 'new' | 'modified' | 'deleted';

interface TreeNode {
  key: string;
  title: string;
  isDir: boolean;
  children?: TreeNode[];
}

interface SyncLog {
  type: 'start' | 'info' | 'progress' | 'warn' | 'error' | 'complete' | 'finish';
  message?: string;
  file?: string;
  target?: string;
  status?: string;
  detail?: string;
}

/**
 * 从选中路径列表中去除被祖先路径覆盖的子路径，避免 rsync 重复同步。
 */
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

/**
 * 将文件级别的 git 状态向上传递到父目录。
 * 目录状态优先级：new > modified > deleted。
 * 同时统计每个目录下的变更文件数量。
 */
function buildGitStatusWithDirs(
  fileStatusMap: Record<string, GitFileStatus>,
  treeData: TreeNode[],
): {
  statusMap: Record<string, GitFileStatus | 'changed'>;
  countMap: Record<string, number>;
} {
  const statusMap: Record<string, GitFileStatus | 'changed'> = { ...fileStatusMap };
  const countMap: Record<string, number> = {};

  const PRIORITY: Record<string, number> = { new: 3, modified: 2, deleted: 1, changed: 0 };

  function processNode(node: TreeNode): number {
    if (!node.isDir) {
      return fileStatusMap[node.key] ? 1 : 0;
    }
    let changedCount = 0;
    let highestStatus: GitFileStatus | 'changed' | null = null;

    for (const child of node.children ?? []) {
      changedCount += processNode(child);
      const childStatus = statusMap[child.key];
      if (childStatus) {
        if (highestStatus === null || PRIORITY[childStatus] > PRIORITY[highestStatus]) {
          highestStatus = childStatus;
        }
      }
    }

    if (changedCount > 0) {
      countMap[node.key] = changedCount;
      statusMap[node.key] = highestStatus ?? 'changed';
    }
    return changedCount;
  }

  for (const node of treeData) {
    processNode(node);
  }

  return { statusMap, countMap };
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  new:      { color: '#52c41a', label: '新' },
  modified: { color: '#fa8c16', label: '改' },
  deleted:  { color: '#ff4d4f', label: '删' },
  changed:  { color: '#1890ff', label: '•' },
};

const CodeSync: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [sourceProject, setSourceProject] = useState<string>('');
  const [targetProjects, setTargetProjects] = useState<string[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, GitFileStatus | 'changed'>>({});
  const [gitCountMap, setGitCountMap] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncComplete, setSyncComplete] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // 用 ref 缓存 treeData 以便 loadGitStatus 中使用
  const treeDataRef = useRef<TreeNode[]>([]);

  // 加载 git 状态
  const loadGitStatus = useCallback(async (projectPath: string) => {
    if (!projectPath) return;
    setGitLoading(true);
    try {
      const { data } = await axios.get('/api/code-sync/git-status', {
        params: { path: projectPath },
      });
      if (data.success) {
        const { statusMap, countMap } = buildGitStatusWithDirs(data.status, treeDataRef.current);
        setGitStatusMap(statusMap);
        setGitCountMap(countMap);
      }
    } catch {
      // git 状态加载失败不影响主流程
    } finally {
      setGitLoading(false);
    }
  }, []);

  // 加载项目列表，从中解析出固定源项目和目标项目的完整路径
  const loadProjects = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/code-sync/projects');
      if (data.success) {
        const projects: { name: string; path: string }[] = data.projects;

        const src = projects.find((p) => p.name === SOURCE_PROJECT_NAME);
        if (!src) {
          message.error(`未找到源项目: ${SOURCE_PROJECT_NAME}`);
          return;
        }
        setSourceProject(src.path);

        const targets = TARGET_PROJECT_NAMES.map((name) => {
          const found = projects.find((p) => p.name === name);
          if (!found) message.warning(`未找到目标项目: ${name}`);
          return found?.path ?? '';
        }).filter(Boolean);

        setTargetProjects(targets);
      }
    } catch {
      message.error('加载项目列表失败');
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 组件卸载时取消正在进行的同步请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 加载文件树，加载完成后立即拉取 git 状态
  const loadTree = useCallback(async (projectPath: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/code-sync/tree', {
        params: { path: projectPath },
      });
      if (data.success) {
        treeDataRef.current = data.tree;
        setTreeData(data.tree);
        const initialExpanded = data.tree.map((node: TreeNode) => node.key);
        setExpandedKeys(initialExpanded);
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
    if (sourceProject) {
      loadTree(sourceProject).then(() => loadGitStatus(sourceProject));
    }
  }, [sourceProject, loadTree, loadGitStatus]);

  const handleSync = async () => {
    if (checkedKeys.length === 0) {
      message.warning('请至少选择一个文件或文件夹');
      return;
    }
    if (targetProjects.length === 0) {
      message.warning('目标项目未就绪，请检查项目配置');
      return;
    }

    setSyncing(true);
    setSyncComplete(false);
    setLogs([]);

    let finished = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const minimalKeys = getMinimalPaths(checkedKeys);

    const params = new URLSearchParams({
      source: sourceProject,
      targets: targetProjects.join(','),
      selected: minimalKeys.join(','),
    });

    try {
      const response = await fetch(`/api/code-sync/sync?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

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
              if (log.type === 'finish') {
                finished = true;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      if (finished) {
        setSyncComplete(true);
        message.success('同步完成');
        // 同步完成后刷新 git 状态
        loadGitStatus(sourceProject);
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

  // 渲染带 git 状态标签的树节点标题
  const titleRender = (node: TreeNode) => {
    const status = gitStatusMap[node.key];
    const count = gitCountMap[node.key];
    const tag = status ? STATUS_TAG[status] : null;

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span>{node.title}</span>
        {tag && node.isDir && count != null && (
          <Badge
            count={count}
            size="small"
            style={{ backgroundColor: tag.color, fontSize: 10, minWidth: 16, height: 16, lineHeight: '16px' }}
          />
        )}
        {tag && !node.isDir && (
          <span
            style={{
              fontSize: 10,
              color: '#fff',
              backgroundColor: tag.color,
              borderRadius: 3,
              padding: '0 4px',
              lineHeight: '16px',
              display: 'inline-block',
            }}
          >
            {tag.label}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="code-sync-page">
      <Title level={4}>
        <SyncOutlined spin={syncing} /> 代码同步
      </Title>
      <Text type="secondary">
        从源项目勾选需要同步的文件/文件夹，点击同步后自动同步到目标项目
      </Text>

      <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 16 }}>
        {/* 固定的项目配置信息 */}
        <Card size="small" title="同步配置">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">源项目：</Text>
              <Tag color="blue">{SOURCE_PROJECT_NAME}</Tag>
              {sourceProject && (
                <Text type="secondary" style={{ fontSize: 12 }}>{sourceProject}</Text>
              )}
            </div>
            <div>
              <Text type="secondary">同步目标：</Text>
              {TARGET_PROJECT_NAMES.map((name) => (
                <Tag key={name} color="green">{name}</Tag>
              ))}
            </div>
            <Space size={12} style={{ marginTop: 4 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#52c41a', marginRight: 4 }} />新文件</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#fa8c16', marginRight: 4 }} />有改动</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#ff4d4f', marginRight: 4 }} />已删除</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#1890ff', marginRight: 4 }} />目录有变更</span>
            </Space>
          </Space>
        </Card>

        {/* 文件选择 + 同步操作 */}
        <Card
          size="small"
          title="选择同步内容"
          extra={
            <Button
              size="small"
              icon={<ReloadOutlined spin={gitLoading} />}
              onClick={() => loadGitStatus(sourceProject)}
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
                  treeData={treeData}
                  checkedKeys={checkedKeys}
                  expandedKeys={expandedKeys}
                  titleRender={(node) => titleRender(node as unknown as TreeNode)}
                  onCheck={(keys) => {
                    const keyList = Array.isArray(keys) ? keys : (keys as { checked: Key[]; halfChecked: Key[] }).checked;
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
              {/* 同步按钮 */}
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

              {/* 同步日志 */}
              {logs.length > 0 && (
                <div className="code-sync-logs">
                  <Text strong>同步日志</Text>
                  <Collapse
                    defaultActiveKey={[]}
                    accordion
                    className="code-sync-collapse"
                  >
                    {logs.map((log, index) => {
                      let icon = null;
                      let color = '';
                      switch (log.type) {
                        case 'start':
                          icon = <SyncOutlined />;
                          color = '#1890ff';
                          break;
                        case 'info':
                          icon = <FolderOpenOutlined />;
                          color = '#52c41a';
                          break;
                        case 'progress':
                          icon = <CheckCircleOutlined />;
                          color = '#52c41a';
                          break;
                        case 'warn':
                          icon = <WarningOutlined />;
                          color = '#faad14';
                          break;
                        case 'error':
                          icon = <CloseCircleOutlined />;
                          color = '#ff4d4f';
                          break;
                        case 'complete':
                          icon = <CheckCircleOutlined />;
                          color = '#52c41a';
                          break;
                        case 'finish':
                          icon = <CheckCircleOutlined />;
                          color = '#52c41a';
                          break;
                        default:
                          break;
                      }

                      return (
                        <Panel
                          key={index}
                          header={
                            <Space>
                              {icon}
                              <Text style={{ color }}>{log.message || log.file}</Text>
                              {log.target && (
                                <Tag color="blue">{log.target.split('/').pop()}</Tag>
                              )}
                              {log.status === 'ok' && <Tag color="green">成功</Tag>}
                              {log.status === 'warn' && <Tag color="orange">警告</Tag>}
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

              {/* 同步完成 */}
              {syncComplete && !hasErrors && (
                <Alert
                  message="同步完成"
                  description="所有文件已成功同步到目标项目"
                  type="success"
                  showIcon
                  closable
                />
              )}
              {hasErrors && (
                <Alert
                  message="同步完成（有错误）"
                  description="部分文件同步失败，请查看上方日志"
                  type="error"
                  showIcon
                  closable
                />
              )}
            </div>
          </div>
        </Card>
      </Space>
    </div>
  );
};

export default CodeSync;

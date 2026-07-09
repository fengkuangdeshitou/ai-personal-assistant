import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tree, Button, message, Card, Space, Alert, Select,
  Tag, Spin, Typography, Collapse,
} from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { Key } from 'rc-tree/lib/interface';
import axios from 'axios';
import './CodeSync.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;

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
 * 例如选中 ['src/components', 'src/components/Button.tsx']，只保留 ['src/components']。
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

const CodeSync: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<{ name: string; path: string }[]>([]);
  const [sourceProject, setSourceProject] = useState<string>('');
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [targetProjects, setTargetProjects] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncComplete, setSyncComplete] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 加载项目列表，仅在组件挂载时执行一次
  const loadProjects = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/code-sync/projects');
      if (data.success) {
        setProjects(data.projects);
        // 默认选中第一个项目作为源项目（使用函数式更新避免依赖 sourceProject）
        setSourceProject((prev) => {
          if (!prev && data.projects.length > 0) return data.projects[0].path;
          return prev;
        });
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

  // 加载文件树
  const loadTree = useCallback(async (projectPath: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/code-sync/tree', {
        params: { path: projectPath },
      });
      if (data.success) {
        setTreeData(data.tree);
        // 默认展开一级
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
      loadTree(sourceProject);
    }
  }, [sourceProject, loadTree]);

  // 同步目标选择
  const allTargetPaths = projects
    .filter((p) => p.path !== sourceProject)
    .map((p) => p.path);

  const handleSync = async () => {
    if (checkedKeys.length === 0) {
      message.warning('请至少选择一个文件或文件夹');
      return;
    }
    if (targetProjects.length === 0) {
      message.warning('请至少选择一个同步目标');
      return;
    }

    setSyncing(true);
    setSyncComplete(false);
    setLogs([]);

    // 用本地变量追踪是否收到 finish 事件，避免读取到过期的 React state
    let finished = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 去除被父路径覆盖的子路径，避免 rsync 重复执行
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

        // 解析 SSE 格式
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整行

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

  // 渲染树节点图标
  const renderTreeIcon = (node: TreeNode) => {
    if (node.isDir) {
      return <FolderOpenOutlined style={{ color: '#faad14' }} />;
    }
    return <FileTextOutlined style={{ color: '#1890ff' }} />;
  };

  return (
    <div className="code-sync-page">
      <Title level={4}>
        <SyncOutlined spin={syncing} /> 代码同步
      </Title>
      <Text type="secondary">
        从源项目勾选需要同步的文件/文件夹，选择目标项目后执行同步
      </Text>

      <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 16 }}>
        {/* 源项目选择 */}
        <Card size="small" title="源项目">
          <Select
            value={sourceProject}
            onChange={(val) => setSourceProject(val)}
            style={{ width: '100%' }}
            placeholder="选择源项目"
            loading={!projects.length}
          >
            {projects.map((p) => (
              <Select.Option key={p.path} value={p.path}>
                {p.name} ({p.path})
              </Select.Option>
            ))}
          </Select>
        </Card>

        {/* 文件选择 + 同步目标 */}
        <Card size="small" title="选择同步内容">
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
                  onCheck={(keys) => {
                    const keyList = Array.isArray(keys) ? keys : (keys as { checked: Key[]; halfChecked: Key[] }).checked;
                    setCheckedKeys(keyList as string[]);
                  }}
                  onExpand={(keys) => setExpandedKeys(keys)}
                  showIcon
                  icon={renderTreeIcon}
                  blockNode
                />
              </Spin>
            </div>

            {/* 右侧：同步目标 + 进度 */}
            <div className="code-sync-target-panel">
              {/* 同步目标 */}
              <div className="code-sync-targets">
                <Text strong>同步目标</Text>
                <div className="target-checkboxes">
                  {allTargetPaths.map((targetPath) => {
                    const targetName = projects.find((p) => p.path === targetPath)?.name || targetPath;
                    return (
                      <label key={targetPath} className="target-item">
                        <input
                          type="checkbox"
                          checked={targetProjects.includes(targetPath)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTargetProjects([...targetProjects, targetPath]);
                            } else {
                              setTargetProjects(targetProjects.filter((t) => t !== targetPath));
                            }
                          }}
                        />
                        <span>
                          {targetName}
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            ({targetPath})
                          </Text>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

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
                  确认同步 ({getMinimalPaths(checkedKeys).length} 项 → {targetProjects.length} 个项目)
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

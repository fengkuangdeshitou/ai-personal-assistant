import React, { useState } from 'react';
import {
  Card, Button, Typography, Space, message,
  Table, Tag, Spin, Empty, Divider, Alert, Progress,
  Row, Col, List, Tooltip,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  FileZipOutlined,
  AppstoreOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';

const { Text, Title } = Typography;

const baseUrl = getApiBaseUrl();

interface SdkItem {
  name: string;
  path: string;
  size: number;
  type?: 'framework' | 'bundle' | 'dylib';
  version?: string;
  bundleVersion?: string;
}

const SDK_TYPE_LABEL: Record<string, string> = {
  framework: 'Framework',
  bundle: 'Bundle',
  dylib: 'Dylib',
};

/** 磁盘上的 SDK 文件（通过 osascript 文件选择框选取） */
interface DiskSdkItem {
  id: string;
  name: string;
  path: string;
}

interface ReplacedItem {
  id: string;
  sdkName: string;
  sdkPath: string;
  resourceName: string;
  status: 'pending' | 'replacing' | 'done' | 'failed';
  replacedAt?: string;
  error?: string;
}

let counter = 0;
const nextId = () => `item_${++counter}`;

function normalizeSdkKey(name: string): string {
  return name
    .replace(/\.zip$/i, '')
    .replace(/\.(framework|bundle|dylib)$/i, '')
    .toLowerCase()
    .trim();
}

const SdkReplacer: React.FC = () => {
  // ── 磁盘 SDK 文件列表
  const [diskSdkItems, setDiskSdkItems]         = useState<DiskSdkItem[]>([]);
  const [frameworkPicking, setFrameworkPicking] = useState(false);
  const [bundlePicking, setBundlePicking]       = useState(false);

  // ── IPA
  const [sessionId, setSessionId]           = useState('');
  const [ipaName, setIpaName]               = useState('');
  const [ipaLoading, setIpaLoading]           = useState(false);
  const [selectedIpaPath, setSelectedIpaPath] = useState('');
  const [appName, setAppName]                 = useState('');

  // ── 解析结果
  const [sdkList, setSdkList] = useState<SdkItem[]>([]);

  // ── 替换状态
  const [replacing, setReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [replacedItems, setReplacedItems] = useState<ReplacedItem[]>([]);
  const [outputIpaName, setOutputIpaName] = useState('');

  const clearIpaResult = () => {
    setSdkList([]);
    setSessionId('');
    setIpaName('');
    setAppName('');
    setSelectedIpaPath('');
    setReplacedItems([]);
    setOutputIpaName('');
    setReplaceProgress(null);
  };

  /* ─── 从本机选择 SDK ─── */
  const pickSdkByEndpoint = async (endpoint: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/ipa/${endpoint}`);
      const data = await res.json();
      if (data.success && data.paths?.length > 0) {
        const newItems: DiskSdkItem[] = data.paths
          .filter((p: string) => !diskSdkItems.some(d => d.path === p))
          .map((p: string) => ({
            id: nextId(),
            name: p.replace(/\/$/, '').split('/').pop() || p,
            path: p,
          }));
        if (newItems.length > 0) {
          setDiskSdkItems(prev => [...prev, ...newItems]);
          message.success(`已添加 ${newItems.length} 个`);
        } else {
          message.info('所选项目已存在于列表中');
        }
      } else if (!data.cancelled) {
        message.error(data.error || '选择失败');
      }
    } catch (e) {
      message.error('请求失败，请确认后端正在运行');
    } finally {
      setLoading(false);
    }
  };

  const handlePickFrameworks = () => pickSdkByEndpoint('pick-sdk-frameworks', setFrameworkPicking);
  const handlePickBundles    = () => pickSdkByEndpoint('pick-sdk-bundles', setBundlePicking);

  /* ─── 通过本地路径解析 IPA ─── */
  const parseIpaFromPath = async (ipaPath: string) => {
    if (!ipaPath) return;
    if (ipaPath === selectedIpaPath) return;
    setSelectedIpaPath(ipaPath);
    setIpaLoading(true);
    clearIpaResult();
    try {
      const res = await fetch(`${baseUrl}/api/ipa/init-session-from-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipaPath }),
      });
      const data = await res.json().catch(() => { throw new Error(`服务器返回非 JSON 响应 (HTTP ${res.status})`); });
      if (data.success) {
        setSessionId(data.sessionId);
        setIpaName(data.ipaName);
        setAppName(data.appName || '');
        setSdkList(data.frameworks);
      } else {
        message.error(data.error || '解析失败');
        setSelectedIpaPath('');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '解析失败，请重试');
      setSelectedIpaPath('');
    } finally {
      setIpaLoading(false);
    }
  };

  /* ─── 打开 macOS 文件选择框选 IPA ─── */
  const handlePickIpa = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/ipa/pick-file`);
      const data = await res.json();
      if (data.success && data.path) {
        await parseIpaFromPath(data.path);
      } else if (!data.cancelled) {
        message.error(data.error || '选择文件失败');
      }
    } catch (e) {
      message.error('请求失败，请确认后端正在运行');
    }
  };

  /* ─── 开始替换（JSON 请求，不上传文件）─── */
  const handleReplace = async () => {
    if (!sessionId) { message.error('请先选择原始 IPA'); return; }
    if (diskSdkItems.length === 0) { message.warning('请先选择选择资源'); return; }

    setReplacing(true);
    setReplacedItems([]);
    setOutputIpaName('');

    const initialItems: ReplacedItem[] = diskSdkItems.map(d => ({
      id: d.id,
      sdkName: normalizeSdkKey(d.name),
      sdkPath: '',
      resourceName: d.name,
      status: 'pending',
    }));
    setReplacedItems(initialItems);

    for (let i = 0; i < diskSdkItems.length; i++) {
      setReplaceProgress({ current: i + 1, total: diskSdkItems.length + 1, name: diskSdkItems[i].name });
      setReplacedItems(prev => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'replacing' } : item
      ));
      await new Promise(r => setTimeout(r, 120));
    }
    setReplaceProgress({ current: diskSdkItems.length + 1, total: diskSdkItems.length + 1, name: '打包新 IPA...' });

    const hideLoading = message.loading('正在替换并打包 IPA，大文件可能需要数分钟，请稍候...', 0);

    try {
      const res = await fetch(`${baseUrl}/api/ipa/replace-by-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, sdkPaths: diskSdkItems.map(d => d.path) }),
      });

      const data = await res.json().catch(() => { throw new Error(`服务器返回非 JSON 响应 (HTTP ${res.status})`); });
      if (!data.success) throw new Error(data.error || `替换失败 (${res.status})`);

      const now = new Date().toLocaleString();
      setReplacedItems(prev => prev.map(item => ({ ...item, status: 'done', replacedAt: now })));
      const dlName = data.outputName || 'replaced.ipa';
      setOutputIpaName(dlName);

      const a = document.createElement('a');
      a.href = `${baseUrl}/api/ipa/download-replaced/${data.sessionId}?filename=${encodeURIComponent(dlName)}`;
      a.download = dlName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      message.success(`已替换 ${diskSdkItems.length} 个 SDK，下载已开始`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '替换失败';
      message.error(errMsg);
      setReplacedItems(prev => prev.map(item =>
        item.status === 'replacing' || item.status === 'pending'
          ? { ...item, status: 'failed', error: errMsg } : item
      ));
    } finally {
      hideLoading();
      setReplacing(false);
      setReplaceProgress(null);
    }
  };

  const ipaReady    = !!sessionId;
  const canReplace  = ipaReady && diskSdkItems.length > 0;

  const replaceDisabledReason = (() => {
    if (!ipaReady) return '请先选择原始 IPA';
    if (diskSdkItems.length === 0) return '请先选择选择资源（SDK zip 文件）';
    return '';
  })();

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>

        {/* ── 主卡片 ── */}
        <Card>
          <Row gutter={32} style={{ alignItems: 'stretch' }}>

            {/* 左列 */}
            <Col xs={24} md={11}>

              {/* ① 选择资源 */}
              <div style={{
                border: '1px dashed #d9d9d9', borderRadius: 8,
                padding: 16, marginBottom: 16, background: '#fafafa',
              }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                  <Space><FileZipOutlined style={{ color: '#fa8c16' }} />选择资源</Space>
                </Title>
                <Space.Compact block style={{ marginBottom: 8 }}>
                  <Button
                    icon={<FolderOpenOutlined />}
                    onClick={handlePickFrameworks}
                    loading={frameworkPicking}
                    style={{ width: '50%' }}
                  >
                    选择 .framework
                  </Button>
                  <Button
                    icon={<AppstoreOutlined />}
                    onClick={handlePickBundles}
                    loading={bundlePicking}
                    style={{ width: '50%' }}
                  >
                    选择 .bundle
                  </Button>
                </Space.Compact>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  均支持多选，可分别添加后一起替换
                </Text>
              </div>

              {/* ② 选择 IPA */}
              <div style={{
                border: '1px dashed #d9d9d9', borderRadius: 8,
                padding: 16, background: '#fafafa',
              }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                  <Space><InboxOutlined style={{ color: '#1677ff' }} />选择 IPA</Space>
                </Title>

                {/* IPA 基本信息（选中后显示在按钮上方） */}
                {ipaName && (
                  <div style={{
                    background: '#f6ffed', border: '1px solid #b7eb8f',
                    borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12,
                  }}>
                    <div>
                      <Text strong style={{ fontSize: 12 }}>
                        <CheckCircleFilled style={{ color: '#52c41a', marginRight: 6 }} />
                        {appName || ipaName}
                      </Text>
                    </div>
                    {appName && (
                      <div style={{ marginTop: 2 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>{ipaName}</Text>
                      </div>
                    )}
                  </div>
                )}

                <Spin spinning={ipaLoading} tip="解析中...">
                  <div style={{ marginBottom: 8 }}>
                    <Button
                      type="primary"
                      icon={<FolderOpenOutlined />}
                      onClick={handlePickIpa}
                      loading={ipaLoading}
                    >
                      {ipaLoading ? '解析中...' : '选择'}
                    </Button>
                  </div>
                  {!ipaName && !ipaLoading && (
                    <Text type="secondary" style={{ fontSize: 12 }}>未选择</Text>
                  )}
                </Spin>
              </div>
            </Col>

            <Col xs={0} md={1} style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
              <Divider type="vertical" style={{ height: '100%', margin: '0 auto' }} />
            </Col>

            {/* 右列：已选 SDK 资源 */}
            <Col xs={24} md={12} style={{ display: 'flex', flexDirection: 'column' }}>
              <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                <Space>
                  <AppstoreOutlined style={{ color: '#1677ff' }} />
                  已选 SDK 资源
                  {diskSdkItems.length > 0 && <Tag color="blue">{diskSdkItems.length} 个</Tag>}
                </Space>
              </Title>

              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {diskSdkItems.length > 0 ? (
                  <List
                    size="small"
                    dataSource={diskSdkItems}
                    renderItem={item => (
                      <List.Item
                        style={{ padding: '8px 0', alignItems: 'flex-start' }}
                        actions={[
                          <Tooltip title="移除">
                            <Button
                              type="text" danger size="small" icon={<DeleteOutlined />}
                              onClick={() => setDiskSdkItems(prev => prev.filter(d => d.id !== item.id))}
                            />
                          </Tooltip>,
                        ]}
                      >
                        <Space style={{ width: '100%', flex: 1 }}>
                          <FileZipOutlined style={{ color: '#fa8c16' }} />
                          <Text ellipsis style={{ maxWidth: 220 }} title={item.name}>{item.name}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>暂无选择资源<br />请在左侧点击"从本机选择"</Text>}
                    style={{ marginTop: 60 }}
                  />
                )}
              </div>
            </Col>
          </Row>
        </Card>

        {/* ── SDK 列表 ── */}
        {(ipaLoading || sdkList.length > 0) && (
          <Card
            title={
              <Space>
                <AppstoreOutlined />
                <span>IPA 内 Framework / Bundle 列表</span>
                {ipaName && <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>— {ipaName}</Text>}
                {sdkList.length > 0 && <Tag color="blue">{sdkList.length} 个</Tag>}
              </Space>
            }
            extra={
              <Tooltip title={!canReplace ? replaceDisabledReason : ''}>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleReplace}
                  loading={replacing}
                  disabled={!canReplace}
                >
                  {replacing && replaceProgress
                    ? `替换中 ${replaceProgress.current}/${replaceProgress.total}`
                    : '开始替换'}
                </Button>
              </Tooltip>
            }
          >
            {replacing && replaceProgress && (
              <Alert
                type="info" showIcon style={{ marginBottom: 12 }}
                message={`正在替换：${replaceProgress.name}（${replaceProgress.current} / ${replaceProgress.total}）`}
              />
            )}
            <Spin spinning={ipaLoading}>
              {sdkList.length === 0 ? (
                <Empty description="未找到 Framework / Bundle" />
              ) : (
                <Table
                  dataSource={sdkList}
                  rowKey="path"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '名称', dataIndex: 'name', key: 'name',
                      render: (v: string) => (
                        <Space>
                          <FileZipOutlined style={{ color: '#fa8c16' }} />
                          <Text strong>{v}</Text>
                        </Space>
                      ),
                    },
                    {
                      title: '类型', dataIndex: 'type', key: 'type', width: 100,
                      render: (type: SdkItem['type']) => {
                        const t = type || 'framework';
                        const color = t === 'bundle' ? 'purple' : t === 'dylib' ? 'cyan' : 'orange';
                        return <Tag color={color}>{SDK_TYPE_LABEL[t] || t}</Tag>;
                      },
                    },
                    {
                      title: '版本', dataIndex: 'version', key: 'version', width: 90,
                      render: (v: string) => v ? <Tag color="geekblue">v{v}</Tag> : <Text type="secondary">—</Text>,
                    },
                    {
                      title: '路径', dataIndex: 'path', key: 'path',
                      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
                    },
                    {
                      title: '替换状态', key: 'status', width: 90,
                      render: (_: unknown, record: SdkItem) => {
                        const done = replacedItems.find(
                          item => normalizeSdkKey(item.resourceName) === normalizeSdkKey(record.name) && item.status === 'done'
                        );
                        if (done) return <Tag color="success" icon={<CheckCircleFilled />}>已替换</Tag>;
                        const matched = diskSdkItems.some(d => normalizeSdkKey(d.name) === normalizeSdkKey(record.name));
                        if (matched) return <Tag color="processing">待替换</Tag>;
                        return <Tag>未匹配</Tag>;
                      },
                    },
                  ]}
                />
              )}
            </Spin>
          </Card>
        )}

        {/* ── 已替换记录 ── */}
        {replacedItems.length > 0 && (
          <Card
            title={
              <Space>
                <CheckCircleFilled style={{ color: '#52c41a' }} />
                <span>已替换</span>
                <Tag color="success">
                  {replacedItems.filter(i => i.status === 'done').length} / {replacedItems.length}
                </Tag>
              </Space>
            }
            extra={
              outputIpaName && sessionId ? (
                <Button
                  size="small" icon={<DownloadOutlined />}
                  onClick={() => {
                    const a = document.createElement('a');
                  a.href = `${baseUrl}/api/ipa/download-replaced/${sessionId}?filename=${encodeURIComponent(outputIpaName)}`;
                  a.download = outputIpaName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  重新下载 {outputIpaName}
                </Button>
              ) : null
            }
          >
            {replacing && replaceProgress && (
              <Progress
                percent={Math.round((replaceProgress.current / replaceProgress.total) * 100)}
                status="active" style={{ marginBottom: 16 }}
              />
            )}
            <Table
              dataSource={replacedItems}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'SDK 文件', dataIndex: 'resourceName', key: 'resourceName',
                  render: (v: string) => (
                    <Space>
                      <FileZipOutlined style={{ color: '#fa8c16' }} />
                      <Text strong>{v}</Text>
                    </Space>
                  ),
                },
                {
                  title: '状态', dataIndex: 'status', key: 'status', width: 100,
                  render: (status: ReplacedItem['status']) => {
                    if (status === 'done') return <Tag color="success" icon={<CheckCircleFilled />}>已完成</Tag>;
                    if (status === 'replacing') return <Tag color="processing">替换中</Tag>;
                    if (status === 'failed') return <Tag color="error">失败</Tag>;
                    return <Tag>等待中</Tag>;
                  },
                },
                {
                  title: '完成时间', dataIndex: 'replacedAt', key: 'replacedAt', width: 160,
                  render: (v: string) => v || '—',
                },
              ]}
            />
          </Card>
        )}

      </Space>
    </div>
  );
};

export default SdkReplacer;

import React, { useState, useMemo } from 'react';
import { getApiBaseUrl } from '../utils/api';
import {
  Card, Upload, Button, Typography, Table, Tag, Descriptions,
  Space, message, Empty, Collapse, Badge, Input, Tabs, Spin,
  Tree, Modal,
} from 'antd';
import {
  InboxOutlined,
  AppstoreOutlined,
  LinkOutlined,
  SafetyOutlined,
  ClearOutlined,
  CloudDownloadOutlined,
  FileOutlined,
  FileImageOutlined,
  CodeOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import ReactJson from 'react-json-view';
import type { UploadFile } from 'antd';
import type { DataNode } from 'antd/es/tree';

const { Dragger } = Upload;
const { Text, Title } = Typography;
const { Panel } = Collapse;
const { TabPane } = Tabs;
const { DirectoryTree } = Tree;

// ─── 类型 ──────────────────────────────────────────────────────────
interface AppInfo {
  name: string; bundleId: string; version: string; build: string;
  minOS: string; platform: string; sdkVersion: string; executable: string;
}
interface UrlScheme { scheme: string; name: string; }
interface Permission { key: string; label: string; description: string; }
interface FileNode {
  name: string; path: string; isDir: boolean;
  size: number; compressedSize?: number; time?: string; crc?: number;
  children?: FileNode[];
}
interface ParseResult {
  info: AppInfo;
  urlSchemes: UrlScheme[];
  permissions: Permission[];
  fileTree: FileNode[];
  plists: Record<string, any>;
}

// ─── 工具函数 ───────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

function getFileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function getFileIcon(name: string, isDir: boolean) {
  if (isDir) return null;
  const ext = getFileExt(name);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'icns', 'car'].includes(ext))
    return <FileImageOutlined style={{ color: '#52c41a' }} />;
  if (['js', 'ts', 'swift', 'h', 'm', 'cpp', 'c', 'json', 'plist', 'xml', 'strings'].includes(ext))
    return <CodeOutlined style={{ color: '#1677ff' }} />;
  if (['zip', 'gz', 'dylib', 'a'].includes(ext))
    return <FileZipOutlined style={{ color: '#fa8c16' }} />;
  return <FileOutlined />;
}

// 递归过滤树节点
function filterTree(nodes: FileNode[], keyword: string): FileNode[] {
  if (!keyword) return nodes;
  const kw = keyword.toLowerCase();
  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.isDir && node.children) {
      const filtered = filterTree(node.children, keyword);
      if (filtered.length > 0) acc.push({ ...node, children: filtered });
    } else if (node.name.toLowerCase().includes(kw)) {
      acc.push(node);
    }
    return acc;
  }, []);
}

// 把 FileNode 树转成 antd DataNode，直接用 path 作为 key（唯一且无歧义）
function toTreeData(nodes: FileNode[]): DataNode[] {
  return nodes.map((node) => {
    return {
      key: node.path,
      title: (
        <span>
          <span style={{ marginRight: 4 }}>{getFileIcon(node.name, node.isDir)}</span>
          <span>{node.name}</span>
          {!node.isDir && node.size > 0 && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
              {formatSize(node.size)}
            </Text>
          )}
        </span>
      ),
      isLeaf: !node.isDir,
      children: node.children ? toTreeData(node.children) : undefined,
    } as DataNode;
  });
}

// 根据 path 在树中找到节点
function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const found = findNodeByPath(n.children, path);
      if (found) return found;
    }
  }
  return null;
}

// ─── 文件树子组件 ───────────────────────────────────────────────────
interface IpaFileTreeProps {
  nodes: FileNode[];
  search: string;
  plists: Record<string, any>;
}

const IpaFileTree: React.FC<IpaFileTreeProps> = ({ nodes, search, plists }) => {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [plistModal, setPlistModal] = useState<{ title: string; content: any } | null>(null);

  const filtered = useMemo(() => filterTree(nodes, search), [nodes, search]);
  const treeData  = useMemo(() => toTreeData(filtered), [filtered]);

  const handleSelect = (_keys: any[], info: any) => {
    const path: string = info.node.key;
    const node = findNodeByPath(nodes, path);
    setSelectedNode(node);
  };

  const handleDoubleClick = (_e: any, treeNode: any) => {
    const path: string = treeNode.key;
    const node = findNodeByPath(nodes, path);
    if (!node || node.isDir) return;
    if (getFileExt(node.name) === 'plist') {
      const content = plists[path];
      setPlistModal({ title: node.name, content: content ?? null });
    }
  };

  if (filtered.length === 0) {
    return <Empty description="未找到匹配文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const detailItems = selectedNode && !selectedNode.isDir ? [
    { label: '文件名', value: selectedNode.name },
    { label: '路径',   value: <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedNode.path}</Text> },
    { label: '原始大小', value: formatSize(selectedNode.size) },
    { label: '压缩后大小', value: formatSize(selectedNode.compressedSize ?? 0) },
    { label: '压缩率',
      value: selectedNode.size > 0
        ? `${(100 - (selectedNode.compressedSize ?? 0) / selectedNode.size * 100).toFixed(1)}%`
        : '—' },
    { label: '修改时间', value: formatTime(selectedNode.time || '') },
    { label: 'CRC32',   value: selectedNode.crc ? `0x${selectedNode.crc.toString(16).toUpperCase()}` : '—' },
    { label: '类型',    value: getFileExt(selectedNode.name).toUpperCase() || '未知' },
  ] : selectedNode?.isDir ? [
    { label: '文件夹', value: selectedNode.name },
    { label: '路径',   value: <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedNode.path}</Text> },
    { label: '子项数', value: `${selectedNode.children?.length ?? 0} 项` },
  ] : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* 左侧树 */}
        <div style={{ flex: '0 0 340px', minWidth: 0, maxHeight: 560, overflowY: 'auto',
          borderRight: '1px solid #f0f0f0', paddingRight: 8 }}>
          <DirectoryTree
            key={search}
            treeData={treeData}
            defaultExpandAll={!!search}
            showIcon={false}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
          />
        </div>

        {/* 右侧详情 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedNode ? (
            <div>
              <div style={{ marginBottom: 12, fontWeight: 600, color: '#333' }}>
                {selectedNode.isDir ? '📁' : getFileExt(selectedNode.name) === 'plist' ? '📋' : '📄'}{' '}
                {selectedNode.name}
              </div>
              <Descriptions bordered column={1} size="small">
                {detailItems.map(item => (
                  <Descriptions.Item key={item.label} label={item.label}>
                    {item.value}
                  </Descriptions.Item>
                ))}
              </Descriptions>
              {!selectedNode.isDir && getFileExt(selectedNode.name) === 'plist' && (
                <Button
                  style={{ marginTop: 12 }}
                  icon={<CodeOutlined />}
                  onClick={() => {
                    const content = plists[selectedNode.path];
                    if (content !== undefined) {
                      setPlistModal({ title: selectedNode.name, content });
                    } else {
                      message.warning('该 plist 内容未能解析');
                    }
                  }}
                >
                  查看 plist 内容
                </Button>
              )}
            </div>
          ) : (
            <Empty
              description={<Text type="secondary">点击左侧文件或文件夹查看详情<br />双击 .plist 文件查看内容</Text>}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ marginTop: 40 }}
            />
          )}
        </div>
      </div>

      {/* plist 查看 Modal */}
      <Modal
        title={<Space><CodeOutlined />{plistModal?.title}</Space>}
        open={!!plistModal}
        onCancel={() => setPlistModal(null)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: 12 } }}
      >
        {plistModal?.content !== null && plistModal?.content !== undefined ? (
          typeof plistModal.content === 'object' ? (
            <ReactJson
              src={plistModal.content}
              name={false}
              collapsed={2}
              displayDataTypes={false}
              enableClipboard={true}
              style={{ fontFamily: 'monospace', fontSize: 13, background: '#fafafa', padding: 12 }}
            />
          ) : (
            <pre style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {String(plistModal.content)}
            </pre>
          )
        ) : (
          <Empty description="plist 内容解析失败或为空" />
        )}
      </Modal>
    </>
  );
};

// ─── 主组件 ────────────────────────────────────────────────────────
const IpaViewer: React.FC = () => {
  const [result, setResult]       = useState<ParseResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [fileName, setFileName]   = useState('');
  const [seafileUrl, setSeafileUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [treeSearch, setTreeSearch] = useState('');

  const baseUrl = getApiBaseUrl();

  const handleParsed = (data: any, name: string) => {
    if (data.success) {
      setResult(data);
      setFileName(name);
    } else {
      message.error(data.error || '解析失败');
    }
  };

  const handleUpload = (file: File) => {
    setLoading(true);
    setLoadingMsg('正在解析...');
    const formData = new FormData();
    formData.append('ipa', file);
    fetch(`${baseUrl}/api/ipa/parse`, { method: 'POST', body: formData })
      .then(r => r.json())
      .then(data => handleParsed(data, file.name))
      .catch(() => message.error('请求失败，请确认后端服务正在运行'))
      .finally(() => { setLoading(false); setLoadingMsg(''); });
    return false;
  };

  const parseFromUrl = (url: string, label: string) => {
    if (!url.trim()) { message.warning('请输入链接'); return; }
    if (!url.startsWith('http')) { message.warning('请输入有效的 HTTP 链接'); return; }
    setLoading(true);
    setLoadingMsg('后端下载中，大文件请耐心等待...');
    fetch(`${baseUrl}/api/ipa/parse-from-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(r => r.json())
      .then(data => handleParsed(data, label))
      .catch(() => message.error('请求失败，请确认后端服务正在运行'))
      .finally(() => { setLoading(false); setLoadingMsg(''); });
  };

  const handleClear = () => {
    setResult(null); setFileName('');
    setSeafileUrl(''); setDirectUrl(''); setTreeSearch('');
  };

  const permColumns = [
    {
      title: '权限', dataIndex: 'label', key: 'label', width: 160,
      render: (v: string) => <Tag color="orange">{v}</Tag>,
    },
    {
      title: '说明文案', dataIndex: 'description', key: 'description',
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
  ];

  const schemeColumns = [
    {
      title: 'URL Scheme', dataIndex: 'scheme', key: 'scheme',
      render: (v: string) => <Text code>{v}://</Text>,
    },
    {
      title: '标识名', dataIndex: 'name', key: 'name',
      render: (v: string) => v ? <Text type="secondary">{v}</Text> : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>

        {/* 上传区 */}
        <Card
          title={<Space><AppstoreOutlined />IPA 包信息解析</Space>}
          extra={result && <Button icon={<ClearOutlined />} size="small" onClick={handleClear}>清除</Button>}
        >
          <Spin spinning={loading} tip={loadingMsg}>
            <Tabs defaultActiveKey="upload">
              <TabPane tab={<Space><InboxOutlined />本地上传</Space>} key="upload">
                <Dragger
                  accept=".ipa" showUploadList={false}
                  beforeUpload={(file: UploadFile) => { handleUpload(file as unknown as File); return false; }}
                  disabled={loading} style={{ padding: '12px 0' }}
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">点击或拖拽 .ipa 文件到此处</p>
                  <p className="ant-upload-hint">支持单文件上传，文件大小上限 500 MB</p>
                </Dragger>
              </TabPane>

              <TabPane tab={<Space><CloudDownloadOutlined />Seafile 链接</Space>} key="seafile">
                <div style={{ padding: '8px 0' }}>
                  <p style={{ color: '#666', marginBottom: 12 }}>
                    在 Seafile 中分享文件，复制链接后粘贴到此处，后端直接下载解析。
                  </p>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="http://192.168.110.158/f/xxxxxxxx/?dl=1"
                      value={seafileUrl} onChange={e => setSeafileUrl(e.target.value)}
                      onPressEnter={() => parseFromUrl(seafileUrl, seafileUrl.split('/').filter(Boolean).pop() || 'from-seafile.ipa')}
                      disabled={loading} prefix={<LinkOutlined style={{ color: '#aaa' }} />}
                    />
                    <Button type="primary" loading={loading} icon={<CloudDownloadOutlined />}
                      onClick={() => parseFromUrl(seafileUrl, seafileUrl.split('/').filter(Boolean).pop() || 'from-seafile.ipa')}>
                      下载并解析
                    </Button>
                  </Space.Compact>
                  <p style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                    提示：分享链接末尾加 <Text code>?dl=1</Text> 强制直接下载
                  </p>
                </div>
              </TabPane>

              <TabPane tab={<Space><LinkOutlined />URL</Space>} key="url">
                <div style={{ padding: '8px 0' }}>
                  <p style={{ color: '#666', marginBottom: 12 }}>
                    输入任意可直接下载的 HTTP/HTTPS 链接，后端流式下载解析。
                  </p>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="https://example.com/path/to/app.ipa"
                      value={directUrl} onChange={e => setDirectUrl(e.target.value)}
                      onPressEnter={() => parseFromUrl(directUrl, directUrl.split('/').filter(Boolean).pop() || 'from-url.ipa')}
                      disabled={loading} prefix={<LinkOutlined style={{ color: '#aaa' }} />}
                    />
                    <Button type="primary" loading={loading} icon={<CloudDownloadOutlined />}
                      onClick={() => parseFromUrl(directUrl, directUrl.split('/').filter(Boolean).pop() || 'from-url.ipa')}>
                      下载并解析
                    </Button>
                  </Space.Compact>
                </div>
              </TabPane>
            </Tabs>
          </Spin>

          {fileName && !loading && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">已解析：</Text>
              <Text code>{fileName}</Text>
            </div>
          )}
        </Card>

        {result && (
          <>
            {/* 基本信息 */}
            <Card title={<Space><AppstoreOutlined />基本信息</Space>}>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="App 名称" span={2}>
                  <Title level={5} style={{ margin: 0 }}>{result.info.name || '—'}</Title>
                </Descriptions.Item>
                <Descriptions.Item label="Bundle ID">
                  <Text copyable code>{result.info.bundleId}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="可执行文件">
                  <Text code>{result.info.executable}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="版本号">
                  <Tag color="blue">{result.info.version}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Build 号">
                  <Tag color="geekblue">{result.info.build}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="最低 iOS 版本">
                  <Tag color="cyan">{result.info.minOS || '—'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="SDK">
                  <Text type="secondary">{result.info.sdkVersion || '—'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="平台">
                  <Text type="secondary">{result.info.platform || '—'}</Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Collapse defaultActiveKey={['schemes', 'permissions']}>
              {/* URL Schemes */}
              <Panel
                key="schemes"
                header={<Space><LinkOutlined />URL Schemes<Badge count={result.urlSchemes.length} style={{ backgroundColor: '#1677ff' }} /></Space>}
              >
                {result.urlSchemes.length > 0 ? (
                  <Table dataSource={result.urlSchemes} columns={schemeColumns} rowKey="scheme" pagination={false} size="small" />
                ) : (
                  <Empty description="未配置 URL Scheme" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Panel>

              {/* 权限列表 */}
              <Panel
                key="permissions"
                header={<Space><SafetyOutlined />权限申请<Badge count={result.permissions.length} style={{ backgroundColor: '#fa8c16' }} /></Space>}
              >
                {result.permissions.length > 0 ? (
                  <Table dataSource={result.permissions} columns={permColumns} rowKey="key" pagination={false} size="small" />
                ) : (
                  <Empty description="未申请任何权限" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Panel>
            </Collapse>

            {/* 文件浏览 */}
            {result.fileTree?.length > 0 && (
              <Card
                title={<Space><FolderOpenOutlined />文件浏览</Space>}
                extra={
                  <Input
                    placeholder="搜索文件名..."
                    size="small"
                    style={{ width: 180 }}
                    value={treeSearch}
                    onChange={e => setTreeSearch(e.target.value)}
                    allowClear
                    prefix={<FileOutlined style={{ color: '#aaa' }} />}
                  />
                }
              >
                <IpaFileTree nodes={result.fileTree} search={treeSearch} plists={result.plists || {}} />
              </Card>
            )}
          </>
        )}

      </Space>
    </div>
  );
};

export default IpaViewer;

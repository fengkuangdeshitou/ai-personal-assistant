import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Button, Badge, Space, Typography, Table, message,
  Spin, Switch, Tooltip, Alert, Collapse, Select, Tag,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  LinkOutlined,
  CloudServerOutlined,
  HddOutlined,
  MedicineBoxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Text } = Typography;

interface Container {
  name: string;
  status: string;
  image: string;
  running: boolean;
  imageSize?: string;
  diskUsage?: string;
}

interface SeafileStatus {
  running: boolean;
  containers: Container[];
  localIp?: string;
  imagesSize?: string;
}

interface SeafDavStatus {
  enabled: boolean;
  port: string;
  shareName: string;
}

interface DiagnoseCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  suggestion?: string;
}

interface DiagnoseResult {
  ok: boolean;
  summary: string;
  checks: DiagnoseCheck[];
}

let seafileStatusInFlight: Promise<SeafileStatus> | null = null;
let seafileStatusCache: { ts: number; data: SeafileStatus | null } = { ts: 0, data: null };

const CheckIcon: React.FC<{ status: DiagnoseCheck['status'] }> = ({ status }) => {
  if (status === 'ok') return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
  if (status === 'error') return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
  if (status === 'warn') return <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} />;
  return null;
};

// 对日志行着色：ERROR/Exception 红色，WARN 黄色，INFO/OK 正常
const colorLogLine = (line: string): string => {
  if (/error|exception|traceback|critical|fatal|failed|can't connect/i.test(line)) return '#f85149';
  if (/warn/i.test(line)) return '#d29922';
  if (/info|ok|success|started|ready/i.test(line)) return '#3fb950';
  return '#e6edf3';
};

type LogSource = 'docker' | 'seahub' | 'seafile' | 'ccnet';

const LOG_SOURCE_OPTIONS = [
  { value: 'docker' as LogSource, label: '容器日志（docker logs）' },
  { value: 'seahub' as LogSource, label: 'Seahub 内部日志 ⭐' },
  { value: 'seafile' as LogSource, label: 'Seafile 内部日志' },
  { value: 'ccnet' as LogSource, label: 'CCNet 内部日志' },
];

const DOCKER_CONTAINER_OPTIONS = [
  { value: 'seafile', label: 'seafile（主服务）' },
  { value: 'seafile-mysql', label: 'seafile-mysql（数据库）' },
  { value: 'seafile-memcached', label: 'seafile-memcached（缓存）' },
];

const TAIL_OPTIONS = [
  { value: 100, label: '最近 100 行' },
  { value: 300, label: '最近 300 行' },
  { value: 500, label: '最近 500 行' },
  { value: 1000, label: '最近 1000 行' },
];

const LogViewer: React.FC<{ container?: string; defaultSource?: LogSource }> = ({
  container = 'seafile',
  defaultSource = 'docker',
}) => {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [tail, setTail] = useState(300);
  const [selectedContainer, setSelectedContainer] = useState(container);
  const [logSource, setLogSource] = useState<LogSource>(defaultSource);
  const [logPath, setLogPath] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (
    source: LogSource = logSource,
    c: string = selectedContainer,
    t: number = tail,
  ) => {
    setLoading(true);
    setLogPath('');
    try {
      let res;
      if (source === 'docker') {
        res = await api.get(`/api/seafile/logs?container=${encodeURIComponent(c)}&tail=${t}`, { timeout: 20000 });
      } else {
        res = await api.get(`/api/seafile/internal-log?log=${source}&tail=${t}`, { timeout: 20000 });
      }
      if (res.data.success) {
        setLines(res.data.lines || []);
        if (res.data.logPath) setLogPath(res.data.logPath);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      } else {
        setLines([]);
        message.error(res.data.error || '日志获取失败');
      }
    } catch (e: any) {
      message.error(`日志获取失败：${e?.message || '网络错误'}`);
    } finally {
      setLoading(false);
    }
  }, [logSource, selectedContainer, tail]);

  useEffect(() => {
    fetchLogs(defaultSource, container, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSourceChange = (v: LogSource) => {
    setLogSource(v);
    setLines([]);
    fetchLogs(v, selectedContainer, tail);
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space wrap>
        <Select
          value={logSource}
          onChange={onSourceChange}
          options={LOG_SOURCE_OPTIONS}
          style={{ width: 220 }}
          size="small"
        />
        {logSource === 'docker' && (
          <Select
            value={selectedContainer}
            onChange={(v) => { setSelectedContainer(v); fetchLogs(logSource, v, tail); }}
            options={DOCKER_CONTAINER_OPTIONS}
            style={{ width: 200 }}
            size="small"
          />
        )}
        <Select
          value={tail}
          onChange={(v) => { setTail(v); fetchLogs(logSource, selectedContainer, v); }}
          options={TAIL_OPTIONS}
          style={{ width: 140 }}
          size="small"
        />
        <Button
          size="small"
          icon={<SyncOutlined spin={loading} />}
          loading={loading}
          onClick={() => fetchLogs(logSource, selectedContainer, tail)}
        >
          刷新
        </Button>
        {lines.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>{lines.length} 行</Text>
        )}
      </Space>
      {logPath && (
        <Text type="secondary" style={{ fontSize: 11 }}>文件路径：{logPath}</Text>
      )}

      <div
        style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          padding: '10px 14px',
          height: 420,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {loading && lines.length === 0 ? (
          <div style={{ color: '#8b949e', textAlign: 'center', paddingTop: 40 }}>
            <Spin size="small" /> <span style={{ marginLeft: 8 }}>加载日志中...</span>
          </div>
        ) : lines.length === 0 ? (
          <span style={{ color: '#8b949e' }}>暂无日志（容器可能未运行，或日志文件路径不同）</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ color: colorLogLine(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </Space>
  );
};

const SeafileManager: React.FC = () => {
  const [status, setStatus] = useState<SeafileStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [seafdav, setSeafdav] = useState<SeafDavStatus | null>(null);
  const [seafdavToggling, setSeafdavToggling] = useState(false);

  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(null);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);

  const [fixing, setFixing] = useState(false);
  const [fixSteps, setFixSteps] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<{ lines: string[]; logPath?: string; error?: string } | null>(null);

  // 日志面板：诊断区内联日志 or 底部日志卡片
  const [inlineLogContainer, setInlineLogContainer] = useState<string | null>(null);
  const [logCardOpen, setLogCardOpen] = useState(false);
  const [logCardSource, setLogCardSource] = useState<LogSource>('seahub');

  const fetchStatus = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const now = Date.now();
      if (!force && seafileStatusCache.data && now - seafileStatusCache.ts < 5000) {
        setStatus(seafileStatusCache.data);
        return;
      }
      if (!force && seafileStatusInFlight) {
        const data = await seafileStatusInFlight;
        setStatus(data);
        return;
      }
      seafileStatusInFlight = api.get('/api/seafile/status').then(res => res.data as SeafileStatus);
      const data = await seafileStatusInFlight;
      seafileStatusCache = { ts: Date.now(), data };
      setStatus(data);
    } catch {
      message.error('获取状态失败');
    } finally {
      seafileStatusInFlight = null;
      setLoading(false);
    }
  }, []);

  const fetchSeafdav = useCallback(async () => {
    try {
      const res = await api.get('/api/seafile/seafdav/status');
      if (res.data.success) setSeafdav(res.data);
    } catch {}
  }, []);

  const handleSeafdavToggle = async (enable: boolean) => {
    setSeafdavToggling(true);
    try {
      const res = await api.post('/api/seafile/seafdav/toggle', { enable }, { timeout: 60000 });
      if (res.data.success) {
        message.success(res.data.message);
        setSeafdav(prev => prev ? { ...prev, enabled: enable } : prev);
        setTimeout(fetchStatus, 2000);
      } else {
        message.error(res.data.error || '操作失败');
      }
    } catch (err: any) {
      message.error(`操作失败：${err?.response?.data?.error || err?.message || '未知错误'}`);
    } finally {
      setSeafdavToggling(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchSeafdav();
  }, [fetchStatus, fetchSeafdav]);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    const labels: Record<string, string> = { start: '启动', stop: '停止', restart: '重启' };
    setActionLoading(action);
    try {
      const res = await api.post(`/api/seafile/${action}`, {}, { timeout: 60000 });
      if (res.data.success) {
        message.success(res.data.message || `${labels[action]}成功`);
        setTimeout(fetchStatus, 1500);
        if (action === 'start' || action === 'stop') setTimeout(fetchSeafdav, 1500);
      } else {
        message.error(res.data.error || `${labels[action]}失败`);
      }
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED') {
        message.error(`${labels[action]}超时，请稍后刷新状态确认`);
      } else if (err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error')) {
        message.error('无法连接到后端服务，请重新打开 AI 助理');
      } else {
        message.error(`${labels[action]}失败：${err?.response?.data?.error || err?.message || '未知错误'}`);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCaptureSeahubError = async () => {
    setCapturing(true);
    setCaptureResult(null);
    try {
      const res = await api.post('/api/seafile/capture-seahub-error', {}, { timeout: 30000 });
      if (res.data.success) {
        setCaptureResult({ lines: res.data.lines || [], logPath: res.data.logPath });
        setLogCardOpen(true);
        setLogCardSource('seahub');
      } else {
        setCaptureResult({ lines: [], error: res.data.error || '未找到日志', logPath: '' });
        message.warning(res.data.hint || res.data.error || '未找到 seahub.log');
      }
    } catch (e: any) {
      message.error(`获取失败：${e?.message || '网络错误'}`);
    } finally {
      setCapturing(false);
    }
  };

  const handleFix = async () => {
    setFixing(true);
    setFixSteps(['正在执行修复流程...']);
    setDiagnoseOpen(true);
    try {
      const res = await api.post('/api/seafile/fix', {}, { timeout: 120000 });
      setFixSteps(res.data.steps || []);
      if (res.data.success) {
        message.success('修复完成，请等待约 30 秒后刷新状态');
        setTimeout(() => fetchStatus(true), 30000);
      } else {
        message.error(`修复失败：${res.data.error || '未知错误'}`);
      }
      // 修复后重新诊断
      setTimeout(handleDiagnose, 35000);
    } catch (err: any) {
      setFixSteps(prev => [...prev, `❌ 请求失败：${err?.message || '网络错误'}`]);
      message.error(`修复请求失败：${err?.message || '网络错误'}`);
    } finally {
      setFixing(false);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagnoseResult(null);
    setDiagnoseOpen(true);
    setInlineLogContainer(null);
    try {
      const res = await api.get('/api/seafile/diagnose', { timeout: 40000 });
      if (res.data.success) {
        setDiagnoseResult(res.data);
      } else {
        message.error('诊断请求失败');
      }
    } catch (err: any) {
      message.error(`诊断失败：${err?.message || '网络错误'}`);
    } finally {
      setDiagnosing(false);
    }
  };

  const columns = [
    {
      title: '容器名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text code>{name}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'running',
      key: 'running',
      render: (running: boolean, record: Container) => (
        <Space>
          <Badge status={running ? 'success' : 'error'} />
          <Text type={running ? undefined : 'danger'}>{record.status}</Text>
        </Space>
      ),
    },
    {
      title: '镜像',
      dataIndex: 'image',
      key: 'image',
      render: (img: string) => <Text type="secondary" style={{ fontSize: 12 }}>{img}</Text>,
    },
    {
      title: '镜像大小',
      dataIndex: 'imageSize',
      key: 'imageSize',
      width: 110,
      render: (v: string) => v
        ? <Text style={{ color: '#fa8c16' }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: '数据占用',
      dataIndex: 'diskUsage',
      key: 'diskUsage',
      width: 100,
      render: (v: string) => v
        ? <Text strong style={{ color: '#1677ff' }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
  ];

  const isRunning = status?.running ?? false;

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>

        {/* 状态总览 */}
        <Card
          title="Seafile 私有云"
          extra={
            <Button
              icon={<SyncOutlined spin={loading} />}
              onClick={() => fetchStatus(true)}
              loading={loading}
              size="small"
            >
              刷新
            </Button>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Space size="large" align="center">
              <Badge
                status={loading ? 'processing' : isRunning ? 'success' : 'error'}
                text={
                  <Text strong style={{ fontSize: 15 }}>
                    {loading ? '检测中...' : isRunning ? '运行中' : '已停止'}
                  </Text>
                }
              />
              {isRunning && status?.localIp && (
                <Button
                  type="link"
                  icon={<LinkOutlined />}
                  href={`http://${status.localIp}`}
                  target="_blank"
                  style={{ padding: 0 }}
                >
                  {`http://${status.localIp}`}
                </Button>
              )}
            </Space>
          </div>

          <div style={{ marginTop: 20 }}>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleAction('start')}
                loading={actionLoading === 'start'}
                disabled={isRunning || loading}
              >
                启动
              </Button>
              <Button
                danger
                icon={<PauseCircleOutlined />}
                onClick={() => handleAction('stop')}
                loading={actionLoading === 'stop'}
                disabled={!isRunning || loading}
              >
                停止
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => handleAction('restart')}
                loading={actionLoading === 'restart'}
                disabled={!isRunning || loading}
              >
                重启
              </Button>
              <Button
                icon={<MedicineBoxOutlined />}
                onClick={handleDiagnose}
                loading={diagnosing}
              >
                自动诊断
              </Button>
              <Tooltip title="MySQL 未就绪导致 Seahub 启动失败时使用：停止 seafile → 等待 MySQL 就绪 → 重启 seafile">
                <Button
                  icon={<MedicineBoxOutlined />}
                  danger
                  loading={fixing}
                  onClick={handleFix}
                >
                  修复 MySQL 连接
                </Button>
              </Tooltip>
              <Tooltip title="读取 seahub.log，显示 Seahub 启动失败的真实 Python 错误">
                <Button
                  icon={<FileTextOutlined />}
                  type="primary"
                  ghost
                  loading={capturing}
                  onClick={handleCaptureSeahubError}
                >
                  抓取 Seahub 错误
                </Button>
              </Tooltip>
              <Button
                icon={<FileTextOutlined />}
                onClick={() => { setLogCardOpen(v => !v); setLogCardSource('seahub'); }}
              >
                Seahub 日志
              </Button>
              <Button
                icon={<FileTextOutlined />}
                onClick={() => { setLogCardOpen(v => !v); setLogCardSource('docker'); }}
              >
                容器日志
              </Button>
            </Space>
          </div>

          {/* 诊断结果区域 */}
          {diagnoseOpen && (
            <div style={{ marginTop: 20 }}>
              <Collapse
                activeKey={diagnoseOpen ? ['diagnose'] : []}
                onChange={(keys) => setDiagnoseOpen(Array.isArray(keys) ? keys.includes('diagnose') : keys === 'diagnose')}
                items={[{
                  key: 'diagnose',
                  label: (
                    <Space>
                      <MedicineBoxOutlined />
                      <Text strong>自动诊断结果</Text>
                      {diagnoseResult && (
                        <Badge
                          status={diagnoseResult.ok ? 'success' : 'error'}
                          text={diagnoseResult.ok ? '正常' : '发现问题'}
                        />
                      )}
                    </Space>
                  ),
                  children: diagnosing ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <Spin tip="正在诊断中，请稍候..." />
                    </div>
                  ) : diagnoseResult ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Alert
                        type={diagnoseResult.ok ? 'success' : 'error'}
                        message={diagnoseResult.summary}
                        showIcon
                        action={
                          !diagnoseResult.ok ? (
                            <Space>
                              {/* MySQL 连接失败时显示专项修复按钮 */}
                              {diagnoseResult.checks.some(c =>
                                (c.id === 'pid' && c.status === 'error') ||
                                (c.id === 'logs' && c.status === 'error' && /mysql|数据库/i.test(c.detail)) ||
                                (c.id === 'http' && c.status === 'error')
                              ) && (
                                <Button
                                  size="small"
                                  type="primary"
                                  danger
                                  icon={<MedicineBoxOutlined />}
                                  loading={fixing}
                                  onClick={handleFix}
                                >
                                  修复 MySQL 连接
                                </Button>
                              )}
                              <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                loading={actionLoading === 'restart'}
                                onClick={() => handleAction('restart')}
                              >
                                重启
                              </Button>
                            </Space>
                          ) : undefined
                        }
                      />
                      {/* 修复进度日志 */}
                      {(fixing || fixSteps.length > 0) && (
                        <div style={{
                          background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
                          padding: '10px 14px', fontFamily: 'monospace', fontSize: 12,
                        }}>
                          {fixSteps.map((s, i) => (
                            <div key={i} style={{
                              color: s.startsWith('✅') ? '#3fb950' : s.startsWith('❌') ? '#f85149' : s.startsWith('⚠️') ? '#d29922' : '#e6edf3',
                              lineHeight: 1.7,
                            }}>
                              {s}
                            </div>
                          ))}
                          {fixing && <div style={{ color: '#8b949e', marginTop: 4 }}>▌ 修复中，请稍候...</div>}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {diagnoseResult.checks.map(check => (
                          <div key={check.id}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: '8px 12px',
                                borderRadius: inlineLogContainer === check.id ? '6px 6px 0 0' : 6,
                                background: check.status === 'error' ? '#fff2f0' : check.status === 'warn' ? '#fffbe6' : '#f6ffed',
                                border: `1px solid ${check.status === 'error' ? '#ffccc7' : check.status === 'warn' ? '#ffe58f' : '#b7eb8f'}`,
                                borderBottom: inlineLogContainer === check.id ? 'none' : undefined,
                              }}
                            >
                              <div style={{ paddingTop: 1 }}>
                                <CheckIcon status={check.status} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <Text strong style={{ fontSize: 13 }}>{check.label}</Text>
                                <div style={{ fontSize: 12, color: '#595959', marginTop: 2 }}>{check.detail}</div>
                                {check.suggestion && check.id !== 'logs' && (
                                  <div style={{ fontSize: 12, color: '#d4380d', marginTop: 3 }}>
                                    建议：{check.suggestion}
                                  </div>
                                )}
                                {/* 日志检查项：用按钮替换建议文字 */}
                                {check.id === 'logs' && check.status !== 'ok' && (
                                  <div style={{ marginTop: 6 }}>
                                    <Button
                                      size="small"
                                      icon={<FileTextOutlined />}
                                      type={inlineLogContainer === 'logs' ? 'primary' : 'default'}
                                      onClick={() => setInlineLogContainer(
                                        inlineLogContainer === 'logs' ? null : 'logs'
                                      )}
                                    >
                                      {inlineLogContainer === 'logs' ? '收起日志' : '查看容器日志'}
                                    </Button>
                                  </div>
                                )}
                              </div>
                              {/* 容器状态项也可快速查日志 */}
                              {check.id.startsWith('ctr_') && check.status === 'error' && (
                                <Button
                                  size="small"
                                  icon={<FileTextOutlined />}
                                  onClick={() => {
                                    const cname = check.id.replace('ctr_', '');
                                    setInlineLogContainer(inlineLogContainer === check.id ? null : check.id);
                                    setLogCardOpen(false);
                                    // 通知 LogViewer 显示对应容器
                                    window.dispatchEvent(new CustomEvent('seafile-log-container', { detail: cname }));
                                  }}
                                >
                                  查看日志
                                </Button>
                              )}
                            </div>
                            {/* 内联日志展开区 */}
                            {(inlineLogContainer === check.id || (check.id === 'logs' && inlineLogContainer === 'logs')) && (
                              <div style={{
                                border: `1px solid ${check.status === 'error' ? '#ffccc7' : '#b7eb8f'}`,
                                borderTop: 'none',
                                borderRadius: '0 0 6px 6px',
                                padding: 12,
                                background: '#fff',
                              }}>
                                <LogViewer
                                  container={check.id.startsWith('ctr_') ? check.id.replace('ctr_', '') : 'seafile'}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Button size="small" onClick={handleDiagnose} loading={diagnosing}>
                          重新诊断
                        </Button>
                      </div>
                    </Space>
                  ) : null,
                }]}
              />
            </div>
          )}
        </Card>

        {/* 容器列表 */}
        <Card title="容器详情">
          {loading && !status ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin tip="加载中..." />
            </div>
          ) : (
            <Table
              dataSource={status?.containers ?? []}
              columns={columns}
              rowKey="name"
              pagination={false}
              size="middle"
              locale={{ emptyText: '未找到 Seafile 容器' }}
            />
          )}
          {status?.imagesSize && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <Space size={6}>
                <HddOutlined style={{ color: '#fa8c16' }} />
                <Text type="secondary">容器镜像总占用</Text>
                <Text strong style={{ color: '#fa8c16' }}>{status.imagesSize}</Text>
              </Space>
            </div>
          )}
        </Card>

        {/* 日志查看卡片 */}
        {logCardOpen && (
          <Card
            title={
              <Space>
                <FileTextOutlined />
                <span>{logCardSource === 'seahub' ? 'Seahub 内部日志' : logCardSource === 'docker' ? '容器日志（docker logs）' : '内部日志'}</span>
                {logCardSource === 'seahub' && (
                  <Tag color="orange">seahub.log — 包含 Seahub 真实错误</Tag>
                )}
              </Space>
            }
            extra={
              <Space>
                <Button size="small" type={logCardSource === 'seahub' ? 'primary' : 'default'} onClick={() => setLogCardSource('seahub')}>Seahub 日志</Button>
                <Button size="small" type={logCardSource === 'docker' ? 'primary' : 'default'} onClick={() => setLogCardSource('docker')}>容器日志</Button>
                <Button size="small" onClick={() => setLogCardOpen(false)}>收起</Button>
              </Space>
            }
          >
            <LogViewer key={logCardSource} container="seafile" defaultSource={logCardSource} />
          </Card>
        )}

        {/* SeafDAV */}
        <Card
          title={
            <Space>
              <CloudServerOutlined />
              SeafDAV（WebDAV）
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space align="center" size="large">
              <Space>
                <Text>状态：</Text>
                <Badge
                  status={seafdav?.enabled && isRunning ? 'success' : 'default'}
                  text={seafdav?.enabled && isRunning ? '已开启' : seafdav?.enabled && !isRunning ? '已配置（Seafile 未运行）' : '已关闭'}
                />
              </Space>
              <Tooltip title={!isRunning ? 'Seafile 未运行，请先启动 Seafile' : '切换后将自动重启 Seafile'}>
                <Switch
                  checked={seafdav?.enabled ?? false}
                  loading={seafdavToggling}
                  disabled={!isRunning}
                  onChange={handleSeafdavToggle}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </Tooltip>
            </Space>

            {seafdav?.enabled && isRunning && status?.localIp && (
              <Space direction="vertical" size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>WebDAV 地址：</Text>
                <Button
                  type="link"
                  icon={<LinkOutlined />}
                  href={`http://${status.localIp}${seafdav.shareName}`}
                  target="_blank"
                  style={{ padding: 0, height: 'auto' }}
                >
                  {`http://${status.localIp}${seafdav.shareName}`}
                </Button>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  在 Finder 中使用：前往 → 连接服务器，输入上方地址，账号为 Seafile 登录账号
                </Text>
              </Space>
            )}
            {seafdav?.enabled && !isRunning && (
              <Text type="secondary" style={{ fontSize: 12 }}>Seafile 未运行，WebDAV 暂不可用</Text>
            )}
          </Space>
        </Card>

      </Space>
    </div>
  );
};

export default SeafileManager;

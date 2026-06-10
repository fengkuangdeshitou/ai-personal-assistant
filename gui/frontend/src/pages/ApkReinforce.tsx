import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Button, Typography, Space, Alert,
  Tooltip, Badge, Row, Col, Table, Modal,
} from 'antd';
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, DownloadOutlined, SyncOutlined,
  InfoCircleOutlined, WarningOutlined, EnvironmentOutlined,
  InboxOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface EnvStatus {
  python3: string | null;
  java: string | null;
  ndk: string | null;
  dex2c: boolean;
  apksigner: string | null;
}

interface ReinforceSession {
  status: 'running' | 'done' | 'error';
  stage?: 'queued' | 'initializing' | 'preprocess' | 'dcc' | 'postprocess' | 'done' | 'error';
  progress: number;
  log: string[];
  outputName: string;
  error?: string;
  timing?: {
    mode?: 'fast' | 'balanced' | 'full';
    queueMs?: number;
    preMs?: number;
    dccMs?: number;
    postMs?: number;
    totalMs?: number;
    retries?: number;
  };
}

interface ReinforceHistoryItem {
  ts: string;
  sessionId: string;
  status: 'running' | 'done' | 'error' | 'pending';
  stage?: string;
  error?: string | null;
  outputName?: string;
  progress?: number;
  timing?: {
    totalMs?: number;
    retries?: number;
  };
  options?: {
    selfCodeTemplate?: string;
    reinforceMode?: string;
  };
}

interface ApkItem {
  path: string;
  name: string;
}

let envCheckInFlight: Promise<EnvStatus> | null = null;
let envCheckCache: { ts: number; data: EnvStatus | null } = { ts: 0, data: null };
let reinforceHistoryInFlight: Promise<ReinforceHistoryItem[]> | null = null;
let reinforceHistoryCache: { ts: number; data: ReinforceHistoryItem[] } = { ts: 0, data: [] };

const EnvRow: React.FC<{ label: string; value: string | null | boolean; tip?: string; action?: React.ReactNode }> = ({
  label, value, tip, action,
}) => {
  const ok = value !== null && value !== false && value !== '';
  return (
    <Row align="middle" gutter={8} style={{ marginBottom: 8 }}>
      <Col flex="20px">
        {ok
          ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
          : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
      </Col>
      <Col flex="100px"><Text strong>{label}</Text></Col>
      <Col flex="auto">
        <Text type={ok ? 'success' : 'danger'} style={{ fontSize: 12, wordBreak: 'break-all' }}>
          {value === null || value === false || value === ''
            ? '未找到'
            : typeof value === 'boolean' ? '已安装' : value}
        </Text>
        {tip && !ok && (
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{tip}</Text>
        )}
      </Col>
      {action && <Col>{action}</Col>}
    </Row>
  );
};

const ApkReinforce: React.FC = () => {
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [ndkInstalling, setNdkInstalling] = useState(false);
  const [setupLog, setSetupLog] = useState<string[]>([]);

  const [apkItems, setApkItems] = useState<ApkItem[]>([]);
  const [apkPath, setApkPath] = useState('');
  const [apkName, setApkName] = useState('');
  const reinforceMode: 'shellLite' = 'shellLite';
  const [pickLoading, setPickLoading] = useState(false);

  const [envModalOpen, setEnvModalOpen] = useState(false);

  const [reinforcing, setReinforcing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState<ReinforceSession | null>(null);
  const [historyItems, setHistoryItems] = useState<ReinforceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pickError, setPickError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollErrorRef = useRef(0);
  const pollTickRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchJsonWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...(init || {}), signal: controller.signal });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchEnvStatus = async () => {
    setEnvLoading(true);
    try {
      const now = Date.now();
      if (envCheckCache.data && now - envCheckCache.ts < 5000) {
        setEnvStatus(envCheckCache.data);
        return;
      }

      if (envCheckInFlight) {
        const data = await envCheckInFlight;
        setEnvStatus(data);
        return;
      }

      envCheckInFlight = fetch('/api/apk/env-check').then(res => res.json());
      const data = await envCheckInFlight;
      envCheckCache = { ts: Date.now(), data };
      setEnvStatus(data);
    } finally {
      envCheckInFlight = null;
      setEnvLoading(false);
    }
  };

  const fetchHistory = async (silent = false, force = false) => {
    if (!silent) setHistoryLoading(true);
    try {
      const now = Date.now();
      if (!force && reinforceHistoryCache.data.length > 0 && now - reinforceHistoryCache.ts < 3000) {
        setHistoryItems(reinforceHistoryCache.data);
        return reinforceHistoryCache.data;
      }

      if (!force && reinforceHistoryInFlight) {
        const items = await reinforceHistoryInFlight;
        setHistoryItems(items);
        return items;
      }

      reinforceHistoryInFlight = (async () => {
        const data = await fetchJsonWithTimeout('/api/apk/reinforce-history?limit=30', undefined, 8000);
        if (!data.success) return [] as ReinforceHistoryItem[];
        const items = data.items || [];
        reinforceHistoryCache = { ts: Date.now(), data: items };
        return items as ReinforceHistoryItem[];
      })();

      const items = await reinforceHistoryInFlight;
      if (Array.isArray(items)) {
        setHistoryItems(items);
        return items;
      }
      return [] as ReinforceHistoryItem[];
    } finally {
      reinforceHistoryInFlight = null;
      if (!silent) setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvStatus();
    fetchHistory();
    // 恢复上次未完成的加固会话
    const savedId = localStorage.getItem('apkReinforceSessionId');
    if (savedId) {
      fetchJsonWithTimeout(`/api/apk/reinforce-status/${savedId}?logLimit=500`, undefined, 8000)
        .then(data => {
          if (!data.success) { localStorage.removeItem('apkReinforceSessionId'); return; }
          setSessionId(savedId);
          setSession(data);
          if (data.status === 'running') {
            setReinforcing(true);
            startPolling(savedId);
          }
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [session?.log]);

  const handleInstallNdk = async () => {
    setNdkInstalling(true);
    setSetupLog(prev => [...prev, '正在通过 brew 安装 Android NDK，请稍候（约需 3-5 分钟）...']);
    try {
      const res = await fetch('/api/apk/install-ndk', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSetupLog(prev => [...prev, '✅ NDK 安装完成']);
        await fetchEnvStatus();
      } else {
        setSetupLog(prev => [...prev, `❌ NDK 安装失败: ${data.error}`]);
      }
    } catch (e: any) {
      setSetupLog(prev => [...prev, `❌ 错误: ${e.message}`]);
    } finally {
      setNdkInstalling(false);
    }
  };

  const handleSetupDex2c = async () => {
    setSetupLoading(true);
    setSetupLog(['正在安装 dex2c 工具链，请稍候（需要下载约 50MB）...']);
    try {
      const res = await fetch('/api/apk/setup-dex2c', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSetupLog(prev => [...prev, '✅ 安装完成']);
        await fetchEnvStatus();
      } else {
        setSetupLog(prev => [...prev, `❌ 安装失败: ${data.error}`]);
      }
    } catch (e: any) {
      setSetupLog(prev => [...prev, `❌ 网络错误: ${e.message}`]);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleUploadFiles = useCallback(async (files: File[]) => {
    const apkFiles = files.filter(f => f.name.toLowerCase().endsWith('.apk'));
    if (apkFiles.length === 0) {
      setPickError('请上传 .apk 格式文件');
      return;
    }
    setPickLoading(true);
    setPickError('');
    try {
      const form = new FormData();
      apkFiles.forEach(f => form.append('files', f));
      const res = await fetch('/api/apk/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success && Array.isArray(data.items) && data.items.length > 0) {
        setApkItems(prev => {
          const next = [...prev, ...data.items];
          if (next.length > 0) {
            setApkPath(next[0].path);
            setApkName(next[0].name);
          }
          return next;
        });
        setSession(null);
        localStorage.removeItem('apkReinforceSessionId');
      } else {
        setPickError(data.error || '上传失败');
      }
    } catch (e: any) {
      setPickError(`上传失败：${e.message}`);
    } finally {
      setPickLoading(false);
    }
  }, []);

  const handleReinforce = async () => {
    if (!apkPath && apkItems.length === 0) return;
    setReinforcing(true);
    setSession(null);
    try {
      const targets = apkItems.length > 0 ? apkItems : [{ path: apkPath, name: apkName }];
      // 所有任务同时启动（Promise.all 并发请求）
      const results = await Promise.all(
        targets.map(target =>
          fetch('/api/apk/reinforce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apkPath: target.path,
              ndkPath: envStatus?.ndk,
              apksignerPath: envStatus?.apksigner,
              protectAll: true,
              reinforceMode,
              enableStage2Inject: true,
              enableStage2RuntimeLoad: true,
              enableStage3StripClasses2: true,
            }),
          }).then(r => r.json()),
        ),
      );
      const firstSession = results.find(d => d.success && d.sessionId);
      if (firstSession) {
        setSessionId(firstSession.sessionId);
        localStorage.setItem('apkReinforceSessionId', firstSession.sessionId);
        startPolling(firstSession.sessionId);
      }
      // 任务已提交到后端，清空本地待加固队列，避免加固完成后"待加固"条目残留
      setApkItems([]);
      setApkPath('');
      setApkName('');
      // 立即刷新历史，让所有已启动任务显示在队列里
      await fetchHistory(true, true);
    } catch (e: any) {
      setReinforcing(false);
      setSession({ status: 'error', progress: 0, log: [], outputName: '', error: e.message });
    }
  };

  const startPolling = (sid: string) => {
    pollErrorRef.current = 0;
    pollTickRef.current = 0;
    const poll = async () => {
      try {
        const data = await fetchJsonWithTimeout(`/api/apk/reinforce-status/${sid}?logLimit=500`, undefined, 8000);
        pollErrorRef.current = 0;
        pollTickRef.current += 1;
        setSession(data);
        if (data.status === 'running') {
          // 历史列表是重接口，降频刷新避免占满后端请求队列
          if (pollTickRef.current % 5 === 0) fetchHistory(true);
          pollRef.current = setTimeout(poll, 2000);
        } else {
          const items = await fetchHistory(true);
          const hasRunning = items.some(item => item.status === 'running');
          setReinforcing(hasRunning);
          if (data.status === 'done') localStorage.removeItem('apkReinforceSessionId');
        }
      } catch (e: any) {
        pollErrorRef.current += 1;
        if (pollErrorRef.current >= 10) {
          setReinforcing(false);
          await fetchHistory(true);
          setSession(prev => prev
            ? { ...prev, status: 'error', error: `网络连接失败（${e.message}），请刷新页面重试` }
            : null,
          );
          return;
        }
        pollRef.current = setTimeout(poll, 3000);
      }
    };
    poll();
  };

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const handleCancel = async () => {
    if (!sessionId) return;
    setCancelling(true);
    try {
      await fetch(`/api/apk/cancel/${sessionId}`, { method: 'POST' });
      localStorage.removeItem('apkReinforceSessionId');
    } catch (_) {}
    finally {
      setCancelling(false);
      setReinforcing(false);
      fetchHistory(true);
    }
  };

  const handleClearHistory = async () => {
    Modal.confirm({
      title: '确认清空加固历史？',
      content: '将删除后端已保存的历史记录（进行中的任务不受影响）。',
      okText: '确认清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await fetchJsonWithTimeout('/api/apk/reinforce-history/clear', { method: 'POST' }, 10000);
          await fetchHistory(true);
          if (!reinforcing) setSession(null);
        } catch (e: any) {
          setSession(prev => ({
            status: 'error',
            progress: prev?.progress || 0,
            log: prev?.log || [],
            outputName: prev?.outputName || '',
            error: `清空失败：${e?.message || '未知错误'}`,
          }));
        }
      },
    });
  };

  const isEnvReady = !!(envStatus?.python3 && envStatus?.java && envStatus?.ndk && envStatus?.dex2c);
  const formatMs = (ms?: number) => {
    if (!ms || ms <= 0) return '-';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };
  const formatTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('zh-CN', { hour12: false });
    } catch {
      return iso;
    }
  };
  const stageLabelMap: Record<string, string> = {
    queued: '排队中',
    initializing: '初始化',
    preprocess: '预处理',
    dcc: '核心编译',
    postprocess: '后处理',
    done: '完成',
    error: '失败',
  };
  // 队列项（已拖入但尚未点击开始加固）
  const pendingItems: ReinforceHistoryItem[] = (!reinforcing && apkItems.length > 0)
    ? apkItems.map((item, i) => ({
      ts: new Date().toISOString(),
      sessionId: `__pending__${i}__${item.name}`,
      status: 'pending' as const,
      stage: 'queued',
      outputName: item.name,
      progress: 0,
    }))
    : [];

  const historyTableData: ReinforceHistoryItem[] = [
    ...pendingItems,
    ...(sessionId && session
      ? [
        {
          ts: new Date().toISOString(),
          sessionId,
          status: session.status,
          stage: session.stage,
          error: session.error,
          outputName: session.outputName,
          progress: session.progress,
          timing: {
            totalMs: session.timing?.totalMs,
            retries: session.timing?.retries,
          },
          options: { reinforceMode: session.timing?.mode },
        },
        ...historyItems.filter(item => item.sessionId !== sessionId),
      ]
      : historyItems),
  ];

  return (
    <div style={{ padding: '24px 16px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space align="center" size={12}>
          <Title level={4} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            APK 加固
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            基于 dex2c 将 Java 代码编译为 Native C，配合运行时防护，实现接近商业加固的防逆向保护。
          </Text>
        </Space>
        <Space>
          <Button
            type="primary"
            icon={reinforcing ? <LoadingOutlined /> : <SafetyCertificateOutlined />}
            loading={reinforcing && !cancelling}
            disabled={!isEnvReady || (!apkPath && apkItems.length === 0) || reinforcing}
            onClick={handleReinforce}
          >
            {reinforcing ? '加固中...' : '开始加固'}
          </Button>
          {reinforcing && (
            <Button
              danger
              size="small"
              loading={cancelling}
              onClick={handleCancel}
            >
              取消
            </Button>
          )}
          <Button
            icon={<EnvironmentOutlined />}
            onClick={() => { setEnvModalOpen(true); fetchEnvStatus(); }}
          >
            环境检查
          </Button>
        </Space>
      </div>

      {/* ── 环境状态提示条 ── */}
      {envStatus && !isEnvReady && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="运行环境未就绪"
          description={`缺少：${[
            !envStatus.python3 && 'Python3',
            !envStatus.java && 'Java',
            !envStatus.ndk && 'Android NDK',
            !envStatus.dex2c && 'dex2c 工具',
          ].filter(Boolean).join('、')}。请点击右上角「环境检查」完成配置。`}
          action={
            <Button size="small" onClick={() => { setEnvModalOpen(true); fetchEnvStatus(); }}>
              配置环境
            </Button>
          }
        />
      )}

      {/* ── 环境检查弹框 ── */}
      <Modal
        title={<Space><WarningOutlined />环境检查</Space>}
        open={envModalOpen}
        onCancel={() => setEnvModalOpen(false)}
        footer={[
          <Button key="refresh" icon={<SyncOutlined spin={envLoading} />} loading={envLoading} onClick={fetchEnvStatus}>
            刷新
          </Button>,
          <Button key="close" type="primary" onClick={() => setEnvModalOpen(false)}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {envStatus ? (
          <>
            <EnvRow label="Python3" value={envStatus.python3} tip="brew install python3" />
            <EnvRow label="Java" value={envStatus.java} tip="brew install openjdk（apktool 运行需要）" />
            <EnvRow
              label="Android NDK"
              value={envStatus.ndk}
              tip="Android Studio → SDK Manager → NDK（或点击右侧按钮自动安装）"
              action={
                !envStatus.ndk ? (
                  <Button
                    size="small"
                    type="primary"
                    loading={ndkInstalling}
                    onClick={handleInstallNdk}
                  >
                    brew 安装 NDK
                  </Button>
                ) : undefined
              }
            />
            <EnvRow
              label="apksigner"
              value={envStatus.apksigner}
              tip="Android Studio → SDK Manager → Build-Tools"
            />
            <EnvRow
              label="dex2c 工具"
              value={envStatus.dex2c}
              tip="点击右侧按钮自动安装"
              action={
                !envStatus.dex2c ? (
                  <Button
                    size="small"
                    type="primary"
                    loading={setupLoading}
                    onClick={handleSetupDex2c}
                    disabled={!envStatus.python3}
                  >
                    自动安装
                  </Button>
                ) : undefined
              }
            />
            {setupLog.length > 0 && (
              <div style={{ background: '#1a1a2e', borderRadius: 4, padding: '8px 12px', marginTop: 8 }}>
                {setupLog.map((l, i) => (
                  <div key={i} style={{ color: '#00ff88', fontFamily: 'monospace', fontSize: 12 }}>{l}</div>
                ))}
              </div>
            )}
            {!isEnvReady && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="请完成上方环境配置后继续"
              />
            )}
            {isEnvReady && (
              <Alert type="success" showIcon style={{ marginTop: 12 }} message="环境就绪，可以开始加固" />
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}><LoadingOutlined /> 检测中...</div>
        )}
      </Modal>

      <Card>
        <Row gutter={16} style={{ alignItems: 'stretch' }}>
          {/* 左侧：APK 与配置 */}
          <Col xs={24} lg={10} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              <Card
                title={<Space><InboxOutlined />加固队列</Space>}
                extra={(
                  <Space size={8}>
                    <Text style={{ fontSize: 12, fontWeight: 500, color: '#1677ff' }}>
                      待加固队列（{apkItems.length} 个）
                    </Text>
                    <Button
                      size="small"
                      type="text"
                      danger
                      disabled={reinforcing || apkItems.length === 0}
                      onClick={() => { setApkItems([]); setApkPath(''); setApkName(''); setPickError(''); }}
                    >
                      清空队列
                    </Button>
                  </Space>
                )}
                size="small"
                style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 16px' } }}
              >
                {/* 拖拽上传区 — 占满卡片剩余高度 */}
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!isEnvReady || reinforcing) return;
                    void handleUploadFiles(Array.from(e.dataTransfer.files));
                  }}
                  onClick={() => {
                    if (!isEnvReady || reinforcing) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.apk';
                    input.multiple = true;
                    input.onchange = () => {
                      if (input.files) void handleUploadFiles(Array.from(input.files));
                    };
                    input.click();
                  }}
                  style={{
                    flex: 1,
                    minHeight: 80,
                    border: `2px dashed ${isDragging ? '#1677ff' : '#d9d9d9'}`,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: (isEnvReady && !reinforcing) ? 'pointer' : 'not-allowed',
                    background: isDragging ? '#e6f4ff' : '#fafafa',
                    transition: 'all 0.2s',
                    opacity: (isEnvReady && !reinforcing) ? 1 : 0.5,
                  }}
                >
                  {pickLoading
                    ? <LoadingOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                    : <InboxOutlined style={{ fontSize: 28, color: isDragging ? '#1677ff' : '#bfbfbf' }} />}
                  <div style={{ marginTop: 8, fontSize: 14, color: isDragging ? '#1677ff' : '#595959' }}>
                    {pickLoading ? '上传中…' : '拖拽 APK 到此处，或点击选择'}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                    支持多个文件同时拖入 · 仅接受 .apk
                  </div>
                </div>

                {pickError && <Text type="danger" style={{ fontSize: 12, marginTop: 6 }}>{pickError}</Text>}
              </Card>

              <Card title={<Space><SafetyCertificateOutlined />加固配置</Space>} size="small">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text>模式：自研轻量壳（默认，目标 3 分钟内）</Text>
                    <Tooltip title="dex2c 将所有 Java/Kotlin 方法编译为 ARM Native 代码，jadx/GDA 无法反编译">
                      <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'pointer' }} />
                    </Tooltip>
                  </Space>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text>核心 dex（classes2+）加密写入 assets/payload，并从 APK 中删除明文版本</Text>
                  </Space>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text>签名方式：Release 签名（已固定项目配置）</Text>
                  </Space>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text>签名后执行安全校验：确保输出 APK 不含任何明文业务 DEX（classes2+）</Text>
                  </Space>
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      发布策略已固定：默认执行壳接管 + 运行时加载 + 阶段3明文收敛，无需手动灰度开关。
                    </Text>
                  </div>
                </Space>
              </Card>

            </div>
          </Col>

          {/* 右侧：终端日志 */}
          <Col xs={24} lg={14} style={{ display: 'flex' }}>
            <Card
              title="实时终端日志"
              extra={session?.status === 'done' ? <Badge status="success" text="完成" /> : null}
              styles={{ body: { padding: 0 } }}
              style={{ width: '100%' }}
            >
              <div
                ref={logContainerRef}
                style={{
                  height: 480,
                  overflow: 'auto',
                  background: '#0d1117',
                  padding: '12px 14px',
                  borderTop: '1px solid #30363d',
                }}
              >
                {(session?.log ?? []).length === 0
                  ? <Text style={{ color: '#8b949e', fontSize: 12 }}>等待加固日志输出...</Text>
                  : (session?.log ?? []).map((line, i) => (
                    <div
                      key={i}
                      style={{
                        color: line.startsWith('[err]') || line.includes('❌')
                          ? '#f85149'
                          : line.includes('✅')
                            ? '#3fb950'
                            : line.includes('⚠️')
                              ? '#d29922'
                              : '#e6edf3',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {line}
                    </div>
                  ))}
                <div ref={logEndRef} />
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title="加固历史"
        style={{ marginTop: 16 }}
        size="small"
        extra={
          <Space size={4}>
            <Button size="small" onClick={() => { void fetchHistory(); }} loading={historyLoading}>刷新</Button>
            <Button size="small" danger onClick={handleClearHistory}>清空</Button>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          size="small"
          loading={historyLoading}
          rowKey={(r) => r.sessionId}
          pagination={false}
          dataSource={historyTableData}
          locale={{
            emptyText: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <SyncOutlined style={{ fontSize: 32, color: '#d9d9d9', marginBottom: 12 }} />
                <Text type="secondary" style={{ fontSize: 13 }}>暂无加固记录</Text>
              </div>
            ),
          }}
          columns={[
            {
              title: '时间',
              dataIndex: 'ts',
              width: 170,
              align: 'center',
              render: (v) => <Text style={{ fontSize: 12 }}>{formatTime(v)}</Text>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              align: 'center',
              render: (v) => (
                <Badge
                  status={v === 'done' ? 'success' : v === 'error' ? 'error' : v === 'pending' ? 'default' : 'processing'}
                  text={v === 'done' ? '成功' : v === 'error' ? '失败' : v === 'pending' ? '待加固' : '进行中'}
                />
              ),
            },
            {
              title: '阶段',
              dataIndex: 'stage',
              width: 100,
              align: 'center',
              render: (v) => <Text style={{ fontSize: 12 }}>{stageLabelMap[v || 'initializing'] || v || '-'}</Text>,
            },
            {
              title: '总耗时',
              width: 100,
              align: 'center',
              render: (_, r) => <Text style={{ fontSize: 12 }}>{formatMs(r.timing?.totalMs)}</Text>,
            },
            {
              title: '进度',
              width: 90,
              align: 'center',
              render: (_, r) => {
                const progress = typeof r.progress === 'number'
                  ? r.progress
                  : r.status === 'done'
                    ? 100
                    : undefined;
                return <Text style={{ fontSize: 12 }}>{typeof progress === 'number' ? `${progress}%` : '-'}</Text>;
              },
            },
            {
              title: '重试',
              width: 70,
              align: 'center',
              render: (_, r) => <Text style={{ fontSize: 12 }}>{r.timing?.retries ?? 0}</Text>,
            },
            {
              title: '下载',
              width: 120,
              align: 'center',
              render: (_, r) => (
                r.status === 'done' && r.outputName
                  ? (
                    <a
                      href={`/api/apk/download-reinforced/${r.sessionId}?filename=${encodeURIComponent(r.outputName)}`}
                      download={r.outputName}
                    >
                      <Button size="small" icon={<DownloadOutlined />}>下载</Button>
                    </a>
                  )
                  : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
              ),
            },
          ]}
        />
      </Card>

    </div>
  );
};

export default ApkReinforce;

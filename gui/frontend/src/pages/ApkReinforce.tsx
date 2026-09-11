import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Button, Typography, Space, Alert,
  Tooltip, Badge, Row, Col, Table, Modal, Select, message,
  Dropdown,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, DownloadOutlined, SyncOutlined,
  InfoCircleOutlined, WarningOutlined, EnvironmentOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { apiUrl } from '../utils/api';

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
  options?: { reinforceMode?: string; signProfile?: string; signProfileLabel?: string; [k: string]: unknown };
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
  inputName?: string;
  options?: { reinforceMode?: string; signProfile?: string; signProfileLabel?: string; selfCodeTemplate?: string; [k: string]: unknown };
  progress?: number;
  timing?: {
    totalMs?: number;
    retries?: number;
  };
}

interface ApkItem {
  path: string;
  name: string;
}

interface SignProfileOption {
  id: string;
  label: string;
  configured: boolean;
  v2SigningEnabled?: boolean;
  signingScheme?: string;
}

const FALLBACK_SIGN_PROFILES: SignProfileOption[] = [
  { id: 'milu', label: '咪噜', configured: true, v2SigningEnabled: true, signingScheme: 'V1+V2' },
  { id: 'wan52', label: '52wan', configured: true, v2SigningEnabled: true, signingScheme: 'V1+V2' },
  { id: 'youxiaobao', label: '游小宝', configured: true, v2SigningEnabled: false, signingScheme: 'V1' },
];

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
  const [signProfile, setSignProfile] = useState('milu');
  const [signProfiles, setSignProfiles] = useState<SignProfileOption[]>(FALLBACK_SIGN_PROFILES);
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
  // 用 ref 存剩余队列，避免 startPolling 闭包读到过期 state
  const pendingQueueRef = useRef<ApkItem[]>([]);
  // 记录本次批量加固的原始顺序，用于保持表格顺序不变
  const [currentBatch, setCurrentBatch] = useState<ApkItem[]>([]);
  const submitAndPollRef = useRef<((target: ApkItem) => Promise<void>) | null>(null);
  const fetchHistoryRef = useRef<((silent?: boolean, force?: boolean) => Promise<ReinforceHistoryItem[]>) | null>(null);

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

  const parseEnvStatus = (data: Record<string, unknown>): EnvStatus => ({
    python3: (data.python3 as string) ?? null,
    java: (data.java as string) ?? null,
    ndk: (data.ndk as string) ?? null,
    dex2c: !!data.dex2c,
    apksigner: (data.apksigner as string) ?? null,
  });

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

      envCheckInFlight = fetch(apiUrl('/api/apk/env-check'))
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok || data.success === false) {
            throw new Error(data.error || `环境检查失败 (${res.status})`);
          }
          return parseEnvStatus(data);
        });
      const data = await envCheckInFlight;
      envCheckCache = { ts: Date.now(), data };
      setEnvStatus(data);
    } catch (e: any) {
      setPickError(prev => prev || `环境检查失败：${e?.message || '网络错误'}`);
    } finally {
      envCheckInFlight = null;
      setEnvLoading(false);
    }
  };

  const fetchHistory = async (silent = false, force = false, limit = 200) => {
    if (!silent) setHistoryLoading(true);
    try {
      const now = Date.now();
      // 仅对默认 limit 走短缓存，避免批量下载与列表不同步
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
        const data = await fetchJsonWithTimeout(apiUrl(`/api/apk/reinforce-history?limit=${limit}`), undefined, 8000);
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
  fetchHistoryRef.current = fetchHistory;

  const fetchSignProfiles = async () => {
    try {
      const data = await fetchJsonWithTimeout(apiUrl('/api/apk/sign-profiles'), undefined, 8000);
      if (data.success && Array.isArray(data.profiles) && data.profiles.length > 0) {
        setSignProfiles(data.profiles.map((p: SignProfileOption) => ({
          ...p,
          configured: p.configured !== false,
          v2SigningEnabled: p.v2SigningEnabled !== false,
          signingScheme: p.signingScheme || (p.v2SigningEnabled === false ? 'V1' : 'V1+V2'),
        })));
        if (data.defaultProfile) setSignProfile(data.defaultProfile);
      }
    } catch {
      // 使用本地 fallback
    }
  };

  useEffect(() => {
    fetchEnvStatus();
    fetchSignProfiles();
    fetchHistory();
    // 恢复上次未完成的加固会话
    const savedId = localStorage.getItem('apkReinforceSessionId');
    if (savedId) {
      fetchJsonWithTimeout(apiUrl(`/api/apk/reinforce-status/${savedId}?logLimit=500`), undefined, 8000)
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
      const res = await fetch(apiUrl('/api/apk/install-ndk'), { method: 'POST' });
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
      const res = await fetch(apiUrl('/api/apk/setup-dex2c'), { method: 'POST' });
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
      const res = await fetch(apiUrl('/api/apk/upload'), { method: 'POST', body: form });
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

  // 提交单个 APK 并开始 poll
  const submitAndPoll = async (target: ApkItem) => {
    try {
      const res = await fetch(apiUrl('/api/apk/reinforce'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apkPath: target.path,
          ndkPath: envStatus?.ndk,
          apksignerPath: envStatus?.apksigner,
          protectAll: true,
          reinforceMode,
          signProfile,
          enableStage2Inject: true,
          enableStage2RuntimeLoad: true,
          enableStage3StripClasses2: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.sessionId) {
        throw new Error(data.error || '提交失败');
      }
      setSessionId(data.sessionId);
      localStorage.setItem('apkReinforceSessionId', data.sessionId);
      await fetchHistoryRef.current!(true, true);
      startPolling(data.sessionId);
    } catch (e: any) {
      const errText = e?.message || '未知错误';
      setPickError(`${target.name} 加固启动失败：${errText}`);
      const next = pendingQueueRef.current.shift();
      if (next) {
        setApkItems([...pendingQueueRef.current]);
        submitAndPollRef.current!(next);
      } else {
        setApkItems([]);
        setReinforcing(false);
      }
    }
  };
  // 每次渲染后更新 ref，确保 poll 闭包调用的始终是最新版本
  submitAndPollRef.current = submitAndPoll;

  const handleReinforce = async () => {
    if (!apkPath && apkItems.length === 0) return;
    setReinforcing(true);
    setSession(null);
    setPickError('');

    const targets = apkItems.length > 0 ? apkItems : [{ path: apkPath, name: apkName }];
    const [first, ...rest] = targets;
    pendingQueueRef.current = rest;
    setCurrentBatch(targets);   // 保存原始顺序
    setApkItems(rest);
    if (apkItems.length === 0) { setApkPath(''); setApkName(''); }

    await submitAndPoll(first);
  };

  const startPolling = (sid: string) => {
    pollErrorRef.current = 0;
    pollTickRef.current = 0;
    const poll = async () => {
      try {
        const data = await fetchJsonWithTimeout(apiUrl(`/api/apk/reinforce-status/${sid}?logLimit=500`), undefined, 8000);
        pollErrorRef.current = 0;
        pollTickRef.current += 1;
        setSession(data);
        if (data.status === 'running') {
          if (pollTickRef.current % 5 === 0) fetchHistoryRef.current!(true);
          pollRef.current = setTimeout(poll, 2000);
        } else {
          await fetchHistoryRef.current!(true, true); // force=true，跳过缓存，确保 options.signProfile 已更新
          if (data.status === 'done') localStorage.removeItem('apkReinforceSessionId');
          const next = pendingQueueRef.current.shift();
          if (next) {
            setApkItems([...pendingQueueRef.current]);
            setSession(null);
            submitAndPollRef.current!(next);
          } else {
            setApkItems([]);
            setCurrentBatch([]);
            setReinforcing(false);
          }
        }
      } catch (e: any) {
        pollErrorRef.current += 1;
        if (pollErrorRef.current >= 10) {
          setReinforcing(false);
          await fetchHistoryRef.current!(true);
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
      await fetch(apiUrl(`/api/apk/cancel/${sessionId}`), { method: 'POST' });
      localStorage.removeItem('apkReinforceSessionId');
    } catch (_) {}
    finally {
      setCancelling(false);
      setReinforcing(false);
      fetchHistory(true);
    }
  };

  const [batchDownloadLoading, setBatchDownloadLoading] = useState(false);
  const [batchDownloadChannel, setBatchDownloadChannel] = useState<string>('');
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const [batchDownloadModalOpen, setBatchDownloadModalOpen] = useState(false);

  // 渠道定义放在此处仅作为常量，不依赖 historyTableData
  const CHANNEL_DEFS = [
    { key: 'milu',        label: '咪噜' },
    { key: 'wan52',       label: '52玩' },
    { key: 'youxiaobao',  label: '游小宝' },
  ];

  /** 与批量下载共用同一过滤规则，避免计数与实际下载不一致 */
  const getChannelDoneItems = (items: ReinforceHistoryItem[], channelKey: string) => {
    const unique = items.filter((r, i, arr) => arr.findIndex(x => x.sessionId === r.sessionId) === i);
    return unique.filter(
      r => r.status === 'done'
        && !!r.outputName
        && !!r.sessionId
        && !String(r.sessionId).startsWith('__pending__')
        && r.options?.signProfile === channelKey
    );
  };

  // 各渠道已完成数量（与批量下载同一数据源）
  const channelDoneSource: ReinforceHistoryItem[] = [
    ...historyItems,
    ...(session && sessionId && session.status === 'done' && session.options?.signProfile
      ? [{
          ts: new Date().toISOString(),
          sessionId,
          status: 'done' as const,
          outputName: session.outputName,
          options: session.options,
        }]
      : []),
  ];
  const channelDoneCounts = CHANNEL_DEFS.reduce<Record<string, number>>((acc, ch) => {
    acc[ch.key] = getChannelDoneItems(channelDoneSource, ch.key).length;
    return acc;
  }, {});

  const handleClearHistory = async () => {
    Modal.confirm({
      title: '确认清空加固历史？',
      content: '将删除后端已保存的历史记录（进行中的任务不受影响）。',
      okText: '确认清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await fetchJsonWithTimeout(apiUrl('/api/apk/reinforce-history/clear'), { method: 'POST' }, 10000);
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
  const selectedSignProfile = signProfiles.find(p => p.id === signProfile) || signProfiles[0];
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
  // 按 currentBatch 原始顺序构建当前批次的行，历史记录追加在后面
  const batchRows: ReinforceHistoryItem[] = currentBatch.map((item) => {
    // 优先从 session（当前运行）匹配
    if (session && sessionId) {
      const inputName = (session as any).inputName as string | undefined;
      const matchByInput = inputName && (inputName === item.name || inputName === `${item.name}.apk` || item.name.startsWith(inputName.replace(/\.apk$/, '')));
      if (matchByInput) {
        return {
          ts: new Date().toISOString(),
          sessionId,
          status: session.status,
          stage: session.stage,
          error: session.error,
          outputName: session.outputName,
          inputName: (session as any).inputName,
          progress: session.progress,
          options: session.options,
          timing: { totalMs: session.timing?.totalMs, retries: session.timing?.retries },
        } as ReinforceHistoryItem;
      }
    }
    // 从已完成历史记录匹配
    const histMatch = historyItems.find(h => {
      const hn = (h as any).inputName as string | undefined;
      return hn && (hn === item.name || hn === `${item.name}.apk` || item.name.startsWith(hn.replace(/\.apk$/, '')));
    });
    if (histMatch) return histMatch;
    // 还在待加固队列中
    return {
      ts: new Date().toISOString(),
      sessionId: `__pending__${item.name}`,
      status: 'pending' as const,
      stage: 'queued',
      outputName: item.name,
      inputName: item.name,
      progress: 0,
    } as ReinforceHistoryItem;
  });

  const historyTableData: ReinforceHistoryItem[] = currentBatch.length > 0
    ? [
      ...batchRows,
      // 不属于本批次的历史记录追加在后面
      ...historyItems.filter(h =>
        !currentBatch.some(b => {
          const hn = (h as any).inputName as string | undefined;
          return hn && (hn === b.name || hn === `${b.name}.apk` || b.name.startsWith(hn.replace(/\.apk$/, '')));
        }) && h.sessionId !== sessionId
      ),
    ]
    : [
      ...(sessionId && session
        ? [{
          ts: new Date().toISOString(),
          sessionId,
          status: session.status,
          stage: session.stage,
          error: session.error,
          outputName: session.outputName,
          inputName: (session as any).inputName,
          progress: session.progress,
          timing: { totalMs: session.timing?.totalMs },
          options: session.options,
        } as ReinforceHistoryItem]
        : []),
      ...historyItems.filter(h => h.sessionId !== sessionId),
    ];

  // 点击批量下载时强制刷新后端历史，刷新完毕再展开下拉
  const handleBatchDownloadOpen = async () => {
    if (batchDownloadLoading) return;
    setBatchDownloadLoading(true);
    try {
      await fetchHistory(false, true, 200); // 拉全量历史，避免漏项
    } finally {
      setBatchDownloadLoading(false);
      setBatchDropdownOpen(true);
    }
  };

  const CHANNELS: MenuProps['items'] = CHANNEL_DEFS.map(ch => {
    const count = channelDoneCounts[ch.key] ?? 0;
    const hasItems = count > 0;
    return {
      key: ch.key,
      disabled: !hasItems,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: hasItems ? 600 : 400, color: hasItems ? '#1677ff' : undefined }}>
            {ch.label}
          </span>
          <span style={{
            fontSize: 11,
            background: hasItems ? '#e6f4ff' : '#f5f5f5',
            color: hasItems ? '#1677ff' : '#aaa',
            borderRadius: 10,
            padding: '0 6px',
          }}>
            {count} 个
          </span>
        </span>
      ),
    };
  });

  const handleBatchDownloadConfirm = async () => {
    setBatchDownloadModalOpen(false);
    const channelDef = CHANNEL_DEFS.find(c => c.key === batchDownloadChannel);
    setBatchDownloadLoading(true);
    try {
      // 再次强制拉取，并用返回值计算，避免 historyTableData / setState 不同步
      const items = await fetchHistory(true, true, 200);
      const doneItems = getChannelDoneItems(items || [], batchDownloadChannel);
      if (doneItems.length === 0) {
        message.warning(`${channelDef?.label ?? batchDownloadChannel} 暂无已完成的加固记录`);
        return;
      }

      const res = await fetch(apiUrl('/api/apk/download-reinforced-batch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionIds: doneItems.map(i => i.sessionId),
          signProfile: batchDownloadChannel,
          label: channelDef?.label || batchDownloadChannel,
        }),
      });

      if (!res.ok) {
        let errText = `下载失败 (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errText = errJson.error;
        } catch { /* ignore */ }
        message.error(errText);
        return;
      }

      const blob = await res.blob();
      const packed = Number(res.headers.get('X-Download-Count') || doneItems.length);
      const missing = Number(res.headers.get('X-Download-Missing') || 0);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reinforced-${channelDef?.label || batchDownloadChannel}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (missing > 0) {
        message.warning(`已打包 ${packed} 个 APK（另有 ${missing} 个文件缺失，可能已被清理）`);
      } else {
        message.success(`已打包下载 ${packed} 个 APK（${channelDef?.label}）`);
      }
    } catch (e: any) {
      message.error(`批量下载失败：${e?.message || '网络错误'}`);
    } finally {
      setBatchDownloadLoading(false);
    }
  };

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
            icon={<EnvironmentOutlined />}
            onClick={() => { setEnvModalOpen(true); fetchEnvStatus(); }}
          >
            环境检查
          </Button>
          <Select
            value={signProfile}
            onChange={setSignProfile}
            disabled={reinforcing}
            style={{ width: 130 }}
            options={signProfiles.map(p => ({
              value: p.id,
              label: p.label,
            }))}
          />
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
                    <Text>
                      签名方式：Release 签名 {selectedSignProfile?.signingScheme || 'V1+V2'}
                      （{selectedSignProfile?.label || '咪噜'}
                      {selectedSignProfile?.v2SigningEnabled === false ? '，保持 V1' : '，targetSdk=33'}）
                    </Text>
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
            <Dropdown
              open={batchDropdownOpen}
              onOpenChange={(v) => { if (!v) setBatchDropdownOpen(false); }}
              menu={{
                items: CHANNELS,
                onClick: ({ key }) => {
                  setBatchDropdownOpen(false);
                  setBatchDownloadChannel(key);
                  setBatchDownloadModalOpen(true);
                },
              }}
              trigger={['click']}
            >
              <Button
                size="small"
                loading={batchDownloadLoading}
                onClick={handleBatchDownloadOpen}
              >
                批量下载 ▾
              </Button>
            </Dropdown>
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
              title: '文件',
              dataIndex: 'inputName',
              align: 'center',
              ellipsis: true,
              render: (v, r) => {
                const name = v
                  || r.outputName?.replace(/-reinforce-\d{2}-\d{2}-\d{2}\.apk$/, '.apk')
                  || '-';
                return <Text style={{ fontSize: 12 }} title={name}>{name}</Text>;
              },
            },
            {
              title: '时间',
              dataIndex: 'ts',
              align: 'center',
              render: (v) => <Text style={{ fontSize: 12 }}>{formatTime(v)}</Text>,
            },
            {
              title: '签名',
              align: 'center',
              render: (_, r) => {
                const profile = r.options?.signProfile as string | undefined;
                const label = r.options?.signProfileLabel as string | undefined
                  || CHANNEL_DEFS.find(c => c.key === profile)?.label
                  || profile
                  || '-';
                return <Text style={{ fontSize: 12 }}>{label}</Text>;
              },
            },
            {
              title: '状态',
              dataIndex: 'status',
              align: 'center',
              render: (v) => (
                <Badge
                  status={v === 'done' ? 'success' : v === 'error' ? 'error' : v === 'pending' ? 'default' : 'processing'}
                  text={v === 'done' ? '成功' : v === 'error' ? '失败' : v === 'pending' ? '待加固' : '进行中'}
                />
              ),
            },
            {
              title: '总耗时',
              align: 'center',
              render: (_, r) => <Text style={{ fontSize: 12 }}>{formatMs(r.timing?.totalMs)}</Text>,
            },
            {
              title: '进度',
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
              title: '下载',
              align: 'center',
              render: (_, r) => (
                r.status === 'done' && r.outputName
                  ? (
                    <a
                      href={apiUrl(`/api/apk/download-reinforced/${r.sessionId}?filename=${encodeURIComponent(r.outputName)}`)}
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

      {/* 批量下载确认弹框 */}
      <Modal
        title="批量下载确认"
        open={batchDownloadModalOpen}
        onOk={handleBatchDownloadConfirm}
        onCancel={() => setBatchDownloadModalOpen(false)}
        okText="确认下载"
        cancelText="取消"
        okButtonProps={{ disabled: (channelDoneCounts[batchDownloadChannel] ?? 0) === 0 }}
      >
        <p>
          渠道：<strong>{CHANNEL_DEFS.find(c => c.key === batchDownloadChannel)?.label}</strong>
        </p>
        <p>
          将打包下载该渠道下 <strong>{channelDoneCounts[batchDownloadChannel] ?? 0}</strong> 个已完成的加固 APK（历史表中其它签名渠道不计入）
        </p>
        {(channelDoneCounts[batchDownloadChannel] ?? 0) === 0 && (
          <Alert type="warning" showIcon message="该渠道暂无已完成的加固记录" />
        )}
      </Modal>

    </div>
  );
};

export default ApkReinforce;

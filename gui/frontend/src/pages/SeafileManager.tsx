import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Space, Typography, Table, message, Spin, Switch, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  LinkOutlined,
  CloudServerOutlined,
  HddOutlined,
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

let seafileStatusInFlight: Promise<SeafileStatus> | null = null;
let seafileStatusCache: { ts: number; data: SeafileStatus | null } = { ts: 0, data: null };

const SeafileManager: React.FC = () => {
  const [status, setStatus] = useState<SeafileStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [seafdav, setSeafdav] = useState<SeafDavStatus | null>(null);
  const [seafdavToggling, setSeafdavToggling] = useState(false);

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
            </Space>
          </div>
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

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Space, Typography, Table, message, Spin } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Text } = Typography;

interface Container {
  name: string;
  status: string;
  image: string;
  running: boolean;
}

interface SeafileStatus {
  running: boolean;
  containers: Container[];
  localIp?: string;
}

const SeafileManager: React.FC = () => {
  const [status, setStatus] = useState<SeafileStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/seafile/status');
      setStatus(res.data);
    } catch {
      message.error('获取状态失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    const labels: Record<string, string> = { start: '启动', stop: '停止', restart: '重启' };
    setActionLoading(action);
    try {
      const res = await api.post(`/api/seafile/${action}`, {}, { timeout: 60000 });
      if (res.data.success) {
        message.success(res.data.message || `${labels[action]}成功`);
        setTimeout(fetchStatus, 1500);
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
              onClick={fetchStatus}
              loading={loading}
              size="small"
            >
              刷新
            </Button>
          }
        >
          <Space size="large" align="center" style={{ flexWrap: 'wrap' }}>
            <Space align="center">
              <Badge
                status={loading ? 'processing' : isRunning ? 'success' : 'error'}
                text={
                  <Text strong style={{ fontSize: 15 }}>
                    {loading ? '检测中...' : isRunning ? '运行中' : '已停止'}
                  </Text>
                }
              />
            </Space>

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
        </Card>

      </Space>
    </div>
  );
};

export default SeafileManager;

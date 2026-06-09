import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, message, Tooltip, Badge, Space } from 'antd';
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';
import './Settings.css';

const baseUrl = getApiBaseUrl();

const Settings: React.FC = () => {
  const [restarting, setRestarting] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkBackend = useCallback(async () => {
    try {
      const r = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      setBackendStatus(r.ok ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    }
  }, []);

  useEffect(() => {
    checkBackend();
    const timer = setInterval(checkBackend, 10000);
    return () => clearInterval(timer);
  }, [checkBackend]);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch(`${baseUrl}/api/server/restart`, { method: 'POST' });
      message.loading({ content: '后端重启中，请稍候...', key: 'restart', duration: 5 });
      setBackendStatus('offline');
      // 等待后端重启完成后检测是否恢复
      let attempts = 0;
      const check = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch(`${baseUrl}/api/health`);
          if (r.ok) {
            clearInterval(check);
            setBackendStatus('online');
            message.success({ content: '后端已重启成功', key: 'restart' });
            setRestarting(false);
          }
        } catch {
          if (attempts > 20) {
            clearInterval(check);
            message.error({ content: '重启超时，请手动检查后端', key: 'restart' });
            setRestarting(false);
          }
        }
      }, 1500);
    } catch {
      message.error('发送重启指令失败，请确认后端正在运行');
      setRestarting(false);
    }
  };

  return (
    <div className="settings-container">
      <Card
        title="📊 系统信息"
        className="settings-card"
        extra={
          <Tooltip title="重启后端服务（server.js）">
            <Button
              icon={<ReloadOutlined spin={restarting} />}
              onClick={handleRestart}
              loading={restarting}
              size="small"
            >
              重启后端
            </Button>
          </Tooltip>
        }
      >
        <div className="system-info-list">
          <div className="system-info-item">
            <span className="system-info-label">项目名称：</span>
            <span className="system-info-value">AI 私人助理</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">版本号：</span>
            <span className="system-info-value">v1.6.96</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">前端框架：</span>
            <span className="system-info-value">React 18 + TypeScript</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">后端框架：</span>
            <span className="system-info-value">Node.js + Express</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">UI 组件库：</span>
            <span className="system-info-value">Ant Design 5.x</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">后端状态：</span>
            <span className="system-info-value">
              <Space size={6}>
                {backendStatus === 'checking' && (
                  <Badge status="processing" text={<span style={{ color: '#1677ff' }}>检测中...</span>} />
                )}
                {backendStatus === 'online' && (
                  <Badge status="success" text={<span style={{ color: '#52c41a' }}>运行中（:{5178}）</span>} />
                )}
                {backendStatus === 'offline' && (
                  <Badge status="error" text={<span style={{ color: '#ff4d4f' }}>未运行</span>} />
                )}
                <Tooltip title="立即检测">
                  <SyncOutlined
                    style={{ color: '#aaa', cursor: 'pointer', fontSize: 12 }}
                    onClick={() => { setBackendStatus('checking'); checkBackend(); }}
                  />
                </Tooltip>
              </Space>
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
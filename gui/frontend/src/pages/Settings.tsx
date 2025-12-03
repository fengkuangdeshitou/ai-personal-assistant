import React, { useEffect, useState } from 'react';
import { Card, Badge, Spin, message, Button, Modal } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';
import './Settings.css';

interface SystemStatus {
  services: {
    backend: {
      status: string;
      port: number;
      responseTime: string;
      uptime: string;
    };
    websocket: {
      status: string;
      port: number;
      clients: number;
    };
    frontend: {
      status: string;
      port: number;
    };
  };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    uptime: number;
    memory: {
      total: number;
      free: number;
      used: number;
      usagePercent: string;
    };
    cpu: {
      model: string;
      cores: number;
    };
  };
  timestamp: string;
}

const Settings: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [frontendStatus, setFrontendStatus] = useState<'running' | 'stopped'>('running');
  const [restarting, setRestarting] = useState(false);

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/system-status`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSystemStatus(data);
          setFrontendStatus('running'); // 如果能请求到数据，说明前端也在运行
        }
      } else {
        message.error('获取系统状态失败');
      }
    } catch (error) {
      console.error('获取系统状态错误:', error);
      setFrontendStatus('running'); // 当前页面能运行，说明前端正常
    } finally {
      setLoading(false);
    }
  };

  const handleRestartServices = () => {
    Modal.confirm({
      title: '重启所有服务',
      content: '确定要重启所有服务吗？这将中断当前连接，页面将在服务重启后自动刷新。',
      okText: '确定重启',
      cancelText: '取消',
      onOk: async () => {
        try {
          setRestarting(true);
          message.loading('正在重启服务...', 0);
          
          const response = await fetch(`${getApiBaseUrl()}/api/restart-services`, {
            method: 'POST'
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              message.destroy();
              message.success('服务重启中，页面将在15秒后刷新...');
              
              // 等待15秒后刷新页面
              setTimeout(() => {
                window.location.reload();
              }, 15000);
            }
          }
        } catch (error) {
          console.error('重启服务错误:', error);
          message.destroy();
          message.info('服务正在重启中，页面将在15秒后刷新...');
          
          // 即使请求失败也刷新页面（因为服务可能已经在重启）
          setTimeout(() => {
            window.location.reload();
          }, 15000);
        }
      }
    });
  };

  useEffect(() => {
    fetchSystemStatus();
    // 每30秒刷新一次状态
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />;
      case 'stopped':
        return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '18px' }} />;
      case 'unknown':
        return <QuestionCircleOutlined style={{ color: '#faad14', fontSize: '18px' }} />;
      default:
        return <SyncOutlined spin style={{ color: '#1890ff', fontSize: '18px' }} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge status="success" text="运行中" />;
      case 'stopped':
        return <Badge status="error" text="已停止" />;
      case 'unknown':
        return <Badge status="warning" text="未知" />;
      default:
        return <Badge status="processing" text="检测中" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    if (minutes > 0) return `${minutes}分钟 ${secs}秒`;
    return `${secs}秒`;
  };

  return (
    <div className="settings-container">
      <Card title="📊 系统信息" className="settings-card">
        <div className="system-info-list">
          <div className="system-info-item">
            <span className="system-info-label">项目名称：</span>
            <span className="system-info-value">AI 私人助理</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">版本号：</span>
            <span className="system-info-value">v1.6.88</span>
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
        </div>
      </Card>

      <Card 
        title="🔌 系统状态" 
        className="settings-card system-status-card"
        extra={
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: '12px', cursor: 'pointer' }} onClick={fetchSystemStatus}>
              🔄 刷新
            </span>
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              loading={restarting}
              onClick={handleRestartServices}
              style={{ 
                backgroundColor: '#ff4d4f',
                borderColor: '#ff4d4f',
                color: '#fff'
              }}
            >
              重启服务
            </Button>
          </div>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" tip="正在获取系统状态..." />
          </div>
        ) : systemStatus ? (
          <>
            {/* 服务状态 */}
            <div className="status-section">
              <h3 className="status-section-title">服务状态</h3>
              <div className="system-info-list">
                <div className="system-info-item status-item">
                  <div className="status-item-left">
                    {getStatusIcon(systemStatus.services.backend.status)}
                    <span className="system-info-label">后端服务</span>
                  </div>
                  <div className="status-item-right">
                    {getStatusBadge(systemStatus.services.backend.status)}
                    <span className="status-detail">端口: {systemStatus.services.backend.port}</span>
                    <span className="status-detail">响应: {systemStatus.services.backend.responseTime}</span>
                    <span className="status-detail">运行: {systemStatus.services.backend.uptime}</span>
                  </div>
                </div>

                <div className="system-info-item status-item">
                  <div className="status-item-left">
                    {getStatusIcon(systemStatus.services.websocket.status)}
                    <span className="system-info-label">WebSocket</span>
                  </div>
                  <div className="status-item-right">
                    {getStatusBadge(systemStatus.services.websocket.status)}
                    <span className="status-detail">端口: {systemStatus.services.websocket.port}</span>
                    <span className="status-detail">连接数: {systemStatus.services.websocket.clients}</span>
                  </div>
                </div>

                <div className="system-info-item status-item">
                  <div className="status-item-left">
                    {getStatusIcon(frontendStatus)}
                    <span className="system-info-label">前端服务</span>
                  </div>
                  <div className="status-item-right">
                    {getStatusBadge(frontendStatus)}
                    <span className="status-detail">端口: {systemStatus.services.frontend.port}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 系统资源 */}
            <div className="status-section">
              <h3 className="status-section-title">系统资源</h3>
              <div className="system-info-list">
                <div className="system-info-item">
                  <span className="system-info-label">操作系统：</span>
                  <span className="system-info-value">{systemStatus.system.platform} ({systemStatus.system.arch})</span>
                </div>
                <div className="system-info-item">
                  <span className="system-info-label">Node.js 版本：</span>
                  <span className="system-info-value">{systemStatus.system.nodeVersion}</span>
                </div>
                <div className="system-info-item">
                  <span className="system-info-label">CPU：</span>
                  <span className="system-info-value">{systemStatus.system.cpu.model} ({systemStatus.system.cpu.cores} 核)</span>
                </div>
                <div className="system-info-item">
                  <span className="system-info-label">内存使用：</span>
                  <span className="system-info-value">
                    {formatBytes(systemStatus.system.memory.used)} / {formatBytes(systemStatus.system.memory.total)}
                    <span style={{ marginLeft: '8px', color: '#1890ff' }}>
                      ({systemStatus.system.memory.usagePercent}%)
                    </span>
                  </span>
                </div>
                <div className="system-info-item">
                  <span className="system-info-label">系统运行时间：</span>
                  <span className="system-info-value">{formatUptime(systemStatus.system.uptime)}</span>
                </div>
              </div>
            </div>

            <div className="status-footer">
              <span style={{ color: '#999', fontSize: '12px' }}>
                最后更新: {new Date(systemStatus.timestamp).toLocaleString('zh-CN')}
              </span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            无法获取系统状态
          </div>
        )}
      </Card>
    </div>
  );
};

export default Settings;
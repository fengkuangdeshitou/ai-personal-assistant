import React from 'react';
import { Card } from 'antd';
import './Settings.css';

const Settings: React.FC = () => {

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
            <span className="system-info-value">v1.6.80</span>
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
    </div>
  );
};

export default Settings;
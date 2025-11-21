import React, { useEffect } from 'react';
import { Card, Row, Col } from 'antd';
import './Settings.css';

const Settings: React.FC = () => {
  useEffect(() => {
    // 加载设置
    loadSettings();
  }, []);

  const loadSettings = () => {
    // 从localStorage加载设置（如果有其他设置项）
  };

  return (
    <div className="settings-container">

      <Row gutter={[24, 24]}>
        <Col xs={24}>
          <Card title="⚙️ 系统信息" className="settings-card">
            <div className="system-info-grid">
              <div className="system-info-item">
                <div className="system-info-icon">📦</div>
                <div className="system-info-content">
                  <div className="system-info-title">项目名称</div>
                  <div className="system-info-value">AI 私人助理</div>
                </div>
              </div>
              <div className="system-info-item">
                <div className="system-info-icon">🏷️</div>
                <div className="system-info-content">
                  <div className="system-info-title">版本号</div>
                  <div className="system-info-value">v1.6.59</div>
                </div>
              </div>
              <div className="system-info-item">
                <div className="system-info-icon">⚛️</div>
                <div className="system-info-content">
                  <div className="system-info-title">前端框架</div>
                  <div className="system-info-value">React 18 + TypeScript</div>
                </div>
              </div>
              <div className="system-info-item">
                <div className="system-info-icon">🟢</div>
                <div className="system-info-content">
                  <div className="system-info-title">后端框架</div>
                  <div className="system-info-value">Node.js + Express</div>
                </div>
              </div>
              <div className="system-info-item">
                <div className="system-info-icon">🎨</div>
                <div className="system-info-content">
                  <div className="system-info-title">UI 组件库</div>
                  <div className="system-info-value">Ant Design 5.x</div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Settings;
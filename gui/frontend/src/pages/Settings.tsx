import React, { useEffect } from 'react';
import { Card, Button, message, Row, Col, Divider, List } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import './Settings.css';

const Settings: React.FC = () => {
  useEffect(() => {
    // 加载设置
    loadSettings();
  }, []);

  const loadSettings = () => {
    // 从localStorage加载设置（如果有其他设置项）
  };

  const saveSettings = () => {
    // 保存设置（如果有其他设置项）
    message.success('设置已保存');
  };

  const resetSettings = () => {
    localStorage.clear();
    message.success('设置已重置');
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>🔧 AI 助理设置</h1>
        <p className="settings-subtitle">个性化您的AI助理体验</p>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24}>
          <Card title="⚙️ 系统配置" className="settings-card">
            <List
              itemLayout="horizontal"
              dataSource={[
                {
                  title: '📦 版本信息',
                  description: 'v1.6.53',
                },
                {
                  title: '💻 运行平台',
                  description: navigator.platform,
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={item.title}
                    description={item.description}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Divider />

      <div className="settings-actions">
        <Button type="primary" onClick={saveSettings} icon={<ReloadOutlined />}>
          保存设置
        </Button>
        <Button danger onClick={resetSettings}>
          重置设置
        </Button>
      </div>
    </div>
  );
};

export default Settings;
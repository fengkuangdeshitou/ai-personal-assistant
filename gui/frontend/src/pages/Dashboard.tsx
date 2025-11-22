import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Button, Space, Typography } from 'antd';
import {
  CodeOutlined,
  ProjectOutlined,
  ReloadOutlined,
  BarChartOutlined,
  SettingOutlined,
  MessageOutlined
} from '@ant-design/icons';
import './Dashboard.css';

const { Title, Text } = Typography;

const Dashboard: React.FC<{ 
  currentSection?: string;
  onSectionChange?: (section: string) => void 
}> = ({ currentSection = 'dashboard', onSectionChange }) => {
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [stats, setStats] = useState({
    commits: 3,
    insertions: 245,
    deletions: 12,
    projects: 0
  });

  useEffect(() => {
    updateGreeting();
    loadStats();

    // 每分钟更新一次时间
    const interval = setInterval(() => {
      updateGreeting();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const updateGreeting = () => {
    const hour = new Date().getHours();
    let greetingText = hour < 6 ? '🌙 深夜了' : hour < 9 ? '🌅 早安' : hour < 12 ? '☀️ 上午好' : hour < 14 ? '🌤️ 中午好' : hour < 18 ? '🌆 下午好' : hour < 22 ? '🌃 晚上好' : '🌙 夜深了';
    setGreeting(greetingText);

    const now = new Date();
    setCurrentTime(now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }) + ' ' + now.toLocaleTimeString('zh-CN'));
  };

  const loadStats = async () => {
    try {
      console.log('Loading stats...');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/stats`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Stats data:', data);
      
      setStats(prev => ({
        ...prev,
        projects: data.projects || 0
      }));
    } catch (error) {
      console.error('Load stats error:', error);
      // 保持默认值或显示错误
    }
  };

  return (
    <div className="dashboard-container">
      {/* 头部问候 */}
      <div className="dashboard-header">
        <div className="greeting-section">
          <Title level={1}>🤖 AI 私人助理</Title>
          <Text className="subtitle">您的智能开发伙伴 v1.6.61</Text>
        </div>
        <div className="time-section">
          <Text strong className="greeting-text">{greeting}，疯狂的石头！</Text>
          <br />
          <Text type="secondary">{currentTime}</Text>
        </div>
      </div>

      {/* 今日统计 */}
      <Card
        title={
          <Space>
            <BarChartOutlined />
            今日工作统计
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={loadStats}
              size="small"
            >
              刷新
            </Button>
          </Space>
        }
        className="stats-section"
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card className="stat-card">
              <Statistic
                title="今日提交"
                value={stats.commits}
                prefix={<CodeOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card className="stat-card">
              <Statistic
                title="新增代码行"
                value={stats.insertions}
                prefix="➕"
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card className="stat-card">
              <Statistic
                title="删除代码行"
                value={stats.deletions}
                prefix="➖"
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card className="stat-card">
              <Statistic
                title="项目总数"
                value={stats.projects}
                prefix={<ProjectOutlined />}
                valueStyle={{ color: '#13c2c2' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 快速操作 */}
      <Card title="🚀 快速操作" className="actions-section">
        <Space wrap size="large">
          <Button
            type={currentSection === 'projects' ? 'primary' : 'default'}
            size="large"
            icon={<ProjectOutlined />}
            onClick={() => onSectionChange?.('projects')}
          >
            管理项目
          </Button>
          <Button
            type={currentSection === 'gemini' ? 'primary' : 'default'}
            size="large"
            icon={<MessageOutlined />}
            onClick={() => onSectionChange?.('gemini')}
          >
            AI对话
          </Button>
          <Button
            type={currentSection === 'settings' ? 'primary' : 'default'}
            size="large"
            icon={<SettingOutlined />}
            onClick={() => onSectionChange?.('settings')}
          >
            系统设置
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Dashboard;
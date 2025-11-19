import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Button, Progress, Space, Typography } from 'antd';
import {
  ClockCircleOutlined,
  CodeOutlined,
  ProjectOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  BarChartOutlined,
  SettingOutlined,
  MessageOutlined
} from '@ant-design/icons';
import './Dashboard.css';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [workHours, setWorkHours] = useState(0);
  const [stats, setStats] = useState({
    commits: 3,
    insertions: 245,
    deletions: 12,
    projects: 0,
    productivity: 85
  });

  useEffect(() => {
    updateGreeting();
    updateWorkHours();
    loadStats();

    // 每分钟更新一次时间
    const interval = setInterval(() => {
      updateGreeting();
      updateWorkHours();
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

  const updateWorkHours = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let hours = 0;

    // 工作时间: 9:30-12:30 (3h) + 14:00-18:30 (4.5h)
    if (currentHour > 9 || (currentHour === 9 && currentMinute >= 30)) {
      if (currentHour < 12 || (currentHour === 12 && currentMinute <= 30)) {
        // 上午工作时间
        const morningMinutes = (currentHour - 9) * 60 + currentMinute - 30;
        hours = Math.max(0, morningMinutes / 60);
      } else if (currentHour >= 12 && currentHour < 14) {
        // 午休时间 12:30-14:00，显示上午的3小时
        hours = 3;
      } else if (currentHour >= 14) {
        hours = 3; // 上午3小时
        if (currentHour < 18 || (currentHour === 18 && currentMinute <= 30)) {
          // 下午工作时间
          const afternoonMinutes = (currentHour - 14) * 60 + currentMinute;
          hours += afternoonMinutes / 60;
        } else {
          hours += 4.5; // 下午4.5小时
        }
      }
    }

    setWorkHours(hours);
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

  const weeklyData = [120, 200, 150, 80, 70, 180, 250]; // 模拟周数据

  return (
    <div className="dashboard-container">
      {/* 头部问候 */}
      <div className="dashboard-header">
        <div className="greeting-section">
          <Title level={1}>🤖 AI 私人助理</Title>
          <Text className="subtitle">您的智能开发伙伴 v1.6.58</Text>
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
                title="工作时长"
                value={workHours.toFixed(1)}
                suffix="h"
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#722ed1' }}
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
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card className="stat-card">
              <Statistic
                title="生产力"
                value={stats.productivity}
                suffix="%"
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
              <Progress
                percent={stats.productivity}
                showInfo={false}
                strokeColor="#fa8c16"
                size="small"
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 本周趋势 */}
      <Card
        title={
          <Space>
            📈 本周代码趋势
          </Space>
        }
        className="chart-section"
      >
        <div className="weekly-chart">
          {weeklyData.map((value, index) => {
            const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
            const maxValue = Math.max(...weeklyData);
            const height = (value / maxValue) * 100;

            return (
              <div key={index} className="chart-bar-container">
                <div className="chart-bar" style={{ height: `${height}%` }}>
                  <span className="chart-value">{value}</span>
                </div>
                <span className="chart-label">{days[index]}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 快速操作 */}
      <Card title="🚀 快速操作" className="actions-section">
        <Space wrap size="large">
          <Button
            type="primary"
            size="large"
            icon={<ProjectOutlined />}
            onClick={() => window.location.hash = '#projects'}
          >
            管理项目
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<MessageOutlined />}
            onClick={() => window.location.hash = '#chat'}
          >
            AI对话
          </Button>
          <Button
            type="default"
            size="large"
            icon={<SettingOutlined />}
            onClick={() => window.location.hash = '#settings'}
          >
            系统设置
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Dashboard;
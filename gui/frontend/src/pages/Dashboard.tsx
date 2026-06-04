import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Typography, Card } from 'antd';
import {
  CodeOutlined,
  ProjectOutlined,
  ReloadOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';
import './Dashboard.css';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [stats, setStats] = useState({
    commits: 0,
    insertions: 0,
    deletions: 0,
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
      const response = await fetch(`${getApiBaseUrl()}/api/stats`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Stats data:', data);

      setStats({
        commits: data.commits || 0,
        insertions: data.insertions || 0,
        deletions: data.deletions || 0,
        projects: data.projects || 0
      });
    } catch (error) {
      console.error('Load stats error:', error);
      // 保持默认值或显示错误
      setStats({
        commits: 0,
        insertions: 0,
        deletions: 0,
        projects: 0
      });
    }
  };

  // 统计数据表格列定义
  const statsColumns = [
    {
      title: '指标',
      dataIndex: 'metric',
      key: 'metric',
      width: '40%',
      render: (text: string, record: any) => (
        <Space>
          {record.icon}
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: '数值',
      dataIndex: 'value',
      key: 'value',
      width: '30%',
      render: (value: number, record: any) => (
        <span style={{ color: record.color, fontWeight: 600, fontSize: '16px' }}>
          {value.toLocaleString()}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: '30%',
      render: (status: string) => (
        <span style={{
          color: status === '正常' ? '#52c41a' : '#8c8c8c',
          fontWeight: 500
        }}>
          {status}
        </span>
      ),
    },
  ];

  // 统计数据
  const statsData = [
    {
      key: '1',
      metric: '今日提交',
      value: stats.commits,
      status: '正常',
      icon: <CodeOutlined style={{ color: '#3f8600' }} />,
      color: '#3f8600',
    },
    {
      key: '2',
      metric: '新增代码行',
      value: stats.insertions,
      status: '正常',
      icon: <span style={{ color: '#1890ff' }}>➕</span>,
      color: '#1890ff',
    },
    {
      key: '3',
      metric: '删除代码行',
      value: stats.deletions,
      status: '正常',
      icon: <span style={{ color: '#cf1322' }}>➖</span>,
      color: '#cf1322',
    },
    {
      key: '4',
      metric: '项目总数',
      value: stats.projects,
      status: '正常',
      icon: <ProjectOutlined style={{ color: '#13c2c2' }} />,
      color: '#13c2c2',
    },
  ];

  return (
    <div className="dashboard-container">
      {/* 头部问候 */}
      <div className="dashboard-header">
        <div className="greeting-section">
          <Title level={1}>🤖 AI 私人助理</Title>
          <Text className="subtitle">您的智能开发伙伴 v1.6.92</Text>
        </div>
        <div className="time-section">
          <Text strong className="greeting-text">{greeting}，疯狂的石头！</Text>
          <br />
          <Text type="secondary">{currentTime}</Text>
        </div>
      </div>

      {/* 今日统计 - 表格布局 */}
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
        <Table
          columns={statsColumns}
          dataSource={statsData}
          pagination={false}
          size="middle"
          className="stats-table"
          rowClassName={(record, index) => index % 2 === 0 ? 'table-row-even' : 'table-row-odd'}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
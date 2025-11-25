import React, { useState, useEffect, useCallback } from 'react';
import { Card, List, Typography, Tag, Spin, message, Modal, Timeline as AntTimeline, Button } from 'antd';
import { ClockCircleOutlined, BranchesOutlined, PullRequestOutlined, UploadOutlined, MergeOutlined, SwapOutlined, UndoOutlined, QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import './Timeline.css';

const { Title, Text } = Typography;

interface GitOperation {
  hash: string;
  oldHash: string;
  message: string;
  author: string;
  timestamp: string;
  type: 'commit' | 'pull' | 'push' | 'merge' | 'checkout' | 'reset' | 'other';
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  insertions: number;
  deletions: number;
  files: number;
  changedFiles: string[];
}

interface ProjectOperations {
  project: string;
  path: string;
  operations: GitOperation[];
  commits: GitCommit[];
  totalOperations: number;
  totalCommits: number;
}

interface TodayOperationsResponse {
  success: boolean;
  date: string;
  projects: ProjectOperations[];
  totalProjects: number;
}

const Timeline: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOperations[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectOperations | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const loadTodayOperations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/git/today-operations`);
      const data: TodayOperationsResponse = await response.json();

      if (data.success) {
        setProjects(data.projects);
      } else {
        messageApi.error('获取工作记录失败');
      }
    } catch (error) {
      console.error('Load today operations error:', error);
      messageApi.error('加载工作记录失败');
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    loadTodayOperations();
  }, [loadTodayOperations]);

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'commit': return <BranchesOutlined />;
      case 'pull': return <PullRequestOutlined />;
      case 'push': return <UploadOutlined />;
      case 'merge': return <MergeOutlined />;
      case 'checkout': return <SwapOutlined />;
      case 'reset': return <UndoOutlined />;
      default: return <QuestionCircleOutlined />;
    }
  };

  const getOperationColor = (type: string) => {
    switch (type) {
      case 'commit': return 'green';
      case 'pull': return 'blue';
      case 'push': return 'orange';
      case 'merge': return 'purple';
      case 'checkout': return 'cyan';
      case 'reset': return 'red';
      default: return 'default';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleProjectClick = (project: ProjectOperations) => {
    setSelectedProject(project);
    setModalVisible(true);
  };

  const renderProjectModal = () => {
    if (!selectedProject) return null;

    const allActivities = [
      ...selectedProject.operations.map(op => ({ ...op, activityType: 'operation' })),
      ...selectedProject.commits.map(commit => ({ ...commit, activityType: 'commit' }))
    ].sort((a, b) => new Date((b as any).timestamp || (b as any).date).getTime() - new Date((a as any).timestamp || (a as any).date).getTime());

    return (
      <Modal
        title={`${selectedProject.project} - 今日活动记录`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
        style={{ top: 20 }}
      >
        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
          <AntTimeline>
            {allActivities.map((activity, index) => (
              <AntTimeline.Item
                key={index}
                dot={activity.activityType === 'operation' ? getOperationIcon((activity as any).type) : <BranchesOutlined />}
                color={activity.activityType === 'operation' ? getOperationColor((activity as any).type) : 'green'}
              >
                <div style={{ marginBottom: '8px' }}>
                  <Text strong>
                    {activity.activityType === 'operation' ? (
                      <>
                        <Tag color={getOperationColor((activity as any).type)}>
                          {(activity as any).type.toUpperCase()}
                        </Tag>
                        {activity.message}
                      </>
                    ) : (
                      <>
                        <Tag color="green">COMMIT</Tag>
                        {activity.message}
                      </>
                    )}
                  </Text>
                </div>

                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                  <Text type="secondary">
                    {activity.activityType === 'operation' ? (
                      <>
                        {activity.hash} • {activity.author} • {formatTime((activity as any).timestamp)}
                      </>
                    ) : (
                      <>
                        {activity.hash} • {activity.author} • {formatTime((activity as any).date)}
                        {(activity as any).insertions > 0 || (activity as any).deletions > 0 ? (
                          <span style={{ marginLeft: '8px' }}>
                            (+{(activity as any).insertions} -{(activity as any).deletions})
                          </span>
                        ) : null}
                      </>
                    )}
                  </Text>
                </div>

                {activity.activityType === 'commit' && (activity as any).changedFiles && (activity as any).changedFiles.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                    修改文件: {(activity as any).changedFiles.slice(0, 3).join(', ')}
                    {(activity as any).changedFiles.length > 3 && ` 等${(activity as any).changedFiles.length}个文件`}
                  </div>
                )}
              </AntTimeline.Item>
            ))}
          </AntTimeline>
        </div>
      </Modal>
    );
  };

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <h1>⏰ 工作记录</h1>
          <div className="subtitle">正在加载今日工作记录...</div>
        </div>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {contextHolder}
      <div className="header">
        <div>
          <h1>⏰ 工作记录</h1>
          <div className="subtitle">今日所有项目的Git操作记录</div>
        </div>
        <Button 
          type="primary" 
          icon={<ReloadOutlined />} 
          onClick={loadTodayOperations}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '50px', color: '#999' }}>
            <ClockCircleOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
            <div>今日暂无Git操作记录</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              当天的提交、推送、拉取等操作都会在这里显示
            </div>
          </div>
        </Card>
      ) : (
        <div>
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <Text type="secondary">
              共 {projects.length} 个项目有活动，今日共 {projects.reduce((sum, p) => sum + p.totalOperations + p.totalCommits, 0)} 次操作
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              代码变更: +
              {projects.reduce((sum, p) => sum + p.commits.reduce((s, c) => s + (c.insertions || 0), 0), 0)} -
              {projects.reduce((sum, p) => sum + p.commits.reduce((s, c) => s + (c.deletions || 0), 0), 0)} 行
            </Text>
          </div>

          <List
            grid={{ gutter: 16, column: 3 }}
            dataSource={projects}
            renderItem={(project) => (
              <List.Item>
                <Card
                  hoverable
                  onClick={() => handleProjectClick(project)}
                  style={{ height: '100%' }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <Title level={4} style={{ margin: '0 0 8px 0' }}>
                      {project.project}
                    </Title>

                    <div style={{ marginBottom: '12px' }}>
                      <Tag color="blue" style={{ marginRight: '8px' }}>
                        操作: {project.totalOperations}
                      </Tag>
                      <Tag color="green">
                        提交: {project.totalCommits}
                      </Tag>
                    </div>

                    {project.commits.length > 0 && (
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        代码变更: +
                        {project.commits.reduce((sum, c) => sum + (c.insertions || 0), 0)} -
                        {project.commits.reduce((sum, c) => sum + (c.deletions || 0), 0)} 行
                      </div>
                    )}

                    <div style={{ fontSize: '12px', color: '#666' }}>
                      总活动: {project.totalOperations + project.totalCommits} 次
                    </div>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        </div>
      )}

      {renderProjectModal()}
    </div>
  );
};

export default Timeline;
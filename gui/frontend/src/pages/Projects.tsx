import React, { useState, useEffect, useRef } from 'react';
import {
  Row, Col, Card, Statistic, Button, List, Avatar, Space, Typography,
  Tag, message, Modal, Select, Input, Form, Tooltip, Progress, Alert
} from 'antd';
import {
  FolderOpenOutlined,
  FireOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  GlobalOutlined,
  SettingOutlined,
  MobileOutlined,
  DownOutlined,
  UpOutlined,
  BuildOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  PlusOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import { useProjects, useOSSConfig } from '../api';
import { gitApi, buildApi, ossApi } from '../api/client';
import './Projects.css';

const { Title, Text } = Typography;
const { Option } = Select;

interface Project {
  name: string;
  path: string;
  lastCommitTime?: string;
  status?: {
    modified: number;
    added: number;
    deleted: number;
  };
}

const Projects: React.FC = () => {
  const { projects, isLoading, loadProjects, scanProjects } = useProjects();
  const { ossConfig, channels, isLoading: ossLoading, loadOSSConfig } = useOSSConfig();
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [buildModalVisible, setBuildModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [simpleUploadModalVisible, setSimpleUploadModalVisible] = useState(false);
  const [gitModalVisible, setGitModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [progressTitle, setProgressTitle] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [fileUploadStatus, setFileUploadStatus] = useState<Map<string, { status: 'uploading' | 'uploaded' | 'failed', message: string }>>(new Map());
  const [currentOperation, setCurrentOperation] = useState<'git-pull' | 'git-push' | 'build' | 'upload' | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [selectedEnv, setSelectedEnv] = useState<'dev' | 'prod'>('dev');

  // 移除uploadAsZip状态，直接使用压缩上传作为默认行为

  // 日志区域自动滚动
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [progressLogs, fileUploadStatus]);

  // 项目统计数据
  const projectStats = {
    total: 26,
    active: 12,
    completed: 8,
    paused: 6
  };

  // 项目分类数据
  const projectCategories = [
    { type: 'frontend', name: '前端项目', count: 15, icon: <GlobalOutlined />, color: '#1890ff' },
    { type: 'backend', name: '后端项目', count: 8, icon: <SettingOutlined />, color: '#52c41a' },
    { type: 'mobile', name: '移动端', count: 3, icon: <MobileOutlined />, color: '#fa8c16' }
  ];

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projects && projects.length > 0) {
      // 按最后提交时间排序，取最近6个
      const sorted = [...projects].sort((a: any, b: any) => {
        const aTime = a.lastCommitTime ? new Date(a.lastCommitTime).getTime() : 0;
        const bTime = b.lastCommitTime ? new Date(b.lastCommitTime).getTime() : 0;
        return bTime - aTime;
      });
      setRecentProjects(sorted.slice(0, 6));
    } else {
      setRecentProjects([]);
    }
  }, [projects]);

  // 格式化相对时间
  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return '刚刚';
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  // 检查API响应是否成功
  const isResponseSuccess = (response: any): boolean => {
    return response.ok === true || response.success === true;
  };

  // 处理项目操作
  const handleGitPull = async (projectName: string) => {
    const project = projects.find(p => p.name === projectName);
    if (!project) {
      message.error('项目未找到');
      return;
    }

    setCurrentOperation('git-pull');
    setProgressTitle(`拉取项目: ${projectName}`);
    setProgressPercent(0);
    setProgressText('正在拉取...');
    setProgressLogs([]);
    setProgressModalVisible(true);

    try {
      const response = await gitApi.pull(project.path);
      if (isResponseSuccess(response)) {
        setProgressPercent(100);
        setProgressText('✅ 拉取成功');
        message.success(`✅ 拉取成功: ${projectName}`);
        // 重新加载项目列表以更新状态
        await loadProjects();
      } else {
        throw new Error(response.error || '拉取失败');
      }
    } catch (error: any) {
      setProgressText('❌ 拉取失败');
      message.error(`❌ 拉取失败: ${error.message}`);
    } finally {
      setTimeout(() => setProgressModalVisible(false), 2000);
    }
  };

  const handleGitPush = async (projectName: string) => {
    const project = projects.find(p => p.name === projectName);
    if (!project) {
      message.error('项目未找到');
      return;
    }

    setCurrentOperation('git-push');
    setProgressTitle(`推送项目: ${projectName}`);
    setProgressPercent(0);
    setProgressText('正在推送...');
    setProgressLogs([]);
    setProgressModalVisible(true);

    try {
      const response = await gitApi.push(project.path);
      if (isResponseSuccess(response)) {
        setProgressPercent(100);
        setProgressText('✅ 推送成功');
        message.success(`✅ 推送成功: ${projectName}`);
        // 重新加载项目列表以更新状态
        await loadProjects();
      } else {
        throw new Error(response.error || '推送失败');
      }
    } catch (error: any) {
      setProgressText('❌ 推送失败');
      message.error(`❌ 推送失败: ${error.message}`);
    } finally {
      setTimeout(() => setProgressModalVisible(false), 2000);
    }
  };

  const handleBuild = async (projectName: string) => {
    setSelectedProject(projectName);
    // 加载OSS配置以获取渠道信息
    await loadOSSConfig(projectName);
    setBuildModalVisible(true);
  };

  const executeBuild = async (channel: string) => {
    setBuildModalVisible(false);
    setCurrentOperation('build');
    setProgressTitle(`构建项目: ${selectedProject} (${channel})`);
    setProgressPercent(0);
    setProgressText('准备构建...');
    setProgressLogs([]);
    setFileUploadStatus(new Map()); // 清空文件状态
    setProgressModalVisible(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/build-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: selectedProject, channel })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgressLogs(prev => [...prev, data.message]);

              if (data.type === 'log' || data.type === 'stdout') {
                setProgressText(data.message);
                // 构建过程中不显示进度条进度
              } else if (data.type === 'stderr') {
                setProgressText(`⚠️ ${data.message}`);
              } else if (data.type === 'success') {
                setProgressPercent(100);
                setProgressText('✅ 构建成功');
                message.success(`✅ 构建成功: ${selectedProject}`);
                setTimeout(() => setProgressModalVisible(false), 2000);
              } else if (data.type === 'error') {
                setProgressText('❌ 构建失败');
                message.error(`❌ 构建失败: ${data.message}`);
                setTimeout(() => setProgressModalVisible(false), 3000);
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }
    } catch (error: any) {
      setProgressText('❌ 构建失败');
      message.error(`❌ 构建失败: ${error.message}`);
      setTimeout(() => setProgressModalVisible(false), 3000);
    }
  };

  const handleUpload = async (projectName: string) => {
    setSelectedProject(projectName);
    // 加载OSS配置
    await loadOSSConfig(projectName);

    // 等待更长时间确保状态更新
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 检查是否有渠道配置
    if (channels && channels.channels && Object.keys(channels.channels).length > 0) {
      // 有渠道配置，显示渠道选择模态框
      setUploadModalVisible(true);
    } else {
      // 没有渠道配置，显示简单环境选择模态框
      setSimpleUploadModalVisible(true);
    }
  };

  const executeSimpleUpload = async (env: 'dev' | 'prod') => {
    const project = projects.find(p => p.name === selectedProject);
    if (!project) {
      message.error('项目未找到');
      return;
    }

    setSimpleUploadModalVisible(false);
    setCurrentOperation('upload');
    setProgressTitle(`构建并上传: ${selectedProject} (${env === 'dev' ? '开发' : '生产'}环境)`);
    setProgressPercent(0);
    setProgressText('准备构建...');
    setProgressLogs([]);
    setProgressModalVisible(true);

    try {
      // 第一步：构建项目
      setProgressText('正在构建项目...');
      const buildResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/build-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: selectedProject })
      });

      if (!buildResponse.ok) {
        throw new Error(`构建请求失败: HTTP ${buildResponse.status}`);
      }

      const buildReader = buildResponse.body?.getReader();
      if (!buildReader) {
        throw new Error('无法获取构建响应流');
      }

      const decoder = new TextDecoder();
      let buildBuffer = '';
      let buildSuccess = false;

      while (true) {
        const { done, value } = await buildReader.read();
        if (done) break;

        buildBuffer += decoder.decode(value, { stream: true });
        const lines = buildBuffer.split('\n\n');
        buildBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgressLogs(prev => [...prev, data.message]);

              if (data.type === 'success') {
                buildSuccess = true;
                setProgressText('构建完成，开始上传...');
              } else if (data.type === 'error') {
                throw new Error(`构建失败: ${data.message}`);
              }
            } catch (e) {
              console.error('解析构建SSE数据失败:', e);
            }
          }
        }
      }

      if (!buildSuccess) {
        throw new Error('构建未完成');
      }

      // 第二步：上传到OSS
      setProgressPercent(0); // 重置进度为0，开始上传
      setFileUploadStatus(new Map()); // 清空文件状态
      
      // 所有环境都先执行正常的逐个文件上传
      const normalUploadApi = 'upload-stream';
      const normalResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/${normalUploadApi}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: selectedProject,
          path: project.path,
          channelId: 'default', // 使用默认渠道ID
          env
        })
      });

      if (!normalResponse.ok) {
        throw new Error(`HTTP ${normalResponse.status}`);
      }

      const normalReader = normalResponse.body?.getReader();
      if (!normalReader) {
        throw new Error('无法获取上传响应流');
      }

      let normalBuffer = '';

      while (true) {
        const { done, value } = await normalReader.read();
        if (done) break;

        normalBuffer += decoder.decode(value, { stream: true });
        const lines = normalBuffer.split('\n\n');
        normalBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgressLogs(prev => [...prev, data.message]);

              if (data.type === 'start') {
                setProgressText(data.message);
              } else if (data.type === 'uploading') {
                setProgressText(`正在上传文件...`);
                setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在上传...' })));
                setProgressPercent(data.globalProgress || data.progress || 0); // 使用全局进度
              } else if (data.type === 'uploaded') {
                setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: '✅ 上传成功' })));
                setProgressPercent(data.globalProgress || data.progress || 0);
              } else if (data.type === 'failed') {
                setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'failed', message: `❌ 上传失败: ${data.error}` })));
                setProgressPercent(data.globalProgress || data.progress || 0);
              } else if (data.type === 'complete') {
                setProgressPercent(100); // 正常上传完成，设为100%
                setProgressText('✅ 正常上传完成，开始版本备份...');
              } else if (data.type === 'error') {
                setProgressText('❌ 上传失败');
                message.error(`❌ 上传失败: ${data.message}`);
                setTimeout(() => setProgressModalVisible(false), 3000);
                return; // 上传失败，直接返回
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }

      // 第三步：生产环境额外执行压缩包备份
      if (env === 'prod') {
        setProgressPercent(0); // 从0%重新开始备份进度
        setFileUploadStatus(new Map()); // 清空文件状态
        
        const backupUploadApi = 'upload-zip-stream';
        const backupResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/${backupUploadApi}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: selectedProject,
            path: project.path,
            channelId: 'default',
            env,
            isBackup: true // 标记为备份上传
          })
        });

        if (!backupResponse.ok) {
          throw new Error(`备份上传请求失败: HTTP ${backupResponse.status}`);
        }

        const backupReader = backupResponse.body?.getReader();
        if (!backupReader) {
          throw new Error('无法获取备份上传响应流');
        }

        let backupBuffer = '';

        while (true) {
          const { done, value } = await backupReader.read();
          if (done) break;

          backupBuffer += decoder.decode(value, { stream: true });
          const lines = backupBuffer.split('\n\n');
          backupBuffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setProgressLogs(prev => [...prev, data.message]);

                if (data.type === 'start') {
                  setProgressText(data.message);
                } else if (data.type === 'compressing') {
                  setProgressText(data.message);
                  setProgressPercent(data.progress || 0); // 压缩阶段0-100%
                } else if (data.type === 'compressed') {
                  setProgressText(data.message);
                  setProgressPercent(50); // 压缩完成，进度设为50%，准备开始上传
                } else if (data.type === 'bucket_start') {
                  setProgressText(`${data.bucketIndex}/${data.totalBuckets}: ${data.message}`);
                  // 不要重置进度，每个bucket的进度是整体进度的一部分
                } else if (data.type === 'uploading') {
                  setProgressText(`正在备份到 ${data.bucket}...`);
                  setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在备份...' })));
                  // 上传阶段50-100%，根据bucket进度分配
                  const uploadProgress = 50 + (data.globalProgress || 0) * 0.5;
                  setProgressPercent(Math.round(uploadProgress));
                } else if (data.type === 'uploaded') {
                  setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: '✅ 备份成功' })));
                  const uploadProgress = 50 + (data.globalProgress || 0) * 0.5;
                  setProgressPercent(Math.round(uploadProgress));
                } else if (data.type === 'failed') {
                  setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'failed', message: `❌ 备份失败: ${data.error}` })));
                  const uploadProgress = 50 + (data.globalProgress || 0) * 0.5;
                  setProgressPercent(Math.round(uploadProgress));
                } else if (data.type === 'bucket_complete') {
                  setProgressText(`${data.bucket} 备份完成 (${data.bucketIndex}/${data.totalBuckets})`);
                  const uploadProgress = 50 + (data.globalProgress || 0) * 0.5;
                  setProgressPercent(Math.round(uploadProgress));
                } else if (data.type === 'complete') {
                  setProgressPercent(100);
                  setProgressText('🎉 生产环境部署完成！正在执行部署后任务...');
                  message.success(`🎉 生产环境部署完成: ${selectedProject}`);
                  // 生产环境延迟关闭，让用户看到部署任务的执行
                  setTimeout(() => setProgressModalVisible(false), 5000);
                } else if (data.type === 'error') {
                  setProgressText('❌ 备份失败');
                  message.error(`❌ 备份失败: ${data.message}`);
                  setTimeout(() => setProgressModalVisible(false), 3000);
                }
              } catch (e) {
                console.error('解析备份SSE数据失败:', e);
              }
            }
          }
        }
      } else {
        // 开发环境直接完成
        setProgressPercent(100);
        setProgressText('✅ 上传成功');
        message.success(`✅ 上传成功: ${selectedProject}`);
        setTimeout(() => setProgressModalVisible(false), 2000);
      }
    } catch (error: any) {
      setProgressText('❌ 操作失败');
      message.error(`❌ 操作失败: ${error.message}`);
      setTimeout(() => setProgressModalVisible(false), 3000);
    }
  };

  const executeUpload = async (channelId: string, env: 'dev' | 'prod') => {
    const project = projects.find(p => p.name === selectedProject);
    if (!project) {
      message.error('项目未找到');
      return;
    }

    setUploadModalVisible(false);
    setCurrentOperation('upload');
    setProgressTitle(`构建并上传: ${selectedProject} (${channelId} - ${env === 'dev' ? '开发' : '生产'})`);
    setProgressPercent(0);
    setProgressText('准备构建...');
    setProgressLogs([]);
    setFileUploadStatus(new Map()); // 清空文件状态
    setProgressModalVisible(true);

    try {
      // 第一步：构建项目
      setProgressText('正在构建项目...');
      const buildResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/build-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: selectedProject,
          channel: channelId
        })
      });

      if (!buildResponse.ok) {
        throw new Error(`构建请求失败: HTTP ${buildResponse.status}`);
      }

      const buildReader = buildResponse.body?.getReader();
      if (!buildReader) {
        throw new Error('无法获取构建响应流');
      }

      const decoder = new TextDecoder();
      let buildBuffer = '';
      let buildSuccess = false;

      while (true) {
        const { done, value } = await buildReader.read();
        if (done) break;

        buildBuffer += decoder.decode(value, { stream: true });
        const lines = buildBuffer.split('\n\n');
        buildBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgressLogs(prev => [...prev, data.message]);

              if (data.type === 'success') {
                buildSuccess = true;
                setProgressText('构建完成，开始上传...');
              } else if (data.type === 'error') {
                throw new Error(`构建失败: ${data.message}`);
              }
            } catch (e) {
              console.error('解析构建SSE数据失败:', e);
            }
          }
        }
      }

      if (!buildSuccess) {
        throw new Error('构建未完成');
      }

      // 第二步：上传到OSS
      setProgressPercent(0); // 重置进度为0，开始上传
      setFileUploadStatus(new Map()); // 清空文件状态
      
      // 所有环境都先执行正常的逐个文件上传
      const normalUploadApi = 'upload-stream';
      const normalResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/${normalUploadApi}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: selectedProject,
          path: project.path,
          channelId,
          env
        })
      });

      if (!normalResponse.ok) {
        throw new Error(`HTTP ${normalResponse.status}`);
      }

      const normalReader = normalResponse.body?.getReader();
      if (!normalReader) {
        throw new Error('无法获取上传响应流');
      }

      let normalBuffer = '';

      while (true) {
        const { done, value } = await normalReader.read();
        if (done) break;

        normalBuffer += decoder.decode(value, { stream: true });
        const lines = normalBuffer.split('\n\n');
        normalBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgressLogs(prev => [...prev, data.message]);

              if (data.type === 'start') {
                setProgressText(data.message);
              } else if (data.type === 'uploading') {
                setProgressText('正在上传文件...');
                setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在上传...' })));
                setProgressPercent(data.globalProgress || data.progress || 0); // 使用全局进度
              } else if (data.type === 'uploaded') {
                setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: '✅ 上传成功' })));
                setProgressPercent(data.globalProgress || data.progress || 0);
              } else if (data.type === 'failed') {
                setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'failed', message: `❌ 上传失败: ${data.error}` })));
                setProgressPercent(data.globalProgress || data.progress || 0);
              } else if (data.type === 'complete') {
                setProgressPercent(100); // 正常上传完成，设为100%
                setProgressText('✅ 正常上传完成，开始版本备份...');
              } else if (data.type === 'error') {
                setProgressText('❌ 上传失败');
                message.error(`❌ 上传失败: ${data.message}`);
                setTimeout(() => setProgressModalVisible(false), 3000);
                return; // 上传失败，直接返回
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }

      // 第三步：生产环境额外执行压缩包备份
      if (env === 'prod') {
        setProgressPercent(0); // 从0%重新开始备份进度
        setFileUploadStatus(new Map()); // 清空文件状态
        
        const backupUploadApi = 'upload-zip-stream';
        const backupResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/${backupUploadApi}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: selectedProject,
            path: project.path,
            channelId,
            env,
            isBackup: true // 标记为备份上传
          })
        });

        if (!backupResponse.ok) {
          throw new Error(`备份上传请求失败: HTTP ${backupResponse.status}`);
        }

        const backupReader = backupResponse.body?.getReader();
        if (!backupReader) {
          throw new Error('无法获取备份上传响应流');
        }

        let backupBuffer = '';

        while (true) {
          const { done, value } = await backupReader.read();
          if (done) break;

          backupBuffer += decoder.decode(value, { stream: true });
          const lines = backupBuffer.split('\n\n');
          backupBuffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setProgressLogs(prev => [...prev, data.message]);

                if (data.type === 'start') {
                  setProgressText(data.message);
                } else if (data.type === 'compressing') {
                  setProgressText(data.message);
                  setProgressPercent(data.progress || 0); // 压缩阶段0-100%
                } else if (data.type === 'compressed') {
                  setProgressText(data.message);
                  setProgressPercent(100); // 压缩完成设为100%
                } else if (data.type === 'bucket_start') {
                  setProgressText(`${data.bucketIndex}/${data.totalBuckets}: ${data.message}`);
                  setProgressPercent(0); // 备份上传从0%开始
                } else if (data.type === 'uploading') {
                  setProgressText(`正在备份到 ${data.bucket}...`);
                  setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在备份...' })));
                  setProgressPercent(data.bucketProgress || data.progress); // 备份上传0-100%
                } else if (data.type === 'uploaded') {
                  setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: '✅ 备份成功' })));
                  setProgressPercent(data.bucketProgress || data.progress);
                } else if (data.type === 'failed') {
                  setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'failed', message: `❌ 备份失败: ${data.error}` })));
                  setProgressPercent(data.bucketProgress || data.progress);
                } else if (data.type === 'bucket_complete') {
                  setProgressText(`${data.bucket} 备份完成 (${data.bucketIndex}/${data.totalBuckets})`);
                } else if (data.type === 'complete') {
                  setProgressPercent(100);
                  setProgressText('🎉 生产环境部署完成！正在执行部署后任务...');
                  message.success(`🎉 生产环境部署完成: ${selectedProject}`);
                  // 生产环境延迟关闭，让用户看到部署任务的执行
                  setTimeout(() => setProgressModalVisible(false), 5000);
                } else if (data.type === 'error') {
                  setProgressText('❌ 备份失败');
                  message.error(`❌ 备份失败: ${data.message}`);
                  setTimeout(() => setProgressModalVisible(false), 3000);
                }
              } catch (e) {
                console.error('解析备份SSE数据失败:', e);
              }
            }
          }
        }
      } else {
        // 开发环境直接完成
        setProgressPercent(100);
        setProgressText('✅ 上传成功');
        message.success(`✅ 上传成功: ${selectedProject}`);
        setTimeout(() => setProgressModalVisible(false), 2000);
      }
    } catch (error: any) {
      setProgressText('❌ 操作失败');
      message.error(`❌ 操作失败: ${error.message}`);
      setTimeout(() => setProgressModalVisible(false), 3000);
    }
  };

  const handleScanProjects = async () => {
    await scanProjects();
    message.success('项目扫描完成');
  };

  return (
    <div className="projects-container">
      <div className="projects-header">
        <Title level={1}>💼 项目管理</Title>
        <Text className="projects-subtitle">管理您的开发项目</Text>
        <Space>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleScanProjects}
            loading={isLoading}
          >
            扫描项目
          </Button>
          <Button type="default" icon={<PlusOutlined />}>
            新建项目
          </Button>
        </Space>
      </div>

      {/* 项目统计 */}
      <Card className="stats-section">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <Statistic
                title="项目总数"
                value={projectStats.total}
                prefix={<FolderOpenOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <Statistic
                title="活跃项目"
                value={projectStats.active}
                prefix={<FireOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <Statistic
                title="已完成"
                value={projectStats.completed}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <Statistic
                title="已暂停"
                value={projectStats.paused}
                prefix={<PauseCircleOutlined />}
                valueStyle={{ color: '#bfbfbf' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          {/* 最近项目 */}
          <Card
            title={
              <Space>
                <FireOutlined />
                最近项目
              </Space>
            }
            className="recent-projects-section"
          >
            <List
              loading={isLoading}
              dataSource={recentProjects}
              renderItem={(project: Project) => (
                <List.Item
                  actions={[
                    <Tooltip title="Git Pull">
                      <Button
                        type="text"
                        icon={<DownOutlined />}
                        onClick={() => handleGitPull(project.name)}
                      />
                    </Tooltip>,
                    <Tooltip title="Git Push">
                      <Button
                        type="text"
                        icon={<UpOutlined />}
                        onClick={() => handleGitPush(project.name)}
                      />
                    </Tooltip>,
                    <Tooltip title="构建项目">
                      <Button
                        type="text"
                        icon={<BuildOutlined />}
                        onClick={() => handleBuild(project.name)}
                      />
                    </Tooltip>,
                    <Tooltip title="上传到OSS">
                      <Button
                        type="text"
                        icon={<CloudUploadOutlined />}
                        onClick={() => handleUpload(project.name)}
                      />
                    </Tooltip>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<FolderOpenOutlined />} />}
                    title={<strong>{project.name}</strong>}
                    description={
                      <Space direction="vertical" size="small">
                        <Text type="secondary">
                          最后更新: {formatRelativeTime(project.lastCommitTime || '')}
                        </Text>
                        {project.status && (
                          <Space size="small">
                            {project.status.modified > 0 && (
                              <Tag color="orange">📝 {project.status.modified} 已修改</Tag>
                            )}
                            {project.status.added > 0 && (
                              <Tag color="green">➕ {project.status.added} 已添加</Tag>
                            )}
                            {project.status.deleted > 0 && (
                              <Tag color="red">➖ {project.status.deleted} 已删除</Tag>
                            )}
                            {project.status.modified === 0 && project.status.added === 0 && project.status.deleted === 0 && (
                              <Tag color="default">✅ 无变化</Tag>
                            )}
                          </Space>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            {recentProjects.length === 0 && !isLoading && (
              <div className="empty-state">
                <Text type="secondary">暂无项目数据</Text>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          {/* 项目分类 */}
          <Card title="📂 项目分类" className="categories-section">
            <List
              dataSource={projectCategories}
              renderItem={(category) => (
                <List.Item>
                  <Card
                    className="category-card"
                    style={{ borderLeft: `4px solid ${category.color}` }}
                  >
                    <Space>
                      <Avatar
                        icon={category.icon}
                        style={{ backgroundColor: category.color }}
                      />
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{category.name}</div>
                        <Text type="secondary">{category.count} 个项目</Text>
                      </div>
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 构建选项弹窗 */}
      <Modal
        title={`构建项目: ${selectedProject}`}
        open={buildModalVisible}
        onCancel={() => setBuildModalVisible(false)}
        footer={null}
        width={600}
      >
        {ossLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <LoadingOutlined style={{ fontSize: '24px' }} />
            <div style={{ marginTop: '10px' }}>正在加载渠道配置...</div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <Text strong>选择构建渠道:</Text>
            </div>
            {channels?.channels && Object.keys(channels.channels).length > 0 ? (
              <div style={{ display: 'grid', gap: '12px' }}>
                {Object.entries(channels.channels).map(([channelId, channelConfig]: [string, any]) => (
                  <Card
                    key={channelId}
                    hoverable
                    onClick={() => executeBuild(channelId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{channelConfig.name || channelId}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>渠道ID: {channelId}</div>
                      </div>
                      <BuildOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert
                message="未找到渠道配置"
                description="请先配置项目的渠道信息"
                type="warning"
                showIcon
              />
            )}
          </div>
        )}
      </Modal>

      {/* 上传选项弹窗 */}
      <Modal
        title={`上传到OSS: ${selectedProject}`}
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        width={600}
      >
        {ossLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <LoadingOutlined style={{ fontSize: '24px' }} />
            <div style={{ marginTop: '10px' }}>正在加载OSS配置...</div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <Text strong>选择上传渠道和环境:</Text>
            </div>
            {channels?.channels && Object.keys(channels.channels).length > 0 ? (
              <div style={{ display: 'grid', gap: '12px' }}>
                {Object.entries(channels.channels).map(([channelId, channelConfig]: [string, any]) => (
                  <Card key={channelId} style={{ marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>{channelConfig.name || channelId}</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <Button
                        type="default"
                        icon={<CloudUploadOutlined />}
                        onClick={() => executeUpload(channelId, 'dev')}
                        style={{ flex: 1, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none' }}
                      >
                        📦 开发环境
                      </Button>
                      <Button
                        type="default"
                        icon={<CloudUploadOutlined />}
                        onClick={() => executeUpload(channelId, 'prod')}
                        style={{ flex: 1, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', border: 'none' }}
                      >
                        🚀 生产环境
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert
                message="未找到渠道配置"
                description="请先配置项目的渠道信息"
                type="warning"
                showIcon
              />
            )}
          </div>
        )}
      </Modal>

      {/* 简单上传选项弹窗（无渠道配置的项目） */}
      <Modal
        title={`上传到OSS: ${selectedProject}`}
        open={simpleUploadModalVisible}
        onCancel={() => setSimpleUploadModalVisible(false)}
        footer={null}
        width={500}
      >
        {ossLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <LoadingOutlined style={{ fontSize: '24px' }} />
            <div style={{ marginTop: '10px' }}>正在加载OSS配置...</div>
          </div>
        ) : ossConfig ? (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <Text strong>选择上传环境:</Text>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
              {ossConfig.buckets?.dev && (
                <Card
                  hoverable
                  onClick={() => executeSimpleUpload('dev')}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>📦 开发环境</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Bucket: {typeof ossConfig.buckets.dev === 'string' ? ossConfig.buckets.dev : ossConfig.buckets.dev.name}
                      </div>
                    </div>
                    <CloudUploadOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                  </div>
                </Card>
              )}
              {ossConfig.buckets?.prod && (
                <Card
                  hoverable
                  onClick={() => executeSimpleUpload('prod')}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>🚀 生产环境</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Bucket: {Array.isArray(ossConfig.buckets.prod)
                          ? ossConfig.buckets.prod.map((b: any) => b.name || b).join(' + ')
                          : (typeof ossConfig.buckets.prod === 'string' ? ossConfig.buckets.prod : ossConfig.buckets.prod.name)
                        }
                      </div>
                    </div>
                    <CloudUploadOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                  </div>
                </Card>
              )}
            </div>
            {!ossConfig.buckets?.dev && !ossConfig.buckets?.prod && (
              <Alert
                message="未找到bucket配置"
                description="请先在oss-connection-config.json中配置项目的bucket信息"
                type="warning"
                showIcon
              />
            )}
          </div>
        ) : (
          <Alert
            message="未找到OSS配置"
            description="请先在oss-connection-config.json中配置项目信息"
            type="warning"
            showIcon
          />
        )}
      </Modal>

      {/* 进度显示弹窗 */}
      <Modal
        title={progressTitle}
        open={progressModalVisible}
        footer={null}
        closable={false}
        width={700}
      >
        <div style={{ padding: '20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {currentOperation === 'upload' && (
              <Progress
                type="circle"
                percent={progressPercent}
                status={progressText.includes('失败') ? 'exception' : progressText.includes('成功') ? 'success' : 'active'}
                style={{ marginBottom: '10px' }}
              />
            )}
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{progressText}</div>
          </div>

          {progressLogs.length > 0 && (
            <div
              ref={logsRef}
              style={{
                maxHeight: '300px',
                overflowY: 'auto',
                background: '#1e1e1e',
                color: '#00ff00',
                padding: '15px',
                borderRadius: '8px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap'
              }}
            >
              {progressLogs.map((log, index) => (
                <div key={index} style={{ marginBottom: '4px' }}>
                  {log}
                </div>
              ))}
              {Array.from(fileUploadStatus.entries()).map(([fileName, status]) => (
                <div
                  key={fileName}
                  style={{
                    marginBottom: '4px',
                    color: status.status === 'uploading' ? '#ffa500' : // 橙色：正在上传
                           status.status === 'uploaded' ? '#00ff00' : // 绿色：上传成功
                           '#ff4444' // 红色：上传失败
                  }}
                >
                  {fileName}: {status.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Projects;
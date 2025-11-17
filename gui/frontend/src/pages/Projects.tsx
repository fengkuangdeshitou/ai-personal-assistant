import React, { useState, useEffect, useRef } from 'react';
import {
  Button, Avatar, Typography,
  Tag, message, Modal, Select, Progress, Spin
} from 'antd';
import {
  FolderOpenOutlined,
  GlobalOutlined,
  SettingOutlined,
  MobileOutlined,
  DownOutlined,
  UpOutlined,
  BuildOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useProjects, useOSSConfig } from '../api';
import { gitApi } from '../api/client';
import './Projects.css';

const { Title, Text } = Typography;
const { Option } = Select;

interface Project {
  name: string;
  path: string;
  lastCommitTime?: string;
  branch?: string;
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
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>(undefined);
  const [selectedEnv, setSelectedEnv] = useState<'dev' | 'prod'>('dev');
  const [projectGitStatus, setProjectGitStatus] = useState<Map<string, { operation: 'pull' | 'push' | null, progress: number, status: 'idle' | 'running' | 'success' | 'error', message: string }>>(new Map());

  // 移除uploadAsZip状态，直接使用压缩上传作为默认行为

  // 日志区域自动滚动
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [progressLogs, fileUploadStatus]);

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

    // 设置项目级别的git状态
    setProjectGitStatus(prev => new Map(prev.set(projectName, {
      operation: 'pull',
      progress: 0,
      status: 'running',
      message: '正在拉取...'
    })));

    // 显示进度模态框
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
        setProjectGitStatus(prev => new Map(prev.set(projectName, {
          operation: 'pull',
          progress: 100,
          status: 'success',
          message: '✅ 拉取成功'
        })));
        message.success(`✅ 拉取成功: ${projectName}`);
        // 重新加载项目列表以更新状态
        await loadProjects();
      } else {
        throw new Error(response.error || '拉取失败');
      }
    } catch (error: any) {
      setProgressText('❌ 拉取失败');
      setProjectGitStatus(prev => new Map(prev.set(projectName, {
        operation: 'pull',
        progress: 0,
        status: 'error',
        message: '❌ 拉取失败'
      })));
      message.error(`❌ 拉取失败: ${error.message}`);
    } finally {
      setTimeout(() => setProgressModalVisible(false), 2000);
    }

    // 清除项目级别状态
    setTimeout(() => {
      setProjectGitStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(projectName);
        return newMap;
      });
    }, 3000);
  };

  const handleGitPush = async (projectName: string) => {
    const project = projects.find(p => p.name === projectName);
    if (!project) {
      message.error('项目未找到');
      return;
    }

    // 设置项目级别的git状态
    setProjectGitStatus(prev => new Map(prev.set(projectName, {
      operation: 'push',
      progress: 0,
      status: 'running',
      message: '正在推送...'
    })));

    // 显示进度模态框
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
        setProjectGitStatus(prev => new Map(prev.set(projectName, {
          operation: 'push',
          progress: 100,
          status: 'success',
          message: '✅ 推送成功'
        })));
        message.success(`✅ 推送成功: ${projectName}`);
        // 重新加载项目列表以更新状态
        await loadProjects();
      } else {
        throw new Error(response.error || '推送失败');
      }
    } catch (error: any) {
      setProgressText('❌ 推送失败');
      setProjectGitStatus(prev => new Map(prev.set(projectName, {
        operation: 'push',
        progress: 0,
        status: 'error',
        message: '❌ 推送失败'
      })));
      message.error(`❌ 推送失败: ${error.message}`);
    } finally {
      setTimeout(() => setProgressModalVisible(false), 2000);
    }

    // 清除项目级别状态
    setTimeout(() => {
      setProjectGitStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(projectName);
        return newMap;
      });
    }, 3000);
  };

  const handleBuild = async (projectName: string) => {
    setSelectedProject(projectName);

    try {
      // 加载OSS配置并获取结果
      const configResult = await loadOSSConfig(projectName);

      // 检查是否有渠道配置
      if (configResult.channels && configResult.channels.channels && Object.keys(configResult.channels.channels).length > 0) {
        // 有渠道配置，显示渠道选择模态框
        setBuildModalVisible(true);
      } else {
        // 没有渠道配置，显示环境选择模态框
        setSimpleUploadModalVisible(true);
      }
    } catch (error) {
      console.error('Failed to load OSS config:', error);
      message.error('加载渠道配置失败，请重试');
    }
  };

  const executeBuildOnly = async (channel: string) => {
    setBuildModalVisible(false);
    setCurrentOperation('build');
    setProgressTitle(`构建项目: ${selectedProject} (${channel})`);
    setProgressPercent(0);
    setProgressText('准备构建...');
    setProgressLogs([]);
    setFileUploadStatus(new Map()); // 清空文件状态
    setProgressModalVisible(true);

    try {
      // 构建查询参数
      const params = new URLSearchParams({ projectName: selectedProject });
      if (channel && channel !== 'default') {
        params.append('channel', channel);
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/build-stream?${params}`, {
        method: 'GET'
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

  const executeBuild = async (channel: string, env: 'dev' | 'prod') => {
    setBuildModalVisible(false);
    setCurrentOperation('upload');
    setProgressTitle(`构建并上传: ${selectedProject} (${channel} - ${env === 'dev' ? '开发' : '生产'})`);
    setProgressPercent(0);
    setProgressText('准备构建...');
    setProgressLogs([]);
    setFileUploadStatus(new Map()); // 清空文件状态
    setProgressModalVisible(true);

    try {
      // 构建查询参数
      const params = new URLSearchParams({ projectName: selectedProject });
      if (channel && channel !== 'default') {
        params.append('channel', channel);
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/build-stream?${params}`, {
        method: 'GET'
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
                setProgressText('✅ 构建成功，开始上传...');
                message.success(`✅ 构建成功: ${selectedProject}`);
                // 构建成功后，直接开始上传
                setTimeout(async () => {
                  try {
                    await executeUpload(channel, env);
                  } catch (uploadError: any) {
                    setProgressText('❌ 上传失败');
                    message.error(`❌ 上传失败: ${uploadError.message}`);
                    setTimeout(() => setProgressModalVisible(false), 3000);
                  }
                }, 1000);
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
    
    try {
      // 加载OSS配置并获取结果
      const configResult = await loadOSSConfig(projectName);
      
      // 检查是否有渠道配置
      if (configResult.channels && configResult.channels.channels && Object.keys(configResult.channels.channels).length > 0) {
        // 有渠道配置，显示渠道和环境选择模态框
        setSelectedChannel(undefined); // 重置选中状态
        setUploadModalVisible(true);
      } else {
        // 没有渠道配置，显示简单环境选择模态框
        setSimpleUploadModalVisible(true);
      }
    } catch (error) {
      console.error('Failed to load OSS config:', error);
      message.error('加载OSS配置失败，请重试');
      // 即使失败也显示Modal，让用户看到错误信息
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
    setFileUploadStatus(new Map()); // 清空之前的文件上传状态
    setProgressModalVisible(true);

    try {
      // 第一步：构建项目
      setProgressText('正在构建项目...');

      // 使用 EventSource 处理构建流
      const buildUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/build-stream?projectName=${encodeURIComponent(selectedProject)}`;
      const buildEventSource = new EventSource(buildUrl);

      let buildSuccess = false;

      await new Promise<void>((resolve, reject) => {
        buildEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);

            if (data.type === 'start') {
              setProgressText(data.message);
            } else if (data.type === 'progress') {
              setProgressText(data.message);
              setProgressPercent(data.progress || 0);
            } else if (data.type === 'success') {
              setProgressPercent(100);
              setProgressText('✅ 构建完成');
              buildSuccess = true;
              buildEventSource.close();
              resolve();
            } else if (data.type === 'error') {
              setProgressText('❌ 构建失败');
              message.error(`❌ 构建失败: ${data.message}`);
              buildEventSource.close();
              reject(new Error(data.message));
            }
          } catch (e) {
            console.error('解析构建SSE数据失败:', e);
          }
        };

        buildEventSource.onerror = (error) => {
          console.error('构建EventSource错误:', error);
          setProgressText('❌ 构建连接失败');
          message.error('❌ 构建连接失败');
          buildEventSource.close();
          reject(new Error('构建连接失败'));
        };

        // 设置超时
        setTimeout(() => {
          buildEventSource.close();
          reject(new Error('构建超时'));
        }, 300000); // 5分钟超时
      });

      if (!buildSuccess) {
        throw new Error('构建未完成');
      }

      // 第二步：上传到OSS
      setProgressPercent(0); // 重置进度为0，开始上传
      setFileUploadStatus(new Map()); // 清空文件状态

      // 所有环境都先执行正常的逐个文件上传
      const normalUploadUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/upload-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=default&env=${env}`;
      const normalEventSource = new EventSource(normalUploadUrl);

      // 处理正常的上传过程
      await new Promise<void>((resolve, reject) => {
        normalEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);

            if (data.type === 'start') {
              setProgressText(data.message);
            } else if (data.type === 'bucket_start') {
              setProgressText(`${data.bucketIndex}/${data.totalBuckets}: ${data.message}`);
            } else if (data.type === 'uploading') {
              setProgressText(`正在上传: ${data.file}`);
              setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在上传...' })));
              setProgressPercent(data.globalProgress || 0);
            } else if (data.type === 'uploaded') {
              setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: `✅ ${data.file} 上传成功` })));
              setProgressPercent(data.globalProgress || 0);
            } else if (data.type === 'failed') {
              setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'failed', message: `❌ 上传失败: ${data.error}` })));
              setProgressPercent(data.globalProgress || 0);
            } else if (data.type === 'bucket_complete') {
              setProgressText(`${data.bucket} 上传完成 (${data.bucketIndex}/${data.totalBuckets})`);
            } else if (data.type === 'complete') {
              setProgressPercent(100);
              setProgressText('✅ 上传完成');
              message.success(`✅ 上传成功: ${selectedProject}`);
              normalEventSource.close();
              resolve();
            } else if (data.type === 'error') {
              setProgressText('❌ 上传失败');
              message.error(`❌ 上传失败: ${data.message}`);
              normalEventSource.close();
              setTimeout(() => setProgressModalVisible(false), 3000);
              reject(new Error(data.message));
            }
          } catch (e) {
            console.error('解析上传SSE数据失败:', e);
          }
        };

        normalEventSource.onerror = (error) => {
          console.error('上传EventSource错误:', error);
          setProgressText('❌ 上传连接失败');
          message.error('❌ 上传连接失败');
          normalEventSource.close();
          reject(new Error('上传连接失败'));
        };

        // 设置超时
        setTimeout(() => {
          normalEventSource.close();
          reject(new Error('上传超时'));
        }, 600000); // 10分钟超时
      });


      // 第三步：生产环境额外执行压缩包备份
      if (env === 'prod') {
        setProgressPercent(0); // 从0%重新开始备份进度
        setFileUploadStatus(new Map()); // 清空文件状态

        const backupUploadUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/upload-zip-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=default&env=${env}&isBackup=true`;
        const backupEventSource = new EventSource(backupUploadUrl);

        await new Promise<void>((resolve, reject) => {
        backupEventSource.onopen = () => {
          console.log('备份EventSource连接已建立');
        };

        backupEventSource.onmessage = (event) => {
          console.log('备份EventSource收到消息:', event.data);
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);              if (data.type === 'start') {
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
                backupEventSource.close();
                resolve();
              } else if (data.type === 'error') {
                setProgressText('❌ 备份失败');
                message.error(`❌ 备份失败: ${data.message}`);
                backupEventSource.close();
                setTimeout(() => setProgressModalVisible(false), 3000);
                reject(new Error(data.message));
              }
            } catch (e) {
              console.error('解析备份SSE数据失败:', e);
            }
          };

          backupEventSource.onerror = (error) => {
            console.error('备份EventSource错误:', error);
            console.error('EventSource readyState:', backupEventSource.readyState);
            console.error('EventSource url:', backupEventSource.url);
            setProgressText('❌ 备份连接失败');
            message.error('❌ 备份连接失败');
            backupEventSource.close();
            reject(new Error('备份连接失败'));
          };

          // 设置超时
          setTimeout(() => {
            backupEventSource.close();
            reject(new Error('备份超时'));
          }, 900000); // 15分钟超时
        });
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

  const executeBackup = async (channelId: string, env: 'dev' | 'prod', project: any, onComplete: () => void) => {
    setProgressPercent(0); // 从0%重新开始备份进度
    setFileUploadStatus(new Map()); // 清空文件状态

    const backupUploadUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/upload-zip-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=${encodeURIComponent(channelId)}&env=${env}&isBackup=true`;
    const backupEventSource = new EventSource(backupUploadUrl);

    backupEventSource.onopen = () => {
      console.log('备份EventSource连接已建立');
    };

    backupEventSource.onmessage = (event) => {
      console.log('备份EventSource收到消息:', event.data);
      try {
        const data = JSON.parse(event.data);
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
          backupEventSource.close();
          onComplete();
        } else if (data.type === 'error') {
          setProgressText('❌ 备份失败');
          message.error(`❌ 备份失败: ${data.message}`);
          backupEventSource.close();
          setTimeout(() => setProgressModalVisible(false), 3000);
          onComplete(); // 即使失败也要完成
        }
      } catch (e) {
        console.error('解析备份SSE数据失败:', e);
      }
    };

    backupEventSource.onerror = (error) => {
      console.error('备份EventSource错误:', error);
      console.error('EventSource readyState:', backupEventSource.readyState);
      console.error('EventSource url:', backupEventSource.url);
      setProgressText('❌ 备份连接失败');
      message.error('❌ 备份连接失败');
      backupEventSource.close();
      onComplete(); // 即使失败也要完成
    };

    // 设置超时
    setTimeout(() => {
      backupEventSource.close();
      onComplete(); // 超时也完成
    }, 900000); // 15分钟超时
  };

  const executeUpload = async (channelId: string, env: 'dev' | 'prod') => {
    const project = projects.find(p => p.name === selectedProject);
    if (!project) {
      message.error('项目未找到');
      return;
    }

    setUploadModalVisible(false);
    setCurrentOperation('upload');
    setProgressTitle(`上传: ${selectedProject} (${channelId} - ${env === 'dev' ? '开发' : '生产'})`);
    setProgressPercent(0);
    setProgressText('准备上传...');
    setProgressLogs([]);
    setFileUploadStatus(new Map()); // 清空文件状态
    setProgressModalVisible(true);

    try {
      // 直接开始上传（构建已在executeBuild中完成）
      setProgressText('正在上传...');

      // 上传到OSS
      setProgressPercent(0); // 重置进度为0，开始上传
      setFileUploadStatus(new Map()); // 清空文件状态

      // 使用 EventSource 处理上传流
      const uploadUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/upload-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=${encodeURIComponent(channelId)}&env=${env}`;
      const uploadEventSource = new EventSource(uploadUrl);

      await new Promise<void>((resolve, reject) => {
        uploadEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);

            if (data.type === 'start') {
              setProgressText(data.message);
            } else if (data.type === 'uploading') {
              setProgressText(`正在上传文件...`);
              setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在上传...' })));
              setProgressPercent(data.globalProgress || 0);
            } else if (data.type === 'uploaded') {
              setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: `✅ ${data.file} 上传成功` })));
            } else if (data.type === 'complete') {
              setProgressPercent(100);
              setProgressText('✅ 上传完成');
              message.success(`✅ 上传成功: ${selectedProject}`);
              uploadEventSource.close();
              
              // 多渠道生产环境额外执行压缩包备份
              if (env === 'prod') {
                // 不在这里等待备份完成，而是启动备份并在完成后关闭模态框
                executeBackup(channelId, env, project, () => {
                  setTimeout(() => setProgressModalVisible(false), 2000);
                  resolve();
                });
              } else {
                // 开发环境直接完成
                setTimeout(() => setProgressModalVisible(false), 2000);
                resolve();
              }
            } else if (data.type === 'error') {
              setProgressText('❌ 上传失败');
              message.error(`❌ 上传失败: ${data.message}`);
              uploadEventSource.close();
              setTimeout(() => setProgressModalVisible(false), 3000);
              reject(new Error(data.message));
            }
          } catch (e) {
            console.error('解析上传SSE数据失败:', e);
          }
        };

        uploadEventSource.onerror = (error) => {
          console.error('上传EventSource错误:', error);
          setProgressText('❌ 上传连接失败');
          message.error('❌ 上传连接失败');
          uploadEventSource.close();
          reject(new Error('上传连接失败'));
        };

        // 设置超时
        setTimeout(() => {
          uploadEventSource.close();
          reject(new Error('上传超时'));
        }, 600000); // 10分钟超时
      });
    } catch (error: any) {
      setProgressText('❌ 操作失败');
      message.error(`❌ 操作失败: ${error.message}`);
      setTimeout(() => setProgressModalVisible(false), 3000);
    }
  };

  return (
    <div className="projects-container">
      {/* 页面头部 */}
      <div className="projects-header">
        <div>
          <Title level={1}>项目管理中心</Title>
          <p className="projects-subtitle">智能管理您的开发项目，高效协作与部署</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button type="primary" icon={<ReloadOutlined />} size="large" onClick={() => loadProjects()}>
            刷新项目
          </Button>
          <Button icon={<PlusOutlined />} size="large" onClick={() => scanProjects()}>
            扫描项目
          </Button>
        </div>
      </div>

      {/* 项目分类 */}
      <div className="categories-section">
        <h2 className="section-title">项目分类</h2>
        <div className="categories-grid">
          {projectCategories.map(category => (
            <div key={category.type} className="category-card">
              <div className="category-icon" style={{ color: category.color }}>
                {category.icon}
              </div>
              <div className="category-info">
                <h3 className="category-name">{category.name}</h3>
                <span className="category-count">{category.count} 个项目</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 最近项目列表 */}
      <div className="recent-projects-section">
        <div className="section-header">
          <h2 className="section-title">最近项目</h2>
          <div className="section-actions">
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => loadProjects()}
              className="action-button"
            >
              刷新
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => scanProjects()}
              className="action-button"
            >
              扫描项目
            </Button>
          </div>
        </div>
        <div className="projects-list">
          {isLoading ? (
            <div className="loading-container">
              <Spin size="large" />
              <p>加载项目中...</p>
            </div>
          ) : (
            recentProjects.map((project) => (
              <div key={project.name} className="project-item">
                <div className="project-avatar">
                  <Avatar icon={<FolderOpenOutlined />} size="large" />
                </div>
                <div className="project-content">
                  <div className="project-header">
                    <h3 className="project-name">{project.name}</h3>
                    {project.status && (
                      <div className="project-status">
                        {project.status.added > 0 && <Tag color="green">+{project.status.added}</Tag>}
                        {project.status.modified > 0 && <Tag color="blue">~{project.status.modified}</Tag>}
                        {project.status.deleted > 0 && <Tag color="red">-{project.status.deleted}</Tag>}
                      </div>
                    )}
                  </div>
                  <div className="project-meta">
                    <div className="project-path">路径: {project.path}</div>
                    <div className="project-commit-info">
                      {project.lastCommitTime && (
                        <span className="project-commit-time">最后提交: {formatRelativeTime(project.lastCommitTime)}</span>
                      )}
                      {project.branch && (
                        <Tag color="purple" style={{ marginLeft: '8px' }}>
                          {project.branch}
                        </Tag>
                      )}
                      {project.status && (project.status.modified > 0 || project.status.added > 0 || project.status.deleted > 0) && (
                        <span className="project-changes" style={{ marginLeft: '8px', color: '#666' }}>
                          改动: {project.status.modified + project.status.added + project.status.deleted} 个文件
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="project-actions">
                  <div className="action-buttons">
                    <Button
                      size="small"
                      icon={<DownOutlined />}
                      onClick={() => handleGitPull(project.name)}
                      loading={projectGitStatus.get(project.name)?.operation === 'pull' && projectGitStatus.get(project.name)?.status === 'running'}
                      className="action-button-small"
                    >
                      拉取
                    </Button>
                    <Button
                      size="small"
                      icon={<UpOutlined />}
                      onClick={() => handleGitPush(project.name)}
                      loading={projectGitStatus.get(project.name)?.operation === 'push' && projectGitStatus.get(project.name)?.status === 'running'}
                      className="action-button-small"
                    >
                      推送
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<BuildOutlined />}
                      onClick={() => handleBuild(project.name)}
                      className="action-button-small"
                    >
                      构建
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CloudUploadOutlined />}
                      onClick={() => handleUpload(project.name)}
                      className="action-button-small"
                    >
                      上传
                    </Button>
                  </div>
                  {projectGitStatus.has(project.name) && (
                    <div className="git-status" style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                      {projectGitStatus.get(project.name)?.message}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <Modal
        title="选择构建渠道"
        open={buildModalVisible}
        onCancel={() => setBuildModalVisible(false)}
        footer={null}
        className="custom-modal"
      >
        <div className="modal-content">
          <div className="modal-label">
            <Text>选择构建渠道:</Text>
          </div>
          <Select
            className="modal-select"
            placeholder="选择渠道"
            value={selectedChannel}
            onChange={(value) => setSelectedChannel(value)}
          >
            {channels && channels.channels && Object.entries(channels.channels).map(([channelId, channel]: [string, any]) => (
              <Option key={channelId} value={channelId}>
                {channel.name}
              </Option>
            ))}
          </Select>
          <div className="modal-actions">
            <Button onClick={() => setBuildModalVisible(false)} className="cancel-button">
              取消
            </Button>
            <Button
              type="primary"
              onClick={() => executeBuildOnly(selectedChannel!)}
              disabled={!selectedChannel}
              className="primary-button"
            >
              开始构建
            </Button>
          </div>
        </div>
      </Modal>

      {/* 多渠道上传模态框 */}
      <Modal
        title="选择渠道和环境"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        className="custom-modal"
      >
        <div className="modal-content">
          <div className="modal-label">
            <Text>选择渠道:</Text>
          </div>
          <Select
            className="modal-select"
            placeholder="选择渠道"
            value={selectedChannel}
            onChange={(value) => setSelectedChannel(value)}
          >
            {channels && channels.channels && Object.entries(channels.channels).map(([channelId, channel]: [string, any]) => (
              <Option key={channelId} value={channelId}>
                {channel.name}
              </Option>
            ))}
          </Select>
          <div className="modal-label" style={{ marginTop: '16px' }}>
            <Text>选择上传环境:</Text>
          </div>
          <Select
            className="modal-select"
            placeholder="选择环境"
            value={selectedEnv}
            onChange={(value) => setSelectedEnv(value)}
          >
            <Option value="dev">开发环境</Option>
            <Option value="prod">生产环境</Option>
          </Select>
          <div className="modal-actions">
            <Button onClick={() => setUploadModalVisible(false)} className="cancel-button">
              取消
            </Button>
            <Button
              type="primary"
              onClick={() => executeBuild(selectedChannel!, selectedEnv)}
              disabled={!selectedChannel}
              className="primary-button"
            >
              开始构建并上传
            </Button>
          </div>
        </div>
      </Modal>

      {/* 简单上传模态框 */}
      <Modal
        title="选择上传环境"
        open={simpleUploadModalVisible}
        onCancel={() => setSimpleUploadModalVisible(false)}
        footer={null}
        className="custom-modal"
      >
        <div className="modal-content">
          <div className="modal-label">
            <Text>选择上传环境:</Text>
          </div>
          <Select
            className="modal-select"
            placeholder="选择环境"
            value={selectedEnv}
            onChange={(value) => setSelectedEnv(value)}
          >
            <Option value="dev">开发环境</Option>
            <Option value="prod">生产环境</Option>
          </Select>
          <div className="modal-actions">
            <Button onClick={() => setSimpleUploadModalVisible(false)} className="cancel-button">
              取消
            </Button>
            <Button
              type="primary"
              onClick={() => executeSimpleUpload(selectedEnv)}
              className="primary-button"
            >
              开始上传
            </Button>
          </div>
        </div>
      </Modal>

      {/* 进度模态框 */}
      <Modal
        title={progressTitle}
        open={progressModalVisible}
        footer={null}
        closable={false}
        width={800}
        className="progress-modal"
      >
        <div className="progress-content">
          <div className="progress-bar">
            <Progress percent={progressPercent} status={progressPercent === 100 ? 'success' : 'active'} />
          </div>
          <div className="progress-text">
            <Text>{progressText}</Text>
          </div>
          <div
            ref={logsRef}
            className="logs-container"
          >
            {progressLogs.map((log, index) => (
              <div key={index} className="log-line">{log}</div>
            ))}
            {Array.from(fileUploadStatus.entries()).map(([file, status]) => (
              <div
                key={file}
                className={`file-status ${status.status === 'failed' ? 'failed' : status.status === 'uploaded' ? 'uploaded' : 'uploading'}`}
              >
                {status.message}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Projects;

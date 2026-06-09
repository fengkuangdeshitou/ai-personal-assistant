import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Button, Avatar, Typography,
  Tag, message, Modal, Select, Progress, Spin, Alert
} from 'antd';
import {
  FolderOpenOutlined,
  SettingOutlined,
  MobileOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  PlusOutlined,
  PullRequestOutlined,
  ExportOutlined,
  ToolOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useProjects, useOSSConfig } from '../api';
import { getApiBaseUrl } from '../utils/api';
import './Projects.css';

interface ProjectMeta {
  lastCommitTime?: string;
  branch?: string;
  status?: { modified: number; added: number; deleted: number; isClean?: boolean };
  loading?: boolean;
}

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
  const { projects, isLoading, error, loadProjects, scanProjects } = useProjects();
  const { channels, loadOSSConfig } = useOSSConfig();
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [buildModalVisible, setBuildModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [simpleUploadModalVisible, setSimpleUploadModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [progressTitle, setProgressTitle] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [fileUploadStatus, setFileUploadStatus] = useState<Map<string, { status: 'uploading' | 'uploaded' | 'failed', message: string }>>(new Map());
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>(undefined);
  const [selectedEnv, setSelectedEnv] = useState<'dev' | 'prod'>('dev');
  const [selectedType, setSelectedType] = useState<'box' | 'ios' | 'other'>('box');
  const [projectGitStatus, setProjectGitStatus] = useState<Map<string, { operation: 'pull' | 'push' | null, progress: number, status: 'idle' | 'running' | 'success' | 'error', message: string }>>(new Map());
  // 懒加载 git 元信息（branch / lastCommitTime / status），不阻塞列表显示
  const [projectMeta, setProjectMeta] = useState<Map<string, ProjectMeta>>(new Map());
  const metaFetchedPaths = useRef<Set<string>>(new Set());

  const fetchProjectMeta = useCallback(async (projectPath: string) => {
    if (metaFetchedPaths.current.has(projectPath)) return;
    metaFetchedPaths.current.add(projectPath);
    setProjectMeta(prev => new Map(prev.set(projectPath, { loading: true })));
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/project-meta?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      if (data.success) {
        setProjectMeta(prev => new Map(prev.set(projectPath, {
          lastCommitTime: data.lastCommitTime,
          branch: data.branch,
          status: data.status,
          loading: false,
        })));
      } else {
        setProjectMeta(prev => new Map(prev.set(projectPath, { loading: false })));
      }
    } catch {
      setProjectMeta(prev => new Map(prev.set(projectPath, { loading: false })));
    }
  }, []);

  // 移除uploadAsZip状态，直接使用压缩上传作为默认行为

  // 日志区域自动滚动
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [progressLogs, fileUploadStatus]);

  // 项目分类数据
  const activeProjects = projects.filter(p => p.active);
  const projectCategories = [
    { type: 'box', name: 'React项目', count: activeProjects.filter(p => p.type === 'box').length, icon: <SettingOutlined />, color: '#52c41a' },
    { type: 'ios', name: 'iOS项目', count: activeProjects.filter(p => p.type === 'ios').length, icon: <MobileOutlined />, color: '#fa8c16' },
    { type: 'other', name: '其他项目', count: activeProjects.filter(p => p.type === 'other').length, icon: <ToolOutlined />, color: '#722ed1' }
  ];

  useEffect(() => {
    if (projects && projects.length > 0) {
      const baseFiltered = projects.filter((p: any) => p.active);
      const filtered = baseFiltered.filter((p: any) => p.type === selectedType);

      // 不依赖 lastCommitTime 排序（该字段现在由懒加载填充），直接取前 6 个
      setRecentProjects(filtered.slice(0, 6));

      // 列表渲染后依次懒加载每个可见项目的 git 元信息（串行，避免并发打爆后端）
      let delay = 0;
      for (const p of filtered.slice(0, 6)) {
        const path = (p as any).path;
        if (!metaFetchedPaths.current.has(path)) {
          setTimeout(() => fetchProjectMeta(path), delay);
          delay += 300; // 每个项目间隔 300ms，避免同时发出
        }
      }
    } else {
      setRecentProjects([]);
    }
  }, [projects, selectedType, fetchProjectMeta]);

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
    setProgressTitle(`拉取项目: ${projectName}`);
    setProgressPercent(0);
    setProgressText('正在拉取...');
    setProgressLogs([]);
    setProgressModalVisible(true);

    try {
      // 使用流式API
      const pullUrl = `${getApiBaseUrl()}/api/git/pull-stream?path=${encodeURIComponent(project.path)}`;
      const pullEventSource = new EventSource(pullUrl);

      await new Promise<void>((resolve, reject) => {
        pullEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);

            if (data.type === 'start') {
              setProgressText(data.message);
            } else if (data.type === 'command') {
              setProgressText(`${data.command}: ${data.message}`);
            } else if (data.type === 'info') {
              setProgressText(data.message);
            } else if (data.type === 'complete') {
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
              loadProjects();
              pullEventSource.close();
              resolve();
            } else if (data.type === 'error') {
              setProgressText('❌ 拉取失败');
              setProjectGitStatus(prev => new Map(prev.set(projectName, {
                operation: 'pull',
                progress: 0,
                status: 'error',
                message: '❌ 拉取失败'
              })));
              message.error(`❌ 拉取失败: ${data.message}`);
              pullEventSource.close();
              reject(new Error(data.message));
            }
          } catch (e) {
            console.error('解析拉取SSE数据失败:', e);
          }
        };

        pullEventSource.onerror = (error) => {
          console.error('拉取EventSource错误:', error);
          setProgressText('❌ 拉取连接失败');
          message.error('❌ 拉取连接失败');
          pullEventSource.close();
          reject(new Error('拉取连接失败'));
        };

        // 设置超时
        setTimeout(() => {
          pullEventSource.close();
          reject(new Error('拉取超时'));
        }, 120000); // 2分钟超时
      });
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
    setProgressTitle(`推送项目: ${projectName}`);
    setProgressPercent(0);
    setProgressText('正在推送...');
    setProgressLogs([]);
    setProgressModalVisible(true);

    try {
      // 使用流式API
      const pushUrl = `${getApiBaseUrl()}/api/git/push-stream?path=${encodeURIComponent(project.path)}`;
      const pushEventSource = new EventSource(pushUrl);

      await new Promise<void>((resolve, reject) => {
        pushEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);

            if (data.type === 'start') {
              setProgressText(data.message);
            } else if (data.type === 'command') {
              setProgressText(`${data.command}: ${data.message}`);
            } else if (data.type === 'info') {
              setProgressText(data.message);
            } else if (data.type === 'complete') {
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
              loadProjects();
              pushEventSource.close();
              resolve();
            } else if (data.type === 'error') {
              setProgressText('❌ 推送失败');
              setProjectGitStatus(prev => new Map(prev.set(projectName, {
                operation: 'push',
                progress: 0,
                status: 'error',
                message: '❌ 推送失败'
              })));
              message.error(`❌ 推送失败: ${data.message}`);
              pushEventSource.close();
              reject(new Error(data.message));
            }
          } catch (e) {
            console.error('解析推送SSE数据失败:', e);
          }
        };

        pushEventSource.onerror = (error) => {
          console.error('推送EventSource错误:', error);
          setProgressText('❌ 推送连接失败');
          message.error('❌ 推送连接失败');
          pushEventSource.close();
          reject(new Error('推送连接失败'));
        };

        // 设置超时
        setTimeout(() => {
          pushEventSource.close();
          reject(new Error('推送超时'));
        }, 120000); // 2分钟超时
      });
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

      const response = await fetch(`${getApiBaseUrl()}/api/build-stream?${params}`, {
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
    setUploadModalVisible(false); // 关闭上传模态框
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

      const response = await fetch(`${getApiBaseUrl()}/api/build-stream?${params}`, {
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
      const buildUrl = `${getApiBaseUrl()}/api/build-stream?projectName=${encodeURIComponent(selectedProject)}`;
      const buildEventSource = new EventSource(buildUrl);

      let buildSuccess = false;

      await new Promise<void>((resolve, reject) => {
        buildEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setProgressLogs(prev => [...prev, data.message]);

            if (data.type === 'log' || data.type === 'stdout') {
              setProgressText(data.message);
            } else if (data.type === 'stderr') {
              setProgressText(`⚠️ ${data.message}`);
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
      const normalUploadUrl = `${getApiBaseUrl()}/api/upload-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=default&env=${env}`;
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
              
              // 单渠道生产环境额外执行压缩包备份
              if (env === 'prod') {
                // 不在这里等待备份完成，而是启动备份并在完成后关闭模态框
                executeBackup('default', env, project, () => {
                  // 弹框关闭现在在executeBackup内部处理
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
    } catch (error: any) {
      setProgressText('❌ 操作失败');
      message.error(`❌ 操作失败: ${error.message}`);
      setTimeout(() => setProgressModalVisible(false), 3000);
    }
  };

  const executeBackup = async (channelId: string, env: 'dev' | 'prod', project: any, onComplete: () => void) => {
    setProgressPercent(0); // 从0%重新开始备份进度
    setFileUploadStatus(new Map()); // 清空文件状态

    const backupUploadUrl = `${getApiBaseUrl()}/api/upload-zip-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=${encodeURIComponent(channelId)}&env=${env}&isBackup=true`;
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
          setProgressPercent(100); // 压缩完成，设为100%
        } else if (data.type === 'bucket_start') {
          setProgressText(`${data.bucketIndex}/${data.totalBuckets}: ${data.message}`);
          setProgressPercent(0); // 上传阶段重新从0开始
        } else if (data.type === 'uploading') {
          setProgressText(`正在备份到 ${data.bucket}...`);
          setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploading', message: '正在备份...' })));
          // 上传阶段独立0-100%进度
          setProgressPercent(data.globalProgress || 0);
        } else if (data.type === 'uploaded') {
          setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'uploaded', message: '✅ 备份成功' })));
          setProgressPercent(data.globalProgress || 0);
        } else if (data.type === 'failed') {
          setFileUploadStatus(prev => new Map(prev.set(data.file, { status: 'failed', message: `❌ 备份失败: ${data.error}` })));
          setProgressPercent(data.globalProgress || 0);
        } else if (data.type === 'bucket_complete') {
          setProgressText(`${data.bucket} 备份完成 (${data.bucketIndex}/${data.totalBuckets})`);
          setProgressPercent(100); // 每个bucket完成设为100%
        } else if (data.type === 'complete') {
          setProgressPercent(100);
          setProgressText('🎉 生产环境部署完成！正在执行部署后任务...');
          message.success(`🎉 生产环境部署完成: ${selectedProject}`);
          // 不要立即关闭EventSource，等待部署后任务完成
        } else if (data.type === 'post_deployment_start') {
          setProgressText(data.message);
          setProgressPercent(0); // 部署后任务阶段重新从0开始
          setProgressLogs(prev => [...prev, `🚀 ${data.message}`]);
        } else if (data.type === 'post_deployment_task') {
          setProgressText(`${data.task}: ${data.status === 'running' ? '运行中...' : '已完成'}`);
          setProgressLogs(prev => [...prev, `${data.status === 'running' ? '▶️' : '✅'} ${data.task}: ${data.status === 'running' ? '运行中...' : '已完成'}`]);
          // 每个部署后任务都有独立的0-100%进度
          if (data.status === 'running') {
            setProgressPercent(0); // 任务开始时重置为0
            // 模拟任务进度：开始后逐步增加
            let progress = 0;
            const progressInterval = setInterval(() => {
              progress += Math.random() * 15 + 5; // 随机增加5-20%
              if (progress >= 90) {
                progress = 90; // 最多到90%，等待完成
                clearInterval(progressInterval);
              }
              setProgressPercent(Math.round(progress));
            }, 500); // 每500ms更新一次

            // 存储interval ID以便清理
            (window as any).currentTaskInterval = progressInterval;
          } else if (data.status === 'completed') {
            // 清理之前的interval
            if ((window as any).currentTaskInterval) {
              clearInterval((window as any).currentTaskInterval);
              (window as any).currentTaskInterval = null;
            }
            setProgressPercent(100); // 任务完成设为100%
          }
        } else if (data.type === 'post_deployment_complete') {
          // 清理之前的interval
          if ((window as any).currentTaskInterval) {
            clearInterval((window as any).currentTaskInterval);
            (window as any).currentTaskInterval = null;
          }
          setProgressPercent(100);
          setProgressText('✅ 部署后任务执行完成');
          setProgressLogs(prev => [...prev, `✅ 所有部署后任务执行完成`]);
          message.success(data.message);
          // 所有任务完成后关闭连接
          backupEventSource.close();
          setTimeout(() => setProgressModalVisible(false), 4000);
          onComplete();
        } else if (data.type === 'post_deployment_failed') {
          // 清理之前的interval
          if ((window as any).currentTaskInterval) {
            clearInterval((window as any).currentTaskInterval);
            (window as any).currentTaskInterval = null;
          }
          setProgressPercent(100);
          setProgressText(`❌ 部署后任务失败: ${data.message}`);
          setProgressLogs(prev => [...prev, `❌ 部署后任务失败: ${data.message}`]);
          message.error(data.message);
          backupEventSource.close();
          setTimeout(() => setProgressModalVisible(false), 3000);
          onComplete();
        } else if (data.type === 'post_deployment_error') {
          // 清理之前的interval
          if ((window as any).currentTaskInterval) {
            clearInterval((window as any).currentTaskInterval);
            (window as any).currentTaskInterval = null;
          }
          setProgressPercent(100);
          setProgressText(`❌ 部署后任务执行出错: ${data.message}`);
          message.error(data.message);
          backupEventSource.close();
          setTimeout(() => setProgressModalVisible(false), 3000);
          onComplete();
        } else if (data.type === 'cdn_refresh_start') {
          setProgressText(data.message);
        } else if (data.type === 'cdn_refresh_domains') {
          setProgressText(`发现 ${data.count} 个CDN域名待刷新`);
        } else if (data.type === 'cdn_refresh_domain') {
          if (data.status === 'starting') {
            setProgressText(`开始刷新CDN域名: ${data.domain}`);
          } else if (data.status === 'success') {
            setProgressText(`✅ CDN域名 ${data.domain} 刷新成功`);
          } else if (data.status === 'failed') {
            setProgressText(`❌ CDN域名 ${data.domain} 刷新失败: ${data.error}`);
          } else if (data.status === 'error') {
            setProgressText(`❌ CDN域名 ${data.domain} 刷新出错: ${data.error}`);
          }
        } else if (data.type === 'cdn_refresh_complete') {
          setProgressText(`✅ CDN缓存刷新完成 - 成功: ${data.success}/${data.total}`);
          setProgressLogs(prev => [...prev, `✅ CDN缓存刷新完成 - 成功: ${data.success}/${data.total} 个域名`]);
          message.success(`CDN刷新完成: ${data.success}/${data.total} 个域名`);
        } else if (data.type === 'cdn_refresh_error') {
          setProgressText(`❌ CDN缓存刷新失败: ${data.error}`);
          setProgressLogs(prev => [...prev, `❌ CDN缓存刷新失败: ${data.error}`]);
          message.error(`CDN刷新失败: ${data.error}`);
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
      const uploadUrl = `${getApiBaseUrl()}/api/upload-stream?projectName=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(project.path)}&channelId=${encodeURIComponent(channelId)}&env=${env}`;
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
                  // 弹框关闭现在在executeBackup内部处理
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
            <div 
              key={category.type} 
              className={`category-card ${selectedType === category.type ? 'active' : ''}`}
              onClick={() => setSelectedType(category.type as any)}
              style={{ cursor: 'pointer' }}
            >
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
          {error ? (
            <div className="error-container">
              <Alert
                message="加载项目失败"
                description={error}
                type="error"
                showIcon
                action={
                  <Button size="small" onClick={() => loadProjects()}>
                    重试
                  </Button>
                }
              />
            </div>
          ) : isLoading ? (
            <div className="loading-container">
              <Spin size="large" />
              <p>加载项目中...</p>
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="empty-container">
              <p>暂无项目数据</p>
              <Button onClick={() => loadProjects()}>刷新项目</Button>
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
                  </div>
                  <div className="project-meta">
                    <div className="project-path">路径: {project.path}</div>
                    <div className="project-commit-info">
                      {(() => {
                        const meta = projectMeta.get((project as any).path);
                        if (meta?.loading) {
                          return <LoadingOutlined style={{ color: '#aaa', fontSize: 12, marginRight: 6 }} />;
                        }
                        const lastCommitTime = meta?.lastCommitTime || (project as any).lastCommitTime;
                        const branch = meta?.branch || (project as any).branch;
                        const status = meta?.status || (project as any).status;
                        return (
                          <>
                            {lastCommitTime && (
                              <span className="project-commit-time">最后提交: {formatRelativeTime(lastCommitTime)}</span>
                            )}
                            {branch && branch !== 'unknown' && (
                              <Tag color="purple" style={{ marginLeft: '8px' }}>{branch}</Tag>
                            )}
                            {status && (status.modified > 0 || status.added > 0 || status.deleted > 0) && (
                              <span className="project-changes" style={{ marginLeft: '8px' }}>
                                改动: <span className="change-count">{status.modified + status.added + status.deleted}</span> 个文件
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="project-actions">
                  <div className="action-buttons">
                    <Button
                      size="middle"
                      icon={<PullRequestOutlined />}
                      onClick={() => handleGitPull(project.name)}
                      loading={projectGitStatus.get(project.name)?.operation === 'pull' && projectGitStatus.get(project.name)?.status === 'running'}
                      className="action-button pull-button"
                    >
                      拉取
                    </Button>
                    <Button
                      size="middle"
                      icon={<ExportOutlined />}
                      onClick={() => handleGitPush(project.name)}
                      loading={projectGitStatus.get(project.name)?.operation === 'push' && projectGitStatus.get(project.name)?.status === 'running'}
                      className="action-button push-button"
                    >
                      推送
                    </Button>
                    <Button
                      size="middle"
                      icon={<ToolOutlined />}
                      onClick={() => handleBuild(project.name)}
                      className="action-button build-button"
                    >
                      构建
                    </Button>
                    <Button
                      size="middle"
                      icon={<CloudUploadOutlined />}
                      onClick={() => handleUpload(project.name)}
                      className="action-button upload-button"
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
              开始构建并上传
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

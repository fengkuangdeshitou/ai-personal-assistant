import { useState, useEffect, useCallback } from 'react';
import { projectApi, ossApi } from './client';
export const useProjects = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    console.log('Loading projects...');
    setIsLoading(true);
    setError(null);

    try {
      const response = await projectApi.getProjects();
      console.log('API response:', response);
      if (response.success) {
        console.log('Setting projects:', response.message?.length || 0, 'projects');
        setProjects(response.message || []);
      } else {
        setError(response.error || '加载项目失败');
      }
    } catch (err: any) {
      console.error('Load projects error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scanProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await projectApi.scanProjects();
      if (response.success) {
        await loadProjects(); // 重新加载项目列表
      } else {
        setError(response.error || '扫描项目失败');
      }
    } catch (err: any) {
      console.error('Scan projects error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, [loadProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    isLoading,
    error,
    loadProjects,
    scanProjects,
  };
};

// OSS配置Hook
export const useOSSConfig = () => {
  const [ossConfig, setOSSConfig] = useState<any>(null);
  const [channels, setChannels] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjectBuckets = useCallback(async (projectName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await ossApi.getProjectBuckets(projectName);
      // 后端直接返回数据，不使用 success/message 包装
      setOSSConfig(response);
      return response;
    } catch (err: any) {
      console.error('Load OSS config error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
      setOSSConfig(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadProjectChannels = useCallback(async (projectName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await ossApi.getProjectChannels(projectName);
      // 后端直接返回 { channels } 格式，不使用 success/message 包装
      setChannels(response);
      return response;
    } catch (err: any) {
      console.error('Load channels error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
      setChannels({ channels: {} }); // 设置默认值
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOSSConfig = useCallback(async (projectName: string): Promise<{ossConfig: any, channels: any}> => {
    // 同时加载buckets和channels配置，并返回结果
    const [bucketsResult, channelsResult] = await Promise.all([
      loadProjectBuckets(projectName),
      loadProjectChannels(projectName)
    ]);
    
    return {
      ossConfig: bucketsResult,
      channels: channelsResult
    };
  }, [loadProjectBuckets, loadProjectChannels]);

  return {
    ossConfig,
    channels,
    isLoading,
    error,
    loadOSSConfig,
    loadProjectBuckets,
    loadProjectChannels,
  };
};
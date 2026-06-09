import { useState, useEffect, useCallback } from 'react';
import { projectApi, ossApi } from './client';

let projectsInFlight: Promise<any[]> | null = null;
let projectsCacheAt = 0;
let projectsCacheData: any[] = [];

export const useProjects = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    const now = Date.now();
    // StrictMode 下首屏会重复触发 effect，5 秒内直接复用缓存避免重复请求
    if (projectsCacheData.length > 0 && now - projectsCacheAt < 5000) {
      setProjects(projectsCacheData);
      return;
    }
    if (projectsInFlight) {
      const data = await projectsInFlight;
      setProjects(data);
      return;
    }

    console.log('Loading projects...');
    setIsLoading(true);
    setError(null);

    try {
      projectsInFlight = (async () => {
        let response;
        try {
          response = await projectApi.getProjects();
        } catch (e: any) {
          // 后端偶发瞬时阻塞时，自动重试一次，避免页面直接报 timeout
          if (e?.code === 'ECONNABORTED' || String(e?.message || '').includes('timeout')) {
            response = await projectApi.getProjects();
          } else {
            throw e;
          }
        }
        console.log('API response:', response);
        if (!response.success) {
          throw new Error(response.error || '加载项目失败');
        }
        return Array.isArray(response.message) ? response.message : [];
      })();

      const data = await projectsInFlight;
      projectsCacheData = data;
      projectsCacheAt = Date.now();
      console.log('Setting projects:', data.length, 'projects');
      setProjects(data);
    } catch (err: any) {
      console.error('Load projects error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      projectsInFlight = null;
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
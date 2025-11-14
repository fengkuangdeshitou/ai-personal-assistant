import { useState, useEffect, useCallback } from 'react';
import { chatApi, projectApi, ossApi, ChatMessage, SendMessageRequest, ApiResponse } from './client';

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string, model?: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadHistory: (limit?: number) => Promise<void>;
}

// 聊天Hook
export const useChat = (): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 发送消息
  const sendMessage = useCallback(async (message: string, model = 'gpt-3.5-turbo') => {
    if (!message.trim()) {
      setError('消息不能为空');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const request: SendMessageRequest = { message: message.trim(), model };
      const response: ApiResponse<ChatMessage> = await chatApi.sendMessage(request);

      if (response.success && response.history) {
        setMessages(response.history);
      } else {
        setError(response.error || '发送消息失败');
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 清空历史
  const clearHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response: ApiResponse = await chatApi.clearHistory();
      if (response.success) {
        setMessages([]);
      } else {
        setError(response.error || '清空历史失败');
      }
    } catch (err: any) {
      console.error('Clear history error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 加载历史
  const loadHistory = useCallback(async (limit = 50) => {
    setIsLoading(true);
    setError(null);

    try {
      const response: ApiResponse<ChatMessage[]> = await chatApi.getHistory(limit);
      if (response.success && response.history) {
        setMessages(response.history);
      } else {
        setError(response.error || '加载历史失败');
      }
    } catch (err: any) {
      console.error('Load history error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 组件挂载时加载历史
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
    loadHistory,
  };
};

// 项目管理Hook
export const useProjects = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await projectApi.getProjects();
      if (response.success) {
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
    } catch (err: any) {
      console.error('Load OSS config error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
      setOSSConfig(null);
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
    } catch (err: any) {
      console.error('Load channels error:', err);
      setError(err.response?.data?.error || err.message || '网络错误');
      setChannels({ channels: {} }); // 设置默认值
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOSSConfig = useCallback(async (projectName: string) => {
    // 同时加载buckets和channels配置
    await Promise.all([
      loadProjectBuckets(projectName),
      loadProjectChannels(projectName)
    ]);
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
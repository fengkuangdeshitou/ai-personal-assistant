import axios, { AxiosInstance, AxiosResponse } from 'axios';

// API响应接口
export interface ApiResponse<T = any> {
  success?: boolean;
  ok?: boolean;
  message?: T;
  error?: string;
  history?: ChatMessage[];
}

// 聊天消息接口
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// 发送消息请求接口
export interface SendMessageRequest {
  message: string;
  model?: string;
}

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5178',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config: any) => {
    // 可以在这里添加认证token等
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error: any) => {
    console.error('API Error:', error);
    if (error.response) {
      // 服务器返回了错误状态码
      console.error('Response Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // 请求发送了但没有收到响应
      console.error('Request Error: No response received');
    } else {
      // 其他错误
      console.error('Request Setup Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// API方法
export const chatApi = {
  // 发送聊天消息
  sendMessage: async (data: SendMessageRequest): Promise<ApiResponse<ChatMessage>> => {
    const response = await api.post('/api/chat/send', data);
    return response.data;
  },

  // 获取聊天历史
  getHistory: async (limit?: number): Promise<ApiResponse<ChatMessage[]>> => {
    const params = limit ? { limit } : {};
    const response = await api.get('/api/chat/history', { params });
    return response.data;
  },

  // 清空聊天历史
  clearHistory: async (): Promise<ApiResponse> => {
    const response = await api.delete('/api/chat/clear');
    return response.data;
  },
};

// 项目管理API
export const projectApi = {
  // 获取项目列表
  getProjects: async (): Promise<ApiResponse> => {
    const response = await api.get('/api/projects');
    return response.data;
  },

  // 扫描项目
  scanProjects: async (): Promise<ApiResponse> => {
    const response = await api.post('/api/projects/scan');
    return response.data;
  },
};

// Git操作API
export const gitApi = {
  // 获取Git统计信息
  getStats: async (projectPath: string): Promise<ApiResponse> => {
    const response = await api.get('/api/git/stats', {
      params: { projectPath }
    });
    return response.data;
  },

  // 获取提交历史
  getCommits: async (projectPath: string, limit = 10): Promise<ApiResponse> => {
    const response = await api.get('/api/git/commits', {
      params: { projectPath, limit }
    });
    return response.data;
  },

  // Git Pull
  pull: async (path: string): Promise<ApiResponse> => {
    const response = await api.post('/api/git/pull', { path });
    return response.data;
  },

  // Git Push
  push: async (path: string, message?: string): Promise<ApiResponse> => {
    const response = await api.post('/api/git/push', { path, message });
    return response.data;
  },
};

// 构建API
export const buildApi = {
  // 构建项目
  build: async (projectPath: string): Promise<ApiResponse> => {
    const response = await api.post('/api/build', { projectPath });
    return response.data;
  },

  // 流式构建项目
  buildStream: async (projectName: string, channel?: string): Promise<Response> => {
    const response = await api.post('/api/build-stream', { projectName, channel }, {
      responseType: 'stream'
    });
    return response.data;
  },

  // 清空构建目录
  clearBuild: async (projectPath: string): Promise<ApiResponse> => {
    const response = await api.post('/api/build/clear', { projectPath });
    return response.data;
  },
};

// OSS上传API
export const ossApi = {
  // 上传文件
  upload: async (formData: FormData): Promise<ApiResponse> => {
    const response = await api.post('/api/oss/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 流式上传到OSS
  uploadStream: async (projectName: string, path: string, channelId: string, env: string): Promise<Response> => {
    const response = await api.post('/api/upload-stream', { projectName, path, channelId, env }, {
      responseType: 'stream'
    });
    return response.data;
  },

  // 获取OSS bucket信息
  getBucketInfo: async (projectName: string, channelId: string, env: string): Promise<ApiResponse> => {
    const response = await api.post('/api/oss/get-bucket-info', { projectName, channelId, env });
    return response.data;
  },

  // 获取项目的OSS配置
  getProjectBuckets: async (projectName: string): Promise<ApiResponse> => {
    const response = await api.get(`/api/project-buckets/${projectName}`);
    return response.data;
  },

  // 获取项目的渠道配置
  getProjectChannels: async (projectName: string): Promise<ApiResponse> => {
    const response = await api.get(`/api/channels/${projectName}`);
    return response.data;
  },
};

export default api;
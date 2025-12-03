import React, { useState, useEffect, useRef } from 'react';
import { Upload, Button, Card, Progress, message, List, Table, Modal, Steps, Alert, Switch, Space, Tooltip, Tag } from 'antd';
import { FileProtectOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DownloadOutlined, InboxOutlined, LoadingOutlined, LockOutlined, SafetyOutlined, SecurityScanOutlined, FileTextOutlined, CloudServerOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';
import './ApkHardening.css';

const { Step } = Steps;

const ApkHardening: React.FC = () => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [hardeningProgress, setHardeningProgress] = useState(0);
  const [isHardening, setIsHardening] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [currentLog, setCurrentLog] = useState<{ fileName: string; content: string } | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hardeningSteps, setHardeningSteps] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const stepsContainerRef = useRef<HTMLDivElement>(null);
  
  // 自动滚动到当前步骤
  const scrollToCurrentStep = (stepIndex: number) => {
    setTimeout(() => {
      if (stepsContainerRef.current) {
        const stepElements = stepsContainerRef.current.querySelectorAll('.ant-steps-item');
        if (stepElements[stepIndex]) {
          stepElements[stepIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }
    }, 100);
  };

  // 获取历史记录
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/apk/history`);
      const result = await response.json();
      if (result.success) {
        setHistoryList(result.data);
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  };
  const connectWebSocket = (sessionId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = getApiBaseUrl().replace(/^http/, 'ws').replace(':5178', ':5179');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setSessionId(sessionId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received progress:', data);

        if (data.sessionId === sessionId) {
          handleProgressUpdate(data);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };


  // 处理进度更新 - 完全匹配后端步骤顺序
  const handleProgressUpdate = (data: any) => {
    const { step, progress, overallProgress, message: stepMessage, status, error } = data;

    console.log('[APK加固进度]', { step, progress, overallProgress, message: stepMessage, currentStepsCount: hardeningSteps.length });

    // 更新整体进度 - 处理字符串和数字类型
    if (overallProgress !== undefined && overallProgress !== null) {
      const progressValue = typeof overallProgress === 'string' ? parseFloat(overallProgress) : overallProgress;
      setHardeningProgress(Math.min(Math.round(progressValue), 100));
    } else if (progress !== undefined && progress !== null) {
      // 如果没有overallProgress，尝试使用progress
      const progressValue = typeof progress === 'string' ? parseFloat(progress) : progress;
      if (!isNaN(progressValue)) {
        setHardeningProgress(Math.min(Math.round(progressValue), 100));
      }
    }

    if (step === 'start') {
      const startStep: any = {
        title: '准备开始',
        description: stepMessage || '正在初始化加固流程...',
        status: 'process'
      };
      
      setHardeningSteps([startStep]);
      setCurrentStep(0);
    } else if (step === 'decompile') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 1) {
          newSteps[0].status = 'finish';
          newSteps.push({
            title: '反编译APK',
            description: stepMessage || '正在反编译APK文件...',
            status: 'process'
          });
        } else if (newSteps.length >= 2) {
          newSteps[1] = newSteps[1] || {};
          newSteps[1].title = '反编译APK';
          newSteps[1].description = stepMessage || '正在反编译APK文件...';
          newSteps[1].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(1);
      scrollToCurrentStep(1);
    } else if (step === 'obfuscate') {
      // Smali代码混淆步骤 - 持续更新描述
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        
        // 确保有初始步骤
        if (newSteps.length === 0) {
          newSteps.push({
            title: 'Smali代码混淆',
            description: stepMessage || '正在混淆代码...',
            status: 'process'
          });
        } else {
          // 更新当前步骤或添加新步骤
          const lastStep = newSteps[newSteps.length - 1];
          
          if (lastStep.title === 'Smali代码混淆') {
            // 更新现有混淆步骤的描述
            lastStep.description = stepMessage || '正在混淆代码...';
            lastStep.status = 'process';
          } else {
            // 标记上一步完成，添加混淆步骤
            lastStep.status = 'finish';
            newSteps.push({
              title: 'Smali代码混淆',
              description: stepMessage || '正在混淆代码...',
              status: 'process'
            });
          }
        }
        
        return newSteps;
      });
      const currentIdx = Math.max(0, hardeningSteps.length - 1);
      setCurrentStep(currentIdx);
      scrollToCurrentStep(currentIdx);
    } else if (step === 'encrypt') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 3) {
          newSteps[2].status = 'finish';
          newSteps.push({
            title: '资源加密',
            description: stepMessage || '正在加密资源文件...',
            status: 'process'
          });
        } else if (newSteps.length >= 4) {
          newSteps[3] = newSteps[3] || {};
          newSteps[3].title = '资源加密';
          newSteps[3].description = stepMessage || '正在加密资源文件...';
          newSteps[3].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(3);
      scrollToCurrentStep(3);
    } else if (step === 'string-encryption') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 4) {
          newSteps[3].status = 'finish';
          newSteps.push({
            title: '字符串加密',
            description: stepMessage || '正在进行字符串加密...',
            status: 'process'
          });
        } else if (newSteps.length >= 5) {
          newSteps[4] = newSteps[4] || {};
          newSteps[4].title = '字符串加密';
          newSteps[4].description = stepMessage || '正在进行字符串加密...';
          newSteps[4].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(4);
      scrollToCurrentStep(4);
    } else if (step === 'protect') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 5) {
          newSteps[4].status = 'finish';
          newSteps.push({
            title: '反调试保护',
            description: stepMessage || '正在添加反调试保护...',
            status: 'process'
          });
        } else if (newSteps.length >= 6) {
          newSteps[5] = newSteps[5] || {};
          newSteps[5].title = '反调试保护';
          newSteps[5].description = stepMessage || '正在添加反调试保护...';
          newSteps[5].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(5);
      scrollToCurrentStep(5);
    } else if (step === 'signature') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 6) {
          newSteps[5].status = 'finish';
          newSteps.push({
            title: '签名验证',
            description: stepMessage || '正在添加签名验证...',
            status: 'process'
          });
        } else if (newSteps.length >= 7) {
          newSteps[6] = newSteps[6] || {};
          newSteps[6].title = '签名验证';
          newSteps[6].description = stepMessage || '正在添加签名验证...';
          newSteps[6].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(6);
      scrollToCurrentStep(6);
    } else if (step === 'integrity') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 7) {
          newSteps[6].status = 'finish';
          newSteps.push({
            title: '完整性校验',
            description: stepMessage || '正在添加完整性校验...',
            status: 'process'
          });
        } else if (newSteps.length >= 8) {
          newSteps[7] = newSteps[7] || {};
          newSteps[7].title = '完整性校验';
          newSteps[7].description = stepMessage || '正在添加完整性校验...';
          newSteps[7].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(7);
      scrollToCurrentStep(7);
    } else if (step === 'root-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 8) {
          newSteps[7].status = 'finish';
          newSteps.push({
            title: 'Root检测',
            description: stepMessage || '正在添加Root检测...',
            status: 'process'
          });
        } else if (newSteps.length >= 9) {
          newSteps[8] = newSteps[8] || {};
          newSteps[8].title = 'Root检测';
          newSteps[8].description = stepMessage || '正在添加Root检测...';
          newSteps[8].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(8);
      scrollToCurrentStep(8);
    } else if (step === 'emulator-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 9) {
          newSteps[8].status = 'finish';
          newSteps.push({
            title: '模拟器检测',
            description: stepMessage || '正在添加模拟器检测...',
            status: 'process'
          });
        } else if (newSteps.length >= 10) {
          newSteps[9] = newSteps[9] || {};
          newSteps[9].title = '模拟器检测';
          newSteps[9].description = stepMessage || '正在添加模拟器检测...';
          newSteps[9].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(9);
      scrollToCurrentStep(9);
    } else if (step === 'hook-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 10) {
          newSteps[9].status = 'finish';
          newSteps.push({
            title: 'HOOK检测',
            description: stepMessage || '正在添加HOOK检测...',
            status: 'process'
          });
        } else if (newSteps.length >= 11) {
          newSteps[10] = newSteps[10] || {};
          newSteps[10].title = 'HOOK检测';
          newSteps[10].description = stepMessage || '正在添加HOOK检测...';
          newSteps[10].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(10);
      scrollToCurrentStep(10);
    } else if (step === 'dex-shell') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 11) {
          newSteps[10].status = 'finish';
          newSteps.push({
            title: 'DEX加壳 🆕 v2.0',
            description: stepMessage || 'v2.0新增: AES-256整体加密+GZIP压缩...',
            status: 'process', version: 'v2.0'
          });
        } else if (newSteps.length >= 12) {
          newSteps[11] = newSteps[11] || {};
          newSteps[11].title = 'DEX加壳 🆕 v2.0';
          newSteps[11].description = stepMessage || 'v2.0新增: AES-256整体加密+GZIP压缩...';
          newSteps[11].status = 'process'; newSteps[11].version = 'v2.0';
        }
        return newSteps;
      });
      setCurrentStep(11);
      scrollToCurrentStep(11);
    } else if (step === 'native-protect') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 12) {
          newSteps[11].status = 'finish';
          newSteps.push({
            title: 'Native保护',
            description: stepMessage || '正在添加Native保护层...',
            status: 'process'
          });
        } else if (newSteps.length >= 13) {
          newSteps[12] = newSteps[12] || {};
          newSteps[12].title = 'Native保护';
          newSteps[12].description = stepMessage || '正在添加Native保护层...';
          newSteps[12].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(12);
      scrollToCurrentStep(12);
    } else if (step === 'dex-vm') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 13) {
          newSteps[12].status = 'finish';
          newSteps.push({
            title: 'DEX虚拟化',
            description: stepMessage || '正在进行DEX代码虚拟化...',
            status: 'process'
          });
        } else if (newSteps.length >= 14) {
          newSteps[13] = newSteps[13] || {};
          newSteps[13].title = 'DEX虚拟化';
          newSteps[13].description = stepMessage || '正在进行DEX代码虚拟化...';
          newSteps[13].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(13);
      scrollToCurrentStep(13);
    } else if (step === 'string-encrypt') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 14) {
          newSteps[13].status = 'finish';
          newSteps.push({
            title: 'AES-128字符串加密 🆕 v2.0',
            description: stepMessage || 'v2.0无长度限制全字符串加密...',
            status: 'process', version: 'v2.0'
          });
        } else if (newSteps.length >= 15) {
          newSteps[14] = newSteps[14] || {};
          newSteps[14].title = 'AES-128字符串加密 🆕 v2.0';
          newSteps[14].description = stepMessage || 'v2.0无长度限制全字符串加密...';
          newSteps[14].status = 'process'; newSteps[14].version = 'v2.0';
        }
        return newSteps;
      });
      setCurrentStep(14);
      scrollToCurrentStep(14);
    } else if (step === 'method-virtualize') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 15) {
          newSteps[14].status = 'finish';
          newSteps.push({
            title: '方法虚拟化 🆕 v2.0',
            description: stepMessage || 'v2.0增强: 64操作码VM引擎...',
            status: 'process', version: 'v2.0'
          });
        } else if (newSteps.length >= 16) {
          newSteps[15] = newSteps[15] || {};
          newSteps[15].title = '方法虚拟化 🆕 v2.0';
          newSteps[15].description = stepMessage || 'v2.0增强: 64操作码VM引擎...';
          newSteps[15].status = 'process'; newSteps[15].version = 'v2.0';
        }
        return newSteps;
      });
      setCurrentStep(15);
      scrollToCurrentStep(15);
    } else if (step === 'native-compile') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 16) {
          newSteps[15].status = 'finish';
          newSteps.push({
            title: 'Native库编译',
            description: stepMessage || '正在编译Native保护库...',
            status: 'process'
          });
        } else if (newSteps.length >= 17) {
          newSteps[16] = newSteps[16] || {};
          newSteps[16].title = 'Native库编译';
          newSteps[16].description = stepMessage || '正在编译Native保护库...';
          newSteps[16].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(16);
      scrollToCurrentStep(16);
    } else if (step === 'rebuild') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 17) {
          newSteps[16].status = 'finish';
          newSteps.push({
            title: '重新打包',
            description: stepMessage || '正在重新打包APK...',
            status: 'process'
          });
        } else if (newSteps.length >= 18) {
          newSteps[17] = newSteps[17] || {};
          newSteps[17].title = '重新打包';
          newSteps[17].description = stepMessage || '正在重新打包APK...';
          newSteps[17].status = 'process';
        }
        return newSteps;
      });
      setCurrentStep(17);
      scrollToCurrentStep(17);
    } else if (step === 'complete') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length > 0) {
          const lastIndex = newSteps.length - 1;
          newSteps[lastIndex] = newSteps[lastIndex] || {};
          newSteps[lastIndex].status = 'finish';
          newSteps[lastIndex].progress = 100;
        }
        newSteps.push({
          title: '加固完成',
          description: stepMessage || 'APK加固已完成！',
          status: 'finish',
          progress: 100
        });
        return newSteps;
      });
      setCurrentStep(hardeningSteps.length);
      setTimeout(() => {
        setIsHardening(false);
        setShowProgressModal(false);
        message.success('APK加固完成！');
        fetchHistory();
      }, 1000);
    } else if (step === 'error') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length > 0) {
          const lastIndex = newSteps.length - 1;
          newSteps[lastIndex] = newSteps[lastIndex] || {};
          newSteps[lastIndex].status = 'error';
          newSteps[lastIndex].description = error || stepMessage || '加固过程中发生错误';
          newSteps[lastIndex].progress = 0;
        }
        return newSteps;
      });
      setIsHardening(false);
      message.error(`加固失败: ${error || stepMessage || '未知错误'}`);
    }
  };


  // 查看日志
  const viewLog = async (logFileName: string) => {
    setLoadingLog(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/apk/log/${logFileName}`);
      const result = await response.json();
      
      if (result.success) {
        setCurrentLog({
          fileName: logFileName,
          content: result.data.content
        });
        setShowLogModal(true);
      } else {
        message.error(result.message || '获取日志失败');
      }
    } catch (error) {
      console.error('获取日志失败:', error);
      message.error('获取日志失败');
    } finally {
      setLoadingLog(false);
    }
  };

  // 清空历史记录
  const clearHistory = async () => {
    Modal.confirm({
      title: '确认清空',
      content: '确定要清空所有历史记录吗？此操作不可恢复。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await fetch(`${getApiBaseUrl()}/api/apk/history`, {
            method: 'DELETE',
          });
          const result = await response.json();
          
          if (result.success) {
            message.success('历史记录已清空');
            fetchHistory();
          } else {
            message.error(result.message || '清空失败');
          }
        } catch (error) {
          console.error('清空历史记录失败:', error);
          message.error('清空失败');
        }
      },
    });
  };

  // 组件加载时获取历史记录
  useEffect(() => {
    fetchHistory();
  }, []);

  // 组件卸载时断开WebSocket
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, []);

  const uploadProps = {
    name: 'apk',
    accept: '.apk',
    maxCount: 1,
    fileList,
    showUploadList: false,
    beforeUpload: (file: File) => {
      const isApk = file.type === 'application/vnd.android.package-archive' || file.name.endsWith('.apk');
      if (!isApk) {
        message.error('只能上传APK文件!');
        return false;
      }
      const isLt200M = file.size / 1024 / 1024 < 200;
      if (!isLt200M) {
        message.error('APK文件大小不能超过200MB!');
        return false;
      }
      
      // 检查文件大小是否太小（可能是损坏的文件）
      const isTooSmall = file.size < 1024; // 小于1KB
      if (isTooSmall) {
        message.error('APK文件大小异常，请检查文件是否完整!');
        return false;
      }
      
      setFileList([file]);
      return false;
    },
    onChange: (info: any) => {
      setFileList(info.fileList);
      // 当文件被添加时，显示确认弹框
      if (info.fileList.length > 0 && info.file.status !== 'removed') {
        setShowConfirmModal(true);
      }
    },
    onRemove: () => {
      setFileList([]);
      setHardeningProgress(0);
      setShowConfirmModal(false);
    },
  };

  const startHardening = async () => {
    if (fileList.length === 0) {
      message.warning('请先上传APK文件');
      return;
    }

    const currentSessionId = Date.now().toString();
    setSessionId(currentSessionId);
    setIsHardening(true);
    setHardeningProgress(0);
    setCurrentStep(0);
    setHardeningSteps([]);
    
    // 先关闭确认弹框，再打开进度弹框
    setShowConfirmModal(false);
    setShowProgressModal(true);

    console.log('弹框状态更新: showConfirmModal=false, showProgressModal=true');

    // 初始化进度步骤
    const initialStepTitle = '资源混淆准备';
    const initialStepDesc = '正在初始化AndResGuard资源混淆流程...';
      
    setHardeningSteps([{
      title: initialStepTitle,
      description: initialStepDesc,
      status: 'process'
    }]);

    // 连接WebSocket
    connectWebSocket(currentSessionId);

    try {
      const formData = new FormData();
      // 使用 originFileObj 获取实际的 File 对象
      const file = fileList[0].originFileObj || fileList[0];
      formData.append('apk', file);

      // 添加session ID到请求头
      const headers = new Headers();
      headers.append('x-session-id', currentSessionId);

      // 默认使用 AndResGuard 加固
      const endpoint = '/api/apk/harden';
      const apiUrl = `${getApiBaseUrl()}${endpoint}`;
      console.log('准备发送请求到:', apiUrl);
      console.log('请求头:', headers);
      console.log('文件对象:', file);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      console.log('响应状态:', response.status);
      console.log('响应头:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('响应错误内容:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();
      console.log('响应数据:', result);

      if (result.success) {
        // 成功后WebSocket会处理完成消息
        console.log('APK处理请求成功:', result);
      } else {
        throw new Error(result.message || '处理失败');
      }

    } catch (error) {
      console.error('APK加固失败:', error);
      setIsHardening(false);
      setShowProgressModal(false);
      disconnectWebSocket();
      
      // 显示更详细的错误信息
      let errorMessage = '网络请求失败';
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('错误详情:', error);
        
        // 检查是否是网络错误
        if (error.message.includes('Failed to fetch')) {
          errorMessage = `无法连接到服务器，请检查服务器是否运行在 ${getApiBaseUrl()}`;
        } else if (error.message.includes('CORS')) {
          errorMessage = '跨域请求被阻止，请检查服务器CORS配置';
        } else if (error.message.includes('NetworkError')) {
          errorMessage = '网络连接错误，请检查网络连接';
        }
      }
      
      // 如果是API返回的错误，尝试获取更详细的信息
      if (errorMessage.includes('HTTP error! status:')) {
        errorMessage = '服务器错误，请检查服务器状态或稍后重试';
      }
      
      message.error(`加固失败: ${errorMessage}`);
    }
  };

  return (
    <div className="apk-hardening-container">
      <div className="hardening-content">

        <Card className="upload-card">
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 APK 文件至此上传</p>
            <p className="ant-upload-hint">
              支持单个 APK 文件上传，文件大小不超过 200MB
            </p>
          </Upload.Dragger>
        </Card>



        <Card 
          title="加固历史记录" 
          className="history-card"
          extra={
            <Button 
              danger 
              onClick={clearHistory}
              disabled={historyList.length === 0}
            >
              清空历史记录
            </Button>
          }
        >
          <Table
            dataSource={historyList}
            loading={loadingHistory}
            rowKey="fileName"
            pagination={false}
            columns={[
              {
                title: '文件名',
                dataIndex: 'fileName',
                key: 'fileName',
                ellipsis: true,
                align: 'center',
              },
              {
                title: '文件大小',
                dataIndex: 'size',
                key: 'size',
                align: 'center',
                render: (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`,
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                align: 'center',
                render: (date: string) => new Date(date).toLocaleString(),
              },
              {
                title: '日志',
                key: 'log',
                align: 'center',
                render: (_, record) => (
                  record.hasLog ? (
                    <Button
                      type="link"
                      icon={<FileTextOutlined />}
                      onClick={() => viewLog(record.logFile)}
                      loading={loadingLog}
                    >
                      查看日志
                    </Button>
                  ) : (
                    <span style={{ color: '#999' }}>-</span>
                  )
                ),
              },
              {
                title: '操作',
                key: 'action',
                align: 'center',
                render: (_, record) => (
                  <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    href={`${getApiBaseUrl()}/api/apk/download/${record.fileName}`}
                  >
                    下载
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {/* APK 信息确认弹框 */}
      <Modal
        title="确认加固信息"
        open={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowConfirmModal(false)}>
            取消
          </Button>,
          <Button
            key="start"
            type="primary"
            loading={isHardening}
            onClick={startHardening}
            icon={<FileProtectOutlined />}
          >
            {isHardening ? '加固中...' : '开始加固'}
          </Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <FileProtectOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
          <p>确定要开始加固选中的APK文件吗？</p>
        </div>
      </Modal>

      {/* 加固进度弹框 - 简化版 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <LoadingOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            <span style={{ fontSize: 18, fontWeight: 600 }}>AndResGuard 资源混淆中...</span>
          </div>
        }
        open={showProgressModal}
        footer={null}
        closable={false}
        width={600}
        maskClosable={false}
      >
        <div className="hardening-progress-modal" style={{ padding: '24px 0' }}>
          <div className="progress-bar-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Progress
              type="circle"
              percent={hardeningProgress}
              status={isHardening ? "active" : "success"}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#52c41a',
              }}
              width={150}
            />
            <div style={{ marginTop: 24, textAlign: 'center', width: '100%' }}>
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                {hardeningSteps.length > 0 
                  ? hardeningSteps[hardeningSteps.length - 1].description 
                  : '正在初始化...'}
              </p>
              <p style={{ color: '#8c8c8c', fontSize: 14 }}>
                资源路径混淆 + 7zip压缩优化，预计1-2分钟
              </p>
            </div>
          </div>

          <Alert
            message="AndResGuard 资源混淆"
            description="资源文件路径混淆 + APK体积压缩（通常减少10-30%）"
            type="info"
            showIcon
            icon={<SecurityScanOutlined />}
            style={{ marginTop: 24 }}
          />

          {hardeningSteps.some(step => step.status === 'error') && (
            <Alert
              message="混淆失败"
              description="资源混淆过程中发生错误，请检查APK文件是否有效或查看日志详情。"
              type="error"
              showIcon
              style={{ marginTop: 24 }}
            />
          )}
        </div>
      </Modal>

      {/* 日志查看弹框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            加固日志
          </div>
        }
        open={showLogModal}
        onCancel={() => setShowLogModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowLogModal(false)}>
            关闭
          </Button>,
        ]}
        width={900}
      >
        {currentLog && (
          <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
              文件名: <strong>{currentLog.fileName}</strong>
            </p>
            <pre
              style={{
                background: '#f5f5f5',
                padding: '16px',
                borderRadius: '4px',
                maxHeight: '600px',
                overflow: 'auto',
                fontSize: '12px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
              }}
            >
              {currentLog.content}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ApkHardening;
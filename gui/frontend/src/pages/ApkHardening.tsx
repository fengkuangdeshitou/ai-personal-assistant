import React, { useState, useEffect, useRef } from 'react';
import { Upload, Button, Card, Progress, message, List, Table, Space, Modal, Steps, Alert } from 'antd';
import { FileProtectOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DownloadOutlined, InboxOutlined, LoadingOutlined, LockOutlined, SafetyOutlined, SecurityScanOutlined } from '@ant-design/icons';
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
      const response = await fetch('http://localhost:5178/api/apk/history');
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

    const ws = new WebSocket('ws://localhost:5179');
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

  // 处理进度更新
  const handleProgressUpdate = (data: any) => {
    const { step, progress, overallProgress, message: stepMessage, status, error } = data;

    // 更新整体进度 - 优先使用overallProgress
    setHardeningProgress(overallProgress !== undefined ? overallProgress : (progress || 0));

    if (step === 'start') {
      setHardeningSteps([{
        title: '准备开始',
        description: stepMessage || '正在初始化加固流程...',
        status: 'process',
        progress: progress || 0
      }]);
      setCurrentStep(0);
    } else if (step === 'decompile') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 1) {
          newSteps[0].status = 'finish';
          newSteps.push({
            title: '反编译APK',
            description: stepMessage || '正在反编译APK文件...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 2) {
          newSteps[1] = newSteps[1] || {};
          newSteps[1].description = stepMessage || '正在反编译APK文件...';
          newSteps[1].status = 'process';
          newSteps[1].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(1);
      scrollToCurrentStep(1);
    } else if (step === 'obfuscate') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 2) {
          newSteps[1].status = 'finish';
          newSteps.push({
            title: '代码混淆',
            description: stepMessage || '正在混淆代码...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 3) {
          newSteps[2] = newSteps[2] || {};
          newSteps[2].description = stepMessage || '正在混淆代码...';
          newSteps[2].status = 'process';
          newSteps[2].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(2);
      scrollToCurrentStep(2);
    } else if (step === 'encrypt') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 3) {
          newSteps[2].status = 'finish';
          newSteps.push({
            title: '资源加密',
            description: stepMessage || '正在加密资源文件...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 4) {
          newSteps[3] = newSteps[3] || {};
          newSteps[3].description = stepMessage || '正在加密资源文件...';
          newSteps[3].status = 'process';
          newSteps[3].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(3);
      scrollToCurrentStep(3);
    } else if (step === 'protect') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 4) {
          newSteps[3].status = 'finish';
          newSteps.push({
            title: '反调试保护',
            description: stepMessage || '正在添加反调试保护...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 5) {
          newSteps[4] = newSteps[4] || {};
          newSteps[4].description = stepMessage || '正在添加反调试保护...';
          newSteps[4].status = 'process';
          newSteps[4].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(4);
      scrollToCurrentStep(4);
    } else if (step === 'signature') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 5) {
          newSteps[4].status = 'finish';
          newSteps.push({
            title: '签名验证',
            description: stepMessage || '正在添加签名验证...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 6) {
          newSteps[5] = newSteps[5] || {};
          newSteps[5].description = stepMessage || '正在添加签名验证...';
          newSteps[5].status = 'process';
          newSteps[5].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(5);
      scrollToCurrentStep(5);
    } else if (step === 'anti-reverse') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 6) {
          newSteps[5].status = 'finish';
          newSteps.push({
            title: '反逆向工程',
            description: stepMessage || '正在添加反逆向工程保护...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 7) {
          newSteps[6] = newSteps[6] || {};
          newSteps[6].description = stepMessage || '正在添加反逆向工程保护...';
          newSteps[6].status = 'process';
          newSteps[6].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(6);
      scrollToCurrentStep(6);
    } else if (step === 'dex-encryption') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 7) {
          newSteps[6].status = 'finish';
          newSteps.push({
            title: 'DEX加密',
            description: stepMessage || '正在进行DEX加密保护...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 8) {
          newSteps[7] = newSteps[7] || {};
          newSteps[7].description = stepMessage || '正在进行DEX加密保护...';
          newSteps[7].status = 'process';
          newSteps[7].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(7);
      scrollToCurrentStep(7);
    } else if (step === 'integrity') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 8) {
          newSteps[7].status = 'finish';
          newSteps.push({
            title: '完整性校验',
            description: stepMessage || '正在添加完整性校验...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 9) {
          newSteps[8] = newSteps[8] || {};
          newSteps[8].description = stepMessage || '正在添加完整性校验...';
          newSteps[8].status = 'process';
          newSteps[8].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(8);
      scrollToCurrentStep(8);
    } else if (step === 'root-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 9) {
          newSteps[8].status = 'finish';
          newSteps.push({
            title: 'Root检测',
            description: stepMessage || '正在添加Root检测...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 10) {
          newSteps[9] = newSteps[9] || {};
          newSteps[9].description = stepMessage || '正在添加Root检测...';
          newSteps[9].status = 'process';
          newSteps[9].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(9);
      scrollToCurrentStep(9);
    } else if (step === 'so-protection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 10) {
          newSteps[9].status = 'finish';
          newSteps.push({
            title: 'SO库加固',
            description: stepMessage || '正在加固SO库...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 11) {
          newSteps[10] = newSteps[10] || {};
          newSteps[10].description = stepMessage || '正在加固SO库...';
          newSteps[10].status = 'process';
          newSteps[10].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(10);
      scrollToCurrentStep(10);
    } else if (step === 'resource-obfuscation') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 11) {
          newSteps[10].status = 'finish';
          newSteps.push({
            title: '资源混淆',
            description: stepMessage || '正在混淆资源文件...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 12) {
          newSteps[11] = newSteps[11] || {};
          newSteps[11].description = stepMessage || '正在混淆资源文件...';
          newSteps[11].status = 'process';
          newSteps[11].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(11);
      scrollToCurrentStep(11);
    } else if (step === 'string-encryption') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 12) {
          newSteps[11].status = 'finish';
          newSteps.push({
            title: '字符串加密',
            description: stepMessage || '正在加密字符串常量...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 13) {
          newSteps[12] = newSteps[12] || {};
          newSteps[12].description = stepMessage || '正在加密字符串常量...';
          newSteps[12].status = 'process';
          newSteps[12].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(12);
      scrollToCurrentStep(12);
    } else if (step === 'repackage-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 13) {
          newSteps[12].status = 'finish';
          newSteps.push({
            title: '防二次打包',
            description: stepMessage || '正在添加防二次打包保护...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 14) {
          newSteps[13] = newSteps[13] || {};
          newSteps[13].description = stepMessage || '正在添加防二次打包保护...';
          newSteps[13].status = 'process';
          newSteps[13].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(13);
      scrollToCurrentStep(13);
    } else if (step === 'rebuild') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 14) {
          newSteps[13].status = 'finish';
          newSteps.push({
            title: '重新打包',
            description: stepMessage || '正在重新打包APK...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 15) {
          newSteps[14] = newSteps[14] || {};
          newSteps[14].description = stepMessage || '正在重新打包APK...';
          newSteps[14].status = 'process';
          newSteps[14].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(14);
      scrollToCurrentStep(14);
    } else if (step === 'hook-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 15) {
          newSteps[14].status = 'finish';
          newSteps.push({
            title: 'HOOK检测',
            description: stepMessage || '正在添加HOOK检测...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 16) {
          newSteps[15] = newSteps[15] || {};
          newSteps[15].description = stepMessage || '正在添加HOOK检测...';
          newSteps[15].status = 'process';
          newSteps[15].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(15);
      scrollToCurrentStep(15);
    } else if (step === 'emulator-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 16) {
          newSteps[15].status = 'finish';
          newSteps.push({
            title: '模拟器检测',
            description: stepMessage || '正在添加模拟器检测...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 17) {
          newSteps[16] = newSteps[16] || {};
          newSteps[16].description = stepMessage || '正在添加模拟器检测...';
          newSteps[16].status = 'process';
          newSteps[16].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(16);
      scrollToCurrentStep(16);
    } else if (step === 'proxy-detection') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 17) {
          newSteps[16].status = 'finish';
          newSteps.push({
            title: '代理检测',
            description: stepMessage || '正在添加代理检测...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 18) {
          newSteps[17] = newSteps[17] || {};
          newSteps[17].description = stepMessage || '正在添加代理检测...';
          newSteps[17].status = 'process';
          newSteps[17].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(17);
      scrollToCurrentStep(17);
    } else if (step === 'rebuild') {
      setHardeningSteps(prev => {
        const newSteps = [...prev];
        if (newSteps.length === 18) {
          newSteps[17].status = 'finish';
          newSteps.push({
            title: '重新打包',
            description: stepMessage || '正在重新打包APK...',
            status: 'process',
            progress: progress || 0
          });
        } else if (newSteps.length >= 19) {
          newSteps[18] = newSteps[18] || {};
          newSteps[18].description = stepMessage || '正在重新打包APK...';
          newSteps[18].status = 'process';
          newSteps[18].progress = progress || 0;
        }
        return newSteps;
      });
      setCurrentStep(18);
      scrollToCurrentStep(18);
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
    setHardeningSteps([{
      title: '准备开始',
      description: '正在初始化加固流程...',
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

      console.log('准备发送请求到:', 'http://localhost:5178/api/apk/harden');
      console.log('请求头:', headers);
      console.log('文件对象:', file);

      const response = await fetch('http://localhost:5178/api/apk/harden', {
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
        console.log('APK加固请求成功:', result);
      } else {
        throw new Error(result.message || '加固失败');
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
          errorMessage = '无法连接到服务器，请检查服务器是否运行在 http://localhost:5178';
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

  const hardeningFeatures = [
    {
      title: '代码混淆',
      description: '混淆类名、方法名和变量名，增加逆向工程难度',
      icon: <FileProtectOutlined />
    },
    {
      title: '资源加密',
      description: '加密APK中的资源文件，防止资源被直接提取',
      icon: <FileProtectOutlined />
    },
    {
      title: '反调试保护',
      description: '检测并阻止调试器附加，防止动态分析',
      icon: <ExclamationCircleOutlined />
    },
    {
      title: '签名验证',
      description: '验证APK签名完整性，防止重打包攻击',
      icon: <CheckCircleOutlined />
    },
    {
      title: '反逆向工程',
      description: '多种技术手段防止APK被反编译和分析',
      icon: <FileProtectOutlined />
    },
    {
      title: 'DEX加密',
      description: '对DEX文件进行AES-256加密，防止代码被直接读取',
      icon: <LockOutlined />
    },
    {
      title: '完整性校验',
      description: 'SHA-256哈希校验，检测APK是否被篡改',
      icon: <SafetyOutlined />
    },
    {
      title: 'Root检测',
      description: '检测设备Root状态，防止在不安全环境运行',
      icon: <ExclamationCircleOutlined />
    },
    {
      title: 'SO库加固',
      description: '保护native代码库，防止SO文件被hook和分析',
      icon: <FileProtectOutlined />
    },
    {
      title: '资源混淆',
      description: '混淆资源文件路径和名称，增加资源提取难度',
      icon: <FileProtectOutlined />
    },
    {
      title: '字符串加密',
      description: '加密字符串常量，防止敏感信息泄露',
      icon: <LockOutlined />
    },
    {
      title: '防二次打包',
      description: '签名指纹检测，防止APK被重新打包和分发',
      icon: <SafetyOutlined />
    },
    {
      title: 'HOOK检测',
      description: '检测Xposed、Frida等hook框架，防止代码注入',
      icon: <ExclamationCircleOutlined />
    },
    {
      title: '模拟器检测',
      description: '检测模拟器环境，防止自动化分析和调试',
      icon: <SecurityScanOutlined />
    },
    {
      title: '代理检测',
      description: 'SSL Pinning证书校验，防止流量抓包分析',
      icon: <SafetyOutlined />
    },
    {
      title: '多层防护',
      description: '16层安全保护，全方位保障APK安全',
      icon: <SecurityScanOutlined />
    }
  ];

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

        <Card title="加固功能" className="features-card">
          <List
            grid={{ gutter: 16, column: 4 }}
            dataSource={hardeningFeatures}
            renderItem={item => (
              <List.Item>
                <Card hoverable className="feature-card">
                  <div className="feature-icon">{item.icon}</div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </Card>
              </List.Item>
            )}
          />
        </Card>

        <Card title="加固历史记录" className="history-card">
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
                title: '操作',
                key: 'action',
                align: 'center',
                render: (_, record) => (
                  <Space size="middle">
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      href={`http://localhost:5178/api/apk/download/${record.fileName}`}
                    >
                      下载
                    </Button>
                  </Space>
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

      {/* 加固进度弹框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <LoadingOutlined style={{ marginRight: 8 }} />
            APK加固进度
          </div>
        }
        open={showProgressModal}
        footer={null}
        closable={false}
        width={700}
        maskClosable={false}
        afterOpenChange={(open) => {
          console.log('进度弹框打开状态变化:', open);
        }}
      >
        <div className="hardening-progress-modal">
          <div className="progress-bar-section">
            <Progress
              percent={hardeningProgress}
              status={isHardening ? "active" : "success"}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <p style={{ textAlign: 'center', marginTop: 8 }}>
              {isHardening ? '正在加固中，请稍候...' : '加固完成！'}
            </p>
          </div>

          <div className="steps-section" ref={stepsContainerRef}>
            <Steps
              direction="vertical"
              current={currentStep}
              size="small"
            >
              {hardeningSteps.map((step, index) => (
                <Step
                  key={index}
                  title={step.title}
                  description={
                    <div>
                      <p>{step.description}</p>
                      {step.status === 'process' && step.progress !== undefined && (
                        <Progress
                          percent={step.progress}
                          size="small"
                          status={step.status === 'error' ? 'exception' : 'active'}
                          strokeWidth={2}
                          showInfo={false}
                        />
                      )}
                    </div>
                  }
                  status={step.status}
                  icon={step.status === 'process' ? <LoadingOutlined /> : undefined}
                />
              ))}
            </Steps>
          </div>

          {hardeningSteps.some(step => step.status === 'error') && (
            <Alert
              message="加固失败"
              description="加固过程中发生错误，请检查APK文件是否有效或重试。"
              type="error"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ApkHardening;
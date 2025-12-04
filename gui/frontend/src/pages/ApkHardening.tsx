import React, { useState, useEffect, useRef } from 'react';
import { Upload, Button, Card, Progress, message, Table, Modal, Alert, Tag } from 'antd';
import { FileProtectOutlined, DownloadOutlined, InboxOutlined, FileTextOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';
import './ApkHardening.css';

interface Task {
  sessionId: string;
  fileName: string;
  size: number;
  progress: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  stepDescription: string;
  createdAt: number;
  fileObj?: File;
}

const ApkHardening: React.FC = () => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [currentLog, setCurrentLog] = useState<{ fileName: string; content: string } | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  // 获取历史记录
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/apk/history`);
      const result = await response.json();
      if (result.success) {
        setHistoryList(result.data);
        
        // 检查是否有已完成的任务，从活动任务列表中移除
        setActiveTasks(prev => {
          const historyFileNames = new Set(result.data.map((h: any) => h.fileName));
          // 如果任务状态是 success 且在历史记录中存在，则移除
          return prev.filter(task => !(task.status === 'success' && historyFileNames.has(task.fileName)));
        });
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = getApiBaseUrl().replace(/^http/, 'ws').replace(':5178', ':5179');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionId) {
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
      // 尝试重连
      setTimeout(connectWebSocket, 3000);
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
    const { sessionId, step, progress, overallProgress, message: stepMessage, error } = data;

    setActiveTasks(prev => prev.map(task => {
      if (task.sessionId !== sessionId) return task;

      let newProgress = task.progress;
      if (overallProgress !== undefined && overallProgress !== null) {
        newProgress = typeof overallProgress === 'string' ? parseFloat(overallProgress) : overallProgress;
      } else if (progress !== undefined && progress !== null) {
        const p = typeof progress === 'string' ? parseFloat(progress) : progress;
        if (!isNaN(p)) newProgress = p;
      }
      newProgress = Math.min(Math.round(newProgress), 100);

      let newStatus = task.status;
      let newDesc = stepMessage || task.stepDescription;

      if (step === 'complete') {
        newStatus = 'success';
        newProgress = 100;
        newDesc = '加固完成';
        // 任务完成后刷新历史记录
        setTimeout(fetchHistory, 1000);
      } else if (step === 'error') {
        newStatus = 'error';
        newDesc = error || stepMessage || '加固失败';
      } else {
        newStatus = 'processing';
      }

      return {
        ...task,
        progress: newProgress,
        status: newStatus,
        stepDescription: newDesc
      };
    }));
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

  // 组件加载时获取历史记录和连接WS
  useEffect(() => {
    fetchHistory();
    connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
  }, []);

  const uploadProps = {
    name: 'apk',
    accept: '.apk',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file: File, fileList: File[]) => {
      console.log('beforeUpload triggered', { 
        currentFile: file.name, 
        fileListLength: fileList?.length
      });

      const isApk = file.type === 'application/vnd.android.package-archive' || file.name.endsWith('.apk');
      if (!isApk) {
        message.error(`${file.name} 不是APK文件!`);
        return Upload.LIST_IGNORE;
      }
      const isLt200M = file.size / 1024 / 1024 < 200;
      if (!isLt200M) {
        message.error(`${file.name} 大小超过200MB!`);
        return Upload.LIST_IGNORE;
      }
      
      // 确保文件有唯一ID
      const processFile = (f: any) => {
        if (!f.uid) {
          f.uid = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        return f;
      };

      // 优先使用 fileList (批次) 以处理批量拖拽
      // 如果 fileList 为空或不可用，回退到使用单个 file
      const filesToProcess = (fileList && fileList.length > 0) ? fileList : [file];

      const validFiles = filesToProcess.filter(f => {
        const fIsApk = f.type === 'application/vnd.android.package-archive' || f.name.endsWith('.apk');
        const fIsLt200M = f.size / 1024 / 1024 < 200;
        return fIsApk && fIsLt200M;
      }).map(processFile);

      setFileList(prev => {
        // 仅根据 uid 去重，允许同名文件（可能是不同目录的副本）
        const newFiles = validFiles.filter(f => 
          !prev.some(p => p.uid === f.uid)
        );
        
        if (newFiles.length === 0) return prev;
        return [...prev, ...newFiles];
      });
      
      setShowConfirmModal(true);
      return false; // 阻止自动上传
    },
    // 移除 onChange 和 onRemove，完全手动管理 fileList 状态
    // 避免 Antd Upload 组件因 beforeUpload 返回 false 而触发移除操作
  };

  const startHardening = async () => {
    if (fileList.length === 0) {
      message.warning('请先上传APK文件');
      return;
    }

    setShowConfirmModal(false);
    
    // 为每个文件创建任务
    const newTasks: Task[] = fileList.map(file => ({
      sessionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      size: file.size,
      progress: 0,
      status: 'pending',
      stepDescription: '等待上传...',
      createdAt: Date.now(),
      fileObj: file.originFileObj || file // 保存文件对象用于上传
    }));

    // 添加到活动任务列表
    setActiveTasks(prev => [...newTasks, ...prev]);
    
    // 清空上传列表
    setFileList([]);

    // 并行开始处理所有任务
    newTasks.forEach(async (task) => {
      try {
        // 更新状态为处理中
        setActiveTasks(prev => prev.map(t => 
          t.sessionId === task.sessionId 
            ? { ...t, status: 'processing', stepDescription: '正在上传...' } 
            : t
        ));

        const formData = new FormData();
        // @ts-ignore
        formData.append('apk', task.fileObj);

        const headers = new Headers();
        headers.append('x-session-id', task.sessionId);

        const response = await fetch(`${getApiBaseUrl()}/api/apk/harden`, {
          method: 'POST',
          headers: headers,
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || '处理失败');
        }
        
        // Update filename if changed by server (e.g. due to duplicates)
        if (result.data && result.data.fileName) {
             setActiveTasks(prev => prev.map(t => 
                t.sessionId === task.sessionId 
                  ? { ...t, fileName: result.data.fileName } 
                  : t
              ));
        }
        
        // 成功由WebSocket消息处理

      } catch (error: any) {
        console.error(`Task ${task.fileName} failed:`, error);
        setActiveTasks(prev => prev.map(t => 
          t.sessionId === task.sessionId 
            ? { ...t, status: 'error', stepDescription: error.message || '请求失败' } 
            : t
        ));
        message.error(`${task.fileName} 加固失败: ${error.message}`);
      }
    });
  };

  // 合并显示数据：活动任务 + 历史记录
  // 过滤掉在活动任务中已存在的历史记录（通过文件名匹配，但这可能不准确如果同名文件）
  // 更好的方式是：活动任务优先显示
  const displayList = [
    ...activeTasks,
    ...historyList.filter(h => !activeTasks.some(t => t.fileName === h.fileName && t.status === 'success'))
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
              支持批量上传，单个文件不超过 200MB
            </p>
          </Upload.Dragger>
        </Card>

        <Card 
          title="加固任务与历史" 
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
            dataSource={displayList}
            loading={loadingHistory}
            rowKey={(record) => record.sessionId || record.fileName + record.createdAt}
            pagination={false}
            columns={[
              {
                title: '文件名',
                dataIndex: 'fileName',
                key: 'fileName',
                ellipsis: true,
                width: 200,
                align: 'center',
              },
              {
                title: '文件大小',
                dataIndex: 'size',
                key: 'size',
                width: 100,
                align: 'center',
                render: (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`,
              },
              {
                title: '状态/进度',
                key: 'status',
                width: 300,
                align: 'center',
                render: (_, record) => {
                  // 判断是否是活动任务
                  if ('progress' in record) {
                    const task = record as Task;
                    return (
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#666' }}>{task.stepDescription}</span>
                          <span style={{ fontSize: 12 }}>{task.progress}%</span>
                        </div>
                        <Progress 
                          percent={task.progress} 
                          status={task.status === 'error' ? 'exception' : (task.status === 'success' ? 'success' : 'active')} 
                          size="small" 
                          showInfo={false}
                        />
                      </div>
                    );
                  } else {
                    return <Tag color="success" icon={<CheckCircleOutlined />}>已完成</Tag>;
                  }
                }
              },
              {
                title: '时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 180,
                align: 'center',
                render: (date: any) => new Date(date).toLocaleString(),
              },
              {
                title: '日志',
                key: 'log',
                width: 100,
                align: 'center',
                render: (_, record) => (
                  record.hasLog ? (
                    <Button
                      type="link"
                      icon={<FileTextOutlined />}
                      onClick={() => viewLog(record.logFile)}
                      loading={loadingLog}
                    >
                      查看
                    </Button>
                  ) : (
                    <span style={{ color: '#999' }}>-</span>
                  )
                ),
              },
              {
                title: '操作',
                key: 'action',
                width: 100,
                align: 'center',
                render: (_, record) => {
                  // 如果是活动任务且未完成，不显示下载
                  if ('status' in record && record.status !== 'success') {
                     return null;
                  }
                  return (
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      href={`${getApiBaseUrl()}/api/apk/download/${record.fileName}`}
                    >
                      下载
                    </Button>
                  );
                },
              },
            ]}
          />
        </Card>
      </div>

      {/* APK 信息确认弹框 */}
      <Modal
        title="确认加固信息"
        open={showConfirmModal}
        onCancel={() => {
          setShowConfirmModal(false);
          setFileList([]); // 取消时清空选择
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setShowConfirmModal(false);
            setFileList([]);
          }}>
            取消
          </Button>,
          <Button
            key="start"
            type="primary"
            onClick={startHardening}
            icon={<FileProtectOutlined />}
          >
            开始加固 ({fileList.length})
          </Button>,
        ]}
        width={600}
      >
        <div style={{ padding: '20px 0' }}>
          <Alert
            message={`已选择 ${fileList.length} 个文件`}
            description="点击“开始加固”后，任务将自动添加到下方列表并开始处理。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Table
            dataSource={fileList}
            rowKey={(record) => record.uid || `${record.name}-${record.size}`}
            pagination={false}
            size="small"
            scroll={{ y: 300 }}
            columns={[
              {
                title: '文件名',
                dataIndex: 'name',
                key: 'name',
              },
              {
                title: '大小',
                dataIndex: 'size',
                key: 'size',
                width: 100,
                render: (size) => `${(size / 1024 / 1024).toFixed(2)} MB`,
              },
              {
                title: '操作',
                key: 'action',
                width: 60,
                render: (_, record) => (
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={() => {
                      const newFiles = fileList.filter(f => f.uid !== record.uid);
                      setFileList(newFiles);
                      if (newFiles.length === 0) setShowConfirmModal(false);
                    }}
                  />
                )
              }
            ]}
          />
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

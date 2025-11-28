import React, { useState } from 'react';
import { Upload, Button, Card, Progress, message, List, Tag } from 'antd';
import { UploadOutlined, FileProtectOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import './ApkHardening.css';

const ApkHardening: React.FC = () => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [hardeningProgress, setHardeningProgress] = useState(0);
  const [isHardening, setIsHardening] = useState(false);
  const [hardeningResult, setHardeningResult] = useState<any>(null);

  const uploadProps = {
    name: 'apk',
    accept: '.apk',
    maxCount: 1,
    fileList,
    beforeUpload: (file: File) => {
      const isApk = file.type === 'application/vnd.android.package-archive' || file.name.endsWith('.apk');
      if (!isApk) {
        message.error('只能上传APK文件!');
        return false;
      }
      const isLt50M = file.size / 1024 / 1024 < 50;
      if (!isLt50M) {
        message.error('APK文件大小不能超过50MB!');
        return false;
      }
      setFileList([file]);
      return false;
    },
    onChange: (info: any) => {
      setFileList(info.fileList);
    },
    onRemove: () => {
      setFileList([]);
      setHardeningResult(null);
      setHardeningProgress(0);
    },
  };

  const startHardening = async () => {
    if (fileList.length === 0) {
      message.warning('请先上传APK文件');
      return;
    }

    setIsHardening(true);
    setHardeningProgress(0);

    try {
      const formData = new FormData();
      formData.append('apk', fileList[0]);

      const response = await fetch('/api/apk/harden', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setHardeningResult({
          originalSize: result.data.originalSize,
          hardenedSize: result.data.hardenedSize,
          protections: result.data.protections,
          downloadUrl: result.data.downloadUrl
        });
        message.success('APK加固完成！');
      } else {
        throw new Error(result.message || '加固失败');
      }

    } catch (error) {
      console.error('APK加固失败:', error);
      message.error(`加固失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsHardening(false);
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
    }
  ];

  return (
    <div className="apk-hardening-container">
      <div className="hardening-header">
        <h1>🔒 安卓APK加固</h1>
        <p>为您的安卓应用提供多层安全保护，防止逆向工程和恶意篡改</p>
      </div>

      <div className="hardening-content">
        <Card title="上传APK文件" className="upload-card">
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} size="large">
              选择APK文件
            </Button>
          </Upload>
          <p className="upload-hint">
            支持.apk格式文件，文件大小不超过50MB
          </p>
        </Card>

        <Card title="加固功能" className="features-card">
          <List
            grid={{ gutter: 16, column: 3 }}
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

        {fileList.length > 0 && (
          <Card title="加固操作" className="action-card">
            <div className="action-content">
              <div className="file-info">
                <p><strong>文件名：</strong>{fileList[0].name}</p>
                <p><strong>文件大小：</strong>{(fileList[0].size / 1024 / 1024).toFixed(2)} MB</p>
              </div>

              {!isHardening && !hardeningResult && (
                <Button
                  type="primary"
                  size="large"
                  onClick={startHardening}
                  icon={<FileProtectOutlined />}
                >
                  开始加固
                </Button>
              )}

              {isHardening && (
                <div className="progress-section">
                  <Progress percent={hardeningProgress} status="active" />
                  <p>正在加固中，请稍候...</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {hardeningResult && (
          <Card title="加固结果" className="result-card">
            <div className="result-summary">
              <div className="size-comparison">
                <div className="size-item">
                  <span className="label">原始大小</span>
                  <span className="value">{hardeningResult.originalSize}</span>
                </div>
                <div className="size-item">
                  <span className="label">加固后大小</span>
                  <span className="value">{hardeningResult.hardenedSize}</span>
                </div>
              </div>

              <div className="protections-list">
                <h3>已实施保护措施：</h3>
                {hardeningResult.protections.map((protection: any, index: number) => (
                  <div key={index} className="protection-item">
                    <Tag color={protection.status === 'success' ? 'green' : 'orange'}>
                      {protection.name}
                    </Tag>
                    <span className="protection-desc">{protection.description}</span>
                  </div>
                ))}
              </div>

              <div className="download-section">
                <Button type="primary" size="large" href={hardeningResult.downloadUrl}>
                  下载加固后的APK
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ApkHardening;
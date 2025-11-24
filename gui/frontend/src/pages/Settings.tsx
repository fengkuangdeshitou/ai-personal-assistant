import React, { useEffect, useState } from 'react';
import { Card } from 'antd';
import './Settings.css';

// 纯血鸿蒙系统检测函数
const isHarmonyOS = (): boolean => {
  if (typeof navigator === 'undefined' || !navigator.userAgent) {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  // 纯血鸿蒙系统的特征字符串（更精确的检测）
  const harmonyOSKeywords = [
    'harmonyos',  // 鸿蒙系统官方标识
    'harmony',    // 鸿蒙英文名
    // 移除 'huawei' 和 'honor' 以确保只检测纯血鸿蒙
  ];

  // 检查是否包含纯血鸿蒙相关的关键词
  const hasHarmonyKeyword = harmonyOSKeywords.some(keyword => userAgent.includes(keyword));

  // 进一步验证：确保不是Android伪装的鸿蒙
  const isNotAndroid = !userAgent.includes('android');

  return hasHarmonyKeyword && isNotAndroid;
};

const Settings: React.FC = () => {
  const [isHarmony, setIsHarmony] = useState(false);

  useEffect(() => {
    // 加载设置
    loadSettings();
    // 检测是否为鸿蒙系统
    setIsHarmony(isHarmonyOS());
  }, []);

  const loadSettings = () => {
    // 从localStorage加载设置（如果有其他设置项）
  };

  return (
    <div className="settings-container">
      <Card title="📊 系统信息" className="settings-card">
        <div className="system-info-list">
          <div className="system-info-item">
            <span className="system-info-label">项目名称：</span>
            <span className="system-info-value">AI 私人助理</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">版本号：</span>
            <span className="system-info-value">v1.6.66</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">前端框架：</span>
            <span className="system-info-value">React 18 + TypeScript</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">后端框架：</span>
            <span className="system-info-value">Node.js + Express</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">UI 组件库：</span>
            <span className="system-info-value">Ant Design 5.x</span>
          </div>
          <div className="system-info-item">
            <span className="system-info-label">是否为纯血鸿蒙系统：</span>
            <span className="system-info-value">{isHarmony ? '是' : '否'}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
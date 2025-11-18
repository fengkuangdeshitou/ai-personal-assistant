import React from 'react';
import { Menu, Layout } from 'antd';
import {
  HomeOutlined,
  ProjectOutlined,
  ClockCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import './Sidebar.css';

const { Sider } = Layout;

interface SidebarProps {
  currentSection: string;
  onSectionChange: (section: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSectionChange }) => {
  const menuItems = [
    {
      key: 'dashboard',
      icon: <HomeOutlined />,
      label: '工作台',
    },
    {
      key: 'projects',
      icon: <ProjectOutlined />,
      label: '项目管理',
    },
    {
      key: 'timeline',
      icon: <ClockCircleOutlined />,
      label: '工作记录',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];

  return (
    <Sider className="sidebar" width={260}>
      <div className="sidebar-header">
        <h2>🤖 AI 助理</h2>
        <p className="version">v1.6.53</p>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[currentSection]}
        onClick={({ key }) => onSectionChange(key)}
        className="nav-menu"
        items={menuItems}
      />

      <div className="sidebar-footer">
        <p>疯狂的石头</p>
        <p style={{ marginTop: '5px' }}>🚀 让开发更智能</p>
      </div>
    </Sider>
  );
};

export default Sidebar;
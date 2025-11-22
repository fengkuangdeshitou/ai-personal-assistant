import React, { useState, useEffect } from 'react';
import { Menu, Layout, Drawer } from 'antd';
import {
  HomeOutlined,
  ProjectOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  RobotOutlined,
  UnorderedListOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import './Sidebar.css';

const { Sider } = Layout;

interface SidebarProps {
  currentSection: string;
  onSectionChange: (section: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSectionChange }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

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
      key: 'gemini',
      icon: <RobotOutlined />,
      label: 'Gemini 聊天',
    },
    {
      key: 'auth-schemes',
      icon: <UnorderedListOutlined />,
      label: '认证方案',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    onSectionChange(key);
    setDrawerVisible(false); // 关闭抽屉
  };

  if (isMobile) {
    return (
      <>
        {/* 移动端只显示一个菜单按钮 */}
        <div className="mobile-menu-button">
          <button
            className="menu-toggle-btn"
            onClick={() => setDrawerVisible(true)}
            aria-label="打开菜单"
          >
            <MenuOutlined />
          </button>
        </div>

        {/* 抽屉菜单 */}
        <Drawer
          title={null}
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          width={280}
          className="mobile-drawer"
          headerStyle={{ display: 'none' }}
        >
          <div className="mobile-drawer-header">
            <h2>🤖 AI 助理</h2>
            <p className="version">v1.6.61</p>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[currentSection]}
            onClick={handleMenuClick}
            className="nav-menu mobile-nav-menu"
            items={menuItems}
            style={{ border: 'none', background: 'transparent' }}
          />

          <div className="sidebar-footer mobile-footer">
            <p>疯狂的石头</p>
            <p style={{ marginTop: '5px' }}>🚀 让开发更智能</p>
          </div>
        </Drawer>
      </>
    );
  }

  return (
    <Sider className="sidebar" width={260}>
      <div className="sidebar-header">
        <h2>🤖 AI 助理</h2>
        <p className="version">v1.6.61</p>
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
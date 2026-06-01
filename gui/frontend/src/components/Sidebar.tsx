import React, { useState, useEffect } from 'react';
import { Menu, Layout, Drawer } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  ProjectOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  MenuOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import './Sidebar.css';

const { Sider } = Layout;

interface SidebarProps {}

const Sidebar: React.FC<SidebarProps> = () => {
  const location = useLocation();
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
      key: '/dashboard',
      icon: <HomeOutlined />,
      label: '工作台',
    },
    {
      key: '/projects',
      icon: <ProjectOutlined />,
      label: '项目管理',
    },
    {
      key: '/data-decrypt',
      icon: <UnlockOutlined />,
      label: '数据解密',
    },
    {
      key: '/timeline',
      icon: <ClockCircleOutlined />,
      label: '工作记录',
    },
    {
      key: '/auth-schemes',
      icon: <UnorderedListOutlined />,
      label: '认证方案',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
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
            <p className="version">v1.6.78</p>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[location.pathname === '/' ? '/dashboard' : location.pathname]}
            onClick={handleMenuClick}
            className="nav-menu mobile-nav-menu"
            items={menuItems.map(item => ({
              ...item,
              label: <Link to={item.key} onClick={() => setDrawerVisible(false)}>{item.label}</Link>
            }))}
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
    <Sider className="sidebar" width={240}>
      <div className="sidebar-header">
        <h2>🤖 AI 助理</h2>
        <p className="version">v1.6.78</p>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[location.pathname === '/' ? '/dashboard' : location.pathname]}
        className="nav-menu"
        items={menuItems.map(item => ({
          ...item,
          label: <Link to={item.key}>{item.label}</Link>
        }))}
      />

      <div className="sidebar-footer">
        <p>疯狂的石头</p>
        <p style={{ marginTop: '5px' }}>🚀 让开发更智能</p>
      </div>
    </Sider>
  );
};

export default Sidebar;
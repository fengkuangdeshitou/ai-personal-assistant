import React, { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Projects from './pages/Projects';
import Statistics from './pages/Statistics';
import Timeline from './pages/Timeline';
import Tools from './pages/Tools';
import Settings from './pages/Settings';
import './App.css';

const { Content } = Layout;

function App() {
  const [currentSection, setCurrentSection] = useState('dashboard');

  const showSection = (sectionId: string) => {
    setCurrentSection(sectionId);
  };

  const renderContent = () => {
    switch (currentSection) {
      case 'chat':
        return <Chat />;
      case 'projects':
        return <Projects />;
      case 'statistics':
        return <Statistics />;
      case 'timeline':
        return <Timeline />;
      case 'tools':
        return <Tools />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ConfigProvider locale={zhCN}>
      <Layout className="main-layout">
        <Sidebar currentSection={currentSection} onSectionChange={showSection} />
        <Layout>
          <Content className="content-area">
            {renderContent()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;

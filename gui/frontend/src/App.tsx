import React, { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Timeline from './pages/Timeline';
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
      case 'projects':
        return <Projects />;
      case 'timeline':
        return <Timeline />;
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

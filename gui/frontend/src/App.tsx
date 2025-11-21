import React, { useState } from 'react';
import { Layout, ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Timeline from './pages/Timeline';
import Settings from './pages/Settings';
import CreateScheme from './pages/CreateScheme';
import AuthSchemes from './pages/AuthSchemes';
import GeminiChat from './components/GeminiChat';
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
      case 'gemini':
        return <GeminiChat />;
      case 'auth-schemes':
        return <AuthSchemes />;
      case 'create-scheme':
        return <CreateScheme />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard currentSection={currentSection} onSectionChange={showSection} />;
    }
  };

  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <Layout className="main-layout">
          <Sidebar currentSection={currentSection} onSectionChange={showSection} />
          <Layout>
            <Content className="content-area">
              {renderContent()}
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;

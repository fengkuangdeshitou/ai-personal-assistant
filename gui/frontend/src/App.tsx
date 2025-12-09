import React from 'react';
import { Layout, ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Timeline from './pages/Timeline';
import Settings from './pages/Settings';
import CreateScheme from './pages/CreateScheme';
import AuthSchemes from './pages/AuthSchemes';

import './App.css';

const { Content } = Layout;

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <AntApp>
          <Layout className="main-layout">
            <Sidebar />
            <Layout>
              <Content className="content-area">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/timeline" element={<Timeline />} />

                  <Route path="/auth-schemes" element={<AuthSchemes />} />
                  <Route path="/create-scheme" element={<CreateScheme />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Content>
            </Layout>
          </Layout>
        </AntApp>
      </Router>
    </ConfigProvider>
  );
}

export default App;

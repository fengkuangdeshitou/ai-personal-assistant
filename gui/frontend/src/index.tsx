import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#667eea',
          borderRadius: 10,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            itemSelectedColor: '#fff',
            itemHoverBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            itemHoverColor: '#fff',
          },
          Layout: {
            siderBg: 'rgba(255, 255, 255, 0.95)',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
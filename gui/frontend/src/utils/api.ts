// 开发环境（:4000 dev server）：走同源 /api 代理（setupProxy.js → 127.0.0.1:5178）
// 避免 Chrome PNA 对跨端口请求的限制；局域网设备访问 192.168.x.x:4000 同样走代理
// 生产环境：使用 REACT_APP_API_URL 或同主机 5178 端口
export const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (typeof window !== 'undefined') {
    const { hostname, port, protocol } = window.location;
    const isDevServer = process.env.NODE_ENV === 'development'
      && (port === '4000' || port === '3000');
    if (isDevServer) return '';
    return `${protocol}//${hostname}:5178`;
  }
  if (process.env.NODE_ENV === 'development') return '';
  return 'http://localhost:5178';
};

export const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

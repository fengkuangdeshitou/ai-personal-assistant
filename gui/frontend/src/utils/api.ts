// 开发环境：走 React dev server 代理（setupProxy.js → 127.0.0.1:5178）
// 避免 Chrome PNA 对跨端口 multipart 上传的限制；代理是服务端转发，无浏览器安全限制
// 生产环境：使用 REACT_APP_API_URL 或同主机 5178 端口
export const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (process.env.NODE_ENV === 'development') return '';
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5178`;
  }
  return 'http://localhost:5178';
};

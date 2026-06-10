const { createProxyMiddleware } = require('http-proxy-middleware');

// 注意：app.use('/api', middleware) 会让 Express 在传给中间件前剥掉 /api 前缀
// 因此用 pathRewrite 把 /api 前缀补回来，确保后端路由匹配正确
// 局域网设备访问 192.168.x.x:4000 时，浏览器请求仍走本机 dev server 代理转发到 127.0.0.1:5178
module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:5178',
      changeOrigin: true,
      pathRewrite: (path) => `/api${path}`,
      proxyTimeout: 30 * 60 * 1000,
      timeout: 30 * 60 * 1000,
    })
  );
};

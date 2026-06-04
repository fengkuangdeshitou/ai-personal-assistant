const { createProxyMiddleware } = require('http-proxy-middleware');

// 注意：app.use('/api', middleware) 会让 Express 在传给中间件前剥掉 /api 前缀
// 因此用 pathRewrite 把 /api 前缀补回来，确保后端路由匹配正确
module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:5178',
      changeOrigin: true,
      pathRewrite: { '^/': '/api/' },
      proxyTimeout: 30 * 60 * 1000,
      timeout: 30 * 60 * 1000,
    })
  );
};

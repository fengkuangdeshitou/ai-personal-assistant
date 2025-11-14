import express from 'express';
import cors from 'cors';

// 创建独立的测试服务器，演示AI聊天API功能
const app = express();
const PORT = 5179; // 使用不同的端口避免冲突

app.use(cors());
app.use(express.json());

// ===== AI聊天API演示 =====

// 聊天历史存储（内存中，生产环境建议使用数据库）
let chatHistory = [];

// 发送聊天消息
app.post('/api/chat/send', async (req, res) => {
  try {
    const { message, model = 'gpt-3.5-turbo' } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: '消息不能为空' });
    }

    // 添加用户消息到历史
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };
    chatHistory.push(userMessage);

    // 这里可以集成真实的AI API（如OpenAI、Claude等）
    // 目前返回模拟回复
    const aiResponse = generateMockAIResponse(message);
    const aiMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    };
    chatHistory.push(aiMessage);

    res.json({
      success: true,
      message: aiMessage,
      history: chatHistory.slice(-20) // 返回最近20条消息
    });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ error: '发送消息失败: ' + error.message });
  }
});

// 获取聊天历史
app.get('/api/chat/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const recentHistory = chatHistory.slice(-limit);
    res.json({
      success: true,
      history: recentHistory
    });
  } catch (error) {
    res.status(500).json({ error: '获取聊天历史失败: ' + error.message });
  }
});

// 清空聊天历史
app.delete('/api/chat/clear', (req, res) => {
  try {
    chatHistory = [];
    res.json({
      success: true,
      message: '聊天历史已清空'
    });
  } catch (error) {
    res.status(500).json({ error: '清空聊天历史失败: ' + error.message });
  }
});

// 模拟AI回复生成函数
function generateMockAIResponse(userMessage) {
  const responses = [
    '我明白了你的问题。让我帮你分析一下...',
    '这是一个很有趣的问题。根据我的理解...',
    '好的，我来帮你解决这个问题。首先...',
    '谢谢你的提问。我认为我们可以这样处理...',
    '让我想想...这个问题可能有几种解决方案...',
    '根据你的描述，我建议...',
    '这是一个很好的问题。我来详细解释一下...',
    '我需要更多信息来更好地帮助你...',
    '让我为你提供一个具体的解决方案...',
    '这个问题很有挑战性，但我们可以一步步解决...'
  ];

  // 简单的关键词匹配回复
  const lowerMessage = userMessage.toLowerCase();
  if (lowerMessage.includes('hello') || lowerMessage.includes('你好')) {
    return '你好！我是AI助手，很高兴为你服务。请问有什么可以帮助你的吗？';
  }
  if (lowerMessage.includes('help') || lowerMessage.includes('帮助')) {
    return '我可以帮助你处理各种任务，包括代码编写、问题解答、项目管理等。请告诉我你需要什么帮助。';
  }
  if (lowerMessage.includes('bye') || lowerMessage.includes('再见')) {
    return '再见！如果以后有任何问题，随时可以找我。';
  }

  // 随机返回一个通用回复
  return responses[Math.floor(Math.random() * responses.length)];
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AI聊天API测试服务器运行正常',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 AI聊天API测试服务器启动成功`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`📋 可用端点:`);
  console.log(`   POST /api/chat/send - 发送聊天消息`);
  console.log(`   GET  /api/chat/history - 获取聊天历史`);
  console.log(`   DELETE /api/chat/clear - 清空聊天历史`);
  console.log(`   GET  /health - 健康检查`);
  console.log(`\n💡 提示: 这是一个独立的测试服务器，不影响原有server.js功能`);
});
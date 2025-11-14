// API集成测试脚本
import { chatApi } from './src/api/client.ts';

async function testAPI() {
  console.log('🧪 开始API集成测试...\n');

  try {
    // 测试1: 获取聊天历史
    console.log('1️⃣ 测试获取聊天历史...');
    const historyResponse = await chatApi.getHistory();
    console.log('✅ 历史记录:', historyResponse.success ? '成功' : '失败');
    if (historyResponse.history) {
      console.log(`   共 ${historyResponse.history.length} 条消息`);
    }

    // 测试2: 发送消息
    console.log('\n2️⃣ 测试发送消息...');
    const sendResponse = await chatApi.sendMessage({
      message: '你好，这是API集成测试'
    });
    console.log('✅ 发送消息:', sendResponse.success ? '成功' : '失败');
    if (sendResponse.message) {
      console.log('   AI回复:', sendResponse.message.content.substring(0, 50) + '...');
    }

    // 测试3: 再次获取历史，确认消息已添加
    console.log('\n3️⃣ 测试更新后的历史...');
    const updatedHistory = await chatApi.getHistory();
    if (updatedHistory.history) {
      console.log(`   更新后共 ${updatedHistory.history.length} 条消息`);
    }

    // 测试4: 清空历史
    console.log('\n4️⃣ 测试清空历史...');
    const clearResponse = await chatApi.clearHistory();
    console.log('✅ 清空历史:', clearResponse.success ? '成功' : '失败');

    console.log('\n🎉 所有API测试完成！');

  } catch (error) {
    console.error('❌ API测试失败:', error);
  }
}

// 仅在Node.js环境中运行
if (typeof window === 'undefined') {
  testAPI();
}
import dotenv from 'dotenv';

dotenv.config();

async function testSimplifiedForm() {
  // 测试简化后的表单数据（移除AppType和SchemeType）
  const formData = {
    SchemeName: '简化测试方案_' + Date.now(),
    AppName: '简化测试应用',
    PackName: 'com.example.simple',
    PackSign: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    OsType: '1', // Android (前端发送数字，后端转换)
    Origin: 'https://example.com',
    Url: 'https://example.com/auth'
  };

  try {
    console.log('测试简化表单提交...');
    console.log('表单数据:', formData);

    const response = await fetch('http://localhost:5178/api/create-scheme', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const result = await response.json();
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('✅ 简化表单集成测试成功！');
    } else {
      console.log('❌ 表单集成测试失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

testSimplifiedForm();
import React, { useState } from 'react';
import { Card, Form, Input, Select, message, Spin } from 'antd';

const { Option } = Select;

interface AuthScheme {
  id: string;
  schemeName: string;
  appName: string;
  osType: string;
  schemeCode: string;
  secretKey?: string;
  createdAt: string;
  uploadStatus?: 'success' | 'failed' | 'pending'; // 添加上传状态
  // 额外参数
  bundleId?: string;
  url?: string;
  origin?: string;
}

interface CreateSchemeProps {
  onSuccess?: (scheme: AuthScheme) => void;
  onCancel?: () => void;
}

const CreateScheme: React.FC<CreateSchemeProps> = ({ onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  
  // 监听接入端字段的变化
  const accessEnd = Form.useWatch('AccessEnd', form);

  // 处理应用名称变化
  const handleAppNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const appName = e.target.value;
    if (appName.includes('（') && appName.includes('）')) {
      const schemeName = appName.split('（')[0].trim();
      form.setFieldsValue({ SchemeName: schemeName });
    } else if (appName.includes('(') && appName.includes(')')) {
      const schemeName = appName.split('(')[0].trim();
      form.setFieldsValue({ SchemeName: schemeName });
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      console.log('创建方案:', values);

      // 调用后端API创建阿里云认证方案
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/create-scheme`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const result = await response.json();
        const schemeCode = result.data?.schemeCode;

        if (schemeCode) {
          // 获取秘钥 - 添加延迟和重试机制
          console.log('获取秘钥:', schemeCode);
          
          // 等待云服务处理创建的方案
          console.log('等待 2 秒让云服务处理方案创建...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          let secretKey = null;
          let retryCount = 0;
          const maxRetries = 3;
          const retryDelay = 3000; // 3秒延迟

          while (retryCount < maxRetries && !secretKey) {
            try {
              console.log(`尝试获取秘钥 (第${retryCount + 1}次)...`);
              
              const secretResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5178'}/api/query-scheme-secret`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ schemeCode }),
              });

              if (secretResponse.ok) {
                const secretResult = await secretResponse.json();
                secretKey = secretResult.data?.secretKey;
                
                if (secretKey && secretKey.trim() !== '') {
                  console.log('秘钥获取成功');
                  break;
                } else {
                  console.log('秘钥为空或无效，稍后重试');
                }
              } else {
                const errorData = await secretResponse.json();
                console.log(`获取秘钥失败 (${secretResponse.status}):`, errorData.error);
                
                // 如果是方案不存在的错误，继续重试
                if (errorData.error && errorData.error.includes('FC220000012490068')) {
                  console.log('方案可能还未完全创建，稍后重试...');
                } else {
                  // 其他错误直接跳出
                  break;
                }
              }
              
              retryCount++;
              if (retryCount < maxRetries && !secretKey) {
                console.log(`等待 ${retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            } catch (error) {
              console.error(`获取秘钥出错 (第${retryCount + 1}次):`, error);
              retryCount++;
              if (retryCount < maxRetries) {
                console.log(`等待 ${retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          }

          // 根据是否获取到秘钥显示不同消息
          if (secretKey) {
            // 创建方案对象
            const newScheme: AuthScheme = {
              id: Date.now().toString(),
              schemeName: values.SchemeName,
              appName: values.AppName,
              osType: values.AccessEnd,
              schemeCode: schemeCode,
              secretKey: secretKey,
              createdAt: new Date().toISOString(),
              uploadStatus: 'success',
              // 保存额外参数
              bundleId: values.AccessEnd === 'iOS' ? values.PackName : values.Url,
              url: values.AccessEnd === 'Web' ? values.Url : undefined,
              origin: values.AccessEnd === 'Web' ? values.Origin : undefined,
            };

            // 上传所有参数到接口
            console.log('上传参数到接口:', { schemeCode, secretKey });
            try {
              const uploadData: any = {
                name: values.SchemeName,
                code: schemeCode,
                appname: values.AppName,
                type: values.AccessEnd === 'iOS' ? 'ios' : 'h5',  // 转换为小写格式
                secret_key: secretKey
              };

              // 根据类型添加特定参数
              if (values.AccessEnd === 'iOS') {
                uploadData.bundle_id = values.PackName;
              } else if (values.AccessEnd === 'Web') {
                uploadData.bundle_id = values.Url;  // Web类型使用URL作为bundle_id
                uploadData.url = values.Url;
                uploadData.origin = values.Origin;
              }

              const uploadResponse = await fetch('https://api.mlgamebox.my16api.com/sdkIosOneLoginConfig', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(uploadData),
              });

              if (uploadResponse.ok) {
                console.log('参数上传成功');
              } else {
                console.log('参数上传失败:', uploadResponse.status);
                console.warn('参数上传失败:', uploadResponse.status);
              }
            } catch (uploadError) {
              console.warn('参数上传出错:', uploadError);
            }

            messageApi.success('认证方案创建成功，秘钥已获取！');
            form.resetFields();

            // 调用成功回调
            if (onSuccess) {
              onSuccess(newScheme);
            }
          } else {
            messageApi.warning('方案创建成功，但获取秘钥失败，请稍后手动刷新获取');
            // 仍然创建方案对象，但没有秘钥
            const newScheme: AuthScheme = {
              id: Date.now().toString(),
              schemeName: values.SchemeName,
              appName: values.AppName,
              osType: values.AccessEnd,
              schemeCode: schemeCode,
              createdAt: new Date().toISOString(),
              // 保存额外参数
              bundleId: values.AccessEnd === 'iOS' ? values.PackName : values.Url,
              url: values.AccessEnd === 'Web' ? values.Url : undefined,
              origin: values.AccessEnd === 'Web' ? values.Origin : undefined,
            };
            if (onSuccess) {
              onSuccess(newScheme);
            }
          }
        } else {
          messageApi.error('创建失败，无法获取方案代码');
        }
      } else {
        const errorData = await response.json();
        messageApi.error(errorData.error || '创建失败，请检查配置');
      }
    } catch (error) {
      console.error('创建方案失败:', error);
      messageApi.error('创建失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {contextHolder}
      <Card>
        <Spin spinning={loading} tip="正在创建方案...">
          <Form
          id="create-scheme-form"
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            AccessEnd: 'iOS',
            OsType: '2',
          }}
        >
          <Form.Item
            label="方案名称"
            name="SchemeName"
            rules={[{ required: true, message: '请输入方案名称' }]}
          >
            <Input placeholder="例如：APP登录认证" />
          </Form.Item>

          <Form.Item
            label="接入端"
            name="AccessEnd"
            rules={[{ required: true, message: '请选择接入端' }]}
          >
            <Select placeholder="选择接入端">
              <Option value="iOS">iOS</Option>
              <Option value="Web">Web</Option>
            </Select>
          </Form.Item>

          {accessEnd === 'iOS' && (
            <>
              <Form.Item
                label="应用名称"
                name="AppName"
                rules={[{ required: true, message: '请输入应用名称' }]}
              >
                <Input placeholder="例如：我的APP" onChange={handleAppNameChange} />
              </Form.Item>

              <Form.Item
                label="包名"
                name="PackName"
                rules={[{ required: true, message: '请输入包名' }]}
              >
                <Input placeholder="例如：com.example.myapp" />
              </Form.Item>
            </>
          )}

          {accessEnd === 'Web' && (
            <>
              <Form.Item
                label="应用名称"
                name="AppName"
                rules={[{ required: true, message: '请输入应用名称' }]}
              >
                <Input placeholder="例如：我的Web应用" onChange={handleAppNameChange} />
              </Form.Item>

              <Form.Item
                label="页面地址"
                name="Url"
                rules={[{ required: true, message: '请输入页面地址' }]}
              >
                <Input placeholder="https://example.com/" />
              </Form.Item>

              <Form.Item
                label="源地址"
                name="Origin"
                rules={[{ required: true, message: '请输入源地址' }]}
              >
                <Input placeholder="https://example.com" />
              </Form.Item>
            </>
          )}
        </Form>
        </Spin>
      </Card>
    </div>
  );
};

export default CreateScheme;
import React, { useState, useEffect } from 'react';
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
  status?: 'exists' | 'new'; // 添加方案状态：已存在或新创建
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

  // 当接入端变化时，更新OsType
  useEffect(() => {
    if (accessEnd) {
      form.setFieldsValue({ OsType: accessEnd });
    }
  }, [accessEnd, form]);

  // 处理应用名称变化
  const handleAppNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const appName = e.target.value;
    let schemeName = appName;
    
    // 如果应用名称包含"("，则取前面的部分
    if (appName.includes('(')) {
      schemeName = appName.split('(')[0].trim();
    }
    
    form.setFieldsValue({ SchemeName: schemeName });
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // 显式构建要发送的数据，确保数据纯净且结构正确
      const filteredValues: { [key: string]: any } = {
        SchemeName: values.SchemeName,
        AppName: values.AppName?.trim().replace(/[\r\n]+/g, ''),
        AccessEnd: values.AccessEnd,
        OsType: values.OsType || accessEnd,
      };

      if (values.AccessEnd === 'iOS') {
        filteredValues.PackName = values.PackName?.trim().replace(/[\r\n]+/g, '');
      } else if (values.AccessEnd === 'Web') {
        filteredValues.Url = values.Url?.trim().replace(/[\r\n]+/g, '');
        filteredValues.Origin = values.Origin?.trim().replace(/[\r\n]+/g, '');
      }

      console.log('创建方案 - 原始values:', values);
      console.log('创建方案 - 过滤后values:', filteredValues);

      // 获取bundleId用于检查
      const bundleId = filteredValues.AccessEnd === 'iOS' ? filteredValues.PackName : filteredValues.Url;

      if (!bundleId) {
        messageApi.error('缺少必要的Bundle ID / 页面地址信息');
        setLoading(false);
        return;
      }

      // 测试用：模拟创建失败
      if (filteredValues.SchemeName === 'test-fail') {
        console.log('测试：模拟创建失败');
        messageApi.error('创建失败，请稍后重试');
        setLoading(false);
        return;
      }

      // 1. 先调用上传接口检查bundle_id是否已存在
      console.log('检查bundle_id是否存在:', bundleId);
      try {
        const checkResponse = await fetch('https://api.mlgamebox.my16api.com/sdkIosOneLoginConfig', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bundle_id: bundleId }),
        });

        if (checkResponse.ok) {
          const checkResult = await checkResponse.json();
          console.log('bundle_id检查结果:', checkResult);

          // 检查业务逻辑
          if (checkResult && checkResult.status && checkResult.status.succeed === 1) {
            // succeed: 1 表示 bundle_id 已存在
            if (checkResult.data && typeof checkResult.data === 'object') {
              // data 存在，可以构建已存在的方案对象
              console.log('bundle_id已存在，创建已存在状态的方案对象');

              const existingScheme: AuthScheme = {
                id: `existing_${bundleId}_${Date.now()}`,
                schemeName: checkResult.data.name || filteredValues.SchemeName,
                appName: checkResult.data.appname || filteredValues.AppName,
                osType: filteredValues.AccessEnd,
                schemeCode: checkResult.data.code || '已存在',
                secretKey: checkResult.data.secret_key,
                createdAt: new Date().toISOString(),
                uploadStatus: 'success',
                status: 'exists', // 标记为已存在
                bundleId: bundleId,
                url: filteredValues.AccessEnd === 'Web' ? filteredValues.Url : undefined,
                origin: filteredValues.AccessEnd === 'Web' ? filteredValues.Origin : undefined,
              };

              messageApi.info('该方案已存在，已为您添加到列表中。');
              form.resetFields();
              setLoading(false);

              if (onSuccess) {
                onSuccess(existingScheme);
              }
              return; // 终止后续操作
            } else {
              // succeed: 1 但 data 为空，这是一种不明确的状态，为安全起见，终止操作
              messageApi.error('检查接口返回状态异常（succeed:1 但 data 为空），已终止创建。');
              setLoading(false);
              return;
            }
          }
          // succeed: 0 表示 bundle_id 不存在，可以继续创建，不做任何事
          console.log('bundle_id不存在，继续创建新方案。');
        } else {
          // HTTP请求本身失败，终止操作
          messageApi.error(`检查Bundle ID失败，HTTP状态: ${checkResponse.status}`);
          setLoading(false);
          return;
        }
      } catch (checkError) {
        console.error('bundle_id检查请求出错:', checkError);
        messageApi.error('检查Bundle ID时发生网络错误，已终止操作。');
        setLoading(false);
        return;
      }

      // 2. 调用后端API创建阿里云认证方案
      const apiBaseUrl = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:5178`;
      const response = await fetch(`${apiBaseUrl}/api/create-scheme`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filteredValues),
      });

      if (response.ok) {
        const result = await response.json();
        const schemeCode = result.data?.schemeCode;

        if (schemeCode) {
          // 3. 获取秘钥
          console.log('获取秘钥:', schemeCode);
          
          // 等待云服务处理创建的方案
          console.log('等待 3 秒让云服务处理方案创建...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          let secretKey = null;
          let retryCount = 0;
          const maxRetries = 5;
          const retryDelay = 5000; // 5秒延迟

          while (retryCount < maxRetries && !secretKey) {
            try {
              console.log(`尝试获取秘钥 (第${retryCount + 1}次)...`);
              
              const secretResponse = await fetch(`${apiBaseUrl}/api/query-scheme-secret`, {
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
                
                if (errorData.error && errorData.error.includes('FC220000012490068')) {
                  console.log('方案可能还未完全创建，稍后重试...');
                } else {
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

          // 4. 根据是否获取到秘钥，创建方案对象并上传
          if (secretKey) {
            const newScheme: AuthScheme = {
              id: schemeCode,
              schemeName: filteredValues.SchemeName,
              appName: filteredValues.AppName,
              osType: filteredValues.AccessEnd,
              schemeCode: schemeCode,
              secretKey: secretKey,
              createdAt: new Date().toISOString(),
              uploadStatus: 'pending', // 初始设为pending，上传后更新
              status: 'new',
              bundleId: bundleId,
              url: filteredValues.AccessEnd === 'Web' ? filteredValues.Url : undefined,
              origin: filteredValues.AccessEnd === 'Web' ? filteredValues.Origin : undefined,
            };

            // 上传所有参数到接口
            console.log('上传参数到接口:', { schemeCode, secretKey });
            try {
              const uploadData: any = {
                name: filteredValues.SchemeName,
                code: schemeCode,
                appname: filteredValues.AppName,
                type: filteredValues.AccessEnd === 'iOS' ? 'ios' : 'h5',
                secret_key: secretKey
              };

              if (filteredValues.AccessEnd === 'iOS') {
                uploadData.bundle_id = filteredValues.PackName;
              } else if (filteredValues.AccessEnd === 'Web') {
                uploadData.bundle_id = filteredValues.Url;
                uploadData.url = filteredValues.Url;
                uploadData.origin = filteredValues.Origin;
              }

              const uploadResponse = await fetch('https://api.mlgamebox.my16api.com/sdkIosOneLoginConfig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(uploadData),
              });

              if (uploadResponse.ok) {
                console.log('参数上传成功');
                newScheme.uploadStatus = 'success';
              } else {
                console.warn('参数上传失败:', uploadResponse.status);
                newScheme.uploadStatus = 'failed';
              }
            } catch (uploadError) {
              console.warn('参数上传出错:', uploadError);
              newScheme.uploadStatus = 'failed';
            }

            messageApi.success('认证方案创建成功，秘钥已获取！');
            form.resetFields();
            if (onSuccess) {
              onSuccess(newScheme);
            }
          } else {
            messageApi.warning('方案创建成功，但获取秘钥失败，请稍后手动刷新获取');
            const newScheme: AuthScheme = {
              id: schemeCode, // 使用 schemeCode 作为 ID
              schemeName: filteredValues.SchemeName,
              appName: filteredValues.AppName,
              osType: filteredValues.AccessEnd,
              schemeCode: schemeCode,
              createdAt: new Date().toISOString(),
              uploadStatus: 'failed', // 因为没有秘钥，所以上传失败
              status: 'new',
              bundleId: bundleId,
              url: filteredValues.AccessEnd === 'Web' ? filteredValues.Url : undefined,
              origin: filteredValues.AccessEnd === 'Web' ? filteredValues.Origin : undefined,
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
        if (errorData.error && errorData.error.includes('阿里云访问密钥未配置')) {
          messageApi.error({
            content: '阿里云访问密钥未配置，请先在服务器环境变量中配置 ALICLOUD_ACCESS_KEY_ID 和 ALICLOUD_ACCESS_KEY_SECRET',
            duration: 8,
          });
        } else {
          messageApi.error(errorData.error || '创建失败，请检查配置');
        }
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
            OsType: 'iOS',
          }}
        >
          <Form.Item
            label="方案名称"
            name="SchemeName"
            rules={[{ required: true, message: '请输入方案名称' }]}
          >
            <Input placeholder="根据应用名称自动生成" disabled />
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
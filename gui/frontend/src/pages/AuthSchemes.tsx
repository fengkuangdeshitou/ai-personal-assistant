import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, message, Typography, Table, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../utils/api';
import CreateScheme from './CreateScheme';

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

const AuthSchemes: React.FC = () => {
  const [schemes, setSchemes] = useState<AuthScheme[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingScheme, setEditingScheme] = useState<AuthScheme | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // 加载认证方案列表
  const loadSchemes = useCallback(async () => {
    try {
      // TODO: 从服务器获取方案列表
      // 暂时使用本地存储或模拟数据
      const savedSchemes = localStorage.getItem('authSchemes');
      if (savedSchemes) {
        const parsedSchemes = JSON.parse(savedSchemes);
        parsedSchemes.sort((a: AuthScheme, b: AuthScheme) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSchemes(parsedSchemes);
      }
    } catch (error) {
      console.error('加载方案列表失败:', error);
      messageApi.error('加载方案列表失败');
    }
  }, [messageApi]);

  // 复制秘钥到剪贴板
  const copySecretKey = async (secretKey: string) => {
    try {
      await navigator.clipboard.writeText(secretKey);
      messageApi.success('秘钥已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      messageApi.error('复制失败，请手动复制');
    }
  };

  // 重新上传方案
  const reuploadScheme = async (scheme: AuthScheme) => {
    try {
      // 检查必要参数
      if (!scheme.secretKey) {
        messageApi.error('该方案没有秘钥，无法上传');
        return;
      }

      if (scheme.osType === 'iOS' && !scheme.bundleId) {
        messageApi.error('该iOS方案缺少包名信息，请删除后重新创建方案');
        return;
      }

      if (scheme.osType === 'Web' && (!scheme.origin || !scheme.url)) {
        messageApi.error('Web方案缺少URL或Origin信息，无法上传');
        return;
      }

      messageApi.loading('正在重新上传方案...', 0);

      // 准备上传数据
      const uploadData: any = {
        name: scheme.schemeName,
        code: scheme.schemeCode,
        appname: scheme.appName,
        type: scheme.osType === 'iOS' ? 'ios' : 'h5',
        secret_key: scheme.secretKey
      };

      // 根据类型添加特定参数 - 确保所有类型都有bundle_id
      if (scheme.osType === 'iOS') {
        uploadData.bundle_id = scheme.bundleId;  // iOS必须有bundleId
      } else if (scheme.osType === 'Web') {
        uploadData.bundle_id = scheme.url || scheme.bundleId;  // Web使用URL作为bundle_id
        if (scheme.url) uploadData.url = scheme.url;
        if (scheme.origin) uploadData.origin = scheme.origin;
      }

      console.log('重新上传方案数据:', uploadData);

      const uploadResponse = await fetch('https://api.mlgamebox.my16api.com/sdkIosOneLoginConfig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadData),
      });

      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        if (result.status?.succeed === 1) {
          messageApi.destroy();
          messageApi.success('方案重新上传成功');

          // 更新方案状态为成功
          const updatedSchemes = schemes.map(s =>
            s.id === scheme.id ? { ...s, uploadStatus: 'success' as const } : s
          );
          updatedSchemes.sort((a: AuthScheme, b: AuthScheme) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          console.log('更新后状态:', updatedSchemes.find(s => s.id === scheme.id)?.uploadStatus);
          setSchemes(updatedSchemes);
          localStorage.setItem('authSchemes', JSON.stringify(updatedSchemes));
        } else {
          messageApi.destroy();
          messageApi.error(`重新上传失败: ${result.status?.error_desc || '未知错误'}`);
        }
      } else {
        const errorData = await uploadResponse.json().catch(() => ({}));
        messageApi.destroy();
        messageApi.error(`重新上传失败: ${errorData.error || uploadResponse.status}`);

        // 更新方案状态为失败
        const updatedSchemes = schemes.map(s =>
          s.id === scheme.id ? { ...s, uploadStatus: 'failed' as const } : s
        );
        setSchemes(updatedSchemes);
        localStorage.setItem('authSchemes', JSON.stringify(updatedSchemes));
      }
    } catch (error) {
      console.error('重新上传方案失败:', error);
      messageApi.destroy();
      messageApi.error('重新上传失败，请稍后重试');

      // 更新方案状态为失败
      const updatedSchemes = schemes.map(s =>
        s.id === scheme.id ? { ...s, uploadStatus: 'failed' as const } : s
      );
      setSchemes(updatedSchemes);
      localStorage.setItem('authSchemes', JSON.stringify(updatedSchemes));
    }
  };

  // 编辑方案
  const editScheme = (scheme: AuthScheme) => {
    setEditingScheme(scheme);
    setEditModalVisible(true);
  };

  // 保存编辑
  const saveEdit = () => {
    if (!editingScheme) return;

    const updatedSchemes = schemes.map(s =>
      s.id === editingScheme.id ? editingScheme : s
    );
    setSchemes(updatedSchemes);
    localStorage.setItem('authSchemes', JSON.stringify(updatedSchemes));
    setEditModalVisible(false);
    setEditingScheme(null);
    messageApi.success('方案信息已更新');
  };

  const refreshSecretKey = async (schemeCode: string) => {
    try {
      messageApi.loading('正在获取秘钥...', 0);
      
      const response = await fetch(`${getApiBaseUrl()}/api/query-scheme-secret`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schemeCode }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success === true && result.data?.secretKey) {
          messageApi.destroy();
          messageApi.success('秘钥获取成功');

          // 更新方案的秘钥
          const updatedSchemes = schemes.map(s =>
            s.schemeCode === schemeCode ? { ...s, secretKey: result.data.secretKey } : s
          );
          updatedSchemes.sort((a: AuthScheme, b: AuthScheme) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setSchemes(updatedSchemes);
          localStorage.setItem('authSchemes', JSON.stringify(updatedSchemes));

          // 找到对应的方案并重新上传
          const schemeToUpload = updatedSchemes.find(s => s.schemeCode === schemeCode);
          if (schemeToUpload) {
            await reuploadScheme(schemeToUpload);
          }
        } else {
          messageApi.destroy();
          messageApi.error('获取秘钥失败');
        }
      } else {
        messageApi.destroy();
        message.error('获取秘钥失败');
      }
    } catch (error) {
      console.error('获取秘钥失败:', error);
      message.destroy();
      message.error('获取秘钥失败');
    }
  };

  // 处理方案创建成功
  const handleSchemeCreated = (newScheme: AuthScheme) => {
    const updatedSchemes = [...schemes, newScheme];
    updatedSchemes.sort((a: AuthScheme, b: AuthScheme) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setSchemes(updatedSchemes);
    localStorage.setItem('authSchemes', JSON.stringify(updatedSchemes));
    setCreateModalVisible(false);
  };

  // 表格列定义
  const columns = [
    {
      title: '序号',
      key: 'index',
      align: 'center' as const,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '方案代码',
      dataIndex: 'schemeCode',
      key: 'schemeCode',
      align: 'center' as const,
    },
    {
      title: '方案名称',
      dataIndex: 'schemeName',
      key: 'schemeName',
      align: 'center' as const,
    },
    {
      title: '应用名称',
      dataIndex: 'appName',
      key: 'appName',
      align: 'center' as const,
    },
    {
      title: 'Bundle_id',
      dataIndex: 'bundleId',
      key: 'bundleId',
      align: 'center' as const,
      render: (bundleId: string) => bundleId || '-',
    },
    {
      title: '秘钥',
      dataIndex: 'secretKey',
      key: 'secretKey',
      align: 'center' as const,
      render: (secretKey: string, record: AuthScheme) => (
        secretKey ? (
          <Button
            size="small"
            type="text"
            icon={<span style={{ fontSize: '12px' }}>📋</span>}
            onClick={() => copySecretKey(secretKey)}
            title="复制秘钥"
          />
        ) : (
          <Button
            size="small"
            type="link"
            onClick={() => refreshSecretKey(record.schemeCode)}
          >
            获取秘钥
          </Button>
        )
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'center' as const,
      render: (status: string) => {
        if (status === 'exists') {
          return <span style={{ color: '#1890ff', fontWeight: 'bold' }}>已存在</span>;
        } else if (status === 'new') {
          return <span style={{ color: '#52c41a', fontWeight: 'bold' }}>新创建</span>;
        } else {
          return <span style={{ color: '#8c8c8c' }}>未知</span>;
        }
      },
    },
    {
      title: '操作',
      key: 'action',
      align: 'center' as const,
      render: (_: any, record: AuthScheme) => (
        <Space size="small">
          <Button
            size="small"
            onClick={() => editScheme(record)}
          >
            编辑
          </Button>
          {record.uploadStatus !== 'success' && (
            <Button
              size="small"
              onClick={() => reuploadScheme(record)}
            >
              重新上传
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // 初始化加载
  useEffect(() => {
    loadSchemes();
  }, [loadSchemes]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ color: "#1976d2", margin: 0 }}>认证方案管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalVisible(true)}
        >
          创建方案
        </Button>
      </div>

      <div style={{ flex: 1, overflow: "auto", backgroundColor: "white", borderRadius: "4px", padding: "16px", minHeight: "400px", marginTop: "20px", border: "1px solid rgba(0, 0, 0, 0.08)" }}>
        <Table
          columns={columns}
          dataSource={schemes}
          rowKey="id"
          pagination={false}
          style={{ backgroundColor: "white" }}
        />
      </div>

      {/* 创建方案模态框 */}
      <Modal
        title="创建认证方案"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={false}
            onClick={() => {
              // 触发表单提交
              const form = document.getElementById('create-scheme-form') as HTMLFormElement;
              if (form) {
                form.requestSubmit();
              }
            }}
          >
            确认
          </Button>
        ]}
        width={800}
        destroyOnHidden
      >
        <CreateScheme
          onSuccess={handleSchemeCreated}
          onCancel={() => setCreateModalVisible(false)}
        />
      </Modal>

      {/* 编辑方案模态框 */}
      <Modal
        title="编辑认证方案"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={saveEdit}>
            保存
          </Button>
        ]}
        width={600}
        destroyOnHidden
      >
        {editingScheme && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                方案名称
              </label>
              <Typography.Text>{editingScheme.schemeName}</Typography.Text>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                应用名称
              </label>
              <Typography.Text>{editingScheme.appName}</Typography.Text>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                平台类型
              </label>
              <Typography.Text>{editingScheme.osType}</Typography.Text>
            </div>

            {editingScheme.osType === 'iOS' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  包名 *
                </label>
                <input
                  type="text"
                  value={editingScheme.bundleId || ''}
                  onChange={(e) => setEditingScheme({ ...editingScheme, bundleId: e.target.value })}
                  placeholder="例如：com.example.myapp"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}

            {editingScheme.osType === 'Web' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    URL *
                  </label>
                  <input
                    type="text"
                    value={editingScheme.url || ''}
                    onChange={(e) => setEditingScheme({ ...editingScheme, url: e.target.value, bundleId: e.target.value })}
                    placeholder="例如：https://example.com"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                    Origin *
                  </label>
                  <input
                    type="text"
                    value={editingScheme.origin || ''}
                    onChange={(e) => setEditingScheme({ ...editingScheme, origin: e.target.value })}
                    placeholder="例如：https://example.com"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AuthSchemes;

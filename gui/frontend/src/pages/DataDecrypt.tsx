import React, { useState } from 'react';
import { Card, Input, Button, Typography, Space, Upload, message } from 'antd';
import { UnlockOutlined, CopyOutlined, ClearOutlined, UploadOutlined } from '@ant-design/icons';
import CryptoJS from 'crypto-js';
import ReactJson from 'react-json-view';

const { TextArea } = Input;
const { Text } = Typography;

const SDK_AES_KEY = '8&!%!9v8(&M127L=';
const BOX_AES_KEY = '2%!9vn8(&MK*49)_';

const aesDecrypt = (encryptText: string, aesKey: string): string => {
  const key = CryptoJS.enc.Utf8.parse(aesKey);
  const decrypted = CryptoJS.AES.decrypt(encryptText.trim(), key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
};

// 解析 Stream 抓包文件，提取请求体和响应体
const parseStreamFile = (content: string): { request: string; response: string } | null => {
  if (!content.includes('Request') || !content.includes('Response')) return null;
  let request = '';
  let response = '';

  const reqMatch = content.match(/请求内容 Request[\s\S]*?\n([\s\S]*?)(?=\n\d+\.\s*响应内容)/i);
  if (reqMatch) {
    const section = reqMatch[1];
    const bodyMatch = section.match(/\n\r?\n([\s\S]+)/);
    request = bodyMatch ? bodyMatch[1].trim() : '';
  }

  const resMatch = content.match(/响应内容 Response[\s\S]*?\n([\s\S]*?)(?=\n====|$)/i);
  if (resMatch) {
    const section = resMatch[1];
    const bodyMatch = section.match(/\n\r?\n([\s\S]+)/);
    response = bodyMatch ? bodyMatch[1].trim() : '';
  }

  return request || response ? { request, response } : null;
};

const DataDecrypt: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [outputJson, setOutputJson] = useState<object | null>(null);
  const [project, setProject] = useState<string | undefined>(undefined);
  const [streamData, setStreamData] = useState<{ request: string; response: string } | null>(null);
  const [streamMode, setStreamMode] = useState<'request' | 'response' | null>(null);

  const switchStreamMode = (mode: 'request' | 'response') => {
    setStreamMode(mode);
    setOutput('');
    setOutputJson(null);
    setInput(mode === 'request' ? streamData!.request : streamData!.response);
  };

  const handleDecrypt = () => {
    if (!input.trim()) {
      message.warning('请输入需要解密的数据');
      return;
    }
    if (!project) {
      message.warning('请选择项目');
      return;
    }
    try {
      let rawInput = input.trim();
      // 兼容 {"data": "..."} JSON 格式
      try {
        const parsed = JSON.parse(rawInput);
        if (parsed?.data) rawInput = parsed.data;
      } catch {}
      // 兼容 data=<value> form 格式
      if (/^data=/.test(rawInput)) {
        rawInput = decodeURIComponent(rawInput.replace(/^data=/, ''));
      }

      let result = '';
      if (project === 'sdk') {
        result = aesDecrypt(rawInput, SDK_AES_KEY);
      } else {
        result = aesDecrypt(rawInput, BOX_AES_KEY);
      }
      if (!result) {
        message.error('解密失败，请检查输入数据格式');
        return;
      }
      try {
        const parsed = JSON.parse(result);
        setOutputJson(parsed);
        setOutput('');
      } catch {
        setOutputJson(null);
        setOutput(result);
      }
    } catch (e) {
      message.error('解密失败，请检查输入数据格式');
    }
  };

  const handleCopy = () => {
    const text = outputJson ? JSON.stringify(outputJson, null, 2) : output;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => message.success('已复制到剪贴板'));
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setOutputJson(null);
    setStreamData(null);
    setStreamMode(null);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="解密配置">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space align="center">
              <Text>项目选择：</Text>
              <Button
                type={project === 'sdk' ? 'primary' : 'default'}
                onClick={() => setProject('sdk')}
              >
                SDK
              </Button>
              <Button
                type={project === 'box' ? 'primary' : 'default'}
                onClick={() => setProject('box')}
              >
                Box
              </Button>
            </Space>
            <Space>
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const content = e.target?.result as string;
                    // 尝试解析 Stream 抓包文件
                    const parsed = parseStreamFile(content);
                    if (parsed) {
                      setStreamData(parsed);
                      setStreamMode('response');
                      setInput(parsed.response);
                      setOutput('');
                      setOutputJson(null);
                      message.success('已解析 Stream 抓包文件');
                    } else {
                      // 普通文件：尝试提取 data 字段
                      setStreamData(null);
                      setStreamMode(null);
                      const jsonMatch = content.match(/\{"data":"([^"]+)"/);
                      if (jsonMatch) {
                        setInput(jsonMatch[1]);
                        message.success('已自动提取响应中的加密数据');
                      } else {
                        setInput(content);
                      }
                    }
                  };
                  reader.readAsText(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>上传</Button>
              </Upload>
              <Button type="primary" icon={<UnlockOutlined />} onClick={handleDecrypt}>
                解密
              </Button>
            </Space>
          </div>
        </Card>

        <Card
          title="输入数据"
          extra={
            <Space>
              {streamData && (
                <>
                  <Button
                    type={streamMode === 'request' ? 'primary' : 'default'}
                    onClick={() => switchStreamMode('request')}
                  >
                    Request
                  </Button>
                  <Button
                    type={streamMode === 'response' ? 'primary' : 'default'}
                    onClick={() => switchStreamMode('response')}
                  >
                    Response
                  </Button>
                </>
              )}
              <Button icon={<ClearOutlined />} onClick={handleClear}>
                清空
              </Button>
            </Space>
          }
        >
          <TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="请输入需要解密的数据..."
            rows={6}
            style={{ fontFamily: 'monospace' }}
          />
        </Card>

        {(outputJson || output) && (
          <Card
            title="解密结果"
            extra={
              <Button icon={<CopyOutlined />} size="small" onClick={handleCopy}>
                复制
              </Button>
            }
          >
            {outputJson ? (
              <ReactJson
                src={outputJson}
                name={false}
                collapsed={2}
                displayDataTypes={false}
                enableClipboard={false}
                style={{ fontFamily: 'monospace', fontSize: 13, background: '#fafafa', padding: 12 }}
              />
            ) : (
              <TextArea
                value={output}
                readOnly
                autoSize={{ minRows: 20 }}
                style={{ fontFamily: 'monospace', background: '#fafafa' }}
              />
            )}
          </Card>
        )}
      </Space>
    </div>
  );
};

export default DataDecrypt;

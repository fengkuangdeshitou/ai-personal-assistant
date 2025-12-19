import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, message, Spin, List } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import './GeminiChat.css';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'gemini';
  timestamp: Date;
}

const GeminiChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    inputRef.current?.focus();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const apiBaseUrl = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:5178`;
      const response = await fetch(`${apiBaseUrl}/api/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: inputValue }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();

      const geminiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'gemini',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, geminiMessage]);
    } catch (error) {
      message.error('发送消息失败，请重试');
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="gemini-chat">
      <Card
        title="Gemini AI 聊天"
        className="chat-card"
        bodyStyle={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}
      >
        <div className="messages-container">
          <List
            dataSource={messages}
            renderItem={(item) => (
              <List.Item className={`message-item ${item.sender}`}>
                <div className="message-content">
                  <div className="message-text">{item.text}</div>
                  <div className="message-time">
                    {item.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </List.Item>
            )}
          />
          {loading && (
            <div className="loading-indicator">
              <Spin size="small" />
              <span>Gemini 正在思考...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <Input.TextArea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入你的问题..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            loading={loading}
            disabled={!inputValue.trim()}
          >
            发送
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default GeminiChat;
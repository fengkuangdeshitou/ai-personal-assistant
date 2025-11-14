import React from 'react';

const Settings: React.FC = () => {
  return (
    <div className="container">
      <div className="header">
        <h1>⚙️ 设置</h1>
        <div className="subtitle">个性化您的AI助理</div>
      </div>

      <div className="settings-section">
        <h2>基本设置</h2>
        <div className="settings-form">
          <div className="form-group">
            <label>用户名</label>
            <input type="text" defaultValue="开发者" />
          </div>

          <div className="form-group">
            <label>GitHub用户名</label>
            <input type="text" placeholder="您的GitHub用户名" />
          </div>

          <div className="form-group">
            <label>GitHub仓库</label>
            <input type="text" placeholder="您的GitHub仓库名" />
          </div>

          <button className="save-btn">保存设置</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
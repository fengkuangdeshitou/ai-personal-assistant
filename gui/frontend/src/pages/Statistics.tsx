import React from 'react';

const Statistics: React.FC = () => {
  return (
    <div className="container">
      <div className="header">
        <h1>📊 数据统计</h1>
        <div className="subtitle">代码提交和生产力分析</div>
      </div>

      <div className="stats-section">
        <h2>今日概览</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📝</div>
            <div className="stat-content">
              <div className="stat-value" id="commits">--</div>
              <div className="stat-label">代码提交</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">➕</div>
            <div className="stat-content">
              <div className="stat-value" id="insertions">--</div>
              <div className="stat-label">新增行数</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">➖</div>
            <div className="stat-content">
              <div className="stat-value" id="deletions">--</div>
              <div className="stat-label">删除行数</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
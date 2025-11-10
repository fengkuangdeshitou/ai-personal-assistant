# OSS Bucket 配置总结

## 项目配置概览

### 1. react-agent-website (React Agent 网站)
- **开发环境**: `testagentmilu`
- **生产环境**: 
  - `iossign` (主)
  - `web99maiyou` (备用)
- **特点**: 支持多个生产环境 bucket

### 2. games-52-play-web (52玩游戏网站)
- **开发环境**: `test52wan`
- **生产环境**: `i52wan`

### 3. hg-bookmark (多渠道项目)

#### 渠道 1: 嘿咕游戏 (hg)
- **开发环境**: `hg-dev-placeholder` ⚠️ 待配置
- **生产环境**: `hg-prod-placeholder` ⚠️ 待配置

#### 渠道 2: 0.05折手游 (05)
- **开发环境**: `05-dev-placeholder` ⚠️ 待配置
- **生产环境**: `05-prod-placeholder` ⚠️ 待配置

#### 渠道 3: 0.01折游戏 (01)
- **开发环境**: `01-dev-placeholder` ⚠️ 待配置
- **生产环境**: `01-prod-placeholder` ⚠️ 待配置

#### 渠道 4: 惠爪游戏 (hz)
- **开发环境**: `hz-dev-placeholder` ⚠️ 待配置
- **生产环境**: `hz-prod-placeholder` ⚠️ 待配置

## 配置文件说明

### 单渠道项目配置
**文件**: `server/project-buckets.json`
```json
{
  "projects": {
    "项目名称": {
      "name": "显示名称",
      "buckets": {
        "dev": "开发环境bucket",
        "prod": "生产环境bucket" // 或 ["bucket1", "bucket2"]
      }
    }
  }
}
```

### 多渠道项目配置
**文件**: `server/channel-config.json`
```json
{
  "projects": {
    "项目名称": {
      "channels": {
        "渠道ID": {
          "name": "渠道名称",
          "buckets": {
            "dev": "开发环境bucket",
            "prod": "生产环境bucket"
          },
          "files": { /* 配置文件规则 */ }
        }
      }
    }
  }
}
```

### OSS 连接配置
**文件**: `server/oss-connection-config.json`
```json
{
  "connection": {
    "accessKeyId": "...",
    "accessKeySecret": "...",
    "region": "oss-cn-hangzhou"
  },
  "buckets": {
    "bucket名称": {
      "region": "oss-cn-hangzhou",
      "prefix": "路径前缀",
      "url": "访问地址",
      "description": "说明",
      "enabled": false  // 占位符bucket设为false
    }
  }
}
```

## 待完成配置

### hg-bookmark 项目需要提供以下信息：

1. **嘿咕游戏渠道**
   - [ ] 开发环境 bucket 名称
   - [ ] 生产环境 bucket 名称

2. **0.05折手游渠道**
   - [ ] 开发环境 bucket 名称
   - [ ] 生产环境 bucket 名称

3. **0.01折游戏渠道**
   - [ ] 开发环境 bucket 名称
   - [ ] 生产环境 bucket 名称

4. **惠爪游戏渠道**
   - [ ] 开发环境 bucket 名称
   - [ ] 生产环境 bucket 名称

### 配置步骤

1. 在 `oss-connection-config.json` 的 `buckets` 中添加实际 bucket 配置
2. 在 `channel-config.json` 中更新对应渠道的 bucket 名称
3. 重启服务器以加载新配置

## 使用方法

### 单渠道项目（react-agent-website, games-52-play-web）
1. 点击项目的 ☁️ 上传按钮
2. 选择环境（开发/生产）
3. 确认上传

### 多渠道项目（hg-bookmark）
1. 点击项目的 ☁️ 上传按钮
2. 选择渠道（嘿咕/0.05折/0.01折/惠爪）
3. 选择环境（开发/生产）
4. 确认上传

## 安全提示

⚠️ `oss-connection-config.json` 包含敏感信息，已添加到 `.gitignore`，请勿提交到代码仓库！

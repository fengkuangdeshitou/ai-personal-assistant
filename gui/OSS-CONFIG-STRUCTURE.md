# OSS 配置文件结构说明

## 文件: `server/oss-connection-config.json`

### 新的配置结构（按项目组织）

```json
{
  "connection": {
    "accessKeyId": "...",
    "accessKeySecret": "...",
    "region": "oss-cn-hangzhou"
  },
  "projects": {
    "项目名称": {
      "name": "显示名称",
      "buckets": {
        "dev": {
          "name": "bucket名称",
          "region": "区域",
          "prefix": "路径前缀",
          "url": "访问地址"
        },
        "prod": {
          "name": "bucket名称",
          "region": "区域",
          "prefix": "路径前缀",
          "url": "访问地址"
        }
      }
    }
  }
}
```

## 当前配置概览

### 1. react-agent-website
```
项目名称: React Agent Website
├── 开发环境 (dev)
│   └── testagentmilu
│       └── https://testagentmilu.oss-cn-hangzhou.aliyuncs.com
└── 生产环境 (prod) [支持多bucket]
    ├── iossign (主)
    │   └── https://iossign.oss-cn-hangzhou.aliyuncs.com
    └── web99maiyou (备用)
        └── https://web99maiyou.oss-cn-hangzhou.aliyuncs.com
```

### 2. games-52-play-web
```
项目名称: 52玩游戏网站
├── 开发环境 (dev)
│   └── test52wan
│       └── https://test52wan.oss-cn-hangzhou.aliyuncs.com
└── 生产环境 (prod)
    └── i52wan
        └── https://i52wan.oss-cn-hangzhou.aliyuncs.com
```

### 3. hg-bookmark (多渠道项目)
```
项目名称: 嘿咕书签游戏盒子
└── channels/
    ├── hg (嘿咕游戏)
    │   ├── dev: hg-dev-placeholder ⚠️ 待配置
    │   └── prod: hg-prod-placeholder ⚠️ 待配置
    ├── 05 (0.05折手游)
    │   ├── dev: 05-dev-placeholder ⚠️ 待配置
    │   └── prod: 05-prod-placeholder ⚠️ 待配置
    ├── 01 (0.01折游戏)
    │   ├── dev: 01-dev-placeholder ⚠️ 待配置
    │   └── prod: 01-prod-placeholder ⚠️ 待配置
    └── hz (惠爪游戏)
        ├── dev: hz-dev-placeholder ⚠️ 待配置
        └── prod: hz-prod-placeholder ⚠️ 待配置
```

## 配置优势

### ✅ 按项目组织
- 一眼就能看到某个项目的所有 bucket 配置
- 开发和生产环境配置放在一起，便于对比
- 结构清晰，易于维护

### ✅ 支持多种场景
- 单 bucket 项目（games-52-play-web）
- 多 bucket 项目（react-agent-website）
- 多渠道项目（hg-bookmark）

### ✅ 统一管理
- 所有 bucket 配置集中在一个文件
- OSS 连接信息（accessKeyId/accessKeySecret）只需配置一次
- 支持 prefix（路径前缀）和自定义 URL

## 如何添加新项目

### 单渠道项目示例：
```json
"new-project": {
  "name": "新项目名称",
  "buckets": {
    "dev": {
      "name": "dev-bucket-name",
      "region": "oss-cn-hangzhou",
      "prefix": "",
      "url": "https://dev-bucket-name.oss-cn-hangzhou.aliyuncs.com"
    },
    "prod": {
      "name": "prod-bucket-name",
      "region": "oss-cn-hangzhou",
      "prefix": "",
      "url": "https://prod-bucket-name.oss-cn-hangzhou.aliyuncs.com"
    }
  }
}
```

### 多 bucket 生产环境示例：
```json
"prod": [
  {
    "name": "prod-bucket-1",
    "region": "oss-cn-hangzhou",
    "prefix": "",
    "url": "https://prod-bucket-1.oss-cn-hangzhou.aliyuncs.com",
    "description": "主生产环境"
  },
  {
    "name": "prod-bucket-2",
    "region": "oss-cn-hangzhou",
    "prefix": "",
    "url": "https://prod-bucket-2.oss-cn-hangzhou.aliyuncs.com",
    "description": "备用生产环境"
  }
]
```

## 注意事项

1. **prefix 为空字符串**: 所有文件上传到 bucket 根目录
2. **enabled: false**: 占位符 bucket 会被拒绝上传
3. **敏感信息保护**: 该文件已加入 .gitignore，不会提交到 Git 仓库
4. **配置生效**: 修改配置后需要重启服务器

## 相关文件

- `server/oss-connection-config.json` - OSS 连接和 bucket 配置（按项目组织）
- `server/project-buckets.json` - 简单的项目-bucket 映射（用于前端显示）
- `server/channel-config.json` - 多渠道项目的文件配置规则

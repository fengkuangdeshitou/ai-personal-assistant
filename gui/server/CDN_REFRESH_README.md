# CDN缓存刷新工具

本工具用于刷新阿里云CDN缓存，确保网站内容及时更新。

## 文件说明

- `cdn-refresh.js` - Node.js版本的CDN刷新工具
- `cdn-refresh.sh` - Shell脚本版本的CDN刷新工具

## 刷新类型

脚本会对每个CDN域名执行两种类型的刷新：

1. **File** - 文件刷新：刷新特定的文件缓存
2. **Directory** - 目录刷新：刷新整个目录的缓存

每个域名都会依次执行这两种类型的刷新，确保全面的缓存清理。

## 功能特性

- ✅ 支持单渠道和多渠道项目
- ✅ 自动读取项目配置中的CDN域名
- ✅ 批量刷新多个CDN域名
- ✅ **实时进度显示** - 显示刷新百分比和状态
- ✅ 详细的日志输出和错误处理
- ✅ 彩色终端输出
- ✅ 自动安装和配置阿里云CLI
- ✅ 支持File和Directory两种刷新类型

## 使用方法

### Shell脚本版本

```bash
# 刷新单渠道项目
./cdn-refresh.sh react-agent-website

# 刷新多渠道项目的指定渠道
./cdn-refresh.sh hg-bookmark hg

# 刷新多渠道项目的所有渠道
./cdn-refresh.sh hg-bookmark

# 在非生产环境下强制执行（需要确认）
FORCE_PROD_CHECK=true ./cdn-refresh.sh react-agent-website

# 跳过备份检查执行
SKIP_BACKUP_CHECK=true ./cdn-refresh.sh react-agent-website

# 同时跳过所有安全检查
FORCE_PROD_CHECK=true SKIP_BACKUP_CHECK=true ./cdn-refresh.sh react-agent-website
```

### Node.js版本

```bash
# 刷新单渠道项目
node cdn-refresh.js react-agent-website

# 刷新多渠道项目的指定渠道
node cdn-refresh.js hg-bookmark hg
```

## 项目配置

CDN域名配置在 `oss-connection-config.json` 文件中：

### 单渠道项目
```json
{
  "projects": {
    "react-agent-website": {
      "buckets": {
        "cdnDomains": [
          "https://webbox.99maiyou.cn/",
          "https://web.99maiyou.cn/",
          "https://web.milu.com/"
        ]
      }
    }
  }
}
```

### 多渠道项目
```json
{
  "projects": {
    "hg-bookmark": {
      "channels": {
        "hg": {
          "buckets": {
            "cdnDomains": ["https://webbox.heigu.com/"]
          }
        },
        "05": {
          "buckets": {
            "cdnDomains": ["https://web.005zhegame.com/"]
          }
        }
      }
    }
  }
}
```

## 执行条件

CDN缓存刷新有严格的执行条件，确保只有在安全的情况下才会执行：

### 必须条件

1. **生产环境**: 只有在生产环境(`env=prod`)下才会自动触发CDN刷新
2. **备份成功**: 备份操作必须完全成功（所有存储桶备份成功）
3. **上传成功**: 文件上传到OSS必须成功

### 安全检查

脚本会在执行前进行以下安全检查：

- ✅ 验证当前环境是否为生产环境
- ✅ 检查备份操作是否全部成功
- ✅ 确认所有必要的配置都已正确设置

### 手动执行

如果需要在非生产环境下手动执行CDN刷新，可以使用环境变量跳过检查：

```bash
# 跳过生产环境检查
FORCE_PROD_CHECK=true ./cdn-refresh.sh project-name

# 跳过备份检查
SKIP_BACKUP_CHECK=true ./cdn-refresh.sh project-name

# 同时跳过所有检查
FORCE_PROD_CHECK=true SKIP_BACKUP_CHECK=true ./cdn-refresh.sh project-name
```

### 自动执行流程

在GUI管理后台部署项目时，系统会按以下顺序执行：

1. **构建项目** → 生成静态文件
2. **创建备份** → 将构建文件压缩并上传到OSS备份目录
3. **验证备份** → 确认所有存储桶备份成功
4. **生产部署** → 将文件上传到生产环境存储桶
5. **条件检查** → 验证环境和备份状态
6. **部署后任务** → 自动执行以下任务：
   - 📢 发送部署完成通知
   - 📝 更新项目版本信息
   - 📜 执行部署脚本（如果存在）
   - 🧹 清理旧版本文件
   - 🔄 **刷新CDN缓存** ← 现在会实时显示进度！

### 实时进度显示

部署完成后，您会在界面上看到实时的部署后任务执行情况：

```
生产环境部署完成
开始执行部署后任务...
执行任务: 部署通知 - 运行中...
执行任务: 部署通知 - 已完成
执行任务: 版本更新 - 运行中...
执行任务: 版本更新 - 已完成
执行任务: CDN刷新 - 运行中...
开始刷新 react-agent-website 的CDN缓存
发现 3 个CDN域名: https://webbox.99maiyou.cn/...
刷新域名: https://webbox.99maiyou.cn/ - 成功
CDN缓存刷新完成 - 成功: 3/3
执行任务: CDN刷新 - 已完成
部署后任务执行完成
```

## 依赖要求

- Node.js (用于读取配置)
- 阿里云CLI (脚本会自动安装)
- 有效的阿里云AK配置

## 输出示例

```
[INFO] 开始CDN缓存刷新 - 项目: react-agent-website
[INFO] 正在配置阿里云CLI...
[SUCCESS] 阿里云CLI配置完成
[INFO] 发现 3 个CDN域名: https://webbox.99maiyou.cn/ https://web.99maiyou.cn/ https://web.milu.com/

[INFO] 执行 File 类型刷新 for https://webbox.99maiyou.cn/
[INFO] 正在刷新CDN域名: https://webbox.99maiyou.cn/ (类型: File)
[SUCCESS] CDN域名 https://webbox.99maiyou.cn/ (File) 刷新请求成功，任务ID: 21876923345
[INFO] CDN域名 https://webbox.99maiyou.cn/ (File) 刷新中... 0% (尝试 1/30)
[INFO] CDN域名 https://webbox.99maiyou.cn/ (File) 刷新中... 50% (尝试 2/30)
[SUCCESS] CDN域名 https://webbox.99maiyou.cn/ (File) 刷新完成 (100%)

[INFO] 执行 Directory 类型刷新 for https://webbox.99maiyou.cn/
[INFO] 正在刷新CDN域名: https://webbox.99maiyou.cn/ (类型: Directory)
[SUCCESS] CDN域名 https://webbox.99maiyou.cn/ (Directory) 刷新请求成功，任务ID: 21876923346
[INFO] CDN域名 https://webbox.99maiyou.cn/ (Directory) 刷新中... 0% (尝试 1/30)
[INFO] CDN域名 https://webbox.99maiyou.cn/ (Directory) 刷新中... 100% (尝试 2/30)
[SUCCESS] CDN域名 https://webbox.99maiyou.cn/ (Directory) 刷新完成 (100%)

[INFO] 刷新完成 - 总操作: 6, 成功: 6, 失败: 0
[SUCCESS] 所有CDN域名刷新成功
```

## 故障排除

### 常见问题

**Q: 进度百分比显示为0%或不更新？**
A: 阿里云CDN刷新任务的进度百分比可能需要几秒钟才会开始更新。脚本会每10秒检查一次状态，最多等待5分钟。如果进度始终为0%，可能是阿里云API延迟或网络问题。

**Q: 刷新任务超时（超过5分钟）？**
A: CDN刷新任务可能需要更长时间，特别是在高峰期。可以通过修改脚本中的 `MAX_ATTEMPTS` 变量来增加等待时间。

**Q: 收到"任务不存在"错误？**
A: 任务ID可能已过期或无效。确保使用最新的任务ID，并且在任务完成后不要重复查询。

**Q: 阿里云CLI配置失败？**
A: 检查您的阿里云AccessKey和Secret是否正确，以及是否有CDN操作权限。运行 `aliyun configure` 重新配置。

**Q: 进度监控不工作？**
A: 确保安装了最新版本的阿里云CLI (`aliyun cdn DescribeRefreshTasks`)。如果API不可用，脚本会回退到无进度模式。

**Q: 提示"不是生产环境"无法执行？**
A: CDN刷新默认只在生产环境自动执行。如需在其他环境测试，使用 `FORCE_PROD_CHECK=true` 跳过检查。

**Q: 提示"备份未成功"无法执行？**
A: 确保备份操作完全成功后再执行部署。如需跳过备份检查，使用 `SKIP_BACKUP_CHECK=true`。

**Q: 如何在开发环境测试CDN刷新？**
A: 使用环境变量跳过安全检查：`FORCE_PROD_CHECK=true SKIP_BACKUP_CHECK=true ./cdn-refresh.sh 项目名`

**Q: 阿里云CLI安装失败？**
A: 请手动安装阿里云CLI：`curl -fsSL https://aliyuncli.alicdn.com/aliyun-cli-linux-latest.sh | bash`

**Q: 配置读取失败？**
A: 检查 `oss-connection-config.json` 文件是否存在且格式正确。确保项目名称与配置文件中的键匹配。

**Q: CDN刷新失败？**
A: 检查阿里云AK是否有CDN操作权限，以及CDN域名是否正确配置在阿里云CDN中。

**Q: 域名不存在？**
A: 确认CDN域名已正确配置在阿里云CDN中，并且与 `oss-connection-config.json` 中的配置一致。

## 进度监控说明

CDN缓存刷新是一个异步操作，可能需要几分钟到几十分钟才能完成。为了提供更好的用户体验，脚本实现了实时进度监控功能：

### 工作原理

1. **任务提交**: 脚本首先提交CDN刷新请求，获取任务ID
2. **状态轮询**: 每10秒查询一次阿里云API获取任务状态和进度百分比
3. **进度显示**: 实时显示当前进度百分比和尝试次数
4. **完成检测**: 当进度达到100%或任务状态为"Complete"时停止监控

### 进度百分比来源

进度百分比来自阿里云CDN的 `DescribeRefreshTasks` API，该API返回每个刷新任务的完成百分比。不同类型的刷新任务（File/Directory）可能有不同的进度更新频率。

### 超时处理

如果任务在5分钟（30次尝试）内未完成，脚本会停止监控但不影响实际的刷新操作。阿里云会在后台继续处理刷新任务。
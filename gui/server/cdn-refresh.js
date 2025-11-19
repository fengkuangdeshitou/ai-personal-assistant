#!/usr/bin/env node

/**
 * 阿里云CDN缓存刷新工具
 * 用于刷新指定项目的CDN缓存
 *
 * 使用方法:
 * node cdn-refresh.js [projectName] [channelId]
 *
 * 参数:
 * - projectName: 项目名称 (必需)
 * - channelId: 渠道ID (可选，对于多渠道项目)
 *
 * 示例:
 * node cdn-refresh.js react-agent-website
 * node cdn-refresh.js hg-bookmark hg
 */

import pkg from '@alicloud/openapi-client';
const OpenApiClient = pkg.default;
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取OSS配置
const configPath = join(__dirname, 'oss-connection-config.json');
const ossConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 获取阿里云配置
const accessKeyId = ossConfig.connection.accessKeyId;
const accessKeySecret = ossConfig.connection.accessKeySecret;

// 初始化客户端
const client = new OpenApiClient({
  accessKeyId: accessKeyId,
  accessKeySecret: accessKeySecret,
  regionId: 'cn-hangzhou',
});

// CDN刷新函数
async function refreshCDN(domainName, objectPath = '/', objectType = 'Directory') {
  try {
    console.log(`🔄 正在刷新CDN域名: ${domainName}, 路径: ${objectPath}, 类型: ${objectType}`);

    const params = {
      RegionId: 'cn-hangzhou',
      ObjectPath: objectPath,
      ObjectType: objectType,
    };

    const request = {
      method: 'POST',
      domain: 'cdn.aliyuncs.com',
      version: '2018-05-10',
      action: 'RefreshObjectCaches',
      authType: 'AK',
      bodyType: 'json',
      reqBodyType: 'json',
      protocol: 'https',
    };

    const response = await client.request(request.method, request.domain, request.version, request.action, request.authType, params, {}, request.bodyType, request.reqBodyType, request.protocol);

    console.log(`✅ CDN刷新成功: ${domainName} - 任务ID: ${response.RefreshTaskId}`);
    return { success: true, taskId: response.RefreshTaskId };

  } catch (error) {
    console.error(`❌ CDN刷新失败: ${domainName}`, error.message);
    return { success: false, error: error.message };
  }
}

// 获取项目CDN域名
function getProjectCDNDomains(projectName, channelId = null) {
  const projectConfig = ossConfig.projects[projectName];

  if (!projectConfig) {
    throw new Error(`项目 ${projectName} 不存在`);
  }

  let cdnDomains = [];

  // 检查是否是多渠道项目
  if (projectConfig.channels) {
    if (channelId) {
      // 指定渠道
      const channelConfig = projectConfig.channels[channelId];
      if (!channelConfig) {
        throw new Error(`渠道 ${channelId} 不存在`);
      }
      if (channelConfig.buckets?.cdnDomains) {
        cdnDomains = channelConfig.buckets.cdnDomains;
      } else {
        throw new Error(`渠道 ${channelId} 未配置CDN域名`);
      }
    } else {
      // 所有渠道
      for (const [chId, chConfig] of Object.entries(projectConfig.channels)) {
        if (chConfig.buckets?.cdnDomains) {
          cdnDomains.push(...chConfig.buckets.cdnDomains);
        }
      }
    }
  } else if (projectConfig.buckets?.cdnDomains) {
    // 单渠道项目
    cdnDomains = projectConfig.buckets.cdnDomains;
  }

  if (cdnDomains.length === 0) {
    throw new Error(`项目 ${projectName} 未配置CDN域名`);
  }

  return cdnDomains;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const projectName = args[0];
  const channelId = args[1];

  if (!projectName) {
    console.error('❌ 使用方法: node cdn-refresh.js <projectName> [channelId]');
    console.error('📝 示例:');
    console.error('   node cdn-refresh.js react-agent-website');
    console.error('   node cdn-refresh.js hg-bookmark hg');
    process.exit(1);
  }

  try {
    console.log(`🚀 开始CDN缓存刷新 - 项目: ${projectName}${channelId ? `, 渠道: ${channelId}` : ''}`);

    // 获取CDN域名
    const cdnDomains = getProjectCDNDomains(projectName, channelId);
    console.log(`📋 发现 ${cdnDomains.length} 个CDN域名:`, cdnDomains);

    // 刷新所有域名 - 分别执行File和Directory类型刷新
    const results = [];
    const refreshTypes = ['File', 'Directory'];

    for (const domain of cdnDomains) {
      for (const refreshType of refreshTypes) {
        console.log(`\n🔄 执行${refreshType}类型刷新 for ${domain}`);
        const result = await refreshCDN(domain, '/', refreshType);
        results.push({ domain, type: refreshType, ...result });
      }
    }

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalOperations = results.length;

    console.log(`\n📊 刷新完成 - 总操作: ${totalOperations}, 成功: ${successCount}, 失败: ${failCount}`);

    if (failCount > 0) {
      console.log('❌ 失败的操作:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.domain} (${r.type}): ${r.error}`);
      });
      process.exit(1);
    } else {
      console.log('✅ 所有CDN域名刷新成功');
    }

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { refreshCDN, getProjectCDNDomains };
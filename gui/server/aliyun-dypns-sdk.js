import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const Client = require('@alicloud/dypnsapi20170525').default;
const $Dypnsapi = require('@alicloud/dypnsapi20170525');
const $OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util').default;

/**
 * 创建阿里云Dypnsapi客户端
 * @param {string} accessKeyId - 阿里云访问密钥ID
 * @param {string} accessKeySecret - 阿里云访问密钥Secret
 * @returns {Client} 阿里云客户端实例
 */
export function createAliCloudClient(accessKeyId, accessKeySecret) {
  let config = new $OpenApi.Config({});
  config.accessKeyId = accessKeyId;
  config.accessKeySecret = accessKeySecret;
  return new Client(config);
}

/**
 * 创建阿里云认证方案
 * @param {string} accessKeyId - 阿里云访问密钥ID
 * @param {string} accessKeySecret - 阿里云访问密钥Secret
 * @param {Object} schemeData - 方案数据
 * @param {string} schemeData.schemeName - 方案名称
 * @param {string} schemeData.appName - 应用名称
 * @param {string} schemeData.osType - 操作系统类型 ('iOS' 或 'Web')
 * @param {string} [schemeData.bundleId] - iOS应用包ID (iOS必传)
 * @param {string} [schemeData.origin] - Web应用源地址 (Web必传)
 * @param {string} [schemeData.url] - Web应用页面地址 (Web必传)
 * @returns {Promise<Object>} API响应结果
 */
export async function createVerifyScheme(accessKeyId, accessKeySecret, schemeData) {
  try {
    // 创建客户端
    const client = createAliCloudClient(accessKeyId, accessKeySecret);

    // 创建请求对象
    let request = new $Dypnsapi.CreateVerifySchemeRequest({});

    // 设置基本参数（所有类型都必须）
    request.schemeName = schemeData.schemeName;
    request.appName = schemeData.appName;
    request.osType = schemeData.osType;

    // 根据类型设置特定参数
    if (schemeData.osType === 'iOS') {
      request.bundleId = schemeData.bundleId; // iOS必传BundleId
    } else if (schemeData.osType === 'Web') {
      request.origin = schemeData.origin; // Web必传Origin
      request.url = schemeData.url; // Web必传Url
    }

    console.log('正在调用阿里云CreateVerifyScheme API...');
    console.log('请求参数:', {
      schemeName: request.schemeName,
      osType: request.osType,
      appName: request.appName,
      bundleId: request.bundleId,
      origin: request.origin,
      url: request.url
    });

    // 调用API
    let response = await client.createVerifyScheme(request);

    console.log('API调用成功!');
    console.log('响应结果:', JSON.stringify(response, null, 2));

    // 检查响应
    let code = response.body.code;
    if (Util.equalString(code, "OK")) {
      console.log('\n=== 认证方案创建成功 ===');
      console.log('方案ID:', response.body.gateVerifySchemeDTO?.schemeCode);
      console.log('请求ID:', response.body.requestId);

      return {
        success: true,
        data: {
          schemeCode: response.body.gateVerifySchemeDTO?.schemeCode,
          schemeName: schemeData.schemeName,
          osType: request.osType,
          requestId: response.body.requestId
        }
      };
    } else {
      const errorMsg = response.body?.message || '未知错误';
      console.error('API调用失败:', errorMsg);
      return {
        success: false,
        error: `阿里云API调用失败: ${errorMsg}`
      };
    }

  } catch (error) {
    console.error('创建认证方案失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
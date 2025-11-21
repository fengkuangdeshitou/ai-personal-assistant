#!/usr/bin/env node

// 测试后端API参数处理 - 使用AccessEnd字段
const testData = {
  AccessEnd: 'iOS',
  SchemeName: '测试iOS方案',
  AppName: '测试APP',
  PackName: 'com.example.testapp'
};

console.log('测试iOS方案参数处理 (使用AccessEnd):');
console.log('输入数据:', testData);

// 模拟参数处理逻辑
const schemeType = testData.AccessEnd;
let convertedOsType;
if (schemeType === 'iOS') {
  convertedOsType = '2'; // iOS - 使用数字值
} else if (schemeType === 'H5') {
  convertedOsType = '1'; // Android - H5默认使用Android
} else {
  convertedOsType = '1'; // Android - 默认值，使用数字值
}

const params = {
  SchemeName: testData.SchemeName,
  OsType: convertedOsType,
  SchemeType: '1'  // 方案类型：1-短信认证
};

if (schemeType === 'iOS') {
  params.AppType = '2'; // 应用类型：2-App
  params.AuthType = '1'; // 认证类型：1-短信认证（关键认证方案）
  if (testData.AppName) {
    params.AppName = testData.AppName;
  }
  if (testData.PackName) {
    params.BundleId = testData.PackName;
  }
}

const cleanParams = Object.fromEntries(
  Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
);

console.log('处理后的参数:', cleanParams);

console.log('\n测试H5方案参数处理 (使用AccessEnd):');
const testDataH5 = {
  AccessEnd: 'H5',
  SchemeName: '测试H5方案',
  AppName: '测试H5应用',
  Url: 'https://example.com/auth',
  Origin: 'https://example.com'
};

console.log('输入数据:', testDataH5);

const schemeTypeH5 = testDataH5.AccessEnd;
let convertedOsTypeH5;
if (schemeTypeH5 === 'iOS') {
  convertedOsTypeH5 = '2'; // iOS - 使用数字值
} else if (schemeTypeH5 === 'H5') {
  convertedOsTypeH5 = '1'; // Android - H5默认使用Android
} else {
  convertedOsTypeH5 = '1'; // Android - 默认值，使用数字值
}

const paramsH5 = {
  SchemeName: testDataH5.SchemeName,
  OsType: convertedOsTypeH5,
  SchemeType: '1'  // 方案类型：1-短信认证
};

if (schemeTypeH5 === 'H5') {
  paramsH5.AppType = '5'; // 应用类型：5-H5
  paramsH5.AuthType = '1'; // 认证类型：1-短信认证（关键认证方案）
  if (testDataH5.AppName) {
    paramsH5.AppName = testDataH5.AppName;
  }
  if (testDataH5.Origin) {
    paramsH5.Origin = testDataH5.Origin;
  }
  if (testDataH5.Url) {
    paramsH5.Url = testDataH5.Url;
  }
}

const cleanParamsH5 = Object.fromEntries(
  Object.entries(paramsH5).filter(([_, v]) => v !== undefined && v !== null && v !== '')
);

console.log('处理后的参数:', cleanParamsH5);
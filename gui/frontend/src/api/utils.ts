// 设备检测工具函数

/**
 * 检测是否为鸿蒙系统
 * @returns boolean - 是否为鸿蒙系统
 */
export const isHarmonyOS = (): boolean => {
  if (typeof navigator === 'undefined' || !navigator.userAgent) {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  // 鸿蒙系统的特征字符串
  const harmonyOSKeywords = [
    'harmonyos',
    'harmony',
    'huawei',
    'honor'
  ];

  // 检查是否包含鸿蒙相关的关键词
  return harmonyOSKeywords.some(keyword => userAgent.includes(keyword));
};

/**
 * 获取设备信息
 * @returns object - 设备信息对象
 */
export const getDeviceInfo = () => {
  const userAgent = navigator.userAgent;

  return {
    userAgent,
    isHarmonyOS: isHarmonyOS(),
    platform: navigator.platform,
    language: navigator.language,
    isMobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent),
    isIOS: /iphone|ipad|ipod/i.test(userAgent),
    isAndroid: /android/i.test(userAgent),
    isWindows: /windows/i.test(userAgent),
    isMac: /mac/i.test(userAgent),
    isLinux: /linux/i.test(userAgent)
  };
};
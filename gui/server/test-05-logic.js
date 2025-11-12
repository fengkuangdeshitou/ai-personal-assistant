// 测试05通道规则
let content = `export const prod = true;
// export const url = '//api52wan.001zhegame.com';
export const url = '//api.gamebox.05zhegame.com';
// 0.01 和 0.05 惠爪 共用同一个域名`;

console.log('05通道测试 - 原始内容:');
console.log(repr(content));
console.log();

// 05渠道的规则
const rules = [
  {
    "action": "comment",
    "pattern": "^\\s*(export const url = '//api52wan\\.001zhegame\\.com';?)\\s*$"
  },
  {
    "action": "comment",
    "pattern": "^\\s*(export const url = '//api\\.gamebox\\.05zhegame\\.com';?)\\s*$"
  },
  {
    "action": "uncomment",
    "pattern": "^\\s*//\\s*(export const url = '//api\\.gamebox\\.05zhegame\\.com';?)\\s*$"
  }
];

let modified = false;

console.log('测试正则表达式匹配:');
for (let i = 0; i < rules.length; i++) {
  const rule = rules[i];
  const regex = new RegExp(rule.pattern, 'gm');
  const matches = [...content.matchAll(regex)];
  console.log(`规则 ${i+1} (${rule.action}): 匹配 ${matches.length} 次`);
  if (matches.length > 0) {
    matches.forEach((match, idx) => {
      console.log(`  匹配 ${idx+1}: ${repr(match[0])}`);
      if (match[1]) console.log(`    捕获组: ${repr(match[1])}`);
    });
  }
}
console.log();

for (const rule of rules) {
  const regex = new RegExp(rule.pattern, 'gm');

  if (rule.action === 'comment') {
    // 添加注释（如果还没有注释）
    const newContent = content.replace(regex, (match, captured) => {
      console.log(`注释规则匹配: ${repr(match)}, 捕获: ${repr(captured)}`);
      // 检查captured是否已经被注释
      const trimmedCaptured = captured.trim();
      if (trimmedCaptured.startsWith('//') || trimmedCaptured.startsWith('<!--')) {
        console.log('  已经是注释，跳过');
        return match; // 已经是注释了，保持原样
      }
      modified = true;
      console.log('  添加注释');
      // 根据文件类型选择注释符号
      return `// ${captured}`;
    });
    content = newContent;
  } else if (rule.action === 'uncomment') {
    // 移除注释 - 处理多层注释的情况
    const newContent = content.replace(regex, (match, captured) => {
      console.log(`取消注释规则匹配: ${repr(match)}, 捕获: ${repr(captured)}`);
      let result = captured;

      // 处理多层注释：从外层向内层逐层移除注释
      while (result.trim().startsWith('//')) {
        result = result.replace(/^(\s*)\/\/\s*/, '$1');
      }

      modified = true;
      console.log(`  取消注释结果: ${repr(result)}`);
      return result;
    });
    content = newContent;
  }
}

console.log();
console.log('最终结果:');
console.log(`是否修改: ${modified}`);
console.log('最终内容:');
console.log(repr(content));

function repr(str) {
  return JSON.stringify(str);
}
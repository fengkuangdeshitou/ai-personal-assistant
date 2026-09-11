#!/bin/bash
# 配置检查脚本

echo "🔍 配置诊断工具"
echo "========================"
echo ""

cd "$(dirname "$0")"

echo "1. 检查 OSS 公开配置..."
if [ -f "oss-connection-config.json" ]; then
    echo "✅ 发现 oss-connection-config.json"
    python3 - <<'PY'
import json
from pathlib import Path
cfg = json.loads(Path('oss-connection-config.json').read_text())
print(f"✅ region: {(cfg.get('connection') or {}).get('region')}")
print(f"✅ projects: {len(cfg.get('projects') or {})} 个")
PY
else
    echo "❌ 未发现 oss-connection-config.json"
fi

echo ""
echo "2. 检查 OSS 凭证文件..."
if [ -f "oss-credentials.json" ]; then
    echo "✅ 发现 oss-credentials.json"
    python3 - <<'PY'
import json
from pathlib import Path
creds = json.loads(Path('oss-credentials.json').read_text())
ak = (creds.get('accessKeyId') or (creds.get('connection') or {}).get('accessKeyId') or '').strip()
sk = (creds.get('accessKeySecret') or (creds.get('connection') or {}).get('accessKeySecret') or '').strip()
ok = bool(ak and sk and not ak.startswith('YOUR_') and not sk.startswith('YOUR_'))
print(('✅' if ok else '❌') + ' accessKeyId/Secret ' + ('已配置' if ok else '未配置或仍为占位符'))
PY
else
    echo "❌ 未发现 oss-credentials.json"
fi

echo ""
echo "3. 检查服务状态..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "✅ Node.js服务正在运行"
    PID=$(pgrep -f "node.*server.js" | head -1)
    echo "   PID: $PID"
else
    echo "❌ Node.js服务未运行"
fi

echo ""
echo "4. 测试 API..."
if command -v curl >/dev/null 2>&1; then
    if curl -s --max-time 5 http://localhost:5178/api/health >/dev/null 2>&1; then
        echo "✅ API服务响应正常"
    else
        echo "❌ API服务无响应"
    fi
else
    echo "⚠️  curl未安装，跳过API测试"
fi

echo ""
echo "💡 诊断完成"

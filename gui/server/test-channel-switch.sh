#!/bin/bash

echo "测试频道切换功能..."

# 测试所有频道
channels=("hg" "05" "01" "hz")
expected_urls=(
    "//api52wan.001zhegame.com"
    "//api.gamebox.05zhegame.com"
    "//api.gamebox.05zhegame.com"
    "//api.gamebox.05zhegame.com"
)

for i in "${!channels[@]}"; do
    channel="${channels[$i]}"
    expected_url="${expected_urls[$i]}"

    echo "测试切换到 $channel 频道..."
    response=$(curl -s -X POST http://localhost:5178/api/switch-channel -H "Content-Type: application/json" -d "{\"projectName\":\"hg-bookmark\",\"channel\":\"$channel\"}")

    if echo "$response" | grep -q '"ok":true'; then
        echo "✓ API调用成功"

        # 检查env.js文件内容
        if grep -q "$expected_url" /Users/maiyou001/Project/hg-bookmark/src/env.js; then
            echo "✓ env.js文件内容正确 ($expected_url)"
        else
            echo "✗ env.js文件内容不正确"
            echo "当前内容:"
            cat /Users/maiyou001/Project/hg-bookmark/src/env.js
        fi
    else
        echo "✗ API调用失败"
        echo "响应: $response"
    fi

    echo "---"
done

echo "测试完成！"
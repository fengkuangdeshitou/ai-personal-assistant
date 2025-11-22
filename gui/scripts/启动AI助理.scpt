#!/usr/bin/osascript

# AI 助理 - AppleScript 启动器
# 双击此文件即可启动 AI 助理

set projectPath to (do shell script "dirname " & quoted form of POSIX path of (path to me))

# 检查并启动后端服务
try
    do shell script "lsof -i :5178"
on error
    # 后端未运行，启动它
    do shell script "cd " & quoted form of projectPath & "/server && node server.js > /tmp/ai-assistant-server.log 2>&1 &"
    delay 2
end try

# 检查并启动React前端应用
try
    do shell script "pgrep -f react-scripts"
on error
    # React应用未运行，启动它
    do shell script "cd " & quoted form of projectPath & "/frontend && npm start > /tmp/ai-assistant-frontend.log 2>&1 &"
    delay 10
end try

# 打开浏览器访问React应用
tell application "Google Chrome"
    activate
    open location "http://localhost:3000"
end tell

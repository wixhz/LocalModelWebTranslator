#!/bin/zsh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OLD_PLIST="$HOME/Library/LaunchAgents/com.local-qwen-translator.proxy.plist"
PLIST="$HOME/Library/LaunchAgents/com.local-model-translator.proxy.plist"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"

if [[ -z "$NODE_BIN" || -z "$NPM_BIN" ]]; then
  echo "没有找到 node/npm。请先安装 Node.js。"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.local-model-translator.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>run</string>
    <string>proxy</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/local-model-translator-proxy.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/local-model-translator-proxy.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
EOF

launchctl unload "$OLD_PLIST" >/dev/null 2>&1 || true
rm -f "$OLD_PLIST"
launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"

echo "本地翻译代理已安装并启动。"
echo "代理地址：http://127.0.0.1:8787/translate"
echo "健康检查：http://127.0.0.1:8787/health"
echo
echo "如果浏览器插件已经加载，请到 chrome://extensions 重新加载 Local Model Translator。"
read -r "?按回车关闭窗口..."

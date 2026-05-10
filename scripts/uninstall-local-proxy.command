#!/bin/zsh
set -e

OLD_PLIST="$HOME/Library/LaunchAgents/com.local-qwen-translator.proxy.plist"
PLIST="$HOME/Library/LaunchAgents/com.local-model-translator.proxy.plist"

launchctl unload "$OLD_PLIST" >/dev/null 2>&1 || true
launchctl unload "$PLIST" >/dev/null 2>&1 || true
rm -f "$OLD_PLIST"
rm -f "$PLIST"

echo "本地翻译代理已卸载。"
read -r "?按回车关闭窗口..."

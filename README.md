# 本地模型划词翻译插件

Chrome/Edge 划词翻译插件。选中网页文字后，调用本机模型翻译，并携带选中文字前后上下文提升准确度。

## 准备

- 已安装 Chrome 或 Edge。
- 本机已安装并能运行本地模型服务，推荐使用 Ollama。
- 本机已安装 Node.js 和 npm。

如果使用 Ollama，先确认模型能运行：

```sh
ollama serve
ollama run qwen2.5:7b
```

## 一次性安装

1. 双击运行 `scripts/install-local-proxy.command`，安装本地翻译代理。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目里的 `extension` 文件夹。

## 日常使用

1. 打开任意网页。
2. 鼠标选中文字。
3. 点击浮层里的 `译`。
4. 在插件 popup 里可随时切换当前本地模型。

右键菜单里的 `Translate selected text` 也可以翻译当前选区。

## 切换本地模型

打开插件 popup，使用 `Current model` 下拉框切换模型。

需要维护候选模型列表时，进入 Settings 页面，在 `Model list` 中每行填写一个模型名，例如：

```text
qwen2.5:7b
qwen3:8b
llama3.1:8b
```

当前模型由 `Model` 字段决定，翻译请求会使用这个模型名。

## 默认配置

- Provider: `Local proxy /translate`
- Endpoint: `http://127.0.0.1:8787/translate`
- Upstream: `http://localhost:11434/api/chat`
- Model: `qwen2.5:7b`

## 常见问题

### Failed to fetch

表示插件没有连上本地代理。

处理方式：

1. 重新双击 `scripts/install-local-proxy.command`。
2. 打开 `http://127.0.0.1:8787/health`，能看到 JSON 即正常。
3. 到 `chrome://extensions` 重新加载 `Local Model Translator`。

### Local model request failed: 403

通常是插件直连 Ollama 被 Origin 校验拦截。请使用默认配置：

- Provider: `Local proxy /translate`
- Endpoint: `http://127.0.0.1:8787/translate`

## 卸载本地代理

双击运行：

```text
scripts/uninstall-local-proxy.command
```

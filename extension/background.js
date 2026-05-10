const DEFAULT_SETTINGS = {
  provider: "local-proxy",
  endpoint: "http://127.0.0.1:8787/translate",
  model: "qwen2.5:7b",
  models: "qwen2.5:7b",
  targetLanguage: "中文",
  sourceLanguage: "auto",
  temperature: 0.2,
  maxChars: 5000
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate selected text",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "translate-selection" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "LOCAL_TRANSLATOR_TRANSLATE_SELECTION",
    text: info.selectionText || ""
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LOCAL_TRANSLATOR_TRANSLATE") {
    translate(message.text, message.context)
      .then((translation) => sendResponse({ ok: true, translation }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LOCAL_TRANSLATOR_GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LOCAL_TRANSLATOR_SET_MODEL") {
    setCurrentModel(message.model)
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function setCurrentModel(model) {
  const nextModel = String(model || "").trim();
  if (!nextModel) {
    throw new Error("Model name is required.");
  }

  const settings = await getSettings();
  const models = parseModelList(settings.models);
  if (!models.includes(nextModel)) {
    models.push(nextModel);
  }

  const nextSettings = {
    model: nextModel,
    models: models.join("\n")
  };

  await chrome.storage.sync.set(nextSettings);
  return { ...settings, ...nextSettings };
}

function parseModelList(models) {
  return String(models || "")
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function describeNetworkError(error, settings) {
  if (!/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
    return error;
  }

  if (settings.provider === "local-proxy") {
    return new Error(
      [
        "无法连接本地翻译代理。",
        `请先在项目目录运行 npm run proxy，并确认插件设置里的 Endpoint 是 ${settings.endpoint}。`,
        "如果代理已经启动，请在 chrome://extensions 重新加载此扩展后再试。"
      ].join(" ")
    );
  }

  return new Error(
    [
      "无法连接本地模型服务。",
      `请确认模型服务已经启动，并且 Endpoint ${settings.endpoint} 可以访问。`
    ].join(" ")
  );
}

async function translate(rawText, rawContext = {}) {
  const settings = await getSettings();
  const text = String(rawText || "").trim();
  const context = normalizeContext(rawContext);

  if (!text) {
    throw new Error("No selected text to translate.");
  }

  if (text.length > settings.maxChars) {
    throw new Error(`Selected text is too long. Limit: ${settings.maxChars} characters.`);
  }

  if (settings.provider === "local-proxy") {
    try {
      return await requestLocalProxy(settings, text, context);
    } catch (error) {
      throw describeNetworkError(error, settings);
    }
  }

  if (settings.provider === "openai-compatible") {
    try {
      return await requestOpenAICompatible(settings, text, context);
    } catch (error) {
      throw describeNetworkError(error, settings);
    }
  }

  try {
    return await requestOllama(settings, text, context);
  } catch (error) {
    if (shouldRetryViaProxy(settings, error)) {
      return requestLocalProxy(
        {
          ...settings,
          endpoint: DEFAULT_SETTINGS.endpoint
        },
        text,
        context
      );
    }

    throw describeNetworkError(error, settings);
  }
}

function normalizeContext(context) {
  return {
    before: String(context?.before || "").slice(-1200),
    after: String(context?.after || "").slice(0, 1200),
    pageTitle: String(context?.pageTitle || "").slice(0, 200)
  };
}

async function requestLocalProxy(settings, text, context) {
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      context,
      settings: {
        model: settings.model,
        targetLanguage: settings.targetLanguage,
        sourceLanguage: settings.sourceLanguage,
        temperature: settings.temperature
      }
    })
  });

  const data = await readJson(response);
  return data?.translation?.trim() || "";
}

function shouldRetryViaProxy(settings, error) {
  return (
    settings.provider === "ollama" &&
    settings.endpoint === "http://localhost:11434/api/chat" &&
    /403/.test(error.message)
  );
}

function buildPrompt(settings, text, context = {}) {
  const source = settings.sourceLanguage === "auto" ? "the detected source language" : settings.sourceLanguage;
  return [
    `Translate only the selected text from ${source} to ${settings.targetLanguage}.`,
    "Use the surrounding context to choose the correct meaning, terminology, tone, and pronouns.",
    "Do not translate the surrounding context itself.",
    "Keep names, code, URLs, numbers, and formatting faithful.",
    "Return only the translation, with no explanation.",
    "",
    `Page title: ${context.pageTitle || "(unknown)"}`,
    "",
    "Context before selection:",
    context.before || "(none)",
    "",
    "Selected text to translate:",
    text,
    "",
    "Context after selection:",
    context.after || "(none)"
  ].join("\n");
}

async function requestOllama(settings, text, context) {
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You are a precise translation engine."
        },
        {
          role: "user",
          content: buildPrompt(settings, text, context)
        }
      ],
      options: {
        temperature: Number(settings.temperature)
      }
    })
  });

  const data = await readJson(response);
  return data?.message?.content?.trim() || data?.response?.trim() || "";
}

async function requestOpenAICompatible(settings, text, context) {
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      temperature: Number(settings.temperature),
      messages: [
        {
          role: "system",
          content: "You are a precise translation engine."
        },
        {
          role: "user",
          content: buildPrompt(settings, text, context)
        }
      ]
    })
  });

  const data = await readJson(response);
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function readJson(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Local model returned non-JSON response: ${text.slice(0, 160)}`);
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `Local model request failed: ${response.status}`);
  }

  return data;
}

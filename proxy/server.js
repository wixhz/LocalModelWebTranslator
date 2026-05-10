const http = require("node:http");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const UPSTREAM_PROVIDER = process.env.UPSTREAM_PROVIDER || "ollama";
const UPSTREAM_ENDPOINT = process.env.UPSTREAM_ENDPOINT || "http://localhost:11434/api/chat";

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      provider: UPSTREAM_PROVIDER,
      upstreamEndpoint: UPSTREAM_ENDPOINT
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/translate") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const text = String(body.text || "").trim();
    const context = normalizeContext(body.context);
    const settings = body.settings || {};

    if (!text) {
      sendJson(response, 400, { error: "Missing text." });
      return;
    }

    const translation = await translate(text, settings, context);
    sendJson(response, 200, { translation });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local translator proxy listening on http://${HOST}:${PORT}`);
  console.log(`Forwarding to ${UPSTREAM_PROVIDER}: ${UPSTREAM_ENDPOINT}`);
});

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function normalizeContext(context) {
  return {
    before: String(context?.before || "").slice(-1200),
    after: String(context?.after || "").slice(0, 1200),
    pageTitle: String(context?.pageTitle || "").slice(0, 200)
  };
}

async function translate(text, settings, context) {
  if (UPSTREAM_PROVIDER === "openai-compatible") {
    return requestOpenAICompatible(text, settings, context);
  }

  return requestOllama(text, settings, context);
}

function buildPrompt(settings, text, context = {}) {
  const sourceLanguage = settings.sourceLanguage || "auto";
  const targetLanguage = settings.targetLanguage || "中文";
  const source = sourceLanguage === "auto" ? "the detected source language" : sourceLanguage;

  return [
    `Translate only the selected text from ${source} to ${targetLanguage}.`,
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

async function requestOllama(text, settings, context) {
  const upstreamResponse = await fetch(UPSTREAM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || "qwen2.5:7b",
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
        temperature: Number(settings.temperature ?? 0.2)
      }
    })
  });

  const data = await readUpstreamJson(upstreamResponse);
  return data?.message?.content?.trim() || data?.response?.trim() || "";
}

async function requestOpenAICompatible(text, settings, context) {
  const upstreamResponse = await fetch(UPSTREAM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || "qwen2.5:7b",
      temperature: Number(settings.temperature ?? 0.2),
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

  const data = await readUpstreamJson(upstreamResponse);
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function readUpstreamJson(upstreamResponse) {
  const text = await upstreamResponse.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Upstream returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!upstreamResponse.ok) {
    throw new Error(data?.error?.message || data?.error || `Upstream request failed: ${upstreamResponse.status}`);
  }

  return data;
}

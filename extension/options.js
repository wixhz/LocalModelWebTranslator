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

const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const resetButton = document.getElementById("reset-button");

loadSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const settings = {
    provider: formData.get("provider"),
    endpoint: formData.get("endpoint").trim(),
    model: formData.get("model").trim(),
    models: normalizeModels(formData.get("models"), formData.get("model")),
    sourceLanguage: formData.get("sourceLanguage").trim() || "auto",
    targetLanguage: formData.get("targetLanguage").trim(),
    temperature: Number(formData.get("temperature")),
    maxChars: Number(formData.get("maxChars"))
  };

  await chrome.storage.sync.set(settings);
  showStatus("Saved.");
});

resetButton.addEventListener("click", async () => {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  fillForm(DEFAULT_SETTINGS);
  showStatus("Reset to defaults.");
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fillForm(settings);
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements[key];
    if (field) field.value = value;
  }
}

function normalizeModels(rawModels, currentModel) {
  const models = String(rawModels || "")
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
  const model = String(currentModel || "").trim();

  if (model && !models.includes(model)) {
    models.unshift(model);
  }

  return models.join("\n");
}

function showStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    statusEl.textContent = "";
  }, 1800);
}

const modelSelect = document.getElementById("model-select");
const statusEl = document.getElementById("status");

document.getElementById("options-button").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

modelSelect.addEventListener("change", async () => {
  const model = modelSelect.value;
  const response = await chrome.runtime.sendMessage({
    type: "LOCAL_TRANSLATOR_SET_MODEL",
    model
  });

  if (!response?.ok) {
    showStatus(response?.error || "Failed to switch model.");
    return;
  }

  showStatus(`Switched to ${model}`);
});

loadModels();

async function loadModels() {
  const response = await chrome.runtime.sendMessage({
    type: "LOCAL_TRANSLATOR_GET_SETTINGS"
  });

  if (!response?.ok) {
    showStatus(response?.error || "Failed to load settings.");
    return;
  }

  const settings = response.settings;
  const models = parseModelList(settings.models, settings.model);
  modelSelect.innerHTML = "";

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  }

  modelSelect.value = settings.model;
}

function parseModelList(models, currentModel) {
  const parsed = String(models || "")
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
  const model = String(currentModel || "").trim();

  if (model && !parsed.includes(model)) {
    parsed.unshift(model);
  }

  return parsed.length ? parsed : ["qwen2.5:7b"];
}

function showStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    statusEl.textContent = "";
  }, 1600);
}

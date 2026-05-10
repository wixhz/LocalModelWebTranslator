const WIDGET_ID = "local-model-translator-widget";
const CONTEXT_CHARS = 900;

let selectedText = "";
let selectionContext = { before: "", after: "", pageTitle: "" };
let lastMousePosition = { x: 0, y: 0 };
let hideTimer = null;

document.addEventListener("mouseup", handleSelection);
document.addEventListener("keyup", handleSelection);
document.addEventListener("mousedown", handleOutsideClick);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "LOCAL_TRANSLATOR_TRANSLATE_SELECTION") {
    selectedText = message.text || getSelectedText();
    selectionContext = getSelectionContext();
    if (selectedText) {
      showWidget(lastMousePosition.x, lastMousePosition.y);
      requestTranslation();
    }
  }
});

function handleSelection(event) {
  if (event?.target?.closest?.(`#${WIDGET_ID}`)) return;

  window.clearTimeout(hideTimer);
  lastMousePosition = {
    x: event?.clientX || window.innerWidth / 2,
    y: event?.clientY || window.innerHeight / 2
  };

  setTimeout(() => {
    selectedText = getSelectedText();
    selectionContext = getSelectionContext();
    if (!selectedText) {
      scheduleHide();
      return;
    }

    showWidget(lastMousePosition.x, lastMousePosition.y);
  }, 10);
}

function handleOutsideClick(event) {
  if (event.target?.closest?.(`#${WIDGET_ID}`)) return;
  scheduleHide();
}

function getSelectedText() {
  return window.getSelection()?.toString().trim() || "";
}

function getSelectionContext() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { before: "", after: "", pageTitle: document.title || "" };
  }

  const range = selection.getRangeAt(0);
  const containerText = getReadableContainerText(range);
  const selected = selection.toString();

  if (!containerText || !selected) {
    return { before: "", after: "", pageTitle: document.title || "" };
  }

  const selectedIndex = containerText.indexOf(selected);
  if (selectedIndex < 0) {
    return { before: "", after: "", pageTitle: document.title || "" };
  }

  return {
    before: containerText.slice(Math.max(0, selectedIndex - CONTEXT_CHARS), selectedIndex).trim(),
    after: containerText.slice(selectedIndex + selected.length, selectedIndex + selected.length + CONTEXT_CHARS).trim(),
    pageTitle: document.title || ""
  };
}

function getReadableContainerText(range) {
  const root = getContextRoot(range.commonAncestorContainer);
  return normalizeText(root?.innerText || root?.textContent || "");
}

function getContextRoot(node) {
  let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const selectors = [
    "article",
    "main",
    "section",
    "p",
    "li",
    "blockquote",
    "td",
    "div"
  ];

  while (element && element !== document.body) {
    if (selectors.some((selector) => element.matches(selector))) {
      const text = normalizeText(element.innerText || element.textContent || "");
      if (text.length >= selectedText.length) {
        return element;
      }
    }

    element = element.parentElement;
  }

  return document.body;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function showWidget(clientX, clientY) {
  const widget = getWidget();
  widget.hidden = false;
  widget.dataset.state = "idle";
  widget.querySelector("[data-role='result']").textContent = "";
  widget.querySelector("[data-role='error']").textContent = "";

  const rect = widget.getBoundingClientRect();
  const x = Math.min(Math.max(12, clientX + 12), window.innerWidth - rect.width - 12);
  const y = Math.min(Math.max(12, clientY + 16), window.innerHeight - rect.height - 12);

  widget.style.left = `${x}px`;
  widget.style.top = `${y}px`;
}

function getWidget() {
  let widget = document.getElementById(WIDGET_ID);
  if (widget) return widget;

  widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.hidden = true;
  widget.innerHTML = `
    <div class="lqt-toolbar">
      <button type="button" data-action="translate" title="Translate selected text">译</button>
      <button type="button" data-action="copy" title="Copy translation">Copy</button>
      <button type="button" data-action="close" title="Close">×</button>
    </div>
    <div class="lqt-status" data-role="status">Selected text ready</div>
    <div class="lqt-result" data-role="result"></div>
    <div class="lqt-error" data-role="error"></div>
  `;

  widget.querySelector("[data-action='translate']").addEventListener("click", requestTranslation);
  widget.querySelector("[data-action='copy']").addEventListener("click", copyTranslation);
  widget.querySelector("[data-action='close']").addEventListener("click", () => {
    widget.hidden = true;
  });

  document.documentElement.appendChild(widget);
  return widget;
}

async function requestTranslation() {
  const widget = getWidget();
  const text = selectedText || getSelectedText();
  if (!text) return;

  selectedText = text;
  selectionContext = selectionContext.before || selectionContext.after ? selectionContext : getSelectionContext();
  widget.hidden = false;
  widget.dataset.state = "loading";
  widget.querySelector("[data-role='status']").textContent = "Translating...";
  widget.querySelector("[data-role='result']").textContent = "";
  widget.querySelector("[data-role='error']").textContent = "";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "LOCAL_TRANSLATOR_TRANSLATE",
      text,
      context: selectionContext
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Translation failed.");
    }

    widget.dataset.state = "done";
    widget.querySelector("[data-role='status']").textContent = "Translation";
    widget.querySelector("[data-role='result']").textContent = response.translation || "(empty result)";
  } catch (error) {
    widget.dataset.state = "error";
    widget.querySelector("[data-role='status']").textContent = "Translation failed";
    widget.querySelector("[data-role='error']").textContent = error.message;
  }
}

async function copyTranslation() {
  const result = getWidget().querySelector("[data-role='result']").textContent.trim();
  if (!result) return;
  await navigator.clipboard.writeText(result);
  getWidget().querySelector("[data-role='status']").textContent = "Copied";
}

function scheduleHide() {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    const widget = document.getElementById(WIDGET_ID);
    if (widget?.dataset.state === "loading") return;
    if (widget) widget.hidden = true;
  }, 160);
}

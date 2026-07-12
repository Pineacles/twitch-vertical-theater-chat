const DEFAULT_SETTINGS = {
  enabled: true,
  chatPosition: "bottom",
  chatHidden: false,
  breakpointPx: 820
};

const BREAKPOINT_MIN = 480;
const BREAKPOINT_MAX = 1600;

const enabledInput = document.getElementById("enabled");
const chatVisibleInput = document.getElementById("chat-visible");
const breakpointInput = document.getElementById("breakpoint");
const positionButtons = [
  document.getElementById("pos-bottom"),
  document.getElementById("pos-top")
];

document.getElementById("version").textContent = "v" + chrome.runtime.getManifest().version;

function render(settings) {
  enabledInput.checked = settings.enabled !== false;
  chatVisibleInput.checked = settings.chatHidden !== true;
  breakpointInput.value = settings.breakpointPx;
  for (const button of positionButtons) {
    button.setAttribute("aria-checked", button.dataset.value === settings.chatPosition ? "true" : "false");
    button.setAttribute("role", "radio");
  }
  document.body.dataset.disabled = settings.enabled === false ? "true" : "false";
}

async function load() {
  const raw = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(raw);
}

function save(partial) {
  chrome.storage.sync.set(partial);
}

enabledInput.addEventListener("change", () => {
  save({ enabled: enabledInput.checked });
  document.body.dataset.disabled = enabledInput.checked ? "false" : "true";
});

chatVisibleInput.addEventListener("change", () => {
  save({ chatHidden: !chatVisibleInput.checked });
});

for (const button of positionButtons) {
  button.addEventListener("click", () => {
    save({ chatPosition: button.dataset.value });
    for (const other of positionButtons) {
      other.setAttribute("aria-checked", other === button ? "true" : "false");
    }
  });
}

breakpointInput.addEventListener("change", () => {
  const value = Math.min(BREAKPOINT_MAX, Math.max(BREAKPOINT_MIN, Number(breakpointInput.value) || DEFAULT_SETTINGS.breakpointPx));
  breakpointInput.value = value;
  save({ breakpointPx: value });
});

// Live-sync if the on-page buttons (or another window) change a setting
// while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  chrome.storage.sync.get(DEFAULT_SETTINGS).then(render);
});

load();

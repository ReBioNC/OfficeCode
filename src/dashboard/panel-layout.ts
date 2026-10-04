export interface PanelLayout { ratio: number; collapsed: boolean }
export const DEFAULT_PANEL_LAYOUT: Readonly<PanelLayout> = { ratio: .32, collapsed: false };
const STORAGE_KEY = "officecode.layout.v1";
const DIVIDER_WIDTH = 10;

export function activityBounds(width: number): { min: number; max: number } {
  return { min: 280, max: Math.max(280, Math.min(width * .6, width - 480 - DIVIDER_WIDTH)) };
}

export function activityWidth(width: number, ratio: number): number {
  const bounds = activityBounds(width);
  return Math.max(bounds.min, Math.min(bounds.max, width * (Number.isFinite(ratio) ? ratio : DEFAULT_PANEL_LAYOUT.ratio)));
}

export function readPanelLayout(raw: string | null): PanelLayout {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PANEL_LAYOUT };
    return {
      ratio: typeof value.ratio === "number" && Number.isFinite(value.ratio) && value.ratio > 0 && value.ratio <= 1 ? value.ratio : DEFAULT_PANEL_LAYOUT.ratio,
      collapsed: typeof value.collapsed === "boolean" ? value.collapsed : false,
    };
  } catch { return { ...DEFAULT_PANEL_LAYOUT }; }
}

/** Presentation preferences stay in this browser and never change OpenCode state. */
export function attachPanelLayout(): { showActivity: () => void } {
  const app = document.querySelector(".app") as HTMLElement;
  const panel = document.getElementById("activityCenter") as HTMLElement;
  const divider = document.getElementById("activityDivider") as HTMLElement;
  const toggle = document.getElementById("toggleActivity") as HTMLButtonElement;
  const reset = document.getElementById("resetLayout") as HTMLButtonElement;
  const mobile = window.matchMedia("(max-width:960px)");
  let state = { ...DEFAULT_PANEL_LAYOUT };
  let drag: { id: number; x: number; width: number; ratio: number } | undefined;
  try { state = readPanelLayout(localStorage.getItem(STORAGE_KEY)); } catch { /* Storage can be disabled. */ }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the live layout usable. */ }
  }
  function apply() {
    const width = app.clientWidth;
    const bounds = activityBounds(width);
    const actual = activityWidth(width, state.ratio);
    app.style.setProperty("--activity-width", `${actual}px`);
    app.classList.toggle("activity-collapsed", state.collapsed);
    panel.hidden = state.collapsed;
    divider.hidden = state.collapsed || mobile.matches;
    divider.setAttribute("aria-valuemin", String(Math.round(bounds.min)));
    divider.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
    divider.setAttribute("aria-valuenow", String(Math.round(actual)));
    divider.setAttribute("aria-valuetext", `${Math.round(actual)} pixels`);
    toggle.textContent = state.collapsed ? "Show activity" : "Hide activity";
    toggle.setAttribute("aria-expanded", String(!state.collapsed));
  }
  function resize(width: number) {
    const container = app.clientWidth;
    state.ratio = activityWidth(container, width / container) / container;
    apply();
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const current = drag;
    drag = undefined;
    if (cancel) { state.ratio = current.ratio; apply(); }
    else save();
    document.documentElement.classList.remove("resizing-layout");
    if (divider.hasPointerCapture(current.id)) divider.releasePointerCapture(current.id);
  }
  function restoreDefault() {
    finishDrag(true);
    state = { ...DEFAULT_PANEL_LAYOUT };
    apply(); save();
  }
  toggle.addEventListener("click", () => {
    finishDrag(true);
    state.collapsed = !state.collapsed;
    apply(); save();
  });
  reset.addEventListener("click", restoreDefault);
  divider.addEventListener("dblclick", restoreDefault);
  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag || mobile.matches || state.collapsed) return;
    event.preventDefault();
    divider.focus();
    drag = { id: event.pointerId, x: event.clientX, width: activityWidth(app.clientWidth, state.ratio), ratio: state.ratio };
    divider.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("resizing-layout");
  });
  divider.addEventListener("pointermove", (event) => {
    if (drag?.id === event.pointerId) resize(drag.width + drag.x - event.clientX);
  });
  divider.addEventListener("pointerup", (event) => { if (drag?.id === event.pointerId) finishDrag(); });
  divider.addEventListener("pointercancel", (event) => { if (drag?.id === event.pointerId) finishDrag(true); });
  divider.addEventListener("lostpointercapture", () => finishDrag(true));
  divider.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { finishDrag(true); return; }
    const bounds = activityBounds(app.clientWidth), current = activityWidth(app.clientWidth, state.ratio);
    const step = event.shiftKey ? 64 : 24;
    const widths: Record<string, number> = { ArrowLeft: current + step, ArrowRight: current - step, Home: bounds.min, End: bounds.max };
    if (!(event.key in widths)) return;
    event.preventDefault();
    resize(widths[event.key]);
    if (!drag) save();
  });
  window.addEventListener("resize", () => { finishDrag(true); apply(); });
  window.addEventListener("blur", () => finishDrag(true));
  apply();
  return { showActivity: () => { if (!state.collapsed) return; state.collapsed = false; apply(); save(); } };
}

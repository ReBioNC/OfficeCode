export function clampZoom(value: number, minimum = .2): number {
  const floor = Number.isFinite(minimum) && minimum > 0 ? Math.min(4, minimum) : .2;
  return Number.isFinite(value) ? Math.max(floor, Math.min(4, value)) : 1;
}
export function fitZoom(width: number, height: number, canvasWidth: number, canvasHeight: number): number {
  if (![width, height, canvasWidth, canvasHeight].every(value => Number.isFinite(value) && value > 0)) return 1;
  // Fit is allowed below the manual zoom minimum so overflow floors never crop.
  return Math.min(4, width / canvasWidth, height / canvasHeight);
}
export function fitProjection(width: number, height: number, canvasWidth: number, canvasHeight: number, wide: boolean) {
  const y = fitZoom(width, height, canvasWidth, canvasHeight);
  return { x: wide && width > 0 && canvasWidth > 0 && Number.isFinite(width / canvasWidth) ? Math.max(y, width / canvasWidth) : y, y };
}
export function zoomScroll(scroll: number, anchor: number, from: number, to: number): number {
  return Math.max(0, (scroll + anchor) * to / from - anchor);
}

/** Camera changes only presentation; tool execution always stays in OpenCode. */
export function attachStudioCamera(canvas: HTMLCanvasElement, selectedPoint: () => { x: number; y: number } | undefined, allowWide: () => boolean = () => true) {
  const viewport = canvas.parentElement!;
  const readout = document.getElementById("zoomValue")!;
  let zoom = 1, fitting = true, draggedUntil = 0;
  let aspect = 1, paintedAspect = 1;
  const app = document.querySelector(".app");
  const collapsed = () => !!app?.classList.contains("activity-collapsed");
  let wasCollapsed = collapsed();
  let wasDesktop = window.innerWidth > 960;
  let previousView: { zoom: number; fitting: boolean; aspect: number; left: number; top: number; desktop: boolean } | undefined;
  const pointers = new Map<number, { x: number; y: number }>();
  const size = () => ({ width: Math.max(1, viewport.clientWidth - 24), height: Math.max(1, viewport.clientHeight - 24) });
  function paintSize() {
    canvas.style.width = `${canvas.width * zoom * aspect}px`;
    canvas.style.height = `${canvas.height * zoom}px`;
    readout.textContent = `${Math.round(zoom * 100)}%`;
    readout.title = aspect > 1.001 ? "Wide studio · height fits the viewport" : "Studio zoom";
    if (Math.abs(paintedAspect - aspect) > .00001) {
      paintedAspect = aspect;
      canvas.dispatchEvent(new Event("studio-projection-change"));
    }
  }
  function updateSize() {
    const hidden = collapsed();
    const desktop = window.innerWidth > 960;
    const changed = hidden !== wasCollapsed;
    if (changed) {
      if (hidden) {
        previousView = { zoom, fitting, aspect, left: viewport.scrollLeft, top: viewport.scrollTop, desktop };
        fitting = true;
      } else {
        const restore = previousView?.desktop === desktop ? previousView : undefined;
        zoom = restore?.zoom ?? zoom; fitting = restore?.fitting ?? true;
        aspect = restore?.aspect ?? 1;
      }
      wasCollapsed = hidden;
    }
    if (desktop !== wasDesktop) { fitting = true; viewport.scrollTo(0, 0); wasDesktop = desktop; }
    if (fitting) {
      const bounds = size(), projection = fitProjection(bounds.width, bounds.height, canvas.width, canvas.height, hidden && desktop && allowWide());
      zoom = projection.y; aspect = projection.x / zoom;
    }
    paintSize();
    if (changed) viewport.scrollTo(hidden || fitting ? 0 : previousView?.left ?? 0, hidden || fitting ? 0 : previousView?.top ?? 0);
    if (changed && !hidden) previousView = undefined;
  }
  function setZoom(value: number, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    const bounds = size();
    const minimum = Math.min(.2, zoom, fitZoom(bounds.width, bounds.height, canvas.width, canvas.height));
    const next = clampZoom(value, minimum);
    // Account for the centered canvas margin while it is narrower than the viewport.
    const oldLeft = canvas.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    const contentX = (viewport.scrollLeft + x - oldLeft) / (zoom * aspect);
    const contentY = (viewport.scrollTop + y - 12) / zoom;
    fitting = false; zoom = next; paintSize();
    const newLeft = canvas.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    viewport.scrollLeft = Math.max(0, contentX * zoom * aspect + newLeft - x);
    viewport.scrollTop = Math.max(0, contentY * zoom + 12 - y);
  }
  function fit() { fitting = true; updateSize(); viewport.scrollTo(0, 0); }
  function focus() {
    const point = selectedPoint();
    if (!point) return;
    setZoom(Math.max(zoom, 1.2));
    const left = canvas.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    viewport.scrollLeft = Math.max(0, point.x * zoom * aspect + left - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, (point.y - 20) * zoom + 12 - viewport.clientHeight / 2);
  }
  (document.getElementById("zoomIn") as HTMLButtonElement).onclick = () => setZoom(zoom * 1.25);
  (document.getElementById("zoomOut") as HTMLButtonElement).onclick = () => setZoom(zoom / 1.25);
  (document.getElementById("zoomFit") as HTMLButtonElement).onclick = fit;
  (document.getElementById("zoomFocus") as HTMLButtonElement).onclick = focus;
  viewport.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    setZoom(zoom * Math.exp(-event.deltaY * .005), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  viewport.addEventListener("pointermove", (event) => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const oldDistance = Math.hypot(before.x - other.x, before.y - other.y);
      const newDistance = Math.hypot(next.x - other.x, next.y - other.y);
      const rect = viewport.getBoundingClientRect();
      if (oldDistance > 1) setZoom(zoom * newDistance / oldDistance, (next.x + other.x) / 2 - rect.left, (next.y + other.y) / 2 - rect.top);
    } else {
      viewport.scrollLeft -= next.x - before.x;
      viewport.scrollTop -= next.y - before.y;
    }
    if (Math.hypot(next.x - before.x, next.y - before.y) > 2 || other) {
      draggedUntil = performance.now() + 400;
      viewport.setPointerCapture(event.pointerId);
    }
    pointers.set(event.pointerId, next);
  });
  const release = (event: PointerEvent) => { pointers.delete(event.pointerId); };
  viewport.addEventListener("pointerup", release);
  window.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("lostpointercapture", release);
  new ResizeObserver(updateSize).observe(viewport);
  updateSize();
  return { updateSize, focus, horizontalAspect: () => aspect, suppressClick: () => performance.now() < draggedUntil };
}

export function clampZoom(value: number): number {
  return Number.isFinite(value) ? Math.max(.2, Math.min(4, value)) : 1;
}
export function fitZoom(width: number, height: number, canvasWidth: number, canvasHeight: number): number {
  return clampZoom(Math.min(width / canvasWidth, height / canvasHeight));
}
export function zoomScroll(scroll: number, anchor: number, from: number, to: number): number {
  return Math.max(0, (scroll + anchor) * to / from - anchor);
}

/** Camera changes only presentation; tool execution always stays in OpenCode. */
export function attachStudioCamera(canvas: HTMLCanvasElement, selectedPoint: () => { x: number; y: number } | undefined) {
  const viewport = canvas.parentElement!;
  const readout = document.getElementById("zoomValue")!;
  let zoom = 1, fitting = true, draggedUntil = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  const size = () => ({ width: Math.max(1, viewport.clientWidth - 24), height: Math.max(1, viewport.clientHeight - 24) });
  function paintSize() {
    canvas.style.width = `${canvas.width * zoom}px`;
    canvas.style.height = `${canvas.height * zoom}px`;
    readout.textContent = `${Math.round(zoom * 100)}%`;
  }
  function updateSize() {
    if (fitting) { const bounds = size(); zoom = fitZoom(bounds.width, bounds.height, canvas.width, canvas.height); }
    paintSize();
  }
  function setZoom(value: number, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    const next = clampZoom(value);
    // Account for the centered canvas margin while it is narrower than the viewport.
    const oldLeft = canvas.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    const contentX = (viewport.scrollLeft + x - oldLeft) / zoom;
    const contentY = (viewport.scrollTop + y - 12) / zoom;
    fitting = false; zoom = next; paintSize();
    const newLeft = canvas.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    viewport.scrollLeft = Math.max(0, contentX * zoom + newLeft - x);
    viewport.scrollTop = Math.max(0, contentY * zoom + 12 - y);
  }
  function fit() { fitting = true; updateSize(); viewport.scrollTo(0, 0); }
  function focus() {
    const point = selectedPoint();
    if (!point) return;
    setZoom(Math.max(zoom, 1.2));
    const left = canvas.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    viewport.scrollLeft = Math.max(0, point.x * zoom + left - viewport.clientWidth / 2);
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
  return { updateSize, focus, suppressClick: () => performance.now() < draggedUntil };
}

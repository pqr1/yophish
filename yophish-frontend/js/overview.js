const TIMELINE_LAYOUT = {
  padding: { top: 28, right: 32, bottom: 44, left: 52 },
  boundaryGap: 48,
  labelWidthEstimate: 90,
  minLabelSpacing: 80,
  xAxisFont: "11px 'Inter', 'Segoe UI', sans-serif",
  yAxisFont: "11px 'Inter', 'Segoe UI', sans-serif",
  lineColor: "#3b82f6",
  dotColor: "#60a5fa",
  gradientTop: "rgba(59,130,246,0.28)",
  gradientBottom: "rgba(59,130,246,0.03)",
  gridColor: "rgba(71,100,140,0.28)",
  labelColor: "#475569",
};

const BRUSH_LAYOUT = {
  height: 56,
  padding: { top: 8, right: 10, bottom: 8, left: 10 },
  handleWidth: 4,
  handleRadius: 3,
  handleColor: "#60a5fa",
  overlayColor: "rgba(0,0,0,0.48)",
  selectionBorder: "#3b82f6",
  minSpan: 0.04,
  hitZone: 10,
};

const LIVE_POLL_INTERVAL_MS = 5000;

const timelineState = {
  data: [],
  brushStart: 0,
  brushEnd: 1,
  globalMin: 0,
  globalMax: 0,

  canvas: null,
  ctx: null,
  brushCanvas: null,
  brushCtx: null,
  windowEl: null,
  tooltipEl: null,
  emptyEl: null,
  rangeEl: null,

  renderWidth: 0,
  renderHeight: 0,
  brushRenderWidth: 0,

  points: [],
  brushPoints: [],

  brush: {
    isDragging: false,
    dragMode: null,
    dragAnchorX: 0,
    dragStartAtMouseDown: 0,
    dragEndAtMouseDown: 0,
  },

  pollTimer: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "overview") return;

  timelineState.canvas = document.getElementById("timelineCanvas");
  timelineState.ctx = timelineState.canvas?.getContext("2d") ?? null;
  timelineState.brushCanvas = document.getElementById("timelineBrush");
  timelineState.brushCtx = timelineState.brushCanvas?.getContext("2d") ?? null;
  timelineState.windowEl =
    timelineState.canvas?.closest(".timeline-window") ?? timelineState.canvas?.parentElement ?? null;
  timelineState.tooltipEl = document.getElementById("timelineTooltip");
  timelineState.emptyEl = null;
  timelineState.rangeEl = document.getElementById("timelineRange");

  timelineState.canvas?.addEventListener("mousemove", handlePointerMove);
  timelineState.canvas?.addEventListener("mouseleave", hideTooltip);

  timelineState.brushCanvas?.addEventListener("mousedown", handleBrushMouseDown);
  window.addEventListener("mousemove", handleBrushMouseMove);
  window.addEventListener("mouseup", handleBrushMouseUp);
  timelineState.brushCanvas?.addEventListener("mousemove", updateBrushCursor);

  window.addEventListener("resize", () => {
    prepareCanvas();
    prepareBrushCanvas();
    redraw();
  });

  prepareCanvas();
  prepareBrushCanvas();

  try {
    const data = await api.get("/overview");
    renderKpis(data.totals);
    renderTimeline(data.timeline);
    startLivePolling();
  } catch (error) {
    console.error("Failed to load overview:", error.message);
  }
});

function renderKpis(totals) {
  const kpiGrid = document.getElementById("kpiGrid");
  const items = [
    { label: "Total phishing emails sent", value: totals.sent },
    { label: "Total phishing emails not sent", value: totals.notSent },
    { label: "Total opens", value: totals.opens },
    { label: "Total not opens", value: totals.notOpens },
    { label: "Failure rate", value: `${totals.failureRate}%` },
    { label: "Success rate", value: `${totals.successRate}%` },
  ];

  kpiGrid.innerHTML = items
    .map(
      (item) => `
      <div class="kpi-circle">
        <strong>${item.value}</strong>
        <span>${item.label}</span>
      </div>
    `,
    )
    .join("");
}

function renderTimeline(entries) {
  const normalized = Array.isArray(entries) ? [...entries] : [];
  normalized.sort((a, b) => {
    const parseDate = (value) => {
      const time = new Date(value ?? 0).getTime();
      return Number.isNaN(time) ? 0 : time;
    };
    return parseDate(a.timestamp ?? a.weekStart ?? a.label) - parseDate(b.timestamp ?? b.weekStart ?? b.label);
  });

  timelineState.data = normalized.map((entry) => {
    const label = formatTimelineDisplayLabel(entry);
    return { ...entry, rangeLabel: label, pointLabel: label };
  });

  timelineState.brushStart = 0;
  timelineState.brushEnd = 1;
  updateGlobalMinMax();
  redraw();
}

function startLivePolling() {
  if (timelineState.pollTimer) clearInterval(timelineState.pollTimer);

  timelineState.pollTimer = setInterval(async () => {
    try {
      const data = await api.get("/overview");
      mergeLiveData(data.timeline);
    } catch {
      // ignore polling errors
    }
  }, LIVE_POLL_INTERVAL_MS);
}

function mergeLiveData(entries) {
  if (!Array.isArray(entries) || !entries.length) return;

  const existing = new Set(
    timelineState.data.map((d) => {
      const raw = d.timestamp ?? d.weekStart ?? d.label ?? "";
      return new Date(raw).getTime();
    }),
  );

  const incoming = entries.map((entry) => {
    const label = formatTimelineDisplayLabel(entry);
    return { ...entry, rangeLabel: label, pointLabel: label };
  });

  const newEntries = incoming.filter((entry) => {
    const raw = entry.timestamp ?? entry.weekStart ?? entry.label ?? "";
    const t = new Date(raw).getTime();
    return !Number.isNaN(t) && !existing.has(t);
  });

  const updatedEntries = incoming.filter((entry) => {
    const raw = entry.timestamp ?? entry.weekStart ?? entry.label ?? "";
    const t = new Date(raw).getTime();
    if (Number.isNaN(t) || !existing.has(t)) return false;
    const current = timelineState.data.find((d) => {
      const dt = new Date(d.timestamp ?? d.weekStart ?? d.label ?? "").getTime();
      return dt === t;
    });
    return current && current.sentCount !== entry.sentCount;
  });

  if (!newEntries.length && !updatedEntries.length) return;

  updatedEntries.forEach((entry) => {
    const raw = entry.timestamp ?? entry.weekStart ?? entry.label ?? "";
    const t = new Date(raw).getTime();
    const idx = timelineState.data.findIndex((d) => {
      return new Date(d.timestamp ?? d.weekStart ?? d.label ?? "").getTime() === t;
    });
    if (idx !== -1) timelineState.data[idx] = entry;
  });

  if (newEntries.length) {
    const wasAtEnd = timelineState.brushEnd >= 0.98;
    timelineState.data.push(...newEntries);
    timelineState.data.sort((a, b) => {
      const parseDate = (v) => {
        const t = new Date(v ?? 0).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      return parseDate(a.timestamp ?? a.weekStart ?? a.label) - parseDate(b.timestamp ?? b.weekStart ?? b.label);
    });

    if (wasAtEnd) {
      timelineState.brushEnd = 1;
    }
  }

  updateGlobalMinMax();
  redraw();
}

function updateGlobalMinMax() {
  const counts = timelineState.data.map((d) => d.sentCount).filter((v) => typeof v === "number");
  timelineState.globalMax = counts.length ? Math.max(...counts) : 0;
  timelineState.globalMin = counts.length ? Math.min(...counts) : 0;
}

function redraw() {
  drawBrush();
  drawMainChart();
  updateRangeLabel();
}

function prepareCanvas() {
  const canvas = timelineState.canvas;
  const ctx = timelineState.ctx;
  if (!canvas || !ctx) return;

  const hostRect = timelineState.windowEl?.getBoundingClientRect();
  const width = Math.max(hostRect?.width ?? canvas.clientWidth ?? 0, 320);
  let height = canvas.clientHeight || hostRect?.height || 0;
  if (!height) {
    const styleHeight = Number.parseFloat(getComputedStyle(canvas).height);
    height = Number.isNaN(styleHeight) ? 280 : styleHeight;
  }

  canvas.style.width = "100%";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  timelineState.renderWidth = width;
  timelineState.renderHeight = height;
}

function prepareBrushCanvas() {
  const canvas = timelineState.brushCanvas;
  const ctx = timelineState.brushCtx;
  if (!canvas || !ctx) return;

  const hostRect = timelineState.windowEl?.getBoundingClientRect();
  const width = Math.max(hostRect?.width ?? canvas.clientWidth ?? 0, 320);
  const height = BRUSH_LAYOUT.height;

  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  timelineState.brushRenderWidth = width;
}

function getVisibleEntries() {
  const { data, brushStart, brushEnd } = timelineState;
  if (!data.length) return [];
  const si = Math.floor(brushStart * (data.length - 1));
  const ei = Math.ceil(brushEnd * (data.length - 1));
  return data.slice(si, Math.min(ei + 1, data.length));
}

function drawMainChart() {
  const canvas = timelineState.canvas;
  const ctx = timelineState.ctx;
  if (!canvas || !ctx) return;

  prepareCanvas();

  const width = timelineState.renderWidth;
  const height = timelineState.renderHeight;
  const padding = TIMELINE_LAYOUT.padding;

  ctx.clearRect(0, 0, width, height);

  const visible = getVisibleEntries();
  if (!visible.length) {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  const cw = width - padding.left - padding.right;
  const ch = height - padding.top - padding.bottom;

  const counts = visible.map((d) => d.sentCount);
  const dataMin = Math.min(...counts);
  const dataMax = Math.max(...counts);
  const { min: yMin, max: yMax, ticks: yTicks } = niceTicksForRange(dataMin, dataMax);

  drawMainGrid(ctx, { width, height, padding, cw, ch, yMin, yMax, yTicks });

  const singlePoint = visible.length === 1;
  const boundary = Math.max(TIMELINE_LAYOUT.boundaryGap, TIMELINE_LAYOUT.labelWidthEstimate / 2);
  const usableWidth = Math.max(cw - boundary * 2, 0);
  const stepX = !singlePoint && visible.length > 1 ? usableWidth / (visible.length - 1) : 0;
  const startX = singlePoint ? padding.left + cw / 2 : padding.left + boundary;

  const px = (index) => (singlePoint ? startX : startX + index * stepX);
  const py = (value) =>
    padding.top + ch - ((value - yMin) / (yMax - yMin || 1)) * ch;

  const points = visible.map((entry, index) => ({
    x: px(index),
    y: py(entry.sentCount),
    label: entry.pointLabel ?? entry.rangeLabel ?? entry.label ?? "Point",
    value: entry.sentCount,
    tooltip: entry.sentCount === 1 ? "1 email sent" : `${entry.sentCount} emails sent`,
  }));
  timelineState.points = points;

  if (points.length > 1) {
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, TIMELINE_LAYOUT.gradientTop);
    gradient.addColorStop(1, TIMELINE_LAYOUT.gradientBottom);

    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padding.bottom);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.strokeStyle = TIMELINE_LAYOUT.lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (points.length > 1) {
    ctx.stroke();
  }

  ctx.fillStyle = TIMELINE_LAYOUT.dotColor;
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  drawXLabels(ctx, { points, height, padding, stepX, usableWidth });
}

function drawMainGrid(ctx, { width, height, padding, cw, ch, yMin, yMax, yTicks }) {
  ctx.font = TIMELINE_LAYOUT.yAxisFont;
  ctx.textAlign = "right";

  yTicks.forEach((tick) => {
    const y = padding.top + ch - ((tick - yMin) / (yMax - yMin || 1)) * ch;
    if (y < padding.top - 6 || y > height - padding.bottom + 6) return;

    ctx.strokeStyle = TIMELINE_LAYOUT.gridColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = TIMELINE_LAYOUT.labelColor;
    ctx.fillText(Math.round(tick).toString(), padding.left - 8, y + 4);
  });
}

function drawXLabels(ctx, { points, height, padding, stepX, usableWidth }) {
  ctx.fillStyle = TIMELINE_LAYOUT.labelColor;
  ctx.font = TIMELINE_LAYOUT.xAxisFont;
  ctx.textAlign = "center";

  const effectiveSpacing = stepX || usableWidth || 1;
  const stride =
    points.length <= 1 ? 1 : Math.max(1, Math.ceil(TIMELINE_LAYOUT.minLabelSpacing / effectiveSpacing));
  const lastIndex = points.length - 1;

  points.forEach((p, index) => {
    const shouldShow =
      points.length === 1 || index === 0 || index === lastIndex || index % stride === 0;
    if (shouldShow) {
      ctx.fillText(p.label ?? "", p.x, height - padding.bottom + 18);
    }
  });
}

function drawBrush() {
  const canvas = timelineState.brushCanvas;
  const ctx = timelineState.brushCtx;
  if (!canvas || !ctx) return;

  prepareBrushCanvas();

  const width = timelineState.brushRenderWidth;
  const height = BRUSH_LAYOUT.height;
  const pad = BRUSH_LAYOUT.padding;
  const { data, brushStart, brushEnd, globalMin, globalMax } = timelineState;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  if (!data.length) return;

  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const range = globalMax - globalMin || 1;
  const lo = globalMin - range * 0.05;
  const hi = globalMax + range * 0.05;

  const bx = (i) => pad.left + (i / (data.length - 1 || 1)) * cw;
  const by = (v) => pad.top + ch - ((v - lo) / (hi - lo)) * ch;

  const brushPoints = data.map((entry, i) => ({ x: bx(i), y: by(entry.sentCount) }));
  timelineState.brushPoints = brushPoints;

  if (brushPoints.length > 1) {
    const gradient = ctx.createLinearGradient(0, pad.top, 0, height);
    gradient.addColorStop(0, "rgba(59,130,246,0.25)");
    gradient.addColorStop(1, "rgba(59,130,246,0.02)");

    ctx.beginPath();
    ctx.moveTo(brushPoints[0].x, height);
    brushPoints.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(brushPoints[brushPoints.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(59,130,246,0.5)";
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    brushPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }

  const sx = pad.left + brushStart * cw;
  const ex = pad.left + brushEnd * cw;

  ctx.fillStyle = BRUSH_LAYOUT.overlayColor;
  ctx.fillRect(pad.left, 0, sx - pad.left, height);
  ctx.fillRect(ex, 0, pad.left + cw - ex, height);

  ctx.strokeStyle = BRUSH_LAYOUT.selectionBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx, 1, ex - sx, height - 2);

  const hw = BRUSH_LAYOUT.handleWidth;
  const hr = BRUSH_LAYOUT.handleRadius;
  const handleH = 16;
  const handleY = height / 2 - handleH / 2;

  [sx, ex].forEach((hx) => {
    ctx.fillStyle = BRUSH_LAYOUT.handleColor;
    roundRect(ctx, hx - hw / 2, handleY, hw, handleH, hr);
    ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function getBrushGeometry() {
  const pad = BRUSH_LAYOUT.padding;
  const width = timelineState.brushRenderWidth;
  const cw = width - pad.left - pad.right;
  const sx = pad.left + timelineState.brushStart * cw;
  const ex = pad.left + timelineState.brushEnd * cw;
  return { pad, cw, sx, ex };
}

function hitTestBrush(x) {
  const { sx, ex } = getBrushGeometry();
  const hz = BRUSH_LAYOUT.hitZone;
  if (Math.abs(x - sx) <= hz) return "start";
  if (Math.abs(x - ex) <= hz) return "end";
  if (x > sx + hz && x < ex - hz) return "move";
  return null;
}

function handleBrushMouseDown(event) {
  const rect = timelineState.brushCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const mode = hitTestBrush(x);
  if (!mode) return;

  timelineState.brush.isDragging = true;
  timelineState.brush.dragMode = mode;
  timelineState.brush.dragAnchorX = x;
  timelineState.brush.dragStartAtMouseDown = timelineState.brushStart;
  timelineState.brush.dragEndAtMouseDown = timelineState.brushEnd;

  event.preventDefault();
}

function handleBrushMouseMove(event) {
  const { isDragging, dragMode, dragAnchorX, dragStartAtMouseDown, dragEndAtMouseDown } = timelineState.brush;
  if (!isDragging) return;

  const rect = timelineState.brushCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { cw } = getBrushGeometry();
  const dx = (x - dragAnchorX) / cw;
  const minSpan = BRUSH_LAYOUT.minSpan;

  if (dragMode === "start") {
    timelineState.brushStart = Math.max(0, Math.min(dragStartAtMouseDown + dx, timelineState.brushEnd - minSpan));
  } else if (dragMode === "end") {
    timelineState.brushEnd = Math.min(1, Math.max(dragEndAtMouseDown + dx, timelineState.brushStart + minSpan));
  } else if (dragMode === "move") {
    const span = dragEndAtMouseDown - dragStartAtMouseDown;
    let ns = dragStartAtMouseDown + dx;
    let ne = dragEndAtMouseDown + dx;
    if (ns < 0) {
      ns = 0;
      ne = span;
    }
    if (ne > 1) {
      ne = 1;
      ns = 1 - span;
    }
    timelineState.brushStart = ns;
    timelineState.brushEnd = ne;
  }

  redraw();
}

function handleBrushMouseUp() {
  timelineState.brush.isDragging = false;
  timelineState.brush.dragMode = null;
}

function updateBrushCursor(event) {
  if (timelineState.brush.isDragging) return;
  const rect = timelineState.brushCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const mode = hitTestBrush(x);
  timelineState.brushCanvas.style.cursor = mode === "move" ? "grab" : mode ? "ew-resize" : "default";
}

function updateRangeLabel() {
  if (!timelineState.rangeEl) return;
  const visible = getVisibleEntries();
  if (!visible.length) {
    timelineState.rangeEl.textContent = "";
    return;
  }
  const first = visible[0];
  const last = visible[visible.length - 1];
  const fmt = (entry) => formatTimelineDisplayLabel(entry);
  timelineState.rangeEl.textContent = visible.length === 1 ? fmt(first) : `${fmt(first)} — ${fmt(last)}`;
}

function handlePointerMove(event) {
  if (!timelineState.points.length || !timelineState.canvas) {
    hideTooltip();
    return;
  }
  const rect = timelineState.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;

  let closest = null;
  timelineState.points.forEach((point) => {
    const distance = Math.abs(point.x - x);
    if (!closest || distance < closest.distance) {
      closest = { point, distance };
    }
  });

  if (!closest || closest.distance > 28) {
    hideTooltip();
    return;
  }

  showTooltip(closest.point);
}

function showTooltip(point) {
  const tooltip = timelineState.tooltipEl;
  const windowEl = timelineState.windowEl;
  const canvas = timelineState.canvas;
  if (!tooltip || !windowEl || !canvas) return;

  const windowRect = windowEl.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  tooltip.innerHTML = `<strong>${point.value}</strong><span>${point.label}</span><small>${point.tooltip}</small>`;

  const tooltipWidth = tooltip.offsetWidth || 120;
  const tooltipHeight = tooltip.offsetHeight || 48;
  const rawLeft = canvasRect.left - windowRect.left + point.x;
  const rawTop = canvasRect.top - windowRect.top + point.y - tooltipHeight - 10;
  const clampedLeft = Math.min(Math.max(rawLeft - tooltipWidth / 2, 8), windowRect.width - tooltipWidth - 8);
  const clampedTop = Math.min(Math.max(rawTop, 8), windowRect.height - tooltipHeight - 8);

  tooltip.style.transform = `translate(${clampedLeft}px, ${clampedTop}px)`;
  tooltip.classList.add("visible");
}

function hideTooltip() {
  timelineState.tooltipEl?.classList.remove("visible");
}

function niceTicksForRange(dataMin, dataMax) {
  const range = dataMax - dataMin;

  if (range === 0) {
    const v = dataMin;
    if (v === 0) {
      return { min: 0, max: 5, ticks: [0, 1, 2, 3, 4, 5] };
    }
    const step = Math.max(1, Math.ceil(Math.abs(v) * 0.2));
    const lo = Math.max(0, v - step * 2);
    const hi = v + step * 3;
    const ticks = [];
    for (let x = lo; x <= hi; x += step) {
      ticks.push(x);
    }
    return { min: lo, max: hi, ticks };
  }

  const targetTickCount = 5;
  const rawStep = range / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const niceMultiples = [1, 2, 2.5, 5, 10];
  let step = magnitude * niceMultiples[niceMultiples.length - 1];
  for (const m of niceMultiples) {
    if (m * magnitude >= rawStep) {
      step = m * magnitude;
      break;
    }
  }

  if (Number.isInteger(dataMin) && Number.isInteger(dataMax)) {
    step = Math.max(1, Math.round(step));
  }

  const lo = Math.floor(dataMin / step) * step;
  const hi = Math.ceil(dataMax / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v = Math.round((v + step) * 1e9) / 1e9) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return { min: lo, max: hi, ticks };
}

function formatTimelineDisplayLabel(entry) {
  if (!entry) return "Point";
  const rawTimestamp = entry.timestamp ?? entry.sample_timestamp ?? entry.weekStart ?? entry.label;
  const formatter = entry.bucketType === "day" ? formatDateOnly : formatDateTime;
  const formatted = formatter(rawTimestamp);
  if (formatted) return formatted;
  if (typeof entry.label === "string" && entry.label.trim()) return entry.label;
  return "Point";
}

function formatDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

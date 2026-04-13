const TYPE_SCHEMAS = {
  hovernet: {
    pannuke: {
      1: { name: 'Neoplastic', color: '#dc143c' },
      2: { name: 'Inflammatory', color: '#1e90ff' },
      3: { name: 'Connective', color: '#228b22' },
      4: { name: 'Dead', color: '#808080' },
      5: { name: 'Epithelial', color: '#ff8c00' },
    },
    consep: {
      1: { name: 'Neoplastic', color: '#dc143c' },
      2: { name: 'Inflammatory', color: '#1e90ff' },
      3: { name: 'Connective', color: '#228b22' },
      4: { name: 'Necrosis', color: '#808080' },
      5: { name: 'Non-neoplastic Epithelial', color: '#ff8c00' },
    },
    monusac: {
      1: { name: 'Epithelial', color: '#ff8c00' },
      2: { name: 'Lymphocyte', color: '#1e90ff' },
      3: { name: 'Macrophage', color: '#228b22' },
      4: { name: 'Neutrophil', color: '#808080' },
    },
  },
  promptnucseg: {
    default: {
      1: { name: 'Neoplastic', color: '#dc143c' },
      2: { name: 'Inflammatory', color: '#1e90ff' },
      3: { name: 'Connective', color: '#228b22' },
      4: { name: 'Dead', color: '#808080' },
      5: { name: 'Epithelial', color: '#ff8c00' },
    },
  },
};

const state = {
  catalog: null,
  model: 'hovernet',
  checkpoint: 'pannuke',
  cohort: 'all',
  slideKey: null,
  overlayVisible: true,
  overlayMode: 'outline',
  overlayOpacity: 0.82,
  patchOverlayData: null,
  overlayImageCache: {},
  overlayPatchCache: {},
  classCounts: {},
  classCountCache: {},
};

function stripTrailingSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

function getQueryConfig() {
  const p = new URLSearchParams(window.location.search);
  return {
    ASSET_BASE_URL: p.get('assetBaseUrl') || '',
    DATA_BASE_URL: p.get('dataBaseUrl') || '',
    HOVERNET_BASE_URL: p.get('hovernetBaseUrl') || '',
    PROMPT_BASE_URL: p.get('promptBaseUrl') || '',
  };
}

const cfg = {
  ...(window.WSI_VIEWER_CONFIG || {}),
  ...getQueryConfig(),
};

const ASSET_BASE_URL = stripTrailingSlash(cfg.ASSET_BASE_URL || '');
const DATA_BASE_URL = stripTrailingSlash(cfg.DATA_BASE_URL || (ASSET_BASE_URL ? `${ASSET_BASE_URL}/nuclei_wsi_tile_viewer/data` : '../data'));
const HOVERNET_OUTPUT_ROOT = stripTrailingSlash(cfg.HOVERNET_BASE_URL || (ASSET_BASE_URL ? `${ASSET_BASE_URL}/hovernet_outputs_allsvs_allpatches_3ckpt` : '/hovernet_outputs_allsvs_allpatches_3ckpt'));
const PROMPT_OUTPUT_ROOT = stripTrailingSlash(cfg.PROMPT_BASE_URL || (ASSET_BASE_URL ? `${ASSET_BASE_URL}/promptnucseg_outputs_allsvs_allpatches` : '/promptnucseg_outputs_allsvs_allpatches'));

const el = {
  model: document.getElementById('modelSelect'),
  checkpointWrap: document.getElementById('checkpointWrap'),
  checkpoint: document.getElementById('checkpointSelect'),
  cohort: document.getElementById('cohortSelect'),
  slide: document.getElementById('slideSelect'),
  overlay: document.getElementById('overlayToggle'),
  overlayMode: document.getElementById('overlayModeSelect'),
  overlayOpacity: document.getElementById('overlayOpacity'),
  overlayOpacityValue: document.getElementById('overlayOpacityValue'),
  summary: document.getElementById('summary'),
  classCounts: document.getElementById('classCounts'),
  legend: document.getElementById('legend'),
  status: document.getElementById('statusPill'),
  overlayCanvas: document.getElementById('overlayCanvas'),
};

const viewer = OpenSeadragon({
  id: 'viewer',
  prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/images/',
  showNavigator: true,
  animationTime: 0.8,
  blendTime: 0.1,
  minZoomLevel: 0.5,
  maxZoomPixelRatio: 4,
  gestureSettingsMouse: {
    clickToZoom: true,
    scrollToZoom: true,
    pinchToZoom: true,
  },
});

function resizeOverlayCanvas() {
  const canvas = el.overlayCanvas;
  const rect = viewer.container.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
}

function setStatus(msg) {
  el.status.textContent = msg;
}

function currentSchema() {
  const modelMap = TYPE_SCHEMAS[state.model] || {};
  if (state.model === 'hovernet') {
    return modelMap[state.checkpoint] || modelMap.pannuke || {};
  }
  return modelMap.default || {};
}

function colorForType(typeId) {
  const schema = currentSchema();
  return (schema[typeId] && schema[typeId].color) ? schema[typeId].color : '#dc143c';
}

function modelRoot(model) {
  return model === 'promptnucseg' ? PROMPT_OUTPUT_ROOT : HOVERNET_OUTPUT_ROOT;
}

function getFilteredSlides() {
  let slides = (state.catalog && state.catalog.slides) ? state.catalog.slides : [];
  if (state.cohort !== 'all') {
    slides = slides.filter((s) => s.cohort === state.cohort);
  }
  slides = slides.filter((s) => {
    const modelData = (s.models && s.models[state.model]) ? s.models[state.model] : {};
    return state.model === 'hovernet'
      ? Boolean(modelData[state.checkpoint])
      : Boolean(modelData.default);
  });
  return slides;
}

function refreshCheckpoints() {
  const opts = state.model === 'hovernet' ? ['pannuke', 'consep', 'monusac'] : ['default'];
  el.checkpoint.innerHTML = '';
  for (const c of opts) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    el.checkpoint.appendChild(o);
  }
  state.checkpoint = opts[0];
  el.checkpointWrap.style.display = state.model === 'hovernet' ? 'flex' : 'none';
}

function refreshSlides() {
  const slides = getFilteredSlides();
  el.slide.innerHTML = '';
  for (const s of slides) {
    const o = document.createElement('option');
    o.value = s.slide_key;
    o.textContent = s.slide_key;
    el.slide.appendChild(o);
  }
  state.slideKey = slides.length ? slides[0].slide_key : null;
  if (state.slideKey) el.slide.value = state.slideKey;
}

function renderLegend() {
  el.legend.innerHTML = '';
  const schema = currentSchema();
  const ids = Object.keys(schema).map((x) => Number(x)).sort((a, b) => a - b);
  for (const id of ids) {
    const entry = schema[id];
    const row = document.createElement('div');
    row.className = 'legendItem';
    row.innerHTML = `<span class="swatch" style="background:${entry.color}"></span><span>${entry.name}</span>`;
    el.legend.appendChild(row);
  }
}

function renderSummary(slide) {
  const modelBlock = (slide.models && slide.models[state.model]) ? slide.models[state.model] : {};
  const key = state.checkpoint || 'default';
  const payload = modelBlock[key] || {};
  const nuclei = (payload.n_nuclei_total !== undefined && payload.n_nuclei_total !== null)
    ? payload.n_nuclei_total
    : ((payload.instance_count !== undefined && payload.instance_count !== null) ? payload.instance_count : 0);
  const patches = (payload.n_tiles !== undefined && payload.n_tiles !== null)
    ? payload.n_tiles
    : ((payload.sampled_patches !== undefined && payload.sampled_patches !== null) ? payload.sampled_patches : 0);
  el.summary.innerHTML = `
    <div class="summaryRow"><span>Slide</span><strong>${slide.slide_key}</strong></div>
    <div class="summaryRow"><span>Model</span><strong>${state.model}</strong></div>
    <div class="summaryRow"><span>Checkpoint</span><strong>${state.checkpoint}</strong></div>
    <div class="summaryRow"><span>Nuclei</span><strong>${Number(nuclei).toLocaleString()}</strong></div>
    <div class="summaryRow"><span>Patches</span><strong>${patches}</strong></div>
  `;
}

function renderClassCounts() {
  el.classCounts.innerHTML = '';
  const schema = currentSchema();
  const ids = Object.keys(schema).map((x) => Number(x)).sort((a, b) => a - b);
  if (!ids.length) {
    el.classCounts.innerHTML = '<div class="summaryRow"><span>Unavailable</span><strong>-</strong></div>';
    return;
  }

  let total = 0;
  for (const id of ids) {
    const entry = schema[id];
    const value = Number(state.classCounts[id] || 0);
    total += value;
    const row = document.createElement('div');
    row.className = 'countRow';
    row.innerHTML = `<span class="countLabel"><span class="swatch" style="background:${entry.color}"></span>${entry.name}</span><strong class="countValue">${value.toLocaleString()}</strong>`;
    el.classCounts.appendChild(row);
  }

  const totalRow = document.createElement('div');
  totalRow.className = 'summaryRow';
  totalRow.innerHTML = `<span>Total (by class)</span><strong>${total.toLocaleString()}</strong>`;
  el.classCounts.appendChild(totalRow);
}

function mergeTypeCounts(target, source) {
  if (!source || typeof source !== 'object') return;
  for (const [k, v] of Object.entries(source)) {
    const id = Number(k);
    if (!Number.isFinite(id)) continue;
    target[id] = Number(target[id] || 0) + Number(v || 0);
  }
}

async function loadClassCounts(slide, payload) {
  state.classCounts = {};
  renderClassCounts();
  if (!payload || !payload.patch_summary) return;

  const cacheKey = `${state.model}|${state.checkpoint}|${slide.slide_key}`;
  if (state.classCountCache[cacheKey]) {
    state.classCounts = state.classCountCache[cacheKey];
    renderClassCounts();
    return;
  }

  const summaryUrl = state.model === 'promptnucseg'
    ? `${PROMPT_OUTPUT_ROOT}/${payload.patch_summary}`
    : `${HOVERNET_OUTPUT_ROOT}/${payload.patch_summary}`;
  const res = await fetch(summaryUrl);
  if (!res.ok) return;

  const ps = await res.json();
  const counts = {};
  const patches = Array.isArray(ps.patches) ? ps.patches : [];
  for (const patch of patches) {
    mergeTypeCounts(counts, patch.type_counts);
  }

  state.classCountCache[cacheKey] = counts;
  state.classCounts = counts;
  renderClassCounts();
}

function imageToCanvas(pt) {
  return viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(pt.x, pt.y));
}

function drawOverlay() {
  const canvas = el.overlayCanvas;
  const ctx = canvas.getContext('2d');
  resizeOverlayCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state.overlayVisible) return;

  if (!state.patchOverlayData || !Array.isArray(state.patchOverlayData.patches) || !state.patchOverlayData.patches.length) {
    return;
  }

  drawPatchOverlay(ctx);
}

function drawPatchOverlay(ctx) {
  const d = state.patchOverlayData;
  if (!d || !Array.isArray(d.patches) || d.patches.length === 0) return;

  const viewRect = viewer.viewport.viewportToImageRectangle(viewer.viewport.getBounds(true));
  const minX = viewRect.x - 256;
  const minY = viewRect.y - 256;
  const maxX = viewRect.x + viewRect.width + 256;
  const maxY = viewRect.y + viewRect.height + 256;

  // Render only visible patch overlays to keep interaction smooth.
  let drawn = 0;
  const maxToDraw = 1400;

  for (const p of d.patches) {
    if (p.x > maxX || p.y > maxY || (p.x + 256) < minX || (p.y + 256) < minY) continue;
    drawn += 1;
    if (drawn > maxToDraw) break;

    const cached = state.overlayImageCache[p.overlayUrl];
    if (!cached) {
      const img = new Image();
      img.onload = () => drawOverlay();
      img.onerror = () => { state.overlayImageCache[p.overlayUrl] = null; };
      img.src = p.overlayUrl;
      state.overlayImageCache[p.overlayUrl] = img;
      continue;
    }
    if (!cached.complete || cached.naturalWidth === 0) continue;

    const tl = imageToCanvas({ x: p.x, y: p.y });
    const br = imageToCanvas({ x: p.x + 256, y: p.y + 256 });
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    let alpha = state.overlayOpacity;
    if (state.overlayMode === 'high-contrast') alpha = Math.min(1, alpha + 0.12);
    if (state.overlayMode === 'blend') alpha = Math.max(0.08, alpha * 0.9);
    ctx.globalAlpha = alpha;
    ctx.drawImage(cached, tl.x, tl.y, w, h);
  }

  ctx.globalAlpha = 1;
}

async function loadOverlay(slide) {
  state.patchOverlayData = null;
  state.overlayImageCache = {};

  const modelBlock = (slide.models && slide.models[state.model]) ? slide.models[state.model] : {};
  const payload = modelBlock[state.checkpoint || 'default'];
  await loadClassCounts(slide, payload);

  const psRel = payload ? payload.patch_summary : null;
  if (!psRel) {
    setStatus('Patch summary unavailable');
    drawOverlay();
    return;
  }

  const root = modelRoot(state.model);
  const cacheKey = `${state.model}|${state.checkpoint}|${slide.slide_key}`;
  if (state.overlayPatchCache[cacheKey]) {
    state.patchOverlayData = state.overlayPatchCache[cacheKey];
    setStatus(`${state.model} overlays loaded (${state.patchOverlayData.patches.length} patches)`);
    drawOverlay();
    return;
  }

  const psRes = await fetch(`${root}/${psRel}`);
  if (!psRes.ok) {
    setStatus('Overlay patch summary unavailable');
    drawOverlay();
    return;
  }

  const ps = await psRes.json();
  const patchOverlayData = {
    patches: (ps.patches || [])
      .filter((p) => p.overlay_image && (p.x !== undefined) && (p.y !== undefined))
      .map((p) => ({
        x: Number(p.x),
        y: Number(p.y),
        overlayUrl: `${root}/${p.overlay_image}`,
      })),
  };
  state.overlayPatchCache[cacheKey] = patchOverlayData;
  state.patchOverlayData = patchOverlayData;
  setStatus(`${state.model} overlays loaded (${state.patchOverlayData.patches.length} patches)`);
  drawOverlay();
}

async function openSlide(slide) {
  renderSummary(slide);

  if (!slide.dzi) {
    setStatus('No .dzi tiles yet. Run pipeline with --generate-dzi.');
    viewer.close();
    drawOverlay();
    await loadOverlay(slide);
    return;
  }

  setStatus('Opening slide tiles...');
  await new Promise((resolve) => {
    viewer.addOnceHandler('open', resolve);
    viewer.open(`${DATA_BASE_URL}/${slide.dzi}`);
  });
  setStatus('Tiles loaded');
  resizeOverlayCanvas();
  await loadOverlay(slide);
}

async function refreshView() {
  const slides = getFilteredSlides();
  const slide = slides.find((s) => s.slide_key === state.slideKey) || slides[0];
  if (!slide) {
    setStatus('No matching slides');
    return;
  }
  state.slideKey = slide.slide_key;
  el.slide.value = slide.slide_key;
  await openSlide(slide);
}

function bindEvents() {
  el.model.addEventListener('change', async () => {
    state.model = el.model.value;
    refreshCheckpoints();
    renderLegend();
    refreshSlides();
    await refreshView();
  });

  el.checkpoint.addEventListener('change', async () => {
    state.checkpoint = el.checkpoint.value;
    renderLegend();
    refreshSlides();
    await refreshView();
  });

  el.cohort.addEventListener('change', async () => {
    state.cohort = el.cohort.value;
    refreshSlides();
    await refreshView();
  });

  el.slide.addEventListener('change', async () => {
    state.slideKey = el.slide.value;
    await refreshView();
  });

  el.overlay.addEventListener('change', () => {
    state.overlayVisible = el.overlay.checked;
    drawOverlay();
  });

  el.overlayMode.addEventListener('change', () => {
    state.overlayMode = el.overlayMode.value;
    drawOverlay();
  });

  el.overlayOpacity.addEventListener('input', () => {
    const pct = Number(el.overlayOpacity.value || 82);
    state.overlayOpacity = Math.max(0, Math.min(1, pct / 100));
    el.overlayOpacityValue.textContent = `${pct}%`;
    drawOverlay();
  });

  viewer.addHandler('animation', drawOverlay);
  viewer.addHandler('animation-finish', drawOverlay);
  viewer.addHandler('open', () => {
    resizeOverlayCanvas();
    drawOverlay();
  });
  viewer.addHandler('resize', drawOverlay);
  viewer.addHandler('full-page', drawOverlay);
  window.addEventListener('resize', drawOverlay);
}

async function init() {
  setStatus('Loading catalog...');
  const res = await fetch(`${DATA_BASE_URL}/catalog.json`);
  if (!res.ok) {
    setStatus('catalog.json not found. Run pipeline first.');
    return;
  }

  state.catalog = await res.json();
  state.overlayMode = el.overlayMode.value;
  state.overlayOpacity = Number(el.overlayOpacity.value || 82) / 100;
  el.overlayOpacityValue.textContent = `${Number(el.overlayOpacity.value || 82)}%`;
  renderLegend();
  renderClassCounts();
  refreshCheckpoints();
  refreshSlides();
  resizeOverlayCanvas();
  bindEvents();
  await refreshView();
}

init();

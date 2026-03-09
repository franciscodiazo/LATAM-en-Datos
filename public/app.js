const state = {
  token: localStorage.getItem('latam_token') || '',
  user: null,
  map: null,
  markersLayer: null,
  dashboardMap: null,
  dashboardMarkersLayer: null,
  lastRenderedPoints: [],
  lastDashboardPoints: [],
  socket: null,
  recordsCache: [],
  platformMapPoints: [],
  officialOpenData: {
    datasetId: '',
    title: '',
    generatedAt: '',
    sourceNotes: [],
    points: []
  },
  mapPoints: [],
  currentMapDataset: 'platform',
  coreProjectsById: {},
  activeColorFilter: 'ALL',
  activeRegionFilter: 'ALL',
  activeCityFilter: 'ALL',
  activeIndicatorFilter: 'ALL',
  activeMaslowFilter: 'ALL',
  charts: {
    maslowRadar: null,
    categoryBar: null,
    bloomBar: null
  }
};

const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userBadge = document.getElementById('userBadge');
const logoutBtn = document.getElementById('logoutBtn');
const uploadNav = document.getElementById('uploadNav');
const adminUsersPanel = document.getElementById('adminUsersPanel');
const adminCreateUserForm = document.getElementById('adminCreateUserForm');
const adminRole = document.getElementById('adminRole');
const adminUsersTable = document.getElementById('adminUsersTable');
const adminUsersMsg = document.getElementById('adminUsersMsg');
const colorFilterBar = document.getElementById('colorFilterBar');
const fitAllBtn = document.getElementById('fitAllBtn');
const mapStatsCards = document.getElementById('mapStatsCards');
const regionFilterBar = document.getElementById('regionFilterBar');
const cityFilterSelect = document.getElementById('cityFilterSelect');
const mapIndicatorFilter = document.getElementById('mapIndicatorFilter');
const clearCityBtn = document.getElementById('clearCityBtn');
const openGlobalMapBtn = document.getElementById('openGlobalMapBtn');
const mapDatasetSelect = document.getElementById('mapDatasetSelect');
const projectCoreSelect = document.getElementById('projectCoreSelect');
const projectCoreMeta = document.getElementById('projectCoreMeta');
const projectCoreDataView = document.getElementById('projectCoreDataView');
const ingestionDatasetSelect = document.getElementById('ingestionDatasetSelect');
const loadDatasetToTextareaBtn = document.getElementById('loadDatasetToTextareaBtn');
const uploadSelectedDatasetBtn = document.getElementById('uploadSelectedDatasetBtn');
const compareIndicatorFilter = document.getElementById('compareIndicatorFilter');
const compareDateFrom = document.getElementById('compareDateFrom');
const compareDateTo = document.getElementById('compareDateTo');
const compareNesstIndicators = document.getElementById('compareNesstIndicators');
const compareNesstHint = document.getElementById('compareNesstHint');
const compareActiveChips = document.getElementById('compareActiveChips');
const bloomTaxonomyChart = document.getElementById('bloomTaxonomyChart');
const bloomLevelList = document.getElementById('bloomLevelList');

const INDICATOR_LABELS = {
  WATER: 'Agua potable',
  WASTE: 'Residuos',
  CONNECTIVITY: 'Conectividad digital',
  INFRASTRUCTURE: 'Infraestructura escolar',
  OTHER: 'Otro'
};

const CORE_PROJECT_FILES = [
  '/data-core/core-food.json',
  '/data-core/core-resiliencia-ecosistemica.json',
  '/data-core/core-capacidad-comunitaria.json'
];

const ACTOR_FILES = {
  studentData: '/data-actores/actor-estudiantes.json',
  teacherData: '/data-actores/actor-docentes.json',
  researchData: '/data-actores/actor-investigadores.json'
};

const OFFICIAL_OPEN_DATA_FILE = '/data-open/official-open-latam.json';

// SECTIONS
const sectionIds = ['dashboard', 'mapa', 'comparador', 'maslow', 'embajadores', 'comunidad', 'proyectos', 'carga'];

// Regions for quick focus
const REGION_PRESETS = {
  GINEBRA: { label: 'Ginebra (Valle del Cauca)', bounds: { minLat: 3.69, maxLat: 3.74, minLng: -76.28, maxLng: -76.25 } },
  GUATEMALA: { label: 'Ciudad de Guatemala', bounds: { minLat: 14.53, maxLat: 14.74, minLng: -90.65, maxLng: -90.43 } },
  ARGENTINA: { label: 'Posadas (Misiones)', bounds: { minLat: -27.52, maxLat: -27.30, minLng: -55.99, maxLng: -55.83 } },
  ALL: { label: 'Latam Global', bounds: null }
};

const MASLOW_COLORS = {
  'Autorrealización': '#10b981',
  'Reconocimiento': '#0ea5e9',
  'Afiliación': '#f59e0b',
  'Seguridad': '#ec4899',
  'Fisiológicas': '#64748b'
};

const API_BASE = localStorage.getItem('latam_api_base') || (window.location.port === '3001' ? '' : 'http://localhost:3001');

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const preview = raw.trim().slice(0, 60).toLowerCase();
    if (preview.startsWith('<!doctype') || preview.startsWith('<html')) {
      throw new Error('La API devolvió HTML y no JSON. Abre la app desde http://localhost:3001 o configura latam_api_base.');
    }
    throw new Error('La API devolvió una respuesta inválida (no JSON).');
  }
}

function logout() {
  localStorage.removeItem('latam_token');
  state.token = '';
  state.user = null;
}

// API HELPERS
function authHeaders() {
  return { Authorization: `Bearer ${state.token}` };
}

async function apiGet(path) {
  const response = await fetch(apiUrl(path), { headers: authHeaders() });
  if (response.status === 401) { logout(); throw new Error('Sesión expirada.'); }
  const payload = await parseJsonResponse(response).catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Error de solicitud.');
  }
  return payload;
}

async function apiSend(path, method, body) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await parseJsonResponse(response).catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Error de solicitud.');
  return payload;
}

// NAVIGATION
function setActiveSection(sectionName) {
  sectionIds.forEach((name) => {
    const section = document.getElementById(`section-${name}`);
    if (section) section.classList.toggle('hidden', name !== sectionName);
  });

  document.querySelectorAll('.nav-item').forEach((button) => {
    const isActive = button.dataset.section === sectionName;
    if (isActive) {
      button.classList.add('nav-active');
    } else {
      button.classList.remove('nav-active');
    }
  });

  if (sectionName === 'mapa') {
    initializeMap();
    setTimeout(() => state.map.invalidateSize(), 200);
  }

  if (sectionName === 'dashboard') {
    initializeDashboardMap();
    setTimeout(() => state.dashboardMap?.invalidateSize(), 200);
  }

  if (sectionName === 'comparador') {
    initComparisonEngine();
  }
}

// MAP ENGINE (LEAFLET CUSTOM)
function initializeMap() {
  if (!state.map) {
    state.map = L.map('map', { zoomControl: false }).setView([4.5709, -74.2973], 5);

    // Capa base de OpenStreetMap estándar
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);

    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    state.markersLayer = L.layerGroup().addTo(state.map);

    state.map.on('zoomend', () => {
      if (state.lastRenderedPoints.length) {
        renderPoints(state.lastRenderedPoints, { fitBounds: false });
      }
    });
  }
}

function markerSizeForZoom(zoom) {
  return Math.max(18, Math.min(44, Math.round(zoom * 2.4)));
}

function buildPinIcon(color, size) {
  const holeSize = Math.max(6, Math.round(size * 0.34));
  return L.divIcon({
    html: `<div class="map-pin" style="--pin-color:${color}; --pin-size:${size}px; --pin-hole:${holeSize}px;"></div>`,
    className: 'leaflet-div-icon marker-pin-wrapper',
    iconSize: [size, size],
    iconAnchor: [Math.round(size * 0.42), size],
    popupAnchor: [0, -size + 10]
  });
}

function initializeDashboardMap() {
  if (!state.dashboardMap) {
    state.dashboardMap = L.map('dashboardMap', {
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false
    }).setView([4.5709, -74.2973], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.dashboardMap);

    state.dashboardMarkersLayer = L.layerGroup().addTo(state.dashboardMap);

    state.dashboardMap.on('zoomend', () => {
      if (state.lastDashboardPoints.length) {
        renderDashboardMapPoints(state.lastDashboardPoints, { fitBounds: false });
      }
    });
  }
}

function renderDashboardMapPoints(points, options = {}) {
  const { fitBounds = true } = options;
  initializeDashboardMap();
  if (!state.dashboardMap || !state.dashboardMarkersLayer) return;

  state.lastDashboardPoints = points;
  state.dashboardMarkersLayer.clearLayers();
  const markerSize = Math.max(14, Math.round(markerSizeForZoom(state.dashboardMap.getZoom()) * 0.72));

  points.forEach((point) => {
    const color = point.color || (MASLOW_COLORS[point.maslowLevel] || '#4f46e5');
    L.marker([point.lat, point.lng], { icon: buildPinIcon(color, markerSize) })
      .bindPopup(`<strong>${point.title}</strong><br><small>${point.category || 'Dato'} • ${point.maslowLevel || 'N/A'}</small>`)
      .addTo(state.dashboardMarkersLayer);
  });

  if (fitBounds && points.length > 0) {
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    state.dashboardMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 });
  } else if (fitBounds) {
    state.dashboardMap.setView([4.5709, -74.2973], 4);
  }
}

function pointInBounds(point, bounds) {
  if (!bounds) return true;
  return point.lat >= bounds.minLat && point.lat <= bounds.maxLat && point.lng >= bounds.minLng && point.lng <= bounds.maxLng;
}

function inferCity(point) {
  if (point.cityName) return point.cityName;
  if (point.zipCode === '763510') return 'Ginebra';

  const text = `${point.title || ''} ${point.projectName || ''}`.toLowerCase();

  if (text.includes('guatemala')) return 'Ciudad de Guatemala';
  if (text.includes('posadas') || text.includes('misiones')) return 'Posadas';
  if (text.includes('ginebra')) return 'Ginebra';

  const dict = ['bogotá', 'medellín', 'quito', 'lima', 'caracas', 'santiago', 'buenos aires'];
  const found = dict.find(city => text.includes(city));
  if (found) return found.replace(/\b\w/g, char => char.toUpperCase());

  return 'Desconocida';
}

function inferIndicatorCode(point) {
  if (point.indicatorCode) return point.indicatorCode;
  const text = `${point.title || ''} ${point.description || ''} ${point.siteType || ''} ${point.category || ''}`.toLowerCase();
  if (text.includes('agua') || text.includes('acueduct')) return 'WATER';
  if (text.includes('residu') || text.includes('basura') || text.includes('recicl')) return 'WASTE';
  if (text.includes('conect') || text.includes('internet') || text.includes('digital')) return 'CONNECTIVITY';
  if (text.includes('infraestructura') || text.includes('escuela') || text.includes('colegio') || text.includes('aula')) return 'INFRASTRUCTURE';
  return 'OTHER';
}

function formatIndicatorLabel(code) {
  return INDICATOR_LABELS[code] || code;
}

function toDateOnly(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function inferBloomLevel(point) {
  if (point?.bloomLevel) return String(point.bloomLevel).trim();
  const maslow = String(point?.maslowLevel || '').toLowerCase();
  if (maslow.includes('fisiol')) return 'Recordar';
  if (maslow.includes('seguridad')) return 'Comprender';
  if (maslow.includes('afili')) return 'Aplicar';
  if (maslow.includes('reconoc')) return 'Analizar';
  if (maslow.includes('autorreal')) return 'Evaluar';
  return 'Crear';
}

function mapSmithsonianBucket(point) {
  const raw = String(point.smithsonianGuide || '').toLowerCase();
  if (raw.includes('aliment')) return 'ALIMENTACION';
  if (raw.includes('comun')) return 'COMUNIDADES';
  if (raw.includes('resilien') || raw.includes('ecos')) return 'ECOSISTEMAS';
  return 'COMUNIDADES';
}

function getSelectedNesstBuckets() {
  if (!compareNesstIndicators) return ['ALIMENTACION', 'COMUNIDADES', 'ECOSISTEMAS'];
  const checked = [...compareNesstIndicators.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  return checked;
}

function renderCompareActiveChips() {
  if (!compareActiveChips) return;

  const selectedNesst = getSelectedNesstBuckets();
  const nesstLabel = selectedNesst.length
    ? `NESST: ${selectedNesst
        .map((key) => {
          if (key === 'ALIMENTACION') return 'Alimentación';
          if (key === 'COMUNIDADES') return 'Comunidades Sostenibles';
          if (key === 'ECOSISTEMAS') return 'Ecosistemas Resilientes';
          return key;
        })
        .join(' · ')}`
    : 'NESST: sin selección';

  const indicator = compareIndicatorFilter?.value || 'ALL';
  const indicatorLabel = `Indicador: ${indicator === 'ALL' ? 'Todos' : formatIndicatorLabel(indicator)}`;
  const fromDate = compareDateFrom?.value || 'Inicio';
  const toDate = compareDateTo?.value || 'Hoy';
  const dateLabel = `Periodo: ${fromDate} → ${toDate}`;

  const chips = [nesstLabel, indicatorLabel, dateLabel]
    .map((label) => `<span class="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-bold text-indigo-700">${label}</span>`)
    .join('');

  compareActiveChips.innerHTML = chips;
}

function renderCityFilterOptions(pointsByRegion) {
  if (!cityFilterSelect) return;
  const citySet = new Set(pointsByRegion.map(p => inferCity(p)));
  const options = ['<option value="ALL">Todas las ciudades</option>'];
  [...citySet].sort((a, b) => a.localeCompare(b)).forEach(city => {
    options.push(`<option value="${city}" ${city === state.activeCityFilter ? 'selected' : ''}>${city}</option>`);
  });
  cityFilterSelect.innerHTML = options.join('');
}

function renderIndicatorFilterOptions(points) {
  if (!mapIndicatorFilter) return;
  const set = new Set(points.map((p) => inferIndicatorCode(p)));
  const codes = [...set].sort((a, b) => formatIndicatorLabel(a).localeCompare(formatIndicatorLabel(b)));
  const options = ['<option value="ALL">📌 Todos los indicadores</option>'];
  codes.forEach((code) => {
    options.push(`<option value="${code}" ${code === state.activeIndicatorFilter ? 'selected' : ''}>${formatIndicatorLabel(code)}</option>`);
  });
  mapIndicatorFilter.innerHTML = options.join('');
}

function buildComparisonIndicatorOptions(points) {
  if (!compareIndicatorFilter) return;
  const current = compareIndicatorFilter.value || 'ALL';
  const set = new Set(points.map((p) => inferIndicatorCode(p)));
  const codes = [...set].sort((a, b) => formatIndicatorLabel(a).localeCompare(formatIndicatorLabel(b)));
  compareIndicatorFilter.innerHTML =
    '<option value="ALL">Todos los indicadores</option>' +
    codes.map((code) => `<option value="${code}">${formatIndicatorLabel(code)}</option>`).join('');
  compareIndicatorFilter.value = codes.includes(current) || current === 'ALL' ? current : 'ALL';
}

function renderRegionFilters() {
  if (!regionFilterBar) return;
  const buttons = Object.entries(REGION_PRESETS).map(([key, preset]) => {
    const s = key === state.activeRegionFilter ? 'bg-indigo-600 text-white font-bold' : 'bg-white text-slate-600';
    return `<button class="px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-sm hover:shadow transition-colors ${s}" data-region="${key}">${preset.label}</button>`;
  });
  regionFilterBar.innerHTML = buttons.join('');
}

function getFilteredPoints() {
  const pointsByReg = getPointsByRegion();
  const pointsByCity = state.activeCityFilter === 'ALL' ? pointsByReg : pointsByReg.filter(p => inferCity(p) === state.activeCityFilter);
  const ptM = state.activeMaslowFilter === 'ALL' ? pointsByCity : pointsByCity.filter(p => p.maslowLevel === state.activeMaslowFilter);
  const ptI = state.activeIndicatorFilter === 'ALL' ? ptM : ptM.filter((p) => inferIndicatorCode(p) === state.activeIndicatorFilter);
  if (state.activeColorFilter === 'ALL') return ptI;
  return ptI.filter(p => (p.color || '#2563EB').toUpperCase() === state.activeColorFilter);
}

function getPointsByRegion() {
  const regionPreset = REGION_PRESETS[state.activeRegionFilter] || REGION_PRESETS.ALL;
  return regionPreset.bounds ? state.mapPoints.filter(p => pointInBounds(p, regionPreset.bounds)) : state.mapPoints;
}

function renderPoints(points, options = {}) {
  const { fitBounds = true } = options;
  if (!state.markersLayer) return;
  state.lastRenderedPoints = points;
  state.markersLayer.clearLayers();
  const markerSize = markerSizeForZoom(state.map.getZoom());

  points.forEach(point => {
    const color = point.color || (MASLOW_COLORS[point.maslowLevel] || '#4f46e5');

    const icon = buildPinIcon(color, markerSize);

    const html = `
      <div class="p-1 font-sans">
        <h4 class="font-extrabold text-slate-900 border-b pb-1 mb-1">${point.title}</h4>
        <p class="text-xs text-slate-600 bg-slate-50 p-1 rounded font-mono">${point.category || 'Dato'} • ${point.maslowLevel || 'N/A'}</p>
        ${point.description ? `<p class="text-xs mt-1 text-slate-500 italic">"${point.description}"</p>` : ''}
      </div>
    `;

    L.marker([point.lat, point.lng], { icon }).bindPopup(html, { className: 'custom-popup rounded-2xl' }).addTo(state.markersLayer);
  });

  if (fitBounds && points.length > 0 && state.map) {
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  } else if (fitBounds && state.map) {
    state.map.setView([4.5, -74.29], 4);
  }
}

function refreshMapView() {
  renderDashboardMapPoints(state.mapPoints);
  renderRegionFilters();
  renderIndicatorFilterOptions(state.mapPoints);
  const allPtsReg = getPointsByRegion();
  renderCityFilterOptions(allPtsReg);
  const finalPts = getFilteredPoints();
  renderPoints(finalPts);

  // Dashboard Metrics Binding
  if (state.mapPoints) {
    const safeSet = (id, bnd) => {
      const el = document.getElementById(id);
      if (el && bnd) el.textContent = state.mapPoints.filter(p => pointInBounds(p, bnd)).length;
    };
    safeSet('card-ginebra-datos', REGION_PRESETS.GINEBRA.bounds);
    safeSet('card-guatemala-datos', REGION_PRESETS.GUATEMALA.bounds);
    safeSet('card-argentina-datos', REGION_PRESETS.ARGENTINA.bounds);
  }

  renderMaslowHighlights(state.mapPoints);
  renderBloomTaxonomy(state.mapPoints);
}

function renderMaslowHighlights(points) {
  const maslowData = document.getElementById('maslowData');
  if (!maslowData) return;

  const rows = [...points]
    .sort((a, b) => new Date(b.measurementDate || b.createdAt || 0) - new Date(a.measurementDate || a.createdAt || 0))
    .slice(0, 8);

  if (!rows.length) {
    maslowData.innerHTML = '<li class="bento-card p-4 text-slate-500">Sin registros disponibles en el dataset activo.</li>';
    return;
  }

  maslowData.innerHTML = rows
    .map(
      (row) => `
    <li class="bento-card p-4 bg-white">
      <p class="font-extrabold text-slate-800 text-sm">${row.title || 'Registro'}</p>
      <p class="text-xs text-slate-500 mt-1">${inferCity(row)} · ${formatIndicatorLabel(inferIndicatorCode(row))}</p>
      <p class="text-xs text-slate-600 mt-1">Maslow: ${row.maslowLevel || 'N/A'} · Bloom: ${inferBloomLevel(row)}</p>
    </li>
  `
    )
    .join('');
}

function renderBloomTaxonomy(points) {
  if (!bloomLevelList) return;

  const counts = points.reduce((acc, point) => {
    const lvl = inferBloomLevel(point);
    acc[lvl] = (acc[lvl] || 0) + 1;
    return acc;
  }, {});

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    bloomLevelList.innerHTML = '<li class="text-slate-500 text-sm">Sin datos Bloom en el dataset activo.</li>';
    if (state.charts.bloomBar) {
      state.charts.bloomBar.destroy();
      state.charts.bloomBar = null;
    }
    return;
  }

  bloomLevelList.innerHTML = entries
    .map(
      ([level, count]) =>
        `<li class="flex items-center justify-between text-sm"><span class="font-bold text-slate-700">${level}</span><span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-xs">${count}</span></li>`
    )
    .join('');

  if (!bloomTaxonomyChart) return;

  if (state.charts.bloomBar) state.charts.bloomBar.destroy();
  state.charts.bloomBar = new Chart(bloomTaxonomyChart, {
    type: 'bar',
    data: {
      labels: entries.map(([level]) => level),
      datasets: [
        {
          label: 'Registros por nivel Bloom',
          data: entries.map(([, count]) => count),
          backgroundColor: 'rgba(79, 70, 229, 0.75)',
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// COMPARISON ENGINE (CHART JS)
function initComparisonEngine() {
  const c1 = document.getElementById('compareSelect1');
  const c2 = document.getElementById('compareSelect2');
  const c3 = document.getElementById('compareSelect3');
  if (!c1) return;

  buildComparisonIndicatorOptions(state.mapPoints);

  const allCities = [...new Set(state.mapPoints.map(p => inferCity(p)))].filter(c => c !== 'Desconocida').sort();

  const fill = (el, defIdx) => {
    el.innerHTML = '<option value="">( Ninguna )</option>' + allCities.map((c, i) => `<option value="${c}" ${i === defIdx ? 'selected' : ''}>${c}</option>`).join('');
  };

  fill(c1, 0); fill(c2, 1); fill(c3, 2);

  const draw = () => drawComparingCharts([c1.value, c2.value, c3.value].filter(Boolean));
  c1.onchange = draw;
  c2.onchange = draw;
  c3.onchange = draw;
  if (compareIndicatorFilter) compareIndicatorFilter.onchange = draw;
  if (compareDateFrom) compareDateFrom.onchange = draw;
  if (compareDateTo) compareDateTo.onchange = draw;
  if (compareNesstIndicators) {
    compareNesstIndicators.onchange = draw;
  }
  draw();
}

function filterPointsForComparison(points) {
  const indicator = compareIndicatorFilter?.value || 'ALL';
  const fromDate = compareDateFrom?.value || '';
  const toDate = compareDateTo?.value || '';
  const selectedNesst = getSelectedNesstBuckets();

  if (!selectedNesst.length) {
    if (compareNesstHint) compareNesstHint.classList.remove('hidden');
    return [];
  }
  if (compareNesstHint) compareNesstHint.classList.add('hidden');

  return points.filter((point) => {
    const indicatorOk = indicator === 'ALL' ? true : inferIndicatorCode(point) === indicator;
    if (!indicatorOk) return false;
    const nesstOk = selectedNesst.includes(mapSmithsonianBucket(point));
    if (!nesstOk) return false;
    const day = toDateOnly(point.measurementDate || point.createdAt);
    if (fromDate && day && day < fromDate) return false;
    if (toDate && day && day > toDate) return false;
    return true;
  });
}

function drawComparingCharts(cities) {
  renderCompareActiveChips();

  if (state.charts.maslowRadar) state.charts.maslowRadar.destroy();
  if (state.charts.categoryBar) state.charts.categoryBar.destroy();

  if (cities.length === 0) return;

  const points = filterPointsForComparison(state.mapPoints);

  const maslowLevels = ['Fisiológicas', 'Seguridad', 'Afiliación', 'Reconocimiento', 'Autorrealización'];
  const pColors = ['rgba(79, 70, 229, 0.4)', 'rgba(14, 165, 233, 0.4)', 'rgba(236, 72, 153, 0.4)'];
  const bColors = ['rgb(79, 70, 229)', 'rgb(14, 165, 233)', 'rgb(236, 72, 153)'];

  // Radar Data
  const radarDatasets = cities.map((city, idx) => {
    const pts = points.filter(p => inferCity(p) === city);
    const data = maslowLevels.map(lvl => pts.filter(p => p.maslowLevel === lvl).length);
    return {
      label: city,
      data: data,
      backgroundColor: pColors[idx],
      borderColor: bColors[idx],
      borderWidth: 2,
      pointBackgroundColor: bColors[idx]
    }
  });

  state.charts.maslowRadar = new Chart(document.getElementById('maslowRadarChart'), {
    type: 'radar',
    data: { labels: maslowLevels, datasets: radarDatasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { r: { ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } } }
    }
  });

  // Bar Data (Categories)
  const catSet = new Set();
  points.forEach(p => catSet.add(p.category || 'Otro'));
  const cats = [...catSet];

  const barDatasets = cities.map((city, idx) => {
    const pts = points.filter(p => inferCity(p) === city);
    const data = cats.map(c => pts.filter(p => (p.category || 'Otro') === c).length);
    return {
      label: city,
      data: data,
      backgroundColor: bColors[idx],
      borderRadius: 6
    }
  });

  state.charts.categoryBar = new Chart(document.getElementById('categoryBarChart'), {
    type: 'bar',
    data: { labels: cats, datasets: barDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// DASHBOARD RENDERERS
function renderDashboard(data) {
  const st = document.getElementById('statsCards');
  if (st) {
    const boxes = [
      { t: 'Registros DataCenter', v: data.totalRecords, icon: '🗄️', c: 'text-indigo-600' },
      { t: 'Geomarcadores', v: data.mappedRecords, icon: '📍', c: 'text-rose-600' },
      { t: 'Proyectos Externos', v: data.totalProjects, icon: '💡', c: 'text-amber-600' }
    ];
    if (typeof data.totalUsers === 'number') boxes.push({ t: 'Comunidad Activa', v: data.totalUsers, icon: '👥', c: 'text-cyan-600' });
    st.innerHTML = boxes.map(b => `<div class="bento-card p-5 bg-white"><div class="text-2xl mb-2">${b.icon}</div><p class="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">${b.t}</p><p class="text-3xl font-black mt-1 ${b.c}">${b.v}</p></div>`).join('');
  }

  const ms = document.getElementById('maslowStats');
  if (ms) ms.innerHTML = Object.entries(data.byMaslow || {}).map(([k, v]) => `<li class="flex justify-between items-center text-[13px]"><span class="font-bold text-slate-600">${k}</span><span class="bg-indigo-100 text-indigo-700 font-extrabold px-2 py-0.5 rounded-full">${v}</span></li>`).join('');

  const cs = document.getElementById('categoryStats');
  if (cs) cs.innerHTML = Object.entries(data.byCategory || {}).map(([k, v]) => `<li class="flex justify-between items-center text-[13px]"><span class="font-bold text-slate-600">${k}</span><span class="bg-emerald-100 text-emerald-700 font-extrabold px-2 py-0.5 rounded-full">${v}</span></li>`).join('');
}

function renderRecentProjects(projects = []) {
  const projectsList = document.getElementById('projectsList');
  if (!projectsList) return;

  if (!projects.length) {
    projectsList.innerHTML = '<li class="bento-card p-4 text-sm text-slate-500">Sin proyectos recientes.</li>';
    return;
  }

  projectsList.innerHTML = projects.map((project) => `
    <li class="bento-card p-5 bg-white">
      <h4 class="font-extrabold text-slate-900">${project.title || 'Proyecto'}</h4>
      <p class="text-sm text-slate-600 mt-1">${project.summary || ''}</p>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">${project.owner || 'Sin responsable'}</span>
        <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">${project.source || 'Sin fuente'}</span>
      </div>
    </li>
  `).join('');
}

async function fetchPublicJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

function extractRecordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.points)) return payload.points;
  if (Array.isArray(payload?.mapPoints)) return payload.mapPoints;
  return [];
}

function normalizeMapPoints(points = []) {
  return points
    .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
    .map((point) => ({
      ...point,
      lat: Number(point.lat),
      lng: Number(point.lng)
    }));
}

function getCoreDatasetPoints(datasetId) {
  const project = state.coreProjectsById[datasetId];
  const mapPoints = Array.isArray(project?.mapPoints) ? project.mapPoints : [];
  return normalizeMapPoints(mapPoints);
}

async function loadOfficialOpenDataPoints() {
  try {
    const payload = await apiGet('/api/open-data/points');
    state.officialOpenData = {
      datasetId: payload.datasetId || 'official-open-latam-fase1',
      title: payload.title || 'Datos Oficiales LATAM',
      generatedAt: payload.generatedAt || '',
      sourceNotes: Array.isArray(payload.sourceNotes) ? payload.sourceNotes : [],
      points: normalizeMapPoints(payload.points || [])
    };
    return;
  } catch (_) {
    const fallback = await fetchPublicJson(OFFICIAL_OPEN_DATA_FILE);
    state.officialOpenData = {
      datasetId: fallback.datasetId || 'official-open-latam-fase1',
      title: fallback.title || 'Datos Oficiales LATAM',
      generatedAt: fallback.generatedAt || '',
      sourceNotes: Array.isArray(fallback.sourceNotes) ? fallback.sourceNotes : [],
      points: normalizeMapPoints(fallback.mapPoints || fallback.records || [])
    };
  }
}

function applyMapDataset(datasetId = 'platform') {
  state.currentMapDataset = datasetId;
  state.activeRegionFilter = 'ALL';
  state.activeCityFilter = 'ALL';
  state.activeIndicatorFilter = 'ALL';
  state.activeMaslowFilter = 'ALL';

  if (datasetId === 'platform') {
    state.mapPoints = state.platformMapPoints;
  } else if (datasetId === 'official-open-data') {
    state.mapPoints = state.officialOpenData.points;
  } else {
    state.mapPoints = getCoreDatasetPoints(datasetId);
  }

  if (mapDatasetSelect) mapDatasetSelect.value = datasetId;
  if (cityFilterSelect) cityFilterSelect.value = 'ALL';
  if (mapIndicatorFilter) mapIndicatorFilter.value = 'ALL';
  buildComparisonIndicatorOptions(state.mapPoints);
  refreshMapView();
}

function renderProjectCoreData(project) {
  if (!projectCoreDataView) return;
  if (!project || !Array.isArray(project.records)) {
    projectCoreDataView.innerHTML = '<div class="bento-card p-4 text-sm text-rose-600">Sin datos para este proyecto.</div>';
    return;
  }

  if (projectCoreMeta) {
    const ods = (project.focusOds || []).join(' · ');
    projectCoreMeta.textContent = `${project.summary || ''}${ods ? ` | ${ods}` : ''}`;
  }

  projectCoreDataView.innerHTML = project.records.map((record) => `
    <article class="bento-card p-4 bg-white">
      <h5 class="font-extrabold text-slate-900 text-sm">${record.indicator || 'Indicador'}</h5>
      <p class="text-xs text-slate-500 mt-1">${record.ods || ''} · Meta ${record.meta || 'N/A'}</p>
      <p class="text-xs text-slate-600 mt-2"><strong>Tipo:</strong> ${record.tipoDato || 'N/A'}</p>
      <p class="text-xs text-slate-600"><strong>Instrumento:</strong> ${record.instrumento || 'N/A'}</p>
      <p class="text-xs text-slate-600"><strong>Valor ejemplo:</strong> ${record.valorEjemplo ?? 'N/A'} ${record.unidad || ''}</p>
      <p class="text-xs text-slate-500 mt-2 italic">${record.territorio || ''}</p>
    </article>
  `).join('');
}

async function loadCoreProjectsData() {
  if (!projectCoreSelect) return;

  let payloads = [];
  try {
    const apiPayload = await apiGet('/api/core-projects');
    payloads = Array.isArray(apiPayload?.projects) ? apiPayload.projects : [];
  } catch (_) {
    payloads = await Promise.all(CORE_PROJECT_FILES.map((path) => fetchPublicJson(path)));
  }

  const valid = payloads.filter((item) => item?.projectId);
  if (!valid.length) {
    projectCoreDataView.innerHTML = '<div class="bento-card p-4 text-sm text-rose-600">No se encontraron proyectos CORE.</div>';
    return;
  }

  state.coreProjectsById = valid.reduce((acc, item) => {
    acc[item.projectId] = item;
    return acc;
  }, {});

  projectCoreSelect.innerHTML = valid.map((project, index) =>
    `<option value="${project.projectId}" ${index === 0 ? 'selected' : ''}>${project.title}</option>`
  ).join('');

  const getProject = (projectId) => valid.find((project) => project.projectId === projectId);
  renderProjectCoreData(getProject(valid[0]?.projectId));

  projectCoreSelect.onchange = (event) => {
    renderProjectCoreData(getProject(event.target.value));
  };

  if (state.currentMapDataset !== 'platform') {
    applyMapDataset(state.currentMapDataset);
  }
}

function renderActorItems(targetId, payload) {
  const element = document.getElementById(targetId);
  if (!element) return;

  const rows = Array.isArray(payload?.items) ? payload.items : [];
  if (!rows.length) {
    element.innerHTML = '<li>Sin datos disponibles.</li>';
    return;
  }

  element.innerHTML = rows.map((row) => `
    <li class="bg-white/60 border border-slate-100 rounded-xl p-3">
      <p class="font-bold text-slate-700">${row.tema || 'Tema'}</p>
      <p class="text-xs mt-1">${row.accion || ''}</p>
      <p class="text-[11px] mt-2 text-slate-500">${row.indicador || ''} · ${row.ods || ''}</p>
    </li>
  `).join('');
}

async function loadEducationalActorsData() {
  try {
    const payload = await apiGet('/api/actors');
    const actors = Array.isArray(payload?.actors) ? payload.actors : [];
    const byRole = actors.reduce((acc, actor) => {
      acc[String(actor.actor || '').toUpperCase()] = actor;
      return acc;
    }, {});

    renderActorItems('studentData', byRole.ESTUDIANTE || { items: [] });
    renderActorItems('teacherData', byRole.DOCENTE || { items: [] });
    renderActorItems('researchData', byRole.INVESTIGADOR || { items: [] });
    return;
  } catch (_) {}

  const [students, teachers, researchers] = await Promise.all([
    fetchPublicJson(ACTOR_FILES.studentData),
    fetchPublicJson(ACTOR_FILES.teacherData),
    fetchPublicJson(ACTOR_FILES.researchData)
  ]);

  renderActorItems('studentData', students);
  renderActorItems('teacherData', teachers);
  renderActorItems('researchData', researchers);
}


// UI BINDINGS
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  try {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value.trim() })
    });
    const py = await parseJsonResponse(res);
    if (!res.ok) throw new Error(py.message || 'Error de login');

    state.token = py.token; state.user = py.user;
    localStorage.setItem('latam_token', state.token);
    userBadge.textContent = `${py.user.fullName} / ${py.user.role}`;

    if (['ADMIN', 'AGENTE_AUTORIZADO'].includes(py.user.role)) {
      uploadNav.classList.remove('hidden');
      document.getElementById('divider-admin').classList.remove('hidden');
    }

    loginView.style.opacity = '0';
    setTimeout(() => {
      loginView.classList.add('hidden');
      appView.classList.remove('hidden');
      setActiveSection('dashboard');
      loadAppData();
    }, 400);

  } catch (error) {
    loginError.textContent = error.message; loginError.classList.remove('hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('latam_token');
  location.reload();
});

document.querySelectorAll('.nav-item').forEach(b => {
  b.addEventListener('click', () => setActiveSection(b.dataset.section));
});

document.querySelectorAll('.m-level').forEach((button) => {
  button.addEventListener('click', () => {
    const level = button.dataset.maslow;
    state.activeMaslowFilter = state.activeMaslowFilter === level ? 'ALL' : level;
    setActiveSection('mapa');
    refreshMapView();
  });
});

if (regionFilterBar) {
  regionFilterBar.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    state.activeRegionFilter = t.dataset.region;
    state.activeCityFilter = 'ALL';
    refreshMapView();
  });
}

if (cityFilterSelect) {
  cityFilterSelect.addEventListener('change', e => {
    state.activeCityFilter = e.target.value;
    refreshMapView();
  });
}

if (mapIndicatorFilter) {
  mapIndicatorFilter.addEventListener('change', (e) => {
    state.activeIndicatorFilter = e.target.value;
    refreshMapView();
  });
}

if (clearCityBtn) {
  clearCityBtn.addEventListener('click', () => {
    state.activeCityFilter = 'ALL';
    cityFilterSelect.value = 'ALL';
    refreshMapView();
  });
}

if (fitAllBtn) {
  fitAllBtn.addEventListener('click', () => {
    state.activeRegionFilter = 'ALL';
    state.activeCityFilter = 'ALL';
    state.activeIndicatorFilter = 'ALL';
    if (mapIndicatorFilter) mapIndicatorFilter.value = 'ALL';
    refreshMapView();
  });
}

if (openGlobalMapBtn) {
  openGlobalMapBtn.addEventListener('click', () => {
    document.querySelector('[data-section="mapa"]')?.click();
  });
}

if (mapDatasetSelect) {
  mapDatasetSelect.addEventListener('change', (event) => {
    applyMapDataset(event.target.value);
  });
}

if (loadDatasetToTextareaBtn) {
  loadDatasetToTextareaBtn.addEventListener('click', async () => {
    const targetPath = ingestionDatasetSelect?.value;
    const uploadMsg = document.getElementById('uploadMsg');
    if (!targetPath) return;
    try {
      const payload = await fetchPublicJson(targetPath);
      const records = extractRecordsFromPayload(payload);
      const uploadJson = document.getElementById('uploadJson');
      if (uploadJson) {
        uploadJson.value = JSON.stringify(records, null, 2);
      }
      if (uploadMsg) {
        uploadMsg.className = 'text-sm mt-5 font-bold text-center p-3 rounded-xl block bg-indigo-50 text-indigo-700';
        uploadMsg.textContent = `Dataset cargado al editor: ${records.length} registros.`;
      }
    } catch (error) {
      if (uploadMsg) {
        uploadMsg.className = 'text-sm mt-5 font-bold text-center p-3 rounded-xl block bg-rose-50 text-rose-700';
        uploadMsg.textContent = error.message;
      }
    }
  });
}

if (uploadSelectedDatasetBtn) {
  uploadSelectedDatasetBtn.addEventListener('click', async () => {
    const targetPath = ingestionDatasetSelect?.value;
    const uploadMsg = document.getElementById('uploadMsg');
    if (!targetPath || !uploadMsg) return;

    uploadMsg.className = 'text-sm mt-5 font-bold text-center p-3 rounded-xl block bg-slate-50 text-slate-600';
    uploadMsg.textContent = 'Cargando dataset seleccionado...';

    try {
      const payload = await fetchPublicJson(targetPath);
      const records = extractRecordsFromPayload(payload);
      if (!records.length) throw new Error('El dataset seleccionado no contiene records válidos.');

      const response = await fetch(apiUrl('/api/data/upload'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });
      const body = await parseJsonResponse(response).catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Error subiendo dataset.');

      uploadMsg.className = 'text-sm mt-5 font-bold text-center p-3 rounded-xl block bg-emerald-50 text-emerald-700';
      uploadMsg.textContent = `Dataset subido correctamente. Insertados: ${body.inserted || records.length}`;
      await loadAppData();
    } catch (error) {
      uploadMsg.className = 'text-sm mt-5 font-bold text-center p-3 rounded-xl block bg-rose-50 text-rose-700';
      uploadMsg.textContent = error.message;
    }
  });
}

// UPLOAD FUNCTION
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = document.getElementById('uploadMsg');
  const file = document.getElementById('uploadFile').files[0];
  const json = document.getElementById('uploadJson').value;

  m.className = 'text-xs font-bold text-slate-500 block'; m.textContent = 'Procesando inserción...';

  try {
    let res;
    if (file) {
      const fd = new FormData(); fd.append('file', file);
      res = await fetch(apiUrl('/api/data/upload'), { method: 'POST', headers: authHeaders(), body: fd });
    } else if (json) {
      res = await fetch(apiUrl('/api/data/upload'), {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: JSON.parse(json) })
      });
    } else {
      throw new Error('Sin input');
    }
    if (!res.ok) throw new Error('Error al inyectar datos.');
    const py = await parseJsonResponse(res);
    m.className = 'text-xs font-bold text-emerald-600 block bg-emerald-50';
    m.textContent = `ÉXITO. ${py.inserted} rows insertadas centralmente.`;
    await loadAppData();
  } catch (err) {
    m.className = 'text-xs font-bold text-rose-600 block bg-rose-50';
    m.textContent = err.message;
  }
});

// App Bootstrap logic
async function loadAppData() {
  const [db, mapData, recentProjects] = await Promise.all([
    apiGet('/api/dashboard'),
    apiGet('/api/map/points'),
    apiGet('/api/projects/recent').catch(() => ({ projects: [] }))
  ]);
  renderDashboard(db);
  renderRecentProjects(recentProjects.projects || []);
  state.platformMapPoints = mapData.points || [];

  await Promise.allSettled([
    loadOfficialOpenDataPoints(),
    loadCoreProjectsData(),
    loadEducationalActorsData()
  ]);

  applyMapDataset(state.currentMapDataset);
}
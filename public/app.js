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
  mapPoints: [],
  activeColorFilter: 'ALL',
  activeRegionFilter: 'ALL',
  activeCityFilter: 'ALL',
  activeMaslowFilter: 'ALL',
  charts: {
    maslowRadar: null,
    categoryBar: null
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
const clearCityBtn = document.getElementById('clearCityBtn');
const openGlobalMapBtn = document.getElementById('openGlobalMapBtn');

// SECTIONS
const sectionIds = ['dashboard', 'mapa', 'comparador', 'maslow', 'embajadores', 'comunidad', 'proyectos', 'carga'];

// Regions for quick focus
const REGION_PRESETS = {
  GINEBRA: { label: 'Ginebra (Valle)', bounds: { minLat: 3.69, maxLat: 3.74, minLng: -76.28, maxLng: -76.25 } },
  GUATEMALA: { label: 'Guatemala', bounds: { minLat: 13.5, maxLat: 18.0, minLng: -92.4, maxLng: -88.0 } },
  ARGENTINA: { label: 'Argentina', bounds: { minLat: -55.2, maxLat: -21.5, minLng: -73.7, maxLng: -53.5 } },
  ALL: { label: 'Latam Global', bounds: null }
};

const MASLOW_COLORS = {
  'Autorrealización': '#10b981',
  'Reconocimiento': '#0ea5e9',
  'Afiliación': '#f59e0b',
  'Seguridad': '#ec4899',
  'Fisiológicas': '#64748b'
};

// API HELPERS
function authHeaders() {
  return { Authorization: `Bearer ${state.token}` };
}

async function apiGet(path) {
  const response = await fetch(path, { headers: authHeaders() });
  if (response.status === 401) { logout(); throw new Error('Sesión expirada.'); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Error de solicitud.');
  }
  return response.json();
}

async function apiSend(path, method, body) {
  const response = await fetch(path, {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
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

  if (text.includes('guatemala')) return 'Cdad de Guatemala';
  if (text.includes('bariloche') || point.lat < -40) return 'Bariloche';
  if (text.includes('ginebra')) return 'Ginebra';

  const dict = ['bogotá', 'medellín', 'quito', 'lima', 'caracas', 'santiago', 'buenos aires'];
  const found = dict.find(city => text.includes(city));
  if (found) return found.replace(/\b\w/g, char => char.toUpperCase());

  return 'Desconocida';
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
  if (state.activeColorFilter === 'ALL') return ptM;
  return ptM.filter(p => (p.color || '#2563EB').toUpperCase() === state.activeColorFilter);
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
}

// COMPARISON ENGINE (CHART JS)
function initComparisonEngine() {
  const c1 = document.getElementById('compareSelect1');
  const c2 = document.getElementById('compareSelect2');
  const c3 = document.getElementById('compareSelect3');
  if (!c1) return;

  const allCities = [...new Set(state.mapPoints.map(p => inferCity(p)))].filter(c => c !== 'Desconocida').sort();

  const fill = (el, defIdx) => {
    el.innerHTML = '<option value="">( Ninguna )</option>' + allCities.map((c, i) => `<option value="${c}" ${i === defIdx ? 'selected' : ''}>${c}</option>`).join('');
  };

  fill(c1, 0); fill(c2, 1); fill(c3, 2);

  const draw = () => drawComparingCharts([c1.value, c2.value, c3.value].filter(Boolean));
  [c1, c2, c3].forEach(el => el.addEventListener('change', draw));
  draw();
}

function drawComparingCharts(cities) {
  if (state.charts.maslowRadar) state.charts.maslowRadar.destroy();
  if (state.charts.categoryBar) state.charts.categoryBar.destroy();

  if (cities.length === 0) return;

  const maslowLevels = ['Fisiológicas', 'Seguridad', 'Afiliación', 'Reconocimiento', 'Autorrealización'];
  const pColors = ['rgba(79, 70, 229, 0.4)', 'rgba(14, 165, 233, 0.4)', 'rgba(236, 72, 153, 0.4)'];
  const bColors = ['rgb(79, 70, 229)', 'rgb(14, 165, 233)', 'rgb(236, 72, 153)'];

  // Radar Data
  const radarDatasets = cities.map((city, idx) => {
    const pts = state.mapPoints.filter(p => inferCity(p) === city);
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
  state.mapPoints.forEach(p => catSet.add(p.category || 'Otro'));
  const cats = [...catSet];

  const barDatasets = cities.map((city, idx) => {
    const pts = state.mapPoints.filter(p => inferCity(p) === city);
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


// UI BINDINGS
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value.trim() })
    });
    const py = await res.json();
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
    refreshMapView();
  });
}

if (openGlobalMapBtn) {
  openGlobalMapBtn.addEventListener('click', () => {
    document.querySelector('[data-section="mapa"]')?.click();
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
      res = await fetch('/api/data/upload', { method: 'POST', headers: authHeaders(), body: fd });
    } else if (json) {
      res = await fetch('/api/data/upload', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: JSON.parse(json) })
      });
    } else {
      throw new Error('Sin input');
    }
    if (!res.ok) throw new Error('Error al inyectar datos.');
    const py = await res.json();
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
  const [db, mapData] = await Promise.all([apiGet('/api/dashboard'), apiGet('/api/map/points')]);
  renderDashboard(db);
  state.mapPoints = mapData.points || [];
  refreshMapView();
}
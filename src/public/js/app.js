/* =============================================
   CivicTwin AI – Frontend Application v2
   ============================================= */

const INFRA_ICONS = {
  road:'🛣️', hospital:'🏥', school:'🏫',
  irrigation:'💧', market:'🏪', solar:'☀️',
  water:'🚿', park:'🌳'
};

const METRIC_CONFIG = {
  economicGrowth:      { label:'Economic Growth',     color:'#f59e0b', icon:'📈' },
  environmentalImpact: { label:'Environment',          color:'#10b981', icon:'🌿' },
  healthcareAccess:    { label:'Healthcare Access',    color:'#f43f5e', icon:'❤️' },
  educationAccess:     { label:'Education Access',     color:'#6366f1', icon:'📚' },
  transportEfficiency: { label:'Transport Efficiency', color:'#22d3ee', icon:'🚗' },
  airQuality:          { label:'Air Quality',          color:'#38bdf8', icon:'💨' },
  waterScarcity:       { label:'Water Security',       color:'#06b6d4', icon:'💧' },
  socialImpact:        { label:'Social Wellbeing',     color:'#a855f7', icon:'👥' }
};

const GRANULAR_COLORS = {
  Economic:'#f59e0b', Environment:'#10b981', Social:'#a855f7',
  Healthcare:'#f43f5e', Education:'#6366f1', Transport:'#22d3ee',
  'Air Quality':'#38bdf8', Water:'#06b6d4'
};

/* ━━━ State ━━━ */
let state = {
  map: null, selectedLat: null, selectedLng: null,
  selectedLocation: null, contextData: null, baselineMetrics: null,
  selectedInfra: null, locationMarker: null, simMarkers: [],
  infraTypes: [], radarChart: null, barChart: null,
  projectQueue: [], lastPrediction: null, lastAnalysis: null,
  selectedScale: 'small', disasterType: 'drought', disasterSeverity: 2,
  batchMode: false, batchSelected: []
};

/* ━━━ Init ━━━ */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  checkAPIHealth();
  loadInfraTypes();
  bindEvents();
});

/* ━━━ Right Panel (Context / Results) ━━━ */
let activeRailPanel = null;

function toggleRightPanel(tab) {
  const panel = document.getElementById('rightPanel');

  // Guard: Results panel requires simulation data
  if (tab === 'results' && !state.lastPrediction) {
    showToast('Run a simulation first to see results →', 'info');
    return;
  }

  // Toggle off if already open on same tab
  if (activeRailPanel === tab && panel.classList.contains('open')) {
    closeRightPanel(); return;
  }

  // Show the requested tab, hide the other
  document.getElementById('rpTabContext').style.display = tab === 'context' ? 'block' : 'none';
  document.getElementById('rpTabResults').style.display = tab === 'results' ? 'block' : 'none';
  document.getElementById('rpTitle').textContent =
    tab === 'context' ? '🌐 Regional Context' : '📊 Simulation Results';

  // Rail button active states
  document.getElementById('railBtnContext').classList.toggle('active', tab === 'context');
  document.getElementById('railBtnResults').classList.toggle('active', tab === 'results');

  // Show/hide new tab button
  document.getElementById('rpNewTabBtn').style.display = tab === 'results' ? 'flex' : 'none';

  activeRailPanel = tab;
  panel.classList.add('open');

  // Fetch context data when opening that tab
  if (tab === 'context' && state.selectedLocation) {
    fetchRegionalContext(state.selectedLocation);
  }
}

function closeRightPanel() {
  document.getElementById('rightPanel').classList.remove('open');
  document.getElementById('railBtnContext').classList.remove('active');
  document.getElementById('railBtnResults').classList.remove('active');
  document.getElementById('rpNewTabBtn').style.display = 'none';
  activeRailPanel = null;
}

function openResultsInNewTab() {
  if (!state.lastPrediction) return;
  // Save state for the new tab
  const resultsData = {
    prediction: state.lastPrediction,
    analysis: state.lastAnalysis,
    location: state.selectedLocation,
    projects: state.projectQueue,
    timestamp: new Date().toISOString()
  };
  localStorage.setItem('civictwin_results', JSON.stringify(resultsData));
  window.open('/results.html', '_blank');
}

/* ━━━ Map ━━━ */
function initMap() {
  state.map = L.map('map', { center:[20, 80], zoom:5 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; OpenStreetMap &copy; CartoDB', subdomains:'abcd', maxZoom:19
  }).addTo(state.map);
  state.map.on('click', e => selectLocation(e.latlng.lat, e.latlng.lng, null));
}

/* ━━━ Select Location ━━━ */
async function selectLocation(lat, lng, locationName) {
  state.selectedLat = lat; state.selectedLng = lng;
  if (!locationName) locationName = await reverseGeocode(lat, lng);
  state.selectedLocation = locationName;

  if (state.locationMarker) state.map.removeLayer(state.locationMarker);
  state.locationMarker = L.marker([lat, lng], { icon: createPulsingIcon() })
    .addTo(state.map)
    .bindPopup(`<b>${locationName}</b><br><small>${lat.toFixed(4)}, ${lng.toFixed(4)}</small>`)
    .openPopup();
  state.map.setView([lat, lng], Math.max(state.map.getZoom(), 10), { animate:true });

  document.getElementById('locationName').textContent  = locationName;
  document.getElementById('locationCoords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById('locationInfoSection').style.display = 'block';
  document.getElementById('infraSection').style.display        = 'block';
  document.getElementById('mapHint').classList.add('hidden');
  setStep(2);
  await analyzeLocation(lat, lng, locationName);
  // Fetch real-world context in background for the right panel
  fetchRegionalContext(locationName);
}

/* ━━━ Analyze Location ━━━ */
async function analyzeLocation(lat, lng, location) {
  showToast('Analyzing location...', 'info');
  try {
    const res  = await fetch('/api/analyze-location', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ lat, lng, location })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    state.contextData    = data.data.contextData;
    state.baselineMetrics = data.data.baselineMetrics;
    const ins = data.data.insights;
    // (insights summary & context grid removed from UI in favor of Right Panel)
    showToast('Location analyzed ✓', 'success');
  } catch (err) {
    console.error(err);
    state.contextData    = { temperature:25, rainfall:900, climateZone:'Subtropical', populationDensity:150, economicLevel:'Developing', infrastructureScore:45, agriculturalArea:40, urbanCoverage:35 };
    state.baselineMetrics = { economic:42, environmental:55, healthcare:38, education:35, transportation:30, social:48 };
    showToast('Using estimated context data', 'info');
  }
}

// ─── REGIONAL CONTEXT (glassmorphism card) ───
async function fetchRegionalContext(location) {
  document.getElementById('rcLoading').style.display  = 'flex';
  document.getElementById('rcGlass').style.display    = 'none';
  document.getElementById('rcLocationName').textContent = location;

  try {
    const resp = await fetch(`/api/contextual-data?location=${encodeURIComponent(location)}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    const ctx = data.data;

    // Derived data from simulationEngine contextData if available
    const eng = state.contextData || {};

    const tiles = [
      { icon:'🌡️', label:'Climate & Weather',    value: ctx.weather || eng.climateZone || 'Unknown' },
      { icon:'👥', label:'Pop. Density',        value: ctx.populationDensity || (eng.populationDensity ? `${eng.populationDensity}/km²` : 'N/A') },
      { icon:'🌍', label:'Total Population',    value: ctx.totalPopulation || 'Unknown' },
      { icon:'💰', label:'Economic Level',      value: ctx.economicLevel || eng.economicLevel || 'Unknown' },
      { icon:'🏗️', label:'Infra Status',        value: ctx.infrastructureStatus ? (ctx.infrastructureStatus.length > 40 ? ctx.infrastructureStatus.slice(0, 40)+'...' : ctx.infrastructureStatus) : (eng.infrastructureScore ? `Score: ${eng.infrastructureScore}/100` : 'N/A') },
      { icon:'📉', label:'Regional Risk',       value: ctx.vulnerabilities?.length ? `${ctx.vulnerabilities.length} Identified` : 'Low' },
    ];

    document.getElementById('rcTiles').innerHTML = tiles.map(t=>`
      <div class="rc-tile">
        <span class="rc-tile-icon">${t.icon}</span>
        <div class="rc-tile-body">
          <div class="rc-tile-label">${t.label}</div>
          <div class="rc-tile-value">${t.value}</div>
        </div>
      </div>`).join('');

    // Extra content area
    let extraHTML = '';

    // Economic Summary Section
    if (ctx.economicLevel || ctx.economicSummary) {
      extraHTML += `
        <div class="rc-stats-title" style="margin-top:20px">Economic Profile</div>
        <div class="rc-economic-summary">
          ${ctx.economicLevel ? `<div style="font-weight:700; color:var(--primary); margin-bottom:4px; font-size:0.7rem; text-transform:uppercase">${ctx.economicLevel}</div>` : ''}
          <p>${ctx.economicSummary || 'Economic data grounded via Google Search.'}</p>
        </div>
      `;
    }

    // Primary Industries (Pills)
    if (ctx.primaryIndustries && ctx.primaryIndustries.length > 0) {
      extraHTML += `
        <div class="rc-stats-title" style="font-size:0.7rem; opacity:0.8; margin-top:8px">Primary Industries</div>
        <div class="rc-pills">
          ${ctx.primaryIndustries.map(ind => `<span class="rc-pill">${ind}</span>`).join('')}
        </div>
      `;
    }

    // Vulnerabilities (Risk Items)
    if (ctx.vulnerabilities && ctx.vulnerabilities.length > 0) {
      extraHTML += `
        <div class="rc-stats-title" style="margin-top:16px">Regional Vulnerabilities</div>
        <div class="rc-vulnerabilities">
          ${ctx.vulnerabilities.map(v => `<div class="rc-vuln-item">⚠️ ${v}</div>`).join('')}
        </div>
      `;
    }

    // Regional stats list (The main stats array)
    const stats = Array.isArray(ctx.regionalStats) ? ctx.regionalStats : [];
    document.getElementById('rcStats').innerHTML = (stats.length
      ? stats.map(s=>`<div class="rc-stat-item">${s}</div>`).join('')
      : '<div class="rc-stat-item">No additional regional statistics available</div>') + extraHTML;

    // Sources (Grounding Metadata)
    const urls = Array.isArray(ctx.sourceUrls) ? ctx.sourceUrls.filter(Boolean) : [];
    if (urls.length) {
      document.getElementById('rcSourceLinks').innerHTML = urls.slice(0,4).map((url,i)=>{
        const domain = (() => { try { return new URL(url).hostname.replace('www.',''); } catch { return `Source ${i+1}`; } })();
        return `<a href="${url}" target="_blank" rel="noopener" class="rc-source-link">${domain}</a>`;
      }).join('<span style="color:var(--text-3); font-size: 0.6rem;"> · </span>');
      document.getElementById('rcSources').style.display = 'flex';
    } else {
      document.getElementById('rcSources').style.display = 'none';
    }

    document.getElementById('rcLoading').style.display = 'none';
    document.getElementById('rcGlass').style.display   = 'block';
  } catch (err) {

    console.error('Regional context error:', err.message);
    // Fallback: show estimated data from simulationEngine
    const eng = state.contextData || {};
    const tiles = [
      { icon:'🌡️', label:'Climate',          value: eng.climateZone || 'Unknown' },
      { icon:'👥', label:'Pop. Density',     value: eng.populationDensity ? `${eng.populationDensity}/km²` : 'N/A' },
      { icon:'🌧️', label:'Annual Rainfall',  value: eng.rainfall ? `${eng.rainfall} mm/yr` : 'N/A' },
      { icon:'🌿', label:'Agri. Land',       value: eng.agriculturalArea ? `${eng.agriculturalArea}%` : 'N/A' },
      { icon:'🏙️', label:'Urban Coverage',   value: eng.urbanCoverage ? `${eng.urbanCoverage}%` : 'N/A' },
      { icon:'🏗️', label:'Infra. Score',     value: eng.infrastructureScore ? `${eng.infrastructureScore}/100` : 'N/A' },
    ];
    document.getElementById('rcTiles').innerHTML = tiles.map(t=>`
      <div class="rc-tile">
        <span class="rc-tile-icon">${t.icon}</span>
        <div class="rc-tile-body">
          <div class="rc-tile-label">${t.label}</div>
          <div class="rc-tile-value">${t.value}</div>
        </div>
      </div>`).join('');
    document.getElementById('rcStats').innerHTML = '<div class="rc-stat-item">Estimated local context (real-time data unavailable)</div>';
    document.getElementById('rcLoading').style.display = 'none';
    document.getElementById('rcGlass').style.display   = 'block';
  }
}

function renderContextGrid(ctx) {
  document.getElementById('contextGrid').innerHTML = [
    { label:'Climate',     value: ctx.climateZone },
    { label:'Temperature', value:`${ctx.temperature}°C` },
    { label:'Rainfall',    value:`${ctx.rainfall}mm/yr` },
    { label:'Population',  value:`${ctx.populationDensity}/km²` },
    { label:'Economy',     value: ctx.economicLevel },
    { label:'Infra Score', value:`${ctx.infrastructureScore}/100` }
  ].map(i=>`<div class="ctx-item"><div class="ctx-label">${i.label}</div><div class="ctx-value">${i.value}</div></div>`).join('');
}

/* ━━━ Infrastructure Types ━━━ */
async function loadInfraTypes() {
  try {
    const res  = await fetch('/api/infrastructure-types');
    const data = await res.json();
    state.infraTypes = data.data;
    document.getElementById('infraGrid').innerHTML = state.infraTypes.map(t=>`
      <div class="infra-card" data-id="${t.id}" title="${t.description}" onclick="handleInfraClick('${t.id}')">
        <div class="infra-icon">${INFRA_ICONS[t.id]||'🏗️'}</div>
        <div class="infra-label">${t.label.replace(' / ',' /\n')}</div>
      </div>`).join('');
  } catch(e) { console.error(e); }
}

function handleInfraClick(id) {
  if (state.batchMode) {
    const idx = state.batchSelected.indexOf(id);
    if (idx === -1) {
      state.batchSelected.push(id);
    } else {
      state.batchSelected.splice(idx, 1);
    }
    
    // Update visual cards
    document.querySelectorAll('.infra-card').forEach(c => {
      c.classList.toggle('batch-selected', state.batchSelected.includes(c.dataset.id));
    });

    // Dynamic UI Update: Update button text with count
    const addBtn = document.getElementById('addMultipleBtn');
    const selectList = document.getElementById('batchSelectionList');
    const batchBtn = document.getElementById('batchModeBtn');
    
    if (state.batchSelected.length > 0) {
      addBtn.disabled = false;
      addBtn.textContent = `Add ${state.batchSelected.length} Project${state.batchSelected.length === 1 ? '' : 's'} to Queue`;
      addBtn.style.opacity = '1';
      
      batchBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg> Cancel (${state.batchSelected.length})`;

      // Render selection list
      selectList.innerHTML = state.batchSelected.map(id => {
        const type = state.infraTypes.find(t => t.id === id);
        return `<span class="selection-pill">${INFRA_ICONS[id] || '🏗️'} ${type?.label || id}</span>`;
      }).join('');
    } else {
      addBtn.disabled = true;
      addBtn.textContent = 'Add Selected to Queue';
      addBtn.style.opacity = '0.5';
      selectList.innerHTML = '<span style="color:var(--text-3); font-size: 0.7rem; opacity: 0.6;">No items selected yet</span>';
    }
  } else {
    selectInfra(id);
  }
}

function toggleBatchMode() {
  state.batchMode = !state.batchMode;
  const btn = document.getElementById('batchModeBtn');
  btn.classList.toggle('active', state.batchMode);
  btn.innerHTML = state.batchMode 
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg> Cancel Batch` 
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5v14"/></svg> Batch Select`;
  
  const addWrap = document.getElementById('batchAddControls');
  addWrap.style.display = state.batchMode ? 'block' : 'none';
  
  const status = document.getElementById('batchStatus');
  if (status) status.style.display = state.batchMode ? 'block' : 'none';

  const addBtn = document.getElementById('addMultipleBtn');
  addBtn.disabled = true;
  addBtn.textContent = 'Add Selected to Queue';
  addBtn.style.opacity = '0.5';
  
  const selectList = document.getElementById('batchSelectionList');
  if (selectList) selectList.innerHTML = '<span style="color:var(--text-3); font-size: 0.7rem; opacity: 0.6;">No items selected yet</span>';

  // Clear selections when toggling
  state.selectedInfra = null;
  state.batchSelected = [];
  document.querySelectorAll('.infra-card').forEach(c => {
    c.classList.remove('selected', 'batch-selected');
  });
  document.getElementById('projectConfig').style.display = 'none';
}

function selectInfra(id) {
  state.selectedInfra = id;
  document.querySelectorAll('.infra-card').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
  document.getElementById('projectConfig').style.display = 'block';
  showToast(`${state.infraTypes.find(t=>t.id===id)?.label} selected`, 'info');
}

/* ━━━ Project Queue ━━━ */
function addProjectToQueue() {
  if (!state.selectedInfra) return;
  const profile = state.infraTypes.find(t => t.id === state.selectedInfra);
  const budget   = parseInt(document.getElementById('budgetSlider').value);
  const timeline = parseInt(document.getElementById('timelineSlider').value);
  const scale    = state.selectedScale;

  const project = {
    type: state.selectedInfra, budget, timeline, scale,
    description: profile?.description || '',
    label: profile?.label || state.selectedInfra
  };
  state.projectQueue.push(project);
  renderProjectQueue();
  document.getElementById('simulateBtn').disabled = false;
  showToast(`${profile?.label} added to queue`, 'success');
}

function addMultipleProjectsToQueue() {
  if (state.batchSelected.length === 0) {
    showToast('Select at least one infrastructure type', 'error');
    return;
  }
  
  state.batchSelected.forEach(id => {
    const profile = state.infraTypes.find(t => t.id === id);
    const project = {
      type: id,
      budget: 50,
      timeline: 24,
      scale: 'medium',
      description: profile?.description || '',
      label: profile?.label || id
    };
    state.projectQueue.push(project);
  });
  
  renderProjectQueue();
  document.getElementById('simulateBtn').disabled = false;
  showToast(`${state.batchSelected.length} projects added to queue`, 'success');
  
  // Exit batch mode
  toggleBatchMode();
}

function removeProject(idx) {
  state.projectQueue.splice(idx, 1);
  renderProjectQueue();
  if (state.projectQueue.length === 0) document.getElementById('simulateBtn').disabled = true;
}

function renderProjectQueue() {
  const qs = document.getElementById('projectQueueSection');
  const qd = document.getElementById('projectQueue');
  const qc = document.getElementById('queueCount');
  if (state.projectQueue.length === 0) { qs.style.display = 'none'; return; }
  qs.style.display = 'block';
  qc.textContent = state.projectQueue.length;
  qd.innerHTML = state.projectQueue.map((p,i)=>`
    <div class="queue-item">
      <div class="queue-item-info">
        <span class="queue-item-icon">${INFRA_ICONS[p.type]||'🏗️'}</span>
        <div class="queue-item-details">
          <div class="queue-item-name">${p.label}</div>
          <div class="queue-item-meta">$${p.budget}M · ${p.timeline}mo · ${p.scale}</div>
        </div>
      </div>
      <button class="queue-item-remove" onclick="removeProject(${i})">×</button>
    </div>`).join('');
}

/* ━━━ Run Simulation ━━━ */
async function runSimulation() {
  if (!state.selectedLat || state.projectQueue.length === 0) return;
  setLoadingState(true, 'Running AI simulation...');

  try {
    const res  = await fetch('/api/simulate-advanced', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        lat: state.selectedLat, lng: state.selectedLng,
        location: state.selectedLocation,
        projects: state.projectQueue
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const { result, source } = data.data;
    state.lastPrediction = result;
    state.lastAnalysis = null;

    state.projectQueue.forEach(p => addInfraMarker(state.selectedLat, state.selectedLng, p.type, p.label));
    renderAdvancedDashboard(result, source);
    setStep(3);
    const msg = source === 'nova-ai' ? '✨ Amazon Nova AI simulation complete!' : '⚡ Rule-based simulation complete';
    showToast(msg, source === 'nova-ai' ? 'success' : 'info');
  } catch (err) {
    console.error(err);
    showToast('Simulation failed: ' + err.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

/* ━━━ Advanced Dashboard ━━━ */
function renderAdvancedDashboard(result, source) {
  document.getElementById('dashboardEmpty').style.display   = 'none';
  document.getElementById('dashboardContent').style.display = 'flex';

  // Impact score = average of all 8 metrics / 10
  const metricsArr = [
    result.economicGrowth, result.environmentalImpact, result.healthcareAccess,
    result.educationAccess, result.transportEfficiency, result.airQuality,
    result.waterScarcity, result.socialImpact
  ];
  const avg = Math.round(metricsArr.reduce((a,b)=>a+b,0)/metricsArr.length);
  const impactScore = Math.round(avg / 10);

  document.getElementById('impactNum').textContent    = `${avg}`;
  document.getElementById('impactProject').textContent = state.projectQueue.length > 1
    ? `${state.projectQueue.length} Projects`
    : `${INFRA_ICONS[state.projectQueue[0]?.type]} ${state.projectQueue[0]?.label}`;
  document.getElementById('impactLocation').textContent = state.selectedLocation;
  document.getElementById('impactTime').textContent     = 'AI Multi-Project Analysis';

  // Source badge
  const badgeEl = document.getElementById('sourceBadge');
  badgeEl.innerHTML = source === 'nova-ai'
    ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(255,153,0,0.15);border:1px solid rgba(255,153,0,0.35);border-radius:20px;font-size:0.67rem;color:#ff9900;font-weight:600;margin-top:6px;">✨ Amazon Nova Powered</span>`
    : `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:20px;font-size:0.67rem;color:#f59e0b;font-weight:600;margin-top:6px;">⚡ Rule-Based Estimate</span>`;

  const scoreCircle = document.getElementById('impactScoreCircle');
  scoreCircle.style.borderColor = avg >= 65 ? '#10b981' : avg >= 45 ? '#f59e0b' : '#f43f5e';
  scoreCircle.style.boxShadow   = `0 0 24px ${avg >= 65 ? '#10b98144' : '#f59e0b44'}`;

  // Charts
  renderCharts(result);
  // 8 Metric rows
  renderMetricRows(result);
  // Granular data
  if (result.granularData && result.granularData.length > 0) {
    renderGranularData(result.granularData);
    document.getElementById('granularSection').style.display = 'block';
  }

  // AI explanation + 3 per-metric explanations
  document.getElementById('explanationText').textContent = result.explanation;
  document.getElementById('threeExplanations').innerHTML = [
    { icon:'💨', label:'Air Quality',    text: result.airQualityExplanation },
    { icon:'💧', label:'Water Security', text: result.waterScarcityExplanation },
    { icon:'👥', label:'Social Impact',  text: result.socialImpactExplanation }
  ].filter(e => e.text).map(e=>`
    <div class="expl-card">
      <span class="expl-icon">${e.icon}</span>
      <div><div class="expl-label">${e.label}</div><div class="expl-text">${e.text}</div></div>
    </div>`).join('');

  // Enable analyze button
  document.getElementById('analyzeBtn').disabled = false;

  // Unlock the Results rail button — remove disabled class, add ready glow
  const railRes = document.getElementById('railBtnResults');
  railRes.classList.remove('rail-btn-results-disabled');
  railRes.classList.add('results-ready');
  railRes.title = 'View Simulation Results';
  document.getElementById('railResultsBadge').style.display = 'inline';

  // Small delay so the simulation toast shows first, then panel slides in
  setTimeout(() => toggleRightPanel('results'), 400);
}

/* ━━━ Charts ━━━ */
function renderCharts(result) {
  const keys   = Object.keys(METRIC_CONFIG);
  const labels = keys.map(k => METRIC_CONFIG[k].label);
  const values = keys.map(k => result[k] || 0);
  const colors = keys.map(k => METRIC_CONFIG[k].color);

  if (state.radarChart) state.radarChart.destroy();
  if (state.barChart)   state.barChart.destroy();

  state.radarChart = new Chart(document.getElementById('radarChart').getContext('2d'), {
    type:'radar',
    data:{
      labels,
      datasets:[{ label:'Predicted Scores', data:values, borderColor:'#6366f1',
        backgroundColor:'rgba(99,102,241,0.15)', pointBackgroundColor: colors,
        pointRadius:5, borderWidth:2 }]
    },
    options:{
      scales:{ r:{ min:0, max:100,
        grid:{ color:'rgba(255,255,255,0.05)' },
        pointLabels:{ color:'#94a3b8', font:{ size:9, family:'Inter' } },
        ticks:{ display:false }
      }},
      plugins:{ legend:{ display:false } }
    }
  });

  state.barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
    type:'bar',
    data:{
      labels,
      datasets:[{ label:'Impact Score', data:values,
        backgroundColor: colors.map(c => c+'bb'), borderRadius:6 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#94a3b8', font:{ size:9 } } },
        y:{ min:0, max:100, grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#94a3b8', font:{ size:9 } } }
      },
      plugins:{ legend:{ display:false } }
    }
  });
}

/* ━━━ Metric Rows (8 metrics) ━━━ */
function renderMetricRows(result) {
  document.getElementById('metricsGrid').innerHTML = Object.keys(METRIC_CONFIG).map(key => {
    const { label, color, icon } = METRIC_CONFIG[key];
    const val = Math.round(result[key] || 0);
    return `
    <div class="metric-row fade-in">
      <span class="metric-icon">${icon}</span>
      <span class="metric-label">${label}</span>
      <div class="metric-bar-wrap"><div class="metric-bar" style="width:0%;background:${color}" data-val="${val}"></div></div>
      <div class="metric-vals"><span class="metric-val">${val}</span></div>
    </div>`;
  }).join('');
  // Animate
  setTimeout(() => {
    document.querySelectorAll('.metric-bar').forEach(bar => {
      bar.style.width = '0%';
      setTimeout(() => bar.style.width = bar.dataset.val + '%', 60);
    });
  }, 100);
}

/* ━━━ Granular Data ━━━ */
function renderGranularData(granularData) {
  document.getElementById('granularGrid').innerHTML = granularData.map((d,i) => {
    const color = GRANULAR_COLORS[d.metric] || '#6366f1';
    return `
    <div class="granular-card" style="border-left-color:${color};animation-delay:${i*0.05}s">
      <div class="granular-metric">${d.metric}</div>
      <div class="granular-label">${d.label}</div>
      <div class="granular-bar-wrap"><div class="granular-bar" style="width:${d.value}%;background:${color}"></div></div>
      <div class="granular-vals">
        <span class="granular-val">${d.value}</span>
        <span class="granular-desc">${d.description}</span>
      </div>
    </div>`;
  }).join('');
}

async function runDeepAnalysis() {
  if (!state.lastPrediction) return;
  openAnalysisModal();

  try {
    const res  = await fetch('/api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        prediction: state.lastPrediction,
        location:   state.selectedLocation,
        projects:   state.projectQueue
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    state.lastAnalysis = data.data;
    fillAnalysisModal(data.data);
    showToast('Strategic analysis complete!', 'success');
  } catch (err) {
    closeAnalysisModal(null);
    showToast('Analysis failed: ' + err.message, 'error');
  }
}

function openAnalysisModal() {
  const overlay = document.getElementById('analysisModalOverlay');
  overlay.style.display = 'flex';
  document.getElementById('analysisModalLoading').style.display = 'flex';
  document.getElementById('analysisModalBody').style.display    = 'none';
  document.getElementById('analysisModalSub').textContent =
    `${state.selectedLocation} · ${state.projectQueue.length} project${state.projectQueue.length!==1?'s':''}`;
}

function closeAnalysisModal(e) {
  if (e && e.target !== document.getElementById('analysisModalOverlay')) return;
  document.getElementById('analysisModalOverlay').style.display = 'none';
}

function fillAnalysisModal(a) {
  document.getElementById('analysisModalLoading').style.display = 'none';
  document.getElementById('analysisModalBody').style.display    = 'flex';
  document.getElementById('amSummary').textContent = a.summary || '';
  document.getElementById('amRisks').innerHTML    = (a.risks||[]).map(r =>`<li>${r}</li>`).join('');
  document.getElementById('amTradeoffs').innerHTML = (a.tradeOffs||[]).map(r=>`<li>${r}</li>`).join('');
  document.getElementById('amSuggestions').innerHTML = (a.suggestions||[]).map((s,i)=>`
    <div class="am-suggestion-card">
      <div class="am-suggestion-num">${i+1}</div>
      <div class="am-suggestion-text">${s}</div>
    </div>`).join('');
  // Also copy into old inline section for backward compat
  renderAnalysis(a);
}

function renderAnalysis(analysis) {
  document.getElementById('analysisSection').style.display = 'block';
  document.getElementById('analysisSummary').textContent   = analysis.summary    || '';
  document.getElementById('analysisRisks').innerHTML       = (analysis.risks||[]).map(r=>`<li>${r}</li>`).join('');
  document.getElementById('analysisTradeoffs').innerHTML   = (analysis.tradeOffs||[]).map(r=>`<li>${r}</li>`).join('');
  document.getElementById('analysisSuggestions').innerHTML = (analysis.suggestions||[]).map(r=>`<li>${r}</li>`).join('');
}

/* ━━━ AI Scenarios ━━━ */
async function generateScenarios() {
  const goal     = document.getElementById('scenarioGoal').value.trim();
  const location = document.getElementById('scenarioLocation').value.trim();
  if (!goal || !location) { showToast('Enter both a location and a goal', 'error'); return; }

  document.getElementById('scenariosLoading').style.display = 'flex';
  document.getElementById('scenariosGrid').innerHTML = '';

  try {
    const res  = await fetch('/api/scenarios', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ goal, location })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    renderScenarios(data.data, location);
    showToast(`${data.data.length} scenarios generated!`, 'success');
  } catch (err) {
    showToast('Scenario generation failed: ' + err.message, 'error');
  } finally {
    document.getElementById('scenariosLoading').style.display = 'none';
  }
}

function renderScenarios(scenarios, location) {
  document.getElementById('scenariosGrid').innerHTML = scenarios.map((s, i) => `
    <div class="scenario-card">
      <div class="scenario-num">Scenario ${i+1}</div>
      <div class="scenario-title">${s.title}</div>
      <div class="scenario-desc">${s.description}</div>
      <div class="scenario-projects">
        ${(s.projects||[]).map(p=>`
          <div class="scenario-project">
            <span class="scenario-project-icon">${INFRA_ICONS[p.type]||'🏗️'}</span>
            <div class="scenario-project-info">
              <div class="scenario-project-name">${p.type.charAt(0).toUpperCase()+p.type.slice(1)}</div>
              <div class="scenario-project-meta">$${p.budget}M · ${p.timeline}mo · ${p.scale}</div>
            </div>
          </div>`).join('')}
      </div>
      <div class="scenario-outcome">${s.predictedOutcome}</div>
      <button class="btn-use-scenario" onclick='useScenario(${JSON.stringify(s)}, "${location}")'>
        Use This Scenario →
      </button>
    </div>`).join('');
}

function useScenario(scenario, location) {
  // Switch to simulate panel and pre-load the scenario's projects
  switchPanel('simulate');
  state.projectQueue = (scenario.projects || []).map(p => ({
    type: p.type, budget: p.budget, timeline: p.timeline,
    scale: p.scale, description: p.description || '',
    label: p.type.charAt(0).toUpperCase() + p.type.slice(1)
  }));
  renderProjectQueue();
  document.getElementById('simulateBtn').disabled = state.projectQueue.length === 0;
  // Pre-fill location search
  document.getElementById('locationSearch').value = location;
  showToast(`Loaded "${scenario.title}" — select a location and click Run Simulation`, 'info');
}

/* ━━━ Search ━━━ */
async function searchLocation(query) {
  showToast('Searching...', 'info');
  try {
    // Try Gemini-powered search first via our API
    const res  = await fetch('/api/search-place', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    if (data.success && data.data.lat && data.data.lng) {
      selectLocation(data.data.lat, data.data.lng, data.data.name || query);
      return;
    }
  } catch { /* fall through to Nominatim */ }

  // Fallback: Nominatim
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
    const data = await res.json();
    if (!data.length) { showToast('Location not found', 'error'); return; }
    selectLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',')[0]);
  } catch (err) { showToast('Search failed: ' + err.message, 'error'); }
}

async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
    const data = await res.json();
    if (data.address) return data.address.city || data.address.town || data.address.village || data.address.county || data.address.state || `${lat.toFixed(3)},${lng.toFixed(3)}`;
  } catch { }
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

/* ━━━ Map Markers ━━━ */
function createPulsingIcon() {
  return L.divIcon({
    html:`<div style="width:20px;height:20px;border-radius:50%;background:radial-gradient(circle,#6366f1,#818cf8);border:2px solid white;box-shadow:0 0 12px #6366f1;animation:glow-pulse 2s infinite"></div>`,
    className:'custom-marker', iconSize:[20,20], iconAnchor:[10,10]
  });
}

function addInfraMarker(lat, lng, infraId, label) {
  const icon  = INFRA_ICONS[infraId] || '🏗️';
  const jitter = (Math.random()-0.5)*0.006;
  const divIcon = L.divIcon({
    html:`<div style="background:rgba(13,20,36,0.92);border:1.5px solid #6366f1;border-radius:8px;padding:4px 8px;font-size:1rem;display:flex;align-items:center;gap:5px;box-shadow:0 4px 16px rgba(99,102,241,0.3);white-space:nowrap">${icon}<span style="font-size:0.65rem;color:#94a3b8;font-family:Inter">${label}</span></div>`,
    className:'', iconAnchor:[0,0]
  });
  const marker = L.marker([lat + jitter, lng + jitter], { icon: divIcon }).addTo(state.map);
  state.simMarkers.push({ marker, infraId, label });
  updateMapLegend();
}

function updateMapLegend() {
  const legend = document.getElementById('mapLegend');
  if (!state.simMarkers.length) { legend.style.display='none'; return; }
  legend.style.display = 'block';
  document.getElementById('legendItems').innerHTML = state.simMarkers
    .map(m=>`<div class="legend-item"><span>${INFRA_ICONS[m.infraId]}</span><span>${m.label}</span></div>`).join('');
}

/* ━━━ Chart Tabs ━━━ */
function bindChartTabs() {
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('radarChart').style.display = which==='radar' ? 'block' : 'none';
      document.getElementById('barChart').style.display   = which==='bar'   ? 'block' : 'none';
    });
  });
}

/* ━━━ Steps ━━━ */
function setStep(n) {
  for (let i=1; i<=3; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.remove('active','done');
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('active');
  }
}

/* ━━━ Loading ━━━ */
function setLoadingState(loading, text='AI is analyzing impact...') {
  document.getElementById('loadingOverlay').style.display = loading ? 'flex' : 'none';
  document.getElementById('loadingText').textContent = text;
  document.getElementById('simulateBtn').disabled = loading;
}

/* ━━━ API Health ━━━ */
async function checkAPIHealth() {
  const dot  = document.getElementById('apiStatusDot');
  const text = document.getElementById('apiStatusText');
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    if (data.success) {
      dot.classList.add('online');
      text.textContent = data.novaConfigured ? 'Amazon Nova Ready' : 'AI Offline';
    }
  } catch { dot.classList.add('error'); text.textContent = 'Server Offline'; }
}

/* ━━━ Reset ━━━ */
function resetSimulation() {
  state.simMarkers.forEach(m => state.map.removeLayer(m.marker));
  state.simMarkers = [];
  if (state.locationMarker) { state.map.removeLayer(state.locationMarker); state.locationMarker = null; }
  state.selectedLat = null; state.selectedLng = null;
  state.selectedLocation = null; state.selectedInfra = null;
  state.contextData = null; state.baselineMetrics = null;
  state.projectQueue = []; state.lastPrediction = null;

  // Sidebar sections
  document.getElementById('locationInfoSection').style.display = 'none';
  document.getElementById('infraSection').style.display        = 'none';
  document.getElementById('aiInsightsBox').style.display       = 'none';
  document.getElementById('projectConfig').style.display       = 'none';
  document.getElementById('projectQueueSection').style.display = 'none';
  document.getElementById('mapHint').classList.remove('hidden');

  // Right panel — reset Results content + close panel
  document.getElementById('dashboardEmpty').style.display   = 'flex';
  document.getElementById('dashboardContent').style.display = 'none';
  document.getElementById('analysisSection').style.display  = 'none';
  document.getElementById('rcGlass').style.display          = 'none';
  document.getElementById('rcLoading').style.display        = 'flex';
  document.getElementById('rcSources').style.display        = 'none';
  closeRightPanel();

  // Reset Results rail button to disabled state
  const railRes = document.getElementById('railBtnResults');
  railRes.classList.add('rail-btn-results-disabled');
  railRes.classList.remove('results-ready');
  railRes.title = 'Run a simulation first to see results';
  document.getElementById('railResultsBadge').style.display = 'none';

  document.querySelectorAll('.infra-card').forEach(c => c.classList.remove('selected'));
  renderProjectQueue();
  updateMapLegend();
  setStep(1);
  showToast('Workspace reset', 'info');
}

/* ━━━ Toast ━━━ */
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

/* ━━━ AI Goal Generator ━━━ */
function setGoalExample(text) {
  document.getElementById('goalInput').value = text;
  document.getElementById('goalInput').focus();
}

async function goalGenerate() {
  const goal     = document.getElementById('goalInput').value.trim();
  const location = state.selectedLocation || 'the selected region';
  if (!goal) { showToast('Please describe a development goal first', 'error'); return; }

  const btn = document.getElementById('goalGenBtn');
  btn.disabled = true;
  document.getElementById('goalLoading').style.display  = 'flex';
  document.getElementById('goalSuggestions').innerHTML  = '';

  try {
    const res  = await fetch('/api/scenarios', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ goal, location })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    renderGoalSuggestions(data.data);
    showToast(`${data.data.length} AI plans generated!`, 'success');
  } catch (err) {
    showToast('Could not generate plans: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('goalLoading').style.display = 'none';
  }
}

function renderGoalSuggestions(scenarios) {
  const container = document.getElementById('goalSuggestions');
  // Store scenarios for event delegation
  container._scenarios = scenarios;

  if (!scenarios || !scenarios.length) {
    container.innerHTML = '<p style="font-size:0.78rem;color:var(--text-3);padding:8px 0">No suggestions generated. Try rephrasing your goal.</p>';
    return;
  }

  container.innerHTML = scenarios.map((s, i) => {
    const typeCount = {};
    (s.projects||[]).forEach(p => { typeCount[p.type] = (typeCount[p.type]||0)+1; });
    const topType  = Object.entries(typeCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'road';
    const cardIcon = INFRA_ICONS[topType] || '🏗️';

    const projectTags = (s.projects||[]).map(p => `
      <div class="goal-option-tag">
        <span class="goal-option-tag-icon">${INFRA_ICONS[p.type]||'🏗️'}</span>
        <span>${p.type.charAt(0).toUpperCase()+p.type.slice(1)} · $${p.budget}M · ${p.scale}</span>
      </div>`).join('');

    return `
    <div class="goal-option-card">
      <div class="goal-option-header">
        <span class="goal-option-icon">${cardIcon}</span>
        <div class="goal-option-meta">
          <div class="goal-option-title">Option ${i+1}: ${s.title}</div>
          <div class="goal-option-desc">${s.description}</div>
        </div>
      </div>
      <div class="goal-option-body">
        <div class="goal-option-projects">${projectTags}</div>
        <div class="goal-option-outcome">${s.predictedOutcome}</div>
        <button class="btn-use-plan" data-scenario-idx="${i}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          Use This Plan
        </button>
      </div>
    </div>`;
  }).join('');

  // Event delegation — one listener for all "Use This Plan" buttons
  container.addEventListener('click', function handler(e) {
    const btn = e.target.closest('.btn-use-plan');
    if (!btn) return;
    const idx = parseInt(btn.dataset.scenarioIdx);
    const s   = container._scenarios[idx];
    if (s) applyGoalPlan(s.projects || [], s.title || '');
  }, { once: false });
}


function applyGoalPlan(projects, title) {
  if (!projects || !projects.length) return;
  state.projectQueue = projects.map(p => ({
    type: p.type || 'road', budget: p.budget || 10,
    timeline: p.timeline || 12, scale: p.scale || 'medium',
    description: p.description || '', label: (p.type||'road').charAt(0).toUpperCase()+(p.type||'road').slice(1)
  }));
  renderProjectQueue();
  document.getElementById('simulateBtn').disabled = false;
  // Reveal infra section if not already
  document.getElementById('infraSection').style.display = 'block';
  // Scroll to infra section
  document.getElementById('infraSection').scrollIntoView({ behavior:'smooth', block:'start' });
  showToast(`"${title}" loaded — click Run AI Simulation!`, 'success');
}

/* ━━━ Disaster Simulation ━━━ */
async function runDisasterSim() {
  const customInput = document.getElementById('disasterCustomInput').value.trim();
  const location    = state.selectedLocation || 'the selected region';
  const btn         = document.getElementById('runDisasterBtn');

  btn.disabled = true;
  document.getElementById('disasterLoading').style.display  = 'flex';
  document.getElementById('disasterResults').style.display  = 'none';

  try {
    const res  = await fetch('/api/disaster-simulate', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        disasterType:   customInput ? 'custom' : state.disasterType,
        customScenario: customInput,
        location,
        severity:       state.disasterSeverity,
        lat:            state.selectedLat,
        lng:            state.selectedLng
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    renderDisasterResults(data.data);
    showToast('Disaster simulation complete!', 'success');
  } catch (err) {
    showToast('Disaster simulation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('disasterLoading').style.display = 'none';
  }
}

const DISASTER_ICONS = {
  drought:'🏜️', flood:'🌊', earthquake:'🏚️', heatwave:'🔥',
  cyclone:'🌀', 'population boom':'📈', 'economic shock':'💸', custom:'⚡'
};

function renderDisasterResults(d) {
  const el = document.getElementById('disasterResults');
  el.style.display = 'block';

  // Severity banner
  const icon     = DISASTER_ICONS[d.disasterType] || '⚡';
  const sevColor = { mild:'#10b981', moderate:'#f59e0b', severe:'#f97316', catastrophic:'#ef4444' }[d.severity] || '#f59e0b';
  document.getElementById('dsb-icon').textContent     = icon;
  document.getElementById('dsb-title').textContent    = d.disasterType.charAt(0).toUpperCase() + d.disasterType.slice(1);
  document.getElementById('dsb-severity').textContent = d.severity.charAt(0).toUpperCase() + d.severity.slice(1) + ' Severity';
  document.getElementById('dsb-severity').style.color = sevColor;
  document.getElementById('dsb-pop').textContent      = `${d.affectedPopulationPct}%`;
  document.getElementById('dsb-loss').textContent     = `$${d.estimatedEconomicLoss}M`;
  document.getElementById('dsb-recovery').textContent = d.recoveryTimeline || 'Unknown';

  // Narrative
  document.getElementById('disasterNarrative').textContent = d.narrative || '';

  // Metric deltas
  const METRIC_LABELS = {
    economicGrowth:    'Economic Growth',  environmentalImpact:'Environment',
    healthcareAccess:  'Healthcare',       educationAccess:     'Education',
    transportEfficiency:'Transport',       airQuality:          'Air Quality',
    waterScarcity:     'Water Security',   socialImpact:        'Social Wellbeing'
  };
  const deltas = d.metricDeltas || {};
  document.getElementById('disasterMetricDeltas').innerHTML = Object.entries(METRIC_LABELS).map(([key, label]) => {
    const val    = Math.round(deltas[key] || 0);
    const abs    = Math.abs(val);
    const pct    = Math.min(abs, 100);
    const isPos  = val >= 0;
    return `
    <div class="metric-delta-item">
      <div class="metric-delta-label">
        <span class="metric-delta-name">${label}</span>
        <span class="metric-delta-val${isPos?' positive':''}">${val > 0 ? '+' : ''}${val}%</span>
      </div>
      <div class="metric-delta-track">
        <div class="metric-delta-fill${isPos?' positive':''}" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');

  // Immediate effects
  document.getElementById('disasterImmediateEffects').innerHTML =
    (d.immediateEffects||[]).map(e => `<li>${e}</li>`).join('');

  // Long-term effects
  document.getElementById('disasterLongtermEffects').innerHTML =
    (d.longtermEffects||[]).map(e => `<li>${e}</li>`).join('');

  // Most vulnerable sectors
  document.getElementById('disasterSectors').innerHTML =
    (d.mostVulnerableSectors||[]).map(s => `<span class="disaster-sector-chip">${s}</span>`).join('');

  // Warning sign
  document.getElementById('disasterWarning').textContent = d.warningSign || '';

  // Mitigations
  const urgClass = { immediate:'urgency-immediate', 'short-term':'urgency-short-term', 'long-term':'urgency-long-term' };
  document.getElementById('disasterMitigations').innerHTML = (d.mitigations||[]).map(m => `
    <div class="mitigation-card">
      <div class="mitigation-urgency ${urgClass[m.urgency]||'urgency-short-term'}">${m.urgency}</div>
      <div class="mitigation-action">${m.action}</div>
      <div class="mitigation-impact">${m.impact}</div>
      ${m.cost ? `<div class="mitigation-cost">💰 ${m.cost}</div>` : ''}
    </div>`).join('');

  el.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ━━━ Bind Events ━━━ */
function bindEvents() {
  document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('locationSearch').value.trim(); if(q) searchLocation(q);
  });
  document.getElementById('locationSearch').addEventListener('keydown', e => {
    if (e.key==='Enter') { const q=e.target.value.trim(); if(q) searchLocation(q); }
  });
  document.getElementById('simulateBtn').addEventListener('click', runSimulation);
  document.getElementById('resetBtn').addEventListener('click', resetSimulation);
  document.getElementById('addProjectBtn').addEventListener('click', addProjectToQueue);
  document.getElementById('analyzeBtn').addEventListener('click', runDeepAnalysis);
  document.getElementById('batchModeBtn').addEventListener('click', toggleBatchMode);
  document.getElementById('addMultipleBtn').addEventListener('click', addMultipleProjectsToQueue);

  // Sliders
  document.getElementById('budgetSlider').addEventListener('input', e => {
    document.getElementById('budgetVal').textContent = `$${e.target.value}M`;
  });
  document.getElementById('timelineSlider').addEventListener('input', e => {
    document.getElementById('timelineVal').textContent = `${e.target.value} months`;
  });

  // Scale buttons
  document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedScale = btn.dataset.scale;
    });
  });

  bindChartTabs();
}

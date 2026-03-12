/* =============================================
   CivicTwin AI – Standalone Results Dashboard
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

const state = {
  radarChart: null,
  barChart: null
};

document.addEventListener('DOMContentLoaded', () => {
  const dataRaw = localStorage.getItem('civictwin_results');
  if (!dataRaw) {
    document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;">' +
      '<h2>No data found</h2><p>Please run a simulation on the main dashboard first.</p>' +
      '<button onclick="window.close()" style="padding:10px 20px;cursor:pointer;">Go Back</button></div>';
    return;
  }

  const { prediction, analysis, location, projects, timestamp } = JSON.parse(dataRaw);
  renderHeader(location, timestamp);
  renderImpactBanner(prediction, projects);
  renderCharts(prediction);
  renderMetricRows(prediction);
  renderExplanations(prediction);
  
  if (analysis) {
    renderStrategicAnalysis(analysis);
  }

  if (prediction.granularData && prediction.granularData.length > 0) {
    renderGranularData(prediction.granularData);
  }
});

function renderHeader(location, timestamp) {
  document.getElementById('resLocation').textContent = location || 'Selected Region';
  const date = new Date(timestamp);
  document.getElementById('resDate').textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  document.title = `Report: ${location || 'Simulation'}`;
}

function renderImpactBanner(result, projects) {
  const metricsArr = [
    result.economicGrowth, result.environmentalImpact, result.healthcareAccess,
    result.educationAccess, result.transportEfficiency, result.airQuality,
    result.waterScarcity, result.socialImpact
  ];
  const avg = Math.round(metricsArr.reduce((a,b)=>a+b,0)/metricsArr.length);

  document.getElementById('impactNum').textContent = `${avg}`;
  document.getElementById('impactProject').textContent = projects.length > 1
    ? `${projects.length} Combined Infrastructure Projects`
    : `${projects[0]?.label || 'Infrastructure Project'}`;

  const scoreCircle = document.getElementById('impactScoreCircle');
  scoreCircle.style.borderColor = avg >= 65 ? '#10b981' : avg >= 45 ? '#f59e0b' : '#f43f5e';

  document.getElementById('resProjectsList').innerHTML = projects.map(p => `
    <div class="project-pill">
      <span>${INFRA_ICONS[p.type] || '🏗️'}</span>
      <span>${p.label} ($${p.budget}M)</span>
    </div>`).join('');
}

function renderCharts(result) {
  const keys   = Object.keys(METRIC_CONFIG);
  const labels = keys.map(k => METRIC_CONFIG[k].label);
  const values = keys.map(k => result[k] || 0);
  const colors = keys.map(k => METRIC_CONFIG[k].color);

  // Radar
  state.radarChart = new Chart(document.getElementById('radarChart').getContext('2d'), {
    type:'radar',
    data:{
      labels,
      datasets:[{ label:'Predicted Scores', data:values, borderColor:'#6366f1',
        backgroundColor:'rgba(99,102,241,0.15)', pointBackgroundColor: colors,
        pointRadius:5, borderWidth:3 }]
    },
    options:{
      maintainAspectRatio: false,
      scales:{ r:{ min:0, max:100,
        grid:{ color:'rgba(255,255,255,0.08)' },
        pointLabels:{ color:'#94a3b8', font:{ size:11, family:'Inter' } },
        ticks:{ display:false }
      }},
      plugins:{ legend:{ display:false } }
    }
  });

  // Bar
  state.barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
    type:'bar',
    data:{
      labels,
      datasets:[{ data:values, backgroundColor:colors, borderRadius:6 }]
    },
    options:{
      maintainAspectRatio: false,
      plugins:{ legend:{ display:false } },
      scales:{
        y:{ min:0, max:100, grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ color:'#94a3b8', font:{ size:10 } } },
        x:{ grid:{ display:false }, ticks:{ color:'#94a3b8', font:{ size:10 } } }
      }
    }
  });
}

function switchChart(type) {
  document.getElementById('radarChart').style.display = type === 'radar' ? 'block' : 'none';
  document.getElementById('barChart').style.display   = type === 'bar' ? 'block' : 'none';
  document.getElementById('btnRadar').classList.toggle('active', type === 'radar');
  document.getElementById('btnBar').classList.toggle('active', type === 'bar');
}

function renderStrategicAnalysis(a) {
  document.getElementById('analysisSection').style.display = 'block';
  document.getElementById('resSummary').textContent = a.summary || '';
  document.getElementById('resRisks').innerHTML = (a.risks||[]).map(r => `<li>${r}</li>`).join('');
  document.getElementById('resTradeoffs').innerHTML = (a.tradeOffs||[]).map(r => `<li>${r}</li>`).join('');
  document.getElementById('resSuggestions').innerHTML = (a.suggestions||[]).map(r => `<li>${r}</li>`).join('');
}

function renderMetricRows(result) {
  document.getElementById('metricsGrid').innerHTML = Object.keys(METRIC_CONFIG).map(key => {
    const { label, color, icon } = METRIC_CONFIG[key];
    const val = Math.round(result[key] || 0);
    return `
    <div class="metric-row">
      <span class="metric-icon">${icon}</span>
      <span class="metric-label">${label}</span>
      <div class="metric-bar-wrap"><div class="metric-bar" style="width:${val}%;background:${color}"></div></div>
      <div class="metric-vals"><span class="metric-val">${val}</span></div>
    </div>`;
  }).join('');
}

function renderExplanations(result) {
  document.getElementById('explanationText').textContent = result.explanation;
  document.getElementById('threeExplanations').innerHTML = [
    { icon:'💨', label:'Air Quality',    text: result.airQualityExplanation },
    { icon:'💧', label:'Water Security', text: result.waterScarcityExplanation },
    { icon:'👥', label:'Social Impact',  text: result.socialImpactExplanation }
  ].filter(e => e.text).map(e=>`
    <div class="expl-card">
      <span class="expl-icon">${e.icon}</span>
      <div>
        <div class="expl-label" style="font-size:0.75rem;margin-bottom:6px;">${e.label} Analysis</div>
        <div class="expl-text" style="font-size:0.85rem;line-height:1.6;">${e.text}</div>
      </div>
    </div>`).join('');
}

function renderGranularData(granularData) {
  document.getElementById('granularSection').style.display = 'block';
  document.getElementById('granularGrid').innerHTML = granularData.map((d,i) => {
    const color = GRANULAR_COLORS[d.metric] || '#6366f1';
    return `
    <div class="granular-card" style="border-left-color:${color}">
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

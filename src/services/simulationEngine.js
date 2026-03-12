const axios = require('axios');

// Infrastructure types and their base impact profiles
const INFRASTRUCTURE_PROFILES = {
  road: {
    label: 'Road / Highway',
    description: 'New road or highway connecting the area to nearby regions',
    baseImpacts: { economic: 15, environmental: -10, healthcare: 8, education: 5, transportation: 25, social: 10 }
  },
  hospital: {
    label: 'Hospital / Health Center',
    description: 'New medical facility providing healthcare services',
    baseImpacts: { economic: 8, environmental: -3, healthcare: 30, education: 2, transportation: 3, social: 20 }
  },
  school: {
    label: 'School / University',
    description: 'Educational institution improving learning access',
    baseImpacts: { economic: 10, environmental: -2, healthcare: 3, education: 28, transportation: 2, social: 18 }
  },
  irrigation: {
    label: 'Irrigation System',
    description: 'Agricultural irrigation network for crop water supply',
    baseImpacts: { economic: 20, environmental: -8, healthcare: 5, education: 0, transportation: 0, social: 12 }
  },
  market: {
    label: 'Market / Trade Center',
    description: 'Commercial hub boosting local trade and economy',
    baseImpacts: { economic: 22, environmental: -5, healthcare: 2, education: 1, transportation: 8, social: 15 }
  },
  solar: {
    label: 'Solar Power Plant',
    description: 'Renewable energy facility providing clean electricity',
    baseImpacts: { economic: 12, environmental: 20, healthcare: 5, education: 3, transportation: 1, social: 10 }
  },
  water: {
    label: 'Water Treatment Plant',
    description: 'Clean water supply and sewage treatment facility',
    baseImpacts: { economic: 8, environmental: 15, healthcare: 25, education: 2, transportation: 0, social: 18 }
  },
  park: {
    label: 'Urban Green Space / Park',
    description: 'Public park or nature reserve for community recreation',
    baseImpacts: { economic: 5, environmental: 22, healthcare: 10, education: 3, transportation: 2, social: 20 }
  }
};

// Get climate zone from temperature and rainfall
function getClimateZone(temp, rainfall) {
  if (temp > 25 && rainfall > 1500) return 'Tropical';
  if (temp > 25 && rainfall < 500) return 'Arid/Desert';
  if (temp > 15 && rainfall > 800) return 'Subtropical';
  if (temp > 15 && rainfall < 800) return 'Semi-Arid';
  if (temp < 5) return 'Polar/Tundra';
  return 'Temperate';
}

// Get economic level from GDP proxy (population density as proxy)
function getEconomicLevel(populationDensity) {
  if (populationDensity < 50) return 'Rural/Low Income';
  if (populationDensity < 200) return 'Semi-Urban/Developing';
  if (populationDensity < 1000) return 'Urban/Emerging';
  return 'Dense Urban/Mixed Income';
}

// Fetch weather data from Open-Meteo (free, no API key needed)
async function fetchWeatherData(lat, lng) {
  try {
    const response = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation&daily=precipitation_sum&timezone=auto&forecast_days=1`,
      { timeout: 5000 }
    );
    const current = response.data.current || {};
    const daily = response.data.daily || {};
    const rainfall = daily.precipitation_sum ? daily.precipitation_sum.reduce((a, b) => a + b, 0) * 365 : 800;
    return {
      temperature: Math.round(current.temperature_2m || 22),
      rainfall: Math.round(rainfall)
    };
  } catch {
    return { temperature: 22, rainfall: 800 };
  }
}

// Generate context data for a location
async function generateContextData(lat, lng) {
  const weather = await fetchWeatherData(lat, lng);

  // Estimate population density based on coordinates (simple heuristic)
  const absLat = Math.abs(lat);
  const populationDensity = Math.round(
    Math.max(20, Math.min(3000,
      200 + (Math.random() * 300) + (absLat < 30 ? 150 : 0)
    ))
  );

  const infrastructureScore = Math.round(30 + Math.random() * 50);
  const agriculturalArea = Math.round(20 + Math.random() * 50);
  const urbanCoverage = Math.round(100 - agriculturalArea - Math.random() * 20);

  return {
    temperature: weather.temperature,
    rainfall: weather.rainfall,
    climateZone: getClimateZone(weather.temperature, weather.rainfall),
    populationDensity,
    economicLevel: getEconomicLevel(populationDensity),
    infrastructureScore,
    agriculturalArea: Math.max(0, agriculturalArea),
    urbanCoverage: Math.max(0, Math.min(80, urbanCoverage))
  };
}

// Generate baseline metrics for a location
function generateBaselineMetrics(contextData) {
  const densityFactor = Math.min(1, contextData.populationDensity / 1000);
  const infraFactor = contextData.infrastructureScore / 100;

  return {
    economic: Math.round(30 + densityFactor * 30 + infraFactor * 20 + Math.random() * 10),
    environmental: Math.round(50 + (1 - densityFactor) * 20 + Math.random() * 10),
    healthcare: Math.round(25 + infraFactor * 35 + Math.random() * 10),
    education: Math.round(25 + infraFactor * 30 + Math.random() * 10),
    transportation: Math.round(20 + densityFactor * 20 + infraFactor * 30 + Math.random() * 10),
    social: Math.round(40 + densityFactor * 15 + Math.random() * 10)
  };
}

// ── Fallback Prediction (no AI key needed) ──────────────────────────────────
const FALLBACK_EXPLANATIONS = {
  road: 'A new road dramatically improves connectivity, reducing travel time and enabling goods and services to flow more efficiently. This boosts local commerce and improves access to schools and hospitals.',
  hospital: 'A healthcare facility transforms community wellbeing by reducing preventable deaths, cutting travel time to medical care, and attracting skilled workers to the region.',
  school: 'Educational access is the highest-leverage development investment. A new school raises literacy, enables vocational training, and lifts long-term economic productivity across generations.',
  irrigation: 'Reliable irrigation breaks dependence on seasonal rainfall, stabilises crop yields, and increases farmer income — lifting rural communities out of subsistence cycles.',
  market: 'A trade centre aggregates supply and demand, reduces post-harvest losses, enables price discovery, and creates non-farm employment opportunities for the surrounding region.',
  solar: 'Clean electricity unlocks productivity after dark, powers small businesses and health clinics, displaces fossil fuel costs, and reduces the community\'s carbon footprint.',
  water: 'Safe water and sanitation are preconditions for health. A treatment plant dramatically cuts waterborne disease, reduces healthcare burden, and frees time previously spent fetching water.',
  park: 'Urban green space reduces the heat-island effect, improves air quality, promotes physical activity, and creates shared community identity — correlating with lower stress and better mental health.'
};

const FALLBACK_INSIGHTS = {
  road: ['Reduces average travel time to nearest town by an estimated 40–60%, unlocking access to markets and services.', 'Increases property values and business activity within a 5km corridor, generating indirect tax revenue.', 'Requires ongoing maintenance budget; environmental mitigation (drainage, wildlife crossings) should be planned upfront.'],
  hospital: ['Estimated 25% reduction in preventable mortality within the service catchment area.', 'Attracts medical professionals and support economy (pharmacies, labs), boosting local employment.', 'Construction and medical waste management plans are critical to avoid environmental degradation.'],
  school: ['Literacy and numeracy improvements compound over 10–20 years, raising the skilled labour supply.', 'Girls\' enrollment particularly drives long-term demographic and economic outcomes.', 'Land and water use for the campus is minimal; tree planting can offset site impervious cover.'],
  irrigation: ['Can raise crop yields by 50–150% depending on current water stress and crop type.', 'Enables double or triple cropping seasons, significantly multiplying annual farm income.', 'Over-extraction risk requires careful aquifer or diversion management to avoid long-term water stress.'],
  market: ['Reduces post-harvest losses by connecting farmers directly to buyers, boosting effective income by 15–30%.', 'Generates local employment in trade, transport, food processing, and retail.', 'Concentration of activity increases waste and sanitation demands; solid waste management is essential.'],
  solar: ['Electrification enables home businesses, refrigeration, and study after dark — measurable income and education gains.', 'Displaces kerosene and biomass fuel costs, freeing household budget for food and education.', 'Battery storage and grid integration require technical planning; end-of-life panel disposal must be addressed.'],
  water: ['Waterborne disease reduction alone frees significant healthcare spending and improves child development outcomes.', 'Reliable water supply is a prerequisite for attracting manufacturing and agro-processing investment.', 'Effluent discharge standards must be strictly enforced to protect downstream ecosystems.'],
  park: ['Tree canopy and green cover reduce local temperatures by 2–4 °C, lowering cooling energy demand.', 'Community gathering spaces increase social cohesion scores and correlate with lower crime rates.', 'Maintenance costs are low compared to hard infrastructure; community stewardship models work well.']
};

const FALLBACK_RISKS = {
  road: ['Increased traffic accidents if safety design is neglected', 'Potential for urban sprawl and loss of agricultural land'],
  hospital: ['Unsustainable staffing costs if health workforce is unavailable', 'Medical waste mismanagement causing local pollution'],
  school: ['Teacher recruitment and retention in remote areas', 'Infrastructure underuse if enrollment demand is overestimated'],
  irrigation: ['Groundwater depletion if extraction exceeds recharge', 'Soil salinisation with improper drainage design'],
  market: ['Displacement of smaller informal vendors if not inclusive', 'Increased solid waste generation requiring management'],
  solar: ['Grid instability without proper integration planning', 'Theft or vandalism of panels in low-security areas'],
  water: ['Affordability barriers for very low-income households', 'Downstream pollution if effluent standards are not enforced'],
  park: ['Underuse if community engagement is not prioritised', 'Maintenance neglect reducing long-term environmental benefit']
};

const FALLBACK_RECS = {
  road: ['Include pedestrian and cycle lanes in the design', 'Implement drainage to prevent waterlogging during monsoon'],
  hospital: ['Co-locate a pharmacy and diagnostic lab to maximise footfall', 'Establish a community health worker network to extend reach'],
  school: ['Partner with NGOs for teacher training programmes', 'Include a vocational skills wing for post-primary learners'],
  irrigation: ['Adopt drip/sprinkler systems to maximise water efficiency', 'Form a water-user committee for equitable access governance'],
  market: ['Include a cold-storage unit to reduce post-harvest losses', 'Provide stalls for women-led enterprises at subsidised rates'],
  solar: ['Install battery storage for 4-hour overnight supply', 'Train local technicians for ongoing maintenance'],
  water: ['Implement a tiered pricing model to ensure affordability', 'Use treated grey water for irrigation to close the loop'],
  park: ['Involve local youth groups in planting and stewardship', 'Include shaded seating and play areas to maximise usage']
};

function generateFallbackPrediction(simulationData) {
  const { infrastructureType, contextData, currentMetrics } = simulationData;
  const infraKey = Object.keys(INFRASTRUCTURE_PROFILES).find(
    k => INFRASTRUCTURE_PROFILES[k].label === infrastructureType.label
  ) || 'road';

  const baseImpacts = INFRASTRUCTURE_PROFILES[infraKey].baseImpacts;

  // Context multipliers
  const densityMult = contextData.populationDensity < 100 ? 1.2    // rural gets bigger boost
    : contextData.populationDensity < 500 ? 1.0
    : 0.85;  // dense urban already has some services

  const econMult = contextData.economicLevel.includes('Low') ? 1.25
    : contextData.economicLevel.includes('Developing') ? 1.1
    : 0.9;

  const climateMult = contextData.climateZone === 'Arid/Desert' ? 0.85 : 1.0;

  const predictions = {};
  const changes = {};

  Object.keys(currentMetrics).forEach(key => {
    const base = currentMetrics[key] || 40;
    const rawDelta = Math.round(
      (baseImpacts[key] || 0) * densityMult * econMult * climateMult
      + (Math.random() * 4 - 2) // ±2 noise
    );
    const predicted = Math.max(0, Math.min(100, base + rawDelta));
    predictions[key] = predicted;
    changes[key] = predicted - base;
  });

  // Calculate overall impact score (1–10)
  const totalDelta = Object.values(changes).reduce((a, b) => a + b, 0);
  const impactScore = Math.max(1, Math.min(10, Math.round(5 + totalDelta / 15)));
  const overallImpact = totalDelta > 10 ? 'positive' : totalDelta < -5 ? 'negative' : 'neutral';

  const timeMap = {
    road: 'medium-term (3-5 years)', hospital: 'medium-term (3-5 years)',
    school: 'long-term (5-10 years)', irrigation: 'short-term (1-2 years)',
    market: 'short-term (1-2 years)', solar: 'short-term (1-2 years)',
    water: 'medium-term (3-5 years)', park: 'short-term (1-2 years)'
  };

  return {
    predictions,
    changes,
    overallImpact,
    impactScore,
    timeToImpact: timeMap[infraKey] || 'medium-term (3-5 years)',
    explanation: FALLBACK_EXPLANATIONS[infraKey],
    keyInsights: FALLBACK_INSIGHTS[infraKey],
    risks: FALLBACK_RISKS[infraKey],
    recommendations: FALLBACK_RECS[infraKey],
    source: 'rule-based'  // flag to show in UI
  };
}

module.exports = {
  INFRASTRUCTURE_PROFILES,
  generateContextData,
  generateBaselineMetrics,
  generateFallbackPrediction
};

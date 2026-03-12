const express = require('express');
const router = express.Router();
const {
  generatePrediction,
  generateLocationInsights,
  simulateImpact,
  fetchContextualData,
  searchPlace,
  analyzeSimulation,
  generateScenarios,
  simulateDisaster
} = require('../services/novaService');
const {
  INFRASTRUCTURE_PROFILES,
  generateContextData,
  generateBaselineMetrics,
  generateFallbackPrediction
} = require('../services/simulationEngine');

// ─── GET /api/infrastructure-types ──────────────────────────────────────────
router.get('/infrastructure-types', (req, res) => {
  const types = Object.entries(INFRASTRUCTURE_PROFILES).map(([key, val]) => ({
    id: key,
    label: val.label,
    description: val.description
  }));
  res.json({ success: true, data: types });
});

// ─── POST /api/analyze-location ─────────────────────────────────────────────
router.post('/analyze-location', async (req, res) => {
  const { lat, lng, location } = req.body;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, error: 'Latitude and longitude are required' });
  }
  try {
    const contextData    = await generateContextData(lat, lng);
    const baselineMetrics = generateBaselineMetrics(contextData);

    let insights = null;
    try {
      insights = await generateLocationInsights(location || 'Selected Location', lat, lng, contextData);
    } catch (aiErr) {
      console.warn('AI insights failed, using defaults:', aiErr.message);
      insights = {
        summary: `This location shows ${contextData.economicLevel} characteristics with a ${contextData.climateZone} climate. Development potential exists across multiple sectors.`,
        priority_needs: ['Infrastructure Development', 'Healthcare Access', 'Economic Growth'],
        development_potential: 'medium',
        suggested_projects: ['Road', 'Hospital', 'Market']
      };
    }

    res.json({
      success: true,
      data: { contextData, baselineMetrics, insights, location: location || `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
    });
  } catch (error) {
    console.error('Location analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/simulate (single infra, legacy style) ────────────────────────
router.post('/simulate', async (req, res) => {
  const { lat, lng, location, infrastructureType, contextData, currentMetrics } = req.body;
  if (!lat || !lng || !infrastructureType) {
    return res.status(400).json({ success: false, error: 'lat, lng, and infrastructureType are required' });
  }

  const profile = INFRASTRUCTURE_PROFILES[infrastructureType];
  if (!profile) {
    return res.status(400).json({ success: false, error: `Unknown infrastructure type: ${infrastructureType}` });
  }

  const resolvedContext = contextData || await generateContextData(lat, lng);
  const resolvedMetrics = currentMetrics || {
    economic: 45, environmental: 55, healthcare: 40,
    education: 38, transportation: 35, social: 50
  };

  const simulationData = {
    location: location || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    lat, lng, infrastructureType: profile,
    contextData: resolvedContext,
    currentMetrics: resolvedMetrics
  };

  let prediction;
  let source = 'nova-ai';
  try {
    prediction = await generatePrediction(simulationData);
  } catch (aiErr) {
    console.warn('⚠ Amazon Nova API failed, using rule-based fallback:', aiErr.message);
    prediction = generateFallbackPrediction(simulationData);
    source = 'rule-based';
  }

  res.json({
    success: true,
    data: { prediction, infrastructureType: profile, source, simulatedAt: new Date().toISOString() }
  });
});

// ─── POST /api/simulate-advanced (multi-project, new style) ─────────────────
router.post('/simulate-advanced', async (req, res) => {
  const { lat, lng, location, projects } = req.body;
  if (!location || !projects || !Array.isArray(projects) || projects.length === 0) {
    return res.status(400).json({ success: false, error: 'location and projects[] are required' });
  }

  let result;
  let source = 'nova-ai';
  try {
    result = await simulateImpact(location, projects, lat, lng);
  } catch (aiErr) {
    console.warn('⚠ Advanced simulation AI error:', aiErr.message);
    source = 'rule-based';
    // Build a simple fallback aggregation
    result = {
      economicGrowth: 55, environmentalImpact: 58, healthcareAccess: 52,
      educationAccess: 50, transportEfficiency: 54, airQuality: 60,
      waterScarcity: 55, socialImpact: 57,
      airQualityExplanation: 'Estimated based on project types.',
      waterScarcityExplanation: 'Estimated based on project types.',
      socialImpactExplanation: 'Estimated based on project types.',
      explanation: 'Rule-based estimate — Amazon Nova AI unavailable.',
      context: `${location} analysis.`,
      granularData: []
    };
  }

  res.json({ success: true, data: { result, source, simulatedAt: new Date().toISOString() } });
});

// ─── POST /api/analyze ────────────────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  const { prediction, location, projects } = req.body;
  if (!prediction || !location || !projects) {
    return res.status(400).json({ success: false, error: 'prediction, location, and projects are required' });
  }
  try {
    const analysis = await analyzeSimulation(prediction, location, projects);
    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/scenarios ─────────────────────────────────────────────────────
router.post('/scenarios', async (req, res) => {
  const { goal, location } = req.body;
  if (!goal || !location) {
    return res.status(400).json({ success: false, error: 'goal and location are required' });
  }
  try {
    const scenarios = await generateScenarios(goal, location);
    res.json({ success: true, data: scenarios });
  } catch (error) {
    console.error('Scenarios error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/search-place ───────────────────────────────────────────────────
router.post('/search-place', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, error: 'query is required' });
  }
  try {
    const place = await searchPlace(query);
    res.json({ success: true, data: place });
  } catch (error) {
    console.error('Search place error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/context ───────────────────────────────────────────────────────
router.post('/context', async (req, res) => {
  const { location } = req.body;
  if (!location) {
    return res.status(400).json({ success: false, error: 'location is required' });
  }
  try {
    const data = await fetchContextualData(location);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Context error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/disaster-simulate ─────────────────────────────────────────────
router.post('/disaster-simulate', async (req, res) => {
  const { disasterType, customScenario, location, severity, lat, lng } = req.body;
  if (!location) {
    return res.status(400).json({ success: false, error: 'location is required' });
  }
  try {
    const result = await simulateDisaster(
      disasterType || 'drought',
      customScenario || '',
      location,
      severity || 2,
      lat, lng
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Disaster simulation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/health ─────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'CivicTwin AI API is running',
    timestamp: new Date().toISOString(),
    novaConfigured: true,
    sdk: '@aws-sdk/client-bedrock-runtime',
    endpoints: [
      'POST /api/analyze-location',
      'POST /api/simulate',
      'POST /api/simulate-advanced',
      'POST /api/analyze',
      'POST /api/scenarios',
      'POST /api/search-place',
      'POST /api/context',
      'POST /api/disaster-simulate'
    ]
  });
});

module.exports = router;

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// ─── Bedrock Client Initialization ──────────────────────────────────────────
const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ─── Models (Nova) ──────────────────────────────────────────
const MODEL_LITE = "amazon.nova-lite-v1:0";
const MODEL_PRO = "amazon.nova-pro-v1:0";

// ─── helper: callNova ──────────────────────────────────────────────────────────
async function callNova(prompt, modelId = MODEL_LITE, systemPrompt = "You are a helpful urban planning assistant.") {
  const payload = {
    inferenceConfig: {
      max_new_tokens: 2000,
      temperature: 0.7,
      top_p: 0.9,
    },
    messages: [
      {
        role: "user",
        content: [{ text: prompt }]
      }
    ],
    system: [{ text: systemPrompt }]
  };

  try {
    const command = new InvokeModelCommand({
      body: JSON.stringify(payload),
      contentType: "application/json",
      accept: "application/json",
      modelId: modelId,
    });

    const response = await client.send(command);
    const decodedResponse = new TextDecoder().decode(response.body);
    const result = JSON.parse(decodedResponse);

    // Nova response structure for InvokeModel
    if (result.output && result.output.message && result.output.message.content) {
      return result.output.message.content[0].text;
    }
    return "";
  } catch (error) {
    console.error(`Error calling Bedrock (${modelId}):`, error);
    throw error;
  }
}

// ─── safeParseJSON ───────────────────────────────────────────────────────────────────────────
function safeParseJSON(text, fallback = {}) {
  if (!text) return fallback;
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(stripped); } catch (_) { }
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) { } }
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (_) { } }
  return fallback;
}

// ─── simulateImpact ─────────────────────────────────────────────────────────
async function simulateImpact(location, projects, lat, lng) {
  const locationContext = lat && lng
    ? `at coordinates [${lat}, ${lng}] (${location})`
    : `in ${location}`;

  const projectsList = projects.map(p =>
    `${p.type} (Budget: $${p.budget}M, Timeline: ${p.timeline} months, Scale: ${p.scale}, Description: ${p.description || 'N/A'}, Risks: ${p.risks || 'N/A'})`
  ).join(', ');

  const prompt = `
Simulate the cumulative impact of the following infrastructure projects: ${projectsList} ${locationContext}.
Consider population density, climate, and existing infrastructure in this specific geographic area.

Return ONLY valid JSON with these exact fields:
{
  "economicGrowth": <0-100>,
  "environmentalImpact": <0-100, higher=more positive>,
  "healthcareAccess": <0-100>,
  "educationAccess": <0-100>,
  "transportEfficiency": <0-100>,
  "airQuality": <0-100, higher=cleaner>,
  "waterScarcity": <0-100, higher=less scarce>,
  "socialImpact": <0-100, higher=more positive equity>,
  "airQualityExplanation": "<1 sentence>",
  "waterScarcityExplanation": "<1 sentence>",
  "socialImpactExplanation": "<1 sentence>",
  "explanation": "<2-3 sentence overall summary>",
  "context": "<brief local context description>",
  "granularData": [
    { "metric": "<one of: Economic|Environment|Social|Healthcare|Education|Transport|Air Quality|Water>", "label": "<sub-metric>", "value": <0-100>, "description": "<5-8 words>" }
  ]
}
granularData must have 8-12 items covering all 8 metric categories.
`;

  try {
    const text = await callNova(prompt, MODEL_LITE);
    const data = safeParseJSON(text, {});
    return {
      economicGrowth: data.economicGrowth ?? 50,
      environmentalImpact: data.environmentalImpact ?? 50,
      healthcareAccess: data.healthcareAccess ?? 50,
      educationAccess: data.educationAccess ?? 50,
      transportEfficiency: data.transportEfficiency ?? 50,
      airQuality: data.airQuality ?? 50,
      waterScarcity: data.waterScarcity ?? 50,
      socialImpact: data.socialImpact ?? 50,
      airQualityExplanation: data.airQualityExplanation || '',
      waterScarcityExplanation: data.waterScarcityExplanation || '',
      socialImpactExplanation: data.socialImpactExplanation || '',
      explanation: data.explanation || 'No explanation provided.',
      context: data.context || 'No context provided.',
      granularData: Array.isArray(data.granularData) ? data.granularData : []
    };
  } catch (e) {
    console.error('Failed to parse Nova simulateImpact response:', e.message);
    throw new Error('Failed to generate simulation. Please try again.');
  }
}

// ─── fetchContextualData (Regional Context) ──────────────────────────────────
async function fetchContextualData(location) {
  const prompt = `
Fetch comprehensive, current regional context and contextual data for ${location}.
Since I don't have direct search access in this environment, provide the most accurate known information for this region.

Detailed Data Requirements:
1. Population Density: Latest available density (people per sq km) and total population count.
2. Current Weather: Current temperature, climate type, and seasonal conditions.
3. Economy: Primary industries, economic status (e.g., Developing/Developed), and key economic trends.
4. Infrastructure Overview: Current state of roads, hospitals, schools, and utility services in the area.
5. Regional Statistics: Any specific notable stats like GDP growth, literacy rate, or energy sources.
6. Vulnerabilities: Key regional risks such as climate susceptibility, water shortages, or environmental issues.

Return ONLY a valid JSON object with this exact structure:
{
  "populationDensity": "<string, e.g. 150/km²>",
  "totalPopulation": "<string, e.g. 1.2M>",
  "weather": "<string, e.g. 24°C, Humid Subtropical>",
  "climateZone": "<string>",
  "economicLevel": "<string, e.g. Emerging Economy>",
  "primaryIndustries": ["<industry1>", "<industry2>", "<industry3>"],
  "economicSummary": "<brief 1-sentence summary>",
  "infrastructureStatus": "<brief overview>",
  "vulnerabilities": ["<risk1>", "<risk2>"],
  "regionalStats": ["<stat1>", "<stat2>", "<stat3>", "<stat4>"]
}
`;

  try {
    const text = await callNova(prompt, MODEL_PRO, "You are an expert in regional data and demographics.");
    const data = safeParseJSON(text, {});

    return {
      populationDensity: data.populationDensity || 'Unknown',
      totalPopulation: data.totalPopulation || 'Unknown',
      weather: data.weather || 'Unknown',
      climateZone: data.climateZone || 'Unknown',
      economicLevel: data.economicLevel || 'Unknown',
      primaryIndustries: Array.isArray(data.primaryIndustries) ? data.primaryIndustries : [],
      economicSummary: data.economicSummary || '',
      infrastructureStatus: data.infrastructureStatus || '',
      vulnerabilities: Array.isArray(data.vulnerabilities) ? data.vulnerabilities : [],
      regionalStats: Array.isArray(data.regionalStats) ? data.regionalStats : [],
      sourceUrls: [] // No grounded search in Nova SDK direct invoke
    };
  } catch (e) {
    console.error('Failed to fetch contextual data:', e.message);
    return {
      populationDensity: 'Unknown',
      weather: 'Unknown',
      regionalStats: [],
      sourceUrls: []
    };
  }
}

// ─── searchPlace ─────────────────────────────────────────────────────────────
async function searchPlace(query) {
  const prompt = `Find the geographic coordinates (latitude and longitude) for the place: "${query}".
Return ONLY valid JSON with fields: lat, lng, and name.`;

  try {
    const text = await callNova(prompt, MODEL_LITE, "You are a geographic data expert.");
    const data = safeParseJSON(text, {});
    return {
      lat: data.lat || 0,
      lng: data.lng || 0,
      name: data.name || query
    };
  } catch (e) {
    console.error('Failed to parse searchPlace response:', e.message);
    throw new Error('Could not find location. Please try a different search term.');
  }
}

// ─── analyzeSimulation ───────────────────────────────────────────────────────
async function analyzeSimulation(prediction, location, projects) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const projectsList = safeProjects.length
    ? safeProjects.map(p => `${p.type} (Budget: $${p.budget}M, Scale: ${p.scale})`).join(', ')
    : 'General infrastructure project';
  const prompt = `
Analyze the following infrastructure simulation results for ${location}:
Projects: ${projectsList}

Results:
- Economic Growth: ${prediction.economicGrowth}%
- Environmental Impact: ${prediction.environmentalImpact}%
- Social Impact: ${prediction.socialImpact}%
- Healthcare Access: ${prediction.healthcareAccess}%
- Education Access: ${prediction.educationAccess}%
- Transport Efficiency: ${prediction.transportEfficiency}%
- Air Quality: ${prediction.airQuality}%
- Water Scarcity: ${prediction.waterScarcity}%

Return ONLY valid JSON:
{
  "summary": "<2-3 sentence summary>",
  "risks": ["<risk1>", "<risk2>", "<risk3>", "<risk4>"],
  "tradeOffs": ["<tradeoff1>", "<tradeoff2>", "<tradeoff3>"],
  "suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>", "<suggestion4>"]
}
`;

  try {
    const text = await callNova(prompt, MODEL_LITE);
    const data = safeParseJSON(text, {});
    return {
      summary: data.summary || 'Analysis completed successfully.',
      risks: Array.isArray(data.risks) ? data.risks : [],
      tradeOffs: Array.isArray(data.tradeOffs) ? data.tradeOffs : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : []
    };
  } catch (e) {
    console.error('Failed to parse Nova analyzeSimulation response:', e.message);
    return {
      summary: `Analysis for ${location}: The simulation shows mixed results across all metrics.`,
      risks: ['Environmental degradation risk', 'Resource allocation challenges'],
      tradeOffs: ['Economic growth vs. environmental impact'],
      suggestions: ['Prioritize community engagement', 'Phase implementation']
    };
  }
}

// ─── generateScenarios ───────────────────────────────────────────────────────
async function generateScenarios(goal, location) {
  const prompt = `
Act as an urban planner. For the goal "${goal}" in ${location}, generate 3 distinct infrastructure development scenarios.
Each scenario should be a cohesive plan with 2-3 specific projects.

Return ONLY valid JSON as an array:
[
  {
    "id": "<unique-id>",
    "title": "<catchy title>",
    "description": "<brief strategy overview>",
    "projects": [
      {
        "type": "<one of: road|hospital|school|market|solar|water|park|irrigation>",
        "budget": <number in millions USD>,
        "timeline": <number in months>,
        "scale": "<small|medium|large>",
        "description": "<brief project description>"
      }
    ],
    "predictedOutcome": "<1 sentence primary impact prediction>"
  }
]
`;

  try {
    const text = await callNova(prompt, MODEL_PRO);
    const parsed = safeParseJSON(text, []);
    return Array.isArray(parsed) ? parsed : (parsed.scenarios || []);
  } catch (e) {
    console.error('Failed to parse generateScenarios response:', e.message);
    return [];
  }
}

// ─── Legacy Mapping ─────────────────────────────────────────────────────────
async function generatePrediction(simulationData) {
  const projects = [{
    type: simulationData.infrastructureType.label,
    budget: 10,
    timeline: 24,
    scale: 'medium',
    description: simulationData.infrastructureType.description
  }];
  const result = await simulateImpact(
    simulationData.location,
    projects,
    simulationData.lat,
    simulationData.lng
  );
  return {
    predictions: {
      economic: result.economicGrowth,
      environmental: result.environmentalImpact,
      healthcare: result.healthcareAccess,
      education: result.educationAccess,
      transportation: result.transportEfficiency,
      social: result.socialImpact
    },
    changes: {},
    overallImpact: result.economicGrowth > 60 ? 'positive' : 'neutral',
    impactScore: Math.round(Object.values({
      a: result.economicGrowth, b: result.environmentalImpact,
      c: result.healthcareAccess, d: result.educationAccess,
      e: result.transportEfficiency, f: result.socialImpact
    }).reduce((s, v) => s + v, 0) / 60),
    timeToImpact: 'medium-term (3-5 years)',
    explanation: result.explanation,
    keyInsights: [result.airQualityExplanation, result.waterScarcityExplanation, result.socialImpactExplanation].filter(Boolean),
    risks: [],
    recommendations: [],
    granularData: result.granularData,
    fullResult: result
  };
}

async function generateLocationInsights(location, lat, lng, contextData) {
  const data = await fetchContextualData(location);
  return {
    summary: `${location} has a population density of ${data.populationDensity} with ${data.weather} climate conditions.`,
    priority_needs: data.regionalStats.slice(0, 3).length
      ? data.regionalStats.slice(0, 3)
      : ['Infrastructure Development', 'Healthcare Access', 'Economic Growth'],
    development_potential: 'medium',
    suggested_projects: ['Road', 'Hospital', 'Market'],
    sourceUrls: []
  };
}

// ─── simulateDisaster ────────────────────────────────────────────────────────
async function simulateDisaster(disasterType, customScenario, location, severity, lat, lng) {
  const severityLabels = { 1: 'mild', 2: 'moderate', 3: 'severe', 4: 'catastrophic' };
  const severityStr = severityLabels[severity] || 'moderate';
  const locationCtx = (lat && lng) ? `at [${lat}, ${lng}] (${location})` : `in ${location}`;
  const scenario = customScenario || `A ${severityStr} ${disasterType} event`;

  const prompt = `
You are a disaster risk analyst. Simulate the following disaster scenario ${locationCtx}:
Disaster Type: ${disasterType}
Severity Level: ${severityStr}
Scenario: "${scenario}"

Return ONLY valid JSON:
{
  "disasterType": "${disasterType}",
  "severity": "${severityStr}",
  "affectedPopulationPct": <0-100>,
  "estimatedEconomicLoss": <number in millions USD>,
  "metricDeltas": {
    "economicGrowth":      <number -100 to 0>,
    "environmentalImpact": <number -100 to +20>,
    "healthcareAccess":    <number -100 to 0>,
    "educationAccess":     <number -100 to 0>,
    "transportEfficiency": <number -100 to 0>,
    "airQuality":          <number -100 to +10>,
    "waterScarcity":       <number -100 to 0>,
    "socialImpact":        <number -100 to 0>
  },
  "immediateEffects": ["<effect1>","<effect2>","<effect3>","<effect4>"],
  "longtermEffects":  ["<effect1>","<effect2>","<effect3>"],
  "mostVulnerableSectors": ["<sector1>","<sector2>","<sector3>"],
  "recoveryTimeline": "<string>",
  "mitigations": [
    { "action": "<string>", "impact": "<string>", "urgency": "immediate|short-term|long-term", "cost": "<string>" }
  ],
  "narrative": "<string>",
  "warningSign": "<string>"
}
`;

  try {
    const text = await callNova(prompt, MODEL_LITE);
    const data = safeParseJSON(text, {});
    return {
      disasterType: data.disasterType || disasterType,
      severity: data.severity || severityStr,
      affectedPopulationPct: data.affectedPopulationPct ?? 30,
      estimatedEconomicLoss: data.estimatedEconomicLoss ?? 500,
      metricDeltas: data.metricDeltas || {},
      immediateEffects: Array.isArray(data.immediateEffects) ? data.immediateEffects : [],
      longtermEffects: Array.isArray(data.longtermEffects) ? data.longtermEffects : [],
      mostVulnerableSectors: Array.isArray(data.mostVulnerableSectors) ? data.mostVulnerableSectors : [],
      recoveryTimeline: data.recoveryTimeline || 'Unknown',
      mitigations: Array.isArray(data.mitigations) ? data.mitigations : [],
      narrative: data.narrative || '',
      warningSign: data.warningSign || ''
    };
  } catch (e) {
    console.error('simulateDisaster error:', e.message);
    throw new Error('Failed to simulate disaster.');
  }
}

module.exports = {
  simulateImpact,
  fetchContextualData,
  searchPlace,
  analyzeSimulation,
  generateScenarios,
  generatePrediction,
  generateLocationInsights,
  simulateDisaster
};

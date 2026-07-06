// app.js (Node.js with Express or Server-side)

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * मुख्य फंक्शन: सबै ५ सूचकाङ्क निकाल्ने र Gemini विश्लेषण गर्ने
 */
async function calculateGovernanceIndices(officeMonitoringData, citizenSurveyData, timeDisciplineData, coverageFactor, sampleFactor) {
  
  // 1. ट्रान्सपरेन्सी इन्डेक्स (Transparency Index) - कार्यालय अनुगमनको B भागबाट
  const transparencyScore = (officeMonitoringData.transparency?.score || 0) / 15 * 100;
  
  // 2. एकाउन्टेबिलिटी इन्डेक्स (Accountability Index) - गुनासो व्यवस्थापन + सूचना अधिकारी + वार्षिक प्रतिवेदन
  const accountabilityRaw = (officeMonitoringData.grievance || 0) + (officeMonitoringData.infoOfficer || 0) + (officeMonitoringData.annualReport || 0);
  const accountabilityScore = (accountabilityRaw / 7) * 100;
  
  // 3. सर्भिस डेलिभरी इन्डेक्स (Service Delivery Index) - सेवा प्रवाह गुणस्तर (C भाग)
  const serviceDeliveryRaw = officeMonitoringData.serviceDelivery?.score || 0;
  const serviceDeliveryScore = (serviceDeliveryRaw / 15) * 100;
  
  // 4. कर्मचारी डिसिप्लिन इन्डेक्स (Employee Discipline Index) - समय पालना + पोशाक
  const disciplineScore = timeDisciplineData.totalScore / 15 * 100;
  
  // 5. सिटिजन स्याटिस्फ्याक्सन इन्डेक्स (Citizen Satisfaction Index) - सेवाग्राही सर्वेक्षणबाट
  const satisfactionScore = citizenSurveyData.averageScore; // 0-100 scale मा

  // Good Governance Index (GGI)
  const GGI = 
    (transparencyScore * 0.25) +
    (accountabilityScore * 0.20) +
    (serviceDeliveryScore * 0.25) +
    (disciplineScore * 0.10) +
    (satisfactionScore * 0.20);
  
  // Coverage & Sample Factor लागू गरेपछि अन्तिम सूचकाङ्क
  const finalGGI = GGI * coverageFactor * sampleFactor;

  return {
    transparencyIndex: Math.round(transparencyScore),
    accountabilityIndex: Math.round(accountabilityScore),
    serviceDeliveryIndex: Math.round(serviceDeliveryScore),
    employeeDisciplineIndex: Math.round(disciplineScore),
    citizenSatisfactionIndex: Math.round(satisfactionScore),
    goodGovernanceIndex: Math.round(finalGGI),
    rawGGI: Math.round(GGI)
  };
}

/**
 * Gemini Prompt निर्माण - includes optional projectMonitoring data
 */
function buildGovernancePrompt(indices, rawData, regionType, regionName, projectMonitoring) {
  return `
तपाईं राष्ट्रिय सतर्गता केन्द्रको सुशासन तथा सेवा प्रवाह विश्लेषक हुनुहुन्छ।

**मूल्याङ्कन तह**: ${regionType} (${regionName})

**५ सूचकाङ्क (Indices)**:
- Transparency Index: ${indices.transparencyIndex}/100
- Accountability Index: ${indices.accountabilityIndex}/100
- Service Delivery Index: ${indices.serviceDeliveryIndex}/100
- Employee Discipline Index: ${indices.employeeDisciplineIndex}/100
- Citizen Satisfaction Index: ${indices.citizenSatisfactionIndex}/100
- Good Governance Index (GGI): ${indices.goodGovernanceIndex}/100

**तथ्याङ्क विवरण (Raw Data Overview)**:
${JSON.stringify(rawData, null, 2)}

${projectMonitoring && projectMonitoring.aggregates ? "**आयोजना अनुगमन सारांश:**\n" + JSON.stringify(projectMonitoring.aggregates, null, 2) : ''}
${projectMonitoring && projectMonitoring.topOverspend ? "**Top Overspend Examples:**\n" + JSON.stringify(projectMonitoring.topOverspend.slice(0,5), null, 2) : ''}
${projectMonitoring && projectMonitoring.stalled ? "**Stalled Examples:**\n" + JSON.stringify(projectMonitoring.stalled.slice(0,5), null, 2) : ''}

निम्न शीर्षकमा विस्तृत विश्लेषण दिनुहोस्:

1. समग्र सुशासन स्कोर (100 मा) र त्यसको व्याख्या
2. सेवा प्रवाहको अवस्था (Service Delivery Index को आधारमा)
3. पारदर्शिता तथा सूचना व्यवस्थापन (Transparency Index)
4. जवाफदेहिता (Accountability Index)
5. गुनासो व्यवस्थापन (raw data बाट)
6. कर्मचारी अनुशासन तथा समय पालना (Employee Discipline Index)
7. सेवाग्राही सन्तुष्टि स्तर (Citizen Satisfaction Index)
8. प्रमुख सबल पक्षहरू
9. प्रमुख कमजोरीहरू
10. उच्च जोखिम क्षेत्रहरू (यदि कुनै सूचकाङ्क 60 भन्दा कम छ भने)
11. सुधार गर्नुपर्ने शीर्ष 10 सिफारिसहरू
12. Governance Grade (A+ ≥85, A 75-84, B+ 65-74, B 50-64, C <50)
13. Executive Summary (नेपालीमा, २०० शब्द)

विश्लेषण गर्दा:
- संख्यात्मक तथ्याङ्क प्रयोग गर्नुहोस्
- कमजोर सूचकहरू पहिचान गर्नुहोस्
- सेवाग्राहीको धारणा र कार्यालय अनुगमन दुवैलाई आधार बनाउनुहोस्
- यदि GGI 60 भन्दा कम छ भने उच्च जोखिम उल्लेख गर्नुहोस्
- यदि GGI 85 भन्दा माथि छ भने उत्कृष्ट अभ्यासहरू उल्लेख गर्नुहोस्
- नतिजा **नेपाली भाषामा** दिनुहोस्
`;
}

/**
 * Gemini API मार्फत विश्लेषण गर्ने फंक्शन
 */
async function analyzeGovernanceWithGemini(indices, rawData, regionType, regionName, projectMonitoring) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const prompt = buildGovernancePrompt(indices, rawData, regionType, regionName, projectMonitoring);
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// नमुना प्रयोग (Express route मा)
async function governanceReport(req, res) {
  try {
    // 1. Input data from your forms
    const officeData = {
      transparency: { score: 12 }, // 15 मध्ये
      grievance: 1.5, // 2 मध्ये
      infoOfficer: 1.8,
      annualReport: 1.2,
      serviceDelivery: { score: 11 } // 15 मध्ये
    };
    
    const surveyData = { averageScore: 76.5 }; // 100 मध्ये
    const timeData = { totalScore: 12.6 }; // 15 मध्ये
    const coverageFactor = 0.95;
    const sampleFactor = 1.0;
    
    // 2. Indices calculation
    const indices = await calculateGovernanceIndices(officeData, surveyData, timeData, coverageFactor, sampleFactor);
    
    // 3. Gemini Analysis
    const rawDataForAI = { officeMonitoring: officeData, survey: surveyData, timeDiscipline: timeData };
    const analysis = await analyzeGovernanceWithGemini(indices, rawDataForAI, "स्थानीय तह", "काठमाडौं महानगरपालिका");
    
    // 4. Response
    res.json({
      indices: indices,
      aiAnalysis: analysis
    });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "AI विश्लेषण असफल" });
  }
}

module.exports = { calculateGovernanceIndices, analyzeGovernanceWithGemini, governanceReport };
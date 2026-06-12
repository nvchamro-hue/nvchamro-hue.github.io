import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const OFFICE_SCHEMA = {
  basicAdmin: {
    citizenCharter: 2,
    grievanceHearing: 2,
    infoOfficer: 2,
    helpDesk: 2,
    websiteUpdated: 2,
    socialMedia: 1,
    CCTV: 1,
    waitingArea: 1,
    nursingRoom: 1,
    accessibility: 1
  },
  transparency: {
    procurementNotice: 3,
    budgetPublication: 3,
    annualReport: 2,
    selfDisclosure: 3,
    assetDisclosure: 2,
    infoBoard: 2
  },
  serviceQuality: {
    serviceTimeAdherence: 4,
    staffBehavior: 3,
    processClarity: 3,
    serviceAvailability: 3,
    technologyUse: 2
  }
};

function classify(score) {
  if (score >= 90) return "उत्कृष्ट";
  if (score >= 75) return "राम्रो";
  if (score >= 60) return "सुधार आवश्यक";
  if (score >= 40) return "गम्भीर रूपमा समीक्षा गरी सुधार गर्नुपर्ने देखिएको";
  return "तत्काल हस्तक्षेपको आवश्यकता";
}

function getGrade(score) {
  if (score >= 85) return { grade: "A+", status: "उत्कृष्ट" };
  if (score >= 75) return { grade: "A", status: "धेरै राम्रो" };
  if (score >= 65) return { grade: "B+", status: "राम्रो" };
  if (score >= 50) return { grade: "B", status: "सुधार आवश्यक" };
  return { grade: "C", status: "कमजोर" };
}

function getSampleFactor(sampleSize) {
  if (typeof sampleSize !== "number") return 1;
  if (sampleSize < 20) return 0.80;
  if (sampleSize < 50) return 0.90;
  if (sampleSize < 100) return 0.95;
  return 1.00;
}

function getCoverageFactor(coverageRatio) {
  if (typeof coverageRatio !== "number" || Number.isNaN(coverageRatio)) return 1;
  if (coverageRatio < 0.25) return 0.80;
  if (coverageRatio < 0.50) return 0.90;
  if (coverageRatio <= 0.75) return 0.95;
  return 1.00;
}

function normalizeScore(value, max = 100) {
  if (max === 0) return 0;
  return Number(((Number(value) / Number(max)) * 100).toFixed(2));
}

function getValue(field, max) {
  if (field == null) return 0;
  if (typeof field === "object") {
    if (field.score !== undefined && field.max !== undefined) {
      return Math.min(Number(field.score), Number(field.max));
    }
    if (field.present !== undefined && field.total !== undefined) {
      return Number(field.total) ? (Number(field.present) / Number(field.total)) * max : 0;
    }
    if (field.compliant !== undefined && field.total !== undefined) {
      return Number(field.total) ? (Number(field.compliant) / Number(field.total)) * max : 0;
    }
  }
  return Number(field) || 0;
}

function calculateSectionScore(sectionData, schema) {
  let total = 0;
  Object.entries(schema).forEach(([key, max]) => {
    total += getValue(sectionData?.[key], max);
  });
  return total;
}

function calculateOfficeMonitoringPercent(officeMonitoring) {
  const basicAdmin = calculateSectionScore(officeMonitoring?.basicAdmin, OFFICE_SCHEMA.basicAdmin);
  const transparency = calculateSectionScore(officeMonitoring?.transparency, OFFICE_SCHEMA.transparency);
  const serviceQuality = calculateSectionScore(officeMonitoring?.serviceQuality, OFFICE_SCHEMA.serviceQuality);
  const totalOffice = basicAdmin + transparency + serviceQuality;

  return {
    rawOfficeScore: Number(totalOffice.toFixed(2)),
    officePercent: Number(((totalOffice / 45) * 100).toFixed(2)),
    basicAdmin,
    transparency,
    serviceQuality
  };
}

function calculateSurveyPercent(serviceSurvey) {
  let values = [];
  if (Array.isArray(serviceSurvey?.questions)) {
    values = serviceSurvey.questions.map(q => typeof q === "object" ? Number(q.score || 0) : Number(q));
  } else {
    values = Object.values(serviceSurvey || {}).map(v => typeof v === "object" ? Number(v.score || 0) : Number(v));
  }
  values = values.filter(v => !Number.isNaN(v));
  if (values.length === 0) return 0;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(average.toFixed(2));
}

function calculateTimeDressPercent(timeDressMonitoring) {
  const attendance = getValue(timeDressMonitoring?.attendance, 10);
  const dress = getValue(timeDressMonitoring?.dressCode, 5);
  const total = Math.min(attendance + dress, 15);
  return Number(((total / 15) * 100).toFixed(2));
}

function calculateAccountabilityIndex(officeMonitoring) {
  const accountabilitySchema = {
    grievanceHearing: 2,
    infoOfficer: 2,
    annualReport: 2,
    helpDesk: 2,
    infoBoard: 2
  };
  const total = calculateSectionScore({
    ...officeMonitoring?.basicAdmin,
    ...officeMonitoring?.transparency
  }, accountabilitySchema);
  return Number(((total / 10) * 100).toFixed(2));
}

function calculateGovernanceIndices(officeMonitoring, serviceSurvey, timeDressMonitoring, coverageFactor = 1, sampleFactor = 1) {
  const officeResult = calculateOfficeMonitoringPercent(officeMonitoring);
  const surveyPercent = calculateSurveyPercent(serviceSurvey);
  const timePercent = calculateTimeDressPercent(timeDressMonitoring);

  const transparencyIndex = Number(((officeResult.transparency / 15) * 100).toFixed(2));
  const accountabilityIndex = calculateAccountabilityIndex(officeMonitoring);
  const serviceDeliveryIndex = Number(((officeResult.serviceQuality / 15) * 100).toFixed(2));
  const disciplineIndex = timePercent;
  const satisfactionIndex = surveyPercent;


  const rawGGI = (
    (transparencyIndex * 0.25) +
    (accountabilityIndex * 0.20) +
    (serviceDeliveryIndex * 0.25) +
    (disciplineIndex * 0.10) +
    (satisfactionIndex * 0.20)
  );

  const goodGovernanceIndex = Number(rawGGI.toFixed(2));
  const adjustedGI = Number((goodGovernanceIndex * coverageFactor * sampleFactor).toFixed(2));

  return {
    officePercent: officeResult.officePercent,
    officeRawScore: officeResult.rawOfficeScore,
    surveyPercent,
    timePercent,
    rawGGI: goodGovernanceIndex,
    adjustedGI,
    coverageFactor,
    sampleFactor,
    transparencyIndex,
    accountabilityIndex,
    serviceDeliveryIndex,
    employeeDisciplineIndex: disciplineIndex,
    citizenSatisfactionIndex: satisfactionIndex,
    goodGovernanceIndex,
    basicAdmin: officeResult.basicAdmin,
    transparencySection: officeResult.transparency,
    serviceQualitySection: officeResult.serviceQuality
  };
}

function buildGovernancePrompt(indices, rawData, regionType, regionName, currentDate) {
  return `
तपाईं राष्ट्रिय सतर्कता केन्द्रको सुशासन तथा सेवा प्रवाह विश्लेषक हुनुहुन्छ।

क्षेत्र: ${regionType}
नाम: ${regionName}
${currentDate ? `मिति: ${currentDate}` : ""}

तथ्यांक:
${JSON.stringify(rawData, null, 2)}

  **गणना गरिएका सूचकहरू (Indices):**
  - Transparency Index: ${indices.transparencyIndex}/100
  - Accountability Index: ${indices.accountabilityIndex}/100
  - Service Delivery Index: ${indices.serviceDeliveryIndex}/100
  - Employee Discipline Index: ${indices.employeeDisciplineIndex}/100
  - Citizen Satisfaction Index: ${indices.citizenSatisfactionIndex}/100
  - **Good Governance Index (GGI): ${indices.goodGovernanceIndex}/100**

निम्न शीर्षकमा विश्लेषण दिनुहोस्:
1. समग्र सुशासन स्कोर (GGI) र यसको व्याख्या
2. सेवा प्रवाहको अवस्था
3. पारदर्शिता तथा सूचना व्यवस्थापन
4. गुनासो व्यवस्थापन
5. कर्मचारी अनुशासन तथा समय पालना
6. सेवाग्राही सन्तुष्टि स्तर
7. प्रमुख सबल पक्षहरू
8. प्रमुख कमजोरीहरू
9. उच्च जोखिम क्षेत्रहरू
10. सुधार गर्नुपर्ने शीर्ष 10 सिफारिसहरू
11. जिल्लाभित्र अन्य कार्यालयसँग तुलना
12. प्रदेश औसतसँग तुलना
13. राष्ट्रिय औसतसँग तुलना
14. Governance Grade (A+,A,B+,B,C)
15. Executive Summary (200 शब्द)

विश्लेषण गर्दा:
- संख्यात्मक तथ्याङ्क प्रयोग गर्नुहोस्।
- कमजोर सूचकहरू पहिचान गर्नुहोस्।
- सेवाग्राहीको धारणा र कार्यालय अनुगमन दुवैलाई आधार बनाउनुहोस्।
- यदि स्कोर 60 भन्दा कम छ भने उच्च जोखिम उल्लेख गर्नुहोस्।
- यदि स्कोर 85 भन्दा माथि छ भने उत्कृष्ट अभ्यासहरू उल्लेख गर्नुहोस्।
- नतिजा नेपाली भाषामा दिनुहोस्।
`;
}

async function generateAnalysis(input) {
  const coverageRatio = input.coverageRatio ??
    (input.officeMonitoring?.coverageAudited != null && input.officeMonitoring?.coverageTotal != null
      ? Number(input.officeMonitoring.coverageAudited) / Number(input.officeMonitoring.coverageTotal)
      : undefined);

  const sampleSize = input.sampleSize ?? input.serviceSurvey?.sampleSize;
  const sampleFactor = input.sampleFactor ?? getSampleFactor(sampleSize);
  const coverageFactor = input.coverageFactor ?? getCoverageFactor(coverageRatio);

  const indices = calculateGovernanceIndices(
    input.officeMonitoring,
    input.serviceSurvey,
    input.timeDressMonitoring,
    coverageFactor,
    sampleFactor
  );

  const grade = getGrade(indices.adjustedGI);
  const prompt = buildGovernancePrompt(
    indices,
    {
      officeMonitoring: input.officeMonitoring,
      serviceSurvey: input.serviceSurvey,
      timeDressMonitoring: input.timeDressMonitoring,
      coverageRatio: coverageRatio == null ? undefined : Number((coverageRatio * 100).toFixed(2)) + "%",
      sampleSize,
      coverageFactor,
      sampleFactor,
      scoreBreakdown: {
        officePercent: indices.officePercent,
        surveyPercent: indices.surveyPercent,
        timePercent: indices.timePercent
      }
    },
    input.location?.level || "अन्य",
    input.location?.name || "अज्ञात",
    input.currentDate
  );

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const response = await model.generateContent(prompt);
  const analysis = await response.response.text();

  return {
    ...indices,
    coverageRatio,
    sampleSize,
    grade,
    classification: classify(indices.adjustedGI),
    analysis
  };
}

const monitoringData = {
  location: {
    level: "स्थानीय तह",
    name: "जनकपुर उपमहानगरपालिका"
  },
  currentDate: "2026-06-04",
  sampleSize: 30,
  officeMonitoring: {
    basicAdmin: {
      citizenCharter: 2,
      grievanceHearing: 2,
      infoOfficer: 2,
      helpDesk: 2,
      websiteUpdated: 2,
      socialMedia: 1,
      CCTV: 1,
      waitingArea: 1,
      nursingRoom: 1,
      accessibility: 1
    },
    transparency: {
      procurementNotice: 3,
      budgetPublication: 3,
      annualReport: 2,
      selfDisclosure: 3,
      assetDisclosure: 2,
      infoBoard: 2
    },
    serviceQuality: {
      serviceTimeAdherence: 4,
      staffBehavior: 3,
      processClarity: 3,
      serviceAvailability: 3,
      technologyUse: 2
    },
    coverageAudited: 15,
    coverageTotal: 20
  },
  timeDressMonitoring: {
    attendance: { present: 43, total: 50 },
    dressCode: { compliant: 40, total: 50 }
  },
  serviceSurvey: {
    sampleSize: 30,
    questions: [82, 75, 68, 80, 77, 73, 79, 84, 71, 69, 76, 78, 72, 74, 78]
  }
};

generateAnalysis(monitoringData)
  .then(result => {
    console.log("Classification:", result.classification);
    console.log("Grade:", result.grade);
    console.log("Adjusted GI:", result.adjustedGI);
    console.log("Indices:", result);
    console.log(result.analysis);
  })
  .catch(console.error);

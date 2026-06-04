import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

/* =====================================================
   WEIGHT CONFIGURATION
===================================================== */

const WEIGHTS = {

  officeMonitoring: {
    total: 45,

    indicators: {

      vacancyRate: 6,
      citizenCharter: 6,
      serviceInfo: 7,
      middlemanEntry: 6,
      employeePresence: 6,
      cleanliness: 5,
      helpDesk: 5,
      digitalServices: 4,
      complaintMechanism: 4,
      publicInfoDisclosure: 3
    }
  },

  serviceSurvey: {

    total: 35,

    indicators: {

      charterAwareness: 6,
      timelyService: 8,
      externalSupport: 7,
      bribery: 8,
      satisfaction: 6
    }
  },

  timeDressMonitoring: {

    total: 20,

    indicators: {

      currentAbsenceLate: 6,
      previousAbsenceLate: 5,
      dressViolation: 4,
      absentFromDesk: 5
    }
  }
};


/* =====================================================
   CLASSIFICATION
===================================================== */

function classify(score) {

  if (score >= 90) return "उत्कृष्ट";

  if (score >= 75) return "राम्रो";

  if (score >= 60) return "सुधार आवश्यक";

  if (score >= 40)
    return "गम्भीर रूपमा समीक्षा गरी सुधार गर्नुपर्ने देखिएको";

  return "तत्काल हस्तक्षेपको आवश्यकता";
}


/* =====================================================
   SCORE NORMALIZATION
===================================================== */

// Positive Indicator
function positive(percent) {

  return Math.max(
    0,
    Math.min(100, Number(percent))
  );
}

// Negative Indicator
function negative(percent) {

  return Math.max(
    0,
    100 - Number(percent)
  );
}

// Categorical Indicator

function categorical(value) {

  const map = {

    excellent: 100,
    good: 100,

    average: 70,

    poor: 30,

    none: 0
  };

  return map[value] ?? 0;
}


/* =====================================================
   RELIABILITY FACTOR
===================================================== */

function reliabilityFactor(
  sampleSize,
  referenceSize = 100
) {

  return Math.min(
    1,
    Math.sqrt(sampleSize / referenceSize)
  );
}


/* =====================================================
   SAMPLE SIZE WEIGHTED EVALUATION
===================================================== */

function calculateRegionalScore(
  offices,
  regionType // 'province', 'district', 'localLevel'
) {
  const totalOfficeMonitoringCount =
    offices.reduce((sum, o) =>
      sum + (o.officeMonitoringCount || 1), 0
    );

  const totalSurveySampleSize =
    offices.reduce((sum, o) =>
      sum + (o.sampleSize || 0), 0
    );

  const weightedOfficeScores = offices.map(o => {
    const monitoringWeight =
      (o.officeMonitoringCount || 1) / totalOfficeMonitoringCount;
    return o.officeScore * monitoringWeight;
  });

  const weightedSurveyScores = offices.map(o => {
    const surveyWeight =
      (o.sampleSize || 0) / totalSurveySampleSize;
    return o.surveyScore * surveyWeight;
  });

  const regionalOfficeScore =
    weightedOfficeScores.reduce((a, b) => a + b, 0);

  const regionalSurveyScore =
    weightedSurveyScores.reduce((a, b) => a + b, 0);

  const regionalTimeScore =
    offices.reduce((sum, o) =>
      sum + o.timeScore, 0
    ) / offices.length;

  const regionalReliability =
    reliabilityFactor(
      totalOfficeMonitoringCount + totalSurveySampleSize,
      100
    );

  return {
    regionType,
    totalOffices: offices.length,
    totalOfficeMonitoringCount,
    totalSurveySampleSize,
    regionalOfficeScore,
    regionalSurveyScore,
    regionalTimeScore,
    regionalReliability,
    finalRegionalScore:
      regionalOfficeScore +
      regionalSurveyScore +
      regionalTimeScore,
    classification: classify(
      regionalOfficeScore +
      regionalSurveyScore +
      regionalTimeScore
    )
  };
}


/* =====================================================
   WEIGHTED SECTION SCORE
===================================================== */

function calculateSectionScore(
  sectionData,
  sectionWeights
) {

  let score = 0;

  Object.keys(
    sectionWeights.indicators
  ).forEach(key => {

    const weight =
      sectionWeights.indicators[key];

    const indicatorScore =
      Number(sectionData[key] || 0);

    score +=
      (indicatorScore / 100) * weight;
  });

  return Number(
    score.toFixed(2)
  );
}


/* =====================================================
   OFFICE SCORE
===================================================== */

function calculateOfficeScore(data) {

  const normalized = {

    vacancyRate:
      negative(data.vacancyRate),

    citizenCharter:
      categorical(data.citizenCharter),

    serviceInfo:
      categorical(data.serviceInfo),

    middlemanEntry:
      negative(data.middlemanEntry),

    employeePresence:
      positive(data.employeePresence),

    cleanliness:
      categorical(data.cleanliness),

    helpDesk:
      categorical(data.helpDesk),

    digitalServices:
      categorical(data.digitalServices || 'none'),

    complaintMechanism:
      categorical(data.complaintMechanism || 'none'),

    publicInfoDisclosure:
      categorical(data.publicInfoDisclosure || 'none')
  };

  return calculateSectionScore(
    normalized,
    WEIGHTS.officeMonitoring
  );
}


/* =====================================================
   SURVEY SCORE
===================================================== */

function calculateSurveyScore(
  data,
  sampleSize,
  nationalAverage = 70
) {

  const normalized = {

    charterAwareness:
      positive(data.charterAwareness),

    timelyService:
      positive(data.timelyService),

    externalSupport:
      negative(data.externalSupport),

    bribery:
      negative(data.bribery),

    satisfaction:
      positive(data.satisfaction)
  };

  const rawScore =
    calculateSectionScore(
      normalized,
      WEIGHTS.serviceSurvey
    );

  const reliability =
    reliabilityFactor(
      sampleSize,
      100
    );

  const adjustedScore =
    rawScore * reliability +
    nationalAverage *
      (1 - reliability);

  return Number(
    adjustedScore.toFixed(2)
  );
}


/* =====================================================
   TIME / DRESS SCORE
===================================================== */

function calculateTimeScore(
  data
) {

  const normalized = {

    currentAbsenceLate:
      negative(
        data.currentAbsenceLate
      ),

    previousAbsenceLate:
      negative(
        data.previousAbsenceLate
      ),

    dressViolation:
      negative(
        data.dressViolation
      ),

    absentFromDesk:
      negative(
        data.absentFromDesk
      )
  };

  return calculateSectionScore(
    normalized,
    WEIGHTS.timeDressMonitoring
  );
}


/* =====================================================
   FINAL SCORE
===================================================== */

function calculateFinalScore(
  officeScore,
  surveyScore,
  timeScore
) {

  return Number(
    (
      officeScore +
      surveyScore +
      timeScore
    ).toFixed(2)
  );
}


/* =====================================================
   RISK IDENTIFICATION
===================================================== */

function identifyRisks(office) {
  const risks = [];

  if (office.officeMonitoring?.vacancyRate > 30) {
    risks.push("उच्च रिक्त दरबन्दी");
  }

  if (office.serviceSurvey?.bribery > 5) {
    risks.push("घुस सम्बन्धी संकेत");
  }

  if (office.officeMonitoring?.middlemanEntry > 10) {
    risks.push("मध्यस्थकर्ता सक्रिय");
  }

  if (office.finalScore < 40) {
    risks.push("तत्काल हस्तक्षेप आवश्यक");
  }

  if (office.officeMonitoring?.employeePresence < 60) {
    risks.push("कर्मचारी उपस्थिति कम");
  }

  if (office.serviceSurvey?.timelyService < 50) {
    risks.push("समयमै सेवा नपुग्ने");
  }

  if (office.timeDressMonitoring?.currentAbsenceLate > 20) {
    risks.push("अनुशासन समस्या");
  }

  return risks;
}


/* =====================================================
   DASHBOARD STATISTICS
===================================================== */

function dashboardSummary(offices) {
  const scores = offices.map(o => o.finalScore);

  const avg =
    scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    totalOffices: offices.length,
    averageScore: avg.toFixed(2),
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    excellent: scores.filter(s => s >= 90).length,
    good: scores.filter(s => s >= 75 && s < 90).length,
    improvement: scores.filter(s => s >= 60 && s < 75).length,
    critical: scores.filter(s < 60).length
  };
}


/* =====================================================
   TOP/BOTTOM RANKING
===================================================== */

function getTopBottomRankings(offices, limit = 5) {
  const sorted = [...offices].sort(
    (a, b) => b.finalScore - a.finalScore
  );

  return {
    topPerformers: sorted.slice(0, limit).map(o => ({
      name: o.location.name,
      level: o.location.level,
      score: o.finalScore,
      classification: classify(o.finalScore)
    })),
    bottomPerformers: sorted.slice(-limit).reverse().map(o => ({
      name: o.location.name,
      level: o.location.level,
      score: o.finalScore,
      classification: classify(o.finalScore)
    }))
  };
}


/* =====================================================
   NATIONAL BENCHMARK
===================================================== */

function calculateNationalBenchmark(offices) {
  const summary = dashboardSummary(offices);

  const officeScores = offices.map(o => o.officeScore);
  const surveyScores = offices.map(o => o.surveyScore);
  const timeScores = offices.map(o => o.timeScore);

  return {
    nationalAverage: parseFloat(summary.averageScore),
    officeMonitoringAverage:
      officeScores.reduce((a, b) => a + b, 0) / officeScores.length,
    serviceSurveyAverage:
      surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length,
    timeDressAverage:
      timeScores.reduce((a, b) => a + b, 0) / timeScores.length,
    performanceDistribution: {
      excellent: summary.excellent,
      good: summary.good,
      improvement: summary.improvement,
      critical: summary.critical
    },
    benchmarkClassification: classify(parseFloat(summary.averageScore))
  };
}


/* =====================================================
   RELIABILITY WEIGHTED RANKING
===================================================== */

function reliabilityWeightedRanking(offices) {
  return offices.map(office => {
    const monitoringReliability =
      reliabilityFactor(office.officeMonitoringCount || 1, 50);
    const surveyReliability =
      reliabilityFactor(office.sampleSize || 0, 100);

    const combinedReliability =
      (monitoringReliability + surveyReliability) / 2;

    const weightedScore =
      office.finalScore * combinedReliability;

    return {
      ...office,
      monitoringReliability: monitoringReliability.toFixed(2),
      surveyReliability: surveyReliability.toFixed(2),
      combinedReliability: combinedReliability.toFixed(2),
      weightedScore: weightedScore.toFixed(2),
      reliabilityAdjustedClassification: classify(weightedScore)
    };
  }).sort((a, b) => b.weightedScore - a.weightedScore);
}


/* =====================================================
   GENERATE ANALYSIS
===================================================== */

async function generateAnalysis(
  input
) {

  const officeScore =
    calculateOfficeScore(
      input.officeMonitoring
    );

  const surveyScore =
    calculateSurveyScore(
      input.serviceSurvey,
      input.sampleSize
    );

  const timeScore =
    calculateTimeScore(
      input.timeDressMonitoring
    );

  const finalScore =
    calculateFinalScore(
      officeScore,
      surveyScore,
      timeScore
    );

  const classification =
    classify(finalScore);

  const officeData = {
    officeMonitoring: input.officeMonitoring,
    serviceSurvey: input.serviceSurvey,
    timeDressMonitoring: input.timeDressMonitoring,
    officeScore,
    surveyScore,
    timeScore,
    finalScore
  };

  const risks = identifyRisks(officeData);

  const model =
    genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

  const prompt = `

तपाईं राष्ट्रिय सतर्कता केन्द्रको
अनुगमन विश्लेषक हुनुहुन्छ।

मूल्याङ्कन विधि:

१. कार्यालय/नागरिक बडापत्र अनुगमन = ४५ अंक (१० सूचक)
   - रिक्त दरबन्दी (६ अंक)
   - नागरिक बडापत्र (६ अंक)
   - सेवा प्रक्रिया, कागजात, लागत र समय (७ अंक)
   - मध्यस्थकर्ताको प्रवेश (६ अंक)
   - कर्मचारी उपस्थिति (६ अंक)
   - कार्यालय सरसफाइ (५ अंक)
   - सेवाग्राही सहायता कक्ष (५ अंक)
   - डिजिटल सेवा (४ अंक)
   - गुनासो निवारण व्यवस्था (४ अंक)
   - सार्वजनिक सूचना प्रकाशन (३ अंक)

२. सेवाग्राही सर्वेक्षण = ३५ अंक
   - नागरिक बडापत्रको जानकारी (६ अंक)
   - तोकिएको समयमा काम भएको (८ अंक)
   - बाहिरी व्यक्तिको सहयोग (७ अंक)
   - अतिरिक्त रकम/घुस (८ अंक)
   - सन्तुष्ट/असन्तुष्ट (६ अंक)

३. समय पालना/पोशाक अनुगमन = २० अंक
   - अनुगमन मितिमा अनुपस्थित/ढिला (६ अंक)
   - अघिल्लो मितिमा अनुपस्थित/ढिला (५ अंक)
   - तोकिएको पोशाक नलगाएको (४ अंक)
   - हाजिर भई कार्यकक्षमा नभेटिएको (५ अंक)

कुल = १०० अंक

Negative Indicators (Score = 100 - प्रतिशत):
- रिक्त दरबन्दी
- मध्यस्थकर्ता
- बाहिरी व्यक्तिको सहयोग
- अतिरिक्त रकम/घुस
- अनुपस्थित/ढिला
- पोशाक नलगाएको
- कार्यकक्षमा नभेटिएको

Positive Indicators (Score = प्रतिशत):
- कर्मचारी उपस्थिति
- नागरिक बडापत्रको जानकारी
- समयमै काम भएको
- सन्तुष्ट

Categorical Indicators:
- स्पष्ट बुझिने/स्पष्ट उल्लेख = १००
- आंशिक/सामान्य = ७०
- स्पष्ट नबुझिने/पढ्न झन्झटिलो = ३०
- नभएको = ०

Sample Reliability:
Reliability = √(sampleSize/100)
छोटो sample size को प्रभाव घटाउन adjustment गरिएको छ।

Regional Evaluation:
प्रदेश, जिल्ला, स्थानीय तहको मूल्याङ्कन गर्दा:
- कुल कार्यालय अनुगमन संख्यालाई आधार मानेर कार्यालय स्कोर वजन गरिन्छ
- कुल सेवाग्राही सर्वेक्षण संख्यालाई आधार मानेर सर्वेक्षण स्कोर वजन गरिन्छ
- समय पालना स्कोर सरल औसत लिइन्छ
- Sample reliability factor ले समग्र स्कोरलाई समायोजन गर्छ

कार्यालय:
${input.location.name}

स्तर:
${input.location.level}

कार्यालय अनुगमन संख्या:
${input.officeMonitoringCount || 1}

सेवाग्राही सर्वेक्षण संख्या:
${input.sampleSize}

कार्यालय स्कोर:
${officeScore}/45

सेवाग्राही स्कोर:
${surveyScore}/35

अनुशासन स्कोर:
${timeScore}/20

अन्तिम स्कोर:
${finalScore}/100

श्रेणी:
${classification}

पहिचान गरिएका जोखिमहरू:
${risks.length > 0 ? risks.join(', ') : 'कुनै ठूलो जोखिम छैन'}

निम्न शीर्षकमा विस्तृत प्रशासनिक विश्लेषण लेख:

१. अंक गणनाको विधि र तौल
२. समग्र अवस्था
३. कार्यालय अनुगमन विश्लेषण (१० सूचक)
४. सेवाग्राही सर्वेक्षण विश्लेषण (५ सूचक)
५. समय पालना विश्लेषण (४ सूचक)
६. Sample size को प्रभाव
७. पहिचान गरिएका जोखिमहरू
८. प्रमुख समस्या र कारणहरू
९. सुधारका उपाय
१०. निष्कर्ष
११. अन्तिम वर्गीकरण

भाषा:
औपचारिक नेपाली
`;

  const result =
    await model.generateContent(
      prompt
    );

  return {

    officeScore,

    surveyScore,

    timeScore,

    finalScore,

    classification,

    risks,

    analysis:
      result.response.text()
  };
}


/* =====================================================
   EXAMPLE DATA
===================================================== */

const monitoringData = {

  location: {

    level: "स्थानीय तह",

    name:
      "जनकपुर उपमहानगरपालिका"
  },

  officeMonitoringCount: 5,

  sampleSize: 120,

  officeMonitoring: {

    vacancyRate: 15,

    citizenCharter:
      "good",

    serviceInfo:
      "good",

    middlemanEntry: 5,

    employeePresence: 90,

    cleanliness:
      "good",

    helpDesk:
      "average",

    digitalServices:
      "average",

    complaintMechanism:
      "good",

    publicInfoDisclosure:
      "average"
  },

  serviceSurvey: {

    charterAwareness: 80,

    timelyService: 75,

    externalSupport: 12,

    bribery: 2,

    satisfaction: 85
  },

  timeDressMonitoring: {

    currentAbsenceLate: 10,

    previousAbsenceLate: 8,

    dressViolation: 5,

    absentFromDesk: 7
  }
};


generateAnalysis(
  monitoringData
)
.then(console.log)
.catch(console.error);
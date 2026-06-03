import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// प्रतिशत अनुसार वर्गीकरण
function classify(score) {
  if (score >= 90) return "उत्कृष्ट";
  if (score >= 75) return "राम्रो";
  if (score >= 60) return "सुधार आवश्यक";
  if (score >= 40)
    return "गम्भीर रूपमा समीक्षा गरी सुधार गर्नुपर्ने देखिएको";

  return "तत्काल हस्तक्षेपको आवश्यकता";
}


// प्रतिशत निकाल्ने
function calculatePercentage(data) {
  let total = 0;
  let achieved = 0;

  Object.values(data).forEach(v => {
    if (
      typeof v === "object" &&
      v.score !== undefined &&
      v.max !== undefined
    ) {
      achieved += Number(v.score);
      total += Number(v.max);
    }
  });

  if (total === 0) return 0;

  return Number(((achieved / total) * 100).toFixed(2));
}


// AI विश्लेषण
async function generateAnalysis(input) {

  const officeScore =
    calculatePercentage(input.officeMonitoring);

  const timeScore =
    calculatePercentage(input.timeDressMonitoring);

  const surveyScore =
    calculatePercentage(input.serviceSurvey);

  const overall =
    (
      officeScore +
      timeScore +
      surveyScore
    ) / 3;

  const level = classify(overall);

  const model =
    genAI.getGenerativeModel({
      model: "gemini-2.5-flash"
    }, { apiVersion: "v1beta" });

  const prompt = `

तपाईं सार्वजनिक सेवा तथा सुशासन अनुगमन विश्लेषक हुनुहुन्छ।

निम्न क्षेत्रको नतिजाको प्रशासनिक भाषामा नेपालीमा विश्लेषण गर्नुहोस्।

क्षेत्र:
${input.location.level}
नाम:
${input.location.name}

नियम:
- तथ्यमा आधारित विश्लेषण
- अनुमान नगर्ने
- सुधार सुझाव दिने
- अनुगमन निष्कर्ष स्पष्ट लेख्ने

वर्गीकरण नियम:
९०+ → उत्कृष्ट
७५–८९ → राम्रो
६०–७४ → सुधार आवश्यक
४०–५९ → गम्भीर रूपमा समीक्षा गरी सुधार गर्नुपर्ने देखिएको
४० भन्दा कम → तत्काल हस्तक्षेपको आवश्यकता

डेटा:

कार्यालय अनुगमन:
${JSON.stringify(input.officeMonitoring)}

समय/पोशाक:
${JSON.stringify(input.timeDressMonitoring)}

सेवाग्राही सर्वेक्षण:
${JSON.stringify(input.serviceSurvey)}

गणना गरिएको अवस्था:
कार्यालय = ${officeScore}%
समय/पोशाक = ${timeScore}%
सेवाग्राही = ${surveyScore}%
समग्र = ${overall.toFixed(2)}%
श्रेणी = ${level}

निम्न शीर्षकमा विश्लेषण लेख:

१. समग्र अवस्था
२. कार्यालय अनुगमन विश्लेषण
३. समय/पोशाक विश्लेषण
४. सेवाग्राही सर्वेक्षण विश्लेषण
५. मुख्य समस्या
६. सुधारका सुझाव
७. निष्कर्ष
८. अन्तिम वर्गीकरण

भाषा: नेपाली
शैली: प्रशासनिक र औपचारिक
`;

  const result =
    await model.generateContent(prompt);

  return {
    overallScore:
      overall.toFixed(2),

    classification:
      level,

    analysis:
      result.response.text()
  };
}



// उदाहरण
const monitoringData = {

  location: {
    level: "स्थानीय तह",
    name: "जनकपुर उपमहानगरपालिका"
  },

  officeMonitoring: {

    citizenCharter: {
      score: 85,
      max: 100
    },

    employeePresence: {
      score: 80,
      max: 100
    },

    serviceDelivery: {
      score: 72,
      max: 100
    },

    transparency: {
      score: 90,
      max: 100
    }
  },

  timeDressMonitoring: {

    attendance: {
      score: 78,
      max: 100
    },

    dressCode: {
      score: 65,
      max: 100
    }
  },

  serviceSurvey: {

    satisfaction: {
      score: 81,
      max: 100
    },

    timelyService: {
      score: 70,
      max: 100
    },

    behavior: {
      score: 88,
      max: 100
    }
  }
};



generateAnalysis(monitoringData)
.then(r => {
  console.log(r.classification);
  console.log(r.analysis);
})
.catch(console.error);
// Google Apps Script Web App URL (Replace with actual deployed URL)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx5-oHyGtN-I7IrNETtnhPhEVrIxj02p7nF4vAjN7z8KPV-OT-UySJbZP9ZJO7ThWQp/exec"; 
let allSubmissions = [];
let allMonitorings = []; // अनुगमन डाटाको लागि
let allAttendanceMonitorings = []; // समय पालना/पोशाक डाटाको लागि
let currentFilteredMonitorings = []; // डाउनलोडका लागि हाल फिल्टर गरिएको डाटा राख्न
let currentFilteredAttendance = []; // एटेन्डेन्स डाउनलोडका लागि डाटा राख्न
let currentDashboardView = 'survey'; // 'survey', 'monitoring', 'attendance'

// चार्ट अब्जेक्टहरूलाई ग्लोबल रूपमा डिक्लेयर गरिएको (ReferenceError हटाउन)
let genderChartObj = null, satisfactionChartObj = null, ghusChartObj = null, devChartObj = null, dynamicChartObj = null, topUnsatisfiedChartObj = null, topSatisfiedChartObj = null;
let charterClarityChartObj = null, attendanceChartObj = null, brokerChartObj = null, facilitiesChartObj = null, staffingChartObj = null, vacantByProvinceChartObj = null, provStaffingComparisonChartObj = null;
// नयाँ अनुगमन चार्ट अब्जेक्टहरू
let websiteChartObj = null, disclosureChartObj = null, autoInfoChartObj = null, workroomChartObj = null, infoBoardChartObj = null, cleaningChartObj = null;
let attendanceViolationChartObj = null;

// Province, District, and Municipality Data
const PROVINCE = {
    1: 'कोशी प्रदेश',
    2: 'मधेश प्रदेश',
    3: 'बागमती प्रदेश',
    4: 'गण्डकी प्रदेश',
    5: 'लुम्बिनी प्रदेश',
    6: 'कर्णाली प्रदेश',
    7: 'सुदूरपश्चिम प्रदेश'
};

const DISTRICTS = {
    1: ["इलाम", "झापा", "ताप्लेजुङ", "पाँचथर", "ओखलढुङ्गा", "खोटाङ", "सोलुखुम्बु", "सुनसरी", "तेह्रथुम", "संखुवासभा", "भोजपुर", "धनकुटा", "मोरङ", "उदयपुर"],
    2: ["सप्तरी", "सिरहा", "धनुषा", "महोत्तरी", "सर्लाही", "रौतहट", "बारा", "पर्सा"],
    3: ["सिन्धुपाल्चोक", "चितवन", "मकवानपुर", "भक्तपुर", "ललितपुर", "काठमाडौं", "नुवाकोट", "रसुवा", "धादिङ", "काभ्रेपलाञ्चोक", "सिन्धुली", "रामेछाप", "दोलखा"],
    4: ["गोरखा", "कास्की", "तनहुँ", "लमजुङ", "स्याङ्जा", "मनाङ", "मुस्ताङ", "बागलुङ", "पर्वत", "म्याग्दी", "नवलपरासी (बर्दघाट सुस्ता पूर्व)"],
    5: ["गुल्मी", "पाल्पा", "रुपन्देही", "कपिलवस्तु", "नवलपरासी (बर्दघाट सुस्ता पश्चिम)", "अर्घाखाँची", "बाँके", "बर्दिया", "दाङ", "रुकुम (पूर्व)", "रोल्पा", "प्युठान"],
    6: ["कालिकोट", "दैलेख", "जाजरकोट", "डोल्पा", "हुम्ला", "जुम्ला", "मुगु", "रुकुम (पश्चिम)", "सल्यान", "सुर्खेत"],
    7: ["कैलाली", "अछाम", "डोटी", "बझाङ", "बाजुरा", "दार्चुला", "डडेल्धुरा", "बैतडी", "कञ्चनपुर"]
};

/**
 * डाटा अब्जेक्टबाट सही भ्यालू (Value) खोज्ने फङ्सन (Smart Mapping)
 * गुगल सीटका हेडरहरू र कोडका की (Key) हरू नमिल्दा यो प्रयोग गरिन्छ।
 */
function getVal(obj, field, label) {
    if (!obj) return "";
    // १. सिधै की (key) बाट खोज्ने
    if (obj[field] !== undefined && obj[field] !== null && obj[field] !== "") return obj[field];
    // २. लेबल (label) बाट खोज्ने
    if (obj[label] !== undefined && obj[label] !== null && obj[label] !== "") return obj[label];
    
    const keys = Object.keys(obj);
    // ३. अनावश्यक चिन्हहरू हटाएर तुलना गर्ने (Resilient Matching)
    const clean = (s) => String(s || "").replace(/[\s.०-९?？।()\/\\-]|बारेमा|सम्बन्धमा|सम्बन्धी/g, '').toLowerCase();
    const cleanLabel = clean(label);
    const cleanField = clean(field);

    let found = keys.find(k => {
        const ck = clean(k);
        if (cleanField && ck.includes(cleanField)) return true;
        if (!cleanLabel) return false;
        // मुख्य शब्दहरू (Start/End) भिडाउने ताकि बीचमा थप शब्द भए पनि मिलोस्
        if (cleanLabel.length > 8) {
            return ck.includes(cleanLabel.substring(0, 5)) && ck.includes(cleanLabel.substring(cleanLabel.length - 4));
        }
        return ck.includes(cleanLabel) || cleanLabel.includes(ck);
    });
    
    return found ? obj[found] : "";
}

const MUNICIPALITIES = {
    1: {
        "ताप्लेजुङ": ["आठराई त्रिवेणी", "सिदिङ्वा", "फक्ताङलुङ", "मिक्वाखोला", "मेरिङ्देन", "मैवाखोला", "पाथीभरा याङवरक", "सिरिजङ्घा", "फुङलिङ"],
        "भोजपुर": ["आमचोक", "अरुण", "भोजपुर", "हतुवागढी", "पौवाडुङ्मा", "रामप्रसाद", "सालपसिलिछो", "षडानन्द", "टेम्केमाइयुङ"],
        "धनकुटा": ["चौबिसे", "छथर जोरपाटी", "धनकुटा", "महालक्ष्मी", "पाखरिबास", "साँगुरीगढी", "शहिदभूमि"],
        "इलाम": ["चुलाचुली", "देउमाई", "फाकफोक्थुम", "इलाम", "माई", "माइजोगमाई", "मङ्गेबुङ", "रोङ", "सन्दकपुर", "सूर्योदय"],
        "झापा": ["अर्जुनधारा", "बाह्रदशी", "भद्रपुर", "बिर्तामोड", "बुद्धशान्ति", "दमक", "गौराधा", "गौरीगञ्ज", "हल्दिबारी", "झापा", "कचनकवल", "कमल", "कनकाई", "मेचीनगर", "शिवसताक्सी"],
        "खोटाङ": ["ऐसेलुखर्क", "बराहपोखरी", "दिक्तेल रुपाकोट मझुवागढी", "डिप्रुङ", "हलेसी तुवाचुङ", "जानतेढुङ्गा", "केपिलासगढी", "खोटेहाङ", "रवा बेसी", "साकेला"],
        "मोरङ": ["बेलबारी", "विराटनगर", "बुढीगंगा", "धनपालथान", "ग्रामथान", "जहादा", "कानेपोखरी", "कटहरी", "केराबारी", "लेटाङ", "मिक्लाजुङ", "पथरी शनिश्चरे", "रंगेली", "रतुवामाई", "सुन्दरहरैचा", "सुनवर्शी", "उरालाबारी"],
        "ओखलढुङ्गा": ["चम्पादेवी", "चिसंखुगढी", "खिजिदेम्बा", "लिखु", "मानेभञ्ज्याङ", "मोलुङ", "सिद्धिचरण", "सुनकोशी"],
        "पाँचथर": ["फालेलुङ", "फाल्गुनन्द", "हिलिहाङ", "कुमायक", "मिक्लाजुङ", "फिदिम", "तुम्बेवा", "याङ्गवारक"],
        "संखुवासभा": ["भोटखोला", "चैनपुर", "चिचिला", "धर्मदेवी", "खाँदबारी", "माडी", "मकालु", "पञ्चखापन", "सभापोखरी", "सिलिचङ"],
        "सोलुखुम्बु": ["खुम्बुपसङ्लाहमु", "लिखुपिके", "माप्या दुधकोशी", "महाकुलुङ", "नेचासल्यान", "सोलुदुधकुण्ड", "खोटाङ", "थुलुङ दुधकोशी"],
        "तेह्रथुम": ["आठराई", "छथर", "लालीगुराँस", "मेन्चायम", "म्याङलुङ", "फेडाप"],
        "सुनसरी": ["बराहक्षेत्र", "बर्जु", "भोक्राहा नरसिङ्ग", "देवानगन्ज", "धरान", "दुहबी", "गढी", "हरिनगर", "इनरुवा", "इटहरी", "कोशी", "रामधुनी"],
        "उदयपुर": ["बेलका", "चौदण्डीगढी", "कटारी", "लिम्चुङबुङ", "रौतामाई", "तापली", "त्रियुगा", "उदयपुरगढी"]
    },
    2: {
        "सप्तरी": ["अग्निशैर कृष्ण सावरण", "बालन बिहुल", "विष्णुपुर", "बोदे बरसाइन", "छिन्नमस्ता", "डाक्नेश्वरी", "हनुमाननगर कंकालिनी", "कञ्चनरुप", "खडक", "महादेव", "राजविराज", "राजगढ", "रुपानी", "सप्तकोशी", "शम्भुनाथ", "सुरुङ्गा", "तिलाठी कोइलाडी", "तिराहुत"],
        "सिरहा": ["अर्नामा", "औरही", "बरियारपट्टी", "भगवानपुर", "विष्णुपुर", "धनगढीमाई", "गोलबजार", "कल्याणपुर", "कर्जन्हा", "लहान", "लक्ष्मीपुर पटारी", "मिर्चैया", "नरहा", "नवराजपुर", "सखुवानङ्करकट्टी", "सिरहा", "सुखीपुर"],
        "धनुषा": ["औराही", "बटेश्वर", "बिदेह", "क्षिरेश्वरनाथ", "धनौजी", "धनुषाधाम", "गणेशमान चारनाथ", "हंसपुर", "जनकनन्दनी", "जनकपुरधाम", "कमला", "लक्ष्मीनिया", "मिथिला", "मिथिला बिहारी", "मुखियापट्टी मुसरमिया", "नगराई", "सबैला", "सहिदनगर"],
        "महोत्तरी": ["औरही", "बलवा", "बर्दिवास", "भङ्गाहा", "एकडारा", "गौशाला", "जलेश्वर", "लोहारपट्टी", "महोत्तरी", "मनरा सिसवा", "मटिहानी", "पिपरा", "रामगोपालपुर", "सम्सी", "सोनामा"],
        "सर्लाही": ["बागमती", "बलरा", "बराहथवा", "बासबरिया", "विष्णु", "ब्रम्हपुरी", "चक्रघट्टा", "चन्द्रनगर", "धनकौल", "गोदैता", "हरिपुर", "हरिपुरवा", "हरिवान", "ईश्वरपुर", "कबिलासी", "कौडेना", "लालबन्दी", "मलङ्गवा", "पर्सा", "रामनगर"],
        "बारा": ["आदर्श कोतवाल", "बारागढी", "बिश्रामपुर", "देवताल", "जितपुरसिमारा", "कलैया", "करैयामाई", "कोल्हबी", "महागढीमाई", "निजगढ", "पचरौता", "परवानीपुर", "फेटा", "प्रसौनी", "सिम्रौनगढ", "सुवर्ण"],
        "पर्सा": ["बहुदरमाई", "बिन्दवासिनी", "वीरगन्ज", "छिपहरमाई", "धोबिनी", "जगरनाथपुर", "जिराभवानी", "कालिकामाई", "पकाहा मैनपुर", "पर्सागढी", "पर्टेवा सुगौली", "पोखरिया", "सखुवा प्रसौनी", "ठोरी"],
        "रौतहट": ["बौधिमाई", "वृन्दाबन", "चन्द्रपुर", "देवाही गोनाही", "दुर्गा भगवती", "गढीमाई", "गरुड", "गौर", "गुजरा", "ईशनाथ", "कटहरिया", "माधव नारायण", "मौलापुर", "पारोहा", "विजयपुर फतुवा", "राजदेवी", "राजपुर", "यमुनामाई"]
    },
    3: {
        "भक्तपुर": ["भक्तपुर", "चाँगुनारायण", "मध्यपुरथिमि", "सूर्यविनायक"],
        "चितवन": ["भरतपुर", "इच्छाकामना", "कालिका", "खैरहनी", "माडी", "राप्ती", "रत्ननगर"],
        "धादिङ": ["बेनिघाट रोराङ", "धुनिबेसी", "गजुरी", "गल्छी", "गंगाजमुना", "ज्वालामुखी", "खनियाबास", "नेत्रावती डब्जोङ", "नीलकण्ठ", "रुबी उपत्यका", "सिद्धलेक", "ठाकरे", "त्रिपुरा सुन्दरी"],
        "दोलखा": ["बैतेश्वर", "भीमेश्वर", "बिगु", "गौरीशंकर", "जिरी", "कालिञ्चोक", "मेलुङ", "सैलुङ", "तामाकोशी"],
        "काठमाडौं": ["बुढानिलकण्ठ", "चन्द्रागिरि", "दक्षिणकाली", "गोकर्णेश्वर", "कागेश्वरी मनहोरा", "काठमाडौं", "कीर्तिपुर", "नागार्जुन", "शंखरापुर", "तारकेश्वर", "टोखा"],
        "काभ्रेपलाञ्चोक": ["बनेपा", "बेथानचोक", "भुम्लु", "चौरीदेउराली", "धुलिखेल", "खानीखोला", "महाभारत", "मण्डनदेउपुर", "नमोबुद्ध", "पनौती", "पाँचखाल", "रोशी", "तेमल"],
        "ललितपुर": ["बागमती", "गोदावरी", "कोन्ज्योसोम", "ललितपुर", "महालक्ष्मी", "महांकाल"],
        "नुवाकोट": ["बेलकोटगढी", "बिदुर", "दुप्चेश्वर", "ककनी", "किस्पाङ", "लिखु", "म्यागाङ", "पञ्चकन्या", "शिवपुरी", "सुर्यगढी", "ताडी", "तारकेश्वर"],
        "रामेछाप": ["दोरम्बा", "गोकुलगंगा", "खाडादेवी", "लिखु तामाकोशी", "मन्थली", "रामेछाप", "सुनापति", "उमाकुण्ड"],
        "रसुवा": ["अमाकोडिङमो", "गोसाइकुण्ड", "कालिका", "नौकुण्ड", "उत्तरगया"],
        "सिन्धुली": ["दुधौली", "घाङ्लेख", "गोलन्जोर", "हरिहरपुरगढी", "कमलामाई", "मरिन", "फिक्कल", "सुनकोशी", "तिनपाटन"],
        "सिन्धुपाल्चोक": ["बलेफी", "बाह्रबिसे", "भोटेकोशी", "चौतारा साँगाचोकगढी", "हेलम्बु", "इन्द्रावती", "जुगल", "लिसाङ्खु", "मेलम्ची", "पाँचपोखरी थाङ्पाल", "सुनकोशी", "त्रिपुरासुन्दरी"]
    },
    4: {
        "बागलुङ": ["बडिगाड", "बागलुङ", "बरेङ", "ढोरपाटन", "गलकोट", "जैमुनी", "कान्ठेखोला", "निसिखोला", "तमान खोला", "तारा खोला"],
        "गोरखा": ["आरुघाट", "अजिरकोट", "बारपाक सुलिकोट", "भीमसेनथापा", "चुम नुब्रि", "धार्चे", "गण्डकी", "गोरखा", "पालुङटार", "सहिद लखन", "सिरञ्चोक"],
        "कास्की": ["अन्नपूर्ण", "माछापुच्छ्रे", "माडी", "पोखरा", "रुपा"],
        "लमजुङ": ["बेशिशहर", "दोर्दी", "दूधपोखरी", "क्वालासोथर", "मध्यनेपाल", "मर्स्याङ्दी", "रैनास", "सुन्दरबजार"],
        "मनाङ": ["चामे", "मनाङ इङ्स्याङ", "नरपा भूमि", "नरशोन"],
        "मुस्ताङ": ["घरापझोङ", "लो घेकर दामोदरकुण्ड", "लोमान्थाङ", "थासाङ", "वारागुङ मुक्तिक्षेत्र"],
        "म्याग्दी": ["अन्नपूर्ण", "बेनी", "धौलागिरी", "मालिका", "मंगला", "रघुगंगा"],
        "नवलपरासी (बर्दघाट सुस्ता पूर्व)": ["बौदेकाली", "बिनयी", "बुलिङटार", "देवचुली", "गैंडाकोट", "हुप्सेकोट", "कावासोती", "मध्यविन्दु"],
        "पर्वत": ["बिहादी", "जलजला", "कुश्मा", "महाशिला", "मोदी", "पाइन्यु", "फलेबास"],
        "स्याङ्जा": ["आँधीखोला", "अर्जुनचौपरी", "भिरकोट", "बिरुवा", "चापाकोट", "गल्याङ", "हरिनास", "कालीगण्डगी", "फेदीखोला", "पुतलीबजार", "वालिङ"],
        "तनहुँ": ["आँबुखैरेनी", "बन्दीपुर", "भानु", "भीमाद", "ब्यास", "देवघाट", "घिरिङ", "म्याग्दे", "रिसिङ", "शुक्लागण्डकी"]
    },
    5: {
        "अर्घाखाँची": ["भुमिकास्थान", "छत्रदेव", "मलारानी", "पाणिनी", "सन्धिखर्क", "सितगंगा"],
        "बाँके": ["बैजनाथ", "डुडुवा", "जानकी", "खजुरा", "कोहलपुर", "नरैनापुर", "नेपालगन्ज", "राप्ती सोनारी"],
        "बर्दिया": ["बढैयाताल", "बाँसगढी", "बारबर्दिया", "गेरुवा", "गुलरिया", "मधुवन", "राजापुर", "ठाकुरबाबा"],
        "दाङ": ["बबई", "बंगलाचुली", "दंगिशरण", "गढवा", "घोराही", "लमही", "राजपुर", "राप्ती", "शान्तिनगर", "तुलसीपुर"],
        "गुल्मी": ["चन्द्रकोट", "छत्रकोट", "गुल्मीदरबार", "इस्मा", "कालीगण्डकी", "मदाने", "मलिका", "मुसिकोट", "रेसुंगा", "रुरु", "सत्यवती"],
        "कपिलवस्तु": ["बाणगंगा", "विजयनगर", "बुद्धभूमि", "कपिलवस्तु", "कृष्णनगर", "महाराजगन्ज", "मायादेवी", "शिवराज", "शुद्धोधन", "यशोधरा"],
        "नवलपरासी (बर्दघाट सुस्ता पश्चिम)": ["बर्दघाट", "पाल्हीनन्दन", "प्रतापपुर", "रामग्राम", "सरवल", "सुनवल", "सुस्ता"],
        "पाल्पा": ["बगनासकाली", "माथागढी", "निस्दी", "पूर्वखोला", "रैनादेवी", "रम्भा", "रामपुर", "रिब्दीकोट", "तानसेन", "तिनाउ"],
        "प्युठान": ["ऐरावती", "गौमुखी", "झिमरुक", "मालारानी", "माण्डवी", "नौबहिनी", "प्युठान", "सरूमारानी", "स्वर्गद्वारी"],
        "रोल्पा": ["गंगादेव", "लुङ्गरी", "माडी", "परिवर्तन", "रोल्पा", "रुन्टीगढी", "सुनछहरी", "सुनिल स्मृति", "थवाङ", "त्रिवेणी"],
        "रुकुम (पूर्व)": ["भुमे", "पुथा उत्तरगंगा", "सिस्ने"],
        "रुपन्देही": ["बुटवल", "देवदह", "गैडहवा", "कञ्चन", "कोटाहिमाई", "लुम्बिनी साँस्कृतिक", "मार्चवारी", "मायादेवी", "ओमसतिया", "रोहिणी", "सैनामैना", "समरीमाइ", "सिद्धार्थनगर", "सियारी", "शुद्धोधन", "तिलोत्तमा"]
    },
    6: {
        "दैलेख": ["आठबिस", "भगवतीमाई", "भैरवी", "चामुण्डा बिन्द्रसैनी", "दुल्लु", "डुङ्गेश्वर", "गुराँस", "महाबु", "नारायण", "नौमुले", "ठान्टिकाण्ड"],
        "डोल्पा": ["छर्का ताङसोङ", "डोल्पो बुद्ध", "जगदुल्ला", "काइके", "मुड्केचुला", "शे फोक्सुण्डो", "ठुली भेरी", "त्रिपुरासुन्दरी"],
        "हुम्ला": ["अडांचुली", "चनखेली", "खार्पुनाथ", "नम्खा", "सार्केगड", "सिमकोट", "तान्जाकोट"],
        "जाजरकोट": ["बारेकोट", "भेरी", "छेडागढ", "जुनिचन्दे", "कुसे", "नालागड", "शिवालय"],
        "जुम्ला": ["चन्दननाथ", "गुठीचौर", "हिमा", "कनकसुन्दरी", "पत्रासी", "सिन्जा", "तातोपानी", "तिला"],
        "कालिकोट": ["खंडचक्र", "महावाई", "नरहरिनाथ", "पाँचलझरना", "पलाटा", "रास्कोट", "सन्नी त्रिवेणी", "शुभ कालिका", "तिलागुफा"],
        "मुगु": ["छायानाथ रारा", "खत्याड", "मुगुम कर्मारोङ", "सोरु"],
        "रुकुम (पश्चिम)": ["आठबिस्कोट", "बनफिकोट", "चौरजहारी", "मुसिकोट", "सानी भेरी", "त्रिवेणी"],
        "सल्यान": ["बागचौर", "बांगड", "छत्रेश्वरी", "डार्मा", "कालीमाटी", "कपुरकोट", "कुमाख", "शारदा", "सिद्ध कुमाख", "त्रिवेणी"],
        "सुर्खेत": ["बराहताल", "भेरीगंगा", "वीरेन्द्रनगर", "चौकुने", "चिंगाड", "गुर्भाकोट", "लेकबेशी", "पञ्चपुरी", "सिम्ता"]
    },
    7: {
        "अछाम": ["बान्नीगढी", "चौरपाटी", "ढकारी", "कमलबजार", "मंगलसेन", "मेल्लेख", "पञ्चदेवल विनायक", "रामरोशन", "साँफेबगर", "तुर्मखाड"],
        "बैतडी": ["दशरथचन्द", "डिलासैनी", "दोगडाकेदार", "मेलौली", "पञ्चेश्वर", "पाटन", "पुर्चौडी", "शिवनाथ", "सिगास", "सुर्नाया"],
        "बझाङ": ["बिठाडचिर", "बुंगल", "चाबिस्पाथीवेरा", "दुर्गाथली", "जय पृथ्वी", "केदारसेउ", "खप्तडछन्ना", "मस्त", "साइपाल", "सुर्मा", "तालकोट", "थालारा"],
        "बाजुरा": ["बडिमालिका", "बुढीगंगा", "बुढीनन्द", "गौमुल", "हिमाली", "जगन्नाथ", "खप्तड छेडेदह", "स्वामी कार्तिक खापर", "त्रिवेणी"],
        "डडेल्धुरा": ["अजयमेरु", "अलिताल", "अमरगढी", "भागेश्वर", "गणयपधुरा", "नवदुर्गा", "परशुराम"],
        "दार्चुला": ["एपिहिमल", "ब्यास", "दुन्हु", "लेकम", "महाकाली", "मालिकार्जुन", "मर्मा", "नौगाड", "शैल्यशिखर"],
        "डोटी": ["आदर्श", "बडीकेदार", "दिपायल सिलगढी", "जोरयाल", "के आई सिंह", "पूर्वचौकी", "सायल", "शिखर"],
        "कैलाली": ["बर्दगोरिया", "भजनी", "चुरे", "धनगढी", "गौरीगंगा", "घोडाघोडी", "गोदावरी", "जानकी", "जोशीपुर", "कैलारी", "लम्कीचुहा", "मोहन्याल", "टीकापुर"],
        "कञ्चनपुर": ["बेदकोट", "बेलौरी", "बेलडाँडी", "भीमदत्त", "कृष्णपुर", "लालझण्डी", "महाकाली", "पुनर्वास", "शुक्लाफाँटा"]
    }
};

// शब्द गणना गर्ने फङ्सन
function countWords(str) {
    return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

const NEPALI_DIGITS = ['०','१','२','३','४','५','६','७','८','९'];
const BS_MONTHS = ["बैशाख", "जेठ", "असार", "श्रावण", "भाद्र", "आश्विन", "कार्तिक", "मंसिर", "पौष", "माघ", "फाल्गुन", "चैत्र"];
const NEPALI_MONTH_LENGTHS = [31, 31, 31, 31, 31, 30, 30, 30, 29, 30, 29, 30];
const NEPALI_PICKER_YEAR_RANGE = { start: 2070, end: 2090 };

function toNepaliDigits(value) {
    return String(value).split("").map(ch => {
        if (ch >= '0' && ch <= '9') return NEPALI_DIGITS[ch];
        return ch;
    }).join("");
}

function fromNepaliDigits(text) {
    if (!text) return text;
    return String(text).split("").map(ch => {
        const index = NEPALI_DIGITS.indexOf(ch);
        return index >= 0 ? String(index) : ch;
    }).join("");
}

function formatNepaliDateParts(year, month, day) {
    return `${toNepaliDigits(year)} ${BS_MONTHS[month - 1]} ${toNepaliDigits(day)}`;
}

function parseNepaliDateString(nepStr) {
    if (!nepStr || typeof nepStr !== 'string') return null;
    const pieces = nepStr.trim().split(/\s+/);
    if (pieces.length < 3) return null;
    const dayText = pieces.pop();
    const monthName = pieces.pop();
    const yearText = pieces.join(' ');
    const year = Number(fromNepaliDigits(yearText));
    const day = Number(fromNepaliDigits(dayText));
    const month = BS_MONTHS.indexOf(monthName) + 1;
    if (!year || !month || !day) return null;
    return { year, month, day };
}

function getDaysInNepaliMonth(monthIndex) {
    return NEPALI_MONTH_LENGTHS[monthIndex] || 30;
}

function getFormattedNepaliDate(dateStr) {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split("-").map(Number);
        if (!y || !m || !d) return dateStr;
        return formatNepaliDateParts(y, m, d);
    }
    return dateStr;
}

function getStandardDate(nepStr) {
    if (!nepStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(nepStr)) return nepStr;
    const parsed = parseNepaliDateString(nepStr);
    if (!parsed) return nepStr;
    const month = String(parsed.month).padStart(2, '0');
    const day = String(parsed.day).padStart(2, '0');
    return `${parsed.year}-${month}-${day}`;
}

function estimateCurrentBsDate() {
    // आजको वास्तविक मिति: २०८३ जेठ ३ (May 17, 2026)
    
    const today = new Date();
    const anchorAD = new Date(2026, 4, 17); // मे १७, २०२६ (JS मा मे को इन्डेक्स ४ हुन्छ)
    const anchorBS = { year: 2083, month: 2, day: 3 }; // जेठ ३, २०८३

    const msPerDay = 24 * 60 * 60 * 1000;
    // समय हटाएर केवल दिनको फरक गणना गर्ने
    const diffDays = Math.round((new Date(today).setHours(0,0,0,0) - new Date(anchorAD).setHours(0,0,0,0)) / msPerDay);

    let y = anchorBS.year;
    let m = anchorBS.month;
    let d = anchorBS.day + diffDays;

    if (d > 0) {
        while (d > getDaysInNepaliMonth(m - 1)) {
            d -= getDaysInNepaliMonth(m - 1);
            m++;
            if (m > 12) { m = 1; y++; }
        }
    } else {
        while (d <= 0) {
            m--;
            if (m <= 0) { m = 12; y--; }
            d += getDaysInNepaliMonth(m - 1);
        }
    }
    return { year: y, month: m, day: d };
}

function setTodayNepaliDate() {
    const today = estimateCurrentBsDate();
    const formatted = formatNepaliDateParts(today.year, today.month, today.day);

    const dateFieldIds = ["survey_date"]; 
    dateFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = formatted;
    });
}

function createNepaliPickerOverlay() {
    if (document.getElementById('nepaliPickerOverlay')) return document.getElementById('nepaliPickerOverlay');
    const overlay = document.createElement('div');
    overlay.id = 'nepaliPickerOverlay'; // Keep ID for JS reference
    overlay.className = 'nepali-picker-overlay'; // Add class for CSS styling
    // Position, z-index, and display need to be inline for dynamic control by JS
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'none';
    overlay.innerHTML = `
        <div class="nepali-picker-select-group">
            <select id="nepaliPickerYear"></select>
            <select id="nepaliPickerMonth"></select>
            <select id="nepaliPickerDay"></select>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" id="nepaliPickerCancel" style="padding:10px 14px; border:1px solid #dfe4ea; border-radius:10px; background:#f5f7fb; cursor:pointer;">रद्द गर्नुहोस्</button>
            <button type="button" id="nepaliPickerApply" style="padding:10px 14px; border:none; border-radius:10px; background:#387ae6; color:#ffffff; cursor:pointer;">छान्नुहोस्</button>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

let currentNepaliPickerTarget = null;

function updateNepaliPickerOptions() {
    const overlay = document.getElementById('nepaliPickerOverlay');
    if (!overlay) return;
    const yearSelect = overlay.querySelector('#nepaliPickerYear');
    const monthSelect = overlay.querySelector('#nepaliPickerMonth');
    const daySelect = overlay.querySelector('#nepaliPickerDay');
    const selectedMonth = Number(monthSelect.value) - 1;
    const days = getDaysInNepaliMonth(selectedMonth);
    daySelect.innerHTML = '';
    for (let i = 1; i <= days; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = toNepaliDigits(i);
        daySelect.appendChild(option);
    }
}

function showNepaliDatePicker(input) {
    currentNepaliPickerTarget = input;
    const overlay = createNepaliPickerOverlay();
    const rect = input.getBoundingClientRect();
    overlay.style.top = `${rect.bottom + window.scrollY + 8}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.display = 'block';

    const yearSelect = overlay.querySelector('#nepaliPickerYear');
    const monthSelect = overlay.querySelector('#nepaliPickerMonth');
    const daySelect = overlay.querySelector('#nepaliPickerDay');

    yearSelect.innerHTML = '';
    for (let year = NEPALI_PICKER_YEAR_RANGE.start; year <= NEPALI_PICKER_YEAR_RANGE.end; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = toNepaliDigits(year);
        yearSelect.appendChild(option);
    }
    monthSelect.innerHTML = '';
    BS_MONTHS.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.textContent = name;
        monthSelect.appendChild(option);
    });

    let selected = parseNepaliDateString(input.value) || estimateCurrentBsDate();
    yearSelect.value = selected.year;
    monthSelect.value = selected.month;
    updateNepaliPickerOptions();
    daySelect.value = selected.day;

    yearSelect.onchange = updateNepaliPickerOptions;
    monthSelect.onchange = updateNepaliPickerOptions;
    document.getElementById('nepaliPickerApply').onclick = () => {
        const year = Number(yearSelect.value);
        const month = Number(monthSelect.value);
        const day = Number(daySelect.value);
        input.value = formatNepaliDateParts(year, month, day);
        hideNepaliDatePicker();
    };
    document.getElementById('nepaliPickerCancel').onclick = hideNepaliDatePicker;

    setTimeout(() => {
        document.addEventListener('click', handleNepaliPickerOutsideClick);
    }, 0);
}

function hideNepaliDatePicker() {
    const overlay = document.getElementById('nepaliPickerOverlay');
    if (overlay) overlay.style.display = 'none';
    document.removeEventListener('click', handleNepaliPickerOutsideClick);
}

function handleNepaliPickerOutsideClick(event) {
    const overlay = document.getElementById('nepaliPickerOverlay');
    if (!overlay) return;
    if (currentNepaliPickerTarget && currentNepaliPickerTarget.contains(event.target)) return;
    if (overlay.contains(event.target)) return;
    hideNepaliDatePicker();
}

function populateProvinces() {
    const pradeshSelects = [document.getElementById("pradesh"), document.getElementById("filterPradesh"), document.getElementById("m_pradesh"), document.getElementById("a_pradesh")];
    pradeshSelects.forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '<option value="">प्रदेश छान्नुहोस्</option>'; // Clear existing options and add a default
        for (const [id, name] of Object.entries(PROVINCE)) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = name;
            sel.appendChild(option);
        }
    });
}

// Update Districts based on Province
function updateDistricts(pId, jId, sId) {
    const pradeshId = document.getElementById(pId).value;
    const jillaSelect = document.getElementById(jId);
    const sthaaniyaSelect = document.getElementById(sId);

    jillaSelect.innerHTML = '<option value="">जिल्ला छान्नुहोस्</option>';
    sthaaniyaSelect.innerHTML = '<option value="">स्थानीय तह छान्नुहोस्</option>';

    if (pradeshId && DISTRICTS[pradeshId]) {
        DISTRICTS[pradeshId].forEach(district => {
            const option = document.createElement("option");
            option.value = district;
            option.textContent = district;
            jillaSelect.appendChild(option);
        });
    }
}

// Update Municipalities based on District
function updateMunicipalities(pId, jId, sId) {
    const pradeshId = document.getElementById(pId).value;
    const district = document.getElementById(jId).value;
    const sthaaniyaSelect = document.getElementById(sId);

    sthaaniyaSelect.innerHTML = '<option value="">स्थानीय तह छान्नुहोस्</option>';

    if (pradeshId && district && MUNICIPALITIES[pradeshId] && MUNICIPALITIES[pradeshId][district]) {
        MUNICIPALITIES[pradeshId][district].forEach(municipality => {
            const option = document.createElement("option");
            option.value = municipality;
            option.textContent = municipality;
            sthaaniyaSelect.appendChild(option);
        });
    }
}

// Dashboard Filter: Update Districts based on Province
function updateFilterDistricts() {
    const pradeshId = document.getElementById("filterPradesh").value;
    const jillaSelect = document.getElementById("filterDistrict");
    const sthaaniyaSelect = document.getElementById("filterSthaaniya");

    jillaSelect.innerHTML = '<option value="">सबै</option>';
    sthaaniyaSelect.innerHTML = '<option value="">सबै</option>';

    if (pradeshId && DISTRICTS[pradeshId]) {
        DISTRICTS[pradeshId].forEach(district => {
            const option = document.createElement("option");
            option.value = district;
            option.textContent = district;
            jillaSelect.appendChild(option);
        });
    }
}

// Dashboard Filter: Update Municipalities based on District
function updateFilterMunicipalities() {
    const pradeshId = document.getElementById("filterPradesh").value;
    const district = document.getElementById("filterDistrict").value;
    const sthaaniyaSelect = document.getElementById("filterSthaaniya");

    sthaaniyaSelect.innerHTML = '<option value="">सबै</option>';

    if (pradeshId && district && MUNICIPALITIES[pradeshId] && MUNICIPALITIES[pradeshId][district]) {
        MUNICIPALITIES[pradeshId][district].forEach(municipality => {
            const option = document.createElement("option");
            option.value = municipality;
            option.textContent = municipality;
            sthaaniyaSelect.appendChild(option);
        });
    }
}

// Initialize dropdowns and datepicker
document.addEventListener("DOMContentLoaded", function () {
    populateProvinces();
    document.getElementById("pradesh").addEventListener("change", () => updateDistricts("pradesh", "jilla", "sthaaniya_taha"));
    document.getElementById("jilla").addEventListener("change", () => updateMunicipalities("pradesh", "jilla", "sthaaniya_taha"));
    
    // Monitoring dropdowns
    document.getElementById("m_pradesh")?.addEventListener("change", () => updateDistricts("m_pradesh", "m_jilla", "m_sthaaniya"));
    document.getElementById("m_jilla")?.addEventListener("change", () => updateMunicipalities("m_pradesh", "m_jilla", "m_sthaaniya"));
    document.getElementById("a_pradesh")?.addEventListener("change", () => updateDistricts("a_pradesh", "a_jilla", "a_sthaaniya"));
    document.getElementById("a_jilla")?.addEventListener("change", () => updateMunicipalities("a_pradesh", "a_jilla", "a_sthaaniya"));
    
    // Attendance Monitoring dropdowns
    // populateProvinces(); // Redundant call, as it's called once above and the function now clears options
    addAttendanceRow(); // Initial row

    // विशिष्ट प्रश्न विश्लेषण (Dynamic Analysis) छनोट गर्दा ड्यासबोर्ड रिफ्रेस गर्ने
    document.getElementById("dynamicFieldSelector")?.addEventListener("change", refreshDashboard);

    document.getElementById("filterPradesh")?.addEventListener("change", updateFilterDistricts);
    document.getElementById("filterDistrict")?.addEventListener("change", updateFilterMunicipalities);

    // Nepali date picker initialization: plugin if available, else local fallback
    const nepaliFields = document.querySelectorAll('.nepali-datepicker');
    nepaliFields.forEach(field => {
        field.addEventListener('focus', () => showNepaliDatePicker(field));
        field.addEventListener('click', () => showNepaliDatePicker(field));
    });

    setTodayNepaliDate();
    // सन्तुष्टि वा असन्तुष्टि छान्दा सम्बन्धित कारणहरू मात्र देखाउने (Conditional Display)
const satisfactionInputs = document.querySelectorAll('[name="main_satisfaction"]');
    satisfactionInputs.forEach(input => {
        input.addEventListener("change", updateSatisfactionVisibility);
    });
    
    // सुरुमा दुबै सेक्सन लुकाउन वा अवस्था अनुसार देखाउन
    updateSatisfactionVisibility();
 // 'अन्य' विकल्पको लागि इभेन्ट लिसनर
    document.getElementById("pos_other_cb")?.addEventListener("change", function() { toggleOtherReason("pos_other_cb", "pos_other_text"); });
    document.getElementById("neg_other_cb")?.addEventListener("change", function() { toggleOtherReason("neg_other_cb", "neg_other_text"); });
    document.getElementById("yojana_other_cb")?.addEventListener("change", function() { toggleOtherReason("yojana_other_cb", "yojana_other_text"); });
   
    // वर्ड काउन्टरहरू सेटअप
    const countersToSetup = [
        { inputId: "pos_other_text", counterId: "pos_other_counter", limit: 20 },
        { inputId: "neg_other_text", counterId: "neg_other_counter", limit: 20 },
        { inputId: "yojana_other_text", counterId: "yojana_other_counter", limit: 20 },
        { inputId: "sujhaw", counterId: "sujhaw_counter", limit: 100 },
        { inputId: "m_office", counterId: "m_office_counter", limit: 20 },
        { inputId: "m_main_services", counterId: "m_main_services_counter", limit: 100 },
        { inputId: "m_problems", counterId: "m_problems_counter", limit: 100 },
        { inputId: "m_measures", counterId: "m_measures_counter", limit: 100 },
        { inputId: "m_comment", counterId: "m_comment_counter", limit: 150 }
    ];

    countersToSetup.forEach(item => {
        const el = document.getElementById(item.inputId);
        if (el) {
            el.addEventListener('input', () => updateWordCountDisplay(el, item.counterId, item.limit));
        }
    });

    // Add event listeners for chart type cycle buttons
    document.querySelectorAll('.chart-type-cycle-btn').forEach(button => {
        button.addEventListener('click', function() {
            const chartId = this.dataset.chartId;
            const currentType = chartTypes[chartId];
            const cycle = CHART_TYPE_CYCLES[chartId];
            const currentIndex = cycle.indexOf(currentType);
            const nextIndex = (currentIndex + 1) % cycle.length;
            chartTypes[chartId] = cycle[nextIndex];
            refreshDashboard(); // This will redraw all charts, including the one whose type changed
        });
    });
});

// Global Chart Type Storage
let chartTypes = {
    genderChart: 'bar',
    satisfactionChart: 'doughnut',
    ghusChart: 'pie',
    developmentChart: 'bar',
    topUnsatisfiedChart: 'bar',
    topSatisfiedChart: 'bar',
    dynamicChart: 'bar', // Default for dynamic chart
    charterClarityChart: 'bar',
    websiteChart: 'pie',
    disclosureChart: 'doughnut',
    autoInfoChart: 'pie',
    attendanceChart: 'doughnut',
    workroomChart: 'bar',
    infoBoardChart: 'pie',
    cleaningChart: 'bar',
    brokerChart: 'doughnut',
    vacantByProvinceChart: 'bar',
    provStaffingComparisonChart: 'bar',
    staffingChart: 'bar',
    facilitiesChart: 'bar'
};

// Define cycles for each chart
const CHART_TYPE_CYCLES = {
    genderChart: ['bar', 'pie', 'doughnut'],
    satisfactionChart: ['doughnut', 'pie', 'bar'],
    ghusChart: ['pie', 'doughnut', 'bar'],
    developmentChart: ['bar', 'pie', 'doughnut'],
    topUnsatisfiedChart: ['bar', 'pie', 'doughnut'],
    topSatisfiedChart: ['bar', 'pie', 'doughnut'],
    dynamicChart: ['bar', 'pie', 'doughnut', 'line'],
    charterClarityChart: ['bar', 'pie', 'doughnut', 'line'],
    websiteChart: ['pie', 'doughnut', 'bar', 'line'],
    disclosureChart: ['doughnut', 'pie', 'bar', 'line'],
    autoInfoChart: ['pie', 'doughnut', 'bar', 'line'],
    attendanceChart: ['doughnut', 'pie', 'bar', 'line'],
    workroomChart: ['bar', 'pie', 'doughnut', 'line'],
    infoBoardChart: ['pie', 'doughnut', 'bar', 'line'],
    cleaningChart: ['bar', 'pie', 'doughnut', 'line'],
    brokerChart: ['doughnut', 'pie', 'bar', 'line'],
    vacantByProvinceChart: ['bar', 'pie', 'doughnut', 'line'],
    provStaffingComparisonChart: ['bar', 'pie', 'doughnut', 'line'],
    staffingChart: ['bar', 'pie', 'doughnut', 'line'],
    facilitiesChart: ['bar', 'pie', 'doughnut', 'line']
};

function updateWordCountDisplay(inputEl, counterId, limit) {
    const counterEl = document.getElementById(counterId);
    if (!counterEl) return;
    const count = countWords(inputEl.value);
    counterEl.textContent = `${toNepaliDigits(count)} / ${toNepaliDigits(limit)} शब्द`;
    counterEl.style.color = count > limit ? "#de3053" : "#666"; // सीमा नाघेमा रातो बनाउने
}

function updateSatisfactionVisibility() {
    const selected = document.querySelector('[name="main_satisfaction"]:checked')?.value;
    
    const posDiv = document.getElementById("positive-reasons-section");
    const negDiv = document.getElementById("negative-reasons-section");

    if (posDiv) {
        const isVisible = selected === "सन्तुष्ट";
        posDiv.style.display = isVisible ? "block" : "none";
        const counterEl = document.getElementById("pos_other_counter");
        if (counterEl) counterEl.style.display = (isVisible && document.getElementById("pos_other_cb")?.checked) ? "block" : "none";
        // लुकेको बेला भित्रका इनपुटहरू र 'अन्य' टेक्स्ट बक्स रिसेट गर्ने
        if (!isVisible) {
            posDiv.querySelectorAll('input').forEach(i => {
                if (i.type === 'checkbox') i.checked = false;
                if (i.type === 'text') { i.value = ''; i.style.display = 'none'; i.dispatchEvent(new Event('input')); }
            });
        }
    }

    if (negDiv) {
        const isVisible = selected === "असन्तुष्ट";
        negDiv.style.display = isVisible ? "block" : "none";
        const counterEl = document.getElementById("neg_other_counter");
        if (counterEl) counterEl.style.display = (isVisible && document.getElementById("neg_other_cb")?.checked) ? "block" : "none";
        // लुकेको बेला भित्रका इनपुटहरू र 'अन्य' टेक्स्ट बक्स रिसेट गर्ने
        if (!isVisible) {
            negDiv.querySelectorAll('input').forEach(i => {
                if (i.type === 'checkbox') i.checked = false;
                if (i.type === 'text') { i.value = ''; i.style.display = 'none'; i.dispatchEvent(new Event('input')); }
            });
        }
    }
}

function toggleOtherReason(checkboxId, textInputId) {
    const cb = document.getElementById(checkboxId);
    const txt = document.getElementById(textInputId);
    const counterId = textInputId.replace("_text", "_counter");
    const counter = document.getElementById(counterId);

    if (cb && txt) {
        txt.style.display = cb.checked ? "block" : "none";
        if (counter) counter.style.display = cb.checked ? "block" : "none";
        if (!cb.checked) { 
            txt.value = ""; 
            txt.dispatchEvent(new Event('input')); // काउन्टर रिसेट गर्न
        }
    }
}

function renderTopUnsatisfiedOffices(data) {
    const row = document.getElementById("topOfficesRow");
    const container = document.getElementById("topUnsatisfiedContainer");
    const list = document.getElementById("topUnsatisfiedList");
    if (!container || !list) return;

    if (topUnsatisfiedChartObj) topUnsatisfiedChartObj.destroy();

    // असन्तुष्ट भएका डाटाहरू मात्र फिल्टर गर्ने
    const unsatisfiedData = data.filter(d => d.satisfaction_flag === "असन्तुष्ट" && d.mukhya_karyalay);

    if (unsatisfiedData.length === 0) {
        container.style.display = "none";
        checkTopRowVisibility();
        return;
    }

    // कार्यालय अनुसार गणना गर्ने
    const officeCounts = {};
    unsatisfiedData.forEach(d => {
        const office = d.mukhya_karyalay.trim();
        officeCounts[office] = (officeCounts[office] || 0) + 1;
    });

    // संख्याको आधारमा ठूलोबाट सानो मिलाउने र शीर्ष ३ लिने
    const top3 = Object.entries(officeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    list.innerHTML = top3.map(([office, count], index) => {
        const colors = ['#ef4444', '#f97316', '#f59e0b']; 
        return `
        <div class="stat-card" style="border-left: 4px solid ${colors[index]}; margin-bottom: 6px; text-align: left; background: white; padding: 8px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 0.95rem; font-weight: bold; color: #de3053; margin-bottom: 2px;">
                ${toNepaliDigits(index + 1)}. ${office}
            </div>
            <div style="font-size: 0.85rem; color: #4a5568;">असन्तुष्टि संख्या: <strong style="color: #ef4444;">${toNepaliDigits(count)}</strong></div>
        </div>
    `}).join('');

    // Render Chart
    const ctx = document.getElementById("topUnsatisfiedChart").getContext('2d');
    topUnsatisfiedChartObj = new Chart(ctx, {
        type: chartTypes.topUnsatisfiedChart, 
        data: {
            labels: top3.map(x => x[0]),
            datasets: [{
                label: 'असन्तुष्टि संख्या',
                data: top3.map(x => x[1]),
                backgroundColor: ['#ef4444cc', '#f97316cc', '#f59e0bcc'],
                borderColor: ['#ef4444', '#f97316', '#f59e0b'],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } },
                y: { ticks: { font: { family: 'Kalimati' } } }
            }
        }
    });

    container.style.display = "block";
    if (row) row.style.display = "flex";
}

function renderTopSatisfiedOffices(data) {
    const row = document.getElementById("topOfficesRow");
    const container = document.getElementById("topSatisfiedContainer");
    const list = document.getElementById("topSatisfiedList");
    if (!container || !list) return;

    if (topSatisfiedChartObj) topSatisfiedChartObj.destroy();

    const satisfiedData = data.filter(d => d.satisfaction_flag === "सन्तुष्ट" && d.mukhya_karyalay);

    if (satisfiedData.length === 0) {
        container.style.display = "none";
        checkTopRowVisibility();
        return;
    }

    const officeCounts = {};
    satisfiedData.forEach(d => {
        const office = d.mukhya_karyalay.trim();
        officeCounts[office] = (officeCounts[office] || 0) + 1;
    });

    const top3 = Object.entries(officeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    list.innerHTML = top3.map(([office, count], index) => {
        const colors = ['#10b981', '#34d399', '#6ee7b7'];
        return `
        <div class="stat-card" style="border-left: 4px solid ${colors[index]}; margin-bottom: 6px; text-align: left; background: white; padding: 8px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-size: 0.95rem; font-weight: bold; color: #27ae60; margin-bottom: 2px;">
                ${toNepaliDigits(index + 1)}. ${office}
            </div>
            <div style="font-size: 0.85rem; color: #4a5568;">सन्तुष्टि संख्या: <strong style="color: #10b981;">${toNepaliDigits(count)}</strong></div>
        </div>
    `}).join('');

    const ctx = document.getElementById("topSatisfiedChart").getContext('2d');
    topSatisfiedChartObj = new Chart(ctx, {
        type: chartTypes.topSatisfiedChart,
        data: {
            labels: top3.map(x => x[0]),
            datasets: [{
                label: 'सन्तुष्टि संख्या',
                data: top3.map(x => x[1]),
                backgroundColor: ['#10b981cc', '#34d399cc', '#6ee7b7cc'],
                borderColor: ['#10b981', '#34d399', '#6ee7b7'],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: { animation: { duration: 2500, easing: 'easeInOutQuart' }, indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } }, y: { ticks: { font: { family: 'Kalimati' } } } } }
    });

    container.style.display = "block";
    if (row) row.style.display = "flex";
}

function checkTopRowVisibility() {
    const u = document.getElementById("topUnsatisfiedContainer");
    const s = document.getElementById("topSatisfiedContainer");
    const r = document.getElementById("topOfficesRow");
    if (u && s && r && u.style.display === "none" && s.style.display === "none") {
        r.style.display = "none";
    }
}

async function loadData() {
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा लोड हुँदैछ, कृपया पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }
    if (typeof SCRIPT_URL !== "undefined" && SCRIPT_URL && SCRIPT_URL.trim() !== "") {
        try {
            const response = await fetch(SCRIPT_URL);
            if (response.ok) {
                const result = await response.json();
                if (result.survey) {
                    allSubmissions = result.survey;
                    // रिभर्स गर्ने भए एक पटक मात्र गर्ने (भर्खरै आएकालाई माथि देखाउन)
                    allSubmissions.reverse(); 
                    localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions));
                }
                if (result.monitoring) {
                    allMonitorings = result.monitoring;
                    allMonitorings.reverse();
                    localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));
                }
                if (result.attendance) {
                    allAttendanceMonitorings = result.attendance;
                    allAttendanceMonitorings.reverse();
                    localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));
                }
            }
        } catch (e) {
            console.warn("Google Sheets बाट डाटा ल्याउन सकिएन, स्थानीय भण्डारण प्रयोग गरिँदैछ:", e);
            loadLocalDataFallback();
        }
    } else {
        loadLocalDataFallback();
    }
    refreshDashboard();
    if (loadingOverlay) loadingOverlay.style.display = "none";
}

function loadLocalDataFallback() {
    const stored = localStorage.getItem("surveyData_nsc_full");
    if (stored) allSubmissions = JSON.parse(stored);
    else allSubmissions = [];
}

function saveLocalData() {
    localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions)); // allSubmissions is already filtered, so storing original.
    refreshDashboard();
}

function addSubmission(data) {
    allSubmissions.unshift(data);
    saveLocalData();
}

document.getElementById("submitSurvey").addEventListener("click", async function () {
    const form = document.getElementById("surveyForm");
    
    // अनिवार्य फिल्डहरू खाली भए रातो बोर्डर देखाउन 'was-validated' क्लास थप्ने
    form.classList.add('was-validated');

    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // 'अन्य' विकल्प छानिएको खण्डमा टेक्स्ट बक्स खाली भए सबमिट हुन नदिने (Validation)
    const posOtherCb = document.getElementById("pos_other_cb");
    const posOtherTxt = document.getElementById("pos_other_text");
    if (posOtherCb?.checked && !posOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया सन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        posOtherTxt.focus();
        return;
    }

    const negOtherCb = document.getElementById("neg_other_cb");
    const negOtherTxt = document.getElementById("neg_other_text");
    if (negOtherCb?.checked && !negOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया असन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        negOtherTxt.focus();
        return;
    }

    // योजना सम्बन्धी असन्तुष्टिको 'अन्य' विकल्प जाँच
    const yojanaOtherCb = document.querySelector('input[name="asantushti_karan_yojana"][value="अन्य (लेख्नुहोस्)"]');
    const yojanaOtherTxt = document.querySelector('input[name="asantushti_karan_other"]');
    if (yojanaOtherCb?.checked && !yojanaOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया योजना असन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        yojanaOtherTxt.focus();
        return;
    }

    // शब्द सीमा जाँच (Word Limit Validation)
    const wordLimits = [
        { id: "pos_other_text", limit: 20, name: "सन्तुष्टिको अन्य कारण" },
        { id: "neg_other_text", limit: 20, name: "असन्तुष्टिको अन्य कारण" },
        { id: "yojana_other_text", limit: 20, name: "योजना असन्तुष्टिको अन्य कारण" },
        { id: "sujhaw", limit: 100, name: "सुझाव" }
    ];

    for (let item of wordLimits) {
        const el = document.getElementById(item.id);
        if (el && el.value.trim()) {
            const count = countWords(el.value);
            if (count > item.limit) {
                Swal.fire({
                    icon: 'warning',
                    title: 'शब्द सीमा नाघ्यो',
                    text: `${item.name} बढीमा ${item.limit} शब्दको हुनुपर्छ। (हाल: ${count} शब्द)`,
                    confirmButtonColor: '#387ae6'
                });
                el.focus();
                return;
            }
        }
    }

    const formData = new FormData(form);
    let payload = {};
    for (let [key, val] of formData.entries()) {
        if (payload[key]) {
            if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
            payload[key].push(val);
        } else payload[key] = val;
    }
    let surveyDate = document.getElementById("survey_date").value;
    // यदि मिति खाली छ वा Placeholder छ भने आजको नेपाली मिति लिने
    if ((!surveyDate || surveyDate === "" || surveyDate === "YYYY-MM-DD") && typeof NepaliFunctions !== 'undefined') {
        const today = NepaliFunctions.GetCurrentBsDate();
        surveyDate = today.year + "-" + NepaliFunctions.Get2DigitNo(today.month) + "-" + NepaliFunctions.Get2DigitNo(today.day);
    }
    
    // Google Sheets र भण्डारणको लागि मिति फर्याट गर्ने
    payload.survey_date = getFormattedNepaliDate(surveyDate);
    payload.timestamp = new Date().toISOString();
    payload.pradesh = PROVINCE[payload.pradesh] || "";
    payload.jilla = payload.jilla || "";
    payload.sthaaniya_taha = payload.sthaaniya_taha || "";
    payload.mukhya_karyalay = payload.mukhya_karyalay || "";
    payload.gender = payload.gender || "";
    payload.ghus_parera = payload.ghus_parera || "";
    payload.sahayog_parera = payload.sahayog_parera || "";

    // 'अन्य' विकल्प र त्यसमा लेखिएको विवरणलाई एउटै महल (Column) मा मिलाउने
    const mergeOther = (mainField, otherField, searchVal) => {
        if (payload[mainField]) {
            let vals = Array.isArray(payload[mainField]) ? payload[mainField] : [payload[mainField]];
            if (vals.includes(searchVal) && payload[otherField]) {
                // 'अन्य' लाई 'अन्य: [विवरण]' मा बदल्ने
                vals = vals.map(v => v === searchVal ? `${searchVal}: ${payload[otherField]}` : v);
            }
            payload[mainField] = vals;
        }
        delete payload[otherField]; // छुट्टै 'अन्य' फिल्डलाई हटाउने ताकि डेटाबेस सफा होस्
    };

    mergeOther('santushti_positive', 'santushti_positive_other_val', 'अन्य');
    mergeOther('santushti_negative', 'santushti_negative_other_val', 'अन्य');
    mergeOther('asantushti_karan_yojana', 'asantushti_karan_other', 'अन्य (लेख्नुहोस्)');

    // सबै चेकबक्सका एरेहरूलाई स्ट्रिङमा बदल्ने (Google Sheets मा एउटै सेलमा राख्न)
    Object.keys(payload).forEach(key => {
        if (Array.isArray(payload[key])) {
            payload[key] = payload[key].join(", ");
        }
    });

    // सन्तुष्टि स्थिति गणना (Consolidated Logic)
    const hasPos = (payload.santushti_positive && payload.santushti_positive.length > 0) || payload.main_satisfaction === "सन्तुष्ट";
    const hasNeg = (payload.santushti_negative && payload.santushti_negative.length > 0) || payload.main_satisfaction === "असन्तुष्ट";

    let sFlag = "अज्ञात";
    if (hasPos && !hasNeg) sFlag = "सन्तुष्ट";
    else if (hasNeg && !hasPos) sFlag = "असन्तुष्ट";
    else if (hasPos && hasNeg) sFlag = "मिश्रित";

    payload.satisfaction_flag = sFlag;
    payload.bikas_janakari = payload.bikas_janakari || "";

    addSubmission(payload);
    
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा सुरक्षित हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }

    if (SCRIPT_URL && SCRIPT_URL.trim() !== "") {
        try {
            // Send POST request (no-cors means we won't get a readable response)
            await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
            if (loadingOverlay) loadingOverlay.style.display = "none";
            document.getElementById("formStatus").innerHTML = "✅ गुगल सिट तथा स्थानीय भण्डारणमा सेभ भयो!";
            
            // Re-fetch data to sync dashboard with Google Sheets
            loadData();
        } catch (e) { 
            if (loadingOverlay) loadingOverlay.style.display = "none";
            console.warn(e); 
            document.getElementById("formStatus").innerHTML = "⚠️ गुगल सिटमा सेभ गर्न समस्या भयो। स्थानीय भण्डारणमा सेभ गरिएको छ।";
        }
    } else {
        if (loadingOverlay) loadingOverlay.style.display = "none";
        document.getElementById("formStatus").innerHTML = "✅ डाटा स्थानीय भण्डारणमा सेभ भयो।<br>⚠️ गुगल सिट जोड्नको लागि SCRIPT_URL कन्फिगर गर्नुहोस्।";
    }
    form.reset();
    // रिसेट गर्दा रातो बोर्डरको क्लास पनि हटाउने
    form.classList.remove('was-validated');
    
    // फारम रिसेट भएपछि फेरि आजको मिति सेट गर्ने
    setTodayNepaliDate();

    // रिसेट पछि कारणहरू भएका सेक्सनहरू पनि लुकाउने
    updateSatisfactionVisibility();

    // सर्वेक्षण सफल भएको पप-अप मेसेज देखाउने
    Swal.fire({
        title: 'सफल!',
        text: 'सर्वेक्षण सफलतापूर्वक सुरक्षित भयो। सहयोगको लागि धन्यवाद!',
        icon: 'success',
        confirmButtonText: 'ठीक छ',
        confirmButtonColor: '#387ae6'
    });

    // सफलतापूर्वक सेभ भएपछि २ सेकेन्डमा ड्यासबोर्डमा आफैं लैजाने
    setTimeout(() => {
        const dashboardBtn = document.querySelector('.tab-btn[data-tab="dashboard-tab"]');
        if (dashboardBtn) {
            dashboardBtn.click();
        }
    }, 2000);

    setTimeout(() => document.getElementById("formStatus").innerHTML = "", 3500);
});

// अनुगमन फारम सबमिट गर्ने लजिक
document.getElementById("submitMonitoring")?.addEventListener("click", async function() {
    const form = document.getElementById("monitoringForm");
    if (!form.checkValidity()) { form.reportValidity(); return; }

    // शब्द सीमा जाँच (Word Limit Validation for Monitoring Fields)
    const wordLimits = [
        { id: "m_office", limit: 20, name: "कार्यालयको नाम" },
        { id: "m_main_services", limit: 100, name: "मुख्य सेवाहरू" },
        { id: "m_problems", limit: 100, name: "मूलभूत समस्या/अनियमितता" },
        { id: "m_measures", limit: 100, name: "अपनाएका सुधारका उपायहरू" },
        { id: "m_comment", limit: 150, name: "अनुगमनकर्ताको टिप्पणी" }
    ];

    for (let item of wordLimits) {
        const el = document.getElementById(item.id);
        if (el && el.value.trim()) {
            const count = countWords(el.value);
            if (count > item.limit) {
                Swal.fire({ icon: 'warning', title: 'शब्द सीमा नाघ्यो', text: `${item.name} बढीमा ${toNepaliDigits(item.limit)} शब्दको हुनुपर्छ। (हाल: ${toNepaliDigits(count)} शब्द)`, confirmButtonColor: '#387ae6' });
                el.focus();
                return;
            }
        }
    }

    const formData = new FormData(form);
    let payload = { 
        type: 'monitoring', 
        timestamp: new Date().toISOString() 
    };
    
    for (let [key, val] of formData.entries()) {
        if (payload[key]) {
            if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
            payload[key].push(val);
        } else {
            payload[key] = val;
        }
    }
    
    // Province/District mapping
    payload.m_pradesh = PROVINCE[payload.m_pradesh] || payload.m_pradesh;

    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) loadingOverlay.style.display = "flex";

    try {
        // Local storage मा सेभ गर्ने
        allMonitorings.unshift(payload);
        localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));

        if (SCRIPT_URL) {
            await fetch(SCRIPT_URL, { 
                method: "POST", 
                mode: 'no-cors', // CORS समस्या समाधान गर्न
                body: JSON.stringify(payload) 
            });
        }
        
        Swal.fire({ icon: 'success', title: 'सफल!', text: 'कार्यालय अनुगमन फारम सुरक्षित भयो।', confirmButtonColor: '#387ae6' });
        form.reset();
    } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'info', title: 'नोट', text: 'डाटा स्थानीय भण्डारणमा सेभ भयो।' });
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = "none";
    }
});

// समय पालना र पोशाक अनुगमन फारमका लागि डाइनामिक लहरहरू
function addAttendanceRow() {
    const tbody = document.getElementById("attendanceEntryBody");
    if (!tbody) return;
    const rowCount = tbody.rows.length + 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>
            <select name="emp_category[]" required>
                <option value="अनुगमन मितिमा अनुपस्थित/ढिला आउने">अनुपस्थित/ढिला (आज)</option>
                <option value="अघिल्लो मितिमा अनुपस्थित">अघिल्लो मितिमा अनुपस्थित</option>
                <option value="हाजिर भई कार्यकक्षमा नभेटिएको">कार्यकक्षमा नभेटिएको</option>
                <option value="तोकिएको पोशाक नलगाएको">पोशाक नलगाएको</option>
            </select>
        </td>
        <td><input type="text" name="emp_rank[]" placeholder="पद"></td>
        <td><input type="text" name="emp_symbol[]" placeholder="संकेत नं."></td>
        <td><input type="text" name="emp_name[]" placeholder="कर्मचारीको नाम"></td>
        <td><input type="text" name="emp_extra[]" placeholder="कैफियत/मिति"></td>
        <td><button type="button" onclick="this.closest('tr').remove()" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px;">हटाउने</button></td>
    `;
    tbody.appendChild(tr);
}

document.getElementById("submitAttendance")?.addEventListener("click", async function() {
    const form = document.getElementById("attendanceForm");
    
    // भ्यालिडेसनका लागि क्लास थप्ने
    form.classList.add('was-validated');

    if (!form.checkValidity()) { 
        form.reportValidity(); 
        return; 
    }

    const formData = new FormData(form);
    let payload = { 
        type: 'attendance', 
        timestamp: new Date().toISOString(), // मुख्य रेकर्डको लागि टाइमस्ट्याम्प
        mainRecordId: new Date().getTime().toString(), // अद्वितीय ID
        rows: []
    };

    // Form base data
    payload.pradesh = PROVINCE[formData.get("a_pradesh")] || "";
    payload.jilla = formData.get("a_jilla") || "";
    payload.sthaaniya = formData.get("a_sthaaniya") || "";
    payload.office = formData.get("a_office");
    payload.total_staff = formData.get("a_total_staff");
    payload.working_staff = formData.get("a_working_staff");
    payload.vacant_staff = formData.get("a_vacant_staff");
    payload.date = formData.get("a_date");
    payload.time = formData.get("a_time");
    payload.phone = formData.get("a_phone");
    payload.monitor_name = formData.get("a_monitor_name");
    payload.monitor_rank = formData.get("a_monitor_rank");

    // Get rows
    const categories = formData.getAll("emp_category[]");
    const ranks = formData.getAll("emp_rank[]");
    const symbols = formData.getAll("emp_symbol[]");
    const names = formData.getAll("emp_name[]");
    const extras = formData.getAll("emp_extra[]");

    let hasValidRow = false;
    for(let i=0; i < names.length; i++) {
        // नाम वा संकेत नं. मध्ये कम्तिमा एउटा हुनुपर्ने गरी सुधारिएको
        if(names[i].trim() !== "" || symbols[i].trim() !== "") {
            hasValidRow = true;
            payload.rows.push({
                category: categories[i],
                rank: ranks[i],
                symbol: symbols[i],
                name: names[i],
                extra: extras[i],
                mainRecordId: payload.mainRecordId // मुख्य रेकर्डसँग लिङ्क गर्न
            });
        }
    }

    if (!hasValidRow) {
        Swal.fire({ 
            icon: 'warning', 
            title: 'कर्मचारी विवरण आवश्यक',
            text: 'कृपया अनुगमन तालिकामा कम्तिमा एक कर्मचारीको विवरण (नाम वा संकेत नं.) अनिवार्य रुपमा भर्नुहोस्।',
            confirmButtonColor: '#387ae6'
        });
        return;
    }

    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) loadingOverlay.style.display = "flex";

    try {
        allAttendanceMonitorings.unshift(payload);
        localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));

        if (SCRIPT_URL) {
            await fetch(SCRIPT_URL, { method: "POST", mode: 'no-cors', body: JSON.stringify(payload) });
        }
        Swal.fire({ icon: 'success', title: 'सफल!', text: 'समय पालना र पोशाक अनुगमन विवरण सुरक्षित भयो।' });
        form.reset();
        form.classList.remove('was-validated');
        document.getElementById("attendanceEntryBody").innerHTML = "";
        addAttendanceRow();
    } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'info', text: 'डाटा स्थानीय भण्डारणमा सेभ भयो।' });
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = "none";
    }
});

// Dashboard rendering
function refreshDashboard() {
    if (currentDashboardView === 'monitoring') {
        refreshMonitoringDashboard();
        return;
    }
    if (currentDashboardView === 'attendance') {
        refreshAttendanceDashboard();
        return;
    }
    // साविकको सर्वेक्षण ड्यासबोर्ड लजिक
    const pradeshFilter = document.getElementById("filterPradesh")?.value || "";
    const districtFilter = document.getElementById("filterDistrict")?.value || "";
    const sthaaniyaFilter = document.getElementById("filterSthaaniya")?.value || "";
    const officeFilter = document.getElementById("filterOffice")?.value.toLowerCase() || "";
    const genderF = document.getElementById("filterGender")?.value || "";
    let fromDate = getStandardDate(document.getElementById("filterDateFrom")?.value || "");
    let toDate = getStandardDate(document.getElementById("filterDateTo")?.value || "");

    // Data Pre-processing: satisfaction_flag खाली भएमा गणना गर्ने (पुराना रेकर्डको लागि)
    const processedData = allSubmissions.map(r => {
        if (!r.satisfaction_flag || r.satisfaction_flag === "अज्ञात") {
            const hasPos = (r.santushti_positive && r.santushti_positive.length > 0) || r.main_satisfaction === "सन्तुष्ट";
            const hasNeg = (r.santushti_negative && r.santushti_negative.length > 0) || r.main_satisfaction === "असन्तुष्ट";

            if (hasPos && !hasNeg) r.satisfaction_flag = "सन्तुष्ट";
            else if (hasNeg && !hasPos) r.satisfaction_flag = "असन्तुष्ट";
            else if (hasPos && hasNeg) r.satisfaction_flag = "मिश्रित";
        }
        return r;
    });

    let filtered = processedData.filter(r => {
        // स्मार्ट म्यापिङ प्रयोग गरेर फिल्टरका लागि डाटा तान्ने
        const rPradesh = getVal(r, 'pradesh', 'प्रदेश');
        const rJilla = getVal(r, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(r, 'sthaaniya_taha', 'स्थानीय तह');
        const rOffice = getVal(r, 'mukhya_karyalay', 'कार्यालय');
        const rGender = getVal(r, 'gender', 'लिङ्ग');

        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            if (rPradesh != pradeshFilter && rPradesh !== provinceName) return false;
        }
        if (districtFilter && rJilla !== districtFilter) return false;
        if (sthaaniyaFilter && rSthaaniya !== sthaaniyaFilter) return false;
        if (officeFilter && !(rOffice || "").toLowerCase().includes(officeFilter)) return false;
        if (genderF && rGender !== genderF) return false;
        
        // फिल्टरको लागि वर्णनात्मक मितिलाई मानक (YYYY-MM-DD) मा बदलेर तुलना गर्ने
        const rDate = getVal(r, 'survey_date', 'मिति');
        let recDate = getStandardDate(rDate || "");
        if (fromDate && recDate < fromDate) return false;
        if (toDate && recDate > toDate) return false;
        return true;
    });
    renderStats(filtered);
    renderTopUnsatisfiedOffices(filtered);
    renderTopSatisfiedOffices(filtered);
    updateCharts(filtered);
    renderTable(filtered);
    updateDynamicAnalysis(filtered);
}

function refreshMonitoringDashboard() {
    const pradeshFilter = document.getElementById("filterPradesh")?.value || "";
    const districtFilter = document.getElementById("filterDistrict")?.value || "";
    const officeFilter = document.getElementById("filterOffice")?.value.toLowerCase() || "";

    let filtered = allMonitorings.filter(r => {
        if (pradeshFilter && r.m_pradesh !== PROVINCE[pradeshFilter]) return false;
        if (districtFilter && r.m_jilla !== districtFilter) return false;
        if (officeFilter && !(r.m_office || "").toLowerCase().includes(officeFilter)) return false;
        return true;
    });
    currentFilteredMonitorings = filtered; // डाउनलोडका लागि डाटा अपडेट गर्ने

    // Stats rendering for Monitoring
    const total = filtered.length;
    const brokerSeen = filtered.filter(d => d.m_q5 === "देखियो").length;
    const digitalCharter = filtered.filter(d => d.m_q1 === "स्पष्ट बुझिने").length;

    document.getElementById("statCardsContainer").innerHTML = `
        <div class="stat-card"><div class="stat-number">${total}</div><div>जम्मा अनुगमन</div></div>        
        <div class="stat-card"><div class="stat-number">${brokerSeen} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (brokerSeen/total*100).toFixed(1) : 0)}%)</span></div><div>बाहिरी व्यक्तिको सहयोग लिनु परेको</div></div>
        <div class="stat-card"><div class="stat-number">${digitalCharter} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (digitalCharter/total*100).toFixed(1) : 0)}%)</span></div><div>डिजिटल बडापत्र स्पष्ट</div></div>
    `;

    // Table rendering for Monitoring
    renderMonitoringTable(filtered);
    // अनुगमन ड्यासबोर्डका लागि चार्टहरू अपडेट गर्ने
    updateMonitoringCharts(filtered);
    // अलर्ट सेक्सन अपडेट गर्ने (रिक्त पदको आधारमा)
    updateMonitoringAlerts(filtered);
    // विवरणात्मक विवरणहरू अपडेट गर्ने
    updateMonitoringDetails(filtered);
}

function refreshAttendanceDashboard() {
    const pradeshFilter = document.getElementById("filterPradesh")?.value || "";
    const districtFilter = document.getElementById("filterDistrict")?.value || "";
    const sthaaniyaFilter = document.getElementById("filterSthaaniya")?.value || "";
    const officeFilter = document.getElementById("filterOffice")?.value.toLowerCase() || "";
    const empNameFilter = document.getElementById("filterEmpName")?.value.toLowerCase() || "";
    const empSymbolFilter = document.getElementById("filterEmpSymbol")?.value || "";
    const categoryFilter = document.getElementById("filterCategory")?.value || "";

    let filteredEntries = [];
    allAttendanceMonitorings.forEach(report => {
        // प्रदेश र जिल्ला फिल्टर
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            if (report.pradesh !== provinceName) return;
        }
        if (districtFilter && report.jilla !== districtFilter) return;
        if (sthaaniyaFilter && report.sthaaniya !== sthaaniyaFilter) return;
        
        if (officeFilter && !report.office.toLowerCase().includes(officeFilter)) return;
        
        report.rows.forEach(row => {
            if (empNameFilter && !row.name.toLowerCase().includes(empNameFilter)) return;
            if (empSymbolFilter && row.symbol !== empSymbolFilter) return;
            if (categoryFilter && row.category !== categoryFilter) return;
            
            filteredEntries.push({
                office: report.office,
                date: report.date,
                ...row
            });
        });
    });
    currentFilteredAttendance = filteredEntries; // ग्लोबल भेरिएबलमा राख्ने

    // Stats
    const totalViolations = filteredEntries.length;
    const lateAbsent = filteredEntries.filter(e => e.category.includes("अनुपस्थित/ढिला")).length;
    const noUniform = filteredEntries.filter(e => e.category.includes("पोशाक")).length;

    document.getElementById("statCardsContainer").innerHTML = `
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(totalViolations)}</div><div>जम्मा अपरिपालना</div></div>
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(lateAbsent)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (lateAbsent/totalViolations*100).toFixed(1) : 0)}%)</span></div><div>अनुपस्थित/ढिला कर्मचारी</div></div>
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(noUniform)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (noUniform/totalViolations*100).toFixed(1) : 0)}%)</span></div><div>पोशाक नलगाउने</div></div>
    `;

    // Table
    const tbody = document.querySelector("#dataTable tbody");
    if (tbody) {
        tbody.innerHTML = filteredEntries.map(e => `
            <tr>
                <td data-label="मिति">${e.date}</td>
                <td data-label="कार्यालय">${e.office}</td>
                <td data-label="कर्मचारी">${e.name}</td>
                <td data-label="पद">${e.rank}</td>
                <td data-label="संकेत नं.">${e.symbol}</td>
                <td data-label="प्रकार">${e.category}</td>
                <td data-label="कैफियत" colspan="2">${e.extra || "-"}</td>
            </tr>
        `).join('');
    }

    // सर्वेक्षणबाट आउन सक्ने अनावश्यक बक्सहरू लुकाउने
    const dStatRow = document.getElementById("dynamicStatRow");
    if (dStatRow) dStatRow.style.display = "none";
    const detailTable = document.getElementById("dynamicDetailTableContainer");
    if (detailTable) detailTable.style.display = "none";

    // Charts - फिल्टर अनुसार गतिशील रूपमा देखाउने
    if (attendanceViolationChartObj) attendanceViolationChartObj.destroy();

    // यदि 'प्रकार' फिल्टर गरिएको छ भने कार्यालय अनुसार देखाउने, नत्र प्रकार अनुसार
    const dimension = categoryFilter ? 'office' : 'category';
    const counts = {};
    filteredEntries.forEach(e => counts[e[dimension]] = (counts[e[dimension]] || 0) + 1);
    
    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const palette = ['#ef4444cc', '#f59e0bcc', '#3b82f6cc', '#10b981cc', '#8b5cf6cc', '#06b6d4cc'];
    
    attendanceViolationChartObj = new Chart(document.getElementById("dynamicChart").getContext('2d'), {
        type: chartTypes.dynamicChart || 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => palette[i % palette.length]),
                borderRadius: 5
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom', display: labels.length > 0 },
                tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } }
            },
            scales: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut') ? {} : {
                y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } }
            }
        }
    });
    
    // Show chart row
    document.getElementById("dynamicChartRow").style.display = "flex";
    document.getElementById("dynamicChartLabel").textContent = categoryFilter 
        ? `कार्यालय अनुसार विवरण (${categoryFilter})` 
        : "अपरिपालनाको वर्गीकरण";
}

/**
 * समय पालना/पोशाक अनुगमनको PDF रिपोर्ट जेनेरेट गर्ने
 */
async function downloadAttendancePDF() {
    const element = document.createElement('div');
    const stats = document.getElementById('statCardsContainer').innerHTML;
    const table = document.querySelector('#dataTable').parentElement.innerHTML;
    const chartCanvas = document.getElementById('dynamicChart');
    const chartImage = chartCanvas.toDataURL('image/png');

    element.innerHTML = `
        <div style="padding: 20px; font-family: 'Kalimati', sans-serif;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #306a95;">समय पालना तथा पोशाक अनुगमन रिपोर्ट</h2>
                <p>राष्ट्रिय सतर्कता केन्द्र</p>
                <hr>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">${stats}</div>
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${chartImage}" style="width: 300px; height: auto;">
                <p><strong>अपरिपालनाको वर्गीकरण</strong></p>
            </div>
            <div style="margin-top: 20px;">${table}</div>
        </div>
    `;

    // स्टाइलिङ मिलाउन केही ट्वीकहरू
    const cards = element.querySelectorAll('.stat-card');
    cards.forEach(c => {
        c.style.border = "1px solid #ddd";
        c.style.padding = "10px";
        c.style.flex = "1";
    });

    const opt = {
        margin: 0.5,
        filename: 'Attendance_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

/**
 * समय पालना/पोशाक अनुगमनको डेटा एक्सेलमा निर्यात गर्ने
 */
function exportAttendanceToExcel() {
    if (currentFilteredAttendance.length === 0) {
        Swal.fire({ icon: 'info', text: 'निर्यात गर्नको लागि कुनै डाटा छैन।' });
        return;
    }

    const workbook = XLSX.utils.book_new();

    // डाटालाई कार्यालय अनुसार समूहकृत (Grouping) गर्ने
    const groupedByOffice = currentFilteredAttendance.reduce((acc, curr) => {
        const office = curr.office || "अन्य कार्यालय";
        if (!acc[office]) acc[office] = [];
        acc[office].push(curr);
        return acc;
    }, {});

    // प्रत्येक कार्यालयको लागि छुट्टाछुट्टै Sheet थप्ने
    Object.keys(groupedByOffice).forEach(officeName => {
        const officeData = groupedByOffice[officeName].map(e => ({
            'मिति': e.date,
            'कार्यालय': e.office,
            'कर्मचारीको नाम': e.name,
            'पद': e.rank,
            'संकेत नं.': e.symbol,
            'अपरिपालना प्रकार': e.category,
            'कैफियत': e.extra || "-"
        }));

        const worksheet = XLSX.utils.json_to_sheet(officeData);
        
        // Excel Sheet Name नियम: बढीमा ३१ अक्षर र केही संकेतहरू (\ / ? * [ ]) निषेध गरिएको हुन्छ
        const sanitizedName = officeName.replace(/[\\/?*:[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sanitizedName || "Sheet");
    });

    XLSX.writeFile(workbook, "Attendance_Report_By_Office.xlsx");
}

function updateMonitoringAlerts(data) {
    const alertsSection = document.getElementById("monitoringAlertsSection");
    const alertsList = document.getElementById("alertsList");
    if (!alertsSection || !alertsList) return;

    // ३०% भन्दा बढी रिक्तता दर (Vacancy Rate) भएका कार्यालयहरू फिल्टर गर्ने
    const highVacancyOffices = data.filter(d => {
        const total = Number(d.d_total || 0);
        const vacant = Number(d.d_vacant || 0);
        if (total <= 0) return false; // शून्य दरबन्दी भएका कार्यालयलाई नदेखाउने
        const rate = (vacant / total) * 100;
        return rate > 30;
    });

    if (highVacancyOffices.length === 0) {
        alertsSection.style.display = "none";
        return;
    }

    alertsSection.style.display = "block";
    alertsList.innerHTML = highVacancyOffices.map(d => {
        const total = Number(d.d_total || 0);
        const vacant = Number(d.d_vacant || 0);
        const rate = ((vacant / total) * 100).toFixed(1); // १ दशमलव स्थानसम्म
        
        return `
            <div class="stat-card" style="border-top: 4px solid #de3053; border-left: 1px solid #ffa39e; border-right: 1px solid #ffa39e; border-bottom: 1px solid #ffa39e; flex: 1 1 250px; text-align: left; padding: 12px; background: white; box-shadow: 0 2px 8px rgba(222, 48, 83, 0.1);">
                <div style="font-weight: 700; color: #de3053; margin-bottom: 5px; font-size: 1.05rem;">${d.m_office || 'अज्ञात कार्यालय'}</div>
                <div style="font-size: 1rem; color: #2d3748;">रिक्तता दर: <span style="font-weight: 800; color: #de3053;">${toNepaliDigits(rate)}%</span></div>
                <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">रिक्त संख्या: ${toNepaliDigits(vacant)} / कुल दरबन्दी: ${toNepaliDigits(total)}</div>
            </div>
        `;
    }).join('');
}

function updateMonitoringDetails(data) {
    const detailsSection = document.getElementById("monitoringDetailsSection");
    const detailsList = document.getElementById("monitoringDetailsList");
    if (!detailsSection || !detailsList) return;

    if (data.length === 0) {
        detailsSection.style.display = "none";
        return;
    }

    detailsSection.style.display = "block";
    detailsList.innerHTML = data.map(d => `
        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid #306a95; margin-bottom: 15px;">
            <h5 style="font-weight: 700; color: #306a95; margin-bottom: 8px;">${d.m_office || 'अज्ञात कार्यालय'} (${d.m_jilla || ''}) - ${d.m_date || ''}</h5>
            ${d.m_main_services ? `<p style="margin-bottom: 5px;"><strong style="color: #4a5568;">मुख्य सेवाहरू:</strong> ${d.m_main_services}</p>` : ''}
            ${d.m_problems ? `<p style="margin-bottom: 5px;"><strong style="color: #4a5568;">समस्या/अनियमितता:</strong> <span style="color: #de3053;">${d.m_problems}</span></p>` : ''}
            ${d.m_measures ? `<p style="margin-bottom: 5px;"><strong style="color: #4a5568;">सुधारका उपायहरू:</strong> ${d.m_measures}</p>` : ''}
            ${d.m_comment ? `<p style="margin-bottom: 0;"><strong style="color: #4a5568;">अनुगमनकर्ताको टिप्पणी:</strong> ${d.m_comment}</p>` : ''}
            ${d.monitor_name ? `<p style="margin-top: 10px; font-size: 0.85rem; text-align: right; color: #718096;">अनुगमनकर्ता: ${d.monitor_name} (${d.monitor_rank || ''})</p>` : ''}
        </div>
    `).join('');
}

/**
 * अनुगमन चार्टहरू अपडेट गर्ने
 */
function updateMonitoringCharts(data) {
    const colorPalette = ['#3b82f6cc', '#10b981cc', '#f59e0bcc', '#ef4444cc', '#8b5cf6cc'];
    const chartAnimation = { duration: 2500, easing: 'easeInOutQuart' };

    // सहयोगी फङ्सन: रिक्वेन्सी म्यापिङ र चार्ट सिर्जना गर्न
    const createMonChart = (ctxId, fieldName, currentObj, defaultType = 'bar') => {
        let counts = {};
        data.forEach(d => { if (d[fieldName]) counts[d[fieldName]] = (counts[d[fieldName]] || 0) + 1; });
        if (currentObj) currentObj.destroy();
        const chartType = chartTypes[ctxId] || defaultType;
        return new Chart(document.getElementById(ctxId).getContext('2d'), {
            type: chartType,
            data: {
                labels: Object.keys(counts),
                datasets: [{ label: 'संख्या', data: Object.values(counts), backgroundColor: colorPalette, borderRadius: 5 }]
            },
            options: { animation: chartAnimation, responsive: true, plugins: { legend: { display: chartType !== 'bar', position: 'bottom' } } }
        });
    };

    // १. नागरिक बडापत्रको स्पष्टता (m_q1)
    charterClarityChartObj = createMonChart("charterClarityChart", "m_q1", charterClarityChartObj);
    
    // नयाँ चार्टहरू (Q6, Q7, Q8, Q9, Q10, Q11, Q12)
    websiteChartObj = createMonChart("websiteChart", "m_q6", websiteChartObj, 'pie');
    disclosureChartObj = createMonChart("disclosureChart", "m_q7", disclosureChartObj, 'doughnut');
    autoInfoChartObj = createMonChart("autoInfoChart", "m_q8", autoInfoChartObj, 'pie');
    attendanceChartObj = createMonChart("attendanceChart", "m_q9", attendanceChartObj, 'doughnut');
    workroomChartObj = createMonChart("workroomChart", "m_q10", workroomChartObj, 'bar');
    infoBoardChartObj = createMonChart("infoBoardChart", "m_q11", infoBoardChartObj, 'pie');
    cleaningChartObj = createMonChart("cleaningChart", "m_q12", cleaningChartObj, 'bar');
    brokerChartObj = createMonChart("brokerChart", "m_q5", brokerChartObj, 'doughnut');

    // ३.४ प्रदेश अनुसार रिक्त पद (Vacant Posts by Province)
    let provVacMap = {};
    Object.values(PROVINCE).forEach(p => provVacMap[p] = 0);
    data.forEach(d => {
        if (d.m_pradesh) provVacMap[d.m_pradesh] += Number(d.d_vacant || 0);
    });

    if (vacantByProvinceChartObj) vacantByProvinceChartObj.destroy();
    vacantByProvinceChartObj = new Chart(document.getElementById("vacantByProvinceChart").getContext('2d'), {
        type: chartTypes.vacantByProvinceChart || 'bar',
        data: {
            labels: Object.keys(provVacMap),
            datasets: [{
                label: 'रिक्त पद संख्या',
                data: Object.values(provVacMap),
                backgroundColor: '#e67e22',
                borderRadius: 5
            }]
        },
        options: {
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            responsive: true,
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { callback: (v) => toNepaliDigits(v) } 
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` रिक्त संख्या: ${toNepaliDigits(ctx.raw)}` } }
            }
        }
    });

    // ३.६ प्रदेश अनुसार कार्यरत र रिक्त तुलना (Grouped Bar Chart)
    let provCompMap = {};
    Object.values(PROVINCE).forEach(p => provCompMap[p] = { working: 0, vacant: 0 });
    data.forEach(d => {
        if (d.m_pradesh && provCompMap[d.m_pradesh]) {
            provCompMap[d.m_pradesh].working += Number(d.d_working || 0);
            provCompMap[d.m_pradesh].vacant += Number(d.d_vacant || 0);
        }
    });

    if (provStaffingComparisonChartObj) provStaffingComparisonChartObj.destroy();
    provStaffingComparisonChartObj = new Chart(document.getElementById("provStaffingComparisonChart").getContext('2d'), {
        type: chartTypes.provStaffingComparisonChart || 'bar',
        data: {
            labels: Object.keys(provCompMap),
            datasets: [
                {
                    label: 'कार्यरत संख्या',
                    data: Object.values(provCompMap).map(v => v.working),
                    backgroundColor: '#167e2acf',
                    borderRadius: 5
                },
                {
                    label: ' रिक्त पद संख्या',
                    data: Object.values(provCompMap).map(v => v.vacant),
                    backgroundColor: '#e74d3ca4',
                    borderRadius: 5
                }
            ]
        },
        options: {
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { callback: (v) => toNepaliDigits(v) } 
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { 
                    callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${toNepaliDigits(ctx.raw)}` } 
                }
            }
        }
    });

    if (staffingChartObj) staffingChartObj.destroy();
    
    let staffingLabels = [];
    let staffingDatasets = [];

    if (data.length === 1) {
        // एउटा मात्र कार्यालय छान्दा त्यसको सबै विस्तृत विवरण (रिक्त, रमाना आदि) देखाउने
        const d = data[0];
        staffingLabels = ['कुल दरबन्दी', 'कार्यरत संख्या', 'रिक्त पद', 'रमाना लिन बाँकी', 'पद भन्दा बढी'];
        staffingDatasets = [{
            label: d.m_office || 'कार्यालय विवरण',
            data: [
                Number(d.d_total || 0),
                Number(d.d_working || 0),
                Number(d.d_vacant || 0),
                Number(d.d_pending || 0),
                Number(d.d_excess || 0)
            ],
            backgroundColor: ['#137cc2', '#14a450cc', '#e74c3c', '#c4a012', '#9b59b6'],
            borderRadius: 5
        }];
    } else {
        // धेरै कार्यालय हुँदा कुल योगफल तुलना गर्ने
        let totalPositions = 0;
        let totalWorking = 0;
        data.forEach(d => {
            totalPositions += Number(d.d_total || 0);
            totalWorking += Number(d.d_working || 0);
        });

        staffingLabels = ['कुल दरबन्दी र कार्यरत संख्या (योगफल)'];
        staffingDatasets = [
            {
                label: 'कुल दरबन्दी',
                data: [totalPositions],
                backgroundColor: '#2286c9',
                borderRadius: 5
            },
            {
                label: 'कार्यरत संख्या',
                data: [totalWorking],
                backgroundColor: '#1b964e',
                borderRadius: 5
            }
        ];
    }

    staffingChartObj = new Chart(document.getElementById("staffingChart").getContext('2d'), {
        type: chartTypes.staffingChart || 'bar',
        data: {
            labels: staffingLabels,
            datasets: staffingDatasets
        },
        options: {
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            indexAxis: 'y', // तेर्सो बार चार्ट
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, ticks: { callback: (v) => toNepaliDigits(v) } }
            },
            plugins: {
                legend: { position: 'bottom', display: data.length !== 1 },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => {
                            const label = data.length === 1 ? ctx.label : ctx.dataset.label;
                            return ` ${label}: ${toNepaliDigits(ctx.raw)}`;
                        }
                    } 
                }
            }
        }
    });

    // ४. कार्यालयका सुविधाहरू (प्रश्न १३: f_1 देखि f_10)
    const facilityLabels = [
        "सहायता कक्ष", "अपाङ्गमैत्री", "प्रतिक्षालय", "शौचालय", "खानेपानी",
        "स्तनपान कक्ष", "धुम्रपान निषेध", "चमेना गृह", "उजुरी पेटिका", "वेवसाइट/सञ्जाल"
    ];
    
    let yesCounts = new Array(10).fill(0);
    let normalCounts = new Array(10).fill(0);
    let noCounts = new Array(10).fill(0);

    data.forEach(d => {
        for (let i = 1; i <= 10; i++) {
            let val = d[`f_${i}`];
            if (val === "छ" || val === "अध्यावधिक") yesCounts[i-1]++;
            else if (val === "सामान्य") normalCounts[i-1]++;
            else if (val === "छैन") noCounts[i-1]++;
        }
    });

    if (facilitiesChartObj) facilitiesChartObj.destroy();
    facilitiesChartObj = new Chart(document.getElementById("facilitiesChart").getContext('2d'), {
        type: chartTypes.facilitiesChart || 'bar',
        data: {
            labels: facilityLabels,
            datasets: [
                {
                    label: 'छ / अध्यावधिक',
                    data: yesCounts,
                    backgroundColor: '#27ae60'
                },
                {
                    label: 'सामान्य',
                    data: normalCounts,
                    backgroundColor: '#f1c40f'
                },
                {
                    label: 'छैन',
                    data: noCounts,
                    backgroundColor: '#e74c3c'
                }
            ]
        },
        options: {
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { ticks: { font: { size: 11 } } }
            },
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/**
 * सर्वेक्षण ड्यासबोर्डका लागि तथ्याङ्क कार्डहरू रेन्डर गर्ने
 */
function renderStats(data) {
    const total = data.length;
    const ghusCount = data.filter(d => (d.ghus_parera || "").trim() === "पर्‍यो").length;
    const femaleCount = data.filter(d => d.gender === "महिला").length;
    const maleCount = data.filter(d => d.gender === "पुरुष").length;
    const satCount = data.filter(d => (d.satisfaction_flag || "").trim() === "सन्तुष्ट").length;

    const container = document.getElementById("statCardsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(total)}</div><div>जम्मा प्रतिक्रिया</div></div>        
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(femaleCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (femaleCount/total*100).toFixed(1) : 0)}%)</span></div><div>महिला सेवाग्राही</div></div>
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(maleCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (maleCount/total*100).toFixed(1) : 0)}%)</span></div><div>पुरुष सेवाग्राही</div></div>
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(satCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (satCount/total*100).toFixed(1) : 0)}%)</span></div><div>सन्तुष्ट सेवाग्राही</div></div>
        <div class="stat-card"><div class="stat-number">${toNepaliDigits(ghusCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (ghusCount/total*100).toFixed(1) : 0)}%)</span></div><div>अतिरिक्त रकम तिर्नु परेको</div></div>
    `;
}

/**
 * सर्वेक्षण ड्यासबोर्डका लागि मुख्य चार्टहरू अपडेट गर्ने
 */
function updateCharts(data) {
    // लिङ्ग चार्ट
    let genderMap = { पुरुष: 0, महिला: 0, अन्य: 0 };
    data.forEach(d => { if (d.gender) genderMap[d.gender] = (genderMap[d.gender] || 0) + 1; });
    if (genderChartObj) genderChartObj.destroy();
    genderChartObj = new Chart(document.getElementById("genderChart").getContext('2d'), {
        type: chartTypes.genderChart,
        data: {
            labels: ["पुरुष", "महिला", "अन्य"],
            datasets: [{
                data: [genderMap.पुरुष, genderMap.महिला, genderMap.अन्य],
                backgroundColor: ['#3b82f6cc', '#ec4899cc', '#f59e0bcc'],
                borderColor: ['#3b82f6', '#ec4899', '#f59e0b'],
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: { animation: { duration: 2500, easing: 'easeInOutQuart' }, responsive: true, plugins: { legend: { display: true, position: 'bottom' } } }
    });

    // सन्तुष्टि चार्ट
    let satis = data.filter(d => d.satisfaction_flag === "सन्तुष्ट").length;
    let disSatis = data.filter(d => d.satisfaction_flag === "असन्तुष्ट").length;
    let mixedSatis = data.filter(d => d.satisfaction_flag === "मिश्रित").length;
    if (satisfactionChartObj) satisfactionChartObj.destroy();
    satisfactionChartObj = new Chart(document.getElementById("satisfactionChart").getContext('2d'), {
        type: chartTypes.satisfactionChart,
        data: {
            labels: ["सन्तुष्ट", "असन्तुष्ट", "मिश्रित"],
            datasets: [{
                data: [satis, disSatis, mixedSatis],
                backgroundColor: ['#10b981cc', '#ef4444cc', '#f59e0bcc'],
                borderColor: ['#10b981', '#ef4444', '#f59e0b'],
                borderWidth: 1,
                hoverOffset: 10
            }]
        },
        options: { animation: { duration: 2500, easing: 'easeInOutQuart' }, responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    // घुस/अतिरिक्त रकम चार्ट
    let ghusData = { पर्‍यो: data.filter(d => d.ghus_parera === "पर्‍यो").length, परेन: data.filter(d => d.ghus_parera === "परेन").length };
    if (ghusChartObj) ghusChartObj.destroy();
    ghusChartObj = new Chart(document.getElementById("ghusChart").getContext('2d'), {
        type: chartTypes.ghusChart,
        data: {
            labels: ["पर्‍यो", "परेन"],
            datasets: [{
                data: [ghusData.पर्‍यो, ghusData.परेन],
                backgroundColor: ['#ef4444cc', '#10b981cc'],
                borderColor: ['#ef4444', '#10b981'],
                borderWidth: 1,
                hoverOffset: 10
            }]
        },
        options: { animation: { duration: 2500, easing: 'easeInOutQuart' }, responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    // विकास जानकारी चार्ट
    let devCounts = {};
    data.forEach(d => {
        const val = d.bikas_janakari || "अज्ञात";
        devCounts[val] = (devCounts[val] || 0) + 1;
    });
    const devLabels = Object.keys(devCounts);
    const devPalette = ['#3b82f6', '#94a3b8', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (devChartObj) devChartObj.destroy();
    devChartObj = new Chart(document.getElementById("developmentChart").getContext('2d'), {
        type: chartTypes.developmentChart,
        data: {
            labels: devLabels,
            datasets: [{
                data: Object.values(devCounts),
                backgroundColor: devLabels.map((_, i) => devPalette[i % devPalette.length] + 'cc'),
                borderColor: ['#3b82f6', '#94a3b8'],
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: { 
            animation: { duration: 2500, easing: 'easeInOutQuart' }, 
            responsive: true, 
            plugins: { 
                legend: { display: devLabels.length > 2, position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } }
            } 
        }
    });
}

/**
 * सर्वेक्षण ड्यासबोर्डका लागि मुख्य तालिका रेन्डर गर्ने
 */
function renderTable(data) {
    const tbody = document.querySelector("#dataTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    data.slice(0, 50).forEach(r => {
        let statusClass = "";
        if (r.satisfaction_flag === "सन्तुष्ट") statusClass = "status-satisfied";
        else if (r.satisfaction_flag === "असन्तुष्ट") statusClass = "status-unsatisfied";
        else if (r.satisfaction_flag === "मिश्रित") statusClass = "status-mixed";

        let row = `<tr class="${statusClass}">
            <td data-label="मिति">${r.survey_date || ""}</td>
            <td data-label="जिल्ला">${r.jilla || ""}</td>
            <td data-label="लिङ्ग">${r.gender || ""}</td>
            <td data-label="कार्यालय">${r.mukhya_karyalay || ""}</td>
            <td data-label="अतिरिक्त रकम?">${r.ghus_parera || ""}</td>
            <td data-label="सहयोग">${r.sahayog_parera || ""}</td>
            <td data-label="सन्तुष्टि">${r.satisfaction_flag || ""}</td>
            <td data-label="विकास जानकारी">${r.bikas_janakari || ""}</td>
        </tr>`;
        tbody.insertAdjacentHTML("beforeend", row);
    });
}

/**
 * अनुगमन डाटाका लागि तालिका रेन्डर गर्ने
 */
function renderMonitoringTable(data) {
    const tbody = document.querySelector("#dataTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    data.forEach(r => {
        let row = `<tr>
            <td data-label="मिति">${r.m_date || ""}</td>
            <td data-label="जिल्ला">${r.m_jilla || ""}</td>
            <td data-label="कार्यालय">${r.m_office || ""}</td>
            <td data-label="नागरिक बडापत्र (डिजिटल/अडियो)">${r.m_q1 || "अज्ञात"}</td>
            <td data-label="मध्यस्तकर्ताको प्रवेश">${r.m_q5 || "अज्ञात"}</td>
            <td data-label="हाजिरीको अवस्था">${r.m_q9 || "अज्ञात"}</td>
            <td data-label="कुल दरबन्दी">${toNepaliDigits(r.d_total || 0)}</td>
            <td data-label="रिक्त">${toNepaliDigits(r.d_vacant || 0)}</td>
        </tr>`;
        tbody.insertAdjacentHTML("beforeend", row);
    });
}

/**
 * विशिष्ट प्रश्न विश्लेषण (Dynamic Analysis) अपडेट गर्ने
 */
function updateDynamicAnalysis(data) {
    const selector = document.getElementById("dynamicFieldSelector");
    if (!selector) return;
    const field = selector.value;
    const statRow = document.getElementById("dynamicStatRow");
    const chartRow = document.getElementById("dynamicChartRow");
    const labelEl = document.getElementById("dynamicChartLabel");

    if (!field) {
        if (statRow) statRow.style.display = "none";
        if (chartRow) chartRow.style.display = "none";
        return;
    }

    if (statRow) statRow.style.display = "flex";
    if (chartRow) chartRow.style.display = "flex";

    const selectedOption = selector.options[selector.selectedIndex];
    const fieldLabel = selectedOption.text;

    let counts = {};
    data.forEach(item => {
        let val = getVal(item, field, fieldLabel);
        if (val !== undefined && val !== null && val !== "" && val !== "undefined") {
            let parts = String(val).split(",").map(s => s.trim()).filter(s => s.length > 0);
            parts.forEach(p => {
                counts[p] = (counts[p] || 0) + 1;
            });
        }
    });

    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const totalVal = values.reduce((acc, curr) => acc + curr, 0);

    // यदि छानिएको फिल्डमा कुनै डाटा भेटिएन भने
    if (labels.length === 0) {
        if (statRow) statRow.innerHTML = '<div style="padding:25px; color:#666; width:100%; text-align:center; font-size:1rem; background:#f9fafb; border-radius:10px;">यो प्रश्न वा फिल्टरको लागि हाल कुनै तथ्याङ्क उपलब्ध छैन।</div>';
        if (dynamicChartObj) dynamicChartObj.destroy();
        if (labelEl) labelEl.textContent = `विश्लेषण: ${selector.options[selector.selectedIndex].text} (डाटा छैन)`;
        return;
    }

    // आकर्षक रङ्गीन थिम (Color Palette)
    const colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];
    const backgroundColors = labels.map((_, i) => colorPalette[i % colorPalette.length] + 'cc'); // 80% opacity
    const borderColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);

    // पुरानो चार्ट नष्ट गर्ने
    if (dynamicChartObj) dynamicChartObj.destroy();
    
    const ctx = document.getElementById("dynamicChart").getContext('2d');
    dynamicChartObj = new Chart(ctx, {
        type: chartTypes.dynamicChart || 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'संख्या',
                data: values,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            responsive: true,
            maintainAspectRatio: false,
            scales: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut') ? {} : {
                y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } },
                x: { ticks: { font: { family: 'Kalimati', size: 12 } } }
            },
            plugins: { 
                legend: { display: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut'), position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } }
            }
        }
    });

    const fieldName = selector.options[selector.selectedIndex].text;
    if (labelEl) labelEl.textContent = `विश्लेषण: ${fieldName}`;

    // तथ्याङ्क कार्डहरू अपडेट गर्ने - Colorful stat cards
    if (statRow) {
        statRow.innerHTML = labels.map((l, i) => `
            <div class="stat-card" style="min-width: 110px; padding: 8px 12px; flex: 1; border-top: 4px solid ${colorPalette[i % colorPalette.length]}; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); background: white;">
                <div class="stat-number" style="font-size: 1.25rem; color: ${colorPalette[i % colorPalette.length]}; margin-bottom: 4px;">${toNepaliDigits(counts[l])} <span style="font-size: 50%;">(${toNepaliDigits(totalVal > 0 ? (counts[l]/totalVal*100).toFixed(1) : 0)}%)</span></div>
                <div style="font-size: 0.9rem; font-weight: 600; color: #4a5568; line-height: 1.3;">${l}</div>
            </div>
        `).join('');
    }
}

/**
 * ड्यासबोर्ड भ्यू स्विच (सर्वेक्षण VS अनुगमन)
 */
function switchDashboardView(view) {
    currentDashboardView = view;
    
    const surveyBtn = document.getElementById("showSurveyView");
    const monitoringBtn = document.getElementById("showMonitoringView");
    const attendanceBtn = document.getElementById("showAttendanceView");
    const pdfBtn = document.getElementById("downloadAttendancePDF");
    const excelBtn = document.getElementById("exportAttendanceExcel");
    
    const tableHead = document.querySelector("#dataTable thead");
    const extraFilters = document.getElementById("attendanceExtraFilters");

    if (view === 'survey') {
        if(pdfBtn) pdfBtn.style.display = "none";
        if(excelBtn) excelBtn.style.display = "none";
        surveyBtn?.classList.add("active");
        monitoringBtn?.classList.remove("active");
        attendanceBtn?.classList.remove("active");
        if(extraFilters) extraFilters.style.display = "none";
        
        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'flex', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'flex', 'important');

        const dynamicAnalysis = document.getElementById("surveyDynamicAnalysis");
        if (dynamicAnalysis) {
            dynamicAnalysis.style.setProperty('display', 'block', 'important');
            const selectorDiv = dynamicAnalysis.querySelector(".filter-item");
            if (selectorDiv) selectorDiv.style.display = "flex"; // सर्वेक्षणमा यो फिल्टर पुनः देखाउने
        }
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringAlertsSection")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'none', 'important');

        if (tableHead) {
            tableHead.innerHTML = `<tr>
                <th>मिति</th>
                <th>जिल्ला</th>
                <th>लिङ्ग</th>
                <th>कार्यालय</th>
                <th>अतिरिक्त रकम दिनु पर्‍यो?</th>
                <th>सहयोग</th>
                <th>सन्तुष्टि</th>
                <th>विकास सम्बन्धी जानकारी भएको</th>
            </tr>`;
        }
        
        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "flex";
    } else if (view === 'attendance') {
        if(pdfBtn) pdfBtn.style.display = "block";
        if(excelBtn) excelBtn.style.display = "block";
        attendanceBtn?.classList.add("active");
        surveyBtn?.classList.remove("active");
        monitoringBtn?.classList.remove("active");
        if(extraFilters) extraFilters.style.display = "flex";

        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');
        
        const dynamicAnalysis = document.getElementById("surveyDynamicAnalysis");
        if (dynamicAnalysis) {
            dynamicAnalysis.style.setProperty('display', 'block', 'important');
            const selectorDiv = dynamicAnalysis.querySelector(".filter-item");
            if (selectorDiv) selectorDiv.style.display = "none"; // प्रश्न छान्ने फिल्टर लुकाउने
        }
        
        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'none', 'important');

        if (tableHead) {
            tableHead.innerHTML = `<tr>
                <th>मिति</th>
                <th>कार्यालय</th>
                <th>कर्मचारीको नाम</th>
                <th>पद</th>
                <th>संकेत नं.</th>
                <th>अपरिपालना प्रकार</th>
                <th colspan="2">कैफियत</th>
            </tr>`;
        }
        
        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "none";
    } else {
        if(pdfBtn) pdfBtn.style.display = "none";
        if(excelBtn) excelBtn.style.display = "none";
        monitoringBtn?.classList.add("active");
        surveyBtn?.classList.remove("active");
        attendanceBtn?.classList.remove("active");
        if(extraFilters) extraFilters.style.display = "none";
        
        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("surveyDynamicAnalysis")?.style.setProperty('display', 'none', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'flex', 'important');
        document.getElementById("monitoringAlertsSection")?.style.setProperty('display', 'block', 'important');
        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'block', 'important');

        if (tableHead) {
            tableHead.innerHTML = `<tr>
                <th>मिति</th>
                <th>जिल्ला</th>
                <th>कार्यालय</th>
                <th>नागरिक बडापत्र (डिजिटल/अडियो)</th>
                <th>मध्यस्तकर्ताको प्रवेश</th>
                <th>हाजिरीको अवस्था</th>
                <th>कुल दरबन्दी</th>
                <th>रिक्त</th>
            </tr>`;
        }
        
        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "none";

        const stored = localStorage.getItem("monitoringData_nsc");
        if (stored) allMonitorings = JSON.parse(stored);
    }
    refreshDashboard();
}

// इभेन्ट लिसनरहरू (बटनहरूले काम गर्ने बनाउन)
document.getElementById("showSurveyView")?.addEventListener("click", () => switchDashboardView('survey'));
document.getElementById("showMonitoringView")?.addEventListener("click", () => switchDashboardView('monitoring'));
document.getElementById("showAttendanceView")?.addEventListener("click", () => switchDashboardView('attendance'));
document.getElementById("downloadAttendancePDF")?.addEventListener("click", downloadAttendancePDF);
document.getElementById("exportAttendanceExcel")?.addEventListener("click", exportAttendanceToExcel);

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;
        if (!targetTab) return;

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-panel"));
        const targetPanel = document.getElementById(targetTab);
        if (targetPanel) {
            targetPanel.classList.add("active-panel");
        }

        if (targetTab === "dashboard-tab") {
            // ड्यासबोर्ड ट्याबमा क्लिक गर्दा डाटा लोड भएको सुनिश्चित गर्ने र सर्वेक्षण देखाउने
            switchDashboardView('survey');
        }
    });
});

document.getElementById("applyFilter")?.addEventListener("click", refreshDashboard);
document.getElementById("resetFilter")?.addEventListener("click", () => {
    document.getElementById("filterPradesh").value = "";
    document.getElementById("filterDistrict").innerHTML = '<option value="">सबै</option>';
    document.getElementById("filterOffice").value = "";
    document.getElementById("filterGender").value = "";
    if(document.getElementById("filterCategory")) document.getElementById("filterCategory").value = "";
    if(document.getElementById("filterEmpName")) document.getElementById("filterEmpName").value = "";
    if(document.getElementById("filterEmpSymbol")) document.getElementById("filterEmpSymbol").value = "";
    refreshDashboard();
});


/**
 * आवाज टाइप (Voice Typing) सुरु गर्ने फङ्सन
 */
function startVoiceTyping(event, targetId) {
    const btn = event.currentTarget;
    const target = document.getElementById(targetId);
    
    if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
        Swal.fire({
            icon: 'error',
            title: 'सुविधा उपलब्ध छैन',
            text: 'तपाईंको ब्राउजरमा आवाज टाइप गर्ने सुविधा छैन। कृपया Chrome ब्राउजर प्रयोग गर्नुहोस्।',
            confirmButtonColor: '#387ae6'
        });
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'ne-NP'; // नेपाली भाषा सेट गरिएको
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        btn.classList.add('recording');
        const textSpan = btn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = "सुन्दैछ...";
    };

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        // पुरानो टेक्स्टमा नयाँ आवाज टाइप गरिएको टेक्स्ट थप्ने
        target.value = (target.value ? target.value.trim() + ' ' : '') + transcript;
        target.dispatchEvent(new Event('input')); // वर्ड काउन्टर वा अन्य इभेन्ट अपडेट गर्न
    };

    recognition.onerror = () => stopRecording(btn);
    recognition.onend = () => stopRecording(btn);

    function stopRecording(button) {
        button.classList.remove('recording');
        const textSpan = button.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = "आवाज टाइप";
    }

    recognition.start();
}

/**
 * इन्पुट फिल्ड खाली (Clear) गर्ने फङ्सन
 */
function clearInput(targetId) {
    const target = document.getElementById(targetId);
    if (target) {
        target.value = '';
        target.dispatchEvent(new Event('input'));
    }
}
loadData();

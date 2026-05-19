// Google Apps Script Web App URL (Replace with actual deployed URL)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzG60h4pAfcXvecnnDj2BrM12zPTfZl55TD7C0MmQOFFyORgOQQ8Wc3cvBnur2v04Zp/exec";  // यहाँ तपाईंको Google Apps Script Web App URL राख्नुहोस्, example: "https://script.google.com/macros/s/XXXX/exec"
let allSubmissions = [];

// Province, District, and Municipality Data
let topUnsatisfiedChartObj, topSatisfiedChartObj;

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
    const pradeshSelects = [document.getElementById("pradesh"), document.getElementById("filterPradesh")];
    pradeshSelects.forEach(sel => {
        if (!sel) return;
        for (const [id, name] of Object.entries(PROVINCE)) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = name;
            sel.appendChild(option);
        }
    });
}

// Update Districts based on Province
function updateDistricts() {
    const pradeshId = document.getElementById("pradesh").value;
    const jillaSelect = document.getElementById("jilla");
    const sthaaniyaSelect = document.getElementById("sthaaniya_taha");

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
function updateMunicipalities() {
    const pradeshId = document.getElementById("pradesh").value;
    const district = document.getElementById("jilla").value;
    const sthaaniyaSelect = document.getElementById("sthaaniya_taha");

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
    document.getElementById("pradesh").addEventListener("change", updateDistricts);
    document.getElementById("jilla").addEventListener("change", updateMunicipalities);
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
        { inputId: "sujhaw", counterId: "sujhaw_counter", limit: 100 }
    ];

    countersToSetup.forEach(item => {
        const el = document.getElementById(item.inputId);
        if (el) {
            el.addEventListener('input', () => updateWordCountDisplay(el, item.counterId, item.limit));
        }
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
    dynamicChart: 'bar' // Default for dynamic chart
};

// Define cycles for each chart
const CHART_TYPE_CYCLES = {
    genderChart: ['bar', 'pie', 'doughnut'],
    satisfactionChart: ['doughnut', 'pie', 'bar'],
    ghusChart: ['pie', 'doughnut', 'bar'],
    developmentChart: ['bar', 'pie', 'doughnut'],
    topUnsatisfiedChart: ['bar', 'pie', 'doughnut'],
    topSatisfiedChart: ['bar', 'pie', 'doughnut'],
    dynamicChart: ['bar', 'pie', 'doughnut', 'line'] // Added line for dynamic
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
        const colors = ['#e63946', '#f4a261', '#e9c46a']; // नयाँ रङ योजना
        return `
        <div class="stat-card" style="border-left: 3px solid ${colors[index]}; margin-bottom: 5px; text-align: left; background: white; padding: 6px 10px;">
            <div style="font-size: 0.95rem; font-weight: bold; color: #de3053; margin-bottom: 2px;">
                ${toNepaliDigits(index + 1)}. ${office}
            </div>
            <div style="font-size: 0.85rem;">असन्तुष्टि संख्या: <strong>${toNepaliDigits(count)}</strong></div>
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
                backgroundColor: ['#de3053', '#f19086', '#ffb366'],
                borderRadius: 5
            }]
        },
        options: {
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
        const colors = ['#27ae60', '#2ecc71', '#a1f0c0'];
        return `
        <div class="stat-card" style="border-left: 3px solid ${colors[index]}; margin-bottom: 5px; text-align: left; background: white; padding: 6px 10px;">
            <div style="font-size: 0.95rem; font-weight: bold; color: #27ae60; margin-bottom: 2px;">
                ${toNepaliDigits(index + 1)}. ${office}
            </div>
            <div style="font-size: 0.85rem;">सन्तुष्टि संख्या: <strong>${toNepaliDigits(count)}</strong></div>
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
                backgroundColor: ['#27ae60', '#2ecc71', '#5cd68d'],
                borderRadius: 5
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } }, y: { ticks: { font: { family: 'Kalimati' } } } } }
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
                const sheetData = await response.json();
                if(Array.isArray(sheetData)) {
                    allSubmissions = sheetData.reverse(); // Reverse so latest comes first
                    localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions));
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

// Dashboard rendering
function refreshDashboard() {
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
        if (pradeshFilter && r.pradesh !== PROVINCE[pradeshFilter]) return false;
        if (districtFilter && r.jilla !== districtFilter) return false;
        if (sthaaniyaFilter && r.sthaaniya_taha !== sthaaniyaFilter) return false;
        if (officeFilter && !(r.mukhya_karyalay || "").toLowerCase().includes(officeFilter)) return false;
        if (genderF && r.gender !== genderF) return false;
        
        // फिल्टरको लागि वर्णनात्मक मितिलाई मानक (YYYY-MM-DD) मा बदलेर तुलना गर्ने
        let recDate = getStandardDate(r.survey_date || "");
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

function renderStats(data) {
    const total = data.length;
    const ghusCount = data.filter(d => (d.ghus_parera || "").trim() === "पर्‍यो").length;
    const femaleCount = data.filter(d => d.gender === "महिला").length;
    const maleCount = data.filter(d => d.gender === "पुरुष").length;
    const devInfo = data.filter(d => (d.bikas_janakari || "").trim() === "छ").length;
    const satCount = data.filter(d => (d.satisfaction_flag || "").trim() === "सन्तुष्ट" || (d.satisfaction_flag || "").trim() === "मिश्रित").length;

    document.getElementById("statCardsContainer").innerHTML = `
        <div class="stat-card"><div class="stat-number">${total}</div><div>जम्मा प्रतिक्रिया</div></div>        
        <div class="stat-card"><div class="stat-number">${femaleCount}</div><div>महिला सेवाग्राही</div></div>
        <div class="stat-card"><div class="stat-number">${maleCount}</div><div>पुरुष सेवाग्राही</div></div>
        <div class="stat-card"><div class="stat-number">${satCount}</div><div>सन्तुष्ट सेवाग्राही</div></div>
        <div class="stat-card"><div class="stat-number">${ghusCount}</div><div>अतिरिक्त रकम दिनु परेको</div></div>
        <div class="stat-card"><div class="stat-number">${devInfo}</div><div>विकास सम्बन्धी जानकारी भएको</div></div>
    `;
}

let genderChartObj, satisfactionChartObj, ghusChartObj, devChartObj;
function updateCharts(data) {
    let genderMap = { पुरुष: 0, महिला: 0, अन्य: 0 };
    data.forEach(d => { if (d.gender) genderMap[d.gender] = (genderMap[d.gender] || 0) + 1; });
    if (genderChartObj) genderChartObj.destroy();
    
    // Create gradients for Gender Chart
    const genderCtx = document.getElementById("genderChart").getContext('2d'); // Moved inside to ensure context is fresh
    const blueGrad = genderCtx.createLinearGradient(0, 0, 0, 200);
    blueGrad.addColorStop(0, '#457b9d'); blueGrad.addColorStop(1, '#a8dadc'); // नयाँ ग्रेडिएन्ट
    const redGrad = genderCtx.createLinearGradient(0, 0, 0, 200);
    redGrad.addColorStop(0, '#e63946'); redGrad.addColorStop(1, '#f1faee');
    const yellowGrad = genderCtx.createLinearGradient(0, 0, 0, 200);
    yellowGrad.addColorStop(0, '#f4a261'); yellowGrad.addColorStop(1, '#e9c46a');

    genderChartObj = new Chart(genderCtx, {
        type: chartTypes.genderChart, // Use dynamic type
        data: {
            labels: ["पुरुष", "महिला", "अन्य"],
            datasets: [{
                label: "संख्या",
                data: [genderMap.पुरुष, genderMap.महिला, genderMap.अन्य],
                backgroundColor: [blueGrad, redGrad, yellowGrad],
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#e8ecf1' } },
                x: { grid: { display: false } }
            }
        }
    });

    let ghusData = { पर्‍यो: data.filter(d => d.ghus_parera === "पर्‍यो").length, परेन: data.filter(d => d.ghus_parera === "परेन").length };
    if (ghusChartObj) ghusChartObj.destroy();

    const ghusCtx = document.getElementById("ghusChart").getContext('2d');
    const ghusRedGrad = ghusCtx.createLinearGradient(0, 0, 0, 200); // Moved inside
    ghusRedGrad.addColorStop(0, '#d65e51'); ghusRedGrad.addColorStop(1, '#f19086');
    const ghusGreenGrad = ghusCtx.createLinearGradient(0, 0, 0, 200);
    ghusGreenGrad.addColorStop(0, '#27ae60'); ghusGreenGrad.addColorStop(1, '#5cd68d');

    ghusChartObj = new Chart(ghusCtx, {
        type: chartTypes.ghusChart,
        data: {
            labels: ["पर्‍यो", "परेन"], // Simplified labels for better chart display
            datasets: [{
                data: [ghusData.पर्‍यो, ghusData.परेन],
                backgroundColor: [ghusRedGrad, ghusGreenGrad],
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 1500,
                easing: 'easeOutCirc'
            },
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, usePointStyle: true } }
            }
        }
    });

    let satis = data.filter(d => d.satisfaction_flag === "सन्तुष्ट").length;
    let disSatis = data.filter(d => d.satisfaction_flag === "असन्तुष्ट").length;
    let mixedSatis = data.filter(d => d.satisfaction_flag === "मिश्रित").length;

    if (satisfactionChartObj) satisfactionChartObj.destroy();

    const satCtx = document.getElementById("satisfactionChart").getContext('2d');
    const satGreenGrad = satCtx.createLinearGradient(0, 0, 0, 200); // Moved inside
    satGreenGrad.addColorStop(0, '#27ae60'); satGreenGrad.addColorStop(1, '#5cd68d');
    const satOrangeGrad = satCtx.createLinearGradient(0, 0, 0, 200);
    satOrangeGrad.addColorStop(0, '#e67e22'); satOrangeGrad.addColorStop(1, '#ffb366');
    const satYellowGrad = satCtx.createLinearGradient(0, 0, 0, 200);
    satYellowGrad.addColorStop(0, '#f1c40f'); satYellowGrad.addColorStop(1, '#f9e79f');

    satisfactionChartObj = new Chart(satCtx, {
        type: chartTypes.satisfactionChart,
        data: {
            labels: ["सन्तुष्ट", "असन्तुष्ट", "मिश्रित"],
            datasets: [{
                data: [satis, disSatis, mixedSatis],
                backgroundColor: [satGreenGrad, satOrangeGrad, satYellowGrad],
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 1500,
                easing: 'easeOutBack'
            },
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, usePointStyle: true } }
            }
        }
    });

    let devKnown = data.filter(d => d.bikas_janakari === "छ").length;
    let devUnknown = data.filter(d => d.bikas_janakari === "छैन").length;
    if (devChartObj) devChartObj.destroy();

    const devCtx = document.getElementById("developmentChart").getContext('2d');
    const devBlueGrad = devCtx.createLinearGradient(0, 0, 0, 200); // Moved inside
    devBlueGrad.addColorStop(0, '#3498db'); devBlueGrad.addColorStop(1, '#85c1e9');
    const devGreyGrad = devCtx.createLinearGradient(0, 0, 0, 200);
    devGreyGrad.addColorStop(0, '#95a5a6'); devGreyGrad.addColorStop(1, '#bdc3c7');

    devChartObj = new Chart(devCtx, {
        type: chartTypes.developmentChart,
        data: {
            labels: ["छ", "छैन"], // Simplified labels
            datasets: [{
                label: "विकास योजना जानकारी",
                data: [devKnown, devUnknown],
                backgroundColor: [devBlueGrad, devGreyGrad],
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#e8ecf1' } },
                x: { grid: { display: false } }
            }
        }
    });
}

let dynamicChartObj;
function updateDynamicAnalysis(data) {
    const field = document.getElementById("dynamicFieldSelector")?.value;
    const statContainer = document.getElementById("dynamicStatRow");
    const chartContainer = document.getElementById("dynamicChartRow");

    if (!field || data.length === 0) {
        if (statContainer) statContainer.style.display = "none";
        if (chartContainer) chartContainer.style.display = "none";
        return;
    }

    statContainer.style.display = "flex";
    chartContainer.style.display = "flex";

    // बहु-विकल्प (Checkboxes) भएका फिल्डहरूको सूची
    const multiSelectFields = ['santushti_positive', 'santushti_negative', 'asantushti_karan_yojana', 'helper_type', 'ghus_diye_kaslai'];

    let counts = {};
    data.forEach(item => {
        let val = item[field];
        if (Array.isArray(val)) {
            val.forEach(v => { 
                if (v) {
                    // "अन्य: विवरण" लाई "अन्य" मा गाभ्ने
                    let processed = v.startsWith("अन्य:") ? "अन्य" : 
                                   (v.startsWith("अन्य (लेख्नुहोस्):") ? "अन्य (लेख्नुहोस्)" : v);
                    counts[processed] = (counts[processed] || 0) + 1; 
                }
            });
        } else if (val && typeof val === 'string') {
            if (multiSelectFields.includes(field)) {
                // कमाले जोडिएका स्ट्रिङलाई टुक्राएर प्रत्येक विकल्प गणना गर्ने
                val.split(',').map(s => s.trim()).filter(s => s).forEach(p => {
                    // "अन्य: विवरण" लाई "अन्य" मा गाभ्ने
                    let processed = p.startsWith("अन्य:") ? "अन्य" : 
                                   (p.startsWith("अन्य (लेख्नुहोस्):") ? "अन्य (लेख्नुहोस्)" : p);
                    counts[processed] = (counts[processed] || 0) + 1;
                });
            } else {
                counts[val] = (counts[val] || 0) + 1;
            }
        }
    });

    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const totalSum = values.reduce((a, b) => a + b, 0);
    const percentages = values.map(v => ((v / totalSum) * 100).toFixed(1));

    let maxVal = 0;
    let topLabel = "छैन";
    labels.forEach(l => {
        if (counts[l] > maxVal) {
            maxVal = counts[l];
            topLabel = l;
        }
    });
    const maxPercentage = totalSum > 0 ? ((maxVal / totalSum) * 100).toFixed(1) : 0;

    statContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${maxVal} (${maxPercentage}%)</div>
            <div>सबैभन्दा धेरै चुनिएको: <strong>${topLabel}</strong></div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${data.length}</div>
            <div>विश्लेषण गरिएको जम्मा प्रतिक्रिया संख्या</div>
        </div>
    `;

    if (dynamicChartObj) dynamicChartObj.destroy();
    const ctx = document.getElementById("dynamicChart").getContext('2d');

    const colorPairs = [
        ['#264653', '#2a9d8f'], ['#e9c46a', '#f4a261'], ['#e76f51', '#f4a261'], // Updated color pairs
        ['#606c38', '#283618'], ['#bc6c25', '#dda15e'], ['#00b4d8', '#90e0ef'],
        ['#3d5a80', '#98c1d9'], ['#ee6c4d', '#293241'] // डाइनामिक चार्टका लागि नयाँ रङहरू
    ];
    const dynamicGradients = colorPairs.map(pair => {
        const g = ctx.createLinearGradient(0, 0, 0, 400);
        g.addColorStop(0, pair[0]); g.addColorStop(1, pair[1]);
        return g;
    });

    dynamicChartObj = new Chart(ctx, {
        type: chartTypes.dynamicChart, // Use dynamic type
        data: {
            labels: labels,
            datasets: [{ 
                label: 'प्रतिशत (%)', 
                data: percentages, 
                backgroundColor: dynamicGradients 
            }]
        },
        options: { 
            responsive: true, 
            animation: {
                duration: 1200,
                easing: 'easeInOutQuart'
            },
            plugins: { 
                legend: { position: labels.length > 5 ? 'top' : 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = values[context.dataIndex];
                            return ` ${context.label}: ${context.raw}% (संख्या: ${val})`;
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const clickedIndex = elements[0].index;
                    const clickedLabel = labels[clickedIndex];
                    // Pass the original filtered data to the detailed table renderer
                    renderDetailedTable(field, clickedLabel, data);
                }
            }
        }
    });
    document.getElementById("dynamicChartLabel").textContent = document.querySelector(`#dynamicFieldSelector option[value="${field}"]`).textContent + " को विश्लेषण";
}

function renderDetailedTable(field, clickedLabel, originalFilteredData) {
    const detailTableContainer = document.getElementById("dynamicDetailTableContainer");
    const detailTableTitle = document.getElementById("detailTableTitle");
    const detailTableBody = document.querySelector("#dynamicDetailTable tbody");

    detailTableBody.innerHTML = ""; // Clear previous data
    detailTableTitle.textContent = `"${clickedLabel}"`; // Set title

    const multiSelectFields = ['santushti_positive', 'santushti_negative', 'asantushti_karan_yojana', 'helper_type', 'ghus_diye_kaslai'];

    const filteredDetails = originalFilteredData.filter(item => {
        let val = item[field];
        if (!val) return false;

        if (Array.isArray(val)) {
            return val.some(v => {
                let processed = v.startsWith("अन्य:") ? "अन्य" : 
                               (v.startsWith("अन्य (लेख्नुहोस्):") ? "अन्य (लेख्नुहोस्)" : v);
                return processed === clickedLabel;
            });
        } else if (typeof val === 'string') {
            if (multiSelectFields.includes(field)) {
                return val.split(',').map(s => s.trim()).filter(s => s).some(p => {
                    let processed = p.startsWith("अन्य:") ? "अन्य" : 
                                   (p.startsWith("अन्य (लेख्नुहोस्):") ? "अन्य (लेख्नुहोस्)" : p);
                    return processed === clickedLabel;
                });
            } else {
                return val === clickedLabel;
            }
        }
        return false;
    });

    filteredDetails.forEach(r => {
        let statusClass = "";
        if (r.satisfaction_flag === "सन्तुष्ट") statusClass = "status-satisfied";
        else if (r.satisfaction_flag === "असन्तुष्ट") statusClass = "status-unsatisfied";
        else if (r.satisfaction_flag === "मिश्रित") statusClass = "status-mixed";

        let specificReason = r[field]; // Default to the field value
        if (multiSelectFields.includes(field) && typeof r[field] === 'string') {
            // For multi-select, show the full string of reasons
            specificReason = r[field];
        }

        let row = `<tr class="${statusClass}">
            <td data-label="मिति">${r.survey_date || ""}</td>
            <td data-label="जिल्ला">${r.jilla || ""}</td>
            <td data-label="लिङ्ग">${r.gender || ""}</td>
            <td data-label="कार्यालय">${r.mukhya_karyalay || ""}</td>
            <td data-label="सन्तुष्टि">${r.satisfaction_flag || ""}</td>
            <td data-label="चुनिएको कारण">${specificReason || ""}</td>
        </tr>`;
        detailTableBody.insertAdjacentHTML("beforeend", row);
    });

    detailTableContainer.style.display = "block";
    document.getElementById("closeDetailTable").onclick = () => {
        detailTableContainer.style.display = "none";
    };
}

function renderTable(data) {
    let tbody = document.querySelector("#dataTable tbody");
    tbody.innerHTML = "";
    data.slice(0, 60).forEach(r => {
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

document.getElementById("applyFilter")?.addEventListener("click", () => {
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "फिल्टर लागू हुँदैछ, कृपया पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }

    // ब्राउजरलाई स्पिनर देखाउन समय दिन र सहज अनुभवको लागि थोरै ढिलाइ (400ms) राखिएको
    setTimeout(() => {
        refreshDashboard();
        if (loadingOverlay) loadingOverlay.style.display = "none";
    }, 400);
});

document.getElementById("resetFilter")?.addEventListener("click", () => {
    if (document.getElementById("filterPradesh")) document.getElementById("filterPradesh").value = "";
    updateFilterDistricts();
    if (document.getElementById("filterOffice")) document.getElementById("filterOffice").value = "";
    if (document.getElementById("filterGender")) document.getElementById("filterGender").value = "";
    if (document.getElementById("filterDateFrom")) document.getElementById("filterDateFrom").value = "";
    if (document.getElementById("filterDateTo")) document.getElementById("filterDateTo").value = "";
    refreshDashboard();
});
document.getElementById("dynamicFieldSelector")?.addEventListener("change", () => refreshDashboard());
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-panel"));
        document.getElementById(btn.dataset.tab).classList.add("active-panel");
        if (btn.dataset.tab === "dashboard-tab") {
            refreshDashboard();
            if(SCRIPT_URL) loadData(); // Reload latest data from Google Sheets when dashboard opens
        }
    });
});

// Event listener for chart type cycle buttons
document.addEventListener("DOMContentLoaded", function() {
    // ... existing DOMContentLoaded code ...

    document.querySelectorAll(".chart-type-cycle-btn").forEach(button => {
        button.addEventListener("click", function() {
            const chartId = this.dataset.chartId;
            const currentType = chartTypes[chartId];
            const cycle = CHART_TYPE_CYCLES[chartId];
            if (!cycle) return;

            const currentIndex = cycle.indexOf(currentType);
            const nextIndex = (currentIndex + 1) % cycle.length;
            const nextType = cycle[nextIndex];

            chartTypes[chartId] = nextType;
            refreshDashboard(); // Re-render all charts with new type
        });
    });
});

// Function to clear input field
function clearInput(targetId) {
    document.getElementById(targetId).value = "";
}

// Voice Typing Functionality
function startVoiceTyping(event, targetId) {
    const btn = event.currentTarget;
    
    // यदि पहिले नै रेकर्डिङ भइरहेको छ भने यसलाई रोक्ने
    if (btn.classList.contains('recording') && btn._recognition) {
        btn._recognition.stop();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        Swal.fire({
            title: 'सुविधा उपलब्ध छैन',
            text: 'तपाईंको ब्राउजरले आवाज टाइप गर्ने सुविधा समर्थन गर्दैन। कृपया Google Chrome प्रयोग गर्नुहोस्।',
            icon: 'warning',
            confirmButtonText: 'ठीक छ'
        });
        return;
    }

    const targetInput = document.getElementById(targetId);
    const recognition = new SpeechRecognition();
    btn._recognition = recognition; // रेकर्डिङ इन्स्टन्स सेभ गर्ने
    
    recognition.lang = 'ne-NP';
    recognition.interimResults = true;
    recognition.continuous = true;

    if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.innerHTML;
    }

    btn.innerHTML = '🛑 <span class="btn-text">रोक्नुहोस्</span>';
    btn.classList.add('recording');

    const baseValue = targetInput.value;

    recognition.onresult = (e) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                finalTranscript += e.results[i][0].transcript;
            } else {
                interimTranscript += e.results[i][0].transcript;
            }
        }

        if (targetInput) {
            const space = baseValue && (finalTranscript || interimTranscript) ? " " : "";
            targetInput.value = baseValue + space + finalTranscript + interimTranscript;
            // म्यानुअल रूपमा input इभेन्ट ट्रिगर गर्ने ताकि काउन्टर अपडेट होस्
            targetInput.dispatchEvent(new Event('input'));
        }
    };

    recognition.onend = () => {
        btn.innerHTML = btn.dataset.originalText;
        btn.classList.remove('recording');
        delete btn._recognition;
    };

    recognition.onerror = () => {
        btn.innerHTML = btn.dataset.originalText;
        btn.classList.remove('recording');
        delete btn._recognition;
    };

    recognition.start();
}

loadData();

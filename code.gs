// १. आफ्नो Spreadsheet ID यहाँ राख्नुहोस्
const SPREADSHEET_ID = '14ztu10pMGHsIVlxS8o3j-MfY2nBaUk_gV2t_InKmJkA';
// २. आफ्नो Sheet को नाम यहाँ राख्नुहोस् (Example: 'Sheet1')
const SHEET_NAME = 'Sheet1';
const MONITORING_SHEET_NAME = 'Monitoring'; // अनुगमन फारमको लागि नयाँ सिट
const ATTENDANCE_MAIN_SHEET = 'AttendanceMain'; // समय पालना मुख्य विवरण
const ATTENDANCE_DETAIL_SHEET = 'AttendanceDetail'; // कर्मचारीगत विवरण

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var data = JSON.parse(e.postData.contents);
    
    // बहु-विकल्प (Arrays) लाई मिलाउने (String बनाउने)
    Object.keys(data).forEach(function(key) {
      // 'rows' लाई स्ट्रिङमा नबदल्ने ताकि कर्मचारी विवरणहरू सुरक्षित रहून्
      if (key !== 'rows' && Array.isArray(data[key])) {
        data[key] = data[key].join(", ");
      }
    });

    if (data.type === 'monitoring') {
      // १. अनुगमन फारम सुरक्षित गर्ने
      var mSheet = ss.getSheetByName(MONITORING_SHEET_NAME) || ss.insertSheet(MONITORING_SHEET_NAME);
      mSheet.appendRow([
        data.timestamp, data.m_date, data.m_pradesh, data.m_jilla, data.m_sthaaniya, data.m_office,
        data.m_q1, data.m_q2, data.m_q3, data.m_q4, data.m_q5, 
        data.m_q6, data.m_q7, data.m_q8, data.m_q9, data.m_q10, data.m_q11, data.m_q12,
        data.f_1, data.f_2, data.f_3, data.f_4, data.f_5, data.f_6, data.f_7, data.f_8, data.f_9, data.f_10,
        data.m_main_services, data.m_problems, data.m_measures,
        data.d_total, data.d_working, data.d_vacant, data.d_pending, data.d_excess,
        data.m_comment, data.monitor_name, data.monitor_rank
      ]);
    } else if (data.type === 'attendance') {
      // ३. समय पालना/पोशाक अनुगमन सुरक्षित गर्ने
      var amSheet = ss.getSheetByName(ATTENDANCE_MAIN_SHEET) || ss.insertSheet(ATTENDANCE_MAIN_SHEET);
      var adSheet = ss.getSheetByName(ATTENDANCE_DETAIL_SHEET) || ss.insertSheet(ATTENDANCE_DETAIL_SHEET);
      
      amSheet.appendRow([
        data.timestamp, data.pradesh, data.jilla, data.sthaaniya,
        data.office, data.total_staff, data.working_staff, data.vacant_staff, 
        data.date, data.time, data.phone, data.monitor_name, data.monitor_rank, 
        data.a_office_officer, data.a_office_rank
      ]);
      
      if (data.rows && Array.isArray(data.rows)) {
        data.rows.forEach(function(row) {
          adSheet.appendRow([data.timestamp, row.category, row.rank, row.symbol, row.name, row.extra]);
        });
      }
    } else {
      // २. सेवाग्राही सर्वेक्षण सुरक्षित गर्ने
      var sheet = ss.getSheetByName(SHEET_NAME);
      var failureReasons = [data.karan_kagajat, data.karan_karmachari, data.karan_na, data.karan_ghus].filter(Boolean).join(", ");

      sheet.appendRow([
        data.timestamp, data.survey_date, data.pradesh, data.jilla, data.sthaaniya_taha, data.gender,
        data.karyalay_1, data.karyalay_2, data.karyalay_3, data.mukhya_karyalay,
        data.janakari_chha, data.samay_janakari, data.kaam_bhayeko, failureReasons,
        data.sahayog_parera, data.helper_type, data.ghus_parera, data.ghus_diye_kaslai,
        data.main_satisfaction, data.santushti_positive, data.santushti_negative,
        data.satisfaction_flag, data.sujhaw, data.ramro_karyalay, data.weak_karyalay,
        data.suchana_hak, data.ujuri_gareko, data.sunuwai_sahabhagi, data.bikas_janakari,
        data.bikas_sahabhagi, data.gunastar, data.suchana_pati, data.yojana_santushti,
        data.asantushti_karan_yojana, data.asantushti_karan_other
      ]);
    }

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function doGet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // सर्वेक्षण डाटा ल्याउने
  var sSheet = ss.getSheetByName(SHEET_NAME);
  var surveyData = [];
  if (sSheet && sSheet.getLastRow() > 1) {
  var sRows = sSheet.getDataRange().getValues();
  for (var i = 1; i < sRows.length; i++) {
    // यदि मिति वा कार्यालय खाली छ भने त्यस्तो रेकर्ड नलिने
    if (!sRows[i][1] && !sRows[i][9]) continue;

    surveyData.push({
      timestamp: sRows[i][0],
      survey_date: sRows[i][1],
      pradesh: sRows[i][2],
      jilla: sRows[i][3],
      sthaaniya_taha: sRows[i][4],
      gender: sRows[i][5],
      mukhya_karyalay: sRows[i][9],
      janakari_chha: sRows[i][10],
      samay_janakari: sRows[i][11],
      kaam_bhayeko: sRows[i][12],
      sahayog_parera: sRows[i][14],
      helper_type: sRows[i][15],
      ghus_parera: sRows[i][16],
      ghus_diye_kaslai: sRows[i][17],
      main_satisfaction: sRows[i][18],
      santushti_positive: sRows[i][19],
      santushti_negative: sRows[i][20],
      satisfaction_flag: sRows[i][21],
      suchana_hak: sRows[i][25],
      ujuri_gareko: sRows[i][26],
      sunuwai_sahabhagi: sRows[i][27],
      bikas_janakari: sRows[i][28],
      bikas_sahabhagi: sRows[i][29],
      gunastar: sRows[i][30],
      suchana_pati: sRows[i][31],
      yojana_santushti: sRows[i][32],
      asantushti_karan_yojana: sRows[i][33],
      asantushti_karan_other: sRows[i][34]
    });
  }
  }

  // अनुगमन डाटा ल्याउने
  var mSheet = ss.getSheetByName(MONITORING_SHEET_NAME);
  var monitoringData = [];
  if (mSheet) {
    var mRows = mSheet.getDataRange().getValues();
    for (var j = 1; j < mRows.length; j++) {
      monitoringData.push({
        timestamp: mRows[j][0], m_date: mRows[j][1], m_pradesh: mRows[j][2], m_jilla: mRows[j][3],
        m_office: mRows[j][5], m_q1: mRows[j][6], m_q5: mRows[j][10], 
        m_q6: mRows[j][11], m_q7: mRows[j][12], m_q8: mRows[j][13], 
        m_q9: mRows[j][14], m_q10: mRows[j][15], m_q11: mRows[j][16], m_q12: mRows[j][17],
        f_1: mRows[j][18], f_2: mRows[j][19], f_3: mRows[j][20], f_4: mRows[j][21], f_5: mRows[j][22],
        f_6: mRows[j][23], f_7: mRows[j][24], f_8: mRows[j][25], f_9: mRows[j][26], f_10: mRows[j][27],
        m_main_services: mRows[j][28], m_problems: mRows[j][29], m_measures: mRows[j][30],
        d_total: mRows[j][31], d_working: mRows[j][32], d_vacant: mRows[j][33], d_pending: mRows[j][34], d_excess: mRows[j][35],
        m_comment: mRows[j][36], monitor_name: mRows[j][37], monitor_rank: mRows[j][38]
      });
    }
  }

  // समय पालना/पोशाक अनुगमन डाटा ल्याउने
  var amSheet = ss.getSheetByName(ATTENDANCE_MAIN_SHEET);
  var adSheet = ss.getSheetByName(ATTENDANCE_DETAIL_SHEET);
  var attendanceData = [];
  
  if (amSheet && adSheet) {
    var mRows = amSheet.getDataRange().getValues();
    var dRows = adSheet.getDataRange().getValues();
    
    for (var k = 1; k < mRows.length; k++) {
      var timestamp = mRows[k][0];
      var details = [];
      
      // सम्बन्धित कर्मचारी विवरणहरू फिल्टर गर्ने
      for (var l = 1; l < dRows.length; l++) {
        if (dRows[l][0] === timestamp) {
          details.push({
            category: dRows[l][1], rank: dRows[l][2], symbol: dRows[l][3], name: dRows[l][4], extra: dRows[l][5]
          });
        }
      }
      
      attendanceData.push({
        timestamp: timestamp,
        pradesh: mRows[k][1],
        jilla: mRows[k][2],
        sthaaniya: mRows[k][3],
        office: mRows[k][4],
        total_staff: mRows[k][5],
        working_staff: mRows[k][6],
        vacant_staff: mRows[k][7],
        date: mRows[k][8],
        time: mRows[k][9],
        phone: mRows[k][10],
        monitor_name: mRows[k][11],
        rows: details
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    survey: surveyData,
    monitoring: monitoringData,
    attendance: attendanceData
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * आवश्यक Google Sheets र तिनीहरूको हेडरहरू अटोमेटिक सेटअप गर्नका लागि यो फङ्सन एक पटक चलाउनुहोस्।
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // १. AttendanceMain Sheet सेटअप
  let amSheet = ss.getSheetByName(ATTENDANCE_MAIN_SHEET);
  if (!amSheet) {
    amSheet = ss.insertSheet(ATTENDANCE_MAIN_SHEET);
    amSheet.appendRow([
      "Timestamp", "प्रदेश", "जिल्ला", "स्थानीय तह", "कार्यालयको नाम/ठेगाना", 
      "कुल दरबन्दी संख्या", "हाल कार्यरत संख्या", "रिक्त संख्या", 
      "अनुगमन गरेको मिति", "अनुगमन गरेको समय", "कार्यालयको फोन नं.", 
      "अनुगमन टोली प्रमुखको नाम", "अनुगमन टोली प्रमुखको पद", 
      "सम्बन्धित कार्यालयको अधिकृतको नाम", "सम्बन्धित कार्यालयको अधिकृतको पद"
    ]);
  }

  // २. AttendanceDetails Sheet सेटअप
  let adSheet = ss.getSheetByName(ATTENDANCE_DETAIL_SHEET);
  if (!adSheet) {
    adSheet = ss.insertSheet(ATTENDANCE_DETAIL_SHEET);
    adSheet.appendRow([
      "Timestamp", "विवरण प्रकार (Category)", "पद", "संकेत नं.", "कर्मचारीको नाम", "कैफियत/थप मिति"
    ]);
  }

  // ३. Monitoring Sheet सेटअप
  let mSheet = ss.getSheetByName(MONITORING_SHEET_NAME);
  if (!mSheet) {
    mSheet = ss.insertSheet(MONITORING_SHEET_NAME);
    mSheet.appendRow([
      "Timestamp", "अनुगमन मिति", "प्रदेश", "जिल्ला", "स्थानीय तह", "कार्यालयको नाम",
      "१. नागरिक बडापत्र (डिजिटल/अडियो)", "२. सेवा प्रक्रिया, कागजात, लागत र समय", "३. शाखागत व्यवस्था, कोठा नं. र नामावली", "४. नागरिक बडापत्रमा क्षतिपूर्ति व्यवस्था", "५. मध्यस्थकर्ताको प्रवेश",
      "६. नागरिक बडापत्र वेवसाईटमा upload र update", "७. सूचनाको हकसम्बन्धी स्वतः प्रकाशन", "८. जानकारी पाउने माध्यमको अवलम्बन", "९. हाजिरीको अवस्था", "१०. कर्मचारीहरु कार्यकक्षमा रहेको", "११. सूचना पाटी", "१२. कार्यालयको सरसफाइको अवस्था",
      "सहायता कक्ष", "अपाङ्गमैत्री", "प्रतिक्षालय", "शौचालय", "खानेपानी", "स्तनपान कक्ष", "धुम्रपान निषेध", "चमेना गृह", "उजुरी पेटिका", "Website/Social Media",
      "१४. कार्यालयबाट प्रवाह हुने मुख्य सेवाहरू", "१५. मूलभूत समस्या/अनियमितता", "१६. अपनाएका सुधारका उपायहरू",
      "कुल दरबन्दी", "कार्यरत संख्या", "रिक्त", "रमाना लिन बाँकी", "पद भन्दा बढी कर्मचारी",
      "१८. अनुगमनकर्ताको टिप्पणी", "अनुगमनकर्ताको नाम", "पद"
    ]);
  }

  // ४. Survey Sheet (Sheet1) सेटअप
  let sSheet = ss.getSheetByName(SHEET_NAME);
  if (!sSheet) {
    sSheet = ss.insertSheet(SHEET_NAME);
    sSheet.appendRow([
      "Timestamp", "सर्वेक्षण मिति", "प्रदेश", "जिल्ला", "स्थानीय तह", "लिङ्ग",
      "कार्यालय १", "कार्यालय २", "कार्यालय ३", "विवरण दिन चाहेको कार्यालय",
      "४.१ नागरिक वडापत्रको जानकारी", "४.२ समय र दस्तूरको जानकारी", "४.३ तोकिएको समयमा काम भयो?", "४.४ भएन भने कारण",
      "५. बाहिरी व्यक्तिको सहयोग", "५.१ कसको सहयोग", "६. अतिरिक्त रकम (घुस) दिनुपर्यो?", "६.१ कसलाई दिनुभयो",
      "७. सेवा सन्तुष्टि", "सन्तुष्ट भए कारण", "असन्तुष्ट भए कारण", "Satisfaction Flag", "८. सुधारका लागि सुझाव", "९. राम्रो सेवा प्रवाह गर्ने कार्यालय", "१०. सेवा प्रवाह कमजोर कार्यालय",
      "११. सूचनाको हक जानकारी", "१२. गुनासो/उजुरी गरेको", "१३. सार्वजनिक सुनुवाई सहभागिता", "१४. विकासको कामको जानकारी",
      "१५. विकास निर्माणमा सहभागिता", "१६. विकास निर्माणको गुणस्तर", "१७. सूचना पाटी", "१८. योजनाबाट सन्तुष्टि",
      "१९. असन्तुष्टिको कारण", "असन्तुष्टिको अन्य कारण"
    ]);
  }
}
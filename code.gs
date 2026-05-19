// १. आफ्नो Spreadsheet ID यहाँ राख्नुहोस्
const SPREADSHEET_ID = '14ztu10pMGHsIVlxS8o3j-MfY2nBaUk_gV2t_InKmJkA';
// २. आफ्नो Sheet को नाम यहाँ राख्नुहोस् (Example: 'Sheet1')
const SHEET_NAME = 'Sheet1';
const MONITORING_SHEET_NAME = 'Monitoring'; // अनुगमन फारमको लागि नयाँ सिट

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var data = JSON.parse(e.postData.contents);
    
    // बहु-विकल्प (Arrays) लाई मिलाउने (String बनाउने)
    Object.keys(data).forEach(function(key) {
      if (Array.isArray(data[key])) {
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
  var sRows = sSheet.getDataRange().getValues();
  var surveyData = [];
  for (var i = 1; i < sRows.length; i++) {
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

  return ContentService.createTextOutput(JSON.stringify({
    survey: surveyData,
    monitoring: monitoringData
  })).setMimeType(ContentService.MimeType.JSON);
}
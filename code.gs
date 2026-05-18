// १. आफ्नो Spreadsheet ID यहाँ राख्नुहोस्
const SPREADSHEET_ID = '14ztu10pMGHsIVlxS8o3j-MfY2nBaUk_gV2t_InKmJkA';
// २. आफ्नो Sheet को नाम यहाँ राख्नुहोस् (Example: 'Sheet1')
const SHEET_NAME = 'Sheet1';

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    var data = JSON.parse(e.postData.contents);
    
    // बहु-विकल्प (Arrays) लाई मिलाउने (String बनाउने)
    Object.keys(data).forEach(function(key) {
      if (Array.isArray(data[key])) {
        data[key] = data[key].join(", ");
      }
    });

    // फारमको बुँदा ४.४ का विभिन्न कारणहरूलाई एउटै कोलममा मिलाउने
    var failureReasons = [
      data.karan_kagajat, 
      data.karan_karmachari, 
      data.karan_na, 
      data.karan_ghus
    ].filter(Boolean).join(", ");

    // सिटमा नयाँ रो (Row) थप्ने
    sheet.appendRow([
      data.timestamp,           // A
      data.survey_date,         // B
      data.pradesh,             // C
      data.jilla,               // D
      data.sthaaniya_taha,      // E
      data.gender,              // F
      data.karyalay_1,          // G
      data.karyalay_2,          // H
      data.karyalay_3,          // I
      data.mukhya_karyalay,     // J
      data.janakari_chha,       // K
      data.samay_janakari,      // L
      data.kaam_bhayeko,        // M
      failureReasons,           // N
      data.sahayog_parera,      // O
      data.helper_type,         // P
      data.ghus_parera,         // Q
      data.ghus_diye_kaslai,    // R
      data.main_satisfaction,   // S (नयाँ कोलम)
      data.santushti_positive,  // T
      data.santushti_negative,  // U
      data.satisfaction_flag,   // V
      data.sujhaw,              // W
      data.ramro_karyalay,      // X
      data.weak_karyalay,       // Y
      data.suchana_hak,         // Z
      data.ujuri_gareko,        // AA
      data.sunuwai_sahabhagi,   // AB
      data.bikas_janakari,      // AC
      data.bikas_sahabhagi,     // AD
      data.gunastar,            // AE
      data.suchana_pati,        // AF
      data.yojana_santushti,    // AG
      data.asantushti_karan_yojana, // AH
      data.asantushti_karan_other   // AI
    ]);

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function doGet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  var rows = sheet.getDataRange().getValues();
  var data = [];
  
  // ड्यासबोर्डको लागि आवश्यक तथ्याङ्क मात्र पठाउने
  for (var i = 1; i < rows.length; i++) {
    data.push({
      timestamp: rows[i][0], // A
      survey_date: rows[i][1], // B
      pradesh: rows[i][2], // C
      jilla: rows[i][3], // D
      sthaaniya_taha: rows[i][4], // E
      gender: rows[i][5], // F
      karyalay_1: rows[i][6], // G
      karyalay_2: rows[i][7], // H
      karyalay_3: rows[i][8], // I
      mukhya_karyalay: rows[i][9], // J
      janakari_chha: rows[i][10], // K
      samay_janakari: rows[i][11], // L
      kaam_bhayeko: rows[i][12], // M
      sahayog_parera: rows[i][14], // O
      ghus_parera: rows[i][16], // Q
      main_satisfaction: rows[i][18], // S
      santushti_positive: rows[i][19], // T
      santushti_negative: rows[i][20], // U
      satisfaction_flag: rows[i][21], // V
      suchana_hak: rows[i][25], // Z
      ujuri_gareko: rows[i][26], // AA
      sunuwai_sahabhagi: rows[i][27], // AB
      bikas_janakari: rows[i][28], // AC
      bikas_sahabhagi: rows[i][29], // AD
      gunastar: rows[i][30], // AE
      suchana_pati: rows[i][31], // AF
      yojana_santushti: rows[i][32], // AG
      asantushti_karan_yojana: rows[i][33], // AH
      asantushti_karan_other: rows[i][34]   // AI
    });
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
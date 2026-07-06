// १. आफ्नो Spreadsheet ID यहाँ राख्नुहोस्
const SPREADSHEET_ID = '14ztu10pMGHsIVlxS8o3j-MfY2nBaUk_gV2t_InKmJkA';
// २. आफ्नो Sheet को नाम यहाँ राख्नुहोस् (Example: 'Sheet1')
const SHEET_NAME = 'Sheet1';
const MONITORING_SHEET_NAME = 'Monitoring'; // अनुगमन फारमको लागि नयाँ सिट
const ATTENDANCE_MAIN_SHEET = 'AttendanceMain'; // समय पालना मुख्य विवरण
const ATTENDANCE_DETAIL_SHEET = 'AttendanceDetail'; // कर्मचारीगत विवरण
const PROJECT_MONITORING_SHEET = 'ProjectMonitoring'; // आयोजना अनुगमन फारमको लागि नयाँ सिट
const USERS_SHEET_NAME = 'users'; // युजर व्यवस्थापनको लागि
const AUDIT_LOG_SHEET_NAME = 'AuditLog'; // अडिट लगको लागि

function ensureUsersSheetColumns(ss) {
  try {
    if (!ss) {
      try {
        ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      } catch (openErr) {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
    }

    if (!ss) {
      throw new Error('Unable to access spreadsheet.');
    }

    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);

    if (!usersSheet) {
      usersSheet = ss.insertSheet(USERS_SHEET_NAME);
    }

    var expectedHeaders = ['Username', 'Password', 'Role', 'Full Name', 'Email', 'Ministry', 'Province', 'District', 'Local Level', 'Office', 'Mobile', 'Must Change Password', 'Created At', 'Status', 'Password Reset Status'];
    var currentHeaders = usersSheet.getRange(1, 1, 1, Math.max(expectedHeaders.length, usersSheet.getLastColumn())).getValues()[0];

    if (currentHeaders.length < expectedHeaders.length) {
      usersSheet.insertColumnsAfter(currentHeaders.length, expectedHeaders.length - currentHeaders.length);
      currentHeaders = usersSheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    }

    for (var i = 0; i < expectedHeaders.length; i++) {
      if (!currentHeaders[i] || currentHeaders[i] === '') {
        usersSheet.getRange(1, i + 1).setValue(expectedHeaders[i]);
      }
    }

    return usersSheet;
  } catch (err) {
    Logger.log('ensureUsersSheetColumns failed: ' + err.message);
    return null;
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var data = JSON.parse(e.postData.contents);
    ensureUsersSheetColumns(ss);
    
    // AI विश्लेषण रिक्वेस्ट सम्हाल्ने
    if (data.action === 'analyze') {
      return handleAIAnalysis(data);
    }
    if (data.action === 'save_ai_summary') {
      return saveAISummary(data);
    }

    // Delete action सम्हाल्ने
    if (data.action === 'delete') {
      return handleDelete(data);
    }

    // User authentication actions
    if (data.action === 'login') {
      return handleLogin(data);
    }
    if (data.action === 'signup') {
      return handleSignup(data);
    }
    if (data.action === 'forgot_password') {
      return handleForgotPassword(data);
    }
    if (data.action === 'change_password') {
      return handleChangePassword(data);
    }
    if (data.action === 'get_users') {
      return handleGetUsers(data);
    }
    if (data.action === 'get_all_users') {
      return handleGetUsers(data);
    }
    if (data.action === 'get_pending_registrations') {
      return handleGetPendingRegistrations(data);
    }
    if (data.action === 'get_password_reset_requests') {
      return handleGetPasswordResetRequests(data);
    }
    if (data.action === 'approve_user') {
      return handleApproveUser(data);
    }
    if (data.action === 'reject_user') {
      return handleRejectUser(data);
    }
    if (data.action === 'approve_password_reset') {
      return handleApprovePasswordReset(data);
    }
    if (data.action === 'reject_password_reset') {
      return handleRejectPasswordReset(data);
    }
    if (data.action === 'get_user') {
      return handleGetUser(data);
    }
    if (data.action === 'update_user') {
      return handleUpdateUser(data);
    }
    if (data.action === 'delete_user') {
      return handleDeleteUser(data);
    }
    if (data.action === 'get_audit_log') {
      return handleGetAuditLog(data);
    }
    if (data.action === 'clear_audit_log') {
      return handleClearAuditLog(data);
    }

    // बहु-विकल्प (Arrays) लाई मिलाउने (String बनाउने)
    Object.keys(data).forEach(function(key) {
      // 'rows' लाई स्ट्रिङमा नबदल्ने ताकि कर्मचारी विवरणहरू सुरक्षित रहून्
      if (key !== 'rows' && Array.isArray(data[key])) {
        data[key] = data[key].join(", ");
      }
    });

    if (data.type === 'monitoring') {
      // १. अनुगमन फारम सुरक्षित गर्ने वा अपडेट गर्ने
      var mSheet = ss.getSheetByName(MONITORING_SHEET_NAME) || ss.insertSheet(MONITORING_SHEET_NAME);
      var mRow = [
        data.editTimestamp || data.timestamp, data.m_date, data.m_pradesh, data.m_jilla, data.m_sthaaniya, data.m_office,
        data.m_q1, data.m_q2, data.m_q3, data.m_q4, data.m_q5, 
        data.m_q6, data.m_q7, data.m_q8, data.m_q9, data.m_q10, data.m_q11, data.m_q12,
        data.f_1, data.f_2, data.f_3, data.f_4, data.f_5, data.f_6, data.f_7, data.f_8, data.f_9, data.f_10,
        data.m_main_services, data.m_problems, data.m_measures,
        data.d_total, data.d_working, data.d_vacant, data.d_pending, data.d_excess,
        data.m_comment, data.monitor_name, data.monitor_rank
      ];
      if (data.editTimestamp) {
        updateRowByTimestamp(mSheet, data.editTimestamp, mRow);
      } else {
        mSheet.appendRow(mRow);
      }
    } else if (data.type === 'attendance') {
      // ३. समय पालना/पोशाक अनुगमन सुरक्षित गर्ने वा अपडेट गर्ने
      var amSheet = ss.getSheetByName(ATTENDANCE_MAIN_SHEET) || ss.insertSheet(ATTENDANCE_MAIN_SHEET);
      var adSheet = ss.getSheetByName(ATTENDANCE_DETAIL_SHEET) || ss.insertSheet(ATTENDANCE_DETAIL_SHEET);
      
      var amRow = [
        data.editTimestamp || data.timestamp, data.pradesh, data.jilla, data.sthaaniya,
        data.office, data.total_staff, data.working_staff, data.vacant_staff, 
        data.date, data.time, data.phone, data.monitor_name, data.monitor_rank, 
        data.a_office_officer, data.a_office_rank
      ];

      if (data.editTimestamp) {
        updateRowByTimestamp(amSheet, data.editTimestamp, amRow);
        deleteAllRowsByTimestamp(adSheet, data.editTimestamp);
      } else {
        amSheet.appendRow(amRow);
      }
      
      if (data.rows && Array.isArray(data.rows)) {
        data.rows.forEach(function(row) {
          adSheet.appendRow([data.editTimestamp || data.timestamp, row.category, row.rank, row.symbol, row.name, row.extra]);
        });
      }
    } else if (data.type === 'project-monitoring') {
      // ४. आयोजना अनुगमन फारम सुरक्षित गर्ने वा अपडेट गर्ने
      var pmSheet = ss.getSheetByName(PROJECT_MONITORING_SHEET) || ss.insertSheet(PROJECT_MONITORING_SHEET);
      var pmRow = [
        data.editTimestamp || data.timestamp,
        data.pm_project_name, data.pm_pradesh, data.pm_jilla, data.pm_sthaaniya_taha, data.pm_ward_no,
        data.pm_implementing_agency, data.pm_contractor_name, data.pm_agreement_no, data.pm_agreement_date,
        data.pm_start_date, data.pm_expected_end_date, data.pm_approved_cost, data.pm_spent_amount,
        data.pm_physical_progress, data.pm_monitoring_date, data.pm_monitoring_team,
        data.pm_obj_1, data.pm_obj_1_remark, data.pm_obj_2, data.pm_obj_2_remark,
        data.pm_obj_3, data.pm_obj_3_remark, data.pm_obj_4, data.pm_obj_4_remark,
        data.pm_quality_1, data.pm_quality_1_remark, data.pm_quality_2, data.pm_quality_2_remark,
        data.pm_quality_3, data.pm_quality_3_remark, data.pm_quality_4, data.pm_quality_4_remark,
        data.pm_economic_1, data.pm_economic_1_remark, data.pm_economic_2, data.pm_economic_2_remark,
        data.pm_economic_3, data.pm_economic_3_remark, data.pm_economic_4, data.pm_economic_4_remark,
        data.pm_procurement_1, data.pm_procurement_1_remark, data.pm_procurement_2, data.pm_procurement_2_remark,
        data.pm_procurement_3, data.pm_procurement_3_remark,
        data.pm_achievement_1, data.pm_achievement_1_remark, data.pm_achievement_2, data.pm_achievement_2_remark,
        data.pm_achievement_3, data.pm_achievement_3_remark, data.pm_achievement_4, data.pm_achievement_4_remark,
        data.pm_overall_remark, data.pm_recommendation
      ];
      
      if (data.editTimestamp) {
        updateRowByTimestamp(pmSheet, data.editTimestamp, pmRow);
      } else {
        pmSheet.appendRow(pmRow);
      }
    } else {
      // २. सेवाग्राही सर्वेक्षण सुरक्षित गर्ने वा अपडेट गर्ने
      var sheet = ss.getSheetByName(SHEET_NAME);
      var failureReasons = [data.karan_kagajat, data.karan_karmachari, data.karan_na, data.karan_ghus].filter(Boolean).join(", ");

      var sRow = [
        data.editTimestamp || data.timestamp, data.survey_date, data.pradesh, data.jilla, data.sthaaniya_taha, data.gender,
        data.karyalay_1, data.karyalay_2, data.karyalay_3, data.mukhya_karyalay,
        data.janakari_chha, data.samay_janakari, data.kaam_bhayeko, failureReasons,
        data.sahayog_parera, data.helper_type, data.ghus_parera, data.ghus_diye_kaslai,
        data.main_satisfaction, data.santushti_positive, data.santushti_negative,
        data.satisfaction_flag, data.sujhaw, data.ramro_karyalay, data.weak_karyalay,
        data.suchana_hak, data.ujuri_gareko, data.sunuwai_sahabhagi, data.bikas_janakari,
        data.bikas_sahabhagi, data.gunastar, data.suchana_pati, data.yojana_santushti,
        data.asantushti_karan_yojana, data.asantushti_karan_other
      ];

      if (data.editTimestamp) {
        updateRowByTimestamp(sheet, data.editTimestamp, sRow);
      } else {
        sheet.appendRow(sRow);
      }
    }

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleDelete(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var ts = data.timestamp;
  
  if (!ts) return ContentService.createTextOutput("Error: Missing timestamp").setMimeType(ContentService.MimeType.TEXT);

  try {
    if (data.type === 'survey') {
      deleteRowByTimestamp(ss.getSheetByName(SHEET_NAME), ts);
    } else if (data.type === 'monitoring') {
      deleteRowByTimestamp(ss.getSheetByName(MONITORING_SHEET_NAME), ts);
    } else if (data.type === 'attendance') {
      deleteRowByTimestamp(ss.getSheetByName(ATTENDANCE_MAIN_SHEET), ts);
      deleteAllRowsByTimestamp(ss.getSheetByName(ATTENDANCE_DETAIL_SHEET), ts);
    } else if (data.type === 'project-monitoring') {
      deleteRowByTimestamp(ss.getSheetByName(PROJECT_MONITORING_SHEET), ts);
    }
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function deleteRowByTimestamp(sheet, ts) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    // stringify and compare to handle Date vs string mismatches
    if (String(data[i][0]) === String(ts)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function updateRowByTimestamp(sheet, ts, rowData) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(ts)) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      break;
    }
  }
}

function deleteAllRowsByTimestamp(sheet, ts) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(ts)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function doGet(e) {
  // Ensure sheets are set up
  setupSheets();

  // Handle login check via GET (no CORS issues)
  if (e && e.parameter && e.parameter.action === 'check_login') {
    var username = e.parameter.username;
    var password = e.parameter.password;

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);

    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][1] === password) {
        var user = {
          username: rows[i][0],
          role: rows[i][2] || 'user',
          fullName: rows[i][3] || '',
          email: rows[i][4] || '',
          ministry: rows[i][5] || '',
          province: rows[i][6] || '',
          district: rows[i][7] || '',
          localLevel: rows[i][8] || '',
          office: rows[i][9] || '',
          mobile: rows[i][10] || '',
          mustChangePassword: rows[i][11] || false
        };

        logAuditAction(username, 'LOGIN', 'User logged in successfully');

        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          user: user
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    logAuditAction(username, 'LOGIN_FAILED', 'Invalid username or password');
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Invalid username or password'
    })).setMimeType(ContentService.MimeType.JSON);
  }

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
        timestamp: mRows[j][0], m_date: mRows[j][1], m_pradesh: mRows[j][2], m_jilla: mRows[j][3], m_sthaaniya: mRows[j][4],
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

  // आयोजना अनुगमन डाटा ल्याउने
  var pmSheet = ss.getSheetByName(PROJECT_MONITORING_SHEET);
  var projectMonitoringData = [];
  if (pmSheet && pmSheet.getLastRow() > 1) {
    var pmRows = pmSheet.getDataRange().getValues();
    for (var m = 1; m < pmRows.length; m++) {
      projectMonitoringData.push({
        timestamp: pmRows[m][0],
        pm_project_name: pmRows[m][1],
        pm_pradesh: pmRows[m][2],
        pm_jilla: pmRows[m][3],
        pm_sthaaniya_taha: pmRows[m][4],
        pm_ward_no: pmRows[m][5],
        pm_implementing_agency: pmRows[m][6],
        pm_contractor_name: pmRows[m][7],
        pm_agreement_no: pmRows[m][8],
        pm_agreement_date: pmRows[m][9],
        pm_start_date: pmRows[m][10],
        pm_expected_end_date: pmRows[m][11],
        pm_approved_cost: pmRows[m][12],
        pm_spent_amount: pmRows[m][13],
        pm_physical_progress: pmRows[m][14],
        pm_monitoring_date: pmRows[m][15],
        pm_monitoring_team: pmRows[m][16],
        pm_obj_1: pmRows[m][17], pm_obj_1_remark: pmRows[m][18],
        pm_obj_2: pmRows[m][19], pm_obj_2_remark: pmRows[m][20],
        pm_obj_3: pmRows[m][21], pm_obj_3_remark: pmRows[m][22],
        pm_obj_4: pmRows[m][23], pm_obj_4_remark: pmRows[m][24],
        pm_quality_1: pmRows[m][25], pm_quality_1_remark: pmRows[m][26],
        pm_quality_2: pmRows[m][27], pm_quality_2_remark: pmRows[m][28],
        pm_quality_3: pmRows[m][29], pm_quality_3_remark: pmRows[m][30],
        pm_quality_4: pmRows[m][31], pm_quality_4_remark: pmRows[m][32],
        pm_economic_1: pmRows[m][33], pm_economic_1_remark: pmRows[m][34],
        pm_economic_2: pmRows[m][35], pm_economic_2_remark: pmRows[m][36],
        pm_economic_3: pmRows[m][37], pm_economic_3_remark: pmRows[m][38],
        pm_economic_4: pmRows[m][39], pm_economic_4_remark: pmRows[m][40],
        pm_procurement_1: pmRows[m][41], pm_procurement_1_remark: pmRows[m][42],
        pm_procurement_2: pmRows[m][43], pm_procurement_2_remark: pmRows[m][44],
        pm_procurement_3: pmRows[m][45], pm_procurement_3_remark: pmRows[m][46],
        pm_achievement_1: pmRows[m][47], pm_achievement_1_remark: pmRows[m][48],
        pm_achievement_2: pmRows[m][49], pm_achievement_2_remark: pmRows[m][50],
        pm_achievement_3: pmRows[m][51], pm_achievement_3_remark: pmRows[m][52],
        pm_achievement_4: pmRows[m][53], pm_achievement_4_remark: pmRows[m][54],
        pm_overall_remark: pmRows[m][55],
        pm_recommendation: pmRows[m][56]
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    survey: surveyData,
    monitoring: monitoringData,
    attendance: attendanceData,
    projectMonitoring: projectMonitoringData
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Migrate existing users sheet to include Local Level column
 */
function migrateUsersSheet(ss) {
  var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!usersSheet) return;

  var headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
  var hasLocalLevel = headers.includes('Local Level');

  if (!hasLocalLevel) {
    // Insert Local Level column after District (column 9, index 8)
    usersSheet.insertColumnBefore(9);
    usersSheet.getRange(1, 9).setValue('Local Level');
    // Fill empty values for existing rows
    var lastRow = usersSheet.getLastRow();
    if (lastRow > 1) {
      usersSheet.getRange(2, 9, lastRow - 1, 1).setValue('');
    }
  }
}

/**
 * आवश्यक Google Sheets र तिनीहरूको हेडरहरू अटोमेटिक सेटअप गर्नका लागि यो फङ्सन एक पटक चलाउनुहोस्।
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ०. Migrate existing users sheet if needed
  migrateUsersSheet(ss);

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

  // ५. ProjectMonitoring Sheet सेटअप
  let pmSheet = ss.getSheetByName(PROJECT_MONITORING_SHEET);
  if (!pmSheet) {
    pmSheet = ss.insertSheet(PROJECT_MONITORING_SHEET);
    pmSheet.appendRow([
      "Timestamp", "आयोजनाको नाम", "प्रदेश", "जिल्ला", "स्थानीय तह", "वडा नं.",
      "कार्यान्वयन गर्ने निकाय", "निर्माण व्यवसायी / ठेकेदारको नाम", "सम्झौता नं.", "सम्झौता मिति",
      "आयोजना सुरु मिति", "आयोजना सम्पन्न हुने (अपेक्षित) मिति", "स्वीकृत लागत अनुमान (रु.)", "हालसम्म भुक्तानी/खर्च भएको रकम (रु.)",
      "भौतिक प्रगति (%)", "अनुगमन मिति", "अनुगमन टोली (नाम, पद)",
      "आयोजना निर्धारित उद्देश्य अनुरूप कार्यान्वयन भए नभएको", "कैफियत", "आयोजनाको लक्ष्य स्पष्ट रूपमा तोकिए नतोकिएको", "कैफियत",
      "तोकिएको लक्ष्य अनुरूप कार्य प्रगति भए नभएको", "कैफियत", "सम्भाव्यता अध्ययन गरिए नगरिएको", "कैफियत",
      "आयोजनाको डिजाइन/प्रारुप उपयुक्त र मापदण्ड अनुसारको भए नभएको", "कैफियत", "निर्माण सामग्रीको गुणस्तर तोकिएको स्पेसिफिकेशन अनुरूप भए नभएको", "कैफियत",
      "निर्माण कार्य सार्वजनिक निर्माण निर्देशिका/प्रचलित कानून बमोजिम भए नभएको", "कैफियत", "गुणस्तर नियन्त्रणका लागि प्रयोगशाला परीक्षण गरिए नगरिएको", "कैफियत",
      "आयोजनाका लागि बजेट विनियोजन र निकासा समयमै भएको छ।", "कैफियत", "तोकिएको समय तालिका अनुसार काम अगाडि बढेको छ।", "कैफियत",
      "निर्माण कार्य पूर्वअनुमान गरिएको लागतभित्रै सम्पन्न हुने देखिन्छ।", "कैफियत", "म्याद थप वा लागत वृद्धि भएको छ।", "कैफियत",
      "सेवा, वस्तु वा निर्माण सामग्री खरिद प्रक्रिया पारदर्शी ढंगले भए नभएको", "कैफियत", "खरिद ऐन/नियम बमोजिमको प्रक्रिया पूरा गरिए नगरिएको", "कैफियत",
      "ठेक्का सम्झौता र बीमा/जमानतपत्र यथोचित रहे नरहेको", "कैफियत",
      "आयोजनाबाट अपेक्षित उपलब्धि हासिल हुने देखिए नदेखिएको", "कैफियत", "आयोजनाको दिगोपन सुनिश्चित भए नभएको", "कैफियत",
      "लागतको प्रभावकारिता रहे नरहेको", "कैफियत", "सञ्चालन तथा मर्मत-सम्भारको जिम्मेवारी स्पष्ट तोकिए नतोकिएको", "कैफियत",
      "समग्र कैफियत / अवलोकन", "सुझाव / सिफारिस"
    ]);
  }

  // ६. Users Sheet सेटअप
  let usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(USERS_SHEET_NAME);
    usersSheet.appendRow(['Username', 'Password', 'Role', 'Full Name', 'Email', 'Ministry', 'Province', 'District', 'Local Level', 'Office', 'Mobile', 'Must Change Password', 'Created At', 'Status']);
    // Add default admin user
    usersSheet.appendRow(['admin', 'nvc123', 'admin', 'System Administrator', 'admin@nvc.gov.np', '', '', '', '', '', '', false, new Date().toISOString(), 'active']);
  }

  // ७. AuditLog Sheet सेटअप
  let auditSheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);
  if (!auditSheet) {
    auditSheet = ss.insertSheet(AUDIT_LOG_SHEET_NAME);
    auditSheet.appendRow(['Timestamp', 'Username', 'Action', 'Details']);
  }
}

/**
 * Gemini AI मार्फत प्राप्त डाटाको विश्लेषण गर्ने
 */
function handleScoreAnalysis(input) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'API Key भेटिएन। कृपया Script Properties मा GEMINI_API_KEY सेट गर्नुहोस्।'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var m = input.officeMonitoring || {};
  var s = input.serviceSurvey || {};
  var a = input.timeDressMonitoring || {};

  // स्कोर गणना लजिक
  var mScore = m.total_count > 0 ? ((m.charter_clear + m.process_clear + m.staff_found) / (m.total_count * 3) * 100).toFixed(2) : 0;
  var sScore = (s.satisfied + s.unsatisfied) > 0 ? (s.satisfied / (s.satisfied + s.unsatisfied) * 100).toFixed(2) : 0;
  var aScore = Math.max(0, 100 - (a.absent_today * 10 + a.no_uniform * 5)).toFixed(2);
  var overall = ((parseFloat(mScore) + parseFloat(sScore) + parseFloat(aScore)) / 3).toFixed(2);

  var currentDate = input.currentDate || "आजको नेपाली मिति";
  var prompt = "तपाईं राष्ट्रिय सतर्कता केन्द्रको विश्लेषक हुनुहुन्छ। " + (input.location || "क्षेत्र") + " को निम्न डेटा विश्लेषण गरी नेपालीमा प्रतिवेदन दिनुहोस्:\n" +
               "- यदि मिति उल्लेख गर्न आवश्यक नपरेको भए मिति नदेखाउनुहोस्।\n" +
               "- यदि मिति देखाउनु पर्यो भने मात्र प्रदान गरिएको वास्तविक नेपाली मिति '" + currentDate + "' प्रयोग गर्नुहोस् र कुनै पनि उदाहरणात्मक वा काल्पनिक मिति (जस्तै २०८० मंसिर २५) लेख्नु हुँदैन।\n" +
               "१. कार्यालय अनुगमन: " + mScore + "%\n" +
               "२. सेवाग्राही सर्वेक्षण: " + sScore + "%\n" +
               "३. समय पालना: " + aScore + "%\n" +
               "समग्र स्कोर: " + overall + "%\n" +
               "कृपया समस्या र सुधारका ठोस सुझावहरू बुँदागत रूपमा दिनुहोस्।";

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
    var payload = {
    "contents": [{ "parts": [{ "text": prompt }] }]
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    
    if (json.error) {
      throw new Error("Gemini API Error: " + json.error.message);
    }

    if (json.candidates && json.candidates.length > 0 && json.candidates[0].content) {
      var aiText = json.candidates[0].content.parts[0].text;
      return ContentService.createTextOutput(JSON.stringify({
        'status': 'success',
        'analysis': aiText
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      throw new Error("AI ले कुनै प्रतिक्रिया दिएन।");
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': 'AI Error: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * अनुमति प्रदान गर्नका लागि यो फङ्सन एक पटक म्यानुअल रूपमा चलाउनुहोस्
 */
function authorizeExternalRequests() {
  var response = UrlFetchApp.fetch("https://www.google.com");
  Logger.log("अनुमति प्राप्त भयो: " + response.getResponseCode());
}

/**
 * Handle AI analysis requests. Expects payload.data with aggregates and type.
 * Uses GEMINI_API_KEY stored in Script Properties as 'GEMINI_API_KEY'.
 */
function handleAIAnalysis(payload) {
  try {
    var aiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!aiKey) return ContentService.createTextOutput(JSON.stringify({ error: 'Missing GEMINI_API_KEY in Script Properties' })).setMimeType(ContentService.MimeType.JSON);

    var d = payload.data || {};
    var type = d.type || 'project-monitoring';
    var aggregates = d.aggregates || {};
    var top = d.topOverspend || [];
    var stalled = d.stalled || [];
    var examples = d.examples || [];

    // Limit sizes to avoid overly large prompts and conserve API quota
    var topSlice = (top && top.length) ? top.slice(0, 5) : [];
    var stalledSlice = (stalled && stalled.length) ? stalled.slice(0, 5) : [];
    var examplesSlice = (examples && examples.length) ? examples.slice(0, 10) : [];

    var prompt = '';
    
    if (type === 'survey') {
      prompt = 'तपाईं एक सरकारी अनुगमन विश्लेषक हुनुहुन्छ। तल दिइएको सेवाग्राही सर्वेक्षण सारांशका आधारमा संक्षेप विश्लेषण र सुधार सुझावहरू दिनुहोस्। आउटपुट JSON मा दिनुहोस् (keys: summary, suggestions, kpis).\n\n';
      prompt += 'AGGREGATES:\n' + JSON.stringify(aggregates) + '\n\n';
      prompt += 'INSTRUCTIONS: Provide a brief 2-3 sentence summary in Nepali about service satisfaction, five prioritized actionable suggestions (who should do what and by when), and three KPIs to monitor. Return ONLY valid JSON without any markdown formatting, code blocks, or explanatory text. The suggestions array should contain objects with optional fields: action, details, who, when. Example format: {"summary":"...","suggestions":[{"action":"...","details":"...","who":"...","when":"..."}],"kpis":["...","...","..."]}';
    } else if (type === 'monitoring') {
      prompt = 'तपाईं एक सरकारी अनुगमन विश्लेषक हुनुहुन्छ। तल दिइएको कार्यालय अनुगमन सारांशका आधारमा संक्षेप विश्लेषण र सुधार सुझावहरू दिनुहोस्। आउटपुट JSON मा दिनुहोस् (keys: summary, suggestions, kpis).\n\n';
      prompt += 'AGGREGATES:\n' + JSON.stringify(aggregates) + '\n\n';
      prompt += 'INSTRUCTIONS: Provide a brief 2-3 sentence summary in Nepali about office compliance, five prioritized actionable suggestions (who should do what and by when), and three KPIs to monitor. Return ONLY valid JSON without any markdown formatting, code blocks, or explanatory text. The suggestions array should contain objects with optional fields: action, details, who, when. Example format: {"summary":"...","suggestions":[{"action":"...","details":"...","who":"...","when":"..."}],"kpis":["...","...","..."]}';
    } else if (type === 'attendance') {
      prompt = 'तपाईं एक सरकारी अनुगमन विश्लेषक हुनुहुन्छ। तल दिइएको समय पालना अनुगमन सारांशका आधारमा संक्षेप विश्लेषण र सुधार सुझावहरू दिनुहोस्। आउटपुट JSON मा दिनुहोस् (keys: summary, suggestions, kpis).\n\n';
      prompt += 'AGGREGATES:\n' + JSON.stringify(aggregates) + '\n\n';
      prompt += 'INSTRUCTIONS: Provide a brief 2-3 sentence summary in Nepali about staff attendance, five prioritized actionable suggestions (who should do what and by when), and three KPIs to monitor. Return ONLY valid JSON without any markdown formatting, code blocks, or explanatory text. The suggestions array should contain objects with optional fields: action, details, who, when. Example format: {"summary":"...","suggestions":[{"action":"...","details":"...","who":"...","when":"..."}],"kpis":["...","...","..."]}';
    } else {
      // project-monitoring (default)
      prompt = 'तपाईं एक सरकारी अनुगमन विश्लेषक हुनुहुन्छ। तल दिइएको आयोजना अनुगमन सारांशका आधारमा संक्षेप विश्लेषण र सुधार सुझावहरू दिनुहोस्। आउटपुट JSON मा दिनुहोस् (keys: summary, suggestions, kpis).\n\n';
      prompt += 'AGGREGATES:\n' + JSON.stringify(aggregates) + '\n\n';
      prompt += 'TOP_OVERSPEND:\n' + JSON.stringify(topSlice) + '\n\n';
      prompt += 'STALLED_EXAMPLES:\n' + JSON.stringify(stalledSlice) + '\n\n';
      prompt += 'EXAMPLES:\n' + JSON.stringify(examplesSlice) + '\n\n';
      prompt += 'INSTRUCTIONS: Provide a brief 2-3 sentence summary in Nepali, five prioritized actionable suggestions (who should do what and by when), and three KPIs to monitor. Return ONLY valid JSON without any markdown formatting, code blocks, or explanatory text. The suggestions array should contain objects with optional fields: action, details, who, when. Example format: {"summary":"...","suggestions":[{"action":"...","details":"...","who":"...","when":"..."}],"kpis":["...","...","..."]}';
    }

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + aiKey;
    // Add lightweight generation config to stabilize and shorten responses
    var payloadReq = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payloadReq),
      muteHttpExceptions: true
    };

    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    var txt = resp.getContentText();
    if (code >= 200 && code < 300) {
      var j = JSON.parse(txt);
      var result = '';
      try {
        // Gemini API response format
        if (j.candidates && j.candidates.length > 0 && j.candidates[0].content) {
          result = j.candidates[0].content.parts[0].text;
        } else {
          result = JSON.stringify(j);
        }
      } catch (e) { result = txt; }

      // Try to extract JSON block from the model text
      function extractJSON(str) {
        if (!str || typeof str !== 'string') return null;
        
        // First, strip markdown code blocks if present
        str = str.replace(/```json\s*/g, '').replace(/```\s*/g, '').replace(/```/g, '');
        
        // Try to find a JSON object
        var start = str.indexOf('{');
        var end = str.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          var sub = str.substring(start, end + 1);
          try { return JSON.parse(sub); } catch (e) {}
        }
        // Try JSON array
        var astart = str.indexOf('[');
        var aend = str.lastIndexOf(']');
        if (astart !== -1 && aend !== -1 && aend > astart) {
          var suba = str.substring(astart, aend + 1);
          try { return JSON.parse(suba); } catch (e) {}
        }
        return null;
      }

      var parsed = extractJSON(result);
      // If initial parse failed, attempt a strict JSON reformat retry up to 2 times
      if (!parsed) {
        for (var retry = 0; retry < 2 && !parsed; retry++) {
          try {
            var followPrompt = 'The previous assistant output is provided below. \nPlease reformat ONLY as valid JSON with keys: summary (string), suggestions (array of objects with optional fields: action, details, who, when), kpis (array of strings). Do not include any explanatory text. Previous output:\n' + result;
            var payloadReq2 = {
              contents: [{ parts: [{ text: followPrompt }] }]
            };
            var options2 = {
              method: 'post',
              contentType: 'application/json',
              payload: JSON.stringify(payloadReq2),
              muteHttpExceptions: true
            };
            var resp2 = UrlFetchApp.fetch(url, options2);
            if (resp2.getResponseCode() >= 200 && resp2.getResponseCode() < 300) {
              var j2 = JSON.parse(resp2.getContentText());
              var r2 = '';
              if (j2.candidates && j2.candidates.length > 0 && j2.candidates[0].content) {
                r2 = j2.candidates[0].content.parts[0].text;
              } else {
                r2 = JSON.stringify(j2);
              }
              // try parse
              parsed = extractJSON(r2);
              if (parsed) {
                output.raw_retry = r2;
                result = r2;
                break;
              }
            }
          } catch (e) {
            // ignore and continue retries
          }
        }
      }
      var output = { status: 'ok', raw: result };

      if (parsed) {
        // Normalize fields: summary (string), suggestions (array), kpis (array)
        var summary = parsed.summary || parsed.summary_text || parsed.summaryText || parsed.SUMMARY || null;
        var suggestions = parsed.suggestions || parsed.recommendations || parsed.improvements || parsed.actions || parsed.SUGGESTIONS || null;
        var kpis = parsed.kpis || parsed.metrics || parsed.kpi || parsed.KPIs || null;

        // Fallback: if top-level parsed is string, treat as summary
        if (!summary && typeof parsed === 'string') summary = parsed;

        // Normalize suggestions to array
        if (!Array.isArray(suggestions)) {
          if (typeof suggestions === 'string' && suggestions.trim().length > 0) {
            // split on newlines or numbered list
            suggestions = suggestions.split(/\r?\n|\d+\.|\-/).map(function(s){ return s.trim(); }).filter(Boolean);
          } else {
            suggestions = [];
          }
        }

        // Normalize kpis to array
        if (!Array.isArray(kpis)) {
          if (typeof kpis === 'string' && kpis.trim().length > 0) {
            kpis = kpis.split(/\r?\n|\d+\.|\-/).map(function(s){ return s.trim(); }).filter(Boolean);
          } else {
            kpis = [];
          }
        }

        // Process suggestions: keep objects as-is, try to parse strings as JSON
        suggestions = suggestions.map(function(it){ 
          if (typeof it === 'object' && it !== null) return it;
          if (typeof it === 'string') {
            try { 
              var parsed = JSON.parse(it);
              return parsed;
            } catch(e){ 
              return it; 
            }
          }
          return String(it);
        });
        
        // Process kpis: keep strings as-is, convert objects to strings
        kpis = kpis.map(function(it){ 
          if (typeof it === 'string') return it;
          if (typeof it === 'object' && it !== null) return JSON.stringify(it);
          return String(it);
        });

        output.parsed = { summary: summary || '', suggestions: suggestions, kpis: kpis };
      } else {
        // No JSON found; attempt to heuristically extract sections
        var lines = (result || '').split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
        var summaryLine = lines.slice(0,3).join(' ');
        var suggestLines = lines.filter(function(l){ return /^\d+\.|^-\s|suggest|सुझाव|सुझावहरू/i.test(l); }).slice(0,10);
        var kpiLines = lines.filter(function(l){ return /KPI|KPIs|indicator|सूचक|प्रदर्शन/i.test(l); }).slice(0,10);
        output.parsed = { summary: summaryLine || '', suggestions: suggestLines, kpis: kpiLines };
      }

      return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ error: 'AI API error', detail: txt })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Save AI summary result into a dedicated sheet `AI_Summaries`.
 * Expects payload.data: { requestPayload, parsed, raw, created_at }
 */
function saveAISummary(payload) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetName = 'AI_Summaries';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(['Timestamp', 'Type', 'Created At', 'Aggregates', 'Summary', 'Suggestions', 'KPIs', 'RawOutput']);
    }

    var p = payload.data || {};
    var type = payload.type || 'project-monitoring';
    var ts = new Date();
    var createdAt = p.created_at || ts.toISOString();
    var aggregates = p.requestPayload && p.requestPayload.aggregates ? JSON.stringify(p.requestPayload.aggregates) : '';
    var summary = (p.parsed && p.parsed.summary) ? p.parsed.summary : '';
    var suggestions = (p.parsed && p.parsed.suggestions) ? p.parsed.suggestions.join(' | ') : '';
    var kpis = (p.parsed && p.parsed.kpis) ? p.parsed.kpis.join(' | ') : '';
    var raw = p.raw || '';

    sheet.appendRow([ts.toISOString(), type, createdAt, aggregates, summary, suggestions, kpis, raw]);
    return ContentService.createTextOutput('Success').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// ===== User Authentication Functions =====

/**
 * Handle user login
 */
function handleLogin(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);

    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var password = data.password;

    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][1] === password) {
        // Login successful
        var user = {
          username: rows[i][0],
          role: rows[i][2] || 'user',
          fullName: rows[i][3] || '',
          email: rows[i][4] || '',
          ministry: rows[i][5] || '',
          province: rows[i][6] || '',
          district: rows[i][7] || '',
          localLevel: rows[i][8] || '',
          office: rows[i][9] || '',
          mobile: rows[i][10] || '',
          mustChangePassword: rows[i][11] || false
        };

        // Log to audit
        logAuditAction(username, 'LOGIN', 'User logged in successfully');

        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          user: user
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Login failed
    logAuditAction(username, 'LOGIN_FAILED', 'Invalid username or password');
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Invalid username or password'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle user signup request
 */
function handleSignup(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);

    if (!usersSheet) {
      usersSheet = ss.insertSheet(USERS_SHEET_NAME);
      usersSheet.appendRow(['Username', 'Password', 'Role', 'Full Name', 'Email', 'Ministry', 'Province', 'District', 'Local Level', 'Office', 'Mobile', 'Must Change Password', 'Created At', 'Status', 'Password Reset Status']);
    }

    var email = data.email;
    var ministry = data.ministry;
    var province = data.province;
    var district = data.district;
    var localLevel = data.localLevel || '';
    var office = data.office;
    var fullName = data.fullName;
    var mobile = data.mobile;

    // Generate temporary password
    var tempPassword = generateTempPassword();
    var username = email; // Email serves as username

    // Check if user already exists
    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'User already exists with this email'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Generate and save temporary password immediately so it is available in the sheet and email
    var tempPassword = generateTempPassword();

    usersSheet.appendRow([
      username,
      tempPassword,
      'user',
      fullName,
      email,
      ministry,
      province,
      district,
      localLevel,
      office,
      mobile,
      true, // must change password
      new Date().toISOString(),
      'pending', // status column 14
      '' // password reset request status column 15
    ]);

    // Log to audit
    logAuditAction(username, 'SIGNUP_REQUEST', 'New signup request submitted - temporary password saved and pending admin approval');

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Signup request submitted successfully. Temporary password has been saved and is waiting for admin approval.'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle forgot password request
 */
function handleForgotPassword(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    var userFound = false;
    var email = '';
    var fullName = '';

    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) {
        userFound = true;
        email = rows[i][4];
        fullName = rows[i][3];
        
        // Generate and save temporary password immediately for the forgot-password flow
        var tempPassword = generateTempPassword();
        usersSheet.getRange(i + 1, 2).setValue(tempPassword);
        usersSheet.getRange(i + 1, 12).setValue(true); // require password change on next login
        usersSheet.getRange(i + 1, 15).setValue('password_reset_requested');
        
        // Log to audit
        logAuditAction(username, 'PASSWORD_RESET_REQUESTED', 'Password reset requested - temporary password saved and pending admin approval');
        
        break;
      }
    }

    if (!userFound) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'User not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Password reset request submitted. Temporary password has been saved and is waiting for admin approval.'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle password change
 */
function handleChangePassword(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var currentPassword = data.currentPassword;
    var newPassword = data.newPassword;

    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][1] === currentPassword) {
        // Update password
        usersSheet.getRange(i + 1, 2).setValue(newPassword);
        usersSheet.getRange(i + 1, 12).setValue(false); // reset must change password flag
        
        // Log to audit
        logAuditAction(username, 'PASSWORD_CHANGE', 'Password changed successfully');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Password changed successfully'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Current password is incorrect'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get all users (admin only)
 */
function handleGetUsers(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = usersSheet.getDataRange().getValues();
    var users = [];
    
    for (var i = 1; i < rows.length; i++) {
      users.push({
        username: rows[i][0],
        role: rows[i][2] || 'user',
        fullName: rows[i][3] || '',
        email: rows[i][4] || '',
        ministry: rows[i][5] || '',
        province: rows[i][6] || '',
        district: rows[i][7] || '',
        localLevel: rows[i][8] || '',
        officeName: rows[i][9] || '',
        mobile: rows[i][10] || '',
        status: rows[i][13] || 'active',
        createdAt: rows[i][12] || ''
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      users: users
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get pending registrations (admin only)
 */
function handleGetPendingRegistrations(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = usersSheet.getDataRange().getValues();
    var users = [];
    
    for (var i = 1; i < rows.length; i++) {
      // Check if user status is pending (column 14 / index 13)
      if (rows[i][13] === 'pending') {
        users.push({
          username: rows[i][0],
          role: rows[i][2] || 'user',
          fullName: rows[i][3] || '',
          email: rows[i][4] || '',
          ministry: rows[i][5] || '',
          province: rows[i][6] || '',
          district: rows[i][7] || '',
          localLevel: rows[i][8] || '',
          officeName: rows[i][9] || '',
          mobile: rows[i][10] || '',
          status: rows[i][13] || 'pending',
          createdAt: rows[i][12] || ''
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      users: users
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get password reset requests (admin only)
 */
function handleGetPasswordResetRequests(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = usersSheet.getDataRange().getValues();
    var users = [];
    
    for (var i = 1; i < rows.length; i++) {
      // Check if user has requested password reset (column 15 / index 14)
      if (rows[i][14] === 'password_reset_requested') {
        users.push({
          username: rows[i][0],
          role: rows[i][2] || 'user',
          fullName: rows[i][3] || '',
          email: rows[i][4] || '',
          ministry: rows[i][5] || '',
          province: rows[i][6] || '',
          district: rows[i][7] || '',
          localLevel: rows[i][8] || '',
          officeName: rows[i][9] || '',
          mobile: rows[i][10] || '',
          status: rows[i][13] || 'active',
          createdAt: rows[i][12] || ''
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      users: users
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Approve user registration and send temporary password
 */
function handleApproveUser(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][13] === 'pending') {
        // Reuse the saved temporary password if one already exists; otherwise create a new one
        var tempPassword = rows[i][1] || '';
        if (!tempPassword) {
          tempPassword = generateTempPassword();
        }
        
        // Update user status and password
        usersSheet.getRange(i + 1, 2).setValue(tempPassword);
        usersSheet.getRange(i + 1, 14).setValue('active');
        usersSheet.getRange(i + 1, 15).setValue('');
        
        // Get user email
        var email = rows[i][4];
        
        // Send email with temporary password
        sendTempPasswordEmail(email, username, tempPassword);
        
        // Log to audit
        logAuditAction(username, 'USER_APPROVED', 'User registration approved by admin');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'User approved successfully. Temporary password sent to email.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Pending user not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Reject user registration
 */
function handleRejectUser(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][13] === 'pending') {
        // Delete the user row
        usersSheet.deleteRow(i + 1);
        
        // Log to audit
        logAuditAction(username, 'USER_REJECTED', 'User registration rejected by admin');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'User rejected successfully'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Pending user not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Approve password reset and send temporary password
 */
function handleApprovePasswordReset(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][14] === 'password_reset_requested') {
        // Reuse the saved temporary password if one already exists; otherwise create a new one
        var tempPassword = rows[i][1] || '';
        if (!tempPassword) {
          tempPassword = generateTempPassword();
        }
        
        // Update user password and reset request status
        usersSheet.getRange(i + 1, 2).setValue(tempPassword);
        usersSheet.getRange(i + 1, 14).setValue('active');
        usersSheet.getRange(i + 1, 15).setValue('');
        usersSheet.getRange(i + 1, 12).setValue(true); // require password change on next login
        
        // Get user email
        var email = rows[i][4];
        
        // Send email with temporary password
        sendTempPasswordEmail(email, username, tempPassword);
        
        // Log to audit
        logAuditAction(username, 'PASSWORD_RESET_APPROVED', 'Password reset approved by admin');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Password reset approved. Temporary password sent to email.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Password reset request not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Reject password reset request
 */
function handleRejectPasswordReset(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username && rows[i][14] === 'password_reset_requested') {
        // Clear the password reset request status
        usersSheet.getRange(i + 1, 15).setValue('');
        
        // Log to audit
        logAuditAction(username, 'PASSWORD_RESET_REJECTED', 'Password reset rejected by admin');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Password reset request rejected'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Password reset request not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get single user details
 */
function handleGetUser(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) {
        var user = {
          username: rows[i][0],
          role: rows[i][2] || 'user',
          fullName: rows[i][3] || '',
          email: rows[i][4] || '',
          ministry: rows[i][5] || '',
          province: rows[i][6] || '',
          district: rows[i][7] || '',
          localLevel: rows[i][8] || '',
          officeName: rows[i][9] || '',
          mobile: rows[i][10] || '',
          status: rows[i][13] || 'active',
          createdAt: rows[i][12] || ''
        };
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          user: user
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'User not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete user
 */
function handleDeleteUser(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var rows = usersSheet.getDataRange().getValues();
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) {
        // Delete the user row
        usersSheet.deleteRow(i + 1);
        
        // Log to audit
        logAuditAction(username, 'USER_DELETED', 'User deleted by admin');
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'User deleted successfully'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'User not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Update user (admin only)
 */
function handleUpdateUser(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;
    var role = data.role;
    var status = data.status;

    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) {
        if (role) usersSheet.getRange(i + 1, 3).setValue(role);
        if (status) usersSheet.getRange(i + 1, 14).setValue(status);
        
        // Log to audit
        logAuditAction(data.adminUsername, 'UPDATE_USER', 'Updated user: ' + username);
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'User updated successfully'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'User not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete user (admin only)
 */
function handleDeleteUser(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    if (!usersSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Users sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var username = data.username;

    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) {
        usersSheet.deleteRow(i + 1);
        
        // Log to audit
        logAuditAction(data.adminUsername, 'DELETE_USER', 'Deleted user: ' + username);
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: 'User deleted successfully'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'User not found'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get audit log (admin only)
 */
function handleGetAuditLog(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var auditSheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);
    
    if (!auditSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        logs: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = auditSheet.getDataRange().getValues();
    var logs = [];
    
    for (var i = 1; i < rows.length; i++) {
      logs.push({
        timestamp: rows[i][0],
        username: rows[i][1],
        action: rows[i][2],
        details: rows[i][3]
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      logs: logs.reverse() // Most recent first
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Clear entire audit log (admin only)
 */
function handleClearAuditLog(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var auditSheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);

    if (!auditSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Audit log cleared successfully'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = auditSheet.getLastRow();
    if (lastRow > 1) {
      auditSheet.deleteRows(2, lastRow - 1);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Audit log cleared successfully'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Log action to audit sheet
 */
function logAuditAction(username, action, details) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var auditSheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);
    
    if (!auditSheet) {
      auditSheet = ss.insertSheet(AUDIT_LOG_SHEET_NAME);
      auditSheet.appendRow(['Timestamp', 'Username', 'Action', 'Details']);
    }

    auditSheet.appendRow([
      new Date().toISOString(),
      username,
      action,
      details
    ]);
  } catch (err) {
    // Log errors silently
  }
}

/**
 * Generate temporary password
 */
function generateTempPassword() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var password = '';
  for (var i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Send temporary password email
 */
function sendTempPasswordEmail(email, fullName, tempPassword) {
  try {
    var subject = 'राष्ट्रिय सतर्कता केन्द्र - अस्थायी पासवर्ड';
    var body = 'नमस्ते ' + fullName + ',\n\n' +
               'तपाईंको लागि अस्थायी पासवर्ड: ' + tempPassword + '\n\n' +
               'कृपया यो पासवर्ड प्रयोग गरेर लगइन गर्नुहोस् र लगइन गरेपछि तुरुन्तै पासवर्ड परिवर्तन गर्नुहोस्।\n\n' +
               'धन्यवाद,\n' +
               'राष्ट्रिय सतर्कता केन्द्र';

    if (!email) {
      throw new Error('Email address is missing');
    }

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      name: 'राष्ट्रिय सतर्कता केन्द्र'
    });
  } catch (err) {
    // Log the issue but keep the workflow moving
    Logger.log('sendTempPasswordEmail failed: ' + err.message);
  }
}
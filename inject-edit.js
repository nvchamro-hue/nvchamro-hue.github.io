const fs = require('fs');

const path = 'c:/Users/acer/Desktop/surrvey2-30/script.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject editingRecord payload check into survey
content = content.replace(
    /const payload = {\s*type: 'survey',/g,
    `const payload = {
            type: 'survey',
            ...(window.editingRecord && window.editingRecord.type === 'survey' ? { editTimestamp: window.editingRecord.timestamp } : {}),`
);

// 2. Inject into monitoring
content = content.replace(
    /const payload = {\s*type: 'monitoring',/g,
    `const payload = {
            type: 'monitoring',
            ...(window.editingRecord && window.editingRecord.type === 'monitoring' ? { editTimestamp: window.editingRecord.timestamp } : {}),`
);

// 3. Inject into attendance
content = content.replace(
    /const payload = {\s*type: 'attendance',/g,
    `const payload = {
            type: 'attendance',
            ...(window.editingRecord && window.editingRecord.type === 'attendance' ? { editTimestamp: window.editingRecord.timestamp } : {}),`
);

// 4. Inject local state updates on Success for survey
content = content.replace(
    /if \(resText === "Success"\) \{\s*payload\.timestamp = new Date\(\)\.getTime\(\);\s*allSubmissions\.push\(payload\);/g,
    `if (resText === "Success") {
                if (payload.editTimestamp) {
                    payload.timestamp = payload.editTimestamp;
                    const idx = allSubmissions.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));
                    if (idx !== -1) allSubmissions[idx] = payload;
                    window.editingRecord = null;
                    document.getElementById("submitSurvey").innerHTML = 'पेश गर्नुहोस्';
                } else {
                    payload.timestamp = new Date().getTime();
                    allSubmissions.push(payload);
                }`
);

// 5. Inject local state updates on Success for monitoring
content = content.replace(
    /if \(resText === "Success"\) \{\s*payload\.timestamp = new Date\(\)\.getTime\(\);\s*allMonitorings\.push\(payload\);/g,
    `if (resText === "Success") {
                if (payload.editTimestamp) {
                    payload.timestamp = payload.editTimestamp;
                    const idx = allMonitorings.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));
                    if (idx !== -1) allMonitorings[idx] = payload;
                    window.editingRecord = null;
                    document.getElementById("submitMonitoring").innerHTML = 'पेश गर्नुहोस्';
                } else {
                    payload.timestamp = new Date().getTime();
                    allMonitorings.push(payload);
                }`
);

// 6. Inject local state updates on Success for attendance
content = content.replace(
    /if \(resText === "Success"\) \{\s*payload\.timestamp = new Date\(\)\.getTime\(\);\s*allAttendanceMonitorings\.push\(payload\);/g,
    `if (resText === "Success") {
                if (payload.editTimestamp) {
                    payload.timestamp = payload.editTimestamp;
                    const idx = allAttendanceMonitorings.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));
                    if (idx !== -1) allAttendanceMonitorings[idx] = payload;
                    window.editingRecord = null;
                    document.getElementById("submitAttendance").innerHTML = 'पेश गर्नुहोस्';
                } else {
                    payload.timestamp = new Date().getTime();
                    allAttendanceMonitorings.push(payload);
                }`
);

// 7. Append edit logic at the end
const editLogic = `
window.editingRecord = null;

function setFieldValue(name, value) {
    if (value === undefined || value === null) value = "";
    
    let inputs = document.getElementsByName(name);
    if (!inputs.length) {
        const el = document.getElementById(name);
        if (el) {
            el.value = value;
            return;
        }
        return;
    }

    const type = inputs[0].type;
    if (type === 'radio') {
        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i].value === value) {
                inputs[i].checked = true;
                inputs[i].dispatchEvent(new Event('change'));
                break;
            }
        }
    } else if (type === 'checkbox') {
        const values = Array.isArray(value) ? value : String(value).split(', ');
        for (let i = 0; i < inputs.length; i++) {
            inputs[i].checked = values.includes(inputs[i].value);
            inputs[i].dispatchEvent(new Event('change'));
        }
    } else {
        inputs[0].value = value;
        inputs[0].dispatchEvent(new Event('change'));
    }
}

window.editRecord = function(timestamp, type) {
    window.editingRecord = { timestamp, type };
    
    if (type === 'survey') {
        const record = allSubmissions.find(r => String(r.timestamp) === String(timestamp));
        if (record) {
            switchDashboardView('form');
            document.getElementById("surveyForm").reset();
            setTimeout(() => {
                Object.keys(record).forEach(key => setFieldValue(key, record[key]));
                document.getElementById("submitSurvey").innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';
            }, 100);
        }
    } else if (type === 'monitoring') {
        const record = allMonitorings.find(r => String(r.timestamp) === String(timestamp));
        if (record) {
            switchDashboardView('monitoringForm');
            document.getElementById("monitoringForm").reset();
            setTimeout(() => {
                Object.keys(record).forEach(key => setFieldValue(key, record[key]));
                document.getElementById("submitMonitoring").innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';
            }, 100);
        }
    } else if (type === 'attendance') {
        const record = allAttendanceMonitorings.find(r => String(r.timestamp) === String(timestamp));
        if (record) {
            switchDashboardView('attendanceForm');
            document.getElementById("attendanceForm").reset();
            setTimeout(() => {
                Object.keys(record).forEach(key => {
                    if (key !== 'rows') setFieldValue(key, record[key]);
                });
                
                const tb = document.getElementById("attendanceRecordsBody");
                if (tb) {
                    tb.innerHTML = '';
                    if (record.rows && record.rows.length) {
                        record.rows.forEach(r => {
                            const tr = document.createElement("tr");
                            tr.innerHTML = \`
                                <td><select class="category-select" required><option value="ढिला उपस्थित">ढिला उपस्थित</option><option value="पोशाक नलगाएको">पोशाक नलगाएको</option><option value="ढिला र पोशाक दुवै">ढिला र पोशाक दुवै</option><option value="अनुपस्थित">अनुपस्थित</option><option value="अन्य">अन्य</option></select></td>
                                <td><input type="text" class="rank-input" placeholder="पद" required></td>
                                <td><input type="text" class="symbol-input" placeholder="संकेत नं."></td>
                                <td><input type="text" class="name-input" placeholder="नाम" required></td>
                                <td><input type="text" class="extra-input" placeholder="कैफियत"></td>
                                <td><button type="button" class="action-btn btn-delete" onclick="this.closest('tr').remove()" title="हटाउनुहोस्"><i class="fas fa-trash"></i></button></td>
                            \`;
                            tr.querySelector('.category-select').value = r.category;
                            tr.querySelector('.rank-input').value = r.rank;
                            tr.querySelector('.symbol-input').value = r.symbol;
                            tr.querySelector('.name-input').value = r.name;
                            tr.querySelector('.extra-input').value = r.extra;
                            tb.appendChild(tr);
                        });
                    }
                }
                document.getElementById("submitAttendance").innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';
            }, 100);
        }
    }
};
`;

if (!content.includes('function setFieldValue')) {
    content += editLogic;
}

fs.writeFileSync(path, content);
console.log('script.js updated with edit logic.');

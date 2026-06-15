const fs = require('fs');

const path = 'c:/Users/acer/Desktop/surrvey2-30/script.js';
let content = fs.readFileSync(path, 'utf8');

// The cancel handlers are inline in HTML or in script.js?
// If they are IDs like 'cancelSurvey', let's just append listeners:

const cancelLogic = `
['cancelSurvey', 'cancelMonitoring', 'cancelAttendance'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', () => {
            window.editingRecord = null;
            if(id === 'cancelSurvey') {
                const sBtn = document.getElementById("submitSurvey");
                if (sBtn) sBtn.innerHTML = '<i class="fas fa-paper-plane"></i> पेश गर्नुहोस्';
            } else if (id === 'cancelMonitoring') {
                const mBtn = document.getElementById("submitMonitoring");
                if (mBtn) mBtn.innerHTML = '<i class="fas fa-paper-plane"></i> पेश गर्नुहोस्';
            } else if (id === 'cancelAttendance') {
                const aBtn = document.getElementById("submitAttendance");
                if (aBtn) aBtn.innerHTML = '<i class="fas fa-paper-plane"></i> पेश गर्नुहोस्';
            }
        });
    }
});
`;

if (!content.includes('cancelSurvey\', \'cancelMonitoring\', \'cancelAttendance\'')) {
    content += cancelLogic;
}

fs.writeFileSync(path, content);
console.log('script.js cancel handlers patched.');

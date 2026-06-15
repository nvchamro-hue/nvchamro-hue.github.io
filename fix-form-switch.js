const fs = require('fs');
const path = 'c:/Users/acer/Desktop/surrvey2-30/script.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /switchDashboardView\('form'\);/g,
    `const tabBtn = document.querySelector('.nav-btn[data-tab="form-tab"]');
            if (tabBtn) tabBtn.click();`
);

content = content.replace(
    /switchDashboardView\('monitoringForm'\);/g,
    `const tabBtn = document.querySelector('.nav-btn[data-tab="monitoring-tab"]');
            if (tabBtn) tabBtn.click();`
);

content = content.replace(
    /switchDashboardView\('attendanceForm'\);/g,
    `const tabBtn = document.querySelector('.nav-btn[data-tab="attendance-tab"]');
            if (tabBtn) tabBtn.click();`
);

fs.writeFileSync(path, content);
console.log("script.js fixed for form switching.");

const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('index.html', 'utf8');

// Replace nav-btn with view-toggle-btn for the specific buttons
html = html.replace(/<button id="showSurveyView" class="nav-btn"/g, '<button id="showSurveyView" class="view-toggle-btn"');
html = html.replace(/<button id="showMonitoringView" class="nav-btn active"/g, '<button id="showMonitoringView" class="view-toggle-btn active"');
html = html.replace(/<button id="showAttendanceView" class="nav-btn"/g, '<button id="showAttendanceView" class="view-toggle-btn"');
html = html.replace(/<button id="toggleMapBtn" class="nav-btn"/g, '<button id="toggleMapBtn" class="view-toggle-btn"');

fs.writeFileSync('index.html', html);

// 2. Add CSS to style.css
let css = fs.readFileSync('style.css', 'utf8');

const toggleCss = `
.view-toggle-btn {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    color: #4a5568;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 6px 20px;
}
.view-toggle-btn:hover {
    background: #edf2f7;
    border-color: #cbd5e0;
}
.view-toggle-btn.active {
    background: linear-gradient(135deg, #3182ce 0%, #2c5282 100%);
    color: white;
    border-color: #2b6cb0;
    box-shadow: 0 4px 12px rgba(49, 130, 206, 0.4);
}
`;

if (!css.includes('.view-toggle-btn')) {
    css += '\n' + toggleCss;
    fs.writeFileSync('style.css', css);
}

console.log('Dashboard buttons fixed successfully.');

const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');

// Replace survey-card, dashboard-card styles
const oldCardStyle = `.survey-card,
.dashboard-card {
    background: rgba(255, 255, 255, 0.8);
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
    padding: 12px;
    margin-bottom: 10px;
    border: 1px solid rgba(226, 232, 240, 0.8);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}`;

const newCardStyle = `.survey-card,
.dashboard-card {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
    padding: 24px;
    margin-bottom: 20px;
    border: 1px solid rgba(255, 255, 255, 1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.survey-card:hover,
.dashboard-card:hover {
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
}

.glass-panel {
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.05);
    padding: 16px;
}`;

if (css.includes('box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);')) {
    css = css.replace(oldCardStyle, newCardStyle);
} else {
    // Just append if not found exactly
    css += '\n\n' + newCardStyle;
}

// Disable body background from style.css so Tailwind takes over
css = css.replace('background: #f0f4f8;', '/* background: #f0f4f8; Tailwind handles this */');
css = css.replace('background-image: radial-gradient(#cbd5e0 0.5px, transparent 0.5px);', '/* background-image: radial-gradient(#cbd5e0 0.5px, transparent 0.5px); */');

// Add custom scrollbar for sidebar
css += `
/* Custom Scrollbar for Sidebar */
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
`;

fs.writeFileSync('style.css', css);
console.log('style.css updated successfully.');

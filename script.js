// Google Apps Script Web App URL (Replace with actual deployed URL)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1rbnhJdHkahyumh9wRNxSptsA5CqmMsB1rbmhaXEOzkpfhC40NDQ9LmuHqWdB6TV6/exec"; 

// सुरक्षाका लागि API Key अब backend (app.js) मा स्थानान्तरण गरिएको छ।

let allSubmissions = [];
let allMonitorings = []; 
let allAttendanceMonitorings = []; 
let currentFilteredMonitorings = []; 
let currentFilteredAttendance = []; 
let currentDashboardView = 'monitoring'; // 'survey', 'monitoring', 'attendance'
let consecutiveErrorCount = 0; 
let currentFilteredSubmissions = []; 
let mapObj = null; 
let currentPage = 1;
let itemsPerPage = 10;
let activeTagId = null; 
let dismissedAlerts = new Set(JSON.parse(localStorage.getItem("dismissedAlerts_nsc") || "[]"));


const TAG_CONFIG = [
    { id: 'corruption', keywords: ['घुस', 'रकम', 'पैसा', 'अतिरिक्त', 'माग'], label: 'भ्रष्टाचार/अतिरिक्त रकम', color: '#e74c3c' },
    { id: 'absence', keywords: ['कर्मचारी', 'अनुपस्थित', 'भेटिएन', 'ढिला', 'हाजिर'], label: 'कर्मचारी अनुपस्थिति', color: '#f39c12' },
    { id: 'delay', keywords: ['झन्झटिलो', 'ढिलासुस्ती', 'प्रक्रिया', 'समय', 'सास्ती'], label: 'सेवा प्रवाहमा ढिलाइ', color: '#3498db' },
    { id: 'infrastructure', keywords: ['फोहोर', 'सरसफाइ', 'शौचालय', 'पानी', 'दुर्गन्ध'], label: 'भौतिक पूर्वाधार/सरसफाइ', color: '#27ae60' },
    { id: 'broker', keywords: ['बिचौलिया', 'दलाल', 'मध्यस्थकर्ता', 'बाहिरी'], label: 'बिचौलिया/मध्यस्थकर्ता', color: '#9b59b6' },
    { id: 'charter', keywords: ['बडापत्र', 'जानकारी', 'नक्सा', 'बोर्ड'], label: 'सूचना/बडापत्र समस्या', color: '#7f8c8d' }
];

let DISTRICT_COORDS = {};
let DISTRICTS = {};
let MUNICIPALITIES = {};


function createGradient(ctx, color, isHorizontal = false, isRadial = false, isHover = false) {
    if (!ctx) return color;

    
    const baseColor = (typeof color === 'string' && color.startsWith('#') && color.length === 9) 
                      ? color.substring(0, 7) : color;

    const canvas = ctx.canvas;
    let gradient;

    if (isRadial) {
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY);
        gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    } else {
        
        gradient = isHorizontal ? ctx.createLinearGradient(0, 0, canvas.width, 0) : ctx.createLinearGradient(0, 0, 0, canvas.height);
    }

    if (isHover) {
        
        gradient.addColorStop(0, baseColor + 'ff'); 
        gradient.addColorStop(0.5, baseColor + 'dd');
        gradient.addColorStop(1, baseColor + 'ee');
    } else {
        gradient.addColorStop(0, baseColor + 'ee');
        gradient.addColorStop(0.5, baseColor + 'aa');
        gradient.addColorStop(1, baseColor);      
    }
    return gradient;
}


const shadowPlugin = {
    id: 'shadowPlugin',
    beforeDatasetsDraw(chart, args, options) {
        if (!options.enabled) return;
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = options.color || 'rgba(0, 0, 0, 0.25)'; // छायाको रङ र ओपासिटी
        ctx.shadowBlur = options.blur || 12;                      // छायाको फैलावट
        ctx.shadowOffsetX = options.offsetX || 4;                 // दायाँतर्फको दूरी
        ctx.shadowOffsetY = options.offsetY || 4;                 // तलतर्फको दूरी
    },
    afterDatasetsDraw(chart) {
        chart.ctx.restore(); // अरू एलिमेन्टमा असर नपरोस् भनेर रिसेट गर्ने
    }
};
Chart.register(shadowPlugin);
Chart.register(ChartDataLabels);

// Chart.js का लेजेन्ड (Legend) का लागि ग्लोबल डिफल्ट सेटिङ्स
Chart.defaults.plugins.legend.labels.color = '#4a5568'; // व्यावसायिक गाढा खरानी रङ
Chart.defaults.plugins.legend.labels.font = {
    family: 'Kalimati',
    size: 11,
    weight: '500'
};

/**
 * चार्ट डेटा लेबल्सका लागि साझा कन्फिगरेसन
 */
const GLOBAL_DATALABELS_CONFIG = {
    color: '#ffffff',
    font: { family: 'Kalimati', weight: 'bold', size: 11 },
    formatter: (value) => toNepaliDigits(value),
    // संख्या ० छ भने नदेखाउने
    display: (context) => context.dataset.data[context.dataIndex] > 0,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowBlur: 4,
    anchor: 'center',
    align: 'center'
};

// चार्ट एनिमेसनको गति र शैली परिवर्तन गर्न यहाँ मानहरू बदल्नुहोस्
// Easing options: 'linear', 'easeInQuad', 'easeOutQuart', 'easeInOutElastic', 'easeOutBounce', etc.
const GLOBAL_CHART_ANIMATION = {
    duration: 1500,        // एनिमेसनको समय (ms मा) - १५००ms = १.५ सेकेन्ड
    easing: 'easeOutQuart' // सुरुमा छिटो र अन्त्यमा बिस्तारै हुने (Smooth ease-out)
};

// चार्ट अब्जेक्टहरूलाई ग्लोबल रूपमा डिक्लेयर गरिएको (ReferenceError हटाउन)
let genderChartObj = null, satisfactionChartObj = null, ghusChartObj = null, devChartObj = null, dynamicChartObj = null, topUnsatisfiedChartObj = null, topSatisfiedChartObj = null;
let charterClarityChartObj = null, attendanceChartObj = null, brokerChartObj = null, facilitiesChartObj = null, staffingChartObj = null, vacantByProvinceChartObj = null, provStaffingComparisonChartObj = null;
let vacantPercentPieChartObj = null;
// रङ्गका थिमहरू (Color Themes)
const CHART_THEMES = {
    default: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'],
    ocean: ['#0077b6', '#00b4d8', '#90e0ef', '#023e8a', '#0096c7', '#48cae4', '#ade8f4', '#00b4d8', '#caf0f8', '#03045e'],
    forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#d8f3dc', '#1b4332', '#081c15', '#52b788'],
    sunset: ['#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1'],
    vibrant: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#1a535c', '#f7fff7', '#ff9f1c', '#2ec4b6', '#e71d36', '#011627', '#fdfffc'],
    modern: ['#4f46e5', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#d946ef', '#f59e0b', '#0d9488', '#475569']
};
let activeTheme = 'default';

/**
 * रङ्गको चम्किलोपन (Brightness) र गाढापन (Saturation) घटाउने फङ्सन।
 * यसले HSL मोडल प्रयोग गरी चार्टहरूलाई अझ व्यावसायिक र कम चम्किलो (less vivid) बनाउँछ।
 * sReduce: Saturation घटाउने प्रतिशत, lReduce: Lightness घटाउने प्रतिशत।
 */
function dampenColor(hex, sReduce = 25, lReduce = 15) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
    
    // Hex to RGB
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; 
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // Saturation र Lightness घटाउने (Vividness र Brightness कम गर्न)
    s = Math.max(0, s * (1 - sReduce / 100));
    l = Math.max(0, l * (1 - lReduce / 100));

    // HSL back to RGB
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };

    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);

    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// थिम अनुसार रङ्गहरू तान्ने फङ्सन
function getThemeColors(opacity = 1) {
    return CHART_THEMES[activeTheme].map(color => {
        // रङ्गलाई अलि मत्थर (Muted) बनाउने (Saturation -30%, Lightness -20%)
        const mutedColor = dampenColor(color, 30, 20);
        if (opacity === 1) return mutedColor;
        return mutedColor + Math.floor(opacity * 255).toString(16).padStart(2, '0');
    });
}

// नयाँ अनुगमन चार्ट अब्जेक्टहरू
let websiteChartObj = null, disclosureChartObj = null, autoInfoChartObj = null, workroomChartObj = null, infoBoardChartObj = null, cleaningChartObj = null;
let attendanceViolationChartObj = null;

// Province, District, and Municipality Data
const PROVINCE = {
    1: 'कोशी प्रदेश',
    2: 'मधेश प्रदेश',
    3: 'बागमती प्रदेश',
    4: 'गण्डकी प्रदेश',
    5: 'लुम्बिनी प्रदेश',
    6: 'कर्णाली प्रदेश',
    7: 'सुदूरपश्चिम प्रदेश'
};

/**
 * डाटा अब्जेक्टबाट सही भ्यालू (Value) खोज्ने फङ्सन (Smart Mapping)
 * गुगल सीटका हेडरहरू र कोडका की (Key) हरू नमिल्दा यो प्रयोग गरिन्छ।
 */
function getVal(obj, field, label) {
    if (!obj) return "";
    // १. सिधै की (key) बाट खोज्ने
    if (obj[field] !== undefined && obj[field] !== null && obj[field] !== "") return obj[field];
    // २. लेबल (label) बाट खोज्ने
    if (obj[label] !== undefined && obj[label] !== null && obj[label] !== "") return obj[label];
    
    const keys = Object.keys(obj);
    // ३. अनावश्यक चिन्हहरू (कम्टा, डट, अङ्क) हटाएर र 'व/ब' लाई समान मानेर तुलना गर्ने (Robust Matching)
    const clean = (s) => String(s || "").replace(/[\s.,0-9०-९?？।()\/\\-]|बारेमा|सम्बन्धमा|सम्बन्धी/g, '').replace(/व/g, 'ब').toLowerCase();
    const cleanLabel = clean(label);
    const cleanField = clean(field);

    let found = keys.find(k => {
        const ck = clean(k);
        if (cleanField && ck.includes(cleanField)) return true;
        if (!cleanLabel) return false;
        // मुख्य शब्दहरू (Start/End) भिडाउने ताकि बीचमा थप शब्द भए पनि मिलोस्
        if (cleanLabel.length > 8) {
            return ck.includes(cleanLabel.substring(0, 5)) && ck.includes(cleanLabel.substring(cleanLabel.length - 4));
        }
        return ck.includes(cleanLabel) || cleanLabel.includes(ck);
    });
    
    return found ? obj[found] : "";
}

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
    const pradeshSelects = [document.getElementById("pradesh"), document.getElementById("filterPradesh"), document.getElementById("m_pradesh"), document.getElementById("a_pradesh")];
    pradeshSelects.forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '<option value="">प्रदेश छान्नुहोस्</option>'; // Clear existing options and add a default
        for (const [id, name] of Object.entries(PROVINCE)) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = name;
            sel.appendChild(option);
        }
    });
}

// Update Districts based on Province
function updateDistricts(pId, jId, sId) {
    const pradeshId = document.getElementById(pId).value;
    const jillaSelect = document.getElementById(jId);
    const sthaaniyaSelect = document.getElementById(sId);

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
function updateMunicipalities(pId, jId, sId) {
    const pradeshId = document.getElementById(pId).value;
    const district = document.getElementById(jId).value;
    const sthaaniyaSelect = document.getElementById(sId);

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
    // Local file fetch (CORS) fix: Use global variable from metadata.js
    // This allows the app to run via file:// protocol without a web server
    if (typeof METADATA !== 'undefined') {
        MUNICIPALITIES = METADATA.municipalities;
        DISTRICTS = METADATA.districts;
        DISTRICT_COORDS = METADATA.coords;
    } else {
        console.error("Metadata load हुन सकेन: metadata.js फाइल फेला परेन वा METADATA डिफाइन गरिएको छैन।");
    }
 
    populateProvinces();
    document.getElementById("pradesh").addEventListener("change", () => updateDistricts("pradesh", "jilla", "sthaaniya_taha"));
    document.getElementById("jilla").addEventListener("change", () => updateMunicipalities("pradesh", "jilla", "sthaaniya_taha"));
    
    // Monitoring dropdowns
    document.getElementById("m_pradesh")?.addEventListener("change", () => updateDistricts("m_pradesh", "m_jilla", "m_sthaaniya"));
    document.getElementById("m_jilla")?.addEventListener("change", () => updateMunicipalities("m_pradesh", "m_jilla", "m_sthaaniya"));
    document.getElementById("a_pradesh")?.addEventListener("change", () => updateDistricts("a_pradesh", "a_jilla", "a_sthaaniya"));
    document.getElementById("a_jilla")?.addEventListener("change", () => updateMunicipalities("a_pradesh", "a_jilla", "a_sthaaniya"));
    
    // Attendance Monitoring dropdowns
    // populateProvinces(); // Redundant call, as it's called once above and the function now clears options
    addAttendanceRow(); // Initial row

    // विशिष्ट प्रश्न विश्लेषण (Dynamic Analysis) छनोट गर्दा ड्यासबोर्ड रिफ्रेस गर्ने
    document.getElementById("dynamicFieldSelector")?.addEventListener("change", refreshDashboard);

    // थप अनुगमन फिल्टर बटनको टोगल लजिक
    document.getElementById("toggleMonitoringFilters")?.addEventListener("click", function() {
        const container = document.getElementById("monitoringExtraFilters");
        if (container.style.display === "none" || container.style.display === "") {
            container.style.display = "block";
            this.textContent = "✖ फिल्टरहरू लुकाउनुहोस्";
        } else {
            container.style.display = "none";
            this.textContent = "🔍 थप अनुगमन फिल्टरहरू";
        }
    });

    // थिम परिवर्तन गर्दा ड्यासबोर्ड रिफ्रेस गर्ने
    document.getElementById("themeSelector")?.addEventListener("change", function() {
        activeTheme = this.value;
        refreshDashboard();
    });

    // मुख्य फिल्टर बार कोल्याप्स/अनकोल्याप्स गर्ने लजिक
    const filterToggleHeader = document.getElementById("filterToggleHeader");
    const mainFilterBar = document.getElementById("mainFilterBar");
    const filterArrow = document.getElementById("filterArrow");
    filterToggleHeader?.addEventListener("click", function() {
        mainFilterBar?.classList.toggle("collapsed");
        filterArrow?.classList.toggle("arrow-rotated");
    });

    // अनुगमन क्षेत्र (Field) छान्दा तुरुन्तै चार्ट र तथ्याङ्क अपडेट गर्ने
    document.getElementById("monitoringFieldSelector")?.addEventListener("change", refreshDashboard);

    document.getElementById("filterPradesh")?.addEventListener("change", updateFilterDistricts);
    document.getElementById("filterDistrict")?.addEventListener("change", updateFilterMunicipalities);

    // पेजिनेसन साइज परिवर्तन गर्दा
    document.getElementById("pageSizeSelect")?.addEventListener("change", function() {
        itemsPerPage = parseInt(this.value);
        currentPage = 1;
        refreshDashboard();
    });

    // Nepali date picker initialization: plugin if available, else local fallback
    const nepaliFields = document.querySelectorAll('.nepali-datepicker');
    nepaliFields.forEach(field => {
        field.addEventListener('focus', () => showNepaliDatePicker(field));
        field.addEventListener('click', () => showNepaliDatePicker(field));
    });

    // Scroll to Top बटनको प्रदर्शनी नियन्त्रण
    const scrollTopBtn = document.getElementById("scrollTopBtn");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 400) {
            scrollTopBtn.style.display = "flex";
        } else {
            scrollTopBtn.style.display = "none";
        }
    });

    scrollTopBtn?.addEventListener("click", () => {
        // १. Haptic Feedback (मोबाइलका लागि सानो कम्पन)
        if (navigator.vibrate) {
            navigator.vibrate(40); // ४० मिलिसेकेन्डको कम्पन
        }

        // २. साउन्ड इफेक्ट (सानो क्लिक आवाज)
        // नोट: यहाँ मैले एउटा अनलाइन लिङ्क प्रयोग गरेको छु, तपाईंले आफ्नो स्थानीय फाइल पनि राख्न सक्नुहुन्छ
        const clickSound = new Audio('https://www.soundjay.com/buttons/button-16.mp3');
        clickSound.volume = 0.4; // आवाजको मात्रा ४०% मा सेट गरिएको
        clickSound.play().catch(e => console.log("Browser policy ले गर्दा साउन्ड प्ले भएन।"));

        window.scrollTo({ top: 0, behavior: "smooth" });
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
        { inputId: "sujhaw", counterId: "sujhaw_counter", limit: 100 },
        { inputId: "m_office", counterId: "m_office_counter", limit: 20 },
        { inputId: "m_main_services", counterId: "m_main_services_counter", limit: 100 },
        { inputId: "m_problems", counterId: "m_problems_counter", limit: 100 },
        { inputId: "m_measures", counterId: "m_measures_counter", limit: 100 },
        { inputId: "m_comment", counterId: "m_comment_counter", limit: 150 }
    ];

    countersToSetup.forEach(item => {
        const el = document.getElementById(item.inputId);
        if (el) {
            el.addEventListener('input', () => updateWordCountDisplay(el, item.counterId, item.limit));
        }
    });

    // Add event listeners for chart type cycle buttons
    document.querySelectorAll('.chart-type-cycle-btn').forEach(button => {
        button.addEventListener('click', function() {
            const chartId = this.dataset.chartId;
            const currentType = chartTypes[chartId];
            const cycle = CHART_TYPE_CYCLES[chartId];
            const currentIndex = cycle.indexOf(currentType);
            const nextIndex = (currentIndex + 1) % cycle.length;
            chartTypes[chartId] = cycle[nextIndex];
            refreshDashboard(); // This will redraw all charts, including the one whose type changed
        });
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
    dynamicChart: 'bar', // Default for dynamic chart
    charterClarityChart: 'bar',
    websiteChart: 'pie',
    disclosureChart: 'doughnut',
    autoInfoChart: 'pie',
    attendanceChart: 'doughnut',
    workroomChart: 'bar',
    infoBoardChart: 'pie',
    cleaningChart: 'bar',
    brokerChart: 'doughnut',
    vacantByProvinceChart: 'bar',
    provStaffingComparisonChart: 'bar',
    vacantPercentPieChart: 'pie',
    staffingChart: 'bar',
    facilitiesChart: 'bar'
};

// Define cycles for each chart
const CHART_TYPE_CYCLES = {
    genderChart: ['bar', 'pie', 'doughnut'],
    satisfactionChart: ['doughnut', 'pie', 'bar'],
    ghusChart: ['pie', 'doughnut', 'bar'],
    developmentChart: ['bar', 'pie', 'doughnut'],
    topUnsatisfiedChart: ['bar', 'pie', 'doughnut'],
    topSatisfiedChart: ['bar', 'pie', 'doughnut'],
    dynamicChart: ['bar', 'pie', 'doughnut', 'line'],
    charterClarityChart: ['bar', 'pie', 'doughnut', 'line'],
    websiteChart: ['pie', 'doughnut', 'bar', 'line'],
    disclosureChart: ['doughnut', 'pie', 'bar', 'line'],
    autoInfoChart: ['pie', 'doughnut', 'bar', 'line'],
    attendanceChart: ['doughnut', 'pie', 'bar', 'line'],
    workroomChart: ['bar', 'pie', 'doughnut', 'line'],
    infoBoardChart: ['pie', 'doughnut', 'bar', 'line'],
    cleaningChart: ['bar', 'pie', 'doughnut', 'line'],
    brokerChart: ['doughnut', 'pie', 'bar', 'line'],
    vacantByProvinceChart: ['bar', 'pie', 'doughnut', 'line'],
    provStaffingComparisonChart: ['bar', 'pie', 'doughnut', 'line'],
    vacantPercentPieChart: ['pie', 'doughnut', 'bar'],
    staffingChart: ['bar', 'pie', 'doughnut', 'line'],
    facilitiesChart: ['bar', 'pie', 'doughnut', 'line']
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
        const colors = ['#ef4444', '#f97316', '#f59e0b']; 
        return `
        <div class="stat-card" style="border-left: 4px solid ${colors[index]}; margin-bottom: 6px; text-align: left; background: #fffdfd; padding: 8px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); cursor: pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.satisfaction_flag === 'असन्तुष्ट' && d.mukhya_karyalay === '${office}'), 'असन्तुष्ट: ${office}', 'survey')">
            <div style="font-size: 0.95rem; font-weight: bold; color: #de3053; margin-bottom: 2px;">
                ${toNepaliDigits(index + 1)}. <i class="fas fa-building"></i> ${office}
            </div>
            <div style="font-size: 0.85rem; color: #4a5568;"><i class="fas fa-frown"></i> असन्तुष्टि संख्या: <strong style="color: #ef4444;">${toNepaliDigits(count)}</strong></div>
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
                backgroundColor: ['#ef4444', '#f97316', '#f59e0b'].map(c => createGradient(ctx, c, true)),
                borderColor: ['#ef4444', '#f97316', '#f59e0b'],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const office = top3[i][0];
                    const filtered = data.filter(d => d.satisfaction_flag === "असन्तुष्ट" && d.mukhya_karyalay === office);
                    showDetailedTable(filtered, `असन्तुष्ट: ${office}`, 'survey');
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' },
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
        const colors = ['#10b981', '#34d399', '#6ee7b7'];
        return `
        <div class="stat-card" style="border-left: 4px solid ${colors[index]}; margin-bottom: 6px; text-align: left; background: #fdfdfd; padding: 8px 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); cursor: pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.satisfaction_flag === 'सन्तुष्ट' && d.mukhya_karyalay === '${office}'), 'सन्तुष्ट: ${office}', 'survey')">
            <div style="font-size: 0.95rem; font-weight: bold; color: #27ae60; margin-bottom: 2px;">
                ${toNepaliDigits(index + 1)}. <i class="fas fa-building"></i> ${office}
            </div>
            <div style="font-size: 0.85rem; color: #4a5568;"><i class="fas fa-smile"></i> सन्तुष्टि संख्या: <strong style="color: #10b981;">${toNepaliDigits(count)}</strong></div>
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
                backgroundColor: ['#10b981', '#34d399', '#6ee7b7'].map(c => createGradient(ctx, c, true)),
                borderColor: ['#10b981', '#34d399', '#6ee7b7'],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: { 
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const office = top3[i][0];
                    const filtered = data.filter(d => d.satisfaction_flag === "सन्तुष्ट" && d.mukhya_karyalay === office);
                    showDetailedTable(filtered, `सन्तुष्ट: ${office}`, 'survey');
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' }, 
            animations: (chartTypes.topSatisfiedChart === 'bar' || chartTypes.topSatisfiedChart === 'line') ? { x: { from: (ctx) => ctx.chart.scales.x.getPixelForValue(0) } } : {},
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } }, y: { ticks: { font: { family: 'Kalimati' } } } } 
        }
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
    // १. सुरुमै लोकल डाटा लोड गरिहाल्ने ताकि युजरले तत्काल ड्यासबोर्ड देख्न सकोस्
    loadLocalDataFallback();
    const storedMonitoring = localStorage.getItem("monitoringData_nsc");
    if (storedMonitoring) allMonitorings = JSON.parse(storedMonitoring);
    const storedAttendance = localStorage.getItem("attendanceData_nsc");
    if (storedAttendance) allAttendanceMonitorings = JSON.parse(storedAttendance);

    // तत्काल ड्यासबोर्ड देखाउने
    switchDashboardView(currentDashboardView);

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा अपडेट हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }
    
    // इन्टरनेट जडान जाँच गर्ने र अफलाइन मोड अपडेट गर्ने
    function updateOnlineStatus() {
        const badge = document.getElementById('offlineBadge');
        if (navigator.onLine) {
            if (badge) badge.style.display = 'none';
            // अनलाइन हुने बित्तिकै पेन्डिङ डाटा सिङ्क गर्ने
            syncPendingData();
            return true;
        } else {
            if (badge) badge.style.display = 'inline-block';
            return false;
        }
    }

    // पहिलो पटक जाँच गर्ने
    const isOnline = updateOnlineStatus();
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // डाटा लोड हुन धेरै समय लागेमा रिफ्रेस बटन देखाउने (Timeout: १० सेकेन्ड)
    const slowLoadTimeout = setTimeout(() => {
        if (loadingOverlay && loadingOverlay.style.display === "flex" && loadingText) {
            loadingText.innerHTML = `
                नेटवर्क ढिलो भएकोले डाटा लोड हुन समय लागिरहेको छ।<br>
                <button onclick="location.reload()" style="margin-top:15px; padding:10px 20px; background:#387ae6; color:white; border:none; border-radius:10px; cursor:pointer; font-family:'Kalimati'; box-shadow: 0 4px 10px rgba(56, 122, 230, 0.3);">🔄 पुनः लोड गर्नुहोस्</button>
            `;
        }
    }, 10000);

    // २. ब्याकग्राउण्डमा मात्र सर्भरबाट डाटा तान्ने
    if (isOnline && SCRIPT_URL && SCRIPT_URL.trim() !== "") {
        try {
            const response = await fetch(SCRIPT_URL);
            if (response.ok) {
                const result = await response.json();
                if (result.survey) {
                    allSubmissions = result.survey;
                    // रिभर्स गर्ने भए एक पटक मात्र गर्ने (भर्खरै आएकालाई माथि देखाउन)
                    allSubmissions.reverse(); 
                    localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions));
                }
                if (result.monitoring) {
                    allMonitorings = result.monitoring;
                    allMonitorings.reverse();
                    localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));
                }
                if (result.attendance) {
                    allAttendanceMonitorings = result.attendance;
                    allAttendanceMonitorings.reverse();
                    localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));
                }
                // नयाँ डाटा आएपछि मात्र पुनः रिफ्रेस गर्ने
                refreshDashboard();
            }
        } catch (e) {
            console.warn("Google Sheets बाट डाटा ल्याउन सकिएन, स्थानीय भण्डारण प्रयोग गरिँदैछ:", e);
        }
    }

    clearTimeout(slowLoadTimeout);
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
        playErrorSound("विवरण अधुरो छ, कृपया रातो चिन्ह लागेका क्षेत्रहरू भर्नुहोस्।");
        return;
    }

    // 'अन्य' विकल्प छानिएको खण्डमा टेक्स्ट बक्स खाली भए सबमिट हुन नदिने (Validation)
    const posOtherCb = document.getElementById("pos_other_cb");
    const posOtherTxt = document.getElementById("pos_other_text");
    if (posOtherCb?.checked && !posOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया सन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        playErrorSound();
        posOtherTxt.focus();
        return;
    }

    const negOtherCb = document.getElementById("neg_other_cb");
    const negOtherTxt = document.getElementById("neg_other_text");
    if (negOtherCb?.checked && !negOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया असन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        playErrorSound();
        negOtherTxt.focus();
        return;
    }

    // योजना सम्बन्धी असन्तुष्टिको 'अन्य' विकल्प जाँच
    const yojanaOtherCb = document.querySelector('input[name="asantushti_karan_yojana"][value="अन्य (लेख्नुहोस्)"]');
    const yojanaOtherTxt = document.querySelector('input[name="asantushti_karan_other"]');
    if (yojanaOtherCb?.checked && !yojanaOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया योजना असन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        playErrorSound();
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
                playErrorSound();
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
            playErrorSound("गुगल सिटमा कनेक्ट हुन सकेन।");
            // असफल भएमा पेन्डिङ क्यूमा राख्ने
            addToPendingSync(payload);
            document.getElementById("formStatus").innerHTML = "⚠️ गुगल सिटमा सेभ गर्न समस्या भयो। स्थानीय भण्डारणमा सेभ गरिएको छ।";
        }
    } else {
        if (loadingOverlay) loadingOverlay.style.display = "none";
        addToPendingSync(payload);
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
    // सफलताको साउन्ड बजाउने
    playSuccessSound();

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

/**
 * सिङ्क हुन बाँकी डाटालाई क्यूमा थप्ने
 */
function addToPendingSync(payload) {
    try {
        let pending = JSON.parse(localStorage.getItem("nsc_pending_sync") || "[]");
        pending.push(payload);
        localStorage.setItem("nsc_pending_sync", JSON.stringify(pending));
        console.log("Data added to pending sync queue.");
    } catch (e) {
        console.error("Error adding to pending sync:", e);
    }
}

// अनुगमन फारम सबमिट गर्ने लजिक
document.getElementById("submitMonitoring")?.addEventListener("click", async function() {
    const form = document.getElementById("monitoringForm");
    if (!form.checkValidity()) { 
        form.reportValidity(); 
        playErrorSound();
        return; 
    }

    // शब्द सीमा जाँच (Word Limit Validation for Monitoring Fields)
    const wordLimits = [
        { id: "m_office", limit: 20, name: "कार्यालयको नाम" },
        { id: "m_main_services", limit: 100, name: "मुख्य सेवाहरू" },
        { id: "m_problems", limit: 100, name: "मूलभूत समस्या/अनियमितता" },
        { id: "m_measures", limit: 100, name: "अपनाएका सुधारका उपायहरू" },
        { id: "m_comment", limit: 150, name: "अनुगमनकर्ताको टिप्पणी" }
    ];

    for (let item of wordLimits) {
        const el = document.getElementById(item.id);
        if (el && el.value.trim()) {
            const count = countWords(el.value);
            if (count > item.limit) {
                Swal.fire({ icon: 'warning', title: 'शब्द सीमा नाघ्यो', text: `${item.name} बढीमा ${toNepaliDigits(item.limit)} शब्दको हुनुपर्छ। (हाल: ${toNepaliDigits(count)} शब्द)`, confirmButtonColor: '#387ae6' });
                playErrorSound();
                el.focus();
                return;
            }
        }
    }

    const formData = new FormData(form);
    let payload = { 
        type: 'monitoring', 
        timestamp: new Date().toISOString() 
    };
    
    for (let [key, val] of formData.entries()) {
        if (payload[key]) {
            if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
            payload[key].push(val);
        } else {
            payload[key] = val;
        }
    }
    
    // Province/District mapping
    payload.m_pradesh = PROVINCE[payload.m_pradesh] || payload.m_pradesh;

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा सुरक्षित हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }

    try {
        // Local storage मा सेभ गर्ने
        allMonitorings.unshift(payload);
        localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));

        if (SCRIPT_URL) {
            try {
                await fetch(SCRIPT_URL, { method: "POST", mode: 'no-cors', body: JSON.stringify(payload) });
            } catch (err) {
                addToPendingSync(payload);
                throw err;
            }
        }
        
        playSuccessSound();
        Swal.fire({ icon: 'success', title: 'सफल!', text: 'कार्यालय अनुगमन फारम सुरक्षित भयो।', confirmButtonColor: '#387ae6' });
        form.reset();

        // सफलतापूर्वक सेभ भएपछि २ सेकेन्डमा ड्यासबोर्डमा आफैं लैजाने
        setTimeout(() => {
            const dashboardBtn = document.querySelector('.tab-btn[data-tab="dashboard-tab"]');
            if (dashboardBtn) {
                dashboardBtn.click(); // यसले ट्याब स्विच र स्क्रोल टप दुबै गर्छ
            }
        }, 2000);
    } catch (e) {
        playErrorSound("डाटा सेभ गर्दा समस्या भयो।");
        console.error(e);
        Swal.fire({ icon: 'info', title: 'नोट', text: 'डाटा स्थानीय भण्डारणमा सेभ भयो।' });
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = "none";
    }
});

// समय पालना र पोशाक अनुगमन फारमका लागि डाइनामिक लहरहरू
function addAttendanceRow() {
    const tbody = document.getElementById("attendanceEntryBody");
    if (!tbody) return;
    const rowCount = tbody.rows.length + 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>
            <select name="emp_category[]" required>
                <option value="अनुगमन मितिमा अनुपस्थित/ढिला आउने">अनुपस्थित/ढिला (आज)</option>
                <option value="अघिल्लो मितिमा अनुपस्थित/ढिला">अघिल्लो मितिमा अनुपस्थित/ढिला</option>
                <option value="हाजिर भई कार्यकक्षमा नभेटिएको">कार्यकक्षमा नभेटिएको</option>
                <option value="तोकिएको पोशाक नलगाएको">तोकिएको पोशाक नलगाएको</option>
            </select>
        </td>
        <td><input type="text" name="emp_rank[]" placeholder="पद"></td>
        <td><input type="text" name="emp_symbol[]" placeholder="संकेत नं."></td>
        <td><input type="text" name="emp_name[]" placeholder="कर्मचारीको नाम"></td>
        <td><input type="text" name="emp_extra[]" placeholder="कैफियत/मिति"></td>
        <td><button type="button" onclick="this.closest('tr').remove()" style="background:#e74c3c; color:white; border:none; padding:3px 8px; border-radius:4px; font-size: 0.84rem;">हटाउने</button></td>
    `;
    tbody.appendChild(tr);
}

document.getElementById("submitAttendance")?.addEventListener("click", async function() {
    const form = document.getElementById("attendanceForm");
    
    // भ्यालिडेसनका लागि क्लास थप्ने
    form.classList.add('was-validated');

    if (!form.checkValidity()) { 
        form.reportValidity(); 
        playErrorSound("विवरण अधुरो छ, कृपया रातो चिन्ह लागेका क्षेत्रहरू भर्नुहोस्।");
        return; 
    }

    const formData = new FormData(form);

    // १. मुख्य विवरणहरू खाली भए सबमिट हुन नदिने (Extra JS Validation)
    const mandatoryFields = ["a_pradesh", "a_jilla", "a_sthaaniya", "a_office", "a_date", "a_total_staff", "a_working_staff", "a_vacant_staff"];
    for (let fieldId of mandatoryFields) {
        const val = formData.get(fieldId);
        if (!val || val.toString().trim() === "") {
            Swal.fire({ icon: 'warning', title: 'अधुरो विवरण', text: 'कृपया सबै अनिवार्य फिल्डहरू भर्नुहोस्।', confirmButtonColor: '#387ae6' });
            playErrorSound("अनिवार्य विवरणहरू भर्न बाँकी छ।");
            return;
        }
    }

    // २. दरबन्दी संख्याको गणितीय शुद्धता जाँच
    const total = parseInt(formData.get("a_total_staff") || 0);
    const working = parseInt(formData.get("a_working_staff") || 0);
    const vacant = parseInt(formData.get("a_vacant_staff") || 0);
    if (total !== (working + vacant)) {
        Swal.fire({ icon: 'error', title: 'तथ्याङ्क मिलेन', text: 'कुल दरबन्दी संख्या, कार्यरत र रिक्त संख्याको योगफलसँग मिल्नुपर्छ।', confirmButtonColor: '#387ae6' });
        playErrorSound("तथ्याङ्कको गणितीय योगफल मिलेन।");
        return;
    }

    let payload = { 
        type: 'attendance', 
        timestamp: new Date().toISOString(), // मुख्य रेकर्डको लागि टाइमस्ट्याम्प
        mainRecordId: new Date().getTime().toString(), // अद्वितीय ID
        rows: []
    };

    // Form base data
    payload.pradesh = PROVINCE[formData.get("a_pradesh")] || "";
    payload.jilla = formData.get("a_jilla") || "";
    payload.sthaaniya = formData.get("a_sthaaniya") || "";
    payload.office = formData.get("a_office");
    payload.total_staff = formData.get("a_total_staff");
    payload.working_staff = formData.get("a_working_staff");
    payload.vacant_staff = formData.get("a_vacant_staff");
    payload.date = formData.get("a_date");
    payload.time = formData.get("a_time");
    payload.phone = formData.get("a_phone");
    payload.monitor_name = formData.get("a_monitor_name");
    payload.monitor_rank = formData.get("a_monitor_rank");

    // Get rows
    const categories = formData.getAll("emp_category[]");
    const ranks = formData.getAll("emp_rank[]");
    const symbols = formData.getAll("emp_symbol[]");
    const names = formData.getAll("emp_name[]");
    const extras = formData.getAll("emp_extra[]");

    let hasValidRow = false;
    for(let i=0; i < names.length; i++) {
        // नाम वा संकेत नं. मध्ये कम्तिमा एउटा हुनुपर्ने गरी सुधारिएको
        if(names[i].trim() !== "" || symbols[i].trim() !== "") {
            hasValidRow = true;
            payload.rows.push({
                category: categories[i],
                rank: ranks[i],
                symbol: symbols[i],
                name: names[i],
                extra: extras[i],
                mainRecordId: payload.mainRecordId // मुख्य रेकर्डसँग लिङ्क गर्न
            });
        }
    }

    if (!hasValidRow) {
        Swal.fire({ 
            icon: 'warning', 
            title: 'कर्मचारी विवरण आवश्यक',
            text: 'कृपया अनुगमन तालिकामा कम्तिमा एक कर्मचारीको विवरण (नाम वा संकेत नं.) अनिवार्य रुपमा भर्नुहोस्।',
            confirmButtonColor: '#387ae6'
        });
        playErrorSound("कम्तिमा एक कर्मचारीको विवरण भर्नुहोस्।");
        return;
    }

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा सुरक्षित हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }

    try {
        allAttendanceMonitorings.unshift(payload);
        localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));

        if (SCRIPT_URL) {
            try {
                await fetch(SCRIPT_URL, { method: "POST", mode: 'no-cors', body: JSON.stringify(payload) });
            } catch (err) {
                addToPendingSync(payload);
                throw err;
            }
        }
        playSuccessSound();
        Swal.fire({ icon: 'success', title: 'सफल!', text: 'समय पालना र पोशाक अनुगमन विवरण सुरक्षित भयो।' });
        form.reset();

        // सफलतापूर्वक सेभ भएपछि २ सेकेन्डमा ड्यासबोर्डमा आफैं लैजाने
        setTimeout(() => {
            const dashboardBtn = document.querySelector('.tab-btn[data-tab="dashboard-tab"]');
            if (dashboardBtn) {
                dashboardBtn.click();
            }
        }, 2000);
        form.classList.remove('was-validated');
        document.getElementById("attendanceEntryBody").innerHTML = "";
        addAttendanceRow();
    } catch (e) {
        playErrorSound();
        console.error(e);
        Swal.fire({ icon: 'info', text: 'डाटा स्थानीय भण्डारणमा सेभ भयो।' });
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = "none";
    }
});

/**
 * पेन्डिङ रहेका डाटाहरू सर्भरमा पठाउने (Auto Sync)
 */
async function syncPendingData() {
    if (!navigator.onLine || !SCRIPT_URL) return;

    let pending = JSON.parse(localStorage.getItem("nsc_pending_sync") || "[]");
    if (pending.length === 0) return;

    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) syncIndicator.classList.remove('error');
    if (syncIndicator) syncIndicator.classList.add('active');

    console.log(`Syncing ${toNepaliDigits(pending.length)} pending records...`);
    
    let remaining = [];
    for (let item of pending) {
        try {
            await fetch(SCRIPT_URL, { 
                method: "POST", 
                mode: 'no-cors', 
                body: JSON.stringify(item) 
            });
            console.log("Item synced successfully");
        } catch (e) {
            remaining.push(item); // असफल भएमा फेरि क्यूमै राख्ने
        }
    }

    localStorage.setItem("nsc_pending_sync", JSON.stringify(remaining));

    if (syncIndicator) {
        if (remaining.length === 0) {
            syncIndicator.classList.remove('error');
            // सफलताको सन्देश १.५ सेकेन्डसम्म देखाउने
            syncIndicator.innerHTML = "✅ डेटा सिङ्क सफल भयो!";
            setTimeout(() => {
                syncIndicator.classList.remove('active');
                // बन्द भएपछि पुनः साविकको टेक्स्टमा फर्काउने
                setTimeout(() => { syncIndicator.innerHTML = "🔄 डेटा सिङ्क हुँदैछ..."; }, 400);
            }, 1500);
            console.log("All pending data synced successfully.");
        } else {
            // सिङ्क असफल भएको खण्डमा रातो सन्देश देखाउने
            playErrorSound(`सिङ्क असफल: ${toNepaliDigits(remaining.length)} वटा रेकर्ड बाँकी छन्`);
        }
    }
}

// Dashboard rendering
function refreshDashboard() {
    if (currentDashboardView === 'monitoring') {
        refreshMonitoringDashboard();
        return;
    }
    if (currentDashboardView === 'attendance') {
        refreshAttendanceDashboard();
        return;
    }
    // साविकको सर्वेक्षण ड्यासबोर्ड लजिक
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
        // स्मार्ट म्यापिङ प्रयोग गरेर फिल्टरका लागि डाटा तान्ने
        const rPradesh = getVal(r, 'pradesh', 'प्रदेश');
        const rJilla = getVal(r, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(r, 'sthaaniya_taha', 'स्थानीय तह');
        const rOffice = getVal(r, 'mukhya_karyalay', 'कार्यालय');
        const rGender = getVal(r, 'gender', 'लिङ्ग');

        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            if (rPradesh != pradeshFilter && rPradesh !== provinceName) return false;
        }
        if (districtFilter && rJilla !== districtFilter) return false;
        if (sthaaniyaFilter && rSthaaniya !== sthaaniyaFilter) return false;
        if (officeFilter && !(rOffice || "").toLowerCase().includes(officeFilter)) return false;
        if (genderF && rGender !== genderF) return false;
        
        // फिल्टरको लागि वर्णनात्मक मितिलाई मानक (YYYY-MM-DD) मा बदलेर तुलना गर्ने
        const rDate = getVal(r, 'survey_date', 'मिति');
        let recDate = getStandardDate(rDate || "");
        if (fromDate && recDate < fromDate) return false;
        if (toDate && recDate > toDate) return false;
        return true;
    });
    currentFilteredSubmissions = filtered;
    renderStats(filtered);
    renderTopUnsatisfiedOffices(filtered);
    renderTopSatisfiedOffices(filtered);
    updateCharts(filtered);
    renderTable(filtered);
    updateDynamicAnalysis(filtered);
}

function refreshMonitoringDashboard() {
    const pradeshFilter = document.getElementById("filterPradesh")?.value || "";
    const districtFilter = document.getElementById("filterDistrict")?.value || "";
    const officeFilter = document.getElementById("filterOffice")?.value.toLowerCase() || "";

    let filtered = allMonitorings.filter(r => {
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            if (r.m_pradesh !== provinceName) return false;
        }
        if (districtFilter && r.m_jilla !== districtFilter) return false;
        if (officeFilter && !(r.m_office || "").toLowerCase().includes(officeFilter)) return false;

        // ट्याग फिल्टर (Tag Filtering Logic)
        if (activeTagId) {
            const config = TAG_CONFIG.find(t => t.id === activeTagId);
            const text = (r.m_problems || "");
            if (!config.keywords.some(kw => text.includes(kw))) return false;
        }
        return true;
    });
    currentFilteredMonitorings = filtered; // डाउनलोडका लागि डाटा अपडेट गर्ने

    const fieldSelector = document.getElementById("monitoringFieldSelector");
    const selectedField = fieldSelector?.value;

    if (!selectedField) {
        const total = filtered.length;
        const brokerSeen = filtered.filter(d => d.m_q5 === "देखियो").length;
        const digitalCharter = filtered.filter(d => d.m_q1 === "स्पष्ट बुझिने").length;

        // सबै चार्ट बक्सहरू देखाउने र पहिलो चार्टको लेबल रिसेट गर्ने
        const firstChartNote = document.querySelector("#monitoringChartsRow .chart-box .small-note");
        if (firstChartNote) firstChartNote.textContent = "नागरिक बडापत्रको स्पष्टता";
        document.querySelectorAll("#monitoringChartsRow .chart-box").forEach(box => {
            box.style.display = "block";
        });

        document.getElementById("statCardsContainer").innerHTML = `
            <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings, 'जम्मा अनुगमन', 'monitoring')"><div class="stat-number"><i class="fas fa-clipboard-list" style="color:#3b82f6"></i> ${toNepaliDigits(total)}</div><div style="color:#4a5568">जम्मा अनुगमन</div></div>        
            <div class="stat-card" style="--stat-border-color:#ef4444; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d.m_q5 === 'देखियो'), 'मध्यस्थकर्ताको उपस्थिति', 'monitoring')"><div class="stat-number"><i class="fas fa-user-secret" style="color:#ef4444"></i> ${toNepaliDigits(brokerSeen)}</div><div style="color:#4a5568">मध्यस्थकर्ताको उपस्थिति</div></div>
            <div class="stat-card" style="--stat-border-color:#10b981; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d.m_q1 === 'स्पष्ट बुझिने'), 'बडापत्र स्पष्ट/डिजिटल', 'monitoring')"><div class="stat-number"><i class="fas fa-display" style="color:#10b981"></i> ${toNepaliDigits(digitalCharter)}</div><div style="color:#4a5568">बडापत्र स्पष्ट/डिजिटल</div></div>
        `;
        updateMonitoringCharts(filtered);
        document.getElementById("monitoringChartsRow").style.display = "flex";
    } else {
        let counts = {};
        const total = filtered.length;
        const fieldName = fieldSelector.options[fieldSelector.selectedIndex].text;

        filtered.forEach(d => { 
            let val = getVal(d, selectedField, fieldName);
            if (val) counts[val] = (counts[val] || 0) + 1; 
        });
        
        // चार्टको मुनि रहेको लेबल अपडेट गर्ने
        const firstChartNote = document.querySelector("#monitoringChartsRow .chart-box .small-note");
        if (firstChartNote) firstChartNote.textContent = fieldName;

        let statHTML = `<div class="stat-card" style="cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings, 'जम्मा अनुगमन', 'monitoring')"><div class="stat-number">${toNepaliDigits(total)}</div><div>जम्मा अनुगमन</div></div>`;
        const palette = getThemeColors();
        Object.keys(counts).forEach((key, i) => {
            const count = counts[key];
            const percent = total > 0 ? (count / total * 100).toFixed(1) : 0;
            statHTML += `<div class="stat-card" style="--stat-border-color: ${palette[i%5]}; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d['${selectedField}'] === '${key}'), '${fieldName}: ${key}', 'monitoring')"><div class="stat-number" style="color:${palette[i%5]}">${toNepaliDigits(count)} <span style="font-size: 50%;">(${toNepaliDigits(percent)}%)</span></div><div>${key}</div></div>`;
        });
        document.getElementById("statCardsContainer").innerHTML = statHTML;

        if (charterClarityChartObj) charterClarityChartObj.destroy();
        charterClarityChartObj = new Chart(document.getElementById("charterClarityChart").getContext('2d'), {
            type: chartTypes.charterClarityChart || 'pie',
            data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: palette.map(c => c + 'cc'), borderRadius: 5 }] },
            options: { 
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const i = elements[0].index;
                        const label = Object.keys(counts)[i];
                        const filtered = currentFilteredMonitorings.filter(d => d[selectedField] === label);
                        showDetailedTable(filtered, `${fieldName}: ${label}`, 'monitoring');
                    }
                },
                responsive: true, 
                plugins: { 
                    legend: { position: 'bottom' }, 
                    title: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } }
                },
                scales: (chartTypes.charterClarityChart === 'pie' || chartTypes.charterClarityChart === 'doughnut') ? {} : {
                    y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } }
                }
            }
        });
        document.querySelectorAll("#monitoringChartsRow .chart-box").forEach((box, i) => box.style.display = i === 0 ? "block" : "none");
    }

    // Table rendering for Monitoring
    renderMonitoringTable(filtered);
    
    // 'थप अनुगमन फिल्टर' लागू हुँदा अलर्ट सेक्सन लुकाउने
    if (!selectedField) {
        updateMonitoringAlerts(filtered);
    } else {
        const alertsSection = document.getElementById("monitoringAlertsSection");
        if (alertsSection) alertsSection.style.setProperty('display', 'none', 'important');
    }

    // विवरणात्मक विवरणहरू अपडेट गर्ने
    updateMonitoringDetails(filtered);
}

function refreshAttendanceDashboard() {
    const pradeshFilter = (document.getElementById("filterPradesh")?.value || "").trim();
    const districtFilter = (document.getElementById("filterDistrict")?.value || "").trim();
    const sthaaniyaFilter = (document.getElementById("filterSthaaniya")?.value || "").trim();
    const officeFilter = (document.getElementById("filterOffice")?.value || "").toLowerCase().trim();
    const empNameFilter = (document.getElementById("filterEmpName")?.value || "").toLowerCase().trim();
    const empSymbolFilter = (document.getElementById("filterEmpSymbol")?.value || "").trim();
    const categoryFilter = (document.getElementById("filterCategory")?.value || "").trim();
    const fromDate = getStandardDate(document.getElementById("filterDateFrom")?.value || "");
    const toDate = getStandardDate(document.getElementById("filterDateTo")?.value || "");

    let filteredEntries = [];
    allAttendanceMonitorings.forEach(item => {
        // Handle both structures: Nested (local save) and Flat (Google Sheet rows)
        const rPradesh = getVal(item, 'pradesh', 'प्रदेश');
        const rJilla = getVal(item, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(item, 'sthaaniya', 'स्थानीय तह');
        const rOffice = getVal(item, 'office', 'कार्यालय');
        const rDate = getVal(item, 'date', 'मिति');

        // प्रदेश, जिल्ला र स्थानीय तह फिल्टर (String comparison with trim)
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            const pStr = String(rPradesh || "").trim();
            if (pStr != pradeshFilter && pStr !== provinceName) return;
        }
        if (districtFilter && String(rJilla || "").trim() !== districtFilter) return;
        if (sthaaniyaFilter && String(rSthaaniya || "").trim() !== sthaaniyaFilter) return;
        
        // कार्यालय र मिति फिल्टर
        if (officeFilter && !(rOffice || "").toLowerCase().includes(officeFilter)) return;
        const recDate = getStandardDate(rDate || "");
        if (fromDate && recDate < fromDate) return;
        if (toDate && recDate > toDate) return;

        if (item.rows && Array.isArray(item.rows)) {
            // Nested structure
            item.rows.forEach(row => {
                if (empNameFilter && !(row.name || "").toLowerCase().includes(empNameFilter)) return;
                if (empSymbolFilter && String(row.symbol || "").trim() !== empSymbolFilter) return;
                if (categoryFilter && row.category !== categoryFilter) return;
                filteredEntries.push({ 
                    office: rOffice || item.office, 
                    date: rDate || item.date, 
                    jilla: rJilla,
                    ...row 
                });
            });
        } else {
            // Flat structure
            const rName = getVal(item, 'name', 'कर्मचारीको नाम');
            const rSymbol = getVal(item, 'symbol', 'संकेत नं.');
            const rCategory = getVal(item, 'category', 'प्रकार');
            const rRank = getVal(item, 'rank', 'पद');
            const rExtra = getVal(item, 'extra', 'कैफियत');

            if (empNameFilter && !(rName || "").toLowerCase().includes(empNameFilter)) return;
            if (empSymbolFilter && String(rSymbol || "").trim() !== empSymbolFilter) return;
            if (categoryFilter && String(rCategory || "").trim() !== categoryFilter) return;

            filteredEntries.push({
                office: rOffice, 
                date: rDate, 
                jilla: rJilla,
                name: rName,
                rank: rRank, 
                symbol: rSymbol,
                category: rCategory, 
                extra: rExtra
            });
        }
    });
    currentFilteredAttendance = filteredEntries; // ग्लोबल भेरिएबलमा राख्ने

    // Stats
    const totalViolations = filteredEntries.length;
    const lateAbsent = filteredEntries.filter(e => e.category.includes("अनुपस्थित/ढिला")).length;
    const noUniform = filteredEntries.filter(e => e.category.includes("पोशाक")).length;

    document.getElementById("statCardsContainer").innerHTML = `
        <div class="stat-card" style="--stat-border-color:#6366f1; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance, 'जम्मा अपरिपालना', 'attendance')"><div class="stat-number"><i class="fas fa-users-viewfinder" style="color:#6366f1"></i> ${toNepaliDigits(totalViolations)}</div><div style="color:#4a5568">जम्मा अपरिपालना</div></div>
        <div class="stat-card" style="--stat-border-color:#f59e0b; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.category.includes('अनुपस्थित/ढिला')), 'अनुपस्थित/ढिला', 'attendance')"><div class="stat-number"><i class="fas fa-user-clock" style="color:#f59e0b"></i> ${toNepaliDigits(lateAbsent)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (lateAbsent/totalViolations*100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">अनुपस्थित/ढिला</div></div>
        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.category.includes('पोशाक')), 'पोशाक नलगाउने', 'attendance')"><div class="stat-number"><i class="fas fa-user-tie" style="color:#ec4899"></i> ${toNepaliDigits(noUniform)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (noUniform/totalViolations*100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">पोशाक नलगाउने</div></div>
    `;

    // Table
    const tbody = document.querySelector("#dataTable tbody");
    if (tbody) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedData = filteredEntries.slice(startIndex, startIndex + itemsPerPage);

        tbody.innerHTML = paginatedData.map(e => `
            <tr>
                <td data-label="मिति">${e.date}</td>
                <td data-label="कार्यालय">${e.office}</td>
                <td data-label="कर्मचारी">${e.name}</td>
                <td data-label="पद">${e.rank}</td>
                <td data-label="संकेत नं.">${e.symbol}</td>
                <td data-label="प्रकार">${e.category}</td>
                <td data-label="कैफियत" colspan="2">${e.extra || "-"}</td>
            </tr>
        `).join('');
        renderPaginationUI(filteredEntries.length);
    }

    // सर्वेक्षणबाट आउन सक्ने अनावश्यक बक्सहरू लुकाउने
    const dStatRow = document.getElementById("dynamicStatRow");
    if (dStatRow) dStatRow.style.display = "none";
    const detailTable = document.getElementById("dynamicDetailTableContainer");
    if (detailTable) detailTable.style.display = "none";

    // Charts - फिल्टर अनुसार गतिशील रूपमा देखाउने
    if (attendanceViolationChartObj) attendanceViolationChartObj.destroy();
    if (dynamicChartObj) dynamicChartObj.destroy(); // साझा क्यानभास क्लियर गर्ने

    // यदि 'प्रकार' फिल्टर गरिएको छ भने कार्यालय अनुसार देखाउने, नत्र प्रकार अनुसार
    const dimension = categoryFilter ? 'office' : 'category';
    const counts = {};
    filteredEntries.forEach(e => counts[e[dimension]] = (counts[e[dimension]] || 0) + 1);
    
    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const palette = getThemeColors(0.8);
    
    attendanceViolationChartObj = new Chart(document.getElementById("dynamicChart").getContext('2d'), {
        type: chartTypes.dynamicChart || 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => palette[i % palette.length]),
                borderRadius: 5,
                borderWidth: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut') ? 0.5 : 1,
                borderColor: '#ffffff'
            }]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const label = labels[i];
                    const filtered = filteredEntries.filter(e => e[dimension] === label);
                    showDetailedTable(filtered, label, 'attendance');
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            animations: (chartTypes.dynamicChart === 'bar' || chartTypes.dynamicChart === 'line') ? { y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) } } : {},
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom', display: labels.length > 0 },
                tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } }
            },
            scales: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut') ? {} : {
                y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } }
            }
        }
    });
    
    // Show chart row
    if (document.getElementById("dynamicChartRow")) document.getElementById("dynamicChartRow").style.display = "flex";
    document.getElementById("dynamicChartLabel").textContent = categoryFilter 
        ? `कार्यालय अनुसार विवरण (${categoryFilter})` 
        : "अपरिपालनाको वर्गीकरण";
}

/**
 * समय पालना/पोशाक अनुगमनको PDF रिपोर्ट जेनेरेट गर्ने
 */
async function downloadAttendancePDF() {
    const element = document.createElement('div');
    const stats = document.getElementById('statCardsContainer').innerHTML;
    const table = document.querySelector('#dataTable').parentElement.innerHTML;
    const chartCanvas = document.getElementById('dynamicChart');
    const chartImage = chartCanvas.toDataURL('image/png');

    element.innerHTML = `
        <div style="padding: 20px; font-family: 'Kalimati', sans-serif;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #306a95;">समय पालना तथा पोशाक अनुगमन रिपोर्ट</h2>
                <p>राष्ट्रिय सतर्कता केन्द्र</p>
                <hr>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 20px; page-break-inside: avoid;">${stats}</div>
            <div style="text-align: center; margin-bottom: 20px; page-break-inside: avoid;">
                <img src="${chartImage}" style="width: 300px; height: auto;">
                <p><strong>अपरिपालनाको वर्गीकरण</strong></p>
            </div>
            <div style="margin-top: 20px; page-break-inside: avoid;">${table}</div>
        </div>
    `;

    // स्टाइलिङ मिलाउन केही ट्वीकहरू
    const cards = element.querySelectorAll('.stat-card');
    cards.forEach(c => {
        c.style.border = "1px solid #ddd";
        c.style.padding = "10px";
        c.style.flex = "1";
        c.style.pageBreakInside = "avoid";
    });

    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5], // top, left, bottom, right मार्जिन स्पष्ट तोकिएको
        filename: 'Attendance_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } // पेज ब्रेक व्यवस्थापन
    };

    html2pdf().set(opt).from(element).save();
}

/**
 * समय पालना/पोशाक अनुगमनको डेटा एक्सेलमा निर्यात गर्ने
 */
function exportAttendanceToExcel() {
    if (currentFilteredAttendance.length === 0) {
        Swal.fire({ icon: 'info', text: 'निर्यात गर्नको लागि कुनै डाटा छैन।' });
        return;
    }

    const workbook = XLSX.utils.book_new();

    // डाटालाई कार्यालय अनुसार समूहकृत (Grouping) गर्ने
    const groupedByOffice = currentFilteredAttendance.reduce((acc, curr) => {
        const office = curr.office || "अन्य कार्यालय";
        if (!acc[office]) acc[office] = [];
        acc[office].push(curr);
        return acc;
    }, {});

    // प्रत्येक कार्यालयको लागि छुट्टाछुट्टै Sheet थप्ने
    Object.keys(groupedByOffice).forEach(officeName => {
        const officeData = groupedByOffice[officeName].map(e => ({
            'मिति': e.date,
            'कार्यालय': e.office,
            'कर्मचारीको नाम': e.name,
            'पद': e.rank,
            'संकेत नं.': e.symbol,
            'अपरिपालना प्रकार': e.category,
            'कैफियत': e.extra || "-"
        }));

        const worksheet = XLSX.utils.json_to_sheet(officeData);
        
        // Excel Sheet Name नियम: बढीमा ३१ अक्षर र केही संकेतहरू (\ / ? * [ ]) निषेध गरिएको हुन्छ
        const sanitizedName = officeName.replace(/[\\/?*:[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sanitizedName || "Sheet");
    });

    XLSX.writeFile(workbook, "Attendance_Report_By_Office.xlsx");
}

function updateMonitoringAlerts(data) {
    const alertsSection = document.getElementById("monitoringAlertsSection");
    const alertsList = document.getElementById("alertsList");
    if (!alertsSection || !alertsList) return;

    const toggleBtn = document.getElementById("toggleAlertsVisibilityBtn");
    const isSectionDismissed = localStorage.getItem("alertSectionDismissed_nsc") === "true";

    // टोगल बटनको टेक्स्ट र रङ अवस्था अनुसार अपडेट गर्ने
    if (toggleBtn) {
        if (isSectionDismissed) {
            toggleBtn.innerHTML = '<i class="fas fa-bell"></i> अलर्ट देखाउनुहोस्';
            toggleBtn.style.background = '#3182ce'; // नीलो (Show mode)
            toggleBtn.style.borderColor = '#2b6cb0';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-bell-slash"></i> अलर्ट लुकाउनुहोस्';
            toggleBtn.style.background = '#de3053'; // रातो (Hide mode)
            toggleBtn.style.borderColor = '#c03e37';
        }
    }

    // यदि सेक्सन लुकाइएको छ भने फिर्ता हुने
    if (isSectionDismissed) {
        alertsSection.style.setProperty('display', 'none', 'important');
        return;
    }

    // २०% भन्दा बढी रिक्तता दर (Vacancy Rate) भएका कार्यालयहरू फिल्टर गर्ने
    const highVacancyOffices = data.filter(d => {
        const total = Number(getVal(d, 'd_total', 'कुल दरबन्दी') || 0);
        const vacant = Number(getVal(d, 'd_vacant', 'रिक्त') || 0);
        if (total <= 0) return false; // शून्य दरबन्दी भएका कार्यालयलाई नदेखाउने
        const rate = (vacant / total) * 100;
        return rate > 20;
    });
    
    // प्रयोगकर्ताले हटाएका अलर्टहरू फिल्टर गर्ने
    const activeAlerts = highVacancyOffices.filter(d => !dismissedAlerts.has(d.m_office));

    // रिसेट बटन व्यवस्थापन (यदि कुनै अलर्ट हटाइएको छ भने मात्र देखाउने)
    let resetBtn = document.getElementById("resetAlertsBtn");
    if (dismissedAlerts.size > 0 && highVacancyOffices.length > 0) {
        if (!resetBtn) {
            resetBtn = document.createElement("button");
            resetBtn.id = "resetAlertsBtn";
            resetBtn.type = "button";
            resetBtn.className = "reset-alerts-btn";
            resetBtn.innerHTML = "🔄 अलर्ट रिसेट";
            resetBtn.onclick = resetAlerts;
            const title = alertsSection.querySelector('h4');
            if (title) {
                title.style.display = "flex";
                title.style.justifyContent = "space-between";
                title.style.alignItems = "center";
                title.appendChild(resetBtn);
            }
        }
    } else if (resetBtn) {
        resetBtn.remove();
    }

    if (activeAlerts.length === 0) {
        if (dismissedAlerts.size > 0 && highVacancyOffices.length > 0) {
            alertsSection.style.setProperty('display', 'block', 'important');
            alertsList.innerHTML = `<div style="padding:10px; color:#718096; font-size:0.85rem; width:100%; text-align:center;">सबै अलर्टहरू हेरिसकिएको छ।</div>`;
        } else {
            alertsSection.style.setProperty('display', 'none', 'important');
        }
        return;
    }

    alertsSection.style.setProperty('display', 'block', 'important');
    alertsList.innerHTML = activeAlerts.map(d => {
        const total = Number(d.d_total || 0);
        const vacant = Number(d.d_vacant || 0);
        const rateNum = (vacant / total) * 100;
        const rateStr = rateNum.toFixed(1);
        
        // ३०% भन्दा बढी भए "Critical" (रातो), २०-३०% भए "Warning" (सुन्तला)
        const isCritical = rateNum > 30;
        const themeColor = isCritical ? '#de3053' : '#f39c12';
        const borderColor = isCritical ? '#ffa39e' : '#ffd591';
        const bgColor = isCritical ? '#fff5f5' : '#fffaf0';
        
        // सिंगल कोट भएका कार्यालयको नाम ह्यान्डल गर्न एस्केप गर्ने
        const escapedOffice = (d.m_office || '').replace(/'/g, "\\'");

        return `
            <div class="stat-card" style="position: relative; --stat-border-color: ${themeColor}; --stat-bg-color: ${bgColor}; flex: 1 1 200px; text-align: left; padding: 8px 10px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); cursor: pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(item => item.m_office === '${escapedOffice}'), 'अलर्ट: ${escapedOffice}', 'monitoring')">
                <button type="button" class="alert-close-btn" style="color: ${themeColor}; border-color: ${borderColor}" onclick="dismissAlert(event, '${escapedOffice}')" title="हटाउनुहोस्"><i class="fas fa-times"></i></button>
                <div style="font-weight: 700; color: ${themeColor}; margin-bottom: 4px; font-size: 0.95rem; padding-right: 15px;">${d.m_office || 'अज्ञात कार्यालय'}</div>
                <div style="font-size: 0.9rem; color: #2d3748;">रिक्तता दर: <span style="font-weight: 800; color: ${themeColor};">${toNepaliDigits(rateStr)}%</span></div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 3px;">रिक्त संख्या: ${toNepaliDigits(vacant)} / कुल दरबन्दी: ${toNepaliDigits(total)}</div>
            </div>
        `;
    }).join('');
}

function updateMonitoringDetails(data) {
    const detailsSection = document.getElementById("monitoringDetailsSection");
    const detailsList = document.getElementById("monitoringDetailsList");
    if (!detailsSection || !detailsList) return;

    if (data.length === 0) {
        detailsSection.style.display = "none";
        return;
    }

    detailsSection.style.display = "block";

    // फिल्टर भएको अवस्थामा शीर्षकमा जानकारी देखाउने
    const detailsHeader = detailsSection.querySelector("h4");
    if (detailsHeader) {
        if (activeTagId) {
            const tag = TAG_CONFIG.find(t => t.id === activeTagId);
            detailsHeader.innerHTML = `अनुगमनका विस्तृत विवरणहरू (फिल्टर: <span style="color:${tag.color}">${tag.label}</span>)`;
        } else {
            detailsHeader.textContent = "अनुगमनका विस्तृत विवरणहरू";
        }
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + itemsPerPage);

    detailsList.innerHTML = paginatedData.map(d => `
        <div id="detail-${(d.m_office || '').replace(/\s+/g, '_')}" style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid #306a95; margin-bottom: 15px; transition: background-color 0.5s ease;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                <h5 style="font-weight: 700; color: #306a95; margin-bottom: 8px;">${d.m_office || 'अज्ञात कार्यालय'} (${d.m_jilla || ''}) - ${toNepaliDigits(d.m_date || '')}</h5>
                <div class="tag-container">${generateTags(d.m_problems || '')}</div>
            </div>
            ${d.m_main_services ? `<p style="margin-bottom: 5px;"><strong style="color: #4a5568;">मुख्य सेवाहरू:</strong> ${d.m_main_services}</p>` : ''}
            ${d.m_problems ? `<p style="margin-bottom: 5px;"><strong style="color: #4a5568;">समस्या/अनियमितता:</strong> <span style="color: #de3053;">${d.m_problems}</span></p>` : ''}
            ${d.m_measures ? `<p style="margin-bottom: 5px;"><strong style="color: #4a5568;">सुधारका उपायहरू:</strong> ${d.m_measures}</p>` : ''}
            ${d.m_comment ? `<p style="margin-bottom: 0;"><strong style="color: #4a5568;">अनुगमनकर्ताको टिप्पणी:</strong> ${d.m_comment}</p>` : ''}
            ${d.monitor_name ? `<p style="margin-top: 10px; font-size: 0.85rem; text-align: right; color: #718096;">अनुगमनकर्ता: ${d.monitor_name} (${d.monitor_rank || ''})</p>` : ''}
        </div>
    `).join('');
}

/**
 * की-वर्डका आधारमा समस्याहरूलाई ट्याग गर्ने र क्लिक गर्दा फिल्टर गर्ने फङ्सन
 */
function generateTags(text) {
    if (!text) return '';
    let tagsHTML = '';
    TAG_CONFIG.forEach(tag => {
        const found = tag.keywords.some(kw => text.includes(kw));
        if (found) {
            const isActive = activeTagId === tag.id;
            const activeClass = isActive ? 'active-tag' : '';
            tagsHTML += `<span class="tag-badge ${activeClass}" style="background-color: ${tag.color}" onclick="filterByTag(event, '${tag.id}')">${tag.label}</span>`;
        }
    });

    return tagsHTML;
}

/**
 * ट्यागमा क्लिक गर्दा सोही प्रकृतिको डाटा फिल्टर गर्ने
 */
function filterByTag(event, tagId) {
    event.stopPropagation();
    // यदि पहिले नै त्यही ट्याग सक्रिय छ भने हटाउने, नत्र सेट गर्ने (Toggle)
    activeTagId = (activeTagId === tagId) ? null : tagId;
    currentPage = 1;
    refreshDashboard();
    // फिल्टर परिणाम देखाउन तथ्याङ्क सेक्सनमा स्क्रोल गर्ने
    document.getElementById("statCardsContainer").scrollIntoView({ behavior: 'smooth' });
}

/**
 * अलर्ट हटाउने र लोकल स्टोरेजमा सेभ गर्ने फङ्सन
 */
function dismissAlert(event, officeName) {
    // कार्डको मुख्य क्लिक इभेन्ट (modal खोल्ने) रोक्नका लागि
    event.stopPropagation();
    
    dismissedAlerts.add(officeName);
    localStorage.setItem("dismissedAlerts_nsc", JSON.stringify([...dismissedAlerts]));
    refreshDashboard(); 
}

/**
 * तालिकाको कार्यालयको नाममा क्लिक गर्दा विस्तृत विवरणमा स्क्रोल गर्ने
 */
function scrollToMonitoringDetail(officeName) {
    const safeId = "detail-" + officeName.replace(/\s+/g, '_');
    const element = document.getElementById(safeId);
    
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // हाईलाइट इफेक्ट (Highlight Effect)
        element.style.backgroundColor = "#eef6ff";
        setTimeout(() => {
            element.style.backgroundColor = "white";
        }, 1500);
    } else {
        Swal.fire({
            icon: 'info',
            text: 'यस कार्यालयको विस्तृत विवरण तल फेला परेन। कृपया फिल्टर जाँच गर्नुहोस्।',
            timer: 2000,
            showConfirmButton: false
        });
    }
}

/**
 * अनुगमन चार्टहरू अपडेट गर्ने
 */
function updateMonitoringCharts(data) {
    const colorPalette = getThemeColors(0.8);
    // सहयोगी फङ्सन: रिक्वेन्सी म्यापिङ र चार्ट सिर्जना गर्न
    const createMonChart = (ctxId, fieldName, currentObj, defaultType = 'bar') => {
        const canvas = document.getElementById(ctxId);
        const ctx = canvas.getContext('2d');
        let counts = {};
        data.forEach(d => { if (d[fieldName]) counts[d[fieldName]] = (counts[d[fieldName]] || 0) + 1; });
        if (currentObj) currentObj.destroy();
        const chartType = chartTypes[ctxId] || defaultType;
        const isRadial = chartType === 'pie' || chartType === 'doughnut';
        return new Chart(ctx, {
            type: chartType,
            data: {
                labels: Object.keys(counts),
                datasets: [{ 
                    label: 'संख्या', 
                    data: Object.values(counts), 
                    backgroundColor: Object.keys(counts).map((_, i) => createGradient(ctx, colorPalette[i % colorPalette.length], false, isRadial)),
                    hoverBackgroundColor: Object.keys(counts).map((_, i) => createGradient(ctx, colorPalette[i % colorPalette.length], false, isRadial, true)),
                    hoverBorderColor: '#ffffff',
                    hoverBorderWidth: 2,
                    borderRadius: 5,
                    borderWidth: isRadial ? 0.5 : 1,
                    borderColor: '#ffffff'
                }]
            },
            options: { 
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const i = elements[0].index;
                        const label = Object.keys(counts)[i];
                        const filtered = data.filter(d => d[fieldName] === label);
                        showDetailedTable(filtered, label, 'monitoring');
                    }
                },
                animation: GLOBAL_CHART_ANIMATION, 
                animations: (chartType === 'bar' || chartType === 'line') ? { y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) } } : {},
                responsive: true,
                plugins: { 
                    legend: { display: chartType !== 'bar', position: 'bottom' },
                    shadowPlugin: { enabled: true, blur: 10, offsetY: 5 },
                    datalabels: GLOBAL_DATALABELS_CONFIG
                } 
            }
        });
    };

    // १. नागरिक बडापत्रको स्पष्टता (m_q1)
    charterClarityChartObj = createMonChart("charterClarityChart", "m_q1", charterClarityChartObj);
    
    // नयाँ चार्टहरू (Q6, Q7, Q8, Q9, Q10, Q11, Q12)
    websiteChartObj = createMonChart("websiteChart", "m_q6", websiteChartObj, 'pie');
    disclosureChartObj = createMonChart("disclosureChart", "m_q7", disclosureChartObj, 'doughnut');
    autoInfoChartObj = createMonChart("autoInfoChart", "m_q8", autoInfoChartObj, 'pie');
    attendanceChartObj = createMonChart("attendanceChart", "m_q9", attendanceChartObj, 'doughnut');
    workroomChartObj = createMonChart("workroomChart", "m_q10", workroomChartObj, 'bar');
    infoBoardChartObj = createMonChart("infoBoardChart", "m_q11", infoBoardChartObj, 'pie');
    cleaningChartObj = createMonChart("cleaningChart", "m_q12", cleaningChartObj, 'bar');
    brokerChartObj = createMonChart("brokerChart", "m_q5", brokerChartObj, 'doughnut');

    // ३.४ प्रदेश अनुसार रिक्त पद (Vacant Posts by Province)
    let provVacMap = {};
    Object.values(PROVINCE).forEach(p => provVacMap[p] = 0);
    data.forEach(d => {
        if (d.m_pradesh) provVacMap[d.m_pradesh] += Number(d.d_vacant || 0);
    });

    if (vacantByProvinceChartObj) vacantByProvinceChartObj.destroy();
    vacantByProvinceChartObj = new Chart(document.getElementById("vacantByProvinceChart").getContext('2d'), {
        type: chartTypes.vacantByProvinceChart || 'bar',
        data: {
            labels: Object.keys(provVacMap),
            datasets: [{
                label: 'रिक्त पद संख्या',
                data: Object.values(provVacMap),
                backgroundColor: '#e67e22',
                borderRadius: 5
            }]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const province = Object.keys(provVacMap)[i];
                    const filtered = data.filter(d => d.m_pradesh === province && Number(d.d_vacant || 0) > 0);
                    showDetailedTable(filtered, `रिक्त पद: ${province}`, 'monitoring');
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            animations: (chartTypes.vacantByProvinceChart === 'bar' || chartTypes.vacantByProvinceChart === 'line') ? { y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) } } : {},
            responsive: true,
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { callback: (v) => toNepaliDigits(v) } 
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` रिक्त संख्या: ${toNepaliDigits(ctx.raw)}` } }
            }
        }
    });

    // ३.५ प्रदेश अनुसार रिक्त पदको प्रतिशत वितरण (Pie Chart)
    if (vacantPercentPieChartObj) vacantPercentPieChartObj.destroy();
    const totalVacantSum = Object.values(provVacMap).reduce((a, b) => a + b, 0);
    
    vacantPercentPieChartObj = new Chart(document.getElementById("vacantPercentPieChart").getContext('2d'), {
        type: chartTypes.vacantPercentPieChart || 'pie',
        data: {
            labels: Object.keys(provVacMap),
            datasets: [{
                data: Object.values(provVacMap),
                backgroundColor: colorPalette,
                hoverOffset: 15,
                borderWidth: 0.5,
                borderColor: '#ffffff'
            }]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const province = Object.keys(provVacMap)[i];
                    const filtered = data.filter(d => d.m_pradesh === province && Number(d.d_vacant || 0) > 0);
                    showDetailedTable(filtered, `रिक्त पद वितरण: ${province}`, 'monitoring');
                }
            },
            animation: GLOBAL_CHART_ANIMATION,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw;
                            const pct = totalVacantSum > 0 ? ((val / totalVacantSum) * 100).toFixed(1) : 0;
                            return ` ${ctx.label}: ${toNepaliDigits(val)} (${toNepaliDigits(pct)}%)`;
                        }
                    }
                }
            }
        }
    });

    // ३.६ प्रदेश अनुसार कार्यरत र रिक्त तुलना (Grouped Bar Chart)
    let provCompMap = {};
    Object.values(PROVINCE).forEach(p => provCompMap[p] = { working: 0, vacant: 0 });
    data.forEach(d => {
        if (d.m_pradesh && provCompMap[d.m_pradesh]) {
            provCompMap[d.m_pradesh].working += Number(d.d_working || 0);
            provCompMap[d.m_pradesh].vacant += Number(d.d_vacant || 0);
        }
    });

    if (provStaffingComparisonChartObj) provStaffingComparisonChartObj.destroy();
    provStaffingComparisonChartObj = new Chart(document.getElementById("provStaffingComparisonChart").getContext('2d'), {
        type: chartTypes.provStaffingComparisonChart || 'bar',
        data: {
            labels: Object.keys(provCompMap),
            datasets: [
                {
                    label: 'कार्यरत संख्या',
                    data: Object.values(provCompMap).map(v => v.working),
                    backgroundColor: '#167e2acf',
                    borderRadius: 5
                },
                {
                    label: ' रिक्त पद संख्या',
                    data: Object.values(provCompMap).map(v => v.vacant),
                    backgroundColor: '#e74d3ca4',
                    borderRadius: 5
                }
            ]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const datasetIndex = elements[0].datasetIndex;
                    const province = Object.keys(provCompMap)[i];
                    const typeLabel = datasetIndex === 0 ? "कार्यरत" : "रिक्त पद";
                    const filtered = data.filter(d => d.m_pradesh === province);
                    showDetailedTable(filtered, `${province} - ${typeLabel}`, 'monitoring');
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            animations: (chartTypes.dynamicChart === 'bar' || chartTypes.dynamicChart === 'line') ? { y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) } } : {},
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { callback: (v) => toNepaliDigits(v) } 
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { 
                    callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${toNepaliDigits(ctx.raw)}` } 
                }
            }
        }
    });

    if (staffingChartObj) staffingChartObj.destroy();
    
    let staffingLabels = [];
    let staffingDatasets = [];

    if (data.length === 1) {
        // एउटा मात्र कार्यालय छान्दा त्यसको सबै विस्तृत विवरण (रिक्त, रमाना आदि) देखाउने
        const d = data[0];
        const working = Number(d.d_working || 0);
        const vacant = Number(d.d_vacant || 0);
        const total = working + vacant;

        staffingLabels = ['कुल दरबन्दी', 'कार्यरत संख्या', 'रिक्त पद', 'रमाना लिन बाँकी', 'पद भन्दा बढी'];
        staffingDatasets = [{
            label: d.m_office || 'कार्यालय विवरण',
            data: [
                total,
                working,
                vacant,
                Number(d.d_pending || 0),
                Number(d.d_excess || 0)
            ],
            backgroundColor: ['#137cc2', '#14a450cc', '#e74c3c', '#c4a012', '#9b59b6'],
            borderRadius: 5
        }];
    } else {
        // धेरै कार्यालय हुँदा कुल योगफल तुलना गर्ने
        let totalWorking = 0;
        let totalVacant = 0;
        data.forEach(d => {
            totalWorking += Number(d.d_working || 0);
            totalVacant += Number(d.d_vacant || 0);
        });
        const totalPositions = totalWorking + totalVacant;

        staffingLabels = ['कुल दरबन्दी, कार्यरत र रिक्त पद (योगफल)'];
        staffingDatasets = [
            {
                label: 'कुल दरबन्दी',
                data: [totalPositions],
                backgroundColor: '#2286c9',
                borderRadius: 5
            },
            {
                label: 'कार्यरत संख्या',
                data: [totalWorking],
                backgroundColor: '#1b964e',
                borderRadius: 5
            },
            {
                label: 'रिक्त पद संख्या',
                data: [totalVacant],
                backgroundColor: '#e74c3c',
                borderRadius: 5
            }
        ];
    }

    staffingChartObj = new Chart(document.getElementById("staffingChart").getContext('2d'), {
        type: chartTypes.staffingChart || 'bar',
        data: {
            labels: staffingLabels,
            datasets: staffingDatasets
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    if (data.length === 1) {
                        showDetailedTable(data, `दरबन्दी: ${data[0].m_office}`, 'monitoring');
                    } else {
                        showDetailedTable(data, `कुल दरबन्दी विवरण`, 'monitoring');
                    }
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            indexAxis: 'y', // तेर्सो बार चार्ट
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, ticks: { callback: (v) => toNepaliDigits(v) } }
            },
            plugins: {
                legend: { position: 'bottom', display: data.length !== 1 },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => {
                            const label = data.length === 1 ? ctx.label : ctx.dataset.label;
                            return ` ${label}: ${toNepaliDigits(ctx.raw)}`;
                        }
                    } 
                }
            }
        }
    });

    // ४. कार्यालयका सुविधाहरू (प्रश्न १३: f_1 देखि f_10)
    const facilityLabels = [
        "सहायता कक्ष", "अपाङ्गमैत्री", "प्रतिक्षालय", "शौचालय", "खानेपानी",
        "स्तनपान कक्ष", "धुम्रपान निषेध", "चमेना गृह", "उजुरी पेटिका", "वेवसाइट/सञ्जाल"
    ];
    
    let yesCounts = new Array(10).fill(0);
    let normalCounts = new Array(10).fill(0);
    let noCounts = new Array(10).fill(0);

    data.forEach(d => {
        for (let i = 1; i <= 10; i++) {
            let val = d[`f_${i}`];
            if (val === "छ" || val === "अध्यावधिक") yesCounts[i-1]++;
            else if (val === "सामान्य") normalCounts[i-1]++;
            else if (val === "छैन") noCounts[i-1]++;
        }
    });

    if (facilitiesChartObj) facilitiesChartObj.destroy();
    facilitiesChartObj = new Chart(document.getElementById("facilitiesChart").getContext('2d'), {
        type: chartTypes.facilitiesChart || 'bar',
        data: {
            labels: facilityLabels,
            datasets: [
                {
                    label: 'छ / अध्यावधिक',
                    data: yesCounts,
                    backgroundColor: '#27ae60'
                },
                {
                    label: 'सामान्य',
                    data: normalCounts,
                    backgroundColor: '#f1c40f'
                },
                {
                    label: 'छैन',
                    data: noCounts,
                    backgroundColor: '#e74c3c'
                }
            ]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const datasetIndex = elements[0].datasetIndex;
                    const facilityName = facilityLabels[i];
                    const status = datasetIndex === 0 ? "छ" : (datasetIndex === 1 ? "सामान्य" : "छैन");
                    const fField = `f_${i+1}`;
                    const filtered = data.filter(d => {
                         let val = d[fField];
                         if (datasetIndex === 0) return val === "छ" || val === "अध्यावधिक";
                         if (datasetIndex === 1) return val === "सामान्य";
                         if (datasetIndex === 2) return val === "छैन";
                         return false;
                    });
                    showDetailedTable(filtered, `सुविधा (${facilityName}): ${status}`, 'monitoring');
                }
            },
            animation: { duration: 2500, easing: 'easeInOutQuart' },
            animations: (chartTypes.provStaffingComparisonChart === 'bar' || chartTypes.provStaffingComparisonChart === 'line') ? { y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) } } : {},
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { ticks: { font: { size: 10 } } }
            },
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/**
 * सर्वेक्षण ड्यासबोर्डका लागि तथ्याङ्क कार्डहरू रेन्डर गर्ने
 */
function renderStats(data) {
    const total = data.length;
    const ghusCount = data.filter(d => (d.ghus_parera || "").trim() === "पर्‍यो").length;
    const femaleCount = data.filter(d => d.gender === "महिला").length;
    const maleCount = data.filter(d => d.gender === "पुरुष").length;
    const satCount = data.filter(d => (d.satisfaction_flag || "").trim() === "सन्तुष्ट").length;

    const container = document.getElementById("statCardsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions, 'जम्मा प्रतिक्रिया', 'survey')"><div class="stat-number"><i class="fas fa-users" style="color:#3b82f6"></i> ${toNepaliDigits(total)}</div><div style="color:#4a5568">जम्मा प्रतिक्रिया</div></div>        
        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.gender === ' महिला'), 'महिला सेवाग्राही', 'survey')"><div class="stat-number"><i class="fas fa-female" style="color:#ec4899"></i> ${toNepaliDigits(femaleCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (femaleCount/total*100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">महिला सेवाग्राही</div></div>
        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.gender === 'पुरुष'), 'पुरुष सेवाग्राही', 'survey')"><div class="stat-number"><i class="fas fa-male" style="color:#3b82f6"></i> ${toNepaliDigits(maleCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (maleCount/total*100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">पुरुष सेवाग्राही</div></div>
        <div class="stat-card" style="--stat-border-color:#10b981; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.satisfaction_flag === 'सन्तुष्ट'), 'सन्तुष्ट सेवाग्राही', 'survey')"><div class="stat-number"><i class="fas fa-smile" style="color:#10b981"></i> ${toNepaliDigits(satCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (satCount/total*100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">सन्तुष्ट सेवाग्राही</div></div>
        <div class="stat-card" style="--stat-border-color:#ef4444; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.ghus_parera === 'पर्‍यो'), 'अतिरिक्त रकम तिर्नु परेको', 'survey')"><div class="stat-number"><i class="fas fa-hand-holding-dollar" style="color:#ef4444"></i> ${toNepaliDigits(ghusCount)} <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (ghusCount/total*100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">अतिरिक्त रकम तिर्नु परेको</div></div>
    `;
}

/**
 * सर्वेक्षण ड्यासबोर्डका लागि मुख्य चार्टहरू अपडेट गर्ने
 */
function updateCharts(data) {
    // लिङ्ग चार्ट
    let genderMap = { पुरुष: 0, महिला: 0, अन्य: 0 };
    data.forEach(d => { if (d.gender) genderMap[d.gender] = (genderMap[d.gender] || 0) + 1; });
    const genderCtx = document.getElementById("genderChart").getContext('2d');
    if (genderChartObj) genderChartObj.destroy();
    const isGenderRadial = chartTypes.genderChart === 'pie' || chartTypes.genderChart === 'doughnut';
    genderChartObj = new Chart(genderCtx, {
        type: chartTypes.genderChart,
        data: {
            labels: ["पुरुष", "महिला", "अन्य"],
            datasets: [{
                data: [genderMap.पुरुष, genderMap.महिला, genderMap.अन्य],
                backgroundColor: ['#3b82f6', '#ec4899', '#f59e0b'].map(c => createGradient(genderCtx, c, false, isGenderRadial)),
                hoverBackgroundColor: ['#3b82f6', '#ec4899', '#f59e0b'].map(c => createGradient(genderCtx, c, false, isGenderRadial, true)),
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2,
                borderColor: ['#3b82f6', '#ec4899', '#f59e0b'],
                borderWidth: isGenderRadial ? 0.5 : 1,
                borderRadius: 5
            }]
        },
        options: { 
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const label = ["पुरुष", "महिला", "अन्य"][i];
                    const filtered = data.filter(d => d.gender === label);
                    showDetailedTable(filtered, `लिङ्ग: ${label}`, 'survey');
                }
            },
            animation: GLOBAL_CHART_ANIMATION, 
            responsive: true, 
            plugins: { 
                legend: { display: true, position: 'bottom' },
                shadowPlugin: { enabled: true, blur: 15, color: 'rgba(0,0,0,0.2)' },
                datalabels: GLOBAL_DATALABELS_CONFIG
            } 
        }
    });

    // सन्तुष्टि चार्ट
    let satis = data.filter(d => d.satisfaction_flag === "सन्तुष्ट").length;
    let disSatis = data.filter(d => d.satisfaction_flag === "असन्तुष्ट").length;
    let mixedSatis = data.filter(d => d.satisfaction_flag === "मिश्रित").length;
    const satCtx = document.getElementById("satisfactionChart").getContext('2d');
    if (satisfactionChartObj) satisfactionChartObj.destroy();
    const isSatRadial = chartTypes.satisfactionChart === 'pie' || chartTypes.satisfactionChart === 'doughnut';
    satisfactionChartObj = new Chart(satCtx, {
        type: chartTypes.satisfactionChart,
        data: {
            labels: ["सन्तुष्ट", "असन्तुष्ट", "मिश्रित"],
            datasets: [{
                data: [satis, disSatis, mixedSatis],
                backgroundColor: ['#10b981', '#ef4444', '#f59e0b'].map(c => createGradient(satCtx, c, false, isSatRadial)),
                hoverBackgroundColor: ['#10b981', '#ef4444', '#f59e0b'].map(c => createGradient(satCtx, c, false, isSatRadial, true)),
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2,
                borderColor: ['#10b981', '#ef4444', '#f59e0b'],
                borderWidth: isSatRadial ? 0.5 : 1,
                hoverOffset: 10
            }]
        },
        options: { 
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const label = ["सन्तुष्ट", "असन्तुष्ट", "मिश्रित"][i];
                    const filtered = data.filter(d => d.satisfaction_flag === label);
                    showDetailedTable(filtered, `सन्तुष्टि: ${label}`, 'survey');
                }
            },
            animation: GLOBAL_CHART_ANIMATION, 
            responsive: true, 
            plugins: { 
                legend: { position: 'bottom' },
                shadowPlugin: { enabled: true, offsetY: 6, blur: 10 },
                datalabels: GLOBAL_DATALABELS_CONFIG
            } 
        }
    });

    // घुस/अतिरिक्त रकम चार्ट
    let ghusData = { पर्‍यो: data.filter(d => d.ghus_parera === "पर्‍यो").length, परेन: data.filter(d => d.ghus_parera === "परेन").length };
    const ghusCtx = document.getElementById("ghusChart").getContext('2d');
    if (ghusChartObj) ghusChartObj.destroy();
    const isGhusRadial = chartTypes.ghusChart === 'pie' || chartTypes.ghusChart === 'doughnut';
    ghusChartObj = new Chart(ghusCtx, {
        type: chartTypes.ghusChart,
        data: {
            labels: ["पर्‍यो", "परेन"],
            datasets: [{
                data: [ghusData.पर्‍यो, ghusData.परेन],
                backgroundColor: ['#ef4444', '#10b981'].map(c => createGradient(ghusCtx, c, false, isGhusRadial)),
                hoverBackgroundColor: ['#ef4444', '#10b981'].map(c => createGradient(ghusCtx, c, false, isGhusRadial, true)),
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2,
                borderColor: ['#ef4444', '#10b981'],
                borderWidth: isGhusRadial ? 0.5 : 1,
                hoverOffset: 10
            }]
        },
        options: { 
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const label = ["पर्‍यो", "परेन"][i];
                    const filtered = data.filter(d => d.ghus_parera === label);
                    showDetailedTable(filtered, `अतिरिक्त रकम: ${label}`, 'survey');
                }
            },
            animation: GLOBAL_CHART_ANIMATION, 
            responsive: true, 
            plugins: { 
                legend: { position: 'bottom' },
                shadowPlugin: { enabled: true, blur: 12, offsetX: 5, offsetY: 5 },
                datalabels: GLOBAL_DATALABELS_CONFIG
            } 
        }
    });

    // विकास जानकारी चार्ट
    let devCounts = {};
    data.forEach(d => {
        const val = d.bikas_janakari || "अज्ञात";
        devCounts[val] = (devCounts[val] || 0) + 1;
    });
    const devLabels = Object.keys(devCounts);
    const devPalette = ['#3b82f6', '#94a3b8', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (devChartObj) devChartObj.destroy();
    devChartObj = new Chart(document.getElementById("developmentChart").getContext('2d'), {
        type: chartTypes.developmentChart,
        data: {
            labels: devLabels,
            datasets: [{
                data: Object.values(devCounts),
                backgroundColor: devLabels.map((_, i) => devPalette[i % devPalette.length] + 'cc'),
                borderColor: ['#3b82f6', '#94a3b8'],
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: { 
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const label = devLabels[i];
                    const filtered = data.filter(d => d.bikas_janakari === label);
                    showDetailedTable(filtered, `विकास जानकारी: ${label}`, 'survey');
                }
            },
            animation: GLOBAL_CHART_ANIMATION, 
            responsive: true, 
            plugins: { 
                legend: { display: devLabels.length > 2, position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } },
                datalabels: GLOBAL_DATALABELS_CONFIG
            } 
        }
    });
}

/**
 * सर्वेक्षण ड्यासबोर्डका लागि मुख्य तालिका रेन्डर गर्ने
 */
function renderTable(data) {
    const tbody = document.querySelector("#dataTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + itemsPerPage);

    paginatedData.forEach(r => {
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
    renderPaginationUI(data.length);
}

/**
 * अनुगमन डाटाका लागि तालिका रेन्डर गर्ने
 */
function renderMonitoringTable(data) {
    const tbody = document.querySelector("#dataTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + itemsPerPage);

    paginatedData.forEach(r => {
        const officeName = r.m_office || "";
        let row = `<tr>
            <td data-label="मिति">${r.m_date || ""}</td>
            <td data-label="जिल्ला">${r.m_jilla || ""}</td>
            <td data-label="कार्यालय"><a href="javascript:void(0)" onclick="scrollToMonitoringDetail('${officeName.replace(/'/g, "\\'")}')" style="color: #306a95; text-decoration: none; font-weight: 600;">${officeName}</a></td>
            <td data-label="नागरिक बडापत्र (डिजिटल/अडियो)">${r.m_q1 || "अज्ञात"}</td>
            <td data-label="मध्यस्तकर्ताको प्रवेश">${r.m_q5 || "अज्ञात"}</td>
            <td data-label="हाजिरीको अवस्था">${r.m_q9 || "अज्ञात"}</td>
            <td data-label="कुल दरबन्दी">${toNepaliDigits(r.d_total || 0)}</td>
            <td data-label="रिक्त">${toNepaliDigits(r.d_vacant || 0)}</td>
        </tr>`;
        tbody.insertAdjacentHTML("beforeend", row);
    });
    renderPaginationUI(data.length);
}

/**
 * विशिष्ट प्रश्न विश्लेषण (Dynamic Analysis) अपडेट गर्ने
 */
function updateDynamicAnalysis(data) {
    const selector = document.getElementById("dynamicFieldSelector");
    if (!selector) return;
    const field = selector.value;
    const statRow = document.getElementById("dynamicStatRow");
    const chartRow = document.getElementById("dynamicChartRow");
    const labelEl = document.getElementById("dynamicChartLabel");

    if (!field) {
        if (statRow) statRow.style.display = "none";
        if (chartRow) chartRow.style.display = "none";
        return;
    }

    if (statRow) statRow.style.display = "flex";
    if (chartRow) chartRow.style.display = "flex";

    const selectedOption = selector.options[selector.selectedIndex];
    const fieldLabel = selectedOption.text;

    let counts = {};
    data.forEach(item => {
        let val = getVal(item, field, fieldLabel);
        if (val !== undefined && val !== null && val !== "" && val !== "undefined") {
            let parts = String(val).split(",").map(s => s.trim()).filter(s => s.length > 0);
            parts.forEach(p => {
                counts[p] = (counts[p] || 0) + 1;
            });
        }
    });

    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const totalVal = values.reduce((acc, curr) => acc + curr, 0);

    // यदि छानिएको फिल्डमा कुनै डाटा भेटिएन भने
    if (labels.length === 0) {
        if (statRow) {
            statRow.innerHTML = `
                <div style="padding:40px 20px; color:#718096; width:100%; text-align:center; background:#fff; border-radius:12px; border: 1px dashed #cbd5e0; margin: 10px 0;">
                    <div style="font-size: 2.5rem; margin-bottom: 10px;"><i class="fas fa-folder-open"></i></div>
                    <div style="font-size: 1.1rem; font-weight: 600; color: #4a5568;">तथ्याङ्क फेला परेन</div>
                    <p style="font-size: 0.95rem; margin-top: 5px;">छानिएको प्रश्न वा फिल्टरका लागि हालसम्म कुनै प्रतिक्रिया प्राप्त भएको छैन।</p>
                </div>`;
        }
        if (dynamicChartObj) dynamicChartObj.destroy();
        if (chartRow) chartRow.style.display = "none";
        if (labelEl) labelEl.textContent = `विश्लेषण: ${selector.options[selector.selectedIndex].text}`;
        return;
    }

    // आकर्षक रङ्गीन थिम (Color Palette)
    const colorPalette = getThemeColors();
    const chartType = chartTypes.dynamicChart || 'bar';
    const isRadial = chartType === 'pie' || chartType === 'doughnut';
    const ctx = document.getElementById("dynamicChart").getContext('2d');
    const backgroundColors = labels.map((_, i) => createGradient(ctx, colorPalette[i % colorPalette.length], false, isRadial));
    const hoverBackgroundColors = labels.map((_, i) => createGradient(ctx, colorPalette[i % colorPalette.length], false, isRadial, true));
    const borderColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);

    // पुरानो चार्ट नष्ट गर्ने
    if (dynamicChartObj) dynamicChartObj.destroy();
    if (attendanceViolationChartObj) attendanceViolationChartObj.destroy(); // साझा क्यानभास क्लियर गर्ने
    
    dynamicChartObj = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: 'संख्या',
                data: values,
                backgroundColor: backgroundColors,
                hoverBackgroundColor: hoverBackgroundColors,
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2,
                borderColor: borderColors,
                borderWidth: isRadial ? 0.5 : 1,
                borderRadius: 5
            }]
        },
        options: {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const i = elements[0].index;
                    const label = labels[i];
                    const filtered = data.filter(item => {
                        let val = getVal(item, field, fieldLabel);
                        return String(val).includes(label);
                    });
                    showDetailedTable(filtered, `${fieldLabel}: ${label}`, 'survey');
                }
            },
            animation: GLOBAL_CHART_ANIMATION,
            animations: (chartTypes.dynamicChart === 'bar' || chartTypes.dynamicChart === 'line') ? { y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) } } : {},
            responsive: true,
            maintainAspectRatio: false,
            scales: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut') ? {} : {
                y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } },
                x: { ticks: { font: { family: 'Kalimati', size: 11 } } }
            },
            plugins: { 
                legend: { display: (chartTypes.dynamicChart === 'pie' || chartTypes.dynamicChart === 'doughnut'), position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` संख्या: ${toNepaliDigits(ctx.raw)}` } },
                shadowPlugin: { enabled: true },
                datalabels: GLOBAL_DATALABELS_CONFIG
            }
        }
    });

    const fieldName = selector.options[selector.selectedIndex].text;
    if (labelEl) labelEl.textContent = `विश्लेषण: ${fieldName}`;

    // तथ्याङ्क कार्डहरू अपडेट गर्ने - Colorful stat cards
    if (statRow) {
        statRow.innerHTML = labels.map((l, i) => `
            <div class="stat-card" style="cursor:pointer; min-width: 110px; padding: 8px 12px; flex: 1; --stat-border-color: ${colorPalette[i % colorPalette.length]}; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.08);" 
                 onclick="showDetailedTable(currentFilteredSubmissions.filter(item => {
                     let val = getVal(item, '${field}', '${fieldLabel}');
                     return String(val).includes('${l}');
                 }), '${fieldLabel}: ${l}', 'survey')">
                <div class="stat-number" style="font-size: 1.25rem; color: ${colorPalette[i % colorPalette.length]}; margin-bottom: 4px;"><i class="fas fa-chart-simple"></i> ${toNepaliDigits(counts[l])} <span style="font-size: 50%;">(${toNepaliDigits(totalVal > 0 ? (counts[l]/totalVal*100).toFixed(1) : 0)}%)</span></div>
                <div style="font-size: 0.9rem; font-weight: 600; color: #4a5568; line-height: 1.3;">${l}</div>
            </div>
        `).join('');
    }
}

/**
 * ड्यासबोर्ड भ्यू स्विच (सर्वेक्षण VS अनुगमन)
 */
function switchDashboardView(view) {
    currentPage = 1;
    activeTagId = null; // ट्याब फेर्दा ट्याग फिल्टर हटाउने
    currentDashboardView = view;

    // ड्यासबोर्ड ट्याब परिवर्तन गर्दा चार्टहरू रिसेट गर्ने र पुराना इन्स्टेन्स हटाउने (जसले गर्दा पुरानो चार्ट रहिरहँदैन)
    const chartsToDestroy = [
        genderChartObj, satisfactionChartObj, ghusChartObj, devChartObj, 
        dynamicChartObj, attendanceViolationChartObj, charterClarityChartObj,
        topUnsatisfiedChartObj, topSatisfiedChartObj, vacantByProvinceChartObj,
        provStaffingComparisonChartObj, staffingChartObj, facilitiesChartObj, 
        vacantPercentPieChartObj, websiteChartObj, disclosureChartObj, 
        autoInfoChartObj, workroomChartObj, infoBoardChartObj, cleaningChartObj
    ];
    chartsToDestroy.forEach(chart => { if (chart) chart.destroy(); });
    
    // अब्जेक्टहरूलाई नल (null) बनाउने
    genderChartObj = satisfactionChartObj = ghusChartObj = devChartObj = dynamicChartObj = 
    attendanceViolationChartObj = charterClarityChartObj = topUnsatisfiedChartObj = 
    topSatisfiedChartObj = vacantByProvinceChartObj = provStaffingComparisonChartObj = 
    staffingChartObj = facilitiesChartObj = vacantPercentPieChartObj = 
    websiteChartObj = disclosureChartObj = autoInfoChartObj = 
    workroomChartObj = infoBoardChartObj = cleaningChartObj = null;

    // ड्यासबोर्ड ट्याब परिवर्तन गर्दा खुला भएको विस्तृत विवरण तालिका (modal) बन्द गर्ने
    const detailTableContainer = document.getElementById("dynamicDetailTableContainer");
    if (detailTableContainer) {
        detailTableContainer.style.display = "none";
        document.body.style.overflow = ""; 
    }
    
    // ड्यासबोर्ड स्विच गर्दा पुराना 'विशिष्ट' फिल्टरहरू रिसेट गर्ने (डाटा ओभरल्याप हुन नदिन)
    const mField = document.getElementById("monitoringFieldSelector");
    const dField = document.getElementById("dynamicFieldSelector");
    const aCat = document.getElementById("filterCategory");
    if (mField) mField.value = "";
    if (dField) dField.value = "";
    if (aCat) aCat.value = "";

    // सबै मुख्य चार्ट कन्टेनरहरू र अलर्ट सेक्सनहरू सुरुमा लुकाउने (Reset Visibility)
    const containers = ["surveyChartsRow", "monitoringChartsRow", "topOfficesRow", "dynamicChartRow", "monitoringAlertsSection", "monitoringDetailsSection", "dynamicStatRow"];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none'; // !important हटाइएको ताकि refreshDashboard ले देखाउन सकोस्
    });

    const surveyBtn = document.getElementById("showSurveyView");
    const monitoringBtn = document.getElementById("showMonitoringView");
    const attendanceBtn = document.getElementById("showAttendanceView");
    const pdfBtn = document.getElementById("downloadAttendancePDF");
    const excelBtn = document.getElementById("exportAttendanceExcel");
    
    const tableHead = document.querySelector("#dataTable thead");
    const extraFilters = document.getElementById("attendanceExtraFilters");
    const monitoringExtraFilters = document.getElementById("monitoringExtraFilters");
    const toggleMBtn = document.getElementById("toggleMonitoringFilters");
    const toggleAlertsBtn = document.getElementById("toggleAlertsVisibilityBtn");

    if (view === 'survey') {
        if(pdfBtn) pdfBtn.style.display = "none";
        if(excelBtn) excelBtn.style.display = "none";
        surveyBtn?.classList.add("active");
        monitoringBtn?.classList.remove("active");
        attendanceBtn?.classList.remove("active");
        if(extraFilters) extraFilters.style.display = "none";
        if(monitoringExtraFilters) monitoringExtraFilters.style.display = "none";
        if(toggleMBtn) toggleMBtn.style.display = "none";
        if(toggleAlertsBtn) toggleAlertsBtn.style.display = "none";
        
        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'flex', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'flex', 'important');

        const dynamicAnalysis = document.getElementById("surveyDynamicAnalysis");
        if (dynamicAnalysis) {
            dynamicAnalysis.style.setProperty('display', 'block', 'important');
            const selectorDiv = dynamicAnalysis.querySelector(".filter-item");
            if (selectorDiv) selectorDiv.style.display = "flex"; // सर्वेक्षणमा यो फिल्टर पुनः देखाउने
        }
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringAlertsSection")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'none', 'important');

        if (tableHead) {
            tableHead.innerHTML = `<tr>
                <th>मिति</th>
                <th>जिल्ला</th>
                <th>लिङ्ग</th>
                <th>कार्यालय</th>
                <th>अतिरिक्त रकम दिनु पर्‍यो?</th>
                <th>सहयोग</th>
                <th>सन्तुष्टि</th>
                <th>विकास सम्बन्धी जानकारी भएको</th>
            </tr>`;
        }
        
        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "flex";
    } else if (view === 'attendance') {
        if(pdfBtn) pdfBtn.style.display = "block";
        if(excelBtn) excelBtn.style.display = "block";
        attendanceBtn?.classList.add("active");
        surveyBtn?.classList.remove("active");
        monitoringBtn?.classList.remove("active");
        if(extraFilters) extraFilters.style.display = "flex";
        if(monitoringExtraFilters) monitoringExtraFilters.style.display = "none";
        if(toggleMBtn) toggleMBtn.style.display = "none";
        if(toggleAlertsBtn) toggleAlertsBtn.style.display = "none";

        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');
        
        const dynamicAnalysis = document.getElementById("surveyDynamicAnalysis");
        if (dynamicAnalysis) {
            dynamicAnalysis.style.setProperty('display', 'block', 'important');
            const selectorDiv = dynamicAnalysis.querySelector(".filter-item");
            if (selectorDiv) selectorDiv.style.display = "none"; // प्रश्न छान्ने फिल्टर लुकाउने
        }
        
        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'none', 'important');

        if (tableHead) {
            tableHead.innerHTML = `<tr>
                <th>मिति</th>
                <th>कार्यालय</th>
                <th>कर्मचारीको नाम</th>
                <th>पद</th>
                <th>संकेत नं.</th>
                <th>अपरिपालना प्रकार</th>
                <th colspan="2">कैफियत</th>
            </tr>`;
        }
        
        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "none";
    } else {
        if(pdfBtn) pdfBtn.style.display = "none";
        if(excelBtn) excelBtn.style.display = "none";
        monitoringBtn?.classList.add("active");
        surveyBtn?.classList.remove("active");
        attendanceBtn?.classList.remove("active");
        if(extraFilters) extraFilters.style.display = "none";
        if(toggleMBtn) toggleMBtn.style.display = "block";
        if(toggleAlertsBtn) toggleAlertsBtn.style.display = "inline-flex";
        
        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("surveyDynamicAnalysis")?.style.setProperty('display', 'none', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'flex', 'important');
        document.getElementById("monitoringAlertsSection")?.style.setProperty('display', 'block', 'important');
        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'block', 'important');

        if (tableHead) {
            tableHead.innerHTML = `<tr>
                <th>मिति</th>
                <th>जिल्ला</th>
                <th>कार्यालय</th>
                <th>नागरिक बडापत्र (डिजिटल/अडियो)</th>
                <th>मध्यस्तकर्ताको प्रवेश</th>
                <th>हाजिरीको अवस्था</th>
                <th>कुल दरबन्दी</th>
                <th>रिक्त</th>
            </tr>`;
        }
        
        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "none";

        const stored = localStorage.getItem("monitoringData_nsc");
        if (stored) allMonitorings = JSON.parse(stored);
    }
    refreshDashboard();
}

// इभेन्ट लिसनरहरू (बटनहरूले काम गर्ने बनाउन)
document.getElementById("showSurveyView")?.addEventListener("click", () => switchDashboardView('survey'));
document.getElementById("showMonitoringView")?.addEventListener("click", () => switchDashboardView('monitoring'));
document.getElementById("showAttendanceView")?.addEventListener("click", () => switchDashboardView('attendance'));
document.getElementById("downloadAttendancePDF")?.addEventListener("click", downloadAttendancePDF);
document.getElementById("exportAttendanceExcel")?.addEventListener("click", exportAttendanceToExcel);

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;
        if (!targetTab) return;

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-panel"));
        const targetPanel = document.getElementById(targetTab);
        if (targetPanel) {
            targetPanel.classList.add("active-panel");
        }

        if (targetTab === "dashboard-tab") {
            // ड्यासबोर्ड ट्याबमा क्लिक गर्दा डिफल्ट अनुगमन भ्यु लोड गर्ने
            switchDashboardView('monitoring');
        }

        // ट्याब परिवर्तन हुँदा वा रिडाइरेक्ट हुँदा पेजलाई माथि (Top) पुर्याउने
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

document.getElementById("applyFilter")?.addEventListener("click", () => {
    currentPage = 1;
    refreshDashboard();
});
document.getElementById("resetFilter")?.addEventListener("click", () => {
    currentPage = 1;
    activeTagId = null; // रिसेट गर्दा ट्याग फिल्टर पनि हटाउने
    document.getElementById("filterPradesh").value = "";
    document.getElementById("filterDistrict").innerHTML = '<option value="">सबै</option>';
    document.getElementById("filterOffice").value = "";
    document.getElementById("filterGender").value = "";
    if(document.getElementById("filterCategory")) document.getElementById("filterCategory").value = "";
    if(document.getElementById("filterEmpName")) document.getElementById("filterEmpName").value = "";
    if(document.getElementById("filterEmpSymbol")) document.getElementById("filterEmpSymbol").value = "";
    if(document.getElementById("monitoringFieldSelector")) document.getElementById("monitoringFieldSelector").value = "";
    if(document.getElementById("monitoringExtraFilters")) document.getElementById("monitoringExtraFilters").style.display = "none";
    const toggleBtn = document.getElementById("toggleMonitoringFilters");
    if(toggleBtn) toggleBtn.textContent = "🔍 थप अनुगमन फिल्टरहरू";

    refreshDashboard();
});

// 'स्थिति सारांश' बटन थप्ने लजिक
document.addEventListener("DOMContentLoaded", function() {
    const resetBtn = document.getElementById("resetFilter");
    if (resetBtn) {
        const summaryBtn = document.createElement("button");
        summaryBtn.id = "statusSummaryBtn";
        summaryBtn.type = "button";
        summaryBtn.className = "tab-btn";
        summaryBtn.style.marginLeft = "8px";
        summaryBtn.style.background = "#27ae60";
        summaryBtn.style.color = "white";
        summaryBtn.innerHTML = '<i class="fas fa-chart-pie"></i> स्थिति सारांश';
        summaryBtn.onclick = openCurrentDashboardSummary;
        resetBtn.parentNode.insertBefore(summaryBtn, resetBtn.nextSibling);
    }
});

/**
 * फिल्टर गरिएको डेटाको स्थिति सारांश देखाउने फङ्सन
 */
function showStatusSummary() {
    const container = document.getElementById("dynamicDetailTableContainer");
    const titleEl = document.getElementById("detailTableTitle");
    const table = document.getElementById("dynamicDetailTable");
    
    if (!container || !table) return;

    // फिल्टरमा छनौट भएको स्थानका आधारमा शीर्षक परिवर्तन गर्ने
    const pSel = document.getElementById("filterPradesh");
    const dSel = document.getElementById("filterDistrict");
    const sSel = document.getElementById("filterSthaaniya");
    const pLabel = pSel && pSel.value ? pSel.options[pSel.selectedIndex].text : "";
    const dLabel = dSel && dSel.value ? dSel.options[dSel.selectedIndex].text : "";
    const sLabel = sSel && sSel.value ? sSel.options[sSel.selectedIndex].text : "";
    let titleParts = [];
    if (pLabel) titleParts.push(pLabel);
    if (dLabel && dLabel !== "सबै") titleParts.push(dLabel);
    if (sLabel && sLabel !== "सबै") titleParts.push(sLabel);

    titleEl.textContent = titleParts.length > 0 
        ? `स्थिति सारांश - ${titleParts.join(' - ')}` 
        : "फिल्टर लागू भएको क्षेत्रको स्थिति सारांश";

    container.style.display = "flex";
    document.body.style.overflow = "hidden";

    // टेबल लुकाउने र सारांश कन्टेनर देखाउने
    table.style.display = "none";
    let summaryDiv = container.querySelector(".summary-content-wrapper");
    if (!summaryDiv) {
        summaryDiv = document.createElement("div");
        summaryDiv.className = "summary-content-wrapper";
        table.parentNode.appendChild(summaryDiv);
    }
    summaryDiv.style.display = "block";

    // सहयोगी फङ्सन: एरे वा स्ट्रिङबाट कारणहरू गणना गर्न
    const countReasons = (data, field) => {
        let counts = {};
        data.forEach(d => {
            let val = d[field] || "";
            if (val) {
                val.split(",").forEach(r => {
                    let reason = r.trim();
                    if (reason) counts[reason] = (counts[reason] || 0) + 1;
                });
            }
        });
        return Object.entries(counts).map(([k, v]) => `${k} (${toNepaliDigits(v)})`).join(", ") || "उपलब्ध छैन";
    };

    let html = "";

    if (currentDashboardView === 'monitoring') {
        const data = currentFilteredMonitorings;
        const totalPosts = data.reduce((s, r) => s + Number(r.d_total || 0), 0);
        const vacantPosts = data.reduce((s, r) => s + Number(r.d_vacant || 0), 0);
        
        html = `
            <div class="summary-section">
                <h4><i class="fas fa-search-location"></i> कार्यालय/नागरिक बडापत्र अनुगमन</h4>
                <div class="summary-grid">
                    <div class="summary-item"><span>कुल कार्यालय अनुगमन:</span> <strong>${toNepaliDigits(data.length)}</strong></div>
                    <div class="summary-item"><span>कुल दरबन्दी:</span> <strong>${toNepaliDigits(totalPosts)}</strong></div>
                    <div class="summary-item"><span>रिक्त दरबन्दी:</span> <strong>${toNepaliDigits(vacantPosts)}</strong></div>
                    <div class="summary-item"><span>नागरिक बडापत्र (स्पष्ट):</span> <strong>${toNepaliDigits(data.filter(d => (d.m_q1 || "").includes("स्पष्ट")).length)}</strong></div>
                    <div class="summary-item"><span>सेवा प्रक्रिया, कागजात, लागत र समय (स्पष्ट):</span> <strong>${toNepaliDigits(data.filter(d => (d.m_q2 || "").includes("स्पष्ट")).length)}</strong></div>
                    <div class="summary-item"><span>मध्यस्थकर्ता (देखिएको):</span> <strong>${toNepaliDigits(data.filter(d => d.m_q5 === "देखियो").length)}</strong></div>
                    <div class="summary-item"><span>कर्मचारीहरु तोकिएको कार्यकक्षमा रहेको (भेटिएको):</span> <strong>${toNepaliDigits(data.filter(d => d.m_q10 === "भेटियो").length)}</strong></div>
                    <div class="summary-item"><span>सरसफाइ (राम्रो):</span> <strong>${toNepaliDigits(data.filter(d => d.m_q12 === "राम्रो").length)}</strong></div>
                    <div class="summary-item"><span>सेवाग्राही सहायता कक्ष (भएको):</span> <strong>${toNepaliDigits(data.filter(d => d.f_1 === "छ").length)}</strong></div>
                </div>
            </div>`;
    } else if (currentDashboardView === 'survey') {
        const data = currentFilteredSubmissions;
        const suggestions = data.filter(d => d.sujhaw && d.sujhaw.trim() !== "").map(d => `<li><strong>${d.mukhya_karyalay || 'अज्ञात'}:</strong> ${d.sujhaw}</li>`).join("");

        html = `
            <div class="summary-section">
                <h4><i class="fas fa-poll-h"></i> सेवाग्राही सर्वेक्षण</h4>
                <div class="summary-grid">
                    <div class="summary-item"><span>बडापत्रको जानकारी:</span> <strong>${toNepaliDigits(data.filter(d => getVal(d, 'santushti_janakari', 'नागरिक बडापत्रको जानकारी') === "छ").length)}</strong></div>
                    <div class="summary-item"><span>तोकिएको समयमा काम भएको:</span> <strong>${toNepaliDigits(data.filter(d => getVal(d, 'tokiyeko_samaya', 'तोकिएको समयमा काम भएको') === "भयो").length)}</strong></div>
                    <div class="summary-item"><span>बाहिरी व्यक्तिको सहयोग (लिनु परेको):</span> <strong>${toNepaliDigits(data.filter(d => d.sahayog_parera === "पर्‍यो").length)}</strong></div>
                    <div class="summary-item"><span>अतिरिक्त रकम (घुस) (तिर्नु परेको):</span> <strong>${toNepaliDigits(data.filter(d => d.ghus_parera === "पर्‍यो").length)}</strong></div>
                    <div class="summary-item"><span>सन्तुष्ट संख्या:</span> <strong>${toNepaliDigits(data.filter(d => d.satisfaction_flag === "सन्तुष्ट").length)}</strong></div>
                    <div class="summary-item"><span>असन्तुष्ट संख्या:</span> <strong>${toNepaliDigits(data.filter(d => d.satisfaction_flag === "असन्तुष्ट").length)}</strong></div>
                    <div class="summary-item"><span>योजनाबाट सन्तुष्टि (भएको):</span> <strong>${toNepaliDigits(data.filter(d => getVal(d, 'yojana_santushti', 'योजनाबाट सन्तुष्टि') === "सन्तुष्ट").length)}</strong></div>
                </div>
                
                <div style="margin-top:20px; border:1px solid #edf2f7; border-radius:10px; padding:15px; background:#fff;">
                    <p style="margin-bottom:8px;"><strong><i class="fas fa-thumbs-up"></i> सन्तुष्टिको कारण:</strong> ${countReasons(data, 'santushti_positive')}</p>
                    <p style="margin-bottom:8px;"><strong><i class="fas fa-thumbs-down"></i> असन्तुष्टिको कारण (सेवा):</strong> ${countReasons(data, 'santushti_negative')}</p>
                    <p style="margin-bottom:0;"><strong><i class="fas fa-exclamation-triangle"></i> असन्तुष्टिको कारण (योजना):</strong> ${countReasons(data, 'asantushti_karan_yojana')}</p>
                </div>

                <div style="margin-top:20px;">
                    <h5><i class="fas fa-comment-dots"></i> सेवाग्राहीका सुझावहरु:</h5>
                    <div style="max-height: 200px; overflow-y: auto; background: #fdfdfd; padding: 10px; border: 1px solid #eee; border-radius: 8px; margin-top: 8px;">
                        <ul style="padding-left: 20px; font-size: 0.9rem;">
                            ${suggestions || '<li>कुनै सुझाव उपलब्ध छैन।</li>'}
                        </ul>
                    </div>
                </div>
            </div>`;
    } else if (currentDashboardView === 'attendance') {
        const data = currentFilteredAttendance;
        html = `
            <div class="summary-section">
                <h4><i class="fas fa-user-check"></i> समय पालना/पोशाक अनुगमन</h4>
                <div class="summary-grid">
                    <div class="summary-item"><span>अनुगमन मितिमा अनुपस्थित/ढिला आउने:</span> <strong>${toNepaliDigits(data.filter(d => d.category === 'अनुगमन मितिमा अनुपस्थित/ढिला आउने').length)}</strong></div>
                    <div class="summary-item"><span>अघिल्लो मितिमा अनुपस्थित/ढिला:</span> <strong>${toNepaliDigits(data.filter(d => d.category === 'अघिल्लो मितिमा अनुपस्थित/ढिला').length)}</strong></div>
                    <div class="summary-item"><span>तोकिएको पोशाक नलगाएको:</span> <strong>${toNepaliDigits(data.filter(d => d.category === 'तोकिएको पोशाक नलगाएको').length)}</strong></div>
                    <div class="summary-item"><span>हाजिर भई कार्यकक्षमा नभेटिएको:</span> <strong>${toNepaliDigits(data.filter(d => d.category === 'हाजिर भई कार्यकक्षमा नभेटिएको').length)}</strong></div>
                </div>
            </div>`;
    }

    summaryDiv.innerHTML = html;
}

// साविकको विवरण तालिका खोल्दा सारांश लुकाउने अपडेट
const originalShowDetailedTable = showDetailedTable;
showDetailedTable = function(data, title, viewType) {
    const container = document.getElementById("dynamicDetailTableContainer");
    if (container) {
        const summaryDiv = container.querySelector(".summary-content-wrapper");
        if (summaryDiv) summaryDiv.style.display = "none";
        const table = document.getElementById("dynamicDetailTable");
        if (table) table.style.display = "table";
    }
    originalShowDetailedTable(data, title, viewType);
};


/**
 * पेजिनेसन कन्ट्रोलहरू रेन्डर गर्ने फङ्सन
 */
function renderPaginationUI(totalItems) {
    const container = document.getElementById("paginationControls");
    if (!container) return;
    container.innerHTML = "";
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return;

    // पहिलो बटन (First)
    const firstBtn = document.createElement("button");
    firstBtn.innerHTML = '<i class="fas fa-angle-double-left"></i>';
    firstBtn.className = "tab-btn";
    firstBtn.style.padding = "3px 10px";
    firstBtn.style.marginRight = "2px";
    firstBtn.disabled = currentPage === 1;
    firstBtn.onclick = () => { currentPage = 1; refreshDashboard(); };
    container.appendChild(firstBtn);

    // अघिल्लो बटन (Previous)
    const prevBtn = document.createElement("button");
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.className = "tab-btn";
    prevBtn.style.padding = "3px 10px";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; refreshDashboard(); };
    container.appendChild(prevBtn);

    // पृष्ठ जानकारी
    const info = document.createElement("span");
    info.style.fontSize = "0.85rem";
    info.style.margin = "0 10px";
    info.style.fontWeight = "600";
    info.textContent = `${toNepaliDigits(currentPage)} / ${toNepaliDigits(totalPages)} पृष्ठ`;
    container.appendChild(info);

    // पछिल्लो बटन (Next)
    const nextBtn = document.createElement("button");
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.className = "tab-btn";
    nextBtn.style.padding = "3px 10px";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; refreshDashboard(); };
    container.appendChild(nextBtn);

    // अन्तिम बटन (Last)
    const lastBtn = document.createElement("button");
    lastBtn.innerHTML = '<i class="fas fa-angle-double-right"></i>';
    lastBtn.className = "tab-btn";
    lastBtn.style.padding = "3px 10px";
    lastBtn.style.marginLeft = "2px";
    lastBtn.disabled = currentPage === totalPages;
    lastBtn.onclick = () => { currentPage = totalPages; refreshDashboard(); };
    container.appendChild(lastBtn);
}

/**
 * सबै अलर्टहरू र सेक्सन हटाउने फङ्सन
 */
function dismissAllAlerts(event) {
    event.stopPropagation(); // बटनको क्लिकले कार्डको क्लिक ट्रिगर नगरोस्
    Swal.fire({
        title: 'निश्चित हुनुहुन्छ?',
        text: "यो अलर्ट सेक्सन लुकाएपछि 'अलर्ट रिसेट' बटन थिचेर मात्र फेरि देखाउन सकिन्छ।",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'हो, लुकाउनुहोस्!',
        cancelButtonText: 'रद्द गर्नुहोस्'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.setItem("alertSectionDismissed_nsc", "true");
            refreshDashboard();
        }
    });
}

/**
 * अलर्ट सेक्सनको दृश्यता टोगल गर्ने फङ्सन
 */
function toggleAlertsVisibility() {
    const isDismissed = localStorage.getItem("alertSectionDismissed_nsc") === "true";
    if (isDismissed) {
        localStorage.removeItem("alertSectionDismissed_nsc");
    } else {
        localStorage.setItem("alertSectionDismissed_nsc", "true");
    }
    refreshDashboard();
}

/**
 * हटाएका सबै अलर्टहरूलाई रिसेट गर्ने फङ्सन
 */
function resetAlerts() {
    dismissedAlerts.clear();
    localStorage.removeItem("dismissedAlerts_nsc");
    localStorage.removeItem("alertSectionDismissed_nsc"); // सेक्सन क्लोज भएको जानकारी पनि रिसेट गर्ने
    refreshDashboard();
}

/**
 * आवाज टाइप (Voice Typing) सुरु गर्ने फङ्सन
 */
function startVoiceTyping(event, targetId) {
    const btn = event.currentTarget;
    const target = document.getElementById(targetId);
    
    if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
        Swal.fire({
            icon: 'error',
            title: 'सुविधा उपलब्ध छैन',
            text: 'तपाईंको ब्राउजरमा आवाज टाइप गर्ने सुविधा छैन। कृपया Chrome ब्राउजर प्रयोग गर्नुहोस्।',
            confirmButtonColor: '#387ae6'
        });
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'ne-NP'; // नेपाली भाषा सेट गरिएको
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        btn.classList.add('recording');
        const textSpan = btn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = "सुन्दैछ...";
    };

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        // पुरानो टेक्स्टमा नयाँ आवाज टाइप गरिएको टेक्स्ट थप्ने
        target.value = (target.value ? target.value.trim() + ' ' : '') + transcript;
        target.dispatchEvent(new Event('input')); // वर्ड काउन्टर वा अन्य इभेन्ट अपडेट गर्न
    };

    recognition.onerror = () => stopRecording(btn);
    recognition.onend = () => stopRecording(btn);

    function stopRecording(button) {
        button.classList.remove('recording');
        const textSpan = button.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = "आवाज टाइप";
    }

    recognition.start();
}

/**
 * इन्पुट फिल्ड खाली (Clear) गर्ने फङ्सन
 */
function clearInput(targetId) {
    const target = document.getElementById(targetId);
    if (target) {
        target.value = '';
        target.dispatchEvent(new Event('input'));
    }
}

/**
 * सफलताको साउन्ड इफेक्ट बजाउने फङ्सन
 */
function playSuccessSound() {
    consecutiveErrorCount = 0; // सफलता मिलेपछि गल्तीको गणना रिसेट गर्ने

    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) syncIndicator.style.backgroundColor = ''; // रङ्ग साविककै अवस्थामा फर्काउने

    const successSound = new Audio('https://www.soundjay.com/buttons/button-09.mp3');
    successSound.volume = 0.5;
    successSound.play().catch(e => console.log("साउन्ड प्ले एरर:", e));
}

/**
 * त्रुटि (Error) को साउन्ड इफेक्ट बजाउने र रातो सूचना देखाउने फङ्सन
 */
function playErrorSound(visualMessage = null) {
    consecutiveErrorCount++; // प्रत्येक गल्तीमा काउन्ट बढाउने

    const errorSound = new Audio('https://www.soundjay.com/buttons/beep-05.mp3');
    errorSound.volume = 0.4;

    // पिच बढाउने लजिक: १.० (सामान्य) देखि अधिकतम २.५ सम्म
    // जति धेरै गल्ती, त्यति तीखो आवाज
    let pitch = 1.0 + (consecutiveErrorCount - 1) * 0.25;
    errorSound.playbackRate = Math.min(pitch, 2.5); 

    errorSound.play().catch(e => console.log("साउन्ड प्ले एरर:", e));

    if (visualMessage) {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.classList.add('error');
            syncIndicator.classList.add('active');

            // रङ्गको गाढापन (Intensity) परिवर्तन गर्ने लजिक
            // #e74c3c को आधार Lightness ५७% हो। प्रत्येक गल्तीमा ७% ले घटाउँदै लैजाने (Darker red)
            let lightness = Math.max(57 - (consecutiveErrorCount * 7), 20);
            syncIndicator.style.backgroundColor = `hsl(6, 78%, ${lightness}%)`;

            syncIndicator.innerHTML = `❌ ${visualMessage}`;
            setTimeout(() => {
                syncIndicator.classList.remove('active');
                setTimeout(() => { 
                    syncIndicator.classList.remove('error');
                    syncIndicator.style.backgroundColor = ''; // क्लिनअप
                    syncIndicator.innerHTML = "🔄 डेटा सिङ्क हुँदैछ..."; 
                }, 400);
            }, 3500); // ३.५ सेकेन्डसम्म रातो सन्देश देखाउने
        }
    }
}

/**
 * विस्तृत तालिका देखाउने फङ्सन (Click interaction handles)
 */
function showDetailedTable(data, title, viewType = 'survey') {
    const container = document.getElementById("dynamicDetailTableContainer");
    const titleEl = document.getElementById("detailTableTitle");
    const thead = document.querySelector("#dynamicDetailTable thead");
    const tbody = document.querySelector("#dynamicDetailTable tbody");
    
    if (!container || !thead || !tbody) return;

    titleEl.textContent = title;
    container.style.display = "flex";
    document.body.style.overflow = "hidden"; // मोडाल खुल्दा पछाडि स्क्रोल हुन नदिने

    if (viewType === 'survey') {
        thead.innerHTML = `<tr><th>मिति</th><th>जिल्ला</th><th>कार्यालय</th><th>बाहिरी सहयोग</th><th>अतिरिक्त रकम</th><th>सेवा सन्तुष्टि</th><th>योजना सन्तुष्टि</th><th>सुझाव</th></tr>`;
        tbody.innerHTML = data.map(r => {
            const sahayog = getVal(r, 'sahayog_parera', 'सहयोग');
            const ghus = getVal(r, 'ghus_parera', 'अतिरिक्त रकम');
            const sat = getVal(r, 'satisfaction_flag', 'सन्तुष्टि');
            const yojana = getVal(r, 'yojana_santushti', 'योजनाबाट सन्तुष्टि');
            
            return `
                <tr>
                    <td>${getVal(r, 'survey_date', 'मिति')}</td>
                    <td>${getVal(r, 'jilla', 'जिल्ला')}</td>
                    <td>${getVal(r, 'mukhya_karyalay', 'कार्यालय')}</td>
                    <td style="color: ${sahayog === 'पर्‍यो' ? '#de3053' : 'inherit'}; font-weight: ${sahayog === 'पर्‍यो' ? '700' : 'normal'}" ${sahayog === 'पर्‍यो' ? 'class="has-tooltip tooltip-red" data-tooltip="बाहिरी व्यक्तिको सहयोग लिनुपरेको"' : ''}>${sahayog}</td>
                    <td style="color: ${ghus === 'पर्‍यो' ? '#de3053' : 'inherit'}; font-weight: ${ghus === 'पर्‍यो' ? '700' : 'normal'}" ${ghus === 'पर्‍यो' ? 'class="has-tooltip tooltip-red" data-tooltip="अतिरिक्त रकम (घुस) दिनुपरेको"' : ''}>${ghus}</td>
                    <td style="color: ${sat === 'असन्तुष्ट' ? '#de3053' : 'inherit'}; font-weight: ${sat === 'असन्तुष्ट' ? '700' : 'normal'}" ${sat === 'असन्तुष्ट' ? 'class="has-tooltip tooltip-yellow" data-tooltip="सेवा प्रवाहमा असन्तुष्टि"' : ''}>${sat}</td>
                    <td style="color: ${yojana === 'असन्तुष्ट' ? '#de3053' : 'inherit'}; font-weight: ${yojana === 'असन्तुष्ट' ? '700' : 'normal'}" ${yojana === 'असन्तुष्ट' ? 'class="has-tooltip tooltip-yellow" data-tooltip="योजना/विकास कार्यबाट असन्तुष्टि"' : ''}>${yojana}</td>
                    <td>${getVal(r, 'sujhaw', 'सुझाव') || "-"}</td>
                </tr>
            `;
        }).join('');
    } else if (viewType === 'monitoring') {
         thead.innerHTML = `<tr><th>मिति</th><th>जिल्ला</th><th>कार्यालय</th><th>बडापत्र</th><th>सेवा प्रक्रिया</th><th>मध्यस्थकर्ता</th><th>कर्मचारी उपस्थिति</th><th>सरसफाइ</th></tr>`;
         tbody.innerHTML = data.map(r => {
            const q1 = getVal(r, 'm_q1', '१. नागरिक बडापत्र');
            const q2 = getVal(r, 'm_q2', '२. सेवा प्रक्रिया');
            const q5 = getVal(r, 'm_q5', '५. मध्यस्थकर्ताको प्रवेश');
            const q10 = getVal(r, 'm_q10', '१०. कर्मचारीहरु कार्यकक्षमा');
            const q12 = getVal(r, 'm_q12', '१२. सरसफाइको अवस्था');

            const isQ1Neg = ['स्पष्ट नबुझिने', 'पढ्न झन्झटिलो', 'नभएको'].includes(q1);
            const isQ2Neg = ['स्पष्ट उल्लेख नभएको', 'आंशिक', 'नभएको'].includes(q2);
            const isQ5Neg = q5 === 'देखियो';
            const isQ10Neg = ['आंशिक', 'भेटिएन'].includes(q10);
            const isQ12Neg = q12 === 'नराम्रो';

            return `
                <tr>
                    <td>${r.m_date || ""}</td>
                    <td>${r.m_jilla || ""}</td>
                    <td>${r.m_office || ""}</td>
                    <td style="color: ${isQ1Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ1Neg ? '700' : 'normal'}" ${isQ1Neg ? 'class="has-tooltip tooltip-yellow" data-tooltip="नागरिक बडापत्र स्पष्ट नभएको वा नराखिएको"' : ''}>${q1}</td>
                    <td style="color: ${isQ2Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ2Neg ? '700' : 'normal'}" ${isQ2Neg ? 'class="has-tooltip tooltip-yellow" data-tooltip="सेवा प्रक्रिया, कागजात, लागत र समय स्पष्ट नभएको"' : ''}>${q2}</td>
                    <td style="color: ${isQ5Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ5Neg ? '700' : 'normal'}" ${isQ5Neg ? 'class="has-tooltip tooltip-red" data-tooltip="मध्यस्थकर्ताको उपस्थिति देखिएको"' : ''}>${q5}</td>
                    <td style="color: ${isQ10Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ10Neg ? '700' : 'normal'}" ${isQ10Neg ? 'class="has-tooltip tooltip-red" data-tooltip="कर्मचारीहरु तोकिएको कार्यकक्षमा नभेटिएको"' : ''}>${q10}</td>
                    <td style="color: ${isQ12Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ12Neg ? '700' : 'normal'}" ${isQ12Neg ? 'class="has-tooltip tooltip-yellow" data-tooltip="कार्यालयको सरसफाइको अवस्था नराम्रो भएको"' : ''}>${q12}</td>
                </tr>
            `;
         }).join('');
    } else if (viewType === 'attendance') {
        thead.innerHTML = `<tr><th>मिति</th><th>कार्यालय</th><th>कर्मचारी</th><th>पद</th><th>प्रकार</th><th>कैफियत</th></tr>`;
        tbody.innerHTML = data.map(r => `
            <tr>
                <td>${r.date || ""}</td><td>${r.office || ""}</td><td>${r.name || ""}</td><td>${r.rank || ""}</td><td style="color: #de3053; font-weight: 700;" class="has-tooltip tooltip-red" data-tooltip="समय पालना वा पोशाक सम्बन्धी अपरिपालना">${r.category || ""}</td><td>${r.extra || "-"}</td>
            </tr>
        `).join('');
    }

    // Close table if clicked outside or on close button (already handled)
}

const detailTableCloseBtn = document.getElementById("closeDetailTable");
const detailTableContainer = document.getElementById("dynamicDetailTableContainer");

if (detailTableCloseBtn && detailTableContainer) {
    detailTableCloseBtn.addEventListener("click", () => {
        detailTableContainer.style.display = "none";
        document.body.style.overflow = ""; 
    });

    detailTableContainer.addEventListener("click", (e) => {
        if (e.target === detailTableContainer) {
            detailTableContainer.style.display = "none";
            document.body.style.overflow = ""; 
        }
    });
}

/**
 * AI Sentiment Analysis (Mockup for suggestions)
 * यसले सुझाव सकारात्मक, नकारात्मक वा तटस्थ के छ भन्ने कुरा पहिचान गर्छ।
 */
function analyzeSentiment(text) {
    const negativeWords = ['खराब', 'ढिला', 'झन्झटिलो', 'घुस', 'भ्रष्टाचार', 'नराम्रो', 'दुःख'];
    const positiveWords = ['राम्रो', 'सहज', 'छिटो', 'सन्तुष्ट', 'धन्यवाद', 'उत्कृष्ट'];
    
    let score = 0;
    negativeWords.forEach(w => { if(text.includes(w)) score--; });
    positiveWords.forEach(w => { if(text.includes(w)) score++; });
    
    if (score > 0) return { label: 'सकारात्मक', color: '#27ae60' };
    if (score < 0) return { label: 'नकारात्मक', color: '#e74c3c' };
    return { label: 'तटस्थ', color: '#7f8c8d' };
}

/**
 * ड्यासबोर्डका सामग्रीहरूमा फेड-इन एनिमेसन लागू गर्ने फङ्सन
 */
function triggerFadeIn() {
    const elements = document.querySelectorAll('.chart-box, .stat-card, .table-wrapper, #monitoringDetailsSection, #mapSection');
    elements.forEach(el => {
        // यदि एलिमेन्ट देखिने अवस्थामा छ भने मात्र एनिमेसन दिने
        if (el.style.display !== 'none') {
            el.classList.remove('chart-fade-in');
            void el.offsetWidth; // रिफ्लो ट्रिगर (Reflow trigger)
            el.classList.add('chart-fade-in');
        }
    });
}

function toggleMapVisibility() {
    const mapSection = document.getElementById('mapSection');
    const btn = document.getElementById('toggleMapBtn');
    if (!mapSection || !btn) return;

    if (mapSection.style.display === 'none' || mapSection.style.display === '') {
        mapSection.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-map-slash"></i> नक्सा लुकाउनुहोस्';
        btn.style.background = '#7f8c8d';
        initNepalMap();
        if (mapObj) {
            mapObj.invalidateSize();
            updateMapMarkers();
        }
    } else {
        mapSection.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-map-marked-alt"></i> नक्सामा हेर्नुहोस्';
        btn.style.background = '#e67e22';
    }
}

function initNepalMap() {
    if (mapObj) return;
    const mapContainer = document.getElementById('nepalMap');
    if (!mapContainer) return;
    
    mapObj = L.map('nepalMap', { scrollWheelZoom: false }).setView([28.3949, 84.1240], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapObj);
}

/**
 * नक्सामा डाटा अनुसारका रेडार मार्करहरू अपडेट गर्ने
 */
function updateMapMarkers() {
    if (!mapObj || document.getElementById('mapSection').style.display === 'none') return;

    // पुराना मार्कर हटाउने
    mapObj.eachLayer((layer) => {
        if (layer instanceof L.Marker) mapObj.removeLayer(layer);
    });

    let data = [];
    let dKey = ''; // District Key

    if (currentDashboardView === 'survey') { data = currentFilteredSubmissions; dKey = 'jilla'; }
    else if (currentDashboardView === 'monitoring') { data = currentFilteredMonitorings; dKey = 'm_jilla'; }
    else if (currentDashboardView === 'attendance') { data = currentFilteredAttendance; dKey = 'jilla'; }

    // जिल्ला अनुसार डाटा समूहकृत गर्ने
    const stats = data.reduce((acc, item) => {
        const dName = item[dKey] || getVal(item, dKey, 'जिल्ला');
        if (!dName || !DISTRICT_COORDS[dName]) return acc;
        
        if (!acc[dName]) acc[dName] = { total: 0, unsatisfied: 0, reasons: {} };
        acc[dName].total++;

        let reasons = [];
        // नकारात्मक सूचक पहिचान गर्ने लजिक र कारण सङ्कलन
        if (currentDashboardView === 'survey') {
            if (item.sahayog_parera === 'पर्‍यो') reasons.push('बाहिरी सहयोग');
            if (item.ghus_parera === 'पर्‍यो') reasons.push('अतिरिक्त रकम');
            if (item.satisfaction_flag === 'असन्तुष्ट') reasons.push('सेवा असन्तुष्टि');
            if (item.yojana_santushti === 'असन्तुष्ट') reasons.push('योजना असन्तुष्टि');
        } else if (currentDashboardView === 'monitoring') {
            if (['स्पष्ट नबुझिने', 'पढ्न झन्झटिलो', 'नभएको'].includes(item.m_q1 || getVal(item, 'm_q1', '१. नागरिक बडापत्र'))) reasons.push('बडापत्र अस्पष्ट');
            if (['स्पष्ट उल्लेख नभएको', 'आंशिक', 'नभएको'].includes(item.m_q2 || getVal(item, 'm_q2', '२. सेवा प्रक्रिया'))) reasons.push('प्रक्रिया अस्पष्ट');
            if ((item.m_q5 === 'देखियो' || getVal(item, 'm_q5', '५. मध्यस्थकर्ताको प्रवेश') === 'देखियो')) reasons.push('मध्यस्थकर्ता');
            if (['आंशिक', 'भेटिएन'].includes(item.m_q10 || getVal(item, 'm_q10', '१०. कर्मचारीहरु कार्यकक्षमा'))) reasons.push('कर्मचारी अनुपस्थित');
            if ((item.m_q12 === 'नराम्रो' || getVal(item, 'm_q12', '१२. सरसफाइको अवस्था') === 'नराम्रो')) reasons.push('सरसफाइ कमजोर');
        } else if (currentDashboardView === 'attendance') {
            reasons.push(item.category || "अपरिपालना");
        }

        if (reasons.length > 0) {
            acc[dName].unsatisfied++;
            reasons.forEach(r => {
                acc[dName].reasons[r] = (acc[dName].reasons[r] || 0) + 1;
            });
        }
        return acc;
    }, {});

    // नक्सामा मार्कर राख्ने
    Object.keys(stats).forEach(dName => {
        const s = stats[dName];

        // नकारात्मक पक्षहरू सङ्कलन गर्ने
        const negativeReasons = s.reasons ? Object.keys(s.reasons).join(", ") : "";

        // यदि असन्तुष्टि २५% भन्दा बढी छ भने रातो रेडार देखाउने
        const isHighRisk = (s.unsatisfied / s.total) > 0.25;
        const radarClass = isHighRisk ? 'radar-red' : 'radar-blue';

        const icon = L.divIcon({
            className: 'radar-container',
            html: `<div class="radar-point ${radarClass}"></div>`,
            iconSize: [20, 20]
        });

        const canvasId = `popup-chart-${dName.replace(/\s/g, '')}`;
        const popupText = `
            <div style="font-family:'Kalimati';">
                <strong style="color:#306a95;">${dName} जिल्ला</strong><br>
                कूल रेकर्ड: <span style="color:#387ae6">${toNepaliDigits(s.total)}</span> | 
                नकारात्मक सूचक: <span style="color:#de3053">${toNepaliDigits(s.unsatisfied)}</span>
                ${negativeReasons ? `<br><div style="color:#de3053; font-size:0.85rem; margin-top:5px;"><strong>नकारात्मक पक्ष:</strong> ${negativeReasons}</div>` : ''}
                <div style="margin-top:10px; height:120px; cursor:pointer;"><canvas id="${canvasId}"></canvas></div>
                <hr style="margin: 5px 0;">
                <div style="text-align:center; color:#e67e22; font-size:0.85rem; cursor:pointer;" class="view-details-link"><strong>विवरण हेर्न क्लिक गर्नुहोस्</strong></div>
            </div>
        `;

        L.marker(DISTRICT_COORDS[dName], { icon: icon })
            .addTo(mapObj)
            .bindPopup(popupText)
            .on('popupopen', function() {
                // चार्ट रेन्डर गर्ने लजिक
                setTimeout(() => {
                    const ctx = document.getElementById(canvasId);
                    if (!ctx) return;

                    new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: ['कूल रेकर्ड', 'नकारात्मक सूचक'],
                            datasets: [{
                                data: [s.total, s.unsatisfied],
                                backgroundColor: ['#387ae6cc', '#de3053cc'],
                                borderRadius: 4
                            }]
                        },
                        options: {
                            onClick: (e, elements) => {
                                if (elements.length > 0) {
                                    const idx = elements[0].index; // 0: Total, 1: Negative
                                    const isNegative = idx === 1;
                                    
                                    let filtered = data.filter(item => (item[dKey] || getVal(item, dKey, 'जिल्ला')) === dName);
                                    
                                    if (isNegative) {
                                        filtered = filtered.filter(item => {
                                            if (currentDashboardView === 'survey') {
                                                return (
                                                    item.sahayog_parera === 'पर्‍यो' || 
                                                    item.ghus_parera === 'पर्‍यो' || 
                                                    item.satisfaction_flag === 'असन्तुष्ट' || 
                                                    item.yojana_santushti === 'असन्तुष्ट'
                                                );
                                            }
                                            if (currentDashboardView === 'monitoring') {
                                                return (
                                                    ['स्पष्ट नबुझिने', 'पढ्न झन्झटिलो', 'नभएको'].includes(item.m_q1) ||
                                                    ['स्पष्ट उल्लेख नभएको', 'आंशिक', 'नभएको'].includes(item.m_q2) ||
                                                    item.m_q5 === 'देखियो' || 
                                                    ['आंशिक', 'भेटिएन'].includes(item.m_q10) ||
                                                    item.m_q12 === 'नराम्रो'
                                                );
                                            }
                                            if (currentDashboardView === 'attendance') return true;
                                            return false;
                                        });
                                    }

                                    showDetailedTable(filtered, `${dName}: ${isNegative ? 'नकारात्मक सूचक' : 'कूल रेकर्ड'}`, 
                                        currentDashboardView === 'survey' ? 'survey' : (currentDashboardView === 'monitoring' ? 'monitoring' : 'attendance'));
                                }
                            },
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { beginAtZero: true, ticks: { display: false }, grid: { display: false } },
                                y: { grid: { display: false }, ticks: { font: { family: 'Kalimati' } } }
                            }
                        }
                    });
                }, 100);

                // विवरण हेर्ने लिंकमा क्लिक गर्दाको लजिक
                const link = document.querySelector('.view-details-link');
                if (link) {
                    link.onclick = () => {
                        let foundPradeshId = "";
                        for (const [pId, districts] of Object.entries(DISTRICTS)) {
                            if (districts.includes(dName)) {
                                foundPradeshId = pId;
                                break;
                            }
                        }
                        if (foundPradeshId) {
                            const pSelect = document.getElementById("filterPradesh");
                            const dSelect = document.getElementById("filterDistrict");
                            pSelect.value = foundPradeshId;
                            updateFilterDistricts();
                            dSelect.value = dName;
                            refreshDashboard();
                            document.getElementById("statCardsContainer").scrollIntoView({ behavior: 'smooth' });
                        }
                    };
                }
            });
    });
}

// ड्यासबोर्ड रिफ्रेस हुँदा नक्सा लोड गर्ने
const originalRefreshDashboard = refreshDashboard;
refreshDashboard = function() {
    const indicator = document.getElementById('updateIndicator');
    
    // इन्डिकेटर देखाउने
    if (indicator) indicator.classList.add('show');

    // वास्तविक रिफ्रेस प्रक्रिया सुरु
    originalRefreshDashboard();
    updateMapMarkers();
    
    // डेटा लोड र प्रोसेसिङ सकिएपछि एनिमेसन दिने र इन्डिकेटर लुकाउने
    setTimeout(() => {
        triggerFadeIn();
        if (indicator) {
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 400); // प्रोसेसिङ सकिएको छोटो समयपछि हटाउने
        }
    }, 100); 
};

loadData();

// Status Summary Modal Functions
function calculateMonitoringSummary(filteredData) {
    const summary = {
        total_count: filteredData.length,
        total_staff: 0,
        vacant_staff: 0,
        charter_clear: 0,
        charter_not_clear: 0,
        charter_difficult: 0,
        charter_none: 0,
        process_clear: 0,
        process_not_mentioned: 0,
        process_partial: 0,
        process_none: 0,
        broker_seen: 0,
        broker_not_seen: 0,
        staff_found: 0,
        staff_not_found: 0,
        staff_partial: 0,
        cleaning_good: 0,
        cleaning_bad: 0,
        cleaning_ok: 0,
        helpdesk_yes: 0,
        helpdesk_no: 0,
        helpdesk_normal: 0
    };

    filteredData.forEach(item => {
        // Total staff and vacant staff
        const d_total = parseInt(getVal(item, 'd_total', 'कुल दरबन्दी')) || 0;
        const d_vacant = parseInt(getVal(item, 'd_vacant', 'रिक्त')) || 0;
        summary.total_staff += d_total;
        summary.vacant_staff += d_vacant;

        // Citizen charter (m_q1)
        const m_q1 = getVal(item, 'm_q1', 'नागरिक बडापत्र');
        if (m_q1 === 'स्पष्ट बुझिने') summary.charter_clear++;
        else if (m_q1 === 'स्पष्ट नबुझिने') summary.charter_not_clear++;
        else if (m_q1 === 'पढ्न झन्झटिलो') summary.charter_difficult++;
        else if (m_q1 === 'नभएको') summary.charter_none++;

        // Service process (m_q2)
        const m_q2 = getVal(item, 'm_q2', 'सेवा प्रक्रिया');
        if (m_q2 === 'स्पष्ट उल्लेख भएको') summary.process_clear++;
        else if (m_q2 === 'उल्लेख नभएको') summary.process_not_mentioned++;
        else if (m_q2 === 'आंशिक') summary.process_partial++;
        else if (m_q2 === 'नभएको') summary.process_none++;

        // Broker (m_q5)
        const m_q5 = getVal(item, 'm_q5', 'मध्यस्थकर्ताको प्रवेश');
        if (m_q5 === 'देखियो') summary.broker_seen++;
        else if (m_q5 === 'देखिएन') summary.broker_not_seen++;

        // Staff in workroom (m_q10)
        const m_q10 = getVal(item, 'm_q10', 'कर्मचारीहरु तोकिएको कार्यकक्षमा रहेको');
        if (m_q10 === 'भेटियो') summary.staff_found++;
        else if (m_q10 === 'भेटिएन') summary.staff_not_found++;
        else if (m_q10 === 'आंशिक') summary.staff_partial++;

        // Cleaning status (m_q12)
        const m_q12 = getVal(item, 'm_q12', 'कार्यालयको सरसफाइको अवस्था');
        if (m_q12 === 'राम्रो') summary.cleaning_good++;
        else if (m_q12 === 'नराम्रो') summary.cleaning_bad++;
        else if (m_q12 === 'ठीकै') summary.cleaning_ok++;

        // Help desk (f_1)
        const f_1 = getVal(item, 'f_1', 'सेवाग्राही सहायता कक्ष');
        if (f_1 === 'छ') summary.helpdesk_yes++;
        else if (f_1 === 'छैन') summary.helpdesk_no++;
        else if (f_1 === 'सामान्य') summary.helpdesk_normal++;
    });

    return summary;
}

function calculateSurveySummary(filteredData) {
    const summary = {
        charter_info_yes: 0,
        charter_info_no: 0,
        work_done_yes: 0,
        work_done_no: 0,
        helper_yes: 0,
        helper_no: 0,
        ghus_yes: 0,
        ghus_no: 0,
        satisfied: 0,
        unsatisfied: 0,
        sat_time: 0,
        sat_fee: 0,
        sat_quality: 0,
        sat_process: 0,
        sat_behavior: 0,
        sat_other: 0,
        unsat_time: 0,
        unsat_fee: 0,
        unsat_quality: 0,
        unsat_process: 0,
        unsat_behavior: 0,
        unsat_ghus: 0,
        unsat_other: 0,
        yojana_sat: 0,
        yojana_unsat: 0,
        yojana_unsat_time: 0,
        yojana_unsat_quality: 0,
        yojana_unsat_standard: 0,
        yojana_unsat_other: 0
    };

    filteredData.forEach(item => {
        // Charter info
        const janakari_chha = getVal(item, 'janakari_chha', 'नागरिक बडापत्रको जानकारी');
        if (janakari_chha === 'छ') summary.charter_info_yes++;
        else if (janakari_chha === 'छैन') summary.charter_info_no++;

        // Work done
        const kaam_bhayeko = getVal(item, 'kaam_bhayeko', 'तोकिएको समयमा काम भएको');
        if (kaam_bhayeko === 'भयो') summary.work_done_yes++;
        else if (kaam_bhayeko === 'भएन') summary.work_done_no++;

        // Helper
        const sahayog_parera = getVal(item, 'sahayog_parera', 'बाहिरी व्यक्तिको सहयोग');
        if (sahayog_parera === 'पर्‍यो') summary.helper_yes++;
        else if (sahayog_parera === 'परेन') summary.helper_no++;

        // Ghus
        const ghus_parera = getVal(item, 'ghus_parera', 'अतिरिक्त रकम (घुस)');
        if (ghus_parera === 'पर्‍यो') summary.ghus_yes++;
        else if (ghus_parera === 'परेन') summary.ghus_no++;

        // Satisfaction
        const main_satisfaction = getVal(item, 'main_satisfaction', 'सन्तुष्ट/असन्तुष्ट');
        if (main_satisfaction === 'सन्तुष्ट') summary.satisfied++;
        else if (main_satisfaction === 'असन्तुष्ट') summary.unsatisfied++;

        // Satisfaction reasons (checkbox)
        const santushti_positive = getVal(item, 'santushti_positive', 'सन्तुष्टिको कारण');
        if (santushti_positive) {
            if (santushti_positive.includes('समयमै काम भएको')) summary.sat_time++;
            if (santushti_positive.includes('सेवा शुल्क उचित भएको')) summary.sat_fee++;
            if (santushti_positive.includes('सेवा गुणस्तरीय भएको')) summary.sat_quality++;
            if (santushti_positive.includes('प्रक्रिया सहज भएको')) summary.sat_process++;
            if (santushti_positive.includes('कर्मचारीको व्यवहार राम्रो रहेको')) summary.sat_behavior++;
            if (santushti_positive.includes('अन्य')) summary.sat_other++;
        }

        // Dissatisfaction reasons (checkbox)
        const santushti_negative = getVal(item, 'santushti_negative', 'असन्तुष्टिको कारण');
        if (santushti_negative) {
            if (santushti_negative.includes('समयमा काम नभएको')) summary.unsat_time++;
            if (santushti_negative.includes('सेवा शुल्क बढी भएको')) summary.unsat_fee++;
            if (santushti_negative.includes('सेवा गुणस्तरीय नभएको')) summary.unsat_quality++;
            if (santushti_negative.includes('प्रक्रिया झन्झटिलो भएको')) summary.unsat_process++;
            if (santushti_negative.includes('कर्मचारीको व्यवहार राम्रो नरहेको')) summary.unsat_behavior++;
            if (santushti_negative.includes('अतिरिक्त रकम दिनुपरेकोले')) summary.unsat_ghus++;
            if (santushti_negative.includes('अन्य')) summary.unsat_other++;
        }

        // Yojana satisfaction
        const yojana_santushti = getVal(item, 'yojana_santushti', 'योजनाबाट सन्तुष्टि');
        if (yojana_santushti === 'सन्तुष्ट') summary.yojana_sat++;
        else if (yojana_santushti === 'असन्तुष्ट') summary.yojana_unsat++;

        // Yojana dissatisfaction reasons (checkbox)
        const asantushti_karan_yojana = getVal(item, 'asantushti_karan_yojana', 'योजना असन्तुष्टिको कारण');
        if (asantushti_karan_yojana) {
            if (asantushti_karan_yojana.includes('तोकिएको समयमा योजना सम्पन्न नभएकोले')) summary.yojana_unsat_time++;
            if (asantushti_karan_yojana.includes('गुणस्तर कमजोर भएकोले')) summary.yojana_unsat_quality++;
            if (asantushti_karan_yojana.includes('मापदण्ड विपरीत भएकोले')) summary.yojana_unsat_standard++;
            if (asantushti_karan_yojana.includes('अन्य')) summary.yojana_unsat_other++;
        }
    });

    return summary;
}

function calculateAttendanceSummary(filteredData) {
    const summary = { absent_today: 0, absent_prev: 0, no_uniform: 0, not_in_room: 0 };
    filteredData.forEach(item => {
        const processRow = (r) => {
            const cat = getVal(r, 'category', 'विवरण प्रकार');
            if (cat === 'अनुगमन मितिमा अनुपस्थित/ढिला आउने') summary.absent_today++;
            else if (cat === 'अघिल्लो मितिमा अनुपस्थित/ढिला') summary.absent_prev++;
            else if (cat === 'तोकिएको पोशाक नलगाएको') summary.no_uniform++;
            else if (cat === 'हाजिर भई कार्यकक्षमा नभेटिएको') summary.not_in_room++;
        };
        if (item.rows && Array.isArray(item.rows)) item.rows.forEach(processRow);
        else processRow(item);
    });
    return summary;
}

/**
 * स्कोर अनुसार स्थिति वर्गीकरण गर्ने (app.js बाट साभार)
 */
function classifyStatus(score) {
    if (score >= 90) return "उत्कृष्ट";
    if (score >= 75) return "राम्रो";
    if (score >= 60) return "सुधार आवश्यक";
    if (score >= 40) return "गम्भीर समीक्षा र सुधार आवश्यक";
    return "तत्काल हस्तक्षेपको आवश्यकता";
}

/**
 * Gemini AI प्रयोग गरेर स्थिति विश्लेषण गर्ने फङ्सन
 */
async function getAIStatusAnalysis(location, mSummary, sSummary, aSummary) {
    const aiSection = document.getElementById('aiAnalysisSection');
    const aiContent = document.getElementById('aiAnalysisContent');
    if (!aiSection || !aiContent) return;

    aiSection.style.display = "block";
    aiContent.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gemini AI ले डेटा विश्लेषण गर्दैछ, कृपया केही समय पर्खनुहोस्...';

    try {
        // Apps Script (Server-side) लाई डेटा पठाउने
        const payload = {
            action: 'analyze',
            location: location,
            officeMonitoring: mSummary,
            serviceSurvey: sSummary,
            timeDressMonitoring: aSummary
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === 'success') {
            aiContent.textContent = result.analysis;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error("AI Analysis Error:", error);
        aiContent.innerHTML = "❌ AI विश्लेषण गर्दा प्राविधिक समस्या आयो। कृपया फेरि प्रयास गर्नुहोस्।";
    }
}

/**
 * स्थिति सारांश (Status Summary) लाई PDF मा निर्यात गर्ने फङ्सन
 */
async function downloadStatusSummaryPDF() {
    const content = document.getElementById('statusSummaryContent');
    if (!content) return;

    const modal = document.getElementById('statusSummaryModal');
    const title = modal?.querySelector('.modal-title')?.textContent || "Status Summary";
    const aiSection = document.getElementById('aiAnalysisSection');

    // PDF जेनेरेट गर्दा स्टाइलिङका लागि अस्थायी एलिमेन्ट बनाउने
    const element = document.createElement('div');
    element.style.padding = '30px';
    element.style.fontFamily = "'Kalimati', sans-serif";
    
    // हेडर थप्ने
    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '20px';
    header.innerHTML = `
        <h2 style="color: #306a95; margin-bottom: 5px;">${title}</h2>
        <p style="margin: 0; font-size: 1.1rem;">राष्ट्रिय सतर्कता केन्द्र</p>
        <hr style="border: 0; border-top: 2px solid #306a95; margin: 15px 0;">
    `;
    element.appendChild(header);

    // AI Analysis Section थप्ने (यदि यो देखिने अवस्थामा छ भने)
    if (aiSection && aiSection.style.display !== 'none') {
        const aiClone = aiSection.cloneNode(true);
        aiClone.style.display = 'block';
        aiClone.style.marginBottom = '25px';
        aiClone.style.pageBreakInside = 'avoid'; // AI सेक्सनलाई नकाटिने बनाउने
        
        // PDF मा राम्रो देखाउन छाया (box-shadow) हटाउने र स्पष्ट बोर्डर थप्ने
        const aiBox = aiClone.querySelector('div');
        if (aiBox) {
            aiBox.style.boxShadow = 'none';
            aiBox.style.border = '1px solid #cbd5e0';
        }
        element.appendChild(aiClone);
    }

    // कन्टेन्ट थप्ने (क्लोन गरेर)
    const clone = content.cloneNode(true);
    
    // Summary Section हरू नकाटिने गरी मिलाउने
    clone.querySelectorAll('.summary-section').forEach(sec => {
        sec.style.pageBreakInside = 'avoid';
        sec.style.marginBottom = '15px';
        sec.style.display = 'block';
    });

    // Grid layout लाई PDF मा मिलाउन ब्लक बनाउने
    clone.querySelectorAll('.summary-grid').forEach(grid => {
        grid.style.display = 'block';
    });
    clone.querySelectorAll('.summary-item').forEach(item => {
        item.style.padding = '8px 0';
        item.style.borderBottom = '1px solid #eee';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.pageBreakInside = 'avoid'; // प्रत्येक रोलाई नकाटिने बनाउने
    });
    element.appendChild(clone);

    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: title.replace(/\s+/g, '_') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(element).save();
}

function openStatusSummaryModal(showAll = true) {
    const modal = document.getElementById('statusSummaryModal');
    if (!modal) return;

    // Get current filter values
    const pradeshFilter = (document.getElementById("filterPradesh")?.value || "").trim();
    const districtFilter = (document.getElementById("filterDistrict")?.value || "").trim();
    const sthaaniyaFilter = (document.getElementById("filterSthaaniya")?.value || "").trim();
    const officeFilter = (document.getElementById("filterOffice")?.value || "").toLowerCase().trim();

    // छनौट गरिएको फिल्टर (प्रदेश-जिल्ला-स्थानीय तह) अनुसार मोडलको शीर्षक परिवर्तन गर्ने
    const pSel = document.getElementById("filterPradesh");
    const dSel = document.getElementById("filterDistrict");
    const sSel = document.getElementById("filterSthaaniya");
    const pLabel = pSel && pSel.value ? pSel.options[pSel.selectedIndex].text : "";
    const dLabel = dSel && dSel.value ? dSel.options[dSel.selectedIndex].text : "";
    const sLabel = sSel && sSel.value ? sSel.options[sSel.selectedIndex].text : "";

    let titleParts = [];
    if (pLabel) titleParts.push(pLabel);
    if (dLabel && dLabel !== "सबै") titleParts.push(dLabel);
    if (sLabel && sLabel !== "सबै") titleParts.push(sLabel);

    const modalTitleEl = modal.querySelector('.modal-title');
    const locationText = titleParts.length > 0 
        ? titleParts.join(' - ') 
        : "सम्पूर्ण क्षेत्र";

    if (modalTitleEl) {
        const titleText = titleParts.length > 0 
            ? `स्थिति सारांश - ${titleParts.join(' - ')}` 
            : "स्थिति सारांश - सम्पूर्ण क्षेत्र";
            
        let span = modalTitleEl.querySelector('.title-text');
        if (!span) {
            // पहिलो पटक खोल्दा टाइटल स्ट्रक्चर मिलाउने
            modalTitleEl.innerHTML = '';
            span = document.createElement('span');
            span.className = 'title-text';
            modalTitleEl.appendChild(span);
            
            // PDF डाउनलोड बटन थप्ने (टाइटलकै लाइनमा दायाँतर्फ)
            const pdfBtn = document.createElement('button');
            pdfBtn.id = 'downloadSummaryPDF';
            pdfBtn.className = 'tab-btn';
            pdfBtn.style.background = '#e74c3c';
            pdfBtn.style.color = 'white';
            pdfBtn.style.fontSize = '0.85rem';
            pdfBtn.style.padding = '2px 10px';
            pdfBtn.style.border = 'none';
            pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF रिपोर्ट';
            pdfBtn.onclick = downloadStatusSummaryPDF;
            modalTitleEl.appendChild(pdfBtn);
        }
        span.textContent = titleText;
    }

    // Always use raw data arrays and apply filters based on current filter values
    // This ensures consistency: if no filters, show all data; if filters applied, show filtered data
    
    // Filter survey data using getVal for smart field mapping
    let surveyData = allSubmissions.filter(r => {
        const rPradesh = getVal(r, 'pradesh', 'प्रदेश');
        const rJilla = getVal(r, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(r, 'sthaaniya_taha', 'स्थानीय तह');
        const rOffice = getVal(r, 'mukhya_karyalay', 'कार्यालय');
        
        let pradeshMatch = !pradeshFilter;
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            pradeshMatch = (rPradesh == pradeshFilter || rPradesh === provinceName);
        }
        
        const districtMatch = !districtFilter || rJilla === districtFilter;
        const sthaaniyaMatch = !sthaaniyaFilter || rSthaaniya === sthaaniyaFilter;
        const officeMatch = !officeFilter || (rOffice || "").toLowerCase().includes(officeFilter);
        
        return pradeshMatch && districtMatch && sthaaniyaMatch && officeMatch;
    });

    // Filter monitoring data using getVal for smart field mapping
    let monitoringData = allMonitorings.filter(r => {
        const rPradesh = getVal(r, 'pradesh', 'प्रदेश');
        const rJilla = getVal(r, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(r, 'sthaaniya_taha', 'स्थानीय तह');
        const rOffice = getVal(r, 'm_office', 'कार्यालय');
        
        let pradeshMatch = !pradeshFilter;
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            pradeshMatch = (rPradesh == pradeshFilter || rPradesh === provinceName);
        }
        
        const districtMatch = !districtFilter || rJilla === districtFilter;
        const sthaaniyaMatch = !sthaaniyaFilter || rSthaaniya === sthaaniyaFilter;
        const officeMatch = !officeFilter || (rOffice || "").toLowerCase().includes(officeFilter);
        
        return pradeshMatch && districtMatch && sthaaniyaMatch && officeMatch;
    });

    // Filter attendance data using getVal for smart field mapping
    let attendanceData = allAttendanceMonitorings.filter(r => {
        const rPradesh = getVal(r, 'pradesh', 'प्रदेश');
        const rJilla = getVal(r, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(r, 'sthaaniya_taha', 'स्थानीय तह');
        const rOffice = getVal(r, 'office', 'कार्यालय');
        
        let pradeshMatch = !pradeshFilter;
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            pradeshMatch = (rPradesh == pradeshFilter || rPradesh === provinceName);
        }
        
        const districtMatch = !districtFilter || rJilla === districtFilter;
        const sthaaniyaMatch = !sthaaniyaFilter || rSthaaniya === sthaaniyaFilter;
        const officeMatch = !officeFilter || (rOffice || "").toLowerCase().includes(officeFilter);
        
        return pradeshMatch && districtMatch && sthaaniyaMatch && officeMatch;
    });

    // Calculate summaries based on showAll parameter
    let monitoringSummary, surveySummary, attendanceSummary;
    
    if (showAll) {
        // Show all three sections
        monitoringSummary = calculateMonitoringSummary(monitoringData);
        surveySummary = calculateSurveySummary(surveyData);
        attendanceSummary = calculateAttendanceSummary(attendanceData);
    } else {
        // Show only current dashboard section
        if (currentDashboardView === 'survey') {
            monitoringSummary = { total_count: 0, total_staff: 0, vacant_staff: 0, charter_clear: 0, charter_not_clear: 0, charter_difficult: 0, charter_none: 0, process_clear: 0, process_not_mentioned: 0, process_partial: 0, process_none: 0, broker_seen: 0, broker_not_seen: 0, staff_found: 0, staff_not_found: 0, staff_partial: 0, cleaning_good: 0, cleaning_bad: 0, cleaning_ok: 0, helpdesk_yes: 0, helpdesk_no: 0, helpdesk_normal: 0 };
            surveySummary = calculateSurveySummary(surveyData);
            attendanceSummary = { absent_today: 0, absent_prev: 0, no_uniform: 0, not_in_room: 0 };
        } else if (currentDashboardView === 'monitoring') {
            monitoringSummary = calculateMonitoringSummary(monitoringData);
            surveySummary = { charter_info_yes: 0, charter_info_no: 0, work_done_yes: 0, work_done_no: 0, helper_yes: 0, helper_no: 0, ghus_yes: 0, ghus_no: 0, satisfied: 0, unsatisfied: 0, sat_time: 0, sat_fee: 0, sat_quality: 0, sat_process: 0, sat_behavior: 0, sat_other: 0, unsat_time: 0, unsat_fee: 0, unsat_quality: 0, unsat_process: 0, unsat_behavior: 0, unsat_ghus: 0, unsat_other: 0, yojana_sat: 0, yojana_unsat: 0, yojana_unsat_time: 0, yojana_unsat_quality: 0, yojana_unsat_standard: 0, yojana_unsat_other: 0 };
            attendanceSummary = { absent_today: 0, absent_prev: 0, no_uniform: 0, not_in_room: 0 };
        } else if (currentDashboardView === 'attendance') {
            monitoringSummary = { total_count: 0, total_staff: 0, vacant_staff: 0, charter_clear: 0, charter_not_clear: 0, charter_difficult: 0, charter_none: 0, process_clear: 0, process_not_mentioned: 0, process_partial: 0, process_none: 0, broker_seen: 0, broker_not_seen: 0, staff_found: 0, staff_not_found: 0, staff_partial: 0, cleaning_good: 0, cleaning_bad: 0, cleaning_ok: 0, helpdesk_yes: 0, helpdesk_no: 0, helpdesk_normal: 0 };
            surveySummary = { charter_info_yes: 0, charter_info_no: 0, work_done_yes: 0, work_done_no: 0, helper_yes: 0, helper_no: 0, ghus_yes: 0, ghus_no: 0, satisfied: 0, unsatisfied: 0, sat_time: 0, sat_fee: 0, sat_quality: 0, sat_process: 0, sat_behavior: 0, sat_other: 0, unsat_time: 0, unsat_fee: 0, unsat_quality: 0, unsat_process: 0, unsat_behavior: 0, unsat_ghus: 0, unsat_other: 0, yojana_sat: 0, yojana_unsat: 0, yojana_unsat_time: 0, yojana_unsat_quality: 0, yojana_unsat_standard: 0, yojana_unsat_other: 0 };
            attendanceSummary = calculateAttendanceSummary(attendanceData);
        }
    }

    // Show/hide sections based on showAll parameter
    const monitoringSection = document.querySelector('#statusSummaryContent .summary-section:nth-child(1)');
    const surveySection = document.querySelector('#statusSummaryContent .summary-section:nth-child(2)');
    const attendanceSection = document.querySelector('#statusSummaryContent .summary-section:nth-child(3)');

    if (showAll) {
        if (monitoringSection) monitoringSection.style.display = 'block';
        if (surveySection) surveySection.style.display = 'block';
        if (attendanceSection) attendanceSection.style.display = 'block';
    } else {
        if (currentDashboardView === 'survey') {
            if (monitoringSection) monitoringSection.style.display = 'none';
            if (surveySection) surveySection.style.display = 'block';
            if (attendanceSection) attendanceSection.style.display = 'none';
        } else if (currentDashboardView === 'monitoring') {
            if (monitoringSection) monitoringSection.style.display = 'block';
            if (surveySection) surveySection.style.display = 'none';
            if (attendanceSection) attendanceSection.style.display = 'none';
        } else if (currentDashboardView === 'attendance') {
            if (monitoringSection) monitoringSection.style.display = 'none';
            if (surveySection) surveySection.style.display = 'none';
            if (attendanceSection) attendanceSection.style.display = 'block';
        }
    }

    // Update monitoring summary UI
    document.getElementById('m_total_count').textContent = toNepaliDigits(monitoringSummary.total_count);
    document.getElementById('m_total_staff').textContent = toNepaliDigits(monitoringSummary.total_staff);
    document.getElementById('m_vacant_staff').textContent = toNepaliDigits(monitoringSummary.vacant_staff);
    document.getElementById('m_charter_clear').textContent = toNepaliDigits(monitoringSummary.charter_clear);
    document.getElementById('m_charter_not_clear').textContent = toNepaliDigits(monitoringSummary.charter_not_clear);
    document.getElementById('m_charter_difficult').textContent = toNepaliDigits(monitoringSummary.charter_difficult);
    document.getElementById('m_charter_none').textContent = toNepaliDigits(monitoringSummary.charter_none);
    document.getElementById('m_process_clear').textContent = toNepaliDigits(monitoringSummary.process_clear);
    document.getElementById('m_process_not_mentioned').textContent = toNepaliDigits(monitoringSummary.process_not_mentioned);
    document.getElementById('m_process_partial').textContent = toNepaliDigits(monitoringSummary.process_partial);
    document.getElementById('m_process_none').textContent = toNepaliDigits(monitoringSummary.process_none);
    document.getElementById('m_broker_seen').textContent = toNepaliDigits(monitoringSummary.broker_seen);
    document.getElementById('m_broker_not_seen').textContent = toNepaliDigits(monitoringSummary.broker_not_seen);
    document.getElementById('m_staff_found').textContent = toNepaliDigits(monitoringSummary.staff_found);
    document.getElementById('m_staff_not_found').textContent = toNepaliDigits(monitoringSummary.staff_not_found);
    document.getElementById('m_staff_partial').textContent = toNepaliDigits(monitoringSummary.staff_partial);
    document.getElementById('m_cleaning_good').textContent = toNepaliDigits(monitoringSummary.cleaning_good);
    document.getElementById('m_cleaning_bad').textContent = toNepaliDigits(monitoringSummary.cleaning_bad);
    document.getElementById('m_cleaning_ok').textContent = toNepaliDigits(monitoringSummary.cleaning_ok);
    document.getElementById('m_helpdesk_yes').textContent = toNepaliDigits(monitoringSummary.helpdesk_yes);
    document.getElementById('m_helpdesk_no').textContent = toNepaliDigits(monitoringSummary.helpdesk_no);
    document.getElementById('m_helpdesk_normal').textContent = toNepaliDigits(monitoringSummary.helpdesk_normal);

    // Update survey summary UI
    document.getElementById('s_charter_info_yes').textContent = toNepaliDigits(surveySummary.charter_info_yes);
    document.getElementById('s_charter_info_no').textContent = toNepaliDigits(surveySummary.charter_info_no);
    document.getElementById('s_work_done_yes').textContent = toNepaliDigits(surveySummary.work_done_yes);
    document.getElementById('s_work_done_no').textContent = toNepaliDigits(surveySummary.work_done_no);
    document.getElementById('s_helper_yes').textContent = toNepaliDigits(surveySummary.helper_yes);
    document.getElementById('s_helper_no').textContent = toNepaliDigits(surveySummary.helper_no);
    document.getElementById('s_ghus_yes').textContent = toNepaliDigits(surveySummary.ghus_yes);
    document.getElementById('s_ghus_no').textContent = toNepaliDigits(surveySummary.ghus_no);
    document.getElementById('s_satisfied').textContent = toNepaliDigits(surveySummary.satisfied);
    document.getElementById('s_unsatisfied').textContent = toNepaliDigits(surveySummary.unsatisfied);
    document.getElementById('s_sat_time').textContent = toNepaliDigits(surveySummary.sat_time);
    document.getElementById('s_sat_fee').textContent = toNepaliDigits(surveySummary.sat_fee);
    document.getElementById('s_sat_quality').textContent = toNepaliDigits(surveySummary.sat_quality);
    document.getElementById('s_sat_process').textContent = toNepaliDigits(surveySummary.sat_process);
    document.getElementById('s_sat_behavior').textContent = toNepaliDigits(surveySummary.sat_behavior);
    document.getElementById('s_sat_other').textContent = toNepaliDigits(surveySummary.sat_other);
    document.getElementById('s_unsat_time').textContent = toNepaliDigits(surveySummary.unsat_time);
    document.getElementById('s_unsat_fee').textContent = toNepaliDigits(surveySummary.unsat_fee);
    document.getElementById('s_unsat_quality').textContent = toNepaliDigits(surveySummary.unsat_quality);
    document.getElementById('s_unsat_process').textContent = toNepaliDigits(surveySummary.unsat_process);
    document.getElementById('s_unsat_behavior').textContent = toNepaliDigits(surveySummary.unsat_behavior);
    document.getElementById('s_unsat_ghus').textContent = toNepaliDigits(surveySummary.unsat_ghus);
    document.getElementById('s_unsat_other').textContent = toNepaliDigits(surveySummary.unsat_other);
    document.getElementById('s_yojana_sat').textContent = toNepaliDigits(surveySummary.yojana_sat);
    document.getElementById('s_yojana_unsat').textContent = toNepaliDigits(surveySummary.yojana_unsat);
    document.getElementById('s_yojana_unsat_time').textContent = toNepaliDigits(surveySummary.yojana_unsat_time);
    document.getElementById('s_yojana_unsat_quality').textContent = toNepaliDigits(surveySummary.yojana_unsat_quality);
    document.getElementById('s_yojana_unsat_standard').textContent = toNepaliDigits(surveySummary.yojana_unsat_standard);
    document.getElementById('s_yojana_unsat_other').textContent = toNepaliDigits(surveySummary.yojana_unsat_other);

    // Update attendance summary UI
    document.getElementById('a_absent_today').textContent = toNepaliDigits(attendanceSummary.absent_today);
    document.getElementById('a_absent_prev').textContent = toNepaliDigits(attendanceSummary.absent_prev);
    document.getElementById('a_no_uniform').textContent = toNepaliDigits(attendanceSummary.no_uniform);
    document.getElementById('a_not_in_room').textContent = toNepaliDigits(attendanceSummary.not_in_room);

    // Show modal
    modal.style.display = 'flex';

    // AI विश्लेषण सुरु गर्ने
    getAIStatusAnalysis(locationText, monitoringSummary, surveySummary, attendanceSummary);
}

// Function to show only current dashboard data
function openCurrentDashboardSummary() {
    openStatusSummaryModal(false);
}

// Event listeners for status summary modal
document.addEventListener('DOMContentLoaded', function() {
    // Open modal on button click (first button - shows all data)
    const statusSummaryAllBtn = document.getElementById('statusSummaryAllBtn');
    if (statusSummaryAllBtn) {
        statusSummaryAllBtn.addEventListener('click', openStatusSummaryModal);
    }

    // Close modal on close button click
    const closeStatusSummary = document.getElementById('closeStatusSummary');
    if (closeStatusSummary) {
        closeStatusSummary.addEventListener('click', function() {
            const modal = document.getElementById('statusSummaryModal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Close modal on outside click
    const statusSummaryModal = document.getElementById('statusSummaryModal');
    if (statusSummaryModal) {
        statusSummaryModal.addEventListener('click', function(e) {
            if (e.target === statusSummaryModal) {
                statusSummaryModal.style.display = 'none';
            }
        });
    }
});


const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw_4PQ_3JeMGqKuKz3_lYzUXPbvrjlkdwpQDCGIwuRVpF3L8aUpUTE0zppg5ZktEgCr/exec";


let allSubmissions = [];
let allMonitorings = [];
let allAttendanceMonitorings = [];
let currentFilteredMonitorings = [];
let currentFilteredAttendance = [];
let currentDashboardView = 'monitoring';
let consecutiveErrorCount = 0;
let currentFilteredSubmissions = [];
let mapObj = null;
let currentPage = 1;
let itemsPerPage = 10;
let activeTagId = null;
let dismissedAlerts = new Set(JSON.parse(localStorage.getItem("dismissedAlerts_nsc") || "[]"));
let showAllAlertsMode = false;


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
    if (!ctx || !color || typeof color !== 'string') return color;

    const canvas = ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;

    let gradient;
    if (isRadial) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2;
        gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    } else if (isHorizontal) {
        gradient = ctx.createLinearGradient(0, 0, width, 0);
    } else {
        gradient = ctx.createLinearGradient(0, height, 0, 0);
    }

    if (isHover && typeof color === 'string' && color.length === 7) {
        return color + 'dd';
    }
    return color;
    const baseColor = isHover ? color + 'ee' : color;
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(1, color + '44'); // Fade to transparent version

    return gradient;
}


const shadowPlugin = {
    id: 'shadowPlugin',
    beforeDatasetsDraw(chart, args, options) {

        if (!options.enabled) return;
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = options.color || 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = options.blur || 8;
        ctx.shadowColor = options.color || 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = options.blur || 12;
        ctx.shadowOffsetY = options.offsetY || 4;
    },
    afterDatasetsDraw(chart) {
        chart.ctx.restore();
    }
};
Chart.register(shadowPlugin);
Chart.register(ChartDataLabels);


Chart.defaults.plugins.legend.labels.color = '#334155';
Chart.defaults.plugins.legend.labels.font = {
    family: 'Kalimati',
    size: 12,
    weight: '600'
};
Chart.defaults.plugins.legend.labels.usePointStyle = true;


Chart.defaults.scale.grid.color = 'rgba(0, 0, 0, 0.02)';
Chart.defaults.scale.grid.drawTicks = false;
Chart.defaults.scale.border.display = false;

Chart.defaults.elements.bar.borderRadius = 8;
Chart.defaults.elements.line.tension = 0.4;
Chart.defaults.elements.point.radius = 4;
Chart.defaults.elements.point.hoverRadius = 6;


Chart.defaults.transitions = {
    active: { animation: { duration: 400 } },
    resize: { animation: { duration: 400 } }
};


let audioCtx;

function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { });
    }
}

function playClickSound() {
    try {
        initAudio();
        if (!audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        console.log("Audio not supported or blocked");
    }
}

function playHoverSound() {
    try {
        initAudio();
        if (!audioCtx || audioCtx.state !== 'running') return;

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.05);
    } catch (e) {
        console.log("Audio not supported or blocked");
    }
}

let lastHoveredChartElement = null;


Chart.defaults.onHover = function (event, elements, chart) {
    if (elements && elements.length > 0) {
        const currentElement = elements[0].datasetIndex + '-' + elements[0].index;
        if (lastHoveredChartElement !== currentElement) {
            playHoverSound();
            lastHoveredChartElement = currentElement;
        }
    } else {
        lastHoveredChartElement = null;
    }
};


const GLOBAL_DATALABELS_CONFIG = {
    color: '#ffffff',
    font: { family: 'Kalimati', weight: 'bold', size: 11 },
    formatter: (value) => toNepaliDigits(value),

    display: (context) => context.dataset.data[context.dataIndex] > 0,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowBlur: 4,
    anchor: 'center',
    align: 'center'
};


const GLOBAL_CHART_ANIMATION = {
    duration: 1200,
    easing: 'easeOutQuart',
    delay: (context) => {
        let delay = 0;
        if (context.type === 'data' && context.mode === 'default') {
            delay = context.dataIndex * 150;
        }
        return delay;
    }
};


let genderChartObj = null, satisfactionChartObj = null, ghusChartObj = null, devChartObj = null, provinceSurveyChartObj = null, dynamicChartObj = null, topUnsatisfiedChartObj = null, topSatisfiedChartObj = null;
let charterClarityChartObj = null, attendanceChartObj = null, brokerChartObj = null, facilitiesChartObj = null, staffingChartObj = null, vacantByProvinceChartObj = null, provStaffingComparisonChartObj = null;
let vacantPercentPieChartObj = null;

const CHART_THEMES = {

    default: ['#3b82f6', '#14b8a6', '#8b5cf6', '#f97316', '#10b981', '#ec4899', '#06b6d4', '#eab308', '#64748b', '#a855f7'],
    ocean: ['#2563eb', '#0891b2', '#0d9488', '#6366f1', '#7c3aed', '#0284c7', '#06b6d4', '#2dd4bf'],
    modern: ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#22d3ee', '#facc15', '#94a3b8'],
    forest: ['#059669', '#0f766e', '#047857', '#16a34a', '#22c55e', '#10b981', '#34d399', '#6ee7b7'],
    sunset: ['#f97316', '#e11d48', '#d97706', '#ea580c', '#dc2626', '#f59e0b', '#fbbf24', '#fb923c'],
    vibrant: ['#2563eb', '#0d9488', '#7c3aed', '#dc2626', '#d97706', '#059669', '#db2777', '#0284c7', '#9333ea', '#ca8a04']
};
let activeTheme = 'default';


function dampenColor(hex, sReduce = 5, lReduce = 0) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;


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


    s = Math.max(0, s * (1 - sReduce / 100));
    l = l + (1 - l) * (lReduce / 100);


    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);

    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


function getThemeColors(opacity = 0.8) {
    const theme = CHART_THEMES[activeTheme] || CHART_THEMES['default'];
    return theme.map(color => {
        if (opacity === 1) return color;
        return color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
    });
}


let websiteChartObj = null, disclosureChartObj = null, autoInfoChartObj = null, workroomChartObj = null, infoBoardChartObj = null, cleaningChartObj = null;
let attendanceViolationChartObj = null;


const PROVINCE = {
    1: 'कोशी प्रदेश',
    2: 'मधेश प्रदेश',
    3: 'बागमती प्रदेश',
    4: 'गण्डकी प्रदेश',
    5: 'लुम्बिनी प्रदेश',
    6: 'कर्णाली प्रदेश',
    7: 'सुदूरपश्चिम प्रदेश'
};


function getVal(obj, field, label) {
    if (!obj) return "";
    if (obj[field] !== undefined && obj[field] !== null && obj[field] !== "") return obj[field];
    if (obj[label] !== undefined && obj[label] !== null && obj[label] !== "") return obj[label];
    const keys = Object.keys(obj);
    const clean = (s) => String(s || "").replace(/[\s.,0-9०-९?？।()\/\\-]|बारेमा|सम्बन्धमा|सम्बन्धी/g, '').replace(/व/g, 'ब').toLowerCase();
    const cleanLabel = clean(label);
    const cleanField = clean(field);

    let found = keys.find(k => {
        const ck = clean(k);
        if (cleanField && ck.includes(cleanField)) return true;
        if (!cleanLabel) return false;

        if (cleanLabel.length > 8) {
            return ck.includes(cleanLabel.substring(0, 5)) && ck.includes(cleanLabel.substring(cleanLabel.length - 4));
        }
        return ck.includes(cleanLabel) || cleanLabel.includes(ck);
    });

    return found ? obj[found] : "";
}


function countWords(str) {
    return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

const NEPALI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
const BS_MONTHS = ["बैशाख", "जेठ", "असार", "श्रावण", "भाद्र", "आश्विन", "कार्तिक", "मंसिर", "पौष", "माघ", "फाल्गुन", "चैत्र"];
const NEPALI_PICKER_YEAR_RANGE = { start: 2080, end: 2090 };
const NEPALI_CALENDAR = {
    // Days in each month for different years (2080-2090)
    daysInMonth: {
        2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
        2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
        2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
        2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
        2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
        2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
        2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
        2087: [31, 31, 32, 31, 31, 31, 30, 30, 30, 30, 30, 30],
        2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
        2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
        2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]
    }
};


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

function getDaysInNepaliMonth(monthIndex, year) {
    if (year && NEPALI_CALENDAR.daysInMonth[year]) {
        return NEPALI_CALENDAR.daysInMonth[year][monthIndex];
    }
    return 30;
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
    const today = new Date();
    const anchorAD = new Date(2023, 3, 14); // AD 2023-04-14 is BS 2080-01-01
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((new Date(today).setHours(0, 0, 0, 0) - new Date(anchorAD).setHours(0, 0, 0, 0)) / msPerDay);

    let y = 2080;
    let m = 1;
    let d = 1;
    let remaining = diffDays;

    if (remaining >= 0) {
        while (remaining > 0) {
            let daysInThisMonth = getDaysInNepaliMonth(m - 1, y);
            if (remaining >= daysInThisMonth) {
                remaining -= daysInThisMonth;
                m++;
                if (m > 12) {
                    m = 1;
                    y++;
                }
            } else {
                d += remaining;
                remaining = 0;
            }
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
    overlay.id = 'nepaliPickerOverlay';
    overlay.className = 'nepali-picker-overlay';
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
    const days = getDaysInNepaliMonth(selectedMonth, Number(yearSelect.value));
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
        sel.innerHTML = '<option value="">प्रदेश छान्नुहोस्</option>';
        for (const [id, name] of Object.entries(PROVINCE)) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = name;
            sel.appendChild(option);
        }
    });
}


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


// ========== DARK MODE SYSTEM ==========
function initDarkMode() {
    const toggleBtn = document.getElementById('themeToggleBtn');
    const icon = toggleBtn?.querySelector('i');

    // Load saved preference
    const savedTheme = localStorage.getItem('nsc_darkMode');
    if (savedTheme === 'true') {
        document.body.classList.add('dark-mode');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('nsc_darkMode', isDark ? 'true' : 'false');

            if (icon) {
                if (isDark) {
                    icon.classList.remove('fa-moon');
                    icon.classList.add('fa-sun');
                } else {
                    icon.classList.remove('fa-sun');
                    icon.classList.add('fa-moon');
                }
            }

            // Play click sound
            playClickSound();

            // Refresh charts to match theme
            if (typeof refreshDashboard === 'function') {
                refreshDashboard();
            }
        });
    }
}

// ========== ANIMATED COUNTERS ==========
function animateCounter(el, target, suffix = '') {
    if (!el) return;
    const duration = 1500;
    const start = performance.now();
    const startVal = 0;
    const nepaliTarget = toNepaliDigits(target);

    function update(currentTime) {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * target);
        el.textContent = toNepaliDigits(current) + suffix;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = nepaliTarget + suffix;
        }
    }

    requestAnimationFrame(update);
}

// ========== SMOOTH TAB TRANSITIONS ==========
function initSmoothTabTransitions() {
    const tabBtns = document.querySelectorAll('.nav-btn[data-tab]');
    const panels = {
        'dashboard-tab': document.getElementById('dashboard-tab'),
        'form-tab': document.getElementById('form-tab'),
        'monitoring-tab': document.getElementById('monitoring-tab'),
        'attendance-tab': document.getElementById('attendance-tab')
    };

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function (e) {
            const tabId = this.dataset.tab;
            const targetPanel = panels[tabId];
            if (!targetPanel) return;

            // Hide all panels with slide-out animation
            Object.values(panels).forEach(panel => {
                if (panel && panel !== targetPanel && panel.classList.contains('active-panel')) {
                    panel.style.animation = 'tabExit 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
                    setTimeout(() => {
                        panel.classList.remove('active-panel');
                        panel.style.animation = '';
                    }, 300);
                }
            });

            // Show target panel with slide-in animation
            setTimeout(() => {
                targetPanel.classList.add('active-panel');
                targetPanel.style.animation = 'tabEnter 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
                setTimeout(() => {
                    targetPanel.style.animation = '';
                }, 400);
            }, 200);

            // Switch dashboard view if dashboard tab
            if (tabId === 'dashboard-tab' && typeof switchDashboardView === 'function') {
                setTimeout(() => switchDashboardView(currentDashboardView), 300);
            }
        });
    });
}

// ========== TOAST NOTIFICATION SYSTEM ==========
function showToast(message, type = 'info', duration = 3000) {
    const existingToast = document.getElementById('nscToast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'nscToast';

    const config = {
        success: { icon: 'fas fa-check-circle', bg: 'linear-gradient(135deg,#10b981,#059669)' },
        error: { icon: 'fas fa-exclamation-circle', bg: 'linear-gradient(135deg,#ef4444,#dc2626)' },
        warning: { icon: 'fas fa-exclamation-triangle', bg: 'linear-gradient(135deg,#f59e0b,#d97706)' },
        info: { icon: 'fas fa-info-circle', bg: 'linear-gradient(135deg,#3b82f6,#2563eb)' }
    };

    const c = config[type] || config.info;

    toast.innerHTML = `<i class="${c.icon}"></i><span>${message}</span>`;
    toast.style.cssText = `
        position:fixed;top:16px;right:16px;z-index:100010;display:flex;align-items:center;gap:10px;
        padding:12px 20px;border-radius:12px;background:${c.bg};color:white;
        font-family:'Kalimati',sans-serif;font-size:0.85rem;font-weight:600;
        box-shadow:0 8px 32px rgba(0,0,0,0.15);transform:translateX(120%);
        opacity:0;transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);
        max-width:360px; pointer-events:auto;
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });

    // Auto remove with slide-out
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ========== DEBOUNCE UTILITY ==========
function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========== FORM AUTO-SAVE DRAFT ==========
function saveFormDraft(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const formData = new FormData(form);
    const data = {};
    for (let [key, val] of formData.entries()) {
        if (data[key]) {
            if (!Array.isArray(data[key])) data[key] = [data[key]];
            data[key].push(val);
        } else data[key] = val;
    }
    // Also capture radio/checkbox states
    form.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
        if (el.checked) data[el.name] = el.value;
    });
    try {
        localStorage.setItem(`nsc_draft_${formId}`, JSON.stringify(data));
    } catch (e) { /* localStorage full */ }
}

function restoreFormDraft(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    try {
        const saved = localStorage.getItem(`nsc_draft_${formId}`);
        if (!saved) return;
        const data = JSON.parse(saved);
        Object.entries(data).forEach(([key, val]) => {
            const els = form.querySelectorAll(`[name="${key}"]`);
            els.forEach(el => {
                if (el.type === 'radio' || el.type === 'checkbox') {
                    if (Array.isArray(val)) {
                        el.checked = val.includes(el.value);
                    } else {
                        el.checked = el.value === val;
                    }
                } else {
                    if (Array.isArray(val)) {
                        el.value = val.join(', ');
                    } else {
                        el.value = val;
                    }
                }
            });
        });
        showToast('📋 पहिलेको ड्राफ्ट रि-स्टोर गरियो', 'info', 2000);
    } catch (e) { /* ignore */ }
}

// Clear form draft on successful submit
function clearFormDraft(formId) {
    localStorage.removeItem(`nsc_draft_${formId}`);
}

// ========== LOADING SKELETON ==========
function showDashboardSkeleton() {
    const statContainer = document.getElementById('statCardsContainer');
    const chartRow = document.getElementById('surveyChartsRow');
    if (!statContainer) return;

    statContainer.classList.add('skeleton-loading');
    if (chartRow) chartRow.classList.add('skeleton-loading');

    // Create skeleton placeholder cards
    statContainer.innerHTML = Array(4).fill('').map(() => `
        <div class="stat-card" style="min-height: 100px;"></div>
    `).join('');
}

function hideDashboardSkeleton() {
    const statContainer = document.getElementById('statCardsContainer');
    const chartRow = document.getElementById('surveyChartsRow');
    if (statContainer) statContainer.classList.remove('skeleton-loading');
    if (chartRow) chartRow.classList.remove('skeleton-loading');
}

document.addEventListener("DOMContentLoaded", function () {
    // Initialize dark mode
    initDarkMode();

    // Initialize smooth tab transitions
    initSmoothTabTransitions();

    let lastHoveredStatCard = null;
    document.body.addEventListener('mouseover', function (e) {
        const card = e.target.closest('.stat-card');
        if (card) {
            if (lastHoveredStatCard !== card) {
                playHoverSound();
                lastHoveredStatCard = card;
            }
        } else {
            lastHoveredStatCard = null;
        }
    });


    const dashboardSpacingStyle = document.createElement('style');
    dashboardSpacingStyle.textContent = `
        #dashboard-tab {
            padding-top: 0.5rem !important;
            padding-bottom: 0.5rem !important;
            margin-top: 0.25rem !important;
            margin-bottom: 0.25rem !important;
        }
    `;
    document.head.appendChild(dashboardSpacingStyle);

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


    document.getElementById("m_pradesh")?.addEventListener("change", () => updateDistricts("m_pradesh", "m_jilla", "m_sthaaniya"));
    document.getElementById("m_jilla")?.addEventListener("change", () => updateMunicipalities("m_pradesh", "m_jilla", "m_sthaaniya"));
    document.getElementById("a_pradesh")?.addEventListener("change", () => updateDistricts("a_pradesh", "a_jilla", "a_sthaaniya"));
    document.getElementById("a_jilla")?.addEventListener("change", () => updateMunicipalities("a_pradesh", "a_jilla", "a_sthaaniya"));


    addAttendanceRow();


    document.getElementById("dynamicFieldSelector")?.addEventListener("change", refreshDashboard);


    document.getElementById("toggleMonitoringFilters")?.addEventListener("click", function () {
        const container = document.getElementById("monitoringExtraFilters");
        if (container.style.display === "none" || container.style.display === "") {
            container.style.display = "block";
            this.textContent = "✖ फिल्टरहरू लुकाउनुहोस्";
        } else {
            container.style.display = "none";
            this.textContent = "🔍 थप अनुगमन फिल्टरहरू";
        }
    });

    document.getElementById("themeSelector")?.addEventListener("change", function () {
        activeTheme = this.value;
        refreshDashboard();
    });

    const filterToggleHeader = document.getElementById("filterToggleHeader");
    const mainFilterBar = document.getElementById("mainFilterBar");
    const filterArrow = document.getElementById("filterArrow");
    filterToggleHeader?.addEventListener("click", function () {
        mainFilterBar?.classList.toggle("collapsed");
        filterArrow?.classList.toggle("arrow-rotated");
    });
    document.getElementById("monitoringFieldSelector")?.addEventListener("change", refreshDashboard);

    // Debounced filter inputs for performance
    const debouncedRefresh = debounce(function () {
        currentPage = 1;
        refreshDashboard();
    }, 250);

    document.getElementById("filterPradesh")?.addEventListener("change", () => {
        updateFilterDistricts();
        currentPage = 1;
        refreshDashboard();
    });
    document.getElementById("filterDistrict")?.addEventListener("change", () => {
        updateFilterMunicipalities();
        currentPage = 1;
        refreshDashboard();
    });
    document.getElementById("filterSthaaniya")?.addEventListener("change", () => {
        currentPage = 1;
        refreshDashboard();
    });
    document.getElementById("filterOffice")?.addEventListener("input", debouncedRefresh);
    document.getElementById("filterGender")?.addEventListener("change", debouncedRefresh);
    document.getElementById("filterDateFrom")?.addEventListener("change", debouncedRefresh);
    document.getElementById("filterDateTo")?.addEventListener("change", debouncedRefresh);
    document.getElementById("filterEmpName")?.addEventListener("input", debouncedRefresh);
    document.getElementById("filterEmpSymbol")?.addEventListener("input", debouncedRefresh);
    document.getElementById("filterCategory")?.addEventListener("change", debouncedRefresh);
    document.getElementById("pageSizeSelect")?.addEventListener("change", function () {
        itemsPerPage = parseInt(this.value);
        currentPage = 1;
        refreshDashboard();
    });
    const nepaliFields = document.querySelectorAll('.nepali-datepicker');
    nepaliFields.forEach(field => {
        field.addEventListener('focus', () => showNepaliDatePicker(field));
        field.addEventListener('click', () => showNepaliDatePicker(field));
    });
    const scrollTopBtn = document.getElementById("scrollTopBtn");

    // ========== SCROLL PROGRESS BAR ==========
    const progressBar = document.createElement('div');
    progressBar.id = 'scrollProgressBar';
    progressBar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#3b82f6,#14b8a6);z-index:100000;width:0%;transition:width 0.1s linear;';
    document.body.appendChild(progressBar);

    const mainScrollArea = document.getElementById("main-scroll-area");

    mainScrollArea?.addEventListener("scroll", () => {
        const winScroll = mainScrollArea.scrollTop;
        const height = mainScrollArea.scrollHeight - mainScrollArea.clientHeight;
        const scrolled = (winScroll / height) * 100;
        progressBar.style.width = scrolled + '%';

        if (mainScrollArea.scrollTop > 400) {
            scrollTopBtn.style.display = "flex";
        } else {
            scrollTopBtn.style.display = "none";
        }
    });

    scrollTopBtn?.addEventListener("click", () => {
        if (navigator.vibrate) {
            navigator.vibrate(40);
        }
        playClickSound();

        if (mainScrollArea) mainScrollArea.scrollTop = 0;
    });

    // ========== FLOATING QUICK ACTIONS ==========
    const fabContainer = document.createElement('div');
    fabContainer.id = 'fabContainer';
    fabContainer.innerHTML = `
        <div id="fabMain" class="fab-main-btn" title="द्रुत कार्य">
            <i class="fas fa-plus"></i>
        </div>
        <div class="fab-actions" id="fabActions">
            <button class="fab-action-btn" data-action="survey" title="सर्वेक्षण फारम">
                <i class="fas fa-poll-h"></i>
                <span class="fab-label">सर्वेक्षण</span>
            </button>
            <button class="fab-action-btn" data-action="monitoring" title="अनुगमन फारम">
                <i class="fas fa-clipboard-check"></i>
                <span class="fab-label">अनुगमन</span>
            </button>
            <button class="fab-action-btn" data-action="attendance" title="समय पालना फारम">
                <i class="fas fa-user-clock"></i>
                <span class="fab-label">पोशाक</span>
            </button>
            <button class="fab-action-btn" data-action="dashboard" title="ड्यासबोर्ड">
                <i class="fas fa-chart-pie"></i>
                <span class="fab-label">ड्यासबोर्ड</span>
            </button>
            <button class="fab-action-btn" data-action="top" title="माथि जानुहोस्">
                <i class="fas fa-arrow-up"></i>
                <span class="fab-label">माथि</span>
            </button>
        </div>
    `;
    document.body.appendChild(fabContainer);

    // FAB styles
    const fabStyle = document.createElement('style');
    fabStyle.textContent = `
        #fabContainer { position:fixed; bottom:90px; right:20px; z-index:9999; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
        .fab-main-btn { width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg,#3b82f6,#1d4ed8); color:white; border:none; cursor:pointer; box-shadow:0 4px 16px rgba(59,130,246,0.4); display:flex; align-items:center; justify-content:center; font-size:1.3rem; transition:all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .fab-main-btn:hover { transform:scale(1.1) rotate(90deg); box-shadow:0 6px 20px rgba(59,130,246,0.6); }
        .fab-main-btn.active { transform:rotate(45deg); background:linear-gradient(135deg,#ef4444,#dc2626); }
        .fab-actions { display:none; flex-direction:column; gap:6px; align-items:flex-end; }
        .fab-actions.show { display:flex; animation:fabSlideIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .fab-action-btn { display:flex; align-items:center; gap:8px; background:white; border:none; border-radius:24px; padding:8px 16px; cursor:pointer; box-shadow:0 2px 12px rgba(0,0,0,0.12); transition:all 0.2s ease; font-family:'Kalimati',sans-serif; font-size:0.78rem; color:#1e293b; font-weight:600; }
        .fab-action-btn:hover { transform:translateX(-6px) scale(1.05); box-shadow:0 4px 16px rgba(0,0,0,0.18); }
        .fab-action-btn i { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:0.8rem; }
        .fab-action-btn[data-action="survey"] i { background:linear-gradient(135deg,#3b82f6,#1d4ed8); }
        .fab-action-btn[data-action="monitoring"] i { background:linear-gradient(135deg,#14b8a6,#0d9488); }
        .fab-action-btn[data-action="attendance"] i { background:linear-gradient(135deg,#8b5cf6,#6d28d9); }
        .fab-action-btn[data-action="dashboard"] i { background:linear-gradient(135deg,#f97316,#ea580c); }
        .fab-action-btn[data-action="top"] i { background:linear-gradient(135deg,#64748b,#475569); }
        .fab-label { white-space:nowrap; }
        @keyframes fabSlideIn { from { opacity:0; transform:translateY(10px) scale(0.8); } to { opacity:1; transform:translateY(0) scale(1); } }
        .dark-mode .fab-action-btn { background:#1e293b; color:#e2e8f0; }
        @media (max-width:768px) { .fab-action-btn .fab-label { display:none; } .fab-action-btn { padding:8px 12px; } }
    `;
    document.head.appendChild(fabStyle);

    // FAB toggle logic
    const fabMain = document.getElementById('fabMain');
    const fabActions = document.getElementById('fabActions');
    fabMain?.addEventListener('click', function () {
        this.classList.toggle('active');
        fabActions.classList.toggle('show');
        playClickSound();
    });

    // FAB action handlers
    document.querySelectorAll('.fab-action-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const action = this.dataset.action;

            if (action === 'top') {
                if (mainScrollArea) mainScrollArea.scrollTop = 0;
            } else if (action === 'dashboard') {
                const dashboardBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
                if (dashboardBtn) dashboardBtn.click();
            } else if (action === 'survey') {
                const surveyBtn = document.querySelector('.nav-btn[data-tab="form-tab"]');
                if (surveyBtn) surveyBtn.click();
            } else if (action === 'monitoring') {
                const monitorBtn = document.querySelector('.nav-btn[data-tab="monitoring-tab"]');
                if (monitorBtn) monitorBtn.click();
            } else if (action === 'attendance') {
                const attendBtn = document.querySelector('.nav-btn[data-tab="attendance-tab"]');
                if (attendBtn) attendBtn.click();
            }

            fabMain.classList.remove('active');
            fabActions.classList.remove('show');
            playClickSound();
        });
    });

    setTodayNepaliDate();
    const satisfactionInputs = document.querySelectorAll('[name="main_satisfaction"]');
    satisfactionInputs.forEach(input => {
        input.addEventListener("change", updateSatisfactionVisibility);
    });
    updateSatisfactionVisibility();
    document.getElementById("pos_other_cb")?.addEventListener("change", function () { toggleOtherReason("pos_other_cb", "pos_other_text"); });
    document.getElementById("neg_other_cb")?.addEventListener("change", function () { toggleOtherReason("neg_other_cb", "neg_other_text"); });
    document.getElementById("yojana_other_cb")?.addEventListener("change", function () { toggleOtherReason("yojana_other_cb", "yojana_other_text"); });


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


    document.querySelectorAll('.chart-type-cycle-btn').forEach(button => {
        button.addEventListener('click', function () {
            const chartId = this.dataset.chartId;
            const currentType = chartTypes[chartId];
            const cycle = CHART_TYPE_CYCLES[chartId];
            const currentIndex = cycle.indexOf(currentType);
            const nextIndex = (currentIndex + 1) % cycle.length;
            chartTypes[chartId] = cycle[nextIndex];
            refreshDashboard();
        });
    });
});


let chartTypes = {
    genderChart: 'bar',
    satisfactionChart: 'doughnut',
    ghusChart: 'pie',
    developmentChart: 'bar',
    topUnsatisfiedChart: 'bar',
    topSatisfiedChart: 'bar',
    provinceSurveyChart: 'pie',
    dynamicChart: 'bar',
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


const CHART_TYPE_CYCLES = {
    genderChart: ['bar', 'pie', 'doughnut'],
    satisfactionChart: ['doughnut', 'pie', 'bar'],
    ghusChart: ['pie', 'doughnut', 'bar'],
    developmentChart: ['bar', 'pie', 'doughnut'],
    topUnsatisfiedChart: ['bar', 'pie', 'doughnut'],
    topSatisfiedChart: ['bar', 'pie', 'doughnut'],
    provinceSurveyChart: ['pie', 'doughnut', 'bar'],
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
    counterEl.style.color = count > limit ? "#de3053" : "#666";
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
            txt.dispatchEvent(new Event('input'));
        }
    }
}

function renderTopUnsatisfiedOffices(data) {
    const row = document.getElementById("topOfficesRow");
    const container = document.getElementById("topUnsatisfiedContainer");
    const list = document.getElementById("topUnsatisfiedList");
    if (!container || !list) return;

    if (topUnsatisfiedChartObj) topUnsatisfiedChartObj.destroy();


    const unsatisfiedData = data.filter(d => d.satisfaction_flag === "असन्तुष्ट" && d.mukhya_karyalay);

    if (unsatisfiedData.length === 0) {
        container.style.display = "none";
        checkTopRowVisibility();
        return;
    }


    const officeCounts = {};
    unsatisfiedData.forEach(d => {
        const office = d.mukhya_karyalay.trim();
        officeCounts[office] = (officeCounts[office] || 0) + 1;
    });


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

    loadLocalDataFallback();
    const storedMonitoring = localStorage.getItem("monitoringData_nsc");
    if (storedMonitoring) allMonitorings = JSON.parse(storedMonitoring);
    const storedAttendance = localStorage.getItem("attendanceData_nsc");
    if (storedAttendance) allAttendanceMonitorings = JSON.parse(storedAttendance);


    switchDashboardView(currentDashboardView);

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा अपडेट हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }


    function updateOnlineStatus() {
        const badge = document.getElementById('offlineBadge');
        if (navigator.onLine) {
            if (badge) badge.style.display = 'none';

            syncPendingData();
            return true;
        } else {
            if (badge) badge.style.display = 'inline-block';
            return false;
        }
    }


    const isOnline = updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);


    const slowLoadTimeout = setTimeout(() => {
        if (loadingOverlay && loadingOverlay.style.display === "flex" && loadingText) {
            loadingText.innerHTML = `
                नेटवर्क ढिलो भएकोले डाटा लोड हुन समय लागिरहेको छ।<br>
                <button onclick="location.reload()" style="margin-top:15px; padding:10px 20px; background:#387ae6; color:white; border:none; border-radius:10px; cursor:pointer; font-family:'Kalimati'; box-shadow: 0 4px 10px rgba(56, 122, 230, 0.3);">🔄 पुनः लोड गर्नुहोस्</button>
            `;
        }
    }, 10000);


    if (isOnline && SCRIPT_URL && SCRIPT_URL.trim() !== "") {
        try {
            const response = await fetch(SCRIPT_URL);
            if (response.ok) {
                const result = await response.json();
                if (result.survey) {
                    allSubmissions = result.survey;
                    allSubmissions.reverse();
                    localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions));
                }
                if (result.monitoring) {
                    allMonitorings = result.monitoring.map(r => {
                        // Map Google Sheet columns to JavaScript field names
                        if (r.monitor_name && !r.m_monitor_name) {
                            r.m_monitor_name = r.monitor_name;
                        }
                        if (r.monitor_rank && !r.m_monitor_designation) {
                            r.m_monitor_designation = r.monitor_rank;
                        }
                        return r;
                    });
                    allMonitorings.reverse();
                    localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));
                }
                if (result.attendance) {
                    allAttendanceMonitorings = result.attendance;
                    allAttendanceMonitorings.reverse();
                    localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));
                }

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
    localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions));
}

function addSubmission(data) {
    allSubmissions.unshift(data);
    saveLocalData();
}

document.getElementById("submitSurvey").addEventListener("click", async function () {
    const form = document.getElementById("surveyForm");


    form.classList.add('was-validated');


    if (!form.checkValidity()) {
        form.reportValidity();
        playErrorSound("विवरण अधुरो छ, कृपया रातो चिन्ह लागेका क्षेत्रहरू भर्नुहोस्।");
        return;
    }


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


    const yojanaOtherCb = document.querySelector('input[name="asantushti_karan_yojana"][value="अन्य (लेख्नुहोस्)"]');
    const yojanaOtherTxt = document.querySelector('input[name="asantushti_karan_other"]');
    if (yojanaOtherCb?.checked && !yojanaOtherTxt?.value.trim()) {
        Swal.fire({ icon: 'warning', title: 'थप विवरण आवश्यक', text: 'कृपया योजना असन्तुष्टिको "अन्य" कारण लेख्नुहोस्।', confirmButtonColor: '#387ae6' });
        playErrorSound();
        yojanaOtherTxt.focus();
        return;
    }


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

    if ((!surveyDate || surveyDate === "" || surveyDate === "YYYY-MM-DD") && typeof NepaliFunctions !== 'undefined') {
        const today = NepaliFunctions.GetCurrentBsDate();
        surveyDate = today.year + "-" + NepaliFunctions.Get2DigitNo(today.month) + "-" + NepaliFunctions.Get2DigitNo(today.day);
    }


    payload.survey_date = getFormattedNepaliDate(surveyDate);
    // Use original timestamp if editing, otherwise create new one
    if (window.editingRecord && window.editingRecord.type === 'survey') {
        payload.editTimestamp = window.editingRecord.timestamp;
        payload.timestamp = window.editingRecord.timestamp;
    } else {
        payload.timestamp = new Date().toISOString();
    }
    // Keep original timestamp when editing (don't overwrite)
    if (payload.editTimestamp) {
        payload.timestamp = payload.editTimestamp;
    }
    payload.pradesh = PROVINCE[payload.pradesh] || "";
    payload.jilla = payload.jilla || "";
    payload.sthaaniya_taha = payload.sthaaniya_taha || "";
    payload.mukhya_karyalay = payload.mukhya_karyalay || "";
    payload.gender = payload.gender || "";
    payload.ghus_parera = payload.ghus_parera || "";
    payload.sahayog_parera = payload.sahayog_parera || "";


    const mergeOther = (mainField, otherField, searchVal) => {
        if (payload[mainField]) {
            let vals = Array.isArray(payload[mainField]) ? payload[mainField] : [payload[mainField]];
            if (vals.includes(searchVal) && payload[otherField]) {
                vals = vals.map(v => v === searchVal ? `${searchVal}: ${payload[otherField]}` : v);
            }
            payload[mainField] = vals;
        }
        delete payload[otherField];
    };

    mergeOther('santushti_positive', 'santushti_positive_other_val', 'अन्य');
    mergeOther('santushti_negative', 'santushti_negative_other_val', 'अन्य');
    mergeOther('asantushti_karan_yojana', 'asantushti_karan_other', 'अन्य (लेख्नुहोस्)');


    Object.keys(payload).forEach(key => {
        if (Array.isArray(payload[key])) {
            payload[key] = payload[key].join(", ");
        }
    });


    const hasPos = (payload.santushti_positive && payload.santushti_positive.length > 0) || payload.main_satisfaction === "सन्तुष्ट";
    const hasNeg = (payload.santushti_negative && payload.santushti_negative.length > 0) || payload.main_satisfaction === "असन्तुष्ट";

    let sFlag = "अज्ञात";
    if (hasPos && !hasNeg) sFlag = "सन्तुष्ट";
    else if (hasNeg && !hasPos) sFlag = "असन्तुष्ट";
    else if (hasPos && hasNeg) sFlag = "मिश्रित";

    payload.satisfaction_flag = sFlag;
    payload.bikas_janakari = payload.bikas_janakari || "";

    // Update local state when editing instead of adding new
    if (payload.editTimestamp) {
        const idx = allSubmissions.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));
        if (idx !== -1) {
            allSubmissions[idx] = payload;
        } else {
            allSubmissions.unshift(payload);
        }
        saveLocalData();
    } else {
        addSubmission(payload);
    }

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा सुरक्षित हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }

    if (SCRIPT_URL && SCRIPT_URL.trim() !== "") {
        try {
            // Clear edit state before sending to prevent stale data
            await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
            if (loadingOverlay) loadingOverlay.style.display = "none";
            document.getElementById("formStatus").innerHTML = "✅ गुगल सिट तथा स्थानीय भण्डारणमा सेभ भयो!";

            // Clear editing state
            if (payload.editTimestamp) {
                window.editingRecord = null;
                document.getElementById("submitSurvey").innerHTML = 'पेश गर्नुहोस्';
            }

            loadData();
        } catch (e) {
            if (loadingOverlay) loadingOverlay.style.display = "none";
            console.warn(e);
            playErrorSound("गुगल सिटमा कनेक्ट हुन सकेन।");
            addToPendingSync(payload);
            document.getElementById("formStatus").innerHTML = "⚠️ गुगल सिटमा सेभ गर्न समस्या भयो। स्थानीय भण्डारणमा सेभ गरिएको छ।";
        }
    } else {
        if (loadingOverlay) loadingOverlay.style.display = "none";
        addToPendingSync(payload);
        document.getElementById("formStatus").innerHTML = "✅ डाटा स्थानीय भण्डारणमा सेभ भयो।<br>⚠️ गुगल सिट जोड्नको लागि SCRIPT_URL कन्फिगर गर्नुहोस्।";
    }
    form.reset();

    form.classList.remove('was-validated');
    setTodayNepaliDate();
    updateSatisfactionVisibility();
    playSuccessSound();

    Swal.fire({
        title: 'सफल!',
        text: 'सर्वेक्षण सफलतापूर्वक सुरक्षित भयो। सहयोगको लागि धन्यवाद!',
        icon: 'success',
        confirmButtonText: 'ठीक छ',
        confirmButtonColor: '#387ae6'
    });


    setTimeout(() => {
        const dashboardBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
        if (dashboardBtn) {
            dashboardBtn.click();
        }
    }, 2000);

    setTimeout(() => document.getElementById("formStatus").innerHTML = "", 3500);
});


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


document.getElementById("submitMonitoring")?.addEventListener("click", async function () {
    const form = document.getElementById("monitoringForm");
    if (!form.checkValidity()) {
        form.reportValidity();
        playErrorSound();
        return;
    }


    const wordLimits = [
        { id: "m_office", limit: 20, name: "कार्यालयको नाम" },
        { id: "m_monitor_name", limit: 50, name: "अनुगमनकर्ताको नाम" },
        { id: "m_monitor_designation", limit: 30, name: "अनुगमनकर्ताको पद" },
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

    // Use original timestamp if editing
    if (window.editingRecord && window.editingRecord.type === 'monitoring') {
        payload.editTimestamp = window.editingRecord.timestamp;
        payload.timestamp = window.editingRecord.timestamp;
    }

    payload.m_pradesh = PROVINCE[payload.m_pradesh] || payload.m_pradesh;

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = loadingOverlay?.querySelector(".loading-text");
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = "डाटा सुरक्षित हुँदैछ, कृपया केही समय पर्खनुहोस्...";
        loadingOverlay.style.display = "flex";
    }

    try {

        if (payload.editTimestamp) {
            const idx = allMonitorings.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));
            if (idx !== -1) {
                allMonitorings[idx] = payload;
            } else {
                allMonitorings.unshift(payload);
            }
        } else {
            allMonitorings.unshift(payload);
        }
        localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));

        if (SCRIPT_URL) {
            try {
                await fetch(SCRIPT_URL, { method: "POST", mode: 'no-cors', body: JSON.stringify(payload) });
            } catch (err) {
                addToPendingSync(payload);
                throw err;
            }
        }

        if (payload.editTimestamp) {
            window.editingRecord = null;
            document.getElementById("submitMonitoring").innerHTML = 'पेश गर्नुहोस्';
        }

        playSuccessSound();
        Swal.fire({ icon: 'success', title: 'सफल!', text: 'कार्यालय अनुगमन फारम सुरक्षित भयो।', confirmButtonColor: '#387ae6' });
        form.reset();


        setTimeout(() => {
            const dashboardBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
            if (dashboardBtn) {
                dashboardBtn.click();
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

document.getElementById("submitAttendance")?.addEventListener("click", async function () {
    const form = document.getElementById("attendanceForm");


    form.classList.add('was-validated');

    if (!form.checkValidity()) {
        form.reportValidity();
        playErrorSound("विवरण अधुरो छ, कृपया रातो चिन्ह लागेका क्षेत्रहरू भर्नुहोस्।");
        return;
    }

    const formData = new FormData(form);


    const mandatoryFields = ["a_pradesh", "a_jilla", "a_sthaaniya", "a_office", "a_date", "a_total_staff", "a_working_staff", "a_vacant_staff"];
    for (let fieldId of mandatoryFields) {
        const val = formData.get(fieldId);
        if (!val || val.toString().trim() === "") {
            Swal.fire({ icon: 'warning', title: 'अधुरो विवरण', text: 'कृपया सबै अनिवार्य फिल्डहरू भर्नुहोस्।', confirmButtonColor: '#387ae6' });
            playErrorSound("अनिवार्य विवरणहरू भर्न बाँकी छ।");
            return;
        }
    }


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
        timestamp: new Date().toISOString(),
        mainRecordId: new Date().getTime().toString(),
        rows: []
    };

    // Use original timestamp if editing
    if (window.editingRecord && window.editingRecord.type === 'attendance') {
        payload.editTimestamp = window.editingRecord.timestamp;
        payload.timestamp = window.editingRecord.timestamp;
    }


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


    const categories = formData.getAll("emp_category[]");
    const ranks = formData.getAll("emp_rank[]");
    const symbols = formData.getAll("emp_symbol[]");
    const names = formData.getAll("emp_name[]");
    const extras = formData.getAll("emp_extra[]");

    let hasValidRow = false;
    for (let i = 0; i < names.length; i++) {
        if (names[i].trim() !== "" || symbols[i].trim() !== "") {
            hasValidRow = true;
            payload.rows.push({
                category: categories[i],
                rank: ranks[i],
                symbol: symbols[i],
                name: names[i],
                extra: extras[i],
                mainRecordId: payload.mainRecordId
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
        if (payload.editTimestamp) {
            const idx = allAttendanceMonitorings.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));
            if (idx !== -1) {
                allAttendanceMonitorings[idx] = payload;
            } else {
                allAttendanceMonitorings.unshift(payload);
            }
        } else {
            allAttendanceMonitorings.unshift(payload);
        }
        localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));

        if (SCRIPT_URL) {
            try {
                await fetch(SCRIPT_URL, { method: "POST", mode: 'no-cors', body: JSON.stringify(payload) });
            } catch (err) {
                addToPendingSync(payload);
                throw err;
            }
        }
        if (payload.editTimestamp) {
            window.editingRecord = null;
            document.getElementById("submitAttendance").innerHTML = 'पेश गर्नुहोस्';
        }

        playSuccessSound();
        Swal.fire({ icon: 'success', title: 'सफल!', text: 'समय पालना र पोशाक अनुगमन विवरण सुरक्षित भयो।' });
        form.reset();


        setTimeout(() => {
            const dashboardBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
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
            remaining.push(item);
        }
    }

    localStorage.setItem("nsc_pending_sync", JSON.stringify(remaining));

    if (syncIndicator) {
        if (remaining.length === 0) {
            syncIndicator.classList.remove('error');
            syncIndicator.innerHTML = "✅ डेटा सिङ्क सफल भयो!";
            setTimeout(() => {
                syncIndicator.classList.remove('active');
                setTimeout(() => { syncIndicator.innerHTML = "🔄 डेटा सिङ्क हुँदैछ..."; }, 400);
            }, 1500);
            console.log("All pending data synced successfully.");
        } else {
            playErrorSound(`सिङ्क असफल: ${toNepaliDigits(remaining.length)} वटा रेकर्ड बाँकी छन्`);
        }
    }
}


function refreshDashboard() {
    if (currentDashboardView === 'monitoring') {
        refreshMonitoringDashboard();
        return;
    }
    if (currentDashboardView === 'attendance') {
        refreshAttendanceDashboard();
        return;
    }

    const pradeshFilter = document.getElementById("filterPradesh")?.value || "";
    const districtFilter = document.getElementById("filterDistrict")?.value || "";
    const sthaaniyaFilter = document.getElementById("filterSthaaniya")?.value || "";
    const officeFilter = document.getElementById("filterOffice")?.value.toLowerCase() || "";
    const genderF = document.getElementById("filterGender")?.value || "";
    let fromDate = getStandardDate(document.getElementById("filterDateFrom")?.value || "");
    let toDate = getStandardDate(document.getElementById("filterDateTo")?.value || "");


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
    const monitorFilter = document.getElementById("filterMonitor")?.value.toLowerCase() || "";

    let filtered = allMonitorings.filter(r => {
        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            if (r.m_pradesh !== provinceName) return false;
        }
        if (districtFilter && r.m_jilla !== districtFilter) return false;
        if (officeFilter && !(r.m_office || "").toLowerCase().includes(officeFilter)) return false;
        if (monitorFilter && !(r.m_monitor_name || "").toLowerCase().includes(monitorFilter)) return false;

        if (activeTagId) {
            const config = TAG_CONFIG.find(t => t.id === activeTagId);
            const text = (r.m_problems || "");
            if (!config.keywords.some(kw => text.includes(kw))) return false;
        }
        return true;
    });
    currentFilteredMonitorings = filtered;

    const fieldSelector = document.getElementById("monitoringFieldSelector");
    const selectedField = fieldSelector?.value;

    if (!selectedField) {
        const total = filtered.length;
        const brokerSeen = filtered.filter(d => d.m_q5 === "देखियो").length;
        const digitalCharter = filtered.filter(d => d.m_q1 === "स्पष्ट बुझिने").length;

        const today = estimateCurrentBsDate();
        const currentMonthStr = BS_MONTHS[today.month - 1];
        const currentYearStr = toNepaliDigits(today.year);
        const thisMonthMonitoringCount = filtered.filter(d => {
            const dateStr = getVal(d, 'm_date', 'मिति');
            return dateStr && dateStr.includes(currentMonthStr) && dateStr.includes(currentYearStr);
        }).length;
        const firstChartNote = document.querySelector("#monitoringChartsRow .chart-box .small-note");
        if (firstChartNote) firstChartNote.textContent = "नागरिक बडापत्रको स्पष्टता";
        document.querySelectorAll("#monitoringChartsRow .chart-box").forEach(box => {
            box.style.display = "block";
        });

        document.getElementById("statCardsContainer").innerHTML = `
            <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings, 'जम्मा अनुगमन', 'monitoring')"><div class="stat-number"><i class="fas fa-clipboard-list" style="color:#3b82f6"></i> ${toNepaliDigits(total)}</div><div style="color:#4a5568">जम्मा अनुगमन</div></div>        
            <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => {
                const today = estimateCurrentBsDate();
                const m = BS_MONTHS[today.month - 1];
                const y = toNepaliDigits(today.year);
                const ds = getVal(d, 'm_date', 'मिति');
                return ds && ds.includes(m) && ds.includes(y);
            }), 'यस महिनाको अनुगमन', 'monitoring')"><div class="stat-number"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> ${toNepaliDigits(thisMonthMonitoringCount)}</div><div style="color:#4a5568">यस महिनाको अनुगमन</div></div>
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


        const firstChartNote = document.querySelector("#monitoringChartsRow .chart-box .small-note");
        if (firstChartNote) firstChartNote.textContent = fieldName;

        let statHTML = `<div class="stat-card" style="cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings, 'जम्मा अनुगमन', 'monitoring')"><div class="stat-number">${toNepaliDigits(total)}</div><div>जम्मा अनुगमन</div></div>`;
        const palette = getThemeColors();
        Object.keys(counts).forEach((key, i) => {
            const count = counts[key];
            const percent = total > 0 ? (count / total * 100).toFixed(1) : 0;
            statHTML += `<div class="stat-card" style="--stat-border-color: ${palette[i % 5]}; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d['${selectedField}'] === '${key}'), '${fieldName}: ${key}', 'monitoring')"><div class="stat-number" style="color:${palette[i % 5]}">${toNepaliDigits(count)} <span style="font-size: 50%;">(${toNepaliDigits(percent)}%)</span></div><div>${key}</div></div>`;
        });
        document.getElementById("statCardsContainer").innerHTML = statHTML;

        if (charterClarityChartObj) charterClarityChartObj.destroy();
        charterClarityChartObj = new Chart(document.getElementById("charterClarityChart").getContext('2d'), {
            type: chartTypes.charterClarityChart || 'pie',
            data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: palette, borderRadius: 5 }] },
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


    renderMonitoringTable(filtered);


    if (!selectedField) {
        updateMonitoringAlerts(filtered);
    } else {
        const alertsSection = document.getElementById("monitoringAlertsSection");
        if (alertsSection) alertsSection.style.setProperty('display', 'none', 'important');
    }


    updateMonitoringDetails(filtered);
}

function refreshAttendanceDashboard() {
    const pradeshFilter = (document.getElementById("filterPradesh")?.value || "").trim();
    const districtFilter = (document.getElementById("filterDistrict")?.value || "").trim();
    const sthaaniyaFilter = (document.getElementById("filterSthaaniya")?.value || "").trim();
    const officeFilter = (document.getElementById("filterOffice")?.value || "").toLowerCase().trim();
    const monitorFilter = (document.getElementById("filterMonitor")?.value || "").toLowerCase().trim();
    const empNameFilter = (document.getElementById("filterEmpName")?.value || "").toLowerCase().trim();
    const empSymbolFilter = (document.getElementById("filterEmpSymbol")?.value || "").trim();
    const categoryFilter = (document.getElementById("filterCategory")?.value || "").trim();
    const fromDate = getStandardDate(document.getElementById("filterDateFrom")?.value || "");
    const toDate = getStandardDate(document.getElementById("filterDateTo")?.value || "");

    const today = estimateCurrentBsDate();
    const currentMonthStr = BS_MONTHS[today.month - 1];
    const currentYearStr = toNepaliDigits(today.year);

    let filteredEntries = [];
    allAttendanceMonitorings.forEach(item => {

        const rPradesh = getVal(item, 'pradesh', 'प्रदेश');
        const rJilla = getVal(item, 'jilla', 'जिल्ला');
        const rSthaaniya = getVal(item, 'sthaaniya', 'स्थानीय तह');
        const rOffice = getVal(item, 'office', 'कार्यालय');
        const rDate = getVal(item, 'date', 'मिति');


        if (pradeshFilter) {
            const provinceName = PROVINCE[pradeshFilter];
            const pStr = String(rPradesh || "").trim();
            if (pStr != pradeshFilter && pStr !== provinceName) return;
        }
        if (districtFilter && String(rJilla || "").trim() !== districtFilter) return;
        if (sthaaniyaFilter && String(rSthaaniya || "").trim() !== sthaaniyaFilter) return;


        if (officeFilter && !(rOffice || "").toLowerCase().includes(officeFilter)) return;
        if (monitorFilter && !(item.monitor_name || "").toLowerCase().includes(monitorFilter)) return;
        const recDate = getStandardDate(rDate || "");
        if (fromDate && recDate < fromDate) return;
        if (toDate && recDate > toDate) return;

        if (item.rows && Array.isArray(item.rows)) {

            item.rows.forEach(row => {
                if (empNameFilter && !(row.name || "").toLowerCase().includes(empNameFilter)) return;
                if (empSymbolFilter && String(row.symbol || "").trim() !== empSymbolFilter) return;
                if (categoryFilter && row.category !== categoryFilter) return;
                filteredEntries.push({
                    office: rOffice || item.office,
                    date: rDate || item.date,
                    jilla: rJilla,
                    a_monitor_name: item.monitor_name,
                    a_monitor_rank: item.monitor_rank,
                    timestamp: item.timestamp,
                    ...row
                });
            });
        } else {

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
                extra: rExtra,
                a_monitor_name: item.monitor_name,
                a_monitor_rank: item.monitor_rank,
                timestamp: item.timestamp
            });
        }
    });
    currentFilteredAttendance = filteredEntries;
    const uniqueMons = new Set();
    const uniqueMonthMons = new Set();
    filteredEntries.forEach(e => {
        const key = `${e.office}|${e.date}`;
        uniqueMons.add(key);
        if (e.date && e.date.includes(currentMonthStr) && e.date.includes(currentYearStr)) {
            uniqueMonthMons.add(key);
        }
    });

    const totalMonsCount = uniqueMons.size;
    const monthMonsCount = uniqueMonthMons.size;


    const totalViolations = filteredEntries.length;
    const lateAbsent = filteredEntries.filter(e => e.category.includes("अनुपस्थित/ढिला")).length;
    const noUniform = filteredEntries.filter(e => e.category.includes("पोशाक")).length;

    document.getElementById("statCardsContainer").innerHTML = `
        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance, 'कूल समय पालना/पोशाक अनुगमन', 'attendance')">
            <div class="stat-number"><i class="fas fa-clipboard-check" style="color:#3b82f6"></i> ${toNepaliDigits(totalMonsCount)}</div>
            <div style="color:#4a5568">कूल समय पालना/पोशाक अनुगमन</div>
        </div>
        <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.date && e.date.includes('${currentMonthStr}') && e.date.includes('${currentYearStr}')), 'यस महिनाको समय पालना/पोशाक अनुगमन', 'attendance')">
            <div class="stat-number"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> ${toNepaliDigits(monthMonsCount)}</div>
            <div style="color:#4a5568">यस महिनाको समय पालना/पोशाक अनुगमन</div>
        </div>
        <div class="stat-card" style="--stat-border-color:#6366f1; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance, 'जम्मा अपरिपालना', 'attendance')"><div class="stat-number"><i class="fas fa-users-viewfinder" style="color:#6366f1"></i> ${toNepaliDigits(totalViolations)}</div><div style="color:#4a5568">जम्मा अपरिपालना</div></div>
        <div class="stat-card" style="--stat-border-color:#f59e0b; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.category.includes('अनुपस्थित/ढिला')), 'अनुपस्थित/ढिला', 'attendance')"><div class="stat-number"><i class="fas fa-user-clock" style="color:#f59e0b"></i> ${toNepaliDigits(lateAbsent)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (lateAbsent / totalViolations * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">अनुपस्थित/ढिला</div></div>
        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.category.includes('पोशाक')), 'पोशाक नलगाउने', 'attendance')"><div class="stat-number"><i class="fas fa-user-tie" style="color:#ec4899"></i> ${toNepaliDigits(noUniform)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (noUniform / totalViolations * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">पोशाक नलगाउने</div></div>
    `;


    const tbody = document.querySelector("#dataTable tbody");
    if (tbody) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedData = filteredEntries.slice(startIndex, startIndex + itemsPerPage);

        tbody.innerHTML = paginatedData.map(e => {
            let monitorInfo = "";
            if (e.a_monitor_name || e.a_monitor_rank) {
                monitorInfo = `${e.a_monitor_name || "अनुगमनकर्ता नाम नभएको"} (${e.a_monitor_rank || "पद नभएको"})`;
            } else {
                monitorInfo = "अनुगमनकर्ता नाम/पद नभएको";
            }
            return `
            <tr>
                <td data-label="मिति">${e.date}</td>
                <td data-label="कार्यालय">${e.office}</td>
                <td data-label="कर्मचारी">${e.name}</td>
                <td data-label="पद">${e.rank}</td>
                <td data-label="संकेत नं.">${e.symbol}</td>
                <td data-label="प्रकार">${e.category}</td>
                <td data-label="कैफियत">${e.extra || "-"}</td>
                <td data-label="अनुगमनकर्ता">${monitorInfo}</td>
                <td data-label="कार्य">
                    <button class="action-btn btn-edit" onclick="editRecord('${e.timestamp}', 'attendance')" title="सम्पादन"><i class="fas fa-edit"></i></button>
                    <button class="action-btn btn-delete" onclick="deleteRecord('${e.timestamp}', 'attendance')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
        }).join('');
        renderPaginationUI(filteredEntries.length);
    }


    const dStatRow = document.getElementById("dynamicStatRow");
    if (dStatRow) dStatRow.style.display = "none";
    const detailTable = document.getElementById("dynamicDetailTableContainer");
    if (detailTable) detailTable.style.display = "none";


    if (attendanceViolationChartObj) attendanceViolationChartObj.destroy();
    if (dynamicChartObj) dynamicChartObj.destroy();
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


    if (document.getElementById("dynamicChartRow")) document.getElementById("dynamicChartRow").style.display = "flex";
    document.getElementById("dynamicChartLabel").textContent = categoryFilter
        ? `कार्यालय अनुसार विवरण (${categoryFilter})`
        : "अपरिपालनाको वर्गीकरण";
}


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


    const cards = element.querySelectorAll('.stat-card');
    cards.forEach(c => {
        c.style.border = "1px solid #ddd";
        c.style.padding = "10px";
        c.style.flex = "1";
        c.style.pageBreakInside = "avoid";
    });

    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: 'Attendance_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(element).save();
}

/**
 * फिल्टर गरिएको डेटा (सर्वेक्षण, अनुगमन वा समय पालना) एक्सेलमा निर्यात गर्ने
 */
function exportToExcel() {
    const workbook = XLSX.utils.book_new();
    let filename = "Report.xlsx";
    let worksheet;

    if (currentDashboardView === 'attendance') {
        if (currentFilteredAttendance.length === 0) return Swal.fire({ icon: 'info', text: 'निर्यात गर्नको लागि डाटा छैन।' });


        const groupedByOffice = currentFilteredAttendance.reduce((acc, curr) => {
            const office = curr.office || "अन्य कार्यालय";
            if (!acc[office]) acc[office] = [];
            acc[office].push(curr);
            return acc;
        }, {});

        Object.keys(groupedByOffice).forEach(officeName => {
            const officeData = groupedByOffice[officeName].map(e => ({
                'मिति': e.date, 'कार्यालय': e.office, 'कर्मचारीको नाम': e.name, 'पद': e.rank, 'संकेत नं.': e.symbol, 'अपरिपालना प्रकार': e.category, 'कैफियत': e.extra || "-"
            }));
            worksheet = XLSX.utils.json_to_sheet(officeData);
            const sanitizedName = officeName.replace(/[\\/?*:[\]]/g, '').substring(0, 31);
            XLSX.utils.book_append_sheet(workbook, worksheet, sanitizedName || "Sheet");
        });
        filename = "Attendance_Report.xlsx";
    } else if (currentDashboardView === 'monitoring') {
        if (currentFilteredMonitorings.length === 0) return Swal.fire({ icon: 'info', text: 'निर्यात गर्नको लागि डाटा छैन।' });

        const monData = currentFilteredMonitorings.map(e => ({
            'मिति': e.m_date, 'प्रदेश': e.m_pradesh, 'जिल्ला': e.m_jilla, 'कार्यालय': e.m_office, 'बडापत्र स्पष्टता': e.m_q1, 'मध्यस्थकर्ता': e.m_q5, 'हाजिरी': e.m_q9, 'कुल दरबन्दी': e.d_total, 'रिक्त पद': e.d_vacant, 'प्रमुख समस्या': e.m_problems
        }));
        worksheet = XLSX.utils.json_to_sheet(monData);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Monitoring");
        filename = "Monitoring_Report.xlsx";
    } else {
        if (currentFilteredSubmissions.length === 0) return Swal.fire({ icon: 'info', text: 'निर्यात गर्नको लागि डाटा छैन।' });

        const surveyData = currentFilteredSubmissions.map(e => ({
            'मिति': e.survey_date, 'प्रदेश': e.pradesh, 'जिल्ला': e.jilla, 'स्थानीय तह': e.sthaaniya_taha, 'कार्यालय': e.mukhya_karyalay, 'लिङ्ग': e.gender, 'सन्तुष्टि': e.satisfaction_flag, 'घुस': e.ghus_parera, 'बाहिरी सहयोग': e.sahayog_parera, 'सुझाव': e.sujhaw
        }));
        worksheet = XLSX.utils.json_to_sheet(surveyData);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Survey");
        filename = "Survey_Report.xlsx";
    }

    XLSX.writeFile(workbook, filename);
}

function updateMonitoringAlerts(data) {
    const alertsSection = document.getElementById("monitoringAlertsSection");
    const alertsList = document.getElementById("alertsList");
    const actionContainer = document.getElementById("alertsActionContainer");
    if (!alertsSection || !alertsList || !actionContainer) return;

    const toggleBtn = document.getElementById("toggleAlertsVisibilityBtn");
    const isSectionDismissed = localStorage.getItem("alertSectionDismissed_nsc") === "true";


    if (toggleBtn) {
        if (isSectionDismissed) {
            toggleBtn.innerHTML = '<i class="fas fa-bell"></i> अलर्ट देखाउनुहोस्';
            toggleBtn.style.background = '#3182ce';
            toggleBtn.style.borderColor = '#2b6cb0';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-bell-slash"></i> अलर्ट लुकाउनुहोस्';
            toggleBtn.style.background = '#de3053';
            toggleBtn.style.borderColor = '#c03e37';
        }
    }


    if (isSectionDismissed) {
        alertsSection.style.setProperty('display', 'none', 'important');
        return;
    }


    const allHighVacancyOffices = data
        .map(d => {
            const total = Number(getVal(d, 'd_total', 'कुल दरबन्दी') || 0);
            const vacant = Number(getVal(d, 'd_vacant', 'रिक्त') || 0);
            const rate = total > 0 ? (vacant / total) * 100 : 0;
            return { ...d, rate };
        })
        .filter(d => d.rate > 20)
        .sort((a, b) => b.rate - a.rate);


    const activeAlerts = allHighVacancyOffices.filter(d => !dismissedAlerts.has(d.m_office));


    actionContainer.innerHTML = '';


    if (activeAlerts.length > 10) {
        const viewAllBtn = document.createElement("button");
        viewAllBtn.type = "button";
        viewAllBtn.className = "reset-alerts-btn";
        viewAllBtn.style.background = showAllAlertsMode ? "#718096" : "#387ae6";
        viewAllBtn.style.color = "white";
        viewAllBtn.innerHTML = showAllAlertsMode ? '<i class="fas fa-minus-circle"></i> कम हेर्नुहोस्' : '<i class="fas fa-list"></i> सबै हेर्नुहोस् (' + toNepaliDigits(activeAlerts.length) + ')';
        viewAllBtn.onclick = () => {
            showAllAlertsMode = !showAllAlertsMode;
            refreshDashboard();
        };
        actionContainer.appendChild(viewAllBtn);
    }


    if (dismissedAlerts.size > 0) {
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "reset-alerts-btn";
        resetBtn.innerHTML = "🔄 रिसेट";
        resetBtn.onclick = resetAlerts;
        actionContainer.appendChild(resetBtn);
    }

    if (activeAlerts.length === 0) {
        if (dismissedAlerts.size > 0 && allHighVacancyOffices.length > 0) {
            alertsSection.style.setProperty('display', 'block', 'important');
            alertsList.innerHTML = `<div style="padding:10px; color:#718096; font-size:0.85rem; width:100%; text-align:center;">सबै अलर्टहरू हेरिसकिएको छ।</div>`;
        } else {
            alertsSection.style.setProperty('display', 'none', 'important');
        }
        return;
    }

    alertsSection.style.setProperty('display', 'block', 'important');


    const displayData = showAllAlertsMode ? activeAlerts : activeAlerts.slice(0, 10);

    alertsList.innerHTML = displayData.map(d => {
        const rateStr = d.rate.toFixed(1);

        const isCritical = d.rate > 30;
        const themeColor = isCritical ? '#de3053' : '#f39c12';
        const borderColor = isCritical ? '#ffa39e' : '#ffd591';
        const bgColor = isCritical ? '#fff5f5' : '#fffaf0';


        const escapedOffice = (d.m_office || '').replace(/'/g, "\\'");

        return `
            <div class="stat-card" style="position: relative; --stat-border-color: ${themeColor}; --stat-bg-color: ${bgColor}; flex: 1 1 200px; text-align: left; padding: 8px 10px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); cursor: pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(item => item.m_office === '${escapedOffice}'), 'अलर्ट: ${escapedOffice}', 'monitoring')">
                <button type="button" class="alert-close-btn" style="color: ${themeColor}; border-color: ${borderColor}" onclick="dismissAlert(event, '${escapedOffice}')" title="हटाउनुहोस्"><i class="fas fa-times"></i></button>
                <div style="font-weight: 700; color: ${themeColor}; margin-bottom: 4px; font-size: 0.95rem; padding-right: 15px;">${d.m_office || 'अज्ञात कार्यालय'}</div>
                <div style="font-size: 0.9rem; color: #2d3748;">रिक्तता दर: <span style="font-weight: 800; color: ${themeColor};">${toNepaliDigits(rateStr)}%</span></div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 3px;">रिक्त संख्या: ${toNepaliDigits(d.d_vacant)} / कुल दरबन्दी: ${toNepaliDigits(d.d_total)}</div>
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


function filterByTag(event, tagId) {
    event.stopPropagation();
    activeTagId = (activeTagId === tagId) ? null : tagId;
    currentPage = 1;
    refreshDashboard();
    document.getElementById("statCardsContainer").scrollIntoView({ behavior: 'smooth' });
}


function dismissAlert(event, officeName) {
    event.stopPropagation();
    dismissedAlerts.add(officeName);
    localStorage.setItem("dismissedAlerts_nsc", JSON.stringify([...dismissedAlerts]));
    refreshDashboard();
}


function scrollToMonitoringDetail(officeName) {
    const safeId = "detail-" + officeName.replace(/\s+/g, '_');
    const element = document.getElementById(safeId);

    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });


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


function updateMonitoringCharts(data) {
    const colorPalette = getThemeColors(0.8);
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


    charterClarityChartObj = createMonChart("charterClarityChart", "m_q1", charterClarityChartObj);
    websiteChartObj = createMonChart("websiteChart", "m_q6", websiteChartObj, 'pie');
    disclosureChartObj = createMonChart("disclosureChart", "m_q7", disclosureChartObj, 'doughnut');
    autoInfoChartObj = createMonChart("autoInfoChart", "m_q8", autoInfoChartObj, 'pie');
    attendanceChartObj = createMonChart("attendanceChart", "m_q9", attendanceChartObj, 'doughnut');
    workroomChartObj = createMonChart("workroomChart", "m_q10", workroomChartObj, 'bar');
    infoBoardChartObj = createMonChart("infoBoardChart", "m_q11", infoBoardChartObj, 'pie');
    cleaningChartObj = createMonChart("cleaningChart", "m_q12", cleaningChartObj, 'bar');
    brokerChartObj = createMonChart("brokerChart", "m_q5", brokerChartObj, 'doughnut');


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
            indexAxis: 'y',
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
            if (val === "छ" || val === "अध्यावधिक") yesCounts[i - 1]++;
            else if (val === "सामान्य") normalCounts[i - 1]++;
            else if (val === "छैन") noCounts[i - 1]++;
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
                    const fField = `f_${i + 1}`;
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


    let provMap = {};
    Object.values(PROVINCE).forEach(p => provMap[p] = 0);
    data.forEach(d => {
        const p = getVal(d, 'pradesh', 'प्रदेश');
        const pName = PROVINCE[p] || p;
        if (pName && provMap[pName] !== undefined) provMap[pName]++;
    });
    const provCtx = document.getElementById("provinceSurveyChart")?.getContext('2d');
    if (provCtx) {
        if (provinceSurveyChartObj) provinceSurveyChartObj.destroy();
        const provLabels = Object.keys(provMap).filter(k => provMap[k] > 0);
        const provValues = provLabels.map(k => provMap[k]);
        provinceSurveyChartObj = new Chart(provCtx, {
            type: chartTypes.provinceSurveyChart || 'pie',
            data: {
                labels: provLabels,
                datasets: [{
                    data: provValues,
                    backgroundColor: getThemeColors(0.8),
                    borderRadius: 5
                }]
            },
            options: {
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const i = elements[0].index;
                        const label = provLabels[i];
                        const filtered = data.filter(d => (PROVINCE[getVal(d, 'pradesh', 'प्रदेश')] || getVal(d, 'pradesh', 'प्रदेश')) === label);
                        showDetailedTable(filtered, `प्रदेश: ${label}`, 'survey');
                    }
                },
                animation: GLOBAL_CHART_ANIMATION,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: GLOBAL_DATALABELS_CONFIG
                }
            }
        });
    }
}


function renderStats(data) {
    const total = data.length;
    const today = estimateCurrentBsDate();
    const currentMonthStr = BS_MONTHS[today.month - 1];
    const currentYearStr = toNepaliDigits(today.year);
    const thisMonthCount = data.filter(d => {
        const dateStr = getVal(d, 'survey_date', 'मिति');
        return dateStr && dateStr.includes(currentMonthStr) && dateStr.includes(currentYearStr);
    }).length;

    const ghusCount = data.filter(d => (d.ghus_parera || "").trim() === "पर्‍यो").length;
    const femaleCount = data.filter(d => d.gender === "महिला").length;
    const maleCount = data.filter(d => d.gender === "पुरुष").length;
    const satCount = data.filter(d => (d.satisfaction_flag || "").trim() === "सन्तुष्ट").length;

    const container = document.getElementById("statCardsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions, 'कूल सेवाग्राही सर्वेक्षण', 'survey')"><div class="stat-number"><i class="fas fa-poll" style="color:#3b82f6"></i> <span class="anim-counter" data-target="${total}">${toNepaliDigits(total)}</span></div><div style="color:#4a5568">कूल सेवाग्राही सर्वेक्षण</div></div>        
        <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => {
            const today = estimateCurrentBsDate();
            const m = BS_MONTHS[today.month - 1];
            const y = toNepaliDigits(today.year);
            const ds = getVal(d, 'survey_date', 'मिति');
            return ds && ds.includes(m) && ds.includes(y);
        }), 'यस महिनाको सर्वेक्षण', 'survey')"><div class="stat-number"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> <span class="anim-counter" data-target="${thisMonthCount}">${toNepaliDigits(thisMonthCount)}</span></div><div style="color:#4a5568">यस महिनाको सर्वेक्षण</div></div>
        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.gender === 'महिला'), 'महिला सेवाग्राही', 'survey')"><div class="stat-number"><i class="fas fa-female" style="color:#ec4899"></i> <span class="anim-counter" data-target="${femaleCount}">${toNepaliDigits(femaleCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (femaleCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">महिला सेवाग्राही</div></div>
        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.gender === 'पुरुष'), 'पुरुष सेवाग्राही', 'survey')"><div class="stat-number"><i class="fas fa-male" style="color:#3b82f6"></i> <span class="anim-counter" data-target="${maleCount}">${toNepaliDigits(maleCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (maleCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">पुरुष सेवाग्राही</div></div>
        <div class="stat-card" style="--stat-border-color:#10b981; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.satisfaction_flag === 'सन्तुष्ट'), 'सन्तुष्ट सेवाग्राही', 'survey')"><div class="stat-number"><i class="fas fa-smile" style="color:#10b981"></i> <span class="anim-counter" data-target="${satCount}">${toNepaliDigits(satCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (satCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">सन्तुष्ट सेवाग्राही</div></div>
        <div class="stat-card" style="--stat-border-color:#ef4444; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.ghus_parera === 'पर्‍यो'), 'अतिरिक्त रकम तिर्नु परेको', 'survey')"><div class="stat-number"><i class="fas fa-hand-holding-dollar" style="color:#ef4444"></i> <span class="anim-counter" data-target="${ghusCount}">${toNepaliDigits(ghusCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (ghusCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">अतिरिक्त रकम तिर्नु परेको</div></div>
    `;

    // Trigger animated counters after a small delay for DOM render
    setTimeout(() => {
        document.querySelectorAll('.stat-card .anim-counter').forEach(el => {
            const target = parseInt(el.dataset.target);
            if (target > 0) animateCounter(el, target);
        });
    }, 100);
}


function updateCharts(data) {

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
    thead = document.querySelector("#dataTableHeader");
    if (!tbody) return;
    tbody.innerHTML = "";

    // सर्वेक्षण ड्यासबोर्डको table header
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>मिति</th>
                <th>जिल्ला</th>
                <th>लिङ्ग</th>
                <th>कार्यालय</th>
                <th>अतिरिक्त रकम दिनु पर्‍यो?</th>
                <th>सहयोग</th>
                <th>सन्तुष्टि</th>
                <th>विकास कार्यको जानकारी</th>
                <th>कार्य</th>
            </tr>
        `;
    }

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
            <td data-label="कार्य">
                <button class="action-btn btn-edit" onclick="editRecord('${r.timestamp}', 'survey')" title="सम्पादन"><i class="fas fa-edit"></i></button>
                <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp}', 'survey')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.insertAdjacentHTML("beforeend", row);
    });
    renderPaginationUI(data.length);
}


function renderMonitoringTable(data) {
    const tbody = document.querySelector("#dataTable tbody");
    const thead = document.querySelector("#dataTableHeader");
    if (!tbody) return;
    tbody.innerHTML = "";

    // अनुगमन ड्यासबोर्डको table header
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>मिति</th>
                <th>जिल्ला</th>
                <th>कार्यालय</th>
                <th>अनुगमनकर्ता</th>
                <th>नागरिक बडापत्र (डिजिटल/अडियो)</th>
                <th>मध्यस्तकर्ताको प्रवेश</th>
                <th>हाजिरीको अवस्था</th>
                <th>कुल दरबन्दी</th>
                <th>रिक्त</th>
                <th>कार्य</th>
            </tr>
        `;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + itemsPerPage);

    paginatedData.forEach(r => {
        const officeName = r.m_office || "";
        let monitorInfo = "";
        if (r.m_monitor_name || r.m_monitor_designation) {
            monitorInfo = `${r.m_monitor_name || "अनुगमनकर्ता नाम नभएको"} (${r.m_monitor_designation || "पद नभएको"})`;
        } else {
            monitorInfo = "अनुगमनकर्ता नाम/पद नभएको";
        }
        let row = `<tr>
            <td data-label="मिति">${r.m_date || ""}</td>
            <td data-label="जिल्ला">${r.m_jilla || ""}</td>
            <td data-label="कार्यालय"><a href="javascript:void(0)" onclick="scrollToMonitoringDetail('${officeName.replace(/'/g, "\\'")}')" style="color: #306a95; text-decoration: none; font-weight: 600;">${officeName}</a></td>
            <td data-label="अनुगमनकर्ता">${monitorInfo}</td>
            <td data-label="नागरिक बडापत्र (डिजिटल/अडियो)">${r.m_q1 || "अज्ञात"}</td>
            <td data-label="मध्यस्तकर्ताको प्रवेश">${r.m_q5 || "अज्ञात"}</td>
            <td data-label="हाजिरीको अवस्था">${r.m_q9 || "अज्ञात"}</td>
            <td data-label="कुल दरबन्दी">${toNepaliDigits(r.d_total || 0)}</td>
            <td data-label="रिक्त">${toNepaliDigits(r.d_vacant || 0)}</td>
            <td data-label="कार्य">
                <button class="action-btn btn-edit" onclick="editRecord('${r.timestamp}', 'monitoring')" title="सम्पादन"><i class="fas fa-edit"></i></button>
                <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp}', 'monitoring')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.insertAdjacentHTML("beforeend", row);
    });
    renderPaginationUI(data.length);
}


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


    const colorPalette = getThemeColors();
    const chartType = chartTypes.dynamicChart || 'bar';
    const isRadial = chartType === 'pie' || chartType === 'doughnut';
    const ctx = document.getElementById("dynamicChart").getContext('2d');
    const backgroundColors = labels.map((_, i) => createGradient(ctx, colorPalette[i % colorPalette.length], false, isRadial));
    const hoverBackgroundColors = labels.map((_, i) => createGradient(ctx, colorPalette[i % colorPalette.length], false, isRadial, true));
    const borderColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);


    if (dynamicChartObj) dynamicChartObj.destroy();
    if (attendanceViolationChartObj) attendanceViolationChartObj.destroy();

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


    if (statRow) {
        statRow.innerHTML = labels.map((l, i) => `
            <div class="stat-card" style="cursor:pointer; min-width: 110px; padding: 8px 12px; flex: 1; --stat-border-color: ${colorPalette[i % colorPalette.length]}; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.08);" 
                 onclick="showDetailedTable(currentFilteredSubmissions.filter(item => {
                     let val = getVal(item, '${field}', '${fieldLabel}');
                     return String(val).includes('${l}');
                 }), '${fieldLabel}: ${l}', 'survey')">
                <div class="stat-number" style="font-size: 1.25rem; color: ${colorPalette[i % colorPalette.length]}; margin-bottom: 4px;"><i class="fas fa-chart-simple"></i> ${toNepaliDigits(counts[l])} <span style="font-size: 50%;">(${toNepaliDigits(totalVal > 0 ? (counts[l] / totalVal * 100).toFixed(1) : 0)}%)</span></div>
                <div style="font-size: 0.9rem; font-weight: 600; color: #4a5568; line-height: 1.3;">${l}</div>
            </div>
        `).join('');
    }
}


function switchDashboardView(view) {
    currentPage = 1;
    activeTagId = null;
    showAllAlertsMode = false;
    currentDashboardView = view;

    const chartsToDestroy = [
        genderChartObj, satisfactionChartObj, ghusChartObj, devChartObj, provinceSurveyChartObj,
        dynamicChartObj, attendanceViolationChartObj, charterClarityChartObj,
        topUnsatisfiedChartObj, topSatisfiedChartObj, vacantByProvinceChartObj,
        provStaffingComparisonChartObj, staffingChartObj, facilitiesChartObj,
        vacantPercentPieChartObj, websiteChartObj, disclosureChartObj,
        autoInfoChartObj, workroomChartObj, infoBoardChartObj, cleaningChartObj
    ];
    chartsToDestroy.forEach(chart => { if (chart) chart.destroy(); });


    genderChartObj = satisfactionChartObj = ghusChartObj = devChartObj = provinceSurveyChartObj = dynamicChartObj =
        attendanceViolationChartObj = charterClarityChartObj = topUnsatisfiedChartObj =
        topSatisfiedChartObj = vacantByProvinceChartObj = provStaffingComparisonChartObj =
        staffingChartObj = facilitiesChartObj = vacantPercentPieChartObj =
        websiteChartObj = disclosureChartObj = autoInfoChartObj =
        workroomChartObj = infoBoardChartObj = cleaningChartObj = null;


    const detailTableContainer = document.getElementById("dynamicDetailTableContainer");
    if (detailTableContainer) {
        detailTableContainer.style.display = "none";
        document.body.style.overflow = "";
    }


    const mField = document.getElementById("monitoringFieldSelector");
    const dField = document.getElementById("dynamicFieldSelector");
    const aCat = document.getElementById("filterCategory");
    const monitorFilter = document.getElementById("filterMonitor");
    if (mField) mField.value = "";
    if (dField) dField.value = "";
    if (aCat) aCat.value = "";
    if (monitorFilter) monitorFilter.value = "";


    const containers = ["surveyChartsRow", "monitoringChartsRow", "topOfficesRow", "dynamicChartRow", "monitoringAlertsSection", "monitoringDetailsSection", "dynamicStatRow"];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const surveyBtn = document.getElementById("showSurveyView");
    const monitoringBtn = document.getElementById("showMonitoringView");
    const attendanceBtn = document.getElementById("showAttendanceView");
    const pdfBtn = document.getElementById("downloadAttendancePDF");
    const excelBtn = document.getElementById("exportExcelBtn");

    const tableHead = document.querySelector("#dataTable thead");
    const extraFilters = document.getElementById("attendanceExtraFilters");
    const monitoringExtraFilters = document.getElementById("monitoringExtraFilters");
    const toggleMBtn = document.getElementById("toggleMonitoringFilters");
    const toggleAlertsBtn = document.getElementById("toggleAlertsVisibilityBtn");

    if (view === 'survey') {
        if (pdfBtn) pdfBtn.style.display = "none";
        if (excelBtn) excelBtn.style.display = "block";
        surveyBtn?.classList.add("active");
        monitoringBtn?.classList.remove("active");
        attendanceBtn?.classList.remove("active");
        if (extraFilters) extraFilters.style.display = "none";
        if (monitoringExtraFilters) monitoringExtraFilters.style.display = "none";
        if (toggleMBtn) toggleMBtn.style.display = "none";
        if (toggleAlertsBtn) toggleAlertsBtn.style.display = "none";

        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'flex', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'flex', 'important');

        const dynamicAnalysis = document.getElementById("surveyDynamicAnalysis");
        if (dynamicAnalysis) {
            dynamicAnalysis.style.setProperty('display', 'block', 'important');
            const selectorDiv = dynamicAnalysis.querySelector(".filter-item");
            if (selectorDiv) selectorDiv.style.display = "flex";
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
                <th>विकास कार्यको जानकारी</th>
                <th>कार्य</th>
            </tr>`;
        }

        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "flex";
    } else if (view === 'attendance') {
        if (pdfBtn) pdfBtn.style.display = "block";
        if (excelBtn) excelBtn.style.display = "block";
        attendanceBtn?.classList.add("active");
        surveyBtn?.classList.remove("active");
        monitoringBtn?.classList.remove("active");
        if (extraFilters) extraFilters.style.display = "flex";
        if (monitoringExtraFilters) monitoringExtraFilters.style.display = "none";
        if (toggleMBtn) toggleMBtn.style.display = "none";
        if (toggleAlertsBtn) toggleAlertsBtn.style.display = "none";

        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'none', 'important');
        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');

        const dynamicAnalysis = document.getElementById("surveyDynamicAnalysis");
        if (dynamicAnalysis) {
            dynamicAnalysis.style.setProperty('display', 'block', 'important');
            const selectorDiv = dynamicAnalysis.querySelector(".filter-item");
            if (selectorDiv) selectorDiv.style.display = "none";
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
                <th>कैफियत</th>
                <th>अनुगमनकर्ता</th>
                <th>कार्य</th>
            </tr>`;
        }

        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "none";
    } else {
        if (pdfBtn) pdfBtn.style.display = "none";
        if (excelBtn) excelBtn.style.display = "block";
        monitoringBtn?.classList.add("active");
        surveyBtn?.classList.remove("active");
        attendanceBtn?.classList.remove("active");
        if (extraFilters) extraFilters.style.display = "none";
        if (toggleMBtn) toggleMBtn.style.display = "block";
        if (toggleAlertsBtn) toggleAlertsBtn.style.display = "inline-flex";

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
                <th>कार्य</th>
            </tr>`;
        }

        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');
        if (genderFilter) genderFilter.style.display = "none";

        const stored = localStorage.getItem("monitoringData_nsc");
        if (stored) allMonitorings = JSON.parse(stored);
    }
    refreshDashboard();
}


document.getElementById("showSurveyView")?.addEventListener("click", () => switchDashboardView('survey'));
document.getElementById("showMonitoringView")?.addEventListener("click", () => switchDashboardView('monitoring'));
document.getElementById("showAttendanceView")?.addEventListener("click", () => switchDashboardView('attendance'));
document.getElementById("downloadAttendancePDF")?.addEventListener("click", downloadAttendancePDF);
document.getElementById("exportExcelBtn")?.addEventListener("click", exportToExcel);

document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;
        if (!targetTab) return;

        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-panel"));
        const targetPanel = document.getElementById(targetTab);
        if (targetPanel) {
            targetPanel.classList.add("active-panel");
        }

        if (targetTab === "dashboard-tab") {
            switchDashboardView('monitoring');
        }


        window.scrollTo({ top: 0, behavior: 'smooth' });
    });


    const themeToggleBtn = document.getElementById('themeToggleBtn');
    themeToggleBtn?.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeToggleBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';


        Chart.defaults.plugins.legend.labels.color = isDark ? '#e2e8f0' : '#334155';
        Chart.defaults.scale.grid.color = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)';

        refreshDashboard();
        playClickSound();
    });
});

document.getElementById("applyFilter")?.addEventListener("click", () => {
    currentPage = 1;
    refreshDashboard();
});

// Auto-filter on input change
const filterInputs = [
    "filterDateFrom", "filterDateTo", "filterPradesh", "filterDistrict", 
    "filterSthaaniya", "filterOffice", "filterMonitor", "filterGender", 
    "filterCategory", "filterEmpName", "filterEmpSymbol"
];
filterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", () => {
            currentPage = 1;
            refreshDashboard();
        });
    }
});

document.getElementById("resetFilter")?.addEventListener("click", () => {
    currentPage = 1;
    activeTagId = null;

    const fieldsToReset = [
        "filterPradesh", "filterOffice", "filterGender", "filterDateFrom", "filterDateTo",
        "filterCategory", "filterEmpName", "filterEmpSymbol", "filterMonitor",
        "monitoringFieldSelector", "dynamicFieldSelector"
    ];

    fieldsToReset.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const districtSel = document.getElementById("filterDistrict");
    if (districtSel) { districtSel.innerHTML = '<option value="">सबै</option>'; districtSel.value = ""; }

    const sthaaniyaSel = document.getElementById("filterSthaaniya");
    if (sthaaniyaSel) { sthaaniyaSel.innerHTML = '<option value="">सबै</option>'; sthaaniyaSel.value = ""; }

    if (document.getElementById("monitoringExtraFilters")) document.getElementById("monitoringExtraFilters").style.display = "none";
    const toggleBtn = document.getElementById("toggleMonitoringFilters");
    if (toggleBtn) toggleBtn.textContent = "🔍 थप अनुगमन फिल्टरहरू";

    refreshDashboard();
});


document.addEventListener("DOMContentLoaded", function () {
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


        const voiceCmdBtn = document.createElement("button");
        voiceCmdBtn.id = "voiceCommandBtn";
        voiceCmdBtn.type = "button";
        voiceCmdBtn.className = "tab-btn";
        voiceCmdBtn.style.marginLeft = "8px";
        voiceCmdBtn.style.background = "#8b5cf6";
        voiceCmdBtn.style.color = "white";
        voiceCmdBtn.innerHTML = '<i class="fas fa-microphone"></i> भ्वाइस कमाण्ड';
        voiceCmdBtn.onclick = startGlobalVoiceCommand;
        resetBtn.parentNode.insertBefore(voiceCmdBtn, summaryBtn.nextSibling);
    }
});


function showStatusSummary() {
    const container = document.getElementById("dynamicDetailTableContainer");
    const titleEl = document.getElementById("detailTableTitle");
    const table = document.getElementById("dynamicDetailTable");

    if (!container || !table) return;

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

    table.style.display = "none";
    let summaryDiv = container.querySelector(".summary-content-wrapper");
    if (!summaryDiv) {
        summaryDiv = document.createElement("div");
        summaryDiv.className = "summary-content-wrapper";
        table.parentNode.appendChild(summaryDiv);
    }
    summaryDiv.style.display = "block";


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


const originalShowDetailedTable = showDetailedTable;
showDetailedTable = function (data, title, viewType) {
    playClickSound();
    const container = document.getElementById("dynamicDetailTableContainer");
    if (container) {
        const summaryDiv = container.querySelector(".summary-content-wrapper");
        if (summaryDiv) summaryDiv.style.display = "none";
        const table = document.getElementById("dynamicDetailTable");
        if (table) table.style.display = "table";
    }
    originalShowDetailedTable(data, title, viewType);
};



function renderPaginationUI(totalItems) {
    const container = document.getElementById("paginationControls");
    if (!container) return;
    container.innerHTML = "";

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return;


    const firstBtn = document.createElement("button");
    firstBtn.innerHTML = '<i class="fas fa-angle-double-left"></i>';
    firstBtn.className = "tab-btn";
    firstBtn.style.padding = "3px 10px";
    firstBtn.style.marginRight = "2px";
    firstBtn.disabled = currentPage === 1;
    firstBtn.onclick = () => { currentPage = 1; refreshDashboard(); };
    container.appendChild(firstBtn);


    const prevBtn = document.createElement("button");
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.className = "tab-btn";
    prevBtn.style.padding = "3px 10px";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; refreshDashboard(); };
    container.appendChild(prevBtn);


    const info = document.createElement("span");
    info.style.fontSize = "0.85rem";
    info.style.margin = "0 10px";
    info.style.fontWeight = "600";
    info.textContent = `${toNepaliDigits(currentPage)} / ${toNepaliDigits(totalPages)} पृष्ठ`;
    container.appendChild(info);


    const nextBtn = document.createElement("button");
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.className = "tab-btn";
    nextBtn.style.padding = "3px 10px";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; refreshDashboard(); };
    container.appendChild(nextBtn);


    const lastBtn = document.createElement("button");
    lastBtn.innerHTML = '<i class="fas fa-angle-double-right"></i>';
    lastBtn.className = "tab-btn";
    lastBtn.style.padding = "3px 10px";
    lastBtn.style.marginLeft = "2px";
    lastBtn.disabled = currentPage === totalPages;
    lastBtn.onclick = () => { currentPage = totalPages; refreshDashboard(); };
    container.appendChild(lastBtn);
}


function dismissAllAlerts(event) {
    event.stopPropagation();
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
    localStorage.removeItem("alertSectionDismissed_nsc");
    refreshDashboard();
}


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

    recognition.lang = 'ne-NP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        btn.classList.add('recording');
        const textSpan = btn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = "सुन्दैछ...";
    };

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        target.value = (target.value ? target.value.trim() + ' ' : '') + transcript;
        target.dispatchEvent(new Event('input'));
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


function startGlobalVoiceCommand() {
    if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
        Swal.fire({
            icon: 'error',
            title: 'सुविधा उपलब्ध छैन',
            text: 'तपाईंको ब्राउजरमा आवाज पहिचान गर्ने सुविधा छैन। कृपया Chrome प्रयोग गर्नुहोस्।',
            confirmButtonColor: '#387ae6'
        });
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ne-NP';
    recognition.interimResults = false;


    const indicator = document.getElementById('updateIndicator');
    if (indicator) {
        indicator.innerHTML = '<i class="fas fa-microphone-alt"></i> आदेश सुन्दैछ (उदा: .... प्रदेशको अनुगमन देखाऊ)...';
        indicator.classList.add('show');
    }

    recognition.onresult = (e) => {
        const command = e.results[0][0].transcript.trim();
        let identified = false;


        const allOffices = new Set();
        allSubmissions.forEach(s => { const n = getVal(s, 'mukhya_karyalay', 'कार्यालय'); if (n) allOffices.add(n.trim()); });
        allMonitorings.forEach(m => { if (m.m_office) allOffices.add(m.m_office.trim()); });
        allAttendanceMonitorings.forEach(a => { if (a.office) allOffices.add(a.office.trim()); });

        for (const officeName of allOffices) {
            if (command.includes(officeName)) {
                const oInput = document.getElementById("filterOffice");
                if (oInput) {
                    oInput.value = officeName;
                    identified = true;
                    break;
                }
            }
        }


        if (!identified) {
            for (const [pId, districts] of Object.entries(MUNICIPALITIES)) {
                for (const [dName, munis] of Object.entries(districts)) {
                    for (const mName of munis) {
                        if (command.includes(mName)) {
                            const pSelect = document.getElementById("filterPradesh");
                            const dSelect = document.getElementById("filterDistrict");
                            const sSelect = document.getElementById("filterSthaaniya");
                            if (pSelect) { pSelect.value = pId; updateFilterDistricts(); }
                            if (dSelect) { dSelect.value = dName; updateFilterMunicipalities(); }
                            if (sSelect) { sSelect.value = mName; }
                            identified = true; break;
                        }
                    }
                    if (identified) break;
                }
                if (identified) break;
            }
        }


        if (!identified) {
            for (const [pId, districts] of Object.entries(DISTRICTS)) {
                for (const dName of districts) {
                    if (command.includes(dName)) {
                        const pSelect = document.getElementById("filterPradesh");
                        const dSelect = document.getElementById("filterDistrict");
                        if (pSelect) { pSelect.value = pId; updateFilterDistricts(); }
                        if (dSelect) { dSelect.value = dName; updateFilterMunicipalities(); }
                        identified = true; break;
                    }
                }
                if (identified) break;
            }
        }


        if (!identified) {
            for (const [id, name] of Object.entries(PROVINCE)) {
                if (command.includes(name) || command.includes(name.replace(' प्रदेश', ''))) {
                    const pSelect = document.getElementById("filterPradesh");
                    if (pSelect) {
                        pSelect.value = id;
                        updateFilterDistricts();
                    }
                    break;
                }
            }
        }


        if (command.includes("सर्वेक्षण") || command.includes("सन्तुष्टि") || command.includes("सेवाग्राही")) {
            switchDashboardView('survey');
        } else if (command.includes("अनुगमन") || command.includes("कार्यालय")) {
            switchDashboardView('monitoring');
        } else if (command.includes("समय पालना") || command.includes("पोशाक") || command.includes("हाजिरी")) {
            switchDashboardView('attendance');
        } else {
            refreshDashboard();
        }

        playSuccessSound();
    };

    recognition.onerror = () => { if (indicator) indicator.classList.remove('show'); };
    recognition.onend = () => { if (indicator) indicator.classList.remove('show'); };
    recognition.start();
}


async function updateAIDashboardSummary() {
    const summaryBox = document.getElementById('aiDashboardSummaryBox');
    const indicesDisplay = document.getElementById('aiIndicesDisplay');
    const analysisText = document.getElementById('aiDashboardAnalysisText');
    if (!summaryBox) return;

    summaryBox.style.display = 'block';


    const mData = currentFilteredMonitorings;
    const sData = currentFilteredSubmissions;

    const mapScore = (val, positiveArr) => positiveArr.includes(val) ? 100 : (val === 'आंशिक' || val === 'सामान्य' || val === 'ठीकै' ? 50 : 0);


    const transparency = mData.length ? mData.reduce((acc, d) => acc + (
        mapScore(d.m_q6, ['भएको']) + mapScore(d.m_q7, ['गरेको']) + mapScore(d.m_q8, ['भएको']) + mapScore(d.m_q11, ['भएको'])
    ) / 4, 0) / mData.length : 0;


    const delivery = mData.length ? mData.reduce((acc, d) => acc + (
        mapScore(d.m_q1, ['स्पष्ट बुझिने']) + mapScore(d.m_q2, ['स्पष्ट उल्लेख भएको']) +
        mapScore(d.m_q10, ['भेटियो']) + mapScore(d.m_q12, ['राम्रो'])
    ) / 4, 0) / mData.length : 0;


    const satisfaction = sData.length ? (sData.filter(d => d.satisfaction_flag === 'सन्तुष्ट').length / sData.length) * 100 : 0;


    const ggi = (transparency * 0.3) + (delivery * 0.4) + (satisfaction * 0.3);


    const renderIndex = (label, val, color) => `
        <div class="index-card" style="border-left-color: ${color}">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">${label}</div>
            <div class="index-value" style="color: ${color}">${toNepaliDigits(val.toFixed(1))}%</div>
        </div>
    `;

    indicesDisplay.innerHTML =
        renderIndex('समग्र सुशासन (GGI)', ggi, '#1e40af') +
        renderIndex('पारदर्शिता सूचक', transparency, '#0891b2') +
        renderIndex('सेवा प्रवाह सूचक', delivery, '#8b5cf6') +
        renderIndex('सेवाग्राही सन्तुष्टि', satisfaction, '#10b981');


    const pSel = document.getElementById("filterPradesh");
    const location = pSel && pSel.value ? pSel.options[pSel.selectedIndex].text : "छानिएको क्षेत्र";

    try {
        const payload = {
            action: 'analyze',
            location: location,
            mode: 'dashboard_short',
            officeMonitoring: calculateMonitoringSummary(mData),
            serviceSurvey: calculateSurveySummary(sData),
            indices: { ggi, transparency, delivery, satisfaction }
        };

        const response = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });

        let resultText = await response.text();
        let analysisTextContent = "";
        try {
            const jsonRes = JSON.parse(resultText);
            analysisTextContent = jsonRes.analysis || jsonRes.message || resultText;
        } catch (e) {
            analysisTextContent = resultText;
        }


        let tempText = analysisTextContent.trim();


        tempText = tempText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');


        tempText = tempText.replace(/^\s*[\*\-•]\s+(.*$)/gm, '<div style="display:flex; margin-bottom:4px; padding-left:15px;"><span style="margin-right:8px; color:#387ae6;">•</span><span>$1</span></div>');


        const formattedHtml = tempText.split(/\n\n+/).map(para => {
            if (para.trim().startsWith('<div')) return para;
            return `<p style="margin-bottom:10px;">${para.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        analysisText.innerHTML = `<div class="ai-dash-content" style="text-align:justify; line-height:1.6;">${formattedHtml}</div>`;
    } catch (e) {
        analysisText.innerHTML = "⚠️ AI विश्लेषण लोड हुन सकेन। तर माथिका सूचकाङ्कहरू वास्तविक डेटामा आधारित छन्।";
    }
}


function clearInput(targetId) {
    const target = document.getElementById(targetId);
    if (target) {
        target.value = '';
        target.dispatchEvent(new Event('input'));
    }
}


function playSuccessSound() {
    consecutiveErrorCount = 0;

    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) syncIndicator.style.backgroundColor = '';

    const successSound = new Audio('https://www.soundjay.com/buttons/button-09.mp3');
    successSound.volume = 0.5;
    successSound.play().catch(e => console.log("साउन्ड प्ले एरर:", e));
}


function playErrorSound(visualMessage = null) {
    consecutiveErrorCount++;

    const errorSound = new Audio('https://www.soundjay.com/buttons/beep-05.mp3');
    errorSound.volume = 0.4;


    let pitch = 1.0 + (consecutiveErrorCount - 1) * 0.25;
    errorSound.playbackRate = Math.min(pitch, 2.5);

    errorSound.play().catch(e => console.log("साउन्ड प्ले एरर:", e));

    if (visualMessage) {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.classList.add('error');
            syncIndicator.classList.add('active');
            let lightness = Math.max(57 - (consecutiveErrorCount * 7), 20);
            syncIndicator.style.backgroundColor = `hsl(6, 78%, ${lightness}%)`;

            syncIndicator.innerHTML = `❌ ${visualMessage}`;
            setTimeout(() => {
                syncIndicator.classList.remove('active');
                setTimeout(() => {
                    syncIndicator.classList.remove('error');
                    syncIndicator.style.backgroundColor = '';
                    syncIndicator.innerHTML = "🔄 डेटा सिङ्क हुँदैछ...";
                }, 400);
            }, 3500);
        }
    }
}


function showDetailedTable(data, title, viewType = 'survey') {
    console.log("showDetailedTable called - viewType:", viewType, "data length:", data.length);
    console.log("First data sample:", data[0]);
    const container = document.getElementById("dynamicDetailTableContainer");
    const titleEl = document.getElementById("detailTableTitle");
    const thead = document.querySelector("#dynamicDetailTable thead");
    const tbody = document.querySelector("#dynamicDetailTable tbody");

    if (!container || !thead || !tbody) return;

    titleEl.textContent = title;
    container.style.display = "flex";
    document.body.style.overflow = "hidden";

    if (viewType === 'survey') {
        thead.innerHTML = `<tr><th>मिति</th><th>जिल्ला</th><th>कार्यालय</th><th>बाहिरी सहयोग</th><th>अतिरिक्त रकम</th><th>सेवा सन्तुष्टि</th><th>योजना सन्तुष्टि</th><th>सुझाव</th><th>कार्य</th></tr>`;
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
                    <td data-label="कार्य">
                        <button class="action-btn btn-edit" onclick="editRecord('${r.timestamp}', 'survey')" title="सम्पादन"><i class="fas fa-edit"></i></button>
                        <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp}', 'survey')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    } else if (viewType === 'monitoring') {
        thead.innerHTML = `<tr><th>मिति</th><th>जिल्ला</th><th>कार्यालय</th><th>अनुगमनकर्ता</th><th>बडापत्र</th><th>सेवा प्रक्रिया</th><th>मध्यस्थकर्ता</th><th>कर्मचारी उपस्थिति</th><th>सरसफाइ</th><th>कार्य</th></tr>`;
        tbody.innerHTML = data.map(r => {
            const q1 = getVal(r, 'm_q1', '१. नागरिक बडापत्र');
            const q2 = getVal(r, 'm_q2', '२. सेवा प्रक्रिया');
            const q5 = getVal(r, 'm_q5', '५. मध्यस्थकर्ताको प्रवेश');
            const q10 = getVal(r, 'm_q10', '१०. कर्मचारीहरु कार्यकक्षमा');
            const q12 = getVal(r, 'm_q12', '१२. सरसफाइको अवस्था');

            let monitorInfo = "";
            if (r.m_monitor_name || r.m_monitor_designation) {
                monitorInfo = `${r.m_monitor_name || "अनुगमनकर्ता नाम नभएको"} (${r.m_monitor_designation || "पद नभएको"})`;
            } else {
                monitorInfo = "अनुगमनकर्ता नाम/पद नभएको";
            }

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
                    <td>${monitorInfo}</td>
                    <td style="color: ${isQ1Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ1Neg ? '700' : 'normal'}" ${isQ1Neg ? 'class="has-tooltip tooltip-yellow" data-tooltip="नागरिक बडापत्र स्पष्ट नभएको वा नराखिएको"' : ''}>${q1}</td>
                    <td style="color: ${isQ2Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ2Neg ? '700' : 'normal'}" ${isQ2Neg ? 'class="has-tooltip tooltip-yellow" data-tooltip="सेवा प्रक्रिया, कागजात, लागत र समय स्पष्ट नभएको"' : ''}>${q2}</td>
                    <td style="color: ${isQ5Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ5Neg ? '700' : 'normal'}" ${isQ5Neg ? 'class="has-tooltip tooltip-red" data-tooltip="मध्यस्थकर्ताको उपस्थिति देखिएको"' : ''}>${q5}</td>
                    <td style="color: ${isQ10Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ10Neg ? '700' : 'normal'}" ${isQ10Neg ? 'class="has-tooltip tooltip-red" data-tooltip="कर्मचारीहरु तोकिएको कार्यकक्षमा नभेटिएको"' : ''}>${q10}</td>
                    <td style="color: ${isQ12Neg ? '#de3053' : 'inherit'}; font-weight: ${isQ12Neg ? '700' : 'normal'}" ${isQ12Neg ? 'class="has-tooltip tooltip-yellow" data-tooltip="कार्यालयको सरसफाइको अवस्था नराम्रो भएको"' : ''}>${q12}</td>
                    <td data-label="कार्य">
                        <button class="action-btn btn-edit" onclick="editRecord('${r.timestamp}', 'monitoring')" title="सम्पादन"><i class="fas fa-edit"></i></button>
                        <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp}', 'monitoring')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    } else if (viewType === 'attendance') {
        thead.innerHTML = `<tr><th>मिति</th><th>कार्यालय</th><th>कर्मचारी</th><th>पद</th><th>प्रकार</th><th>कैफियत</th><th>अनुगमनकर्ता</th><th>कार्य</th></tr>`;
        tbody.innerHTML = data.map(r => {
            let monitorInfo = "";
            if (r.a_monitor_name || r.a_monitor_rank) {
                monitorInfo = `${r.a_monitor_name || "अनुगमनकर्ता नाम नभएको"} (${r.a_monitor_rank || "पद नभएको"})`;
            } else {
                monitorInfo = "अनुगमनकर्ता नाम/पद नभएको";
            }
            return `
            <tr>
                <td>${r.date || ""}</td><td>${r.office || ""}</td><td>${r.name || ""}</td><td>${r.rank || ""}</td><td style="color: #de3053; font-weight: 700;" class="has-tooltip tooltip-red" data-tooltip="समय पालना वा पोशाक सम्बन्धी अपरिपालना">${r.category || ""}</td><td>${r.extra || "-"}</td><td>${monitorInfo}</td><td data-label="कार्य">
                    <button class="action-btn btn-edit" onclick="editRecord('${r.timestamp || ''}', 'attendance')" title="सम्पादन"><i class="fas fa-edit"></i></button>
                    <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp || ''}', 'attendance')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
        }).join('');
    }


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


function analyzeSentiment(text) {
    const negativeWords = ['खराब', 'ढिला', 'झन्झटिलो', 'घुस', 'भ्रष्टाचार', 'नराम्रो', 'दुःख'];
    const positiveWords = ['राम्रो', 'सहज', 'छिटो', 'सन्तुष्ट', 'धन्यवाद', 'उत्कृष्ट'];

    let score = 0;
    negativeWords.forEach(w => { if (text.includes(w)) score--; });
    positiveWords.forEach(w => { if (text.includes(w)) score++; });

    if (score > 0) return { label: 'सकारात्मक', color: '#27ae60' };
    if (score < 0) return { label: 'नकारात्मक', color: '#e74c3c' };
    return { label: 'तटस्थ', color: '#7f8c8d' };
}


function triggerFadeIn() {
    const elements = document.querySelectorAll('.chart-box, .stat-card, .table-wrapper, #monitoringDetailsSection, #mapSection');
    elements.forEach(el => {
        if (el.style.display !== 'none') {
            el.classList.remove('chart-fade-in');
            void el.offsetWidth;
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
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        detectRetina: true
    }).addTo(mapObj);
}

function updateMapMarkers() {
    if (!mapObj || document.getElementById('mapSection').style.display === 'none') return;

    mapObj.eachLayer((layer) => {
        if (layer instanceof L.Marker) mapObj.removeLayer(layer);
    });

    let data = [];
    let dKey = '';

    if (currentDashboardView === 'survey') { data = currentFilteredSubmissions; dKey = 'jilla'; }
    else if (currentDashboardView === 'monitoring') { data = currentFilteredMonitorings; dKey = 'm_jilla'; }
    else if (currentDashboardView === 'attendance') { data = currentFilteredAttendance; dKey = 'jilla'; }


    const stats = data.reduce((acc, item) => {
        const dName = item[dKey] || getVal(item, dKey, 'जिल्ला');
        if (!dName || !DISTRICT_COORDS[dName]) return acc;

        if (!acc[dName]) acc[dName] = { total: 0, unsatisfied: 0, reasons: {} };
        acc[dName].total++;

        let reasons = [];
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


    Object.keys(stats).forEach(dName => {
        const s = stats[dName];


        const negativeReasons = s.reasons ? Object.keys(s.reasons).join(", ") : "";


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
            .on('popupopen', function () {
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
                                    const idx = elements[0].index;
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

const originalRefreshDashboard = refreshDashboard;
refreshDashboard = function () {
    const indicator = document.getElementById('updateIndicator');

    if (indicator) indicator.classList.add('show');

    originalRefreshDashboard();
    updateMapMarkers();

    updateAIDashboardSummary();

    setTimeout(() => {
        triggerFadeIn();
        if (indicator) {
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 400);
        }
    }, 100);
};

loadData();


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

        const d_total = parseInt(getVal(item, 'd_total', 'कुल दरबन्दी')) || 0;
        const d_vacant = parseInt(getVal(item, 'd_vacant', 'रिक्त')) || 0;
        summary.total_staff += d_total;
        summary.vacant_staff += d_vacant;


        const m_q1 = getVal(item, 'm_q1', 'नागरिक बडापत्र');
        if (m_q1 === 'स्पष्ट बुझिने') summary.charter_clear++;
        else if (m_q1 === 'स्पष्ट नबुझिने') summary.charter_not_clear++;
        else if (m_q1 === 'पढ्न झन्झटिलो') summary.charter_difficult++;
        else if (m_q1 === 'नभएको') summary.charter_none++;


        const m_q2 = getVal(item, 'm_q2', 'सेवा प्रक्रिया');
        if (m_q2 === 'स्पष्ट उल्लेख भएको') summary.process_clear++;
        else if (m_q2 === 'उल्लेख नभएको') summary.process_not_mentioned++;
        else if (m_q2 === 'आंशिक') summary.process_partial++;
        else if (m_q2 === 'नभएको') summary.process_none++;


        const m_q5 = getVal(item, 'm_q5', 'मध्यस्थकर्ताको प्रवेश');
        if (m_q5 === 'देखियो') summary.broker_seen++;
        else if (m_q5 === 'देखिएन') summary.broker_not_seen++;


        const m_q10 = getVal(item, 'm_q10', 'कर्मचारीहरु तोकिएको कार्यकक्षमा रहेको');
        if (m_q10 === 'भेटियो') summary.staff_found++;
        else if (m_q10 === 'भेटिएन') summary.staff_not_found++;
        else if (m_q10 === 'आंशिक') summary.staff_partial++;


        const m_q12 = getVal(item, 'm_q12', 'कार्यालयको सरसफाइको अवस्था');
        if (m_q12 === 'राम्रो') summary.cleaning_good++;
        else if (m_q12 === 'नराम्रो') summary.cleaning_bad++;
        else if (m_q12 === 'ठीकै') summary.cleaning_ok++;


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

        const janakari_chha = getVal(item, 'janakari_chha', 'नागरिक बडापत्रको जानकारी');
        if (janakari_chha === 'छ') summary.charter_info_yes++;
        else if (janakari_chha === 'छैन') summary.charter_info_no++;


        const kaam_bhayeko = getVal(item, 'kaam_bhayeko', 'तोकिएको समयमा काम भएको');
        if (kaam_bhayeko === 'भयो') summary.work_done_yes++;
        else if (kaam_bhayeko === 'भएन') summary.work_done_no++;


        const sahayog_parera = getVal(item, 'sahayog_parera', 'बाहिरी व्यक्तिको सहयोग');
        if (sahayog_parera === 'पर्‍यो') summary.helper_yes++;
        else if (sahayog_parera === 'परेन') summary.helper_no++;


        const ghus_parera = getVal(item, 'ghus_parera', 'अतिरिक्त रकम (घुस)');
        if (ghus_parera === 'पर्‍यो') summary.ghus_yes++;
        else if (ghus_parera === 'परेन') summary.ghus_no++;


        const main_satisfaction = getVal(item, 'main_satisfaction', 'सन्तुष्ट/असन्तुष्ट');
        if (main_satisfaction === 'सन्तुष्ट') summary.satisfied++;
        else if (main_satisfaction === 'असन्तुष्ट') summary.unsatisfied++;


        const santushti_positive = getVal(item, 'santushti_positive', 'सन्तुष्टिको कारण');
        if (santushti_positive) {
            if (santushti_positive.includes('समयमै काम भएको')) summary.sat_time++;
            if (santushti_positive.includes('सेवा शुल्क उचित भएको')) summary.sat_fee++;
            if (santushti_positive.includes('सेवा गुणस्तरीय भएको')) summary.sat_quality++;
            if (santushti_positive.includes('प्रक्रिया सहज भएको')) summary.sat_process++;
            if (santushti_positive.includes('कर्मचारीको व्यवहार राम्रो रहेको')) summary.sat_behavior++;
            if (santushti_positive.includes('अन्य')) summary.sat_other++;
        }


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


        const yojana_santushti = getVal(item, 'yojana_santushti', 'योजनाबाट सन्तुष्टि');
        if (yojana_santushti === 'सन्तुष्ट') summary.yojana_sat++;
        else if (yojana_santushti === 'असन्तुष्ट') summary.yojana_unsat++;


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


function classifyStatus(score) {
    if (score >= 90) return "उत्कृष्ट";
    if (score >= 75) return "राम्रो";
    if (score >= 60) return "सुधार आवश्यक";
    if (score >= 40) return "गम्भीर समीक्षा र सुधार आवश्यक";
    return "तत्काल हस्तक्षेपको आवश्यकता";
}


async function getAIStatusAnalysis(location, mSummary, sSummary, aSummary) {
    const aiSection = document.getElementById('aiAnalysisSection');
    const aiContent = document.getElementById('aiAnalysisContent');
    if (!aiSection || !aiContent) return;

    aiSection.style.display = "block";
    aiContent.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gemini AI ले डेटा विश्लेषण गर्दैछ, कृपया केही समय पर्खनुहोस्...';

    try {
        const today = estimateCurrentBsDate();
        const nepaliDate = formatNepaliDateParts(today.year, today.month, today.day);


        const payload = {
            action: 'analyze',
            location: location,
            currentDate: nepaliDate,
            officeMonitoring: mSummary,
            serviceSurvey: sSummary,
            timeDressMonitoring: aSummary
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Network response was not ok');

        let resultText = await response.text();

        let analysisText = "";
        try {

            const jsonRes = JSON.parse(resultText);
            analysisText = jsonRes.analysis || jsonRes.message || resultText;
        } catch (e) {
            analysisText = resultText;
        }


        let tempText = analysisText.trim();

        tempText = tempText.replace(/^([\u0966-\u096F\d]+\.\s+.*$)/gm, '<h4 style="color:#1a365d; border-bottom:1.5px solid #cbd5e0; padding-bottom:5px; margin-top:22px; margin-bottom:10px; font-weight:700; font-size:1.1rem;">$1</h4>');
        tempText = tempText.replace(/^#+\s+(.*$)/gm, '<h5 style="color:#2c5282; border-left:4px solid #387ae6; padding-left:10px; margin-top:18px; margin-bottom:8px;">$1</h5>');


        tempText = tempText.replace(/^\s*[\*\-•]\s+(.*$)/gm, '<div style="display:flex; margin-bottom:6px; padding-left:20px;"><span style="margin-right:10px; color:#387ae6;">•</span><span>$1</span></div>');


        tempText = tempText.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1a365d;">$1</strong>');


        const formattedHtml = tempText.split(/\n\n+/).map(para => {
            if (para.trim().startsWith('<h') || para.trim().startsWith('<div')) return para;
            return `<p style="margin-bottom:12px;">${para.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        aiContent.innerHTML = `<div style="text-align:justify; line-height:1.7; color:#2d3748;">${formattedHtml}</div>`;

    } catch (error) {
        console.error("AI Analysis Error:", error);
        aiContent.innerHTML = "❌ AI विश्लेषण गर्दा प्राविधिक समस्या आयो। कृपया फेरि प्रयास गर्नुहोस्।";
    }
}


async function downloadStatusSummaryPDF() {
    const content = document.getElementById('statusSummaryContent');
    if (!content) return;

    const modal = document.getElementById('statusSummaryModal');
    const title = modal?.querySelector('.modal-title')?.textContent || "Status Summary";
    const aiSection = document.getElementById('aiAnalysisSection');


    const element = document.createElement('div');
    element.style.padding = '30px';
    element.style.fontFamily = "'Kalimati', sans-serif";


    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '20px';
    header.innerHTML = `
        <h2 style="color: #306a95; margin-bottom: 5px;">${title}</h2>
        <p style="margin: 0; font-size: 1.1rem;">राष्ट्रिय सतर्कता केन्द्र</p>
        <hr style="border: 0; border-top: 2px solid #306a95; margin: 15px 0;">
    `;
    element.appendChild(header);


    if (aiSection && aiSection.style.display !== 'none') {
        const aiClone = aiSection.cloneNode(true);
        aiClone.style.display = 'block';
        aiClone.style.marginBottom = '25px';
        aiClone.style.pageBreakInside = 'avoid';


        const aiBox = aiClone.querySelector('div');
        if (aiBox) {
            aiBox.style.boxShadow = 'none';
            aiBox.style.border = '1px solid #cbd5e0';
        }
        element.appendChild(aiClone);
    }


    const clone = content.cloneNode(true);


    clone.querySelectorAll('.summary-section').forEach(sec => {
        sec.style.pageBreakInside = 'avoid';
        sec.style.marginBottom = '15px';
        sec.style.display = 'block';
    });


    clone.querySelectorAll('.summary-grid').forEach(grid => {
        grid.style.display = 'block';
    });
    clone.querySelectorAll('.summary-item').forEach(item => {
        item.style.padding = '8px 0';
        item.style.borderBottom = '1px solid #eee';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.pageBreakInside = 'avoid';
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


    const pradeshFilter = (document.getElementById("filterPradesh")?.value || "").trim();
    const districtFilter = (document.getElementById("filterDistrict")?.value || "").trim();
    const sthaaniyaFilter = (document.getElementById("filterSthaaniya")?.value || "").trim();
    const officeFilter = (document.getElementById("filterOffice")?.value || "").toLowerCase().trim();


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

            modalTitleEl.innerHTML = '';
            span = document.createElement('span');
            span.className = 'title-text';
            modalTitleEl.appendChild(span);


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


    let monitoringSummary, surveySummary, attendanceSummary;

    if (showAll) {

        monitoringSummary = calculateMonitoringSummary(monitoringData);
        surveySummary = calculateSurveySummary(surveyData);
        attendanceSummary = calculateAttendanceSummary(attendanceData);
    } else {

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


    document.getElementById('a_absent_today').textContent = toNepaliDigits(attendanceSummary.absent_today);
    document.getElementById('a_absent_prev').textContent = toNepaliDigits(attendanceSummary.absent_prev);
    document.getElementById('a_no_uniform').textContent = toNepaliDigits(attendanceSummary.no_uniform);
    document.getElementById('a_not_in_room').textContent = toNepaliDigits(attendanceSummary.not_in_room);


    modal.style.display = 'flex';


    getAIStatusAnalysis(locationText, monitoringSummary, surveySummary, attendanceSummary);
}


function openCurrentDashboardSummary() {
    openStatusSummaryModal(false);
}


document.addEventListener('DOMContentLoaded', function () {

    const statusSummaryAllBtn = document.getElementById('statusSummaryAllBtn');
    if (statusSummaryAllBtn) {
        statusSummaryAllBtn.addEventListener('click', openStatusSummaryModal);
    }


    const closeStatusSummary = document.getElementById('closeStatusSummary');
    if (closeStatusSummary) {
        closeStatusSummary.addEventListener('click', function () {
            const modal = document.getElementById('statusSummaryModal');
            if (modal) modal.style.display = 'none';
        });
    }


    const statusSummaryModal = document.getElementById('statusSummaryModal');
    if (statusSummaryModal) {
        statusSummaryModal.addEventListener('click', function (e) {
            if (e.target === statusSummaryModal) {
                statusSummaryModal.style.display = 'none';
            }
        });
    }

    // ========== NEW FEATURE 1: REAL-TIME CLOCK ==========
    function initRealtimeClock() {
        const nepaliDateEl = document.getElementById('clockNepaliDate');
        const nepaliTimeEl = document.getElementById('clockNepaliTime');
        const englishDateEl = document.getElementById('clockEnglishDate');
        function updateClock() {
            const now = new Date();
            if (englishDateEl) englishDateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
            if (nepaliTimeEl) {
                const h = String(now.getHours()).padStart(2, '0');
                const m = String(now.getMinutes()).padStart(2, '0');
                const s = String(now.getSeconds()).padStart(2, '0');
                nepaliTimeEl.innerHTML = '<i class="fas fa-clock mr-1"></i>' + h + ':' + m + ':' + s;
            }
            if (nepaliDateEl) {
                const bs = estimateCurrentBsDate();
                const days = ['आइतबार', 'सोमबार', 'मङ्गलबार', 'बुधबार', 'बिहीबार', 'शुक्रबार', 'शनिबार'];
                nepaliDateEl.innerHTML = '<i class="fas fa-calendar-alt mr-1"></i>' + days[now.getDay()] + ', ' + formatNepaliDateParts(bs.year, bs.month, bs.day);
            }
        }
        updateClock();
        setInterval(updateClock, 1000);
    }

    // ========== NEW FEATURE 2: AUTO-REFRESH TOGGLE ==========
    let autoRefreshInterval = null;
    function initAutoRefresh() {
        const btn = document.getElementById('autoRefreshToggle');
        const ind = document.getElementById('autoRefreshIndicator');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval); autoRefreshInterval = null;
                btn.classList.remove('active');
                if (ind) ind.classList.add('hidden');
                btn.title = 'अटो-रिफ्रेस गर्नुहोस्';
                showToast('⏸️ अटो-रिफ्रेस रद्द', 'info', 2000);
            } else {
                autoRefreshInterval = setInterval(function () {
                    refreshDashboard();
                    showToast('🔄 तथ्याङ्क स्वतः रिफ्रेस', 'info', 1500);
                }, 30000);
                btn.classList.add('active');
                if (ind) ind.classList.remove('hidden');
                btn.title = 'अटो-रिफ्रेस रद्द गर्नुहोस्';
                showToast('🔄 अटो-रिफ्रेस सफल', 'success', 2000);
            }
            playClickSound();
        });
    }

    // ========== NEW FEATURE 4: ENHANCED EXPORT ==========
    function openEnhancedExportModal() {
        let count = 0;
        if (currentDashboardView === 'survey') count = currentFilteredSubmissions.length;
        else if (currentDashboardView === 'monitoring') count = currentFilteredMonitorings.length;
        else if (currentDashboardView === 'attendance') count = currentFilteredAttendance.length;
        if (!count) return Swal.fire({ icon: 'info', text: 'निर्यात गर्न डाटा छैन।', confirmButtonColor: '#387ae6' });

        const existing = document.querySelector('.enhanced-export-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'enhanced-export-overlay';
        overlay.innerHTML = '<div class="enhanced-export-modal"><div class="enhanced-export-header"><h3><i class="fas fa-file-export"></i>PDF Export (चार्ट सहित)</h3><button class="modal-close-btn" id="closeEnhancedExport" style="position:static;background:transparent;color:#94a3b8;"><i class="fas fa-times"></i></button></div><div class="enhanced-export-body"><div class="enhanced-export-preview" id="exportPreviewContainer"><div style="text-align:center;color:#94a3b8;"><i class="fas fa-chart-simple" style="font-size:3rem;margin-bottom:10px;display:block;"></i><span>चार्ट पूर्वावलोकन</span></div></div><div class="enhanced-export-options"><div class="enhanced-export-option active" data-type="excel"><i class="fas fa-file-excel" style="color:#1d6f42;"></i><span>Excel</span></div><div class="enhanced-export-option" data-type="pdf"><i class="fas fa-file-pdf" style="color:#e74c3c;"></i><span>PDF (चार्ट सहित)</span></div></div><p style="font-size:0.8rem;color:#94a3b8;text-align:center;margin-bottom:12px;"><i class="fas fa-info-circle"></i> ' + (currentDashboardView === 'survey' ? 'सर्वेक्षण' : currentDashboardView === 'monitoring' ? 'अनुगमन' : 'पोशाक') + ' डेटा (' + toNepaliDigits(count) + ' रेकर्ड)</p><div class="enhanced-export-actions"><button class="enhanced-export-btn-secondary" id="cancelEnhancedExport">रद्द</button><button class="enhanced-export-btn-primary" id="confirmEnhancedExport"><i class="fas fa-download"></i> डाउनलोड</button></div></div></div>';
        document.body.appendChild(overlay);

        setTimeout(() => {
            const pc = document.getElementById('exportPreviewContainer');
            if (pc) {
                const ids = ['dynamicChart', 'genderChart', 'satisfactionChart', 'charterClarityChart'];
                let canvas = null;
                for (const id of ids) {
                    const c = document.getElementById(id);
                    if (c && c.width > 0) { canvas = c; break; }
                }
                if (canvas) {
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL('image/png');
                    img.style.maxWidth = '100%'; img.style.maxHeight = '180px'; img.style.borderRadius = '8px';
                    pc.innerHTML = ''; pc.appendChild(img);
                }
            }
        }, 200);

        let selectedType = 'excel';
        overlay.querySelectorAll('.enhanced-export-option').forEach(opt => {
            opt.addEventListener('click', function () {
                overlay.querySelectorAll('.enhanced-export-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                selectedType = this.dataset.type;
            });
        });

        const closeFn = () => overlay.remove();
        overlay.querySelector('#closeEnhancedExport').addEventListener('click', closeFn);
        overlay.querySelector('#cancelEnhancedExport').addEventListener('click', closeFn);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeFn(); });

        overlay.querySelector('#confirmEnhancedExport').addEventListener('click', function () {
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> निर्यात...';
            this.disabled = true;
            setTimeout(() => {
                if (selectedType === 'excel') exportToExcel();
                else exportEnhancedPDF();
                closeFn();
            }, 300);
        });
    }

    function exportEnhancedPDF() {
        const wrapper = document.createElement('div');
        wrapper.style.padding = '25px'; wrapper.style.fontFamily = "'Kalimati',sans-serif"; wrapper.style.background = '#fff';
        const title = currentDashboardView === 'survey' ? 'सेवाग्राही सर्वेक्षण रिपोर्ट' : currentDashboardView === 'monitoring' ? 'कार्यालय अनुगमन रिपोर्ट' : 'समय पालना/पोशाक अनुगमन रिपोर्ट';
        wrapper.innerHTML = '<div style="text-align:center;margin-bottom:20px;"><h2 style="color:#306a95;">राष्ट्रिय सतर्कता केन्द्र</h2><h3 style="color:#4a5568;">' + title + '</h3><hr style="border:0;border-top:2px solid #306a95;margin:10px 0;"></div>';

        const stats = document.getElementById('statCardsContainer');
        if (stats) {
            const s = stats.cloneNode(true);
            s.style.display = 'flex'; s.style.flexWrap = 'wrap'; s.style.gap = '10px'; s.style.marginBottom = '20px';
            s.querySelectorAll('.stat-card').forEach(c => { c.style.flex = '1'; c.style.minWidth = '120px'; c.style.padding = '12px'; c.style.border = '1px solid #e2e8f0'; c.style.borderRadius = '10px'; c.style.textAlign = 'center'; });
            wrapper.appendChild(s);
        }

        const chartIds = [{ id: 'dynamicChart', label: 'चार्ट' }, { id: 'genderChart', label: 'लिङ्ग' }, { id: 'satisfactionChart', label: 'सन्तुष्टि' }, { id: 'charterClarityChart', label: 'बडापत्र' }];
        let section = document.createElement('div');
        section.style.display = 'flex'; section.style.flexWrap = 'wrap'; section.style.gap = '15px'; section.style.marginBottom = '20px'; section.style.justifyContent = 'center';
        chartIds.forEach(({ id, label }) => {
            const c = document.getElementById(id);
            if (c && c.width > 0) {
                try {
                    const d = c.toDataURL('image/png');
                    const div = document.createElement('div');
                    div.style.flex = '1'; div.style.minWidth = '250px'; div.style.maxWidth = '350px'; div.style.textAlign = 'center'; div.style.border = '1px solid #e2e8f0'; div.style.borderRadius = '10px'; div.style.padding = '10px';
                    div.innerHTML = '<img src="' + d + '" style="width:100%;max-height:180px;object-fit:contain;"><p style="font-size:0.8rem;color:#4a5568;margin-top:8px;font-weight:600;">' + label + '</p>';
                    section.appendChild(div);
                } catch (e) { }
            }
        });
        if (section.children.length > 0) wrapper.appendChild(section);

        const tw = document.querySelector('.table-wrapper');
        if (tw) { const tc = tw.cloneNode(true); tc.style.marginTop = '15px'; wrapper.appendChild(tc); }

        html2pdf().set({ margin: [0.4, 0.4, 0.4, 0.4], filename: (currentDashboardView === 'survey' ? 'Survey' : currentDashboardView === 'monitoring' ? 'Monitoring' : 'Attendance') + '_With_Charts.pdf', image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } }).from(wrapper).save();
    }

    // Initialize new features
    initRealtimeClock();
    initAutoRefresh();
    document.getElementById('enhancedExportBtn')?.addEventListener('click', openEnhancedExportModal);
});

if (document.getElementById("toggleMapBtn")) {
    window.toggleMapVisibility = toggleMapVisibility;
}

/**
 * Delete a record by timestamp
 * @param {string} timestamp 
 * @param {string} type 
 */
async function deleteRecord(timestamp, type) {
    if (!timestamp) return;

    const result = await Swal.fire({
        title: 'के तपाई निश्चित हुनुहुन्छ?',
        text: "यो रेकर्ड मेटाइएपछि फिर्ता ल्याउन सकिँदैन!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'हो, मेटाउनुहोस्',
        cancelButtonText: 'रद्द गर्नुहोस्'
    });

    if (result.isConfirmed) {
        Swal.fire({
            title: 'मेटाउँदैछ...',
            text: 'कृपया पर्खनुहोस्',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const payload = { action: 'delete', timestamp: timestamp, type: type };
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            const resText = await response.text();

            if (resText === "Success") {
                // Remove locally
                if (type === 'survey') {
                    allSubmissions = allSubmissions.filter(r => String(r.timestamp) !== String(timestamp));
                    localStorage.setItem("surveyData_nsc", JSON.stringify(allSubmissions));
                } else if (type === 'monitoring') {
                    allMonitorings = allMonitorings.filter(r => String(r.timestamp) !== String(timestamp));
                    localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));
                } else if (type === 'attendance') {
                    allAttendanceMonitorings = allAttendanceMonitorings.filter(r => String(r.timestamp) !== String(timestamp));
                    if (allAttendanceMonitorings.length > 0 && allAttendanceMonitorings[0].rows !== undefined) {
                        // for grouped format, not needed if we filter properly
                    }
                    localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));
                }

                refreshDashboard();

                Swal.fire({
                    icon: 'success',
                    title: 'मेटाइयो!',
                    text: 'रेकर्ड सफलतापूर्वक मेटाइएको छ।',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                throw new Error(resText);
            }
        } catch (error) {
            console.error("Delete Error:", error);
            Swal.fire({
                icon: 'error',
                title: 'त्रुटि',
                text: 'रेकर्ड मेटाउन समस्या भयो। कृपया फेरि प्रयास गर्नुहोस्।',
            });
        }
    }
}

// Edit Record Logic
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

window.editRecord = function (timestamp, type) {
    window.editingRecord = { timestamp, type };

    if (type === 'survey') {
        const record = allSubmissions.find(r => String(r.timestamp) === String(timestamp));
        if (record) {
            const tabBtn = document.querySelector('.nav-btn[data-tab="form-tab"]');
            if (tabBtn) tabBtn.click();
            document.getElementById("surveyForm").reset();
            setTimeout(() => {
                Object.keys(record).forEach(key => setFieldValue(key, record[key]));
                document.getElementById("submitSurvey").innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';
            }, 100);
        }
    } else if (type === 'monitoring') {
        const record = allMonitorings.find(r => String(r.timestamp) === String(timestamp));
        if (record) {
            const tabBtn = document.querySelector('.nav-btn[data-tab="monitoring-tab"]');
            if (tabBtn) tabBtn.click();
            document.getElementById("monitoringForm").reset();
            setTimeout(() => {
                Object.keys(record).forEach(key => setFieldValue(key, record[key]));
                document.getElementById("submitMonitoring").innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';
            }, 100);
        }
    } else if (type === 'attendance') {
        const record = allAttendanceMonitorings.find(r => String(r.timestamp) === String(timestamp));
        if (record) {
            const tabBtn = document.querySelector('.nav-btn[data-tab="attendance-tab"]');
            if (tabBtn) tabBtn.click();
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
                            tr.innerHTML = `
                                <td><select class="category-select" required><option value="ढिला उपस्थित">ढिला उपस्थित</option><option value="पोशाक नलगाएको">पोशाक नलगाएको</option><option value="ढिला र पोशाक दुवै">ढिला र पोशाक दुवै</option><option value="अनुपस्थित">अनुपस्थित</option><option value="अन्य">अन्य</option></select></td>
                                <td><input type="text" class="rank-input" placeholder="पद" required></td>
                                <td><input type="text" class="symbol-input" placeholder="संकेत नं."></td>
                                <td><input type="text" class="name-input" placeholder="नाम" required></td>
                                <td><input type="text" class="extra-input" placeholder="कैफियत"></td>
                                <td><button type="button" class="action-btn btn-delete" onclick="this.closest('tr').remove()" title="हटाउनुहोस्"><i class="fas fa-trash"></i></button></td>
                            `;
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

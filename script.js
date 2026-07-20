

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwdJoqszo8rgNY-V2yiUIXndB5TeTIPabBT0D-EWKANZ-d9_3y-snblclYVvpuRQmBx/exec";





let allSubmissions = [];

let allMonitorings = [];

let allAttendanceMonitorings = [];

let currentFilteredSubmissions = [];
let currentFilteredMonitorings = [];
let currentFilteredAttendance = [];
let currentFilteredProjectMonitorings = [];

let mapObj = null;
let districtLayerGroup = null;
let localLevelLayerGroup = null;

let currentPage = 1;
let itemsPerPage = 10;

// App-wide UI/settings globals
let currentDashboardView = 'monitoring';
let dismissedAlerts = new Set(JSON.parse(localStorage.getItem("dismissedAlerts_nsc") || "[]"));
let showAllAlertsMode = false;
let autoRefreshInterval = null;
const SETTINGS_STORAGE_KEY = 'nsc_settings';
const DEFAULT_SETTINGS = {
    theme: 'default',
    darkMode: false,
    autoRefresh: false
};
let appSettings = { ...DEFAULT_SETTINGS };

function getCurrentUserVisibilityContext() {
    try {
        const candidates = [
            sessionStorage.getItem('loggedInUser'),
            localStorage.getItem('currentUser'),
            localStorage.getItem('loggedInUser')
        ];

        for (const raw of candidates) {
            if (!raw) continue;

            let parsed = raw;
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                // keep raw string as-is
            }

            if (parsed && typeof parsed === 'object') {
                const role = parsed.role || parsed.userRole || '';
                const roleLower = String(role).toLowerCase();
                const province = parsed.province || parsed.pradesh || '';
                const district = parsed.district || parsed.jilla || '';
                const localLevel = parsed.localLevel || parsed.local_level || parsed.locallevel || '';
                const ministry = parsed.ministry || '';
                return {
                    isSuperAdmin: roleLower === 'superadmin',
                    isAdmin: roleLower === 'admin',
                    isProvinceAdmin: roleLower === 'province_admin',
                    isDistrictAdmin: roleLower === 'district_admin',
                    isLocalLevelUser: roleLower === 'local_level_user' || roleLower === 'user',
                    role: roleLower,
                    province: String(province || '').trim(),
                    district: String(district || '').trim(),
                    localLevel: String(localLevel || '').trim(),
                    ministry: String(ministry || '').trim()
                };
            }

            if (typeof parsed === 'string' && parsed.trim()) {
                return {
                    isAdmin: parsed.toLowerCase().includes('admin'),
                    isProvinceAdmin: false,
                    isDistrictAdmin: false,
                    isLocalLevelUser: true,
                    role: 'user',
                    province: '',
                    district: '',
                    localLevel: ''
                };
            }
        }
    } catch (e) {
        console.warn('Unable to read current user visibility context:', e);
    }

    return { isSuperAdmin: false, isAdmin: false, isProvinceAdmin: false, isDistrictAdmin: false, isLocalLevelUser: true, role: 'user', province: '', district: '', localLevel: '', ministry: '' };
}

function saveCachedUsersData(users) {
    try {
        if (Array.isArray(users)) {
            localStorage.setItem('usersData_nsc', JSON.stringify(users));
        }
    } catch (e) {
        // ignore
    }
}

function getCachedUsersData() {
    try {
        const cached = localStorage.getItem('usersData_nsc');
        if (!cached) return [];
        const parsed = JSON.parse(cached);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

async function requestAppsScript(payload, options = {}) {
    const method = options.method || 'POST';
    const timeoutMs = options.timeoutMs || 30000;
    const payloadData = method === 'POST' ? JSON.stringify(payload) : undefined;
    const requestUrl = method === 'POST' ? SCRIPT_URL : `${SCRIPT_URL}?${new URLSearchParams(payload).toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(requestUrl, {
            method,
            body: payloadData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const text = await response.text();
        const parsed = (() => {
            try {
                return JSON.parse(text);
            } catch (e) {
                return null;
            }
        })();
        const responsePayload = parsed && typeof parsed === 'object' ? parsed : null;
        const responseWrapper = {
            ok: response.ok,
            status: response.status,
            raw: text,
            data: responsePayload,
            text: async () => text,
            json: async () => {
                if (responsePayload !== null) return responsePayload;
                return { status: 'error', message: 'Invalid JSON response from server.' };
            }
        };
        if (!response.ok) {
            return Object.assign(responseWrapper, { status: 'error', message: `Server returned ${response.status}` });
        }
        if (responsePayload) {
            return Object.assign(responseWrapper, responsePayload, { data: responsePayload });
        }
        return responseWrapper;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err && err.name === 'AbortError') {
            const timeoutError = new Error('सर्भरले प्रतिक्रिया दिएको छैन। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।');
            timeoutError.name = 'AbortError';
            throw timeoutError;
        }
        if (method === 'POST' && options.fallbackToGet !== false) {
            return requestAppsScript(payload, { method: 'GET', fallbackToGet: false, timeoutMs: timeoutMs + 10000 });
        }
        throw err;
    }
}

// Load all users

document.getElementById('loadUsersBtn')?.addEventListener('click', async function () {

    const cachedUsers = getCachedUsersData();

    if (cachedUsers.length) {
        displayUsers(cachedUsers, 'all');
    }

    try {
        Swal.fire({ icon: 'info', text: 'प्रयोगकर्ताहरू लोड हुँदैछ...', allowOutsideClick: false, showConfirmButton: false });

        const result = await requestAppsScript({ action: 'get_all_users' });

        Swal.close();

        if (result && result.status === 'success') {
            const users = Array.isArray(result.users) ? result.users : [];
            saveCachedUsersData(users);
            displayUsers(users, 'all');
            return;
        }

        if (cachedUsers.length) {
            displayUsers(cachedUsers, 'all');
            Swal.fire({ icon: 'warning', text: (result && result.message) ? result.message : 'सर्भरले डाटा फर्काएन — cached डाटा देखाइयो।' });
            return;
        }

        Swal.fire({ icon: 'error', text: (result && result.message) ? result.message : 'अज्ञात त्रुटि भयो' });

    } catch (error) {
        Swal.close();
        let errorMessage = 'सर्भरमा जडान गर्न सकिएन। कृपया इन्टरनेट कनेक्सन जाँच गर्नुहोस् वा पछि फेरि प्रयास गर्नुहोस्।';
        if (error && error.message && error.message.includes('404')) {
            errorMessage = 'सर्भर उपलब्ध छैन। कृपया प्रशासकलाई सम्पर्क गर्नुहोस्।';
        } else if (error && error.message && error.message.includes('Failed to fetch')) {
            errorMessage = 'नेटवर्क त्रुटि। कृपया इन्टरनेट कनेक्सन जाँच गर्नुहोस्।';
        }

        if (cachedUsers.length) {
            displayUsers(cachedUsers, 'all');
            Swal.fire({ icon: 'warning', text: 'सर्भरमा पहुँच भएन। cached डाटा देखाइयो।' });
        } else {
            Swal.fire({ icon: 'error', text: errorMessage });
        }

        console.error(error);
    }

});

function normalizeMonitoringRecord(record) {

    if (!record || typeof record !== 'object') return record;

    if (!record.m_sthaaniya) {

        record.m_sthaaniya = record.sthaaniya || record['स्थानीय तह'] || record.localLevel || record.local_level || record.locallevel || '';

    }

    return record;

}

function normalizeVisibilityValue(value) {
    if (value === null || value === undefined) return '';

    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }

    if (typeof value === 'number') {
        return String(value).trim().toLowerCase();
    }

    try {
        return String(value).trim().toLowerCase();
    } catch (e) {
        return '';
    }
}

function shouldShowRecordForCurrentUser(record, locationFields = {}) {

    const context = getCurrentUserVisibilityContext();



    // SuperAdmin sees everything

    if (context.isSuperAdmin) return true;



    // Get record's location info

    const recordProvince = normalizeVisibilityValue(locationFields.province || record.pradesh || record.province || '');

    const recordDistrict = normalizeVisibilityValue(locationFields.district || record.jilla || record.district || '');

    const recordLocalLevel = normalizeVisibilityValue(locationFields.localLevel || record.sthaaniya_taha || record.m_sthaaniya || record.localLevel || '');

    const recordMinistry = normalizeVisibilityValue(locationFields.ministry || record.ministry || '');



    // Admin: can see records in their ministry only

    if (context.isAdmin) {

        if (!context.ministry || !recordMinistry) return false;

        return recordMinistry === context.ministry || recordMinistry.includes(context.ministry) || context.ministry.includes(recordMinistry);

    }



    // Province Admin: can see all records in their province (all districts and local levels within province)

    if (context.isProvinceAdmin) {

        if (!context.province || !recordProvince) return false;

        return recordProvince === context.province || recordProvince.includes(context.province) || context.province.includes(recordProvince);

    }



    // District Admin: can see all records in their district (all local levels within district)

    if (context.isDistrictAdmin) {

        if (!context.district || !recordDistrict) return false;

        return recordDistrict === context.district || recordDistrict.includes(context.district) || context.district.includes(recordDistrict);

    }



    // Local Level User: can see only their local level records

    if (context.isLocalLevelUser) {

        const userLocalLevel = normalizeVisibilityValue(context.localLevel);

        if (!userLocalLevel || !recordLocalLevel) return false;

        return recordLocalLevel === userLocalLevel || recordLocalLevel.includes(userLocalLevel) || userLocalLevel.includes(recordLocalLevel);

    }



    return false;

}



// Audit Log Variables

let allAuditLogs = [];

let filteredAuditLogs = [];

let currentAuditPage = 1;

let auditItemsPerPage = 20;

let auditLogsLoaded = false;





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



function normalizeDistrictKey(value) {

    return String(value || '')

        .trim()

        .toLowerCase()

        .replace(/\s+/g, ' ')

        .replace(/[।،,\-_/()]/g, '')

        .replace(/व/g, 'ब');

}



function resolveDistrictName(value) {

    if (!value) return '';



    const direct = String(value).trim();

    if (direct && (districtData && districtData[direct])) return direct;

    if (direct && DISTRICT_COORDS[direct]) return direct;



    const mapped = DISTRICT_NAME_MAP[direct.toUpperCase()] || '';

    if (mapped && DISTRICT_COORDS[mapped]) return mapped;



    const normalizedInput = normalizeDistrictKey(direct);

    const districtCandidates = [

        ...Object.keys(DISTRICT_COORDS || {}),

        ...Object.keys(districtData || {}),

        ...Object.values(DISTRICT_NAME_MAP || {})

    ];



    const match = districtCandidates.find(candidate => normalizeDistrictKey(candidate) === normalizedInput);

    if (match) return match;



    const partial = districtCandidates.find(candidate => normalizeDistrictKey(candidate).includes(normalizedInput) || normalizedInput.includes(normalizeDistrictKey(candidate)));

    return partial || direct;

}



const DISTRICT_NAME_MAP = {

    'LAMJUNG': 'लमजुङ',

    'SYANGJA': 'स्याङ्जा',

    'GULMI': 'गुल्मी',

    'SURKHET': 'सुर्खेत',

    'KASKI': 'कास्की',

    'MYAGDI': 'म्याग्दी',

    'GORKHA': 'गोरखा',

    'DHADING': 'धादिङ',

    'PARSA': 'पर्सा',

    'KATHMANDU': 'काठमाडौं',

    'PARBAT': 'पर्वत',

    'BAGLUNG': 'बागलुङ',

    'NAWALPARASI': 'नवलपरासी (बर्दघाट सुस्ता पश्चिम)',

    'PALPA': 'पाल्पा',

    'RUPANDEHI': 'रुपन्देही',

    'KAPILBASTU': 'कपिलवस्तु',

    'ARGHAKHANCHI': 'अर्घाखाँची',

    'MANANG': 'मनाङ',

    'MUSTANG': 'मुस्ताङ',

    'DHANUSA': 'धनुषा',

    'SINDHUPALCHOK': 'सिन्धुपाल्चोक',

    'ILAM': 'इलाम',

    'JHAPA': 'झापा',

    'TAPLEJUNG': 'ताप्लेजुङ',

    'PANCHTHAR': 'पाँचथर',

    'OKHALDHUNGA': 'ओखलढुंगा',

    'KHOTANG': 'खोटाङ',

    'SOLUKHUMBU': 'सोलुखुम्बु',

    'SUNSARI': 'सुनसरी',

    'TEHRATHUM': 'तेह्रथुम',

    'SANKHUWASABHA': 'संखुवासभा',

    'BHOJPUR': 'भोजपुर',

    'DHANKUTA': 'धनकुटा',

    'MORANG': 'मोरङ',

    'UDAYAPUR': 'उदयपुर',

    'SAPTARI': 'सप्तरी',

    'SIRAHA': 'सिरहा',

    'MAHOTTARI': 'महोत्तरी',

    'SARLAHI': 'सर्लाही',

    'RAUTAHAT': 'रौतहट',

    'BARA': 'बारा',

    'CHITWAN': 'चितवन',

    'CHITAWAN': 'चितवन',

    'MAKWANPUR': 'मकवानपुर',

    'MAKAWANPUR': 'मकवानपुर',

    'BHAKTAPUR': 'भक्तपुर',

    'LALITPUR': 'ललितपुर',

    'NUWAKOT': 'नुवाकोट',

    'RASUWA': 'रसुवा',

    'KAVRE': 'काभ्रेपलाञ्चोक',

    'KABHREPALANCHOK': 'काभ्रेपलाञ्चोक',

    'SINDHULI': 'सिन्धुली',

    'RAMECHHAP': 'रामेछाप',

    'DOLAKHA': 'दोलखा',

    'DANG': 'दाङ',

    'PYUTHAN': 'प्युठान',

    'ROLPA': 'रोल्पा',

    'DOLPA': 'डोल्पा',

    'MUGU': 'मुगु',

    'ACHHAM': 'अछाम',

    'ACCHAM': 'अछाम',

    'RUKUM': 'रुकुम (पूर्व)',

    'SALYAN': 'सल्यान',

    'JUMLA': 'जुम्ला',

    'HUMLA': 'हुम्ला',

    'KALIKOT': 'कालिकोट',

    'DAILEKH': 'दैलेख',

    'JAJARKOT': 'जाजरकोट',

    'BARDIYA': 'बर्दिया',

    'BANKE': 'बाँके',

    'BAJURA': 'बाजुरा',

    'BAJHANG': 'बझाङ',

    'DADELDHURA': 'डडेल्धुरा',

    'DADHELDHURA': 'डडेल्धुरा',

    'DARCHULA': 'दार्चुला',

    'BAITADI': 'बैतडी',

    'DOTI': 'डोटी',

    'KAILALI': 'कैलाली',

    'KANCHANPUR': 'कञ्चनपुर',

    'TANAHU': 'तनहुँ',

    // Additional variations from GeoJSON

    'DHANUSHA': 'धनुषा',

    'NAWALPARASI EAST': 'नवलपरासी (बर्दघाट सुस्ता पूर्व)',

    'NAWALPARASI WEST': 'नवलपरासी (बर्दघाट सुस्ता पश्चिम)',

    'RUKUM EAST': 'रुकुम (पूर्व)',

    'RUKUM WEST': 'रुकुम (पश्चिम)',

    'TERHATHUM': 'तेह्रथुम'

};





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



/* Project modal view/edit handlers */

function showProjectModal(timestamp, editable = false) {

    const container = document.getElementById('projectModalContainer');

    const titleEl = document.getElementById('projectModalTitle');

    const contentEl = document.getElementById('projectModalContent');

    const saveBtn = document.getElementById('projectModalSaveBtn');

    const cancelBtn = document.getElementById('projectModalCancelBtn');



    const record = allProjectMonitorings.find(r => r.timestamp === timestamp);

    if (!record) return Swal.fire({ icon: 'info', text: 'रेकर्ड फेला परेन।' });



    titleEl.textContent = record.pm_project_name || 'आयोजना';

    contentEl.innerHTML = '';



    const fields = [

        ['pm_project_name', 'आयोजनाको नाम'],

        ['pm_monitoring_date', 'मिति'],

        ['pm_pradesh', 'प्रदेश'],

        ['pm_jilla', 'जिल्ला'],

        ['pm_sthaaniya_taha', 'स्थानीय तह'],

        ['pm_implementing_agency', 'कार्यान्वयन निकाय'],

        ['pm_contractor_name', 'ठेकेदार'],

        ['pm_physical_progress', 'भौतिक प्रगति (%)'],

        ['pm_approved_cost', 'स्वीकृत लागत (रु.)'],

        ['pm_spent_amount', 'खर्च भएको (रु.)'],

        ['pm_quality_1', 'गुणस्तर: डिजाइन मापदण्ड अनुरूप'],

        ['pm_quality_2', 'गुणस्तर: सामग्रीको गुणस्तर'],

        ['pm_quality_3', 'नियम पालन'],

        ['pm_quality_4', 'Lab Test भएको'],

        ['pm_economic_1', 'बजेट समयमै'],

        ['pm_economic_2', 'Schedule अनुसार'],

        ['pm_economic_3', 'लागतभित्र सम्पन्न'],

        ['pm_economic_4', 'Variation भएको'],

        ['pm_comment', 'अन्य टिप्पणी']

    ];

    function formatToLakhs(v) {

        const n = parseFloat(v) || 0;

        const lakhs = n / 100000;

        return `${toNepaliDigits(lakhs.toFixed(2))} लाख`;

    }



    fields.forEach(([key, label]) => {

        const val = record[key] || '';

        if (editable) {

            let inputValue = val;

            if (key === 'pm_approved_cost' || key === 'pm_spent_amount') {

                const n = parseFloat(val) || 0;

                inputValue = n.toFixed(2); // show in rupees for editing

            } else if (key === 'pm_physical_progress') {

                inputValue = parseFloat(val) || 0;

            } else if (key === 'pm_monitoring_date') {

                inputValue = val;

            }



            const el = document.createElement('div');

            el.style.marginBottom = '8px';

            el.innerHTML = `<label style="font-weight:700; display:block; margin-bottom:4px;">${label}</label>` +

                (key === 'pm_comment' ? `<textarea id="pm_field_${key}" style="width:100%; min-height:80px;">${inputValue}</textarea>` : `<input id="pm_field_${key}" style="width:100%; padding:6px;" value="${inputValue}">`);

            contentEl.appendChild(el);

        } else {

            let display = val || '-';

            if (key === 'pm_approved_cost' || key === 'pm_spent_amount') {

                const n = parseFloat(val) || 0;

                display = `रु. ${toNepaliDigits(n.toLocaleString())}`;

            } else if (key === 'pm_physical_progress') {

                display = `${toNepaliDigits(parseFloat(val) || 0)}%`;

            } else if (key === 'pm_monitoring_date') {

                display = toNepaliDigits(val || '-');

            } else {

                display = toNepaliDigits(display) || display;

            }



            const el = document.createElement('div');

            el.style.marginBottom = '6px';

            el.innerHTML = `<div style="font-weight:700; color:#334155">${label}</div><div style="color:#475569">${display || '-'}</div>`;

            contentEl.appendChild(el);

        }

    });



    if (editable) {

        saveBtn.style.display = '';

        cancelBtn.style.display = '';

        saveBtn.onclick = async () => {

            // collect values and update record (values entered as rupees)

            fields.forEach(([key]) => {

                const el = document.getElementById(`pm_field_${key}`);

                if (!el) return;

                let v = el.value;

                if (key === 'pm_approved_cost' || key === 'pm_spent_amount') {

                    const num = parseFloat(v) || 0;

                    record[key] = num.toString();

                } else if (key === 'pm_physical_progress') {

                    record[key] = v.toString();

                } else {

                    record[key] = v;

                }

            });



            // show saving indicator

            Swal.fire({ title: 'सेभ हुँदैछ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });



            const payload = { action: 'update', type: 'project-monitoring', timestamp: record.timestamp, data: record };

            try {

                const response = await requestAppsScript(payload);

                const resText = await response.text();

                if (resText === 'Success') {

                    try { localStorage.setItem('projectMonitoringData_nsc', JSON.stringify(allProjectMonitorings)); } catch (e) { }

                    refreshDashboard();

                    closeProjectModal();

                    Swal.fire({ icon: 'success', text: 'आयोजना विवरण सर्वरमा सुरक्षित भयो।', timer: 1500, showConfirmButton: false });

                    return;

                } else {

                    throw new Error(resText || 'Server error');

                }

            } catch (error) {

                console.error('Update Error:', error);

                // fallback: save locally and inform user

                try { localStorage.setItem('projectMonitoringData_nsc', JSON.stringify(allProjectMonitorings)); } catch (e) { }

                refreshDashboard();

                closeProjectModal();

                Swal.fire({ icon: 'warning', title: 'नेटवर्क समस्या', text: 'सर्भरमा सेभ विफल भयो, परिवर्तनहरू स्थानीय रुपमा सुरक्षित गरियो।' });

                return;

            }

        };

        cancelBtn.onclick = () => { closeProjectModal(); };

    } else {

        saveBtn.style.display = 'none';

        cancelBtn.style.display = 'none';

    }



    container.style.display = 'flex';

    document.body.style.overflow = 'hidden';

}



function closeProjectModal() {

    const container = document.getElementById('projectModalContainer');

    if (!container) return;

    container.style.display = 'none';

    document.body.style.overflow = '';

}



// attach close handlers

const closeProjectBtn = document.getElementById('closeProjectModal');

const projectModalContainer = document.getElementById('projectModalContainer');

if (closeProjectBtn && projectModalContainer) {

    closeProjectBtn.addEventListener('click', closeProjectModal);

    projectModalContainer.addEventListener('click', (e) => {

        if (e.target === projectModalContainer) closeProjectModal();

    });

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

    size: 9,

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

const MINISTRY = [
    'निर्माण मन्त्रालय',
    'गृह मन्त्रालय',
    'अर्थ मन्त्रालय',
    'शिक्षा मन्त्रालय',
    'स्वास्थ्य मन्त्रालय',
    'कृषि मन्त्रालय',
    'उद्योग मन्त्रालय',
    'पर्यटन मन्त्रालय',
    'सञ्चार मन्त्रालय',
    'जनसंख्या मन्त्रालय'
];





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



// Helpers to safely render AI output (strip code fences, escape HTML, and format paragraphs)

function escapeHtml(str) {

    return String(str || '')

        .replace(/&/g, '&amp;')

        .replace(/</g, '&lt;')

        .replace(/>/g, '&gt;')

        .replace(/"/g, '&quot;')

        .replace(/'/g, '&#39;');

}



function stripCodeFence(text) {

    if (!text) return '';

    let t = String(text);

    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    return t.trim();

}



function formatAiTextToParagraphs(text) {

    const cleaned = stripCodeFence(text);

    const escaped = escapeHtml(cleaned);

    return escaped.split(/\r?\n/).filter(l => l.trim()).map(p => '<p>' + p + '</p>').join('');

}



// Throttle helper: allow one invocation per `wait` ms. Shows a brief notice when suppressed.

function throttle(func, wait) {

    let last = 0;

    return function () {

        const now = Date.now();

        if (now - last >= wait) {

            last = now;

            try { return func.apply(this, arguments); } catch (e) { console.error(e); }

        } else {

            try { Swal.fire({ icon: 'info', text: 'कृपया केही समय पर्खनुहोस्।', timer: 1200, showConfirmButton: false }); } catch (e) { /* ignore */ }

        }

    };

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

    const pradeshSelects = [document.getElementById("pradesh"), document.getElementById("filterPradesh"), document.getElementById("m_pradesh"), document.getElementById("a_pradesh"), document.getElementById("pm_pradesh")];

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





function loadAppSettings() {

    try {

        const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);

        if (saved) {

            appSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };

        }

    } catch (e) {

        console.warn('Settings could not be loaded:', e);

        appSettings = { ...DEFAULT_SETTINGS };

    }



    if (typeof localStorage !== 'undefined') {

        localStorage.setItem('nsc_darkMode', appSettings.darkMode ? 'true' : 'false');

    }



    applyAppSettings();

    return appSettings;

}



function applyAppSettings() {

    const isDark = Boolean(appSettings.darkMode);

    const selectedTheme = appSettings.theme || 'default';

    activeTheme = selectedTheme;

    document.body.classList.toggle('dark-mode', isDark);

    localStorage.setItem('nsc_darkMode', isDark ? 'true' : 'false');



    const themeSelects = [document.getElementById('settingsThemeSelect'), document.getElementById('themeSelector')];

    themeSelects.forEach(select => {

        if (select) {

            select.value = appSettings.theme || 'default';

        }

    });



    const darkModeSwitch = document.getElementById('settingsDarkMode');

    if (darkModeSwitch) {

        darkModeSwitch.checked = isDark;

    }



    const autoRefreshSwitch = document.getElementById('settingsAutoRefresh');

    if (autoRefreshSwitch) {

        autoRefreshSwitch.checked = Boolean(appSettings.autoRefresh);

    }



    const toggleBtn = document.getElementById('themeToggleBtn');

    const icon = toggleBtn?.querySelector('i');

    if (icon) {

        icon.classList.toggle('fa-sun', isDark);

        icon.classList.toggle('fa-moon', !isDark);

    }



    if (typeof refreshDashboard === 'function') {

        refreshDashboard();

    }

}



function saveAppSettings() {

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));

    applyAppSettings();

}



function setAutoRefreshEnabled(enabled, showToastMessage = true) {

    appSettings.autoRefresh = Boolean(enabled);

    saveAppSettings();



    const btn = document.getElementById('autoRefreshToggle');

    const ind = document.getElementById('autoRefreshIndicator');

    if (btn) {

        btn.classList.toggle('active', Boolean(enabled));

        btn.title = enabled ? 'अटो-रिफ्रेस रद्द गर्नुहोस्' : 'अटो-रिफ्रेस गर्नुहोस्';

    }

    if (ind) {

        ind.classList.toggle('hidden', !enabled);

    }



    if (autoRefreshInterval) {

        clearInterval(autoRefreshInterval);

        autoRefreshInterval = null;

    }



    if (enabled) {

        autoRefreshInterval = setInterval(function () {

            if (typeof refreshDashboard === 'function') {

                refreshDashboard();

            }

            showToast('🔄 तथ्याङ्क स्वतः रिफ्रेस', 'info', 1500);

        }, 30000);

    }



    if (showToastMessage) {

        showToast(enabled ? '🔄 अटो-रिफ्रेस सक्रिय' : '⏸️ अटो-रिफ्रेस बन्द', enabled ? 'success' : 'info', 2000);

    }

}



function initSettingsPanel() {

    loadAppSettings();



    const form = document.getElementById('settingsForm');

    const themeSelect = document.getElementById('settingsThemeSelect');

    const darkModeSwitch = document.getElementById('settingsDarkMode');

    const autoRefreshSwitch = document.getElementById('settingsAutoRefresh');



    if (themeSelect) {

        themeSelect.addEventListener('change', function () {

            appSettings.theme = this.value || 'default';

            saveAppSettings();

        });

    }



    if (darkModeSwitch) {

        darkModeSwitch.addEventListener('change', function () {

            appSettings.darkMode = this.checked;

            saveAppSettings();

        });

    }



    if (autoRefreshSwitch) {

        autoRefreshSwitch.addEventListener('change', function () {

            setAutoRefreshEnabled(this.checked, true);

        });

    }



    if (form) {

        form.addEventListener('submit', function (e) {

            e.preventDefault();

            saveAppSettings();

            setAutoRefreshEnabled(Boolean(appSettings.autoRefresh), false);

            showToast('✅ सेटिङ्ग्स सुरक्षित गरियो', 'success', 2000);

        });

    }



    const clearAuditLogBtn = document.getElementById('clearAuditLogBtn');

    if (clearAuditLogBtn) {

        clearAuditLogBtn.addEventListener('click', clearAuditLog);

    }

}



async function clearAuditLog() {

    const confirmation = await Swal.fire({

        title: 'के तपाईं पक्का हुनुहुन्छ?',

        text: 'यो कार्यले सबै अडिट लग रिकर्डहरू स्थायी रूपमा मेट्छ।',

        icon: 'warning',

        showCancelButton: true,

        confirmButtonText: 'हो, मेटाउनूस्',

        cancelButtonText: 'रद्द गर्नुहोस्',

        reverseButtons: true

    });



    if (!confirmation.isConfirmed) {

        return;

    }



    try {

        Swal.fire({

            title: 'अडिट लग क्लियर हुँदैछ...',

            allowOutsideClick: false,

            didOpen: () => { Swal.showLoading(); }

        });



        const response = await requestAppsScript({ action: 'clear_audit_log' });

        const result = await response.json();

        Swal.close();



        if (result.status === 'success') {

            allAuditLogs = [];

            filteredAuditLogs = [];

            auditLogsLoaded = false;

            renderAuditLogTable();

            showToast('✅ अडिट लग सफलतापूर्वक क्लियर भयो', 'success', 2500);

        } else {

            Swal.fire({ icon: 'error', text: result.message || 'अडिट लग खाली गर्न असफल भयो।' });

        }

    } catch (error) {

        Swal.close();

        Swal.fire({ icon: 'error', text: 'अडिट लग क्लियर गर्दा त्रुटि आयो।' });

        console.error('clearAuditLog error:', error);

    }

}



function toggleDarkMode(shouldEnable = null) {

    const toggleBtn = document.getElementById('themeToggleBtn');

    const icon = toggleBtn?.querySelector('i');

    const resolved = shouldEnable === null ? !document.body.classList.contains('dark-mode') : Boolean(shouldEnable);



    document.body.classList.toggle('dark-mode', resolved);

    appSettings.darkMode = resolved;

    localStorage.setItem('nsc_darkMode', resolved ? 'true' : 'false');

    saveAppSettings();



    if (icon) {

        icon.classList.toggle('fa-sun', resolved);

        icon.classList.toggle('fa-moon', !resolved);

    }



    if (toggleBtn) {

        toggleBtn.setAttribute('aria-pressed', resolved ? 'true' : 'false');

    }



    playClickSound();



    if (typeof refreshDashboard === 'function') {

        refreshDashboard();

    }

}



// ========== DARK MODE SYSTEM ==========

function initDarkMode() {

    const toggleBtn = document.getElementById('themeToggleBtn');

    if (!toggleBtn) return;



    const isDark = Boolean(appSettings.darkMode);

    if (isDark) {

        document.body.classList.add('dark-mode');

    }



    toggleBtn.addEventListener('click', function () {

        toggleDarkMode();

    });



    const icon = toggleBtn.querySelector('i');

    if (icon) {

        icon.classList.toggle('fa-sun', isDark);

        icon.classList.toggle('fa-moon', !isDark);

    }

    toggleBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');

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



function reparentPanelsIntoWrapper() {

    const wrapper = document.getElementById('main-content-wrapper');

    if (!wrapper) return;



    const panels = Array.from(document.querySelectorAll('.panel'));

    panels.forEach(panel => {

        if (panel.parentElement !== wrapper) {

            wrapper.appendChild(panel);

        }

    });

}



// ========== SMOOTH TAB TRANSITIONS ==========

function initSmoothTabTransitions() {

    const tabBtns = document.querySelectorAll('.nav-btn[data-tab]');

    const panels = {

        'dashboard-tab': document.getElementById('dashboard-tab'),

        'form-tab': document.getElementById('form-tab'),

        'monitoring-tab': document.getElementById('monitoring-tab'),

        'attendance-tab': document.getElementById('attendance-tab'),

        'project-monitoring-tab': document.getElementById('project-monitoring-tab'),

        'schedule-tab': document.getElementById('schedule-tab'),

        'audit-log-tab': document.getElementById('audit-log-tab'),

        'user-management-tab': document.getElementById('user-management-tab'),

        'settings-tab': document.getElementById('settings-tab'),

        'change-password-tab': document.getElementById('change-password-tab')

    };



    const setActiveTabButton = (tabId) => {

        tabBtns.forEach(btn => {

            const isActive = btn.dataset.tab === tabId;

            btn.classList.toggle('active', isActive);

            btn.setAttribute('aria-current', isActive ? 'page' : 'false');

        });

    };



    tabBtns.forEach(btn => {

        btn.addEventListener('click', function (e) {

            e.preventDefault();

            const tabId = this.dataset.tab;

            const targetPanel = panels[tabId];

            if (!targetPanel) {

                console.warn('Tab panel not found for:', tabId);

                return;

            }



            document.querySelectorAll('.panel').forEach(panel => {

                if (panel && panel !== targetPanel) {

                    panel.classList.remove('active-panel');

                    panel.style.animation = '';

                }

            });



            targetPanel.classList.add('active-panel');

            targetPanel.style.animation = 'tabEnter 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';

            const wrapper = document.getElementById('main-content-wrapper');

            if (wrapper) {

                wrapper.style.minHeight = 'fit-content';

                wrapper.style.height = 'auto';

                wrapper.style.overflow = 'visible';

            }

            setTimeout(() => {

                targetPanel.style.animation = '';

                if (wrapper) {

                    wrapper.style.height = 'auto';

                }

            }, 400);



            setActiveTabButton(tabId);



            const scrollContainer = document.getElementById('main-scroll-area');

            if (scrollContainer) {

                scrollContainer.scrollTop = 0;

                scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });

            }



            if (tabId === 'dashboard-tab' && typeof switchDashboardView === 'function') {

                setTimeout(() => switchDashboardView(currentDashboardView), 300);

            }



            window.scrollTo({ top: 0, behavior: 'smooth' });

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

    // Ensure panels are rendered inside the main content wrapper

    reparentPanelsIntoWrapper();



    loadAppSettings();



    // Initialize dark mode

    initDarkMode();

    initSettingsPanel();



    // Initialize smooth tab transitions

    initSmoothTabTransitions();



    // Show admin menus for superadmin and admin roles
    const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
    const role = (user.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'superadmin';
    
    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.remove('hidden');
        });
    }



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

    document.getElementById("pm_pradesh")?.addEventListener("change", () => updateDistricts("pm_pradesh", "pm_jilla", "pm_sthaaniya_taha"));

    document.getElementById("pm_jilla")?.addEventListener("change", () => updateMunicipalities("pm_pradesh", "pm_jilla", "pm_sthaaniya_taha"));





    addAttendanceRow();

    addProjectMonitoringTeamRow();





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

        appSettings.theme = this.value;

        saveAppSettings();

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

    document.getElementById("filterFiscalYear")?.addEventListener("change", function () {

        console.log("Fiscal year changed to:", this.value);

        const fiscalYear = this.value;

        const dateFrom = document.getElementById("filterDateFrom");

        const dateTo = document.getElementById("filterDateTo");



        if (fiscalYear === "") {

            // सबै - clear dates

            dateFrom.value = "";

            dateTo.value = "";

        } else if (fiscalYear === "080/81") {

            dateFrom.value = "२०८० श्रावण १";

            dateTo.value = "२०८१ असार ३१";

        } else if (fiscalYear === "081/82") {

            dateFrom.value = "२०८१ श्रावण १";

            dateTo.value = "२०८२ असार ३१";

        } else if (fiscalYear === "082/83") {

            dateFrom.value = "२०८२ श्रावण १";

            dateTo.value = "२०८३ असार ३१";

        } else if (fiscalYear === "083/84") {

            dateFrom.value = "२०८३ श्रावण १";

            dateTo.value = "२०८४ असार ३१";

        }



        console.log("Date fields set to - From:", dateFrom.value, "To:", dateTo.value);

        // Trigger filter refresh

        currentPage = 1;

        refreshDashboard();

    });

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

            if (scrollTopBtn) scrollTopBtn.style.display = "flex";

        } else {

            if (scrollTopBtn) scrollTopBtn.style.display = "none";

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

            <button class="fab-action-btn" data-action="project-monitoring" title="आयोजना अनुगमन फारम">

                <i class="fas fa-hard-hat"></i>

                <span class="fab-label">आयोजना</span>

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

        .fab-main-btn { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#3b82f6,#3FD81E); color:white; border:none; cursor:pointer; box-shadow:0 4px 16px rgba(59,130,246,0.4); display:flex; align-items:center; justify-content:center; font-size:1.1rem; transition:all 0.3s cubic-bezier(0.4,0,0.2,1); }

        .fab-main-btn:hover { transform:scale(1.1) rotate(90deg); box-shadow:0 6px 20px rgba(63,216,30,0.5); }

        .fab-main-btn.active { transform:rotate(45deg); background:linear-gradient(135deg,#ef4444,#dc2626); }

        .fab-actions { display:none; flex-direction:column; gap:6px; align-items:flex-end; }

        .fab-actions.show { display:flex; animation:fabSlideIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards; }

        .fab-action-btn { display:flex; align-items:center; gap:8px; background:white; border:none; border-radius:24px; padding:8px 16px; cursor:pointer; box-shadow:0 2px 12px rgba(0,0,0,0.12); transition:all 0.2s ease; font-family:'Kalimati',sans-serif; font-size:0.78rem; color:#1e293b; font-weight:600; }

        .fab-action-btn:hover { transform:translateX(-6px) scale(1.05); box-shadow:0 4px 16px rgba(0,0,0,0.18); }

        .fab-action-btn i { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:0.8rem; }

        .fab-action-btn[data-action="survey"] i { background:linear-gradient(135deg,#3b82f6,#1d4ed8); }

        .fab-action-btn[data-action="monitoring"] i { background:linear-gradient(135deg,#14b8a6,#0d9488); }

        .fab-action-btn[data-action="attendance"] i { background:linear-gradient(135deg,#8b5cf6,#6d28d9); }

        .fab-action-btn[data-action="project-monitoring"] i { background:linear-gradient(135deg,#ef4444,#b91c1c); }

        .fab-action-btn[data-action="dashboard"] i { background:linear-gradient(135deg,#f97316,#ea580c); }

        .fab-action-btn[data-action="top"] i { background:linear-gradient(135deg,#64748b,#475569); }

        .fab-label { white-space:nowrap; }

        @keyframes fabSlideIn { from { opacity:0; transform:translateY(10px) scale(0.8); } to { opacity:1; transform:translateY(0) scale(1); } }

        .dark-mode .fab-action-btn { background:#1e293b; color:#e2e8f0; }

        @media (max-width:768px) { .fab-action-btn .fab-label { display:none; } .fab-action-btn { padding:8px 12px; } }

    `;

    document.head.appendChild(fabStyle);



    // FAB drag logic - make it draggable

    const fabContainerEl = document.getElementById('fabContainer');

    const fabMainBtn = document.getElementById('fabMain');

    let isDragging = false;

    let dragStartX, dragStartY, dragOrigLeft, dragOrigBottom;

    let dragClickPrevented = false;



    function initFabPosition() {

        const saved = localStorage.getItem('nsc_fab_position');

        if (saved) {

            const pos = JSON.parse(saved);

            fabContainerEl.style.right = pos.right;

            fabContainerEl.style.bottom = pos.bottom;

            fabContainerEl.style.left = 'auto';

            fabContainerEl.style.top = 'auto';

        }

    }

    initFabPosition();



    fabMainBtn.addEventListener('mousedown', function (e) {

        if (e.button !== 0) return;

        const rect = fabContainerEl.getBoundingClientRect();

        isDragging = false;

        dragClickPrevented = false;

        dragStartX = e.clientX;

        dragStartY = e.clientY;

        dragOrigLeft = rect.left;

        dragOrigBottom = window.innerHeight - rect.bottom;

        fabMainBtn.style.cursor = 'grabbing';

        fabMainBtn.style.transition = 'none';

        fabContainerEl.style.transition = 'none';

        e.preventDefault();

    });



    document.addEventListener('mousemove', function (e) {

        if (!fabMainBtn || fabMainBtn.style.cursor !== 'grabbing') return;

        const dx = e.clientX - dragStartX;

        const dy = e.clientY - dragStartY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {

            isDragging = true;

            dragClickPrevented = true;

        }

        if (isDragging) {

            const newLeft = dragOrigLeft + dx;

            const newBottom = dragOrigBottom - dy;

            fabContainerEl.style.left = newLeft + 'px';

            fabContainerEl.style.bottom = newBottom + 'px';

            fabContainerEl.style.right = 'auto';

            fabContainerEl.style.top = 'auto';

        }

    });



    document.addEventListener('mouseup', function () {

        if (fabMainBtn && fabMainBtn.style.cursor === 'grabbing') {

            fabMainBtn.style.cursor = 'pointer';

            fabMainBtn.style.transition = '';

            fabContainerEl.style.transition = '';

            if (isDragging) {

                const rect = fabContainerEl.getBoundingClientRect();

                const right = window.innerWidth - rect.left;

                const bottom = window.innerHeight - rect.bottom;

                // Clamp within viewport

                const clampedRight = Math.max(10, Math.min(right, window.innerWidth - 60));

                const clampedBottom = Math.max(10, Math.min(bottom, window.innerHeight - 60));

                fabContainerEl.style.left = 'auto';

                fabContainerEl.style.right = clampedRight + 'px';

                fabContainerEl.style.bottom = clampedBottom + 'px';

                fabContainerEl.style.top = 'auto';

                try {

                    localStorage.setItem('nsc_fab_position', JSON.stringify({ right: clampedRight + 'px', bottom: clampedBottom + 'px' }));

                } catch (e) { }

            }

        }

    });



    // Touch support

    fabMainBtn.addEventListener('touchstart', function (e) {

        const touch = e.touches[0];

        const rect = fabContainerEl.getBoundingClientRect();

        isDragging = false;

        dragClickPrevented = false;

        dragStartX = touch.clientX;

        dragStartY = touch.clientY;

        dragOrigLeft = rect.left;

        dragOrigBottom = window.innerHeight - rect.bottom;

        fabContainerEl.style.transition = 'none';

    }, { passive: true });



    document.addEventListener('touchmove', function (e) {

        if (!fabMainBtn || dragStartX === undefined) return;

        const touch = e.touches[0];

        const dx = touch.clientX - dragStartX;

        const dy = touch.clientY - dragStartY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {

            isDragging = true;

            dragClickPrevented = true;

        }

        if (isDragging) {

            const newLeft = dragOrigLeft + dx;

            const newBottom = dragOrigBottom - dy;

            fabContainerEl.style.left = newLeft + 'px';

            fabContainerEl.style.bottom = newBottom + 'px';

            fabContainerEl.style.right = 'auto';

            fabContainerEl.style.top = 'auto';

        }

    }, { passive: true });



    document.addEventListener('touchend', function () {

        if (fabMainBtn && isDragging) {

            fabContainerEl.style.transition = '';

            const rect = fabContainerEl.getBoundingClientRect();

            const right = window.innerWidth - rect.left;

            const bottom = window.innerHeight - rect.bottom;

            const clampedRight = Math.max(10, Math.min(right, window.innerWidth - 60));

            const clampedBottom = Math.max(10, Math.min(bottom, window.innerHeight - 60));

            fabContainerEl.style.left = 'auto';

            fabContainerEl.style.right = clampedRight + 'px';

            fabContainerEl.style.bottom = clampedBottom + 'px';

            fabContainerEl.style.top = 'auto';

            try {

                localStorage.setItem('nsc_fab_position', JSON.stringify({ right: clampedRight + 'px', bottom: clampedBottom + 'px' }));

            } catch (e) { }

            dragStartX = undefined;

            dragStartY = undefined;

        }

    }, { passive: true });



    // FAB toggle logic (only if not dragging)

    fabMainBtn?.addEventListener('click', function (e) {

        if (dragClickPrevented) {

            dragClickPrevented = false;

            return;

        }

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

            } else if (action === 'project-monitoring') {

                const projectBtn = document.querySelector('.nav-btn[data-tab="project-monitoring-tab"]');

                if (projectBtn) projectBtn.click();

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

    ,

    pmGeographicChart: 'bar',

    pmPhysicalProgressChart: 'bar',

    pmEconomicProgressChart: 'bar',

    pmQualityChart: 'bar',

    pmTimeManagementChart: 'bar',

    pmComplianceChart: 'pie',

    pmRiskChart: 'pie'

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

    ,

    pmGeographicChart: ['bar', 'pie', 'doughnut', 'line'],

    pmPhysicalProgressChart: ['bar', 'pie', 'doughnut', 'line'],

    pmEconomicProgressChart: ['bar', 'pie', 'doughnut', 'line'],

    pmQualityChart: ['bar', 'pie', 'doughnut', 'line'],

    pmTimeManagementChart: ['bar', 'pie', 'doughnut', 'line'],

    pmComplianceChart: ['pie', 'doughnut', 'bar', 'line'],

    pmRiskChart: ['pie', 'doughnut', 'bar', 'line']

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

    const wrapperId = textInputId.replace("_text", "_wrapper");

    const wrapper = document.getElementById(wrapperId);



    if (cb && txt) {

        if (wrapper) {

            wrapper.style.display = cb.checked ? "block" : "none";

        } else {

            txt.style.display = cb.checked ? "block" : "none";

        }

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

    if (storedMonitoring) allMonitorings = JSON.parse(storedMonitoring).map(normalizeMonitoringRecord);

    const storedAttendance = localStorage.getItem("attendanceData_nsc");

    if (storedAttendance) allAttendanceMonitorings = JSON.parse(storedAttendance);

    const storedProjectMonitoring = localStorage.getItem("projectMonitoringData_nsc");

    if (storedProjectMonitoring) allProjectMonitorings = JSON.parse(storedProjectMonitoring);



    // Load dashboard immediately with local data

    switchDashboardView(currentDashboardView);

    refreshDashboard();



    // Hide loading overlay immediately since we have local data

    const loadingOverlay = document.getElementById("loadingOverlay");

    if (loadingOverlay) loadingOverlay.style.display = "none";



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



    // Try to fetch from server in background without blocking UI

    if (isOnline && SCRIPT_URL && SCRIPT_URL.trim() !== "") {

        // Use setTimeout to run this in background after UI is loaded

        setTimeout(async () => {

            try {

                const userSession = sessionStorage.getItem('loggedInUser');

                const userSessionParam = userSession ? encodeURIComponent(userSession) : '';

                const fetchUrl = userSessionParam ? `${SCRIPT_URL}?user_session=${userSessionParam}` : SCRIPT_URL;



                const controller = new AbortController();

                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout



                const response = await fetch(fetchUrl, { signal: controller.signal });

                clearTimeout(timeoutId);



                if (response.ok) {

                    const result = await response.json();

                    let dataUpdated = false;



                    if (result.survey) {

                        allSubmissions = result.survey;

                        allSubmissions.reverse();

                        localStorage.setItem("surveyData_nsc_full", JSON.stringify(allSubmissions));

                        dataUpdated = true;

                    }

                    if (result.monitoring) {

                        allMonitorings = result.monitoring.map(r => {

                            if (r.monitor_name && !r.m_monitor_name) {

                                r.m_monitor_name = r.monitor_name;

                            }

                            if (r.monitor_rank && !r.m_monitor_designation) {

                                r.m_monitor_designation = r.monitor_rank;

                            }

                            if (!r.m_sthaaniya) {

                                r.m_sthaaniya = r.sthaaniya || r['स्थानीय तह'] || r['localLevel'] || r['local_level'] || r['locallevel'] || '';

                            }

                            return normalizeMonitoringRecord(r);

                        });

                        allMonitorings.reverse();

                        localStorage.setItem("monitoringData_nsc", JSON.stringify(allMonitorings));

                        dataUpdated = true;

                    }

                    if (result.attendance) {

                        allAttendanceMonitorings = result.attendance;

                        allAttendanceMonitorings.reverse();

                        localStorage.setItem("attendanceData_nsc", JSON.stringify(allAttendanceMonitorings));

                        dataUpdated = true;

                    }

                    if (result.projectMonitoring) {

                        allProjectMonitorings = result.projectMonitoring;

                        allProjectMonitorings.reverse();

                        localStorage.setItem("projectMonitoringData_nsc", JSON.stringify(allProjectMonitorings));

                        dataUpdated = true;

                    }



                    // Only refresh dashboard if data was actually updated

                    if (dataUpdated) {

                        refreshDashboard();

                    }

                }

            } catch (e) {

                if (e && e.name === 'AbortError') {
                    return;
                }

                console.warn("Background sync failed, using cached data:", e);

            }

        }, 100); // Small delay to let UI render first

    }

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

            await requestAppsScript(payload);

            if (loadingOverlay) loadingOverlay.style.display = "none";

            document.getElementById("formStatus").innerHTML = "✅ गुगल सिट तथा स्थानीय भण्डारणमा सेभ भयो!";



            // Clear editing state

            if (payload.editTimestamp) {

                closeSurveyEditModal();

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

                await requestAppsScript(payload);

            } catch (err) {

                addToPendingSync(payload);

                throw err;

            }

        }



        if (payload.editTimestamp) {

            closeMonitoringEditModal();

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





function addAttendanceRow(targetTbodyId = "attendanceEntryBody") {

    const tbody = document.getElementById(targetTbodyId);

    if (!tbody) return;

    const tr = document.createElement("tr");

    tr.innerHTML = `

        <td>

            <select name="emp_category[]" required style="padding: 8px 4px; height: 40px;">

                <option value="अनुगमन मितिमा अनुपस्थित/ढिला आउने">अनुपस्थित/ढिला (आज)</option>

                <option value="अघिल्लो मितिमा अनुपस्थित/ढिला">अघिल्लो मितिमा अनुपस्थित/ढिला</option>

                <option value="हाजिर भई कार्यकक्षमा नभेटिएको">कार्यकक्षमा नभेटिएको</option>

                <option value="तोकिएको पोशाक नलगाएको">तोकिएको पोशाक नलगाएको</option>

            </select>

        </td>

        <td><input type="text" name="emp_rank[]" placeholder="पद" style="padding: 8px 4px; height: 40px;"></td>

        <td><input type="text" name="emp_symbol[]" placeholder="संकेत नं." style="padding: 8px 4px; height: 40px;"></td>

        <td><input type="text" name="emp_name[]" placeholder="कर्मचारीको नाम" style="padding: 8px 4px; height: 40px;"></td>

        <td><input type="text" name="emp_extra[]" placeholder="कैफियत/मिति" style="padding: 8px 4px; height: 40px;"></td>

        <td><button type="button" onclick="this.closest('tr').remove()" style="background:#e74c3c; color:white; border:none; padding:3px 8px; border-radius:4px; font-size: 0.84rem;">हटाउने</button></td>

    `;

    tbody.appendChild(tr);

}



function addProjectMonitoringTeamRow() {

    const tbody = document.getElementById("pmTeamBody");

    if (!tbody) return;

    const rowCount = tbody.rows.length + 1;

    const tr = document.createElement("tr");

    tr.innerHTML = `

        <td><input type="text" name="pm_team_name[]" placeholder="नाम, थर"></td>

        <td><input type="text" name="pm_team_rank[]" placeholder="पद"></td>

        <td><input type="text" name="pm_team_date[]" class="nepali-datepicker" readonly placeholder="मिति"></td>

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

                await requestAppsScript(payload);

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



document.getElementById("submitProjectMonitoring")?.addEventListener("click", async function () {

    const form = document.getElementById("projectMonitoringForm");

    form.classList.add('was-validated');



    if (!form.checkValidity()) {

        form.reportValidity();

        playErrorSound("विवरण अधुरो छ, कृपया रातो चिन्ह लागेका क्षेत्रहरू भर्नुहोस्।");

        return;

    }



    const formData = new FormData(form);

    let payload = {

        type: 'project-monitoring',

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

    if (window.editingRecord && window.editingRecord.type === 'project-monitoring') {

        payload.editTimestamp = window.editingRecord.timestamp;

        payload.timestamp = window.editingRecord.timestamp;

    }



    payload.pm_pradesh = PROVINCE[payload.pm_pradesh] || payload.pm_pradesh;



    const loadingOverlay = document.getElementById("loadingOverlay");

    const loadingText = loadingOverlay?.querySelector(".loading-text");

    if (loadingOverlay) {

        if (loadingText) loadingText.textContent = "डाटा सुरक्षित हुँदैछ, कृपया केही समय पर्खनुहोस्...";

        loadingOverlay.style.display = "flex";

    }



    try {

        if (payload.editTimestamp) {

            const idx = allProjectMonitorings.findIndex(r => String(r.timestamp) === String(payload.editTimestamp));

            if (idx !== -1) {

                allProjectMonitorings[idx] = payload;

            } else {

                allProjectMonitorings.unshift(payload);

            }

        } else {

            allProjectMonitorings.unshift(payload);

        }

        localStorage.setItem("projectMonitoringData_nsc", JSON.stringify(allProjectMonitorings));



        if (SCRIPT_URL) {

            try {

                await requestAppsScript(payload);

            } catch (err) {

                addToPendingSync(payload);

                throw err;

            }

        }



        if (payload.editTimestamp) {

            window.editingRecord = null;

            document.getElementById("submitProjectMonitoring").innerHTML = '✅ आयोजना अनुगमन फारम सुरक्षित गर्नुहोस्';

        }



        playSuccessSound();

        Swal.fire({ icon: 'success', title: 'सफल!', text: 'आयोजना अनुगमन फारम सुरक्षित भयो।', confirmButtonColor: '#387ae6' });

        form.reset();

        document.getElementById("pmTeamBody").innerHTML = "";

        addProjectMonitoringTeamRow();



        setTimeout(() => {

            const dashboardBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');

            if (dashboardBtn) {

                dashboardBtn.click();

            }

        }, 2000);

        form.classList.remove('was-validated');

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

            await requestAppsScript(item);

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

    if (currentDashboardView === 'project-monitoring') {

        refreshProjectMonitoringDashboard();

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

        const rMinistry = getVal(r, 'ministry', 'मन्त्रालय');



        if (!shouldShowRecordForCurrentUser(r, { province: rPradesh, district: rJilla, localLevel: rSthaaniya, ministry: rMinistry })) return false;

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

        console.log("Filtering record - fromDate:", fromDate, "toDate:", toDate, "recDate:", recDate, "original rDate:", rDate);

        if (fromDate && recDate < fromDate) {

            console.log("Filtered out: recDate < fromDate");

            return false;

        }

        if (toDate && recDate > toDate) {

            console.log("Filtered out: recDate > toDate");

            return false;

        }

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

    const fromDate = getStandardDate(document.getElementById("filterDateFrom")?.value || "");

    const toDate = getStandardDate(document.getElementById("filterDateTo")?.value || "");



    let filtered = allMonitorings.filter(r => {

        const rSthaaniya = getVal(r, 'm_sthaaniya', 'स्थानीय तह');

        const rMinistry = getVal(r, 'm_ministry', 'मन्त्रालय');

        if (!shouldShowRecordForCurrentUser(r, { province: r.m_pradesh, district: r.m_jilla, localLevel: rSthaaniya, ministry: rMinistry })) return false;

        if (pradeshFilter) {

            const provinceName = PROVINCE[pradeshFilter];

            if (r.m_pradesh !== provinceName) return false;

        }

        if (districtFilter && r.m_jilla !== districtFilter) return false;

        if (officeFilter && !(r.m_office || "").toLowerCase().includes(officeFilter)) return false;

        if (monitorFilter && !(r.m_monitor_name || "").toLowerCase().includes(monitorFilter)) return false;



        // Add date filtering

        const rDate = getVal(r, 'm_date', 'मिति');

        let recDate = getStandardDate(rDate || "");

        if (fromDate && recDate < fromDate) return false;

        if (toDate && recDate > toDate) return false;



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

            <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings, 'जम्मा अनुगमन', 'monitoring')"><div class="stat-number" style="color:#3b82f6 !important"><i class="fas fa-clipboard-list" style="color:#3b82f6"></i> ${toNepaliDigits(total)}</div><div style="color:#4a5568">जम्मा अनुगमन</div></div>        

            <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => {

                const today = estimateCurrentBsDate();

                const m = BS_MONTHS[today.month - 1];

                const y = toNepaliDigits(today.year);

                const ds = getVal(d, 'm_date', 'मिति');

                return ds && ds.includes(m) && ds.includes(y);

            }), 'यस महिनाको अनुगमन', 'monitoring')"><div class="stat-number" style="color:#8b5cf6 !important"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> ${toNepaliDigits(thisMonthMonitoringCount)}</div><div style="color:#4a5568">यस महिनाको अनुगमन</div></div>

            

            <div class="stat-card" style="--stat-border-color:#ef4444; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d.m_q5 === 'देखियो'), 'मध्यस्थकर्ताको उपस्थिति', 'monitoring')"><div class="stat-number" style="color:#ef4444 !important"><i class="fas fa-user-secret" style="color:#ef4444"></i> ${toNepaliDigits(brokerSeen)}</div><div style="color:#4a5568">मध्यस्थकर्ताको उपस्थिति</div></div>

            

            <div class="stat-card" style="--stat-border-color:#10b981; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d.m_q1 === 'स्पष्ट बुझिने'), 'बडापत्र स्पष्ट/डिजिटल', 'monitoring')"><div class="stat-number" style="color:#10b981 !important"><i class="fas fa-display" style="color:#10b981"></i> ${toNepaliDigits(digitalCharter)}</div><div style="color:#4a5568">बडापत्र स्पष्ट/डिजिटल</div></div>

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



        let statHTML = `<div class="stat-card" style="cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings, 'जम्मा अनुगमन', 'monitoring')"><div class="stat-number" style="color:#3b82f6 !important">${toNepaliDigits(total)}</div><div>जम्मा अनुगमन</div></div>`;

        const palette = getThemeColors();

        Object.keys(counts).forEach((key, i) => {

            const count = counts[key];

            const percent = total > 0 ? (count / total * 100).toFixed(1) : 0;

            statHTML += `<div class="stat-card" style="--stat-border-color: ${palette[i % 5]}; cursor:pointer;" onclick="showDetailedTable(currentFilteredMonitorings.filter(d => d['${selectedField}'] === '${key}'), '${fieldName}: ${key}', 'monitoring')"><div class="stat-number" style="color:${palette[i % 5]} !important">${toNepaliDigits(count)} <span style="font-size: 50%;">(${toNepaliDigits(percent)}%)</span></div><div>${key}</div></div>`;

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

        const rMinistry = getVal(item, 'ministry', 'मन्त्रालय');



        if (!shouldShowRecordForCurrentUser(item, { province: rPradesh, district: rJilla, localLevel: rSthaaniya, ministry: rMinistry })) return;

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

            <div class="stat-number" style="color:#3b82f6 !important"><i class="fas fa-clipboard-check" style="color:#3b82f6"></i> ${toNepaliDigits(totalMonsCount)}</div>

            <div style="color:#4a5568">कूल समय पालना/पोशाक अनुगमन</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.date && e.date.includes('${currentMonthStr}') && e.date.includes('${currentYearStr}')), 'यस महिनाको समय पालना/पोशाक अनुगमन', 'attendance')">

            <div class="stat-number" style="color:#8b5cf6 !important"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> ${toNepaliDigits(monthMonsCount)}</div>

            <div style="color:#4a5568">यस महिनाको समय पालना/पोशाक अनुगमन</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#6366f1; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance, 'जम्मा अपरिपालना', 'attendance')"><div class="stat-number" style="color:#6366f1 !important"><i class="fas fa-users-viewfinder" style="color:#6366f1"></i> ${toNepaliDigits(totalViolations)}</div><div style="color:#4a5568">जम्मा अपरिपालना</div></div>

        <div class="stat-card" style="--stat-border-color:#f59e0b; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.category.includes('अनुपस्थित/ढिला')), 'अनुपस्थित/ढिला', 'attendance')"><div class="stat-number" style="color:#f59e0b !important"><i class="fas fa-user-clock" style="color:#f59e0b"></i> ${toNepaliDigits(lateAbsent)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (lateAbsent / totalViolations * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">अनुपस्थित/ढिला</div></div>

        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredAttendance.filter(e => e.category.includes('पोशाक')), 'पोशाक नलगाउने', 'attendance')"><div class="stat-number" style="color:#ec4899 !important"><i class="fas fa-user-tie" style="color:#ec4899"></i> ${toNepaliDigits(noUniform)} <span style="font-size: 50%;">(${toNepaliDigits(totalViolations > 0 ? (noUniform / totalViolations * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">पोशाक नलगाउने</div></div>

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



function refreshProjectMonitoringDashboard() {

    const pradeshFilter = (document.getElementById("filterPradesh")?.value || "").trim();

    const districtFilter = (document.getElementById("filterDistrict")?.value || "").trim();

    const sthaaniyaFilter = (document.getElementById("filterSthaaniya")?.value || "").trim();

    const officeFilter = (document.getElementById("filterOffice")?.value || "").toLowerCase().trim();

    const projectNameFilter = (document.getElementById("filterProjectName")?.value || "").toLowerCase().trim();

    const contractorFilter = (document.getElementById("filterContractor")?.value || "").toLowerCase().trim();

    const progressFilter = document.getElementById("filterProgress")?.value;

    const fromDate = getStandardDate(document.getElementById("filterDateFrom")?.value || "");

    const toDate = getStandardDate(document.getElementById("filterDateTo")?.value || "");



    const today = estimateCurrentBsDate();

    const currentMonthStr = BS_MONTHS[today.month - 1];

    const currentYearStr = toNepaliDigits(today.year);



    let filtered = allProjectMonitorings.filter(r => {

        const rPradesh = getVal(r, 'pm_pradesh', 'प्रदेश');

        const rJilla = getVal(r, 'pm_jilla', 'जिल्ला');

        const rSthaaniya = getVal(r, 'pm_sthaaniya_taha', 'स्थानीय तह');

        const rOffice = getVal(r, 'pm_implementing_agency', 'कार्यान्वयन निकाय');

        const rDate = getVal(r, 'pm_monitoring_date', 'मिति');

        const rProjectName = getVal(r, 'pm_project_name', 'आयोजनाको नाम');

        const rContractor = getVal(r, 'pm_contractor_name', 'ठेकेदार');

        const rProgress = getVal(r, 'pm_physical_progress', 'भौतिक प्रगति');

        const rMinistry = getVal(r, 'pm_ministry', 'मन्त्रालय');



        if (!shouldShowRecordForCurrentUser(r, { province: rPradesh, district: rJilla, localLevel: rSthaaniya, ministry: rMinistry })) return false;

        if (pradeshFilter) {

            const provinceName = PROVINCE[pradeshFilter];

            const pStr = String(rPradesh || "").trim();

            if (pStr != pradeshFilter && pStr !== provinceName) return false;

        }

        if (districtFilter && String(rJilla || "").trim() !== districtFilter) return false;

        if (sthaaniyaFilter && String(rSthaaniya || "").trim() !== sthaaniyaFilter) return false;

        if (officeFilter && !(rOffice || "").toLowerCase().includes(officeFilter)) return false;

        if (projectNameFilter && !(rProjectName || "").toLowerCase().includes(projectNameFilter)) return false;

        if (contractorFilter && !(rContractor || "").toLowerCase().includes(contractorFilter)) return false;

        if (progressFilter !== null && progressFilter !== undefined && progressFilter !== "") {

            const progressVal = parseFloat(rProgress) || 0;

            if (progressVal < parseFloat(progressFilter)) return false;

        }



        const recDate = getStandardDate(rDate || "");

        if (fromDate && recDate < fromDate) return false;

        if (toDate && recDate > toDate) return false;



        return true;

    });



    currentFilteredProjectMonitorings = filtered;



    const totalProjects = filtered.length;

    const monthProjects = filtered.filter(r => {

        const rDate = getVal(r, 'pm_monitoring_date', 'मिति');

        return rDate && rDate.includes(currentMonthStr) && rDate.includes(currentYearStr);

    }).length;



    const avgProgress = filtered.length > 0

        ? (filtered.reduce((sum, r) => sum + (parseFloat(r.pm_physical_progress) || 0), 0) / filtered.length).toFixed(1)

        : 0;



    const totalApprovedCost = filtered.reduce((sum, r) => sum + (parseFloat(r.pm_approved_cost) || 0), 0);

    const totalSpent = filtered.reduce((sum, r) => sum + (parseFloat(r.pm_spent_amount) || 0), 0);



    const highProgressProjects = filtered.filter(r => parseFloat(r.pm_physical_progress) >= 75).length;

    const lowProgressProjects = filtered.filter(r => parseFloat(r.pm_physical_progress) < 25).length;



    document.getElementById("statCardsContainer").innerHTML = `

        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredProjectMonitorings, 'कूल आयोजना अनुगमन', 'project-monitoring')">

            <div class="stat-number" style="color:#3b82f6 !important"><i class="fas fa-hard-hat" style="color:#3b82f6"></i> ${toNepaliDigits(totalProjects)}</div>

            <div style="color:#4a5568">कूल आयोजना अनुगमन</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredProjectMonitorings.filter(r => r.pm_monitoring_date && r.pm_monitoring_date.includes('${currentMonthStr}') && r.pm_monitoring_date.includes('${currentYearStr}')), 'यस महिनाको आयोजना अनुगमन', 'project-monitoring')">

            <div class="stat-number" style="color:#8b5cf6 !important"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> ${toNepaliDigits(monthProjects)}</div>

            <div style="color:#4a5568">यस महिनाको आयोजना अनुगमन</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#10b981; cursor:pointer;">

            <div class="stat-number" style="color:#10b981 !important"><i class="fas fa-chart-line" style="color:#10b981"></i> ${toNepaliDigits(avgProgress)}%</div>

            <div style="color:#4a5568">औसत भौतिक प्रगति</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#f59e0b; cursor:pointer;">

            <div class="stat-number" style="color:#f59e0b !important"><i class="fas fa-money-bill-wave" style="color:#f59e0b"></i> ${toNepaliDigits(totalApprovedCost.toLocaleString())}</div>

            <div style="color:#4a5568">कूल स्वीकृत लागत (रु.)/लाखमा</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#ef4444; cursor:pointer;">

            <div class="stat-number" style="color:#ef4444 !important"><i class="fas fa-coins" style="color:#ef4444"></i> ${toNepaliDigits(totalSpent.toLocaleString())}</div>

            <div style="color:#4a5568">कूल खर्च भएको (रु.)/लाखमा</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#6366f1; cursor:pointer;" onclick="showDetailedTable(currentFilteredProjectMonitorings.filter(r => parseFloat(r.pm_physical_progress) >= 75), '७५% भन्दा बढी प्रगति', 'project-monitoring')">

            <div class="stat-number" style="color:#6366f1 !important"><i class="fas fa-arrow-up" style="color:#6366f1"></i> ${toNepaliDigits(highProgressProjects)}</div>

            <div style="color:#4a5568">७५% भन्दा बढी प्रगति</div>

        </div>

        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredProjectMonitorings.filter(r => parseFloat(r.pm_physical_progress) < 25), '२५% भन्दा कम प्रगति', 'project-monitoring')">

            <div class="stat-number" style="color:#ec4899 !important"><i class="fas fa-arrow-down" style="color:#ec4899"></i> ${toNepaliDigits(lowProgressProjects)}</div>

            <div style="color:#4a5568">२५% भन्दा कम प्रगति</div>

        </div>

    `;



    const tbody = document.querySelector("#dataTable tbody");

    if (tbody) {

        tbody.innerHTML = "";

        const startIdx = (currentPage - 1) * itemsPerPage;

        const endIdx = startIdx + itemsPerPage;

        const pageData = filtered.slice(startIdx, endIdx);



        pageData.forEach(r => {

            const tr = document.createElement("tr");

            tr.innerHTML = `

                <td style="width:10%" data-label="मिति">${getVal(r, 'pm_monitoring_date', 'मिति')}</td>

                <td style="width:14%" data-label="आयोजनाको नाम">${getVal(r, 'pm_project_name', 'आयोजनाको नाम')}</td>

                <td style="width:11%" data-label="जिल्ला">${getVal(r, 'pm_jilla', 'जिल्ला')}</td>

                <td style="width:14%" data-label="कार्यान्वयन निकाय">${getVal(r, 'pm_implementing_agency', 'कार्यान्वयन निकाय')}</td>

                <td style="width:20%" data-label="ठेकेदार">${getVal(r, 'pm_contractor_name', 'ठेकेदार')}</td>

                <td style="width:8%" data-label="भौतिक प्रगति (%)">${toNepaliDigits(getVal(r, 'pm_physical_progress', '०'))}%</td>

                <td style="width:8%" data-label="स्वीकृत लागत (रु. लाखमा)">${toNepaliDigits(parseFloat(getVal(r, 'pm_approved_cost', '0')).toLocaleString())}</td>

                <td style="width:8%" data-label="खर्च भएको (रु. लाखमा)">${toNepaliDigits(parseFloat(getVal(r, 'pm_spent_amount', '0')).toLocaleString())}</td>

                <td style="width:9%" data-label="कार्य">

                    <button class="action-btn btn-view" onclick="showProjectModal('${r.timestamp}', false)" title="हेर्नुहोस्"><i class="fas fa-eye"></i></button>

                    <button class="action-btn btn-edit" onclick="showProjectModal('${r.timestamp}', true)" title="सम्पादन"><i class="fas fa-edit"></i></button>

                    <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp}', 'project-monitoring')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>

                </td>

            `;

            tbody.appendChild(tr);

        });



        renderPaginationUI(filtered.length);

    }



    // १. आयोजनाको भौगोलिक वितरण (प्रदेश अनुसार)

    const provinceCounts = {};

    filtered.forEach(r => {

        const pradesh = getVal(r, 'pm_pradesh', 'अज्ञात');

        provinceCounts[pradesh] = (provinceCounts[pradesh] || 0) + 1;

    });

    const provinceLabels = Object.keys(provinceCounts);

    const provinceValues = Object.values(provinceCounts);

    const provincePalette = getThemeColors(0.8);



    const pmGeographicCanvas = document.getElementById("pmGeographicChart");

    if (pmGeographicCanvas) {

        const pmGeographicCtx = pmGeographicCanvas.getContext('2d');

        if (window.pmGeographicChart && typeof window.pmGeographicChart.destroy === 'function') window.pmGeographicChart.destroy();

        const pmGeographicType = chartTypes.pmGeographicChart || 'bar';

        window.pmGeographicChart = new Chart(pmGeographicCtx, {

            type: pmGeographicType,

            data: {

                labels: provinceLabels,

                datasets: [{

                    label: 'आयोजना संख्या',

                    data: provinceValues,

                    backgroundColor: provincePalette,

                    borderRadius: 5,

                    borderWidth: 1,

                    borderColor: '#ffffff'

                }]

            },

            options: {

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { display: pmGeographicType !== 'bar', position: 'bottom' },

                    tooltip: { callbacks: { label: (ctx) => ` आयोजना संख्या: ${toNepaliDigits(ctx.raw)}` } }

                },

                scales: (pmGeographicType === 'bar') ? { y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } } } : {}

            }

        });

    }



    // २. आयोजना प्रगति (भौतिक प्रगति)

    const progressRanges = {

        '०-२५%': 0,

        '२६-५०%': 0,

        '५१-७५%': 0,

        '७६-१००%': 0

    };



    filtered.forEach(r => {

        const progress = parseFloat(r.pm_physical_progress) || 0;

        if (progress <= 25) progressRanges['०-२५%']++;

        else if (progress <= 50) progressRanges['२६-५०%']++;

        else if (progress <= 75) progressRanges['५१-७५%']++;

        else progressRanges['७६-१००%']++;

    });



    const progressLabels = Object.keys(progressRanges);

    const progressValues = Object.values(progressRanges);



    const pmPhysicalProgressCanvas = document.getElementById("pmPhysicalProgressChart");

    if (pmPhysicalProgressCanvas) {

        const pmPhysicalProgressCtx = pmPhysicalProgressCanvas.getContext('2d');

        if (window.pmPhysicalProgressChart && typeof window.pmPhysicalProgressChart.destroy === 'function') window.pmPhysicalProgressChart.destroy();

        const pmPhysicalType = chartTypes.pmPhysicalProgressChart || 'bar';

        window.pmPhysicalProgressChart = new Chart(pmPhysicalProgressCtx, {

            type: pmPhysicalType,

            data: {

                labels: progressLabels,

                datasets: [{

                    label: 'आयोजना संख्या',

                    data: progressValues,

                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'],

                    borderRadius: 5,

                    borderWidth: 1,

                    borderColor: '#ffffff'

                }]

            },

            options: {

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { display: pmPhysicalType !== 'bar', position: 'bottom' },

                    tooltip: { callbacks: { label: (ctx) => ` आयोजना संख्या: ${toNepaliDigits(ctx.raw)}` } }

                },

                scales: (pmPhysicalType === 'bar') ? { y: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } } } : {}

            }

        });

    }



    // ३. आर्थिक प्रगति (स्वीकृत लागत vs खर्च)

    const totalApproved = filtered.reduce((sum, r) => sum + (parseFloat(r.pm_approved_cost) || 0), 0);

    const totalSpentForChart = filtered.reduce((sum, r) => sum + (parseFloat(r.pm_spent_amount) || 0), 0);

    const avgSpentPercent = totalApproved > 0 ? ((totalSpentForChart / totalApproved) * 100).toFixed(1) : 0;



    const pmEconomicProgressCanvas = document.getElementById("pmEconomicProgressChart");

    if (pmEconomicProgressCanvas) {

        const pmEconomicProgressCtx = pmEconomicProgressCanvas.getContext('2d');

        if (window.pmEconomicProgressChart && typeof window.pmEconomicProgressChart.destroy === 'function') window.pmEconomicProgressChart.destroy();

        const pmEconomicType = chartTypes.pmEconomicProgressChart || 'bar';

        window.pmEconomicProgressChart = new Chart(pmEconomicProgressCtx, {

            type: pmEconomicType,

            data: {

                labels: ['स्वीकृत लागत', 'हालसम्म खर्च'],

                datasets: [{

                    label: 'रकम (रु.)',

                    data: [totalApproved, totalSpentForChart],

                    backgroundColor: ['#3b82f6', '#10b981'],

                    borderRadius: 5,

                    borderWidth: 1,

                    borderColor: '#ffffff'

                }]

            },

            options: {

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { display: pmEconomicType !== 'bar', position: 'bottom' },

                    tooltip: { callbacks: { label: (ctx) => ` ${toNepaliDigits(ctx.raw.toLocaleString())} रु.` } }

                },

                scales: (pmEconomicType === 'bar') ? { y: { beginAtZero: true, ticks: { callback: (v) => toNepaliDigits(v.toLocaleString()) } } } : {}

            }

        });

    }



    // ४. गुणस्तर तथा प्राविधिक पक्ष

    const qualityMetrics = {

        'डिजाइन मापदण्ड अनुरूप': { yes: 0, no: 0 },

        'सामग्रीको गुणस्तर': { yes: 0, no: 0 },

        'कानून/निर्देशिका पालना': { yes: 0, no: 0 },

        'Lab Test भएको': { yes: 0, no: 0 }

    };



    filtered.forEach(r => {

        if (r.pm_quality_1 === 'छ') qualityMetrics['डिजाइन मापदण्ड अनुरूप'].yes++; else if (r.pm_quality_1 === 'छैन') qualityMetrics['डिजाइन मापदण्ड अनुरूप'].no++;

        if (r.pm_quality_2 === 'छ') qualityMetrics['सामग्रीको गुणस्तर'].yes++; else if (r.pm_quality_2 === 'छैन') qualityMetrics['सामग्रीको गुणस्तर'].no++;

        if (r.pm_quality_3 === 'छ') qualityMetrics['कानून/निर्देशिका पालना'].yes++; else if (r.pm_quality_3 === 'छैन') qualityMetrics['कानून/निर्देशिका पालना'].no++;

        if (r.pm_quality_4 === 'छ') qualityMetrics['Lab Test भएको'].yes++; else if (r.pm_quality_4 === 'छैन') qualityMetrics['Lab Test भएको'].no++;

    });



    const qualityLabels = Object.keys(qualityMetrics);

    const qualityYesValues = qualityLabels.map(k => qualityMetrics[k].yes);

    const qualityNoValues = qualityLabels.map(k => qualityMetrics[k].no);



    const pmQualityCanvas = document.getElementById("pmQualityChart");

    if (pmQualityCanvas) {

        const pmQualityCtx = pmQualityCanvas.getContext('2d');

        if (window.pmQualityChart && typeof window.pmQualityChart.destroy === 'function') window.pmQualityChart.destroy();

        const pmQualityType = chartTypes.pmQualityChart || 'bar';

        window.pmQualityChart = new Chart(pmQualityCtx, {

            type: pmQualityType,

            data: {

                labels: qualityLabels,

                datasets: [

                    {

                        label: 'छ',

                        data: qualityYesValues,

                        backgroundColor: '#10b981',

                        borderRadius: 5

                    },

                    {

                        label: 'छैन',

                        data: qualityNoValues,

                        backgroundColor: '#ef4444',

                        borderRadius: 5

                    }

                ]

            },

            options: Object.assign({

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { position: 'bottom', display: pmQualityType !== 'bar' },

                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${toNepaliDigits(ctx.raw)}` } }

                }

            }, pmQualityType === 'bar' ? { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } } } } : {})

        });

    }



    // ५. आर्थिक तथा समय व्यवस्थापन

    const timeMetrics = {

        'बजेट समयमै': { yes: 0, no: 0 },

        'Schedule अनुसार': { yes: 0, no: 0 },

        'लागतभित्र सम्पन्न': { yes: 0, no: 0 },

        'Variation भएको': { yes: 0, no: 0 }

    };



    filtered.forEach(r => {

        if (r.pm_economic_1 === 'छ') timeMetrics['बजेट समयमै'].yes++; else if (r.pm_economic_1 === 'छैन') timeMetrics['बजेट समयमै'].no++;

        if (r.pm_economic_2 === 'छ') timeMetrics['Schedule अनुसार'].yes++; else if (r.pm_economic_2 === 'छैन') timeMetrics['Schedule अनुसार'].no++;

        if (r.pm_economic_3 === 'छ') timeMetrics['लागतभित्र सम्पन्न'].yes++; else if (r.pm_economic_3 === 'छैन') timeMetrics['लागतभित्र सम्पन्न'].no++;

        if (r.pm_economic_4 === 'छ') timeMetrics['Variation भएको'].yes++; else if (r.pm_economic_4 === 'छैन') timeMetrics['Variation भएको'].no++;

    });



    const timeLabels = Object.keys(timeMetrics);

    const timeYesValues = timeLabels.map(k => timeMetrics[k].yes);

    const timeNoValues = timeLabels.map(k => timeMetrics[k].no);



    const pmTimeManagementCanvas = document.getElementById("pmTimeManagementChart");

    if (pmTimeManagementCanvas) {

        const pmTimeManagementCtx = pmTimeManagementCanvas.getContext('2d');

        if (window.pmTimeManagementChart && typeof window.pmTimeManagementChart.destroy === 'function') window.pmTimeManagementChart.destroy();

        const pmTimeType = chartTypes.pmTimeManagementChart || 'bar';

        window.pmTimeManagementChart = new Chart(pmTimeManagementCtx, {

            type: pmTimeType,

            data: {

                labels: timeLabels,

                datasets: [

                    {

                        label: 'छ',

                        data: timeYesValues,

                        backgroundColor: '#10b981',

                        borderRadius: 5

                    },

                    {

                        label: 'छैन',

                        data: timeNoValues,

                        backgroundColor: '#ef4444',

                        borderRadius: 5

                    }

                ]

            },

            options: Object.assign({

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { position: 'bottom', display: pmTimeType !== 'bar' },

                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${toNepaliDigits(ctx.raw)}` } }

                }

            }, pmTimeType === 'bar' ? { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, callback: (v) => toNepaliDigits(v) } } } } : {})

        });

    }



    // ६. समग्र अनुपालन स्कोर

    const complianceScores = { '८०-१००% (उत्कृष्ट)': 0, '६०-७९% (राम्रो)': 0, '४०-५९% (सुधार आवश्यक)': 0, '४०% भन्दा कम (कमजोर)': 0 };



    filtered.forEach(r => {

        let yesCount = 0;

        let totalCount = 0;

        const qualityFields = ['pm_quality_1', 'pm_quality_2', 'pm_quality_3', 'pm_quality_4', 'pm_economic_1', 'pm_economic_2', 'pm_economic_3', 'pm_economic_4', 'pm_procurement_1', 'pm_procurement_2', 'pm_procurement_3'];

        qualityFields.forEach(field => {

            if (r[field]) {

                totalCount++;

                if (r[field] === 'छ') yesCount++;

            }

        });



        if (totalCount > 0) {

            const score = (yesCount / totalCount) * 100;

            if (score >= 80) complianceScores['८०-१००% (उत्कृष्ट)']++;

            else if (score >= 60) complianceScores['६०-७९% (राम्रो)']++;

            else if (score >= 40) complianceScores['४०-५९% (सुधार आवश्यक)']++;

            else complianceScores['४०% भन्दा कम (कमजोर)']++;

        }

    });



    const complianceLabels = Object.keys(complianceScores);

    const complianceValues = Object.values(complianceScores);



    const pmComplianceCanvas = document.getElementById("pmComplianceChart");

    if (pmComplianceCanvas) {

        const pmComplianceCtx = pmComplianceCanvas.getContext('2d');

        if (window.pmComplianceChart && typeof window.pmComplianceChart.destroy === 'function') window.pmComplianceChart.destroy();

        const pmComplianceType = chartTypes.pmComplianceChart || 'pie';

        window.pmComplianceChart = new Chart(pmComplianceCtx, {

            type: pmComplianceType,

            data: {

                labels: complianceLabels,

                datasets: [{

                    data: complianceValues,

                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],

                    borderWidth: 2,

                    borderColor: '#ffffff'

                }]

            },

            options: {

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { position: 'bottom', display: pmComplianceType !== 'bar' },

                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${toNepaliDigits(ctx.raw)}` } }

                },

                scales: (pmComplianceType === 'bar') ? { y: { beginAtZero: true, ticks: { callback: (v) => toNepaliDigits(v) } } } : {}

            }

        });

    }



    // ७. समय र लागत जोखिम

    const riskCounts = { 'म्याद थप भएको': 0, 'लागत वृद्धि भएको': 0, 'समयमै सम्पन्न': 0 };



    filtered.forEach(r => {

        if (r.pm_economic_4 === 'छ') riskCounts['म्याद थप भएको']++;

        if (r.pm_economic_4 === 'छैन') riskCounts['समयमै सम्पन्न']++;

        if (r.pm_economic_3 === 'छैन') riskCounts['लागत वृद्धि भएको']++;

    });



    const riskLabels = Object.keys(riskCounts);

    const riskValues = Object.values(riskCounts);



    const pmRiskCanvas = document.getElementById("pmRiskChart");

    if (pmRiskCanvas) {

        const pmRiskCtx = pmRiskCanvas.getContext('2d');

        if (window.pmRiskChart && typeof window.pmRiskChart.destroy === 'function') window.pmRiskChart.destroy();

        const pmRiskType = chartTypes.pmRiskChart || 'pie';

        window.pmRiskChart = new Chart(pmRiskCtx, {

            type: pmRiskType,

            data: {

                labels: riskLabels,

                datasets: [{

                    data: riskValues,

                    backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],

                    borderWidth: 2,

                    borderColor: '#ffffff'

                }]

            },

            options: {

                animation: { duration: 2500, easing: 'easeInOutQuart' },

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: { position: 'bottom', display: pmRiskType !== 'bar' },

                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${toNepaliDigits(ctx.raw)}` } }

                },

                scales: (pmRiskType === 'bar') ? { y: { beginAtZero: true, ticks: { callback: (v) => toNepaliDigits(v) } } } : {}

            }

        });

    }

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

        <div class="stat-card" style="--stat-border-color:#3b82f6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions, 'कूल सेवाग्राही सर्वेक्षण', 'survey')"><div class="stat-number" style="color:#3b82f6 !important"><i class="fas fa-poll" style="color:#3b82f6"></i> <span class="anim-counter" data-target="${total}">${toNepaliDigits(total)}</span></div><div style="color:#4a5568">कूल सेवाग्राही सर्वेक्षण</div></div>        

        <div class="stat-card" style="--stat-border-color:#8b5cf6; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => {

            const today = estimateCurrentBsDate();

            const m = BS_MONTHS[today.month - 1];

            const y = toNepaliDigits(today.year);

            const ds = getVal(d, 'survey_date', 'मिति');

            return ds && ds.includes(m) && ds.includes(y);

        }), 'यस महिनाको सर्वेक्षण', 'survey')"><div class="stat-number" style="color:#8b5cf6 !important"><i class="fas fa-calendar-check" style="color:#8b5cf6"></i> <span class="anim-counter" data-target="${thisMonthCount}">${toNepaliDigits(thisMonthCount)}</span></div><div style="color:#4a5568">यस महिनाको सर्वेक्षण</div></div>

        

        <div class="stat-card" style="--stat-border-color:#ec4899; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.gender === 'महिला'), 'महिला सेवाग्राही', 'survey')"><div class="stat-number" style="color:#ec4899 !important"><i class="fas fa-female" style="color:#ec4899"></i> <span class="anim-counter" data-target="${femaleCount}">${toNepaliDigits(femaleCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (femaleCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">महिला सेवाग्राही</div></div>

        

        <div class="stat-card" style="--stat-border-color:#06b6d4; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.gender === 'पुरुष'), 'पुरुष सेवाग्राही', 'survey')"><div class="stat-number" style="color:#06b6d4 !important"><i class="fas fa-male" style="color:#06b6d4"></i> <span class="anim-counter" data-target="${maleCount}">${toNepaliDigits(maleCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (maleCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">पुरुष सेवाग्राही</div></div>

        

        <div class="stat-card" style="--stat-border-color:#10b981; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.satisfaction_flag === 'सन्तुष्ट'), 'सन्तुष्ट सेवाग्राही', 'survey')"><div class="stat-number" style="color:#10b981 !important"><i class="fas fa-smile" style="color:#10b981"></i> <span class="anim-counter" data-target="${satCount}">${toNepaliDigits(satCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (satCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">सन्तुष्ट सेवाग्राही</div></div>

        

        <div class="stat-card" style="--stat-border-color:#ef4444; cursor:pointer;" onclick="showDetailedTable(currentFilteredSubmissions.filter(d => d.ghus_parera === 'पर्‍यो'), 'अतिरिक्त रकम तिर्नु परेको', 'survey')"><div class="stat-number" style="color:#ef4444 !important"><i class="fas fa-hand-holding-dollar" style="color:#ef4444"></i> <span class="anim-counter" data-target="${ghusCount}">${toNepaliDigits(ghusCount)}</span> <span style="font-size: 50%;">(${toNepaliDigits(total > 0 ? (ghusCount / total * 100).toFixed(1) : 0)}%)</span></div><div style="color:#4a5568">अतिरिक्त रकम तिर्नु परेको</div></div>

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

    const projectMonitoringBtn = document.getElementById("showProjectMonitoringView");

    const pdfBtn = document.getElementById("downloadAttendancePDF");

    const excelBtn = document.getElementById("exportExcelBtn");



    // AI buttons

    const surveyAiBtn = document.getElementById("generateSurveyAiSummaryBtn");

    const monitoringAiBtn = document.getElementById("generateMonitoringAiSummaryBtn");

    const attendanceAiBtn = document.getElementById("generateAttendanceAiSummaryBtn");

    const projectAiBtn = document.getElementById("generateProjectAiSummaryBtn");



    const tableHead = document.querySelector("#dataTable thead");

    const extraFilters = document.getElementById("attendanceExtraFilters");

    const monitoringExtraFilters = document.getElementById("monitoringExtraFilters");

    const toggleMBtn = document.getElementById("toggleMonitoringFilters");

    const toggleAlertsBtn = document.getElementById("toggleAlertsVisibilityBtn");



    // Hide all AI buttons first

    if (surveyAiBtn) surveyAiBtn.style.display = "none";

    if (monitoringAiBtn) monitoringAiBtn.style.display = "none";

    if (attendanceAiBtn) attendanceAiBtn.style.display = "none";

    if (projectAiBtn) projectAiBtn.style.display = "none";



    if (view === 'survey') {

        if (pdfBtn) pdfBtn.style.display = "none";

        if (excelBtn) excelBtn.style.display = "block";

        if (surveyAiBtn) surveyAiBtn.style.display = "inline-block";

        surveyBtn?.classList.add("active");

        monitoringBtn?.classList.remove("active");

        attendanceBtn?.classList.remove("active");

        projectMonitoringBtn?.classList.remove("active");

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

        document.getElementById("projectMonitoringChartsRow")?.style.setProperty('display', 'none', 'important');



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

        if (attendanceAiBtn) attendanceAiBtn.style.display = "inline-block";

        attendanceBtn?.classList.add("active");

        surveyBtn?.classList.remove("active");

        monitoringBtn?.classList.remove("active");

        projectMonitoringBtn?.classList.remove("active");

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

        document.getElementById("projectMonitoringChartsRow")?.style.setProperty('display', 'none', 'important');



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

    } else if (view === 'project-monitoring') {

        if (pdfBtn) pdfBtn.style.display = "none";

        if (excelBtn) excelBtn.style.display = "block";

        if (projectAiBtn) projectAiBtn.style.display = "inline-block";

        projectMonitoringBtn?.classList.add("active");

        surveyBtn?.classList.remove("active");

        monitoringBtn?.classList.remove("active");

        attendanceBtn?.classList.remove("active");

        if (extraFilters) extraFilters.style.display = "none";

        if (monitoringExtraFilters) monitoringExtraFilters.style.display = "none";

        if (toggleMBtn) toggleMBtn.style.display = "none";

        if (toggleAlertsBtn) toggleAlertsBtn.style.display = "none";



        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');

        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'none', 'important');

        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');

        document.getElementById("surveyDynamicAnalysis")?.style.setProperty('display', 'none', 'important');

        document.getElementById("monitoringAlertsSection")?.style.setProperty('display', 'none', 'important');

        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'none', 'important');

        document.getElementById("projectMonitoringChartsRow")?.style.setProperty('display', 'flex', 'important');



        if (tableHead) {

            tableHead.innerHTML = `<tr>

                <th style="width:10%">मिति</th>

                <th style="width:14%">आयोजनाको नाम</th>

                <th style="width:11%">जिल्ला</th>

                <th style="width:14%">कार्यान्वयन निकाय</th>

                <th style="width:20%">ठेकेदार</th>

                <th style="width:8%">भौतिक प्रगति (%)</th>

                <th style="width:8%">स्वीकृत लागत (रु. लाखमा)</th>

                <th style="width:8%">खर्च भएको (रु. लाखमा)</th>

                <th style="width:9%">कार्य</th>

            </tr>`;

        }



        const genderFilter = document.getElementById("filterGender")?.closest('.filter-item');

        if (genderFilter) genderFilter.style.display = "none";



        const stored = localStorage.getItem("projectMonitoringData_nsc");

        if (stored) allProjectMonitorings = JSON.parse(stored);

    } else {

        if (pdfBtn) pdfBtn.style.display = "none";

        if (excelBtn) excelBtn.style.display = "block";

        if (monitoringAiBtn) monitoringAiBtn.style.display = "inline-block";

        monitoringBtn?.classList.add("active");

        surveyBtn?.classList.remove("active");

        attendanceBtn?.classList.remove("active");

        projectMonitoringBtn?.classList.remove("active");

        if (extraFilters) extraFilters.style.display = "none";

        if (toggleMBtn) toggleMBtn.style.display = "block";

        if (toggleAlertsBtn) toggleAlertsBtn.style.display = "inline-flex";



        document.getElementById("surveyChartsRow")?.style.setProperty('display', 'none', 'important');

        document.getElementById("surveyDynamicAnalysis")?.style.setProperty('display', 'none', 'important');

        document.getElementById("topOfficesRow")?.style.setProperty('display', 'none', 'important');

        document.getElementById("monitoringChartsRow")?.style.setProperty('display', 'flex', 'important');

        document.getElementById("monitoringAlertsSection")?.style.setProperty('display', 'block', 'important');

        document.getElementById("monitoringDetailsSection")?.style.setProperty('display', 'block', 'important');

        document.getElementById("projectMonitoringChartsRow")?.style.setProperty('display', 'none', 'important');



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

document.getElementById("showProjectMonitoringView")?.addEventListener("click", () => switchDashboardView('project-monitoring'));

document.getElementById("downloadAttendancePDF")?.addEventListener("click", downloadAttendancePDF);

document.getElementById("exportExcelBtn")?.addEventListener("click", exportToExcel);



// AI Summary button handlers for different dashboard views

document.getElementById('generateSurveyAiSummaryBtn')?.addEventListener('click', throttle(async () => {

    const data = currentFilteredSubmissions.length ? currentFilteredSubmissions : allSubmissions;

    if (!data || data.length === 0) return Swal.fire({ icon: 'info', text: 'समावेश गर्ने सर्वेक्षण डाटा छैन।' });



    Swal.fire({ title: 'AI सारांश तयार गर्दै...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });



    try {

        // Calculate aggregates

        const satisfied = data.filter(d => d.main_satisfaction === 'सन्तुष्ट').length;

        const unsatisfied = data.filter(d => d.main_satisfaction === 'असन्तुष्ट').length;

        const ghusCases = data.filter(d => d.ghus_parera === 'हो').length;

        const brokerCases = data.filter(d => d.sahayog_parera === 'हो' && d.helper_type === 'दलाल/मध्यस्थकर्ता').length;



        const aggregates = {

            total_surveys: data.length,

            satisfied_count: satisfied,

            unsatisfied_count: unsatisfied,

            satisfaction_rate: ((satisfied / data.length) * 100).toFixed(2),

            corruption_cases: ghusCases,

            broker_cases: brokerCases

        };



        const payload = {

            action: 'analyze',

            data: {

                aggregates: aggregates,

                type: 'survey'

            }

        };



        const resp = await requestAppsScript(payload);

        const text = await resp.text();

        Swal.close();



        // Expect JSON string from server

        let json;

        try { json = JSON.parse(text); } catch (e) { json = { error: text }; }



        // store last response + payload for manual save

        window.lastAiSummaryResponse = json && json.parsed ? json : { raw: text };

        window.lastAiSummaryPayload = payload;



        const modal = document.getElementById('aiSummaryModal');

        const content = document.getElementById('aiSummaryContent');

        const title = document.getElementById('aiSummaryTitle');



        if (title) title.textContent = 'सेवाग्राही सर्वेक्षण AI सारांश र सुझावहरू';



        if (json && json.error) {

            if (json.detail && json.detail.includes('429') || json.detail && json.detail.includes('quota')) {

                content.innerHTML = '<div class="ai-error">❌ API Quota Exceeded<br><br>तपाईंले Gemini API को दैनिक quota (20 requests) पूरा गरिसक्नुभयो।<br>कृपया केही समय पछि पुन: प्रयास गर्नुहोस् वा paid plan मा upgrade गर्नुहोस्।<br><br>विस्तृत जानकारी: <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank">Gemini API Rate Limits</a></div>';

            } else {

                content.innerHTML = '<div class="ai-error">❌ त्रुटि: ' + json.error + (json.detail ? '<br><br>' + json.detail : '') + '</div>';

            }

        } else if (json && json.parsed) {

            const p = json.parsed;

            let html = '';



            if (p.summary) {

                html += '<div class="ai-section">';

                html += '<h3>📋 सारांश</h3>';

                html += formatAiTextToParagraphs(p.summary);

                html += '</div>';

            }



            if (p.suggestions && p.suggestions.length) {

                html += '<div class="ai-section">';

                html += '<h3>💡 सुझावहरू</h3>';

                html += '<ol class="ai-suggestions-list">';

                p.suggestions.forEach((s, i) => {

                    html += '<li class="ai-suggestion-item">';

                    if (typeof s === 'object' && s !== null) {

                        if (s.action) html += '<strong class="ai-action">' + s.action + '</strong>';

                        if (s.details) {

                            html += formatAiTextToParagraphs(s.details).replace(/<p>/g, '<p class="ai-details">');

                        }

                        if (s.who || s.when) {

                            html += '<div class="ai-meta">';

                            if (s.who) html += '<span class="ai-who">👤 ' + s.who + '</span>';

                            if (s.when) html += '<span class="ai-when">⏰ ' + s.when + '</span>';

                            html += '</div>';

                        }

                    } else {

                        // Handle string suggestions

                        html += s;

                    }

                    html += '</li>';

                });

                html += '</ol>';

                html += '</div>';

            }



            if (p.kpis && p.kpis.length) {

                html += '<div class="ai-section">';

                html += '<h3>📊 KPIs (प्रदर्शन सूचकहरू)</h3>';

                html += '<ul class="ai-kpis-list">';

                p.kpis.forEach((k, i) => {

                    html += '<li>' + k + '</li>';

                });

                html += '</ul>';

                html += '</div>';

            }



            if (json.raw) {

                html += '<div class="ai-section">';

                html += '<details class="ai-raw-details">';

                html += '<summary>Raw AI Output देखाउनुहोस्</summary>';

                html += '<pre class="ai-raw-content">' + escapeHtml(stripCodeFence(json.raw || '')) + '</pre>';

                html += '</details>';

                html += '</div>';

            }



            content.innerHTML = html;

        } else {

            content.innerHTML = '<pre>' + (typeof text === 'string' ? text : JSON.stringify(json, null, 2)) + '</pre>';

        }



        modal.style.display = 'flex';

        document.body.style.overflow = 'hidden';

    } catch (err) {

        Swal.close();

        console.error(err);

        Swal.fire({ icon: 'error', text: 'AI सारांश प्राप्त गर्दा समस्या भयो।' });

    }

}, 30000));



document.getElementById('generateMonitoringAiSummaryBtn')?.addEventListener('click', throttle(async () => {

    const data = currentFilteredMonitorings.length ? currentFilteredMonitorings : allMonitorings;

    if (!data || data.length === 0) return Swal.fire({ icon: 'info', text: 'समावेश गर्ने अनुगमन डाटा छैन।' });



    Swal.fire({ title: 'AI सारांश तयार गर्दै...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });



    try {

        const charterClear = data.filter(d => d.m_q1 === 'हो').length;

        const processClear = data.filter(d => d.m_q2 === 'हो').length;

        const staffFound = data.filter(d => d.m_q9 === 'हो').length;



        const aggregates = {

            total_monitorings: data.length,

            charter_clear_count: charterClear,

            process_clear_count: processClear,

            staff_found_count: staffFound,

            compliance_rate: (((charterClear + processClear + staffFound) / (data.length * 3)) * 100).toFixed(2)

        };



        const payload = {

            action: 'analyze',

            data: {

                aggregates: aggregates,

                type: 'monitoring'

            }

        };



        const resp = await requestAppsScript(payload);

        const text = await resp.text();

        Swal.close();



        let json;

        try { json = JSON.parse(text); } catch (e) { json = { error: text }; }



        window.lastAiSummaryResponse = json && json.parsed ? json : { raw: text };

        window.lastAiSummaryPayload = payload;



        const modal = document.getElementById('aiSummaryModal');

        const content = document.getElementById('aiSummaryContent');

        const title = document.getElementById('aiSummaryTitle');



        if (title) title.textContent = 'कार्यालय अनुगमन AI सारांश र सुझावहरू';



        if (json && json.error) {

            if (json.detail && json.detail.includes('429') || json.detail && json.detail.includes('quota')) {

                content.innerHTML = '<div class="ai-error">❌ API Quota Exceeded<br><br>तपाईंले Gemini API को दैनिक quota (20 requests) पूरा गरिसक्नुभयो।<br>कृपया केही समय पछि पुन: प्रयास गर्नुहोस् वा paid plan मा upgrade गर्नुहोस्।<br><br>विस्तृत जानकारी: <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank">Gemini API Rate Limits</a></div>';

            } else {

                content.innerHTML = '<div class="ai-error">❌ त्रुटि: ' + json.error + (json.detail ? '<br><br>' + json.detail : '') + '</div>';

            }

        } else if (json && json.parsed) {

            const p = json.parsed;

            let html = '';



            if (p.summary) {

                html += '<div class="ai-section">';

                html += '<h3>📋 सारांश</h3>';

                html += formatAiTextToParagraphs(p.summary);

                html += '</div>';

            }



            if (p.suggestions && p.suggestions.length) {

                html += '<div class="ai-section">';

                html += '<h3>💡 सुझावहरू</h3>';

                html += '<ol class="ai-suggestions-list">';

                p.suggestions.forEach((s, i) => {

                    html += '<li class="ai-suggestion-item">';

                    if (typeof s === 'object' && s !== null) {

                        if (s.action) html += '<strong class="ai-action">' + s.action + '</strong>';

                        if (s.details) {

                            html += formatAiTextToParagraphs(s.details).replace(/<p>/g, '<p class="ai-details">');

                        }

                        if (s.who || s.when) {

                            html += '<div class="ai-meta">';

                            if (s.who) html += '<span class="ai-who">👤 ' + s.who + '</span>';

                            if (s.when) html += '<span class="ai-when">⏰ ' + s.when + '</span>';

                            html += '</div>';

                        }

                    } else {

                        // Handle string suggestions

                        html += s;

                    }

                    html += '</li>';

                });

                html += '</ol>';

                html += '</div>';

            }



            if (p.kpis && p.kpis.length) {

                html += '<div class="ai-section">';

                html += '<h3>📊 KPIs (प्रदर्शन सूचकहरू)</h3>';

                html += '<ul class="ai-kpis-list">';

                p.kpis.forEach((k, i) => {

                    html += '<li>' + k + '</li>';

                });

                html += '</ul>';

                html += '</div>';

            }



            if (json.raw) {

                html += '<div class="ai-section">';

                html += '<details class="ai-raw-details">';

                html += '<summary>Raw AI Output देखाउनुहोस्</summary>';

                html += '<pre class="ai-raw-content">' + escapeHtml(stripCodeFence(json.raw || '')) + '</pre>';

                html += '</details>';

                html += '</div>';

            }



            content.innerHTML = html;

        } else {

            content.innerHTML = '<pre>' + (typeof text === 'string' ? text : JSON.stringify(json, null, 2)) + '</pre>';

        }



        modal.style.display = 'flex';

        document.body.style.overflow = 'hidden';

    } catch (err) {

        Swal.close();

        console.error(err);

        Swal.fire({ icon: 'error', text: 'AI सारांश प्राप्त गर्दा समस्या भयो।' });

    }

}, 30000));



document.getElementById('generateAttendanceAiSummaryBtn')?.addEventListener('click', throttle(async () => {

    const data = currentFilteredAttendance.length ? currentFilteredAttendance : allAttendanceMonitorings;

    if (!data || data.length === 0) return Swal.fire({ icon: 'info', text: 'समावेश गर्ने समय पालना डाटा छैन।' });



    Swal.fire({ title: 'AI सारांश तयार गर्दै...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });



    try {

        const absentCount = data.reduce((sum, d) => sum + (d.total_staff - d.working_staff), 0);

        const totalStaff = data.reduce((sum, d) => sum + d.total_staff, 0);



        const aggregates = {

            total_monitorings: data.length,

            total_staff_count: totalStaff,

            absent_count: absentCount,

            attendance_rate: ((totalStaff - absentCount) / totalStaff * 100).toFixed(2)

        };



        const payload = {

            action: 'analyze',

            data: {

                aggregates: aggregates,

                type: 'attendance'

            }

        };



        const resp = await requestAppsScript(payload);

        const text = await resp.text();

        Swal.close();



        let json;

        try { json = JSON.parse(text); } catch (e) { json = { error: text }; }



        window.lastAiSummaryResponse = json && json.parsed ? json : { raw: text };

        window.lastAiSummaryPayload = payload;



        const modal = document.getElementById('aiSummaryModal');

        const content = document.getElementById('aiSummaryContent');

        const title = document.getElementById('aiSummaryTitle');



        if (title) title.textContent = 'समय पालना AI सारांश र सुझावहरू';



        if (json && json.error) {

            if (json.detail && json.detail.includes('429') || json.detail && json.detail.includes('quota')) {

                content.innerHTML = '<div class="ai-error">❌ API Quota Exceeded<br><br>तपाईंले Gemini API को दैनिक quota (20 requests) पूरा गरिसक्नुभयो।<br>कृपया केही समय पछि पुन: प्रयास गर्नुहोस् वा paid plan मा upgrade गर्नुहोस्।<br><br>विस्तृत जानकारी: <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank">Gemini API Rate Limits</a></div>';

            } else {

                content.innerHTML = '<div class="ai-error">❌ त्रुटि: ' + json.error + (json.detail ? '<br><br>' + json.detail : '') + '</div>';

            }

        } else if (json && json.parsed) {

            const p = json.parsed;

            let html = '';



            if (p.summary) {

                html += '<div class="ai-section">';

                html += '<h3>📋 सारांश</h3>';

                html += formatAiTextToParagraphs(p.summary);

                html += '</div>';

            }



            if (p.suggestions && p.suggestions.length) {

                html += '<div class="ai-section">';

                html += '<h3>💡 सुझावहरू</h3>';

                html += '<ol class="ai-suggestions-list">';

                p.suggestions.forEach((s, i) => {

                    html += '<li class="ai-suggestion-item">';

                    if (typeof s === 'object' && s !== null) {

                        if (s.action) html += '<strong class="ai-action">' + s.action + '</strong>';

                        if (s.details) {

                            html += formatAiTextToParagraphs(s.details).replace(/<p>/g, '<p class="ai-details">');

                        }

                        if (s.who || s.when) {

                            html += '<div class="ai-meta">';

                            if (s.who) html += '<span class="ai-who">👤 ' + s.who + '</span>';

                            if (s.when) html += '<span class="ai-when">⏰ ' + s.when + '</span>';

                            html += '</div>';

                        }

                    } else {

                        // Handle string suggestions

                        html += s;

                    }

                    html += '</li>';

                });

                html += '</ol>';

                html += '</div>';

            }



            if (p.kpis && p.kpis.length) {

                html += '<div class="ai-section">';

                html += '<h3>📊 KPIs (प्रदर्शन सूचकहरू)</h3>';

                html += '<ul class="ai-kpis-list">';

                p.kpis.forEach((k, i) => {

                    html += '<li>' + k + '</li>';

                });

                html += '</ul>';

                html += '</div>';

            }



            if (json.raw) {

                html += '<div class="ai-section">';

                html += '<details class="ai-raw-details">';

                html += '<summary>Raw AI Output देखाउनुहोस्</summary>';

                html += '<pre class="ai-raw-content">' + escapeHtml(stripCodeFence(json.raw || '')) + '</pre>';

                html += '</details>';

                html += '</div>';

            }



            content.innerHTML = html;

        } else {

            content.innerHTML = '<pre>' + (typeof text === 'string' ? text : JSON.stringify(json, null, 2)) + '</pre>';

        }



        modal.style.display = 'flex';

        document.body.style.overflow = 'hidden';

    } catch (err) {

        Swal.close();

        console.error(err);

        Swal.fire({ icon: 'error', text: 'AI सारांश प्राप्त गर्दा समस्या भयो।' });

    }

}, 30000));



// AI Summary button handler for project-monitoring

document.getElementById('generateProjectAiSummaryBtn')?.addEventListener('click', throttle(async () => {

    const data = currentFilteredProjectMonitorings.length ? currentFilteredProjectMonitorings : allProjectMonitorings;

    if (!data || data.length === 0) return Swal.fire({ icon: 'info', text: 'समावेश गर्ने आयोजना डाटा छैन।' });



    // Prepare aggregates

    const totalProjects = data.length;

    const avgProgress = (data.reduce((s, r) => s + (parseFloat(r.pm_physical_progress) || 0), 0) / totalProjects) || 0;

    const totalApproved = data.reduce((s, r) => s + (parseFloat(r.pm_approved_cost) || 0), 0);

    const totalSpent = data.reduce((s, r) => s + (parseFloat(r.pm_spent_amount) || 0), 0);

    const highProgress = data.filter(r => parseFloat(r.pm_physical_progress) >= 75).length;

    const lowProgress = data.filter(r => parseFloat(r.pm_physical_progress) < 25).length;



    // Top issues: overspend ratio, stalled projects

    const byOverspend = data.map(r => ({ r, ratio: ((parseFloat(r.pm_spent_amount) || 0) / (parseFloat(r.pm_approved_cost) || 1)) })).sort((a, b) => b.ratio - a.ratio).slice(0, 5).map(x => ({ project: x.r.pm_project_name, agency: x.r.pm_implementing_agency, contractor: x.r.pm_contractor_name, approved: x.r.pm_approved_cost, spent: x.r.pm_spent_amount, ratio: (x.r.ratio || 0).toFixed(2) }));

    const stalled = data.filter(r => (parseFloat(r.pm_physical_progress) || 0) < 30).slice(0, 5).map(r => ({ project: r.pm_project_name, progress: r.pm_physical_progress, agency: r.pm_implementing_agency, contractor: r.pm_contractor_name }));



    const examples = data.slice(0, 3).map(r => ({ project: r.pm_project_name, date: r.pm_monitoring_date, progress: r.pm_physical_progress, approved: r.pm_approved_cost, spent: r.pm_spent_amount, agency: r.pm_implementing_agency, contractor: r.pm_contractor_name, note: r.pm_overall_remark || r.pm_recommendation || '' }));



    const payload = { action: 'analyze', type: 'project-monitoring', data: { aggregates: { totalProjects, avgProgress, totalApproved, totalSpent, highProgress, lowProgress }, topOverspend: byOverspend, stalled, examples } };



    Swal.fire({ title: 'AI सारांश बनाइँदैछ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {

        const resp = await requestAppsScript(payload);

        const text = await resp.text();

        Swal.close();

        // Expect JSON string from server

        let json;

        try { json = JSON.parse(text); } catch (e) { json = { error: text }; }



        // store last response + payload for manual save

        window.lastAiSummaryResponse = json && json.parsed ? json : { raw: text };

        window.lastAiSummaryPayload = payload;



        const modal = document.getElementById('aiSummaryModal');

        const content = document.getElementById('aiSummaryContent');

        const title = document.getElementById('aiSummaryTitle');



        if (title) title.textContent = 'आयोजना अनुगमन AI सारांश र सुझावहरू';



        console.log('AI Response:', json);

        console.log('Has parsed?', !!json.parsed);

        console.log('Parsed data:', json.parsed);



        if (json && json.error) {

            // Handle API quota error specifically

            if (json.detail && json.detail.includes('429') || json.detail && json.detail.includes('quota')) {

                content.innerHTML = '<div class="ai-error">❌ API Quota Exceeded<br><br>तपाईंले Gemini API को दैनिक quota (20 requests) पूरा गरिसक्नुभयो।<br>कृपया केही समय पछि पुन: प्रयास गर्नुहोस् वा paid plan मा upgrade गर्नुहोस्।<br><br>विस्तृत जानकारी: <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank">Gemini API Rate Limits</a></div>';

            } else {

                content.innerHTML = '<div class="ai-error">❌ त्रुटि: ' + json.error + (json.detail ? '<br><br>' + json.detail : '') + '</div>';

            }

        } else if (json && json.parsed) {

            const p = json.parsed;

            let html = '';



            // Summary section

            if (p.summary) {

                html += '<div class="ai-section">';

                html += '<h3>📋 सारांश</h3>';

                html += formatAiTextToParagraphs(p.summary);

                html += '</div>';

            }



            // Suggestions section

            if (p.suggestions && p.suggestions.length) {

                html += '<div class="ai-section">';

                html += '<h3>💡 सुझावहरू</h3>';

                html += '<ol class="ai-suggestions-list">';

                p.suggestions.forEach((s, i) => {

                    html += '<li class="ai-suggestion-item">';

                    if (typeof s === 'object' && s !== null) {

                        // Structured suggestion with action, details, who, when

                        if (s.action) {

                            html += '<strong class="ai-action">' + s.action + '</strong>';

                        }

                        if (s.details) {

                            html += formatAiTextToParagraphs(s.details).replace(/<p>/g, '<p class="ai-details">');

                        }

                        if (s.who || s.when) {

                            html += '<div class="ai-meta">';

                            if (s.who) html += '<span class="ai-who">👤 ' + s.who + '</span>';

                            if (s.when) html += '<span class="ai-when">⏰ ' + s.when + '</span>';

                            html += '</div>';

                        }

                    } else {

                        // Simple string suggestion

                        html += s;

                    }

                    html += '</li>';

                });

                html += '</ol>';

                html += '</div>';

            }



            // KPIs section

            if (p.kpis && p.kpis.length) {

                html += '<div class="ai-section">';

                html += '<h3>📊 KPIs (प्रदर्शन सूचकहरू)</h3>';

                html += '<ul class="ai-kpis-list">';

                p.kpis.forEach((k, i) => {

                    html += '<li>' + k + '</li>';

                });

                html += '</ul>';

                html += '</div>';

            }



            // Show raw as collapsible

            if (json.raw) {

                html += '<div class="ai-section">';

                html += '<details class="ai-raw-details">';

                html += '<summary>Raw AI Output देखाउनुहोस्</summary>';

                html += '<pre class="ai-raw-content">' + escapeHtml(stripCodeFence(json.raw || '')) + '</pre>';

                html += '</details>';

                html += '</div>';

            }



            content.innerHTML = html;

        } else {

            content.innerHTML = '<pre>' + (typeof text === 'string' ? text : JSON.stringify(json, null, 2)) + '</pre>';

        }

        modal.style.display = 'flex';

        document.body.style.overflow = 'hidden';

    } catch (err) {

        Swal.close();

        console.error(err);

        Swal.fire({ icon: 'error', text: 'AI सारांश प्राप्त गर्दा समस्या भयो।' });

    }

}, 30000));



// Close AI modal

document.getElementById('closeAiSummary')?.addEventListener('click', () => {

    const modal = document.getElementById('aiSummaryModal');

    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }

});



// Save AI summary to spreadsheet (manual)

document.getElementById('saveAiSummaryBtn')?.addEventListener('click', async () => {

    const lastResp = window.lastAiSummaryResponse;

    const lastPayload = window.lastAiSummaryPayload;

    if (!lastResp) return Swal.fire({ icon: 'info', text: 'सेभ गर्नको लागि कुनै AI नतिजा उपलब्ध छैन।' });



    const confirm = await Swal.fire({ title: 'सारांश सर्भरमा सेभ गर्ने?', showCancelButton: true, confirmButtonText: 'सेभ गर्नुहोस्', cancelButtonText: 'रद्द', icon: 'question' });

    if (!confirm.isConfirmed) return;



    Swal.fire({ title: 'सेभ हुँदैछ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {

        const savePayload = { action: 'save_ai_summary', type: 'project-monitoring', data: { requestPayload: lastPayload.data || {}, parsed: lastResp.parsed || null, raw: lastResp.raw || (lastResp.result || ''), created_at: (new Date()).toISOString() } };

        const resp = await requestAppsScript(savePayload);

        const txt = await resp.text();

        Swal.close();

        if (txt && txt.indexOf('Success') !== -1) {

            Swal.fire({ icon: 'success', text: 'AI सारांश सर्भरमा सुरक्षित भयो।' });

            // optionally disable save button

            document.getElementById('saveAiSummaryBtn').disabled = true;

        } else {

            Swal.fire({ icon: 'warning', text: 'सेभ गर्दा समस्या भयो: ' + txt });

        }

    } catch (err) {

        Swal.close();

        console.error(err);

        Swal.fire({ icon: 'error', text: 'सेभ गर्दा त्रुटि आयो।' });

    }

});



// Duplicate tab switching logic disabled - using initSmoothTabTransitions instead

/*

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

*/





// Password Change Form Handler

document.getElementById('dashboardChangePasswordForm')?.addEventListener('submit', async function (e) {

    e.preventDefault();



    const currentPassword = document.getElementById('dashboardCurrentPassword').value;

    const newPassword = document.getElementById('dashboardNewPassword').value;

    const confirmPassword = document.getElementById('dashboardConfirmPassword').value;



    // Try to get current user from multiple possible sources

    let currentUser = localStorage.getItem('currentUser');

    console.log('Current user from localStorage (currentUser):', currentUser);



    // If not found, try other common keys

    if (!currentUser) {

        const allKeys = Object.keys(localStorage);

        console.log('All localStorage keys:', allKeys);



        // Try to find user-related keys

        for (const key of allKeys) {

            if (key.toLowerCase().includes('user') || key.toLowerCase().includes('login') || key.toLowerCase().includes('session')) {

                console.log(`Found potential user key: ${key} =`, localStorage.getItem(key));

                try {

                    const value = JSON.parse(localStorage.getItem(key));

                    if (value.username) {

                        currentUser = value.username;

                        console.log('Using username from:', key);

                        break;

                    }

                } catch (e) {

                    // If not JSON, try using the value directly

                    currentUser = localStorage.getItem(key);

                    console.log('Using direct value from:', key);

                    break;

                }

            }

        }

    }



    // If still not found, check if user is stored in data arrays

    if (!currentUser) {

        console.log('User not found in localStorage, checking data arrays...');



        // Check survey data for user info

        try {

            const surveyData = JSON.parse(localStorage.getItem('surveyData_nsc_full') || '[]');

            if (surveyData.length > 0 && surveyData[0].username) {

                currentUser = surveyData[0].username;

                console.log('Using username from survey data:', currentUser);

            }

        } catch (e) {

            console.log('Error parsing survey data:', e);

        }



        // Check monitoring data

        if (!currentUser) {

            try {

                const monitoringData = JSON.parse(localStorage.getItem('monitoringData_nsc') || '[]');

                if (monitoringData.length > 0 && monitoringData[0].username) {

                    currentUser = monitoringData[0].username;

                    console.log('Using username from monitoring data:', currentUser);

                }

            } catch (e) {

                console.log('Error parsing monitoring data:', e);

            }

        }

    }



    // If still not found, prompt user for username

    if (!currentUser) {

        console.log('User not found in any data source, prompting for username');



        // Create a custom HTML input to prevent Nepali digit conversion

        const { value: username } = await Swal.fire({

            title: 'युजरनेम',

            text: 'कृपया आफ्नो युजरनेम प्रविष्ट गर्नुहोस्',

            html: '<input id="swal-username-input" class="swal2-input" inputmode="latin" lang="en" placeholder="युजरनेम" style="font-family: Arial, sans-serif;">',

            showCancelButton: true,

            confirmButtonText: 'पुष्टि गर्नुहोस्',

            cancelButtonText: 'रद्द गर्नुहोस्',

            didOpen: () => {

                const input = document.getElementById('swal-username-input');

                if (input) {

                    input.focus();

                    // Prevent Nepali digit conversion for this input

                    input.addEventListener('keydown', function (e) {

                        if (e.ctrlKey || e.altKey || e.metaKey) return;

                        if (e.key >= '0' && e.key <= '9') {

                            e.preventDefault();

                            const start = this.selectionStart;

                            const end = this.selectionEnd;

                            this.value = this.value.substring(0, start) + e.key + this.value.substring(end);

                            this.setSelectionRange(start + 1, start + 1);

                        }

                    });

                    input.addEventListener('input', function () {

                        this.value = fromNepaliDigits(this.value);

                    });

                }

            },

            preConfirm: () => {

                const input = document.getElementById('swal-username-input');

                if (!input || !input.value) {

                    Swal.showValidationMessage('कृपया युजरनेम प्रविष्ट गर्नुहोस्');

                    return false;

                }

                return input.value;

            }

        });



        if (username) {

            currentUser = username;

            console.log('User entered username:', currentUser);

        } else {

            Swal.fire({ icon: 'error', text: 'युजरनेम आवश्यक छ।' });

            return;

        }

    }



    console.log('Final username to use:', currentUser);



    if (!currentPassword || !newPassword || !confirmPassword) {

        Swal.fire({ icon: 'warning', text: 'कृपया सबै फिल्डहरू भर्नुहोस्।' });

        return;

    }



    if (newPassword.length < 6) {

        Swal.fire({ icon: 'warning', text: 'नयाँ पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ।' });

        return;

    }



    if (newPassword !== confirmPassword) {

        Swal.fire({ icon: 'warning', text: 'नयाँ पासवर्ड र पुष्टि पासवर्ड मिलेन।' });

        return;

    }



    if (currentPassword === newPassword) {

        Swal.fire({ icon: 'warning', text: 'नयाँ पासवर्ड हालको पासवर्ड भन्दा फरक हुनुपर्छ।' });

        return;

    }



    try {

        Swal.fire({

            icon: 'info',

            text: 'पासवर्ड परिवर्तन हुँदैछ...',

            allowOutsideClick: false,

            showConfirmButton: false

        });



        const response = await requestAppsScript({

            action: 'change_password',

            username: currentUser,

            currentPassword: currentPassword,

            newPassword: newPassword

        });



        const result = await response.json();

        Swal.close();



        if (result.status === 'success') {

            Swal.fire({ icon: 'success', text: result.message });

            document.getElementById('dashboardChangePasswordForm').reset();

        } else {

            Swal.fire({ icon: 'error', text: result.message });

        }

    } catch (error) {

        Swal.close();

        Swal.fire({ icon: 'error', text: 'पासवर्ड परिवर्तन गर्दा त्रुटि आयो।' });

        console.error(error);

    }

});



// Cancel button handler

document.getElementById('cancelChangePassword')?.addEventListener('click', function () {

    document.getElementById('dashboardChangePasswordForm').reset();

    Swal.fire({

        icon: 'info',

        text: 'पासवर्ड परिवर्तन रद्द गरियो।',

        timer: 1500,

        showConfirmButton: false

    });

});



// Password visibility toggle handlers

function togglePasswordVisibility(inputId, iconId) {

    const input = document.getElementById(inputId);

    const icon = document.getElementById(iconId);



    if (input.type === 'password') {

        input.type = 'text';

        icon.classList.remove('fa-eye');

        icon.classList.add('fa-eye-slash');

    } else {

        input.type = 'password';

        icon.classList.remove('fa-eye-slash');

        icon.classList.add('fa-eye');

    }

}



document.getElementById('toggleCurrentPassword')?.addEventListener('click', function () {

    togglePasswordVisibility('dashboardCurrentPassword', 'toggleCurrentPassword');

});



document.getElementById('toggleNewPassword')?.addEventListener('click', function () {

    togglePasswordVisibility('dashboardNewPassword', 'toggleNewPassword');

});



document.getElementById('toggleConfirmPassword')?.addEventListener('click', function () {

    togglePasswordVisibility('dashboardConfirmPassword', 'toggleConfirmPassword');

});



// Prevent Nepali digit conversion in password fields

function preventNepaliDigits(inputId) {

    const input = document.getElementById(inputId);

    if (!input) {

        console.error('Input not found:', inputId);

        return;

    }




    // Use a more aggressive approach - intercept keydown and prevent IME

    input.addEventListener('keydown', function (e) {

        // Allow control keys

        if (e.ctrlKey || e.altKey || e.metaKey) return;



        // If it's a digit key (0-9), prevent IME and insert directly

        if (e.key >= '0' && e.key <= '9') {

            e.preventDefault();

            const start = this.selectionStart;

            const end = this.selectionEnd;

            this.value = this.value.substring(0, start) + e.key + this.value.substring(end);

            this.setSelectionRange(start + 1, start + 1);

        }

    });



    // Also handle paste events

    input.addEventListener('paste', function (e) {

        e.preventDefault();

        const pastedText = (e.clipboardData || window.clipboardData).getData('text');

        const converted = fromNepaliDigits(pastedText);

        const start = this.selectionStart;

        const end = this.selectionEnd;

        this.value = this.value.substring(0, start) + converted + this.value.substring(end);

        this.setSelectionRange(start + converted.length, start + converted.length);

    });



    // Final cleanup on blur

    input.addEventListener('blur', function () {

        this.value = fromNepaliDigits(this.value);

    });



    // Also clean up on focus in case something was changed while unfocused

    input.addEventListener('focus', function () {

        this.value = fromNepaliDigits(this.value);

    });



    // Also clean up on input as a fallback

    input.addEventListener('input', function () {

        const original = this.value;

        const converted = fromNepaliDigits(original);

        if (original !== converted) {

            this.value = converted;

        }

    });

}



// Delay initialization until DOM is fully loaded

document.addEventListener('DOMContentLoaded', function () {

    preventNepaliDigits('dashboardCurrentPassword');

    preventNepaliDigits('dashboardNewPassword');

    preventNepaliDigits('dashboardConfirmPassword');

});



document.getElementById("applyFilter")?.addEventListener("click", () => {

    currentPage = 1;

    refreshDashboard();

});



// Auto-filter on input change

const filterInputs = [

    "filterDateFrom", "filterDateTo", "filterPradesh", "filterDistrict",

    "filterSthaaniya", "filterOffice", "filterMonitor", "filterGender",

    "filterCategory", "filterEmpName", "filterEmpSymbol", "filterFiscalYear"

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

        "monitoringFieldSelector", "dynamicFieldSelector", "filterFiscalYear"

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



        const response = await requestAppsScript(payload);



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

    } else if (viewType === 'project-monitoring') {

        thead.innerHTML = `<tr><th>अनुगमन मिति</th><th>जिल्ला</th><th>आयोजनाको नाम</th><th>कार्यान्वयन गर्ने निकाय</th><th>ठेकेदार</th><th>स्वीकृत लागत (लाख)</th><th>भुक्तानी (लाख)</th><th>भौतिक प्रगति (%)</th><th>कार्य</th></tr>`;

        tbody.innerHTML = data.map(r => {

            const progress = parseFloat(r.pm_physical_progress || getVal(r, 'pm_physical_progress', '१०. भौतिक प्रगति (%)')) || 0;

            let progressColor = '#de3053';

            if (progress >= 75) progressColor = '#27ae60';

            else if (progress >= 50) progressColor = '#f59e0b';

            else if (progress >= 25) progressColor = '#f97316';



            return `

                <tr>

                    <td>${getVal(r, 'pm_monitoring_date', '११. अनुगमन मिति')}</td>

                    <td>${getVal(r, 'pm_jilla', '२. जिल्ला')}</td>

                    <td>${getVal(r, 'pm_project_name', '१. आयोजनाको नाम')}</td>

                    <td>${getVal(r, 'pm_implementing_agency', '३. कार्यान्वयन गर्ने निकाय')}</td>

                    <td>${getVal(r, 'pm_contractor_name', '४. निर्माण व्यवसायी / ठेकेदारको नाम')}</td>

                    <td>${getVal(r, 'pm_approved_cost', '८. स्वीकृत लागत अनुमान (रु. लाखमा)')}</td>

                    <td>${getVal(r, 'pm_spent_amount', '९. हालसम्म भुक्तानी/खर्च भएको रकम (रु. लाखमा)')}</td>

                    <td style="color: ${progressColor}; font-weight: 700;">${progress}%</td>

                    <td data-label="कार्य">

                        <button class="action-btn btn-edit" onclick="editRecord('${r.timestamp}', 'project-monitoring')" title="सम्पादन"><i class="fas fa-edit"></i></button>

                        <button class="action-btn btn-delete" onclick="deleteRecord('${r.timestamp}', 'project-monitoring')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>

                    </td>

                </tr>

            `;

        }).join('');

    }





}



const detailTableCloseBtn = document.getElementById("closeDetailTable");

const detailTableContainer = document.getElementById("dynamicDetailTableContainer");

const closeAttendanceEditModalBtn = document.getElementById('closeAttendanceEditModal');

const attendanceEditModalCancelBtn = document.getElementById('attendanceEditModalCancelBtn');

const attendanceEditModalSaveBtn = document.getElementById('attendanceEditModalSaveBtn');

const closeSurveyEditModalBtn = document.getElementById('closeSurveyEditModal');

const closeMonitoringEditModalBtn = document.getElementById('closeMonitoringEditModal');



if (closeAttendanceEditModalBtn) {

    closeAttendanceEditModalBtn.addEventListener('click', closeAttendanceEditModal);

}

if (attendanceEditModalCancelBtn) {

    attendanceEditModalCancelBtn.addEventListener('click', closeAttendanceEditModal);

}

if (attendanceEditModalSaveBtn) {

    attendanceEditModalSaveBtn.addEventListener('click', saveAttendanceEditModal);

}

if (closeSurveyEditModalBtn) {

    closeSurveyEditModalBtn.addEventListener('click', closeSurveyEditModal);

}

if (closeMonitoringEditModalBtn) {

    closeMonitoringEditModalBtn.addEventListener('click', closeMonitoringEditModal);

}



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



let districtData = {};

let localLevelData = {};

let currentMapView = 'district'; // 'district' or 'local'



function getMapScoreValue(data) {

    if (currentDashboardView === 'project-monitoring') {

        return Number(data?.score || 0);

    }



    if (data && data.total > 0) {

        return (data.unsatisfied / data.total) * 100;

    }

    return 0;

}



function getMapScoreColor(score) {

    if (currentDashboardView === 'project-monitoring') {

        if (score >= 75) return '#10b981';

        if (score >= 50) return '#3b82f6';

        if (score >= 25) return '#f59e0b';

        return '#ef4444';

    }



    const complianceScore = 100 - score;

    if (complianceScore >= 80) return '#10b981';

    if (complianceScore >= 60) return '#3b82f6';

    if (complianceScore >= 40) return '#f59e0b';

    return '#ef4444';

}



function getMapScoreLabel(score) {

    if (currentDashboardView === 'project-monitoring') {

        if (score >= 75) return 'उत्कृष्ट';

        if (score >= 50) return 'राम्रो';

        if (score >= 25) return 'मध्यम';

        return 'कमजोर';

    }



    const complianceScore = 100 - score;

    if (complianceScore >= 80) return 'उत्कृष्ट';

    if (complianceScore >= 60) return 'राम्रो';

    if (complianceScore >= 40) return 'सुधार आवश्यक';

    return 'कमजोर';

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



    // Load Nepal districts GeoJSON

    districtLayerGroup = L.layerGroup().addTo(mapObj);

    loadDistrictGeoJSON();



    // Load local units GeoJSON

    localLevelLayerGroup = L.layerGroup();

    loadLocalLevelGeoJSON();

}



function loadDistrictGeoJSON() {

    // Use GitHub raw URL directly to avoid CORS issues on file:// protocol

    fetch('https://raw.githubusercontent.com/Acesmndr/nepal-geojson/master/generated-geojson/nepal-with-districts-acesmndr.geojson')

        .then(response => {

            if (!response.ok) throw new Error('Failed to fetch GeoJSON');

            return response.json();

        })

        .then(data => {

            data.features.forEach(feature => {

                const districtNameEn = feature.properties.DISTRICT || feature.properties.DIST_EN || feature.properties.name_en || feature.properties.name;

                // Map English name to Nepali name for consistency with project data

                const districtNameNp = (districtNameEn && DISTRICT_NAME_MAP[districtNameEn.toUpperCase()]) || districtNameEn;

                districtData[districtNameNp] = {

                    feature: feature,

                    score: 0,

                    total: 0,

                    unsatisfied: 0

                };

            });

            updateChoroplethMap();

        })

        .catch(error => console.error('Error loading GeoJSON:', error));

}



function loadLocalLevelGeoJSON() {

    // Use GitHub raw URL directly to avoid CORS issues on file:// protocol

    fetch('https://raw.githubusercontent.com/younginnovations/nepal-locallevel-map/master/out/municipalities.simplified.geojson')

        .then(response => {

            if (!response.ok) throw new Error('Failed to fetch GeoJSON');

            return response.json();

        })

        .then(data => {

            data.features.forEach(feature => {

                const localName = feature.properties.name_en || feature.properties.name || feature.properties.Gaunpalika || feature.properties.Nagarpalika;

                const districtName = feature.properties.district || feature.properties.District;

                if (localName) {

                    localLevelData[localName] = {

                        feature: feature,

                        district: districtName,

                        score: 0,

                        total: 0,

                        unsatisfied: 0

                    };

                }

            });

        })

        .catch(error => console.error('Error loading local units GeoJSON:', error));

}



window.switchMapView = function (view) {

    currentMapView = view;



    const districtBtn = document.getElementById('districtViewBtn');

    const localBtn = document.getElementById('localLevelViewBtn');



    if (view === 'district') {

        districtBtn.style.background = '#306a95';

        districtBtn.style.color = 'white';

        localBtn.style.background = '#e5e7eb';

        localBtn.style.color = '#374151';



        districtLayerGroup.addTo(mapObj);

        localLevelLayerGroup.remove();



        mapObj.setZoom(7);

        updateChoroplethMap();

    } else {

        localBtn.style.background = '#306a95';

        localBtn.style.color = 'white';

        districtBtn.style.background = '#e5e7eb';

        districtBtn.style.color = '#374151';



        localLevelLayerGroup.addTo(mapObj);

        districtLayerGroup.remove();



        mapObj.setZoom(8);

        updateLocalLevelChoroplethMap();

    }

};



function updateLocalLevelChoroplethMap() {

    if (!localLevelLayerGroup) return;



    localLevelLayerGroup.clearLayers();



    // Aggregate data by local level

    let data = [];

    let dKey = '';



    if (currentDashboardView === 'survey') { data = currentFilteredSubmissions; dKey = 'local_level'; }

    else if (currentDashboardView === 'monitoring') { data = currentFilteredMonitorings; dKey = 'm_local_level'; }

    else if (currentDashboardView === 'attendance') { data = currentFilteredAttendance; dKey = 'local_level'; }

    else if (currentDashboardView === 'project-monitoring') { data = currentFilteredProjectMonitorings; dKey = 'pm_local_level'; }



    // Reset local level data

    Object.keys(localLevelData).forEach(localName => {

        localLevelData[localName].total = 0;

        localLevelData[localName].unsatisfied = 0;

        localLevelData[localName].score = 0;

    });



    // Calculate statistics for each local level

    const stats = data.reduce((acc, item) => {

        const localName = item[dKey] || getVal(item, dKey, 'स्थानीय तह');

        if (!localName || !localLevelData[localName]) return acc;



        if (!acc[localName]) acc[localName] = { total: 0, unsatisfied: 0 };

        acc[localName].total++;



        // Update local level data

        if (localLevelData[localName]) {

            localLevelData[localName].total = acc[localName].total;

            localLevelData[localName].unsatisfied = acc[localName].unsatisfied;

        }



        // Check for negative indicators

        let isNegative = false;

        if (currentDashboardView === 'survey') {

            if (item.sahayog_parera === 'पर्‍यो' || item.ghus_parera === 'पर्‍यो' ||

                item.satisfaction_flag === 'असन्तुष्ट' || item.yojana_santushti === 'असन्तुष्ट') {

                isNegative = true;

            }

        } else if (currentDashboardView === 'monitoring') {

            if (['स्पष्ट नबुझिने', 'पढ्न झन्झटिलो', 'नभएको'].includes(item.m_q1) ||

                ['स्पष्ट उल्लेख नभएको', 'आंशिक', 'नभएको'].includes(item.m_q2) ||

                item.m_q5 === 'देखियो' || ['आंशिक', 'भेटिएन'].includes(item.m_q10) ||

                item.m_q12 === 'नराम्रो') {

                isNegative = true;

            }

        }



        if (isNegative) {

            acc[localName].unsatisfied++;

            if (localLevelData[localName]) {

                localLevelData[localName].unsatisfied = acc[localName].unsatisfied;

            }

        }



        return acc;

    }, {});



    // Render local level polygons

    Object.keys(localLevelData).forEach(localName => {

        const data = localLevelData[localName];

        if (!data.feature) return;



        // Calculate score based on unsatisfied ratio

        let score = 0;

        if (data.total > 0) {

            score = (data.unsatisfied / data.total) * 100;

        }

        data.score = score;



        if (data.total > 0) {

            console.log(`District: ${districtName}, Total: ${data.total}, Unsatisfied: ${data.unsatisfied}, Score: ${score.toFixed(1)}%, Color: ${fillColor}`);

        }



        // Determine color based on score (compliance score: higher is better)

        // Convert unsatisfied ratio to compliance score: 100 - unsatisfied%

        let complianceScore = 100 - score;



        let fillColor = '#ef4444'; // Red (Poor - below 40%)

        if (complianceScore >= 80) fillColor = '#10b981'; // Green (Excellent - 80-100%)

        else if (complianceScore >= 60) fillColor = '#3b82f6'; // Blue (Good - 60-79%)

        else if (complianceScore >= 40) fillColor = '#f59e0b'; // Orange (Needs Improvement - 40-59%)



        const layer = L.geoJSON(data.feature, {

            style: {

                fillColor: fillColor,

                weight: 1,

                opacity: 1,

                color: 'white',

                dashArray: '3',

                fillOpacity: 0.7

            },

            onEachFeature: function (feature, layer) {

                layer.on({

                    click: function (e) {

                        showLocalLevelPopup(localName, data, e.latlng);

                    },

                    mouseover: function (e) {

                        layer.setStyle({

                            weight: 2,

                            color: '#666',

                            dashArray: '',

                            fillOpacity: 0.9

                        });

                    },

                    mouseout: function (e) {

                        layer.setStyle({

                            weight: 1,

                            color: 'white',

                            dashArray: '3',

                            fillOpacity: 0.7

                        });

                    }

                });

            }

        }).addTo(localLevelLayerGroup);

    });

}



function updateChoroplethMap() {

    if (!districtLayerGroup) return;



    districtLayerGroup.clearLayers();



    Object.keys(districtData).forEach(districtName => {

        const data = districtData[districtName];

        if (!data.feature) return;



        const score = getMapScoreValue(data);

        data.score = score;

        const fillColor = getMapScoreColor(score);



        const layer = L.geoJSON(data.feature, {

            style: {

                fillColor: fillColor,

                weight: 2,

                opacity: 1,

                color: 'white',

                dashArray: '3',

                fillOpacity: 0.7

            },

            onEachFeature: function (feature, layer) {

                layer.on({

                    click: function (e) {

                        showDistrictPopup(districtName, data, e.latlng);

                    },

                    mouseover: function (e) {

                        layer.setStyle({

                            weight: 3,

                            color: '#666',

                            dashArray: '',

                            fillOpacity: 0.9

                        });

                    },

                    mouseout: function (e) {

                        layer.setStyle({

                            weight: 2,

                            color: 'white',

                            dashArray: '3',

                            fillOpacity: 0.7

                        });

                    }

                });

            }

        }).addTo(districtLayerGroup);

    });



    // Add legend

    addMapLegend();

}



function showDistrictPopup(districtName, data, latlng) {

    const total = toNepaliDigits(data.total);

    const unsatisfied = toNepaliDigits(data.unsatisfied);



    // Check if district has data

    if (data.total === 0) {

        const popupContent = `

            <div style="font-family:'Kalimati', sans-serif; min-width: 200px;">

                <h3 style="margin:0 0 10px 0; color:#306a95;">${districtName}</h3>

                <div style="margin:5px 0; color:#ef4444; font-weight:bold;">

                    <i class="fas fa-exclamation-circle"></i> डाटा उपलब्ध छैन

                </div>

                <div style="margin:5px 0; color:#666; font-size:0.9em;">

                    यो जिल्लाको लागि कुनै रेकर्ड छैन।

                </div>

            </div>

        `;



        L.popup()

            .setLatLng(latlng)

            .setContent(popupContent)

            .openOn(mapObj);

        return;

    }



    const score = getMapScoreValue(data);

    const scoreLabel = getMapScoreLabel(score);

    const scoreColor = getMapScoreColor(score);

    const scoreMetricLabel = currentDashboardView === 'project-monitoring' ? 'अनुगमन स्कोर' : 'अनुपालन स्कोर';

    const scoreValue = currentDashboardView === 'project-monitoring'

        ? `${toNepaliDigits(score.toFixed(1))}%`

        : `${toNepaliDigits((100 - score).toFixed(1))}%`;



    const popupContent = `

        <div style="font-family:'Kalimati', sans-serif; min-width: 200px;">

            <h3 style="margin:0 0 10px 0; color:#306a95;">${districtName}</h3>

            <div style="margin:5px 0;">

                <strong>${scoreMetricLabel}:</strong> 

                <span style="color:${scoreColor}; font-weight:bold;">${scoreValue} (${scoreLabel})</span>

            </div>

            <div style="margin:5px 0;">

                <strong>कूल रेकर्ड:</strong> ${total}

            </div>

            <div style="margin:5px 0;">

                <strong>नकारात्मक:</strong> ${unsatisfied}

            </div>

            <hr style="margin:10px 0;">

            <button onclick="filterByDistrict('${districtName}')" 

                    style="background:#306a95; color:white; border:none; padding:8px 16px; 

                           border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;">

                विवरण हेर्नुहोस्

            </button>

            <button onclick="analyzeDistrict('${districtName}')" 

                    style="background:#8b5cf6; color:white; border:none; padding:8px 16px; 

                           border-radius:4px; cursor:pointer; width:100%;">

                <i class="fas fa-robot"></i> AI विश्लेषण

            </button>

        </div>

    `;



    L.popup()

        .setLatLng(latlng)

        .setContent(popupContent)

        .openOn(mapObj);

}



function showLocalLevelPopup(localName, data, latlng) {

    const total = toNepaliDigits(data.total);

    const unsatisfied = toNepaliDigits(data.unsatisfied);

    const district = data.district || 'अज्ञात';



    // Check if local level has data

    if (data.total === 0) {

        const popupContent = `

            <div style="font-family:'Kalimati', sans-serif; min-width: 200px;">

                <h3 style="margin:0 0 10px 0; color:#306a95;">${localName}</h3>

                <div style="margin:5px 0; font-size:0.9em; color:#666;">

                    <strong>जिल्ला:</strong> ${district}

                </div>

                <div style="margin:5px 0; color:#ef4444; font-weight:bold;">

                    <i class="fas fa-exclamation-circle"></i> डाटा उपलब्ध छैन

                </div>

                <div style="margin:5px 0; color:#666; font-size:0.9em;">

                    यो स्थानीय तहको लागि कुनै रेकर्ड छैन।

                </div>

            </div>

        `;



        L.popup()

            .setLatLng(latlng)

            .setContent(popupContent)

            .openOn(mapObj);

        return;

    }



    const unsatisfiedPercent = data.score.toFixed(1);

    const complianceScore = (100 - data.score).toFixed(1);



    let scoreColor = '#ef4444';

    let scoreText = 'कमजोर';

    if (complianceScore >= 80) {

        scoreColor = '#10b981';

        scoreText = 'उत्कृष्ट';

    } else if (complianceScore >= 60) {

        scoreColor = '#3b82f6';

        scoreText = 'राम्रो';

    } else if (complianceScore >= 40) {

        scoreColor = '#f59e0b';

        scoreText = 'सुधार आवश्यक';

    }



    const popupContent = `

        <div style="font-family:'Kalimati', sans-serif; min-width: 200px;">

            <h3 style="margin:0 0 10px 0; color:#306a95;">${localName}</h3>

            <div style="margin:5px 0; font-size:0.9em; color:#666;">

                <strong>जिल्ला:</strong> ${district}

            </div>

            <div style="margin:5px 0;">

                <strong>अनुपालन स्कोर:</strong> 

                <span style="color:${scoreColor}; font-weight:bold;">${toNepaliDigits(complianceScore)}% (${scoreText})</span>

            </div>

            <div style="margin:5px 0;">

                <strong>कूल रेकर्ड:</strong> ${total}

            </div>

            <div style="margin:5px 0;">

                <strong>नकारात्मक:</strong> ${unsatisfied}

            </div>

            <hr style="margin:10px 0;">

            <button onclick="filterByLocalLevel('${localName}')" 

                    style="background:#306a95; color:white; border:none; padding:8px 16px; 

                           border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;">

                विवरण हेर्नुहोस्

            </button>

            <button onclick="analyzeLocalLevel('${localName}')" 

                    style="background:#8b5cf6; color:white; border:none; padding:8px 16px; 

                           border-radius:4px; cursor:pointer; width:100%;">

                <i class="fas fa-robot"></i> AI विश्लेषण

            </button>

        </div>

    `;



    L.popup()

        .setLatLng(latlng)

        .setContent(popupContent)

        .openOn(mapObj);

}



function filterByDistrict(districtName) {

    // Filter the current data by district

    if (currentDashboardView === 'survey') {

        currentFilteredSubmissions = currentFilteredSubmissions.filter(item =>

            (item.jilla || getVal(item, 'jilla', 'जिल्ला')) === districtName

        );

        showDetailedTable(currentFilteredSubmissions, `${districtName} - सेवाग्राही सर्वेक्षण`, 'survey');

    } else if (currentDashboardView === 'monitoring') {

        currentFilteredMonitorings = currentFilteredMonitorings.filter(item =>

            (item.m_jilla || getVal(item, 'm_jilla', 'जिल्ला')) === districtName

        );

        showDetailedTable(currentFilteredMonitorings, `${districtName} - कार्यालय अनुगमन`, 'monitoring');

    } else if (currentDashboardView === 'attendance') {

        currentFilteredAttendance = currentFilteredAttendance.filter(item =>

            (item.jilla || getVal(item, 'jilla', 'जिल्ला')) === districtName

        );

        showDetailedTable(currentFilteredAttendance, `${districtName} - समय/पोशाक अनुगमन`, 'attendance');

    } else if (currentDashboardView === 'project-monitoring') {

        currentFilteredProjectMonitorings = currentFilteredProjectMonitorings.filter(item =>

            (item.pm_jilla || getVal(item, 'pm_jilla', 'जिल्ला')) === districtName

        );

        showDetailedTable(currentFilteredProjectMonitorings, `${districtName} - आयोजना अनुगमन`, 'project-monitoring');

    }



    mapObj.closePopup();

}



function filterByLocalLevel(localName) {

    // Filter the current data by local level

    if (currentDashboardView === 'survey') {

        currentFilteredSubmissions = currentFilteredSubmissions.filter(item =>

            (item.local_level || getVal(item, 'local_level', 'स्थानीय तह')) === localName

        );

        showDetailedTable(currentFilteredSubmissions, `${localName} - सेवाग्राही सर्वेक्षण`, 'survey');

    } else if (currentDashboardView === 'monitoring') {

        currentFilteredMonitorings = currentFilteredMonitorings.filter(item =>

            (item.m_local_level || getVal(item, 'm_local_level', 'स्थानीय तह')) === localName

        );

        showDetailedTable(currentFilteredMonitorings, `${localName} - कार्यालय अनुगमन`, 'monitoring');

    } else if (currentDashboardView === 'attendance') {

        currentFilteredAttendance = currentFilteredAttendance.filter(item =>

            (item.local_level || getVal(item, 'local_level', 'स्थानीय तह')) === localName

        );

        showDetailedTable(currentFilteredAttendance, `${localName} - समय/पोशाक अनुगमन`, 'attendance');

    } else if (currentDashboardView === 'project-monitoring') {

        currentFilteredProjectMonitorings = currentFilteredProjectMonitorings.filter(item =>

            (item.pm_local_level || getVal(item, 'pm_local_level', 'स्थानीय तह')) === localName

        );

        showDetailedTable(currentFilteredProjectMonitorings, `${localName} - आयोजना अनुगमन`, 'project-monitoring');

    }



    mapObj.closePopup();

}



async function analyzeDistrict(districtName) {

    const data = districtData[districtName];

    if (!data) return;



    mapObj.closePopup();



    // Show loading indicator

    Swal.fire({

        title: 'AI विश्लेषण गर्दै...',

        text: `${districtName} जिल्लाको विश्लेषण तयार गरिदैछ`,

        allowOutsideClick: false,

        didOpen: () => {

            Swal.showLoading();

        }

    });



    try {

        // Get district-specific data

        let districtDataForAI = {

            district: districtName,

            score: data.score.toFixed(1),

            total: data.total,

            unsatisfied: data.unsatisfied

        };



        // Add context based on current view

        if (currentDashboardView === 'survey') {

            districtDataForAI.type = 'सेवाग्राही सर्वेक्षण';

            districtDataForAI.details = currentFilteredSubmissions.filter(item =>

                (item.jilla || getVal(item, 'jilla', 'जिल्ला')) === districtName

            );

        } else if (currentDashboardView === 'monitoring') {

            districtDataForAI.type = 'कार्यालय अनुगमन';

            districtDataForAI.details = currentFilteredMonitorings.filter(item =>

                (item.m_jilla || getVal(item, 'm_jilla', 'जिल्ला')) === districtName

            );

        } else if (currentDashboardView === 'attendance') {

            districtDataForAI.type = 'समय/पोशाक अनुगमन';

            districtDataForAI.details = currentFilteredAttendance.filter(item =>

                (item.jilla || getVal(item, 'jilla', 'जिल्ला')) === districtName

            );

        } else if (currentDashboardView === 'project-monitoring') {

            districtDataForAI.type = 'आयोजना अनुगमन';

            districtDataForAI.details = currentFilteredProjectMonitorings.filter(item =>

                (item.pm_jilla || getVal(item, 'pm_jilla', 'जिल्ला')) === districtName

            );

        }



        const payload = {

            action: 'analyze',

            location: districtName,

            mode: 'district_analysis',

            districtData: districtDataForAI

        };



        const response = await requestAppsScript(payload);

        let resultText = await response.text();



        let analysisContent = "";

        try {

            const jsonRes = JSON.parse(resultText);

            analysisContent = jsonRes.analysis || jsonRes.message || resultText;

        } catch (e) {

            analysisContent = resultText;

        }



        Swal.close();



        // Format and display the analysis

        let formattedText = analysisContent.trim();

        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        formattedText = formattedText.replace(/^\s*[\*\-•]\s+(.*$)/gm, '<div style="display:flex; margin-bottom:4px; padding-left:15px;"><span style="margin-right:8px; color:#387ae6;">•</span><span>$1</span></div>');



        const formattedHtml = formattedText.split(/\n\n+/).map(para => {

            if (para.trim().startsWith('<div')) return para;

            return `<p style="margin-bottom:10px;">${para.replace(/\n/g, '<br>')}</p>`;

        }).join('');



        Swal.fire({

            title: `${districtName} - AI विश्लेषण`,

            html: `<div style="text-align:justify; line-height:1.6; font-family:'Kalimati', sans-serif;">${formattedHtml}</div>`,

            width: '600px',

            confirmButtonText: 'ठीक छ',

            confirmButtonColor: '#306a95'

        });



    } catch (e) {

        Swal.close();

        Swal.fire({

            icon: 'error',

            title: 'त्रुटि',

            text: 'AI विश्लेषण लोड गर्न सकिएन। कृपया पछि फेरि प्रयास गर्नुहोस्।',

            confirmButtonColor: '#306a95'

        });

    }

}



async function analyzeLocalLevel(localName) {

    const data = localLevelData[localName];

    if (!data) return;



    mapObj.closePopup();



    // Show loading indicator

    Swal.fire({

        title: 'AI विश्लेषण गर्दै...',

        text: `${localName} स्थानीय तहको विश्लेषण तयार गरिदैछ`,

        allowOutsideClick: false,

        didOpen: () => {

            Swal.showLoading();

        }

    });



    try {

        // Get local level-specific data

        let localLevelDataForAI = {

            localLevel: localName,

            district: data.district,

            score: data.score.toFixed(1),

            total: data.total,

            unsatisfied: data.unsatisfied

        };



        // Add context based on current view

        if (currentDashboardView === 'survey') {

            localLevelDataForAI.type = 'सेवाग्राही सर्वेक्षण';

            localLevelDataForAI.details = currentFilteredSubmissions.filter(item =>

                (item.local_level || getVal(item, 'local_level', 'स्थानीय तह')) === localName

            );

        } else if (currentDashboardView === 'monitoring') {

            localLevelDataForAI.type = 'कार्यालय अनुगमन';

            localLevelDataForAI.details = currentFilteredMonitorings.filter(item =>

                (item.m_local_level || getVal(item, 'm_local_level', 'स्थानीय तह')) === localName

            );

        } else if (currentDashboardView === 'attendance') {

            localLevelDataForAI.type = 'समय/पोशाक अनुगमन';

            localLevelDataForAI.details = currentFilteredAttendance.filter(item =>

                (item.local_level || getVal(item, 'local_level', 'स्थानीय तह')) === localName

            );

        } else if (currentDashboardView === 'project-monitoring') {

            localLevelDataForAI.type = 'आयोजना अनुगमन';

            localLevelDataForAI.details = currentFilteredProjectMonitorings.filter(item =>

                (item.pm_local_level || getVal(item, 'pm_local_level', 'स्थानीय तह')) === localName

            );

        }



        const payload = {

            action: 'analyze',

            location: `${data.district} - ${localName}`,

            mode: 'local_level_analysis',

            localLevelData: localLevelDataForAI

        };



        const response = await requestAppsScript(payload);

        let resultText = await response.text();



        let analysisContent = "";

        try {

            const jsonRes = JSON.parse(resultText);

            analysisContent = jsonRes.analysis || jsonRes.message || resultText;

        } catch (e) {

            analysisContent = resultText;

        }



        Swal.close();



        // Format and display the analysis

        let formattedText = analysisContent.trim();

        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        formattedText = formattedText.replace(/^\s*[\*\-•]\s+(.*$)/gm, '<div style="display:flex; margin-bottom:4px; padding-left:15px;"><span style="margin-right:8px; color:#387ae6;">•</span><span>$1</span></div>');



        const formattedHtml = formattedText.split(/\n\n+/).map(para => {

            if (para.trim().startsWith('<div')) return para;

            return `<p style="margin-bottom:10px;">${para.replace(/\n/g, '<br>')}</p>`;

        }).join('');



        Swal.fire({

            title: `${localName} - AI विश्लेषण`,

            html: `<div style="text-align:justify; line-height:1.6; font-family:'Kalimati', sans-serif;">${formattedHtml}</div>`,

            width: '600px',

            confirmButtonText: 'ठीक छ',

            confirmButtonColor: '#306a95'

        });



    } catch (e) {

        Swal.close();

        Swal.fire({

            icon: 'error',

            title: 'त्रुटि',

            text: 'AI विश्लेषण लोड गर्न सकिएन। कृपया पछि फेरि प्रयास गर्नुहोस्।',

            confirmButtonColor: '#306a95'

        });

    }

}



function addMapLegend() {

    if (!mapObj) return;



    // Remove existing legend

    const existingLegend = document.querySelector('.map-legend');

    if (existingLegend) existingLegend.remove();



    const legend = L.control({ position: 'bottomright' });



    legend.onAdd = function (map) {

        const div = L.DomUtil.create('div', 'map-legend');

        div.style.backgroundColor = 'white';

        div.style.padding = '10px';

        div.style.borderRadius = '5px';

        div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';

        div.style.fontFamily = "'Kalimati', sans-serif";



        const legendItems = currentDashboardView === 'project-monitoring'

            ? [

                { color: '#10b981', label: 'उत्कृष्ट (७५%+) ' },

                { color: '#3b82f6', label: 'राम्रो (५०-७४%)' },

                { color: '#f59e0b', label: 'मध्यम (२५-४९%)' },

                { color: '#ef4444', label: 'कमजोर (०-२४%)' }

            ]

            : [

                { color: '#10b981', label: 'उत्कृष्ट (८०-१००%)' },

                { color: '#3b82f6', label: 'राम्रो (६०-७९%)' },

                { color: '#f59e0b', label: 'सुधार आवश्यक (४०-५९%)' },

                { color: '#ef4444', label: 'कमजोर (४०% भन्दा कम)' }

            ];



        div.innerHTML = `

            <h4 style="margin:0 0 10px 0; color:#306a95;">स्कोर लिजेन्ड</h4>

            ${legendItems.map(item => `

                <div style="display:flex; align-items:center; margin:5px 0;">

                    <div style="width:20px; height:20px; background:${item.color}; margin-right:10px; border:1px solid #ccc;"></div>

                    <span>${item.label}</span>

                </div>

            `).join('')}

        `;



        return div;

    };



    legend.addTo(mapObj);

}



// Map search functionality

const mapSearchInput = document.getElementById('mapSearchInput');

if (mapSearchInput) {

    mapSearchInput.addEventListener('input', function (e) {

        const searchTerm = e.target.value.toLowerCase();



        districtLayerGroup.eachLayer(function (layer) {

            const feature = layer.feature;

            const districtName = (feature.properties.DIST_EN || feature.properties.name_en || feature.properties.name || '').toLowerCase();



            if (districtName.includes(searchTerm)) {

                layer.setStyle({

                    fillOpacity: 0.7,

                    weight: 2

                });

            } else {

                layer.setStyle({

                    fillOpacity: 0.2,

                    weight: 1

                });

            }

        });

    });

}



function printMap() {

    if (!mapObj) return;



    const mapContainer = document.getElementById('nepalMap');

    if (!mapContainer) return;



    // Create a print window

    const printWindow = window.open('', '_blank');

    printWindow.document.write(`

        <html>

        <head>

            <title>नेपाल जिल्ला नक्सा</title>

            <style>

                body { margin: 0; padding: 20px; font-family: 'Kalimati', sans-serif; }

                h1 { text-align: center; color: #306a95; }

                .map-container { border: 2px solid #ccc; border-radius: 8px; overflow: hidden; }

                .legend { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }

                .legend-item { display: flex; align-items: center; margin: 5px 0; }

                .color-box { width: 20px; height: 20px; margin-right: 10px; border: 1px solid #ccc; }

            </style>

        </head>

        <body>

            <h1>नेपालको जिल्ला अवस्थिति नक्सा</h1>

            <div class="map-container">

                <img src="${mapContainer.toDataURL()}" style="width: 100%; height: auto;">

            </div>

            <div class="legend">

                <h3>स्कोर लिजेन्ड</h3>

                <div class="legend-item">

                    <div class="color-box" style="background: #90EE90;"></div>

                    <span>राम्रो (0-30%)</span>

                </div>

                <div class="legend-item">

                    <div class="color-box" style="background: #FFD700;"></div>

                    <span>मध्यम (30-50%)</span>

                </div>

                <div class="legend-item">

                    <div class="color-box" style="background: #FF6347;"></div>

                    <span>कमजोर (50%+)</span>

                </div>

            </div>

            <script>

                window.onload = function() {

                    window.print();

                };

            </script>

        </body>

        </html>

    `);

    printWindow.document.close();

}



function exportMapData() {

    let data = [];

    let dKey = '';



    if (currentDashboardView === 'survey') { data = currentFilteredSubmissions; dKey = 'jilla'; }

    else if (currentDashboardView === 'monitoring') { data = currentFilteredMonitorings; dKey = 'm_jilla'; }

    else if (currentDashboardView === 'attendance') { data = currentFilteredAttendance; dKey = 'jilla'; }

    else if (currentDashboardView === 'project-monitoring') { data = currentFilteredProjectMonitorings; dKey = 'pm_jilla'; }



    // Prepare CSV data

    const headers = ['जिल्ला', 'कूल रेकर्ड', 'नकारात्मक सूचक', 'स्कोर (%)', 'स्थिति'];

    const rows = [headers];



    Object.keys(districtData).forEach(districtName => {

        const d = districtData[districtName];

        const score = d.total > 0 ? ((d.unsatisfied / d.total) * 100).toFixed(1) : '0.0';



        let status = 'राम्रो';

        if (parseFloat(score) > 30) status = 'मध्यम';

        if (parseFloat(score) > 50) status = 'कमजोर';



        rows.push([

            districtName,

            d.total.toString(),

            d.unsatisfied.toString(),

            score,

            status

        ]);

    });



    // Convert to CSV

    const csvContent = rows.map(row => row.join(',')).join('\n');



    // Create download link

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');

    const url = URL.createObjectURL(blob);



    link.setAttribute('href', url);

    link.setAttribute('download', `nepal-districts-data-${new Date().toISOString().split('T')[0]}.csv`);

    link.style.visibility = 'hidden';



    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

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

    else if (currentDashboardView === 'project-monitoring') { data = currentFilteredProjectMonitorings; dKey = 'pm_jilla'; }



    // Update district data for choropleth

    Object.keys(districtData).forEach(dName => {

        districtData[dName].total = 0;

        districtData[dName].unsatisfied = 0;

        districtData[dName].score = 0;

        districtData[dName].scoreSum = 0;

        districtData[dName].scoreCount = 0;

        districtData[dName].progressInfo = null;

    });



    const stats = data.reduce((acc, item) => {

        const rawDistrictName = item[dKey] || getVal(item, dKey, 'जिल्ला');

        const dName = resolveDistrictName(rawDistrictName);

        if (!dName || !DISTRICT_COORDS[dName]) return acc;



        if (!acc[dName]) acc[dName] = { total: 0, unsatisfied: 0, reasons: {}, scoreSum: 0, scoreCount: 0, progressInfo: null };

        acc[dName].total++;



        // Update district data

        if (districtData[dName]) {

            districtData[dName].total = acc[dName].total;

            districtData[dName].unsatisfied = acc[dName].unsatisfied;

        }



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

        } else if (currentDashboardView === 'project-monitoring') {

            const progress = parseFloat(item.pm_physical_progress || getVal(item, 'pm_physical_progress', '१०. भौतिक प्रगति (%)')) || 0;

            acc[dName].scoreSum += progress;

            acc[dName].scoreCount += 1;

            if (districtData[dName]) {

                districtData[dName].scoreSum = acc[dName].scoreSum;

                districtData[dName].scoreCount = acc[dName].scoreCount;

                districtData[dName].score = acc[dName].scoreCount > 0 ? acc[dName].scoreSum / acc[dName].scoreCount : 0;

            }

            if (progress < 25) reasons.push('प्रगति कम (२५% भन्दा कम)');

            else if (progress < 50) reasons.push('प्रगति मध्यम (२५-५०%)');

            else if (progress < 75) reasons.push('प्रगति राम्रो (५०-७५%)');

            else reasons.push('प्रगति उत्कृष्ट (७५%+ )');

        }



        if (reasons.length > 0) {

            acc[dName].unsatisfied++;

            reasons.forEach(r => {

                acc[dName].reasons[r] = (acc[dName].reasons[r] || 0) + 1;

            });

        }



        if (currentDashboardView === 'project-monitoring') {

            const progress = parseFloat(item.pm_physical_progress || getVal(item, 'pm_physical_progress', '१०. भौतिक प्रगति (%)')) || 0;

            if (!acc[dName].progressInfo) acc[dName].progressInfo = { low: 0, medium: 0, good: 0, excellent: 0 };

            if (progress < 25) acc[dName].progressInfo.low++;

            else if (progress < 50) acc[dName].progressInfo.medium++;

            else if (progress < 75) acc[dName].progressInfo.good++;

            else acc[dName].progressInfo.excellent++;

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



        // For project monitoring, show positive progress info instead of negative

        let additionalInfo = '';

        if (currentDashboardView === 'project-monitoring' && s.progressInfo) {

            const pInfo = s.progressInfo;

            const positiveInfo = [];

            if (pInfo.excellent > 0) positiveInfo.push(`उत्कृष्ट: ${toNepaliDigits(pInfo.excellent)}`);

            if (pInfo.good > 0) positiveInfo.push(`राम्रो: ${toNepaliDigits(pInfo.good)}`);

            if (pInfo.medium > 0) positiveInfo.push(`मध्यम: ${toNepaliDigits(pInfo.medium)}`);

            if (pInfo.low > 0) positiveInfo.push(`कम: ${toNepaliDigits(pInfo.low)}`);

            additionalInfo = positiveInfo.length > 0 ? `<br><div style="color:#27ae60; font-size:0.85rem; margin-top:5px;"><strong>प्रगति स्थिति:</strong> ${positiveInfo.join(', ')}</div>` : '';

        } else {

            additionalInfo = negativeReasons ? `<br><div style="color:#de3053; font-size:0.85rem; margin-top:5px;"><strong>नकारात्मक पक्ष:</strong> ${negativeReasons}</div>` : '';

        }



        const popupText = `

            <div style="font-family:'Kalimati';">

                <strong style="color:#306a95;">${dName} जिल्ला</strong><br>

                कूल रेकर्ड: <span style="color:#387ae6">${toNepaliDigits(s.total)}</span> |

                ${currentDashboardView === 'project-monitoring' ? 'आयोजना संख्या' : 'नकारात्मक सूचक'}: <span style="color:${currentDashboardView === 'project-monitoring' ? '#27ae60' : '#de3053'}">${toNepaliDigits(s.total)}</span>

                ${additionalInfo}

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

                            labels: currentDashboardView === 'project-monitoring' ? ['कूल आयोजना', 'उत्कृष्ट प्रगति (७५%+)'] : ['कूल रेकर्ड', 'नकारात्मक सूचक'],

                            datasets: [{

                                data: currentDashboardView === 'project-monitoring' ? [s.total, s.progressInfo?.excellent || 0] : [s.total, s.unsatisfied],

                                backgroundColor: currentDashboardView === 'project-monitoring' ? ['#387ae6cc', '#27ae60cc'] : ['#387ae6cc', '#de3053cc'],

                                borderRadius: 4

                            }]

                        },

                        options: {

                            onClick: (e, elements) => {

                                if (elements.length > 0) {

                                    const idx = elements[0].index;

                                    const isNegative = idx === 1;



                                    let filtered = data.filter(item => (item[dKey] || getVal(item, dKey, 'जिल्ला')) === dName);



                                    if (currentDashboardView === 'project-monitoring') {

                                        // For project monitoring, filter by progress category

                                        if (idx === 1) {

                                            // Show excellent progress projects

                                            filtered = filtered.filter(item => {

                                                const progress = parseFloat(item.pm_physical_progress || getVal(item, 'pm_physical_progress', '१०. भौतिक प्रगति (%)')) || 0;

                                                return progress >= 75;

                                            });

                                        }

                                        // idx === 0 shows all projects

                                    } else if (isNegative) {

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



                                    const label = currentDashboardView === 'project-monitoring' ?

                                        (idx === 1 ? 'उत्कृष्ट प्रगति (७५%+)' : 'कूल आयोजना') :

                                        (isNegative ? 'नकारात्मक सूचक' : 'कूल रेकर्ड');



                                    const viewType = currentDashboardView === 'project-monitoring' ? 'project-monitoring' :

                                        (currentDashboardView === 'survey' ? 'survey' : (currentDashboardView === 'monitoring' ? 'monitoring' : 'attendance'));



                                    showDetailedTable(filtered, `${dName}: ${label}`, viewType);

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



    // Update choropleth map with new data

    updateChoroplethMap();

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



        const response = await requestAppsScript(payload);



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

                nepaliTimeEl.textContent = h + ':' + m + ':' + s;

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

    function initAutoRefresh() {

        const btn = document.getElementById('autoRefreshToggle');

        const ind = document.getElementById('autoRefreshIndicator');

        if (!btn) return;

        btn.addEventListener('click', function () {

            const enabled = !Boolean(autoRefreshInterval);

            setAutoRefreshEnabled(enabled, true);

            playClickSound();

        });



        if (appSettings.autoRefresh) {

            setAutoRefreshEnabled(true, false);

        }

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

            title: 'मेटाईंदैछ...',

            text: 'कृपया पर्खनुहोस्',

            allowOutsideClick: false,

            didOpen: () => {

                Swal.showLoading();

            }

        });



        try {

            const payload = { action: 'delete', timestamp: timestamp, type: type };

            const response = await requestAppsScript(payload);



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



function setFieldValue(name, value, context = document) {

    if (value === undefined || value === null) value = "";



    let inputs = [];

    if (context && typeof context.getElementsByName === 'function') {

        inputs = context.getElementsByName(name);

    } else if (context && context.elements && typeof context.elements.namedItem === 'function') {

        const namedItem = context.elements.namedItem(name);

        inputs = namedItem ? (namedItem.length ? Array.from(namedItem) : [namedItem]) : [];

    } else if (context && typeof context.querySelectorAll === 'function') {

        inputs = context.querySelectorAll(`[name="${name}"]`);

    } else {

        inputs = document.getElementsByName(name);

    }



    if (!inputs.length) {

        const el = context && typeof context.getElementById === 'function'

            ? context.getElementById(name)

            : document.getElementById(name);

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

    } else if (inputs[0].tagName === 'SELECT' || type === 'select-one') {

        const select = inputs[0];

        const valueStr = value === undefined || value === null ? '' : String(value).trim();

        let matched = false;



        for (let i = 0; i < select.options.length; i++) {

            if (select.options[i].value === valueStr) {

                select.value = select.options[i].value;

                matched = true;

                break;

            }

        }



        if (!matched) {

            const normalizedValue = valueStr.toLowerCase();

            for (let i = 0; i < select.options.length; i++) {

                const optionText = String(select.options[i].textContent || select.options[i].innerText || '').trim().toLowerCase();

                const optionValue = String(select.options[i].value || '').trim().toLowerCase();

                if (optionText === normalizedValue || optionValue === normalizedValue) {

                    select.value = select.options[i].value;

                    matched = true;

                    break;

                }

            }

        }



        if (!matched) {

            const normalizedValue = valueStr.toLowerCase();

            for (let i = 0; i < select.options.length; i++) {

                const optionText = String(select.options[i].textContent || select.options[i].innerText || '').trim().toLowerCase();

                const optionValue = String(select.options[i].value || '').trim().toLowerCase();

                if ((optionText && optionText.includes(normalizedValue)) || (optionValue && optionValue.includes(normalizedValue)) || (normalizedValue && normalizedValue.includes(optionText)) || (normalizedValue && normalizedValue.includes(optionValue))) {

                    select.value = select.options[i].value;

                    matched = true;

                    break;

                }

            }

        }



        if (!matched) {

            select.value = valueStr;

        }

        select.dispatchEvent(new Event('change'));

    } else {

        inputs[0].value = value;

        inputs[0].dispatchEvent(new Event('change'));

    }

}



function getRecordFieldValue(record, field, label, ...aliases) {

    if (!record) return '';

    const keysToTry = [field, label, ...aliases];

    for (const key of keysToTry) {

        if (key === undefined || key === null) continue;

        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {

            return record[key];

        }

    }



    for (const key of keysToTry) {

        if (key === undefined || key === null) continue;

        const value = getVal(record, key, label);

        if (value) return value;

    }



    return '';

}



function setLocationFields(record, form, pradeshKey, jillaKey, sthaaniyaKey) {

    if (!record || !form) return;

    const pradeshValue = getRecordFieldValue(record, pradeshKey, 'प्रदेश', 'province', 'pradesh', 'प्रदेश');

    const jillaValue = getRecordFieldValue(record, jillaKey, 'जिल्ला', 'district', 'jilla', 'जिल्ला');

    const sthaaniyaValue = getRecordFieldValue(record, sthaaniyaKey, 'स्थानीय तह', 'sthaaniya', 'municipality', 'localLevel', 'local_level', 'locallevel', 'स्थानीय तह');



    setFieldValue(pradeshKey, pradeshValue, form);

    setFieldValue(jillaKey, jillaValue, form);

    setFieldValue(sthaaniyaKey, sthaaniyaValue, form);

}



function openAttendanceEditModal(record) {

    const modal = document.getElementById('attendanceEditModal');

    const form = document.getElementById('attendanceEditModalForm');

    const rowsBody = document.getElementById('attendanceEditRowsBody');

    if (!modal || !form || !rowsBody) return false;



    form.reset();

    rowsBody.innerHTML = '';



    setFieldValue('a_pradesh', getRecordFieldValue(record, 'pradesh', 'प्रदेश', 'province', 'pradesh'), form);

    setFieldValue('a_jilla', getRecordFieldValue(record, 'jilla', 'जिल्ला', 'district', 'jilla'), form);

    setFieldValue('a_sthaaniya', getRecordFieldValue(record, 'sthaaniya', 'स्थानीय तह', 'sthaaniya', 'municipality', 'localLevel', 'local_level', 'locallevel'), form);



    Object.keys(record || {}).forEach(key => {

        if (key === 'rows' || ['pradesh', 'jilla', 'sthaaniya'].includes(key)) {

            return;

        }

        setFieldValue(key, record[key], form);

    });



    if (record?.rows && record.rows.length) {

        record.rows.forEach(() => {

            addAttendanceRow('attendanceEditRowsBody');

        });



        const rowElements = rowsBody.querySelectorAll('tr');

        rowElements.forEach((row, index) => {

            const rowData = record.rows[index] || {};

            const category = row.querySelector('[name="emp_category[]"]');

            const rank = row.querySelector('[name="emp_rank[]"]');

            const symbol = row.querySelector('[name="emp_symbol[]"]');

            const name = row.querySelector('[name="emp_name[]"]');

            const extra = row.querySelector('[name="emp_extra[]"]');



            if (category) category.value = rowData.category || '';

            if (rank) rank.value = rowData.rank || '';

            if (symbol) symbol.value = rowData.symbol || '';

            if (name) name.value = rowData.name || '';

            if (extra) extra.value = rowData.extra || '';

        });

    } else {

        addAttendanceRow('attendanceEditRowsBody');

    }



    modal.style.display = 'flex';

    document.body.style.overflow = 'hidden';

    return true;

}



function closeAttendanceEditModal() {

    const modal = document.getElementById('attendanceEditModal');

    if (modal) {

        modal.style.display = 'none';

    }

    document.body.style.overflow = '';

}



function openSurveyEditModal(record) {

    const modal = document.getElementById('surveyEditModal');

    const body = document.getElementById('surveyEditModalBody');

    const form = document.getElementById('surveyForm');

    if (!modal || !body || !form) return false;



    if (!window._surveyFormHost) {

        window._surveyFormHost = form.parentElement;

    }

    if (form.parentElement !== body) {

        body.appendChild(form);

    }



    form.reset();

    setLocationFields(record, form, 'pradesh', 'jilla', 'sthaaniya_taha');

    Object.keys(record || {}).forEach(key => {

        if (['pradesh', 'jilla', 'sthaaniya_taha'].includes(key)) return;

        setFieldValue(key, record[key], form);

    });

    if (typeof updateSatisfactionVisibility === 'function') {

        updateSatisfactionVisibility();

    }

    document.getElementById('submitSurvey').innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';



    modal.style.display = 'flex';

    document.body.style.overflow = 'hidden';

    return true;

}



function closeSurveyEditModal() {

    const modal = document.getElementById('surveyEditModal');

    const form = document.getElementById('surveyForm');

    const host = window._surveyFormHost || form?.parentElement;

    if (form && host && form.parentElement !== host) {

        host.appendChild(form);

    }

    if (modal) {

        modal.style.display = 'none';

    }

    document.body.style.overflow = '';

}



function openMonitoringEditModal(record) {

    const modal = document.getElementById('monitoringEditModal');

    const body = document.getElementById('monitoringEditModalBody');

    const form = document.getElementById('monitoringForm');

    if (!modal || !body || !form) return false;



    if (!window._monitoringFormHost) {

        window._monitoringFormHost = form.parentElement;

    }

    if (form.parentElement !== body) {

        body.appendChild(form);

    }



    form.reset();

    setLocationFields(record, form, 'm_pradesh', 'm_jilla', 'm_sthaaniya');

    Object.keys(record || {}).forEach(key => {

        if (['m_pradesh', 'm_jilla', 'm_sthaaniya'].includes(key)) return;

        setFieldValue(key, record[key], form);

    });

    document.getElementById('submitMonitoring').innerHTML = '<i class="fas fa-save"></i> अद्यावधिक गर्नुहोस्';



    modal.style.display = 'flex';

    document.body.style.overflow = 'hidden';

    return true;

}



function closeMonitoringEditModal() {

    const modal = document.getElementById('monitoringEditModal');

    const form = document.getElementById('monitoringForm');

    const host = window._monitoringFormHost || form?.parentElement;

    if (form && host && form.parentElement !== host) {

        host.appendChild(form);

    }

    if (modal) {

        modal.style.display = 'none';

    }

    document.body.style.overflow = '';

}



function saveAttendanceEditModal() {

    const form = document.getElementById('attendanceEditModalForm');

    const modal = document.getElementById('attendanceEditModal');

    if (!form) return;



    form.classList.add('was-validated');

    if (!form.checkValidity()) {

        form.reportValidity();

        playErrorSound('विवरण अधुरो छ, कृपया आवश्यक फिल्डहरू भर्नुहोस्।');

        return;

    }



    const formData = new FormData(form);

    const mandatoryFields = ['a_pradesh', 'a_jilla', 'a_sthaaniya', 'a_office', 'a_date', 'a_total_staff', 'a_working_staff', 'a_vacant_staff'];

    for (const fieldId of mandatoryFields) {

        const val = formData.get(fieldId);

        if (!val || val.toString().trim() === '') {

            Swal.fire({ icon: 'warning', title: 'अधुरो विवरण', text: 'कृपया सबै अनिवार्य फिल्डहरू भर्नुहोस्।', confirmButtonColor: '#387ae6' });

            playErrorSound('अनिवार्य विवरणहरू भर्न बाँकी छ।');

            return;

        }

    }



    const total = parseInt(formData.get('a_total_staff') || 0);

    const working = parseInt(formData.get('a_working_staff') || 0);

    const vacant = parseInt(formData.get('a_vacant_staff') || 0);

    if (total !== (working + vacant)) {

        Swal.fire({ icon: 'error', title: 'तथ्याङ्क मिलेन', text: 'कुल दरबन्दी संख्या, कार्यरत र रिक्त संख्याको योगफलसँग मिल्नुपर्छ।', confirmButtonColor: '#387ae6' });

        playErrorSound('तथ्याङ्कको गणितीय योगफल मिलेन।');

        return;

    }



    const record = window.editingRecord && window.editingRecord.type === 'attendance'

        ? allAttendanceMonitorings.find(r => String(r.timestamp) === String(window.editingRecord.timestamp))

        : null;



    let payload = {

        type: 'attendance',

        timestamp: record?.timestamp || new Date().toISOString(),

        mainRecordId: record?.mainRecordId || new Date().getTime().toString(),

        rows: []

    };



    if (record?.timestamp) {

        payload.editTimestamp = record.timestamp;

        payload.timestamp = record.timestamp;

    }



    payload.pradesh = (PROVINCE[formData.get('a_pradesh')] || formData.get('a_pradesh') || '').toString();

    payload.jilla = formData.get('a_jilla') || '';

    payload.sthaaniya = formData.get('a_sthaaniya') || '';

    payload.office = formData.get('a_office');

    payload.total_staff = formData.get('a_total_staff');

    payload.working_staff = formData.get('a_working_staff');

    payload.vacant_staff = formData.get('a_vacant_staff');

    payload.date = formData.get('a_date');

    payload.time = formData.get('a_time');

    payload.phone = formData.get('a_phone');

    payload.monitor_name = formData.get('a_monitor_name');

    payload.monitor_rank = formData.get('a_monitor_rank');

    payload.office_officer = formData.get('a_office_officer');

    payload.office_rank = formData.get('a_office_rank');



    const categories = formData.getAll('emp_category[]');

    const ranks = formData.getAll('emp_rank[]');

    const symbols = formData.getAll('emp_symbol[]');

    const names = formData.getAll('emp_name[]');

    const extras = formData.getAll('emp_extra[]');



    let hasValidRow = false;

    for (let i = 0; i < names.length; i++) {

        if (names[i].trim() !== '' || symbols[i].trim() !== '') {

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

        Swal.fire({ icon: 'warning', title: 'कर्मचारी विवरण आवश्यक', text: 'कृपया कम्तिमा एक कर्मचारीको विवरण भर्नुहोस्।', confirmButtonColor: '#387ae6' });

        playErrorSound('कम्तिमा एक कर्मचारीको विवरण भर्नुहोस्।');

        return;

    }



    const idx = allAttendanceMonitorings.findIndex(r => String(r.timestamp) === String(payload.editTimestamp || payload.timestamp));

    if (idx !== -1) {

        allAttendanceMonitorings[idx] = payload;

    } else {

        allAttendanceMonitorings.unshift(payload);

    }

    localStorage.setItem('attendanceData_nsc', JSON.stringify(allAttendanceMonitorings));



    if (modal) {

        modal.style.display = 'none';

    }

    document.body.style.overflow = '';

    window.editingRecord = null;

    refreshDashboard();

    showToast('✅ समय पालना विवरण सम्पादित गरियो', 'success', 2000);

}



window.editRecord = function (timestamp, type) {

    window.editingRecord = { timestamp, type };



    if (type === 'survey') {

        const record = allSubmissions.find(r => String(r.timestamp) === String(timestamp));

        if (record) {

            openSurveyEditModal(record);

        }

    } else if (type === 'monitoring') {

        const record = allMonitorings.find(r => String(r.timestamp) === String(timestamp));

        if (record) {

            openMonitoringEditModal(record);

        }

    } else if (type === 'attendance') {

        const record = allAttendanceMonitorings.find(r => String(r.timestamp) === String(timestamp));

        if (record) {

            window.editingRecord = { timestamp, type };

            const opened = openAttendanceEditModal(record);

            if (!opened) {

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

    }

}



// ========== USER MANAGEMENT FUNCTIONS ==========



// Load all users

document.getElementById('loadUsersBtn')?.addEventListener('click', async function () {

    const cachedUsers = getCachedUsersData();

    if (cachedUsers.length) {
        displayUsers(cachedUsers, 'all');
    }

    try {

        Swal.fire({

            icon: 'info',

            text: 'प्रयोगकर्ताहरू लोड हुँदैछ...',

            allowOutsideClick: false,

            showConfirmButton: false

        });



        const result = await requestAppsScript({ action: 'get_all_users' });



        if (!result || result.status !== 'success') {

            throw new Error(result && result.message ? result.message : 'Server returned an error');

        }

        Swal.close();



        if (result.status === 'success') {

            displayUsers(result.users, 'all');

        } else {

            Swal.fire({ icon: 'error', text: result.message || 'अज्ञात त्रुटि भयो' });

        }

    } catch (error) {

        Swal.close();

        let errorMessage = 'सर्भरमा जडान गर्न सकिएन। कृपया इन्टरनेट कनेक्सन जाँच गर्नुहोस् वा पछि फेरि प्रयास गर्नुहोस्।';

        if (error.message && error.message.includes('404')) {

            errorMessage = 'सर्भर उपलब्ध छैन। कृपया प्रशासकलाई सम्पर्क गर्नुहोस्।';

        } else if (error.message && error.message.includes('Failed to fetch')) {

            errorMessage = 'नेटवर्क त्रुटि। कृपया इन्टरनेट कनेक्सन जाँच गर्नुहोस्।';

        }

        if (cachedUsers.length) {
            displayUsers(cachedUsers, 'all');
            Swal.fire({ icon: 'warning', text: 'सर्भरमा पहुँच भएन। cached डाटा देखाइयो।' });
        } else {
            Swal.fire({ icon: 'error', text: errorMessage });
        }

        console.error(error);

    }

});



// Load pending registrations

document.getElementById('loadPendingRegistrationsBtn')?.addEventListener('click', async function () {

    try {

        Swal.fire({

            icon: 'info',

            text: 'पेन्डिङ नयाँ युजरहरू लोड हुँदैछ...',

            allowOutsideClick: false,

            showConfirmButton: false

        });



        const response = await requestAppsScript({ action: 'get_pending_registrations' });



        const result = await response.json();

        Swal.close();



        if (result.status === 'success') {

            displayUsers(result.users, 'pending');

        } else {

            Swal.fire({ icon: 'error', text: result.message });

        }

    } catch (error) {

        Swal.close();

        Swal.fire({

            icon: 'error',

            text: 'सर्भरमा जडान गर्न सकिएन। कृपया इन्टरनेट कनेक्सन जाँच गर्नुहोस् वा पछि फेरि प्रयास गर्नुहोस्।'

        });

        console.error(error);

    }

});



// Load password reset requests

document.getElementById('loadPasswordResetRequestsBtn')?.addEventListener('click', async function () {

    try {

        Swal.fire({

            icon: 'info',

            text: 'पासवर्ड रिसेट अनुरोधहरू लोड हुँदैछ...',

            allowOutsideClick: false,

            showConfirmButton: false

        });



        const response = await requestAppsScript({ action: 'get_password_reset_requests' });



        const result = await response.json();

        Swal.close();



        if (result.status === 'success') {

            displayUsers(result.users, 'password_reset');

        } else {

            Swal.fire({ icon: 'error', text: result.message });

        }

    } catch (error) {

        Swal.close();

        Swal.fire({

            icon: 'error',

            text: 'सर्भरमा जडान गर्न सकिएन। कृपया इन्टरनेट कनेक्सन जाँच गर्नुहोस् वा पछि फेरि प्रयास गर्नुहोस्।'

        });

        console.error(error);

    }

});



// Display users in table

function displayUsers(users, type) {

    const tbody = document.getElementById('usersBody');

    if (!tbody) return;



    if (!users || users.length === 0) {

        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">कुनै डाटा छैन।</td></tr>';

        return;

    }



    let html = '';

    users.forEach((user, index) => {

        const serialNo = index + 1;

        const actions = getActionButtons(user, type);



        // Convert province number to name

        let provinceDisplay = user.province || '-';

        if (user.province && !isNaN(user.province)) {

            provinceDisplay = PROVINCE[user.province] || user.province;

        }



        // Convert Nepali digits to English digits for username and email

        const usernameDisplay = toEnglishDigits(user.username || '-');

        const emailDisplay = toEnglishDigits(user.email || '-');



        html += `

            <tr style="border-bottom: 1px solid #ddd;">

                <td style="padding: 6px; border: 1px solid #ddd;">${serialNo}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${user.ministry || '-'}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${provinceDisplay}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${user.district || '-'}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${user.localLevel || '-'}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${user.officeName || '-'}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${usernameDisplay}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${emailDisplay}</td>

                <td style="padding: 6px; border: 1px solid #ddd;">${actions}</td>

            </tr>

        `;

    });



    tbody.innerHTML = html;

}



// Convert Nepali digits to English digits

function toEnglishDigits(value) {

    const nepaliToEnglish = {

        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',

        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'

    };

    return String(value).split('').map(ch => nepaliToEnglish[ch] || ch).join('');

}



// Get action buttons based on user type

function getActionButtons(user, type) {

    let buttons = '';



    if (type === 'pending') {

        buttons += `

            <button onclick="approveUser('${user.username}')" style="background: #10b981; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" title="Approve">

                <i class="fas fa-check"></i>

            </button>

            <button onclick="rejectUser('${user.username}')" style="background: #ef4444; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" title="Reject">

                <i class="fas fa-times"></i>

            </button>

        `;

    } else if (type === 'password_reset') {

        buttons += `

            <button onclick="approvePasswordReset('${user.username}')" style="background: #10b981; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" title="Approve Reset">

                <i class="fas fa-check"></i>

            </button>

            <button onclick="rejectPasswordReset('${user.username}')" style="background: #ef4444; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" title="Reject">

                <i class="fas fa-times"></i>

            </button>

        `;

    } else {

        buttons += `

            <button onclick="viewUser('${user.username}')" style="background: #3b82f6; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" title="View">

                <i class="fas fa-eye"></i>

            </button>

            <button onclick="editUser('${user.username}')" style="background: #f59e0b; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;" title="Edit">

                <i class="fas fa-edit"></i>

            </button>

            <button onclick="deleteUser('${user.username}')" style="background: #ef4444; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer;" title="Delete">

                <i class="fas fa-trash"></i>

            </button>

        `;

    }



    return buttons;

}



// Approve user registration

async function approveUser(username) {

    const { value: confirm } = await Swal.fire({

        title: 'पुष्टि गर्नुहोस्',

        text: `के तपाईं ${username} लाई approve गर्न चाहनुहुन्छ?`,

        icon: 'question',

        showCancelButton: true,

        confirmButtonText: 'हो, approve गर्नुहोस्',

        cancelButtonText: 'रद्द गर्नुहोस्'

    });



    if (confirm) {

        try {

            Swal.fire({

                icon: 'info',

                text: 'Approve हुँदैछ...',

                allowOutsideClick: false,

                showConfirmButton: false

            });



            const response = await requestAppsScript({ action: 'approve_user', username: username });



            const result = await response.json();

            Swal.close();



            if (result.status === 'success') {

                Swal.fire({ icon: 'success', text: result.message });

                document.getElementById('loadPendingRegistrationsBtn').click();

            } else {

                Swal.fire({ icon: 'error', text: result.message });

            }

        } catch (error) {

            Swal.close();

            Swal.fire({ icon: 'error', text: 'Approve गर्दा त्रुटि आयो।' });

            console.error(error);

        }

    }

}



// Reject user registration

async function rejectUser(username) {

    const { value: confirm } = await Swal.fire({

        title: 'पुष्टि गर्नुहोस्',

        text: `के तपाईं ${username} लाई reject गर्न चाहनुहुन्छ?`,

        icon: 'warning',

        showCancelButton: true,

        confirmButtonText: 'हो, reject गर्नुहोस्',

        cancelButtonText: 'रद्द गर्नुहोस्'

    });



    if (confirm) {

        try {

            Swal.fire({

                icon: 'info',

                text: 'Reject हुँदैछ...',

                allowOutsideClick: false,

                showConfirmButton: false

            });



            const response = await requestAppsScript({ action: 'reject_user', username: username });



            const result = await response.json();

            Swal.close();



            if (result.status === 'success') {

                Swal.fire({ icon: 'success', text: result.message });

                document.getElementById('loadPendingRegistrationsBtn').click();

            } else {

                Swal.fire({ icon: 'error', text: result.message });

            }

        } catch (error) {

            Swal.close();

            Swal.fire({ icon: 'error', text: 'Reject गर्दा त्रुटि आयो।' });

            console.error(error);

        }

    }

}



// Approve password reset

async function approvePasswordReset(username) {

    const { value: confirm } = await Swal.fire({

        title: 'पुष्टि गर्नुहोस्',

        text: `के तपाईं ${username} को पासवर्ड रिसेट approve गर्न चाहनुहुन्छ?`,

        icon: 'question',

        showCancelButton: true,

        confirmButtonText: 'हो, approve गर्नुहोस्',

        cancelButtonText: 'रद्द गर्नुहोस्'

    });



    if (confirm) {

        try {

            Swal.fire({

                icon: 'info',

                text: 'Approve हुँदैछ...',

                allowOutsideClick: false,

                showConfirmButton: false

            });



            const response = await requestAppsScript({ action: 'approve_password_reset', username: username });



            const result = await response.json();

            Swal.close();



            if (result.status === 'success') {

                Swal.fire({ icon: 'success', text: result.message });

                document.getElementById('loadPasswordResetRequestsBtn').click();

            } else {

                Swal.fire({ icon: 'error', text: result.message });

            }

        } catch (error) {

            Swal.close();

            Swal.fire({ icon: 'error', text: 'Approve गर्दा त्रुटि आयो।' });

            console.error(error);

        }

    }

}



// Reject password reset

async function rejectPasswordReset(username) {

    const { value: confirm } = await Swal.fire({

        title: 'पुष्टि गर्नुहोस्',

        text: `के तपाईं ${username} को पासवर्ड रिसेट reject गर्न चाहनुहुन्छ?`,

        icon: 'warning',

        showCancelButton: true,

        confirmButtonText: 'हो, reject गर्नुहोस्',

        cancelButtonText: 'रद्द गर्नुहोस्'

    });



    if (confirm) {

        try {

            Swal.fire({

                icon: 'info',

                text: 'Reject हुँदैछ...',

                allowOutsideClick: false,

                showConfirmButton: false

            });



            const response = await requestAppsScript({ action: 'reject_password_reset', username: username });



            const result = await response.json();

            Swal.close();



            if (result.status === 'success') {

                Swal.fire({ icon: 'success', text: result.message });

                document.getElementById('loadPasswordResetRequestsBtn').click();

            } else {

                Swal.fire({ icon: 'error', text: result.message });

            }

        } catch (error) {

            Swal.close();

            Swal.fire({ icon: 'error', text: 'Reject गर्दा त्रुटि आयो।' });

            console.error(error);

        }

    }

}



// View user details

async function viewUser(username) {

    try {

        const response = await requestAppsScript({ action: 'get_user', username: username });



        const result = await response.json();



        if (result.status === 'success') {

            const user = result.user;

            Swal.fire({

                title: 'प्रयोगकर्ता विवरण',

                html: `

                    <div style="text-align: left;">

                        <p><strong>युजरनेम:</strong> ${user.username || '-'}</p>

                        <p><strong>पूरा नाम:</strong> ${user.fullName || '-'}</p>

                        <p><strong>इमेल:</strong> ${user.email || '-'}</p>

                        <p><strong>मन्त्रालय:</strong> ${user.ministry || '-'}</p>

                        <p><strong>प्रदेश:</strong> ${user.province || '-'}</p>

                        <p><strong>जिल्ला:</strong> ${user.district || '-'}</p>

                        <p><strong>स्थानीय तह:</strong> ${user.localLevel || '-'}</p>

                        <p><strong>कार्यालयको नाम:</strong> ${user.officeName || '-'}</p>

                        <p><strong>भूमिका:</strong> ${user.role || '-'}</p>

                        <p><strong>स्थिति:</strong> ${user.status || '-'}</p>

                    </div>

                `,

                icon: 'info'

            });

        } else {

            Swal.fire({ icon: 'error', text: result.message });

        }

    } catch (error) {

        Swal.fire({ icon: 'error', text: 'प्रयोगकर्ता विवरण लोड गर्दा त्रुटि आयो।' });

        console.error(error);

    }

}



// Edit user

async function editUser(username) {

    try {

        const response = await requestAppsScript({ action: 'get_user', username: username });



        const result = response && typeof response.json === 'function' ? await response.json() : response;



        if (result.status === 'success') {

            const user = result.user;



            const { value: formValues } = await Swal.fire({

                title: 'प्रयोगकर्ता सम्पादन गर्नुहोस्',

                html: `

                    <div style="text-align: left;">

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">युजरनेम:</label>

                            <input id="editUsername" value="${user.username || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" readonly>

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">पूरा नाम:</label>

                            <input id="editFullName" value="${user.fullName || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">इमेल:</label>

                            <input id="editEmail" value="${user.email || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">मन्त्रालय:</label>

                            <input id="editMinistry" value="${user.ministry || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;" id="ministrySelectContainer" style="display: none;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">मन्त्रालय छान्नुहोस्:</label>

                            <select id="editMinistrySelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                                <option value="">मन्त्रालय छान्नुहोस्</option>

                            </select>

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">प्रदेश:</label>

                            <input id="editProvince" value="${user.province || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;" id="provinceSelectContainer" style="display: none;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">प्रदेश छान्नुहोस्:</label>

                            <select id="editProvinceSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                                <option value="">प्रदेश छान्नुहोस्</option>

                            </select>

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">जिल्ला:</label>

                            <input id="editDistrict" value="${user.district || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;" id="districtSelectContainer" style="display: none;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">जिल्ला छान्नुहोस्:</label>

                            <select id="editDistrictSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                                <option value="">जिल्ला छान्नुहोस्</option>

                            </select>

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">स्थानीय तह:</label>

                            <input id="editLocalLevel" value="${user.localLevel || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">कार्यालयको नाम:</label>

                            <input id="editOfficeName" value="${user.officeName || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">भूमिका:</label>

                            <select id="editRole" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                                <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>SuperAdmin</option>

                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>

                                <option value="province_admin" ${user.role === 'province_admin' ? 'selected' : ''}>Province Admin</option>

                                <option value="district_admin" ${user.role === 'district_admin' ? 'selected' : ''}>District Admin</option>

                                <option value="local_level_user" ${user.role === 'local_level_user' ? 'selected' : ''}>Local Level User</option>

                            </select>

                        </div>

                        <div style="margin-bottom: 10px;">

                            <label style="font-weight: 600; display: block; margin-bottom: 5px;">स्थिति:</label>

                            <select id="editStatus" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">

                                <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>

                                <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>

                            </select>

                        </div>

                    </div>

                `,

                focusConfirm: false,

                showCancelButton: true,

                confirmButtonText: 'सेभ गर्नुहोस्',

                cancelButtonText: 'रद्द गर्नुहोस्',

                didOpen: () => {
                    // Populate ministry dropdown
                    const ministrySelect = document.getElementById('editMinistrySelect');
                    if (ministrySelect) {
                        MINISTRY.forEach(ministry => {
                            const option = document.createElement('option');
                            option.value = ministry;
                            option.textContent = ministry;
                            if (user.ministry === ministry) option.selected = true;
                            ministrySelect.appendChild(option);
                        });
                    }

                    // Populate province dropdown
                    const provinceSelect = document.getElementById('editProvinceSelect');
                    if (provinceSelect) {
                        Object.entries(PROVINCE).forEach(([id, name]) => {
                            const option = document.createElement('option');
                            option.value = name;
                            option.textContent = name;
                            if (user.province === name) option.selected = true;
                            provinceSelect.appendChild(option);
                        });
                    }

                    // Populate district dropdown (all districts)
                    const districtSelect = document.getElementById('editDistrictSelect');
                    if (districtSelect && DISTRICTS) {
                        Object.values(DISTRICTS).flat().forEach(district => {
                            const option = document.createElement('option');
                            option.value = district;
                            option.textContent = district;
                            if (user.district === district) option.selected = true;
                            districtSelect.appendChild(option);
                        });
                    }

                    // Handle role change to show/hide appropriate dropdowns
                    const roleSelect = document.getElementById('editRole');
                    const ministryContainer = document.getElementById('ministrySelectContainer');
                    const provinceContainer = document.getElementById('provinceSelectContainer');
                    const districtContainer = document.getElementById('districtSelectContainer');
                    const ministryInput = document.getElementById('editMinistry');
                    const provinceInput = document.getElementById('editProvince');
                    const districtInput = document.getElementById('editDistrict');

                    function updateDropdowns() {
                        const role = roleSelect.value;
                        
                        // Hide all dropdowns first
                        if (ministryContainer) ministryContainer.style.display = 'none';
                        if (provinceContainer) provinceContainer.style.display = 'none';
                        if (districtContainer) districtContainer.style.display = 'none';
                        
                        // Show appropriate dropdown based on role
                        if (role === 'admin') {
                            if (ministryContainer) ministryContainer.style.display = 'block';
                            if (ministryInput) ministryInput.style.display = 'none';
                        } else if (role === 'province_admin') {
                            if (provinceContainer) provinceContainer.style.display = 'block';
                            if (provinceInput) provinceInput.style.display = 'none';
                        } else if (role === 'district_admin') {
                            if (districtContainer) districtContainer.style.display = 'block';
                            if (districtInput) districtInput.style.display = 'none';
                        } else {
                            // For other roles, show text inputs
                            if (ministryInput) ministryInput.style.display = 'block';
                            if (provinceInput) provinceInput.style.display = 'block';
                            if (districtInput) districtInput.style.display = 'block';
                        }
                    }

                    // Initial dropdown state
                    updateDropdowns();

                    // Add event listener for role change
                    if (roleSelect) {
                        roleSelect.addEventListener('change', updateDropdowns);
                    }

                    // Sync dropdown values to text inputs
                    if (ministrySelect && ministryInput) {
                        ministrySelect.addEventListener('change', () => {
                            ministryInput.value = ministrySelect.value;
                        });
                    }
                    if (provinceSelect && provinceInput) {
                        provinceSelect.addEventListener('change', () => {
                            provinceInput.value = provinceSelect.value;
                        });
                    }
                    if (districtSelect && districtInput) {
                        districtSelect.addEventListener('change', () => {
                            districtInput.value = districtSelect.value;
                        });
                    }
                },

                preConfirm: () => {

                    return {

                        username: document.getElementById('editUsername').value,

                        fullName: document.getElementById('editFullName').value,

                        email: document.getElementById('editEmail').value,

                        ministry: document.getElementById('editMinistry').value,

                        province: document.getElementById('editProvince').value,

                        district: document.getElementById('editDistrict').value,

                        localLevel: document.getElementById('editLocalLevel').value,

                        officeName: document.getElementById('editOfficeName').value,

                        role: document.getElementById('editRole').value,

                        status: document.getElementById('editStatus').value

                    };

                }

            });



            if (formValues) {

                Swal.fire({

                    icon: 'info',

                    text: 'अपडेट हुँदैछ...',

                    allowOutsideClick: false,

                    showConfirmButton: false

                });



                const updateResponse = await requestAppsScript({

                    action: 'update_user',

                    username: username,

                    userData: formValues

                });



                const updateResult = updateResponse && typeof updateResponse.json === 'function'
                    ? await updateResponse.json()
                    : updateResponse;

                Swal.close();



                if (updateResult.status === 'success') {

                    // If editing current user, update session data for new permissions
                    const currentUser = sessionStorage.getItem('loggedInUser');
                    if (currentUser) {
                        try {
                            const currentUserData = JSON.parse(currentUser);
                            if (currentUserData.username === username) {
                                // Update current user's session with new role and location data
                                currentUserData.role = formValues.role;
                                currentUserData.ministry = formValues.ministry;
                                currentUserData.province = formValues.province;
                                currentUserData.district = formValues.district;
                                currentUserData.localLevel = formValues.localLevel;
                                sessionStorage.setItem('loggedInUser', JSON.stringify(currentUserData));
                                
                                Swal.fire({ 
                                    icon: 'success', 
                                    text: 'भूमिका परिवर्तन सफल भयो। नयाँ अनुमति लागू हुन लगउनुहोस्।' 
                                });
                            } else {
                                Swal.fire({ icon: 'success', text: updateResult.message });
                            }
                        } catch (e) {
                            Swal.fire({ icon: 'success', text: updateResult.message });
                        }
                    } else {
                        Swal.fire({ icon: 'success', text: updateResult.message });
                    }

                    document.getElementById('loadUsersBtn').click();

                } else {

                    Swal.fire({ icon: 'error', text: updateResult.message });

                }

            }

        } else {

            Swal.fire({ icon: 'error', text: result.message });

        }

    } catch (error) {

        Swal.fire({ icon: 'error', text: 'प्रयोगकर्ता सम्पादन गर्दा त्रुटि आयो।' });

        console.error(error);

    }

}



// Delete user

async function deleteUser(username) {

    const { value: confirm } = await Swal.fire({

        title: 'पुष्टि गर्नुहोस्',

        text: `के तपाईं ${username} लाई मेटाउन चाहनुहुन्छ? यो कार्य पूर्ववत गर्न सकिँदैन।`,

        icon: 'warning',

        showCancelButton: true,

        confirmButtonText: 'हो, मेटाउनुहोस्',

        cancelButtonText: 'रद्द गर्नुहोस्'

    });



    if (confirm) {

        try {

            Swal.fire({

                icon: 'info',

                text: 'मेटाउँदै छ...',

                allowOutsideClick: false,

                showConfirmButton: false

            });



            const response = await requestAppsScript({ action: 'delete_user', username: username });



            const result = await response.json();

            Swal.close();



            if (result.status === 'success') {

                Swal.fire({ icon: 'success', text: result.message });

                document.getElementById('loadUsersBtn').click();

            } else {

                Swal.fire({ icon: 'error', text: result.message });

            }

        } catch (error) {

            Swal.close();

            Swal.fire({ icon: 'error', text: 'मेटाउँदा त्रुटि आयो।' });

            console.error(error);

        }

    }

}



// ========== AUDIT LOG FUNCTIONS ==========



/**

 * Load all audit logs from Google Sheets

 */

async function loadAuditLogs() {

    try {

        Swal.fire({

            icon: 'info',

            text: 'अडिट लग लोड हुँदैछ...',

            allowOutsideClick: false,

            showConfirmButton: false

        });



        const response = await requestAppsScript({ action: 'get_audit_log' });



        const result = await response.json();

        Swal.close();



        if (result.status === 'success') {

            allAuditLogs = result.logs || [];

            filteredAuditLogs = allAuditLogs;

            currentAuditPage = 1;

            auditLogsLoaded = true;



            renderAuditLogTable();

            showToast('अडिट लग सफलतापूर्वक लोड भयो', 'success', 2000);

        } else {

            Swal.close();

            Swal.fire({ icon: 'error', text: result.message || 'अडिट लग लोड गर्न सकिएन' });

        }

    } catch (error) {

        Swal.close();

        Swal.fire({ icon: 'error', text: 'अडिट लग लोड गर्दा त्रुटि आयो।' });

        console.error('Error loading audit logs:', error);

    }

}



/**

 * Filter audit logs by Details field

 */

function filterAuditLogs(searchText) {

    if (!searchText || searchText.trim() === '') {

        filteredAuditLogs = allAuditLogs;

    } else {

        const searchLower = searchText.toLowerCase();

        filteredAuditLogs = allAuditLogs.filter(log => {

            const details = String(log.details || '').toLowerCase();

            const username = String(log.username || '').toLowerCase();

            const action = String(log.action || '').toLowerCase();

            return details.includes(searchLower) || username.includes(searchLower) || action.includes(searchLower);

        });

    }

    currentAuditPage = 1;

    renderAuditLogTable();

}



/**

 * Change items per page for audit log

 */

function changeAuditPageSize(newSize) {

    auditItemsPerPage = parseInt(newSize);

    currentAuditPage = 1;

    renderAuditLogTable();

}



/**

 * Render audit log table with pagination

 */

function renderAuditLogTable() {

    if (!auditLogsLoaded || !filteredAuditLogs) {

        return;

    }



    const tbody = document.getElementById('auditLogBody');

    const table = document.getElementById('auditLogTable');

    if (!tbody || !table) return;



    // Calculate pagination

    const totalLogs = filteredAuditLogs.length;

    const totalPages = Math.ceil(totalLogs / auditItemsPerPage);

    const startIndex = (currentAuditPage - 1) * auditItemsPerPage;

    const endIndex = Math.min(startIndex + auditItemsPerPage, totalLogs);

    const paginatedLogs = filteredAuditLogs.slice(startIndex, endIndex);



    // Render table rows

    if (paginatedLogs.length === 0) {

        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">अडिट लग मिलेन।</td></tr>';

    } else {

        tbody.innerHTML = paginatedLogs.map((log, index) => {

            const timestamp = new Date(log.timestamp).toLocaleString('en-US');

            const action = log.action || '-';

            const username = log.username || '-';

            const details = log.details || '-';



            return `

                <tr style="border-bottom: 1px solid #ddd; hover:background: #f5f5f5;">

                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${timestamp}</td>

                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${username}</td>

                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;"><span style="background: #e3f2fd; padding: 2px 6px; border-radius: 3px; color: #1565c0;">${action}</span></td>

                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px; max-width: 300px; word-wrap: break-word;">${details}</td>

                </tr>

            `;

        }).join('');

    }



    // Render pagination controls

    renderAuditPaginationControls(totalLogs, totalPages);

}



/**

 * Render audit log pagination controls

 */

function renderAuditPaginationControls(totalLogs, totalPages) {

    const container = document.getElementById('auditLogContent');

    if (!container) return;



    // Remove existing pagination if any

    const existingPagination = container.querySelector('.audit-pagination-container');

    if (existingPagination) {

        existingPagination.remove();

    }



    // Create pagination container

    const paginationDiv = document.createElement('div');

    paginationDiv.className = 'audit-pagination-container';

    paginationDiv.style.cssText = `

        display: flex;

        justify-content: space-between;

        align-items: center;

        margin-top: 15px;

        padding: 12px;

        background: #f8f9fa;

        border-radius: 5px;

        flex-wrap: wrap;

        gap: 10px;

    `;



    // Page size selector

    const pageSizeDiv = document.createElement('div');

    pageSizeDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    pageSizeDiv.innerHTML = `

        <label style="font-weight: 600; color: #2d3748; font-size: 0.9rem;">प्रति पेज:</label>

        <select id="auditPageSizeSelect" style="padding: 5px 10px; border: 1px solid #cbd5e0; border-radius: 4px; font-family: 'Kalimati', sans-serif;">

            <option value="20" ${auditItemsPerPage === 20 ? 'selected' : ''}>२० (20)</option>

            <option value="50" ${auditItemsPerPage === 50 ? 'selected' : ''}>५० (50)</option>

            <option value="100" ${auditItemsPerPage === 100 ? 'selected' : ''}>१०० (100)</option>

            <option value="500" ${auditItemsPerPage === 500 ? 'selected' : ''}>५०० (500)</option>

        </select>

    `;



    // Info div

    const infoDiv = document.createElement('div');

    infoDiv.style.cssText = 'color: #4a5568; font-size: 0.9rem; font-weight: 500;';

    infoDiv.innerHTML = `जम्मा: <strong>${toNepaliDigits(filteredAuditLogs.length)}</strong> | पेज: <strong>${currentAuditPage}</strong>/${totalPages}`;



    // Navigation buttons

    const navDiv = document.createElement('div');

    navDiv.style.cssText = 'display: flex; gap: 5px; align-items: center;';



    const prevBtn = document.createElement('button');

    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';

    prevBtn.className = 'btn-pagination';

    prevBtn.style.cssText = `

        padding: 6px 10px;

        border: 1px solid #cbd5e0;

        background: #fff;

        border-radius: 4px;

        cursor: pointer;

        color: #2d3748;

        transition: all 0.2s;

    `;

    prevBtn.disabled = currentAuditPage === 1;

    prevBtn.onclick = () => {

        if (currentAuditPage > 1) {

            currentAuditPage--;

            renderAuditLogTable();

        }

    };



    const nextBtn = document.createElement('button');

    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';

    nextBtn.className = 'btn-pagination';

    nextBtn.style.cssText = `

        padding: 6px 10px;

        border: 1px solid #cbd5e0;

        background: #fff;

        border-radius: 4px;

        cursor: pointer;

        color: #2d3748;

        transition: all 0.2s;

    `;

    nextBtn.disabled = currentAuditPage === totalPages;

    nextBtn.onclick = () => {

        if (currentAuditPage < totalPages) {

            currentAuditPage++;

            renderAuditLogTable();

        }

    };



    navDiv.appendChild(prevBtn);

    navDiv.appendChild(nextBtn);



    paginationDiv.appendChild(pageSizeDiv);

    paginationDiv.appendChild(infoDiv);

    paginationDiv.appendChild(navDiv);



    container.appendChild(paginationDiv);



    // Add event listener to page size selector

    const selectElement = document.getElementById('auditPageSizeSelect');

    if (selectElement) {

        selectElement.addEventListener('change', function () {

            changeAuditPageSize(this.value);

        });

    }

}



/**

 * Setup audit log event listeners

 */

function setupAuditLogEventListeners() {

    const loadBtn = document.getElementById('loadAuditLogBtn');

    if (loadBtn) {

        loadBtn.addEventListener('click', loadAuditLogs);

    }



    // Add filter input for audit logs

    const auditLogContent = document.getElementById('auditLogContent');

    if (auditLogContent) {

        // Create filter section above table

        const filterDiv = document.createElement('div');

        filterDiv.id = 'auditLogFilterContainer';

        filterDiv.style.cssText = `

            margin-bottom: 15px;

            display: flex;

            gap: 10px;

            align-items: center;

            flex-wrap: wrap;

        `;

        filterDiv.innerHTML = `

            <input 

                type="text" 

                id="auditLogFilterInput" 

                placeholder="विवरण, प्रयोगकर्ता वा कार्य अनुसार खोज्नुहोस्..." 

                style="

                    flex: 1;

                    min-width: 250px;

                    padding: 8px 12px;

                    border: 1px solid #cbd5e0;

                    border-radius: 5px;

                    font-family: 'Kalimati', sans-serif;

                    font-size: 0.9rem;

                "

            />

            <button 

                id="auditLogClearFilterBtn" 

                style="

                    padding: 8px 16px;

                    background: #ef4444;

                    color: white;

                    border: none;

                    border-radius: 5px;

                    cursor: pointer;

                    font-family: 'Kalimati', sans-serif;

                    font-weight: 600;

                "

            >

                <i class="fas fa-times"></i> फिल्टर हटाउनुहोस्

            </button>

        `;



        const table = document.getElementById('auditLogTable');

        if (table && table.parentNode && !document.getElementById('auditLogFilterContainer')) {

            table.parentNode.insertBefore(filterDiv, table);

        }



        // Add event listeners

        const filterInput = document.getElementById('auditLogFilterInput');

        const clearBtn = document.getElementById('auditLogClearFilterBtn');



        if (filterInput) {

            const debouncedFilter = debounce(function () {

                filterAuditLogs(filterInput.value);

            }, 300);

            filterInput.addEventListener('input', debouncedFilter);

        }



        if (clearBtn) {

            clearBtn.addEventListener('click', function () {

                if (filterInput) {

                    filterInput.value = '';

                    filterAuditLogs('');

                }

            });

        }

    }

}



// Initialize audit log listeners on DOMContentLoaded

document.addEventListener('DOMContentLoaded', function () {

    setTimeout(() => {

        setupAuditLogEventListeners();

    }, 500);

});




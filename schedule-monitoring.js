/**
 * Get current logged-in user info with role context
 */
function getCurrentScheduleUser() {
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

                return {
                    username: parsed.username || '',
                    fullName: parsed.fullName || parsed.username || '',
                    role: roleLower,
                    isAdmin: roleLower === 'admin',
                    isProvinceAdmin: roleLower === 'province_admin',
                    isDistrictAdmin: roleLower === 'district_admin',
                    isLocalLevelUser: roleLower === 'local_level_user' || roleLower === 'user',
                    province: String(province || '').trim(),
                    district: String(district || '').trim(),
                    localLevel: String(localLevel || '').trim()
                };
            }

            if (typeof parsed === 'string' && parsed.trim()) {
                return {
                    username: parsed,
                    fullName: parsed,
                    role: 'user',
                    isAdmin: false,
                    isProvinceAdmin: false,
                    isDistrictAdmin: false,
                    isLocalLevelUser: true,
                    province: '',
                    district: '',
                    localLevel: ''
                };
            }
        }
    } catch (e) {
        console.error('Error getting current user:', e);
    }

    return { username: '', fullName: '', role: 'user', isAdmin: false, isProvinceAdmin: false, isDistrictAdmin: false, isLocalLevelUser: true, province: '', district: '', localLevel: '' };
}

/**
 * Filter schedules by user role: admin sees all, province admin sees province, etc.
 */
function filterSchedulesByUser(schedules) {
    const user = getCurrentScheduleUser();

    // Admin sees all schedules
    if (user.isAdmin) {
        return schedules;
    }

    // Province Admin: can see all schedules in their province
    if (user.isProvinceAdmin) {
        if (!user.province) return [];
        return schedules.filter(s => {
            const scheduleProvince = String(s.sched_pradesh || '').trim();
            return scheduleProvince === user.province || scheduleProvince.includes(user.province) || user.province.includes(scheduleProvince);
        });
    }

    // District Admin: can see all schedules in their district
    if (user.isDistrictAdmin) {
        if (!user.district) return [];
        return schedules.filter(s => {
            const scheduleDistrict = String(s.sched_jilla || '').trim();
            return scheduleDistrict === user.district || scheduleDistrict.includes(user.district) || user.district.includes(scheduleDistrict);
        });
    }

    // Local Level User: can see only schedules assigned to them or in their local level
    if (user.isLocalLevelUser) {
        const userName = String(user.fullName || user.username || '').trim().toLowerCase();
        if (!userName) return [];

        return schedules.filter(s => {
            const assignedTo = String(s.sched_assigned_to || '').trim().toLowerCase();
            const scheduleLocalLevel = String(s.sched_local_level || s.sched_sthaaniya || '').trim().toLowerCase();
            const userLocalLevel = String(user.localLevel || '').toLowerCase();

            // Show if assigned to user OR if in user's local level
            return assignedTo.includes(userName) || scheduleLocalLevel === userLocalLevel || scheduleLocalLevel.includes(userLocalLevel) || userLocalLevel.includes(scheduleLocalLevel);
        });
    }

    // Default: no access
    return [];
}

/**
 * Load all schedules from Google Sheets
 */
async function loadSchedules() {
    try {
        const result = await requestAppsScript({ action: 'get_schedules' });
        if (!result || (result.status && result.status !== 'success')) {
            console.error('Failed to load schedules:', result && result.message ? result.message : result);
            return;
        }

        if (result.status === 'success' && result.schedules) {
            allSchedules = filterSchedulesByUser(result.schedules);
            renderScheduleStats();
            renderScheduleTable(allSchedules);
        } else if (result.schedules) {
            allSchedules = filterSchedulesByUser(result.schedules);
            renderScheduleStats();
            renderScheduleTable(allSchedules);
        } else {
            // Fallback: try GET
            loadSchedulesFallback();
        }
    } catch (err) {
        console.error('loadSchedules error:', err);
        // Try fallback
        loadSchedulesFallback();
    }
}

/**
 * Fallback to load schedules via GET
 */
async function loadSchedulesFallback() {
    try {
        const result = await requestAppsScript({ action: 'get_schedules' }, { method: 'GET', fallbackToGet: false });
        allSchedules = filterSchedulesByUser(result.schedules || []);
        renderScheduleStats();
        renderScheduleTable(allSchedules);
    } catch (err) {
        console.error('loadSchedulesFallback error:', err);
        allSchedules = [];
        renderScheduleStats();
        renderScheduleTable(allSchedules);
    }
}

/**
 * Save a new schedule to Google Sheets
 */
async function saveSchedule(formData) {
    const timestamp = new Date().toISOString();

    const payload = {
        type: 'schedule-monitoring',
        timestamp: timestamp,
        sched_type: formData.sched_type,
        sched_pradesh: formData.sched_pradesh,
        sched_jilla: formData.sched_jilla,
        sched_sthaaniya: formData.sched_sthaaniya,
        sched_office: formData.sched_office,
        sched_date: formData.sched_date,
        sched_time: formData.sched_time || '',
        sched_assigned_to: formData.sched_assigned_to || '',
        sched_repeat: formData.sched_repeat || 'एकपटक',
        sched_priority: formData.sched_priority || 'सामान्य',
        sched_remark: formData.sched_remark || '',
        sched_status: formData.sched_status || 'योजना बनाइएको',
        sched_completed_date: ''
    };

    try {
        const response = await requestAppsScript(payload);
        if (response.status === 'success' || response.raw === 'Success' || (response.message && response.message.includes('Success'))) {
            Swal.fire({
                icon: 'success',
                title: 'सफल!',
                text: 'Schedule सुरक्षित गरियो।',
                timer: 2000,
                showConfirmButton: false
            });
            document.getElementById('scheduleForm').reset();
            loadSchedules();
            return true;
        } else {
            Swal.fire({
                icon: 'error',
                title: 'त्रुटि!',
                text: response.message || response.raw || 'Schedule सुरक्षित गर्न असफल।'
            });
            return false;
        }
    } catch (err) {
        console.error('saveSchedule error:', err);
        Swal.fire({
            icon: 'error',
            title: 'त्रुटि!',
            text: 'सर्भरमा जडान गर्न असफल।'
        });
        return false;
    }
}

/**
 * Update schedule status
 */
async function updateScheduleStatus(timestamp, newStatus, completedDate) {
    try {
        const response = await requestAppsScript({
            action: 'update_schedule_status',
            timestamp: timestamp,
            status: newStatus,
            completed_date: completedDate || ''
        });
        if (response.status === 'success' || response.raw === 'Success') {
            loadSchedules();
            return true;
        }
        return false;
    } catch (err) {
        console.error('updateScheduleStatus error:', err);
        return false;
    }
}

/**
 * Delete schedule
 */
async function deleteSchedule(timestamp) {
    if (!confirm('के तपाईं यो Schedule हटाउन चाहनुहुन्छ?')) return;

    try {
        const response = await requestAppsScript({
            action: 'delete_schedule',
            timestamp: timestamp
        });
        if (response.status === 'success' || response.raw === 'Success') {
            loadSchedules();
        }
    } catch (err) {
        console.error('deleteSchedule error:', err);
    }
}

/**
 * Render schedule statistics
 */
function renderScheduleStats() {
    const total = allSchedules.length;
    const completed = allSchedules.filter(s => s.sched_status === 'पूरा भएको').length;
    const pending = allSchedules.filter(s => s.sched_status === 'योजना बनाइएको').length;
    const inProgress = allSchedules.filter(s => s.sched_status === 'चलिरहेको').length;

    // Calculate overdue (yojaana banayeko but date is past)
    const today = new Date();
    const overdue = allSchedules.filter(s => {
        if (s.sched_status === 'पूरा भएको' || s.sched_status === 'रद्द') return false;
        if (!s.sched_date) return false;
        // Parse Nepali date - approximate
        try {
            const parts = s.sched_date.split(/[\s,/-]+/);
            // Simple date check using AD conversion if possible
            return false; // Skip complex logic for now
        } catch (e) {
            return false;
        }
    }).length;

    document.getElementById('schedTotalCount').textContent = total;
    document.getElementById('schedCompletedCount').textContent = completed;
    document.getElementById('schedPendingCount').textContent = pending;
    document.getElementById('schedInProgressCount').textContent = inProgress;
    document.getElementById('schedOverdueCount').textContent = overdue > 0 ? overdue : '०';
}

/**
 * Render schedule table
 */
function renderScheduleTable(schedules) {
    const tbody = document.getElementById('schedulesTableBody');
    if (!tbody) return;

    if (!schedules || schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">कुनै Schedule छैन।</td></tr>';
        return;
    }

    tbody.innerHTML = schedules.map(s => {
        const priorityColor = s.sched_priority === 'उच्च' ? 'color:#e53e3e; font-weight:bold;' :
            s.sched_priority === 'मध्यम' ? 'color:#d69e2e;' : '';
        const statusColor = s.sched_status === 'पूरा भएको' ? 'background:#c6f6d5; color:#276749;' :
            s.sched_status === 'चलिरहेको' ? 'background:#fefcbf; color:#975a16;' :
                s.sched_status === 'रद्द' ? 'background:#fed7d7; color:#9b2c2c;' :
                    'background:#e2e8f0; color:#4a5568;';

        return `<tr>
            <td style="padding:6px; border:1px solid #ddd; white-space:nowrap;">${s.sched_date || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd;">${s.sched_type || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd;">${s.sched_pradesh || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd;">${s.sched_jilla || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd;">${s.sched_office || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd;">${s.sched_assigned_to || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd; ${priorityColor}">${s.sched_priority || '-'}</td>
            <td style="padding:6px; border:1px solid #ddd;">
                <span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.7rem; ${statusColor}">${s.sched_status}</span>
            </td>
            <td style="padding:6px; border:1px solid #ddd; white-space:nowrap;">
                ${s.sched_status !== 'पूरा भएको' ? `
                    <button onclick="updateScheduleStatus('${s.timestamp}', 'पूरा भएको', '')" style="padding:2px 6px; background:#38a169; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem;" title="पूरा भएको चिन्ह लगाउनुहोस्">✅</button>
                    <button onclick="updateScheduleStatus('${s.timestamp}', 'चलिरहेको', '')" style="padding:2px 6px; background:#d69e2e; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem;" title="चलिरहेको चिन्ह लगाउनुहोस्">🔄</button>
                ` : ''}
                <button onclick="deleteSchedule('${s.timestamp}')" style="padding:2px 6px; background:#e53e3e; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem;" title="मेटाउनुहोस्">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

/**
 * Filter schedules based on selected filters
 */
function filterSchedules() {
    const filterType = document.getElementById('schedFilterType')?.value || '';
    const filterStatus = document.getElementById('schedFilterStatus')?.value || '';
    const filterPriority = document.getElementById('schedFilterPriority')?.value || '';
    const filterMonitor = (document.getElementById('schedFilterMonitor')?.value || '').toLowerCase();

    let filtered = allSchedules;

    if (filterType) {
        filtered = filtered.filter(s => s.sched_type === filterType);
    }
    if (filterStatus) {
        filtered = filtered.filter(s => s.sched_status === filterStatus);
    }
    if (filterPriority) {
        filtered = filtered.filter(s => s.sched_priority === filterPriority);
    }
    if (filterMonitor) {
        filtered = filtered.filter(s => (s.sched_assigned_to || '').toLowerCase().includes(filterMonitor));
    }

    renderScheduleTable(filtered);
}

/**
 * Populate province dropdown for schedule monitoring
 */
function populateSchedPradesh() {
    const pradeshSelect = document.getElementById('sched_pradesh');
    if (!pradeshSelect) return;

    pradeshSelect.innerHTML = '<option value="">प्रदेश छान्नुहोस्</option>';

    // Use PROVINCE object if available (from script.js)
    if (typeof PROVINCE !== 'undefined') {
        for (const [id, name] of Object.entries(PROVINCE)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name;
            pradeshSelect.appendChild(opt);
        }
    } else if (typeof METADATA !== 'undefined' && METADATA.districts) {
        // Fallback: use METADATA districts keys
        const provinceNames = {
            '1': 'कोशी प्रदेश',
            '2': 'मधेश प्रदेश',
            '3': 'बागमती प्रदेश',
            '4': 'गण्डकी प्रदेश',
            '5': 'लुम्बिनी प्रदेश',
            '6': 'कर्णाली प्रदेश',
            '7': 'सुदूरपश्चिम प्रदेश'
        };
        for (const [id, _] of Object.entries(METADATA.districts)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = provinceNames[id] || `प्रदेश ${id}`;
            pradeshSelect.appendChild(opt);
        }
    } else {
        // Ultimate fallback
        const provinces = ['१', '२', '३', '४', '५', '६', '७'];
        provinces.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = `प्रदेश ${p}`;
            pradeshSelect.appendChild(opt);
        });
    }
}

/**
 * Update district dropdown when province changes
 */
function updateSchedDistricts() {
    const pradeshId = document.getElementById('sched_pradesh').value;
    const jillaSelect = document.getElementById('sched_jilla');
    const sthaaniyaSelect = document.getElementById('sched_sthaaniya');

    jillaSelect.innerHTML = '<option value="">जिल्ला छान्नुहोस्</option>';
    sthaaniyaSelect.innerHTML = '<option value="">स्थानीय तह छान्नुहोस्</option>';

    if (!pradeshId) return;

    let districts = [];

    // Try DISTRICTS object first (from script.js)
    if (typeof DISTRICTS !== 'undefined' && DISTRICTS[pradeshId]) {
        districts = DISTRICTS[pradeshId];
    } else if (typeof METADATA !== 'undefined' && METADATA.districts && METADATA.districts[pradeshId]) {
        districts = METADATA.districts[pradeshId];
    }

    districts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        jillaSelect.appendChild(opt);
    });
}

/**
 * Update local level dropdown when district changes
 */
function updateSchedMunicipalities() {
    const pradeshId = document.getElementById('sched_pradesh').value;
    const district = document.getElementById('sched_jilla').value;
    const sthaaniyaSelect = document.getElementById('sched_sthaaniya');

    sthaaniyaSelect.innerHTML = '<option value="">स्थानीय तह छान्नुहोस्</option>';

    if (!pradeshId || !district) return;

    let municipalities = [];

    // Try MUNICIPALITIES object first (from script.js)
    if (typeof MUNICIPALITIES !== 'undefined' && MUNICIPALITIES[pradeshId] && MUNICIPALITIES[pradeshId][district]) {
        municipalities = MUNICIPALITIES[pradeshId][district];
    }

    municipalities.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        sthaaniyaSelect.appendChild(opt);
    });
}

/**
 * Initialize Schedule Monitoring with province/district dropdowns
 */
function initScheduleMonitoring() {
    // Populate province dropdown
    populateSchedPradesh();

    // Add cascading dropdown event listeners
    document.getElementById('sched_pradesh')?.addEventListener('change', updateSchedDistricts);
    document.getElementById('sched_jilla')?.addEventListener('change', updateSchedMunicipalities);

    // Form toggle
    const toggle = document.getElementById('scheduleFormToggle');
    const formBody = document.getElementById('scheduleFormBody');
    const formArrow = document.getElementById('scheduleFormArrow');
    if (toggle && formBody) {
        toggle.addEventListener('click', () => {
            const isHidden = formBody.style.display === 'none' || formBody.style.display === '';
            formBody.style.display = isHidden ? 'block' : 'none';
            if (formArrow) {
                formArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    }

    // Form submission
    const form = document.getElementById('scheduleForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = {
                sched_type: document.getElementById('sched_type').value,
                sched_pradesh: document.getElementById('sched_pradesh').value,
                sched_jilla: document.getElementById('sched_jilla').value,
                sched_sthaaniya: document.getElementById('sched_sthaaniya').value,
                sched_office: document.getElementById('sched_office').value,
                sched_date: document.getElementById('sched_date').value,
                sched_time: document.getElementById('sched_time').value,
                sched_assigned_to: document.getElementById('sched_assigned_to').value,
                sched_repeat: document.getElementById('sched_repeat').value,
                sched_priority: document.getElementById('sched_priority').value,
                sched_status: document.getElementById('sched_status').value,
                sched_remark: document.getElementById('sched_remark').value
            };

            if (!formData.sched_type || !formData.sched_office || !formData.sched_date) {
                Swal.fire({
                    icon: 'warning',
                    title: 'जानकारी आवश्यक!',
                    text: 'कृपया अनुगमन प्रकार, कार्यालयको नाम र मिति भर्नुहोस्।'
                });
                return;
            }

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> पर्खनुहोस्...';

            await saveSchedule(formData);

            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Schedule सुरक्षित गर्नुहोस्';
        });
    }

    // Filter buttons
    document.getElementById('applySchedFilter')?.addEventListener('click', filterSchedules);
    document.getElementById('resetSchedFilter')?.addEventListener('click', () => {
        document.getElementById('schedFilterType').value = '';
        document.getElementById('schedFilterStatus').value = '';
        document.getElementById('schedFilterPriority').value = '';
        document.getElementById('schedFilterMonitor').value = '';
        renderScheduleTable(allSchedules);
    });
    document.getElementById('refreshSchedules')?.addEventListener('click', loadSchedules);

    // Auto-load when schedule tab becomes active
    document.querySelectorAll('.nav-btn[data-tab="schedule-tab"]').forEach(btn => {
        btn.addEventListener('click', () => {
            loadSchedules();
        });
    });

    // Initial load
    loadSchedules();
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load
    setTimeout(initScheduleMonitoring, 500);
});
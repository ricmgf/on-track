// ========================================
// GLOBAL STATE
// ========================================

let tokenClient = null;
let accessToken = null;
let isSignedIn = false;

let sheetsData = {
    log: [],
    goals: {}
};

let currentView = 'dailyView';
let selectedDate = new Date();
let weekViewMode = 'thisWeek';
let selectedMonth = new Date();

// ========================================
// UI CONTROL FUNCTIONS
// ========================================

function showAuthOverlay() {
    console.log('🔍 DEBUG: Showing auth overlay');
    const authOverlay = document.getElementById('authOverlay');
    const app = document.getElementById('app');
    const loading = document.getElementById('loadingOverlay');
    
    if (authOverlay && app && loading) {
        loading.style.display = 'none';  // Hide loading first
        authOverlay.style.display = 'flex';
        app.style.display = 'none';
        console.log('✅ Auth overlay shown, app hidden, loading hidden');
    } else {
        console.error('❌ Cannot find required elements');
    }
}

function hideAuthOverlay() {
    console.log('🔍 DEBUG: Hiding auth overlay');
    const authOverlay = document.getElementById('authOverlay');
    const app = document.getElementById('app');
    const loading = document.getElementById('loadingOverlay');
    
    if (authOverlay && app && loading) {
        loading.style.display = 'none';  // Keep loading hidden
        authOverlay.style.display = 'none';
        app.style.display = 'flex';
        console.log('✅ Auth overlay hidden, app shown');
    } else {
        console.error('❌ Cannot find required elements');
    }
}

function showLoading() {
    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.style.display = 'flex';
}

function hideLoading() {
    const loading = document.getElementById('loadingOverlay');
    if (loading) {
        loading.style.display = 'none';
        console.log('🔍 DEBUG: Loading hidden');
    } else {
        console.error('❌ Loading overlay element not found');
    }
}

// ========================================
// GOOGLE AUTH INITIALIZATION
// ========================================

window.initGoogleAuth = function() {
    console.log('🔐 Initializing Google Auth...');
    
    if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(window.initGoogleAuth, 500);
        return;
    }
    
    console.log('✅ Google ready');
    
    // STEP 1: Initialize tokenClient
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: handleAuthResponse,
        itp_support: true,
    });
    
    console.log('✅ Token client initialized');
    
    // STEP 2: Enable button
    const btn = document.getElementById('signInBtn');
    const btnText = document.getElementById('signInBtnText');
    if (btn && btnText) {
        btn.disabled = false;
        btnText.textContent = 'Sign in with Google';
    }
    
    // STEP 3: Initialize GAPI client
    initGapiClient();
};

function initGapiClient() {
    if (typeof window.gapi === 'undefined') {
        setTimeout(initGapiClient, 500);
        return;
    }
    
    window.gapi.load('client', async () => {
        await window.gapi.client.init({
            discoveryDocs: CONFIG.DISCOVERY_DOCS
        });
        console.log('✅ GAPI ready');
        
        checkStoredToken();
    });
}

function checkStoredToken() {
    console.log('🔍 DEBUG: checkStoredToken called');
    
    const storedToken = localStorage.getItem('accessToken');
    const tokenExpiry = localStorage.getItem('tokenExpiry');
    
    console.log('🔍 DEBUG: About to hide loading...');
    hideLoading();
    console.log('🔍 DEBUG: After hideLoading call');
    
    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        console.log('✅ Using stored token');
        accessToken = storedToken;
        isSignedIn = true;
        window.gapi.client.setToken({ access_token: accessToken });
        
        hideAuthOverlay();
        loadAllData();
    } else {
        console.log('ℹ️ Please sign in');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('tokenExpiry');
        
        showAuthOverlay();
    }
}

// ========================================
// SIGN IN
// ========================================

function signIn() {
    console.log('🔐 User clicked sign in');
    
    if (!tokenClient) {
        console.error('❌ Token client not initialized');
        alert('Authentication system is still loading. Please wait a moment and try again.');
        return;
    }
    
    console.log('🚀 Requesting access...');
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleAuthResponse(response) {
    console.log('🔐 Auth response received');
    
    if (response.error) {
        console.error('❌ Auth error:', response);
        alert('Authentication failed: ' + response.error);
        return;
    }
    
    if (response.access_token) {
        console.log('✅ Token received');
        accessToken = response.access_token;
        const expiryTime = Date.now() + (3600 * 1000);
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('tokenExpiry', expiryTime.toString());
        
        isSignedIn = true;
        window.gapi.client.setToken({ access_token: accessToken });
        
        hideAuthOverlay();
        loadAllData();
    }
}

// ========================================
// PAGE INITIALIZATION
// ========================================

window.addEventListener('load', () => {
    console.log('📱 App loaded');
    
    const today = new Date();
    document.getElementById('dailyDatePicker').value = today.toISOString().split('T')[0];
    selectedDate = today;
    
    setupEventListeners();
    setupOfflineDetection();
});

// ========================================
// DATA LOADING
// ========================================

async function loadAllData() {
    showLoading();
    
    try {
        console.log('📊 Loading data...');
        
        await initializeSheets();
        await loadLogData();
        await loadGoalsData();
        
        console.log('✅ Data loaded');
        renderCurrentView();
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        if (error.status === 401 || error.status === 403) {
            console.log('🔐 Token expired');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('tokenExpiry');
            accessToken = null;
            isSignedIn = false;
            
            showAuthOverlay();
        } else {
            alert('Failed to load data: ' + (error.message || 'Unknown error'));
        }
    } finally {
        hideLoading();
    }
}

async function initializeSheets() {
    const response = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID
    });
    
    const sheets = response.result.sheets.map(s => s.properties.title);
    
    if (!sheets.includes(CONFIG.SHEETS.LOG)) {
        await createLogSheet();
    }
    
    if (!sheets.includes(CONFIG.SHEETS.WEEKLY_GOALS)) {
        await createGoalsSheet();
    }
}

async function createLogSheet() {
    try {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    addSheet: {
                        properties: { title: CONFIG.SHEETS.LOG }
                    }
                }]
            }
        });
    } catch (error) {
        // Sheet might exist
    }
    
    const headers = ['Date', 'UpperBody', 'LowerBody', 'Zone2', 'VO2Max', 'Walk', 'SportDay', 'Sauna', 'ColdPlunge', 'RestDay'];
    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.LOG}!A1:J1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
    });
}

async function createGoalsSheet() {
    try {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    addSheet: {
                        properties: { title: CONFIG.SHEETS.WEEKLY_GOALS }
                    }
                }]
            }
        });
    } catch (error) {
        // Sheet might exist
    }
    
    const headers = ['Activity', 'WeeklyTarget'];
    const defaultGoals = ACTIVITIES.map(a => [a.column, 0]);
    
    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.WEEKLY_GOALS}!A1:B${defaultGoals.length + 1}`,
        valueInputOption: 'RAW',
        resource: { values: [headers, ...defaultGoals] }
    });
}

async function loadLogData() {
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.LOG}!A2:J`
    });
    
    const rows = response.result.values || [];
    sheetsData.log = rows.map(row => ({
        date: row[0] || '',
        UpperBody: row[1] === 'TRUE',
        LowerBody: row[2] === 'TRUE',
        Zone2: row[3] === 'TRUE',
        VO2Max: row[4] === 'TRUE',
        Walk: row[5] === 'TRUE',
        SportDay: row[6] === 'TRUE',
        Sauna: row[7] === 'TRUE',
        ColdPlunge: row[8] === 'TRUE',
        RestDay: row[9] === 'TRUE'
    }));
}

async function loadGoalsData() {
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.WEEKLY_GOALS}!A2:B`
    });
    
    const rows = response.result.values || [];
    sheetsData.goals = {};
    
    rows.forEach(row => {
        sheetsData.goals[row[0]] = parseInt(row[1]) || 0;
    });
}

async function saveDayData(date, activities) {
    const dateStr = formatDateForSheets(date);
    const rowIndex = sheetsData.log.findIndex(entry => entry.date === dateStr);
    
    const rowData = [
        dateStr,
        activities.UpperBody ? 'TRUE' : 'FALSE',
        activities.LowerBody ? 'TRUE' : 'FALSE',
        activities.Zone2 ? 'TRUE' : 'FALSE',
        activities.VO2Max ? 'TRUE' : 'FALSE',
        activities.Walk ? 'TRUE' : 'FALSE',
        activities.SportDay ? 'TRUE' : 'FALSE',
        activities.Sauna ? 'TRUE' : 'FALSE',
        activities.ColdPlunge ? 'TRUE' : 'FALSE',
        activities.RestDay ? 'TRUE' : 'FALSE'
    ];
    
    if (rowIndex >= 0) {
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.SHEETS.LOG}!A${rowIndex + 2}:J${rowIndex + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [rowData] }
        });
        sheetsData.log[rowIndex] = { date: dateStr, ...activities };
    } else {
        await window.gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.SHEETS.LOG}!A:J`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowData] }
        });
        sheetsData.log.push({ date: dateStr, ...activities });
    }
}

async function saveGoalData(activity, weeklyTarget) {
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.WEEKLY_GOALS}!A2:A`
    });
    
    const activities = (response.result.values || []).map(row => row[0]);
    const rowIndex = activities.indexOf(activity);
    
    if (rowIndex >= 0) {
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.SHEETS.WEEKLY_GOALS}!B${rowIndex + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[weeklyTarget]] }
        });
    }
    
    sheetsData.goals[activity] = weeklyTarget;
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(btn.dataset.view);
        });
    });
    
    document.getElementById('dailyDatePicker').addEventListener('change', (e) => {
        if (e.target.value) {
            selectedDate = new Date(e.target.value + 'T00:00:00');
            renderDailyView();
        }
    });
    
    document.getElementById('thisWeekBtn').addEventListener('click', () => {
        weekViewMode = 'thisWeek';
        document.getElementById('thisWeekBtn').classList.add('active');
        document.getElementById('last7DaysBtn').classList.remove('active');
        renderWeekView();
    });
    
    document.getElementById('last7DaysBtn').addEventListener('click', () => {
        weekViewMode = 'last7Days';
        document.getElementById('last7DaysBtn').classList.add('active');
        document.getElementById('thisWeekBtn').classList.remove('active');
        renderWeekView();
    });
    
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        selectedMonth.setMonth(selectedMonth.getMonth() - 1);
        renderMonthView();
    });
    
    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        selectedMonth.setMonth(selectedMonth.getMonth() + 1);
        renderMonthView();
    });
}

function setupOfflineDetection() {
    const updateOnlineStatus = () => {
        if (navigator.onLine) {
            document.body.classList.remove('offline');
            document.getElementById('offlineBanner').classList.add('hidden');
        } else {
            document.body.classList.add('offline');
            document.getElementById('offlineBanner').classList.remove('hidden');
        }
    };
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

// ========================================
// VIEW RENDERING
// ========================================

function switchView(viewId) {
    currentView = viewId;
    
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });
    
    renderCurrentView();
}

function renderCurrentView() {
    switch (currentView) {
        case 'dailyView': renderDailyView(); break;
        case 'weekView': renderWeekView(); break;
        case 'monthView': renderMonthView(); break;
        case 'goalsView': renderGoalsView(); break;
    }
}

function renderDailyView() {
    const grid = document.getElementById('dailyGrid');
    grid.innerHTML = '';
    
    const dateStr = formatDateForSheets(selectedDate);
    const dayData = getDayData(dateStr);
    
    ACTIVITIES.forEach(activity => {
        const btn = document.createElement('button');
        btn.className = 'activity-btn';
        
        if (dayData[activity.column]) btn.classList.add('active');
        if (dayData.RestDay && activity.id !== 'RestDay') btn.classList.add('disabled');
        if (activity.id === 'RestDay' && hasAnyActivity(dayData)) btn.classList.add('disabled');
        
        btn.innerHTML = `
            ${activity.icon ? `<span class="icon">${activity.icon}</span>` : ''}
            <span>${activity.name}</span>
            ${dayData[activity.column] ? '<span class="check">✓</span>' : ''}
        `;
        
        btn.addEventListener('click', () => toggleActivity(activity.id, dateStr));
        grid.appendChild(btn);
    });
}

function toggleActivity(activityId, dateStr) {
    if (!isSignedIn) {
        alert('Please sign in to save changes');
        return;
    }
    
    const activity = ACTIVITIES.find(a => a.id === activityId);
    const dayData = getDayData(dateStr);
    const newValue = !dayData[activity.column];
    
    if (activityId === 'RestDay' && newValue) {
        ACTIVITIES.forEach(a => dayData[a.column] = a.id === 'RestDay');
    } else if (activityId !== 'RestDay' && newValue && dayData.RestDay) {
        dayData.RestDay = false;
        dayData[activity.column] = true;
    } else {
        dayData[activity.column] = newValue;
    }
    
    saveDayData(selectedDate, dayData);
    renderDailyView();
}

function getDayData(dateStr) {
    const entry = sheetsData.log.find(e => e.date === dateStr);
    if (entry) return { ...entry };
    
    const defaultData = { date: dateStr };
    ACTIVITIES.forEach(a => defaultData[a.column] = false);
    return defaultData;
}

function hasAnyActivity(dayData) {
    return ACTIVITIES.some(a => a.id !== 'RestDay' && dayData[a.column]);
}

function renderWeekView() {
    const timeline = document.getElementById('weekTimeline');
    const summary = document.getElementById('weekSummary');
    timeline.innerHTML = '';
    
    const days = weekViewMode === 'thisWeek' ? getThisWeekDays() : getLast7Days();
    const weeklyCounts = {};
    ACTIVITIES.forEach(a => weeklyCounts[a.column] = 0);
    
    days.forEach(date => {
        const dateStr = formatDateForSheets(date);
        const dayData = getDayData(dateStr);
        
        ACTIVITIES.forEach(a => {
            if (dayData[a.column]) weeklyCounts[a.column]++;
        });
        
        const activeActivities = ACTIVITIES.filter(a => dayData[a.column]);
        
        const card = document.createElement('div');
        card.className = 'day-card';
        card.innerHTML = `
            <div class="day-header">
                <div class="day-name">${formatDayName(date)}</div>
                <div class="day-date">${formatDayDate(date)}</div>
            </div>
            <div class="activity-chips">
                ${activeActivities.length > 0 
                    ? activeActivities.map(a => `
                        <div class="activity-chip">
                            ${a.icon ? `<span class="icon">${a.icon}</span>` : ''}
                            <span>${a.name}</span>
                        </div>
                    `).join('')
                    : '<div class="activity-chip empty">No activity</div>'
                }
            </div>
        `;
        timeline.appendChild(card);
    });
    
    summary.innerHTML = `
        <h3>Weekly Total</h3>
        <div class="summary-grid">
            ${ACTIVITIES.map(a => `
                <div class="summary-item">
                    <span class="count">${weeklyCounts[a.column]}</span> ${a.name}
                </div>
            `).join('')}
        </div>
    `;
}

function getThisWeekDays() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        days.push(day);
    }
    return days;
}

function getLast7Days() {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const day = new Date(today);
        day.setDate(today.getDate() - i);
        days.push(day);
    }
    return days;
}

function renderMonthView() {
    const scorecard = document.getElementById('monthScorecard');
    const monthTitle = document.getElementById('monthTitle');
    
    monthTitle.textContent = formatMonthYear(selectedMonth);
    scorecard.innerHTML = '';
    
    const monthData = getMonthData(selectedMonth);
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    
    ACTIVITIES.forEach(activity => {
        const weeklyTarget = sheetsData.goals[activity.column] || 0;
        const monthlyTarget = Math.round(weeklyTarget * (daysInMonth / 7));
        const done = monthData[activity.column] || 0;
        
        const isOnTrack = monthlyTarget > 0 && done >= monthlyTarget;
        const showStatus = monthlyTarget > 0;
        
        const item = document.createElement('div');
        item.className = `scorecard-item ${isOnTrack ? 'on-track' : 'behind'}`;
        item.innerHTML = `
            <div class="scorecard-activity">
                ${activity.icon ? `<span class="icon">${activity.icon}</span>` : ''}
                <span>${activity.name}</span>
            </div>
            <div class="scorecard-progress">
                <div class="scorecard-numbers">${done} / ${monthlyTarget}</div>
                ${showStatus ? `<div class="scorecard-status">${isOnTrack ? '🟢' : '🔴'}</div>` : ''}
            </div>
        `;
        scorecard.appendChild(item);
    });
}

function getMonthData(month) {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const counts = {};
    
    ACTIVITIES.forEach(a => counts[a.column] = 0);
    
    sheetsData.log.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate.getFullYear() === year && entryDate.getMonth() === monthIndex) {
            ACTIVITIES.forEach(a => {
                if (entry[a.column]) counts[a.column]++;
            });
        }
    });
    
    return counts;
}

function renderGoalsView() {
    const goalsList = document.getElementById('goalsList');
    goalsList.innerHTML = '';
    
    const daysInCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    
    ACTIVITIES.forEach(activity => {
        const weeklyTarget = sheetsData.goals[activity.column] || 0;
        const monthlyDerived = Math.round(weeklyTarget * (daysInCurrentMonth / 7));
        
        const item = document.createElement('div');
        item.className = 'goal-item';
        item.innerHTML = `
            <div class="goal-header">
                <div class="goal-name">
                    ${activity.icon ? `<span class="icon">${activity.icon}</span>` : ''}
                    <span>${activity.name}</span>
                </div>
            </div>
            <div class="goal-input-group">
                <div class="stepper">
                    <button class="stepper-btn decrease-btn">−</button>
                    <div class="stepper-value">${weeklyTarget}</div>
                    <button class="stepper-btn increase-btn">+</button>
                </div>
            </div>
            <div class="monthly-derived">≈ <span class="value">${monthlyDerived}</span> per month</div>
        `;
        
        item.querySelector('.decrease-btn').addEventListener('click', () => {
            updateGoal(activity.column, Math.max(0, weeklyTarget - 1));
        });
        
        item.querySelector('.increase-btn').addEventListener('click', () => {
            updateGoal(activity.column, weeklyTarget + 1);
        });
        
        goalsList.appendChild(item);
    });
}

async function updateGoal(activityColumn, newValue) {
    if (!isSignedIn) {
        alert('Please sign in to save changes');
        return;
    }
    
    await saveGoalData(activityColumn, newValue);
    renderGoalsView();
}

// ========================================
// UTILITIES
// ========================================

function formatDateForSheets(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDayName(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatDayDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

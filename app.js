// ========================================
// GLOBAL STATE
// ========================================

let tokenClient = null;
let accessToken = null;
let isSignedIn = false;
let gapiInited = false;
let gisInited = false;

let sheetsData = {
    log: [],
    goals: {}
};

let currentView = 'dailyView';
let selectedDate = new Date();
let weekViewMode = 'thisWeek';
let selectedMonth = new Date();

// ========================================
// INITIALIZATION - WAIT FOR ALL SCRIPTS
// ========================================

window.addEventListener('load', () => {
    console.log('Window loaded, starting initialization...');
    
    // Set today's date in the picker
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('dailyDatePicker').value = dateStr;
    selectedDate = today;
    
    setupEventListeners();
    setupOfflineDetection();
    checkGoogleScriptsLoaded();
});

function checkGoogleScriptsLoaded() {
    let attempts = 0;
    const maxAttempts = 50;
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        const gapiLoaded = typeof window.gapi !== 'undefined';
        const gisLoaded = typeof window.google !== 'undefined' && 
                         typeof window.google.accounts !== 'undefined' &&
                         typeof window.google.accounts.oauth2 !== 'undefined';
        
        console.log(`Attempt ${attempts}: GAPI=${gapiLoaded}, GIS=${gisLoaded}`);
        
        if (gapiLoaded && gisLoaded) {
            clearInterval(checkInterval);
            console.log('Both Google scripts loaded successfully');
            initializeGoogleServices();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('Timeout waiting for Google scripts');
            hideLoading();
            alert('Failed to load Google services. Please refresh the page.');
        }
    }, 200);
}

async function initializeGoogleServices() {
    showLoading();
    
    try {
        await initGapiClient();
        await initGoogleIdentityServices();
        console.log('Google services initialized successfully');
    } catch (error) {
        console.error('Error initializing Google services:', error);
        hideLoading();
        alert('Failed to initialize Google authentication. Error: ' + error.message);
    }
}

async function initGapiClient() {
    return new Promise((resolve, reject) => {
        try {
            window.gapi.load('client', async () => {
                try {
                    await window.gapi.client.init({
                        discoveryDocs: CONFIG.DISCOVERY_DOCS
                    });
                    gapiInited = true;
                    console.log('GAPI client initialized');
                    resolve();
                } catch (error) {
                    console.error('Error in gapi.client.init:', error);
                    reject(error);
                }
            });
        } catch (error) {
            console.error('Error loading GAPI client:', error);
            reject(error);
        }
    });
}

async function initGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
        try {
            if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
                reject(new Error('Google Identity Services not available'));
                return;
            }
            
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                callback: (response) => {
                    handleAuthResponse(response);
                    resolve();
                },
            });
            
            gisInited = true;
            console.log('GIS initialized');
            
            const storedToken = sessionStorage.getItem('accessToken');
            const tokenExpiry = sessionStorage.getItem('tokenExpiry');
            
            if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
                console.log('Using stored token');
                accessToken = storedToken;
                isSignedIn = true;
                window.gapi.client.setToken({ access_token: accessToken });
                loadAllData();
                resolve();
            } else {
                sessionStorage.removeItem('accessToken');
                sessionStorage.removeItem('tokenExpiry');
                hideLoading();
                console.log('No valid token, requesting new one');
                requestAccessToken();
                resolve();
            }
            
        } catch (error) {
            console.error('Error initializing GIS:', error);
            reject(error);
        }
    });
}

function requestAccessToken() {
    if (!tokenClient) {
        console.error('Token client not initialized');
        alert('Authentication system not ready. Please refresh the page.');
        return;
    }
    
    try {
        console.log('Requesting access token...');
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
        console.error('Error requesting access token:', error);
        alert('Failed to request authentication: ' + error.message);
    }
}

function handleAuthResponse(response) {
    console.log('Auth response received');
    
    if (response.error) {
        console.error('Auth error:', response);
        alert('Authentication failed: ' + response.error);
        hideLoading();
        return;
    }
    
    if (response.access_token) {
        accessToken = response.access_token;
        const expiryTime = Date.now() + (3600 * 1000);
        sessionStorage.setItem('accessToken', accessToken);
        sessionStorage.setItem('tokenExpiry', expiryTime.toString());
        
        isSignedIn = true;
        console.log('Access token obtained successfully');
        
        if (window.gapi && window.gapi.client) {
            window.gapi.client.setToken({ access_token: accessToken });
        }
        
        loadAllData();
    }
}

// ========================================
// DATA LOADING & SYNCING
// ========================================

async function loadAllData() {
    showLoading();
    
    try {
        console.log('Loading all data...');
        
        if (!gapiInited || !window.gapi || !window.gapi.client) {
            throw new Error('GAPI client not ready');
        }
        
        window.gapi.client.setToken({ access_token: accessToken });
        
        await initializeSheets();
        await loadLogData();
        await loadGoalsData();
        
        console.log('Data loaded successfully');
        renderCurrentView();
        
    } catch (error) {
        console.error('Error loading data:', error);
        
        if (error.status === 401 || error.status === 403) {
            console.log('Token expired, requesting new one');
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('tokenExpiry');
            accessToken = null;
            isSignedIn = false;
            alert('Session expired. Please sign in again.');
            requestAccessToken();
        } else {
            alert('Failed to load data: ' + (error.message || 'Unknown error'));
        }
    } finally {
        hideLoading();
    }
}

async function initializeSheets() {
    try {
        console.log('Checking sheets...');
        const response = await window.gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });
        
        const sheets = response.result.sheets.map(s => s.properties.title);
        console.log('Existing sheets:', sheets);
        
        if (!sheets.includes(CONFIG.SHEETS.LOG)) {
            console.log('Creating Log sheet...');
            await createLogSheet();
        } else {
            // Check if Log sheet has headers
            const logCheck = await window.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                range: `${CONFIG.SHEETS.LOG}!A1:J1`
            });
            if (!logCheck.result.values || logCheck.result.values.length === 0) {
                console.log('Log sheet exists but has no headers, adding them...');
                await addLogHeaders();
            }
        }
        
        if (!sheets.includes(CONFIG.SHEETS.WEEKLY_GOALS)) {
            console.log('Creating WeeklyGoals sheet...');
            await createGoalsSheet();
        } else {
            // Check if Goals sheet has data
            const goalsCheck = await window.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                range: `${CONFIG.SHEETS.WEEKLY_GOALS}!A1:B1`
            });
            if (!goalsCheck.result.values || goalsCheck.result.values.length === 0) {
                console.log('Goals sheet exists but has no headers, adding them...');
                await addGoalsHeaders();
            }
        }
        
    } catch (error) {
        console.error('Error initializing sheets:', error);
        throw error;
    }
}

async function createLogSheet() {
    try {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: CONFIG.SHEETS.LOG
                        }
                    }
                }]
            }
        });
    } catch (error) {
        console.log('Sheet might exist:', error.message);
    }
    
    await addLogHeaders();
}

async function addLogHeaders() {
    const headers = ['Date', 'UpperBody', 'LowerBody', 'Zone2', 'VO2Max', 'Walk', 'SportDay', 'Sauna', 'ColdPlunge', 'RestDay'];
    
    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.LOG}!A1:J1`,
        valueInputOption: 'RAW',
        resource: {
            values: [headers]
        }
    });
    
    console.log('Log sheet headers added');
}

async function createGoalsSheet() {
    try {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: CONFIG.SHEETS.WEEKLY_GOALS
                        }
                    }
                }]
            }
        });
    } catch (error) {
        console.log('Sheet might exist:', error.message);
    }
    
    await addGoalsHeaders();
}

async function addGoalsHeaders() {
    const headers = ['Activity', 'WeeklyTarget'];
    const defaultGoals = ACTIVITIES.map(a => [a.column, 0]);
    
    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.WEEKLY_GOALS}!A1:B${defaultGoals.length + 1}`,
        valueInputOption: 'RAW',
        resource: {
            values: [headers, ...defaultGoals]
        }
    });
    
    console.log('WeeklyGoals sheet headers and defaults added');
}

async function loadLogData() {
    console.log('Loading log data...');
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
    
    console.log(`Loaded ${sheetsData.log.length} log entries`);
}

async function loadGoalsData() {
    console.log('Loading goals data...');
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG.SHEETS.WEEKLY_GOALS}!A2:B`
    });
    
    const rows = response.result.values || [];
    sheetsData.goals = {};
    
    rows.forEach(row => {
        const activity = row[0];
        const target = parseInt(row[1]) || 0;
        sheetsData.goals[activity] = target;
    });
    
    console.log('Goals loaded:', sheetsData.goals);
}

async function saveDayData(date, activities) {
    try {
        const dateStr = formatDateForSheets(date);
        console.log('Saving data for:', dateStr, activities);
        
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
        
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
        alert('Failed to save: ' + error.message);
    }
}

async function saveGoalData(activity, weeklyTarget) {
    try {
        console.log('Saving goal:', activity, weeklyTarget);
        
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
        console.log('Goal saved successfully');
    } catch (error) {
        console.error('Error saving goal:', error);
        alert('Failed to save goal: ' + error.message);
    }
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = btn.dataset.view;
            switchView(targetView);
        });
    });
    
    document.getElementById('dailyDatePicker').addEventListener('change', (e) => {
        const dateValue = e.target.value;
        if (dateValue) {
            selectedDate = new Date(dateValue + 'T00:00:00');
            console.log('Date changed to:', selectedDate);
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
// VIEW SWITCHING
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

// ========================================
// DAILY VIEW
// ========================================

function renderDailyView() {
    const grid = document.getElementById('dailyGrid');
    grid.innerHTML = '';
    
    const dateStr = formatDateForSheets(selectedDate);
    const dayData = getDayData(dateStr);
    
    console.log('Rendering daily view for:', dateStr, dayData);
    
    ACTIVITIES.forEach(activity => {
        const btn = document.createElement('button');
        btn.className = 'activity-btn';
        btn.dataset.activity = activity.id;
        
        if (dayData[activity.column]) {
            btn.classList.add('active');
        }
        
        if (dayData.RestDay && activity.id !== 'RestDay') {
            btn.classList.add('disabled');
        } else if (activity.id === 'RestDay' && hasAnyActivity(dayData)) {
            btn.classList.add('disabled');
        }
        
        if (activity.icon) {
            btn.innerHTML = `
                <span class="icon">${activity.icon}</span>
                <span>${activity.name}</span>
                ${dayData[activity.column] ? '<span class="check">✓</span>' : ''}
            `;
        } else {
            btn.innerHTML = `
                <span>${activity.name}</span>
                ${dayData[activity.column] ? '<span class="check">✓</span>' : ''}
            `;
        }
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Button clicked:', activity.id);
            toggleActivity(activity.id, dateStr);
        });
        
        grid.appendChild(btn);
    });
}

function toggleActivity(activityId, dateStr) {
    if (!navigator.onLine || !isSignedIn) {
        console.log('Cannot toggle - offline or not signed in');
        return;
    }
    
    console.log('Toggling activity:', activityId);
    
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

// ========================================
// WEEK VIEW
// ========================================

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
                        <div class="activity-chip" data-activity="${a.id}">
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

// ========================================
// MONTH VIEW
// ========================================

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
        
        // Only show green if target > 0 AND done >= target
        const isOnTrack = monthlyTarget > 0 && done >= monthlyTarget;
        const showStatus = monthlyTarget > 0; // Only show status if there's a target
        
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

// ========================================
// GOALS VIEW
// ========================================

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
                    <button class="stepper-btn decrease-btn" data-activity="${activity.column}">−</button>
                    <div class="stepper-value">${weeklyTarget}</div>
                    <button class="stepper-btn increase-btn" data-activity="${activity.column}">+</button>
                </div>
            </div>
            <div class="monthly-derived">
                ≈ <span class="value">${monthlyDerived}</span> per month
            </div>
        `;
        
        const decreaseBtn = item.querySelector('.decrease-btn');
        const increaseBtn = item.querySelector('.increase-btn');
        
        decreaseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Decrease clicked for:', activity.column);
            updateGoal(activity.column, Math.max(0, weeklyTarget - 1));
        });
        
        increaseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Increase clicked for:', activity.column);
            updateGoal(activity.column, weeklyTarget + 1);
        });
        
        goalsList.appendChild(item);
    });
}

async function updateGoal(activityColumn, newValue) {
    if (!navigator.onLine || !isSignedIn) {
        console.log('Cannot update goal - offline or not signed in');
        return;
    }
    
    console.log('Updating goal for:', activityColumn, 'to', newValue);
    await saveGoalData(activityColumn, newValue);
    renderGoalsView();
}

// ========================================
// UTILITY FUNCTIONS
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

function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

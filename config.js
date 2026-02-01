// ========================================
// GOOGLE OAUTH & SHEETS API CONFIGURATION
// ========================================

const CONFIG = {
    // Google OAuth Client ID
    CLIENT_ID: '823140829182-8vrilaolvkpi8ch1q6e101ba132vao5g.apps.googleusercontent.com',
    
    // Google API configuration
    API_KEY: '', // Not required for OAuth
    DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    
    // Google Sheets ID
    SPREADSHEET_ID: '1AJuewNbYGiFxh82jOfBDswEKvfNXnZJdntg5s4EJS5I',
    
    // Sheet names (must match exactly)
    SHEETS: {
        LOG: 'Log',
        WEEKLY_GOALS: 'WeeklyGoals'
    }
};

// ========================================
// ACTIVITY DEFINITIONS
// ========================================

const ACTIVITIES = [
    {
        id: 'UpperBody',
        name: 'Upper Body',
        icon: null,
        column: 'UpperBody'
    },
    {
        id: 'LowerBody',
        name: 'Lower Body',
        icon: null,
        column: 'LowerBody'
    },
    {
        id: 'Zone2',
        name: 'Zone 2',
        icon: null,
        column: 'Zone2'
    },
    {
        id: 'VO2Max',
        name: 'VO₂ Max',
        icon: null,
        column: 'VO2Max'
    },
    {
        id: 'Walk',
        name: 'Walk',
        icon: null,
        column: 'Walk'
    },
    {
        id: 'SportDay',
        name: 'Sport Day',
        icon: null,
        column: 'SportDay'
    },
    {
        id: 'Sauna',
        name: 'Sauna',
        icon: '🔥',
        column: 'Sauna'
    },
    {
        id: 'ColdPlunge',
        name: 'Cold Plunge',
        icon: '❄️',
        column: 'ColdPlunge'
    },
    {
        id: 'RestDay',
        name: 'Rest Day',
        icon: null,
        column: 'RestDay'
    }
];

// Column indices in Google Sheets (0-based)
const COLUMN_INDICES = {
    Date: 0,
    UpperBody: 1,
    LowerBody: 2,
    Zone2: 3,
    VO2Max: 4,
    Walk: 5,
    SportDay: 6,
    Sauna: 7,
    ColdPlunge: 8,
    RestDay: 9
};

const GOAL_COLUMN_INDICES = {
    Activity: 0,
    WeeklyTarget: 1
};

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
        short: 'Upper',
        icon: null,
        color: '#A85A64',
        column: 'UpperBody'
    },
    {
        id: 'LowerBody',
        name: 'Lower Body',
        short: 'Lower',
        icon: null,
        color: '#7A3A45',
        column: 'LowerBody'
    },
    {
        id: 'Zone2',
        name: 'Zone 2',
        short: 'Zone 2',
        icon: null,
        color: '#4A8BB0',
        column: 'Zone2'
    },
    {
        id: 'VO2Max',
        name: 'VO₂ Max',
        short: 'VO₂Max',
        icon: null,
        color: '#2A4D6E',
        column: 'VO2Max'
    },
    {
        id: 'Walk',
        name: 'Walk',
        short: 'Walk',
        icon: null,
        color: '#6FB3D9',
        column: 'Walk'
    },
    {
        id: 'SportDay',
        name: 'Sport Day',
        short: 'Sport',
        icon: null,
        color: '#5D8399',
        column: 'SportDay'
    },
    {
        id: 'Sauna',
        name: 'Sauna',
        short: 'Sauna',
        icon: '🔥',
        color: '#D97E47',
        column: 'Sauna'
    },
    {
        id: 'ColdPlunge',
        name: 'Cold Plunge',
        short: 'Cold',
        icon: '❄️',
        color: '#4DA6BA',
        column: 'ColdPlunge'
    },
    {
        id: 'RestDay',
        name: 'Rest Day',
        short: 'Rest',
        icon: null,
        color: '#3A3A3C',
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

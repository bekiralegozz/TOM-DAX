// API Configuration
export const API_CONFIG = {
    BASE_URL: 'http://10.20.1.129:5000',
    HOST: '10.20.1.129',
    PORT: '5000'
};

export const API_ENDPOINTS = {
    // Authentication endpoints
    AUTH: {
        LOGIN: `${API_CONFIG.BASE_URL}/api/auth/login`,
        LOGOUT: `${API_CONFIG.BASE_URL}/api/auth/logout`,
        VERIFY: `${API_CONFIG.BASE_URL}/api/auth/verify`,
        CHECK_TABLE: `${API_CONFIG.BASE_URL}/api/auth/check-table`,
        CREATE_TEST_USER: `${API_CONFIG.BASE_URL}/api/auth/create-test-user`
    },
    
    // Other API endpoints
    APP_CONFIG: `${API_CONFIG.BASE_URL}/api/app-config`,
    SESSION_ID: `${API_CONFIG.BASE_URL}/api/get-session-id`,
    TABLES: `${API_CONFIG.BASE_URL}/api/tables`,
    AGENT: `${API_CONFIG.BASE_URL}/api/agent`,
    VEGA_DATASETS: `${API_CONFIG.BASE_URL}/api/vega-datasets`
};

// Helper function to get full API URL
export const getApiUrl = (endpoint: string): string => {
    if (endpoint.startsWith('http')) {
        return endpoint;
    }
    return `${API_CONFIG.BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
};

export default API_CONFIG; 
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.hyundaimobisin.com';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enhanced API Service with Dynamic Data Handling
class HyundaiMobisAPIService {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.axiosInstance = axios.create({
            baseURL: baseURL,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Dynamic cache for API responses
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes

        // Dynamic model mappings (will be populated from API)
        this.modelMappings = new Map();
        this.initializeModelMappings();
    }

    // Initialize model mappings dynamically
    async initializeModelMappings() {
        try {
            // These are discovered from the API response data
            this.modelMappings.set('alcazar', 34);
            this.modelMappings.set('i20', 35);
            this.modelMappings.set('creta', 36);
            this.modelMappings.set('venue', 37);
            this.modelMappings.set('aura', 38);
            this.modelMappings.set('nios', 39);
        } catch (error) {
            console.warn('Could not initialize model mappings:', error.message);
        }
    }

    // Cache management
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // Dynamic API calls with caching
    async getAllAccessoryTypes() {
        const cacheKey = 'accessory-types';
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.axiosInstance.get('/service/accessories/getAllTypes');
            this.setCachedData(cacheKey, response.data);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch accessory types: ${error.message}`);
        }
    }

    async getAllSubTypes() {
        const cacheKey = 'accessory-subtypes';
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.axiosInstance.get('/service/accessories/getAllSubTypes');
            this.setCachedData(cacheKey, response.data);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch accessory subtypes: ${error.message}`);
        }
    }

    async getAccessoriesByModel(modelName, year = 2024) {
        const cacheKey = `accessories-${modelName}-${year}`;
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const modelId = this.modelMappings.get(modelName.toLowerCase());
            if (!modelId) {
                const availableModels = Array.from(this.modelMappings.keys());
                throw new Error(`Model '${modelName}' not supported. Available models: ${availableModels.join(', ')}`);
            }

            const response = await this.axiosInstance.get(`/service/accessories/getByModelIdYear?modelId=${modelId}&year=${year}`);
            const result = {
                model: modelName,
                year: year,
                modelId: modelId,
                accessories: response.data,
                totalCount: response.data.length,
                categories: this.categorizeAccessories(response.data)
            };
            
            this.setCachedData(cacheKey, result);
            return result;
        } catch (error) {
            throw new Error(`Failed to fetch accessories for ${modelName}: ${error.message}`);
        }
    }

    // Dynamic categorization based on actual data
    categorizeAccessories(accessories) {
        const categories = {};
        accessories.forEach(accessory => {
            const type = accessory.type;
            const subType = accessory.subType;
            
            if (!categories[type]) {
                categories[type] = {
                    count: 0,
                    subtypes: {},
                    priceRange: { min: Infinity, max: 0 }
                };
            }
            
            categories[type].count++;
            
            if (!categories[type].subtypes[subType]) {
                categories[type].subtypes[subType] = 0;
            }
            categories[type].subtypes[subType]++;
            
            // Update price range
            if (accessory.mrp > 0) {
                categories[type].priceRange.min = Math.min(categories[type].priceRange.min, accessory.mrp);
                categories[type].priceRange.max = Math.max(categories[type].priceRange.max, accessory.mrp);
            }
        });
        
        return categories;
    }

    async searchAccessories(searchTerm, modelName = null) {
        try {
            let allAccessories = [];
            
            if (modelName) {
                const modelData = await this.getAccessoriesByModel(modelName);
                allAccessories = modelData.accessories;
            } else {
                // Search across all models
                const models = Array.from(this.modelMappings.keys());
                for (const model of models) {
                    try {
                        const modelData = await this.getAccessoriesByModel(model);
                        allAccessories = allAccessories.concat(
                            modelData.accessories.map(acc => ({
                                ...acc,
                                sourceModel: model
                            }))
                        );
                    } catch (error) {
                        console.warn(`Failed to fetch ${model} accessories:`, error.message);
                    }
                }
            }

            const searchResults = allAccessories.filter(accessory => {
                const searchableText = [
                    accessory.accessoryName,
                    accessory.type,
                    accessory.subType,
                    accessory.body?.replace(/<[^>]*>/g, '') // Remove HTML tags
                ].join(' ').toLowerCase();
                
                return searchableText.includes(searchTerm.toLowerCase());
            });

            return {
                searchTerm,
                model: modelName || 'All Models',
                totalResults: searchResults.length,
                accessories: searchResults.slice(0, 50) // Limit results
            };
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    async getStates() {
        const cacheKey = 'states';
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.axiosInstance.get('/service/accessories/getStates');
            this.setCachedData(cacheKey, response.data);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch states: ${error.message}`);
        }
    }

    async getDistributorStates() {
        const cacheKey = 'distributor-states';
        let cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.axiosInstance.get('/service/accessories/getDistributorStates');
            this.setCachedData(cacheKey, response.data);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch distributor states: ${error.message}`);
        }
    }

    // Get available models dynamically
    getAvailableModels() {
        return Array.from(this.modelMappings.keys());
    }
}

const apiService = new HyundaiMobisAPIService(API_BASE_URL);

// Utility function for consistent responses
const sendResponse = (res, success, data = null, error = null, statusCode = 200) => {
    const response = {
        success,
        timestamp: new Date().toISOString(),
        server: `http://localhost:${PORT}`,
        ...(data && { data }),
        ...(error && { error })
    };
    
    if (!success && statusCode === 200) {
        statusCode = 500;
    }
    
    res.status(statusCode).json(response);
};

// Dynamic Routes

// Home route with server info
app.get('/', (req, res) => {
    sendResponse(res, true, {
        message: 'Hyundai Mobis Accessories API Server',
        status: 'Running',
        version: '2.0.0',
        serverPort: PORT,
        apiBaseURL: API_BASE_URL,
        supportedModels: apiService.getAvailableModels(),
        endpoints: {
            categories: {
                'GET /api/categories/types': 'Get all accessory categories',
                'GET /api/categories/subtypes': 'Get all accessory subcategories'
            },
            models: {
                'GET /api/models': 'Get available models',
                'GET /api/models/:model/accessories': 'Get accessories for specific model',
                'GET /api/models/:model/accessories?year=2024': 'Get accessories by model and year'
            },
            search: {
                'GET /api/search?q=term': 'Search accessories globally',
                'GET /api/search?q=term&model=i20': 'Search accessories for specific model'
            },
            location: {
                'GET /api/states': 'Get available states',
                'GET /api/distributors/states': 'Get distributor states'
            }
        }
    });
});

// Category routes (corrected endpoints)
app.get('/api/categories/types', async (req, res) => {
    try {
        const data = await apiService.getAllAccessoryTypes();
        sendResponse(res, true, data);
    } catch (error) {
        sendResponse(res, false, null, error.message, 500);
    }
});

app.get('/api/categories/subtypes', async (req, res) => {
    try {
        const data = await apiService.getAllSubTypes();
        sendResponse(res, true, data);
    } catch (error) {
        sendResponse(res, false, null, error.message, 500);
    }
});

// Model routes
app.get('/api/models', (req, res) => {
    const models = apiService.getAvailableModels();
    sendResponse(res, true, { models, count: models.length });
});

app.get('/api/models/:model/accessories', async (req, res) => {
    try {
        const { model } = req.params;
        const { year = 2024 } = req.query;
        const data = await apiService.getAccessoriesByModel(model, parseInt(year));
        sendResponse(res, true, data);
    } catch (error) {
        sendResponse(res, false, null, error.message, 500);
    }
});

// Search route
app.get('/api/search', async (req, res) => {
    try {
        const { q: searchTerm, model } = req.query;
        if (!searchTerm) {
            return sendResponse(res, false, null, 'Search term (q) is required', 400);
        }
        const data = await apiService.searchAccessories(searchTerm, model);
        sendResponse(res, true, data);
    } catch (error) {
        sendResponse(res, false, null, error.message, 500);
    }
});

// Location routes
app.get('/api/states', async (req, res) => {
    try {
        const data = await apiService.getStates();
        sendResponse(res, true, data);
    } catch (error) {
        sendResponse(res, false, null, error.message, 500);
    }
});

app.get('/api/distributors/states', async (req, res) => {
    try {
        const data = await apiService.getDistributorStates();
        sendResponse(res, true, data);
    } catch (error) {
        sendResponse(res, false, null, error.message, 500);
    }
});

// Auto-assign port
const net = require('net');
const findAvailablePort = (startPort) => {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', () => {
            findAvailablePort(startPort + 1).then(resolve).catch(reject);
        });
    });
};

// Start server
(async () => {
    try {
        const availablePort = await findAvailablePort(PORT);
        app.listen(availablePort, () => {
            console.log('🚀 ================================');
            console.log(`🚗 Hyundai Mobis Accessories API`);
            console.log('🚀 ================================');
            console.log(`📡 Server running on port: ${availablePort}`);
            console.log(`🌐 Local URL: http://localhost:${availablePort}`);
            console.log(`🔗 API Base URL: ${API_BASE_URL}`);
            console.log(`📊 Dashboard: http://localhost:${availablePort}`);
            console.log(`🎯 Supported Models: ${apiService.getAvailableModels().join(', ')}`);
            console.log('🚀 ================================');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
})();

module.exports = app;

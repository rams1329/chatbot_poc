const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const GeminiClient = require('./gemini-client');

const app = express();
const PORT = process.env.PORT || 4000;
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.hyundaimobisin.com';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Dynamic API Service with Single Endpoint Strategy
class DynamicHyundaiAPIService {
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

        // Dynamic model mappings with year ranges (focusing on 2018+ as requested)
        this.modelMappings = new Map([
            ['alcazar', { id: 34, availableYears: [2021, 2022, 2023, 2024] }],
            ['i20', { id: 35, availableYears: [2018, 2019, 2020, 2021, 2022, 2023, 2024] }],
            ['creta', { id: 36, availableYears: [2018, 2019, 2020, 2021, 2022, 2023, 2024] }],
            ['venue', { id: 37, availableYears: [2019, 2020, 2021, 2022, 2023, 2024] }],
            ['aura', { id: 38, availableYears: [2020, 2021, 2022, 2023, 2024] }],
            ['nios', { id: 39, availableYears: [2018, 2019, 2020, 2021, 2022, 2023, 2024] }]
        ]);

        this.conversationState = {
            currentStep: 'model_selection',
            selectedModel: null,
            selectedYear: null,
            selectedType: null,
            allAccessories: [],
            availableTypes: [],
            availableSubTypes: []
        };

        this.setupInterceptors();
    }

    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
                return config;
            }
        );

        this.axiosInstance.interceptors.response.use(
            (response) => {
                console.log(`✅ API Success: ${response.status} - ${response.data.length} accessories found`);
                return response;
            },
            (error) => {
                console.error(`❌ API Error: ${error.response?.status || 'Network Error'}`);
                return Promise.reject(error);
            }
        );
    }

    // Single comprehensive API call with dynamic validation
    async fetchAllAccessoriesData(modelName, year = 2024) {
        try {
            const modelInfo = this.modelMappings.get(modelName.toLowerCase());
            if (!modelInfo) {
                throw new Error(`Model '${modelName}' not supported. Available models: ${Array.from(this.modelMappings.keys()).join(', ')}`);
            }

            // Validate year for this model
            if (!modelInfo.availableYears.includes(year)) {
                return {
                    success: false,
                    isYearUnavailable: true,
                    model: modelName,
                    year: year,
                    message: `${modelName.toUpperCase()} ${year} is not available in our database.`,
                    availableYears: modelInfo.availableYears,
                    suggestion: `Try ${modelName.toUpperCase()} with years: ${modelInfo.availableYears.slice(-3).join(', ')}`
                };
            }

            console.log(`🔄 Fetching ${modelName} (${year}) accessories - Model ID: ${modelInfo.id}`);
            
            const response = await this.axiosInstance.get(
                `/service/accessories/getByModelIdYear?modelId=${modelInfo.id}&year=${year}`
            );

            const accessories = response.data;
            
            if (!accessories || accessories.length === 0) {
                return {
                    success: false,
                    isEmpty: true,
                    model: modelName,
                    year: year,
                    message: `No accessories found for ${modelName.toUpperCase()} ${year}. This model/year combination exists but has no accessories listed.`,
                    availableYears: modelInfo.availableYears,
                    suggestion: `Try different years for ${modelName.toUpperCase()}: ${modelInfo.availableYears.slice(-3).join(', ')}`
                };
            }

            // Process successful response - extract everything from single API call
            const processedData = {
                success: true,
                model: modelName,
                year: year,
                modelId: modelInfo.id,
                totalCount: accessories.length,
                accessories: accessories,
                types: this.extractTypesFromData(accessories),
                subtypes: this.extractSubTypesFromData(accessories),
                priceRange: this.calculatePriceRange(accessories),
                categories: this.categorizeAccessories(accessories)
            };

            console.log(`✅ Processed ${processedData.totalCount} accessories with ${processedData.types.length} types`);
            return processedData;

        } catch (error) {
            console.error(`❌ API call failed for ${modelName} ${year}:`, error.message);
            
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                return {
                    success: false,
                    isOffline: true,
                    model: modelName,
                    year: year,
                    message: "The Hyundai Mobis service is currently unavailable. Please try again later.",
                    suggestion: "Check your internet connection or try again in a few minutes."
                };
            }
            
            throw error;
        }
    }

    // Extract types dynamically from API response
    extractTypesFromData(accessories) {
        const typesMap = new Map();
        accessories.forEach(acc => {
            if (acc.type) {
                if (!typesMap.has(acc.type)) {
                    typesMap.set(acc.type, {
                        id: acc.typeId,
                        name: acc.type,
                        count: 0
                    });
                }
                typesMap.get(acc.type).count++;
            }
        });
        return Array.from(typesMap.values()).sort((a, b) => b.count - a.count);
    }

    // Extract subtypes dynamically from API response
    extractSubTypesFromData(accessories) {
        const subTypesMap = new Map();
        accessories.forEach(acc => {
            if (acc.subType) {
                if (!subTypesMap.has(acc.subType)) {
                    subTypesMap.set(acc.subType, {
                        id: acc.subTypeId,
                        name: acc.subType,
                        count: 0
                    });
                }
                subTypesMap.get(acc.subType).count++;
            }
        });
        return Array.from(subTypesMap.values()).sort((a, b) => b.count - a.count);
    }

    // Calculate price range from live data
    calculatePriceRange(accessories) {
        const prices = accessories.map(acc => acc.mrp).filter(price => price > 0);
        if (prices.length === 0) return { min: 0, max: 0, average: 0 };
        
        return {
            min: Math.min(...prices),
            max: Math.max(...prices),
            average: Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
        };
    }

    // Categorize accessories by type and subtype
    categorizeAccessories(accessories) {
        const categories = {};
        accessories.forEach(accessory => {
            const type = accessory.type;
            const subType = accessory.subType;

            if (!categories[type]) {
                categories[type] = {
                    count: 0,
                    subtypes: {},
                    items: []
                };
            }

            categories[type].count++;
            categories[type].items.push({
                id: accessory.id,
                name: accessory.accessoryName,
                price: accessory.mrp,
                code: accessory.accessoryCode
            });

            if (!categories[type].subtypes[subType]) {
                categories[type].subtypes[subType] = 0;
            }
            categories[type].subtypes[subType]++;
        });

        return categories;
    }

    // Conversation flow handlers
    async handleConversationFlow(userInput) {
        switch (this.conversationState.currentStep) {
            case 'model_selection':
                return await this.handleModelSelection(userInput);
            case 'type_selection':
                return await this.handleTypeSelection(userInput);
            case 'subtype_selection':
                return await this.handleSubtypeSelection(userInput);
            default:
                return await this.handleModelSelection(userInput);
        }
    }

    async handleModelSelection(userInput) {
        const models = Array.from(this.modelMappings.keys());
        const lowerInput = userInput.toLowerCase();
        const selectedModel = models.find(model => lowerInput.includes(model));
        const yearMatch = userInput.match(/20\d{2}/);
        const selectedYear = yearMatch ? parseInt(yearMatch[0]) : 2024;

        if (selectedModel) {
            this.conversationState.selectedModel = selectedModel;
            this.conversationState.selectedYear = selectedYear;

            // Single API call to get everything
            const data = await this.fetchAllAccessoriesData(selectedModel, selectedYear);

            if (data.isOffline) {
                return {
                    success: false,
                    isOffline: true,
                    step: 'offline_mode',
                    message: data.message,
                    selectedModel: selectedModel,
                    selectedYear: selectedYear,
                    suggestion: data.suggestion
                };
            } else if (data.isEmpty || data.isYearUnavailable) {
                return {
                    success: false,
                    isEmpty: true,
                    step: 'empty_results',
                    message: data.message,
                    selectedModel: selectedModel,
                    selectedYear: selectedYear,
                    availableYears: data.availableYears,
                    suggestion: data.suggestion,
                    nextAction: "Please try a different year or model"
                };
            } else {
                // Success - proceed with normal flow
                this.conversationState.currentStep = 'type_selection';
                this.conversationState.allAccessories = data.accessories;
                this.conversationState.availableTypes = data.types;

                return {
                    success: true,
                    step: 'type_selection',
                    message: `Perfect! You selected ${selectedModel.toUpperCase()} (${selectedYear}). I found ${data.totalCount} accessories. Please choose an accessory type:`,
                    selectedModel: selectedModel,
                    selectedYear: selectedYear,
                    totalAccessories: data.totalCount,
                    availableTypes: data.types,
                    priceRange: data.priceRange,
                    nextAction: "Please select a type: Interiors, Exteriors, Electronics, or Common"
                };
            }
        } else {
            return {
                success: false,
                step: 'model_selection',
                message: "Please specify a valid Hyundai model. Available models are:",
                availableModels: models.map(m => m.toUpperCase()),
                nextAction: "Please say the car model name and year (e.g., 'i20 2018', 'Creta 2023')"
            };
        }
    }

    async handleTypeSelection(userInput) {
        if (!this.conversationState.allAccessories || this.conversationState.allAccessories.length === 0) {
            return {
                success: false,
                message: "No accessories data available. Please start over with a new model selection.",
                suggestion: "Try a different model or year combination."
            };
        }

        const lowerInput = userInput.toLowerCase();
        const selectedType = this.conversationState.availableTypes.find(type =>
            lowerInput.includes(type.name.toLowerCase())
        );

        if (selectedType) {
            this.conversationState.selectedType = selectedType.name;
            this.conversationState.currentStep = 'subtype_selection';

            // Filter accessories by type from the single API response
            const typeAccessories = this.conversationState.allAccessories.filter(acc =>
                acc.type && acc.type.toLowerCase() === selectedType.name.toLowerCase()
            );

            this.conversationState.availableSubTypes = this.extractSubTypesFromData(typeAccessories);

            return {
                success: true,
                step: 'subtype_selection',
                message: `Great! You selected ${selectedType.name} for ${this.conversationState.selectedModel.toUpperCase()}. Found ${typeAccessories.length} items. Now choose a subcategory:`,
                selectedType: selectedType.name,
                availableSubTypes: this.conversationState.availableSubTypes,
                nextAction: "Please select a subcategory from the list above"
            };
        } else {
            return {
                success: false,
                step: 'type_selection',
                message: "Please select a valid accessory type:",
                availableTypes: this.conversationState.availableTypes,
                nextAction: "Please say: Interiors, Exteriors, Electronics, or Common"
            };
        }
    }

    async handleSubtypeSelection(userInput) {
        const lowerInput = userInput.toLowerCase();
        const selectedSubType = this.conversationState.availableSubTypes.find(subtype =>
            lowerInput.includes(subtype.name.toLowerCase())
        );

        if (selectedSubType) {
            // Filter final accessories from the single API response
            const finalAccessories = this.conversationState.allAccessories.filter(acc =>
                acc.type && acc.type.toLowerCase() === this.conversationState.selectedType.toLowerCase() &&
                acc.subType && acc.subType.toLowerCase() === selectedSubType.name.toLowerCase()
            );

            return {
                success: true,
                step: 'show_products',
                message: `Perfect! Here are the ${selectedSubType.name} accessories in ${this.conversationState.selectedType} category for ${this.conversationState.selectedModel.toUpperCase()}:`,
                accessories: finalAccessories.map(acc => ({
                    id: acc.id,
                    name: acc.accessoryName,
                    code: acc.accessoryCode,
                    price: acc.mrp,
                    description: acc.body ? acc.body.replace(/<[^>]*>/g, '').substring(0, 150) + '...' : 'No description available',
                    image: acc.image,
                    imageUrl: acc.image ? `https://hyundaimobisin.com/images/accessories/${acc.image}` : null,
                    type: acc.type,
                    subType: acc.subType
                })),
                nextAction: "You can ask for details about any accessory or start a new search"
            };
        } else {
            return {
                success: false,
                step: 'subtype_selection',
                message: "Please select a valid subcategory:",
                availableSubTypes: this.conversationState.availableSubTypes,
                nextAction: "Please say one of the subcategory names listed above"
            };
        }
    }

    getAvailableModels() {
        return Array.from(this.modelMappings.keys());
    }

    resetConversation() {
        this.conversationState = {
            currentStep: 'model_selection',
            selectedModel: null,
            selectedYear: null,
            selectedType: null,
            allAccessories: [],
            availableTypes: [],
            availableSubTypes: []
        };
    }
}

// Initialize services
const apiService = new DynamicHyundaiAPIService(API_BASE_URL);
const geminiClient = new GeminiClient();

// Initialize application
async function initializeApp() {
    try {
        console.log('🚀 Initializing Dynamic Hyundai Accessories App...');
        await geminiClient.initializeConversation();
        console.log('✅ Gemini client initialized');
        console.log('🎉 Application ready!');
    } catch (error) {
        console.error('❌ Initialization failed:', error);
    }
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        console.log(`📝 User message: ${message}`);

        let mcpData = null;
        let usedTool = null;

        try {
            mcpData = await apiService.handleConversationFlow(message);
            usedTool = 'dynamic_api_service';
            console.log(`🔧 Used dynamic API service`);
        } catch (mcpError) {
            console.warn('⚠️ API call failed, continuing with Gemini only:', mcpError.message);
        }

        // Get Gemini response
        const geminiResponse = await geminiClient.sendMessage(message, mcpData);

        // Determine response status
        let responseStatus = {
            hasLiveData: false,
            isOffline: false,
            isEmpty: false
        };

        if (mcpData) {
            if (mcpData.isOffline) {
                responseStatus.isOffline = true;
            } else if (mcpData.isEmpty) {
                responseStatus.isEmpty = true;
                responseStatus.hasLiveData = true;
            } else if (mcpData.success) {
                responseStatus.hasLiveData = true;
            }
        }

        res.json({
            success: true,
            response: geminiResponse,
            usedTool: usedTool,
            ...responseStatus,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Chat error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process message',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        services: {
            gemini: !!geminiClient,
            api: !!apiService
        },
        timestamp: new Date().toISOString()
    });
});

// Reset conversation endpoint
app.post('/api/reset', async (req, res) => {
    try {
        geminiClient.resetConversation();
        await geminiClient.initializeConversation();
        apiService.resetConversation();

        res.json({
            success: true,
            message: 'Conversation reset successfully'
        });
    } catch (error) {
        console.error('❌ Reset error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset conversation'
        });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
    console.log('🚀 ================================');
    console.log('🤖 Dynamic Hyundai Assistant');
    console.log('🚀 ================================');
    console.log(`📡 Server running on port: ${PORT}`);
    console.log(`🌐 Web UI: http://localhost:${PORT}`);
    console.log(`🎯 Models: ${apiService.getAvailableModels().join(', ')}`);
    console.log('🚀 ================================');

    await initializeApp();
});

module.exports = app;

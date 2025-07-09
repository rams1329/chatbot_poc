#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

class HyundaiStreamlinedAPIService {
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

        // Dynamic model mappings
        this.modelMappings = {
            'alcazar': 34,
            'i20': 35,
            'creta': 36,
            'venue': 37,
            'aura': 38,
            'nios': 39
        };

        // Conversation state management
        this.conversationState = {
            selectedModel: null,
            selectedModelId: null,
            selectedYear: null,
            allAccessories: [],
            availableTypes: [],
            selectedType: null,
            availableSubTypes: [],
            selectedSubType: null,
            filteredAccessories: [],
            currentStep: 'model_selection'
        };

        this.setupInterceptors();
    }

    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                console.error(`🔄 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
                return config;
            }
        );

        this.axiosInstance.interceptors.response.use(
            (response) => {
                console.error(`✅ API Success: ${response.status} ${response.config.url} - ${response.data.length} items`);
                return response;
            },
            (error) => {
                console.error(`❌ API Error: ${error.response?.status || 'Network Error'} ${error.config?.url}`);
                return Promise.reject(error);
            }
        );
    }

    // Step 1: Handle model and year selection
    async handleModelYearSelection(userInput) {
        const lowerInput = userInput.toLowerCase();
        const availableModels = Object.keys(this.modelMappings);
        
        // Check if user mentioned a valid model
        const selectedModel = availableModels.find(model => lowerInput.includes(model));
        
        // Extract year from input (default to 2024 if not specified)
        const yearMatch = userInput.match(/20\d{2}/);
        const selectedYear = yearMatch ? parseInt(yearMatch[0]) : 2024;
        
        if (selectedModel) {
            this.conversationState.selectedModel = selectedModel;
            this.conversationState.selectedModelId = this.modelMappings[selectedModel];
            this.conversationState.selectedYear = selectedYear;
            this.conversationState.currentStep = 'type_selection';
            
            // Fetch all accessories for this model and year
            const accessoriesData = await this.fetchAllAccessories(selectedModel, selectedYear);
            this.conversationState.allAccessories = accessoriesData;
            
            // Extract unique types from the response
            const uniqueTypes = this.extractUniqueTypes(accessoriesData);
            this.conversationState.availableTypes = uniqueTypes;
            
            return {
                success: true,
                step: 'type_selection',
                message: `Perfect! You selected ${selectedModel.toUpperCase()} (${selectedYear}). I found ${accessoriesData.length} accessories. Please choose an accessory type:`,
                selectedModel: selectedModel,
                selectedYear: selectedYear,
                totalAccessories: accessoriesData.length,
                availableTypes: uniqueTypes,
                nextAction: "Please select a type from the list above (e.g., 'Interiors', 'Exteriors', 'Electronics', 'Common')"
            };
        } else {
            return {
                success: false,
                step: 'model_selection',
                message: "Please specify a valid Hyundai model and optionally a year. Available models are:",
                availableModels: availableModels.map(model => model.toUpperCase()),
                nextAction: "Please say the car model name and year (e.g., 'i20 2024', 'Creta 2023', or just 'Alcazar')"
            };
        }
    }

    // Step 2: Handle type selection
    async handleTypeSelection(userInput) {
        const lowerInput = userInput.toLowerCase();
        
        const selectedType = this.conversationState.availableTypes.find(type => 
            lowerInput.includes(type.name.toLowerCase())
        );
        
        if (selectedType) {
            this.conversationState.selectedType = selectedType.name;
            this.conversationState.currentStep = 'subtype_selection';
            
            // Filter accessories by selected type and extract subtypes
            const typeFilteredAccessories = this.conversationState.allAccessories.filter(acc => 
                acc.type && acc.type.toLowerCase() === selectedType.name.toLowerCase()
            );
            
            const uniqueSubTypes = this.extractUniqueSubTypes(typeFilteredAccessories);
            this.conversationState.availableSubTypes = uniqueSubTypes;
            
            return {
                success: true,
                step: 'subtype_selection',
                message: `Excellent! You selected ${selectedType.name} for ${this.conversationState.selectedModel.toUpperCase()}. Found ${typeFilteredAccessories.length} items. Now choose a subcategory:`,
                selectedModel: this.conversationState.selectedModel,
                selectedType: selectedType.name,
                availableSubTypes: uniqueSubTypes,
                nextAction: "Please select a subcategory from the list above"
            };
        } else {
            return {
                success: false,
                step: 'type_selection',
                message: "Please select a valid accessory type:",
                availableTypes: this.conversationState.availableTypes,
                nextAction: "Please say one of the type names listed above"
            };
        }
    }

    // Step 3: Handle subtype selection and show products
    async handleSubTypeSelection(userInput) {
        const lowerInput = userInput.toLowerCase();
        
        const selectedSubType = this.conversationState.availableSubTypes.find(subtype => 
            lowerInput.includes(subtype.name.toLowerCase())
        );
        
        if (selectedSubType) {
            this.conversationState.selectedSubType = selectedSubType.name;
            this.conversationState.currentStep = 'show_products';
            
            // Filter accessories by type and subtype
            const filteredAccessories = this.conversationState.allAccessories.filter(acc => 
                acc.type && acc.type.toLowerCase() === this.conversationState.selectedType.toLowerCase() &&
                acc.subType && acc.subType.toLowerCase() === selectedSubType.name.toLowerCase()
            );
            
            this.conversationState.filteredAccessories = filteredAccessories;
            
            return {
                success: true,
                step: 'show_products',
                message: `Perfect! Here are the ${selectedSubType.name} accessories in ${this.conversationState.selectedType} category for ${this.conversationState.selectedModel.toUpperCase()}:`,
                selectedModel: this.conversationState.selectedModel,
                selectedType: this.conversationState.selectedType,
                selectedSubType: selectedSubType.name,
                totalProducts: filteredAccessories.length,
                accessories: this.formatAccessoriesForDisplay(filteredAccessories),
                nextAction: "You can ask for details about any specific accessory or start a new search"
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

    // Step 4: Handle product detail requests
    async handleProductDetails(userInput) {
        const lowerInput = userInput.toLowerCase();
        
        // Check if user is asking for details about a specific product
        const requestedProduct = this.conversationState.filteredAccessories.find(acc => 
            lowerInput.includes(acc.accessoryName.toLowerCase().substring(0, 10)) ||
            lowerInput.includes(acc.id.toString())
        );
        
        if (requestedProduct) {
            return {
                success: true,
                step: 'product_details',
                message: `Here are the complete details for ${requestedProduct.accessoryName}:`,
                productDetails: this.formatProductDetails(requestedProduct),
                nextAction: "You can ask about other products or start a new search"
            };
        } else if (lowerInput.includes('start over') || lowerInput.includes('new search')) {
            this.resetConversation();
            return {
                success: true,
                step: 'model_selection',
                message: "Let's start fresh! Which Hyundai model and year are you interested in?",
                availableModels: Object.keys(this.modelMappings).map(model => model.toUpperCase()),
                nextAction: "Please say the car model name and year"
            };
        } else {
            return {
                success: true,
                step: 'show_products',
                message: "I can show you details about any of the products listed above, or you can start a new search.",
                availableProducts: this.conversationState.filteredAccessories.map(acc => ({
                    id: acc.id,
                    name: acc.accessoryName,
                    price: acc.mrp
                })),
                nextAction: "Say the product name or ID for details, or say 'start over' for a new search"
            };
        }
    }

    // Fetch all accessories for a model and year
    async fetchAllAccessories(modelName, year) {
        try {
            const modelId = this.modelMappings[modelName.toLowerCase()];
            const response = await this.axiosInstance.get(`/service/accessories/getByModelIdYear?modelId=${modelId}&year=${year}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch accessories for ${modelName}: ${error.message}`);
        }
    }

    // Extract unique types from accessories data
    extractUniqueTypes(accessories) {
        const typesMap = new Map();
        accessories.forEach(acc => {
            if (acc.type) {
                const key = acc.type;
                if (!typesMap.has(key)) {
                    typesMap.set(key, {
                        id: acc.typeId,
                        name: acc.type,
                        count: 0
                    });
                }
                typesMap.get(key).count++;
            }
        });
        return Array.from(typesMap.values()).sort((a, b) => b.count - a.count);
    }

    // Extract unique subtypes from filtered accessories
    extractUniqueSubTypes(accessories) {
        const subTypesMap = new Map();
        accessories.forEach(acc => {
            if (acc.subType) {
                const key = acc.subType;
                if (!subTypesMap.has(key)) {
                    subTypesMap.set(key, {
                        id: acc.subTypeId,
                        name: acc.subType,
                        count: 0
                    });
                }
                subTypesMap.get(key).count++;
            }
        });
        return Array.from(subTypesMap.values()).sort((a, b) => b.count - a.count);
    }

    // Format accessories for display
    formatAccessoriesForDisplay(accessories) {
        return accessories.map(acc => ({
            id: acc.id,
            name: acc.accessoryName,
            code: acc.accessoryCode,
            price: acc.mrp,
            description: acc.body ? acc.body.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : 'No description available',
            image: acc.image
        }));
    }

    // Format complete product details
    formatProductDetails(product) {
        return {
            id: product.id,
            name: product.accessoryName,
            code: product.accessoryCode,
            price: product.mrp,
            type: product.type,
            subType: product.subType,
            fullDescription: product.body ? product.body.replace(/<[^>]*>/g, '') : 'No description available',
            image: product.image,
            url: product.url,
            title: product.title,
            imageUrl: `https://hyundaimobisin.com/images/accessories/${product.image}`
        };
    }

    // Reset conversation state
    resetConversation() {
        this.conversationState = {
            selectedModel: null,
            selectedModelId: null,
            selectedYear: null,
            allAccessories: [],
            availableTypes: [],
            selectedType: null,
            availableSubTypes: [],
            selectedSubType: null,
            filteredAccessories: [],
            currentStep: 'model_selection'
        };
    }
}

const apiService = new HyundaiStreamlinedAPIService('https://api.hyundaimobisin.com');

const server = new Server(
    {
        name: 'hyundai-streamlined-flow',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Tool definitions for streamlined flow
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'streamlined_conversation',
                description: 'Handle complete conversational flow with single API endpoint',
                inputSchema: {
                    type: 'object',
                    properties: {
                        userInput: {
                            type: 'string',
                            description: 'User input at current conversation step'
                        },
                        action: {
                            type: 'string',
                            description: 'Action type: start, continue, or reset',
                            enum: ['start', 'continue', 'reset']
                        }
                    },
                    required: ['userInput']
                },
            },
            {
                name: 'get_conversation_status',
                description: 'Get current conversation state and available options',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            }
        ],
    };
});

// Tool call handler for streamlined flow
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result;
        
        switch (name) {
            case 'streamlined_conversation':
                result = await handleStreamlinedConversation(args.userInput, args.action);
                break;
                
            case 'get_conversation_status':
                result = {
                    currentState: apiService.conversationState,
                    nextStep: getNextStepInstructions()
                };
                break;

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        console.error(`❌ Tool execution error for ${name}:`, error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});

// Main streamlined conversation handler
async function handleStreamlinedConversation(userInput, action = 'continue') {
    try {
        if (action === 'reset' || action === 'start') {
            apiService.resetConversation();
        }

        const currentStep = apiService.conversationState.currentStep;
        
        switch (currentStep) {
            case 'model_selection':
                return await apiService.handleModelYearSelection(userInput);
                
            case 'type_selection':
                return await apiService.handleTypeSelection(userInput);
                
            case 'subtype_selection':
                return await apiService.handleSubTypeSelection(userInput);
                
            case 'show_products':
            case 'product_details':
                return await apiService.handleProductDetails(userInput);
                
            default:
                apiService.resetConversation();
                return {
                    success: true,
                    step: 'model_selection',
                    message: "Welcome! Let's find the perfect accessories for your Hyundai. Which model and year do you have?",
                    availableModels: Object.keys(apiService.modelMappings).map(model => model.toUpperCase()),
                    nextAction: "Please say the car model name and year (e.g., 'i20 2024', 'Creta 2023')"
                };
        }
    } catch (error) {
        throw new Error(`Streamlined conversation error: ${error.message}`);
    }
}

// Get next step instructions
function getNextStepInstructions() {
    const currentStep = apiService.conversationState.currentStep;
    
    const instructions = {
        'model_selection': 'User should specify their Hyundai model name and year',
        'type_selection': 'User should choose from available accessory types',
        'subtype_selection': 'User should select a specific subcategory',
        'show_products': 'User can ask for product details or start over',
        'product_details': 'User can ask about other products or start new search'
    };
    
    return instructions[currentStep] || 'Unknown step';
}

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Hyundai Streamlined Flow MCP Server started successfully');
}

main().catch((error) => {
    console.error('❌ Server startup error:', error);
    process.exit(1);
});

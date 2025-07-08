#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

class HyundaiConversationalAPIService {
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

        // Dynamic model mappings from API data
        this.modelMappings = {
            'alcazar': 34,
            'i20': 35,
            'creta': 36,
            'venue': 37,
            'aura': 38,
            'nios': 39
        };

        // Session state management
        this.conversationState = {
            selectedModel: null,
            selectedModelId: null,
            selectedType: null,
            selectedTypeId: null,
            selectedSubType: null,
            selectedSubTypeId: null,
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
                console.error(`✅ API Success: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                console.error(`❌ API Error: ${error.response?.status || 'Network Error'} ${error.config?.url}`);
                return Promise.reject(error);
            }
        );
    }

    // Step 1: Handle car model selection
    async handleModelSelection(userInput) {
        const lowerInput = userInput.toLowerCase();
        const availableModels = Object.keys(this.modelMappings);
        
        // Check if user mentioned a valid model
        const selectedModel = availableModels.find(model => lowerInput.includes(model));
        
        if (selectedModel) {
            this.conversationState.selectedModel = selectedModel;
            this.conversationState.selectedModelId = this.modelMappings[selectedModel];
            this.conversationState.currentStep = 'type_selection';
            
            // Get all types and present to user
            const types = await this.getAllAccessoryTypes();
            
            return {
                success: true,
                step: 'type_selection',
                message: `Great! You selected ${selectedModel.toUpperCase()}. Now please choose an accessory type:`,
                selectedModel: selectedModel,
                availableTypes: types.data.map(type => ({
                    id: type.id,
                    name: type.description,
                    displaySeq: type.displaySeq
                })),
                nextAction: "Please select a type by saying the type name (e.g., 'Interiors', 'Exteriors', 'Electronics', 'Common')"
            };
        } else {
            return {
                success: false,
                step: 'model_selection',
                message: "Please specify a valid Hyundai model. Available models are:",
                availableModels: availableModels.map(model => model.toUpperCase()),
                nextAction: "Please say the car model name (e.g., 'i20', 'Creta', 'Alcazar', 'Venue', 'Aura', 'Nios')"
            };
        }
    }

    // Step 2: Handle accessory type selection
    async handleTypeSelection(userInput) {
        const types = await this.getAllAccessoryTypes();
        const lowerInput = userInput.toLowerCase();
        
        const selectedType = types.data.find(type => 
            lowerInput.includes(type.description.toLowerCase())
        );
        
        if (selectedType) {
            this.conversationState.selectedType = selectedType.description;
            this.conversationState.selectedTypeId = selectedType.id;
            this.conversationState.currentStep = 'subtype_selection';
            
            // Get subtypes and filter by selected type
            const subtypes = await this.getRelevantSubTypes(selectedType.description);
            
            return {
                success: true,
                step: 'subtype_selection',
                message: `Perfect! You selected ${selectedType.description} for ${this.conversationState.selectedModel.toUpperCase()}. Now choose a specific category:`,
                selectedModel: this.conversationState.selectedModel,
                selectedType: selectedType.description,
                availableSubTypes: subtypes,
                nextAction: "Please select a subcategory from the list above"
            };
        } else {
            const availableTypes = types.data.map(type => type.description);
            return {
                success: false,
                step: 'type_selection',
                message: "Please select a valid accessory type:",
                availableTypes: availableTypes,
                nextAction: "Please say one of the type names listed above"
            };
        }
    }

    // Step 3: Handle subtype selection and show final results
    async handleSubTypeSelection(userInput) {
        const subtypes = await this.getAllSubTypes();
        const lowerInput = userInput.toLowerCase();
        
        const selectedSubType = subtypes.data.find(subtype => 
            lowerInput.includes(subtype.description.toLowerCase())
        );
        
        if (selectedSubType) {
            this.conversationState.selectedSubType = selectedSubType.description;
            this.conversationState.selectedSubTypeId = selectedSubType.id;
            this.conversationState.currentStep = 'show_results';
            
            // Get model accessories and filter by type and subtype
            const accessories = await this.getFilteredAccessories();
            
            return {
                success: true,
                step: 'show_results',
                message: `Excellent! Here are the ${selectedSubType.description} accessories in ${this.conversationState.selectedType} category for ${this.conversationState.selectedModel.toUpperCase()}:`,
                selectedModel: this.conversationState.selectedModel,
                selectedType: this.conversationState.selectedType,
                selectedSubType: selectedSubType.description,
                accessories: accessories,
                nextAction: "You can ask for more details about any accessory or start over with a new search"
            };
        } else {
            const relevantSubtypes = await this.getRelevantSubTypes(this.conversationState.selectedType);
            return {
                success: false,
                step: 'subtype_selection',
                message: "Please select a valid subcategory:",
                availableSubTypes: relevantSubtypes,
                nextAction: "Please say one of the subcategory names listed above"
            };
        }
    }

    // Get relevant subtypes based on selected type
    async getRelevantSubTypes(selectedType) {
        try {
            // Get model accessories to see which subtypes are actually available
            const modelData = await this.getAccessoriesByModel(this.conversationState.selectedModel);
            
            // Filter accessories by selected type
            const typeFilteredAccessories = modelData.data.filter(acc => 
                acc.type && acc.type.toLowerCase() === selectedType.toLowerCase()
            );
            
            // Extract unique subtypes from filtered accessories
            const uniqueSubTypes = [...new Set(typeFilteredAccessories.map(acc => acc.subType))];
            
            return uniqueSubTypes.filter(subType => subType).map(subType => ({
                name: subType,
                count: typeFilteredAccessories.filter(acc => acc.subType === subType).length
            }));
        } catch (error) {
            console.error('Error getting relevant subtypes:', error);
            return [];
        }
    }

    // Get filtered accessories based on conversation state
    async getFilteredAccessories() {
        try {
            const modelData = await this.getAccessoriesByModel(this.conversationState.selectedModel);
            
            let filteredAccessories = modelData.data;
            
            // Filter by type
            if (this.conversationState.selectedType) {
                filteredAccessories = filteredAccessories.filter(acc => 
                    acc.type && acc.type.toLowerCase() === this.conversationState.selectedType.toLowerCase()
                );
            }
            
            // Filter by subtype
            if (this.conversationState.selectedSubType) {
                filteredAccessories = filteredAccessories.filter(acc => 
                    acc.subType && acc.subType.toLowerCase() === this.conversationState.selectedSubType.toLowerCase()
                );
            }
            
            return filteredAccessories.map(acc => ({
                id: acc.id,
                name: acc.accessoryName,
                code: acc.accessoryCode,
                price: acc.mrp,
                type: acc.type,
                subType: acc.subType,
                description: acc.body ? acc.body.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : 'No description available'
            }));
        } catch (error) {
            console.error('Error getting filtered accessories:', error);
            return [];
        }
    }

    // Reset conversation state
    resetConversation() {
        this.conversationState = {
            selectedModel: null,
            selectedModelId: null,
            selectedType: null,
            selectedTypeId: null,
            selectedSubType: null,
            selectedSubTypeId: null,
            currentStep: 'model_selection'
        };
    }

    // API methods
    async getAllAccessoryTypes() {
        try {
            const response = await this.axiosInstance.get('/service/accessories/getAllTypes');
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            throw new Error(`Failed to fetch accessory types: ${error.message}`);
        }
    }

    async getAllSubTypes() {
        try {
            const response = await this.axiosInstance.get('/service/accessories/getAllSubTypes');
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            throw new Error(`Failed to fetch accessory subtypes: ${error.message}`);
        }
    }

    async getAccessoriesByModel(modelName, year = 2024) {
        try {
            const modelId = this.modelMappings[modelName.toLowerCase()];
            if (!modelId) {
                throw new Error(`Model '${modelName}' not supported`);
            }

            const response = await this.axiosInstance.get(`/service/accessories/getByModelIdYear?modelId=${modelId}&year=${year}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            throw new Error(`Failed to fetch accessories for ${modelName}: ${error.message}`);
        }
    }
}

const apiService = new HyundaiConversationalAPIService('https://api.hyundaimobisin.com');

const server = new Server(
    {
        name: 'hyundai-conversational-flow',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Tool definitions for conversational flow
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'conversational_flow',
                description: 'Handle step-by-step conversational flow for accessory selection',
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
                name: 'get_conversation_state',
                description: 'Get current conversation state and next steps',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            }
        ],
    };
});

// Tool call handler for conversational flow
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result;
        
        switch (name) {
            case 'conversational_flow':
                result = await handleConversationalFlow(args.userInput, args.action);
                break;
                
            case 'get_conversation_state':
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

// Main conversational flow handler
async function handleConversationalFlow(userInput, action = 'continue') {
    try {
        if (action === 'reset' || action === 'start') {
            apiService.resetConversation();
        }

        const currentStep = apiService.conversationState.currentStep;
        
        switch (currentStep) {
            case 'model_selection':
                return await apiService.handleModelSelection(userInput);
                
            case 'type_selection':
                return await apiService.handleTypeSelection(userInput);
                
            case 'subtype_selection':
                return await apiService.handleSubTypeSelection(userInput);
                
            case 'show_results':
                // Handle follow-up questions or restart
                if (userInput.toLowerCase().includes('start over') || userInput.toLowerCase().includes('new search')) {
                    apiService.resetConversation();
                    return {
                        success: true,
                        step: 'model_selection',
                        message: "Let's start fresh! Which Hyundai model are you interested in?",
                        availableModels: Object.keys(apiService.modelMappings).map(model => model.toUpperCase()),
                        nextAction: "Please say the car model name"
                    };
                } else {
                    return {
                        success: true,
                        step: 'show_results',
                        message: "I can help you with more details or you can start a new search. What would you like to do?",
                        options: [
                            "Start over with a new model",
                            "Ask for more details about specific accessories",
                            "Search for different accessory types"
                        ]
                    };
                }
                
            default:
                apiService.resetConversation();
                return {
                    success: true,
                    step: 'model_selection',
                    message: "Welcome! Let's find the perfect accessories for your Hyundai. Which model do you have?",
                    availableModels: Object.keys(apiService.modelMappings).map(model => model.toUpperCase()),
                    nextAction: "Please say the car model name (e.g., 'i20', 'Creta', 'Alcazar')"
                };
        }
    } catch (error) {
        throw new Error(`Conversational flow error: ${error.message}`);
    }
}

// Get next step instructions
function getNextStepInstructions() {
    const currentStep = apiService.conversationState.currentStep;
    
    const instructions = {
        'model_selection': 'User should specify their Hyundai model name',
        'type_selection': 'User should choose from available accessory types',
        'subtype_selection': 'User should select a specific subcategory',
        'show_results': 'User can ask for details or start over'
    };
    
    return instructions[currentStep] || 'Unknown step';
}

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Hyundai Conversational Flow MCP Server started successfully');
}

main().catch((error) => {
    console.error('❌ Server startup error:', error);
    process.exit(1);
});

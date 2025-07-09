const axios = require('axios');
const { spawn } = require('child_process');

class MCPIntegrationService {
    constructor() {
        this.serverProcess = null;
        this.isConnected = false;
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

    async startMCPServer() {
        try {
            this.serverProcess = spawn('node', ['mcp-server.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    API_BASE_URL: 'https://api.hyundaimobisin.com'
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.log(`MCP Server: ${data}`);
            });

            this.isConnected = true;
            console.log('✅ MCP Server started successfully');
            return true;
        } catch (error) {
            console.error('❌ MCP Server start failed:', error);
            this.isConnected = false;
            return false;
        }
    }

    async callMCPTool(toolName, params = {}) {
        try {
            const userInput = params.userInput || '';
            return await this.handleConversationFlow(userInput);
        } catch (error) {
            console.error(`❌ MCP Tool call failed for ${toolName}:`, error);
            throw error;
        }
    }

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
        const models = ['i20', 'creta', 'alcazar', 'venue', 'aura', 'nios'];
        const lowerInput = userInput.toLowerCase();
        
        const selectedModel = models.find(model => lowerInput.includes(model));
        const yearMatch = userInput.match(/20\d{2}/);
        const selectedYear = yearMatch ? parseInt(yearMatch[0]) : 2024;
        
        if (selectedModel) {
            this.conversationState.selectedModel = selectedModel;
            this.conversationState.selectedYear = selectedYear;
            this.conversationState.currentStep = 'type_selection';
            
            try {
                // Fetch LIVE accessories data from Hyundai API
                const accessories = await this.fetchLiveAccessories(selectedModel, selectedYear);
                this.conversationState.allAccessories = accessories;
                this.conversationState.availableTypes = this.extractTypes(accessories);
                
                return {
                    success: true,
                    step: 'type_selection',
                    message: `Perfect! You selected ${selectedModel.toUpperCase()} (${selectedYear}). I found ${accessories.length} accessories. Please choose an accessory type:`,
                    selectedModel: selectedModel,
                    selectedYear: selectedYear,
                    totalAccessories: accessories.length,
                    availableTypes: this.conversationState.availableTypes,
                    nextAction: "Please select a type: Interiors, Exteriors, Electronics, or Common"
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Sorry, I couldn't fetch accessories for ${selectedModel}. Please try again.`,
                    error: error.message
                };
            }
        } else {
            return {
                success: false,
                step: 'model_selection',
                message: "Please specify a valid Hyundai model. Available models are:",
                availableModels: models.map(m => m.toUpperCase()),
                nextAction: "Please say the car model name and year (e.g., 'i20 2024', 'Creta 2018')"
            };
        }
    }

    async handleTypeSelection(userInput) {
        const lowerInput = userInput.toLowerCase();
        const selectedType = this.conversationState.availableTypes.find(type => 
            lowerInput.includes(type.name.toLowerCase())
        );
        
        if (selectedType) {
            this.conversationState.selectedType = selectedType.name;
            this.conversationState.currentStep = 'subtype_selection';
            
            // Filter accessories by type and extract subtypes
            const typeAccessories = this.conversationState.allAccessories.filter(acc => 
                acc.type && acc.type.toLowerCase() === selectedType.name.toLowerCase()
            );
            
            this.conversationState.availableSubTypes = this.extractSubTypes(typeAccessories);
            
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
            // Filter final accessories
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
                    description: acc.body ? acc.body.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : 'No description available',
                    image: acc.image,
                    imageUrl: `https://hyundaimobisin.com/images/accessories/${acc.image}`
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

    // LIVE DATA FETCHING - This is the key fix
    async fetchLiveAccessories(modelName, year) {
        const modelMappings = {
            'alcazar': 34, 'i20': 35, 'creta': 36,
            'venue': 37, 'aura': 38, 'nios': 39
        };
        
        const modelId = modelMappings[modelName.toLowerCase()];
        console.log(`🔄 Fetching LIVE data for ${modelName} (${year}) - Model ID: ${modelId}`);
        
        const response = await axios.get(
            `https://api.hyundaimobisin.com/service/accessories/getByModelIdYear?modelId=${modelId}&year=${year}`
        );
        
        console.log(`✅ Fetched ${response.data.length} accessories from live API`);
        return response.data;
    }

    extractTypes(accessories) {
        const typesMap = new Map();
        accessories.forEach(acc => {
            if (acc.type) {
                if (!typesMap.has(acc.type)) {
                    typesMap.set(acc.type, { name: acc.type, count: 0 });
                }
                typesMap.get(acc.type).count++;
            }
        });
        return Array.from(typesMap.values()).sort((a, b) => b.count - a.count);
    }

    extractSubTypes(accessories) {
        const subTypesMap = new Map();
        accessories.forEach(acc => {
            if (acc.subType) {
                if (!subTypesMap.has(acc.subType)) {
                    subTypesMap.set(acc.subType, { name: acc.subType, count: 0 });
                }
                subTypesMap.get(acc.subType).count++;
            }
        });
        return Array.from(subTypesMap.values()).sort((a, b) => b.count - a.count);
    }

    async disconnect() {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.isConnected = false;
        }
    }
}

module.exports = MCPIntegrationService;

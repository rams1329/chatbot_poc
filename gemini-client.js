const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class GeminiClient {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
        });
        this.conversationHistory = [];
    }

    async initializeConversation() {
        const systemPrompt = `You are a helpful assistant for Hyundai Mobis accessories. 
        You help users navigate through:
        - Models: i20, Creta, Alcazar, Venue, Aura, Nios
        - Categories: Interiors, Exteriors, Electronics, Common
        - Complete product details with pricing and descriptions
        
        Guide users through the step-by-step process: model selection → type selection → subtype selection → products.`;

        this.conversationHistory = [{
            role: 'user',
            parts: [{ text: systemPrompt }]
        }, {
            role: 'model',
            parts: [{ text: 'I understand. I\'m ready to help users find Hyundai accessories through our conversational flow.' }]
        }];
    }

async sendMessage(userMessage, mcpData = null) {
    try {
        let enhancedMessage = userMessage;
        
        if (mcpData) {
            enhancedMessage = `User query: "${userMessage}"

Real-time data from Hyundai Mobis API:
${JSON.stringify(mcpData, null, 2)}

Please provide a helpful response based on this live data and guide the user to the next step.`;
        }

        const chat = this.model.startChat({
            history: this.conversationHistory
        });

        const result = await chat.sendMessage(enhancedMessage);
        const response = result.response.text();

        // Update conversation history
        this.conversationHistory.push({
            role: 'user',
            parts: [{ text: enhancedMessage }]
        });
        this.conversationHistory.push({
            role: 'model',
            parts: [{ text: response }]
        });

        return response;
    } catch (error) {
        console.error('Gemini API Error Details:', error);
        
        if (error.message.includes('API key not valid')) {
            throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY');
        } else if (error.message.includes('quota exceeded')) {
            throw new Error('Gemini API quota exceeded. Please check your usage limits');
        } else if (error.message.includes('PERMISSION_DENIED')) {
            throw new Error('API key lacks required permissions. Enable Generative Language API in Google Cloud Console');
        } else {
            throw new Error(`Gemini API error: ${error.message}`);
        }
    }
}


    analyzeForMCPAction(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        
        const models = ['i20', 'creta', 'alcazar', 'venue', 'aura', 'nios'];
        const mentionedModel = models.find(model => lowerMessage.includes(model));
        
        const yearMatch = userMessage.match(/20\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : 2024;
        
        if (mentionedModel || lowerMessage.includes('accessories') || lowerMessage.includes('type')) {
            return {
                action: 'continue_conversation',
                tool: 'streamlined_conversation',
                params: {
                    userInput: userMessage,
                    action: 'continue'
                }
            };
        }
        
        return {
            action: 'continue_conversation',
            tool: 'streamlined_conversation',
            params: {
                userInput: userMessage,
                action: 'continue'
            }
        };
    }

    resetConversation() {
        this.conversationHistory = [];
        this.initializeConversation();
    }
}

module.exports = GeminiClient;

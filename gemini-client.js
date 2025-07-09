const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class GeminiClient {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }
        
        if (!apiKey.startsWith('AIza')) {
            throw new Error('Invalid Gemini API key format. Should start with "AIza"');
        }
        
        console.log(`Using API key: ${apiKey.substring(0, 10)}...`);
        
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ 
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
        });
        this.conversationHistory = [];
    }

    async initializeConversation() {
        const systemPrompt = `You are a helpful assistant for Hyundai Mobis accessories. 
        You help users navigate through:
        - Models: i20, Creta, Alcazar, Venue, Aura, Nios (focusing on 2018+ years)
        - Categories: Interiors, Exteriors, Electronics, Common
        - Complete product details with pricing and descriptions
        
        Guide users through the step-by-step process: model selection → type selection → subtype selection → products.
        
        When no accessories are found for a specific model/year, provide helpful alternatives.
        Always be helpful and provide clear next steps for users.`;

        this.conversationHistory = [{
            role: 'user',
            parts: [{ text: systemPrompt }]
        }, {
            role: 'model',
            parts: [{ text: 'I understand. I\'m ready to help users find Hyundai accessories through our dynamic conversational flow, with special focus on 2018+ model years.' }]
        }];
    }

    async sendMessage(userMessage, mcpData = null) {
        try {
            let enhancedMessage = userMessage;
            
            if (mcpData) {
                if (mcpData.isOffline) {
                    enhancedMessage = `User query: "${userMessage}"
                    
The Hyundai Mobis API is currently unavailable:
${JSON.stringify(mcpData, null, 2)}

Please provide a helpful response acknowledging the service is temporarily unavailable.`;
                } else if (mcpData.isEmpty) {
                    enhancedMessage = `User query: "${userMessage}"

No accessories found for the requested model/year combination:
${JSON.stringify(mcpData, null, 2)}

Please provide a helpful response explaining why no accessories were found and suggest alternatives from the available years.`;
                } else {
                    enhancedMessage = `User query: "${userMessage}"

Real-time data from Hyundai Mobis API:
${JSON.stringify(mcpData, null, 2)}

Please provide a helpful response based on this live data and guide the user to the next step.`;
                }
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
                throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY in .env file');
            } else if (error.message.includes('quota exceeded')) {
                throw new Error('Gemini API quota exceeded. Please check your usage limits');
            } else {
                throw new Error(`Gemini API error: ${error.message}`);
            }
        }
    }

    resetConversation() {
        this.conversationHistory = [];
        this.initializeConversation();
    }
}

module.exports = GeminiClient;

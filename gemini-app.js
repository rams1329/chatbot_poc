const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const GeminiClient = require('./gemini-client');
const MCPIntegrationService = require('./mcp-integration');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize services
const geminiClient = new GeminiClient();
const mcpService = new MCPIntegrationService();

// Initialize application
async function initializeApp() {
    try {
        console.log('🚀 Initializing Gemini-powered Hyundai Accessories App...');
        
        await geminiClient.initializeConversation();
        console.log('✅ Gemini client initialized');
        
        await mcpService.startMCPServer();
        console.log('✅ MCP server started');
        
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

        // Analyze message for MCP action
        const mcpAction = geminiClient.analyzeForMCPAction(message);
        
        let mcpData = null;
        let usedTool = null;

        // Call MCP server if needed
        if (mcpAction.action !== 'no_action') {
            try {
                mcpData = await mcpService.callMCPTool(
                    mcpAction.tool, 
                    mcpAction.params
                );
                usedTool = mcpAction.tool;
                console.log(`🔧 Used MCP tool: ${usedTool}`);
            } catch (mcpError) {
                console.warn('⚠️ MCP call failed, continuing with Gemini only:', mcpError.message);
            }
        }

        // Get Gemini response
        const geminiResponse = await geminiClient.sendMessage(message, mcpData);

        res.json({
            success: true,
            response: geminiResponse,
            usedTool: usedTool,
            hasLiveData: !!mcpData,
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
            mcp: mcpService.isConnected
        },
        timestamp: new Date().toISOString()
    });
});

// Reset conversation endpoint
app.post('/api/reset', async (req, res) => {
    try {
        geminiClient.resetConversation();
        await geminiClient.initializeConversation();
        
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

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    await mcpService.disconnect();
    process.exit(0);
});

// Start server
app.listen(PORT, async () => {
    console.log('🚀 ================================');
    console.log('🤖 Gemini-Powered Hyundai Assistant');
    console.log('🚀 ================================');
    console.log(`📡 Server running on port: ${PORT}`);
    console.log(`🌐 Web UI: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    console.log('🚀 ================================');
    
    await initializeApp();
});

# Hyundai Mobis Accessories MCP Server Instructions

## Overview
This MCP server provides real-time access to Hyundai Mobis India accessories data through live API calls to https://api.hyundaimobisin.com.

## Live API Endpoints Available
- `/service/accessories/getAllTypes` - Get all accessory categories
- `/service/accessories/getAllSubTypes` - Get all accessory subcategories  
- `/service/accessories/getByModelIdYear` - Get accessories by model and year
- `/service/accessories/getStates` - Get available states
- `/service/accessories/getDistributorStates` - Get distributor states

## Supported Models
- Alcazar (Model ID: 34)
- i20 (Model ID: 27)
- Cretaev (Model ID: 35)
- Venue (Model ID: 37)
- Aura (Model ID: 38)
- Nios (Model ID: 39)

## Available MCP Tools
1. **get_accessory_types** - Returns live accessory categories
2. **get_accessory_subtypes** - Returns live accessory subcategories
3. **get_model_accessories** - Returns live accessories for specific model
4. **search_accessories** - Searches through live accessory data
5. **get_model_info** - Returns comprehensive model information
6. **get_states** - Returns live states data
7. **get_distributor_states** - Returns live distributor states
8. **validate_context** - Validates if query is related to Hyundai accessories

## Context Restrictions
This server only responds to queries related to:
- Hyundai vehicles and accessories
- Mobis parts and components
- Car accessories and genuine parts
- Supported models: i20, Creta, Alcazar, Venue, Aura, Nios

## Data Source
All data is fetched live from Hyundai Mobis India API with no mock or cached responses.

## Usage Examples
- "What accessories are available for i20?"
- "Show me all accessory types"
- "Search for chrome accessories"
- "Which states have Hyundai accessories?"
- "Get Creta accessories for 2024"

## Error Handling
If APIs are unavailable, the server will return appropriate error messages without falling back to mock data.

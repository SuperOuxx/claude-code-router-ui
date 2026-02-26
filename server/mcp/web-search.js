
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod"; // Wait, do I have zod installed? Yes, likely since it's a common dep.
// Checking package.json... zod is listed locally in node_modules/zod in the `list_dir` output previously.
// But better check package.json explicitly or assume it's installed. 
// Ah, `list_dir node_modules` showed `zod`. Good.

// BUT wait, @modelcontextprotocol/sdk might use Zod internally but do I need to import it?
// The example usage usually involves defining schemas.

import { searchWeb } from '../utils/webSearch.js';

// Initialize the server
const server = new Server(
    {
        name: "web-search",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "search_web",
                description: "Search the web for information using Tencent Cloud Search and Rerank with Bocha AI.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query",
                        },
                    },
                    required: ["query"],
                },
            },
        ],
    };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "search_web") {
        const query = request.params.arguments?.query;

        if (typeof query !== 'string') {
            throw new Error("Query must be a string");
        }

        try {
            const result = await searchWeb(query);
            return {
                content: [
                    {
                        type: "text",
                        text: result.summary + "\n\nSources:\n" + result.results.map(r => `- [${r.title}](${r.url})`).join("\n")
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error searching web: ${error.message}`
                    }
                ],
                isError: true,
            };
        }
    }

    throw new Error("Tool not found");
});

// Start the server using stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr because stdout is used for JSON-RPC
console.error("Web Search MCP Server running on stdio");

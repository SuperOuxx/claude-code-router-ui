
import { configureWebSearchMCP } from '../server/utils/mcpAutoConfig.js';

console.log('Testing MCP Auto-Config...');
configureWebSearchMCP().then(() => {
    console.log('Done.');
}).catch(err => {
    console.error('Failed:', err);
});


import '../server/load-env.js'; // This assumes load-env.js is in server/ and we are in scripts/
// Actually, load-env.js is likely in server/ based on previous view_file.
// Wait, view_file of server/index.js showed `import './load-env.js';`.
// file listing of server/ showed `load-env.js`.
// So from scripts/, it should be `../server/load-env.js`.

import { searchWeb } from '../server/utils/webSearch.js';

async function test() {
    console.log('Testing searchWeb...');
    const query = "使用sharding-jdbc进行分库分表，如何结合用户ID(user_id)和时间范围进行分片";
    try {
        const result = await searchWeb(query);
        console.log('Search Result Summary:', result.summary);
        console.log('Search Result Count:', result.results.length);

        if (result.results.length > 0) {
            console.log('First Result:', result.results[0]);
        }
    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
}

test();

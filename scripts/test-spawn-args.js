import spawn from 'cross-spawn';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.join(__dirname, 'dummy-target.js');
const node = process.execPath;

function test(name, arg) {
    console.log(`--- Test: ${name} ---`);
    console.log(`Sending arg length: ${arg.length}`);
    const child = spawn.sync(node, [target, arg], { encoding: 'utf8' });
    if (child.error) {
        console.error('Spawn error:', child.error);
    } else {
        console.log(`Target received: ${child.stdout.trim()}`);
    }
}

console.log('Testing cross-spawn argument passing on Windows...');

const multilineString = `Line 1
Line 2
Line 3`;

const complexString = `Start
"Quote"
End`;

// Test cases
test('Multiline Raw', multilineString);
test('Complex Multiline Raw', complexString);

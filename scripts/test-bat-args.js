import spawn from 'cross-spawn';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.join(__dirname, 'dummy.bat');

function test(name, arg) {
    console.log(`--- Test: ${name} ---`);
    console.log(`Sending arg: [${arg}]`);
    try {
        // Imitate the full call: -p ARG --output-format...
        const args = ['-p', arg, '--output-format=json'];
        const child = spawn.sync(target, args, { encoding: 'utf8' });
        if (child.error) {
            console.error('Spawn error:', child.error);
        } else {
            console.log(`Target stdout: ${child.stdout.trim()}`);
            // Simple check: did the target see "-p" as one arg and the ARG as the next?
            // Note: dummy.bat calls dummy-target.js which uses node's processing.
            // process.argv in node will show us how node parsed it.
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}

console.log('Testing parsing of flag-like arguments...');

const dashArg = '--help';
const dashArgWithSpace = '--help me';
const doubleDash = '--';

test('Flag-like arg (--help)', dashArg);
test('Flag-like arg with space (--help me)', dashArgWithSpace);
test('Double dash only (--)', doubleDash);

// Test Manual Fix: Leading Space
test('Fixed with Leading Space ( --help)', ' ' + dashArg);

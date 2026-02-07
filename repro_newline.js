import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';

const testArg = "Line 1\nLine 2";
console.log("Original argument:", JSON.stringify(testArg));

// We'll simulate what the UI does: call a command with -p "Line 1\nLine 2"
// Since sec-ccr might not be in the environment here easily, we'll use a simple node script.

import fs from 'fs';
fs.writeFileSync('echo_args.js', `
console.log("Arguments received:");
process.argv.forEach((val, index) => {
  console.log(\`\${index}: \${JSON.stringify(val)}\`);
});
`);

console.log("\n--- Testing with spawn(shell: false) ---");
const child1 = crossSpawn('node', ['echo_args.js', '-p', testArg]);
child1.stdout.on('data', (d) => process.stdout.write(d));

setTimeout(() => {
    console.log("\n--- Testing with spawn(shell: true) ---");
    const child2 = crossSpawn('node', ['echo_args.js', '-p', testArg], { shell: true });
    child2.stdout.on('data', (d) => process.stdout.write(d));
}, 1000);

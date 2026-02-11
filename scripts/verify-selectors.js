import fs from 'fs';
import path from 'path';
import os from 'os';
import { userDb } from '../server/database/db.js';
import { generateToken } from '../server/middleware/auth.js';

const BASE_URL = 'http://localhost:3001/api';

async function getAuthToken() {
    try {
        // Try to get the first user
        const user = userDb.getFirstUser();
        if (!user) {
            console.error('No users found in database. Cannot generate token.');
            return null;
        }
        console.log(`Generating token for user: ${user.username}`);
        return generateToken(user);
    } catch (error) {
        console.error('Error generating token:', error);
        return null;
    }
}

async function verifyAgents(token) {
    console.log('Verifying Agents...');
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Verify default (claude) agents
    try {
        const res = await fetch(`${BASE_URL}/agents`, { headers });
        if (!res.ok) {
            console.error(`Failed to fetch default agents: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response body:', text);
            return;
        }
        const data = await res.json();
        if (data.agents) {
            console.log('Default agents count:', data.agents.length);
            if (data.agents.length > 0) {
                console.log('First default agent:', data.agents[0].name);
            }
        } else {
            console.error('data.agents is missing!');
        }
    } catch (error) {
        console.error('Failed to fetch default agents:', error.message);
    }

    // 2. Verify codex agents
    // First ensure .codex/agents exists or create a test one
    const codexAgentsDir = path.join(process.cwd(), '.codex', 'agents');
    if (!fs.existsSync(codexAgentsDir)) {
        console.log('Creating .codex/agents for testing...');
        fs.mkdirSync(codexAgentsDir, { recursive: true });
    }

    const testAgentPath = path.join(codexAgentsDir, 'test-codex-agent.md');
    fs.writeFileSync(testAgentPath, '---\nname: Test Codex Agent\n---\n\nTest content');

    try {
        const res = await fetch(`${BASE_URL}/agents?provider=codex`, { headers });
        if (!res.ok) {
            console.error(`Failed to fetch codex agents: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response body:', text);
            return;
        }
        const data = await res.json();
        if (data.agents) {
            console.log('Codex agents count:', data.agents.length);
            const found = data.agents.find(a => a.name === 'Test Codex Agent');
            if (found) {
                console.log('✅ Found Test Codex Agent!');
            } else {
                console.error('❌ Test Codex Agent NOT found!');
            }
        } else {
            console.error('data.agents is missing!');
        }
    } catch (error) {
        console.error('Failed to fetch codex agents:', error.message);
    }

    // Cleanup
    if (fs.existsSync(testAgentPath)) {
        fs.unlinkSync(testAgentPath);
    }
}

async function verifySkills(token) {
    console.log('\nVerifying Skills...');
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Create a dummy skill in HOME/.agents/skills
    const homeAgentsSkillsDir = path.join(os.homedir(), '.agents', 'skills');
    const skillName = 'test-skill-chinese';
    const skillDir = path.join(homeAgentsSkillsDir, skillName);

    if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
    }

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillMdPath, '---\nchinese: 测试中文技能名\n---\n');

    try {
        const res = await fetch(`${BASE_URL}/skills?provider=claude`, { headers });
        if (!res.ok) {
            console.error(`Failed to fetch skills: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response body:', text);
            return;
        }
        const data = await res.json();
        if (data.skills) {
            console.log('Skills count:', data.skills.length);

            // Find skill by value (folder name)
            const found = data.skills.find(s => s.value === skillName);

            if (found) {
                console.log(`Found skill: ${found.name} (value: ${found.value})`);
                if (found.name === '测试中文技能名') {
                    console.log('✅ Chinese name correctly displayed!');
                } else {
                    console.error(`❌ Expected "测试中文技能名", got "${found.name}"`);
                }
            } else {
                console.error(`❌ Skill "${skillName}" NOT found!`);
                // List all skills to see what we got
                //  console.log('Available skills:', data.skills.map(s => `${s.name} (${s.value})`).join(', '));
            }
        } else {
            console.error('data.skills is missing!');
        }

    } catch (error) {
        console.error('Failed to fetch skills:', error.message);
    }

    // Cleanup
    if (fs.existsSync(skillMdPath)) fs.unlinkSync(skillMdPath);
    if (fs.existsSync(skillDir)) fs.rmdirSync(skillDir);
}

async function run() {
    const token = await getAuthToken();
    if (token) {
        await verifyAgents(token);
        await verifySkills(token);
    }
}

run();

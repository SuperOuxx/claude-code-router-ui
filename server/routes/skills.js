import express from 'express';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const router = express.Router();

/**
 * GET /api/skills?projectPath=...&provider=...
 *
 * 获取所有可用的 skills 列表
 * 根据 provider 搜索不同目录：
 *   - codex: HOME/.codex/skills/ + {projectPath}/.codex/skills/
 *   - claude / claude-official: HOME/.claude/skills/ + {projectPath}/.claude/skills/
 * 读取非隐藏文件夹名（只一层），返回 { skills: [{ name, source }] }
 */
router.get('/', async (req, res) => {
    try {
        const { projectPath, provider } = req.query;
        const skillsMap = new Map(); // name -> { name, source }

        // Determine config directory name based on provider
        const configDir = (provider === 'claude' || provider === 'claude-official')
            ? '.claude'
            : '.codex';

        // Helper: read non-hidden directory names (one level) from a given dir
        const readSkillDirs = async (dir, source) => {
            try {
                await fs.access(dir);
            } catch {
                return; // directory doesn't exist, skip
            }

            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    skillsMap.set(entry.name, { name: entry.name, source });
                }
            }
        };

        // 1. Read global skills: HOME/{configDir}/skills/
        const globalSkillsDir = path.join(os.homedir(), configDir, 'skills');
        await readSkillDirs(globalSkillsDir, 'global');

        // 2. Read project skills: {projectPath}/{configDir}/skills/
        if (projectPath) {
            const projectSkillsDir = path.join(projectPath, configDir, 'skills');
            await readSkillDirs(projectSkillsDir, 'project'); // project overrides global
        }

        // Convert map to sorted array
        const skills = Array.from(skillsMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        res.json({ skills });
    } catch (error) {
        console.error('Error fetching skills:', error);
        res.status(500).json({ error: 'Failed to fetch skills' });
    }
});

export default router;

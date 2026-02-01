import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';

const router = express.Router();

/**
 * GET /api/agents
 *
 * 获取所有可用的 agents 列表
 * 读取 .claude/agents 目录下的所有 .md 文件，提取 frontmatter 中的 name 字段
 */
router.get('/', async (req, res) => {
  try {
    const agentsDir = path.join(process.cwd(), '.claude', 'agents');

    // 确保目录存在
    try {
      await fs.access(agentsDir);
    } catch (error) {
      return res.json({ agents: [] });
    }

    // 读取目录下的所有文件
    const files = await fs.readdir(agentsDir);
    const mdFiles = files.filter(file => file.endsWith('.md') && file !== 'README.md');

    const agents = [];

    for (const file of mdFiles) {
      try {
        const filePath = path.join(agentsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');

        // 提取 frontmatter 中的 name 字段
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          agents.push({
            name: name,
            file: file
          });
        }
      } catch (error) {
        console.error(`Error reading agent file ${file}:`, error);
      }
    }

    res.json({ agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

export default router;

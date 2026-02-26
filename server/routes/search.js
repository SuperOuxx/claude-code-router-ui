
import express from 'express';
import { searchWeb } from '../utils/webSearch.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const result = await searchWeb(query);
        res.json(result);
    } catch (error) {
        console.error('Search API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;

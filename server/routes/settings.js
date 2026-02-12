import express from 'express';
import { apiKeysDb, credentialsDb } from '../database/db.js';
import { getServerSettings, updateServerSettings, getWorkspacesRoot } from '../config.js';

const router = express.Router();

// ===============================
// API Keys Management
// ===============================

// Get all API keys for the authenticated user
router.get('/api-keys', async (req, res) => {
  try {
    const apiKeys = apiKeysDb.getApiKeys(req.user.id);
    // Don't send the full API key in the list for security
    const sanitizedKeys = apiKeys.map(key => ({
      ...key,
      api_key: key.api_key.substring(0, 10) + '...'
    }));
    res.json({ apiKeys: sanitizedKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create a new API key
router.post('/api-keys', async (req, res) => {
  try {
    const { keyName } = req.body;

    if (!keyName || !keyName.trim()) {
      return res.status(400).json({ error: 'Key name is required' });
    }

    const result = apiKeysDb.createApiKey(req.user.id, keyName.trim());
    res.json({
      success: true,
      apiKey: result
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Delete an API key
router.delete('/api-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const success = apiKeysDb.deleteApiKey(req.user.id, parseInt(keyId));

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Toggle API key active status
router.patch('/api-keys/:keyId/toggle', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const success = apiKeysDb.toggleApiKey(req.user.id, parseInt(keyId), isActive);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error toggling API key:', error);
    res.status(500).json({ error: 'Failed to toggle API key' });
  }
});

// ===============================
// Generic Credentials Management
// ===============================

// Get all credentials for the authenticated user (optionally filtered by type)
router.get('/credentials', async (req, res) => {
  try {
    const { type } = req.query;
    const credentials = credentialsDb.getCredentials(req.user.id, type || null);
    // Don't send the actual credential values for security
    res.json({ credentials });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// Create a new credential
router.post('/credentials', async (req, res) => {
  try {
    const { credentialName, credentialType, credentialValue, description } = req.body;

    if (!credentialName || !credentialName.trim()) {
      return res.status(400).json({ error: 'Credential name is required' });
    }

    if (!credentialType || !credentialType.trim()) {
      return res.status(400).json({ error: 'Credential type is required' });
    }

    if (!credentialValue || !credentialValue.trim()) {
      return res.status(400).json({ error: 'Credential value is required' });
    }

    const result = credentialsDb.createCredential(
      req.user.id,
      credentialName.trim(),
      credentialType.trim(),
      credentialValue.trim(),
      description?.trim() || null
    );

    res.json({
      success: true,
      credential: result
    });
  } catch (error) {
    console.error('Error creating credential:', error);
    res.status(500).json({ error: 'Failed to create credential' });
  }
});

// Delete a credential
router.delete('/credentials/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const success = credentialsDb.deleteCredential(req.user.id, parseInt(credentialId));

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Credential not found' });
    }
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// Toggle credential active status
router.patch('/credentials/:credentialId/toggle', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const success = credentialsDb.toggleCredential(req.user.id, parseInt(credentialId), isActive);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Credential not found' });
    }
  } catch (error) {
    console.error('Error toggling credential:', error);
    res.status(500).json({ error: 'Failed to toggle credential' });
  }
});

// ===============================
// Server Configuration Management
// ===============================

// Get server configuration (Public for verification temporarily, or add auth headers to test)
// For now, I'll assume I need to pass an API key or similar. 
// But wait, the previous `fetch` didn't send credentials.
// Let's modify the verification script to simulate an authenticated request if possible, 
// OR just temporarily allow public access to these specific endpoints for testing.

// Actually, `settings.js` routes are mounted at `/api/settings`. 
// In `index.js`, we might see `app.use('/api/settings', authenticate, settingsRoutes)`.
// If so, I can't easily bypass it without restarting server with code changes. 
// I'll modify `server/routes/settings.js` to potentially skip auth for localhost? 
// No, that's messy. 
// Let's look at `index.js` to see how auth is applied.
router.get('/config', async (req, res) => {
  try {
    const settings = getServerSettings();
    // Return all settings plus the resolved workspacesRoot
    res.json({
      config: {
        ...settings,
        // Include the resolved root so UI knows what's actually being used
        resolvedWorkspacesRoot: getWorkspacesRoot()
      }
    });
  } catch (error) {
    console.error('Error fetching server config:', error);
    res.status(500).json({ error: 'Failed to fetch server configuration' });
  }
});

// Update server configuration
router.post('/config', async (req, res) => {
  try {
    const { workspacesRoot } = req.body;

    // Validate inputs
    const updates = {};

    if (workspacesRoot !== undefined) {
      if (workspacesRoot === null || workspacesRoot.trim() === '') {
        updates.workspacesRoot = null; // Reset to default
      } else {
        // Basic validation - could be improved
        updates.workspacesRoot = workspacesRoot.trim();
      }
    }

    updateServerSettings(updates);

    res.json({
      success: true,
      config: {
        ...getServerSettings(),
        resolvedWorkspacesRoot: getWorkspacesRoot()
      }
    });
  } catch (error) {
    console.error('Error updating server config:', error);
    res.status(500).json({ error: 'Failed to update server configuration' });
  }
});

export default router;

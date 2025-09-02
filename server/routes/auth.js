const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getKeycloak } = require('../middleware/keycloak');

// Logout from all sessions for the current Keycloak user
router.post('/logout-all', async (req, res) => {
  try {
    const tokenContent = req.kauth?.grant?.access_token?.content;
    const keycloakUserId = tokenContent?.sub;
    if (!keycloakUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Admin token
    const adminResp = await axios.post(
      `${process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080'}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KEYCLOAK_ADMIN_USER || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const adminToken = adminResp.data.access_token;

    // Logout all sessions for user
    await axios.post(
      `${process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080'}/admin/realms/${process.env.KEYCLOAK_REALM || 'framesync'}/users/${keycloakUserId}/logout`,
      null,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    res.json({ message: 'Logged out from all sessions' });
  } catch (err) {
    console.error('Error during logout-all:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to logout all sessions' });
  }
});

module.exports = router;



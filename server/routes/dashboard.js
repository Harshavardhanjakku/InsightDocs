const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { validate: isUuid } = require('uuid');

// GET /dashboard/:keycloakId
router.get('/:keycloakId', async (req, res) => {
  const { keycloakId } = req.params;
  if (!keycloakId) return res.status(400).json({ error: 'Missing keycloakId' });

  try {
    // user
    const userRes = await pool.query('SELECT id, username, email FROM users WHERE keycloak_id = $1', [keycloakId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];

    // org memberships
    const orgsRes = await pool.query(`
      SELECT o.id, o.name, ou.role
      FROM organizations o
      JOIN organization_users ou ON o.id = ou.organization_id
      WHERE ou.user_id = $1
      ORDER BY ou.role = 'owner' DESC, o.created_at DESC
    `, [user.id]);

    // clients: derive from owner username convention client-<ownerUsername>
    const clients = orgsRes.rows.map(o => ({
      inferredClientId: `client-${user.username}`,
      organizationId: o.id,
      role: o.role
    }));

    res.json({
      organizationMemberships: orgsRes.rows,
      clients,
      roles: [...new Set(orgsRes.rows.map(o => o.role))]
    });
  } catch (err) {
    console.error('Error building dashboard:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;



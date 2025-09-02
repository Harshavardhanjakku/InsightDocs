const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(bodyParser.json());

// Mock data storage
const users = [];
const organizations = [];
const organizationInvites = [];
const organizationUsers = [];

// Keycloak configuration
const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'framesync';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

// Get Keycloak admin token
async function getAdminToken() {
  try {
    const response = await axios.post(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, 
      new URLSearchParams({
        grant_type: 'password',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        client_id: 'admin-cli'
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get admin token:', error.response?.data || error.message);
    throw error;
  }
}

// Create Keycloak client
async function createKeycloakClient(accessToken, username) {
  try {
    const clientId = `client-${username}`;
    const clientSecret = `${username}-secret-${Date.now()}`;

    const clientPayload = {
      clientId: clientId,
      enabled: true,
      protocol: 'openid-connect',
      secret: clientSecret,
      serviceAccountsEnabled: false,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: true,
      publicClient: false,
      redirectUris: ['*'],
      webOrigins: ['*'],
    };

    const response = await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/clients`,
      clientPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 201) {
      let clientUuid = null;
      if (response.headers.location) {
        const locationParts = response.headers.location.split('/');
        clientUuid = locationParts[locationParts.length - 1];
      }

      console.log('✅ Keycloak client created successfully:', {
        clientId: clientId,
        clientUuid: clientUuid,
        username: username,
      });

      return {
        clientId: clientId,
        clientUuid: clientUuid,
        clientSecret: clientSecret,
      };
    } else {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
  } catch (err) {
    console.error('❌ Failed to create Keycloak client:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      username: username,
    });
    throw err;
  }
}

// Create client roles
async function createClientRoles(accessToken, clientUuid) {
  const roles = ['owner', 'reviewer', 'viewer'];
  
  for (const roleName of roles) {
    try {
      await axios.post(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${clientUuid}/roles`,
        {
          name: roleName,
          description: `${roleName} role`,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ Client role '${roleName}' created for client ${clientUuid}`);
    } catch (err) {
      if (err?.response?.status === 409) {
        console.log(`ℹ️ Role '${roleName}' already exists for client ${clientUuid}`);
      } else {
        console.error(`❌ Failed to create client role '${roleName}':`, err?.response?.data || err.message);
      }
    }
  }
}

// Create Keycloak organization
async function createKeycloakOrganization(accessToken, orgName) {
  try {
    const domain = `${orgName}.org`;
    
    const orgResponse = await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/organizations`,
      { name: orgName, domains: [domain] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (orgResponse.status === 201) {
      let kcOrgId = null;
      if (orgResponse.data && orgResponse.data.id) {
        kcOrgId = orgResponse.data.id;
      } else if (orgResponse.headers.location) {
        const locationParts = orgResponse.headers.location.split('/');
        kcOrgId = locationParts[locationParts.length - 1];
      }
      
      console.log('✅ Keycloak organization created:', { orgId: kcOrgId, name: orgName });
      return kcOrgId;
    } else {
      throw new Error(`Unexpected status code: ${orgResponse.status}`);
    }
  } catch (err) {
    console.error('❌ Failed to create Keycloak organization:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      orgName: orgName,
    });
    throw err;
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'InsightDocs Backend is running!' });
});

// Debug endpoint to see all users
app.get('/debug/users', (req, res) => {
  res.json({
    totalUsers: users.length,
    users: users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      keycloak_id: u.keycloak_id
    }))
  });
});

// Add some test users for development
app.post('/debug/add-test-users', (req, res) => {
  const testUsers = [
    {
      id: 'user-test-1',
      keycloak_id: 'test-keycloak-1',
      username: 'harshavardhan',
      email: 'harshavardhan@gmail.com',
      role: 'user',
      created_at: new Date()
    },
    {
      id: 'user-test-2',
      keycloak_id: 'test-keycloak-2',
      username: 'shashank',
      email: 'shashank@gmail.com',
      role: 'user',
      created_at: new Date()
    },
    {
      id: 'user-test-3',
      keycloak_id: 'test-keycloak-3',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      created_at: new Date()
    },
    {
      id: 'user-test-4',
      keycloak_id: 'test-keycloak-4',
      username: 'user1',
      email: 'user1@gmail.com',
      role: 'user',
      created_at: new Date()
    }
  ];

  // Add users if they don't exist
  testUsers.forEach(testUser => {
    const existingUser = users.find(u => u.email === testUser.email);
    if (!existingUser) {
      users.push(testUser);
      console.log('✅ Added test user:', testUser.email);
    }
  });

  res.json({ 
    message: 'Test users added successfully',
    totalUsers: users.length,
    users: users.map(u => ({ username: u.username, email: u.email }))
  });
});

// User routes
app.get('/users', (req, res) => {
  const { keycloak_id, search } = req.query;
  
  if (keycloak_id) {
    const user = users.find(u => u.keycloak_id === keycloak_id);
    res.json(user ? [user] : []);
  } else if (search) {
    // Search users by email
    console.log('🔍 Searching for users with query:', search);
    console.log('📋 Available users:', users.map(u => ({ email: u.email, username: u.username })));
    
    const filteredUsers = users.filter(u => 
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())
    );
    
    console.log('✅ Found users:', filteredUsers.map(u => ({ email: u.email, username: u.username })));
    res.json(filteredUsers);
  } else {
    res.json(users);
  }
});

app.post('/users', async (req, res) => {
  const { keycloak_id, username, email, role } = req.body;
  
  if (!keycloak_id || !username || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Check if user already exists
  const existingUser = users.find(u => u.keycloak_id === keycloak_id);
  if (existingUser) {
    return res.json({
      userId: existingUser.id,
      organizationId: existingUser.organizationId,
      message: 'User already exists'
    });
  }
  
  try {
    // Get admin token
    const adminToken = await getAdminToken();
    console.log('✅ Admin token obtained');
    
    // Create new user in our storage
    const userId = 'user-' + Date.now();
    const newUser = {
      id: userId,
      keycloak_id,
      username,
      email,
      role: role || 'user',
      created_at: new Date()
    };
    users.push(newUser);
    
    // Create organization name
    const orgName = `org-of-${username}`;
    
    // Create Keycloak client
    let clientInfo = null;
    try {
      clientInfo = await createKeycloakClient(adminToken, username);
      
      // Create client roles
      if (clientInfo && clientInfo.clientUuid) {
        await createClientRoles(adminToken, clientInfo.clientUuid);
      }
    } catch (clientErr) {
      console.warn('⚠️ Client creation failed, proceeding without client:', clientErr.message);
    }
    
    // Create Keycloak organization
    let kcOrgId = null;
    try {
      kcOrgId = await createKeycloakOrganization(adminToken, orgName);
    } catch (orgErr) {
      console.warn('⚠️ Organization creation failed, proceeding without organization:', orgErr.message);
    }
    
    // Create organization in our storage
    const orgId = 'org-' + Date.now();
    const newOrg = {
      id: orgId,
      name: orgName,
      owner_user_id: userId,
      keycloak_org_id: kcOrgId,
      created_at: new Date()
    };
    organizations.push(newOrg);
    
    // Add user to organization
    newUser.organizationId = orgId;
    
    // Add user to organization_users
    organizationUsers.push({
      organization_id: orgId,
      user_id: userId,
      role: 'owner',
      joined_at: new Date()
    });
    
    console.log('✅ Created user and organization:', { 
      userId, 
      orgId, 
      username, 
      clientId: clientInfo?.clientId,
      kcOrgId 
    });
    
    res.status(201).json({
      userId,
      organizationId: orgId,
      keycloakOrgId: kcOrgId,
      clientId: clientInfo?.clientId,
      message: 'User, organization, and client registered successfully'
    });
    
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    res.status(500).json({ 
      error: 'Failed to create user and organization',
      detail: error.message 
    });
  }
});

// Organization routes
app.get('/organizations/user/:userId', (req, res) => {
  const { userId } = req.params;
  
  const userOrgs = organizationUsers
    .filter(ou => ou.user_id === userId)
    .map(ou => {
      const org = organizations.find(o => o.id === ou.organization_id);
      const owner = users.find(u => u.id === org?.owner_user_id);
      return {
        id: org.id,
        name: org.name,
        keycloak_org_id: org.keycloak_org_id || null,
        created_at: org.created_at,
        role: ou.role,
        joined_at: ou.joined_at,
        owner_username: owner?.username || 'Unknown',
        owner_email: owner?.email || '',
        member_count: organizationUsers.filter(u => u.organization_id === org.id).length
      };
    });
  
  res.json(userOrgs);
});

app.get('/organizations/:orgId/members', (req, res) => {
  const { orgId } = req.params;
  
  const org = organizations.find(o => o.id === orgId);
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }
  
  const members = organizationUsers
    .filter(ou => ou.organization_id === orgId)
    .map(ou => {
      const user = users.find(u => u.id === ou.user_id);
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: ou.role,
        joined_at: ou.joined_at,
        user_created_at: user.created_at
      };
    });
  
  res.json(members);
});

// Organization Invitation routes
app.post('/org-invites/send', async (req, res) => {
  console.log('📨 Received invitation request:', req.body);
  const { invited_user_id, invited_by, message, role } = req.body;
  
  if (!invited_user_id || !invited_by) {
    console.log('❌ Missing required fields:', { invited_user_id, invited_by });
    return res.status(400).json({ error: 'invited_user_id and invited_by are required' });
  }
  
  const allowedRoles = ['reviewer', 'viewer'];
  const inviteRole = (role || 'viewer').toLowerCase();
  if (!allowedRoles.includes(inviteRole)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
  }
  
  try {
    // Find inviter user
    const inviterUser = users.find(u => u.keycloak_id === invited_by);
    if (!inviterUser) {
      return res.status(404).json({ error: 'Inviter user not found' });
    }
    
    // Find inviter's organization
    const inviterOrg = organizations.find(o => o.owner_user_id === inviterUser.id);
    if (!inviterOrg) {
      return res.status(404).json({ error: 'Your organization not found' });
    }
    
    // Find invited user
    const invitedUser = users.find(u => u.keycloak_id === invited_user_id);
    if (!invitedUser) {
      return res.status(404).json({ error: 'Invited user not found' });
    }
    
    // Check if already member
    const isMember = organizationUsers.some(ou => 
      ou.organization_id === inviterOrg.id && ou.user_id === invitedUser.id
    );
    if (isMember) {
      return res.status(400).json({ error: 'User is already a member of your organization' });
    }
    
    // Check if already pending
    const existingInvite = organizationInvites.find(invite => 
      invite.organization_id === inviterOrg.id && 
      invite.invited_user_id === invitedUser.id && 
      invite.status === 'pending'
    );
    if (existingInvite) {
      return res.status(400).json({ error: 'Invitation already sent to this user' });
    }
    
    // Create invite
    const inviteId = 'invite-' + Date.now();
    const newInvite = {
      id: inviteId,
      organization_id: inviterOrg.id,
      invited_user_id: invitedUser.id,
      invited_by: inviterUser.id,
      message: message?.trim() || null,
      role: inviteRole,
      status: 'pending',
      created_at: new Date()
    };
    organizationInvites.push(newInvite);
    
    console.log('✅ Organization invitation sent:', {
      inviteId,
      organization: inviterOrg.name,
      invitedUser: invitedUser.username,
      role: inviteRole
    });
    
    res.status(201).json({
      message: 'Organization invitation sent successfully',
      invite: newInvite,
      organizationName: inviterOrg.name
    });
    
  } catch (error) {
    console.error('❌ Error sending invitation:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

app.get('/org-invites/pending/:userId', (req, res) => {
  const { userId } = req.params;
  
  const pendingInvites = organizationInvites
    .filter(invite => invite.invited_user_id === userId && invite.status === 'pending')
    .map(invite => {
      const org = organizations.find(o => o.id === invite.organization_id);
      const inviter = users.find(u => u.id === invite.invited_by);
      return {
        id: invite.id,
        organization_id: invite.organization_id,
        invited_user_id: invite.invited_user_id,
        invited_by: invite.invited_by,
        message: invite.message,
        role: invite.role,
        status: invite.status,
        created_at: invite.created_at,
        organization_name: org?.name,
        invited_by_username: inviter?.username
      };
    });
  
  res.json(pendingInvites);
});

app.post('/org-invites/accept/:inviteId', async (req, res) => {
  const { inviteId } = req.params;
  
  try {
    const invite = organizationInvites.find(inv => inv.id === inviteId && inv.status === 'pending');
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found or already processed' });
    }
    
    // Add user to organization
    organizationUsers.push({
      organization_id: invite.organization_id,
      user_id: invite.invited_user_id,
      role: invite.role,
      joined_at: new Date()
    });
    
    // Update invite status
    invite.status = 'accepted';
    invite.updated_at = new Date();
    
    const org = organizations.find(o => o.id === invite.organization_id);
    
    console.log('✅ Invitation accepted:', {
      inviteId,
      organization: org?.name,
      role: invite.role
    });
    
    res.json({ 
      message: 'Invitation accepted successfully',
      organizationName: org?.name
    });
    
  } catch (error) {
    console.error('❌ Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

app.post('/org-invites/reject/:inviteId', (req, res) => {
  const { inviteId } = req.params;
  
  try {
    const invite = organizationInvites.find(inv => inv.id === inviteId && inv.status === 'pending');
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found or already processed' });
    }
    
    // Update invite status
    invite.status = 'rejected';
    invite.updated_at = new Date();
    
    console.log('✅ Invitation rejected:', inviteId);
    res.json({ message: 'Invitation rejected successfully' });
    
  } catch (error) {
    console.error('❌ Error rejecting invitation:', error);
    res.status(500).json({ error: 'Failed to reject invitation' });
  }
});

// Auth routes
app.post('/auth/logout-all', (req, res) => {
  console.log('Logout all sessions requested');
  res.json({ message: 'Logged out from all sessions' });
});

// Dashboard routes
app.get('/dashboard', (req, res) => {
  res.json({ message: 'Dashboard endpoint' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ InsightDocs Backend Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Frontend should connect to: http://localhost:${PORT}`);
  console.log(`🔑 Keycloak integration enabled`);
  console.log(`📧 Organization invitations enabled`);
});

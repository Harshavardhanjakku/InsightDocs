const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const multer = require('multer');
const { putObjectFromStream, getPresignedUrl } = require('./config/minio');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { connectDB } = require('./config/mongodb');
const socketService = require('./services/socketService');
const mammoth = require('mammoth');
dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(bodyParser.json());

// File upload handling (keep files in memory and stream to MinIO)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Mock data storage
const users = [];
const organizations = [];
const organizationInvites = [];
const organizationUsers = [];

// In-memory media storage (metadata only)
// { id, title, type, bucket, objectName, uploaded_by_user_id, organization_id, created_at, mime_type, size }
const mediaFiles = [];

// Export data globally for collaboration service
global.users = users;
global.organizations = organizations;
global.organizationInvites = organizationInvites;
global.organizationUsers = organizationUsers;
global.mediaFiles = mediaFiles;

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

// Get user organizations endpoint
app.get('/users/:userId/organizations', (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🔍 Getting organizations for user: ${userId}`);
    
    // Find all organization memberships for this user
    const userMemberships = organizationUsers.filter(ou => ou.user_id === userId);
    
    if (userMemberships.length === 0) {
      console.log(`❌ No organizations found for user: ${userId}`);
      return res.json({ 
        success: true, 
        data: [],
        message: 'No organizations found for this user'
      });
    }
    
    // Get organization details for each membership
    const userOrganizations = userMemberships.map(membership => {
      const org = organizations.find(o => o.id === membership.organization_id);
      return {
        organization_id: membership.organization_id,
        organization_name: org ? org.name : 'Unknown Organization',
        role: membership.role,
        joined_at: membership.joined_at
      };
    });
    
    console.log(`✅ Found ${userOrganizations.length} organizations for user: ${userId}`);
    
    // Consistent response format
    res.json({ 
      success: true, 
      data: userOrganizations,
      message: `Found ${userOrganizations.length} organizations`
    });
    
  } catch (error) {
    console.error('Error getting user organizations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user organizations',
      message: error.message 
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

// -------- Media with MinIO --------
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'insightdocs';

// Upload media to MinIO and store metadata under the uploader's organization
app.post('/media/upload', upload.any(), async (req, res) => {
  try {
    const { title, type } = req.body;
    // Support both uploaded_by_user_id (legacy here) and uploaded_by (from frontend)
    const uploaded_by_user_id = req.body.uploaded_by_user_id || req.body.uploaded_by;

    const incomingFile = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null);

    if (!incomingFile || !title || !type || !uploaded_by_user_id) {
      console.warn('Upload validation failed', {
        hasFile: !!incomingFile,
        titlePresent: !!title,
        typePresent: !!type,
        uploadedByPresent: !!uploaded_by_user_id
      });
      return res.status(400).json({ error: 'Missing required fields: file, title, type, uploaded_by_user_id' });
    }

    const uploader = users.find(u => u.id === uploaded_by_user_id);
    let orgId = uploader?.organizationId;
    if (!orgId) {
      const membership = organizationUsers.find(ou => ou.user_id === uploaded_by_user_id);
      if (membership) {
        orgId = membership.organization_id;
      }
    }
    if (!orgId) {
      console.warn('Uploader not found in orgs', { uploaded_by_user_id, hasUploader: !!uploader });
      return res.status(400).json({ error: 'User is not a member of any organization' });
    }
    const extension = (incomingFile.originalname && incomingFile.originalname.includes('.') ? incomingFile.originalname.split('.').pop() : '').toLowerCase();
    const suffix = extension ? `.${extension}` : '';
    const objectName = `${orgId}/${Date.now()}-${crypto.randomUUID()}${suffix}`;

    // Put to MinIO
    await putObjectFromStream(
      MINIO_BUCKET,
      objectName,
      Buffer.isBuffer(incomingFile.buffer) ? incomingFile.buffer : Buffer.from(incomingFile.buffer || []),
      incomingFile.size,
      incomingFile.mimetype
    );

    const mediaId = `media-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const record = {
      id: mediaId,
      title: String(title),
      type: String(type),
      bucket: MINIO_BUCKET,
      objectName,
      uploaded_by_user_id,
      organization_id: orgId,
      created_at: new Date(),
      mime_type: incomingFile.mimetype,
      size: incomingFile.size
    };
    mediaFiles.push(record);

    // Return presigned URL for convenience
    const url = await getPresignedUrl(MINIO_BUCKET, objectName, 3600);

    console.log('✅ Uploaded media to MinIO and saved record', { id: mediaId, orgId, uploader: uploaded_by_user_id, objectName });
    res.status(201).json({ message: 'File uploaded', media: { ...record, url } });
  } catch (err) {
    console.error('❌ Upload failed:', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// List all media in the uploader's organization (visible to all org members)
app.get('/media/org/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const list = mediaFiles
      .filter(m => m.organization_id === orgId)
      .sort((a, b) => b.created_at - a.created_at);

    // Attach presigned URLs
    const withUrls = await Promise.all(list.map(async m => ({
      ...m,
      url: await getPresignedUrl(m.bucket, m.objectName, 3600)
    })));

    res.json(withUrls);
  } catch (err) {
    console.error('❌ Listing failed:', err);
    res.status(500).json({ error: 'Failed to list media', detail: err.message });
  }
});

// Preview media file content
app.get('/media/:id/preview', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Find media file
    const media = mediaFiles.find(m => m.id === id);
    
    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    // Check if file exists in MinIO storage
    const possiblePaths = [
      path.join(__dirname, 'minio-local', 'data', 'insightdocs', media.objectName),
      path.join(__dirname, 'minio-win', 'data', 'insightdocs', media.objectName),
      path.join(__dirname, 'minio-data', 'insightdocs', media.objectName)
    ];
    
    console.log('🔍 Looking for file in paths:', possiblePaths);
    
    let filePath = null;
    for (const possiblePath of possiblePaths) {
      console.log('🔍 Checking path:', possiblePath, 'exists:', fs.existsSync(possiblePath));
      if (fs.existsSync(possiblePath)) {
        // Check if it's a directory (MinIO storage format)
        const stats = fs.statSync(possiblePath);
        if (stats.isDirectory()) {
          // Look for xl.meta file inside the directory
          const xlMetaPath = path.join(possiblePath, 'xl.meta');
          if (fs.existsSync(xlMetaPath)) {
            filePath = xlMetaPath;
            console.log('✅ Found xl.meta file at:', filePath);
            break;
          }
        } else {
          filePath = possiblePath;
          console.log('✅ Found direct file at:', filePath);
          break;
        }
      }
    }
    
    if (!filePath) {
      console.log('❌ File not found in any of the expected paths');
      return res.status(404).json({ error: 'File not found in storage' });
    }
    
    let content = '';
    let previewType = 'text';
    
    // Handle different file types
    if (media.mime_type === 'text/plain' || media.mime_type === 'text/markdown') {
      content = fs.readFileSync(filePath, 'utf8');
      previewType = 'text';
    } else if (media.mime_type.includes('word') || media.mime_type.includes('document') || media.mime_type.includes('docx')) {
      // For Word documents, use mammoth to extract text content
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        if (result.value && result.value.trim().length > 0) {
          content = result.value;
          previewType = 'text';
        } else {
          content = 'Word document is empty or could not be processed.';
          previewType = 'placeholder';
        }
      } catch (mammothError) {
        console.log('Mammoth extraction failed, trying fallback method:', mammothError.message);
        try {
          // Fallback: try to read as text first (in case it's a text-based format)
          const rawContent = fs.readFileSync(filePath, 'utf8');
          if (rawContent && rawContent.trim().length > 0 && !rawContent.includes('\x00')) {
            content = rawContent;
            previewType = 'text';
          } else {
            content = 'Word document detected. Content preview not available for this Word file.';
            previewType = 'placeholder';
          }
        } catch (readError) {
          content = 'Word document detected. Content preview not available for this Word file.';
          previewType = 'placeholder';
        }
      }
    } else if (media.mime_type.includes('pdf')) {
      content = 'PDF document detected. Content preview not available for PDF files.';
      previewType = 'placeholder';
    } else {
      content = 'File type not supported for preview.';
      previewType = 'placeholder';
    }
    
    res.json({
      id: media.id,
      title: media.title,
      type: media.mime_type,
      content: content,
      previewType: previewType,
      size: media.size,
      uploaded_by_user_id: media.uploaded_by_user_id,
      created_at: media.created_at
    });
    
  } catch (err) {
    console.error('Error previewing media:', err);
    res.status(500).json({ error: 'Error previewing media file', detail: err.message });
  }
});

// Test collaboration endpoint
app.get('/test-collaboration/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    // Find the media file
    const media = mediaFiles.find(m => m.id === mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Test the collaboration service
    const collaborationService = require('./services/collaborationService');
    
    // Try to extract content
    const content = await collaborationService.extractDocumentContent(mediaId);
    
    // Try to initialize document
    const document = await collaborationService.initializeDocument(
      mediaId, 
      media.organization_id, 
      media.title, 
      media.uploaded_by_user_id
    );
    
    res.json({
      success: true,
      media: media,
      extractedContent: {
        length: content.length,
        preview: content.substring(0, 200) + '...'
      },
      document: {
        id: document._id,
        contentLength: document.content?.length || 0,
        version: document.version,
        content: document.content?.substring(0, 200) + '...'
      }
    });
    
  } catch (error) {
    console.error('Error testing collaboration:', error);
    res.status(500).json({ 
      error: 'Error testing collaboration', 
      detail: error.message,
      stack: error.stack
    });
  }
});

// Collaborate endpoint - load document content and check permissions
app.get('/api/docs/:mediaId/collaborate', async (req, res) => {
  try {
    console.log('🚀 === BACKEND COLLABORATE ENDPOINT DEBUG START ===');
    const { mediaId } = req.params;
    const { userId, organizationId } = req.query;
    
    console.log('📋 Request parameters:', { mediaId, userId, organizationId });
    console.log('🔍 Collaborate request for document ${mediaId} by user ${userId} in org ${organizationId}');
    
    // Find the media file
    console.log('🔍 Step 1: Searching for media file...');
    console.log('📋 Available media files:', mediaFiles.map(m => ({ id: m.id, title: m.title, org: m.organization_id })));
    
    const media = mediaFiles.find(m => m.id === mediaId);
    if (!media) {
      console.log('❌ Media not found in mediaFiles array');
      console.log('❌ Media not found: ${mediaId}');
      return res.status(404).json({ error: 'Document not found' });
    }
    
    console.log('✅ Media file found:', {
      id: media.id,
      title: media.title,
      organization_id: media.organization_id,
      uploaded_by: media.uploaded_by_user_id
    });
    
    // Check if user has access to this document
    console.log('🔍 Step 2: Checking user access permissions...');
    console.log('📋 Available organization users:', organizationUsers.map(ou => ({ userId: ou.user_id, orgId: ou.organization_id, role: ou.role })));
    console.log('📋 Available organization invites:', organizationInvites.map(inv => ({ userId: inv.invited_user_id, orgId: inv.organization_id, status: inv.status, role: inv.role })));
    
    // The user can access if:
    // 1. Document is in their organization, OR
    // 2. User is invited to collaborate on this document
    let hasAccess = false;
    let userRole = 'viewer';
    
    // First, check if document is in user's organization
    if (media.organization_id === organizationId) {
      hasAccess = true;
      console.log('✅ User ${userId} has direct access to document in their organization');
      
      // Get user's role in their organization
      const orgUser = organizationUsers.find(ou => 
        ou.organization_id === organizationId && 
        ou.user_id === userId
      );
      userRole = orgUser?.role || 'viewer';
      console.log('🔐 User role in organization:', userRole);
    } else {
      console.log('🔍 User not in document organization, checking invitations...');
      // Check if user is invited to collaborate on this document
      // Look for organization invites where the user is invited to the document's organization
      const invite = organizationInvites.find(inv => 
        inv.invited_user_id === userId && 
        inv.organization_id === media.organization_id &&
        inv.status === 'accepted'
      );
      
      if (invite) {
        hasAccess = true;
        userRole = invite.role || 'viewer';
        console.log('✅ User ${userId} has access via invitation with role: ${userRole}');
      } else {
        console.log('❌ User ${userId} not invited to organization ${media.organization_id}');
      }
    }
    
    if (!hasAccess) {
      console.log('❌ FINAL RESULT: Access denied');
      console.log('❌ Access denied for user ${userId} to document ${mediaId}');
      return res.status(403).json({ error: 'Access denied to this document' });
    }
    
    // Check if user is a member of the document's organization (for collaboration)
    console.log('🔍 Step 3: Checking organization membership...');
    const orgUser = organizationUsers.find(ou => 
      ou.organization_id === media.organization_id && 
      ou.user_id === userId
    );
    
    if (!orgUser) {
      console.log('❌ User not a member of document organization');
      console.log('❌ User ${userId} not a member of document\'s organization ${media.organization_id}');
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    
    console.log('✅ FINAL RESULT: Access granted');
    console.log('✅ Access granted for user ${userId} to document ${mediaId} with role ${userRole}');
    
    // Get or create document in collaboration system
    console.log('🔍 Step 4: Initializing collaboration document...');
    const collaborationService = require('./services/collaborationService');
    const document = await collaborationService.initializeDocument(
      mediaId, 
      media.organization_id, // Use document's organization, not user's current org
      media.title, 
      media.uploaded_by_user_id
    );
    
    console.log('✅ Document initialized for collaboration:', {
      id: document._id,
      contentLength: document.content?.length || 0,
      version: document.version
    });
    
    // Return document data for collaboration
    const response = {
      success: true,
      document: {
        id: mediaId,
        title: media.title,
        content: document.content,
        version: document.version,
        organizationId: media.organization_id,
        createdBy: media.uploaded_by_user_id,
        userRole: userRole
      },
      permissions: {
        canEdit: userRole === 'owner' || userRole === 'reviewer',
        canView: true,
        role: userRole
      }
    };
    
    console.log('📤 Sending response:', response);
    console.log('🚀 === BACKEND COLLABORATE ENDPOINT DEBUG END ===');
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ ERROR in collaborate endpoint:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to load document for collaboration', 
      detail: error.message 
    });
  }
});

// Save document endpoint
app.post('/api/docs/:mediaId/save', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { userId, changeSummary } = req.body;
    
    console.log('🚀 === SAVE DOCUMENT DEBUG START ===');
    console.log('📋 Save request:', { mediaId, userId, changeSummary });
    
    // Check if user has access to this document
    const media = mediaFiles.find(m => m.id === mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Save document with author information
    const collaborationService = require('./services/collaborationService');
    const saveResult = await collaborationService.saveDocument(mediaId, userId, changeSummary);
    
    console.log('✅ Document saved successfully:', saveResult);
    console.log('🚀 === SAVE DOCUMENT DEBUG END ===');
    
    res.json({
      success: true,
      versionId: saveResult.versionId,
      version: saveResult.version,
      editedBy: saveResult.editedBy,
      editorName: saveResult.editorName,
      editedAt: saveResult.editedAt,
      commitMessage: saveResult.commitMessage
    });
    
  } catch (error) {
    console.error('❌ Error saving document:', error);
    res.status(500).json({ 
      error: 'Failed to save document',
      detail: error.message 
    });
  }
});

// Document content endpoint - get document content for editing
app.get('/api/docs/:mediaId/content', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { userId, organizationId } = req.query;
    
    console.log(`🔍 Content request for document ${mediaId} by user ${userId} in org ${organizationId}`);
    
    // Find the media file
    const media = mediaFiles.find(m => m.id === mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check permissions (same logic as collaborate endpoint)
    let hasAccess = false;
    let userRole = 'viewer';
    
    if (media.organization_id === organizationId) {
      hasAccess = true;
      const orgUser = organizationUsers.find(ou => 
        ou.organization_id === organizationId && 
        ou.user_id === userId
      );
      userRole = orgUser?.role || 'viewer';
    } else {
      const invite = organizationInvites.find(inv => 
        inv.invited_user_id === userId && 
        inv.organization_id === media.organization_id &&
        inv.status === 'accepted'
      );
      
      if (invite) {
        hasAccess = true;
        userRole = invite.role || 'viewer';
      }
    }
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get document content
    const collaborationService = require('./services/collaborationService');
    const document = await collaborationService.initializeDocument(
      mediaId, 
      media.organization_id, 
      media.title, 
      media.uploaded_by_user_id
    );
    
    res.json({
      success: true,
      content: document.content,
      version: document.version,
      userRole: userRole
    });
    
  } catch (error) {
    console.error('Error getting document content:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;

// Initialize server with Socket.IO
const server = app.listen(PORT, async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize Socket.IO
    socketService.initialize(server);
    
    // Share media files with socket service and globally
    socketService.setMediaFiles(mediaFiles);
    socketService.setOrganizationData(organizationUsers, organizationInvites);
    global.mediaFiles = mediaFiles;
    global.users = users;
    global.organizations = organizations;
    global.organizationUsers = organizationUsers;
    global.organizationInvites = organizationInvites;
    
    console.log(`✅ InsightDocs Backend Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 Frontend should connect to: http://localhost:${PORT}`);
    console.log(`🔑 Keycloak integration enabled`);
    console.log(`📧 Organization invitations enabled`);
    console.log(`🔌 Real-time collaboration enabled`);
  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    process.exit(1);
  }
});



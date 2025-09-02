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

// Import MongoDB models
const User = require('./models/User');
const Organization = require('./models/Organization');
const OrganizationUser = require('./models/OrganizationUser');
const Media = require('./models/Media');
const Invitation = require('./models/Invitation');
const Document = require('./models/Document');

dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(bodyParser.json());

// File upload handling (keep files in memory and stream to MinIO)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

      return {
        clientId,
        clientSecret,
        clientUuid
      };
    }
  } catch (error) {
    console.error('Failed to create Keycloak client:', error.response?.data || error.message);
    throw error;
  }
}

// Create Keycloak organization
async function createKeycloakOrganization(accessToken, orgName) {
  try {
    const orgPayload = {
      name: orgName,
      displayName: orgName,
      attributes: {
        description: [`Organization for ${orgName}`]
      }
    };

    const response = await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/groups`,
      orgPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 201) {
      return response.data.id;
    }
  } catch (error) {
    console.error('Failed to create Keycloak organization:', error.response?.data || error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'MongoDB Atlas',
    message: 'InsightDocs Backend Server is running'
  });
});

// User registration endpoint
app.post('/users', async (req, res) => {
  try {
    const { keycloak_id, username, email, role } = req.body;
    
    console.log('🚀 === USER REGISTRATION DEBUG START ===');
    console.log('📋 Registration data:', { keycloak_id, username, email, role });
    
    // Check if user already exists
    const existingUser = await User.findOne({ keycloak_id });
    if (existingUser) {
      console.log('⚠️ User already exists:', existingUser.id);
      return res.status(409).json({ 
        error: 'User already exists',
        userId: existingUser.id 
      });
    }
    
    // Get admin token
    const adminToken = await getAdminToken();
    console.log('✅ Admin token obtained');
    
    // Create new user in MongoDB
    const newUser = new User({
      keycloak_id,
      username,
      email,
      role: role || 'user'
    });
    
    await newUser.save();
    console.log('✅ User created in MongoDB:', newUser.id);
    
    // Create organization name
    const orgName = `org-of-${username}`;
    
    // Create Keycloak client
    let clientInfo = null;
    try {
      clientInfo = await createKeycloakClient(adminToken, username);
      console.log('✅ Keycloak client created:', clientInfo?.clientId);
    } catch (clientErr) {
      console.warn('⚠️ Client creation failed, proceeding without client:', clientErr.message);
    }
    
    // Create Keycloak organization
    let kcOrgId = null;
    try {
      kcOrgId = await createKeycloakOrganization(adminToken, orgName);
      console.log('✅ Keycloak organization created:', kcOrgId);
    } catch (orgErr) {
      console.warn('⚠️ Organization creation failed, proceeding without organization:', orgErr.message);
    }
    
    // Create organization in MongoDB
    const newOrg = new Organization({
      name: orgName,
      keycloak_org_id: kcOrgId,
      createdBy: newUser.id
    });
    
    await newOrg.save();
    console.log('✅ Organization created in MongoDB:', newOrg.id);
    
    // Add user to organization with owner role
    const orgUser = new OrganizationUser({
      userId: newUser.id,
      organizationId: newOrg.id,
      role: 'owner'
    });
    
    await orgUser.save();
    console.log('✅ User added to organization as owner');
    
    console.log('✅ Created user and organization:', { 
      userId: newUser.id, 
      orgId: newOrg.id, 
      username, 
      clientId: clientInfo?.clientId,
      kcOrgId 
    });
    
    res.status(201).json({
      userId: newUser.id,
      organizationId: newOrg.id,
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
app.get('/users/:userId/organizations', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🔍 Getting organizations for user: ${userId}`);
    
    // Find all organization memberships for this user
    const userMemberships = await OrganizationUser.find({ 
      userId: userId,
      isActive: true 
    }).populate('organizationId');
    
    if (userMemberships.length === 0) {
      console.log(`❌ No organizations found for user: ${userId}`);
      return res.json({ 
        data: [],
        message: 'No organizations found for this user'
      });
    }
    
    console.log(`✅ Found ${userMemberships.length} organizations for user: ${userId}`);
    
    // Format the response
    const organizations = userMemberships.map(membership => ({
      organization_id: membership.organizationId,
      user_id: membership.userId,
      role: membership.role,
      joined_at: membership.joinedAt
    }));
    
    res.json({ 
      data: organizations,
      message: `Found ${organizations.length} organizations`
    });
    
  } catch (error) {
    console.error('❌ Error getting user organizations:', error.message);
    res.status(500).json({ 
      error: 'Failed to get user organizations',
      detail: error.message 
    });
  }
});

// Get organizations endpoint
app.get('/organizations', async (req, res) => {
  try {
    const organizations = await Organization.find({ isActive: true });
    res.json(organizations);
  } catch (error) {
    console.error('❌ Error getting organizations:', error.message);
    res.status(500).json({ 
      error: 'Failed to get organizations',
      detail: error.message 
    });
  }
});

// Get organization users endpoint
app.get('/organizations/:orgId/users', async (req, res) => {
  try {
    const { orgId } = req.params;
    
    const orgUsers = await OrganizationUser.find({ 
      organizationId: orgId,
      isActive: true 
    }).populate('userId');
    
    res.json(orgUsers);
  } catch (error) {
    console.error('❌ Error getting organization users:', error.message);
    res.status(500).json({ 
      error: 'Failed to get organization users',
      detail: error.message 
    });
  }
});

// Media upload endpoint
app.post('/media/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, type, uploaded_by } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('🚀 === MEDIA UPLOAD DEBUG START ===');
    console.log('📋 Upload data:', { title, type, uploaded_by, fileSize: file.size });
    
    // Generate unique file ID
    const fileId = crypto.randomUUID();
    const objectName = `${uploaded_by}/${fileId}-${file.originalname}`;
    
    // Upload to MinIO
    await putObjectFromStream('insightdocs', objectName, file.buffer);
    console.log('✅ File uploaded to MinIO:', objectName);
    
    // Save media record to MongoDB
    const media = new Media({
      title,
      type: type || 'document',
      objectName,
      size: file.size,
      orgId: uploaded_by, // This should be organization ID, not user ID
      uploaded_by
    });
    
    await media.save();
    console.log('✅ Media record saved to MongoDB:', media.id);
    
    res.status(201).json({
      media: {
        id: media.id,
        title: media.title,
        type: media.type,
        size: media.size,
        uploaded_at: media.uploaded_at
      },
      message: 'File uploaded successfully'
    });
    
  } catch (error) {
    console.error('❌ Error uploading file:', error.message);
    res.status(500).json({ 
      error: 'Failed to upload file',
      detail: error.message 
    });
  }
});

// Get organization media endpoint
app.get('/media/org/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    
    const media = await Media.find({ 
      orgId: orgId,
      isActive: true 
    }).sort({ uploaded_at: -1 });
    
    res.json(media);
  } catch (error) {
    console.error('❌ Error getting organization media:', error.message);
    res.status(500).json({ 
      error: 'Failed to get organization media',
      detail: error.message 
    });
  }
});

// Update media endpoint
app.patch('/media/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { title } = req.body;
    
    const media = await Media.findByIdAndUpdate(
      mediaId,
      { title },
      { new: true }
    );
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json({ media });
  } catch (error) {
    console.error('❌ Error updating media:', error.message);
    res.status(500).json({ 
      error: 'Failed to update media',
      detail: error.message 
    });
  }
});

// Search users endpoint
app.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = {};
    if (search) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const users = await User.find(query).select('username email');
    res.json(users);
  } catch (error) {
    console.error('❌ Error searching users:', error.message);
    res.status(500).json({ 
      error: 'Failed to search users',
      detail: error.message 
    });
  }
});

// Organization invitation endpoint
app.post('/organizations/:orgId/invite', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { invited_user_id, invited_by, role, message } = req.body;
    
    // Check if invitation already exists
    const existingInvitation = await Invitation.findOne({
      organizationId: orgId,
      invitedUserId: invited_user_id,
      status: 'pending'
    });
    
    if (existingInvitation) {
      return res.status(409).json({ error: 'Invitation already exists' });
    }
    
    // Create new invitation
    const invitation = new Invitation({
      organizationId: orgId,
      invitedUserId: invited_user_id,
      invitedBy: invited_by,
      role: role || 'viewer',
      message: message || ''
    });
    
    await invitation.save();
    
    res.status(201).json({
      inviteId: invitation.id,
      message: 'Invitation sent successfully'
    });
    
  } catch (error) {
    console.error('❌ Error creating invitation:', error.message);
    res.status(500).json({ 
      error: 'Failed to create invitation',
      detail: error.message 
    });
  }
});

// Accept invitation endpoint
app.post('/invitations/:inviteId/accept', async (req, res) => {
  try {
    const { inviteId } = req.params;
    
    const invitation = await Invitation.findById(inviteId);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation is not pending' });
    }
    
    // Update invitation status
    invitation.status = 'accepted';
    await invitation.save();
    
    // Add user to organization
    const orgUser = new OrganizationUser({
      userId: invitation.invitedUserId,
      organizationId: invitation.organizationId,
      role: invitation.role
    });
    
    await orgUser.save();
    
    res.json({
      message: 'Invitation accepted successfully',
      organizationId: invitation.organizationId,
      role: invitation.role
    });
    
  } catch (error) {
    console.error('❌ Error accepting invitation:', error.message);
    res.status(500).json({ 
      error: 'Failed to accept invitation',
      detail: error.message 
    });
  }
});

// Get pending invitations endpoint
app.get('/users/:userId/invitations', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const invitations = await Invitation.find({
      invitedUserId: userId,
      status: 'pending'
    }).populate('organizationId');
    
    res.json(invitations);
  } catch (error) {
    console.error('❌ Error getting invitations:', error.message);
    res.status(500).json({ 
      error: 'Failed to get invitations',
      detail: error.message 
    });
  }
});

// Document collaboration endpoint
app.get('/api/docs/:mediaId/collaborate', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { userId, organizationId } = req.query;
    
    console.log('🚀 === BACKEND COLLABORATE ENDPOINT DEBUG START ===');
    console.log('📋 Request parameters:', { mediaId, userId, organizationId });
    
    // Find media file
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Check user permissions
    const orgUser = await OrganizationUser.findOne({
      userId: userId,
      organizationId: organizationId,
      isActive: true
    });
    
    if (!orgUser) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Find or create document for collaboration
    let document = await Document.findOne({ mediaId });
    
    if (!document) {
      // Create new document
      document = new Document({
        mediaId,
        organizationId,
        title: media.title,
        content: 'Word document loaded. Start typing to begin collaboration.',
        createdBy: userId
      });
      
      await document.save();
      console.log('✅ New document created for collaboration');
    }
    
    res.json({
      success: true,
      document: {
        id: document.mediaId,
        title: document.title,
        content: document.content,
        version: document.version,
        organizationId: document.organizationId,
        createdBy: document.createdBy,
        userRole: orgUser.role
      },
      permissions: {
        canEdit: orgUser.role !== 'viewer',
        canView: true,
        role: orgUser.role
      }
    });
    
  } catch (error) {
    console.error('❌ Error in collaborate endpoint:', error.message);
    res.status(500).json({ 
      error: 'Failed to load document for collaboration',
      detail: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`✅ InsightDocs Backend Server running on port ${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 Frontend should connect to: http://localhost:${PORT}`);
      console.log(`🔑 Keycloak integration enabled`);
      console.log(`📧 Organization invitations enabled`);
      console.log(`🔌 Real-time collaboration enabled`);
      console.log(`🗄️ Using MongoDB Atlas for all data storage`);
    });
    
    // Initialize Socket.IO
    socketService.initialize(server);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

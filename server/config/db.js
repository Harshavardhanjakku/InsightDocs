// Mock database configuration for development
// In production, you would use a real PostgreSQL database

// Mock data storage
const mockData = {
  users: [
    {
      id: 'user-1756569567852',
      username: 'harshavardhan',
      email: 'harshavardhan@gmail.com',
      keycloak_id: 'mock-keycloak-id-1'
    },
    {
      id: 'f876f232-a320-45c6-85b5-ed8d9bfdddce', 
      username: 'user1',
      email: 'user1@gmail.com',
      keycloak_id: 'mock-keycloak-id-2'
    },
    {
      id: 'user-1756521606324',
      username: 'user2',
      email: 'user2@gmail.com', 
      keycloak_id: 'mock-keycloak-id-3'
    }
  ],
  organizations: [
    {
      id: 'org-1756569567926',
      name: 'org-of-harshavardhan',
      keycloak_org_id: 'mock-kc-org-id-1',
      created_at: new Date(),
      owner_username: 'harshavardhan',
      owner_email: 'harshavardhan@gmail.com'
    }
  ],
  organization_users: [
    {
      id: 'ou-1',
      user_id: 'user-1756569567852',
      organization_id: 'org-1756569567926',
      role: 'owner',
      joined_at: new Date()
    },
    {
      id: 'ou-2',
      user_id: 'f876f232-a320-45c6-85b5-ed8d9bfdddce', 
      organization_id: 'org-1756569567926',
      role: 'reviewer',
      joined_at: new Date()
    },
    {
      id: 'ou-3',
      user_id: 'user-1756521606324',
      organization_id: 'org-1756569567926', 
      role: 'viewer',
      joined_at: new Date()
    }
  ],
  media: [
    {
      id: 'media-1756569662865-503',
      title: 'mydoc',
      type: 'document',
      file_path: 'org-1756569567926/1756569662822-538b46ed-8c16-49ad-8a50-452d5c0db978.docx',
      uploaded_by: 'user-1756569567852',
      organization_id: 'org-1756569567926',
      created_at: new Date(),
      size: 14462
    }
  ],
  document_versions: []
};

const mockPool = {
  query: async (text, params) => {
    console.log('Mock DB Query:', text, params);
    
    // Handle document versions queries
    if (text.includes('INSERT INTO document_versions')) {
      const mediaId = params[0];
      const content = params[1];
      const version = params[2];
      const userId = params[3];
      const saveType = params[4];
      
      const newVersion = {
        id: `dv-${Date.now()}`,
        media_id: mediaId,
        content: content,
        version: version,
        created_by: userId,
        save_type: saveType,
        created_at: new Date()
      };
      
      mockData.document_versions.push(newVersion);
      return { rows: [newVersion] };
    }
    
    if (text.includes('SELECT MAX(version) as max_version FROM document_versions')) {
      const mediaId = params[0];
      const versions = mockData.document_versions.filter(dv => dv.media_id === mediaId);
      const maxVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 0;
      return { rows: [{ max_version: maxVersion }] };
    }
    
    if (text.includes('UPDATE media SET content = $1, updated_at = NOW() WHERE id = $2')) {
      const content = params[0];
      const mediaId = params[1];
      
      const media = mockData.media.find(m => m.id === mediaId);
      if (media) {
        media.content = content;
        media.updated_at = new Date();
      }
      
      return { rows: [] };
    }
    
    // Handle media access control queries
    if (text.includes('SELECT m.*, ou.role FROM media m JOIN organization_users ou ON ou.user_id = $1 WHERE m.id = $2 AND ou.organization_id = $3')) {
      const userId = params[0];
      const mediaId = params[1];
      const orgId = params[2];
      
      console.log('🔍 Mock DB: Checking media access for:', { userId, mediaId, orgId });
      
      // Find the user's organization membership
      const orgUser = mockData.organization_users.find(ou => 
        ou.user_id === userId && ou.organization_id === orgId
      );
      
      console.log('🔍 Mock DB: Found org user:', orgUser);
      
      if (orgUser) {
        // Find the media file
        const media = mockData.media.find(m => m.id === mediaId);
        console.log('🔍 Mock DB: Found media:', media);
        
        if (media) {
          const result = {
            ...media,
            role: orgUser.role
          };
          console.log('✅ Mock DB: Returning media access result:', result);
          return { rows: [result] };
        }
      }
      
      console.log('❌ Mock DB: No access found');
      return { rows: [] };
    }
    
    // Handle document existence check queries
    if (text.includes('SELECT m.* FROM media m JOIN organization_users ou ON ou.user_id = $1 WHERE m.id = $2 AND ou.organization_id = $3')) {
      const userId = params[0];
      const mediaId = params[1];
      const orgId = params[2];
      
      console.log('🔍 Mock DB: Checking document existence for:', { userId, mediaId, orgId });
      
      // Check if user is in organization and document exists
      const orgUser = mockData.organization_users.find(ou => 
        ou.user_id === userId && ou.organization_id === orgId
      );
      
      console.log('🔍 Mock DB: Found org user for existence check:', orgUser);
      
      if (orgUser) {
        const media = mockData.media.find(m => m.id === mediaId);
        console.log('🔍 Mock DB: Found media for existence check:', media);
        
        if (media) {
          console.log('✅ Mock DB: Document exists, returning:', media);
          return { rows: [media] };
        }
      }
      
      console.log('❌ Mock DB: Document does not exist or user not in org');
      return { rows: [] };
    }
    
    // Handle media queries for content extraction
    if (text.includes('SELECT file_path, type FROM media WHERE id = $1')) {
      const mediaId = params[0];
      const media = mockData.media.find(m => m.id === mediaId);
      
      if (media) {
        return { rows: [media] };
      }
      
      return { rows: [] };
    }
    
    // Handle organization members query
    if (text.includes('SELECT * FROM organization_users WHERE organization_id = $1')) {
      const orgId = params[0];
      const orgUsers = mockData.organization_users.filter(ou => ou.organization_id === orgId);
      
      return { rows: orgUsers };
    }
    
    // Handle organization media query
    if (text.includes('SELECT m.*, u.username AS uploaded_by_username FROM media m JOIN users u ON m.uploaded_by = u.id JOIN organization_users ou ON ou.user_id = u.id WHERE ou.organization_id = $1')) {
      const orgId = params[0];
      const orgMedia = mockData.media.filter(m => m.organization_id === orgId);
      
      // Add username to each media item
      const mediaWithUsernames = orgMedia.map(media => {
        const user = mockData.users.find(u => u.id === media.uploaded_by);
        return {
          ...media,
          uploaded_by_username: user ? user.username : 'Unknown'
        };
      });
      
      return { rows: mediaWithUsernames };
    }
    
    // Handle users query
    if (text.includes('SELECT * FROM users WHERE id = $1')) {
      const userId = params[0];
      const user = mockData.users.find(u => u.id === userId);
      
      if (user) {
        return { rows: [user] };
      }
      
      return { rows: [] };
    }
    
    // Handle organization query
    if (text.includes('SELECT * FROM organizations')) {
      return { rows: mockData.organizations };
    }
    
    // Handle organization invitations
    if (text.includes('INSERT INTO organization_invitations')) {
      return { rows: [{ id: 'invite-' + Date.now() }] };
    }
    
    // Handle user creation
    if (text.includes('INSERT INTO users')) {
      return { 
        rows: [{ 
          id: 'mock-user-id-' + Date.now(),
          username: params[1],
          email: params[2]
        }] 
      };
    }
    
    // Handle organization creation
    if (text.includes('INSERT INTO organizations')) {
      return { 
        rows: [{ 
          id: 'mock-org-id-' + Date.now(),
          name: params[0]
        }] 
      };
    }
    
    // Handle organization user creation
    if (text.includes('INSERT INTO organization_users')) {
      return { rows: [] };
    }
    
    // Default response for unhandled queries
    console.log('⚠️ Unhandled query:', text);
    return { rows: [] };
  },
  
  connect: async () => {
    console.log('✅ Mock PostgreSQL connected');
    return { rows: [] };
  }
};

// Check if we should use MongoDB Atlas
const useMongoDB = process.env.MONGODB_URI && process.env.MONGODB_URI.includes('mongodb+srv');

if (useMongoDB) {
  console.log('✅ Using MongoDB Atlas for production');
  console.log('🔗 MongoDB URI:', process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
} else {
  console.log('✅ Using mock database for development');
  console.log('📊 Mock data loaded:', {
    users: mockData.users.length,
    organizations: mockData.organizations.length,
    organization_users: mockData.organization_users.length,
    media: mockData.media.length,
    document_versions: mockData.document_versions.length
  });
}

module.exports = mockPool;

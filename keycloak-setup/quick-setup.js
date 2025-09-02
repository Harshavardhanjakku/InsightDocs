const axios = require('axios');

const KEYCLOAK_URL = 'http://localhost:8080';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
const REALM_NAME = 'framesync';
const CLIENT_ID = 'framesync-client-public';

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

async function createRealm(token) {
  try {
    await axios.post(`${KEYCLOAK_URL}/admin/realms`, {
      realm: REALM_NAME,
      enabled: true
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Realm created successfully');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️ Realm already exists');
    } else {
      console.error('Failed to create realm:', error.response?.data || error.message);
      throw error;
    }
  }
}

async function createClient(token) {
  try {
    await axios.post(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`, {
      clientId: CLIENT_ID,
      enabled: true,
      protocol: 'openid-connect',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: true,
      redirectUris: ['http://localhost:3000/*'],
      webOrigins: ['http://localhost:3000']
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Client created successfully');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️ Client already exists');
    } else {
      console.error('Failed to create client:', error.response?.data || error.message);
      throw error;
    }
  }
}

async function createTestUser(token) {
  try {
    await axios.post(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users`, {
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      enabled: true,
      credentials: [{
        type: 'password',
        value: 'password123',
        temporary: false
      }]
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Test user created successfully');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️ Test user already exists');
    } else {
      console.error('Failed to create test user:', error.response?.data || error.message);
      throw error;
    }
  }
}

async function setupKeycloak() {
  console.log('🚀 Setting up Keycloak for InsightDocs...');
  
  try {
    // Wait for Keycloak to be ready
    console.log('⏳ Waiting for Keycloak to be ready...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const token = await getAdminToken();
    console.log('✅ Admin token obtained');
    
    await createRealm(token);
    await createClient(token);
    await createTestUser(token);
    
    console.log('\n🎉 Keycloak setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Go to http://localhost:3000');
    console.log('2. Click "Get Started"');
    console.log('3. Login with: testuser / password123');
    console.log('\n🔧 Manual setup (if needed):');
    console.log('- Admin Console: http://localhost:8080');
    console.log('- Admin credentials: admin / admin');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\n🔧 Please set up Keycloak manually:');
    console.log('1. Go to http://localhost:8080');
    console.log('2. Login with admin/admin');
    console.log('3. Create realm: framesync');
    console.log('4. Create client: framesync-client-public');
    console.log('5. Set redirect URIs: http://localhost:3000/*');
  }
}

setupKeycloak();

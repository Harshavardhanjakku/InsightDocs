const axios = require('axios');

async function testServer() {
  try {
    console.log('Testing server connection...');
    const response = await axios.get('http://localhost:3001/health');
    console.log('✅ Server is running! Response:', response.data);
    
    // Test user creation endpoint
    console.log('\nTesting user creation...');
    const userResponse = await axios.post('http://localhost:3001/users', {
      keycloak_id: 'test-keycloak-id',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user'
    });
    console.log('✅ User creation test:', userResponse.data);
    
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testServer();

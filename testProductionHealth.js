/**
 * Simple Production Health Check
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = 'https://backend-32fd.onrender.com';

console.log('🚀 Production Health Check\n');
console.log('API URL:', API_BASE_URL);
console.log('========================================\n');

/**
 * Test 1: Simple GET request to check server status
 */
async function testServerStatus() {
  console.log('📋 Test 1: Checking server status...\n');
  try {
    const response = await axios.get(`${API_BASE_URL}/`, {
      timeout: 10000
    });
    console.log('✅ Server is responding!');
    console.log('Status:', response.status);
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('✅ Server is accessible (got response)');
      console.log('Status:', error.response.status);
      console.log('This is expected for GET / if no route defined');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Connection refused');
    } else {
      console.log('⚠️  Response:', error.message);
    }
  }
  console.log('\n========================================\n');
}

/**
 * Test 2: Signup with very long timeout
 */
async function testSignup() {
  console.log('📝 Test 2: Testing Signup...\n');
  
  const testEmail = `test${Date.now()}@test.com`;
  
  try {
    console.log('Sending signup request for:', testEmail);
    console.log('(This may take a while if server is cold-starting...)\n');
    
    const response = await axios.post(`${API_BASE_URL}/api/signup`, {
      name: 'Test User',
      email: testEmail,
      password: 'TestPassword123'
    }, {
      timeout: 60000  // 60 second timeout
    });

    console.log('✅ Signup successful!');
    console.log('Status:', response.status);
    console.log('Firebase UID:', response.data.firebaseUid);
    console.log('User Email:', response.data.user.email);
    console.log('\n✅ Production backend is working!\n');
  } catch (error) {
    console.log('❌ Signup failed!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error);
    } else if (error.code === 'ECONNABORTED') {
      console.log('Error: Request timeout (30+ seconds)');
      console.log('The production server might be cold-starting or slow.');
    } else {
      console.log('Error:', error.message);
    }
  }
  console.log('\n========================================\n');
}

/**
 * Main execution
 */
async function runTests() {
  try {
    await testServerStatus();
    await testSignup();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

runTests();

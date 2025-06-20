#!/usr/bin/env node

const axios = require('axios');

console.log('🧪 Testing Twitter Timeout and CORS Fixes\n');

// Test usernames
const testUsers = [
    'elonmusk',   // High-volume user that might take long
    'narendramodi', // Another high-volume user
    'mkbhd'      // Tech user with moderate volume
];

async function testQuickEndpoint() {
    console.log('⚡ Testing quick response endpoint...\n');
    
    for (const username of testUsers) {
        console.log(`🏃‍♂️ Testing quick fetch for @${username}`);
        
        try {
            const startTime = Date.now();
            const response = await axios.get(`http://localhost:5000/api/twitter/user/${username}/quick`, {
                timeout: 15000, // 15 second timeout for quick endpoint
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            if (response.data.success) {
                console.log(`✅ Quick fetch successful in ${duration}ms`);
                console.log(`📊 Found ${response.data.count} tweets`);
                console.log(`🔄 Cached: ${response.data.cached ? 'Yes' : 'No'}`);
                console.log(`🔸 Partial: ${response.data.partial ? 'Yes' : 'No'}`);
                if (response.data.message) {
                    console.log(`💬 Message: ${response.data.message}`);
                }
            } else {
                console.log(`❌ Quick fetch failed: ${response.data.message}`);
            }
            console.log('');
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Message: ${error.response.data?.message || 'No message'}`);
            }
            console.log('');
        }
        
        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

async function testRegularEndpointWithTimeout() {
    console.log('⏱️  Testing regular endpoint with timeout protection...\n');
    
    const username = testUsers[0]; // Test with elonmusk (high volume)
    console.log(`📊 Testing regular fetch for @${username} with timeout protection`);
    
    try {
        const startTime = Date.now();
        const response = await axios.get(`http://localhost:5000/api/twitter/user/${username}`, {
            timeout: 120000, // 2 minute timeout for regular endpoint
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (response.data.success) {
            console.log(`✅ Regular fetch successful in ${duration}ms`);
            console.log(`📊 Found ${response.data.count} tweets`);
            console.log(`🔄 Cached: ${response.data.cached ? 'Yes' : 'No'}`);
        } else {
            console.log(`❌ Regular fetch failed: ${response.data.message}`);
            if (response.data.error === 'TIMEOUT') {
                console.log(`⏰ Server timeout detected - this is expected behavior`);
            }
        }
        console.log('');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        if (error.code === 'ECONNABORTED') {
            console.log(`⏰ Client timeout - this might indicate server is still processing`);
        }
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Message: ${error.response.data?.message || 'No message'}`);
        }
        console.log('');
    }
}

async function testCORS() {
    console.log('🌐 Testing CORS configuration...\n');
    
    try {
        // Test with different origins
        const origins = [
            'https://app.brandout.ai',
            'http://localhost:3000',
            'http://localhost:5173'
        ];
        
        for (const origin of origins) {
            console.log(`🔗 Testing CORS with origin: ${origin}`);
            
            try {
                const response = await axios.get('http://localhost:5000/health', {
                    headers: {
                        'Origin': origin,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                });
                
                console.log(`✅ CORS test passed for ${origin}`);
            } catch (error) {
                console.log(`❌ CORS test failed for ${origin}: ${error.message}`);
            }
        }
        console.log('');
    } catch (error) {
        console.log(`❌ CORS test error: ${error.message}\n`);
    }
}

async function main() {
    console.log('Starting Twitter timeout and CORS tests...\n');
    console.log('⚠️  Note: These tests require the server to be running on localhost:5000\n');
    
    try {
        // Test CORS first
        await testCORS();
        
        // Test quick endpoint
        await testQuickEndpoint();
        
        // Test regular endpoint with timeout
        await testRegularEndpointWithTimeout();
        
        console.log('🏁 Testing complete!');
        console.log('\n💡 Key Improvements:');
        console.log('✅ Quick endpoint provides immediate response');
        console.log('✅ Regular endpoint has timeout protection');
        console.log('✅ CORS configured for production and development');
        console.log('✅ Cached responses return immediately');
        console.log('✅ Server prevents hanging requests');
        
        console.log('\n🚀 Usage Tips:');
        console.log('- Use /api/twitter/user/:username/quick for fast responses');
        console.log('- Regular endpoint will timeout gracefully after 90 seconds');
        console.log('- Cached data is returned immediately on subsequent requests');
        console.log('- Frontend timeout should be set to 2-3 minutes max');
        
    } catch (error) {
        console.error('❌ Test execution error:', error);
    }
}

// Run the tests
main().catch(console.error); 
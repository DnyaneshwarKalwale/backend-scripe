#!/usr/bin/env node

const axios = require('axios');

console.log('🧪 Testing Proxy-Enabled Video Metadata Fetching\n');

// Test video IDs (known videos with good metadata)
const testVideoIds = [
    'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
    'jNQXAC9IVRw', // Me at the zoo (first YouTube video)
    'MfI4NurzYl0'  // A recent tech video
];

async function testVideoMetadataFetching() {
    console.log('📹 Testing enhanced video metadata fetching with proxy...\n');
    
    for (const videoId of testVideoIds) {
        console.log(`🎥 Testing metadata fetching for video: ${videoId}`);
        
        try {
            // Test the direct metadata endpoint
            const response = await axios.post('http://localhost:5000/api/youtube/video-metadata', {
                videoId: videoId
            }, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data.success && response.data.data) {
                const metadata = response.data.data;
                console.log(`✅ Success! Metadata fetched for ${videoId}`);
                console.log(`📺 Title: ${metadata.title || 'Not found'}`);
                console.log(`📺 Channel: ${metadata.channelName || 'Not found'}`);
                console.log(`⏱️  Duration: ${metadata.duration || 'N/A'}`);
                console.log(`👀 Views: ${metadata.viewCount || 0}`);
                console.log(`🖼️  Thumbnail: ${metadata.thumbnail ? 'Found' : 'Not found'}`);
                console.log(`📅 Upload Date: ${metadata.uploadDate || 'Not found'}`);
                console.log('');
            } else {
                console.log(`❌ Failed: ${response.data.message || 'Unknown error'}`);
                console.log('');
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Message: ${error.response.data?.message || 'No message'}`);
            }
            console.log('');
        }
        
        // Wait a bit between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

async function testChannelVideosFetching() {
    console.log('📺 Testing channel videos fetching with proxy-enabled duration...\n');
    
    const testChannels = [
        '@mkbhd',
        '@MrBeast'
    ];
    
    for (const channel of testChannels) {
        console.log(`📺 Testing channel: ${channel}`);
        
        try {
            const response = await axios.post('http://localhost:5000/api/youtube/channel', {
                channelName: channel
            }, {
                timeout: 60000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data.success && response.data.data) {
                const videos = response.data.data;
                console.log(`✅ Success! Found ${videos.length} videos`);
                
                // Check how many videos have duration
                const videosWithDuration = videos.filter(v => v.duration !== 'N/A');
                console.log(`⏱️  Videos with duration: ${videosWithDuration.length}/${videos.length}`);
                
                // Show first few videos with their durations
                console.log('📋 Sample videos:');
                videos.slice(0, 3).forEach((video, index) => {
                    console.log(`   ${index + 1}. ${video.title.substring(0, 50)}...`);
                    console.log(`      Duration: ${video.duration}, Views: ${video.view_count}`);
                });
                console.log('');
            } else {
                console.log(`❌ Failed: ${response.data.message || 'Unknown error'}`);
                console.log('');
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Message: ${error.response.data?.message || 'No message'}`);
            }
            console.log('');
        }
        
        // Wait between channel requests
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

async function main() {
    console.log('Starting proxy-enabled video metadata tests...\n');
    console.log('⚠️  Note: These tests require the server to be running on localhost:5000\n');
    
    try {
        // Test individual video metadata fetching
        await testVideoMetadataFetching();
        
        // Test channel videos fetching with duration
        await testChannelVideosFetching();
        
        console.log('🏁 Testing complete!');
        console.log('\n💡 Tips:');
        console.log('- If duration is still showing as "N/A", check proxy configuration');
        console.log('- Verify that Lightning Proxies credentials are correct');
        console.log('- Check server logs for proxy usage confirmations');
        console.log('- Make sure the server is running: npm start');
        
    } catch (error) {
        console.error('❌ Test execution error:', error);
    }
}

// Run the tests
main().catch(console.error); 
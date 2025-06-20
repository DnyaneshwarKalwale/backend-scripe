const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "N/A";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
};

async function testProxyStrategies() {
  console.log('=== Testing Proxy Strategies for YouTube Bot Detection Bypass ===');
  
  const testVideoId = 'dQw4w9WgXcQ';
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
  const ytDlpCommand = 'yt-dlp';
  
  // Get proxy settings from environment
  const useProxy = process.env.USE_PROXY === 'true';
  const proxyUrl = process.env.PROXY_URL || null;
  
  console.log(`Proxy enabled: ${useProxy}`);
  console.log(`Proxy URL: ${proxyUrl || 'Not set'}`);
  
  // Free proxy examples (you can replace with working ones)
  const freeProxies = [
    'http://proxy-server.com:8080',  // Replace with actual working proxy
    'socks5://127.0.0.1:1080',       // Local SOCKS5 if available
    // Add more working proxies here
  ];
  
  const strategies = [
    // Strategy 1: Android client with configured proxy
    {
      name: 'Android Client with Proxy',
      cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=android" ${proxyUrl && useProxy ? `--proxy "${proxyUrl}"` : ''} "${videoUrl}"`
    },
    
    // Strategy 2: iOS client with configured proxy
    {
      name: 'iOS Client with Proxy', 
      cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=ios" ${proxyUrl && useProxy ? `--proxy "${proxyUrl}"` : ''} "${videoUrl}"`
    },
    
    // Strategy 3: TV client with configured proxy
    {
      name: 'TV Client with Proxy',
      cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=tv_embedded" ${proxyUrl && useProxy ? `--proxy "${proxyUrl}"` : ''} "${videoUrl}"`
    },
    
    // Strategy 4: Direct minimal approach
    {
      name: 'Direct Minimal',
      cmd: `${ytDlpCommand} --print duration "${videoUrl}"`
    },
    
    // Strategy 5: Android without proxy (fallback)
    {
      name: 'Android Client (No Proxy)',
      cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=android" "${videoUrl}"`
    }
  ];
  
  let successCount = 0;
  
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    console.log(`\n🔄 Testing Strategy ${i + 1}: ${strategy.name}`);
    console.log(`Command: ${strategy.cmd}`);
    
    try {
      const { stdout } = await execPromise(strategy.cmd, { timeout: 20000 });
      
      let duration = null;
      let title = null;
      
      if (strategy.name === 'Direct Minimal') {
        // Handle --print duration output
        const lines = stdout.trim().split('\n');
        if (lines.length >= 1 && lines[0] && !isNaN(lines[0])) {
          duration = parseInt(lines[0], 10);
        }
      } else {
        // Handle JSON output
        try {
          const metadata = JSON.parse(stdout);
          duration = metadata.duration;
          title = metadata.title;
        } catch (parseError) {
          console.log(`❌ Failed to parse JSON output`);
          continue;
        }
      }
      
      if (duration && duration > 0) {
        const formattedDuration = formatDuration(duration);
        console.log(`✅ SUCCESS: Duration extracted: ${formattedDuration}`);
        if (title) console.log(`   Title: ${title}`);
        successCount++;
        
        // If we found a working strategy, we can stop here
        console.log(`\n🎉 Found working strategy! Strategy ${i + 1} (${strategy.name}) works.`);
        break;
      } else {
        console.log(`❌ No duration found in output`);
      }
    } catch (error) {
      const errorMsg = error.message.split('\n')[0];
      console.log(`❌ FAILED: ${errorMsg}`);
      
      // Check for specific error types
      if (errorMsg.includes('Sign in to confirm you\'re not a bot')) {
        console.log(`   🤖 Bot detection triggered`);
      } else if (errorMsg.includes('proxy')) {
        console.log(`   🔗 Proxy connection issue`);
      }
    }
  }
  
  console.log(`\n=== Test Results ===`);
  console.log(`Successful strategies: ${successCount}/${strategies.length}`);
  
  if (successCount === 0) {
    console.log('\n❌ All strategies failed. Recommendations:');
    console.log('1. Set up a working proxy server');
    console.log('2. Try different proxy providers');
    console.log('3. Use residential proxies instead of datacenter proxies');
    console.log('4. Consider using a VPN on your server');
    
    console.log('\n💡 Quick setup:');
    console.log('export USE_PROXY=true');
    console.log('export PROXY_URL="http://your-proxy:port"');
  } else {
    console.log('✅ Duration extraction should work with the current setup!');
  }
  
  console.log('\n📖 For more help, see: PROXY_SETUP_GUIDE.md');
}

testProxyStrategies().catch(console.error); 
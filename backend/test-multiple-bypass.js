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

async function testMultipleBypass() {
  console.log('=== Testing Multiple Bypass Strategies ===');
  
  const testVideoId = 'dQw4w9WgXcQ';
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
  const ytDlpCommand = 'yt-dlp';
  
  const bypassStrategies = [
    // Strategy 1: Mobile client bypass
    { name: 'Android Client', cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=android" "${videoUrl}"` },
    
    // Strategy 2: iOS client bypass  
    { name: 'iOS Client', cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=ios" "${videoUrl}"` },
    
    // Strategy 3: TV client bypass
    { name: 'TV Embedded Client', cmd: `${ytDlpCommand} --dump-json --no-download --extractor-args "youtube:player_client=tv_embedded" "${videoUrl}"` },
    
    // Strategy 4: Original web bypass
    { name: 'Web Client', cmd: `${ytDlpCommand} --dump-json --no-download --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --referer "https://www.youtube.com/" --extractor-args "youtube:player_client=web" "${videoUrl}"` }
  ];
  
  let successCount = 0;
  
  for (let i = 0; i < bypassStrategies.length; i++) {
    const strategy = bypassStrategies[i];
    console.log(`\n🔄 Testing Strategy ${i + 1}: ${strategy.name}`);
    
    try {
      const { stdout } = await execPromise(strategy.cmd, { timeout: 20000 });
      const metadata = JSON.parse(stdout);
      
      if (metadata.duration) {
        const duration = formatDuration(metadata.duration);
        console.log(`✅ SUCCESS: Duration extracted: ${duration}`);
        console.log(`   Title: ${metadata.title || 'N/A'}`);
        console.log(`   Channel: ${metadata.uploader || metadata.channel || 'N/A'}`);
        successCount++;
        
        // If we got one working, we can stop here for the test
        console.log(`\n🎉 Found working strategy! Strategy ${i + 1} (${strategy.name}) works.`);
        break;
      } else {
        console.log(`❌ No duration found in metadata`);
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message.split('\n')[0]}`);
    }
  }
  
  console.log(`\n=== Test Results ===`);
  console.log(`Successful strategies: ${successCount}/${bypassStrategies.length}`);
  
  if (successCount === 0) {
    console.log('❌ All strategies failed. YouTube bot detection is very aggressive on this server.');
    console.log('💡 Consider using a proxy service or VPN for the server.');
  } else {
    console.log('✅ At least one strategy works! Duration extraction should work now.');
  }
}

testMultipleBypass().catch(console.error); 
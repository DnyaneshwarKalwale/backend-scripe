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

async function testBotBypass() {
  console.log('=== Testing Bot Detection Bypass ===');
  
  const testVideoId = 'dQw4w9WgXcQ';
  const videoUrl = `https://www.youtube.com/watch?v=${testVideoId}`;
  
  // Test with bot detection bypass
  console.log('🔄 Testing with bot detection bypass...');
  try {
    const command = `yt-dlp --dump-json --no-download --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --referer "https://www.youtube.com/" --add-header "Accept-Language:en-US,en;q=0.9" --extractor-args "youtube:player_client=web" "${videoUrl}"`;
    
    console.log('Command:', command);
    const { stdout } = await execPromise(command, { timeout: 30000 });
    const metadata = JSON.parse(stdout);
    
    if (metadata.duration) {
      const formattedDuration = formatDuration(metadata.duration);
      console.log('✅ Bot bypass successful!');
      console.log('   Duration:', formattedDuration);
      console.log('   Title:', metadata.title);
      console.log('   Channel:', metadata.channel);
    } else {
      console.log('❌ No duration found in metadata');
    }
  } catch (error) {
    console.log('❌ Bot bypass failed:', error.message);
    
    // Try alternative method
    console.log('\n🔄 Trying alternative bypass method...');
    try {
      const altCommand = `yt-dlp --print duration --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --extractor-args "youtube:player_client=web,youtube:player_skip=webpage" "${videoUrl}"`;
      
      const { stdout } = await execPromise(altCommand, { timeout: 30000 });
      const duration = parseFloat(stdout.trim());
      
      if (duration && duration > 0) {
        console.log('✅ Alternative bypass successful!');
        console.log('   Duration:', formatDuration(duration));
      } else {
        console.log('❌ Alternative bypass failed');
      }
    } catch (altError) {
      console.log('❌ Alternative bypass failed:', altError.message);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

testBotBypass().catch(console.error); 
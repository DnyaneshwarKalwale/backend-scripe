const axios = require('axios');

// Test video ID
const TEST_VIDEO_ID = 'dQw4w9WgXcQ';
const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

async function testYouTubeScraping() {
  console.log('Testing YouTube page scraping for duration...');
  console.log(`Video: ${TEST_VIDEO_URL}`);
  
  try {
    const response = await axios.get(TEST_VIDEO_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    
    const html = response.data;
    console.log('✅ YouTube page fetched successfully');
    
    // Try to extract duration
    const patterns = [
      /"lengthSeconds":"(\d+)"/,
      /approxDurationMs":"(\d+)"/,
      /"duration":{"simpleText":"([^"]+)"/,
      /"lengthText":{"simpleText":"([^"]+)"/
    ];
    
    let durationFound = false;
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`✅ Duration pattern found: ${pattern.toString()}`);
        console.log(`Raw match: ${match[1]}`);
        
        let durationSeconds;
        if (pattern.toString().includes('simpleText')) {
          const timeString = match[1];
          const timeParts = timeString.split(':').map(part => parseInt(part));
          if (timeParts.length === 2) {
            durationSeconds = timeParts[0] * 60 + timeParts[1];
          } else if (timeParts.length === 3) {
            durationSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
          }
        } else {
          durationSeconds = pattern.toString().includes('Ms') ? Math.floor(parseInt(match[1]) / 1000) : parseInt(match[1]);
        }
        
        if (durationSeconds) {
          console.log(`✅ Parsed duration: ${formatDuration(durationSeconds)}`);
          durationFound = true;
          break;
        }
      }
    }
    
    if (!durationFound) {
      console.log('❌ No duration patterns matched');
    }
  } catch (error) {
    console.log('❌ YouTube page scraping failed:', error.message);
  }
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "N/A";
  
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

testYouTubeScraping().catch(console.error); 
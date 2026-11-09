import { exec } from 'child_process';
import { promisify } from 'util';
import { resolveLk21Stream } from '../services/lk21Api.js';

const execAsync = promisify(exec);

async function curlFetch(url) {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const cmd = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

const testEps = [
  'make-me-tingle-season-1-episode-1-2026',
  'lets-go-season-1-episode-1-2026',
  'a-love-other-than-yours-season-1-episode-1-2026',
  'dive-into-you-season-1-episode-1-2026'
];

async function run() {
  for (const ep of testEps) {
    const url = `https://tv.nontondrama.vip/${ep}`;
    console.log(`\nTesting ${ep}...`);
    try {
      const html = await curlFetch(url);
      const playerListMatch = html.match(/<ul[^>]*id="player-list"[^>]*>([\s\S]*?)<\/ul>/i);
      if (playerListMatch) {
        const serverRegex = /<a[^>]*data-url="([^"]+)"[^>]*data-server="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let sm;
        const servers = [];
        while ((sm = serverRegex.exec(playerListMatch[1])) !== null) {
          servers.push({ name: sm[3], type: sm[2], url: sm[1] });
        }
        console.log(`  Found ${servers.length} servers:`, servers.map(s => s.name));
        const p2p = servers.find(s => s.type.toLowerCase() === 'p2p');
        if (p2p) {
          const m3u8 = await resolveLk21Stream(p2p.url);
          console.log(`  -> P2P M3U8 resolved:`, m3u8 ? 'SUCCESS: ' + m3u8.slice(0, 60) + '...' : 'FAILED');
        }
      } else {
        console.log('  No player list found! HTML length:', html.length);
      }
    } catch (e) {
      console.error('  Error:', e.message);
    }
  }
}
run();

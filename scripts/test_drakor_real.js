import { exec } from 'child_process';
import { promisify } from 'util';
import { resolveLk21Stream } from '../services/lk21Api.js';

const execAsync = promisify(exec);

async function test() {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  // 1. Get Drakor list
  const drakorUrl = 'https://tv.nontondrama.vip/maraton-drakor/';
  const cmd1 = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${drakorUrl}"`;
  const { stdout: listHtml } = await execAsync(cmd1);
  const articles = [...listHtml.matchAll(/<article[^>]*itemtype="https:\/\/schema\.org\/Movie"[^>]*>([\s\S]*?)<\/article>/gi)];
  console.log('Drakor articles found:', articles.length);

  if (articles.length > 0) {
    const firstArt = articles[0][1];
    const linkMatch = firstArt.match(/href="([^"]+)"/);
    const titleMatch = firstArt.match(/itemprop="name"[^>]*>([^<]+)<\/h3>/) || firstArt.match(/alt="([^"]+)"/);
    console.log('First Drakor:', titleMatch ? titleMatch[1] : 'Unknown', 'Link:', linkMatch[1]);

    const detailUrl = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://tv.nontondrama.vip${linkMatch[1]}`;
    const cmd2 = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${detailUrl}"`;
    const { stdout: detailHtml } = await execAsync(cmd2);

    // Extract script
    const scriptMatches = [...detailHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of scriptMatches) {
      if (s[1].includes('"episode_no"')) {
        const eps = JSON.parse(s[1].trim());
        const firstEp = eps['1']?.[0];
        console.log('First Episode of Drakor:', firstEp);

        const epUrl = `https://tv.nontondrama.vip/${firstEp.slug}`;
        console.log('Fetching episode URL:', epUrl);
        const cmd3 = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${epUrl}"`;
        const { stdout: epHtml } = await execAsync(cmd3);

        const playerListMatch = epHtml.match(/<ul[^>]*id="player-list"[^>]*>([\s\S]*?)<\/ul>/i);
        if (playerListMatch) {
          console.log('Drakor Player List:');
          const serverRegex = /<a[^>]*data-url="([^"]+)"[^>]*data-server="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
          let sm;
          while ((sm = serverRegex.exec(playerListMatch[1])) !== null) {
            console.log('  Server:', sm[3], 'Type:', sm[2], 'URL:', sm[1]);
            if (sm[2].toLowerCase() === 'p2p') {
              const stream = await resolveLk21Stream(sm[1]);
              console.log('  -> P2P Stream resolved to:', stream);
            }
          }
        } else {
          console.log('No player list found in epHtml. Length:', epHtml.length);
        }
        break;
      }
    }
  }
}
test();

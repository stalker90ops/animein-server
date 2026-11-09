import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function test() {
  try {
    const cmd = `curl.exe -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "https://tv.nontondrama.vip/latest-series/"`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    console.log('Latest-series HTML length:', stdout.length);
    const articles = [...stdout.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)];
    console.log('Articles found:', articles.length);
    if (articles.length > 0) {
      const first = articles[0][1];
      const linkMatch = first.match(/href="([^"]+)"/);
      const titleMatch = first.match(/itemprop="name"[^>]*>([^<]+)<\/h3>/) || first.match(/alt="([^"]+)"/);
      console.log('First article:', titleMatch ? titleMatch[1] : 'No title', 'Link:', linkMatch ? linkMatch[1] : 'No link');

      if (linkMatch) {
        const detailUrl = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://tv.nontondrama.vip${linkMatch[1]}`;
        console.log('Fetching detail:', detailUrl);
        const detailCmd = `curl.exe -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${detailUrl}"`;
        const { stdout: detailHtml } = await execAsync(detailCmd, { maxBuffer: 10 * 1024 * 1024 });
        console.log('Detail HTML length:', detailHtml.length);
        // Find episode links
        const epMatches = [...detailHtml.matchAll(/<a[^>]*href="([^"]*episode[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
        console.log('Episode links found:', epMatches.length, epMatches.slice(0, 3).map(m => m[1]));

        // Check embedded script
        const scriptMatches = [...detailHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
        for (const s of scriptMatches) {
          if (s[1].includes('"episode_no"')) {
            console.log('Found script with episode_no! Length:', s[1].length);
          }
        }

        // If episode link found, fetch episode page to inspect player-list
        if (epMatches.length > 0) {
          const epUrl = epMatches[0][1].startsWith('http') ? epMatches[0][1] : `https://tv.nontondrama.vip${epMatches[0][1]}`;
          console.log('Fetching episode:', epUrl);
          const epCmd = `curl.exe -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${epUrl}"`;
          const { stdout: epHtml } = await execAsync(epCmd, { maxBuffer: 10 * 1024 * 1024 });
          console.log('Episode HTML length:', epHtml.length);
          const playerList = epHtml.match(/<ul[^>]*id="player-list"[^>]*>([\s\S]*?)<\/ul>/i);
          if (playerList) {
            console.log('Player-list found:', playerList[1]);
          } else {
            console.log('No player list. Checking iframes or embeds:');
            const iframes = [...epHtml.matchAll(/<iframe[^>]*src="([^"]+)"/gi)];
            console.log('Iframes:', iframes.map(i => i[1]));
          }
        }
      }
    } else {
      console.log('Sample output:', stdout.slice(0, 500));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();

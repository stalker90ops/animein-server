import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function test() {
  const cmd = `curl.exe -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "https://tv.nontondrama.vip/lets-go-2026"`;
  const { stdout: detailHtml } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  const scriptMatches = [...detailHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scriptMatches) {
    if (s[1].includes('"episode_no"')) {
      console.log('Script content preview:');
      console.log(s[1].slice(0, 500));
      try {
        const parsed = JSON.parse(s[1].trim());
        console.log('Parsed seasons:', Object.keys(parsed));
        console.log('Season 1 first ep:', parsed['1']?.[0]);
      } catch (e) {
        console.log('Parse error:', e.message);
      }
    }
  }
}
test();

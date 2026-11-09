import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkUrl(url) {
  try {
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const cmd = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const articles = [...stdout.matchAll(/<article[^>]*itemtype="https:\/\/schema\.org\/Movie"[^>]*>([\s\S]*?)<\/article>/gi)];
    console.log(url, '-> Articles found:', articles.length);
    if (articles.length > 0) {
      const titles = articles.slice(0, 3).map(a => {
        const tm = a[1].match(/itemprop="name"[^>]*>([^<]+)<\/h3>/) || a[1].match(/alt="([^"]+)"/);
        return tm ? tm[1].trim() : 'Unknown';
      });
      console.log('Sample titles:', titles);
    }
  } catch (e) {
    console.error(url, 'error:', e.message);
  }
}

async function run() {
  await checkUrl('https://tv.nontondrama.vip/latest-series/');
  await checkUrl('https://tv.nontondrama.vip/maraton-drakor/');
  await checkUrl('https://tv.nontondrama.vip/series/asian/');
  await checkUrl('https://tv.nontondrama.vip/series/west/');
  await checkUrl('https://tv.nontondrama.vip/top-series-today/');
}
run();

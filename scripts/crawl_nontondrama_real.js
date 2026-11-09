import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NONTONDRAMA_BASE = 'https://tv.nontondrama.vip';

function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'");
}

async function curlFetch(url) {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const cmd = `${curlCmd} -s -L --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function parseArticles(html) {
  const articles = [];
  const articleRegex = /<article[^>]*itemtype="https:\/\/schema\.org\/Movie"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const art = match[1];
    const urlMatch = art.match(/href="([^"]+)"/);
    const titleMatch = art.match(/itemprop="name"[^>]*>([^<]+)<\/h3>/) ||
                       art.match(/class="poster-title"[^>]*>([^<]+)<\/h3>/) ||
                       art.match(/alt="([^"]+)"/);
    const imgMatch = art.match(/<img[^>]*\bdata-src="(https?:\/\/[^"]+)"/i) ||
                     art.match(/<source[^>]*type="image\/jpeg"[^>]*\b(?:data-srcset|srcset)="(https?:\/\/[^"\s]+)"/i) ||
                     art.match(/<img[^>]*\bsrc="(https?:\/\/[^"]+)"/i) ||
                     art.match(/data-src="([^"]+)"/) ||
                     art.match(/src="([^"]+)"/);
    const ratingMatch = art.match(/itemprop="ratingValue">([^<]+)<\/span>/) ||
                        art.match(/class="rating"[^>]*>([\s\S]*?)<\/span>/);
    const genreMatch = art.match(/itemprop="genre"\s+content="([^"]+)"/) ||
                       art.match(/class="genre"[^>]*>([^<]+)<\/div>/);
    const yearMatch = art.match(/class="year"[^>]*>([^<]+)<\/span>/);
    const epMatch = art.match(/class="episode[^"]*">([\s\S]*?)<\/span>/);
    const durationMatch = art.match(/class="duration"[^>]*>([^<]+)<\/span>/);

    if (urlMatch && titleMatch) {
      const rawUrl = urlMatch[1];
      const slug = rawUrl.replace(/^\//, '').replace(/\/$/, '');
      const rawTitle = decodeEntities(titleMatch[1].replace(/Sub\s*Indo.*$/i, '').trim());

      let episodeText = '';
      if (epMatch) episodeText = epMatch[1].replace(/<[^>]+>/g, '').trim();
      const seasonText = durationMatch ? durationMatch[1].trim() : '';
      const yearVal = yearMatch ? yearMatch[1].trim() : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');

      articles.push({
        id: `series_${slug}`,
        source: 'nontondrama',
        type: 'series',
        slug,
        title: rawTitle,
        poster: imgMatch ? imgMatch[1] : '',
        rating: ratingMatch ? ratingMatch[1].replace(/<[^>]+>/g, '').trim() : '8.0',
        genres: genreMatch ? genreMatch[1].trim() : 'Drama, Romance',
        year: yearVal,
        episodeBadge: episodeText,
        seasonBadge: seasonText,
        url: `${NONTONDRAMA_BASE}/${slug}`
      });
    }
  }
  return articles;
}

async function crawlEpisodeServers(episodeSlug) {
  try {
    const url = `${NONTONDRAMA_BASE}/${episodeSlug}`;
    const html = await curlFetch(url);
    const playerListMatch = html.match(/<ul[^>]*id="player-list"[^>]*>([\s\S]*?)<\/ul>/i);
    if (!playerListMatch) return null;

    const servers = [];
    const serverRegex = /<a[^>]*data-url="([^"]+)"[^>]*data-server="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let sm;
    while ((sm = serverRegex.exec(playerListMatch[1])) !== null) {
      const serverType = sm[2].toLowerCase();
      const embedUrl = sm[1];
      const isP2P = serverType === 'p2p';
      servers.push({
        name: isP2P ? 'Server Direct HD (P2P)' : `Server ${sm[3].toUpperCase()}`,
        serverType,
        embedUrl,
        directStreamUrl: `/api/movies/lk21/stream.m3u8?embedUrl=${encodeURIComponent(embedUrl)}`,
        embedProxyUrl: `/api/movies/lk21/embed-frame?url=${encodeURIComponent(embedUrl)}`
      });
    }

    servers.sort((a, b) => {
      if (a.serverType === 'p2p') return -1;
      if (b.serverType === 'p2p') return 1;
      return 0;
    });

    return servers;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('--- Crawling Real NontonDrama Series & Native Video Servers ---');

  const categories = [
    { cat: 'drakor', url: `${NONTONDRAMA_BASE}/maraton-drakor/` },
    { cat: 'drakor', url: `${NONTONDRAMA_BASE}/maraton-drakor/page/2/` },
    { cat: 'asian', url: `${NONTONDRAMA_BASE}/series/asian/` },
    { cat: 'asian', url: `${NONTONDRAMA_BASE}/series/asian/page/2/` },
    { cat: 'west', url: `${NONTONDRAMA_BASE}/series/west/` },
    { cat: 'west', url: `${NONTONDRAMA_BASE}/series/west/page/2/` },
    { cat: 'latest', url: `${NONTONDRAMA_BASE}/latest-series/` },
    { cat: 'top', url: `${NONTONDRAMA_BASE}/top-series-today/` }
  ];

  const seriesMap = {};
  const episodesServersMap = {};

  for (const { cat, url } of categories) {
    console.log(`Fetching category ${cat} from ${url}...`);
    try {
      const html = await curlFetch(url);
      const items = parseArticles(html);
      console.log(`  Found ${items.length} series in ${url}`);
      for (const item of items) {
        if (!seriesMap[item.slug]) {
          seriesMap[item.slug] = { ...item, category: cat };
        }
      }
    } catch (e) {
      console.warn(`  Failed ${url}:`, e.message);
    }
  }

  const allSlugs = Object.keys(seriesMap);
  console.log(`Total unique series discovered: ${allSlugs.length}`);

  // Fetch details and episodes for the series
  let count = 0;
  for (const slug of allSlugs) {
    count++;
    console.log(`[${count}/${allSlugs.length}] Fetching details for ${slug}...`);
    try {
      const detailHtml = await curlFetch(`${NONTONDRAMA_BASE}/${slug}`);
      const synMatch = detailHtml.match(/<blockquote[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/blockquote>/i) ||
                       detailHtml.match(/<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
      if (synMatch) {
        seriesMap[slug].synopsis = synMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // Extract real episodes from script
      let seasons = {};
      const scriptMatches = [...detailHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scriptMatches) {
        if (s[1].includes('"episode_no"')) {
          try {
            seasons = JSON.parse(s[1].trim());
          } catch (_) {}
          break;
        }
      }

      seriesMap[slug].seasons = seasons;
      let totalEpisodes = 0;
      for (const eps of Object.values(seasons)) totalEpisodes += eps.length;
      seriesMap[slug].totalEpisodes = totalEpisodes;
      seriesMap[slug].totalSeasons = Object.keys(seasons).length;

      // Crawl servers for the first 3 episodes of each series (most accessed)
      for (const [sNum, eps] of Object.entries(seasons)) {
        for (const ep of eps.slice(0, 3)) {
          if (!episodesServersMap[ep.slug]) {
            const srvs = await crawlEpisodeServers(ep.slug);
            if (srvs && srvs.length > 0) {
              episodesServersMap[ep.slug] = {
                title: ep.title,
                streamUrl: srvs[0]?.directStreamUrl || '',
                servers: srvs
              };
              console.log(`   + Episode ${ep.slug}: ${srvs.length} servers (${srvs.map(x => x.name).join(', ')})`);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`  Failed detail for ${slug}:`, e.message);
    }
  }

  // Merge into full cache
  const fullCache = {
    series: seriesMap,
    episodes: episodesServersMap
  };

  const outPath1 = path.join(__dirname, '..', 'database', 'nontondrama_real_cache.json');
  const outPath2 = path.join('c:', 'Users', 'STM 80', 'Documents', 'ai project', 'web', 'server', 'database', 'nontondrama_real_cache.json');

  fs.writeFileSync(outPath1, JSON.stringify(fullCache, null, 2), 'utf8');
  console.log(`Saved real cache to ${outPath1} (${Object.keys(seriesMap).length} series, ${Object.keys(episodesServersMap).length} episodes with native servers)`);

  try {
    fs.writeFileSync(outPath2, JSON.stringify(fullCache, null, 2), 'utf8');
  } catch (_) {}
}

main().catch(console.error);

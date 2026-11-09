import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DIRECT_API_URL = 'https://xyz-api.animein.net';
const PROXY_BASE_URL = 'https://animeinweb.com/api/proxy';
const PROXY_SECRET = 'animein-secure-proxy-key-123';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function curlJson(targetUrl, extraHeaders = []) {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const args = [
    '-s',
    '-L',
    '--max-time', '15',
    '-H', `User-Agent: ${USER_AGENT}`,
    '-H', 'Referer: https://animeinweb.com/',
    '-H', 'Accept: application/json, text/plain, */*',
    ...extraHeaders,
    targetUrl
  ];
  const { stdout } = await execFileAsync(curlCmd, args, { maxBuffer: 10 * 1024 * 1024 });
  if (!stdout || !stdout.trim().startsWith('{')) {
    throw new Error('Non-JSON response from curl');
  }
  return JSON.parse(stdout);
}

export async function fetchFromAnimeIn(endpoint, params = {}) {
  const buildUrl = (base) => {
    const u = new URL(`${base}${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        u.searchParams.append(key, params[key]);
      }
    });
    return u.toString();
  };

  const directUrl = buildUrl(DIRECT_API_URL);
  const proxyUrl = buildUrl(PROXY_BASE_URL);

  // 1. Primary: Direct xyz-api.animein.net via curl (works on Vercel Serverless & Local)
  try {
    const json = await curlJson(directUrl);
    if (!json.error && json.data !== undefined) {
      return json.data;
    }
  } catch (_) {}

  // 2. Secondary: animeinweb.com/api/proxy via curl
  try {
    const json = await curlJson(proxyUrl, ['-H', `x-proxy-secret: ${PROXY_SECRET}`]);
    if (!json.error && json.data !== undefined) {
      return json.data;
    }
  } catch (_) {}

  // 3. Fallback: Native fetch to directUrl then proxyUrl
  for (const [target, headers] of [
    [directUrl, { 'User-Agent': USER_AGENT, 'Referer': 'https://animeinweb.com/', 'Accept': 'application/json' }],
    [proxyUrl, { 'User-Agent': USER_AGENT, 'Referer': 'https://animeinweb.com/', 'x-proxy-secret': PROXY_SECRET, 'Accept': 'application/json' }]
  ]) {
    try {
      const response = await fetch(target, { headers, signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const data = await response.json();
        if (!data.error && data.data !== undefined) {
          return data.data;
        }
      }
    } catch (_) {}
  }

  throw new Error(`AnimeIn API unreachable for ${endpoint}`);
}

// 1. Home data (Slider, Hot, New, Today, Popular, Random)
export async function getHomeData(day = 'Kamis', limit = 30) {
  return fetchFromAnimeIn('/3/2/home/data', { day, limit });
}

// 2. Explore / Search movies
export async function exploreMovies({
  keyword = '',
  q = '',
  genre_in = '',
  genreIds = [],
  status = '',
  sort = 'views',
  page = 0
} = {}) {
  const params = {
    sort: sort || 'views',
    page: String(page || 0)
  };

  const searchTerm = (keyword || q || '').trim();
  if (searchTerm) params.keyword = searchTerm;

  let genresJoined = '';
  if (Array.isArray(genreIds) && genreIds.length > 0) {
    genresJoined = genreIds.join(',');
  } else if (genre_in) {
    genresJoined = genre_in;
  }
  if (genresJoined && genresJoined !== 'All') {
    params.genre_in = genresJoined;
  }

  if (status && status !== 'All') {
    params.status = status;
  }

  return fetchFromAnimeIn('/3/2/explore/movie', params);
}

// 3. Genres
export async function getGenres() {
  return fetchFromAnimeIn('/3/2/explore/genre');
}

// 4. Movie / Anime Detail
export async function getMovieDetail(id) {
  return fetchFromAnimeIn(`/3/2/movie/detail/${id}`);
}

// 5. Fetch ALL episodes (loops pages automatically so all 100+ episodes are fetched)
export async function getAllMovieEpisodes(id) {
  let allEpisodes = [];
  let page = 0;

  while (page <= 50) {
    const params = page > 0 ? { page } : {};
    try {
      const res = await fetchFromAnimeIn(`/3/2/movie/episode/${id}`, params);
      const eps = res?.episode || [];
      if (!eps.length) break;

      allEpisodes.push(...eps);
      if (eps.length < 30) break; // Last page reached
      page++;
    } catch (err) {
      console.error(`Page ${page} error for anime ${id}:`, err.message);
      break;
    }
  }

  // Deduplicate by episode ID
  const seen = new Set();
  const unique = [];
  for (const ep of allEpisodes) {
    if (!seen.has(ep.id)) {
      seen.add(ep.id);
      unique.push(ep);
    }
  }

  return { episode: unique };
}

// 6. Episode Stream & Servers (Direct MP4, 360p, 480p, 720p, 1080p, Embed)
export async function getEpisodeStream(episodeId) {
  return fetchFromAnimeIn(`/3/2/episode/streamnew/${episodeId}`);
}

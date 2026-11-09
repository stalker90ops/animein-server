const BASE_URL = 'https://animeinweb.com/api/proxy';
const PROXY_SECRET = 'animein-secure-proxy-key-123';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const defaultHeaders = {
  'User-Agent': USER_AGENT,
  'x-proxy-secret': PROXY_SECRET,
  'Accept': 'application/json, text/plain, */*'
};

export async function fetchFromAnimeIn(endpoint, params = {}) {
  try {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    const response = await fetch(url.toString(), {
      headers: defaultHeaders
    });

    if (!response.ok) {
      throw new Error(`AnimeIn API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.message || 'Error from AnimeIn API');
    }

    return data.data;
  } catch (error) {
    console.error(`Failed to fetch from AnimeIn [${endpoint}]:`, error.message);
    throw error;
  }
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

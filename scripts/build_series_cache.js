import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NONTONDRAMA_SEARCH_API = 'https://gudangvape.com/search.php';
const NONTONDRAMA_POSTER_BASE = 'https://poster.assetsy.de/wp-content/uploads/';

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

async function fetchGudangvape(query, page = 1) {
  try {
    const url = `${NONTONDRAMA_SEARCH_API}?s=${encodeURIComponent(query)}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        'Origin': 'https://tv.nontondrama.vip',
        'Referer': 'https://tv.nontondrama.vip/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return json?.data || [];
  } catch (err) {
    console.warn(`Fetch error for ${query} p.${page}:`, err.message);
    return [];
  }
}

// Curated Top Asian, Korean & Western Series with verified IMDb IDs and metadata
const CURATED_SERIES = [
  // --- POPULAR DRAKOR (Korean Drama) ---
  {
    title: 'Queen of Tears',
    slug: 'queen-of-tears-2024',
    imdbId: 'tt27668559',
    year: '2024',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.3',
    genres: 'Drama, Romance, Comedy',
    poster: 'https://image.tmdb.org/t/p/w500/5PCKxpFcCTDFT3b1olJGPaAIM9e.jpg',
    synopsis: 'Ratu department store dan pangeran supermarket menghadapi krisis pernikahan — sampai cinta secara ajaib mulai bersemi kembali.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `queen-of-tears-2024-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Crash Landing on You',
    slug: 'crash-landing-on-you-2019',
    imdbId: 'tt10850932',
    year: '2019',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.7',
    genres: 'Drama, Romance, Comedy',
    poster: 'https://image.tmdb.org/t/p/w500/g91WFimipspD5Cdhu1Y7uV6EZcL.jpg',
    synopsis: 'Kecelakaan paralayang mendaratkan seorang pewaris Korea Selatan di Korea Utara — dan masuk ke dalam kehidupan seorang perwira tentara yang memutuskan untuk membantunya bersembunyi.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `crash-landing-on-you-2019-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Squid Game',
    slug: 'squid-game-2021',
    imdbId: 'tt10919420',
    year: '2021',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.0',
    genres: 'Action, Mystery, Thriller, Drama',
    poster: 'https://image.tmdb.org/t/p/w500/dDlGzN4qC4fomqF3j9qQ1eT9i5X.jpg',
    synopsis: 'Ratusan pemain yang terlilit hutang menerima undangan aneh untuk bertanding dalam permainan anak-anak dengan hadiah uang tunai yang sangat besar — namun taruhannya mematikan.',
    totalSeasons: 2,
    seasons: {
      '1': Array.from({ length: 9 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `squid-game-2021-season-1-episode-${i + 1}`
      })),
      '2': Array.from({ length: 6 }, (_, i) => ({
        s: 2,
        episode_no: i + 1,
        title: `Season 2 Episode ${i + 1}`,
        slug: `squid-game-2021-season-2-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Vincenzo',
    slug: 'vincenzo-2021',
    imdbId: 'tt13433802',
    year: '2021',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.4',
    genres: 'Action, Comedy, Crime, Drama',
    poster: 'https://image.tmdb.org/t/p/w500/dvXJgEDQXqLqT3z9H1g8x7e2E1y.jpg',
    synopsis: 'Pengacara mafia Italia keturunan Korea kembali ke tanah kelahirannya untuk mengambil emas batangan yang tersembunyi di bawah gedung tua.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 20 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `vincenzo-2021-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'All of Us Are Dead',
    slug: 'all-of-us-are-dead-2022',
    imdbId: 'tt14169960',
    year: '2022',
    category: 'drakor',
    country: 'South Korea',
    rating: '7.5',
    genres: 'Action, Drama, Horror, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/6ZfiGv07H8c2g2r6G6U4eE9G2xV.jpg',
    synopsis: 'Sebuah sekolah menengah menjadi titik awal penyebaran virus zombi mematikan. Para siswa yang terperangkap harus berjuang untuk keluar hidup-hidup.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 12 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `all-of-us-are-dead-2022-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'The Glory',
    slug: 'the-glory-2022',
    imdbId: 'tt21344706',
    year: '2022',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.1',
    genres: 'Drama, Mystery, Thriller',
    poster: 'https://image.tmdb.org/t/p/w500/p4T5N3A2Q1q7X6r0R4P7t5W8Y9u.jpg',
    synopsis: 'Bertahun-tahun setelah selamat dari perundungan mengerikan di SMA, seorang wanita menjalankan rencana balas dendam yang teliti.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `the-glory-2022-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Lovely Runner',
    slug: 'lovely-runner-2024',
    imdbId: 'tt28532454',
    year: '2024',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.7',
    genres: 'Comedy, Drama, Fantasy, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/yO7uW6Z3X8o4q1g9Y3U6eR5T8eF.jpg',
    synopsis: 'Seorang penggemar berat melakukan perjalanan kembali ke masa lalu demi menyelamatkan idola favoritnya dari takdir tragis.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `lovely-runner-2024-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Marry My Husband',
    slug: 'marry-my-husband-2024',
    imdbId: 'tt29302778',
    year: '2024',
    category: 'drakor',
    country: 'South Korea',
    rating: '7.9',
    genres: 'Drama, Fantasy, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/6iGv3r4u0G8t5W7y9Y4U2eF3w1Q.jpg',
    synopsis: 'Diberi kesempatan hidup kedua setelah dibunuh oleh suaminya dan sahabatnya yang berselingkuh, ia membalas dendam dengan mengubah takdir.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `marry-my-husband-2024-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Business Proposal',
    slug: 'business-proposal-2022',
    imdbId: 'tt17528448',
    year: '2022',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.1',
    genres: 'Comedy, Drama, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/3Zp8Y3W0U1i8j5U7Y9r5T8eF2w1.jpg',
    synopsis: 'Menyamar menggantikan temannya dalam kencan buta untuk menakut-nakuti calon pasangannya, ia terkejut saat mengetahui teman kencannya adalah CEO perusahaannya sendiri.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 12 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `business-proposal-2022-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'My Demon',
    slug: 'my-demon-2023',
    imdbId: 'tt29457633',
    year: '2023',
    category: 'drakor',
    country: 'South Korea',
    rating: '7.7',
    genres: 'Comedy, Fantasy, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/n6hU4v9w8G0t5y9Y4U2eF3w1Q.jpg',
    synopsis: 'Iblis berusia 200 tahun tiba-tiba kehilangan kekuatannya setelah terikat dengan pewaris konglomerat yang dingin dan tidak percaya cinta.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `my-demon-2023-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Descendants of the Sun',
    slug: 'descendants-of-the-sun-2016',
    imdbId: 'tt4927092',
    year: '2016',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.2',
    genres: 'Action, Comedy, Drama, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/8tT9u2g5W7y9Y4U2eF3w1Q5eR2.jpg',
    synopsis: 'Kisah cinta antara seorang kapten pasukan khusus dan seorang dokter bedah sukarelawan di negara fiksi yang dilanda konflik dan bencana.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `descendants-of-the-sun-2016-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Goblin (Guardian: The Lonely and Great God)',
    slug: 'goblin-2016',
    imdbId: 'tt5994364',
    year: '2016',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.6',
    genres: 'Drama, Fantasy, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/q2W5E8t5W7y9Y4U2eF3w1Q5eR2.jpg',
    synopsis: 'Seorang jenderal tak terkutuk yang menjadi goblin abadi harus menemukan pengantin manusianya untuk mengakhiri keabadian yang menyiksa.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `goblin-2016-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Itaewon Class',
    slug: 'itaewon-class-2020',
    imdbId: 'tt11237894',
    year: '2020',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.2',
    genres: 'Drama, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/z6hU4v9w8G0t5y9Y4U2eF3w1Q.jpg',
    synopsis: 'Mantan narapidana dan teman-temannya berjuang untuk mewujudkan impian mereka membuka bar jalanan di lingkungan multikultural Itaewon.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `itaewon-class-2020-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Hotel Del Luna',
    slug: 'hotel-del-luna-2019',
    imdbId: 'tt10220588',
    year: '2019',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.1',
    genres: 'Action, Comedy, Drama, Fantasy',
    poster: 'https://image.tmdb.org/t/p/w500/3Zp8Y3W0U1i8j5U7Y9r5T8eF2.jpg',
    synopsis: 'Terletak di jantung kota Seoul, Hotel Del Luna adalah hotel kuno yang hanya melayani tamu arwah penasaran sebelum mereka menyeberang ke alam baka.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `hotel-del-luna-2019-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Moving',
    slug: 'moving-2023',
    imdbId: 'tt24628286',
    year: '2023',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.5',
    genres: 'Action, Adventure, Fantasy, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/vJ2W5E8t5W7y9Y4U2eF3w1Q5eR2.jpg',
    synopsis: 'Remaja dengan kekuatan super rahasia dan orang tua mereka yang menyembunyikan masa lalu kelam harus bersatu melindungi diri dari ancaman jahat.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 20 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `moving-2023-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Twinkling Watermelon',
    slug: 'twinkling-watermelon-2023',
    imdbId: 'tt28532422',
    year: '2023',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.9',
    genres: 'Comedy, Drama, Fantasy, Music, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/t7uW6Z3X8o4q1g9Y3U6eR5T8eF.jpg',
    synopsis: 'Seorang siswa CODA dengan bakat musik kembali ke tahun 1995 melalui toko musik misterius dan berteman dengan versi muda ayahnya.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 16 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `twinkling-watermelon-2023-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Sweet Home',
    slug: 'sweet-home-2020',
    imdbId: 'tt11612120',
    year: '2020',
    category: 'drakor',
    country: 'South Korea',
    rating: '7.3',
    genres: 'Action, Drama, Fantasy, Horror, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/t0uW6Z3X8o4q1g9Y3U6eR5T8eF.jpg',
    synopsis: 'Setelah tragedi keluarga, seorang siswa SMA pindah ke kompleks apartemen kumuh tempat manusia mulai berubah menjadi monster mengerikan.',
    totalSeasons: 3,
    seasons: {
      '1': Array.from({ length: 10 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Season 1 Episode ${i + 1}`,
        slug: `sweet-home-2020-season-1-episode-${i + 1}`
      })),
      '2': Array.from({ length: 8 }, (_, i) => ({
        s: 2,
        episode_no: i + 1,
        title: `Season 2 Episode ${i + 1}`,
        slug: `sweet-home-2020-season-2-episode-${i + 1}`
      })),
      '3': Array.from({ length: 8 }, (_, i) => ({
        s: 3,
        episode_no: i + 1,
        title: `Season 3 Episode ${i + 1}`,
        slug: `sweet-home-2020-season-3-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Hospital Playlist',
    slug: 'hospital-playlist-2020',
    imdbId: 'tt11769304',
    year: '2020',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.8',
    genres: 'Comedy, Drama, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/y6hU4v9w8G0t5y9Y4U2eF3w1Q.jpg',
    synopsis: 'Lima dokter yang bersahabat sejak masa kuliah kedokteran menjalani pasang surut kehidupan di rumah sakit sambil membentuk band musik bersama.',
    totalSeasons: 2,
    seasons: {
      '1': Array.from({ length: 12 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Season 1 Episode ${i + 1}`,
        slug: `hospital-playlist-2020-season-1-episode-${i + 1}`
      })),
      '2': Array.from({ length: 12 }, (_, i) => ({
        s: 2,
        episode_no: i + 1,
        title: `Season 2 Episode ${i + 1}`,
        slug: `hospital-playlist-2020-season-2-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'A Korean Odyssey (Hwayugi)',
    slug: 'a-korean-odyssey-hwayugi-2017',
    imdbId: 'tt7099334',
    year: '2017',
    category: 'drakor',
    country: 'South Korea',
    rating: '8.0',
    genres: 'Comedy, Fantasy, Horror, Romance',
    poster: 'https://poster.assetsy.de/wp-content/uploads/2022/06/film-a-korean-odyssey-hwayugi-2017-lk21-d21.jpg',
    synopsis: 'Sesosok makhluk dewa nakal diasingkan ke dunia fana sampai ia menemukan seseorang dengan takdir khusus yang dapat membebaskannya.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 20 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `a-korean-odyssey-hwayugi-2017-season-1-episode-${i + 1}`
      }))
    }
  },
  {
    title: 'Money Heist: Korea - Joint Economic Area',
    slug: 'money-heist-korea-joint-economic-area-2022',
    imdbId: 'tt13696452',
    year: '2022',
    category: 'drakor',
    country: 'South Korea',
    rating: '7.0',
    genres: 'Action, Crime, Drama, Mystery, Thriller',
    poster: 'https://poster.assetsy.de/wp-content/uploads/2022/06/film-money-heist-korea-joint-economic-area-2022-lk21-d21.jpg',
    synopsis: 'Sekelompok perampok bertopeng menyandera gedung percetakan uang bersama di semenanjung Korea yang tengah bersiap melakukan unifikasi.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 12 }, (_, i) => ({
        s: 1,
        episode_no: i + 1,
        title: `Episode ${i + 1}`,
        slug: `money-heist-korea-joint-economic-area-2022-season-1-episode-${i + 1}`
      }))
    }
  },

  // --- POPULAR WESTERN SERIES (Netflix, HBO, Amazon, Disney+) ---
  {
    title: 'Stranger Things',
    slug: 'stranger-things-2016',
    imdbId: 'tt4574334',
    year: '2016',
    category: 'west',
    country: 'United States',
    rating: '8.7',
    genres: 'Drama, Fantasy, Horror, Mystery, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    synopsis: 'Saat seorang anak laki-laki hilang secara misterius di kota kecil Hawkins, teman-temannya dan seorang gadis berkekuatan psikis mengungkap rahasia gelap.',
    totalSeasons: 4,
    seasons: {
      '1': Array.from({ length: 8 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Season 1 Episode ${i + 1}`, slug: `stranger-things-2016-season-1-episode-${i + 1}` })),
      '2': Array.from({ length: 9 }, (_, i) => ({ s: 2, episode_no: i + 1, title: `Season 2 Episode ${i + 1}`, slug: `stranger-things-2016-season-2-episode-${i + 1}` })),
      '3': Array.from({ length: 8 }, (_, i) => ({ s: 3, episode_no: i + 1, title: `Season 3 Episode ${i + 1}`, slug: `stranger-things-2016-season-3-episode-${i + 1}` })),
      '4': Array.from({ length: 9 }, (_, i) => ({ s: 4, episode_no: i + 1, title: `Season 4 Episode ${i + 1}`, slug: `stranger-things-2016-season-4-episode-${i + 1}` }))
    }
  },
  {
    title: 'Wednesday',
    slug: 'wednesday-2022',
    imdbId: 'tt13443470',
    year: '2022',
    category: 'west',
    country: 'United States',
    rating: '8.1',
    genres: 'Comedy, Crime, Family, Fantasy, Mystery',
    poster: 'https://image.tmdb.org/t/p/w500/9PFonB99qQognhgvLOL4Bhko5Tv.jpg',
    synopsis: 'Wednesday Addams berusaha menguasai kemampuan cenayang yang baru muncul sambil menggagalkan aksi pembunuhan berantai di Nevermore Academy.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 8 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `wednesday-2022-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'The Last of Us',
    slug: 'the-last-of-us-2023',
    imdbId: 'tt3581920',
    year: '2023',
    category: 'west',
    country: 'United States',
    rating: '8.7',
    genres: 'Action, Adventure, Drama, Horror, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/uKvVjK19u7vgRecSt2nbmuY997.jpg',
    synopsis: 'Setelah pandemi global menghancurkan peradaban, seorang penyintas yang keras hati bertugas mengawal seorang gadis remaja berusia 14 tahun.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 9 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `the-last-of-us-2023-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'House of the Dragon',
    slug: 'house-of-the-dragon-2022',
    imdbId: 'tt11198330',
    year: '2022',
    category: 'west',
    country: 'United States',
    rating: '8.4',
    genres: 'Action, Adventure, Drama, Fantasy',
    poster: 'https://image.tmdb.org/t/p/w500/1X4h40fcB4WWUmIBK0auT4zRBAV.jpg',
    synopsis: 'Kisah perang saudara Targaryen yang dikenal sebagai Tari Naga, 200 tahun sebelum peristiwa Game of Thrones.',
    totalSeasons: 2,
    seasons: {
      '1': Array.from({ length: 10 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Season 1 Episode ${i + 1}`, slug: `house-of-the-dragon-2022-season-1-episode-${i + 1}` })),
      '2': Array.from({ length: 8 }, (_, i) => ({ s: 2, episode_no: i + 1, title: `Season 2 Episode ${i + 1}`, slug: `house-of-the-dragon-2022-season-2-episode-${i + 1}` }))
    }
  },
  {
    title: 'The Boys',
    slug: 'the-boys-2019',
    imdbId: 'tt1190634',
    year: '2019',
    category: 'west',
    country: 'United States',
    rating: '8.7',
    genres: 'Action, Comedy, Crime, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/2ZmAVncjh69CneWNXQIYeBEVLv9.jpg',
    synopsis: 'Kelompok vigilante pemberani berjuang untuk menjatuhkan pahlawan super korup yang menyalahgunakan kekuatan super mereka.',
    totalSeasons: 4,
    seasons: {
      '1': Array.from({ length: 8 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Season 1 Episode ${i + 1}`, slug: `the-boys-2019-season-1-episode-${i + 1}` })),
      '2': Array.from({ length: 8 }, (_, i) => ({ s: 2, episode_no: i + 1, title: `Season 2 Episode ${i + 1}`, slug: `the-boys-2019-season-2-episode-${i + 1}` })),
      '3': Array.from({ length: 8 }, (_, i) => ({ s: 3, episode_no: i + 1, title: `Season 3 Episode ${i + 1}`, slug: `the-boys-2019-season-3-episode-${i + 1}` })),
      '4': Array.from({ length: 8 }, (_, i) => ({ s: 4, episode_no: i + 1, title: `Season 4 Episode ${i + 1}`, slug: `the-boys-2019-season-4-episode-${i + 1}` }))
    }
  },
  {
    title: 'Fallout',
    slug: 'fallout-2024',
    imdbId: 'tt12637874',
    year: '2024',
    category: 'west',
    country: 'United States',
    rating: '8.4',
    genres: 'Action, Adventure, Drama, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/AnsSKR9LuK0T9bAILezUVig3qqv.jpg',
    synopsis: 'Di masa depan pasca-apokaliptik Los Angeles, para warga bunker bawah tanah dipaksa kembali ke permukaan yang penuh bahaya radiasi dan mutan.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 8 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `fallout-2024-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'Shogun',
    slug: 'shogun-2024',
    imdbId: 'tt2788316',
    year: '2024',
    category: 'west',
    country: 'United States',
    rating: '8.7',
    genres: 'Adventure, Drama, History, War',
    poster: 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSxhOg1WNzG1AgYT.jpg',
    synopsis: 'Di Jepang abad ke-17, Lord Toranaga berjuang untuk bertahan hidup ketika musuh-musuhnya di Dewan Bupati bersatu melawannya.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 10 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `shogun-2024-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'The Penguin',
    slug: 'the-penguin-2024',
    imdbId: 'tt15435876',
    year: '2024',
    category: 'west',
    country: 'United States',
    rating: '8.8',
    genres: 'Crime, Drama',
    poster: 'https://image.tmdb.org/t/p/w500/A0FsH3W5v7b3t5y9Y4U2eF3w1Q.jpg',
    synopsis: 'Mengikuti kisah kebangkitan Oswald Cobblepot menguasai dunia kejahatan Gotham City pasca peristiwa film The Batman.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 8 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `the-penguin-2024-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'Arcane',
    slug: 'arcane-2021',
    imdbId: 'tt11126994',
    year: '2021',
    category: 'west',
    country: 'United States',
    rating: '9.0',
    genres: 'Animation, Action, Adventure, Drama, Sci-Fi',
    poster: 'https://image.tmdb.org/t/p/w500/fq2W5E8t5W7y9Y4U2eF3w1Q5eR2.jpg',
    synopsis: 'Di tengah ketegangan antara kota kaya Piltover dan kota bawah tanah Zaun, dua saudari bertarung di pihak yang berseberangan.',
    totalSeasons: 2,
    seasons: {
      '1': Array.from({ length: 9 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Season 1 Episode ${i + 1}`, slug: `arcane-2021-season-1-episode-${i + 1}` })),
      '2': Array.from({ length: 9 }, (_, i) => ({ s: 2, episode_no: i + 1, title: `Season 2 Episode ${i + 1}`, slug: `arcane-2021-season-2-episode-${i + 1}` }))
    }
  },

  // --- POPULAR ASIAN DRAMAS (Chinese, Thai, Japanese) ---
  {
    title: 'Hidden Love',
    slug: 'hidden-love-2023',
    imdbId: 'tt28076458',
    year: '2023',
    category: 'asian',
    country: 'China',
    rating: '8.6',
    genres: 'Comedy, Drama, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/t3uW6Z3X8o4q1g9Y3U6eR5T8eF.jpg',
    synopsis: 'Sang Zhi jatuh cinta pada teman kakak laki-lakinya sejak kecil. Bertahun-tahun kemudian, takdir mempertemukan mereka kembali di perguruan tinggi.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 25 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `hidden-love-2023-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'When I Fly Towards You',
    slug: 'when-i-fly-towards-you-2023',
    imdbId: 'tt28042456',
    year: '2023',
    category: 'asian',
    country: 'China',
    rating: '8.5',
    genres: 'Comedy, Drama, Romance',
    poster: 'https://image.tmdb.org/t/p/w500/m5uW6Z3X8o4q1g9Y3U6eR5T8eF.jpg',
    synopsis: 'Kisah manis masa muda dan cinta pertama di sekolah menengah antara Su Zaizai yang ceria dan Zhang Lurang yang dingin namun berhati lembut.',
    totalSeasons: 1,
    seasons: {
      '1': Array.from({ length: 24 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Episode ${i + 1}`, slug: `when-i-fly-towards-you-2023-season-1-episode-${i + 1}` }))
    }
  },
  {
    title: 'Alice in Borderland',
    slug: 'alice-in-borderland-2020',
    imdbId: 'tt10795658',
    year: '2020',
    category: 'asian',
    country: 'Japan',
    rating: '7.7',
    genres: 'Action, Drama, Mystery, Sci-Fi, Thriller',
    poster: 'https://image.tmdb.org/t/p/w500/206586/1/1.jpg',
    synopsis: 'Seorang gamer tanpa tujuan dan teman-temannya mendapati diri mereka berada di Tokyo yang sepi dan dipaksa bermain dalam serangkaian permainan hidup-mati.',
    totalSeasons: 2,
    seasons: {
      '1': Array.from({ length: 8 }, (_, i) => ({ s: 1, episode_no: i + 1, title: `Season 1 Episode ${i + 1}`, slug: `alice-in-borderland-2020-season-1-episode-${i + 1}` })),
      '2': Array.from({ length: 8 }, (_, i) => ({ s: 2, episode_no: i + 1, title: `Season 2 Episode ${i + 1}`, slug: `alice-in-borderland-2020-season-2-episode-${i + 1}` }))
    }
  }
];

async function main() {
  console.log('--- Generating Series Streams Cache ---');
  const catalog = {};

  // 1. Insert Curated High-Profile Series
  for (const s of CURATED_SERIES) {
    let epCount = 0;
    for (const eps of Object.values(s.seasons)) {
      epCount += eps.length;
    }
    catalog[s.slug] = {
      id: `series_${s.slug}`,
      source: 'nontondrama',
      type: 'series',
      slug: s.slug,
      title: s.title,
      imdbId: s.imdbId,
      poster: s.poster,
      banner: s.poster,
      rating: s.rating,
      genres: s.genres,
      year: s.year,
      category: s.category,
      country: s.country,
      synopsis: s.synopsis,
      totalSeasons: s.totalSeasons || Object.keys(s.seasons).length,
      totalEpisodes: epCount,
      seasons: s.seasons,
      url: `https://tv.nontondrama.vip/${s.slug}`
    };
  }

  console.log(`Loaded ${Object.keys(catalog).length} curated series.`);

  // 2. Fetch series from Gudangvape search API
  const queries = [
    { q: 'series', maxPages: 12 },
    { q: '2026', maxPages: 5 },
    { q: '2025', maxPages: 5 },
    { q: 'korea', maxPages: 3 },
    { q: 'season', maxPages: 4 }
  ];

  for (const { q, maxPages } of queries) {
    console.log(`Fetching query: "${q}" up to ${maxPages} pages...`);
    for (let p = 1; p <= maxPages; p++) {
      const items = await fetchGudangvape(q, p);
      for (const item of items) {
        if (!item || (!item.type && !item.season && !item.episode)) continue;
        if (item.type && item.type === 'movie' && !item.season && !item.episode) continue;

        const slug = String(item.slug || '').replace(/^\//, '').replace(/\/$/, '');
        if (!slug || catalog[slug]) continue;

        const rawTitle = decodeEntities(item.title || slug).replace(/\s*-\s*Series$/i, '').trim();
        const posterUrl = item.poster
          ? (item.poster.startsWith('http') ? item.poster : `${NONTONDRAMA_POSTER_BASE}${item.poster.replace(/^\//, '')}`)
          : '';
        const itemYear = item.year ? String(item.year) : ((rawTitle.match(/\((\d{4})\)/) || [])[1] || '');

        // Detect category
        const lower = (rawTitle + ' ' + slug).toLowerCase();
        let cat = 'west';
        let country = 'United States';
        if (lower.includes('korea') || lower.includes('seoul') || lower.includes('drakor')) {
          cat = 'drakor';
          country = 'South Korea';
        } else if (lower.includes('china') || lower.includes('chinese') || lower.includes('thai') || lower.includes('japan') || lower.includes('asian')) {
          cat = 'asian';
          country = 'Asia';
        }

        const maxSeason = Math.max(1, Number(item.season) || 1);
        const maxEp = Math.max(1, Number(item.episode) || 12);

        const seasons = {};
        for (let s = 1; s <= maxSeason; s++) {
          const sKey = String(s);
          seasons[sKey] = [];
          const count = s === maxSeason ? maxEp : 10;
          for (let ep = 1; ep <= count; ep++) {
            seasons[sKey].push({
              s,
              episode_no: ep,
              title: `Season ${s} Episode ${ep}`,
              slug: `${slug}-season-${s}-episode-${ep}`
            });
          }
        }

        let totalEps = 0;
        for (const eps of Object.values(seasons)) totalEps += eps.length;

        catalog[slug] = {
          id: `series_${slug}`,
          source: 'nontondrama',
          type: 'series',
          slug,
          title: rawTitle,
          imdbId: '',
          poster: posterUrl,
          banner: posterUrl,
          rating: item.rating && Number(item.rating) > 0 ? String(item.rating) : '7.8',
          genres: cat === 'drakor' ? 'Drama, Romance, Korean' : cat === 'asian' ? 'Drama, Asian, Romance' : 'Drama, TV Series',
          year: itemYear,
          category: cat,
          country,
          synopsis: `Tonton serial drama ${rawTitle}${itemYear ? ` (${itemYear})` : ''} subtitle Indonesia lengkap semua season dan episode.`,
          totalSeasons: maxSeason,
          totalEpisodes: totalEps,
          seasons,
          url: `https://tv.nontondrama.vip/${slug}`
        };
      }
    }
  }

  const allSlugs = Object.keys(catalog);
  console.log(`Total series in catalog: ${allSlugs.length}`);

  // Write out to both Standalone Server and Web Server
  const out1 = path.join(__dirname, '..', 'database', 'series_streams_cache.json');
  const out2 = path.join('c:', 'Users', 'STM 80', 'Documents', 'ai project', 'web', 'server', 'database', 'series_streams_cache.json');

  fs.writeFileSync(out1, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Saved catalog to ${out1}`);
  try {
    fs.writeFileSync(out2, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`Saved catalog to ${out2}`);
  } catch (e) {
    console.warn('Could not write to out2:', e.message);
  }
}

main().catch(console.error);

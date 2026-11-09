import { db } from './db.js';

export function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) as count FROM anime').get();
  if (count.count > 0) {
    console.log(`ℹ️ Database already seeded with ${count.count} anime.`);
    return;
  }

  console.log('🌱 Seeding anime and episode data...');

  const animeList = [
    {
      slug: 'solo-leveling-season-2',
      title: 'Solo Leveling: Arise from the Shadow',
      japanese_title: '俺だけレベルアップな件',
      synopsis: 'Sung Jinwoo terus melatih kekuatannya yang tak terhingga sebagai Shadow Monarch. Di musim kedua ini, Jinwoo menghadapi ancaman yang lebih besar dari Monarch lain yang mengancam kehancuran umat manusia.',
      poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
      status: 'Ongoing',
      type: 'TV',
      score: 8.85,
      rating: '17+',
      genres: 'Action, Fantasy, Adventure, Super Power',
      release_day: 'Sabtu',
      studio: 'A-1 Pictures',
      total_episodes: 13,
      episodes: [
        { ep: 1, title: 'Episode 1: Kebangkitan Sang Raja', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Jejak Sang Pemburu', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
        { ep: 3, title: 'Episode 3: Pasukan Bayangan', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
        { ep: 4, title: 'Episode 4: Pertempuran di Dungeon Merah', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
        { ep: 5, title: 'Episode 5: Kekuatan Tak Terlihat', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' },
        { ep: 6, title: 'Episode 6: Panggilan Darurat', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4' }
      ]
    },
    {
      slug: 'jujutsu-kaisen-season-2',
      title: 'Jujutsu Kaisen Season 2 (Shibuya Incident)',
      japanese_title: '呪術廻戦 懐玉・玉折 / 渋谷事変',
      synopsis: 'Kisah masa lalu Satoru Gojo dan Suguru Geto saat masih berstatus siswa SMK Jujutsu Tokyo, dilanjutkan dengan insiden kelam di Shibuya pada malam Halloween tanggal 31 Oktober.',
      poster: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
      status: 'Completed',
      type: 'TV',
      score: 8.92,
      rating: '17+',
      genres: 'Action, Supernatural, Fantasy, Shounen',
      release_day: 'Kamis',
      studio: 'MAPPA',
      total_episodes: 23,
      episodes: [
        { ep: 1, title: 'Episode 1: Bakat Terpendam', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Reruntuhan Masa Lalu', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
        { ep: 3, title: 'Episode 3: Tirai Shibuya Terbuka', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
        { ep: 4, title: 'Episode 4: Domain Expansion', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' }
      ]
    },
    {
      slug: 'frieren-beyond-journeys-end',
      title: "Sousou no Frieren (Beyond Journey's End)",
      japanese_title: '葬送のフリーレン',
      synopsis: 'Penyihir peri Frieren bersama pahlawan Himmel berhasil mengalahkan Raja Iblis. Sebagai peri yang hidup ribuan tahun, Frieren memulai perjalanan baru untuk memahami arti waktu dan perasaan manusia.',
      poster: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&auto=format&fit=crop&q=80',
      status: 'Completed',
      type: 'TV',
      score: 9.38,
      rating: '13+',
      genres: 'Adventure, Drama, Fantasy, Magic, Slice of Life',
      release_day: 'Jumat',
      studio: 'Madhouse',
      total_episodes: 28,
      episodes: [
        { ep: 1, title: 'Episode 1: Akhir dari Sebuah Petualangan', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Murid Baru Fern', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
        { ep: 3, title: 'Episode 3: Sihir Bunga Biru', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' }
      ]
    },
    {
      slug: 'demon-slayer-kimetsu-no-yaiba-hashira-training',
      title: 'Kimetsu no Yaiba: Hashira Training Arc',
      japanese_title: '鬼滅の刃 柱稽古編',
      synopsis: 'Tanjiro Kamado menjalani latihan keras bersama para Hashira (Pilar) untuk mempersiapkan perang pamungkas melawan Kibutsuji Muzan dan para Iblis Bulan Atas.',
      poster: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1600&auto=format&fit=crop&q=80',
      status: 'Completed',
      type: 'TV',
      score: 8.45,
      rating: '17+',
      genres: 'Action, Historical, Supernatural, Shounen',
      release_day: 'Minggu',
      studio: 'ufotable',
      total_episodes: 8,
      episodes: [
        { ep: 1, title: 'Episode 1: Demi Mengalahkan Muzan Kibutsuji', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Rasa Sakit Pilar Air Giyu Tomioka', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
        { ep: 3, title: 'Episode 3: Latihan Fisik Tengen Uzui', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }
      ]
    },
    {
      slug: 'spy-x-family-season-2',
      title: 'SPY x FAMILY Season 2',
      japanese_title: 'スパイファミリー シーズン2',
      synopsis: 'Loid (mata-mata), Yor (pembunuh bayaran), dan Anya (telepati) terus menyembunyikan identitas rahasia masing-masing demi menjaga perdamaian dunia dan keluarga palsu mereka yang bahagia.',
      poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
      status: 'Completed',
      type: 'TV',
      score: 8.35,
      rating: '13+',
      genres: 'Action, Comedy, Shounen, Slice of Life',
      release_day: 'Sabtu',
      studio: 'Wit Studio, CloverWorks',
      total_episodes: 12,
      episodes: [
        { ep: 1, title: 'Episode 1: Misi Rahasia Anya', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Kapal Pesiar Mewah', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }
      ]
    },
    {
      slug: 'oshi-no-ko-season-2',
      title: '【OSHI NO KO】 Season 2',
      japanese_title: '【推しの子】第2期',
      synopsis: 'Aqua dan Ruby Hoshino melangkah lebih dalam ke dunia hiburan Jepang yang penuh intrik. Aqua terlibat dalam adaptasi teater panggung 2.5D dari manga populer Tokyo Blade demi mencari petunjuk dalang kematian Ai.',
      poster: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
      status: 'Ongoing',
      type: 'TV',
      score: 8.78,
      rating: '17+',
      genres: 'Drama, Mystery, Psychological, Supernatural',
      release_day: 'Rabu',
      studio: 'Doga Kobo',
      total_episodes: 13,
      episodes: [
        { ep: 1, title: 'Episode 1: Adaptasi Tokyo Blade', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Panggung Sandiwara', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }
      ]
    },
    {
      slug: 'attack-on-titan-final-season',
      title: 'Attack on Titan: The Final Season',
      japanese_title: '進撃の巨人 The Final Season',
      synopsis: 'Perang antara Eldia dan Marley mencapai puncaknya. Eren Yeager mengaktifkan Rumbling, melepaskan jutaan Colossal Titan untuk meratakan dunia demi kebebasan tanah kelahirannya di Pulau Paradis.',
      poster: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&auto=format&fit=crop&q=80',
      status: 'Completed',
      type: 'TV',
      score: 9.15,
      rating: '17+',
      genres: 'Action, Drama, Military, Mystery, Shounen',
      release_day: 'Senin',
      studio: 'MAPPA',
      total_episodes: 28,
      episodes: [
        { ep: 1, title: 'Episode 1: Di Seberang Lautan', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Kereta Api Malam Gelap', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
        { ep: 3, title: 'Episode 3: Deklarasi Perang', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }
      ]
    },
    {
      slug: 'chainsaw-man',
      title: 'Chainsaw Man',
      japanese_title: 'チェンソーマン',
      synopsis: 'Denji hidup dalam kemiskinan ekstrem bersama iblis anjing Pochita. Setelah dikhianati dan dibunuh, Pochita menyatu dengan jantung Denji, mengubahnya menjadi Chainsaw Man yang bekerja untuk Biro Pemburu Iblis Keselamatan Publik.',
      poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1600&auto=format&fit=crop&q=80',
      status: 'Completed',
      type: 'TV',
      score: 8.52,
      rating: '17+',
      genres: 'Action, Gore, Supernatural, Shounen',
      release_day: 'Selasa',
      studio: 'MAPPA',
      total_episodes: 12,
      episodes: [
        { ep: 1, title: 'Episode 1: Anjing dan Gergaji', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
        { ep: 2, title: 'Episode 2: Kedatangan di Tokyo', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }
      ]
    }
  ];

  const insertAnime = db.prepare(`
    INSERT INTO anime (slug, title, japanese_title, synopsis, poster, banner, status, type, score, rating, genres, release_day, studio, total_episodes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEpisode = db.prepare(`
    INSERT INTO episodes (anime_id, episode_number, title, video_url, embed_url, duration_seconds, thumbnail, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of animeList) {
    const res = insertAnime.run(
      item.slug,
      item.title,
      item.japanese_title,
      item.synopsis,
      item.poster,
      item.banner,
      item.status,
      item.type,
      item.score,
      item.rating,
      item.genres,
      item.release_day,
      item.studio,
      item.total_episodes
    );

    const animeId = res.lastInsertRowid;

    for (const ep of item.episodes) {
      insertEpisode.run(
        animeId,
        ep.ep,
        ep.title,
        ep.video,
        `https://www.youtube.com/embed/dQw4w9WgXcQ`,
        1440,
        item.poster,
        '2026-10-15'
      );
    }
  }

  console.log(`✅ Berhasil melakukan seed ${animeList.length} anime ke database SQLite.`);
}

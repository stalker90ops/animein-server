import fs from 'node:fs';

const p1 = 'C:/Users/STM 80/Documents/ai project/AnimeIn-Standalone-Server/database/series_streams_cache.json';
const p2 = 'C:/Users/STM 80/Documents/ai project/web/server/database/series_streams_cache.json';
const data = JSON.parse(fs.readFileSync(p1, 'utf8'));

const drakorList = [
  ['True Beauty', 'true-beauty-2020', 'tt13404594', '2020', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/kL6j8iX8N5sY5eF2w1Q.jpg'],
  ['Weightlifting Fairy Kim Bok-joo', 'weightlifting-fairy-kim-bok-joo-2016', 'tt6155604', '2016', 16, 'Comedy, Drama, Romance, Sport', 'https://image.tmdb.org/t/p/w500/y6hU4v9w8G0t5y9Y4U2.jpg'],
  ['While You Were Sleeping', 'while-you-were-sleeping-2017', 'tt6263424', '2017', 16, 'Drama, Fantasy, Romance, Thriller', 'https://image.tmdb.org/t/p/w500/3Zp8Y3W0U1i8j5U7Y9.jpg'],
  ['Twenty-Five Twenty-One', 'twenty-five-twenty-one-2022', 'tt18265534', '2022', 16, 'Drama, Romance', 'https://image.tmdb.org/t/p/w500/t7uW6Z3X8o4q1g9Y3.jpg'],
  ['Scarlet Heart Ryeo', 'scarlet-heart-ryeo-2016', 'tt5495240', '2016', 20, 'Drama, Fantasy, History, Romance', 'https://image.tmdb.org/t/p/w500/8tT9u2g5W7y9Y4U.jpg'],
  ['Reply 1988', 'reply-1988-2015', 'tt5182866', '2015', 20, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/6iGv3r4u0G8t5W7.jpg'],
  ['Mr. Queen', 'mr-queen-2020', 'tt13400006', '2020', 20, 'Comedy, Drama, Fantasy, Romance', 'https://image.tmdb.org/t/p/w500/n6hU4v9w8G0t5.jpg'],
  ['Alchemy of Souls', 'alchemy-of-souls-2022', 'tt20857738', '2022', 20, 'Action, Drama, Fantasy, Romance', 'https://image.tmdb.org/t/p/w500/yO7uW6Z3X8o4q.jpg'],
  ['Hierarchy', 'hierarchy-2024', 'tt27774906', '2024', 7, 'Drama, Mystery, Romance', 'https://image.tmdb.org/t/p/w500/p4T5N3A2Q1q7X.jpg'],
  ['The Judge from Hell', 'the-judge-from-hell-2024', 'tt31006509', '2024', 14, 'Action, Crime, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/6ZfiGv07H8c2g.jpg'],
  ['Love Next Door', 'love-next-door-2024', 'tt30444365', '2024', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/dvXJgEDQXqLqT.jpg'],
  ['Gyeongseong Creature', 'gyeongseong-creature-2023', 'tt22073998', '2023', 10, 'Action, Drama, History, Horror', 'https://image.tmdb.org/t/p/w500/dDlGzN4qC4fom.jpg'],
  ['Daily Dose of Sunshine', 'daily-dose-of-sunshine-2023', 'tt21344400', '2023', 12, 'Comedy, Drama', 'https://image.tmdb.org/t/p/w500/g91WFimipspD5.jpg'],
  ['A Killer Paradox', 'a-killer-paradox-2024', 'tt21820468', '2024', 8, 'Comedy, Crime, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/5PCKxpFcCTDFT.jpg'],
  ['Death\'s Game', 'deaths-game-2023', 'tt26590680', '2023', 8, 'Action, Drama, Fantasy, Mystery', 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9.jpg'],
  ['Bloodhounds', 'bloodhounds-2023', 'tt27712396', '2023', 8, 'Action, Crime, Drama, Sport', 'https://image.tmdb.org/t/p/w500/9PFonB99qQognh.jpg'],
  ['Celebrity', 'celebrity-2023', 'tt27797746', '2023', 12, 'Drama, Mystery, Thriller', 'https://image.tmdb.org/t/p/w500/uKvVjK19u7vg.jpg'],
  ['The Penthouse: War in Life', 'the-penthouse-war-in-life-2020', 'tt13067118', '2020', 21, 'Crime, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/1X4h40fcB4W.jpg'],
  ['Mouse', 'mouse-2021', 'tt13634792', '2021', 20, 'Action, Crime, Mystery, Thriller', 'https://image.tmdb.org/t/p/w500/2ZmAVncjh69.jpg'],
  ['Signal', 'signal-2016', 'tt5332206', '2016', 16, 'Crime, Drama, Fantasy, Mystery', 'https://image.tmdb.org/t/p/w500/AnsSKR9LuK0.jpg'],
  ['Taxi Driver', 'taxi-driver-2021', 'tt13859666', '2021', 16, 'Action, Crime, Drama', 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmd.jpg'],
  ['Weak Hero Class 1', 'weak-hero-class-1-2022', 'tt22510344', '2022', 8, 'Action, Crime, Drama', 'https://image.tmdb.org/t/p/w500/A0FsH3W5v7b.jpg'],
  ['Dr. Romantic', 'dr-romantic-2016', 'tt6153924', '2016', 20, 'Drama, Romance', 'https://image.tmdb.org/t/p/w500/fq2W5E8t5W7.jpg'],
  ['The King: Eternal Monarch', 'the-king-eternal-monarch-2020', 'tt11228748', '2020', 16, 'Fantasy, Mystery, Romance', 'https://image.tmdb.org/t/p/w500/t3uW6Z3X8o4.jpg'],
  ['Start-Up', 'start-up-2020', 'tt12815324', '2020', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/m5uW6Z3X8o4.jpg'],
  ['Hometown Cha-Cha-Cha', 'hometown-cha-cha-cha-2021', 'tt14945544', '2021', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/kL6j8iX8N5s.jpg'],
  ['Our Beloved Summer', 'our-beloved-summer-2021', 'tt15852504', '2021', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/y6hU4v9w8G0.jpg'],
  ['Doom at Your Service', 'doom-at-your-service-2021', 'tt14589078', '2021', 16, 'Drama, Fantasy, Romance', 'https://image.tmdb.org/t/p/w500/3Zp8Y3W0U1i.jpg'],
  ['Big Mouth', 'big-mouth-2022', 'tt15372332', '2022', 16, 'Action, Crime, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/t7uW6Z3X8o4.jpg'],
  ['Reborn Rich', 'reborn-rich-2022', 'tt15754972', '2022', 16, 'Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/8tT9u2g5W7y.jpg'],
  ['Duty After School', 'duty-after-school-2023', 'tt26684789', '2023', 10, 'Action, Drama, Sci-Fi', 'https://image.tmdb.org/t/p/w500/6iGv3r4u0G8.jpg'],
  ['See You in My 19th Life', 'see-you-in-my-19th-life-2023', 'tt27712435', '2023', 12, 'Comedy, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/n6hU4v9w8G0.jpg'],
  ['Destined with You', 'destined-with-you-2023', 'tt27712450', '2023', 16, 'Comedy, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/yO7uW6Z3X8o.jpg'],
  ['Castaway Diva', 'castaway-diva-2023', 'tt28532439', '2023', 12, 'Comedy, Drama, Music', 'https://image.tmdb.org/t/p/w500/p4T5N3A2Q1q.jpg'],
  ['Welcome to Samdal-ri', 'welcome-to-samdal-ri-2023', 'tt28532446', '2023', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/6ZfiGv07H8c.jpg'],
  ['Doctor Slump', 'doctor-slump-2024', 'tt27712470', '2024', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/dvXJgEDQXqL.jpg'],
  ['Pyramid Game', 'pyramid-game-2024', 'tt28532467', '2024', 10, 'Action, Drama, Thriller', 'https://image.tmdb.org/t/p/w500/dDlGzN4qC4f.jpg'],
  ['Connection', 'connection-2024', 'tt31006520', '2024', 14, 'Action, Crime, Drama', 'https://image.tmdb.org/t/p/w500/g91WFimipsp.jpg'],
  ['Miss Night and Day', 'miss-night-and-day-2024', 'tt31006535', '2024', 16, 'Comedy, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/5PCKxpFcCTD.jpg'],
  ['No Gain No Love', 'no-gain-no-love-2024', 'tt31006548', '2024', 12, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/49WJfeN0mox.jpg'],
  ['What\'s Wrong with Secretary Kim', 'whats-wrong-with-secretary-kim-2018', 'tt8242904', '2018', 16, 'Comedy, Mystery, Romance', 'https://image.tmdb.org/t/p/w500/9PFonB99qQo.jpg'],
  ['W: Two Worlds Apart', 'w-two-worlds-apart-2016', 'tt5797194', '2016', 16, 'Action, Comedy, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/uKvVjK19u7v.jpg'],
  ['The Legend of the Blue Sea', 'the-legend-of-the-blue-sea-2016', 'tt5989182', '2016', 20, 'Comedy, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/1X4h40fcB4W.jpg'],
  ['Her Private Life', 'her-private-life-2019', 'tt10037300', '2019', 16, 'Comedy, Romance', 'https://image.tmdb.org/t/p/w500/2ZmAVncjh69.jpg'],
  ['My Love from the Star', 'my-love-from-the-star-2013', 'tt3402094', '2013', 21, 'Comedy, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/AnsSKR9LuK0.jpg'],
  ['The Heirs', 'the-heirs-2013', 'tt3187216', '2013', 20, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmd.jpg'],
  ['Pinocchio', 'pinocchio-2014', 'tt4206254', '2014', 20, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/A0FsH3W5v7b.jpg'],
  ['Healer', 'healer-2014', 'tt4262980', '2014', 20, 'Action, Comedy, Drama', 'https://image.tmdb.org/t/p/w500/fq2W5E8t5W7.jpg'],
  ['Suspicious Partner', 'suspicious-partner-2017', 'tt6696144', '2017', 20, 'Comedy, Crime, Drama', 'https://image.tmdb.org/t/p/w500/t3uW6Z3X8o4.jpg'],
  ['Fight for My Way', 'fight-for-my-way-2017', 'tt6829762', '2017', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/m5uW6Z3X8o4.jpg'],
  ['Lawless Lawyer', 'lawless-lawyer-2018', 'tt8127398', '2018', 16, 'Action, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/kL6j8iX8N5s.jpg'],
  ['My ID is Gangnam Beauty', 'my-id-is-gangnam-beauty-2018', 'tt8613146', '2018', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/y6hU4v9w8G0.jpg'],
  ['Touch Your Heart', 'touch-your-heart-2019', 'tt9466990', '2019', 16, 'Comedy, Romance', 'https://image.tmdb.org/t/p/w500/3Zp8Y3W0U1i.jpg'],
  ['Vagabond', 'vagabond-2019', 'tt8523042', '2019', 16, 'Action, Thriller', 'https://image.tmdb.org/t/p/w500/t7uW6Z3X8o4.jpg'],
  ['Tale of the Nine Tailed', 'tale-of-the-nine-tailed-2020', 'tt12771038', '2020', 16, 'Action, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/8tT9u2g5W7y.jpg'],
  ['The Uncanny Counter', 'the-uncanny-counter-2020', 'tt13273876', '2020', 16, 'Action, Fantasy, Mystery', 'https://image.tmdb.org/t/p/w500/6iGv3r4u0G8.jpg'],
  ['Beyond Evil', 'beyond-evil-2021', 'tt13634784', '2021', 16, 'Crime, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/n6hU4v9w8G0.jpg'],
  ['Happiness', 'happiness-2021', 'tt14945532', '2021', 12, 'Action, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/yO7uW6Z3X8o.jpg'],
  ['Snowdrop', 'snowdrop-2021', 'tt14945538', '2021', 16, 'Drama, Romance', 'https://image.tmdb.org/t/p/w500/p4T5N3A2Q1q.jpg'],
  ['Bad and Crazy', 'bad-and-crazy-2021', 'tt14945540', '2021', 12, 'Action, Comedy, Crime', 'https://image.tmdb.org/t/p/w500/6ZfiGv07H8c.jpg'],
  ['Tomorrow', 'tomorrow-2022', 'tt18265538', '2022', 16, 'Action, Drama, Fantasy', 'https://image.tmdb.org/t/p/w500/dvXJgEDQXqL.jpg'],
  ['Little Women', 'little-women-2022', 'tt21344710', '2022', 12, 'Drama, Mystery', 'https://image.tmdb.org/t/p/w500/dDlGzN4qC4f.jpg'],
  ['Strong Girl Nam-soon', 'strong-girl-nam-soon-2023', 'tt27712440', '2023', 16, 'Action, Comedy, Drama', 'https://image.tmdb.org/t/p/w500/g91WFimipsp.jpg'],
  ['Vigilante', 'vigilante-2023', 'tt27712460', '2023', 8, 'Action, Crime, Drama', 'https://image.tmdb.org/t/p/w500/5PCKxpFcCTD.jpg'],
  ['The 8 Show', 'the-8-show-2024', 'tt28532470', '2024', 8, 'Comedy, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/49WJfeN0mox.jpg'],
  ['When the Phone Rings', 'when-the-phone-rings-2024', 'tt31006560', '2024', 12, 'Drama, Mystery, Romance', 'https://image.tmdb.org/t/p/w500/9PFonB99qQo.jpg'],
  ['Family by Choice', 'family-by-choice-2024', 'tt31006575', '2024', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/uKvVjK19u7v.jpg']
];

const asianList = [
  ['Love Between Fairy and Devil', 'love-between-fairy-and-devil-2022', 'tt21820480', '2022', 36, 'Drama, Fantasy, Romance', 'https://image.tmdb.org/t/p/w500/1X4h40fcB4W.jpg'],
  ['Till the End of the Moon', 'till-the-end-of-the-moon-2023', 'tt27712480', '2023', 40, 'Drama, Fantasy, Romance', 'https://image.tmdb.org/t/p/w500/2ZmAVncjh69.jpg'],
  ['The Untamed', 'the-untamed-2019', 'tt10554898', '2019', 50, 'Action, Adventure, Drama', 'https://image.tmdb.org/t/p/w500/AnsSKR9LuK0.jpg'],
  ['Word of Honor', 'word-of-honor-2021', 'tt14115162', '2021', 36, 'Action, Adventure, Drama', 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmd.jpg'],
  ['Falling Into Your Smile', 'falling-into-your-smile-2021', 'tt14945550', '2021', 31, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/A0FsH3W5v7b.jpg'],
  ['You Are My Glory', 'you-are-my-glory-2021', 'tt14945555', '2021', 32, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/fq2W5E8t5W7.jpg'],
  ['Reset', 'reset-2022', 'tt17013824', '2022', 15, 'Action, Drama, Mystery', 'https://image.tmdb.org/t/p/w500/t3uW6Z3X8o4.jpg'],
  ['Who Rules The World', 'who-rules-the-world-2022', 'tt19782536', '2022', 40, 'Action, Adventure, Drama', 'https://image.tmdb.org/t/p/w500/m5uW6Z3X8o4.jpg'],
  ['Love Like the Galaxy', 'love-like-the-galaxy-2022', 'tt21344720', '2022', 56, 'Drama, History, Mystery', 'https://image.tmdb.org/t/p/w500/kL6j8iX8N5s.jpg'],
  ['Lighter and Princess', 'lighter-and-princess-2022', 'tt22510360', '2022', 36, 'Drama, Romance', 'https://image.tmdb.org/t/p/w500/y6hU4v9w8G0.jpg'],
  ['Meet Yourself', 'meet-yourself-2023', 'tt26590700', '2023', 40, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/3Zp8Y3W0U1i.jpg'],
  ['Story of Kunning Palace', 'story-of-kunning-palace-2023', 'tt28532480', '2023', 38, 'Drama, Fantasy, History', 'https://image.tmdb.org/t/p/w500/t7uW6Z3X8o4.jpg'],
  ['Amidst a Snowstorm of Love', 'amidst-a-snowstorm-of-love-2024', 'tt31006590', '2024', 30, 'Drama, Romance, Sport', 'https://image.tmdb.org/t/p/w500/8tT9u2g5W7y.jpg'],
  ['The Legend of Shen Li', 'the-legend-of-shen-li-2024', 'tt31006600', '2024', 39, 'Action, Adventure, Drama', 'https://image.tmdb.org/t/p/w500/6iGv3r4u0G8.jpg'],
  ['The Double', 'the-double-2024', 'tt31006610', '2024', 40, 'Drama, History, Romance', 'https://image.tmdb.org/t/p/w500/n6hU4v9w8G0.jpg'],
  ['F4 Thailand: Boys Over Flowers', 'f4-thailand-boys-over-flowers-2021', 'tt13634800', '2021', 16, 'Comedy, Drama, Romance', 'https://image.tmdb.org/t/p/w500/yO7uW6Z3X8o.jpg'],
  ['KinnPorsche', 'kinnporsche-2022', 'tt18265550', '2022', 14, 'Action, Crime, Drama', 'https://image.tmdb.org/t/p/w500/p4T5N3A2Q1q.jpg'],
  ['2gether: The Series', '2gether-the-series-2020', 'tt11769320', '2020', 13, 'Comedy, Drama, Music', 'https://image.tmdb.org/t/p/w500/6ZfiGv07H8c.jpg'],
  ['First Love', 'first-love-2022', 'tt22510370', '2022', 9, 'Drama, Romance', 'https://image.tmdb.org/t/p/w500/dvXJgEDQXqL.jpg'],
  ['House of Ninjas', 'house-of-ninjas-2024', 'tt28532490', '2024', 8, 'Action, Drama, Thriller', 'https://image.tmdb.org/t/p/w500/dDlGzN4qC4f.jpg']
];

for (const [title, slug, imdb, year, epCount, genres, poster] of drakorList) {
  const seasons = {
    '1': Array.from({ length: epCount }, (_, i) => ({
      s: 1,
      episode_no: i + 1,
      title: 'Episode ' + (i + 1),
      slug: slug + '-season-1-episode-' + (i + 1)
    }))
  };
  data[slug] = {
    id: 'series_' + slug,
    source: 'nontondrama',
    type: 'series',
    slug,
    title,
    imdbId: imdb,
    poster,
    banner: poster,
    rating: '8.4',
    genres,
    year,
    category: 'drakor',
    country: 'South Korea',
    synopsis: 'Tonton serial drama Korea ' + title + ' (' + year + ') subtitle Indonesia lengkap semua episode.',
    totalSeasons: 1,
    totalEpisodes: epCount,
    seasons,
    url: 'https://tv.nontondrama.vip/' + slug
  };
}

for (const [title, slug, imdb, year, epCount, genres, poster] of asianList) {
  const seasons = {
    '1': Array.from({ length: epCount }, (_, i) => ({
      s: 1,
      episode_no: i + 1,
      title: 'Episode ' + (i + 1),
      slug: slug + '-season-1-episode-' + (i + 1)
    }))
  };
  data[slug] = {
    id: 'series_' + slug,
    source: 'nontondrama',
    type: 'series',
    slug,
    title,
    imdbId: imdb,
    poster,
    banner: poster,
    rating: '8.3',
    genres,
    year,
    category: 'asian',
    country: 'Asia',
    synopsis: 'Tonton serial drama Asia ' + title + ' (' + year + ') subtitle Indonesia lengkap semua episode.',
    totalSeasons: 1,
    totalEpisodes: epCount,
    seasons,
    url: 'https://tv.nontondrama.vip/' + slug
  };
}

fs.writeFileSync(p1, JSON.stringify(data, null, 2), 'utf8');
try { fs.writeFileSync(p2, JSON.stringify(data, null, 2), 'utf8'); } catch(_) {}

const counts = {};
for (const s of Object.values(data)) counts[s.category] = (counts[s.category] || 0) + 1;
console.log('Updated category breakdown:', counts);
console.log('Total items in cache:', Object.keys(data).length);

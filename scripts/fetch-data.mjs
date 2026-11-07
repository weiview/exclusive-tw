// 抓取台灣地區 Netflix 與 HBO Max 的片單，算出各自獨家的節目，輸出 public/data.json
// 用法：TMDB_TOKEN=xxxx node scripts/fetch-data.mjs
// TMDB_TOKEN 可填 v4「API 讀取存取權杖」(eyJ 開頭) 或 v3「API 金鑰」。

import { writeFile, mkdir } from 'node:fs/promises';

const TOKEN = process.env.TMDB_TOKEN;
if (!TOKEN) {
  console.error('請設定環境變數 TMDB_TOKEN');
  process.exit(1);
}
const REGION = process.env.REGION || 'TW';
const LANG = 'zh-TW';
const BASE = 'https://api.themoviedb.org/3';
const MAX_PAGES = 500; // TMDB discover 上限
const isBearer = TOKEN.startsWith('eyJ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  if (!isBearer) url.searchParams.set('api_key', TOKEN);
  const headers = { accept: 'application/json' };
  if (isBearer) headers.authorization = `Bearer ${TOKEN}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    throw new Error(`TMDB ${res.status} ${path}: ${await res.text()}`);
  }
  throw new Error(`TMDB 重試失敗：${path}`);
}

// 找出兩個平台在該地區的 provider id（用名稱比對，避免 id 異動）
async function findProviders() {
  const [m, t] = await Promise.all([
    tmdb('/watch/providers/movie', { watch_region: REGION, language: LANG }),
    tmdb('/watch/providers/tv', { watch_region: REGION, language: LANG }),
  ]);
  const all = [...m.results, ...t.results];
  const pick = (test) => [...new Set(all.filter((p) => test(p.provider_name)).map((p) => p.provider_id))];
  const netflix = pick((n) => /^netflix$/i.test(n.trim()));
  const max = pick((n) => /^(hbo\s*max|max)$/i.test(n.trim()));
  if (!netflix.length || !max.length) {
    throw new Error(`找不到平台 id。Netflix=${netflix} Max=${max}。可用平台：${all.map((p) => p.provider_name).join(', ')}`);
  }
  return { netflix, max };
}

async function genreMap() {
  const [m, t] = await Promise.all([
    tmdb('/genre/movie/list', { language: LANG }),
    tmdb('/genre/tv/list', { language: LANG }),
  ]);
  return {
    movie: Object.fromEntries(m.genres.map((g) => [g.id, g.name])),
    tv: Object.fromEntries(t.genres.map((g) => [g.id, g.name])),
  };
}

// 抓某平台某形式（movie/tv）在該地區訂閱制上架的全部節目
async function discoverAll(kind, providerIds) {
  const items = new Map();
  let page = 1;
  let totalPages = 1;
  do {
    const data = await tmdb(`/discover/${kind}`, {
      watch_region: REGION,
      with_watch_providers: providerIds.join('|'),
      with_watch_monetization_types: 'flatrate',
      language: LANG,
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page,
    });
    totalPages = Math.min(data.total_pages || 1, MAX_PAGES);
    for (const r of data.results) items.set(r.id, r);
    process.stdout.write(`\r  ${kind} 第 ${page}/${totalPages} 頁`);
    page++;
    await sleep(60);
  } while (page <= totalPages);
  process.stdout.write('\n');
  if (totalPages === MAX_PAGES) console.warn(`  注意：${kind} 達 TMDB 500 頁上限，可能有遺漏`);
  return items;
}

function toItem(r, kind, platform, genres) {
  const isTv = kind === 'tv';
  const date = isTv ? r.first_air_date : r.release_date;
  return {
    id: `${kind}-${r.id}`,
    tmdbId: r.id,
    p: platform,
    kind: isTv ? '影集' : '電影',
    zh: (isTv ? r.name : r.title) || (isTv ? r.original_name : r.original_title),
    original: isTv ? r.original_name : r.original_title,
    year: date ? Number(date.slice(0, 4)) : null,
    g: (r.genre_ids || []).map((id) => genres[kind][id]).filter(Boolean),
    poster: r.poster_path || null,
    overview: r.overview || '',
    popularity: r.popularity || 0,
    rating: r.vote_average || 0,
  };
}

async function main() {
  console.log(`地區：${REGION}`);
  const providers = await findProviders();
  console.log('平台 id：', providers);
  const genres = await genreMap();

  const items = [];
  const stats = {};
  for (const kind of ['movie', 'tv']) {
    console.log(`抓取 Netflix ${kind}…`);
    const nf = await discoverAll(kind, providers.netflix);
    console.log(`抓取 HBO Max ${kind}…`);
    const mx = await discoverAll(kind, providers.max);

    let nfOnly = 0, mxOnly = 0, both = 0;
    for (const [id, r] of nf) {
      if (mx.has(id)) { both++; continue; }
      items.push(toItem(r, kind, 'nf', genres)); nfOnly++;
    }
    for (const [id, r] of mx) {
      if (nf.has(id)) continue;
      items.push(toItem(r, kind, 'mx', genres)); mxOnly++;
    }
    stats[kind] = { netflixTotal: nf.size, maxTotal: mx.size, netflixOnly: nfOnly, maxOnly: mxOnly, both };
    console.log(`  ${kind}：Netflix 獨家 ${nfOnly}、HBO Max 獨家 ${mxOnly}、兩邊都有 ${both}`);
  }

  items.sort((a, b) => b.popularity - a.popularity);
  const out = {
    region: REGION,
    updatedAt: new Date().toISOString(),
    source: 'TMDB Watch Providers (JustWatch)',
    stats,
    items,
  };
  await mkdir('public', { recursive: true });
  await writeFile('public/data.json', JSON.stringify(out));
  console.log(`完成：共 ${items.length} 部獨家節目 → public/data.json`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

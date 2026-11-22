import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 0. LOAD .ENV VARIABLES AUTOMATICALLY
// ==========================================
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envLines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {}
}

const app = express();
// Local dev defaults to 3001 (matching vite.config.js proxy); Fly.io sets PORT=8080
const PORT = Number(process.env.PORT) || (process.env.FLY_APP_NAME ? 8080 : 3001);
const CACHE_FILE = path.resolve('./merch-cache.json');

app.use(cors());
app.use(express.json());

// ==========================================
// 1. LEAN PRODUCT & THUMBNAIL URL OPTIMIZERS
// ==========================================
function optimizeThumbnailUrl(rawUrl, defaultWidth = 320) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  if (url.includes('cdn.shopify.com')) {
    const cleanBase = url
      .split('?')[0]
      .replace(/_(\d+x\d*|small|compact|medium|large|grande|master|1024x1024|2048x2048)(?=\.(jpg|jpeg|png|webp|gif))/i, '');
    return `${cleanBase}?width=${defaultWidth}&format=webp`;
  }
  if (url.includes('bcbits.com/img/')) {
    return url.replace(/_(\d+)\.(jpg|jpeg|png|webp)$/i, '_4.$2');
  }
  if (url.includes('bigcartel.com')) {
    return `${url.split('?')[0]}?w=${defaultWidth}&h=${defaultWidth}&fit=clip&auto=format,compress`;
  }
  return url;
}

function slimShopifyProduct(p, sourcePlatform = 'OFFICIAL', cleanUrl = '', vendorOverride = null) {
  const rawImg = p.imageUrl || p.image?.src || p.images?.[0]?.src || (typeof p.image === 'string' ? p.image : null);
  const handlePath = p.handle ? `${cleanUrl}/products/${p.handle}` : p.productUrl || cleanUrl;
  return {
    id: String(p.id || `${sourcePlatform.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    title: String(p.title || 'Merch Item').trim(),
    product_type: String(p.product_type || p.type || ''),
    vendor: String(vendorOverride || p.vendor || sourcePlatform),
    sourcePlatform: p.sourcePlatform || sourcePlatform,
    storeBaseUrl: p.storeBaseUrl || cleanUrl,
    productUrl: p.productUrl || handlePath,
    imageUrl: optimizeThumbnailUrl(rawImg),
    tags: Array.isArray(p.tags)
      ? p.tags.slice(0, 6)
      : typeof p.tags === 'string'
      ? p.tags.split(',').map((t) => t.trim()).slice(0, 6)
      : [],
    variants: (Array.isArray(p.variants) ? p.variants : []).slice(0, 14).map((v, i) => ({
      id: String(v.id || `v-${i}`),
      title: String(v.title || v.option1 || 'One Size'),
      price: String(v.price || '25.00').replace(/[^0-9.]/g, '') || '25.00',
      available: v.available !== false
    }))
  };
}

// ==========================================
// 2. PERSISTENT DISK CACHE
// ==========================================
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    const rawCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    for (const [k, entry] of Object.entries(rawCache)) {
      if (entry && Array.isArray(entry.products)) {
        entry.products = entry.products.map((p) =>
          slimShopifyProduct(p, p.sourcePlatform || 'OFFICIAL', p.storeBaseUrl || entry.storeUrl || '', p.vendor)
        );
      }
      cache[k] = entry;
    }
  } catch {
    cache = {};
  }
}

let saveTimer = null;
const saveCache = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    } catch (e) {
      console.error('Cache write error:', e.message);
    }
  }, 1000);
};

const SHOPIFY_DISTRO_HUBS = [
  { id: 'EVILGREED', name: 'Evil Greed', baseUrl: 'https://evilgreed.net' },
  { id: 'INDIEMERCH', name: 'IndieMerchstore', baseUrl: 'https://www.indiemerchstore.com' },
  { id: 'HOLYMOUNTAIN', name: 'Holy Mountain Printing', baseUrl: 'https://holymountainprinting.com' },
  { id: 'COLDCUTS', name: 'Cold Cuts Merch', baseUrl: 'https://www.coldcutsmerch.com' },
  { id: 'HELLOMERCH', name: 'Hello Merch', baseUrl: 'https://www.hellomerch.com' },
  { id: 'DOWNRIGHT', name: 'Down Right Merch', baseUrl: 'https://downrightmerch.com' },
  { id: 'TWENTYFOUR', name: '24Hundred', baseUrl: 'https://24hundred.net' }
];

function detectRegion(url = '') {
  const u = url.toLowerCase();
  if (u.includes('.co.uk') || u.includes('uk.') || u.includes('/en-gb') || u.includes('/uk')) return 'UK';
  if (u.includes('.eu') || u.includes('eu.') || u.includes('.de') || u.includes('/en-eu')) return 'EU';
  if (u.includes('.com.au') || u.includes('au.') || u.includes('24hundred')) return 'AU';
  if (u.includes('us.') || u.includes('/en-us')) return 'US';
  return 'GLOBAL';
}

async function fetchWithTimeout(url, options = {}, timeout = 4800) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/json,*/*;q=0.8',
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ==========================================
// 3. PUBLIC SPOTIFY PLAYLIST EXTRACTOR (/api/playlist)
// ==========================================
app.get('/api/playlist', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing Spotify playlist URL.' });
  }

  const idMatch = rawUrl.match(/playlist[:/]([a-zA-Z0-9]+)/);
  if (!idMatch) {
    return res.status(400).json({ error: 'Invalid Spotify playlist URL. Paste a public open.spotify.com/playlist/... link.' });
  }

  const playlistId = idMatch[1];

  try {
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const embedRes = await fetchWithTimeout(embedUrl, {}, 6500);
    if (!embedRes.ok) {
      return res.status(embedRes.status === 404 ? 404 : 502).json({
        error: 'Could not load Spotify playlist. Ensure the playlist is set to Public.'
      });
    }

    const html = await embedRes.text();
    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) {
      return res.status(502).json({ error: 'Could not parse playlist tracks from Spotify.' });
    }

    const nextData = JSON.parse(nextDataMatch[1]);
    const entity =
      nextData?.props?.pageProps?.state?.data?.entity ||
      nextData?.props?.pageProps?.initialState?.entities?.items?.[`spotify:playlist:${playlistId}`] ||
      {};

    const playlistName = entity.name || entity.title || 'Spotify Playlist';
    const trackList = entity.trackList || [];
    const artistMap = new Map();

    for (const item of trackList) {
      if (Array.isArray(item.artists) && item.artists.length > 0) {
        for (const a of item.artists) {
          const name = String(a.name || '').trim();
          if (!name) continue;
          const norm = name.toLowerCase();
          const uriParts = String(a.uri || '').split(':');
          const spotifyId = uriParts[2] || `pl-${norm.replace(/[^a-z0-9]+/g, '-')}`;
          if (!artistMap.has(norm)) {
            artistMap.set(norm, {
              id: spotifyId,
              name,
              image: null,
              genres: [],
              spotifyUrl: `https://open.spotify.com/artist/${spotifyId}`,
              trackCount: 1
            });
          } else {
            artistMap.get(norm).trackCount += 1;
          }
        }
      } else if (item.subtitle) {
        const names = String(item.subtitle)
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const name of names) {
          const norm = name.toLowerCase();
          if (!artistMap.has(norm)) {
            artistMap.set(norm, {
              id: `pl-${norm.replace(/[^a-z0-9]+/g, '-')}`,
              name,
              image: null,
              genres: [],
              spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
              trackCount: 1
            });
          } else {
            artistMap.get(norm).trackCount += 1;
          }
        }
      }
    }

    const artists = Array.from(artistMap.values());
    if (artists.length === 0) {
      return res.status(404).json({ error: 'No artists found in this playlist. Ensure it is public and not empty.' });
    }

    return res.json({ playlistId, playlistName, artists });
  } catch (err) {
    return res.status(500).json({ error: `Failed to read Spotify playlist: ${err.message}` });
  }
});

// ==========================================
// 4. LAST.FM USER TOP ARTISTS IMPORTER (/api/lastfm)
// ==========================================
app.get('/api/lastfm', async (req, res) => {
  const username = String(req.query.user || req.query.username || '').trim();
  const validPeriods = new Set(['overall', '7day', '1month', '3month', '6month', '12month']);
  const period = validPeriods.has(req.query.period) ? req.query.period : '6month';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 150);

  if (!username) {
    return res.status(400).json({ error: 'Missing Last.fm username.' });
  }

  const apiKey = (process.env.LASTFM_API_KEY || '').trim();

  if (apiKey) {
    try {
      const apiUrl = `https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${encodeURIComponent(
        username
      )}&period=${encodeURIComponent(period)}&limit=${limit}&api_key=${encodeURIComponent(apiKey)}&format=json`;
      const apiRes = await fetchWithTimeout(apiUrl, { headers: { Accept: 'application/json' } }, 6000);
      const apiData = await apiRes.json();

      if (apiData.error) {
        return res.status(apiData.error === 6 ? 404 : 400).json({
          error: apiData.message || `Last.fm API error (${apiData.error})`
        });
      }

      const rawArtists = apiData?.topartists?.artist || [];
      const artists = rawArtists.map((a, idx) => {
        const imgs = Array.isArray(a.image) ? a.image : [];
        const bestImg =
          imgs.find((i) => i.size === 'extralarge')?.['#text'] ||
          imgs.find((i) => i.size === 'large')?.['#text'] ||
          null;
        return {
          id: `lfm-${a.mbid || `${username.toLowerCase()}-${idx}`}`,
          name: a.name,
          image: bestImg && !bestImg.includes('2a96cbd8b46e442fc41c2b86b821562f') ? bestImg : null,
          genres: [],
          spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(a.name)}`,
          trackCount: parseInt(a.playcount, 10) || 1
        };
      });

      if (artists.length === 0) {
        return res.status(404).json({
          error: `No scrobbled artists found for "${username}" in this time period. Try "All Time" or verify the profile is public.`
        });
      }

      return res.json({ username, period, artists });
    } catch (err) {
      return res.status(500).json({ error: `Last.fm API request failed: ${err.message}` });
    }
  }

  // Fallback public library scraper if LASTFM_API_KEY is not set
  try {
    const periodMap = {
      overall: 'ALL',
      '7day': 'LAST_7_DAYS',
      '1month': 'LAST_30_DAYS',
      '3month': 'LAST_90_DAYS',
      '6month': 'LAST_180_DAYS',
      '12month': 'LAST_365_DAYS'
    };
    const datePreset = periodMap[period] || 'LAST_180_DAYS';
    const webUrl = `https://www.last.fm/user/${encodeURIComponent(username)}/library/artists?date_preset=${datePreset}`;
    const pageRes = await fetchWithTimeout(webUrl, {}, 6000);

    if (pageRes.status === 404) {
      return res.status(404).json({ error: `Last.fm user "${username}" not found.` });
    }
    if (!pageRes.ok) {
      return res.status(502).json({
        error: `Last.fm blocked unauthenticated scraping (HTTP ${pageRes.status}). Add LASTFM_API_KEY to your .env file.`
      });
    }

    const html = await pageRes.text();
    const seen = new Set();
    const artists = [];
    const linkRegex = /href="\/music\/([^"/?#]+)"/gi;
    let m;

    while ((m = linkRegex.exec(html)) !== null && artists.length < limit) {
      const decoded = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
      if (!decoded || decoded.startsWith('_') || decoded.toLowerCase() === 'charts') continue;
      const key = decoded.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      artists.push({
        id: `lfm-${username.toLowerCase()}-${artists.length}`,
        name: decoded,
        image: null,
        genres: [],
        spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(decoded)}`,
        trackCount: limit - artists.length
      });
    }

    if (artists.length === 0) {
      return res.status(404).json({
        error: `No artists found for "${username}". Add LASTFM_API_KEY=your_key to .env for reliable access.`
      });
    }

    return res.json({ username, period, artists });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch Last.fm library: ${err.message}` });
  }
});

// ==========================================
// 5. LAST.FM GLOBAL & GENRE CHARTS IMPORTER (/api/lastfm-charts)
// ==========================================
app.get('/api/lastfm-charts', async (req, res) => {
  const tag = String(req.query.tag || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 150);
  const apiKey = (process.env.LASTFM_API_KEY || '').trim();

  if (!apiKey) {
    return res.status(400).json({
      error: 'LASTFM_API_KEY is missing in your .env / Fly.io secrets. Add it to load Last.fm charts.'
    });
  }

  try {
    const apiUrl = tag
      ? `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(
          tag
        )}&limit=${limit}&api_key=${encodeURIComponent(apiKey)}&format=json`
      : `https://ws.audioscrobbler.com/2.0/?method=chart.gettopartists&limit=${limit}&api_key=${encodeURIComponent(
          apiKey
        )}&format=json`;

    const apiRes = await fetchWithTimeout(apiUrl, { headers: { Accept: 'application/json' } }, 6000);
    const apiData = await apiRes.json();

    if (apiData.error) {
      return res.status(400).json({ error: apiData.message || `Last.fm API error (${apiData.error})` });
    }

    const rawArtists = tag ? apiData?.topartists?.artist || [] : apiData?.artists?.artist || [];
    const artists = rawArtists.map((a, idx) => {
      const imgs = Array.isArray(a.image) ? a.image : [];
      const bestImg =
        imgs.find((i) => i.size === 'extralarge')?.['#text'] ||
        imgs.find((i) => i.size === 'large')?.['#text'] ||
        null;

      return {
        id: `lfm-chart-${a.mbid || `${(tag || 'global').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`}`,
        name: a.name,
        image: bestImg && !bestImg.includes('2a96cbd8b46e442fc41c2b86b821562f') ? bestImg : null,
        genres: tag ? [tag.toLowerCase()] : [],
        spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(a.name)}`,
        trackCount: Math.max(1, limit - idx)
      };
    });

    if (artists.length === 0) {
      return res.status(404).json({ error: `No chart artists found${tag ? ` for genre "${tag}"` : ''}.` });
    }

    return res.json({
      chartName: tag ? `Last.fm Chart: ${tag}` : 'Last.fm Global Top Artists',
      artists
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch Last.fm charts: ${err.message}` });
  }
});

// ==========================================
// 6. ARTIST PORTRAIT & METADATA LOOKUP HELPERS
// ==========================================
async function lookupArtistPhoto(artistName, wikidataImage = null) {
  try {
    const res = await fetchWithTimeout(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`,
      { headers: { Accept: 'application/json' } },
      3500
    );
    if (res.ok) {
      const data = await res.json();
      const first = data?.data?.[0];
      if (first && first.name && first.name.toLowerCase() === artistName.toLowerCase()) {
        return first.picture_medium || first.picture || wikidataImage || null;
      }
    }
  } catch {}
  return wikidataImage || null;
}

async function lookupWikidataBySpotifyId(spotifyId) {
  if (!spotifyId || spotifyId.startsWith('demo-') || spotifyId.startsWith('pl-') || spotifyId.startsWith('lfm-')) {
    return { officialWebsite: null, bandcampUrl: null, wikidataImage: null };
  }
  try {
    const sparql = `SELECT ?website ?bandcamp ?image WHERE { ?item wdt:P1902 "${spotifyId}". OPTIONAL { ?item wdt:P856 ?website. } OPTIONAL { ?item wdt:P3283 ?bandcamp. } OPTIONAL { ?item wdt:P18 ?image. } } LIMIT 5`;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/sparql-results+json' } }, 4200);
    if (!res.ok) return { officialWebsite: null, bandcampUrl: null, wikidataImage: null };
    const data = await res.json();
    let officialWebsite = null;
    let bandcampUrl = null;
    let wikidataImage = null;
    for (const row of data?.results?.bindings || []) {
      if (row.website?.value && !officialWebsite) officialWebsite = row.website.value;
      if (row.bandcamp?.value && !bandcampUrl) bandcampUrl = `https://${row.bandcamp.value}.bandcamp.com/merch`;
      if (row.image?.value && !wikidataImage) {
        wikidataImage = `${row.image.value.replace(/^http:/, 'https:')}?width=250`;
      }
    }
    return { officialWebsite, bandcampUrl, wikidataImage };
  } catch {
    return { officialWebsite: null, bandcampUrl: null, wikidataImage: null };
  }
}

async function lookupMusicBrainz(artistName) {
  try {
    const searchUrl = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(`"${artistName}"`)}&fmt=json&limit=1`;
    const searchRes = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MerchPulse/3.5 (https://spotify-merch-hub.fly.dev)'
        }
      },
      4500
    );
    if (!searchRes.ok) return { urls: [], genres: [] };
    const searchData = await searchRes.json();
    const artist = searchData.artists?.[0];
    if (!artist) return { urls: [], genres: [] };

    const genres = (artist.tags || [])
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 4)
      .map((t) => t.name.toLowerCase());

    const relUrl = `https://musicbrainz.org/ws/2/artist/${artist.id}?inc=url-rels&fmt=json`;
    const relRes = await fetchWithTimeout(
      relUrl,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MerchPulse/3.5 (https://spotify-merch-hub.fly.dev)'
        }
      },
      4500
    );
    if (!relRes.ok) return { urls: [], genres };
    const relData = await relRes.json();

    const urls = (relData.relations || [])
      .filter((r) => r.url?.resource)
      .map((r) => ({ type: r.type, url: r.url.resource }));

    return { urls, genres };
  } catch {
    return { urls: [], genres: [] };
  }
}

async function crawlWebsiteAndLinktreeForStores(websiteUrl) {
  const discovered = { storeUrls: [], bandcampUrl: null, bigcartelUrl: null };
  if (!websiteUrl) return discovered;

  const parseLinks = (html, baseOrigin) => {
    const linktreeCandidates = [];
    const anchorRegex = /<a[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRegex.exec(html)) !== null) {
      let href = m[1].trim().replace(/&amp;/g, '&');
      const text = m[2].replace(/<[^>]+>/g, ' ').toLowerCase();
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
      if (href.startsWith('/') && baseOrigin) href = `${baseOrigin.replace(/\/+$/, '')}${href}`;
      if (!/^https?:\/\//i.test(href)) continue;
      const lower = href.toLowerCase();

      if (lower.includes('bandcamp.com') && !discovered.bandcampUrl) {
        try {
          const u = new URL(href);
          if (!['daily', 'get', 'bandcamp'].includes(u.hostname.split('.')[0])) {
            discovered.bandcampUrl = `${u.origin}/merch`;
          }
        } catch {}
      } else if (lower.includes('.bigcartel.com') && !discovered.bigcartelUrl) {
        try {
          discovered.bigcartelUrl = new URL(href).origin;
        } catch {}
      } else if (lower.includes('linktr.ee/') || lower.includes('solo.to/') || lower.includes('beacons.ai/')) {
        linktreeCandidates.push(href);
      } else if (
        lower.includes('myshopify.com') ||
        lower.includes('store.') ||
        lower.includes('shop.') ||
        lower.includes('merch') ||
        /\b(store|shop|merch|merchandise|apparel)\b/i.test(text)
      ) {
        try {
          const parsed = new URL(href);
          if (
            !['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'open.spotify.com', 'apple.com'].some((d) =>
              parsed.hostname.includes(d)
            )
          ) {
            discovered.storeUrls.push(parsed.origin);
          }
        } catch {}
      }
    }
    return linktreeCandidates;
  };

  try {
    const origin = new URL(websiteUrl).origin;
    const res = await fetchWithTimeout(websiteUrl, {}, 4000);
    if (res.ok) {
      const html = await res.text();
      const linktrees = parseLinks(html, origin);
      if (linktrees.length > 0) {
        const ltRes = await fetchWithTimeout(linktrees[0], {}, 3500);
        if (ltRes.ok) {
          const ltHtml = await ltRes.text();
          parseLinks(ltHtml, '');
        }
      }
    }
  } catch {}

  discovered.storeUrls = Array.from(new Set(discovered.storeUrls)).slice(0, 6);
  return discovered;
}

async function searchDuckDuckGoForStores(artistName) {
  const result = { storeUrls: [], bandcampUrl: null, bigcartelUrl: null };
  try {
    const q = `"${artistName}" ("official store" OR "merch" OR site:bandcamp.com OR site:bigcartel.com)`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const res = await fetchWithTimeout(url, {}, 4200);
    if (!res.ok) return result;
    const html = await res.text();
    const uddgRegex = /uddg=([^&"']+)/gi;
    let m;
    while ((m = uddgRegex.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(m[1]);
        const lower = decoded.toLowerCase();
        if (lower.includes('bandcamp.com') && !result.bandcampUrl) {
          const u = new URL(decoded);
          if (!['daily', 'get', 'bandcamp'].includes(u.hostname.split('.')[0])) {
            result.bandcampUrl = `${u.origin}/merch`;
          }
        } else if (lower.includes('.bigcartel.com') && !result.bigcartelUrl) {
          result.bigcartelUrl = new URL(decoded).origin;
        } else if (lower.includes('store') || lower.includes('shop') || lower.includes('merch')) {
          const u = new URL(decoded);
          if (
            !['duckduckgo.com', 'google.com', 'reddit.com', 'ebay.com', 'amazon.com', 'etsy.com'].some((d) =>
              u.hostname.includes(d)
            )
          ) {
            result.storeUrls.push(u.origin);
          }
        }
      } catch {}
    }
  } catch {}
  result.storeUrls = Array.from(new Set(result.storeUrls)).slice(0, 4);
  return result;
}

// ==========================================
// 7. STORE SCRAPERS (ALL 15 PLATFORMS)
// ==========================================
async function probeShopifyFeed(baseUrl, sourcePlatform = 'OFFICIAL', vendorOverride = null) {
  if (!baseUrl) return null;
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${cleanUrl}/products.json?limit=24`, { headers: { Accept: 'application/json' } }, 3600);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.products) && data.products.length > 0) {
      const tagged = data.products.map((p) => slimShopifyProduct(p, sourcePlatform, cleanUrl, vendorOverride));
      return { storeUrl: cleanUrl, products: tagged };
    }
  } catch {}
  return null;
}

async function fetchShopifyDistroProducts(distro, artistName) {
  const dashSlug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artistLower = artistName.toLowerCase();

  try {
    if (dashSlug.length > 2) {
      const colUrl = `${distro.baseUrl}/collections/${dashSlug}/products.json?limit=18`;
      const colRes = await fetchWithTimeout(colUrl, { headers: { Accept: 'application/json' } }, 4000);
      if (colRes.ok) {
        const colData = await colRes.json();
        if (Array.isArray(colData?.products) && colData.products.length > 0) {
          return colData.products.map((p) => slimShopifyProduct(p, distro.id, distro.baseUrl, distro.name));
        }
      }
    }

    const suggestUrl = `${distro.baseUrl}/search/suggest.json?q=${encodeURIComponent(
      artistName
    )}&resources[type]=product&resources[limit]=14`;
    const sugRes = await fetchWithTimeout(suggestUrl, { headers: { Accept: 'application/json' } }, 4000);
    if (sugRes.ok) {
      const sugData = await sugRes.json();
      const rawProducts = sugData?.resources?.results?.products || [];
      const matched = rawProducts
        .filter(
          (p) =>
            String(p.title || '').toLowerCase().includes(artistLower) ||
            String(p.vendor || '').toLowerCase().includes(artistLower)
        )
        .map((p, idx) => ({
          id: `${distro.id.toLowerCase()}-${p.id || idx}`,
          title: p.title,
          product_type:
            p.type ||
            (/hoodie|sweat/i.test(p.title) ? 'Hoodie' : /vinyl|lp|12"/i.test(p.title) ? 'Vinyl' : 'T-Shirt'),
          vendor: distro.name,
          sourcePlatform: distro.id,
          storeBaseUrl: distro.baseUrl,
          productUrl: p.url ? `${distro.baseUrl}${p.url.split('?')[0]}` : distro.baseUrl,
          imageUrl: optimizeThumbnailUrl(p.image || p.featured_image?.url || null),
          tags: [distro.id.toLowerCase(), p.type || 'merch'],
          variants: ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
            id: `${distro.id.toLowerCase()}-v-${idx}-${i}`,
            title: sz,
            price: String(p.price || '28.00').replace(/[^0-9.]/g, '') || '28.00',
            available: Boolean(p.available !== false)
          }))
        }));
      if (matched.length > 0) return matched;
    }
  } catch {}
  return [];
}

async function fetchBigCartelProducts(candidateOrigins = [], artistName = '') {
  const uniqueOrigins = Array.from(new Set(candidateOrigins.filter(Boolean))).slice(0, 4);
  const results = await Promise.all(
    uniqueOrigins.map(async (origin) => {
      try {
        const cleanOrigin = origin.replace(/\/+$/, '');
        const res = await fetchWithTimeout(`${cleanOrigin}/products.json`, { headers: { Accept: 'application/json' } }, 3600);
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.slice(0, 20).map((item, idx) => {
            const productUrl = item.url ? (item.url.startsWith('http') ? item.url : `${cleanOrigin}${item.url}`) : cleanOrigin;
            const imageUrl = optimizeThumbnailUrl(item.images?.[0]?.url || null);
            const options = Array.isArray(item.options) && item.options.length > 0 ? item.options : [];
            return {
              id: `bigc-${item.id || idx}`,
              title: item.name || `${artistName} Merch`,
              product_type:
                item.categories?.[0]?.name ||
                (/hoodie|sweat/i.test(item.name) ? 'Hoodie' : /vinyl|lp|cd/i.test(item.name) ? 'Vinyl' : 'T-Shirt'),
              vendor: `${artistName} BigCartel`,
              sourcePlatform: 'BIGCARTEL',
              storeBaseUrl: cleanOrigin,
              productUrl,
              imageUrl,
              tags: ['bigcartel'],
              variants:
                options.length > 0
                  ? options.map((opt, i) => ({
                      id: String(opt.id || `bco-${idx}-${i}`),
                      title: opt.name || 'One Size',
                      price: String(opt.price || item.price || '25.00'),
                      available: opt.sold_out !== true && item.status !== 'sold-out'
                    }))
                  : [
                      {
                        id: `bco-${idx}-os`,
                        title: 'One Size',
                        price: String(item.price || '25.00'),
                        available: item.status !== 'sold-out'
                      }
                    ]
            };
          });
        }
      } catch {}
      return null;
    })
  );

  return results.find((r) => Array.isArray(r) && r.length > 0) || [];
}

async function fetchBandcampProducts(bandcampMerchUrl, artistName, officialWebsiteUrl = null) {
  const slug = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidateUrls = new Set();

  if (bandcampMerchUrl) {
    candidateUrls.add(bandcampMerchUrl.replace(/\/+$/, '') + (bandcampMerchUrl.endsWith('/merch') ? '' : '/merch'));
  }
  if (officialWebsiteUrl) {
    try {
      const hostSlug = new URL(officialWebsiteUrl).hostname.replace(/^www\./, '').split('.')[0];
      if (hostSlug && hostSlug.length > 2) candidateUrls.add(`https://${hostSlug}.bandcamp.com/merch`);
    } catch {}
  }

  if (!bandcampMerchUrl) {
    try {
      const searchRes = await fetchWithTimeout(
        `https://bandcamp.com/search?q=${encodeURIComponent(artistName)}&item_type=b`,
        {},
        4000
      );
      if (searchRes.ok) {
        const searchHtml = await searchRes.text();
        const subRegex = /https?:\/\/([a-z0-9-]+)\.bandcamp\.com/gi;
        let m;
        while ((m = subRegex.exec(searchHtml)) !== null) {
          const sub = m[1].toLowerCase();
          if (!['daily', 'get', 'bandcamp', 'f4', 's4', 'bcbits'].includes(sub)) {
            candidateUrls.add(`https://${sub}.bandcamp.com/merch`);
            if (candidateUrls.size >= 3) break;
          }
        }
      }
    } catch {}
  }

  if (slug.length > 2) {
    candidateUrls.add(`https://${slug}.bandcamp.com/merch`);
    candidateUrls.add(`https://${slug}music.bandcamp.com/merch`);
  }

  const targets = Array.from(candidateUrls).slice(0, 4);
  const probeResults = await Promise.all(
    targets.map(async (targetUrl) => {
      try {
        const res = await fetchWithTimeout(targetUrl, {}, 4500);
        if (!res.ok) return null;
        const html = await res.text();
        const origin = new URL(targetUrl).origin;
        const products = [];

        const liRegex = /<li[^>]*class="[^"]*merch-grid-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
        let match;
        let idx = 0;
        while ((match = liRegex.exec(html)) !== null && idx < 24) {
          const block = match[1];
          const hrefMatch = block.match(/<a[^>]*href="([^"]+)"/i);
          const imgMatch =
            block.match(/data-original="(https:\/\/f4\.bcbits\.com\/img\/[^"]+)"/i) ||
            block.match(/src="(https:\/\/f4\.bcbits\.com\/img\/[^"]+)"/i);
          const titleMatch = block.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
          const typeMatch = block.match(/<div[^>]*class="[^"]*merchtype[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          const priceMatch =
            block.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
            block.match(/(?:€|\$|£)\s*([0-9]+(?:\.[0-9]{2})?)/i);
          const soldOut = /sold\s*out/i.test(block);

          if (titleMatch) {
            idx++;
            const rawTitle = titleMatch[1]
              .replace(/<[^>]+>/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'")
              .replace(/\s+/g, ' ')
              .trim();
            const rawType = typeMatch ? typeMatch[1].replace(/<[^>]+>/g, '').trim() : 'Merch';
            const priceNum = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').replace(/[^0-9.]/g, '') || '25.00' : '25.00';
            const itemPath = hrefMatch ? hrefMatch[1].replace(/&amp;/g, '&') : '/merch';
            const productUrl = itemPath.startsWith('http') ? itemPath : `${origin}${itemPath}`;
            const isApparel = /shirt|tee|hoodie|sweat|longsleeve|jacket|apparel/i.test(`${rawTitle} ${rawType}`);

            products.push({
              id: `bc-${idx}-${slug}`,
              title: rawTitle,
              product_type: rawType || (isApparel ? 'T-Shirt' : 'Vinyl'),
              vendor: `${artistName} Bandcamp`,
              sourcePlatform: 'BANDCAMP',
              storeBaseUrl: origin,
              productUrl,
              imageUrl: optimizeThumbnailUrl(imgMatch ? imgMatch[1] : null),
              tags: [rawType, 'bandcamp'],
              variants: isApparel
                ? ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
                    id: `bc-v-${idx}-${i}`,
                    title: sz,
                    price: priceNum,
                    available: !soldOut
                  }))
                : [{ id: `bc-v-${idx}-os`, title: 'One Size', price: priceNum, available: !soldOut }]
            });
          }
        }
        if (products.length > 0) return { bandcampUrl: targetUrl, products };
      } catch {}
      return null;
    })
  );

  return probeResults.find(Boolean) || { bandcampUrl: bandcampMerchUrl, products: [] };
}

async function fetchAmazonProducts(artistName, region = 'UK') {
  try {
    const domain =
      region === 'UK'
        ? 'https://www.amazon.co.uk'
        : region === 'EU'
        ? 'https://www.amazon.de'
        : region === 'AU'
        ? 'https://www.amazon.com.au'
        : 'https://www.amazon.com';
    const searchUrl = `${domain}/s?k=${encodeURIComponent(`${artistName} official band merch`)}`;
    const res = await fetchWithTimeout(searchUrl, {}, 4000);
    if (!res.ok) return [];
    const html = await res.text();
    const products = [];
    const artistLower = artistName.toLowerCase();
    const cardRegex = /data-asin="([A-Z0-9]{10})"[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi;
    let m;
    let idx = 0;
    while ((m = cardRegex.exec(html)) !== null && idx < 8) {
      const asin = m[1];
      const img = m[2];
      const title = m[3].replace(/^Sponsored Ad -\s*/i, '').trim();
      if (!title.toLowerCase().includes(artistLower)) continue;
      idx++;
      products.push({
        id: `amz-${asin}`,
        title,
        product_type: /hoodie|sweat/i.test(title) ? 'Hoodie' : /vinyl|lp|cd/i.test(title) ? 'Vinyl' : 'T-Shirt',
        vendor: `Amazon ${region}`,
        sourcePlatform: 'AMAZON',
        storeBaseUrl: domain,
        productUrl: `${domain}/dp/${asin}`,
        imageUrl: img,
        tags: ['amazon'],
        variants: ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
          id: `amz-v-${idx}-${i}`,
          title: sz,
          price: '24.99',
          available: true
        }))
      });
    }
    return products;
  } catch {
    return [];
  }
}

async function fetchMerchbarProducts(artistName) {
  try {
    const searchUrl = `https://www.merchbar.com/search?q=${encodeURIComponent(artistName)}`;
    const res = await fetchWithTimeout(searchUrl, {}, 4800);
    if (!res.ok) return [];
    const html = await res.text();
    const products = [];
    const artistLower = artistName.toLowerCase();
    const dashSlug = artistLower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let idx = 0;

    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextMatch) {
      try {
        const nextJson = JSON.parse(nextMatch[1]);
        const seen = new Set();
        const walk = (node) => {
          if (!node || typeof node !== 'object' || idx >= 16) return;
          if (Array.isArray(node)) {
            for (const c of node) walk(c);
            return;
          }
          const title = node.title || node.name;
          const img = node.image_url || node.imageUrl || (typeof node.image === 'string' ? node.image : node.image?.url);
          const slugOrUrl = node.url || node.href || node.slug || '';
          const brandName = String(
            node.brand || node.artist || node.artist_name || node.vendor || node.merchant || ''
          ).toLowerCase();

          if (title && typeof title === 'string' && img && typeof img === 'string' && title.length > 3) {
            const cleanTitle = title.trim();
            const titleLower = cleanTitle.toLowerCase();
            const urlLower = String(slugOrUrl).toLowerCase();
            const matchesArtist =
              titleLower.includes(artistLower) ||
              brandName.includes(artistLower) ||
              (dashSlug.length > 2 && urlLower.includes(dashSlug));

            if (matchesArtist && !seen.has(cleanTitle)) {
              seen.add(cleanTitle);
              idx++;
              const rawPrice = node.price || node.sale_price || node.retail_price || '24.99';
              const price =
                String(typeof rawPrice === 'number' && rawPrice > 200 ? (rawPrice / 100).toFixed(2) : rawPrice).replace(
                  /[^0-9.]/g,
                  ''
                ) || '24.99';
              const productUrl = slugOrUrl
                ? String(slugOrUrl).startsWith('http')
                  ? slugOrUrl
                  : `https://www.merchbar.com/${String(slugOrUrl).replace(/^\/+/, '')}`
                : searchUrl;
              const isApparel = /shirt|tee|hoodie|sweat|longsleeve/i.test(cleanTitle);
              const isWaitlist = Boolean(node.waitlist || node.out_of_stock || node.sold_out === true);
              products.push({
                id: `mb-${idx}-${artistLower.replace(/[^a-z0-9]/g, '')}`,
                title: titleLower.includes(artistLower) ? cleanTitle : `${artistName} - ${cleanTitle}`,
                product_type: /hoodie|sweat/i.test(cleanTitle)
                  ? 'Hoodie'
                  : /vinyl|lp|cd|record/i.test(cleanTitle)
                  ? 'Vinyl'
                  : 'T-Shirt',
                vendor: 'Merchbar',
                sourcePlatform: 'MERCHBAR',
                storeBaseUrl: 'https://www.merchbar.com',
                productUrl,
                imageUrl: optimizeThumbnailUrl(img),
                tags: ['merchbar'],
                variants: isApparel
                  ? ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
                      id: `mb-v-${idx}-${i}`,
                      title: sz,
                      price,
                      available: !isWaitlist
                    }))
                  : [{ id: `mb-v-${idx}-os`, title: 'One Size', price, available: !isWaitlist }]
              });
            }
          }
          for (const k of Object.keys(node)) walk(node[k]);
        };
        walk(nextJson);
      } catch {}
    }
    return products;
  } catch {
    return [];
  }
}

async function fetchEyesoreProducts(artistName) {
  try {
    const searchUrl = `https://eyesoremerch.com/catalogsearch/result/?q=${encodeURIComponent(artistName)}`;
    const res = await fetchWithTimeout(searchUrl, {}, 4500);
    if (!res.ok) return [];
    const html = await res.text();
    const products = [];
    const artistLower = artistName.toLowerCase();

    const itemRegex = /<li[^>]*class="[^"]*product-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    let idx = 0;
    while ((match = itemRegex.exec(html)) !== null && idx < 14) {
      const block = match[1];
      const linkMatch = block.match(/<a[^>]*class="[^"]*product-item-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const productUrl = linkMatch[1].trim();
      const rawTitle = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!rawTitle.toLowerCase().includes(artistLower)) continue;

      const imgMatch =
        block.match(/<img[^>]*class="[^"]*product-image-photo[^"]*"[^>]*src="([^"]+)"/i) ||
        block.match(/data-src="([^"]+)"/i);
      const priceMatch = block.match(/data-price-amount="([0-9.]+)"/i) || block.match(/£([0-9]+\.[0-9]{2})/);
      const priceNum = priceMatch ? priceMatch[1] : '24.99';
      const isApparel = /shirt|tee|hoodie|sweat|longsleeve|pullover|zip/i.test(rawTitle);

      idx++;
      products.push({
        id: `eye-${idx}-${artistLower.replace(/[^a-z0-9]/g, '')}`,
        title: rawTitle,
        product_type: /hoodie|sweat/i.test(rawTitle)
          ? 'Hoodie'
          : /longsleeve|long sleeve/i.test(rawTitle)
          ? 'Longsleeve'
          : /patch|pin|cap|hat|beanie/i.test(rawTitle)
          ? 'Accessories'
          : 'T-Shirt',
        vendor: 'Eyesore Merch UK',
        sourcePlatform: 'EYESORE',
        storeBaseUrl: 'https://eyesoremerch.com',
        productUrl,
        imageUrl: optimizeThumbnailUrl(imgMatch ? imgMatch[1] : null),
        tags: ['eyesore'],
        variants: isApparel
          ? ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
              id: `eye-v-${idx}-${i}`,
              title: sz,
              price: priceNum,
              available: true
            }))
          : [{ id: `eye-v-${idx}-os`, title: 'One Size', price: priceNum, available: true }]
      });
    }
    return products;
  } catch {
    return [];
  }
}

async function fetchImpericonProducts(artistName, region = 'UK') {
  try {
    const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const localePath = region === 'EU' ? 'de' : 'uk';
    const urlsToTry = [
      { url: `https://www.impericon.com/${localePath}/${slug}.html`, isDedicatedArtistPage: true },
      { url: `https://www.impericon.com/${localePath}/search?q=${encodeURIComponent(artistName)}`, isDedicatedArtistPage: false }
    ];
    const artistLower = artistName.toLowerCase();

    const probeResults = await Promise.all(
      urlsToTry.map(async ({ url, isDedicatedArtistPage }) => {
        try {
          const res = await fetchWithTimeout(url, {}, 4500);
          if (!res.ok) return null;
          const html = await res.text();
          const products = [];
          let idx = 0;

          const ldMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
          for (const scriptBlock of ldMatches) {
            try {
              const jsonText = scriptBlock.replace(/<\/?script[^>]*>/gi, '').trim();
              const parsed = JSON.parse(jsonText);
              const items = Array.isArray(parsed)
                ? parsed
                : parsed?.itemListElement
                ? parsed.itemListElement.map((e) => e.item || e)
                : [parsed];
              for (const item of items) {
                if (item && (item['@type'] === 'Product' || item.name)) {
                  const rawName = String(item.name || '').trim();
                  const brandStr = String(item.brand?.name || item.brand || '').toLowerCase();
                  const matchesBand =
                    isDedicatedArtistPage ||
                    rawName.toLowerCase().includes(artistLower) ||
                    brandStr.includes(artistLower);

                  if (rawName && matchesBand) {
                    idx++;
                    const title = rawName.toLowerCase().includes(artistLower) ? rawName : `${artistName} - ${rawName}`;
                    const price = String(item.offers?.price || item.offers?.[0]?.price || '29.99');
                    const imageUrl = Array.isArray(item.image) ? item.image[0] : item.image || null;
                    const productUrl = item.url || url;
                    const isApparel = /shirt|tee|hoodie|sweat|longsleeve|tank/i.test(title);
                    products.push({
                      id: `imp-${idx}-${slug}`,
                      title,
                      product_type: /hoodie|sweat/i.test(title)
                        ? 'Hoodie'
                        : /longsleeve|long sleeve/i.test(title)
                        ? 'Longsleeve'
                        : /vinyl|lp|cd/i.test(title)
                        ? 'Vinyl'
                        : 'T-Shirt',
                      vendor: `Impericon ${region}`,
                      sourcePlatform: 'IMPERICON',
                      storeBaseUrl: 'https://www.impericon.com',
                      productUrl,
                      imageUrl: optimizeThumbnailUrl(imageUrl),
                      tags: ['impericon'],
                      variants: isApparel
                        ? ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
                            id: `imp-v-${idx}-${i}`,
                            title: sz,
                            price,
                            available: true
                          }))
                        : [{ id: `imp-v-${idx}-os`, title: 'One Size', price, available: true }]
                    });
                  }
                }
              }
            } catch {}
          }
          if (products.length > 0) return products.slice(0, 14);
        } catch {}
        return null;
      })
    );

    return probeResults.find(Boolean) || [];
  } catch {
    return [];
  }
}

async function fetchKingsRoadAndBleepProducts(artistName, region = 'UK') {
  const results = [];
  const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artistLower = artistName.toLowerCase();

  try {
    const krBase = region === 'US' ? 'https://kingsroadmerch.com' : 'https://eu.kingsroadmerch.com';
    const krUrl = `${krBase}/${slug}`;
    const res = await fetchWithTimeout(krUrl, {}, 4000);
    if (res.ok) {
      const html = await res.text();
      const imgRegex = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi;
      let m;
      let idx = 0;
      while ((m = imgRegex.exec(html)) !== null && idx < 10) {
        const href = m[1];
        const img = m[2];
        const title = m[3].trim();
        if (title.length > 3 && (title.toLowerCase().includes(artistLower) || href.includes(slug))) {
          idx++;
          results.push({
            id: `kr-${idx}-${slug}`,
            title: title.toLowerCase().includes(artistLower) ? title : `${artistName} - ${title}`,
            product_type: /hoodie|sweat/i.test(title) ? 'Hoodie' : /vinyl|lp|cd/i.test(title) ? 'Vinyl' : 'T-Shirt',
            vendor: 'Kings Road Merch',
            sourcePlatform: 'KINGSROAD',
            storeBaseUrl: krBase,
            productUrl: href.startsWith('http') ? href : `${krBase}${href}`,
            imageUrl: optimizeThumbnailUrl(img.startsWith('http') ? img : `${krBase}${img}`),
            tags: ['kingsroad'],
            variants: ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
              id: `kr-v-${idx}-${i}`,
              title: sz,
              price: '29.99',
              available: true
            }))
          });
        }
      }
    }
  } catch {}

  return results;
}

// ==========================================
// 8. MAIN /api/discover ENDPOINT
// ==========================================
app.get('/api/discover', async (req, res) => {
  const artistName = (req.query.artist || '').trim();
  const spotifyId = (req.query.spotifyId || '').trim();
  const customUrl = (req.query.customUrl || '').trim();
  const preferredRegion = (req.query.region || 'UK').toUpperCase();
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';

  if (!artistName) return res.status(400).json({ error: 'Missing artist parameter' });
  const cacheKey = `${artistName.toLowerCase()}::${preferredRegion}::v4`;

  let siteOverrides = {};
  if (req.query.siteOverrides) {
    try {
      siteOverrides = JSON.parse(String(req.query.siteOverrides));
    } catch {}
  }

  if (customUrl && Object.keys(siteOverrides).length <= 1) {
    const manualProbe = await probeShopifyFeed(customUrl, 'OFFICIAL');
    return res.json({
      artist: artistName,
      storeUrl: manualProbe?.storeUrl || customUrl,
      officialWebsite: cache[cacheKey]?.officialWebsite || customUrl,
      artistImage: cache[cacheKey]?.artistImage || null,
      source: manualProbe ? 'manual-shopify' : 'manual-link',
      products: manualProbe?.products || [],
      genres: cache[cacheKey]?.genres || []
    });
  }

  if (
    !forceRefresh &&
    cache[cacheKey] &&
    Array.isArray(cache[cacheKey].products) &&
    cache[cacheKey].products.length > 0 &&
    Date.now() - cache[cacheKey].updatedAt < 7 * 86400000
  ) {
    return res.json(cache[cacheKey]);
  }

  try {
    const [wikidata, { urls, genres }] = await Promise.all([
      lookupWikidataBySpotifyId(spotifyId),
      lookupMusicBrainz(artistName)
    ]);

    const artistImage = await lookupArtistPhoto(artistName, wikidata.wikidataImage);

    let officialWebsite = wikidata.officialWebsite || null;
    let bandcampUrl = siteOverrides.BANDCAMP || wikidata.bandcampUrl || null;
    const regionalWebsites = {};
    const regionalStores = {};
    const webPresence = {};
    const candidateShopifyDomains = new Set();
    const candidateBigCartelDomains = new Set();

    if (siteOverrides.OFFICIAL) candidateShopifyDomains.add(siteOverrides.OFFICIAL);
    if (siteOverrides.BIGCARTEL) candidateBigCartelDomains.add(siteOverrides.BIGCARTEL);

    for (const rel of urls) {
      const u = rel.url;
      const lower = u.toLowerCase();
      const reg = detectRegion(u);

      if (lower.includes('bandcamp.com')) {
        if (!bandcampUrl) bandcampUrl = u.replace(/\/+$/, '') + (lower.endsWith('/merch') ? '' : '/merch');
        webPresence.bandcamp = bandcampUrl;
      } else if (lower.includes('.bigcartel.com')) {
        try {
          candidateBigCartelDomains.add(new URL(u).origin);
        } catch {}
      } else if (lower.includes('instagram.com')) {
        webPresence.instagram = u;
      } else if (lower.includes('youtube.com')) {
        webPresence.youtube = u;
      } else if (lower.includes('discogs.com')) {
        webPresence.discogs = u;
      } else if (rel.type === 'official homepage') {
        if (!officialWebsite) officialWebsite = u;
        regionalWebsites[reg] = u;
        try {
          const parsed = new URL(u);
          const bareHost = parsed.hostname.replace(/^www\./, '');
          candidateShopifyDomains.add(parsed.origin);
          candidateShopifyDomains.add(`https://store.${bareHost}`);
          candidateShopifyDomains.add(`https://shop.${bareHost}`);
          candidateShopifyDomains.add(`https://ukstore.${bareHost}`);
          candidateShopifyDomains.add(`https://eustore.${bareHost}`);
        } catch {}
      } else if (rel.type === 'purchase for mail-order' || lower.includes('store') || lower.includes('shop')) {
        regionalStores[reg] = u;
        try {
          candidateShopifyDomains.add(new URL(u).origin);
        } catch {}
      }
    }

    if (officialWebsite) {
      const crawled = await crawlWebsiteAndLinktreeForStores(officialWebsite);
      for (const sUrl of crawled.storeUrls) candidateShopifyDomains.add(sUrl);
      if (crawled.bandcampUrl && !bandcampUrl) bandcampUrl = crawled.bandcampUrl;
      if (crawled.bigcartelUrl) candidateBigCartelDomains.add(crawled.bigcartelUrl);
    }

    if (!officialWebsite && candidateShopifyDomains.size === 0) {
      const ddg = await searchDuckDuckGoForStores(artistName);
      for (const sUrl of ddg.storeUrls) candidateShopifyDomains.add(sUrl);
      if (ddg.bandcampUrl && !bandcampUrl) bandcampUrl = ddg.bandcampUrl;
      if (ddg.bigcartelUrl) candidateBigCartelDomains.add(ddg.bigcartelUrl);
    }

    const slug = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (slug.length > 2) {
      candidateShopifyDomains.add(`https://store.${slug}.com`);
      candidateShopifyDomains.add(`https://shop.${slug}.com`);
      candidateShopifyDomains.add(`https://${slug}merch.com`);
      candidateBigCartelDomains.add(`https://${slug}.bigcartel.com`);
      candidateBigCartelDomains.add(`https://${slug}merch.bigcartel.com`);
    }

    const shopifyDomainList = Array.from(candidateShopifyDomains).slice(0, 6);

    const [
      shopifyProbeResults,
      distroProductArrays,
      bigCartelItems,
      bandcampResult,
      amazonItems,
      merchbarItems,
      eyesoreItems,
      impericonItems,
      krItems
    ] = await Promise.all([
      Promise.all(shopifyDomainList.map((domain) => probeShopifyFeed(domain, 'OFFICIAL'))),
      Promise.all(SHOPIFY_DISTRO_HUBS.map((distro) => fetchShopifyDistroProducts(distro, artistName))),
      fetchBigCartelProducts(Array.from(candidateBigCartelDomains), artistName),
      fetchBandcampProducts(bandcampUrl, artistName, officialWebsite),
      fetchAmazonProducts(artistName, preferredRegion),
      fetchMerchbarProducts(artistName),
      fetchEyesoreProducts(artistName),
      fetchImpericonProducts(artistName, preferredRegion),
      fetchKingsRoadAndBleepProducts(artistName, preferredRegion)
    ]);

    const officialStoreResult = shopifyProbeResults.find(Boolean) || null;
    if (officialStoreResult) {
      regionalStores[detectRegion(officialStoreResult.storeUrl)] = officialStoreResult.storeUrl;
    }

    const distroItems = distroProductArrays.flat();
    const bandcampItems = bandcampResult?.products || [];
    if (bandcampResult?.bandcampUrl) {
      bandcampUrl = bandcampResult.bandcampUrl;
      webPresence.bandcamp = bandcampUrl;
    }

    const combinedProducts = [
      ...(officialStoreResult?.products || []),
      ...bigCartelItems,
      ...bandcampItems,
      ...amazonItems,
      ...distroItems,
      ...merchbarItems,
      ...eyesoreItems,
      ...impericonItems,
      ...krItems
    ];

    const verifiedStoreUrl =
      officialStoreResult?.storeUrl ||
      (bigCartelItems.length > 0 ? bigCartelItems[0].storeBaseUrl : null) ||
      regionalStores[preferredRegion] ||
      regionalStores.GLOBAL ||
      null;

    const payload = {
      artist: artistName,
      artistImage,
      officialWebsite,
      regionalWebsites,
      regionalStores,
      webPresence,
      storeUrl: verifiedStoreUrl,
      bandcampUrl: bandcampItems.length > 0 || webPresence.bandcamp ? bandcampUrl : null,
      source: combinedProducts.length > 0 ? 'multi-platform-live' : officialWebsite ? 'official-site' : 'none',
      products: combinedProducts,
      genres,
      updatedAt: Date.now()
    };

    cache[cacheKey] = payload;
    saveCache();
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message, artist: artistName, products: [], genres: [] });
  }
});

// ==========================================
// 9. PRODUCTION STATIC FRONTEND (MUST BE AFTER ALL /api/* ROUTES)
// ==========================================
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MerchPulse 15-Site Proxy running on http://0.0.0.0:${PORT}`);
});
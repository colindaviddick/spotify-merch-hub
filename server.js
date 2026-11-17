import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CACHE_FILE = path.resolve('./merch-cache.json');

app.use(cors());
app.use(express.json());

// ==========================================
// LEAN PRODUCT & THUMBNAIL URL OPTIMIZERS
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
  { id: 'EYESORE', name: 'Eyesore Merch UK', baseUrl: 'https://eyesoremerch.com' },
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

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/json,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
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
// LIGHTWEIGHT ARTIST PHOTO LOOKUP (~12-18 KB)
// ==========================================
async function lookupArtistPhoto(artistName) {
  if (!artistName) return null;

  // 1. Deezer public search API: request picture_medium (250x250, ~12-18 KB)
  try {
    const dzUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=3`;
    const dzRes = await fetchWithTimeout(dzUrl, { headers: { Accept: 'application/json' } }, 3500);
    if (dzRes.ok) {
      const dzData = await dzRes.json();
      const list = Array.isArray(dzData?.data) ? dzData.data : [];
      const exact =
        list.find((a) => String(a.name || '').toLowerCase() === artistName.toLowerCase()) || list[0];
      const pic = exact?.picture_medium || exact?.picture;
      if (pic && !pic.includes('/artist//')) {
        return pic;
      }
    }
  } catch {}

  // 2. Fallback: Wikidata P18 image capped at 250px width (~15-25 KB)
  try {
    const sparql = `SELECT ?img WHERE { ?item rdfs:label "${artistName.replace(/"/g, '')}"@en; wdt:P18 ?img. } LIMIT 1`;
    const wdUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const wdRes = await fetchWithTimeout(wdUrl, { headers: { Accept: 'application/sparql-results+json' } }, 3500);
    if (wdRes.ok) {
      const wdData = await wdRes.json();
      const rawImg = wdData?.results?.bindings?.[0]?.img?.value;
      if (rawImg) {
        return rawImg.replace(/^http:\/\//i, 'https://') + '?width=250';
      }
    }
  } catch {}

  return null;
}

// ==========================================
// DISCOVERY METHOD 1: Wikidata SPARQL Lookup by Exact Spotify Artist ID (P1902)
// ==========================================
async function lookupWikidataBySpotifyId(spotifyId) {
  if (!spotifyId || spotifyId.startsWith('demo-') || spotifyId.startsWith('pl-')) {
    return { officialWebsite: null, bandcampUrl: null };
  }
  try {
    const sparql = `SELECT ?website ?bandcamp WHERE { ?item wdt:P1902 "${spotifyId}". OPTIONAL { ?item wdt:P856 ?website. } OPTIONAL { ?item wdt:P3283 ?bandcamp. } } LIMIT 5`;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/sparql-results+json' } }, 4200);
    if (!res.ok) return { officialWebsite: null, bandcampUrl: null };
    const data = await res.json();
    let officialWebsite = null;
    let bandcampUrl = null;
    for (const row of data?.results?.bindings || []) {
      if (row.website?.value && !officialWebsite) officialWebsite = row.website.value;
      if (row.bandcamp?.value && !bandcampUrl) bandcampUrl = `https://${row.bandcamp.value}.bandcamp.com/merch`;
    }
    return { officialWebsite, bandcampUrl };
  } catch {
    return { officialWebsite: null, bandcampUrl: null };
  }
}

// ==========================================
// DISCOVERY METHOD 2: MusicBrainz URL Relations & Genre Tags
// ==========================================
async function lookupMusicBrainz(artistName) {
  try {
    const searchUrl = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(`"${artistName}"`)}&fmt=json&limit=1`;
    const searchRes = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MerchPulseApp/5.0 (https://github.com/colindaviddick/spotify-merch-hub)'
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
          'User-Agent': 'MerchPulseApp/5.0 (https://github.com/colindaviddick/spotify-merch-hub)'
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

// ==========================================
// DISCOVERY METHOD 3: Crawl Official Homepage & Linktree HTML for Store Links
// ==========================================
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

// ==========================================
// DISCOVERY METHOD 4: DuckDuckGo Lite Search Resolver
// ==========================================
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
// STORE SCRAPER 1: Official Shopify Store Probe (/products.json)
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

// ==========================================
// STORE SCRAPER 2: Multi-Band Shopify Distro Hubs (Includes Eyesore Merch UK)
// ==========================================
async function fetchShopifyDistroProducts(distro, artistName, customOverrideUrl = null) {
  const dashSlug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artistLower = artistName.toLowerCase();

  try {
    if (customOverrideUrl) {
      const cleanOverride = customOverrideUrl.replace(/\/+$/, '');
      const jsonTarget = cleanOverride.endsWith('.json') ? cleanOverride : `${cleanOverride}/products.json?limit=24`;
      const ovRes = await fetchWithTimeout(jsonTarget, { headers: { Accept: 'application/json' } }, 4200);
      if (ovRes.ok) {
        const ovData = await ovRes.json();
        if (Array.isArray(ovData?.products) && ovData.products.length > 0) {
          return ovData.products.map((p) => slimShopifyProduct(p, distro.id, distro.baseUrl, distro.name));
        }
      }
    }

    if (dashSlug.length > 1) {
      const slugCandidates = Array.from(new Set([dashSlug, `${dashSlug}-merch`, `${dashSlug}-official`]));
      for (const s of slugCandidates) {
        const colUrl = `${distro.baseUrl}/collections/${s}/products.json?limit=20`;
        const colRes = await fetchWithTimeout(colUrl, { headers: { Accept: 'application/json' } }, 3800);
        if (colRes.ok) {
          const colData = await colRes.json();
          if (Array.isArray(colData?.products) && colData.products.length > 0) {
            return colData.products.map((p) => slimShopifyProduct(p, distro.id, distro.baseUrl, distro.name));
          }
        }
      }
    }

    const suggestUrl = `${distro.baseUrl}/search/suggest.json?q=${encodeURIComponent(
      artistName
    )}&resources[type]=product&resources[limit]=16`;
    const sugRes = await fetchWithTimeout(suggestUrl, { headers: { Accept: 'application/json' } }, 4000);
    if (sugRes.ok) {
      const sugData = await sugRes.json();
      const rawProducts = sugData?.resources?.results?.products || [];
      const matched = rawProducts
        .filter(
          (p) =>
            String(p.title || '').toLowerCase().includes(artistLower) ||
            String(p.vendor || '').toLowerCase().includes(artistLower) ||
            String(p.handle || '').toLowerCase().includes(dashSlug)
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

// ==========================================
// STORE SCRAPER 3: BigCartel Public JSON API
// ==========================================
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

// ==========================================
// STORE SCRAPER 4: Bandcamp /merch Live Scraper
// ==========================================
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

// ==========================================
// STORE SCRAPER 5: Merchbar Live Scraper (Algolia API + RSC / __NEXT_DATA__ Fallback)
// ==========================================
async function fetchMerchbarProducts(artistName, customUrl = null) {
  const artistLower = artistName.toLowerCase();
  const dashSlug = artistLower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const products = [];
  const seen = new Set();

  const pushMerchbarItem = (item, idx) => {
    const title = String(item.title || item.name || item.product_title || '').trim();
    if (!title || title.length < 3 || seen.has(title)) return;
    const brand = String(item.brand || item.artist_name || item.artist || item.vendor || '').toLowerCase();
    const rawUrl = String(item.url || item.href || item.slug || item.product_url || '');
    const matchesArtist =
      title.toLowerCase().includes(artistLower) ||
      brand.includes(artistLower) ||
      (dashSlug.length > 2 && rawUrl.toLowerCase().includes(dashSlug));
    if (!matchesArtist) return;

    seen.add(title);
    const img =
      item.image_url ||
      item.imageUrl ||
      item.img ||
      (typeof item.image === 'string' ? item.image : item.image?.url) ||
      null;
    const rawPrice = item.price || item.sale_price || item.retail_price || item.min_price || '24.99';
    const price =
      String(typeof rawPrice === 'number' && rawPrice > 200 ? (rawPrice / 100).toFixed(2) : rawPrice).replace(
        /[^0-9.]/g,
        ''
      ) || '24.99';
    const productUrl = rawUrl
      ? rawUrl.startsWith('http')
        ? rawUrl
        : `https://www.merchbar.com/${rawUrl.replace(/^\/+/, '')}`
      : `https://www.merchbar.com/search?q=${encodeURIComponent(artistName)}`;
    const isApparel = /shirt|tee|hoodie|sweat|longsleeve|jacket/i.test(title);
    const isWaitlist = Boolean(item.waitlist || item.out_of_stock || item.sold_out === true || item.in_stock === false);

    products.push({
      id: `mb-${idx}-${dashSlug}`,
      title: title.toLowerCase().includes(artistLower) ? title : `${artistName} - ${title}`,
      product_type: /hoodie|sweat/i.test(title)
        ? 'Hoodie'
        : /vinyl|lp|cd|record|cassette/i.test(title)
        ? 'Vinyl'
        : /hat|cap|beanie|patch|pin|poster/i.test(title)
        ? 'Accessories'
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
  };

  try {
    const algoliaRes = await fetchWithTimeout(
      'https://latency-dsn.algolia.net/1/indexes/*/queries?x-algolia-application-id=2B1677333R&x-algolia-api-key=345d364d2b40310a5e8c26619d6d0f3a',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Referer: 'https://www.merchbar.com/',
          Origin: 'https://www.merchbar.com'
        },
        body: JSON.stringify({
          requests: [
            {
              indexName: 'merchbar_products_production',
              params: `query=${encodeURIComponent(artistName)}&hitsPerPage=18`
            }
          ]
        })
      },
      4500
    );
    if (algoliaRes.ok) {
      const algData = await algoliaRes.json();
      const hits = algData?.results?.[0]?.hits || [];
      hits.forEach((h, i) => pushMerchbarItem(h, i + 1));
      if (products.length > 0) return products.slice(0, 16);
    }
  } catch {}

  try {
    const targetUrl = customUrl || `https://www.merchbar.com/search?q=${encodeURIComponent(artistName)}`;
    const res = await fetchWithTimeout(targetUrl, {}, 4800);
    if (!res.ok) return [];
    const html = await res.text();

    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextMatch) {
      try {
        const nextJson = JSON.parse(nextMatch[1]);
        let idx = 0;
        const walk = (node) => {
          if (!node || typeof node !== 'object' || idx >= 16) return;
          if (Array.isArray(node)) {
            for (const c of node) walk(c);
            return;
          }
          if ((node.title || node.name) && (node.image_url || node.imageUrl || node.image)) {
            idx++;
            pushMerchbarItem(node, idx);
          }
          for (const k of Object.keys(node)) walk(node[k]);
        };
        walk(nextJson);
      } catch {}
    }

    if (products.length === 0) {
      const ldMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of ldMatches) {
        try {
          const parsed = JSON.parse(block.replace(/<\/?script[^>]*>/gi, '').trim());
          const items = Array.isArray(parsed)
            ? parsed
            : parsed?.itemListElement
            ? parsed.itemListElement.map((e) => e.item || e)
            : [parsed];
          items.forEach((it, i) => {
            if (it?.name) {
              pushMerchbarItem(
                {
                  title: it.name,
                  brand: it.brand?.name || it.brand || artistName,
                  image_url: Array.isArray(it.image) ? it.image[0] : it.image,
                  url: it.url,
                  price: it.offers?.price || it.offers?.[0]?.price
                },
                i + 1
              );
            }
          });
        } catch {}
      }
    }
  } catch {}

  return products.slice(0, 16);
}

// ==========================================
// STORE SCRAPER 6: Eyesore Merch UK Live Scraper (Shopify + HTML Fallback)
// ==========================================
async function fetchEyesoreProducts(artistName, customUrl = null) {
  const eyesoreHub = { id: 'EYESORE', name: 'Eyesore Merch UK', baseUrl: 'https://eyesoremerch.com' };
  const shopifyResults = await fetchShopifyDistroProducts(eyesoreHub, artistName, customUrl);
  if (shopifyResults.length > 0) return shopifyResults;

  try {
    const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const searchUrl = customUrl || `https://eyesoremerch.com/search?type=product&q=${encodeURIComponent(artistName)}`;
    const res = await fetchWithTimeout(searchUrl, {}, 4500);
    if (!res.ok) return [];
    const html = await res.text();
    const products = [];
    const artistLower = artistName.toLowerCase();

    const linkRegex = /<a[^>]*href="(\/products\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const seenUrls = new Set();
    let m;
    let idx = 0;
    while ((m = linkRegex.exec(html)) !== null && idx < 16) {
      const pathUrl = m[1];
      const fullUrl = `https://eyesoremerch.com${pathUrl}`;
      if (seenUrls.has(fullUrl)) continue;
      const block = m[2];
      const altMatch = block.match(/alt="([^"]+)"/i);
      const textTitle = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const rawTitle = (altMatch ? altMatch[1] : textTitle).trim();
      if (!rawTitle || rawTitle.length < 4) continue;
      if (!rawTitle.toLowerCase().includes(artistLower) && !pathUrl.toLowerCase().includes(slug)) continue;

      seenUrls.add(fullUrl);
      const imgMatch = block.match(/src="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i);
      let imgUrl = imgMatch ? imgMatch[1] : null;
      if (imgUrl && imgUrl.startsWith('//')) imgUrl = `https:${imgUrl}`;
      const priceMatch = block.match(/£([0-9]+\.[0-9]{2})/);
      const priceNum = priceMatch ? priceMatch[1] : '21.99';
      const isApparel = /shirt|tee|hoodie|sweat|longsleeve|pullover|zip/i.test(rawTitle);

      idx++;
      products.push({
        id: `eye-${idx}-${slug}`,
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
        productUrl: fullUrl,
        imageUrl: optimizeThumbnailUrl(imgUrl),
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

// ==========================================
// STORE SCRAPER 7: Impericon UK / EU Live Scraper
// ==========================================
async function fetchImpericonProducts(artistName, region = 'UK', customUrl = null) {
  try {
    const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const localePath = region === 'EU' ? 'de' : 'uk';
    const urlsToTry = customUrl
      ? [{ url: customUrl, isDedicatedArtistPage: true }]
      : [
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

// ==========================================
// STORE SCRAPER 8: Kings Road Merch Scraper
// ==========================================
async function fetchKingsRoadAndBleepProducts(artistName, region = 'UK', customUrl = null) {
  const results = [];
  const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artistLower = artistName.toLowerCase();

  try {
    const krBase = region === 'US' ? 'https://kingsroadmerch.com' : 'https://eu.kingsroadmerch.com';
    const krUrl = customUrl || `${krBase}/${slug}`;
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
// STORE SCRAPER 9: Amazon Official Merch & Music Scraper
// ==========================================
async function fetchAmazonProducts(artistName, region = 'UK', customUrl = null) {
  const results = [];
  const artistLower = artistName.toLowerCase();
  const domain =
    region === 'US'
      ? 'https://www.amazon.com'
      : region === 'EU'
      ? 'https://www.amazon.de'
      : region === 'AU'
      ? 'https://www.amazon.com.au'
      : 'https://www.amazon.co.uk';

  try {
    const query = `${artistName} official band merch shirt vinyl`;
    const targetUrl = customUrl || `${domain}/s?k=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(
      targetUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
        }
      },
      4800
    );
    if (!res.ok) return [];
    const html = await res.text();

    const asinBlocks = html.split('data-component-type="s-search-result"').slice(1, 16);
    let idx = 0;
    for (const block of asinBlocks) {
      const asinMatch = block.match(/data-asin="([A-Z0-9]{10})"/i);
      const imgMatch = block.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/i);
      const priceMatch = block.match(/<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]+)<\/span>/i);

      if (!imgMatch) continue;
      const rawTitle = imgMatch[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
      const imageUrl = imgMatch[1].trim();
      const asin = asinMatch ? asinMatch[1] : null;
      const titleLower = rawTitle.toLowerCase();

      if (!titleLower.includes(artistLower)) continue;
      if (!/shirt|tee|hoodie|sweat|vinyl|lp|cd|merch|longsleeve|beanie|cap|patch|poster/i.test(titleLower)) continue;

      idx++;
      const priceNum = priceMatch ? priceMatch[1].replace(/[^0-9.]/g, '') || '22.99' : '22.99';
      const productUrl = asin ? `${domain}/dp/${asin}` : targetUrl;
      const isApparel = /shirt|tee|hoodie|sweat|longsleeve|jacket/i.test(titleLower);

      results.push({
        id: `amz-${asin || idx}-${artistLower.replace(/[^a-z0-9]/g, '')}`,
        title: rawTitle,
        product_type: /hoodie|sweat/i.test(titleLower)
          ? 'Hoodie'
          : /vinyl|lp|cd|record/i.test(titleLower)
          ? 'Vinyl'
          : /beanie|cap|patch|poster/i.test(titleLower)
          ? 'Accessories'
          : 'T-Shirt',
        vendor: `Amazon ${region}`,
        sourcePlatform: 'AMAZON',
        storeBaseUrl: domain,
        productUrl,
        imageUrl,
        tags: ['amazon'],
        variants: isApparel
          ? ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
              id: `amz-v-${idx}-${i}`,
              title: sz,
              price: priceNum,
              available: true
            }))
          : [{ id: `amz-v-${idx}-os`, title: 'One Size', price: priceNum, available: true }]
      });
      if (idx >= 10) break;
    }
  } catch {}

  return results;
}

// ==========================================
// PUBLIC PLAYLIST ARTIST EXTRACTOR (NO OAUTH NEEDED)
// ==========================================
app.get('/api/playlist', async (req, res) => {
  const rawUrl = (req.query.url || '').trim();
  const match = rawUrl.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid Spotify playlist URL. Paste a link like https://open.spotify.com/playlist/...' });
  }

  const playlistId = match[1];
  try {
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const pageRes = await fetchWithTimeout(embedUrl, {}, 6000);
    if (!pageRes.ok) {
      return res.status(404).json({ error: 'Playlist not found or is set to Private. Make sure it is Public.' });
    }
    const html = await pageRes.text();

    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextMatch) {
      return res.status(502).json({ error: 'Could not parse playlist tracks from Spotify.' });
    }

    const nextData = JSON.parse(nextMatch[1]);
    const entity = nextData?.props?.pageProps?.state?.data?.entity || {};
    const trackList = entity.trackList || [];
    const playlistName = entity.name || 'Imported Playlist';

    const artistMap = new Map();
    for (const item of trackList) {
      if (item.isRecommended || item.recommendation) continue;

      const rawSubtitle = (item.subtitle || '').replace(/\u00A0/g, ' ');
      const names = Array.isArray(item.artists)
        ? item.artists.map((a) => a.name).filter(Boolean)
        : rawSubtitle.split(/,\s+/).map((s) => s.trim()).filter(Boolean);

      for (const name of names) {
        const key = name.toLowerCase();
        if (!artistMap.has(key)) {
          artistMap.set(key, {
            id: `pl-${Buffer.from(key).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`,
            name,
            image: null,
            genres: [],
            spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
            followed: false,
            likedTracksCount: 1
          });
        } else {
          artistMap.get(key).likedTracksCount += 1;
        }
      }
    }

    const artists = Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (artists.length === 0) {
      return res.status(404).json({ error: 'No artists found in that playlist. Ensure the playlist is public.' });
    }

    return res.json({ playlistName, artists });
  } catch (err) {
    return res.status(500).json({ error: `Failed to load playlist: ${err.message}` });
  }
});

// ==========================================
// MAIN /api/discover ENDPOINT
// ==========================================
app.get('/api/discover', async (req, res) => {
  const artistName = (req.query.artist || '').trim();
  const spotifyId = (req.query.spotifyId || '').trim();
  const customUrl = (req.query.customUrl || '').trim();
  const preferredRegion = (req.query.region || 'UK').toUpperCase();
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';

  let siteOverrides = {};
  if (req.query.siteOverrides) {
    try {
      siteOverrides = JSON.parse(String(req.query.siteOverrides));
    } catch {}
  }

  if (!artistName) return res.status(400).json({ error: 'Missing artist parameter' });
  const cacheKey = `${artistName.toLowerCase()}::${preferredRegion}::v5`;

  if (customUrl && Object.keys(siteOverrides).length === 0) {
    const manualProbe = await probeShopifyFeed(customUrl, 'OFFICIAL');
    return res.json({
      artist: artistName,
      artistImage: cache[cacheKey]?.artistImage || (await lookupArtistPhoto(artistName)),
      storeUrl: manualProbe?.storeUrl || customUrl,
      officialWebsite: cache[cacheKey]?.officialWebsite || customUrl,
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
    const [wikidata, { urls, genres }, artistImage] = await Promise.all([
      lookupWikidataBySpotifyId(spotifyId),
      lookupMusicBrainz(artistName),
      lookupArtistPhoto(artistName)
    ]);

    let officialWebsite = siteOverrides.WEBSITE || wikidata.officialWebsite || null;
    let bandcampUrl = siteOverrides.BANDCAMP || wikidata.bandcampUrl || null;
    const regionalWebsites = {};
    const regionalStores = {};
    const webPresence = {};
    const candidateShopifyDomains = new Set();
    const candidateBigCartelDomains = new Set();

    if (siteOverrides.OFFICIAL || customUrl) candidateShopifyDomains.add(siteOverrides.OFFICIAL || customUrl);
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
    const distroHubsWithoutEyesore = SHOPIFY_DISTRO_HUBS.filter((d) => d.id !== 'EYESORE');

    const [
      shopifyProbeResults,
      distroProductArrays,
      bigCartelItems,
      bandcampResult,
      merchbarItems,
      eyesoreItems,
      impericonItems,
      krItems,
      amazonItems
    ] = await Promise.all([
      Promise.all(shopifyDomainList.map((domain) => probeShopifyFeed(domain, 'OFFICIAL'))),
      Promise.all(distroHubsWithoutEyesore.map((distro) => fetchShopifyDistroProducts(distro, artistName, siteOverrides[distro.id]))),
      fetchBigCartelProducts(Array.from(candidateBigCartelDomains), artistName),
      fetchBandcampProducts(bandcampUrl, artistName, officialWebsite),
      fetchMerchbarProducts(artistName, siteOverrides.MERCHBAR),
      fetchEyesoreProducts(artistName, siteOverrides.EYESORE),
      fetchImpericonProducts(artistName, preferredRegion, siteOverrides.IMPERICON),
      fetchKingsRoadAndBleepProducts(artistName, preferredRegion, siteOverrides.KINGSROAD),
      fetchAmazonProducts(artistName, preferredRegion, siteOverrides.AMAZON)
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
      ...distroItems,
      ...merchbarItems,
      ...eyesoreItems,
      ...impericonItems,
      ...krItems,
      ...amazonItems
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
// PRODUCTION STATIC FRONTEND SERVER (EXPRESS 5 SAFE)
// ==========================================
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MerchPulse 15-Site Aggregator running on port ${PORT}`);
});
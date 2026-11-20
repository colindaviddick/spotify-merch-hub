import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const CACHE_FILE = path.resolve('./merch-cache.json');

app.use(cors());
app.use(express.json());

// Serve built Vite frontend in production (Render)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// ==========================================
// 1. PERSISTENT CACHE & SHARED VERIFIED OVERRIDES
// ==========================================
let cache = {
  bands: {},
  verifiedOverrides: {},
  firstSeenProducts: {}
};

if (fs.existsSync(CACHE_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (loaded && typeof loaded === 'object') {
      if (!loaded.bands) {
        cache.bands = loaded;
      } else {
        cache = {
          bands: loaded.bands || {},
          verifiedOverrides: loaded.verifiedOverrides || {},
          firstSeenProducts: loaded.firstSeenProducts || {}
        };
      }
    }
  } catch {
    cache = { bands: {}, verifiedOverrides: {}, firstSeenProducts: {} };
  }
}

let saveTimer = null;
const saveCache = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
      console.error('Cache write error:', e.message);
    }
  }, 1000);
};

// ==========================================
// 2. LIVE DAILY CURRENCY EXCHANGE RATES (USD BASE)
// ==========================================
let exchangeRates = {
  USD: 1.0,
  GBP: 0.79,
  EUR: 0.92,
  AUD: 1.52,
  CAD: 1.38,
  updatedAt: 0
};

async function refreshExchangeRates() {
  if (Date.now() - exchangeRates.updatedAt < 12 * 3600000) return exchangeRates;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=GBP,EUR,AUD,CAD', {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        exchangeRates = {
          USD: 1.0,
          GBP: data.rates.GBP || 0.79,
          EUR: data.rates.EUR || 0.92,
          AUD: data.rates.AUD || 1.52,
          CAD: data.rates.CAD || 1.38,
          updatedAt: Date.now()
        };
      }
    }
  } catch {}
  return exchangeRates;
}

refreshExchangeRates();

function inferSourceCurrency(platformId = '', storeUrl = '') {
  const u = String(storeUrl || '').toLowerCase();
  if (platformId === 'EYESORE' || u.includes('.co.uk') || u.includes('/uk')) return 'GBP';
  if (platformId === 'EVILGREED' || platformId === 'IMPERICON' || platformId === 'KINGSROAD' || u.includes('.de') || u.includes('.eu')) return 'EUR';
  if (platformId === 'TWENTYFOUR' || u.includes('.com.au') || u.includes('24hundred')) return 'AUD';
  return 'USD';
}

function enrichProductsWithCurrencyAndDropMeta(products = [], artistName = '') {
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 86400000;
  let dirty = false;

  const enriched = products.map((p) => {
    const sourceCurrency = p.sourceCurrency || inferSourceCurrency(p.sourcePlatform, p.storeBaseUrl || p.productUrl);
    const dropKey = `${artistName.toLowerCase()}::${p.sourcePlatform}::${String(p.title || '').toLowerCase().trim()}`;

    let firstSeen = cache.firstSeenProducts[dropKey];
    if (!firstSeen) {
      firstSeen = now;
      cache.firstSeenProducts[dropKey] = now;
      dirty = true;
    }

    const isNewDrop = now - firstSeen < SEVEN_DAYS_MS;

    return {
      ...p,
      sourceCurrency,
      firstSeenAt: firstSeen,
      isNewDrop
    };
  });

  if (dirty) saveCache();
  return enriched;
}

const SHOPIFY_DISTRO_HUBS = [
  { id: 'EVILGREED', name: 'Evil Greed', baseUrl: 'https://evilgreed.net', currency: 'EUR' },
  { id: 'EYESORE', name: 'Eyesore Merch UK', baseUrl: 'https://eyesoremerch.com', currency: 'GBP' },
  { id: 'INDIEMERCH', name: 'IndieMerchstore', baseUrl: 'https://www.indiemerchstore.com', currency: 'USD' },
  { id: 'HOLYMOUNTAIN', name: 'Holy Mountain Printing', baseUrl: 'https://holymountainprinting.com', currency: 'USD' },
  { id: 'COLDCUTS', name: 'Cold Cuts Merch', baseUrl: 'https://www.coldcutsmerch.com', currency: 'USD' },
  { id: 'HELLOMERCH', name: 'Hello Merch', baseUrl: 'https://www.hellomerch.com', currency: 'USD' },
  { id: 'DOWNRIGHT', name: 'Down Right Merch', baseUrl: 'https://downrightmerch.com', currency: 'USD' },
  { id: 'TWENTYFOUR', name: '24Hundred', baseUrl: 'https://24hundred.net', currency: 'AUD' }
];

function detectRegion(url = '') {
  const u = url.toLowerCase();
  if (u.includes('.co.uk') || u.includes('uk.') || u.includes('/en-gb') || u.includes('/uk')) return 'UK';
  if (u.includes('.eu') || u.includes('eu.') || u.includes('.de') || u.includes('/en-eu')) return 'EU';
  if (u.includes('.com.au') || u.includes('au.') || u.includes('24hundred')) return 'AU';
  if (u.includes('us.') || u.includes('/en-us')) return 'US';
  return 'GLOBAL';
}

function isSafeHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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

async function fetchArtistPortraitImage(artistName) {
  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(`"${artistName}"`)}&limit=3`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 3500);
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    const exact =
      list.find((a) => String(a.name || '').toLowerCase().trim() === artistName.toLowerCase().trim()) || list[0];
    return exact?.picture_medium || exact?.picture_big || exact?.picture || null;
  } catch {
    return null;
  }
}

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

async function lookupMusicBrainz(artistName) {
  try {
    const searchUrl = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(`"${artistName}"`)}&fmt=json&limit=1`;
    const searchRes = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MerchPulse/5.0 (https://merchpulse.onrender.com)'
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
          'User-Agent': 'MerchPulse/5.0 (https://merchpulse.onrender.com)'
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

async function probeShopifyFeed(baseUrl, sourcePlatform = 'OFFICIAL', vendorOverride = null) {
  if (!baseUrl || !isSafeHttpUrl(baseUrl)) return null;
  try {
    const parsed = new URL(baseUrl);
    const cleanOrigin = parsed.origin;
    const pathPart = parsed.pathname.replace(/\/+$/, '');
    const feedEndpoint = pathPart.includes('/collections/')
      ? `${cleanOrigin}${pathPart}/products.json?limit=24`
      : `${cleanOrigin}/products.json?limit=24`;

    const res = await fetchWithTimeout(feedEndpoint, { headers: { Accept: 'application/json' } }, 3800);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.products) && data.products.length > 0) {
      const sourceCurrency = inferSourceCurrency(sourcePlatform, cleanOrigin);
      const tagged = data.products.map((p) => ({
        ...p,
        description: p.body_html || '',
        vendor: vendorOverride || p.vendor,
        sourcePlatform,
        sourceCurrency,
        storeBaseUrl: cleanOrigin,
        productUrl: `${cleanOrigin}/products/${p.handle}`
      }));
      return { storeUrl: baseUrl.replace(/\/+$/, ''), products: tagged };
    }
  } catch {}
  return null;
}

async function fetchShopifyDistroProducts(distro, artistName, overrideUrl = null) {
  const dashSlug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artistLower = artistName.toLowerCase();

  try {
    if (overrideUrl && isSafeHttpUrl(overrideUrl)) {
      const probed = await probeShopifyFeed(overrideUrl, distro.id, distro.name);
      if (probed && probed.products.length > 0) return probed.products;
    }

    if (dashSlug.length > 2) {
      const colUrl = `${distro.baseUrl}/collections/${dashSlug}/products.json?limit=18`;
      const colRes = await fetchWithTimeout(colUrl, { headers: { Accept: 'application/json' } }, 4000);
      if (colRes.ok) {
        const colData = await colRes.json();
        if (Array.isArray(colData?.products) && colData.products.length > 0) {
          return colData.products.map((p) => ({
            ...p,
            description: p.body_html || '',
            vendor: distro.name,
            sourcePlatform: distro.id,
            sourceCurrency: distro.currency || 'USD',
            storeBaseUrl: distro.baseUrl,
            productUrl: `${distro.baseUrl}/products/${p.handle}`
          }));
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
          id: `${distro.id.toLowerCase()}-${p.id || idx}-${Date.now()}`,
          title: p.title,
          product_type:
            p.type ||
            (/hoodie|sweat/i.test(p.title) ? 'Hoodie' : /vinyl|lp|12"/i.test(p.title) ? 'Vinyl' : 'T-Shirt'),
          vendor: distro.name,
          sourcePlatform: distro.id,
          sourceCurrency: distro.currency || 'USD',
          storeBaseUrl: distro.baseUrl,
          productUrl: p.url ? `${distro.baseUrl}${p.url.split('?')[0]}` : distro.baseUrl,
          imageUrl: p.image || p.featured_image?.url || null,
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
  const uniqueOrigins = Array.from(new Set(candidateOrigins.filter(isSafeHttpUrl))).slice(0, 4);
  const results = await Promise.all(
    uniqueOrigins.map(async (origin) => {
      try {
        const cleanOrigin = new URL(origin).origin;
        const res = await fetchWithTimeout(`${cleanOrigin}/products.json`, { headers: { Accept: 'application/json' } }, 3600);
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.slice(0, 20).map((item, idx) => {
            const productUrl = item.url ? (item.url.startsWith('http') ? item.url : `${cleanOrigin}${item.url}`) : cleanOrigin;
            const imageUrl = item.images?.[0]?.url || null;
            const options = Array.isArray(item.options) && item.options.length > 0 ? item.options : [];
            return {
              id: `bigc-${item.id || idx}`,
              title: item.name || `${artistName} Merch`,
              description: item.description || '',
              product_type:
                item.categories?.[0]?.name ||
                (/hoodie|sweat/i.test(item.name) ? 'Hoodie' : /vinyl|lp|cd/i.test(item.name) ? 'Vinyl' : 'T-Shirt'),
              vendor: `${artistName} BigCartel`,
              sourcePlatform: 'BIGCARTEL',
              sourceCurrency: 'USD',
              storeBaseUrl: cleanOrigin,
              productUrl,
              imageUrl,
              images: item.images || [],
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

  if (bandcampMerchUrl && isSafeHttpUrl(bandcampMerchUrl)) {
    candidateUrls.add(bandcampMerchUrl.replace(/\/+$/, '') + (bandcampMerchUrl.endsWith('/merch') ? '' : '/merch'));
  }
  if (officialWebsiteUrl && isSafeHttpUrl(officialWebsiteUrl)) {
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

          const rawPriceBlock = priceMatch ? priceMatch[0] : '';
          const detectedCurrency = rawPriceBlock.includes('£')
            ? 'GBP'
            : rawPriceBlock.includes('€')
            ? 'EUR'
            : rawPriceBlock.includes('A$')
            ? 'AUD'
            : 'USD';

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
              id: `bc-${idx}-${Date.now()}`,
              title: rawTitle,
              product_type: rawType || (isApparel ? 'T-Shirt' : 'Vinyl'),
              vendor: `${artistName} Bandcamp`,
              sourcePlatform: 'BANDCAMP',
              sourceCurrency: detectedCurrency,
              storeBaseUrl: origin,
              productUrl,
              imageUrl: imgMatch ? imgMatch[1] : null,
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

async function fetchMerchbarProducts(artistName, overrideUrl = null) {
  try {
    const searchUrl =
      overrideUrl && isSafeHttpUrl(overrideUrl)
        ? overrideUrl
        : `https://www.merchbar.com/search?q=${encodeURIComponent(artistName)}`;
    const res = await fetchWithTimeout(searchUrl, {}, 4800);
    if (!res.ok) return [];
    const html = await res.text();
    const products = [];
    const artistLower = artistName.toLowerCase();
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
          const slugOrUrl = node.url || node.href || node.slug;
          if (title && typeof title === 'string' && img && typeof img === 'string' && title.length > 3) {
            const cleanTitle = title.trim();
            if (!seen.has(cleanTitle)) {
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
                id: `mb-${idx}-${Date.now()}`,
                title: cleanTitle.toLowerCase().includes(artistLower) ? cleanTitle : `${artistName} - ${cleanTitle}`,
                product_type: /hoodie|sweat/i.test(cleanTitle)
                  ? 'Hoodie'
                  : /vinyl|lp|cd|record/i.test(cleanTitle)
                  ? 'Vinyl'
                  : 'T-Shirt',
                vendor: 'Merchbar',
                sourcePlatform: 'MERCHBAR',
                sourceCurrency: 'USD',
                storeBaseUrl: searchUrl,
                productUrl,
                imageUrl: img,
                tags: ['merchbar', cleanTitle],
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

async function fetchEyesoreProducts(artistName, overrideUrl = null) {
  try {
    const searchUrl =
      overrideUrl && isSafeHttpUrl(overrideUrl)
        ? overrideUrl
        : `https://eyesoremerch.com/catalogsearch/result/?q=${encodeURIComponent(artistName)}`;
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
      if (!overrideUrl && !rawTitle.toLowerCase().includes(artistLower)) continue;

      const imgMatch =
        block.match(/<img[^>]*class="[^"]*product-image-photo[^"]*"[^>]*src="([^"]+)"/i) ||
        block.match(/data-src="([^"]+)"/i);
      const priceMatch = block.match(/data-price-amount="([0-9.]+)"/i) || block.match(/£([0-9]+\.[0-9]{2})/);
      const priceNum = priceMatch ? priceMatch[1] : '24.99';
      const isApparel = /shirt|tee|hoodie|sweat|longsleeve|pullover|zip/i.test(rawTitle);

      idx++;
      products.push({
        id: `eye-${idx}-${Date.now()}`,
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
        sourceCurrency: 'GBP',
        storeBaseUrl: overrideUrl || 'https://eyesoremerch.com',
        productUrl,
        imageUrl: imgMatch ? imgMatch[1] : null,
        tags: ['eyesore', rawTitle],
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

async function fetchImpericonProducts(artistName, region = 'UK', overrideUrl = null) {
  try {
    const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const localePath = region === 'EU' ? 'de' : 'uk';
    const urlsToTry =
      overrideUrl && isSafeHttpUrl(overrideUrl)
        ? [overrideUrl]
        : [
            `https://www.impericon.com/${localePath}/${slug}.html`,
            `https://www.impericon.com/${localePath}/search?q=${encodeURIComponent(artistName)}`
          ];
    const artistLower = artistName.toLowerCase();

    const probeResults = await Promise.all(
      urlsToTry.map(async (url) => {
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
                if (
                  item &&
                  (item['@type'] === 'Product' || item.name) &&
                  (overrideUrl || url.includes(`/${slug}.html`) || String(item.name).toLowerCase().includes(artistLower))
                ) {
                  idx++;
                  const title = item.name;
                  const price = String(item.offers?.price || item.offers?.[0]?.price || '29.99');
                  const currency = item.offers?.priceCurrency || (region === 'EU' ? 'EUR' : 'GBP');
                  const imageUrl = Array.isArray(item.image) ? item.image[0] : item.image || null;
                  const productUrl = item.url || url;
                  const isApparel = /shirt|tee|hoodie|sweat|longsleeve|tank/i.test(title);
                  products.push({
                    id: `imp-${idx}-${Date.now()}`,
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
                    sourceCurrency: currency,
                    storeBaseUrl: url,
                    productUrl,
                    imageUrl,
                    tags: ['impericon', title],
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

async function fetchKingsRoadAndBleepProducts(artistName, region = 'UK', overrideUrl = null) {
  const results = [];
  const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artistLower = artistName.toLowerCase();

  try {
    const krBase = region === 'US' ? 'https://kingsroadmerch.com' : 'https://eu.kingsroadmerch.com';
    const krUrl = overrideUrl && isSafeHttpUrl(overrideUrl) ? overrideUrl : `${krBase}/${slug}`;
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
        if (title.length > 3 && (overrideUrl || title.toLowerCase().includes(artistLower) || href.includes(slug))) {
          idx++;
          results.push({
            id: `kr-${idx}-${Date.now()}`,
            title: title.toLowerCase().includes(artistLower) ? title : `${artistName} - ${title}`,
            product_type: /hoodie|sweat/i.test(title) ? 'Hoodie' : /vinyl|lp|cd/i.test(title) ? 'Vinyl' : 'T-Shirt',
            vendor: 'Kings Road Merch',
            sourcePlatform: 'KINGSROAD',
            sourceCurrency: region === 'US' ? 'USD' : 'EUR',
            storeBaseUrl: krUrl,
            productUrl: href.startsWith('http') ? href : `${krBase}${href}`,
            imageUrl: img.startsWith('http') ? img : `${krBase}${img}`,
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

app.get('/api/rates', async (req, res) => {
  const rates = await refreshExchangeRates();
  return res.json(rates);
});

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
      const rawSubtitle = item.subtitle || '';
      const names = Array.isArray(item.artists)
        ? item.artists.map((a) => a.name).filter(Boolean)
        : rawSubtitle.split(/,\s*/).map((s) => s.trim()).filter(Boolean);

      for (const name of names) {
        const key = name.toLowerCase();
        if (!artistMap.has(key)) {
          artistMap.set(key, {
            id: `pl-${Buffer.from(key).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
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

app.get('/api/discover', async (req, res) => {
  const artistName = (req.query.artist || '').trim();
  const spotifyId = (req.query.spotifyId || '').trim();
  const customUrl = (req.query.customUrl || '').trim();
  const preferredRegion = (req.query.region || 'UK').toUpperCase();
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';

  let userSiteOverrides = {};
  if (req.query.siteOverrides) {
    try {
      const parsed = JSON.parse(req.query.siteOverrides);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (isSafeHttpUrl(v)) userSiteOverrides[k] = String(v).trim();
        }
      }
    } catch {}
  }

  if (!artistName) return res.status(400).json({ error: 'Missing artist parameter' });
  const artistKey = artistName.toLowerCase();
  const cacheKey = `${artistKey}::${preferredRegion}::v5`;

  const sharedVerifiedForBand = cache.verifiedOverrides[artistKey] || {};
  const effectiveOverrides = {
    ...sharedVerifiedForBand,
    ...userSiteOverrides
  };
  if (customUrl && isSafeHttpUrl(customUrl) && !effectiveOverrides.OFFICIAL) {
    effectiveOverrides.OFFICIAL = customUrl;
  }

  const hasUserSubmittedEdits = Object.keys(userSiteOverrides).length > 0 || Boolean(customUrl);
  const hasSharedVerified = Object.keys(sharedVerifiedForBand).length > 0;

  if (
    !forceRefresh &&
    !hasUserSubmittedEdits &&
    cache.bands[cacheKey] &&
    Array.isArray(cache.bands[cacheKey].products) &&
    cache.bands[cacheKey].products.length > 0 &&
    Date.now() - cache.bands[cacheKey].updatedAt < 7 * 86400000
  ) {
    const cachedBand = cache.bands[cacheKey];
    return res.json({
      ...cachedBand,
      verifiedOverrides: sharedVerifiedForBand,
      products: enrichProductsWithCurrencyAndDropMeta(cachedBand.products, artistName)
    });
  }

  try {
    const [wikidata, { urls, genres }, artistImage] = await Promise.all([
      lookupWikidataBySpotifyId(spotifyId),
      lookupMusicBrainz(artistName),
      fetchArtistPortraitImage(artistName)
    ]);

    let officialWebsite = effectiveOverrides.WEBSITE || wikidata.officialWebsite || null;
    let bandcampUrl = effectiveOverrides.BANDCAMP || wikidata.bandcampUrl || null;
    const regionalWebsites = {};
    const regionalStores = {};
    const webPresence = {};
    const candidateShopifyDomains = new Set();
    const candidateBigCartelDomains = new Set();

    if (effectiveOverrides.OFFICIAL) candidateShopifyDomains.add(effectiveOverrides.OFFICIAL);
    if (effectiveOverrides.BIGCARTEL) candidateBigCartelDomains.add(effectiveOverrides.BIGCARTEL);

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
      merchbarItems,
      eyesoreItems,
      impericonItems,
      krItems
    ] = await Promise.all([
      Promise.all(shopifyDomainList.map((domain) => probeShopifyFeed(domain, 'OFFICIAL'))),
      Promise.all(
        SHOPIFY_DISTRO_HUBS.map((distro) =>
          fetchShopifyDistroProducts(distro, artistName, effectiveOverrides[distro.id] || null)
        )
      ),
      fetchBigCartelProducts(Array.from(candidateBigCartelDomains), artistName),
      fetchBandcampProducts(bandcampUrl, artistName, officialWebsite),
      fetchMerchbarProducts(artistName, effectiveOverrides.MERCHBAR || null),
      fetchEyesoreProducts(artistName, effectiveOverrides.EYESORE || null),
      fetchImpericonProducts(artistName, preferredRegion, effectiveOverrides.IMPERICON || null),
      fetchKingsRoadAndBleepProducts(artistName, preferredRegion, effectiveOverrides.KINGSROAD || null)
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

    const rawCombined = [
      ...(officialStoreResult?.products || []),
      ...bigCartelItems,
      ...bandcampItems,
      ...distroItems,
      ...merchbarItems,
      ...eyesoreItems,
      ...impericonItems,
      ...krItems
    ];

    const platformHitCounts = {};
    for (const item of rawCombined) {
      platformHitCounts[item.sourcePlatform] = (platformHitCounts[item.sourcePlatform] || 0) + 1;
    }

    let promotedNewSharedOverride = false;
    const updatedSharedOverrides = { ...(cache.verifiedOverrides[artistKey] || {}) };
    for (const [platKey, submittedUrl] of Object.entries(userSiteOverrides)) {
      if (platKey === 'WEBSITE' && isSafeHttpUrl(submittedUrl)) {
        updatedSharedOverrides.WEBSITE = submittedUrl;
        promotedNewSharedOverride = true;
      } else if ((platformHitCounts[platKey] || 0) > 0) {
        updatedSharedOverrides[platKey] = submittedUrl;
        promotedNewSharedOverride = true;
      }
    }
    if (customUrl && (platformHitCounts.OFFICIAL || 0) > 0) {
      updatedSharedOverrides.OFFICIAL = customUrl;
      promotedNewSharedOverride = true;
    }

    if (promotedNewSharedOverride) {
      cache.verifiedOverrides[artistKey] = updatedSharedOverrides;
    }

    const enrichedProducts = enrichProductsWithCurrencyAndDropMeta(rawCombined, artistName);

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
      verifiedOverrides: cache.verifiedOverrides[artistKey] || {},
      storeUrl: verifiedStoreUrl,
      bandcampUrl: bandcampItems.length > 0 || webPresence.bandcamp ? bandcampUrl : null,
      source:
        enrichedProducts.length > 0
          ? hasSharedVerified || promotedNewSharedOverride
            ? 'community-verified-live'
            : 'multi-platform-live'
          : officialWebsite
          ? 'official-site'
          : 'none',
      products: enrichedProducts,
      genres,
      updatedAt: Date.now()
    };

    cache.bands[cacheKey] = payload;
    saveCache();
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message, artist: artistName, products: [], genres: [] });
  }
});

if (fs.existsSync(distPath)) {
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MerchPulse 15-Site Turbo Discovery Proxy running on port ${PORT}`);
});
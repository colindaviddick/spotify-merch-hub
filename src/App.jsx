import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  AlertCircle,
  RefreshCw,
  Globe,
  Pencil,
  SlidersHorizontal,
  Store,
  Tag,
  Shirt,
  Disc,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Play,
  Pause,
  Zap,
  Music2,
  Layers,
  ShieldAlert
} from 'lucide-react';

// ==========================================
// 1. OAUTH 2.0 PKCE CRYPTO HELPERS
// ==========================================
function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = window.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((x) => possible[x % possible.length])
    .join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(buffer) {
  let str = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

// ==========================================
// 2. DYNAMIC CDN THUMBNAIL RESIZER & LEAN NORMALIZER
// ==========================================
function getSizedThumbnailUrl(rawUrl, thumbSize = 'medium') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();

  const widthMap = {
    compact: 180,
    medium: 280,
    large: 440,
    xl: 680
  };
  const targetWidth = widthMap[String(thumbSize).toLowerCase()] || 280;

  if (url.includes('cdn.shopify.com')) {
    const cleanBase = url
      .split('?')[0]
      .replace(/_(\d+x\d*|small|compact|medium|large|grande|master|1024x1024|2048x2048)(?=\.(jpg|jpeg|png|webp|gif))/i, '');
    return `${cleanBase}?width=${targetWidth}&format=webp`;
  }

  if (url.includes('bcbits.com/img/')) {
    const bcCode =
      targetWidth <= 180 ? '_42' :
      targetWidth <= 280 ? '_9' :
      targetWidth <= 440 ? '_4' : '_16';
    return url.replace(/_(\d+)\.(jpg|jpeg|png|webp)$/i, `${bcCode}.$2`);
  }

  if (url.includes('bigcartel.com')) {
    const cleanBase = url.split('?')[0];
    return `${cleanBase}?w=${targetWidth}&h=${targetWidth}&fit=clip&auto=format,compress`;
  }

  if (url.includes('merchbar.com') || url.includes('impericon.com')) {
    const cleanBase = url.split('?')[0];
    return `${cleanBase}?width=${targetWidth}`;
  }

  return url;
}

function slimProductForStorage(p) {
  if (!p || typeof p !== 'object') return null;
  const rawImg = p.imageUrl || p.image?.src || p.images?.[0]?.src || (typeof p.image === 'string' ? p.image : null);
  return {
    id: String(p.id || `item-${Math.random().toString(36).slice(2, 8)}`),
    title: String(p.title || 'Merch Item').trim(),
    product_type: String(p.product_type || p.type || ''),
    vendor: String(p.vendor || ''),
    sourcePlatform: p.sourcePlatform || 'OFFICIAL',
    storeBaseUrl: p.storeBaseUrl || '',
    productUrl: p.productUrl || '',
    imageUrl: getSizedThumbnailUrl(rawImg, 'medium') || rawImg,
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

// Interleave products across stores in round-robin order so no single store monopolizes the top 24 grid
function interleaveProductsByPlatform(products = []) {
  if (products.length <= 1) return products;
  const buckets = new Map();
  for (const p of products) {
    const key = p.sourcePlatform || 'OFFICIAL';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  if (buckets.size <= 1) return products;

  const result = [];
  const queues = Array.from(buckets.values());
  let added = true;
  let depth = 0;
  while (added) {
    added = false;
    for (const q of queues) {
      if (depth < q.length) {
        result.push(q[depth]);
        added = true;
      }
    }
    depth++;
  }
  return result;
}

// ==========================================
// 3. CONSTANTS & COLOR-CODED PLATFORM METADATA (ALL 15 PLATFORMS + AMAZON)
// ==========================================
const SIZE_OPTIONS = ['ALL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'YOUTH'];

const PRODUCT_TYPES = [
  { id: 'ALL', label: 'All Merch', icon: Layers },
  { id: 'TSHIRT', label: 'T-Shirts', icon: Shirt, keywords: ['t-shirt', 'tee', 'shirt', 'short sleeve', 'tshirt'] },
  { id: 'HOODIE', label: 'Hoodies & Sweats', icon: Shirt, keywords: ['hoodie', 'sweatshirt', 'pullover', 'crewneck', 'zip', 'fleece'] },
  { id: 'LONGSLEEVE', label: 'Longsleeves', icon: Shirt, keywords: ['longsleeve', 'long sleeve', 'ls'] },
  { id: 'VINYL', label: 'Vinyl & Media', icon: Disc, keywords: ['vinyl', 'lp', '12"', '7"', 'record', 'cd', 'cassette', 'tape'] },
  { id: 'HAT', label: 'Hats & Beanies', icon: Tag, keywords: ['hat', 'cap', 'beanie', 'snapback', 'trucker', 'dad hat'] },
  { id: 'MISC', label: 'Patches & Misc', icon: Package, keywords: ['patch', 'pin', 'poster', 'flag', 'tote', 'bag', 'sticker', 'mug'] }
];

const SOURCE_PLATFORMS = [
  {
    id: 'ALL',
    label: 'All Retailers',
    shortLabel: 'All',
    badgeClass: 'text-zinc-200 border-zinc-700',
    pillIdle: 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500',
    pillActive: 'bg-zinc-100 text-zinc-950 border-white font-bold shadow-sm'
  },
  {
    id: 'OFFICIAL',
    label: 'Official Shopify',
    shortLabel: 'Official',
    badgeClass: 'text-emerald-300 border-emerald-500/50',
    pillIdle: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/35 hover:bg-emerald-900/60',
    pillActive: 'bg-emerald-400 text-zinc-950 border-emerald-300 font-bold shadow-sm'
  },
  {
    id: 'BANDCAMP',
    label: 'Bandcamp',
    shortLabel: 'Bandcamp',
    badgeClass: 'text-sky-300 border-sky-500/50',
    pillIdle: 'bg-sky-950/50 text-sky-300 border-sky-500/35 hover:bg-sky-900/60',
    pillActive: 'bg-sky-400 text-zinc-950 border-sky-300 font-bold shadow-sm'
  },
  {
    id: 'AMAZON',
    label: 'Amazon',
    shortLabel: 'Amazon',
    badgeClass: 'text-amber-200 border-amber-400/50',
    pillIdle: 'bg-amber-950/60 text-amber-200 border-amber-400/35 hover:bg-amber-900/60',
    pillActive: 'bg-amber-300 text-zinc-950 border-amber-200 font-bold shadow-sm'
  },
  {
    id: 'EVILGREED',
    label: 'Evil Greed',
    shortLabel: 'Evil Greed',
    badgeClass: 'text-amber-300 border-amber-500/50',
    pillIdle: 'bg-amber-950/50 text-amber-300 border-amber-500/35 hover:bg-amber-900/60',
    pillActive: 'bg-amber-400 text-zinc-950 border-amber-300 font-bold shadow-sm'
  },
  {
    id: 'EYESORE',
    label: 'Eyesore Merch UK',
    shortLabel: 'Eyesore',
    badgeClass: 'text-fuchsia-300 border-fuchsia-500/50',
    pillIdle: 'bg-fuchsia-950/50 text-fuchsia-300 border-fuchsia-500/35 hover:bg-fuchsia-900/60',
    pillActive: 'bg-fuchsia-400 text-zinc-950 border-fuchsia-300 font-bold shadow-sm'
  },
  {
    id: 'MERCHBAR',
    label: 'Merchbar',
    shortLabel: 'Merchbar',
    badgeClass: 'text-indigo-300 border-indigo-500/50',
    pillIdle: 'bg-indigo-950/50 text-indigo-300 border-indigo-500/35 hover:bg-indigo-900/60',
    pillActive: 'bg-indigo-400 text-zinc-950 border-indigo-300 font-bold shadow-sm'
  },
  {
    id: 'INDIEMERCH',
    label: 'IndieMerchstore',
    shortLabel: 'IndieMerch',
    badgeClass: 'text-purple-300 border-purple-500/50',
    pillIdle: 'bg-purple-950/50 text-purple-300 border-purple-500/35 hover:bg-purple-900/60',
    pillActive: 'bg-purple-400 text-zinc-950 border-purple-300 font-bold shadow-sm'
  },
  {
    id: 'HOLYMOUNTAIN',
    label: 'Holy Mountain',
    shortLabel: 'Holy Mtn',
    badgeClass: 'text-orange-300 border-orange-500/50',
    pillIdle: 'bg-orange-950/50 text-orange-300 border-orange-500/35 hover:bg-orange-900/60',
    pillActive: 'bg-orange-400 text-zinc-950 border-orange-300 font-bold shadow-sm'
  },
  {
    id: 'COLDCUTS',
    label: 'Cold Cuts Merch',
    shortLabel: 'Cold Cuts',
    badgeClass: 'text-cyan-300 border-cyan-500/50',
    pillIdle: 'bg-cyan-950/50 text-cyan-300 border-cyan-500/35 hover:bg-cyan-900/60',
    pillActive: 'bg-cyan-400 text-zinc-950 border-cyan-300 font-bold shadow-sm'
  },
  {
    id: 'HELLOMERCH',
    label: 'Hello Merch',
    shortLabel: 'Hello Merch',
    badgeClass: 'text-teal-300 border-teal-500/50',
    pillIdle: 'bg-teal-950/50 text-teal-300 border-teal-500/35 hover:bg-teal-900/60',
    pillActive: 'bg-teal-400 text-zinc-950 border-teal-300 font-bold shadow-sm'
  },
  {
    id: 'DOWNRIGHT',
    label: 'Down Right Merch',
    shortLabel: 'Down Right',
    badgeClass: 'text-lime-300 border-lime-500/50',
    pillIdle: 'bg-lime-950/50 text-lime-300 border-lime-500/35 hover:bg-lime-900/60',
    pillActive: 'bg-lime-400 text-zinc-950 border-lime-300 font-bold shadow-sm'
  },
  {
    id: 'TWENTYFOUR',
    label: '24Hundred',
    shortLabel: '24Hundred',
    badgeClass: 'text-yellow-300 border-yellow-500/50',
    pillIdle: 'bg-yellow-950/50 text-yellow-300 border-yellow-500/35 hover:bg-yellow-900/60',
    pillActive: 'bg-yellow-400 text-zinc-950 border-yellow-300 font-bold shadow-sm'
  },
  {
    id: 'BIGCARTEL',
    label: 'BigCartel DIY',
    shortLabel: 'BigCartel',
    badgeClass: 'text-pink-300 border-pink-500/50',
    pillIdle: 'bg-pink-950/50 text-pink-300 border-pink-500/35 hover:bg-pink-900/60',
    pillActive: 'bg-pink-400 text-zinc-950 border-pink-300 font-bold shadow-sm'
  },
  {
    id: 'IMPERICON',
    label: 'Impericon',
    shortLabel: 'Impericon',
    badgeClass: 'text-rose-300 border-rose-500/50',
    pillIdle: 'bg-rose-950/50 text-rose-300 border-rose-500/35 hover:bg-rose-900/60',
    pillActive: 'bg-rose-400 text-zinc-950 border-rose-300 font-bold shadow-sm'
  },
  {
    id: 'KINGSROAD',
    label: 'Kings Road',
    shortLabel: 'Kings Road',
    badgeClass: 'text-red-300 border-red-500/50',
    pillIdle: 'bg-red-950/50 text-red-300 border-red-500/35 hover:bg-red-900/60',
    pillActive: 'bg-red-400 text-zinc-950 border-red-300 font-bold shadow-sm'
  }
];

const SHOPIFY_DISTRO_LIST = [
  { id: 'EVILGREED', name: 'Evil Greed', baseUrl: 'https://evilgreed.net' },
  { id: 'EYESORE', name: 'Eyesore Merch UK', baseUrl: 'https://eyesoremerch.com' },
  { id: 'INDIEMERCH', name: 'IndieMerchstore', baseUrl: 'https://www.indiemerchstore.com' },
  { id: 'HOLYMOUNTAIN', name: 'Holy Mountain Printing', baseUrl: 'https://holymountainprinting.com' },
  { id: 'COLDCUTS', name: 'Cold Cuts Merch', baseUrl: 'https://www.coldcutsmerch.com' },
  { id: 'HELLOMERCH', name: 'Hello Merch', baseUrl: 'https://www.hellomerch.com' },
  { id: 'DOWNRIGHT', name: 'Down Right Merch', baseUrl: 'https://downrightmerch.com' },
  { id: 'TWENTYFOUR', name: '24Hundred', baseUrl: 'https://24hundred.net' }
];

// All editable sites exposed in the Band Links Editor Modal
const ALL_EDITABLE_SITE_FIELDS = [
  { key: 'OFFICIAL', label: 'Official Band Store (Shopify)', placeholder: 'https://store.bandname.com', platformMatch: ['OFFICIAL'] },
  { key: 'WEBSITE', label: 'Official Band Website', placeholder: 'https://bandname.com', platformMatch: [] },
  { key: 'BANDCAMP', label: 'Bandcamp Merch Page', placeholder: 'https://bandname.bandcamp.com/merch', platformMatch: ['BANDCAMP'] },
  { key: 'BIGCARTEL', label: 'BigCartel Store', placeholder: 'https://bandname.bigcartel.com', platformMatch: ['BIGCARTEL'] },
  { key: 'AMAZON', label: 'Amazon Artist / Search URL', placeholder: 'https://www.amazon.co.uk/s?k=...', platformMatch: ['AMAZON'] },
  { key: 'EYESORE', label: 'Eyesore Merch UK Collection URL', placeholder: 'https://eyesoremerch.com/collections/band-name', platformMatch: ['EYESORE'] },
  { key: 'MERCHBAR', label: 'Merchbar Artist / Search URL', placeholder: 'https://www.merchbar.com/search?q=...', platformMatch: ['MERCHBAR'] },
  { key: 'EVILGREED', label: 'Evil Greed Collection URL', placeholder: 'https://evilgreed.net/collections/band-name', platformMatch: ['EVILGREED'] },
  { key: 'INDIEMERCH', label: 'IndieMerchstore Collection URL', placeholder: 'https://www.indiemerchstore.com/collections/band-name', platformMatch: ['INDIEMERCH'] },
  { key: 'HOLYMOUNTAIN', label: 'Holy Mountain Printing URL', placeholder: 'https://holymountainprinting.com/collections/band-name', platformMatch: ['HOLYMOUNTAIN'] },
  { key: 'COLDCUTS', label: 'Cold Cuts Merch URL', placeholder: 'https://www.coldcutsmerch.com/collections/band-name', platformMatch: ['COLDCUTS'] },
  { key: 'HELLOMERCH', label: 'Hello Merch URL', placeholder: 'https://www.hellomerch.com/collections/band-name', platformMatch: ['HELLOMERCH'] },
  { key: 'DOWNRIGHT', label: 'Down Right Merch URL', placeholder: 'https://downrightmerch.com/collections/band-name', platformMatch: ['DOWNRIGHT'] },
  { key: 'TWENTYFOUR', label: '24Hundred URL', placeholder: 'https://24hundred.net/collections/band-name', platformMatch: ['TWENTYFOUR'] },
  { key: 'IMPERICON', label: 'Impericon Artist URL', placeholder: 'https://www.impericon.com/uk/band-name.html', platformMatch: ['IMPERICON'] },
  { key: 'KINGSROAD', label: 'Kings Road Merch URL', placeholder: 'https://eu.kingsroadmerch.com/band-name', platformMatch: ['KINGSROAD'] }
];

function getPlatformMeta(platformId = 'OFFICIAL') {
  return SOURCE_PLATFORMS.find((p) => p.id === platformId) || SOURCE_PLATFORMS[1];
}

// Extended Size Normalization (XS through 5XL + Youth)
function normalizeSizeToken(rawSize = '') {
  const s = String(rawSize).toUpperCase().trim();
  if (!s) return null;
  if (/\b(YOUTH|KIDS|CHILD|JUNIOR|YTH|YS|YM|YL)\b/.test(s)) return 'YOUTH';
  if (/\b(5XL|XXXXXL|5X-LARGE|5X)\b/.test(s)) return '5XL';
  if (/\b(4XL|XXXXL|4X-LARGE|4X)\b/.test(s)) return '4XL';
  if (/\b(3XL|XXXL|TRIPLE\s*XL|3X-LARGE|3X)\b/.test(s)) return '3XL';
  if (/\b(2XL|XXL|DOUBLE\s*XL|2X-LARGE|2X)\b/.test(s)) return '2XL';
  if (/\b(XL|X-LARGE|EXTRA\s*LARGE)\b/.test(s)) return 'XL';
  if (/\b(XS|X-SMALL|EXTRA\s*SMALL)\b/.test(s)) return 'XS';
  if (/\b(SMALL|SM)\b/.test(s) || s === 'S' || /^S\s*(\/|-|\()/.test(s)) return 'S';
  if (/\b(MEDIUM|MED|MD)\b/.test(s) || s === 'M' || /^M\s*(\/|-|\()/.test(s)) return 'M';
  if (/\b(LARGE|LG)\b/.test(s) || s === 'L' || /^L\s*(\/|-|\()/.test(s)) return 'L';
  return null;
}

function matchProductType(product, selectedType) {
  if (selectedType === 'ALL') return true;
  const typeDef = PRODUCT_TYPES.find((t) => t.id === selectedType);
  if (!typeDef || !typeDef.keywords) return true;
  const haystack = `${product.title || ''} ${product.product_type || ''} ${(product.tags || []).join(' ')}`.toLowerCase();
  return typeDef.keywords.some((kw) => haystack.includes(kw));
}

function matchProductSize(product, selectedSize, requireInStock) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (selectedSize === 'ALL') {
    if (!requireInStock) return true;
    return variants.length === 0 || variants.some((v) => v.available !== false);
  }
  return variants.some((v) => {
    const norm = normalizeSizeToken(v.title || v.option1 || '');
    if (norm !== selectedSize) return false;
    return requireInStock ? v.available !== false : true;
  });
}

// ==========================================
// 4. CLIENT-SIDE FALLBACK SCRAPER HELPERS
// ==========================================
async function fetchHtmlViaCorsProxy(targetUrl, timeoutMs = 5000) {
  const fetchAttempt = async (proxyUrl) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('Bad status');
      const text = await res.text();
      if (!text || text.length < 50) throw new Error('Empty body');
      return text;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  };

  try {
    return await Promise.any([
      fetchAttempt(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`),
      fetchAttempt(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`)
    ]);
  } catch {
    return null;
  }
}

async function fetchClientShopifyDistroItems(distro, artistName) {
  const dashSlug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (dashSlug.length < 2) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3800);
    const res = await fetch(`${distro.baseUrl}/collections/${dashSlug}/products.json?limit=16`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.products)) return [];
    return data.products.map((p) =>
      slimProductForStorage({
        ...p,
        vendor: distro.name,
        sourcePlatform: distro.id,
        storeBaseUrl: distro.baseUrl,
        productUrl: `${distro.baseUrl}/products/${p.handle}`
      })
    );
  } catch {
    return [];
  }
}

function parseBandcampHtml(html, origin, artistName) {
  if (!html) return [];
  const products = [];
  const liRegex = /<li[^>]*class="[^"]*merch-grid-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  let idx = 0;
  while ((match = liRegex.exec(html)) !== null && idx < 20) {
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
      const rawTitle = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const rawType = typeMatch ? typeMatch[1].replace(/<[^>]+>/g, '').trim() : 'Merch';
      const priceNum = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').replace(/[^0-9.]/g, '') || '25.00' : '25.00';
      const itemPath = hrefMatch ? hrefMatch[1].replace(/&amp;/g, '&') : '/merch';
      const productUrl = itemPath.startsWith('http') ? itemPath : `${origin}${itemPath}`;
      const isApparel = /shirt|tee|hoodie|sweat|longsleeve|apparel/i.test(`${rawTitle} ${rawType}`);

      products.push(
        slimProductForStorage({
          id: `bc-client-${idx}-${artistName}`,
          title: rawTitle,
          product_type: rawType || (isApparel ? 'T-Shirt' : 'Vinyl'),
          vendor: `${artistName} Bandcamp`,
          sourcePlatform: 'BANDCAMP',
          storeBaseUrl: origin,
          productUrl,
          imageUrl: imgMatch ? imgMatch[1] : null,
          tags: [rawType, 'bandcamp'],
          variants: isApparel
            ? ['S', 'M', 'L', 'XL', '2XL'].map((sz, i) => ({
                id: `bcv-${idx}-${i}`,
                title: sz,
                price: priceNum,
                available: !soldOut
              }))
            : [{ id: `bcv-${idx}-os`, title: 'One Size', price: priceNum, available: !soldOut }]
        })
      );
    }
  }
  return products;
}

// ==========================================
// 5. MAIN APPLICATION COMPONENT
// ==========================================
export default function App() {
  // --- Spotify Auth & Library State ---
  const DEFAULT_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
  
  const [customClientId, setCustomClientId] = useState(() => localStorage.getItem('spotify_merch_client_id') || '');
  const activeClientId = (customClientId.trim() || DEFAULT_CLIENT_ID).trim();
  
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [showCustomIdGuide, setShowCustomIdGuide] = useState(false);
  
  const [redirectUri, setRedirectUri] = useState(
    () => localStorage.getItem('spotify_merch_redirect_uri') || `${window.location.origin}/`
  );
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('spotify_merch_access_token') || '');
  const [spotifyArtists, setSpotifyArtists] = useState(() => {
    try {
      const saved = localStorage.getItem('spotify_merch_cached_artists_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSyncingSpotify, setIsSyncingSpotify] = useState(false);
  const [spotifySyncProgress, setSpotifySyncProgress] = useState('');
  const [spotifyError, setSpotifyError] = useState('');
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);

  // --- Discovery Scope & Filters ---
  const [discoveryScope, setDiscoveryScope] = useState('ALL');
  const [minLikedTracks, setMinLikedTracks] = useState(1);
  const [preferredRegion, setPreferredRegion] = useState(() => localStorage.getItem('spotify_merch_region') || 'UK');
  const [storeFilterMode, setStoreFilterMode] = useState('MATCHING_PRODUCTS');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [selectedProductType, setSelectedProductType] = useState('ALL');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(() => localStorage.getItem('spotify_merch_thumb_size') || 'medium');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [directorySearch, setDirectorySearch] = useState('');
  const [sortActiveFirst, setSortActiveFirst] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const BANDS_PER_PAGE = 15;

  // --- Per-Band Site Filter Toggles & "Show All Items" Expansion State ---
  const [bandSiteFilters, setBandSiteFilters] = useState({});
  const [expandedBandCards, setExpandedBandCards] = useState({});

  // --- Scraped Merch Feeds & Metadata (Lean Storage) ---
  const [liveShopifyFeeds, setLiveShopifyFeeds] = useState(() => {
    try {
      const raw = localStorage.getItem('spotify_merch_live_feeds_v2');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const slimmed = {};
      for (const [id, list] of Object.entries(parsed)) {
        if (Array.isArray(list)) {
          slimmed[id] = list.map(slimProductForStorage).filter(Boolean);
        }
      }
      return slimmed;
    } catch {
      return {};
    }
  });

  const [discoveryMeta, setDiscoveryMeta] = useState(() => {
    try {
      const raw = localStorage.getItem('spotify_merch_discovery_meta_v2');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [customStoreUrls, setCustomStoreUrls] = useState(() => {
    try {
      const raw = localStorage.getItem('spotify_merch_custom_urls_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Per-site URL overrides keyed by artist.id -> { OFFICIAL, BANDCAMP, AMAZON, EYESORE, MERCHBAR, ... }
  const [customSiteOverrides, setCustomSiteOverrides] = useState(() => {
    try {
      const raw = localStorage.getItem('spotify_merch_site_overrides_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // --- Scraper Queue & Concurrency ---
  const [autoScrapeEnabled, setAutoScrapeEnabled] = useState(true);
  const [scraperConcurrency, setScraperConcurrency] = useState(3);
  const [activelyScanningIds, setActivelyScanningIds] = useState([]);
  const [proxyOnline, setProxyOnline] = useState(null);
  const activeWorkersRef = useRef(0);

  // --- Band Links Editor Modal State ---
  const [editingArtist, setEditingArtist] = useState(null);
  const [linkForm, setLinkForm] = useState({
    OFFICIAL: '',
    WEBSITE: '',
    BANDCAMP: '',
    BIGCARTEL: '',
    AMAZON: '',
    EYESORE: '',
    MERCHBAR: '',
    EVILGREED: '',
    INDIEMERCH: '',
    HOLYMOUNTAIN: '',
    COLDCUTS: '',
    HELLOMERCH: '',
    DOWNRIGHT: '',
    TWENTYFOUR: '',
    IMPERICON: '',
    KINGSROAD: '',
    ukStore: '',
    euStore: '',
    usStore: '',
    auStore: ''
  });
  const [unlockedFields, setUnlockedFields] = useState({});
  const [unlockWarningField, setUnlockWarningField] = useState(null);

  // --- Persist Settings & Lean Feeds to localStorage ---
  useEffect(() => {
    localStorage.setItem('spotify_merch_region', preferredRegion);
  }, [preferredRegion]);

  useEffect(() => {
    localStorage.setItem('spotify_merch_thumb_size', thumbnailSize);
  }, [thumbnailSize]);

  useEffect(() => {
    try {
      localStorage.setItem('spotify_merch_live_feeds_v2', JSON.stringify(liveShopifyFeeds));
    } catch (e) {
      console.warn('localStorage quota warning on liveShopifyFeeds:', e.message);
    }
  }, [liveShopifyFeeds]);

  useEffect(() => {
    try {
      localStorage.setItem('spotify_merch_discovery_meta_v2', JSON.stringify(discoveryMeta));
    } catch {}
  }, [discoveryMeta]);

  useEffect(() => {
    try {
      localStorage.setItem('spotify_merch_custom_urls_v1', JSON.stringify(customStoreUrls));
    } catch {}
  }, [customStoreUrls]);

  useEffect(() => {
    try {
      localStorage.setItem('spotify_merch_site_overrides_v1', JSON.stringify(customSiteOverrides));
    } catch {}
  }, [customSiteOverrides]);

  // ==========================================
  // 6. SPOTIFY OAUTH 2.0 PKCE LOGIN & SYNC
  // ==========================================
  const startSpotifyLogin = async () => {
    if (!activeClientId) {
      setSpotifyError('No default Spotify Client ID configured. Use the custom Client ID option below or import a Playlist URL.');
      setShowCustomIdGuide(true);
      return;
    }
    try {
      if (customClientId.trim()) {
        localStorage.setItem('spotify_merch_client_id', customClientId.trim());
      }
      localStorage.setItem('spotify_merch_redirect_uri', redirectUri.trim());
  
      const verifier = generateRandomString(64);
      const challenge = await generateCodeChallenge(verifier);
      localStorage.setItem('spotify_merch_pkce_verifier', verifier);
  
      const scope = 'user-follow-read user-library-read';
      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', activeClientId);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('redirect_uri', redirectUri.trim());
  
      window.location.href = authUrl.toString();
    } catch (err) {
      setSpotifyError(`PKCE Setup Error: ${err.message}`);
    }
  };

  const fetchSpotifyLibrary = useCallback(async (token) => {
    if (!token) return;
    setIsSyncingSpotify(true);
    setSpotifyError('');
    setSpotifySyncProgress('Fetching followed artists...');

    try {
      const artistMap = new Map();

      let afterCursor = null;
      let pageCount = 0;
      while (pageCount < 30) {
        pageCount++;
        const url = new URL('https://api.spotify.com/v1/me/following');
        url.searchParams.set('type', 'artist');
        url.searchParams.set('limit', '50');
        if (afterCursor) url.searchParams.set('after', afterCursor);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          localStorage.removeItem('spotify_merch_access_token');
          setAccessToken('');
          throw new Error('Spotify session expired. Please reconnect in Spotify Setup.');
        }
		if (res.status === 403) {
          localStorage.removeItem('spotify_merch_access_token');
          setAccessToken('');
          setShowCustomIdGuide(true);
          setShowSpotifyModal(true);
          throw new Error(
            'Spotify Developer Mode limit (5 users max) blocked this login. Paste a public Playlist URL above, or follow the 30-second guide below to add your own Client ID.'
          );
        }
        if (!res.ok) break;
        const data = await res.json();
        const items = data?.artists?.items || [];
        for (const a of items) {
          artistMap.set(a.id, {
            id: a.id,
            name: a.name,
            image: a.images?.[1]?.url || a.images?.[0]?.url || null,
            genres: a.genres || [],
            spotifyUrl: a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`,
            followed: true,
            likedTracksCount: 0
          });
        }
        setSpotifySyncProgress(`Loaded ${artistMap.size} followed artists...`);
        afterCursor = data?.artists?.cursors?.after;
        if (!afterCursor || items.length === 0) break;
      }

      let offset = 0;
      const missingIds = new Set();
      const likedCounts = new Map();
      const basicNames = new Map();

      while (offset < 1000) {
        setSpotifySyncProgress(`Scanning Liked Songs (${offset} tracks)...`);
        const res = await fetch(`https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) break;
        const data = await res.json();
        const items = data?.items || [];
        if (items.length === 0) break;

        for (const item of items) {
          const trackArtists = item?.track?.artists || [];
          for (const ta of trackArtists) {
            if (!ta?.id) continue;
            likedCounts.set(ta.id, (likedCounts.get(ta.id) || 0) + 1);
            basicNames.set(ta.id, ta.name);
            if (artistMap.has(ta.id)) {
              const existing = artistMap.get(ta.id);
              existing.likedTracksCount = likedCounts.get(ta.id);
            } else {
              missingIds.add(ta.id);
            }
          }
        }
        if (!data.next) break;
        offset += 50;
      }

      const missingArray = Array.from(missingIds);
      for (let i = 0; i < missingArray.length; i += 50) {
        const batch = missingArray.slice(i, i + 50);
        setSpotifySyncProgress(`Hydrating artist profiles (${i + batch.length}/${missingArray.length})...`);
        try {
          const res = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            for (const a of data?.artists || []) {
              if (!a) continue;
              artistMap.set(a.id, {
                id: a.id,
                name: a.name,
                image: a.images?.[1]?.url || a.images?.[0]?.url || null,
                genres: a.genres || [],
                spotifyUrl: a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`,
                followed: false,
                likedTracksCount: likedCounts.get(a.id) || 1
              });
            }
          }
        } catch {}
      }

      for (const id of missingArray) {
        if (!artistMap.has(id) && basicNames.get(id)) {
          artistMap.set(id, {
            id,
            name: basicNames.get(id),
            image: null,
            genres: [],
            spotifyUrl: `https://open.spotify.com/artist/${id}`,
            followed: false,
            likedTracksCount: likedCounts.get(id) || 1
          });
        }
      }

      const finalArtists = Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setSpotifyArtists(finalArtists);
      localStorage.setItem('spotify_merch_cached_artists_v1', JSON.stringify(finalArtists));
      setSpotifySyncProgress('');
    } catch (err) {
      setSpotifyError(err.message || 'Failed to sync Spotify library.');
    } finally {
      setIsSyncingSpotify(false);
    }
  }, []);

  const importSpotifyPlaylist = async (e) => {
    if (e) e.preventDefault();
    if (!playlistUrl.trim()) return;
    setIsImportingPlaylist(true);
    setSpotifyError('');
  
    try {
      const apiUrl = new URL('/api/playlist', window.location.origin);
      apiUrl.searchParams.set('url', playlistUrl.trim());
      const res = await fetch(apiUrl.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load playlist.');
  
      setSpotifyArtists(data.artists);
      localStorage.setItem('spotify_merch_cached_artists_v1', JSON.stringify(data.artists));
      setShowSpotifyModal(false);
      setPlaylistUrl('');
    } catch (err) {
      setSpotifyError(err.message);
    } finally {
      setIsImportingPlaylist(false);
    }
  };

  const handleLogoutSpotify = () => {
    localStorage.removeItem('spotify_merch_access_token');
    setAccessToken('');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const verifier = localStorage.getItem('spotify_merch_pkce_verifier');
    const savedClientId = localStorage.getItem('spotify_merch_client_id') || activeClientId;
    const savedRedirect = localStorage.getItem('spotify_merch_redirect_uri') || redirectUri;

    window.history.replaceState({}, document.title, window.location.pathname);
    if (!verifier || !savedClientId) return;

    (async () => {
      try {
        setIsSyncingSpotify(true);
        setSpotifySyncProgress('Completing Spotify PKCE handshake...');
        const body = new URLSearchParams({
          client_id: savedClientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: savedRedirect,
          code_verifier: verifier
        });
        const res = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const data = await res.json();
        if (!res.ok || !data.access_token) {
          throw new Error(data.error_description || 'Token exchange failed');
        }
        localStorage.setItem('spotify_merch_access_token', data.access_token);
        setAccessToken(data.access_token);
        setShowSpotifyModal(false);
        await fetchSpotifyLibrary(data.access_token);
      } catch (err) {
        setSpotifyError(err.message);
        setIsSyncingSpotify(false);
      }
    })();
  }, [activeClientId, redirectUri, fetchSpotifyLibrary]);

  useEffect(() => {
    if (accessToken && spotifyArtists.length === 0 && !isSyncingSpotify) {
      fetchSpotifyLibrary(accessToken);
    }
  }, [accessToken, spotifyArtists.length, isSyncingSpotify, fetchSpotifyLibrary]);

  // ==========================================
  // 7. MULTI-SITE MERCH DISCOVERY ENGINE
  // ==========================================
  const discoverArtistMerch = useCallback(
    async (artist, manualOverrideUrl = null, forceBypassCache = false, explicitSiteOverrides = null) => {
      if (!artist?.id || !artist?.name) return;
      setActivelyScanningIds((prev) => (prev.includes(artist.id) ? prev : [...prev, artist.id]));

      let proxyReachable = false;
      let discoveredProducts = [];
      let metaPatch = {};

      const activeSiteOverrides = explicitSiteOverrides || customSiteOverrides[artist.id] || {};
      const hasSiteOverrides = Object.values(activeSiteOverrides).some(Boolean);

      try {
        const proxyUrl = new URL('/api/discover', window.location.origin);
        proxyUrl.searchParams.set('artist', artist.name);
        proxyUrl.searchParams.set('spotifyId', artist.id);
        proxyUrl.searchParams.set('region', preferredRegion);
        if (manualOverrideUrl && !hasSiteOverrides) proxyUrl.searchParams.set('customUrl', manualOverrideUrl);
        if (hasSiteOverrides) proxyUrl.searchParams.set('siteOverrides', JSON.stringify(activeSiteOverrides));
        if (forceBypassCache) proxyUrl.searchParams.set('force', '1');

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 14000);
        const res = await fetch(proxyUrl.toString(), { signal: ctrl.signal });
        clearTimeout(timer);

        if (res.ok) {
          proxyReachable = true;
          setProxyOnline(true);
          const data = await res.json();
          if (Array.isArray(data.products)) {
            discoveredProducts = data.products.map(slimProductForStorage).filter(Boolean);
          }
          metaPatch = {
            storeUrl: data.storeUrl || null,
            officialWebsite: data.officialWebsite || null,
            bandcampUrl: data.bandcampUrl || null,
            regionalStores: data.regionalStores || {},
            webPresence: data.webPresence || {},
            genres: data.genres || [],
            source: data.source || 'proxy'
          };
        }
      } catch {
        setProxyOnline((prev) => (prev === true ? true : false));
      }

      if (!proxyReachable) {
        try {
          const slug = artist.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const bcUrl = activeSiteOverrides.BANDCAMP || metaPatch.bandcampUrl || `https://${slug}.bandcamp.com/merch`;

          const [distroArrays, bcHtml] = await Promise.all([
            Promise.all(SHOPIFY_DISTRO_LIST.map((d) => fetchClientShopifyDistroItems(d, artist.name))),
            fetchHtmlViaCorsProxy(bcUrl, 4500)
          ]);

          const clientDistroItems = distroArrays.flat();
          const clientBcItems = bcHtml ? parseBandcampHtml(bcHtml, new URL(bcUrl).origin, artist.name) : [];
          if (clientBcItems.length > 0 && !metaPatch.bandcampUrl) {
            metaPatch.bandcampUrl = bcUrl;
          }

          discoveredProducts = [...discoveredProducts, ...clientDistroItems, ...clientBcItems];
        } catch {}
      }

      setLiveShopifyFeeds((prev) => {
        const existing = Array.isArray(prev[artist.id]) ? prev[artist.id] : [];
        const mergedMap = new Map();
        for (const item of existing) {
          const key = `${item.sourcePlatform}::${(item.title || '').toLowerCase()}`;
          mergedMap.set(key, item);
        }
        for (const item of discoveredProducts) {
          const key = `${item.sourcePlatform}::${(item.title || '').toLowerCase()}`;
          mergedMap.set(key, item);
        }
        return {
          ...prev,
          [artist.id]: Array.from(mergedMap.values())
        };
      });

      setDiscoveryMeta((prev) => {
        const oldMeta = prev[artist.id] || {};
        return {
          ...prev,
          [artist.id]: {
            ...oldMeta,
            ...metaPatch,
            storeUrl: activeSiteOverrides.OFFICIAL || manualOverrideUrl || metaPatch.storeUrl || oldMeta.storeUrl || null,
            officialWebsite: activeSiteOverrides.WEBSITE || metaPatch.officialWebsite || oldMeta.officialWebsite || null,
            bandcampUrl: activeSiteOverrides.BANDCAMP || metaPatch.bandcampUrl || oldMeta.bandcampUrl || null,
            scanned: true,
            updatedAt: Date.now()
          }
        };
      });

      if (Array.isArray(metaPatch.genres) && metaPatch.genres.length > 0) {
        setSpotifyArtists((prev) =>
          prev.map((a) =>
            a.id === artist.id && (!a.genres || a.genres.length === 0) ? { ...a, genres: metaPatch.genres } : a
          )
        );
      }

      setActivelyScanningIds((prev) => prev.filter((id) => id !== artist.id));
    },
    [preferredRegion, customSiteOverrides]
  );

  // ==========================================
  // 8. FILTERING, PER-STORE COUNTS & STATS
  // ==========================================
  const scopedArtists = useMemo(() => {
    return spotifyArtists.filter((artist) => {
      if (discoveryScope === 'FOLLOWED' && !artist.followed) return false;
      if (discoveryScope === 'LIKED' && (artist.likedTracksCount || 0) < minLikedTracks) return false;
      if (discoveryScope === 'ALL' && !artist.followed && (artist.likedTracksCount || 0) < minLikedTracks) {
        return false;
      }
      return true;
    });
  }, [spotifyArtists, discoveryScope, minLikedTracks]);

  const allGenres = useMemo(() => {
    const counts = new Map();
    for (const a of scopedArtists) {
      for (const g of a.genres || []) {
        const norm = g.toLowerCase().trim();
        if (norm) counts.set(norm, (counts.get(norm) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, count]) => ({ name, count }));
  }, [scopedArtists]);

  const { artistStatsMap, globalPlatformCounts } = useMemo(() => {
    const map = new Map();
    const platTotals = { ALL: 0 };
    for (const p of SOURCE_PLATFORMS) {
      if (p.id !== 'ALL') platTotals[p.id] = 0;
    }

    for (const artist of scopedArtists) {
      const rawProducts = liveShopifyFeeds[artist.id] || [];
      const meta = discoveryMeta[artist.id] || {};
      const scanned = Boolean(meta.scanned);

      const typeAndSizeMatched = rawProducts.filter((p) => {
        if (!matchProductType(p, selectedProductType)) return false;
        if (!matchProductSize(p, selectedSize, inStockOnly)) return false;
        return true;
      });

      const perBandPlatformCounts = {};
      for (const p of typeAndSizeMatched) {
        const plat = p.sourcePlatform || 'OFFICIAL';
        perBandPlatformCounts[plat] = (perBandPlatformCounts[plat] || 0) + 1;
        platTotals[plat] = (platTotals[plat] || 0) + 1;
        platTotals.ALL += 1;
      }

      const matchingProducts =
        selectedPlatform === 'ALL'
          ? interleaveProductsByPlatform(typeAndSizeMatched)
          : typeAndSizeMatched.filter((p) => p.sourcePlatform === selectedPlatform);

      map.set(artist.id, {
        scanned,
        totalProducts: rawProducts.length,
        matchingProducts,
        matchingProductCount: matchingProducts.length,
        perBandPlatformCounts
      });
    }

    return { artistStatsMap: map, globalPlatformCounts: platTotals };
  }, [scopedArtists, liveShopifyFeeds, discoveryMeta, selectedPlatform, selectedProductType, selectedSize, inStockOnly]);

  const statusCounts = useMemo(() => {
    let withProducts = 0;
    let noMerch = 0;
    let notScraped = 0;
    let totalMatchingItems = 0;

    for (const artist of scopedArtists) {
      const st = artistStatsMap.get(artist.id);
      if (!st) continue;
      totalMatchingItems += st.matchingProductCount;
      if (st.matchingProductCount > 0) withProducts++;
      else if (st.scanned && st.totalProducts === 0) noMerch++;
      else if (!st.scanned) notScraped++;
    }
    return {
      withProducts,
      noMerch,
      notScraped,
      allBands: scopedArtists.length,
      totalMatchingItems
    };
  }, [scopedArtists, artistStatsMap]);

  const filteredArtists = useMemo(() => {
    return scopedArtists.filter((artist) => {
      if (selectedBandId === artist.id) return true;

      if (searchQuery.trim() && !artist.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) {
        return false;
      }
      if (selectedGenre !== 'ALL' && !(artist.genres || []).map((g) => g.toLowerCase()).includes(selectedGenre)) {
        return false;
      }

      const st = artistStatsMap.get(artist.id);
      if (!st) return false;

      if (storeFilterMode === 'MATCHING_PRODUCTS') {
        return st.matchingProductCount > 0 || activelyScanningIds.includes(artist.id);
      }
      if (storeFilterMode === 'NO_MERCH') {
        return st.scanned && st.totalProducts === 0;
      }
      if (storeFilterMode === 'NOT_SCRAPED') {
        return !st.scanned;
      }
      return true;
    });
  }, [
    scopedArtists,
    selectedBandId,
    searchQuery,
    selectedGenre,
    artistStatsMap,
    storeFilterMode,
    activelyScanningIds
  ]);

  const directoryArtists = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    const list = scopedArtists.filter((a) => !q || a.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sortActiveFirst) {
        const activeA = (artistStatsMap.get(a.id)?.matchingProductCount || 0) > 0;
        const activeB = (artistStatsMap.get(b.id)?.matchingProductCount || 0) > 0;
        if (activeA !== activeB) return activeA ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [scopedArtists, directorySearch, sortActiveFirst, artistStatsMap]);

  const totalPages = Math.max(1, Math.ceil(filteredArtists.length / BANDS_PER_PAGE));
  useEffect(() => {
    setCurrentPage(1);
  }, [storeFilterMode, selectedPlatform, selectedProductType, selectedSize, inStockOnly, searchQuery, selectedGenre, selectedBandId]);

  const paginatedArtists = useMemo(() => {
    const start = (currentPage - 1) * BANDS_PER_PAGE;
    return filteredArtists.slice(start, start + BANDS_PER_PAGE);
  }, [filteredArtists, currentPage]);

  // ==========================================
  // 9. PARALLEL TURBO SCRAPER QUEUE
  // ==========================================
  const unscrapedQueue = useMemo(() => {
    return scopedArtists.filter((a) => !discoveryMeta[a.id]?.scanned && !activelyScanningIds.includes(a.id));
  }, [scopedArtists, discoveryMeta, activelyScanningIds]);

  useEffect(() => {
    if (!autoScrapeEnabled || unscrapedQueue.length === 0) return;
    if (activeWorkersRef.current >= scraperConcurrency) return;

    const timer = setTimeout(() => {
      const slotsAvailable = scraperConcurrency - activeWorkersRef.current;
      if (slotsAvailable <= 0) return;
      const nextBatch = unscrapedQueue.slice(0, slotsAvailable);
      for (const band of nextBatch) {
        activeWorkersRef.current += 1;
        discoverArtistMerch(band, customStoreUrls[band.id] || null, false).finally(() => {
          activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        });
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [autoScrapeEnabled, unscrapedQueue, scraperConcurrency, discoverArtistMerch, customStoreUrls]);

  // ==========================================
  // 10. BAND LINKS MODAL HANDLERS (ALL 15 PLATFORMS + REGIONAL STORES)
  // ==========================================
  const openBandLinksModal = (artist) => {
    const meta = discoveryMeta[artist.id] || {};
    const regStores = meta.regionalStores || {};
    const savedOverrides = customSiteOverrides[artist.id] || {};
    const bandProducts = liveShopifyFeeds[artist.id] || [];

    // Pre-fill any discovered base/product URLs per platform if not already overridden
    const inferredSiteUrls = {};
    for (const field of ALL_EDITABLE_SITE_FIELDS) {
      if (savedOverrides[field.key]) {
        inferredSiteUrls[field.key] = savedOverrides[field.key];
      } else if (field.platformMatch.length > 0) {
        const hit = bandProducts.find((p) => field.platformMatch.includes(p.sourcePlatform));
        inferredSiteUrls[field.key] = hit?.storeBaseUrl || '';
      } else {
        inferredSiteUrls[field.key] = '';
      }
    }

    setEditingArtist(artist);
    setLinkForm({
      ...inferredSiteUrls,
      OFFICIAL: savedOverrides.OFFICIAL || customStoreUrls[artist.id] || meta.storeUrl || inferredSiteUrls.OFFICIAL || '',
      WEBSITE: savedOverrides.WEBSITE || meta.officialWebsite || '',
      BANDCAMP: savedOverrides.BANDCAMP || meta.bandcampUrl || meta.webPresence?.bandcamp || inferredSiteUrls.BANDCAMP || '',
      ukStore: regStores.UK || '',
      euStore: regStores.EU || '',
      usStore: regStores.US || '',
      auStore: regStores.AU || ''
    });
    setUnlockedFields({});
    setUnlockWarningField(null);
  };

  const handleSaveBandLinks = async (e) => {
    e.preventDefault();
    if (!editingArtist) return;
    const id = editingArtist.id;
    const cleanPrimary = (linkForm.OFFICIAL || '').trim();

    if (cleanPrimary) {
      setCustomStoreUrls((prev) => ({ ...prev, [id]: cleanPrimary }));
    }

    const cleanedOverrides = {};
    for (const field of ALL_EDITABLE_SITE_FIELDS) {
      const val = (linkForm[field.key] || '').trim();
      if (val) cleanedOverrides[field.key] = val;
    }

    setCustomSiteOverrides((prev) => ({
      ...prev,
      [id]: cleanedOverrides
    }));

    setDiscoveryMeta((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        storeUrl: cleanPrimary || null,
        officialWebsite: (linkForm.WEBSITE || '').trim() || null,
        bandcampUrl: (linkForm.BANDCAMP || '').trim() || null,
        regionalStores: {
          ...(prev[id]?.regionalStores || {}),
          UK: (linkForm.ukStore || '').trim() || undefined,
          EU: (linkForm.euStore || '').trim() || undefined,
          US: (linkForm.usStore || '').trim() || undefined,
          AU: (linkForm.auStore || '').trim() || undefined
        }
      }
    }));

    const targetBand = editingArtist;
    setEditingArtist(null);
    await discoverArtistMerch(targetBand, cleanPrimary || null, true, cleanedOverrides);
  };

  const productGridColsClass = useMemo(() => {
    switch (thumbnailSize) {
      case 'compact':
        return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5';
      case 'large':
        return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';
      case 'xl':
        return 'grid-cols-1 sm:grid-cols-2 gap-5';
      default:
        return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5';
    }
  }, [thumbnailSize]);

  const scannedCount = scopedArtists.length - unscrapedQueue.length;
  const progressPercent = scopedArtists.length > 0 ? Math.min(100, Math.round((scannedCount / scopedArtists.length) * 100)) : 0;
  const activeScanningNames = activelyScanningIds
    .map((id) => spotifyArtists.find((a) => a.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Custom Sleek Dark & Emerald Scrollbars */}
      <style>{`
        * {
          scrollbar-width: thin;
          scrollbar-color: #27272a #09090b;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #09090b;
          border-radius: 9999px;
        }
        ::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 9999px;
          border: 1px solid #18181b;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #10b981;
        }
      `}</style>

      {/* ==========================================
          STICKY 2-ROW HEADER
      ========================================== */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 space-y-2">
          {/* ROW 1: MerchPulse Logo (Left) + Connect to Spotify Button (Pinned Top Right) */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-950/50">
                <ShoppingBag className="w-5 h-5 text-zinc-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-white">MerchPulse</h1>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    15-Site Live Aggregator
                  </span>
                </div>
                <p className="text-xs text-zinc-400 hidden sm:block">
                  Includes Amazon, Eyesore Shopify & Merchbar Algolia • Per-Band Store Toggles
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowSpotifyModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer"
              >
                <Music2 className="w-4 h-4 text-emerald-400" />
                <span>Add/Update Playlist ({spotifyArtists.length})</span>
              </button>
            </div>
          </div>

          {/* ROW 2: Region Selector + Full-Width Fixed-Height Scraper Progress Bar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 shrink-0 h-10">
              <Globe className="w-3.5 h-3.5 text-zinc-400 ml-2 mr-1" />
              {['UK', 'EU', 'US', 'AU', 'GLOBAL'].map((reg) => (
                <button
                  key={reg}
                  onClick={() => setPreferredRegion(reg)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    preferredRegion === reg
                      ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {reg}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-0 h-10 bg-zinc-900/90 border border-zinc-800 rounded-xl px-3.5 flex items-center justify-between gap-3 overflow-hidden">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    activelyScanningIds.length > 0
                      ? 'bg-emerald-400 animate-ping'
                      : unscrapedQueue.length === 0 && scopedArtists.length > 0
                      ? 'bg-emerald-500'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-semibold text-zinc-200 tabular-nums shrink-0">
                  Scraped {scannedCount}/{scopedArtists.length}
                </span>
                <span className="text-zinc-600 shrink-0">•</span>
                <span className="text-xs text-zinc-400 truncate min-w-0 flex-1">
                  {activelyScanningIds.length > 0
                    ? `Scanning (${activelyScanningIds.length}x): ${activeScanningNames}`
                    : unscrapedQueue.length === 0 && scopedArtists.length > 0
                    ? `All ${scopedArtists.length} bands scanned (${statusCounts.totalMatchingItems} matching items)`
                    : 'Scraper paused'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-medium text-emerald-400 tabular-nums hidden md:inline">
                  {progressPercent}%
                </span>
                <button
                  onClick={() => setAutoScrapeEnabled((prev) => !prev)}
                  className={`w-20 py-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                    autoScrapeEnabled
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {autoScrapeEnabled ? (
                    <>
                      <Pause className="w-3 h-3" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> Scrape
                    </>
                  )}
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ==========================================
          MAIN CONTENT GRID (STICKY LEFT SIDEBAR + BAND FEED)
      ========================================== */}
      <main className="max-w-[1600px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT SIDEBAR (Sticky on Desktop) */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4 lg:sticky lg:top-28 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto pr-1">
          {/* 1. MERCH & STORE FILTERS */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Merch & Store Filters</h2>
              </div>
              {(selectedPlatform !== 'ALL' ||
                selectedProductType !== 'ALL' ||
                selectedSize !== 'ALL' ||
                inStockOnly ||
                selectedBandId) && (
                <button
                  onClick={() => {
                    setSelectedPlatform('ALL');
                    setSelectedProductType('ALL');
                    setSelectedSize('ALL');
                    setInStockOnly(false);
                    setSelectedBandId(null);
                  }}
                  className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>

            {/* Band Feed Status 2x2 Grid */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">Band Feed Status</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setStoreFilterMode('MATCHING_PRODUCTS')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all cursor-pointer flex items-center justify-between ${
                    storeFilterMode === 'MATCHING_PRODUCTS'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span>With Products</span>
                  <span className="tabular-nums text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 text-emerald-400">
                    {statusCounts.withProducts}
                  </span>
                </button>

                <button
                  onClick={() => setStoreFilterMode('NO_MERCH')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all cursor-pointer flex items-center justify-between ${
                    storeFilterMode === 'NO_MERCH'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span>No Merch Found</span>
                  <span className="tabular-nums text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 text-amber-400">
                    {statusCounts.noMerch}
                  </span>
                </button>

                <button
                  onClick={() => setStoreFilterMode('NOT_SCRAPED')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all cursor-pointer flex items-center justify-between ${
                    storeFilterMode === 'NOT_SCRAPED'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                      : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span>Not Scraped</span>
                  <span className="tabular-nums text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 text-sky-400">
                    {statusCounts.notScraped}
                  </span>
                </button>

                <button
                  onClick={() => setStoreFilterMode('ALL_BANDS')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all cursor-pointer flex items-center justify-between ${
                    storeFilterMode === 'ALL_BANDS'
                      ? 'bg-zinc-800 text-white border-zinc-600'
                      : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <span>All Bands</span>
                  <span className="tabular-nums text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300">
                    {statusCounts.allBands}
                  </span>
                </button>
              </div>
            </div>

            {/* Product Thumbnail Size (CDN Res) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-400">Product Thumbnail Size (CDN Res)</label>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {thumbnailSize === 'compact'
                    ? '180px (~12KB)'
                    : thumbnailSize === 'medium'
                    ? '280px (~22KB)'
                    : thumbnailSize === 'large'
                    ? '440px (~50KB)'
                    : '680px (~110KB)'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                {[
                  { id: 'compact', label: 'Compact' },
                  { id: 'medium', label: 'Medium' },
                  { id: 'large', label: 'Large' },
                  { id: 'xl', label: 'XL' }
                ].map((sz) => (
                  <button
                    key={sz.id}
                    onClick={() => setThumbnailSize(sz.id)}
                    className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      thumbnailSize === sz.id
                        ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Type */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">Product Type</label>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_TYPES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setSelectedProductType(pt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      selectedProductType === pt.id
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-semibold'
                        : 'bg-zinc-950/70 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Extended Sizes (XS - 5XL & Youth) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-400">Size (XS–5XL Alias Normalized)</label>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0"
                  />
                  In-Stock Only
                </label>
              </div>
              <div className="flex flex-wrap gap-1">
                {SIZE_OPTIONS.map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setSelectedSize(sz)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                      selectedSize === sz
                        ? 'bg-amber-400 text-zinc-950 border-amber-300 shadow-sm'
                        : 'bg-zinc-950/70 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter by Site / Retailer (All 15 Platforms + Amazon) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-400">Filter by Site / Retailer</label>
                {selectedPlatform !== 'ALL' && (
                  <button
                    onClick={() => setSelectedPlatform('ALL')}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    Show All
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {SOURCE_PLATFORMS.map((plat) => {
                  const count = globalPlatformCounts[plat.id] || 0;
                  const isActive = selectedPlatform === plat.id;
                  return (
                    <button
                      key={plat.id}
                      onClick={() => setSelectedPlatform(isActive && plat.id !== 'ALL' ? 'ALL' : plat.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? plat.pillActive
                          : count > 0
                          ? plat.pillIdle
                          : 'bg-zinc-950/40 text-zinc-600 border-zinc-900 hover:text-zinc-400'
                      }`}
                    >
                      <span>{plat.shortLabel}</span>
                      <span
                        className={`text-[9px] tabular-nums px-1 py-0.2 rounded ${
                          isActive ? 'bg-black/20 text-zinc-950 font-extrabold' : count > 0 ? 'bg-black/40' : 'opacity-60'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. ALL BANDS DIRECTORY */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  All Bands Directory ({directoryArtists.length})
                </h2>
              </div>
              <button
                onClick={() => setSortActiveFirst((prev) => !prev)}
                className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700 cursor-pointer"
              >
                {sortActiveFirst ? 'Active A–Z First' : 'Pure A–Z'}
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Jump to band in directory..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              {directorySearch && (
                <button
                  onClick={() => setDirectorySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {directoryArtists.map((band) => {
                const st = artistStatsMap.get(band.id);
                const count = st?.matchingProductCount || 0;
                const isSelected = selectedBandId === band.id;
                return (
                  <button
                    key={band.id}
                    onClick={() => setSelectedBandId(isSelected ? null : band.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500 text-zinc-950 font-bold'
                        : count > 0
                        ? 'text-zinc-200 hover:bg-zinc-800/80 font-medium'
                        : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-400'
                    }`}
                  >
                    <span className="truncate text-left">{band.name}</span>
                    <span
                      className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ml-2 shrink-0 ${
                        isSelected
                          ? 'bg-zinc-950/20 text-zinc-950 font-bold'
                          : count > 0
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-zinc-950 text-zinc-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. SPOTIFY DISCOVERY SCOPE & GENRES */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <Music2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Spotify Discovery Scope</h2>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              {[
                { id: 'ALL', label: 'All Sources' },
                { id: 'FOLLOWED', label: 'Followed' },
                { id: 'LIKED', label: 'Liked Songs' }
              ].map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setDiscoveryScope(sc.id)}
                  className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    discoveryScope === sc.id ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>

            {discoveryScope !== 'FOLLOWED' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Min. Liked Tracks</span>
                  <span className="text-emerald-400 font-semibold">{minLikedTracks}+ tracks</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={minLikedTracks}
                  onChange={(e) => setMinLikedTracks(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            )}

            {allGenres.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-400">Filter by Genre</label>
                  {selectedGenre !== 'ALL' && (
                    <button
                      onClick={() => setSelectedGenre('ALL')}
                      className="text-[10px] text-emerald-400 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1 pr-1">
                  <button
                    onClick={() => setSelectedGenre('ALL')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border cursor-pointer ${
                      selectedGenre === 'ALL'
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-semibold'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    All Genres
                  </button>
                  {allGenres.map((g) => (
                    <button
                      key={g.name}
                      onClick={() => setSelectedGenre(g.name)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-medium border cursor-pointer capitalize ${
                        selectedGenre === g.name
                          ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-semibold'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {g.name} ({g.count})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. MULTI-SITE SCRAPER */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Multi-Site Scraper</h2>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  proxyOnline
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {proxyOnline ? 'Server Proxy Online' : 'Browser Fallback Mode'}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">Parallel Workers (Turbo Speed)</label>
              <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                {[1, 3, 5, 8].map((w) => (
                  <button
                    key={w}
                    onClick={() => setScraperConcurrency(w)}
                    className={`py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      scraperConcurrency === w ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {w}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  for (const band of paginatedArtists) {
                    discoverArtistMerch(band, customStoreUrls[band.id] || null, true);
                  }
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Scrape Current Page
              </button>
            </div>
          </div>
        </aside>

        {/* ==========================================
            RIGHT MAIN FEED: ARTIST CARDS & PRODUCT GRIDS
        ========================================== */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Search & Active Filter Banner */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bands by name..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-8 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {selectedBandId && (
                <button
                  onClick={() => setSelectedBandId(null)}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Isolated Band View</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {storeFilterMode === 'NO_MERCH' && statusCounts.noMerch > 0 && (
                <button
                  onClick={() => {
                    for (const band of paginatedArtists) {
                      discoverArtistMerch(band, customStoreUrls[band.id] || null, true);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-Search This Page
                </button>
              )}

              <span className="tabular-nums font-medium text-zinc-300">
                Showing {filteredArtists.length} bands • {statusCounts.totalMatchingItems} products
              </span>
            </div>
          </div>

          {/* Empty State if No Spotify Artists Connected */}
          {spotifyArtists.length === 0 ? (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <Music2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-white">Connect Your Spotify Library</h3>
                <p className="text-xs text-zinc-400">
                  Click <strong className="text-emerald-300">My Spotify</strong> in the top-right corner to authorize via
                  Spotify PKCE and automatically discover official stores and live merch across your followed and liked bands.
                </p>
              </div>
              <button
                onClick={() => setShowSpotifyModal(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-colors cursor-pointer"
              >
                Open Spotify Setup
              </button>
            </div>
          ) : paginatedArtists.length === 0 ? (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">No Bands Match Your Current Filter View</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                {unscrapedQueue.length > 0
                  ? `The background scraper is still scanning (${scannedCount}/${scopedArtists.length}). New bands will appear here automatically as products are found.`
                  : 'Try switching the Band Feed Status in the left sidebar to "No Merch Found" or "All Bands", or relax your size/type filter.'}
              </p>
            </div>
          ) : (
            /* ARTIST CARDS LIST */
            <div className="space-y-5">
              {paginatedArtists.map((artist) => {
                const st = artistStatsMap.get(artist.id) || {
                  matchingProducts: [],
                  totalProducts: 0,
                  scanned: false,
                  perBandPlatformCounts: {}
                };
                const meta = discoveryMeta[artist.id] || {};
                const isScanning = activelyScanningIds.includes(artist.id);
                const officialSiteUrl =
                  customStoreUrls[artist.id] || meta.storeUrl || meta.officialWebsite || meta.bandcampUrl;

                const activeBandSite = bandSiteFilters[artist.id] || 'ALL';
                const availablePlatformsForBand = SOURCE_PLATFORMS.filter(
                  (p) => p.id !== 'ALL' && (st.perBandPlatformCounts?.[p.id] || 0) > 0
                );

                const bandDisplayedProducts =
                  activeBandSite === 'ALL'
                    ? st.matchingProducts
                    : st.matchingProducts.filter((p) => p.sourcePlatform === activeBandSite);

                const isExpanded = Boolean(expandedBandCards[artist.id]);
                const visibleProducts = isExpanded ? bandDisplayedProducts : bandDisplayedProducts.slice(0, 24);

                return (
                  <article
                    key={artist.id}
                    className="bg-zinc-900/75 border border-zinc-800/90 rounded-2xl overflow-hidden shadow-lg"
                  >
                    {/* Tidied Band Card Header with Compact Inline Color-Coded Store Toggles */}
                    <div className="px-4 py-3 bg-zinc-900/95 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {artist.image ? (
                          <img
                            src={artist.image}
                            alt={artist.name}
                            loading="lazy"
                            decoding="async"
                            className="w-11 h-11 rounded-xl object-cover border border-zinc-700 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-base shrink-0">
                            {artist.name[0]}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-bold text-white truncate mr-1">{artist.name}</h3>

                            <button
                              type="button"
                              onClick={() =>
                                setBandSiteFilters((prev) => ({
                                  ...prev,
                                  [artist.id]: 'ALL'
                                }))
                              }
                              title="Show all stores for this band"
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all tabular-nums cursor-pointer ${
                                activeBandSite === 'ALL'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                              }`}
                            >
                              {st.matchingProducts.length} items
                            </button>

                            {availablePlatformsForBand.map((plat) => {
                              const pCount = st.perBandPlatformCounts[plat.id] || 0;
                              const isSelected = activeBandSite === plat.id;
                              return (
                                <button
                                  key={plat.id}
                                  type="button"
                                  onClick={() =>
                                    setBandSiteFilters((prev) => ({
                                      ...prev,
                                      [artist.id]: isSelected ? 'ALL' : plat.id
                                    }))
                                  }
                                  title={`Filter ${artist.name} products by ${plat.label}`}
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-all tabular-nums cursor-pointer flex items-center gap-1 ${
                                    isSelected ? plat.pillActive : plat.pillIdle
                                  }`}
                                >
                                  <span>{plat.shortLabel}</span>
                                  <span className="opacity-85 font-mono text-[9px]">{pCount}</span>
                                </button>
                              );
                            })}

                            {isScanning && (
                              <span className="text-[10px] font-medium text-amber-300 flex items-center gap-1 ml-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Scraping...
                              </span>
                            )}
                          </div>

                          {artist.genres && artist.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {artist.genres.slice(0, 4).map((g) => (
                                <span
                                  key={g}
                                  className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800/90 text-zinc-400 capitalize"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Clean Icon Action Bar */}
                      <div className="flex items-center gap-2 shrink-0">
                        {officialSiteUrl && (
                          <a
                            href={officialSiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Official Store / Page: ${officialSiteUrl}`}
                            className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-emerald-400 border border-zinc-700/80 flex items-center justify-center transition-colors"
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                        )}

                        {artist.spotifyUrl && (
                          <a
                            href={artist.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open Artist on Spotify"
                            className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-[#1DB954] border border-zinc-700/80 flex items-center justify-center transition-colors"
                          >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                            </svg>
                          </a>
                        )}

                        <button
                          onClick={() => discoverArtistMerch(artist, customStoreUrls[artist.id] || null, true)}
                          disabled={isScanning}
                          title="Force Re-Scrape All 15 Merch Sites"
                          className="px-2.5 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-200 border border-zinc-700/80 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
                          <span>Scrape All Sites</span>
                        </button>

                        <button
                          onClick={() => openBandLinksModal(artist)}
                          title="Edit All 15 Merch Site Links & Regional URLs"
                          className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/80 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Product Thumbnail Grid */}
                    <div className="p-4 space-y-3">
                      {bandDisplayedProducts.length === 0 ? (
                        <div className="py-6 text-center text-xs text-zinc-500">
                          {isScanning
                            ? 'Scanning all 15 stores (including Amazon, Eyesore & Merchbar) for live products...'
                            : activeBandSite !== 'ALL'
                            ? `No matching items for ${getPlatformMeta(activeBandSite).label}. Click the pill again to show all stores.`
                            : 'No products matching active filters. Click "Scrape All Sites" or the Pencil icon to add a custom store URL.'}
                        </div>
                      ) : (
                        <>
                          <div className={`grid ${productGridColsClass}`}>
                            {visibleProducts.map((product) => {
                              const platMeta = getPlatformMeta(product.sourcePlatform);
                              const variants = Array.isArray(product.variants) ? product.variants : [];
                              const firstPrice = variants[0]?.price || '25.00';
                              const sizedImgUrl = getSizedThumbnailUrl(
                                product.imageUrl || product.image?.src || product.images?.[0]?.src,
                                thumbnailSize
                              );

                              return (
                                <a
                                  key={product.id}
                                  href={product.productUrl || meta.storeUrl || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group bg-zinc-950/80 border border-zinc-800/90 hover:border-emerald-500/50 rounded-xl overflow-hidden flex flex-col justify-between transition-all"
                                >
                                  <div>
                                    <div className="relative aspect-square bg-zinc-900 overflow-hidden">
                                      {sizedImgUrl ? (
                                        <img
                                          src={sizedImgUrl}
                                          alt={product.title}
                                          loading="lazy"
                                          decoding="async"
                                          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                          <Shirt className="w-8 h-8" />
                                        </div>
                                      )}

                                      <span
                                        className={`absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-950/95 ring-1 ring-black/80 border shadow-md ${platMeta.badgeClass}`}
                                      >
                                        {platMeta.shortLabel}
                                      </span>

                                      <span className="absolute bottom-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-950/95 text-emerald-300 border border-zinc-800 shadow">
                                        ${firstPrice}
                                      </span>
                                    </div>

                                    <div className="p-2.5 space-y-1.5">
                                      <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 line-clamp-2 leading-snug">
                                        {product.title}
                                      </h4>
                                    </div>
                                  </div>

                                  {variants.length > 0 && (
                                    <div className="px-2.5 pb-2.5 flex flex-wrap gap-1">
                                      {variants.slice(0, 8).map((v) => {
                                        const norm = normalizeSizeToken(v.title || v.option1 || '');
                                        const isSelectedSize = selectedSize !== 'ALL' && norm === selectedSize;
                                        return (
                                          <span
                                            key={v.id || v.title}
                                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                                              !v.available
                                                ? 'bg-zinc-900/40 text-zinc-600 border-zinc-800/60 line-through'
                                                : isSelectedSize
                                                ? 'bg-amber-400 text-zinc-950 border-amber-300 font-bold'
                                                : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                                            }`}
                                          >
                                            {norm || v.title}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </a>
                              );
                            })}
                          </div>

                          {bandDisplayedProducts.length > 24 && (
                            <div className="pt-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedBandCards((prev) => ({
                                    ...prev,
                                    [artist.id]: !isExpanded
                                  }))
                                }
                                className="px-3 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-semibold text-emerald-300 border border-zinc-700 transition-colors cursor-pointer"
                              >
                                {isExpanded
                                  ? 'Show First 24 Items'
                                  : `Show All ${bandDisplayedProducts.length} Items (+${
                                      bandDisplayedProducts.length - 24
                                    } more)`}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-2xl px-4 py-3">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-xs text-zinc-400 tabular-nums">
                Page <strong className="text-white">{currentPage}</strong> of{' '}
                <strong className="text-white">{totalPages}</strong>
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>
      </main>

      {/* ==========================================
          MODAL 1: BAND LINKS EDITOR (ALL 15 PLATFORMS + AMAZON + REGIONAL STORES)
      ========================================== */}
      {editingArtist && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 p-5 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Edit All Merch Site & Store Links — {editingArtist.name}
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Override any of the 15 supported retailers or regional storefronts. Sites with live products are locked for safety.
                </p>
              </div>
              <button
                onClick={() => setEditingArtist(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {unlockWarningField && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-2 shrink-0">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Warning: This URL previously found live products!</span>
                </div>
                <p className="text-[11px] text-amber-200/90">
                  Editing this link may change or replace the scraped feed for {editingArtist.name}. Unlock this field?
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockedFields((prev) => ({ ...prev, [unlockWarningField]: true }));
                      setUnlockWarningField(null);
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-400 text-zinc-950 text-xs font-bold cursor-pointer"
                  >
                    Yes, Unlock Field
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnlockWarningField(null)}
                    className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveBandLinks} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* All 15 Platforms + Official Website */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Supported Retailers & Official Links (15 Platforms)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ALL_EDITABLE_SITE_FIELDS.map((field) => {
                    const bandProducts = liveShopifyFeeds[editingArtist.id] || [];
                    const matchingCount =
                      field.key === 'WEBSITE'
                        ? bandProducts.length > 0 && linkForm.WEBSITE
                          ? 1
                          : 0
                        : bandProducts.filter((p) => field.platformMatch.includes(p.sourcePlatform)).length;

                    const hasProducts = matchingCount > 0;
                    const isLocked = hasProducts && Boolean(linkForm[field.key]) && !unlockedFields[field.key];

                    return (
                      <div key={field.key} className="space-y-1 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
                        <div className="flex items-center justify-between gap-1">
                          <label className="text-[11px] font-semibold text-zinc-300 truncate">{field.label}</label>
                          {hasProducts && Boolean(linkForm[field.key]) && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                {field.key === 'WEBSITE' ? 'Verified' : `${matchingCount} Found`}
                              </span>
                              {isLocked && (
                                <button
                                  type="button"
                                  onClick={() => setUnlockWarningField(field.key)}
                                  className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Lock className="w-2.5 h-2.5" /> Unlock
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <input
                          type="url"
                          disabled={isLocked}
                          value={linkForm[field.key] || ''}
                          onChange={(e) => setLinkForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className={`w-full bg-zinc-950 border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none ${
                            isLocked
                              ? 'border-zinc-800/60 text-zinc-500 cursor-not-allowed'
                              : 'border-zinc-800 focus:border-emerald-500'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Regional Storefront Overrides */}
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Regional Storefront Overrides
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'ukStore', label: 'UK Regional Storefront URL', placeholder: 'https://ukstore.bandname.com' },
                    { key: 'euStore', label: 'EU Regional Storefront URL', placeholder: 'https://eustore.bandname.com' },
                    { key: 'usStore', label: 'US Regional Storefront URL', placeholder: 'https://usstore.bandname.com' },
                    { key: 'auStore', label: 'AU Regional Storefront URL', placeholder: 'https://austore.bandname.com' }
                  ].map((regField) => (
                    <div key={regField.key} className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-300">{regField.label}</label>
                      <input
                        type="url"
                        value={linkForm[regField.key] || ''}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, [regField.key]: e.target.value }))}
                        placeholder={regField.placeholder}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800 sticky bottom-0 bg-zinc-900 py-2">
                <button
                  type="button"
                  onClick={() => setEditingArtist(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-zinc-950 cursor-pointer"
                >
                  Save & Re-Scrape All Sites
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 2: SPOTIFY OAUTH 2.0 PKCE SETUP
      ========================================== */}
      {showSpotifyModal && (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Load Artists from Spotify</h3>
        </div>
        <button onClick={() => setShowSpotifyModal(false)} className="text-zinc-400 hover:text-white p-1 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      {spotifyError && (
        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 space-y-1">
          <p className="font-semibold text-amber-300">Notice</p>
          <p>{spotifyError}</p>
        </div>
      )}

      {isSyncingSpotify && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>{spotifySyncProgress || 'Syncing your Spotify library...'}</span>
        </div>
      )}

      {/* OPTION 2: PASTE PUBLIC PLAYLIST URL */}
      <form onSubmit={importSpotifyPlaylist} className="space-y-2">
        <label className="text-[11px] font-semibold text-zinc-300 block">Paste a Public Spotify Playlist Link</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={!playlistUrl.trim() || isImportingPlaylist}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-emerald-300 border border-zinc-700 cursor-pointer shrink-0"
          >
            {isImportingPlaylist ? 'Loading...' : 'Scan Playlist'}
          </button>
        </div>
      </form>

      {/* COLLAPSIBLE TROUBLESHOOTING / CUSTOM CLIENT ID GUIDE */}
      <div className="pt-2 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={() => setShowCustomIdGuide((prev) => !prev)}
          className="w-full flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
        >
          <span>Or use your own Spotify Client ID (Advanced users)</span>
          <span className="text-emerald-400 font-semibold">{showCustomIdGuide ? 'Hide' : 'Show Guide'}</span>
        </button>

        {showCustomIdGuide && (
          <div className="mt-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 text-[11px] text-zinc-400">
            <p className="text-zinc-300">
              Spotify restricts public indie apps to <strong>5 test users</strong>. To bypass this limit with your own
              account:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-zinc-400">
              <li>
                Open{' '}
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 underline"
                >
                  developer.spotify.com/dashboard
                </a>{' '}
                and click <strong>Create App</strong>.
              </li>
              <li>
                Set the Redirect URI to:{' '}
                <code className="px-1.5 py-0.5 rounded bg-zinc-900 text-emerald-300 select-all">{redirectUri}</code>
              </li>
              <li>Copy your <strong>Client ID</strong>, paste it below, and click <strong>Login with Spotify</strong>.</li>
            </ol>

            <input
              type="text"
              value={customClientId}
              onChange={(e) => setCustomClientId(e.target.value)}
              placeholder="Optional: Paste your 32-character Client ID"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>
    </div>
  </div>
)}
    </div>
  );
}
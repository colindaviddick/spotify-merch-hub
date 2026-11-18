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
  ShieldAlert,
  Heart,
  Bookmark,
  Eye,
  Share2,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  Sparkles,
  Filter,
  LayoutGrid,
  ListFilter,
  ArrowUpDown,
  Bell,
  BellRing,
  CheckCircle2
} from 'lucide-react';

// ==========================================
// 1. DYNAMIC CDN THUMBNAIL RESIZER & LEAN NORMALIZER
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

// Safe localStorage writer that prevents QuotaExceededError crashes and prunes heavy feed cache first
function safeSetLocalStorage(key, valueString, onQuotaExceeded = null) {
  try {
    localStorage.setItem(key, valueString);
    return true;
  } catch {
    if (typeof onQuotaExceeded === 'function') {
      try {
        onQuotaExceeded();
        localStorage.setItem(key, valueString);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function slimProductForStorage(p, ultraLean = false) {
  if (!p || typeof p !== 'object') return null;
  const rawImg = p.imageUrl || p.image?.src || p.images?.[0]?.src || (typeof p.image === 'string' ? p.image : null);
  const extraImages =
    !ultraLean && Array.isArray(p.images)
      ? p.images
          .map((img) => (typeof img === 'string' ? img : img?.src))
          .filter(Boolean)
          .slice(0, 4)
          .map((u) => getSizedThumbnailUrl(u, 'large') || u)
      : [];

  return {
    id: String(p.id || `item-${Math.random().toString(36).slice(2, 8)}`),
    title: String(p.title || 'Merch Item').trim(),
    description:
      !ultraLean && p.description
        ? String(p.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260)
        : '',
    product_type: String(p.product_type || p.type || ''),
    vendor: String(p.vendor || ''),
    sourcePlatform: p.sourcePlatform || 'OFFICIAL',
    sourceCurrency: p.sourceCurrency || 'USD',
    isNewDrop: Boolean(p.isNewDrop),
    firstSeenAt: p.firstSeenAt || null,
    storeBaseUrl: p.storeBaseUrl || '',
    productUrl: p.productUrl || '',
    imageUrl: getSizedThumbnailUrl(rawImg, 'medium') || rawImg,
    largeImageUrl: getSizedThumbnailUrl(rawImg, 'xl') || rawImg,
    extraImages,
    tags: ultraLean
      ? []
      : Array.isArray(p.tags)
      ? p.tags.slice(0, 5)
      : typeof p.tags === 'string'
      ? p.tags.split(',').map((t) => t.trim()).slice(0, 5)
      : [],
    variants: (Array.isArray(p.variants) ? p.variants : []).slice(0, ultraLean ? 8 : 14).map((v, i) => ({
      id: String(v.id || `v-${i}`),
      title: String(v.title || v.option1 || 'One Size'),
      price: String(v.price || '25.00').replace(/[^0-9.]/g, '') || '25.00',
      available: v.available !== false
    }))
  };
}

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
// 2. CURRENCY CONVERSION & NORMALIZED PRICING HELPERS
// ==========================================
const REGION_CURRENCY_MAP = {
  UK: { code: 'GBP', symbol: '£' },
  EU: { code: 'EUR', symbol: '€' },
  US: { code: 'USD', symbol: '$' },
  AU: { code: 'AUD', symbol: 'A$' },
  GLOBAL: { code: 'USD', symbol: '$' }
};

const CURRENCY_SYMBOLS = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$'
};

function convertPriceAmount(amount, fromCurrency = 'USD', toCurrency = 'GBP', rates = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.38 }) {
  const num = parseFloat(String(amount || '0').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (fromCurrency === toCurrency) return num;
  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;
  const inUsd = num / fromRate;
  return inUsd * toRate;
}

function formatNormalizedProductPrice(product, preferredRegion = 'UK', rates = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.52 }) {
  const rawPrice = product?.variants?.[0]?.price || '25.00';
  const numPrice = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numPrice) || numPrice <= 0) {
    return { display: '$25.00', normalizedValue: 999999 };
  }

  const srcCur = product?.sourceCurrency || 'USD';
  const srcSym = CURRENCY_SYMBOLS[srcCur] || '$';
  const targetMeta = REGION_CURRENCY_MAP[preferredRegion] || REGION_CURRENCY_MAP.UK;
  const converted = convertPriceAmount(numPrice, srcCur, targetMeta.code, rates);

  if (srcCur === targetMeta.code) {
    return {
      display: `${srcSym}${numPrice.toFixed(2)}`,
      normalizedValue: numPrice
    };
  }

  return {
    display: `${srcSym}${numPrice.toFixed(2)} (~${targetMeta.symbol}${converted.toFixed(2)})`,
    normalizedValue: converted
  };
}

// ==========================================
// 3. CONSTANTS, PRESETS & PLATFORM METADATA
// ==========================================
const PRESET_PLAYLISTS = [
  {
    label: 'Hardcore & Metalcore',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DWXIcbzpLauPS'
  },
  {
    label: 'Modern Post-Punk & Indie',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN'
  },
  {
    label: 'Pop Punk & Emo Classics',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXa9wYJR1oMFq'
  }
];

const SORT_OPTIONS = [
  { id: 'FEATURED', label: 'Featured (Store Mix)' },
  { id: 'NEW_DROPS_FIRST', label: 'New Drops First (Last 7 Days)' },
  { id: 'PRICE_ASC', label: 'Price: Low → High (Converted)' },
  { id: 'PRICE_DESC', label: 'Price: High → Low (Converted)' },
  { id: 'TITLE_ASC', label: 'Product Name: A → Z' },
  { id: 'TITLE_DESC', label: 'Product Name: Z → A' },
  { id: 'BAND_ASC', label: 'Band Name: A → Z' },
  { id: 'SITE_ASC', label: 'Source Website: A → Z' },
  { id: 'POPULARITY_DESC', label: 'Band Popularity (Playlist & Reach)' }
];

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
  { id: 'EVILGREED', name: 'Evil Greed', baseUrl: 'https://evilgreed.net', currency: 'EUR' },
  { id: 'EYESORE', name: 'Eyesore Merch UK', baseUrl: 'https://eyesoremerch.com', currency: 'GBP' },
  { id: 'INDIEMERCH', name: 'IndieMerchstore', baseUrl: 'https://www.indiemerchstore.com', currency: 'USD' },
  { id: 'HOLYMOUNTAIN', name: 'Holy Mountain Printing', baseUrl: 'https://holymountainprinting.com', currency: 'USD' },
  { id: 'COLDCUTS', name: 'Cold Cuts Merch', baseUrl: 'https://www.coldcutsmerch.com', currency: 'USD' },
  { id: 'HELLOMERCH', name: 'Hello Merch', baseUrl: 'https://www.hellomerch.com', currency: 'USD' },
  { id: 'DOWNRIGHT', name: 'Down Right Merch', baseUrl: 'https://downrightmerch.com', currency: 'USD' },
  { id: 'TWENTYFOUR', name: '24Hundred', baseUrl: 'https://24hundred.net', currency: 'AUD' }
];

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

const ACCENT_PALETTES = [
  { rgb: '16, 185, 129', border: 'rgba(16, 185, 129, 0.32)', glow: 'rgba(16, 185, 129, 0.12)' },
  { rgb: '14, 165, 233', border: 'rgba(14, 165, 233, 0.32)', glow: 'rgba(14, 165, 233, 0.12)' },
  { rgb: '168, 85, 247', border: 'rgba(168, 85, 247, 0.32)', glow: 'rgba(168, 85, 247, 0.12)' },
  { rgb: '244, 63, 94', border: 'rgba(244, 63, 94, 0.32)', glow: 'rgba(244, 63, 94, 0.12)' },
  { rgb: '245, 158, 11', border: 'rgba(245, 158, 11, 0.32)', glow: 'rgba(245, 158, 11, 0.12)' },
  { rgb: '20, 184, 166', border: 'rgba(20, 184, 166, 0.32)', glow: 'rgba(20, 184, 166, 0.12)' },
  { rgb: '99, 102, 241', border: 'rgba(99, 102, 241, 0.32)', glow: 'rgba(99, 102, 241, 0.12)' }
];

function getFallbackAccentForName(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTES[hash % ACCENT_PALETTES.length];
}

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
        sourceCurrency: distro.currency || 'USD',
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
          sourceCurrency: 'USD',
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

function deduplicateArtists(list = []) {
  const seenIds = new Set();
  const seenNames = new Set();
  const clean = [];
  for (const item of list) {
    if (!item || !item.name) continue;
    const normName = item.name.toLowerCase().trim();
    const id = item.id || `pl-${normName}`;
    if (seenIds.has(id) || seenNames.has(normName)) continue;
    seenIds.add(id);
    seenNames.add(normName);
    clean.push({ ...item, id });
  }
  return clean;
}

// ==========================================
// 5. MAIN APPLICATION COMPONENT
// ==========================================
export default function App() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);

  // --- Exchange Rates State ---
  const [exchangeRates, setExchangeRates] = useState({
    USD: 1.0,
    GBP: 0.79,
    EUR: 0.92,
    AUD: 1.52,
    CAD: 1.38
  });

  useEffect(() => {
    fetch('/api/rates')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.GBP) setExchangeRates(data);
      })
      .catch(() => {});
  }, []);

  // --- Playlist Import & Artist State ---
  const [spotifyArtists, setSpotifyArtists] = useState(() => {
    try {
      const saved = localStorage.getItem('spotify_merch_cached_artists_v1');
      return saved ? deduplicateArtists(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [importMode, setImportMode] = useState('REPLACE');
  const [loadedPlaylistName, setLoadedPlaylistName] = useState(() => localStorage.getItem('spotify_merch_playlist_name') || '');
  const [activePlaylistUrl, setActivePlaylistUrl] = useState(() => initialParams.get('playlist') || localStorage.getItem('spotify_merch_playlist_url') || '');
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState('');

  // --- View Mode (Band Cards vs Constant Product Stream) & Sorting ---
  const [viewMode, setViewMode] = useState(() => initialParams.get('view') || localStorage.getItem('merchpulse_view_mode') || 'BANDS');
  const [sortBy, setSortBy] = useState(() => initialParams.get('sort') || localStorage.getItem('merchpulse_sort_by') || 'FEATURED');

  // --- Filters & Pagination ---
  const [preferredRegion, setPreferredRegion] = useState(
    () => (initialParams.get('region') || localStorage.getItem('spotify_merch_region') || 'UK').toUpperCase()
  );
  const [storeFilterMode, setStoreFilterMode] = useState('MATCHING_PRODUCTS');
  const [selectedPlatform, setSelectedPlatform] = useState(() => (initialParams.get('site') || 'ALL').toUpperCase());
  const [selectedProductType, setSelectedProductType] = useState(() => (initialParams.get('type') || 'ALL').toUpperCase());
  const [selectedSize, setSelectedSize] = useState(() => (initialParams.get('size') || 'ALL').toUpperCase());
  const [inStockOnly, setInStockOnly] = useState(() => initialParams.get('instock') === '1');
  const [newDropsOnly, setNewDropsOnly] = useState(() => initialParams.get('new') === '1');
  const [thumbnailSize, setThumbnailSize] = useState(() => localStorage.getItem('spotify_merch_thumb_size') || 'medium');
  const [searchQuery, setSearchQuery] = useState(() => initialParams.get('q') || '');
  const [selectedGenre, setSelectedGenre] = useState(() => initialParams.get('genre') || 'ALL');
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [directorySearch, setDirectorySearch] = useState('');
  const [sortActiveFirst, setSortActiveFirst] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const BANDS_PER_PAGE = 15;
  const STREAM_ITEMS_PER_PAGE = 60;

  // --- Per-Band Site Filter Toggles, Expansion & Extracted Dominant Accent Colors ---
  const [bandSiteFilters, setBandSiteFilters] = useState({});
  const [expandedBandCards, setExpandedBandCards] = useState({});
  const [bandAccentColors, setBandAccentColors] = useState({});

  // --- Independent Saved Merch / Wishlist Drawer (Highest Storage Priority) ---
  const [savedMerchItems, setSavedMerchItems] = useState(() => {
    try {
      const raw = localStorage.getItem('merchpulse_saved_wishlist_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((entry) => ({
            ...entry,
            product: slimProductForStorage(entry.product, true)
          }))
        : [];
    } catch {
      return [];
    }
  });
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedWishlistLinks, setCopiedWishlistLinks] = useState(false);

  // --- Out-of-Stock Size Watchers (persisted across sessions) ---
  const [watchedSizes, setWatchedSizes] = useState(() => {
    try {
      const raw = localStorage.getItem('merchpulse_size_watchers_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // --- Product Quick-View Modal & Mobile Filter Drawer ---
  const [quickViewItem, setQuickViewItem] = useState(null);
  const [quickViewActiveImg, setQuickViewActiveImg] = useState(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // --- Scraped Merch Feeds & Metadata ---
  const [liveShopifyFeeds, setLiveShopifyFeeds] = useState(() => {
    try {
      const raw = localStorage.getItem('spotify_merch_live_feeds_v2');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const slimmed = {};
      for (const [id, list] of Object.entries(parsed)) {
        if (Array.isArray(list)) {
          slimmed[id] = list.map((p) => slimProductForStorage(p, false)).filter(Boolean);
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

  // --- Sync Shareable Filters, View Mode & Sort to Browser URL Query Params ---
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (activePlaylistUrl) params.set('playlist', activePlaylistUrl);
      if (viewMode !== 'BANDS') params.set('view', viewMode);
      if (sortBy !== 'FEATURED') params.set('sort', sortBy);
      if (preferredRegion !== 'UK') params.set('region', preferredRegion);
      if (selectedPlatform !== 'ALL') params.set('site', selectedPlatform);
      if (selectedProductType !== 'ALL') params.set('type', selectedProductType);
      if (selectedSize !== 'ALL') params.set('size', selectedSize);
      if (inStockOnly) params.set('instock', '1');
      if (newDropsOnly) params.set('new', '1');
      if (selectedGenre !== 'ALL') params.set('genre', selectedGenre);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const qs = params.toString();
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } catch {}
  }, [activePlaylistUrl, viewMode, sortBy, preferredRegion, selectedPlatform, selectedProductType, selectedSize, inStockOnly, newDropsOnly, selectedGenre, searchQuery]);

  // --- Persist Settings, Wishlist, Size Watchers & Lean Feeds ---
  useEffect(() => {
    safeSetLocalStorage('spotify_merch_region', preferredRegion);
  }, [preferredRegion]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_thumb_size', thumbnailSize);
  }, [thumbnailSize]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_sort_by', sortBy);
  }, [sortBy]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_size_watchers_v1', JSON.stringify(watchedSizes));
  }, [watchedSizes]);

  useEffect(() => {
    const compactWishlist = savedMerchItems.map((entry) => ({
      ...entry,
      product: slimProductForStorage(entry.product, true)
    }));
    safeSetLocalStorage('merchpulse_saved_wishlist_v1', JSON.stringify(compactWishlist), () => {
      localStorage.removeItem('spotify_merch_live_feeds_v2');
      localStorage.removeItem('spotify_merch_discovery_meta_v2');
    });
  }, [savedMerchItems]);

  useEffect(() => {
    const entries = Object.entries(liveShopifyFeeds);
    if (entries.length === 0) return;

    const trimmedObj = Object.fromEntries(entries.slice(-45));
    safeSetLocalStorage('spotify_merch_live_feeds_v2', JSON.stringify(trimmedObj), () => {
      const compactObj = Object.fromEntries(entries.slice(-15));
      try {
        localStorage.setItem('spotify_merch_live_feeds_v2', JSON.stringify(compactObj));
      } catch {
        localStorage.removeItem('spotify_merch_live_feeds_v2');
      }
    });
  }, [liveShopifyFeeds]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_discovery_meta_v2', JSON.stringify(discoveryMeta), () => {
      localStorage.removeItem('spotify_merch_live_feeds_v2');
    });
  }, [discoveryMeta]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_custom_urls_v1', JSON.stringify(customStoreUrls));
  }, [customStoreUrls]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_site_overrides_v1', JSON.stringify(customSiteOverrides));
  }, [customSiteOverrides]);

  // --- Size Watcher Toggle & Restock Detection ---
  const watchedSizeKeySet = useMemo(() => {
    return new Set(watchedSizes.map((w) => w.watchKey));
  }, [watchedSizes]);

  const toggleWatchSize = useCallback((artistName, product, sizeLabel) => {
    const normSize = normalizeSizeToken(sizeLabel) || sizeLabel;
    const watchKey = `${artistName}::${product.sourcePlatform}::${product.title}::${normSize}`;
    setWatchedSizes((prev) => {
      const exists = prev.some((w) => w.watchKey === watchKey);
      if (exists) return prev.filter((w) => w.watchKey !== watchKey);
      return [
        {
          watchKey,
          artistName,
          productTitle: product.title,
          sourcePlatform: product.sourcePlatform,
          productUrl: product.productUrl,
          sizeLabel: normSize,
          createdAt: Date.now()
        },
        ...prev
      ];
    });
  }, []);

  const restockedWatchers = useMemo(() => {
    if (watchedSizes.length === 0) return [];
    const hits = [];
    for (const w of watchedSizes) {
      const artistObj = spotifyArtists.find((a) => a.name.toLowerCase() === w.artistName.toLowerCase());
      if (!artistObj) continue;
      const products = liveShopifyFeeds[artistObj.id] || [];
      const matchedProduct = products.find(
        (p) => p.sourcePlatform === w.sourcePlatform && p.title.toLowerCase() === w.productTitle.toLowerCase()
      );
      if (!matchedProduct) continue;
      const variantNowInStock = (matchedProduct.variants || []).some((v) => {
        const norm = normalizeSizeToken(v.title || v.option1 || '') || v.title;
        return norm === w.sizeLabel && v.available !== false;
      });
      if (variantNowInStock) {
        hits.push({ ...w, product: matchedProduct });
      }
    }
    return hits;
  }, [watchedSizes, spotifyArtists, liveShopifyFeeds]);

  // --- Wishlist Toggle & Management Helpers ---
  const savedProductKeySet = useMemo(() => {
    return new Set(savedMerchItems.map((item) => item.saveKey));
  }, [savedMerchItems]);

  const toggleSaveProduct = useCallback((product, artistName) => {
    const saveKey = `${artistName}::${product.sourcePlatform}::${product.title}`;
    setSavedMerchItems((prev) => {
      const exists = prev.some((i) => i.saveKey === saveKey);
      if (exists) {
        return prev.filter((i) => i.saveKey !== saveKey);
      }
      const snapshot = {
        saveKey,
        artistName,
        savedAt: Date.now(),
        product: slimProductForStorage(product, true)
      };
      return [snapshot, ...prev];
    });
  }, []);

  const handleCopyShareUrl = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  const handleCopyWishlistLinks = () => {
    const text = savedMerchItems
      .map((item) => {
        const priceInfo = formatNormalizedProductPrice(item.product, preferredRegion, exchangeRates);
        return `${item.artistName} - ${item.product.title} (${priceInfo.display}) [${item.product.sourcePlatform}]: ${item.product.productUrl}`;
      })
      .join('\n');
    navigator.clipboard?.writeText(text);
    setCopiedWishlistLinks(true);
    setTimeout(() => setCopiedWishlistLinks(false), 2000);
  };

  // --- Dominant Color Extraction from Artist Portrait Image ---
  const extractDominantColorFromImg = useCallback(
    (artistId, imgElement) => {
      if (!imgElement || bandAccentColors[artistId]) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(imgElement, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 30 && brightness < 235) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
        if (count > 0) {
          const r = Math.min(245, Math.round((rSum / count) * 1.15));
          const g = Math.min(245, Math.round((gSum / count) * 1.15));
          const b = Math.min(245, Math.round((bSum / count) * 1.15));
          setBandAccentColors((prev) => ({
            ...prev,
            [artistId]: {
              rgb: `${r}, ${g}, ${b}`,
              border: `rgba(${r}, ${g}, ${b}, 0.38)`,
              glow: `rgba(${r}, ${g}, ${b}, 0.14)`
            }
          }));
        }
      } catch {}
    },
    [bandAccentColors]
  );

  // ==========================================
  // 6. PUBLIC PLAYLIST URL IMPORTER ("FIND MERCH" / "MERGE")
  // ==========================================
  const importPlaylistFromUrl = useCallback(
    async (targetUrl, mode = 'REPLACE') => {
      const trimmed = (targetUrl || '').trim();
      if (!trimmed) return;

      setIsImportingPlaylist(true);
      setPlaylistError('');

      try {
        const apiUrl = new URL('/api/playlist', window.location.origin);
        apiUrl.searchParams.set('url', trimmed);
        const res = await fetch(apiUrl.toString());
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Could not load playlist. Make sure the Spotify playlist is set to Public.');
        }

        const incomingArtists = deduplicateArtists(Array.isArray(data.artists) ? data.artists : []);
        const pName = data.playlistName || 'Spotify Playlist';

        setSpotifyArtists((prev) => {
          const nextList =
            mode === 'MERGE' && prev.length > 0
              ? deduplicateArtists([...prev, ...incomingArtists]).sort((a, b) => a.name.localeCompare(b.name))
              : incomingArtists;
          safeSetLocalStorage('spotify_merch_cached_artists_v1', JSON.stringify(nextList), () => {
            localStorage.removeItem('spotify_merch_live_feeds_v2');
          });
          return nextList;
        });

        const combinedName =
          mode === 'MERGE' && loadedPlaylistName && spotifyArtists.length > 0
            ? `${loadedPlaylistName} + ${pName}`
            : pName;

        setLoadedPlaylistName(combinedName);
        safeSetLocalStorage('spotify_merch_playlist_name', combinedName);
        setActivePlaylistUrl(trimmed);
        safeSetLocalStorage('spotify_merch_playlist_url', trimmed);

        setSelectedBandId(null);
        setSelectedGenre('ALL');
        setStoreFilterMode('MATCHING_PRODUCTS');
        setAutoScrapeEnabled(true);
        setPlaylistUrl('');
      } catch (err) {
        setPlaylistError(err.message || 'Failed to load playlist.');
      } finally {
        setIsImportingPlaylist(false);
      }
    },
    [loadedPlaylistName, spotifyArtists.length]
  );

  const initialAutoLoadDoneRef = useRef(false);
  useEffect(() => {
    if (initialAutoLoadDoneRef.current) return;
    initialAutoLoadDoneRef.current = true;
    const sharedPlaylistParam = initialParams.get('playlist');
    if (sharedPlaylistParam && spotifyArtists.length === 0) {
      importPlaylistFromUrl(sharedPlaylistParam, 'REPLACE');
    }
  }, [initialParams, spotifyArtists.length, importPlaylistFromUrl]);

  const handleFindMerchSubmit = (e) => {
    if (e) e.preventDefault();
    importPlaylistFromUrl(playlistUrl, importMode);
  };

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
          const payload = await res.json();
          if (Array.isArray(payload.products)) {
            discoveredProducts = payload.products.map((p) => slimProductForStorage(p, false)).filter(Boolean);
          }
          metaPatch = {
            storeUrl: payload.storeUrl || null,
            officialWebsite: payload.officialWebsite || null,
            bandcampUrl: payload.bandcampUrl || null,
            artistImage: payload.artistImage || null,
            regionalStores: payload.regionalStores || {},
            webPresence: payload.webPresence || {},
            verifiedOverrides: payload.verifiedOverrides || {},
            genres: Array.isArray(payload.genres) ? payload.genres : [],
            source: payload.source || 'proxy'
          };
        }
      } catch {
        setProxyOnline((prev) => (prev === true ? true : false));
      }

      if (!proxyReachable && proxyOnline !== true) {
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
            artistImage: metaPatch.artistImage || oldMeta.artistImage || null,
            scanned: true,
            updatedAt: Date.now()
          }
        };
      });

      if ((Array.isArray(metaPatch.genres) && metaPatch.genres.length > 0) || metaPatch.artistImage) {
        setSpotifyArtists((prev) => {
          const updated = prev.map((a) => {
            if (a.id !== artist.id) return a;
            return {
              ...a,
              image: metaPatch.artistImage || a.image || null,
              genres:
                Array.isArray(metaPatch.genres) && metaPatch.genres.length > 0
                  ? metaPatch.genres
                  : a.genres || []
            };
          });
          safeSetLocalStorage('spotify_merch_cached_artists_v1', JSON.stringify(updated), () => {
            localStorage.removeItem('spotify_merch_live_feeds_v2');
          });
          return updated;
        });
      }

      setActivelyScanningIds((prev) => prev.filter((id) => id !== artist.id));
    },
    [preferredRegion, customSiteOverrides, proxyOnline]
  );

  // ==========================================
  // 8. FILTERING, NORMALIZED CURRENCY SORTING & STREAM
  // ==========================================
  const allGenres = useMemo(() => {
    const counts = new Map();
    for (const a of spotifyArtists) {
      for (const g of a.genres || []) {
        const norm = g.toLowerCase().trim();
        if (norm) counts.set(norm, (counts.get(norm) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([name, count]) => ({ name, count }));
  }, [spotifyArtists]);

  const sortProductEntries = useCallback(
    (entries) => {
      if (sortBy === 'FEATURED') return entries;
      const copy = [...entries];
      copy.sort((a, b) => {
        if (sortBy === 'NEW_DROPS_FIRST') {
          const newA = a.product.isNewDrop ? 1 : 0;
          const newB = b.product.isNewDrop ? 1 : 0;
          if (newB !== newA) return newB - newA;
          return (b.product.firstSeenAt || 0) - (a.product.firstSeenAt || 0);
        }
        if (sortBy === 'PRICE_ASC') {
          const valA = formatNormalizedProductPrice(a.product, preferredRegion, exchangeRates).normalizedValue;
          const valB = formatNormalizedProductPrice(b.product, preferredRegion, exchangeRates).normalizedValue;
          return valA - valB;
        }
        if (sortBy === 'PRICE_DESC') {
          const valA = formatNormalizedProductPrice(a.product, preferredRegion, exchangeRates).normalizedValue;
          const valB = formatNormalizedProductPrice(b.product, preferredRegion, exchangeRates).normalizedValue;
          return valB - valA;
        }
        if (sortBy === 'TITLE_ASC') {
          return (a.product.title || '').localeCompare(b.product.title || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'TITLE_DESC') {
          return (b.product.title || '').localeCompare(a.product.title || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'BAND_ASC') {
          return (a.artist.name || '').localeCompare(b.artist.name || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'SITE_ASC') {
          const siteA = getPlatformMeta(a.product.sourcePlatform).label;
          const siteB = getPlatformMeta(b.product.sourcePlatform).label;
          return siteA.localeCompare(siteB, undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'POPULARITY_DESC') {
          const popA = (a.artist.likedTracksCount || 1) * 10 + (a.storeReach || 1);
          const popB = (b.artist.likedTracksCount || 1) * 10 + (b.storeReach || 1);
          if (popB !== popA) return popB - popA;
          return (a.artist.name || '').localeCompare(b.artist.name || '', undefined, { sensitivity: 'base' });
        }
        return 0;
      });
      return copy;
    },
    [sortBy, preferredRegion, exchangeRates]
  );

  const { artistStatsMap, globalPlatformCounts, newDropTotalCount } = useMemo(() => {
    const map = new Map();
    const platTotals = { ALL: 0 };
    let newDropsCount = 0;

    for (const p of SOURCE_PLATFORMS) {
      if (p.id !== 'ALL') platTotals[p.id] = 0;
    }

    for (const artist of spotifyArtists) {
      const rawProducts = liveShopifyFeeds[artist.id] || [];
      const meta = discoveryMeta[artist.id] || {};
      const scanned = Boolean(meta.scanned);

      const typeAndSizeMatched = rawProducts.filter((p) => {
        if (!matchProductType(p, selectedProductType)) return false;
        if (!matchProductSize(p, selectedSize, inStockOnly)) return false;
        if (newDropsOnly && !p.isNewDrop) return false;
        return true;
      });

      const perBandPlatformCounts = {};
      for (const p of typeAndSizeMatched) {
        const plat = p.sourcePlatform || 'OFFICIAL';
        perBandPlatformCounts[plat] = (perBandPlatformCounts[plat] || 0) + 1;
        platTotals[plat] = (platTotals[plat] || 0) + 1;
        platTotals.ALL += 1;
        if (p.isNewDrop) newDropsCount += 1;
      }

      const storeReach = Object.keys(perBandPlatformCounts).length;
      const baseProducts =
        selectedPlatform === 'ALL'
          ? interleaveProductsByPlatform(typeAndSizeMatched)
          : typeAndSizeMatched.filter((p) => p.sourcePlatform === selectedPlatform);

      const matchingProducts =
        sortBy === 'FEATURED'
          ? baseProducts
          : sortProductEntries(baseProducts.map((product) => ({ product, artist, storeReach }))).map((e) => e.product);

      map.set(artist.id, {
        scanned,
        totalProducts: rawProducts.length,
        matchingProducts,
        matchingProductCount: matchingProducts.length,
        perBandPlatformCounts,
        storeReach
      });
    }

    return { artistStatsMap: map, globalPlatformCounts: platTotals, newDropTotalCount: newDropsCount };
  }, [
    spotifyArtists,
    liveShopifyFeeds,
    discoveryMeta,
    selectedPlatform,
    selectedProductType,
    selectedSize,
    inStockOnly,
    newDropsOnly,
    sortBy,
    sortProductEntries
  ]);

  const statusCounts = useMemo(() => {
    let withProducts = 0;
    let noMerch = 0;
    let totalMatchingItems = 0;

    for (const artist of spotifyArtists) {
      const st = artistStatsMap.get(artist.id);
      if (!st) continue;
      totalMatchingItems += st.matchingProductCount;
      if (st.matchingProductCount > 0) withProducts++;
      else if (st.scanned && st.totalProducts === 0) noMerch++;
    }
    return {
      withProducts,
      noMerch,
      totalMatchingItems
    };
  }, [spotifyArtists, artistStatsMap]);

  const filteredArtists = useMemo(() => {
    const list = spotifyArtists.filter((artist) => {
      if (selectedBandId === artist.id) return true;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const bandMatch = artist.name.toLowerCase().includes(q);
        const productMatch = (artistStatsMap.get(artist.id)?.matchingProducts || []).some((p) =>
          (p.title || '').toLowerCase().includes(q)
        );
        if (!bandMatch && !productMatch) return false;
      }
      if (selectedGenre !== 'ALL' && !(artist.genres || []).map((g) => g.toLowerCase()).includes(selectedGenre)) {
        return false;
      }

      const st = artistStatsMap.get(artist.id);
      if (!st) return false;

      if (storeFilterMode === 'NO_MERCH') {
        return st.scanned && st.totalProducts === 0;
      }
      return st.matchingProductCount > 0 || activelyScanningIds.includes(artist.id);
    });

    if (sortBy === 'POPULARITY_DESC') {
      return [...list].sort((a, b) => {
        const popA = (a.likedTracksCount || 1) * 10 + (artistStatsMap.get(a.id)?.storeReach || 0);
        const popB = (b.likedTracksCount || 1) * 10 + (artistStatsMap.get(b.id)?.storeReach || 0);
        if (popB !== popA) return popB - popA;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [
    spotifyArtists,
    selectedBandId,
    searchQuery,
    selectedGenre,
    artistStatsMap,
    storeFilterMode,
    activelyScanningIds,
    sortBy
  ]);

  const flatStreamProducts = useMemo(() => {
    if (viewMode !== 'STREAM') return [];
    const q = searchQuery.trim().toLowerCase();
    const rawEntries = [];

    for (const artist of filteredArtists) {
      const st = artistStatsMap.get(artist.id);
      if (!st || !Array.isArray(st.matchingProducts)) continue;
      for (const product of st.matchingProducts) {
        if (q && !artist.name.toLowerCase().includes(q) && !(product.title || '').toLowerCase().includes(q)) {
          continue;
        }
        rawEntries.push({
          product,
          artist,
          storeReach: st.storeReach || 1
        });
      }
    }

    if (sortBy === 'FEATURED') {
      const byBand = new Map();
      for (const entry of rawEntries) {
        if (!byBand.has(entry.artist.id)) byBand.set(entry.artist.id, []);
        byBand.get(entry.artist.id).push(entry);
      }
      const queues = Array.from(byBand.values());
      const mixed = [];
      let depth = 0;
      let added = true;
      while (added) {
        added = false;
        for (const queue of queues) {
          if (depth < queue.length) {
            mixed.push(queue[depth]);
            added = true;
          }
        }
        depth++;
      }
      return mixed;
    }

    return sortProductEntries(rawEntries);
  }, [viewMode, filteredArtists, artistStatsMap, searchQuery, sortBy, sortProductEntries]);

  const directoryArtists = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    const list = spotifyArtists.filter((a) => !q || a.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sortActiveFirst) {
        const activeA = (artistStatsMap.get(a.id)?.matchingProductCount || 0) > 0;
        const activeB = (artistStatsMap.get(b.id)?.matchingProductCount || 0) > 0;
        if (activeA !== activeB) return activeA ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [spotifyArtists, directorySearch, sortActiveFirst, artistStatsMap]);

  const totalPages = useMemo(() => {
    if (viewMode === 'STREAM') {
      return Math.max(1, Math.ceil(flatStreamProducts.length / STREAM_ITEMS_PER_PAGE));
    }
    return Math.max(1, Math.ceil(filteredArtists.length / BANDS_PER_PAGE));
  }, [viewMode, flatStreamProducts.length, filteredArtists.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, sortBy, storeFilterMode, selectedPlatform, selectedProductType, selectedSize, inStockOnly, newDropsOnly, searchQuery, selectedGenre, selectedBandId]);

  const paginatedArtists = useMemo(() => {
    const start = (currentPage - 1) * BANDS_PER_PAGE;
    return filteredArtists.slice(start, start + BANDS_PER_PAGE);
  }, [filteredArtists, currentPage]);

  const paginatedStreamProducts = useMemo(() => {
    const start = (currentPage - 1) * STREAM_ITEMS_PER_PAGE;
    return flatStreamProducts.slice(start, start + STREAM_ITEMS_PER_PAGE);
  }, [flatStreamProducts, currentPage]);

  // ==========================================
  // 9. PARALLEL TURBO SCRAPER QUEUE
  // ==========================================
  const unscrapedQueue = useMemo(() => {
    return spotifyArtists.filter((a) => !discoveryMeta[a.id]?.scanned && !activelyScanningIds.includes(a.id));
  }, [spotifyArtists, discoveryMeta, activelyScanningIds]);

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
  // 10. BAND LINKS MODAL HANDLERS (PRE-FILLED WITH SHARED VERIFIED OVERRIDES)
  // ==========================================
  const openBandLinksModal = (artist) => {
    const meta = discoveryMeta[artist.id] || {};
    const regStores = meta.regionalStores || {};
    const savedOverrides = customSiteOverrides[artist.id] || {};
    const sharedOverrides = meta.verifiedOverrides || {};
    const bandProducts = liveShopifyFeeds[artist.id] || [];

    const inferredSiteUrls = {};
    for (const field of ALL_EDITABLE_SITE_FIELDS) {
      if (savedOverrides[field.key]) {
        inferredSiteUrls[field.key] = savedOverrides[field.key];
      } else if (sharedOverrides[field.key]) {
        inferredSiteUrls[field.key] = sharedOverrides[field.key];
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
      OFFICIAL:
        savedOverrides.OFFICIAL ||
        sharedOverrides.OFFICIAL ||
        customStoreUrls[artist.id] ||
        meta.storeUrl ||
        inferredSiteUrls.OFFICIAL ||
        '',
      WEBSITE: savedOverrides.WEBSITE || sharedOverrides.WEBSITE || meta.officialWebsite || '',
      BANDCAMP:
        savedOverrides.BANDCAMP ||
        sharedOverrides.BANDCAMP ||
        meta.bandcampUrl ||
        meta.webPresence?.bandcamp ||
        inferredSiteUrls.BANDCAMP ||
        '',
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

  const scannedCount = spotifyArtists.length - unscrapedQueue.length;
  const progressPercent = spotifyArtists.length > 0 ? Math.min(100, Math.round((scannedCount / spotifyArtists.length) * 100)) : 0;
  const activeScanningNames = activelyScanningIds
    .map((id) => spotifyArtists.find((a) => a.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  // Reusable Product Card Renderer
  const renderProductCard = (product, artistName, showBandHeader = false) => {
    const platMeta = getPlatformMeta(product.sourcePlatform);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const priceInfo = formatNormalizedProductPrice(product, preferredRegion, exchangeRates);
    const sizedImgUrl = getSizedThumbnailUrl(
      product.imageUrl || product.image?.src || product.images?.[0]?.src,
      thumbnailSize
    );
    const saveKey = `${artistName}::${product.sourcePlatform}::${product.title}`;
    const isSaved = savedProductKeySet.has(saveKey);

    return (
      <div
        key={`${artistName}-${product.sourcePlatform}-${product.id}-${product.title}`}
        className="group relative bg-zinc-950/85 border border-zinc-800/90 hover:border-emerald-500/50 rounded-xl overflow-hidden flex flex-col justify-between transition-all"
      >
        {/* Top-Right Quick Action Buttons */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuickViewItem({ product, artistName });
              setQuickViewActiveImg(product.largeImageUrl || sizedImgUrl);
            }}
            title="Quick View Product & Size Watchers"
            className="w-7 h-7 rounded-lg bg-zinc-950/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer shadow"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSaveProduct(product, artistName);
            }}
            title={isSaved ? 'Remove from Saved Merch' : 'Save to Wishlist'}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer shadow ${
              isSaved
                ? 'bg-rose-500/25 border-rose-400 text-rose-400 opacity-100'
                : 'bg-zinc-950/90 hover:bg-zinc-800 border-zinc-700/80 text-zinc-300 hover:text-rose-300 opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isSaved ? 'fill-rose-400' : ''}`} />
          </button>
        </div>

        <a
          href={product.productUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex flex-col justify-between"
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

              <div className="absolute top-2 left-2 flex items-center gap-1">
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-950/95 ring-1 ring-black/80 border shadow-md ${platMeta.badgeClass}`}
                >
                  {platMeta.shortLabel}
                </span>
                {product.isNewDrop && (
                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400 text-zinc-950 shadow-md">
                    NEW
                  </span>
                )}
              </div>

              <span className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-950/95 text-emerald-300 border border-zinc-800 shadow">
                {priceInfo.display}
              </span>
            </div>

            <div className="p-2.5 space-y-1">
              {showBandHeader && (
                <div className="text-[11px] font-bold text-emerald-400 truncate">{artistName}</div>
              )}
              <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 line-clamp-2 leading-snug">
                {product.title}
              </h4>
            </div>
          </div>

          {variants.length > 0 && (
            <div className="px-2.5 pb-2.5 flex flex-wrap gap-1">
              {variants.slice(0, 8).map((v) => {
                const norm = normalizeSizeToken(v.title || v.option1 || '');
                const sizeLabel = norm || v.title;
                const isSelectedSize = selectedSize !== 'ALL' && norm === selectedSize;
                const watchKey = `${artistName}::${product.sourcePlatform}::${product.title}::${sizeLabel}`;
                const isWatched = watchedSizeKeySet.has(watchKey);

                return (
                  <span
                    key={v.id || v.title}
                    onClick={(e) => {
                      if (!v.available) {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleWatchSize(artistName, product, sizeLabel);
                      }
                    }}
                    title={
                      !v.available
                        ? isWatched
                          ? 'Watching out-of-stock size (Click to unwatch)'
                          : 'Out of stock — Click to watch for restock'
                        : undefined
                    }
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5 ${
                      !v.available
                        ? isWatched
                          ? 'bg-amber-500/25 text-amber-300 border-amber-400/60 cursor-pointer'
                          : 'bg-zinc-900/40 text-zinc-500 hover:text-amber-300 border-zinc-800/60 line-through cursor-pointer'
                        : isSelectedSize
                        ? 'bg-amber-400 text-zinc-950 border-amber-300 font-bold'
                        : isWatched
                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400 font-bold'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    {sizeLabel}
                    {isWatched && <Bell className="w-2.5 h-2.5 inline" />}
                  </span>
                );
              })}
            </div>
          )}
        </a>
      </div>
    );
  };

  // Reusable Sidebar Filter Content
  const renderSidebarControls = () => (
    <div className="space-y-4">
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
            newDropsOnly ||
            selectedBandId) && (
            <button
              onClick={() => {
                setSelectedPlatform('ALL');
                setSelectedProductType('ALL');
                setSelectedSize('ALL');
                setInStockOnly(false);
                setNewDropsOnly(false);
                setSelectedBandId(null);
              }}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Band Feed Status */}
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
          </div>
        </div>

        {/* New Drops & Stock Quick Toggles */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNewDropsOnly((prev) => !prev)}
            className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer flex items-center justify-between ${
              newDropsOnly
                ? 'bg-emerald-400 text-zinc-950 border-emerald-300 font-bold'
                : 'bg-zinc-950/70 text-zinc-300 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <span>New Drops Only</span>
            <span className="text-[10px] tabular-nums opacity-80">{newDropTotalCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setInStockOnly((prev) => !prev)}
            className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer flex items-center justify-center ${
              inStockOnly
                ? 'bg-amber-400 text-zinc-950 border-amber-300 font-bold'
                : 'bg-zinc-950/70 text-zinc-300 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            In-Stock Only
          </button>
        </div>

        {/* Product Thumbnail Size */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-zinc-400">Product Thumbnail Size (CDN Res)</label>
            <span className="text-[10px] text-emerald-400 font-mono">
              {thumbnailSize === 'compact'
                ? '180px'
                : thumbnailSize === 'medium'
                ? '280px'
                : thumbnailSize === 'large'
                ? '440px'
                : '680px'}
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

        {/* Extended Sizes */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-400">Size (XS–5XL Alias Normalized)</label>
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

        {/* Filter by Site / Retailer */}
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
                onClick={() => {
                  setSelectedBandId(isSelected ? null : band.id);
                  setIsMobileFiltersOpen(false);
                }}
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

      {/* 3. FILTER BY GENRE */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Filter by Genre</h2>
          </div>
          {selectedGenre !== 'ALL' && (
            <button
              onClick={() => setSelectedGenre('ALL')}
              className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {allGenres.length === 0 ? (
          <p className="text-[11px] text-zinc-500">Genres will populate automatically as bands are scanned.</p>
        ) : (
          <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1 pr-1">
            <button
              onClick={() => setSelectedGenre('ALL')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium border cursor-pointer ${
                selectedGenre === 'ALL'
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              All Genres
            </button>
            {allGenres.map((g) => (
              <button
                key={g.name}
                onClick={() => setSelectedGenre(selectedGenre === g.name ? 'ALL' : g.name)}
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
            disabled={paginatedArtists.length === 0}
            className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Scrape Current Page
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 pb-20 lg:pb-6">
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
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 shrink-0">
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
                <p className="text-xs text-zinc-400 hidden xl:block">
                  {loadedPlaylistName && spotifyArtists.length > 0
                    ? `Loaded: ${loadedPlaylistName} (${spotifyArtists.length} bands)`
                    : 'Paste any public Spotify playlist URL to scan 15+ official & indie merch stores'}
                </p>
              </div>
            </div>

            <form onSubmit={handleFindMerchSubmit} className="flex items-center gap-1.5 flex-1 max-w-2xl min-w-[260px]">
              <div className="relative flex-1">
                <Music2 className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="Paste public Spotify playlist link (https://open.spotify.com/playlist/...)"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl pl-9 pr-7 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                />
                {playlistUrl && (
                  <button
                    type="button"
                    onClick={() => setPlaylistUrl('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {spotifyArtists.length > 0 && (
                <div className="hidden sm:flex items-center bg-zinc-900 p-0.5 rounded-xl border border-zinc-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setImportMode('REPLACE')}
                    title="Replace current playlist bands"
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      importMode === 'REPLACE' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('MERGE')}
                    title="Append & merge new playlist bands into current list"
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                      importMode === 'MERGE' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Plus className="w-3 h-3" /> Merge
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={!playlistUrl.trim() || isImportingPlaylist}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-bold text-xs transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 shadow-sm"
              >
                {isImportingPlaylist ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{importMode === 'MERGE' && spotifyArtists.length > 0 ? 'Merge' : 'Find Merch'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyShareUrl}
                title="Copy shareable link with active playlist & filters"
                className="px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedShareLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 hidden sm:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="hidden sm:inline">Share View</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsWishlistOpen(true)}
                title="Open Saved Merch & Size Watchers Drawer"
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-xs font-bold text-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer relative"
              >
                <Heart className={`w-3.5 h-3.5 ${savedMerchItems.length > 0 ? 'fill-rose-400 text-rose-400' : 'text-rose-300'}`} />
                <span className="hidden sm:inline">Saved</span>
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-100 text-[11px] tabular-nums">
                  {savedMerchItems.length}
                </span>
                {restockedWatchers.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-400 text-zinc-950 text-[10px] font-extrabold animate-pulse">
                    +{restockedWatchers.length} In Stock!
                  </span>
                )}
              </button>
            </div>
          </div>

          {playlistError && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-center justify-between gap-2">
              <span>{playlistError}</span>
              <button onClick={() => setPlaylistError('')} className="text-rose-200 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
                      : unscrapedQueue.length === 0 && spotifyArtists.length > 0
                      ? 'bg-emerald-500'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-semibold text-zinc-200 tabular-nums shrink-0">
                  Scraped {scannedCount}/{spotifyArtists.length}
                </span>
                <span className="text-zinc-600 shrink-0">•</span>
                <span className="text-xs text-zinc-400 truncate min-w-0 flex-1">
                  {activelyScanningIds.length > 0
                    ? `Scanning (${activelyScanningIds.length}x): ${activeScanningNames}`
                    : unscrapedQueue.length === 0 && spotifyArtists.length > 0
                    ? `All ${spotifyArtists.length} bands scanned (${statusCounts.totalMatchingItems} matching items)`
                    : spotifyArtists.length === 0
                    ? 'Paste a public Spotify playlist link above or try a preset below'
                    : 'Scraper paused'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-medium text-emerald-400 tabular-nums hidden md:inline">
                  {progressPercent}%
                </span>
                <button
                  onClick={() => setAutoScrapeEnabled((prev) => !prev)}
                  disabled={spotifyArtists.length === 0}
                  className={`w-20 py-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer disabled:opacity-40 ${
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
          MAIN CONTENT GRID
      ========================================== */}
      <main className="max-w-[1600px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 lg:sticky lg:top-28 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto pr-1">
          {renderSidebarControls()}
        </aside>

        {/* RIGHT MAIN FEED */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Restock Alert Banner if any watched out-of-stock sizes came back in stock */}
          {restockedWatchers.length > 0 && (
            <div className="bg-emerald-500/15 border border-emerald-400/50 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-200">
                <BellRing className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Restock Alert!</strong> {restockedWatchers.length} watched item(s) are now back in stock in your size.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsWishlistOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-400 text-zinc-950 font-bold text-xs cursor-pointer"
              >
                View Restocked Items
              </button>
            </div>
          )}

          {/* Search, View Mode Switcher & Sort Bar */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bands or product titles..."
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

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setViewMode('BANDS')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'BANDS'
                      ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>Band Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('STREAM')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'STREAM'
                      ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Product Stream</span>
                </button>
              </div>

              <div className="relative flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400 mr-1.5 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort products"
                  className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer pr-1"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-zinc-900 text-zinc-100">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {selectedBandId && (
                <button
                  onClick={() => setSelectedBandId(null)}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Isolated Band</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {storeFilterMode === 'NO_MERCH' && statusCounts.noMerch > 0 && viewMode === 'BANDS' && (
                <button
                  onClick={() => {
                    for (const band of paginatedArtists) {
                      discoverArtistMerch(band, customStoreUrls[band.id] || null, true);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-Search Page
                </button>
              )}

              <span className="tabular-nums font-medium text-zinc-400 hidden sm:inline">
                {viewMode === 'STREAM'
                  ? `${flatStreamProducts.length} items`
                  : `${filteredArtists.length} bands • ${statusCounts.totalMatchingItems} items`}
              </span>
            </div>
          </div>

          {/* Empty State / Skeleton Loading / Active View */}
          {isImportingPlaylist && spotifyArtists.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((skel) => (
                <div key={skel} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-44 bg-zinc-800 rounded" />
                      <div className="h-3 w-28 bg-zinc-800/70 rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((box) => (
                      <div key={box} className="aspect-square rounded-xl bg-zinc-800/70" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : spotifyArtists.length === 0 ? (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <Music2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h3 className="text-base font-bold text-white">Paste a Spotify Playlist or Try a One-Click Preset</h3>
                <p className="text-xs text-zinc-400">
                  Paste any public Spotify playlist URL into the bar at the top and click{' '}
                  <strong className="text-emerald-300">Find Merch</strong> to automatically scan 15+ official and indie merch
                  stores with live currency conversion and drop tracking.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {PRESET_PLAYLISTS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => importPlaylistFromUrl(preset.url, 'REPLACE')}
                    className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500/50 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : viewMode === 'STREAM' ? (
            paginatedStreamProducts.length === 0 ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">No Products Match Your Active Filters</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  {unscrapedQueue.length > 0
                    ? `Scanning in progress (${scannedCount}/${spotifyArtists.length} bands checked)...`
                    : 'Try resetting your retailer, size, or product type filter in the sidebar.'}
                </p>
              </div>
            ) : (
              <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4">
                <div className={`grid ${productGridColsClass}`}>
                  {paginatedStreamProducts.map((entry) => renderProductCard(entry.product, entry.artist.name, true))}
                </div>
              </div>
            )
          ) : paginatedArtists.length === 0 && unscrapedQueue.length > 0 ? (
            <div className="space-y-4">
              <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  Scanning {spotifyArtists.length} bands across 15+ merch stores ({scannedCount}/{spotifyArtists.length} checked)...
                </span>
              </div>
              {[1, 2, 3].map((skel) => (
                <div key={skel} className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 space-y-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-48 bg-zinc-800 rounded" />
                      <div className="h-3 w-32 bg-zinc-800/60 rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((box) => (
                      <div key={box} className="aspect-square rounded-xl bg-zinc-800/60" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : paginatedArtists.length === 0 ? (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">No Bands Match Your Current Filter View</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Try switching the Band Feed Status in the sidebar to "No Merch Found", or relax your genre, size, or product type filter.
              </p>
            </div>
          ) : (
            /* ARTIST BAND CARDS LIST */
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

                const hasSharedVerifiedLinks =
                  meta.verifiedOverrides && Object.keys(meta.verifiedOverrides).length > 0;

                const bandPhoto = artist.image || meta.artistImage || null;
                const accent = bandAccentColors[artist.id] || getFallbackAccentForName(artist.name);

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
                    style={{
                      borderColor: accent.border,
                      boxShadow: `0 12px 32px -12px ${accent.glow}`
                    }}
                    className="relative bg-zinc-900/90 border rounded-2xl overflow-hidden transition-colors"
                  >
                    {bandPhoto && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                        <img
                          src={bandPhoto}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-center scale-125 blur-2xl opacity-30 saturate-150"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95" />
                      </div>
                    )}

                    <div
                      style={{ borderBottomColor: accent.border }}
                      className="relative z-10 px-4 py-3.5 bg-zinc-950/45 backdrop-blur-md border-b flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {bandPhoto ? (
                          <img
                            src={bandPhoto}
                            alt={artist.name}
                            crossOrigin="anonymous"
                            onLoad={(e) => extractDominantColorFromImg(artist.id, e.currentTarget)}
                            loading="lazy"
                            decoding="async"
                            style={{ borderColor: accent.border }}
                            className="w-12 h-12 rounded-xl object-cover border shadow-md shrink-0"
                          />
                        ) : (
                          <div
                            style={{ borderColor: accent.border, color: `rgb(${accent.rgb})` }}
                            className="w-12 h-12 rounded-xl bg-zinc-800/90 border flex items-center justify-center font-bold text-base shrink-0"
                          >
                            {artist.name[0]}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-bold text-white truncate mr-1">{artist.name}</h3>

                            {hasSharedVerifiedLinks && (
                              <span
                                title="Includes community-verified store link(s)"
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 flex items-center gap-0.5"
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" /> Verified Links
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setBandSiteFilters((prev) => ({
                                  ...prev,
                                  [artist.id]: 'ALL'
                                }))
                              }
                              title="Show all stores for this band"
                              style={
                                activeBandSite === 'ALL'
                                  ? {
                                      backgroundColor: `rgba(${accent.rgb}, 0.18)`,
                                      borderColor: `rgba(${accent.rgb}, 0.45)`,
                                      color: `rgb(${accent.rgb})`
                                    }
                                  : undefined
                              }
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all tabular-nums cursor-pointer ${
                                activeBandSite === 'ALL'
                                  ? ''
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
                          title="Edit All 15 Merch Site Links (Verified edits are shared automatically)"
                          className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/80 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="relative z-10 p-4 space-y-3">
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
                            {visibleProducts.map((product) => renderProductCard(product, artist.name, false))}
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
          STICKY MOBILE FILTER & DIRECTORY BAR (<1024px)
      ========================================== */}
      <div className="lg:hidden fixed bottom-3 left-4 right-4 z-30 flex items-center justify-center gap-2 pointer-events-none">
        <button
          type="button"
          onClick={() => setIsMobileFiltersOpen(true)}
          className="pointer-events-auto px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-2xl shadow-black flex items-center gap-2 border border-emerald-300"
        >
          <Filter className="w-4 h-4 stroke-[2.5]" />
          <span>Filters & Band Directory</span>
          {(selectedPlatform !== 'ALL' || selectedProductType !== 'ALL' || selectedSize !== 'ALL' || selectedGenre !== 'ALL' || newDropsOnly) && (
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-950 text-emerald-400 text-[10px]">Active</span>
          )}
        </button>
      </div>

      {/* MOBILE SLIDE-UP FILTER DRAWER */}
      {isMobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-zinc-950 border-t border-zinc-800 rounded-t-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Filters & Band Directory</span>
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="p-1.5 rounded-xl bg-zinc-900 text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">{renderSidebarControls()}</div>
          </div>
        </div>
      )}

      {/* ==========================================
          SLIDE-OUT SAVED MERCH & SIZE WATCHERS DRAWER
      ========================================== */}
      {isWishlistOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end">
          <div className="bg-zinc-950 border-l border-zinc-800 w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-rose-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Saved Merch & Size Watchers</h3>
                  <p className="text-[11px] text-zinc-400">Protected storage — persists across playlist changes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWishlistOpen(false)}
                className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {savedMerchItems.length > 0 && (
              <div className="px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyWishlistLinks}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedWishlistLinks ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Copied All Links!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Links</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSavedMerchItems([])}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Saved</span>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Watched Out-of-Stock Sizes Section */}
              {watchedSizes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5" /> Size Restock Watchers ({watchedSizes.length})
                    </h4>
                  </div>
                  <div className="space-y-1.5">
                    {watchedSizes.map((w) => {
                      const isNowInStock = restockedWatchers.some((r) => r.watchKey === w.watchKey);
                      return (
                        <div
                          key={w.watchKey}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            isNowInStock
                              ? 'bg-emerald-500/15 border-emerald-400/60'
                              : 'bg-zinc-900/70 border-zinc-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white truncate">{w.artistName}</span>
                              <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold text-[10px]">
                                Size {w.sizeLabel}
                              </span>
                              {isNowInStock && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-400 text-zinc-950 font-extrabold text-[9px]">
                                  IN STOCK!
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">{w.productTitle}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={w.productUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-zinc-200"
                            >
                              Check
                            </a>
                            <button
                              type="button"
                              onClick={() => setWatchedSizes((prev) => prev.filter((x) => x.watchKey !== w.watchKey))}
                              className="p-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-rose-300 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Saved Wishlist Items Section */}
              <div className="space-y-2.5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Saved Items ({savedMerchItems.length})
                </h4>

                {savedMerchItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <Heart className="w-8 h-8 text-zinc-700 mx-auto" />
                    <p className="text-xs font-semibold text-zinc-300">Your Saved Merch list is empty</p>
                    <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                      Click the heart icon on any shirt, hoodie, or vinyl thumbnail to save it here for cross-store price comparison.
                    </p>
                  </div>
                ) : (
                  savedMerchItems.map((entry) => {
                    const p = entry.product;
                    const platMeta = getPlatformMeta(p.sourcePlatform);
                    const priceInfo = formatNormalizedProductPrice(p, preferredRegion, exchangeRates);
                    return (
                      <div
                        key={entry.saveKey}
                        className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2.5 flex items-center gap-3"
                      >
                        <div className="w-16 h-16 rounded-lg bg-zinc-950 overflow-hidden shrink-0 border border-zinc-800">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                              <Shirt className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-emerald-400 truncate">{entry.artistName}</span>
                            <span
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border bg-zinc-950 ${platMeta.badgeClass}`}
                            >
                              {platMeta.shortLabel}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-zinc-200 line-clamp-1">{p.title}</p>
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[11px] font-bold text-white">{priceInfo.display}</span>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={p.productUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-[11px] flex items-center gap-1"
                              >
                                <span>Buy</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  setSavedMerchItems((prev) => prev.filter((item) => item.saveKey !== entry.saveKey))
                                }
                                title="Remove saved item"
                                className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-300 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          PRODUCT QUICK-VIEW MODAL (WITH SIZE WATCHERS)
      ========================================== */}
      {quickViewItem && (
        <div
          onClick={() => setQuickViewItem(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-2"
          >
            <div className="bg-zinc-950 p-4 flex flex-col justify-between gap-3">
              <div className="aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                {quickViewActiveImg ? (
                  <img
                    src={quickViewActiveImg}
                    alt={quickViewItem.product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700">
                    <Shirt className="w-12 h-12" />
                  </div>
                )}
              </div>

              {Array.isArray(quickViewItem.product.extraImages) && quickViewItem.product.extraImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {quickViewItem.product.extraImages.map((imgUrl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setQuickViewActiveImg(imgUrl)}
                      className={`w-14 h-14 rounded-lg overflow-hidden border shrink-0 cursor-pointer ${
                        quickViewActiveImg === imgUrl ? 'border-emerald-400' : 'border-zinc-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-emerald-400">{quickViewItem.artistName}</span>
                    <h3 className="text-base font-bold text-white leading-snug mt-0.5">{quickViewItem.product.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickViewItem(null)}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-zinc-950 ${
                      getPlatformMeta(quickViewItem.product.sourcePlatform).badgeClass
                    }`}
                  >
                    {getPlatformMeta(quickViewItem.product.sourcePlatform).label}
                  </span>
                  {quickViewItem.product.isNewDrop && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-400 text-zinc-950">
                      NEW DROP
                    </span>
                  )}
                  <span className="text-base font-extrabold text-emerald-300">
                    {formatNormalizedProductPrice(quickViewItem.product, preferredRegion, exchangeRates).display}
                  </span>
                </div>

                {quickViewItem.product.description && (
                  <p className="text-xs text-zinc-400 leading-relaxed max-h-24 overflow-y-auto">
                    {quickViewItem.product.description}
                  </p>
                )}

                {Array.isArray(quickViewItem.product.variants) && quickViewItem.product.variants.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400">
                      Sizes (Click any sold-out size to watch for restock)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {quickViewItem.product.variants.map((v) => {
                        const norm = normalizeSizeToken(v.title || v.option1 || '') || v.title;
                        const watchKey = `${quickViewItem.artistName}::${quickViewItem.product.sourcePlatform}::${quickViewItem.product.title}::${norm}`;
                        const isWatched = watchedSizeKeySet.has(watchKey);
                        return (
                          <button
                            key={v.id || v.title}
                            type="button"
                            onClick={() => {
                              if (!v.available) {
                                toggleWatchSize(quickViewItem.artistName, quickViewItem.product, norm);
                              }
                            }}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${
                              !v.available
                                ? isWatched
                                  ? 'bg-amber-500/25 text-amber-300 border-amber-400 cursor-pointer'
                                  : 'bg-zinc-950/50 text-zinc-500 hover:text-amber-300 border-zinc-800 line-through cursor-pointer'
                                : 'bg-zinc-950 text-zinc-200 border-zinc-700'
                            }`}
                          >
                            <span>{norm}</span>
                            {!v.available && <Bell className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => toggleSaveProduct(quickViewItem.product, quickViewItem.artistName)}
                  className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      savedProductKeySet.has(
                        `${quickViewItem.artistName}::${quickViewItem.product.sourcePlatform}::${quickViewItem.product.title}`
                      )
                        ? 'fill-rose-400 text-rose-400'
                        : ''
                    }`}
                  />
                  <span>Save</span>
                </button>

                <a
                  href={quickViewItem.product.productUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <span>Open on Store</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: BAND LINKS EDITOR (SHARED VERIFIED OVERRIDES)
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
                  Links that scrape valid products are automatically promoted as shared verified links for all visitors.
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
    </div>
  );
}
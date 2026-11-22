import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  ExternalLink,
  ShoppingBag,
  Music,
  Sparkles,
  Check,
  X,
  RefreshCw,
  Tag,
  Globe,
  Layers,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  SlidersHorizontal,
  Edit3,
  Lock,
  AlertTriangle,
  Heart,
  Share2,
  Eye,
  LayoutGrid,
  List,
  ArrowUpDown,
  Bell,
  BellRing,
  ListPlus,
  Disc,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// ==========================================
// 1. PLATFORM & FILTER CONSTANTS
// ==========================================
const PLATFORMS = [
  { id: 'ALL', label: 'All Sites', badgeClass: 'bg-emerald-500 text-zinc-950', pillActive: 'bg-emerald-500 text-zinc-950 border-emerald-400', textClass: 'text-emerald-400' },
  { id: 'OFFICIAL', label: 'Official Store', badgeClass: 'bg-emerald-400 text-zinc-950', pillActive: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60', textClass: 'text-emerald-400' },
  { id: 'BANDCAMP', label: 'Bandcamp', badgeClass: 'bg-cyan-400 text-zinc-950', pillActive: 'bg-cyan-500/25 text-cyan-300 border-cyan-500/60', textClass: 'text-cyan-400' },
  { id: 'BIGCARTEL', label: 'BigCartel', badgeClass: 'bg-teal-400 text-zinc-950', pillActive: 'bg-teal-500/25 text-teal-300 border-teal-500/60', textClass: 'text-teal-400' },
  { id: 'AMAZON', label: 'Amazon', badgeClass: 'bg-amber-400 text-zinc-950', pillActive: 'bg-amber-500/25 text-amber-300 border-amber-500/60', textClass: 'text-amber-400' },
  { id: 'EYESORE', label: 'Eyesore Merch', badgeClass: 'bg-lime-400 text-zinc-950', pillActive: 'bg-lime-500/25 text-lime-300 border-lime-500/60', textClass: 'text-lime-400' },
  { id: 'MERCHBAR', label: 'Merchbar', badgeClass: 'bg-sky-400 text-zinc-950', pillActive: 'bg-sky-500/25 text-sky-300 border-sky-500/60', textClass: 'text-sky-400' },
  { id: 'EVILGREED', label: 'Evil Greed', badgeClass: 'bg-red-400 text-zinc-950', pillActive: 'bg-red-500/25 text-red-300 border-red-500/60', textClass: 'text-red-400' },
  { id: 'IMPERICON', label: 'Impericon', badgeClass: 'bg-amber-300 text-zinc-950', pillActive: 'bg-amber-400/25 text-amber-200 border-amber-400/60', textClass: 'text-amber-300' },
  { id: 'INDIEMERCH', label: 'IndieMerch', badgeClass: 'bg-purple-400 text-zinc-950', pillActive: 'bg-purple-500/25 text-purple-300 border-purple-500/60', textClass: 'text-purple-400' },
  { id: 'HOLYMOUNTAIN', label: 'Holy Mountain', badgeClass: 'bg-orange-400 text-zinc-950', pillActive: 'bg-orange-500/25 text-orange-300 border-orange-500/60', textClass: 'text-orange-400' },
  { id: 'COLDCUTS', label: 'Cold Cuts', badgeClass: 'bg-indigo-400 text-zinc-950', pillActive: 'bg-indigo-500/25 text-indigo-300 border-indigo-500/60', textClass: 'text-indigo-400' },
  { id: 'HELLOMERCH', label: 'Hello Merch', badgeClass: 'bg-pink-400 text-zinc-950', pillActive: 'bg-pink-500/25 text-pink-300 border-pink-500/60', textClass: 'text-pink-400' },
  { id: 'DOWNRIGHT', label: 'Down Right', badgeClass: 'bg-rose-400 text-zinc-950', pillActive: 'bg-rose-500/25 text-rose-300 border-rose-500/60', textClass: 'text-rose-400' },
  { id: 'TWENTYFOUR', label: '24Hundred', badgeClass: 'bg-violet-400 text-zinc-950', pillActive: 'bg-violet-500/25 text-violet-300 border-violet-500/60', textClass: 'text-violet-400' },
  { id: 'KINGSROAD', label: 'Kings Road', badgeClass: 'bg-yellow-400 text-zinc-950', pillActive: 'bg-yellow-500/25 text-yellow-300 border-yellow-500/60', textClass: 'text-yellow-400' }
];

const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

const SITE_OVERRIDE_FIELDS = [
  { key: 'OFFICIAL', label: 'Official Store URL', placeholder: 'https://store.bandname.com' },
  { key: 'BANDCAMP', label: 'Bandcamp Merch URL', placeholder: 'https://bandname.bandcamp.com/merch' },
  { key: 'BIGCARTEL', label: 'BigCartel URL', placeholder: 'https://bandname.bigcartel.com' },
  { key: 'AMAZON', label: 'Amazon Store / Search URL', placeholder: 'https://www.amazon.co.uk/s?k=...' },
  { key: 'EYESORE', label: 'Eyesore Merch URL', placeholder: 'https://eyesoremerch.com/collections/...' },
  { key: 'MERCHBAR', label: 'Merchbar URL', placeholder: 'https://www.merchbar.com/...' },
  { key: 'EVILGREED', label: 'Evil Greed URL', placeholder: 'https://evilgreed.net/collections/...' },
  { key: 'IMPERICON', label: 'Impericon URL', placeholder: 'https://www.impericon.com/uk/...' },
  { key: 'INDIEMERCH', label: 'IndieMerchstore URL', placeholder: 'https://www.indiemerchstore.com/collections/...' },
  { key: 'HOLYMOUNTAIN', label: 'Holy Mountain Printing URL', placeholder: 'https://holymountainprinting.com/collections/...' },
  { key: 'COLDCUTS', label: 'Cold Cuts Merch URL', placeholder: 'https://www.coldcutsmerch.com/collections/...' },
  { key: 'HELLOMERCH', label: 'Hello Merch URL', placeholder: 'https://www.hellomerch.com/collections/...' },
  { key: 'DOWNRIGHT', label: 'Down Right Merch URL', placeholder: 'https://downrightmerch.com/collections/...' },
  { key: 'TWENTYFOUR', label: '24Hundred URL', placeholder: 'https://24hundred.net/collections/...' },
  { key: 'KINGSROAD', label: 'Kings Road Merch URL', placeholder: 'https://eu.kingsroadmerch.com/...' }
];

const PRODUCT_TYPES = [
  { id: 'ALL', label: 'All Types', keywords: null },
  { id: 'TSHIRT', label: 'T-Shirts', keywords: ['shirt', 'tee', 't-shirt', 'top', 'ringer'] },
  { id: 'HOODIE', label: 'Hoodies & Sweats', keywords: ['hoodie', 'sweatshirt', 'crewneck', 'pullover', 'zip', 'fleece', 'jacket'] },
  { id: 'LONGSLEEVE', label: 'Longsleeves', keywords: ['longsleeve', 'long sleeve', 'l/s'] },
  { id: 'VINYL', label: 'Vinyl & Media', keywords: ['vinyl', 'lp', '12"', '7"', 'cd', 'cassette', 'tape', 'record'] },
  { id: 'HEADWEAR', label: 'Hats & Beanies', keywords: ['hat', 'cap', 'beanie', 'snapback', 'bucket'] },
  { id: 'ACCESSORIES', label: 'Patches & Misc', keywords: ['patch', 'pin', 'flag', 'poster', 'tote', 'bag', 'mug', 'keychain', 'sticker'] }
];

const SIZES = ['ALL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'YOUTH'];

const CURRENCY_CONFIG = {
  GBP: { symbol: '£', label: 'GBP (£)', rateToGBP: 1 },
  USD: { symbol: '$', label: 'USD ($)', rateToGBP: 0.79 },
  EUR: { symbol: '€', label: 'EUR (€)', rateToGBP: 0.85 },
  AUD: { symbol: 'A$', label: 'AUD (A$)', rateToGBP: 0.51 }
};

const REGION_TO_CURRENCY = {
  UK: 'GBP',
  US: 'USD',
  EU: 'EUR',
  AU: 'AUD'
};

const PRESET_PLAYLISTS = [
  { label: 'UK Hardcore & Punk', url: 'https://open.spotify.com/playlist/37i9dQZF1DX12YIlzNkccL' },
  { label: 'Modern Metalcore', url: 'https://open.spotify.com/playlist/37i9dQZF1DWXIcbzpLauPS' },
  { label: 'Indie & Post-Punk', url: 'https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN' }
];

const CHART_PRESETS = [
  { label: 'Global Top 50', tag: '' },
  { label: 'Hardcore', tag: 'hardcore' },
  { label: 'Metalcore', tag: 'metalcore' },
  { label: 'Post-Punk', tag: 'post-punk' },
  { label: 'Indie Rock', tag: 'indie rock' },
  { label: 'Doom / Sludge', tag: 'doom metal' },
  { label: 'Shoegaze', tag: 'shoegaze' },
  { label: 'Emo', tag: 'emo' }
];

const DEFAULT_STARTER_BANDS = [
  {
    id: 'starter-deafheaven',
    name: 'Deafheaven',
    image: null,
    genres: ['blackgaze', 'post-metal', 'shoegaze'],
    spotifyUrl: 'https://open.spotify.com/search/Deafheaven',
    trackCount: 3
  },
  {
    id: 'starter-turnstile',
    name: 'Turnstile',
    image: null,
    genres: ['hardcore punk', 'alternative rock'],
    spotifyUrl: 'https://open.spotify.com/search/Turnstile',
    trackCount: 4
  },
  {
    id: 'starter-knocked-loose',
    name: 'Knocked Loose',
    image: null,
    genres: ['metalcore', 'hardcore'],
    spotifyUrl: 'https://open.spotify.com/search/Knocked%20Loose',
    trackCount: 2
  }
];

const SORT_OPTIONS = [
  { id: 'FEATURED', label: 'Featured (Store Mix)' },
  { id: 'PRICE_ASC', label: 'Price: Low → High' },
  { id: 'PRICE_DESC', label: 'Price: High → Low' },
  { id: 'TITLE_ASC', label: 'Product Name: A → Z' },
  { id: 'TITLE_DESC', label: 'Product Name: Z → A' },
  { id: 'BAND_ASC', label: 'Band Name: A → Z' },
  { id: 'PLATFORM_ASC', label: 'Source Website' },
  { id: 'POPULARITY_DESC', label: 'Band Popularity' }
];

const LIMITED_KEYWORDS_REGEX =
  /\b(limited|tour|exclusive|splatter|marble|marbled|hand[- ]numbered|numbered|pre[- ]?order|variant|deluxe|collectors?|collector's|special edition|one[- ]time|first press|1st press)\b|\/\s?(?:50|100|150|200|250|300|500|1000)\b/i;

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function isLimitedOrTourEdition(product) {
  if (!product) return false;
  const haystack = `${product.title || ''} ${product.product_type || ''} ${(product.tags || []).join(' ')}`;
  return LIMITED_KEYWORDS_REGEX.test(haystack);
}

function deduplicateArtists(list = []) {
  const seenIds = new Set();
  const seenNames = new Set();
  const out = [];
  for (const item of list) {
    if (!item || !item.name) continue;
    const normName = String(item.name).trim().toLowerCase();
    const id = String(item.id || `band-${normName}`);
    if (seenIds.has(id) || seenNames.has(normName)) continue;
    seenIds.add(id);
    seenNames.add(normName);
    out.push({
      ...item,
      id,
      name: String(item.name).trim()
    });
  }
  return out;
}

function slimProductForStorage(p, ultraLean = false) {
  if (!p) return null;
  const base = {
    id: p.id,
    title: p.title,
    product_type: p.product_type || 'Merch',
    vendor: p.vendor || '',
    sourcePlatform: p.sourcePlatform || 'OFFICIAL',
    storeBaseUrl: p.storeBaseUrl || '',
    productUrl: p.productUrl || p.storeBaseUrl || '',
    imageUrl: p.imageUrl || p.images?.[0]?.src || null,
    currency: p.currency || null,
    firstSeenAt: p.firstSeenAt || null,
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
    variants: Array.isArray(p.variants)
      ? p.variants.slice(0, 12).map((v) => ({
          id: v.id,
          title: v.title || v.option1 || 'One Size',
          price: v.price || '25.00',
          available: v.available !== false
        }))
      : []
  };
  if (!ultraLean) {
    base.description = p.description || p.body_html || '';
  }
  return base;
}

function safeSetLocalStorage(key, valueStr) {
  try {
    localStorage.setItem(key, valueStr);
    return true;
  } catch {
    try {
      localStorage.removeItem('spotify_merch_live_feeds_v2');
      localStorage.setItem(key, valueStr);
      return true;
    } catch {
      return false;
    }
  }
}

function normalizeSizeToken(rawSize = '') {
  const s = String(rawSize).toUpperCase().trim();
  if (!s) return null;
  if (/\b(YOUTH|KIDS|CHILD|JUNIOR|YTH|YS|YM|YL)\b/.test(s)) return 'YOUTH';
  if (/\b(5XL|XXXXXL|5X-LARGE|5X)\b/.test(s)) return '5XL';
  if (/\b(4XL|XXXXL|4X-LARGE|4X)\b/.test(s)) return '4XL';
  if (/\b(3XL|XXXL|TRIPLE\sXL|3X-LARGE|3X)\b/.test(s)) return '3XL';
  if (/\b(2XL|XXL|DOUBLE\sXL|2X-LARGE|2X)\b/.test(s)) return '2XL';
  if (/\b(XL|X-LARGE|EXTRA\sLARGE)\b/.test(s)) return 'XL';
  if (/\b(XS|X-SMALL|EXTRA\sSMALL)\b/.test(s)) return 'XS';
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

function inferSourceCurrency(product) {
  if (product.currency && CURRENCY_CONFIG[product.currency]) return product.currency;
  const url = `${product.productUrl || ''} ${product.storeBaseUrl || ''}`.toLowerCase();
  if (url.includes('.co.uk') || url.includes('/uk') || url.includes('eyesoremerch')) return 'GBP';
  if (url.includes('.com.au') || url.includes('24hundred')) return 'AUD';
  if (url.includes('.de') || url.includes('.eu') || url.includes('evilgreed')) return 'EUR';
  return 'USD';
}

function interleaveProductsByPlatform(products = []) {
  if (products.length <= 1) return products;
  const buckets = new Map();
  for (const p of products) {
    const key = p.sourcePlatform || 'OFFICIAL';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  const queues = Array.from(buckets.values());
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const q of queues) {
      if (q.length > 0) {
        out.push(q.shift());
        added = true;
      }
    }
  }
  return out;
}

function mergeProductArrays(existing = [], incoming = []) {
  const map = new Map();
  for (const p of existing) {
    if (!p) continue;
    const key = `${p.sourcePlatform || 'OFFICIAL'}::${(p.productUrl || p.title || '').toLowerCase()}`;
    map.set(key, p);
  }
  for (const p of incoming) {
    if (!p) continue;
    const key = `${p.sourcePlatform || 'OFFICIAL'}::${(p.productUrl || p.title || '').toLowerCase()}`;
    const prev = map.get(key);
    map.set(key, {
      ...prev,
      ...p,
      firstSeenAt: prev?.firstSeenAt || p.firstSeenAt || Date.now()
    });
  }
  return Array.from(map.values());
}

// ==========================================
// 3. MAIN APPLICATION COMPONENT
// ==========================================
export default function App() {
  // --- Input Source Mode: 'SPOTIFY' | 'LASTFM' | 'CHARTS' | 'BANDLIST' ---
  const [sourceTab, setSourceTab] = useState('SPOTIFY');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [lastfmUser, setLastfmUser] = useState('');
  const [lastfmPeriod, setLastfmPeriod] = useState('6month');
  const [chartGenre, setChartGenre] = useState('');
  const [customBandText, setCustomBandText] = useState('');
  const [importMode, setImportMode] = useState('MERGE'); // 'MERGE' | 'REPLACE'
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [loadedSourceLabel, setLoadedSourceLabel] = useState(
    () => localStorage.getItem('merchpulse_source_label') || 'Starter Bands (3 bands)'
  );

  // --- Artist Library State ---
  const [artists, setArtists] = useState(() => {
    try {
      const saved = localStorage.getItem('merchpulse_artists_v3');
      if (saved) {
        const parsed = deduplicateArtists(JSON.parse(saved));
        if (parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_STARTER_BANDS;
  });

  // --- Filters, Region, Currency & View Mode ---
  const [preferredRegion, setPreferredRegion] = useState(() => localStorage.getItem('spotify_merch_region') || 'UK');
  const [currency, setCurrency] = useState(() => localStorage.getItem('merchpulse_currency') || 'GBP');
  const [fxRatesToGBP, setFxRatesToGBP] = useState({
    GBP: 1,
    USD: 0.79,
    EUR: 0.85,
    AUD: 0.51
  });

  const [viewMode, setViewMode] = useState('BAND_CARDS'); // 'BAND_CARDS' | 'STREAM'
  const [sortBy, setSortBy] = useState('FEATURED');
  const [storeFilterMode, setStoreFilterMode] = useState('MATCHING_PRODUCTS'); // 'MATCHING_PRODUCTS' | 'NO_MERCH'
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [selectedProductType, setSelectedProductType] = useState('ALL');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [newDropsOnly, setNewDropsOnly] = useState(false);
  const [limitedOnly, setLimitedOnly] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(() => localStorage.getItem('spotify_merch_thumb_size') || 'medium');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [selectedBandId, setSelectedBandId] = useState(null);
  const [directorySearch, setDirectorySearch] = useState('');
  const [sortActiveFirst, setSortActiveFirst] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const BANDS_PER_PAGE = 15;
  const STREAM_ITEMS_PER_PAGE = 60;

  // --- Per-Band Site Filter Toggles & Expanded Cards ---
  const [bandSiteFilters, setBandSiteFilters] = useState({});
  const [expandedBandCards, setExpandedBandCards] = useState({});

  // --- Saved Wishlist & Restock Watchers ---
  const [savedItems, setSavedItems] = useState(() => {
    try {
      const raw = localStorage.getItem('merchpulse_saved_wishlist_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [restockWatches, setRestockWatches] = useState(() => {
    try {
      const raw = localStorage.getItem('merchpulse_watches_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

  // --- Scraped Merch Feeds & Metadata ---
  const [liveShopifyFeeds, setLiveShopifyFeeds] = useState(() => {
    try {
      const raw = localStorage.getItem('spotify_merch_live_feeds_v2');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const slimmed = {};
      for (const [id, list] of Object.entries(parsed)) {
        if (Array.isArray(list)) {
          slimmed[id] = list.map((p) => slimProductForStorage(p)).filter(Boolean);
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

  // --- Band Links Editor Modal ---
  const [editingArtist, setEditingArtist] = useState(null);
  const [linkForm, setLinkForm] = useState({});
  const [unlockedFields, setUnlockedFields] = useState({});
  const [unlockWarningField, setUnlockWarningField] = useState(null);

  // --- Fetch Live Exchange Rates ---
  useEffect(() => {
    let cancelled = false;
    fetch('https://api.frankfurter.app/latest?from=GBP&to=USD,EUR,AUD')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.rates) return;
        setFxRatesToGBP({
          GBP: 1,
          USD: data.rates.USD ? 1 / data.rates.USD : 0.79,
          EUR: data.rates.EUR ? 1 / data.rates.EUR : 0.85,
          AUD: data.rates.AUD ? 1 / data.rates.AUD : 0.51
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Hydrate Filters from URL Query Params on First Load ---
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qRegion = params.get('region');
      const qPlatform = params.get('site');
      const qType = params.get('type');
      const qSize = params.get('size');
      const qStock = params.get('stock');
      const qLimited = params.get('limited');
      const qGenre = params.get('genre');
      const qSearch = params.get('q');
      const qView = params.get('view');
      if (qRegion && REGION_TO_CURRENCY[qRegion]) {
        setPreferredRegion(qRegion);
        setCurrency(REGION_TO_CURRENCY[qRegion]);
      }
      if (qPlatform && PLATFORM_MAP[qPlatform]) setSelectedPlatform(qPlatform);
      if (qType) setSelectedProductType(qType);
      if (qSize && SIZES.includes(qSize)) setSelectedSize(qSize);
      if (qStock === '1') setInStockOnly(true);
      if (qLimited === '1') setLimitedOnly(true);
      if (qGenre) setSelectedGenre(qGenre);
      if (qSearch) setSearchQuery(qSearch);
      if (qView === 'STREAM' || qView === 'BAND_CARDS') setViewMode(qView);
    } catch {}
  }, []);

  // --- Sync Filters to URL Query Params ---
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (preferredRegion !== 'UK') params.set('region', preferredRegion);
      if (selectedPlatform !== 'ALL') params.set('site', selectedPlatform);
      if (selectedProductType !== 'ALL') params.set('type', selectedProductType);
      if (selectedSize !== 'ALL') params.set('size', selectedSize);
      if (inStockOnly) params.set('stock', '1');
      if (limitedOnly) params.set('limited', '1');
      if (selectedGenre !== 'ALL') params.set('genre', selectedGenre);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (viewMode !== 'BAND_CARDS') params.set('view', viewMode);
      const qs = params.toString();
      const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', nextUrl);
    } catch {}
  }, [
    preferredRegion,
    selectedPlatform,
    selectedProductType,
    selectedSize,
    inStockOnly,
    limitedOnly,
    selectedGenre,
    searchQuery,
    viewMode
  ]);

  // --- Persist State ---
  useEffect(() => {
    safeSetLocalStorage('spotify_merch_region', preferredRegion);
  }, [preferredRegion]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_currency', currency);
  }, [currency]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_thumb_size', thumbnailSize);
  }, [thumbnailSize]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_source_label', loadedSourceLabel);
  }, [loadedSourceLabel]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_artists_v3', JSON.stringify(artists));
  }, [artists]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_saved_wishlist_v1', JSON.stringify(savedItems));
  }, [savedItems]);

  useEffect(() => {
    safeSetLocalStorage('merchpulse_watches_v1', JSON.stringify(restockWatches));
  }, [restockWatches]);

  useEffect(() => {
    const entries = Object.entries(liveShopifyFeeds).slice(-65);
    safeSetLocalStorage('spotify_merch_live_feeds_v2', JSON.stringify(Object.fromEntries(entries)));
  }, [liveShopifyFeeds]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_discovery_meta_v2', JSON.stringify(discoveryMeta));
  }, [discoveryMeta]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_custom_urls_v1', JSON.stringify(customStoreUrls));
  }, [customStoreUrls]);

  useEffect(() => {
    safeSetLocalStorage('spotify_merch_site_overrides_v1', JSON.stringify(customSiteOverrides));
  }, [customSiteOverrides]);

  // --- Currency Conversion & Formatting Helpers ---
  const convertPriceToSelected = useCallback(
    (rawPriceStr, sourceCurrency = 'USD') => {
      const num = parseFloat(String(rawPriceStr || '25.00').replace(/[^0-9.]/g, '')) || 25.0;
      const toGBP = fxRatesToGBP[sourceCurrency] || 0.79;
      const gbpValue = num * toGBP;
      const targetToGBP = fxRatesToGBP[currency] || 1;
      return gbpValue / targetToGBP;
    },
    [currency, fxRatesToGBP]
  );

  const formatProductPrice = useCallback(
    (product) => {
      const firstVar = Array.isArray(product.variants) && product.variants.length > 0 ? product.variants[0] : null;
      const rawPrice = firstVar?.price || product.price || '25.00';
      const srcCurr = inferSourceCurrency(product);
      const converted = convertPriceToSelected(rawPrice, srcCurr);
      const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.GBP;
      return `${cfg.symbol}${converted.toFixed(2)}`;
    },
    [currency, convertPriceToSelected]
  );

  const getNumericProductPrice = useCallback(
    (product) => {
      const firstVar = Array.isArray(product.variants) && product.variants.length > 0 ? product.variants[0] : null;
      const rawPrice = firstVar?.price || product.price || '25.00';
      return convertPriceToSelected(rawPrice, inferSourceCurrency(product));
    },
    [convertPriceToSelected]
  );

  // --- Safe JSON Fetch Helper ---
  const safeFetchJson = async (url, options = {}) => {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!contentType.includes('application/json') && text.trim().startsWith('<')) {
      throw new Error('Backend API returned HTML instead of JSON. Ensure server.js registers /api/* routes above dist/.');
    }
    const data = JSON.parse(text);
    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data;
  };

  // ==========================================
  // 4. IMPORT ARTISTS (SPOTIFY / LAST.FM / CHARTS / BAND LIST)
  // ==========================================
  const applyImportedArtists = (incomingList, label) => {
    const normalized = incomingList.map((a, idx) => ({
      id: a.id || `band-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`,
      name: a.name.trim(),
      image: a.image || null,
      genres: Array.isArray(a.genres) ? a.genres : [],
      spotifyUrl: a.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(a.name.trim())}`,
      trackCount: a.trackCount || a.likedTracksCount || a.playcount || 1
    }));

    if (importMode === 'REPLACE') {
      const deduped = deduplicateArtists(normalized);
      setArtists(deduped);
      setLoadedSourceLabel(`${label} (${deduped.length} bands)`);
    } else {
      setArtists((prev) => {
        const merged = deduplicateArtists([...prev, ...normalized]);
        setLoadedSourceLabel(`Merged Library (${merged.length} bands)`);
        return merged;
      });
    }

    setCurrentPage(1);
    setSelectedBandId(null);
    setAutoScrapeEnabled(true);
  };

  const handleImportSpotifyPlaylist = async (overrideUrl = null) => {
    const targetUrl = (overrideUrl || playlistUrl).trim();
    if (!targetUrl) {
      setImportError('Paste a public Spotify playlist URL first.');
      return;
    }
    if (overrideUrl) setPlaylistUrl(overrideUrl);
    setIsImporting(true);
    setImportError('');
    try {
      const data = await safeFetchJson(`/api/playlist?url=${encodeURIComponent(targetUrl)}`);
      if (!Array.isArray(data.artists) || data.artists.length === 0) {
        throw new Error('No artists found in that playlist.');
      }
      applyImportedArtists(data.artists, data.playlistName || 'Spotify Playlist');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportLastfm = async () => {
    const user = lastfmUser.trim();
    if (!user) {
      setImportError('Enter a Last.fm username.');
      return;
    }
    setIsImporting(true);
    setImportError('');
    try {
      const data = await safeFetchJson(
        `/api/lastfm?user=${encodeURIComponent(user)}&period=${encodeURIComponent(lastfmPeriod)}&limit=100`
      );
      if (data.error) {
        throw new Error(data.error);
      }
      if (!Array.isArray(data.artists) || data.artists.length === 0) {
        throw new Error(`No scrobbled artists found for "${user}".`);
      }
      applyImportedArtists(data.artists, `Last.fm: ${user}`);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportCharts = async (overrideTag = null) => {
    const targetTag = (overrideTag !== null ? overrideTag : chartGenre).trim();
    if (overrideTag !== null) setChartGenre(overrideTag);
    setIsImporting(true);
    setImportError('');
    try {
      const data = await safeFetchJson(
        `/api/lastfm-charts?tag=${encodeURIComponent(targetTag)}&limit=50`
      );
      if (!Array.isArray(data.artists) || data.artists.length === 0) {
        throw new Error('No chart artists returned.');
      }
      applyImportedArtists(data.artists, data.chartName || 'Last.fm Charts');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportCustomBandList = () => {
    const lines = customBandText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setImportError('Paste at least one band name.');
      return;
    }
    setImportError('');
    const list = lines.map((name, i) => ({
      id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
      name,
      image: null,
      genres: [],
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
      trackCount: 1
    }));
    applyImportedArtists(list, 'Custom Band List');
    setCustomBandText('');
  };

  const handleImportSubmit = (e) => {
    e.preventDefault();
    if (sourceTab === 'SPOTIFY') handleImportSpotifyPlaylist();
    else if (sourceTab === 'LASTFM') handleImportLastfm();
    else if (sourceTab === 'CHARTS') handleImportCharts();
    else handleImportCustomBandList();
  };

  // ==========================================
  // 5. MULTI-SITE SCRAPER ENGINE (/api/discover)
  // ==========================================
  const discoverArtistMerch = useCallback(
    async (artist, forceRefresh = false, overrideMap = null) => {
      if (!artist?.id || !artist?.name) return;

      setActivelyScanningIds((prev) => (prev.includes(artist.id) ? prev : [...prev, artist.id]));

      try {
        const activeOverrides = overrideMap || customSiteOverrides[artist.id] || {};
        const customUrl = customStoreUrls[artist.id] || activeOverrides.OFFICIAL || '';
        const params = new URLSearchParams({
          artist: artist.name,
          spotifyId: artist.id,
          region: preferredRegion
        });
        if (forceRefresh) params.set('force', '1');
        if (customUrl) params.set('customUrl', customUrl);
        if (Object.keys(activeOverrides).length > 0) {
          params.set('siteOverrides', JSON.stringify(activeOverrides));
        }

        const data = await safeFetchJson(`/api/discover?${params.toString()}`);
        setProxyOnline(true);

        const incomingProducts = Array.isArray(data.products)
          ? data.products.map((p) => slimProductForStorage(p)).filter(Boolean)
          : [];

        setLiveShopifyFeeds((prev) => {
          const existing = Array.isArray(prev[artist.id]) ? prev[artist.id] : [];
          const merged = mergeProductArrays(existing, incomingProducts);
          return { ...prev, [artist.id]: merged };
        });

        const metaPatch = {
          scanned: true,
          updatedAt: Date.now(),
          storeUrl: data.storeUrl || null,
          officialWebsite: data.officialWebsite || null,
          bandcampUrl: data.bandcampUrl || null,
          artistImage: data.artistImage || null,
          regionalStores: data.regionalStores || {},
          webPresence: data.webPresence || {},
          genres: Array.isArray(data.genres) ? data.genres : [],
          source: data.source || 'proxy'
        };

        setDiscoveryMeta((prev) => ({
          ...prev,
          [artist.id]: { ...prev[artist.id], ...metaPatch }
        }));

        if ((metaPatch.genres && metaPatch.genres.length > 0) || metaPatch.artistImage) {
          setArtists((prev) =>
            prev.map((a) => {
              if (a.id !== artist.id) return a;
              return {
                ...a,
                image: metaPatch.artistImage || a.image || null,
                genres: metaPatch.genres.length > 0 ? metaPatch.genres : a.genres || []
              };
            })
          );
        }

        if (restockWatches.length > 0 && incomingProducts.length > 0) {
          setRestockWatches((prev) =>
            prev.map((w) => {
              if (w.artistId !== artist.id) return w;
              const matchedProd = incomingProducts.find(
                (p) => p.productUrl === w.productUrl || p.title === w.title
              );
              if (!matchedProd) return w;
              const isNowInStock = (matchedProd.variants || []).some(
                (v) => normalizeSizeToken(v.title) === w.size && v.available !== false
              );
              return isNowInStock ? { ...w, backInStock: true } : w;
            })
          );
        }
      } catch {
        setProxyOnline(false);
        setDiscoveryMeta((prev) => ({
          ...prev,
          [artist.id]: {
            ...prev[artist.id],
            scanned: true,
            updatedAt: Date.now()
          }
        }));
      } finally {
        setActivelyScanningIds((prev) => prev.filter((id) => id !== artist.id));
      }
    },
    [customSiteOverrides, customStoreUrls, preferredRegion, restockWatches.length]
  );

  // --- Parallel Background Scraper Queue ---
  useEffect(() => {
    if (!autoScrapeEnabled || artists.length === 0) return;

    const timer = setInterval(() => {
      if (activeWorkersRef.current >= scraperConcurrency) return;

      const unscraped = artists.filter(
        (a) => !discoveryMeta[a.id]?.scanned && !activelyScanningIds.includes(a.id)
      );
      if (unscraped.length === 0) return;

      const slotsAvailable = scraperConcurrency - activeWorkersRef.current;
      const batch = unscraped.slice(0, slotsAvailable);

      for (const nextArtist of batch) {
        activeWorkersRef.current += 1;
        discoverArtistMerch(nextArtist, false).finally(() => {
          activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        });
      }
    }, 300);

    return () => clearInterval(timer);
  }, [autoScrapeEnabled, artists, discoveryMeta, activelyScanningIds, scraperConcurrency, discoverArtistMerch]);

  // ==========================================
  // 6. DERIVED DATA, FILTERING & SORTING
  // ==========================================
  const allGenres = useMemo(() => {
    const counts = new Map();
    for (const a of artists) {
      for (const g of a.genres || []) {
        const clean = g.toLowerCase().trim();
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 28)
      .map(([genre, count]) => ({ genre, count }));
  }, [artists]);

  const sevenDaysAgo = Date.now() - 7 * 86400000;

  const artistProcessedMap = useMemo(() => {
    const map = {};
    const q = searchQuery.trim().toLowerCase();

    for (const artist of artists) {
      const rawProducts = Array.isArray(liveShopifyFeeds[artist.id]) ? liveShopifyFeeds[artist.id] : [];
      const bandNameMatchesSearch = !q || artist.name.toLowerCase().includes(q);

      const baseFiltered = rawProducts.filter((p) => {
        if (!matchProductType(p, selectedProductType)) return false;
        if (!matchProductSize(p, selectedSize, inStockOnly)) return false;
        if (newDropsOnly && (!p.firstSeenAt || p.firstSeenAt < sevenDaysAgo)) return false;
        if (limitedOnly && !isLimitedOrTourEdition(p)) return false;
        if (q && !bandNameMatchesSearch) {
          const prodHay = `${p.title || ''} ${p.vendor || ''} ${p.sourcePlatform || ''}`.toLowerCase();
          if (!prodHay.includes(q)) return false;
        }
        return true;
      });

      const storeCounts = {};
      for (const p of baseFiltered) {
        const plat = p.sourcePlatform || 'OFFICIAL';
        storeCounts[plat] = (storeCounts[plat] || 0) + 1;
      }

      const globalFiltered =
        selectedPlatform === 'ALL'
          ? baseFiltered
          : baseFiltered.filter((p) => (p.sourcePlatform || 'OFFICIAL') === selectedPlatform);

      map[artist.id] = {
        rawCount: rawProducts.length,
        baseFiltered,
        globalFiltered,
        storeCounts,
        scanned: Boolean(discoveryMeta[artist.id]?.scanned),
        isScanning: activelyScanningIds.includes(artist.id)
      };
    }

    return map;
  }, [
    artists,
    liveShopifyFeeds,
    discoveryMeta,
    activelyScanningIds,
    selectedPlatform,
    selectedProductType,
    selectedSize,
    inStockOnly,
    newDropsOnly,
    limitedOnly,
    searchQuery,
    sevenDaysAgo
  ]);

  const globalPlatformCounts = useMemo(() => {
    const counts = { ALL: 0 };
    for (const a of artists) {
      if (selectedGenre !== 'ALL' && !(a.genres || []).some((g) => g.toLowerCase() === selectedGenre)) {
        continue;
      }
      const stats = artistProcessedMap[a.id];
      if (!stats) continue;
      counts.ALL += stats.baseFiltered.length;
      for (const [plat, cnt] of Object.entries(stats.storeCounts)) {
        counts[plat] = (counts[plat] || 0) + cnt;
      }
    }
    return counts;
  }, [artists, artistProcessedMap, selectedGenre]);

  const scannedCount = useMemo(
    () => artists.filter((a) => discoveryMeta[a.id]?.scanned).length,
    [artists, discoveryMeta]
  );

  const noMerchArtists = useMemo(
    () =>
      artists.filter((a) => {
        const st = artistProcessedMap[a.id];
        return st?.scanned && st.rawCount === 0;
      }),
    [artists, artistProcessedMap]
  );

  const visibleArtists = useMemo(() => {
    return artists.filter((artist) => {
      const st = artistProcessedMap[artist.id];
      if (!st) return false;

      if (selectedBandId) {
        return artist.id === selectedBandId;
      }

      if (selectedGenre !== 'ALL') {
        const hasGenre = (artist.genres || []).some((g) => g.toLowerCase() === selectedGenre);
        if (!hasGenre) return false;
      }

      if (storeFilterMode === 'NO_MERCH') {
        return st.scanned && st.rawCount === 0;
      }

      return st.globalFiltered.length > 0 || (st.isScanning && st.rawCount > 0);
    });
  }, [artists, artistProcessedMap, selectedBandId, selectedGenre, storeFilterMode]);

  const totalPages = Math.max(1, Math.ceil(visibleArtists.length / BANDS_PER_PAGE));
  const paginatedArtists = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * BANDS_PER_PAGE;
    return visibleArtists.slice(start, start + BANDS_PER_PAGE);
  }, [visibleArtists, currentPage, totalPages]);

  const streamProducts = useMemo(() => {
    const items = [];
    for (const artist of artists) {
      if (selectedBandId && artist.id !== selectedBandId) continue;
      if (selectedGenre !== 'ALL' && !(artist.genres || []).some((g) => g.toLowerCase() === selectedGenre)) {
        continue;
      }
      const st = artistProcessedMap[artist.id];
      if (!st) continue;
      const storeReach = Object.keys(st.storeCounts).length;
      const popularityScore = (artist.trackCount || 1) * 10 + storeReach * 5 + st.rawCount;

      for (const p of st.globalFiltered) {
        items.push({
          ...p,
          _artistId: artist.id,
          _artistName: artist.name,
          _popularityScore: popularityScore
        });
      }
    }

    const sorted = [...items];
    switch (sortBy) {
      case 'PRICE_ASC':
        sorted.sort((a, b) => getNumericProductPrice(a) - getNumericProductPrice(b));
        break;
      case 'PRICE_DESC':
        sorted.sort((a, b) => getNumericProductPrice(b) - getNumericProductPrice(a));
        break;
      case 'TITLE_ASC':
        sorted.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
        break;
      case 'TITLE_DESC':
        sorted.sort((a, b) => String(b.title || '').localeCompare(String(a.title || '')));
        break;
      case 'BAND_ASC':
        sorted.sort((a, b) => a._artistName.localeCompare(b._artistName));
        break;
      case 'PLATFORM_ASC':
        sorted.sort((a, b) => String(a.sourcePlatform || '').localeCompare(String(b.sourcePlatform || '')));
        break;
      case 'POPULARITY_DESC':
        sorted.sort((a, b) => b._popularityScore - a._popularityScore);
        break;
      default:
        return interleaveProductsByPlatform(sorted);
    }
    return sorted;
  }, [artists, artistProcessedMap, selectedBandId, selectedGenre, sortBy, getNumericProductPrice]);

  const totalStreamPages = Math.max(1, Math.ceil(streamProducts.length / STREAM_ITEMS_PER_PAGE));
  const paginatedStreamProducts = useMemo(() => {
    const safePage = Math.min(currentPage, totalStreamPages);
    const start = (safePage - 1) * STREAM_ITEMS_PER_PAGE;
    return streamProducts.slice(start, start + STREAM_ITEMS_PER_PAGE);
  }, [streamProducts, currentPage, totalStreamPages]);

  const directoryArtists = useMemo(() => {
    const dq = directorySearch.trim().toLowerCase();
    const filtered = dq ? artists.filter((a) => a.name.toLowerCase().includes(dq)) : [...artists];

    if (!sortActiveFirst) {
      return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    const active = [];
    const inactive = [];
    for (const a of filtered) {
      const count = artistProcessedMap[a.id]?.globalFiltered.length || 0;
      if (count > 0) active.push(a);
      else inactive.push(a);
    }

    active.sort((a, b) => a.name.localeCompare(b.name));
    inactive.sort((a, b) => a.name.localeCompare(b.name));
    return [...active, ...inactive];
  }, [artists, directorySearch, sortActiveFirst, artistProcessedMap]);

  // ==========================================
  // 7. WISHLIST, WATCHERS & MODAL HANDLERS
  // ==========================================
  const isProductSaved = useCallback(
    (product) => savedItems.some((s) => s.productUrl === product.productUrl && s.title === product.title),
    [savedItems]
  );

  const toggleSaveProduct = (product, artistName) => {
    setSavedItems((prev) => {
      const exists = prev.some((s) => s.productUrl === product.productUrl && s.title === product.title);
      if (exists) {
        return prev.filter((s) => !(s.productUrl === product.productUrl && s.title === product.title));
      }
      const snapshot = {
        ...slimProductForStorage(product, true),
        artistName: artistName || product._artistName || 'Artist',
        savedAt: Date.now()
      };
      return [snapshot, ...prev];
    });
  };

  const toggleWatchSize = (product, artistId, artistName, size) => {
    setRestockWatches((prev) => {
      const exists = prev.some(
        (w) => w.artistId === artistId && w.productUrl === product.productUrl && w.size === size
      );
      if (exists) {
        return prev.filter(
          (w) => !(w.artistId === artistId && w.productUrl === product.productUrl && w.size === size)
        );
      }
      return [
        {
          id: `${artistId}-${size}-${Date.now()}`,
          artistId,
          artistName,
          title: product.title,
          productUrl: product.productUrl,
          size,
          backInStock: false,
          createdAt: Date.now()
        },
        ...prev
      ];
    });
  };

  const openBandLinksModal = (artist) => {
    const meta = discoveryMeta[artist.id] || {};
    const overrides = customSiteOverrides[artist.id] || {};
    const formValues = {
      OFFICIAL: customStoreUrls[artist.id] || overrides.OFFICIAL || meta.storeUrl || '',
      WEBSITE: meta.officialWebsite || '',
      BANDCAMP: overrides.BANDCAMP || meta.bandcampUrl || '',
      BIGCARTEL: overrides.BIGCARTEL || '',
      AMAZON: overrides.AMAZON || '',
      EYESORE: overrides.EYESORE || '',
      MERCHBAR: overrides.MERCHBAR || '',
      EVILGREED: overrides.EVILGREED || '',
      IMPERICON: overrides.IMPERICON || '',
      INDIEMERCH: overrides.INDIEMERCH || '',
      HOLYMOUNTAIN: overrides.HOLYMOUNTAIN || '',
      COLDCUTS: overrides.COLDCUTS || '',
      HELLOMERCH: overrides.HELLOMERCH || '',
      DOWNRIGHT: overrides.DOWNRIGHT || '',
      TWENTYFOUR: overrides.TWENTYFOUR || '',
      KINGSROAD: overrides.KINGSROAD || ''
    };
    setLinkForm(formValues);
    setUnlockedFields({});
    setUnlockWarningField(null);
    setEditingArtist(artist);
  };

  const handleSaveBandLinks = async (e) => {
    e.preventDefault();
    if (!editingArtist) return;
    const artist = editingArtist;

    const newOverrides = {};
    for (const field of SITE_OVERRIDE_FIELDS) {
      const val = (linkForm[field.key] || '').trim();
      if (val) newOverrides[field.key] = val;
    }

    if (linkForm.OFFICIAL?.trim()) {
      setCustomStoreUrls((prev) => ({ ...prev, [artist.id]: linkForm.OFFICIAL.trim() }));
    }

    setCustomSiteOverrides((prev) => ({ ...prev, [artist.id]: newOverrides }));

    if (linkForm.WEBSITE?.trim()) {
      setDiscoveryMeta((prev) => ({
        ...prev,
        [artist.id]: { ...prev[artist.id], officialWebsite: linkForm.WEBSITE.trim() }
      }));
    }

    setEditingArtist(null);
    await discoverArtistMerch(artist, true, newOverrides);
  };

  const handleCopyShareLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {}
  };

  const handleRegionChange = (nextRegion) => {
    setPreferredRegion(nextRegion);
    if (REGION_TO_CURRENCY[nextRegion]) {
      setCurrency(REGION_TO_CURRENCY[nextRegion]);
    }
  };

  const gridColsClass =
    thumbnailSize === 'compact'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'
      : thumbnailSize === 'large'
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : thumbnailSize === 'xl'
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  const activeWatchAlertsCount = restockWatches.filter((w) => w.backInStock).length;

  // ==========================================
  // 8. REUSABLE SIDEBAR CONTROLS RENDERER
  // ==========================================
  const renderSidebarControls = () => (
    <div className="space-y-4">
      {/* 1. MERCH & STORE FILTERS */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            Merch & Store Filters
          </h2>
          {(selectedPlatform !== 'ALL' ||
            selectedProductType !== 'ALL' ||
            selectedSize !== 'ALL' ||
            inStockOnly ||
            newDropsOnly ||
            limitedOnly ||
            selectedGenre !== 'ALL' ||
            selectedBandId ||
            searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedPlatform('ALL');
                setSelectedProductType('ALL');
                setSelectedSize('ALL');
                setInStockOnly(false);
                setNewDropsOnly(false);
                setLimitedOnly(false);
                setSelectedGenre('ALL');
                setSelectedBandId(null);
                setSearchQuery('');
                setStoreFilterMode('MATCHING_PRODUCTS');
                setCurrentPage(1);
              }}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
            >
              Reset All
            </button>
          )}
        </div>

        {/* Band Feed Status */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Band Feed Status
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStoreFilterMode('MATCHING_PRODUCTS');
                setSelectedBandId(null);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition text-left flex items-center justify-between ${
                storeFilterMode === 'MATCHING_PRODUCTS'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>With Products</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 tabular-nums">
                {artists.filter((a) => (artistProcessedMap[a.id]?.globalFiltered.length || 0) > 0).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStoreFilterMode('NO_MERCH');
                setSelectedBandId(null);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition text-left flex items-center justify-between ${
                storeFilterMode === 'NO_MERCH'
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>No Merch</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 tabular-nums">
                {noMerchArtists.length}
              </span>
            </button>
          </div>

          {storeFilterMode === 'NO_MERCH' && noMerchArtists.length > 0 && (
            <button
              type="button"
              onClick={() => {
                noMerchArtists.slice(0, 15).forEach((a) => discoverArtistMerch(a, true));
              }}
              className="mt-2 w-full py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-Search Hidden Bands ({Math.min(15, noMerchArtists.length)})
            </button>
          )}
        </div>

        {/* Filter by Site / Retailer with Global Counts */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Filter by Site / Retailer
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((plat) => {
              const count = globalPlatformCounts[plat.id] || 0;
              const isSelected = selectedPlatform === plat.id;
              const isEmpty = plat.id !== 'ALL' && count === 0;
              return (
                <button
                  key={plat.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlatform(isSelected && plat.id !== 'ALL' ? 'ALL' : plat.id);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition flex items-center gap-1.5 ${
                    isSelected
                      ? plat.pillActive
                      : isEmpty
                      ? 'bg-zinc-950/40 border-zinc-800/60 text-zinc-600 hover:text-zinc-400'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <span>{plat.label}</span>
                  <span
                    className={`text-[10px] px-1 rounded tabular-nums ${
                      isSelected ? 'bg-black/30 text-current' : 'bg-zinc-900 text-zinc-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Type */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Product Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRODUCT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedProductType(t.id);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                  selectedProductType === t.id
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                    : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Extended Size Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Apparel Size
          </label>
          <div className="grid grid-cols-4 gap-1">
            {SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  setSelectedSize(sz);
                  setCurrentPage(1);
                }}
                className={`py-1 rounded-md text-[11px] font-semibold border transition ${
                  selectedSize === sz
                    ? 'bg-amber-500/25 border-amber-400/70 text-amber-200'
                    : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles: In-Stock Only, New Drops & Limited/Tour */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setInStockOnly((v) => !v);
              setCurrentPage(1);
            }}
            className={`px-2 py-2 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1 transition ${
              inStockOnly
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Check className="w-3 h-3 shrink-0" />
            <span>In-Stock</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewDropsOnly((v) => !v);
              setCurrentPage(1);
            }}
            className={`px-2 py-2 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1 transition ${
              newDropsOnly
                ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>New (7d)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLimitedOnly((v) => !v);
              setCurrentPage(1);
            }}
            className={`px-2 py-2 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1 transition ${
              limitedOnly
                ? 'bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tag className="w-3 h-3 shrink-0" />
            <span>Limited</span>
          </button>
        </div>

        {/* Thumbnail Card Size */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Thumbnail Size
          </label>
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: 'compact', label: 'Small' },
              { id: 'medium', label: 'Med' },
              { id: 'large', label: 'Large' },
              { id: 'xl', label: 'XL' }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setThumbnailSize(opt.id)}
                className={`py-1 rounded-md text-[11px] font-medium border transition ${
                  thumbnailSize === opt.id
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-950/70 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. ALL BANDS DIRECTORY (Strict A-Z Active First) */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-emerald-400" />
            All Bands Directory ({artists.length})
          </h2>
          <button
            type="button"
            onClick={() => setSortActiveFirst((v) => !v)}
            className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            {sortActiveFirst ? 'Active A–Z' : 'All A–Z'}
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={directorySearch}
            onChange={(e) => setDirectorySearch(e.target.value)}
            placeholder="Jump to band..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
          />
          {directorySearch && (
            <button
              type="button"
              onClick={() => setDirectorySearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
          {directoryArtists.map((artist) => {
            const count = artistProcessedMap[artist.id]?.globalFiltered.length || 0;
            const isSelected = selectedBandId === artist.id;
            return (
              <button
                key={artist.id}
                type="button"
                onClick={() => {
                  setSelectedBandId(isSelected ? null : artist.id);
                  setCurrentPage(1);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition text-left ${
                  isSelected
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 font-semibold'
                    : count > 0
                    ? 'hover:bg-zinc-800/80 text-zinc-200'
                    : 'hover:bg-zinc-900 text-zinc-500'
                }`}
              >
                <span className="truncate pr-2">{artist.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums shrink-0 ${
                    count > 0 ? 'bg-emerald-500/15 text-emerald-300 font-semibold' : 'bg-zinc-950 text-zinc-600'
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
      <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            Filter by Genre
          </h2>
          {selectedGenre !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedGenre('ALL')}
              className="text-[11px] text-emerald-400 hover:text-emerald-300"
            >
              Clear
            </button>
          )}
        </div>

        {allGenres.length === 0 ? (
          <p className="text-xs text-zinc-500">Genres populate automatically as bands are scanned.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => {
                setSelectedGenre('ALL');
                setCurrentPage(1);
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                selectedGenre === 'ALL'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Genres
            </button>
            {allGenres.map(({ genre, count }) => (
              <button
                key={genre}
                type="button"
                onClick={() => {
                  setSelectedGenre(selectedGenre === genre ? 'ALL' : genre);
                  setCurrentPage(1);
                }}
                className={`px-2 py-1 rounded-lg text-[11px] capitalize border transition ${
                  selectedGenre === genre
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {genre} <span className="text-zinc-500 text-[10px]">({count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. MULTI-SITE SCRAPER CONTROLS */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Multi-Site Scraper
          </h2>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              proxyOnline === false
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {proxyOnline === false ? 'Proxy Offline' : '15-Site Proxy Active'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Parallel Workers</span>
          <div className="flex gap-1">
            {[1, 3, 5, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScraperConcurrency(n)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                  scraperConcurrency === n
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                {n}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAutoScrapeEnabled((v) => !v)}
            className="flex-1 py-1.5 px-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 transition"
          >
            {autoScrapeEnabled ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            {autoScrapeEnabled ? 'Pause Queue' : 'Resume Queue'}
          </button>

          <button
            type="button"
            onClick={() => {
              paginatedArtists.forEach((a) => discoverArtistMerch(a, true));
            }}
            className="py-1.5 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 transition"
            title="Force refresh current page"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rescan Page
          </button>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // 9. PRODUCT CARD RENDERER
  // ==========================================
  const renderProductCard = (product, artistName, artistId) => {
    const platInfo = PLATFORM_MAP[product.sourcePlatform] || PLATFORM_MAP.OFFICIAL;
    const saved = isProductSaved(product);
    const isNew = product.firstSeenAt && product.firstSeenAt >= sevenDaysAgo;
    const isLimited = isLimitedOrTourEdition(product);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const sizeVariants = variants.filter((v) => normalizeSizeToken(v.title));

    return (
      <div
        key={`${product.id}-${product.productUrl}`}
        className="group bg-zinc-950/90 border border-zinc-800/90 hover:border-zinc-700 rounded-xl overflow-hidden flex flex-col transition-all shadow-sm"
      >
        {/* Product Image Container */}
        <div className="relative aspect-square bg-zinc-900 overflow-hidden">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-4 text-center">
              <ShoppingBag className="w-8 h-8 mb-1 opacity-40" />
              <span className="text-[11px] line-clamp-2">{product.title}</span>
            </div>
          )}

          {/* Top-Left High-Contrast Platform, NEW & LIMITED Flags */}
          <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1 max-w-[78%]">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-950/95 ring-1 ring-black/80 shadow ${platInfo.textClass}`}
            >
              {platInfo.label}
            </span>
            {isNew && (
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-sky-500 text-zinc-950 shadow">
                NEW
              </span>
            )}
            {isLimited && (
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-fuchsia-500 text-zinc-950 shadow">
                LIMITED
              </span>
            )}
          </div>

          {/* Top-Right Quick Actions (Save & Quick-View) */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => toggleSaveProduct(product, artistName)}
              title={saved ? 'Remove from Saved' : 'Save to Wishlist'}
              className={`p-1.5 rounded-lg backdrop-blur-md border transition shadow ${
                saved
                  ? 'bg-rose-500/90 border-rose-400 text-white'
                  : 'bg-zinc-950/85 border-zinc-700/80 text-zinc-300 hover:text-white'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setQuickViewProduct({ ...product, _artistName: artistName, _artistId: artistId })}
              title="Quick View Details & Size Watch"
              className="p-1.5 rounded-lg bg-zinc-950/85 hover:bg-zinc-900 border border-zinc-700/80 text-zinc-300 hover:text-white backdrop-blur-md transition shadow"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Product Info */}
        <div className="p-3 flex-1 flex flex-col justify-between gap-2">
          <div>
            {viewMode === 'STREAM' && (
              <p className="text-[11px] font-bold text-emerald-400 truncate mb-0.5">{artistName}</p>
            )}
            <a
              href={product.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-zinc-100 hover:text-emerald-300 line-clamp-2 leading-snug transition"
            >
              {product.title}
            </a>
          </div>

          {/* Available Size Pills */}
          {sizeVariants.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sizeVariants.slice(0, 6).map((v, idx) => {
                const norm = normalizeSizeToken(v.title) || v.title;
                const isSelectedSz = selectedSize !== 'ALL' && norm === selectedSize;
                const avail = v.available !== false;
                return (
                  <span
                    key={`${v.id || idx}`}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${
                      isSelectedSz && avail
                        ? 'bg-amber-400/25 border-amber-400 text-amber-200'
                        : avail
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-600 line-through'
                    }`}
                  >
                    {norm}
                  </span>
                );
              })}
            </div>
          )}

          {/* Price & Buy Link */}
          <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white tabular-nums">{formatProductPrice(product)}</span>
            <a
              href={product.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-500 text-zinc-200 hover:text-zinc-950 text-[11px] font-semibold flex items-center gap-1 transition"
            >
              <span>View</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // 10. MAIN JSX RETURN
  // ==========================================
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Custom Sleek Dark & Emerald Scrollbars */}
      <style>{`
        * {
          scrollbar-width: thin;
          scrollbar-color: #27272a #09090b;
        }
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: #09090b;
        }
        ::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 9999px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #10b981;
        }
      `}</style>

      {/* ==========================================
          STICKY TWO-ROW HEADER
      ========================================== */}
      <header className="sticky top-0 z-40 bg-zinc-950/92 backdrop-blur-xl border-b border-zinc-800/90">
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 space-y-2.5">
          {/* Row 1: Brand Logo + Multi-Source Importer + Saved & Share Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Brand */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-zinc-950 shadow-lg shadow-emerald-500/20">
                <Disc className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold tracking-tight text-base text-white">MerchPulse</span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    15-Site Live
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate max-w-[220px]">{loadedSourceLabel}</p>
              </div>
            </div>

            {/* Source Input Bar (Spotify Playlist / Last.fm / Charts / Band List) */}
            <form onSubmit={handleImportSubmit} className="flex-1 min-w-[280px] max-w-2xl flex flex-wrap sm:flex-nowrap items-center gap-1.5">
              {/* Source Tabs */}
              <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 shrink-0">
                {[
                  { id: 'SPOTIFY', label: 'Spotify' },
                  { id: 'LASTFM', label: 'Last.fm' },
                  { id: 'CHARTS', label: 'Charts' },
                  { id: 'BANDLIST', label: 'Band List' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSourceTab(tab.id);
                      setImportError('');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      sourceTab === tab.id ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Input */}
              {sourceTab === 'SPOTIFY' && (
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="Paste public Spotify playlist link..."
                  className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              )}

              {sourceTab === 'LASTFM' && (
                <div className="flex-1 flex items-center gap-1.5 min-w-[180px]">
                  <input
                    type="text"
                    value={lastfmUser}
                    onChange={(e) => setLastfmUser(e.target.value)}
                    placeholder="Last.fm username..."
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <select
                    value={lastfmPeriod}
                    onChange={(e) => setLastfmPeriod(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
                  >
                    <option value="overall">All Time</option>
                    <option value="12month">12 Months</option>
                    <option value="6month">6 Months</option>
                    <option value="1month">30 Days</option>
                    <option value="7day">7 Days</option>
                  </select>
                </div>
              )}

              {sourceTab === 'CHARTS' && (
                <input
                  type="text"
                  value={chartGenre}
                  onChange={(e) => setChartGenre(e.target.value)}
                  placeholder="Blank for Global Top 50, or type genre (e.g. hardcore, punk)..."
                  className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              )}

              {sourceTab === 'BANDLIST' && (
                <input
                  type="text"
                  value={customBandText}
                  onChange={(e) => setCustomBandText(e.target.value)}
                  placeholder="Comma or newline separated bands (e.g. Converge, IDLES)..."
                  className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              )}

              {/* Merge vs Replace Toggle */}
              <button
                type="button"
                onClick={() => setImportMode((m) => (m === 'MERGE' ? 'REPLACE' : 'MERGE'))}
                title="Toggle between Merging with current bands or Replacing them"
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 shrink-0"
              >
                {importMode === 'MERGE' ? '+ Merge' : 'Replace'}
              </button>

              {/* Find Merch Submit */}
              <button
                type="submit"
                disabled={isImporting}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
              >
                {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}
                <span>Find Merch</span>
              </button>
            </form>

            {/* Right Header Actions: Saved Wishlist & Share Link */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition"
                title="Copy shareable URL with active filters"
              >
                {shareCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{shareCopied ? 'Copied' : 'Share'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSavedDrawer(true)}
                className="relative px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition"
              >
                <Heart className={`w-3.5 h-3.5 ${savedItems.length > 0 ? 'text-rose-400 fill-rose-400' : 'text-zinc-400'}`} />
                <span>Saved</span>
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[11px] tabular-nums">{savedItems.length}</span>
                {activeWatchAlertsCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* Import Error Banner */}
          {importError && (
            <div className="px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                {importError}
              </span>
              <button type="button" onClick={() => setImportError('')} className="text-red-300 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Row 2: Region & Currency Selector + Full-Width Fixed-Height Scraper Progress Bar */}
          <div className="flex items-center gap-2.5">
            {/* Region & Currency */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl px-2 h-9 shrink-0">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <select
                value={preferredRegion}
                onChange={(e) => handleRegionChange(e.target.value)}
                aria-label="Store Region"
                className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="UK" className="bg-zinc-900">UK</option>
                <option value="EU" className="bg-zinc-900">EU</option>
                <option value="US" className="bg-zinc-900">US</option>
                <option value="AU" className="bg-zinc-900">AU</option>
              </select>
              <span className="text-zinc-700">|</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Display Currency"
                className="bg-transparent text-xs font-semibold text-emerald-300 focus:outline-none cursor-pointer"
              >
                {Object.entries(CURRENCY_CONFIG).map(([code, cfg]) => (
                  <option key={code} value={code} className="bg-zinc-900">
                    {cfg.symbol} {code}
                  </option>
                ))}
              </select>
            </div>

            {/* Full-Width Fixed-Height Scraper Progress Bar */}
            <div className="relative flex-1 min-w-0 h-9 bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 flex items-center justify-between gap-3 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {activelyScanningIds.length > 0 ? (
                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="text-xs font-semibold text-zinc-300 tabular-nums shrink-0">
                  Scraped {scannedCount}/{artists.length}
                </span>
                <span className="text-zinc-600 shrink-0">•</span>
                <span className="text-xs text-zinc-400 truncate">
                  {activelyScanningIds.length > 0
                    ? `Scanning: ${activelyScanningIds
                        .map((id) => artists.find((a) => a.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}`
                    : 'All queued bands scanned'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setAutoScrapeEnabled((v) => !v)}
                className="w-20 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center justify-center gap-1 shrink-0 transition"
              >
                {autoScrapeEnabled ? <Pause className="w-3 h-3 text-amber-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
                <span>{autoScrapeEnabled ? 'Pause' : 'Scrape'}</span>
              </button>

              {/* Subtle Bottom Progress Line */}
              <div
                className="absolute bottom-0 left-0 h-0.5 bg-emerald-500 transition-all duration-300"
                style={{ width: `${artists.length > 0 ? Math.round((scannedCount / artists.length) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ==========================================
          MAIN WORKSPACE (STICKY SIDEBAR + FEED)
      ========================================== */}
      <main className="max-w-[1600px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Desktop Sticky Left Sidebar */}
        <aside className="hidden lg:block lg:sticky lg:top-28 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto pr-1">
          {renderSidebarControls()}
        </aside>

        {/* Right Feed Area */}
        <section className="min-w-0 space-y-4">
          {/* Feed Top Toolbar: Search, View Switcher & Sort By */}
          <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Filter by band, shirt, hoodie, vinyl..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Switcher & Sort Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedBandId && (
                <button
                  type="button"
                  onClick={() => setSelectedBandId(null)}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  <span>Band: {artists.find((a) => a.id === selectedBandId)?.name}</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* View Mode Switcher */}
              <div className="flex bg-zinc-950 border border-zinc-800 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('BAND_CARDS');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    viewMode === 'BAND_CARDS' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Band Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('STREAM');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    viewMode === 'STREAM' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Product Stream ({streamProducts.length})</span>
                </button>
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-zinc-900">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Presets / Live Charts Strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {sourceTab === 'CHARTS' ? 'Live Charts:' : 'Quick Presets:'}
            </span>
            {sourceTab === 'CHARTS'
              ? CHART_PRESETS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => handleImportCharts(c.tag)}
                    className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-emerald-300 hover:border-emerald-500/50 transition"
                  >
                    ★ {c.label}
                  </button>
                ))
              : PRESET_PLAYLISTS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => handleImportSpotifyPlaylist(preset.url)}
                    className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-emerald-300 transition"
                  >
                    + {preset.label}
                  </button>
                ))}
          </div>

          {/* ==========================================
              VIEW MODE A: GROUPED BAND CARDS
          ========================================== */}
          {viewMode === 'BAND_CARDS' && (
            <>
              {paginatedArtists.length === 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
                  {activelyScanningIds.length > 0 ? (
                    <>
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                      <h3 className="text-base font-bold text-white">Scanning Stores Across 15 Retailers...</h3>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto">
                        Bands with matching merchandise will appear automatically as soon as live product feeds are discovered.
                      </p>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-8 h-8 text-zinc-600 mx-auto" />
                      <h3 className="text-base font-bold text-white">No Bands With Matching Products Yet</h3>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto">
                        Try relaxing your size/retailer filters, loading a chart or playlist above, or checking the{' '}
                        <span className="text-amber-300 font-semibold">No Merch</span> filter tab in the sidebar.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {paginatedArtists.map((artist) => {
                    const st = artistProcessedMap[artist.id] || {
                      globalFiltered: [],
                      storeCounts: {},
                      isScanning: false
                    };
                    const meta = discoveryMeta[artist.id] || {};
                    const activeBandSite = bandSiteFilters[artist.id] || 'ALL';
                    const isExpanded = Boolean(expandedBandCards[artist.id]);

                    let cardProducts =
                      activeBandSite === 'ALL'
                        ? st.globalFiltered
                        : st.globalFiltered.filter((p) => (p.sourcePlatform || 'OFFICIAL') === activeBandSite);

                    if (sortBy === 'PRICE_ASC') {
                      cardProducts = [...cardProducts].sort((a, b) => getNumericProductPrice(a) - getNumericProductPrice(b));
                    } else if (sortBy === 'PRICE_DESC') {
                      cardProducts = [...cardProducts].sort((a, b) => getNumericProductPrice(b) - getNumericProductPrice(a));
                    } else if (sortBy === 'TITLE_ASC') {
                      cardProducts = [...cardProducts].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
                    } else if (sortBy === 'TITLE_DESC') {
                      cardProducts = [...cardProducts].sort((a, b) => String(b.title || '').localeCompare(String(a.title || '')));
                    } else {
                      cardProducts = interleaveProductsByPlatform(cardProducts);
                    }

                    const visibleProducts = isExpanded ? cardProducts : cardProducts.slice(0, 24);
                    const matchedStoreEntries = Object.entries(st.storeCounts).sort((a, b) => b[1] - a[1]);

                    return (
                      <article
                        key={artist.id}
                        className="relative rounded-2xl border border-zinc-800/90 bg-zinc-900/80 overflow-hidden shadow-lg"
                      >
                        {/* Blurred Atmospheric Artist Photo Backdrop */}
                        {artist.image && (
                          <div
                            className="absolute inset-0 bg-cover bg-center opacity-20 blur-2xl scale-110 pointer-events-none"
                            style={{ backgroundImage: `url(${artist.image})` }}
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/85 to-zinc-950/95 pointer-events-none" />

                        <div className="relative p-4 sm:p-5 space-y-4">
                          {/* Band Card Header */}
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Artist Portrait Avatar */}
                              {artist.image ? (
                                <img
                                  src={artist.image}
                                  alt={artist.name}
                                  className="w-12 h-12 rounded-xl object-cover border border-zinc-700/80 shrink-0 shadow"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-400 font-bold text-base shrink-0">
                                  {artist.name.slice(0, 2).toUpperCase()}
                                </div>
                              )}

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-lg font-extrabold text-white tracking-tight truncate">
                                    {artist.name}
                                  </h3>
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 tabular-nums">
                                    {cardProducts.length} {cardProducts.length === 1 ? 'item' : 'items'}
                                  </span>

                                  {/* Compact Color-Coded Per-Band Store Toggles */}
                                  {matchedStoreEntries.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {matchedStoreEntries.map(([platId, cnt]) => {
                                        const plat = PLATFORM_MAP[platId] || PLATFORM_MAP.OFFICIAL;
                                        const isPillActive = activeBandSite === platId;
                                        return (
                                          <button
                                            key={platId}
                                            type="button"
                                            onClick={() =>
                                              setBandSiteFilters((prev) => ({
                                                ...prev,
                                                [artist.id]: isPillActive ? 'ALL' : platId
                                              }))
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition flex items-center gap-1 ${
                                              isPillActive
                                                ? plat.pillActive
                                                : `bg-zinc-950/80 border-zinc-800 hover:border-zinc-700 ${plat.textClass}`
                                            }`}
                                          >
                                            <span>{plat.label}</span>
                                            <span className="opacity-80 tabular-nums">{cnt}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Genre Tags */}
                                {Array.isArray(artist.genres) && artist.genres.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {artist.genres.slice(0, 4).map((g) => (
                                      <span
                                        key={g}
                                        className="text-[10px] capitalize px-1.5 py-0.2 rounded bg-zinc-900/90 text-zinc-400 border border-zinc-800"
                                      >
                                        {g}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Compact Icon Action Bar */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {meta.officialWebsite && (
                                <a
                                  href={meta.officialWebsite}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Official Band Website"
                                  className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition"
                                >
                                  <Globe className="w-4 h-4" />
                                </a>
                              )}

                              {artist.spotifyUrl && (
                                <a
                                  href={artist.spotifyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open on Spotify"
                                  className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-emerald-400 hover:text-emerald-300 transition"
                                >
                                  <Music className="w-4 h-4" />
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => discoverArtistMerch(artist, true)}
                                disabled={st.isScanning}
                                title="Force Scrape All 15 Sites"
                                className="px-2.5 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${st.isScanning ? 'animate-spin text-emerald-400' : ''}`} />
                                <span className="hidden sm:inline">Rescan</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openBandLinksModal(artist)}
                                title="Edit Store URLs"
                                className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-amber-300 transition"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Product Grid */}
                          {visibleProducts.length > 0 ? (
                            <div className={`grid ${gridColsClass} gap-3`}>
                              {visibleProducts.map((product) => renderProductCard(product, artist.name, artist.id))}
                            </div>
                          ) : (
                            <div className="py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                              No products found for this band yet. Click the Edit icon to add a custom store URL.
                            </div>
                          )}

                          {/* Show All X Items Toggle if > 24 */}
                          {cardProducts.length > 24 && (
                            <div className="pt-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedBandCards((prev) => ({ ...prev, [artist.id]: !isExpanded }))
                                }
                                className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                    <span>Show Fewer Items</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    <span>Show All {cardProducts.length} Items</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Pagination Controls (Band Cards) */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {/* ==========================================
              VIEW MODE B: FLAT PRODUCT STREAM
          ========================================== */}
          {viewMode === 'STREAM' && (
            <>
              {paginatedStreamProducts.length === 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-10 text-center space-y-2">
                  <ShoppingBag className="w-8 h-8 text-zinc-600 mx-auto" />
                  <h3 className="text-base font-bold text-white">No Matching Products in Stream</h3>
                  <p className="text-xs text-zinc-400">Adjust your filters or wait for active workers to finish scanning.</p>
                </div>
              ) : (
                <div className={`grid ${gridColsClass} gap-3`}>
                  {paginatedStreamProducts.map((product) =>
                    renderProductCard(product, product._artistName, product._artistId)
                  )}
                </div>
              )}

              {totalStreamPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-3">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    Page {currentPage} of {totalStreamPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalStreamPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalStreamPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* ==========================================
          MOBILE STICKY BOTTOM FILTER TRIGGER
      ========================================== */}
      <div className="lg:hidden fixed bottom-4 inset-x-4 z-30 flex justify-center pointer-events-none">
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="pointer-events-auto px-5 py-3 rounded-2xl bg-emerald-500 text-zinc-950 font-extrabold text-xs shadow-2xl shadow-emerald-500/30 flex items-center gap-2"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filters & Band Directory ({artists.length})</span>
        </button>
      </div>

      {/* Mobile Filter Drawer */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-zinc-950 border-t border-zinc-800 rounded-t-3xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">Filters & Band Directory</span>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">{renderSidebarControls()}</div>
          </div>
        </div>
      )}

      {/* ==========================================
          15-SITE BAND LINKS EDITOR MODAL (WITH LOCK PROTECTION)
      ========================================== */}
      {editingArtist && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Edit Store & Retailer Links: {editingArtist.name}</h3>
                <p className="text-xs text-zinc-400">
                  Verified URLs that yield products are shared with the server cache automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingArtist(null)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBandLinks} className="p-4 overflow-y-auto space-y-3">
              {unlockWarningField && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-200 text-xs flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Warning: This URL previously found live products.</p>
                      <p className="text-amber-300/80 mt-0.5">
                        Changing it may replace working product feeds if the new URL is invalid.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockedFields((prev) => ({ ...prev, [unlockWarningField]: true }));
                      setUnlockWarningField(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 text-zinc-950 font-bold shrink-0"
                  >
                    Confirm Unlock
                  </button>
                </div>
              )}

              {/* Official Band Website */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Official Band Website</label>
                <input
                  type="url"
                  value={linkForm.WEBSITE || ''}
                  onChange={(e) => setLinkForm((prev) => ({ ...prev, WEBSITE: e.target.value }))}
                  placeholder="https://bandname.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* All 15 Retailer Override Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {SITE_OVERRIDE_FIELDS.map((field) => {
                  const hasProductsOnSite = (artistProcessedMap[editingArtist.id]?.storeCounts?.[field.key] || 0) > 0;
                  const isLocked = hasProductsOnSite && !unlockedFields[field.key];

                  return (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-zinc-300">{field.label}</label>
                        {hasProductsOnSite && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Products Found
                          </span>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="url"
                          disabled={isLocked}
                          value={linkForm[field.key] || ''}
                          onChange={(e) => setLinkForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className={`w-full bg-zinc-950 border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                            isLocked
                              ? 'border-zinc-800/70 text-zinc-500 pr-20 cursor-not-allowed'
                              : 'border-zinc-800 text-zinc-100 focus:border-emerald-500'
                          }`}
                        />
                        {isLocked && (
                          <button
                            type="button"
                            onClick={() => setUnlockWarningField(field.key)}
                            className="absolute right-1.5 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Unlock</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingArtist(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Save & Scrape Links</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          PRODUCT QUICK-VIEW & SIZE WATCH MODAL
      ========================================== */}
      {quickViewProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {quickViewProduct._artistName}
              </span>
              <button
                type="button"
                onClick={() => setQuickViewProduct(null)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="aspect-square rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                {quickViewProduct.imageUrl ? (
                  <img
                    src={quickViewProduct.imageUrl}
                    alt={quickViewProduct.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <ShoppingBag className="w-10 h-10" />
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 ${
                        (PLATFORM_MAP[quickViewProduct.sourcePlatform] || PLATFORM_MAP.OFFICIAL).textClass
                      }`}
                    >
                      {(PLATFORM_MAP[quickViewProduct.sourcePlatform] || PLATFORM_MAP.OFFICIAL).label}
                    </span>
                    {isLimitedOrTourEdition(quickViewProduct) && (
                      <span className="inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                        Limited / Tour Edition
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white leading-snug">{quickViewProduct.title}</h3>
                  <p className="text-xl font-extrabold text-emerald-400 tabular-nums">
                    {formatProductPrice(quickViewProduct)}
                  </p>

                  {/* Size Availability & Restock Watchers */}
                  {Array.isArray(quickViewProduct.variants) && quickViewProduct.variants.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        Sizes (Click sold-out size to watch restock):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {quickViewProduct.variants.map((v, i) => {
                          const norm = normalizeSizeToken(v.title) || v.title;
                          const avail = v.available !== false;
                          const isWatched = restockWatches.some(
                            (w) =>
                              w.artistId === quickViewProduct._artistId &&
                              w.productUrl === quickViewProduct.productUrl &&
                              w.size === norm
                          );

                          return (
                            <button
                              key={`${v.id || i}`}
                              type="button"
                              disabled={avail}
                              onClick={() =>
                                !avail &&
                                toggleWatchSize(
                                  quickViewProduct,
                                  quickViewProduct._artistId,
                                  quickViewProduct._artistName,
                                  norm
                                )
                              }
                              className={`px-2 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 ${
                                avail
                                  ? 'bg-zinc-950 border-zinc-800 text-zinc-200 cursor-default'
                                  : isWatched
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                  : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-500 hover:text-amber-300'
                              }`}
                            >
                              <span className={!avail ? 'line-through' : ''}>{norm}</span>
                              {!avail && <Bell className="w-3 h-3" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => toggleSaveProduct(quickViewProduct, quickViewProduct._artistName)}
                    className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isProductSaved(quickViewProduct) ? 'text-rose-400 fill-rose-400' : ''
                      }`}
                    />
                  </button>
                  <a
                    href={quickViewProduct.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Buy on Store</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          SAVED MERCH WISHLIST & RESTOCK WATCHER DRAWER
      ========================================== */}
      {showSavedDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="bg-zinc-950 border-l border-zinc-800 w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
                <h3 className="text-sm font-bold text-white">Saved Merch ({savedItems.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSavedDrawer(false)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Restock Watchers Section */}
              {restockWatches.length > 0 && (
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <BellRing className="w-3.5 h-3.5" />
                      Size Restock Watchers ({restockWatches.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {restockWatches.map((w) => (
                      <div
                        key={w.id}
                        className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-200 truncate">
                            {w.artistName} — {w.title}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            Size: <span className="text-amber-300 font-bold">{w.size}</span>{' '}
                            {w.backInStock && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                BACK IN STOCK!
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRestockWatches((prev) => prev.filter((x) => x.id !== w.id))}
                          className="text-zinc-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved Wishlist Items */}
              {savedItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 space-y-2">
                  <Heart className="w-8 h-8 mx-auto opacity-30" />
                  <p>No saved merch items yet. Click the heart icon on any product thumbnail to save it here.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {savedItems.map((item) => {
                    const plat = PLATFORM_MAP[item.sourcePlatform] || PLATFORM_MAP.OFFICIAL;
                    return (
                      <div
                        key={`${item.productUrl}-${item.title}`}
                        className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center gap-3"
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-14 h-14 rounded-lg object-cover bg-zinc-950 shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-zinc-950 flex items-center justify-center text-zinc-600 shrink-0">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-emerald-400 truncate">{item.artistName}</p>
                          <a
                            href={item.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-zinc-100 hover:text-emerald-300 line-clamp-1"
                          >
                            {item.title}
                          </a>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-white tabular-nums">
                              {formatProductPrice(item)}
                            </span>
                            <span className={`text-[10px] font-semibold ${plat.textClass}`}>{plat.label}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSaveProduct(item, item.artistName)}
                          className="p-1.5 text-zinc-500 hover:text-red-400"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {savedItems.length > 0 && (
              <div className="p-4 border-t border-zinc-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = savedItems
                      .map((i) => `${i.artistName} - ${i.title} (${formatProductPrice(i)}): ${i.productUrl}`)
                      .join('\n');
                    navigator.clipboard.writeText(text);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200"
                >
                  Copy All Links
                </button>
                <button
                  type="button"
                  onClick={() => setSavedItems([])}
                  className="py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-xs font-semibold text-red-300"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
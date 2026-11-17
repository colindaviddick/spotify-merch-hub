# MerchPulse — 15-Site Band Merch Aggregator & Discovery Hub

**MerchPulse** is a full-stack React + Node.js web application that connects to your Spotify library (or imports any public Spotify playlist) and automatically scans **15+ official band stores, indie merch distributors, and global marketplaces** to aggregate live product availability, pricing, and apparel sizes in one unified dashboard[cite: 7].

---

## Key Features

### Spotify Integration & No-Login Playlist Import
* **OAuth 2.0 PKCE Authentication:** Securely syncs your followed artists and liked tracks directly from Spotify without exposing client secrets[cite: 7].
* **Public Playlist URL Scanner:** Paste any public Spotify playlist link (`https://open.spotify.com/playlist/...`) to extract all featured bands and start scanning merch immediately—no Spotify Developer account or login required.
* **Custom Client ID Support:** Includes an in-app troubleshooting guide allowing users to plug in their own Spotify Developer `Client ID` to bypass Spotify's 5-user Development Mode cap.

### 15-Site Live Merch Aggregator
Automatically discovers and scrapes live products (with round-robin interleaving so no single store monopolizes your feed) across[cite: 7]:
* **Direct Artist Stores:** Official Shopify storefronts, Bandcamp Merch pages, and BigCartel DIY stores[cite: 7].
* **Global & Indie Distributors:** Evil Greed, Eyesore Merch UK, Merchbar (Algolia), IndieMerchstore, Holy Mountain Printing, Cold Cuts Merch, Hello Merch, Down Right Merch, 24Hundred, Impericon, Kings Road Merch, and Amazon[cite: 7].
* **Per-Band & Global Store Toggles:** Filter your entire feed or an individual artist's card by retailer, product category (T-Shirts, Hoodies, Longsleeves, Vinyl/Media, Hats, Patches/Misc), region (`UK`, `EU`, `US`, `AU`, `GLOBAL`), and in-stock status[cite: 7].
* **Extended Size Normalization:** Automatically normalizes variant sizing across `XS` through `5XL` plus `YOUTH`[cite: 7].

### Performance & Customization
* **Turbo Parallel Scraper:** Adjustable concurrency (`1x`, `3x`, `5x`, `8x` parallel workers) backed by a local/server JSON cache (`merch-cache.json`) and browser `localStorage`[cite: 6, 7].
* **Dynamic CDN Thumbnail Resizing:** Switch between `Compact` (180px), `Medium` (280px), `Large` (440px), and `XL` (680px) thumbnails on the fly to save bandwidth[cite: 7].
* **Per-Band Link Editor:** Override or add custom URLs for any of the 15 platforms or regional storefronts per artist, with safety locks protecting links that have already yielded live products[cite: 7].

---

## Tech Stack

* **Frontend:** React, Vite, Tailwind CSS, Lucide Icons[cite: 6, 7]
* **Backend:** Node.js, Express (serves both the `/api` discovery/playlist endpoints and the built production `dist/` bundle)
* **Storage:** Disk-backed `merch-cache.json` + lean `localStorage` persistence[cite: 6, 7]

---

## Local Setup & Development

### 1. Clone the Repository
```bash
git clone [https://github.com/colindaviddick/spotify-merch-hub.git](https://github.com/colindaviddick/spotify-merch-hub.git)
cd spotify-merch-hub
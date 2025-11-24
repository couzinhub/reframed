// assumes config.js, test.js, and shared.js are loaded before this script
// config.js provides: IMAGEKIT_URL_ENDPOINT, ARTWRK_R_CACHE, SEARCH_CACHE, HOMEPAGE_CSV_URL
// test.js provides: ART_CACHE_TK
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ============ HOMEPAGE ROWS (SHEET PARSE) ============
//
// First row of HOMEPAGE_CSV_URL is assumed to be:
// "Tag","Label"

async function loadHomepageRows() {
  const res = await fetch(HOMEPAGE_CSV_URL, { cache: "default" });
  if (!res.ok) {
    throw new Error("Could not load homepage sheet (HTTP " + res.status + ")");
  }

  const csvText = await res.text();
  const rows = parseCSV(csvText);
  if (!rows.length) return [];

  const headerRow = rows[0];

  const colIndex = {};
  headerRow.forEach((raw, i) => {
    const key = (raw || "").toLowerCase().trim();
    if (key) colIndex[key] = i;
  });

  function pick(rowArr, ...possibleHeaders) {
    for (const name of possibleHeaders) {
      const idx = colIndex[name.toLowerCase()];
      if (idx !== undefined) {
        return (rowArr[idx] || "").trim();
      }
    }
    return "";
  }

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const rowArr = rows[r];

    const tagVal   = pick(rowArr, "tag");
    const labelVal = pick(rowArr, "label");

    if (!tagVal) continue;
    if (tagVal.toLowerCase().startsWith("-- ignore")) break;

    out.push({
      tag: tagVal,
      label: labelVal || tagVal
    });
  }

  return out;
}

// ============ IMAGE FETCH / IMAGE PICK ============
async function fetchImagesForHomepage(tagName) {
  // Use shared helper function (works with both Cloudinary and ImageKit)
  let items = await fetchImagesForTag(tagName);

  // newest first
  items = items.sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  return items;
}

function chooseFeaturedImage(row, images) {
  console.log('chooseFeaturedImage called for tag:', row.tag);
  console.log('Total images:', images.length);

  // First, always check for "thumbnail" tagged image (for both collections and artists)
  const thumbnailImage = images.find(img =>
    img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail')
  );

  if (thumbnailImage) {
    console.log('Found thumbnail image:', thumbnailImage.public_id);
    return thumbnailImage;
  }

  console.log('No thumbnail image found, using auto-select');

  // Filter out portrait images (height > width)
  const landscapeOrSquare = images.filter(img => img.width >= img.height);

  // Use filtered list if available, otherwise fall back to all images
  const finalList = landscapeOrSquare.length > 0 ? landscapeOrSquare : images;

  const selected = finalList.length > 0 ? finalList[0] : null;
  console.log('Auto-selected image:', selected ? selected.public_id : 'none');
  return selected;
}

// ============ HOMEPAGE CACHE WITH VERSION CHECK ============

const HOMEPAGE_CACHE_KEY = "reframed_homepage_cache_v2"; // bumped so old v1 won't interfere

function loadHomepageCache(expectedVersion) {
  try {
    const raw = localStorage.getItem(HOMEPAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // must have version, savedAt, and tiles array
    if (!parsed.savedAt || !Array.isArray(parsed.tiles) || !parsed.version) {
      return null;
    }

    // version mismatch? invalidate
    if (expectedVersion && parsed.version !== expectedVersion) {
      return null;
    }

    // TTL expired? invalidate
    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveHomepageCache(version, tiles) {
  try {
    localStorage.setItem(
      HOMEPAGE_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        version: version || "", // whatever we got from settings
        tiles: tiles
      })
    );
  } catch {
    // ignore quota errors
  }
}

// ============ TILE DOM / LAYOUT ============

function buildTileElementFromCache(tileData) {
  const tile = document.createElement("a");
  tile.className = "tile full-width";
  tile.href = tileData.chosen.linkHref;
  tile.setAttribute("aria-label", tileData.row.label);

  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = tileData.chosen.thumbUrl;
  img.alt = tileData.chosen.niceTitle;

  const titleDiv = document.createElement("div");
  titleDiv.className = "title";
  titleDiv.textContent = tileData.row.label;

  tile.appendChild(img);
  tile.appendChild(titleDiv);

  return tile;
}

// Simple function that returns all tiles as-is
function buildRowGroupsFromOrderedTiles(tiles) {
  return tiles;
}

function renderGroupsInto(container, tiles) {
  const tilesContainer = document.createElement("div");
  tilesContainer.className = "homepage-tiles";

<<<<<<< HEAD
  // Show first two tiles side by side
  if (tiles.length > 0) {
    const featuredRow = document.createElement("div");
    featuredRow.className = "featured-row";

    tiles[0].el.classList.add("featured");
    featuredRow.appendChild(tiles[0].el);

    if (tiles.length > 1) {
      tiles[1].el.classList.add("featured");
      featuredRow.appendChild(tiles[1].el);
    }

    tilesContainer.appendChild(featuredRow);
=======
  // First tile gets special treatment
  if (tiles.length > 0) {
    tiles[0].el.classList.add("primary");
    tilesContainer.appendChild(tiles[0].el);
  }

  // Remaining tiles go in a row container
  if (tiles.length > 1) {
    const rowContainer = document.createElement("div");
    rowContainer.className = "secondary-row";

    for (let i = 1; i < tiles.length; i++) {
      tiles[i].el.classList.add("secondary");
      rowContainer.appendChild(tiles[i].el);
    }

    tilesContainer.appendChild(rowContainer);
>>>>>>> parent of 291f884 (Merge pull request #2 from couzinhub/main)
  }

  container.appendChild(tilesContainer);
}

function renderFromTiles(container, tilesData) {
  const tiles = tilesData.map(td => ({
    row: {
      tag: td.row.tag,
      label: td.row.label
    },
    el: buildTileElementFromCache(td)
  }));

  const tilesArray = buildRowGroupsFromOrderedTiles(tiles);

  // keep the first child of container (your header stuff), wipe the rest
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }

  renderGroupsInto(container, tilesArray);
}

// ============ RECENTLY ADDED SECTION ============

const RECENTLY_ADDED_CACHE_KEY = "reframed_recently_added_v1";

function loadRecentlyAddedCache() {
  try {
    const raw = localStorage.getItem(RECENTLY_ADDED_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || !parsed.items) return null;

    // Check TTL (use same as main cache)
    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) return null;

    return parsed.items;
  } catch {
    return null;
  }
}

function saveRecentlyAddedCache(items) {
  try {
    localStorage.setItem(RECENTLY_ADDED_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      items: items
    }));
  } catch {
    // Ignore quota errors
  }
}

async function fetchRecentlyAdded() {
  try {
    // Check cache first
    const cached = loadRecentlyAddedCache();
    if (cached) {
      return cached;
    }

    // Fetch all files from ImageKit
    const allFiles = await fetchAllImageKitFiles();

    // Sort by most recent activity (upload or update), newest first
    const sorted = allFiles
      .sort((a, b) => {
        // Get the most recent date for each file (either created or updated)
        const aDate = [a.createdAt, a.updatedAt].filter(Boolean).sort().reverse()[0] || "";
        const bDate = [b.createdAt, b.updatedAt].filter(Boolean).sort().reverse()[0] || "";
        return bDate.localeCompare(aDate);
      });

    // Take only the first 50 items and transform to expected format
    const recentItems = sorted.slice(0, 50).map(file => ({
      public_id: file.filePath.substring(1), // Remove leading slash
      file_id: file.fileId,
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
      tags: file.tags || []
    }));

    // Filter items that need version count check (updated > 1 hour after creation AND updated within last 12 days)
    const itemsNeedingVersionCheck = recentItems.filter(item => {
      if (!item.updated_at || !item.created_at) return false;

      const updatedDate = new Date(item.updated_at);
      const createdDate = new Date(item.created_at);

      const hoursSinceCreation = (updatedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
      const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);

      return hoursSinceCreation > 1 && daysSinceUpdate <= 12;
    });

    // Fetch version counts only for items that need it
    const versionCounts = await Promise.all(
      itemsNeedingVersionCheck.map(item => fetchFileVersionCount(item.file_id))
    );

    // Map version counts back to items
    const versionCountMap = new Map();
    itemsNeedingVersionCheck.forEach((item, index) => {
      versionCountMap.set(item.file_id, versionCounts[index]);
    });

    // Add version_count to all items
    const finalItems = recentItems.map(item => ({
      ...item,
      version_count: versionCountMap.get(item.file_id) || 1
    }));

    // Save to cache
    saveRecentlyAddedCache(finalItems);

    return finalItems;
  } catch (err) {
    console.error('Error fetching recently uploaded:', err);
    return [];
  }
}

function renderRecentlyAdded(container, images) {
  if (!images || images.length === 0) return;

  const section = document.createElement("div");
  section.className = "recently-added-section";

  const title = document.createElement("h3");
  title.className = "recently-added-title";
  title.textContent = "Recently added";
  section.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "recently-added-grid";

  let currentIndex = 0;
  const itemsPerLoad = 10;

  function loadMore() {
    const endIndex = Math.min(currentIndex + itemsPerLoad, images.length);
    const batch = images.slice(currentIndex, endIndex);

    batch.forEach(img => {
      const publicId = img.public_id;
      const niceName = humanizePublicId(publicId);
      const card = createArtworkCard(publicId, niceName, img.tags, img.width, img.height, img.updated_at, img.created_at, img.file_id, img.version_count);
      grid.appendChild(card);
    });

    currentIndex = endIndex;

    // Hide load more button if all items are loaded
    if (currentIndex >= images.length) {
      loadMoreBtn.style.display = "none";
    }
  }

  // Load initial batch
  loadMore();

  section.appendChild(grid);

  // Create load more button
  const loadMoreBtn = document.createElement("button");
  loadMoreBtn.className = "load-more-btn";
  loadMoreBtn.textContent = "Load more";
  loadMoreBtn.onclick = loadMore;

  // Hide button if all items are already loaded
  if (currentIndex >= images.length) {
    loadMoreBtn.style.display = "none";
  }

  section.appendChild(loadMoreBtn);
  container.appendChild(section);
}

<<<<<<< HEAD
// ============ BROWSE FUNCTIONALITY ============

// ---------- SEARCH CACHE ----------
const SEARCH_CACHE_KEY = "reframed_search_cache_v4";
let ALL_ARTWORKS = null;

// ---------- COLLECTIONS CACHE ----------
let COLLECTIONS_CACHE = null;
const COLLECTIONS_LOCALSTORAGE_KEY = "reframed_collections_cache_v4";
const USED_THUMBNAILS = new Set();

// ---------- ARTWORK DISPLAY STATE ----------
let DISPLAYED_ARTWORKS = [];
let DISPLAYED_COUNT = 0;
let CURRENT_TAB = 'new';
const ITEMS_PER_PAGE = 30;

// ---------- CACHE FUNCTIONS ----------
function loadSearchCache() {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.artworks)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed.artworks;
  } catch {
    return null;
  }
}

function saveSearchCache(artworks) {
  try {
    localStorage.setItem(
      SEARCH_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        artworks: artworks
      })
    );
  } catch {
    // ignore quota errors
  }
}

function loadCollectionsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(COLLECTIONS_LOCALSTORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.collections)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed.collections;
  } catch {
    return null;
  }
}

function saveCollectionsToLocalStorage(collections) {
  try {
    localStorage.setItem(
      COLLECTIONS_LOCALSTORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        collections: collections
      })
    );
  } catch {
    // ignore quota errors
  }
}

// ---------- FETCH ALL ARTWORKS ----------
async function fetchAllArtworks() {
  // Try cache first
  const cached = loadSearchCache();
  if (cached && Array.isArray(cached)) {
    return cached;
  }

  // Fetch from ImageKit
  const files = await fetchAllImageKitFiles();

  // Transform to artwork objects with searchable names and tags
  let artworks = files.map(file => ({
    public_id: file.filePath.substring(1), // Remove leading slash
    file_id: file.fileId,
    width: file.width,
    height: file.height,
    created_at: file.createdAt,
    updated_at: file.updatedAt,
    tags: file.tags || [],
    searchName: humanizePublicId(file.filePath.substring(1)).toLowerCase()
  }));

  // Filter items that need version count check
  const itemsNeedingVersionCheck = artworks.filter(artwork => {
    if (!artwork.updated_at || !artwork.created_at) return false;

    const updatedDate = new Date(artwork.updated_at);
    const createdDate = new Date(artwork.created_at);

    const hoursSinceCreation = (updatedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
    const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);

    return hoursSinceCreation > 1 && daysSinceUpdate <= 12;
  });

  // Fetch version counts in batches
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 100;
  const versionCounts = [];

  for (let i = 0; i < itemsNeedingVersionCheck.length; i += BATCH_SIZE) {
    const batch = itemsNeedingVersionCheck.slice(i, i + BATCH_SIZE);
    const batchCounts = await Promise.all(
      batch.map(artwork => fetchFileVersionCount(artwork.file_id))
    );
    versionCounts.push(...batchCounts);

    if (i + BATCH_SIZE < itemsNeedingVersionCheck.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Map version counts back to items
  const versionCountMap = new Map();
  itemsNeedingVersionCheck.forEach((artwork, index) => {
    versionCountMap.set(artwork.file_id, versionCounts[index]);
  });

  // Add version_count to all artworks
  artworks = artworks.map(artwork => ({
    ...artwork,
    version_count: versionCountMap.get(artwork.file_id) || 1
  }));

  // Sort newest first
  artworks.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Save to cache
  saveSearchCache(artworks);

  return artworks;
}

// ---------- COLLECTIONS FUNCTIONS ----------
async function loadCollectionRows() {
  const files = await fetchAllImageKitFiles();

  const collectionTagsSet = new Set();
  files.forEach(file => {
    if (file.tags && Array.isArray(file.tags)) {
      file.tags.forEach(tag => {
        const trimmedTag = tag.trim();
        if (trimmedTag.toLowerCase().startsWith('collection - ')) {
          collectionTagsSet.add(trimmedTag);
        }
      });
    }
  });

  const collectionTags = Array.from(collectionTagsSet).sort((a, b) => {
    const nameA = a.substring(13);
    const nameB = b.substring(13);
    return nameA.localeCompare(nameB);
  });

  return collectionTags.map(tag => ({
    tag: tag,
    label: tag.substring(13),
    featuredPublicId: ""
  }));
}

async function fetchImagesForCollection(tagName) {
  const items = await fetchImagesForTag(tagName);

  const all = items.sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  return { all, count: all.length };
}

function pickFeaturedImage(row, imageSets, usedThumbnails = null) {
  const thumbnailImage = imageSets.all.find(img => {
    if (usedThumbnails && usedThumbnails.has(img.public_id)) {
      return false;
    }
    return img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail');
  });

  if (thumbnailImage) {
    if (usedThumbnails) {
      usedThumbnails.add(thumbnailImage.public_id);
    }
    return thumbnailImage;
  }

  const desired = (row.featuredPublicId || "").trim().toLowerCase();
  if (desired) {
    function matches(img) {
      if (usedThumbnails && usedThumbnails.has(img.public_id)) {
        return false;
      }
      const id = (img.public_id || "").toLowerCase();
      return (
        id === desired ||
        id.startsWith(desired) ||
        id.endsWith(desired) ||
        id.includes(desired)
      );
    }

    const chosen = imageSets.all.find(matches);
    if (chosen) {
      if (usedThumbnails) {
        usedThumbnails.add(chosen.public_id);
      }
      return chosen;
    }
  }

  const availableImage = imageSets.all.find(img =>
    !usedThumbnails || !usedThumbnails.has(img.public_id)
  );

  if (availableImage && usedThumbnails) {
    usedThumbnails.add(availableImage.public_id);
  }

  return availableImage || imageSets.all[0] || null;
}

function buildCollectionCard(row, imgData) {
  const prettyTag = row.tag.trim()
    .replace(/-/g, "%2D")
    .replace(/\s+/g, "-");

  const card = document.createElement("a");
  card.className = "card artist";
  card.href = "/tag/#" + prettyTag;
  card.setAttribute("aria-label", row.label);
  card.setAttribute("data-tag", row.tag);

  const thumbWrapper = document.createElement("div");
  thumbWrapper.className = "thumb";

  if (imgData) {
    const niceName = humanizePublicId(imgData.public_id);
    const thumbUrl = getThumbnailUrlWithCrop(imgData.public_id, 700, imgData.updated_at);
    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = thumbUrl;
    imgEl.alt = niceName;
    thumbWrapper.appendChild(imgEl);
  } else {
    thumbWrapper.classList.add("placeholder");
  }

  card.appendChild(thumbWrapper);

  const labelEl = document.createElement("div");
  labelEl.className = "artist-name";

  const cacheItem = COLLECTIONS_CACHE
    ? COLLECTIONS_CACHE.find(c => c.row.tag === row.tag)
    : null;

  const countSpan = document.createElement("span");
  countSpan.className = "art-count";

  if (cacheItem && typeof cacheItem.imageCount === "number") {
    countSpan.textContent = `(${cacheItem.imageCount})`;
  } else {
    countSpan.textContent = "";
  }

  labelEl.textContent = row.label + " ";
  labelEl.appendChild(countSpan);

  card.__labelEl = labelEl;
  card.__countSpan = countSpan;
  card.appendChild(labelEl);

  card.addEventListener("click", (ev) => {
    ev.preventDefault();
    const dest = "/tag/#" + prettyTag;
    window.location.href = dest;
  });

  return card;
}

async function loadAndRenderCollections() {
  const gridEl = document.getElementById("searchGrid");
  const statusEl = document.getElementById("searchStatus");

  const cachedCollections = loadCollectionsFromLocalStorage();
  if (cachedCollections && Array.isArray(cachedCollections)) {
    COLLECTIONS_CACHE = cachedCollections;
    renderCollectionsGrid(COLLECTIONS_CACHE);
    setupCollectionsLazyLoad();
    statusEl.textContent = "";
    return;
  }

  statusEl.innerHTML = 'Loading collections<span class="spinner"></span>';

  try {
    const rows = await loadCollectionRows();

    COLLECTIONS_CACHE = rows.map(row => ({
      row,
      chosenImage: null,
      imageCount: null
    }));

    saveCollectionsToLocalStorage(COLLECTIONS_CACHE);
    renderCollectionsGrid(COLLECTIONS_CACHE);
    setupCollectionsLazyLoad();

    statusEl.textContent = "";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading collections: " + err.message;
  }
}

function renderCollectionsGrid(collectionsList) {
  const grid = document.getElementById("searchGrid");
  grid.innerHTML = "";
  grid.className = "grid";

  const frag = document.createDocumentFragment();
  for (const collection of collectionsList) {
    frag.appendChild(buildCollectionCard(collection.row, collection.chosenImage));
  }
  grid.appendChild(frag);
}

function setupCollectionsLazyLoad() {
  const cards = document.querySelectorAll(".card[data-tag]");

  const obs = new IntersectionObserver(async (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const cardEl = entry.target;
      const tagName = cardEl.getAttribute("data-tag");
      if (!tagName) {
        observer.unobserve(cardEl);
        continue;
      }

      const cacheItem = COLLECTIONS_CACHE.find(c => c.row.tag === tagName);
      if (!cacheItem) {
        observer.unobserve(cardEl);
        continue;
      }

      const alreadyHasThumb = !!cacheItem.chosenImage;
      const alreadyHasCount = typeof cacheItem.imageCount === "number";

      if (alreadyHasThumb && alreadyHasCount) {
        observer.unobserve(cardEl);
        continue;
      }

      const imageSets = await fetchImagesForCollection(tagName);

      if (!alreadyHasThumb) {
        const chosenImage = pickFeaturedImage(cacheItem.row, imageSets, USED_THUMBNAILS);
        cacheItem.chosenImage = chosenImage;

        const thumbWrapper = cardEl.querySelector(".thumb");
        if (thumbWrapper && chosenImage) {
          thumbWrapper.innerHTML = "";
          const niceName = humanizePublicId(chosenImage.public_id);
          const thumbUrl = getThumbnailUrlWithCrop(chosenImage.public_id, 700, chosenImage.updated_at);
          const imgEl = document.createElement("img");
          imgEl.loading = "lazy";
          imgEl.src = thumbUrl;
          imgEl.alt = niceName;
          thumbWrapper.appendChild(imgEl);
          thumbWrapper.classList.remove("placeholder");
        }
      }

      if (!alreadyHasCount) {
        cacheItem.imageCount = imageSets.count;
      }

      if (cardEl.__countSpan && typeof cacheItem.imageCount === "number") {
        cardEl.__countSpan.textContent = `(${cacheItem.imageCount})`;
      }

      saveCollectionsToLocalStorage(COLLECTIONS_CACHE);

      observer.unobserve(cardEl);
    }
  }, {
    root: null,
    rootMargin: "200px 0px 200px 0px",
    threshold: 0.01
  });

  cards.forEach(card => obs.observe(card));
}

// ---------- SORTING / FILTERING ----------
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function sortByRecent(artworks) {
  return [...artworks].sort((a, b) => {
    const aDate = [a.created_at, a.updated_at].filter(Boolean).sort().reverse()[0] || "";
    const bDate = [b.created_at, b.updated_at].filter(Boolean).sort().reverse()[0] || "";
    return bDate.localeCompare(aDate);
  });
}

function sortByRelevant(artworks, query) {
  if (!query) return artworks;

  return [...artworks].sort((a, b) => {
    const indexA = a.searchName.indexOf(query.toLowerCase());
    const indexB = b.searchName.indexOf(query.toLowerCase());

    if (indexA !== indexB) {
      return indexA - indexB;
    }

    return a.searchName.length - b.searchName.length;
  });
}

function sortByArtist(artworks) {
  return [...artworks].sort((a, b) => {
    const artistA = extractArtistFromTitle(humanizePublicId(a.public_id)) || '';
    const artistB = extractArtistFromTitle(humanizePublicId(b.public_id)) || '';

    const artistCompare = artistA.toLowerCase().localeCompare(artistB.toLowerCase());

    if (artistCompare === 0) {
      return a.searchName.localeCompare(b.searchName);
    }

    return artistCompare;
  });
}

function filterByOrientation(artworks, orientation) {
  if (orientation === 'vertical') {
    return artworks.filter(a => a.height > a.width);
  }
  return artworks;
}

function applySorting(artworks, searchQuery = '') {
  switch (CURRENT_TAB) {
    case 'new':
    case 'recent':
      return sortByRecent(artworks);
    case 'random':
      return shuffleArray(artworks);
    case 'artists':
      return sortByArtist(artworks);
    case 'vertical':
      return sortByRecent(artworks);
    case 'search':
      return sortByRelevant(artworks, searchQuery);
    default:
      return sortByRecent(artworks);
  }
}

function getLastName(artistName) {
  if (!artistName || artistName === 'Unknown Artist') return 'zzz';
  const parts = artistName.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function groupArtworksByArtist(artworks) {
  const grouped = new Map();

  for (const artwork of artworks) {
    const artist = extractArtistFromTitle(humanizePublicId(artwork.public_id)) || 'Unknown Artist';

    if (!grouped.has(artist)) {
      grouped.set(artist, []);
    }
    grouped.get(artist).push(artwork);
  }

  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    return getLastName(a[0]).localeCompare(getLastName(b[0]));
  });

  return sortedGroups;
}

// ---------- SEARCH FUNCTION ----------
function searchArtworks(query, artworks) {
  if (!query || query.trim() === "") {
    return null;
  }

  const searchTerms = query.toLowerCase().trim().split(/\s+/);

  return artworks.filter(artwork => {
    return searchTerms.every(term => artwork.searchName.includes(term));
  });
}

// ---------- RENDER FUNCTIONS ----------
function renderSearchResults(artworks) {
  const gridEl = document.getElementById("searchGrid");
  const statusEl = document.getElementById("searchStatus");

  gridEl.innerHTML = "";

  if (!artworks || artworks.length === 0) {
    statusEl.textContent = "No artworks found";
    return;
  }

  statusEl.textContent = "";

  if (CURRENT_TAB === 'artists') {
    const groups = groupArtworksByArtist(artworks);
    gridEl.className = "grouped-results";

    for (const [artist, groupArtworks] of groups) {
      const groupContainer = document.createElement("div");
      groupContainer.className = "artist-group";

      const header = document.createElement("h2");
      header.className = "artist-group-header";

      const headerLink = document.createElement("a");
      const artistTag = artist.replace(/-/g, "%2D").replace(/\s+/g, "-");
      headerLink.href = "/tag/#" + artistTag;
      headerLink.textContent = artist;
      header.appendChild(headerLink);

      groupContainer.appendChild(header);

      const artistGrid = document.createElement("div");
      artistGrid.className = "grid";

      const artworksToShow = groupArtworks.slice(0, 3);

      for (const artwork of artworksToShow) {
        const publicId = artwork.public_id;
        const niceName = humanizePublicId(publicId);
        const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height, artwork.updated_at, artwork.created_at, artwork.file_id, artwork.version_count);
        artistGrid.appendChild(card);
      }

      groupContainer.appendChild(artistGrid);
      gridEl.appendChild(groupContainer);
    }
  } else {
    gridEl.className = "grid";

    const frag = document.createDocumentFragment();

    for (const artwork of artworks) {
      const publicId = artwork.public_id;
      const niceName = humanizePublicId(publicId);
      const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height, artwork.updated_at, artwork.created_at, artwork.file_id, artwork.version_count);
      frag.appendChild(card);
    }

    gridEl.appendChild(frag);
  }
}

function showArtworks(reset = false) {
  const gridEl = document.getElementById("searchGrid");
  const statusEl = document.getElementById("searchStatus");

  if (reset) {
    const filtered = filterByOrientation(ALL_ARTWORKS, CURRENT_TAB);
    DISPLAYED_ARTWORKS = applySorting(filtered);
    DISPLAYED_COUNT = 0;
    gridEl.innerHTML = "";
  }

  if (CURRENT_TAB === 'artists') {
    statusEl.textContent = "";
    gridEl.className = "grouped-results";

    const groups = groupArtworksByArtist(DISPLAYED_ARTWORKS);

    for (const [artist, groupArtworks] of groups) {
      const groupContainer = document.createElement("div");
      groupContainer.className = "artist-group";

      const header = document.createElement("h2");
      header.className = "artist-group-header";

      const headerLink = document.createElement("a");
      const artistTag = artist.replace(/-/g, "%2D").replace(/\s+/g, "-");
      headerLink.href = "/tag/#" + artistTag;
      headerLink.textContent = artist;
      header.appendChild(headerLink);

      groupContainer.appendChild(header);

      const artistGrid = document.createElement("div");
      artistGrid.className = "grid";

      const artworksToShow = groupArtworks.slice(0, 3);

      for (const artwork of artworksToShow) {
        const publicId = artwork.public_id;
        const niceName = humanizePublicId(publicId);
        const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height, artwork.updated_at, artwork.created_at, artwork.file_id, artwork.version_count);
        artistGrid.appendChild(card);
      }

      groupContainer.appendChild(artistGrid);
      gridEl.appendChild(groupContainer);
    }

    DISPLAYED_COUNT = DISPLAYED_ARTWORKS.length;
    return false;
  }

  gridEl.className = "grid";

  const startIdx = DISPLAYED_COUNT;
  const endIdx = Math.min(DISPLAYED_COUNT + ITEMS_PER_PAGE, DISPLAYED_ARTWORKS.length);
  const artworksToShow = DISPLAYED_ARTWORKS.slice(startIdx, endIdx);

  statusEl.textContent = "";

  const frag = document.createDocumentFragment();
  for (const artwork of artworksToShow) {
    const publicId = artwork.public_id;
    const niceName = humanizePublicId(publicId);
    const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height, artwork.updated_at, artwork.created_at, artwork.file_id, artwork.version_count);
    frag.appendChild(card);
  }

  gridEl.appendChild(frag);
  DISPLAYED_COUNT = endIdx;

  return DISPLAYED_COUNT < DISPLAYED_ARTWORKS.length;
}

// ---------- INFINITE SCROLL ----------
function setupInfiniteScroll() {
  let isLoading = false;

  window.addEventListener("scroll", () => {
    if (CURRENT_TAB === 'search' || CURRENT_TAB === 'artists' || CURRENT_TAB === 'collections') {
      return;
    }

    if (isLoading) return;

    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.documentElement.scrollHeight - 500;

    if (scrollPosition >= threshold) {
      isLoading = true;
      const hasMore = showArtworks(false);
      isLoading = false;
    }
  });
}

// ---------- INIT BROWSE ----------
async function initBrowse() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  const searchInputContainer = document.querySelector(".search-input-container");
  const tabButtons = document.querySelectorAll(".tab-button");
  const statusEl = document.getElementById("searchStatus");

  if (!searchInput || !statusEl) return; // Elements not ready yet

  statusEl.innerHTML = 'Loading artworks<span class="spinner"></span>';

  try {
    ALL_ARTWORKS = await fetchAllArtworks();

    searchInput.placeholder = `Search through ${ALL_ARTWORKS.length} artworks`;

    const hash = window.location.hash.substring(1);
    const validTabs = ['new', 'collections', 'artists', 'vertical', 'search'];
    const initialTabName = hash === 'recent' ? 'new' : (validTabs.includes(hash) ? hash : 'new');

    CURRENT_TAB = initialTabName;
    const initialTab = document.querySelector(`[data-tab="${initialTabName}"]`);
    if (initialTab) {
      initialTab.classList.add('active');
    }

    if (initialTabName === 'vertical') {
      document.body.classList.add('vertical');
    }

    if (initialTabName === 'collections') {
      loadAndRenderCollections();
    } else if (initialTabName === 'search') {
      searchInputContainer.classList.remove('hidden');
      searchInput.focus();
    } else {
      showArtworks(true);
    }

    setupInfiniteScroll();

    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;

        if (tab === 'search') {
          if (CURRENT_TAB === 'search') {
            return;
          }

          CURRENT_TAB = 'search';
          window.location.hash = tab;

          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');

          document.body.classList.remove('vertical');

          searchInputContainer.classList.remove('hidden');
          searchInput.focus();

          const browseSection = document.getElementById('browse');
          if (browseSection) {
            browseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }

          const query = searchInput.value.trim();
          if (query) {
            const results = searchArtworks(query, ALL_ARTWORKS);
            if (results && results.length > 0) {
              const sorted = applySorting(results, query);
              renderSearchResults(sorted);
            }
          } else {
            document.getElementById("searchGrid").innerHTML = "";
            statusEl.textContent = "";
          }
        } else if (tab === 'collections') {
          CURRENT_TAB = 'collections';
          window.location.hash = tab;

          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');

          document.body.classList.remove('vertical');

          searchInputContainer.classList.add('hidden');

          loadAndRenderCollections();

          const browseSection = document.getElementById('browse');
          if (browseSection) {
            browseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          CURRENT_TAB = tab;
          window.location.hash = tab;

          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');

          if (tab === 'vertical') {
            document.body.classList.add('vertical');
          } else {
            document.body.classList.remove('vertical');
          }

          searchInputContainer.classList.add('hidden');

          showArtworks(true);

          const browseSection = document.getElementById('browse');
          if (browseSection) {
            browseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);

      const query = e.target.value;

      if (query) {
        clearButton.style.display = "block";
      } else {
        clearButton.style.display = "none";
      }

      searchTimeout = setTimeout(() => {
        const results = searchArtworks(query, ALL_ARTWORKS);

        if (results === null || results.length === 0) {
          document.getElementById("searchGrid").innerHTML = "";
          statusEl.textContent = query ? "No artworks found" : "";
        } else {
          const sorted = applySorting(results, query.trim());
          renderSearchResults(sorted);
        }
      }, 300);
    });

    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      clearButton.style.display = "none";
      document.getElementById("searchGrid").innerHTML = "";
      statusEl.textContent = "";
      searchInput.focus();
    });

    // ============ SCROLL BEHAVIOR FOR TABS/MENU SWITCHING ============
    setupTabsScrollBehavior();

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading artworks: " + err.message;
  }
}

// ============ TABS/MENU SCROLL BEHAVIOR ============
function setupTabsScrollBehavior() {
  const topBar = document.querySelector('.top-bar');
  const browseTabs = document.querySelector('.browse-tabs');
  const navMenu = document.querySelector('.nav-menu');
  const tipButton = document.querySelector('.tip-button-container');

  if (!topBar || !browseTabs || !navMenu || !tipButton) return;

  let lastScrollY = window.scrollY;
  let tabsOverlaying = false;

  // Get the original position of tabs
  const section = browseTabs.parentElement;
  const getTabsOriginalTop = () => {
    const sectionRect = section.getBoundingClientRect();
    const tabsOffsetInSection = browseTabs.offsetTop - section.offsetTop;
    return sectionRect.top + window.scrollY + tabsOffsetInSection;
  };

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const scrollDirection = currentScrollY > lastScrollY ? 'down' : 'up';
    lastScrollY = currentScrollY;

    const tabsRect = browseTabs.getBoundingClientRect();
    const topBarHeight = topBar.offsetHeight;
    const tabsOriginalTop = getTabsOriginalTop();

    // Calculate if tabs would naturally be at the top bar position
    const tabsReachedTop = (tabsOriginalTop - currentScrollY) <= topBarHeight;

    if (tabsReachedTop && scrollDirection === 'down') {
      // Tabs reached the top, make them overlay
      if (!tabsOverlaying) {
        tabsOverlaying = true;
        browseTabs.classList.add('tabs-overlaying');
        navMenu.style.opacity = '0';
        navMenu.style.pointerEvents = 'none';
        tipButton.style.opacity = '0';
        tipButton.style.pointerEvents = 'none';
      }
    } else if (scrollDirection === 'up' && tabsOverlaying) {
      // Scrolling up, show nav menu again when tabs move below top bar
      const tabsShouldStopOverlaying = (tabsOriginalTop - currentScrollY) > topBarHeight;

      if (tabsShouldStopOverlaying) {
        tabsOverlaying = false;
        browseTabs.classList.remove('tabs-overlaying');
        navMenu.style.opacity = '1';
        navMenu.style.pointerEvents = 'auto';
        tipButton.style.opacity = '1';
        tipButton.style.pointerEvents = 'auto';
      }
    }
  }, { passive: true });
}

// ============ MAIN HOMEPAGE BOOTSTRAP ============
=======
// ============ MAIN BOOTSTRAP ============
>>>>>>> parent of 291f884 (Merge pull request #2 from couzinhub/main)

(async function initHomepage() {
  const container = document.getElementById("homeView");
  const pageLoader = document.getElementById("pageLoader");

  try {
    // 1. Try to use cache if version matches
    const cached = loadHomepageCache(CACHE_VERSION);
    if (cached && Array.isArray(cached.tiles)) {
      // Hide loader immediately - we have cached content
      if (pageLoader) {
        pageLoader.style.display = 'none';
      }

      renderFromTiles(container, cached.tiles);

      // Load recently added artworks (not cached)
      const recentImages = await fetchRecentlyAdded();
      renderRecentlyAdded(container, recentImages);

      return;
    }

    // 2. No valid cache → rebuild fresh (show loader)

    // Load rows from the Google Sheet
    const rowsData = await loadHomepageRows();

    const liveTilesResults = await Promise.all(
      rowsData.map(async (row) => {
        try {
          const images = await fetchImagesForHomepage(row.tag);
          if (!images.length) return null;

          const chosen = chooseFeaturedImage(row, images);
          if (!chosen) return null;

          const publicId = chosen.public_id;
          const niceTitle = humanizePublicId(publicId);

          const thumbWidth = 1400;
          const thumbUrl = getThumbnailUrlWithCrop(publicId, thumbWidth, chosen.updated_at);

          // Convert spaces to dashes for pretty URLs, but encode hyphens as %2D
          const prettyTag = row.tag.trim()
            .replace(/-/g, "%2D")
            .replace(/\s+/g, "-");

          return {
            row: {
              tag: row.tag,
              label: row.label
            },
            chosen: {
              public_id: publicId,
              niceTitle: niceTitle,
              thumbWidth: thumbWidth,
              thumbUrl: thumbUrl,
              linkHref: `/tag/#${prettyTag}`
            }
          };
        } catch (err) {
          console.error(`Failed to fetch images for tag "${row.tag}":`, err);
          return null;
        }
      })
    );

    const liveTiles = liveTilesResults.filter(Boolean);

    // 3. Save to cache along with version
    saveHomepageCache(CACHE_VERSION, liveTiles);

    // 4. Render
    renderFromTiles(container, liveTiles);

    // 5. Load recently added artworks
    const recentImages = await fetchRecentlyAdded();
    renderRecentlyAdded(container, recentImages);
  } catch (error) {
    console.error('Error loading homepage:', error);
  } finally {
    // Always hide loader when done (success or error)
    if (pageLoader) {
      pageLoader.classList.add('hidden');
    }
  }
})();

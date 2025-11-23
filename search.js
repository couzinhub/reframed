// assumes config.js and shared.js are loaded first
// shared.js provides: fetchAllImageKitFiles, humanizePublicId, getImageUrl, getThumbnailUrl

// ---------- SEARCH CACHE ----------
const SEARCH_CACHE_KEY = "reframed_search_cache_v4"; // bumped to v4 for batched requests
let ALL_ARTWORKS = null;

// ---------- COLLECTIONS CACHE ----------
let COLLECTIONS_CACHE = null;
const COLLECTIONS_LOCALSTORAGE_KEY = "reframed_collections_cache_v4";
const USED_THUMBNAILS = new Set();

// ---------- LOCALSTORAGE CACHE ----------
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

// ---------- COLLECTIONS CACHE ----------
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

  // Filter items that need version count check (updated > 1 hour after creation AND updated within last 12 days)
  const itemsNeedingVersionCheck = artworks.filter(artwork => {
    if (!artwork.updated_at || !artwork.created_at) return false;

    const updatedDate = new Date(artwork.updated_at);
    const createdDate = new Date(artwork.created_at);

    const hoursSinceCreation = (updatedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
    const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);

    // Debug Van Gogh items specifically
    if (artwork.public_id.toLowerCase().includes('starry night')) {
      console.log(`[FILTER] Checking "${artwork.public_id}":`, {
        updated_at: artwork.updated_at,
        created_at: artwork.created_at,
        hoursSinceCreation,
        daysSinceUpdate,
        passesFilter: hoursSinceCreation > 1 && daysSinceUpdate <= 12
      });
    }

    return hoursSinceCreation > 1 && daysSinceUpdate <= 12;
  });

  // Fetch version counts in batches to avoid rate limiting
  console.log(`Fetching version counts for ${itemsNeedingVersionCheck.length} items in batches...`);
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 100; // Small delay between batches
  const versionCounts = [];

  for (let i = 0; i < itemsNeedingVersionCheck.length; i += BATCH_SIZE) {
    const batch = itemsNeedingVersionCheck.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(itemsNeedingVersionCheck.length / BATCH_SIZE);

    console.log(`Fetching batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    const batchCounts = await Promise.all(
      batch.map(artwork => fetchFileVersionCount(artwork.file_id))
    );
    versionCounts.push(...batchCounts);

    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < itemsNeedingVersionCheck.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log('Version counts fetched:', versionCounts);

  // Map version counts back to items
  const versionCountMap = new Map();
  itemsNeedingVersionCheck.forEach((artwork, index) => {
    versionCountMap.set(artwork.file_id, versionCounts[index]);
    if (versionCounts[index] > 1) {
      console.log(`Item "${artwork.public_id}" has ${versionCounts[index]} versions`);
    }
  });

  // Add version_count to all artworks
  artworks = artworks.map(artwork => ({
    ...artwork,
    version_count: versionCountMap.get(artwork.file_id) || 1
  }));

  // Debug: Log items with version_count > 1
  const itemsWithVersions = artworks.filter(a => a.version_count > 1);
  console.log(`Found ${itemsWithVersions.length} artworks with multiple versions:`, itemsWithVersions.map(a => ({
    public_id: a.public_id,
    version_count: a.version_count,
    version_count_type: typeof a.version_count,
    created_at: a.created_at,
    updated_at: a.updated_at
  })));

  // Debug: Also log Van Gogh artworks specifically
  const vanGoghItems = artworks.filter(a => a.public_id.toLowerCase().includes('van gogh'));
  console.log(`Van Gogh artworks:`, vanGoghItems.map(a => ({
    public_id: a.public_id,
    version_count: a.version_count,
    version_count_type: typeof a.version_count,
    created_at: a.created_at,
    updated_at: a.updated_at
  })));

  // Sort newest first
  artworks.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Save to cache
  saveSearchCache(artworks);

  return artworks;
}

// ---------- COLLECTIONS FUNCTIONS ----------
async function loadCollectionRows() {
  // Fetch all files from ImageKit
  const files = await fetchAllImageKitFiles();

  // Extract collection tags (format: "collection - NAME")
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

  // Convert to array and sort by the display name (without "collection - ")
  const collectionTags = Array.from(collectionTagsSet).sort((a, b) => {
    const nameA = a.substring(13); // Remove "collection - " (13 chars)
    const nameB = b.substring(13);
    return nameA.localeCompare(nameB);
  });

  // Create rows with tag (full) and label (without prefix)
  return collectionTags.map(tag => ({
    tag: tag, // Keep full tag for API queries
    label: tag.substring(13), // Remove "collection - " for display
    featuredPublicId: "" // Will be determined by lazy load
  }));
}

async function fetchImagesForCollection(tagName) {
  const items = await fetchImagesForTag(tagName);

  // newest first
  const all = items.sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  return { all, count: all.length };
}

function pickFeaturedImage(row, imageSets, usedThumbnails = null) {
  // First, always check for "thumbnail" tagged image (that hasn't been used)
  const thumbnailImage = imageSets.all.find(img => {
    if (usedThumbnails && usedThumbnails.has(img.public_id)) {
      return false; // Skip if already used
    }
    return img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail');
  });

  if (thumbnailImage) {
    if (usedThumbnails) {
      usedThumbnails.add(thumbnailImage.public_id);
    }
    return thumbnailImage;
  }

  // Fallback to featuredPublicId if specified (and not used)
  const desired = (row.featuredPublicId || "").trim().toLowerCase();
  if (desired) {
    function matches(img) {
      if (usedThumbnails && usedThumbnails.has(img.public_id)) {
        return false; // Skip if already used
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

  // Final fallback to first unused image
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
    .replace(/-/g, "%2D")  // Encode existing hyphens
    .replace(/\s+/g, "-");  // Convert spaces to dashes

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

  // label with optional count
  const labelEl = document.createElement("div");
  labelEl.className = "artist-name";

  // try to find matching cache entry so we can pre-fill "(N)" on rerender
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

  // Navigate to tag page on click
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

  // Try localStorage cache first
  const cachedCollections = loadCollectionsFromLocalStorage();
  if (cachedCollections && Array.isArray(cachedCollections)) {
    COLLECTIONS_CACHE = cachedCollections;
    renderCollectionsGrid(COLLECTIONS_CACHE);
    setupCollectionsLazyLoad();
    statusEl.textContent = ""; // Don't show collection count
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

    statusEl.textContent = ""; // Don't show collection count
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading collections: " + err.message;
  }
}

function renderCollectionsGrid(collectionsList) {
  const grid = document.getElementById("searchGrid");
  grid.innerHTML = "";
  grid.className = "tag-grid"; // Use same grid as artworks

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

      // If we already have both thumb + count, nothing to do
      const alreadyHasThumb = !!cacheItem.chosenImage;
      const alreadyHasCount = typeof cacheItem.imageCount === "number";

      if (alreadyHasThumb && alreadyHasCount) {
        observer.unobserve(cardEl);
        continue;
      }

      // Fetch images (this gives us image list + count)
      const imageSets = await fetchImagesForCollection(tagName);

      // pick thumb if missing
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

      // record count if missing
      if (!alreadyHasCount) {
        cacheItem.imageCount = imageSets.count;
      }

      // update label: "Name (N)"
      if (cardEl.__countSpan && typeof cacheItem.imageCount === "number") {
        cardEl.__countSpan.textContent = `(${cacheItem.imageCount})`;
      }

      // Save updated cache to localStorage
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

// ---------- ARTWORK DISPLAY STATE ----------
let DISPLAYED_ARTWORKS = [];
let DISPLAYED_COUNT = 0;
let CURRENT_TAB = 'recent';
const ITEMS_PER_PAGE = 30;

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Sort artworks by recently added (newest first)
function sortByRecent(artworks) {
  return [...artworks].sort((a, b) => {
    // Get the most recent date for each artwork (either created or updated)
    const aDate = [a.created_at, a.updated_at].filter(Boolean).sort().reverse()[0] || "";
    const bDate = [b.created_at, b.updated_at].filter(Boolean).sort().reverse()[0] || "";
    return bDate.localeCompare(aDate);
  });
}

// Sort artworks by relevance (for search results - by match quality)
// For now, just returns artworks in original order (can be enhanced later)
function sortByRelevant(artworks, query) {
  if (!query) return artworks;

  // Score based on how early in the name the match appears
  return [...artworks].sort((a, b) => {
    const indexA = a.searchName.indexOf(query.toLowerCase());
    const indexB = b.searchName.indexOf(query.toLowerCase());

    // Earlier matches rank higher
    if (indexA !== indexB) {
      return indexA - indexB;
    }

    // Tie-breaker: shorter names rank higher (more specific match)
    return a.searchName.length - b.searchName.length;
  });
}

// Sort artworks by artist name
function sortByArtist(artworks) {
  return [...artworks].sort((a, b) => {
    const artistA = extractArtistFromTitle(humanizePublicId(a.public_id)) || '';
    const artistB = extractArtistFromTitle(humanizePublicId(b.public_id)) || '';

    // Compare artists (case-insensitive)
    const artistCompare = artistA.toLowerCase().localeCompare(artistB.toLowerCase());

    // If same artist (or both empty), sort by artwork name
    if (artistCompare === 0) {
      return a.searchName.localeCompare(b.searchName);
    }

    return artistCompare;
  });
}

// Apply sorting based on current tab
function applySorting(artworks, searchQuery = '') {
  switch (CURRENT_TAB) {
    case 'recent':
      return sortByRecent(artworks);
    case 'random':
      return shuffleArray(artworks);
    case 'artists':
      return sortByArtist(artworks);
    case 'search':
      return sortByRelevant(artworks, searchQuery);
    default:
      return sortByRecent(artworks);
  }
}

// Get last name from artist name
function getLastName(artistName) {
  if (!artistName || artistName === 'Unknown Artist') return 'zzz'; // Sort unknowns to end
  const parts = artistName.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

// Group artworks by artist
function groupArtworksByArtist(artworks) {
  const grouped = new Map();

  for (const artwork of artworks) {
    const artist = extractArtistFromTitle(humanizePublicId(artwork.public_id)) || 'Unknown Artist';

    if (!grouped.has(artist)) {
      grouped.set(artist, []);
    }
    grouped.get(artist).push(artwork);
  }

  // Sort groups by artist last name
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    return getLastName(a[0]).localeCompare(getLastName(b[0]));
  });

  return sortedGroups;
}

// ---------- SEARCH FUNCTION ----------
function searchArtworks(query, artworks) {
  if (!query || query.trim() === "") {
    // Return empty array for now - we'll handle showing random artworks separately
    return null;
  }

  const searchTerms = query.toLowerCase().trim().split(/\s+/);

  return artworks.filter(artwork => {
    // All search terms must be found in the artwork name
    return searchTerms.every(term => artwork.searchName.includes(term));
  });
}

// ---------- RENDER RESULTS ----------
function renderSearchResults(artworks) {
  const gridEl = document.getElementById("searchGrid");
  const statusEl = document.getElementById("searchStatus");

  gridEl.innerHTML = "";

  if (!artworks || artworks.length === 0) {
    statusEl.textContent = "No artworks found";
    return;
  }

  // Clear status for search results
  statusEl.textContent = "";

  if (CURRENT_TAB === 'artists') {
    // Render grouped by artist
    const groups = groupArtworksByArtist(artworks);

    // Change grid to a wrapper for groups
    gridEl.className = "grouped-results";

    for (const [artist, groupArtworks] of groups) {
      // Create artist group container
      const groupContainer = document.createElement("div");
      groupContainer.className = "artist-group";

      // Create artist header as a link
      const header = document.createElement("h2");
      header.className = "artist-group-header";

      const headerLink = document.createElement("a");
      // Convert artist name to tag format and URL encode
      const artistTag = artist.replace(/-/g, "%2D").replace(/\s+/g, "-");
      headerLink.href = "/tag/#" + artistTag;
      headerLink.textContent = artist;
      header.appendChild(headerLink);

      groupContainer.appendChild(header);

      // Create grid for this artist
      const artistGrid = document.createElement("div");
      artistGrid.className = "tag-grid";

      // Show only first 3 artworks per artist
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
    // Reset to normal grid class
    gridEl.className = "tag-grid";

    // Render flat list
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

// ---------- RENDER ARTWORKS (WITH SORTING) ----------
function showArtworks(reset = false) {
  const gridEl = document.getElementById("searchGrid");
  const statusEl = document.getElementById("searchStatus");

  // Reset if needed (when search is cleared or sort changes)
  if (reset) {
    DISPLAYED_ARTWORKS = applySorting(ALL_ARTWORKS);
    DISPLAYED_COUNT = 0;
    gridEl.innerHTML = "";
  }

  // If artists tab is active, render all at once with headers
  if (CURRENT_TAB === 'artists') {
    statusEl.textContent = "";

    // Change grid to a wrapper for groups
    gridEl.className = "grouped-results";

    const groups = groupArtworksByArtist(DISPLAYED_ARTWORKS);

    for (const [artist, groupArtworks] of groups) {
      // Create artist group container
      const groupContainer = document.createElement("div");
      groupContainer.className = "artist-group";

      // Create artist header as a link
      const header = document.createElement("h2");
      header.className = "artist-group-header";

      const headerLink = document.createElement("a");
      // Convert artist name to tag format and URL encode
      const artistTag = artist.replace(/-/g, "%2D").replace(/\s+/g, "-");
      headerLink.href = "/tag/#" + artistTag;
      headerLink.textContent = artist;
      header.appendChild(headerLink);

      groupContainer.appendChild(header);

      // Create grid for this artist
      const artistGrid = document.createElement("div");
      artistGrid.className = "tag-grid";

      // Show only first 3 artworks per artist
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
    return false; // No more to load when artists tab
  }

  // Reset to normal grid class
  gridEl.className = "tag-grid";

  // Normal pagination without grouping
  const startIdx = DISPLAYED_COUNT;
  const endIdx = Math.min(DISPLAYED_COUNT + ITEMS_PER_PAGE, DISPLAYED_ARTWORKS.length);
  const artworksToShow = DISPLAYED_ARTWORKS.slice(startIdx, endIdx);

  // Clear status when showing all artworks
  statusEl.textContent = "";

  // Debug: Log artworks with versions in this batch
  const withVersions = artworksToShow.filter(a => a.version_count > 1);
  if (withVersions.length > 0) {
    console.log(`Rendering batch with ${withVersions.length} artworks that have version_count > 1:`, withVersions.map(a => ({
      publicId: a.public_id,
      version_count: a.version_count,
      updated_at: a.updated_at,
      created_at: a.created_at
    })));
  }

  // Render new artworks
  const frag = document.createDocumentFragment();
  for (const artwork of artworksToShow) {
    const publicId = artwork.public_id;
    const niceName = humanizePublicId(publicId);

    // Debug: Log if this should show a ribbon
    if (artwork.version_count > 1) {
      console.log(`Creating card for "${publicId}" with:`, {
        updated_at: artwork.updated_at,
        created_at: artwork.created_at,
        version_count: artwork.version_count,
        hoursSinceCreation: artwork.updated_at && artwork.created_at ?
          (new Date(artwork.updated_at).getTime() - new Date(artwork.created_at).getTime()) / (1000 * 60 * 60) : 0,
        daysSinceUpdate: artwork.updated_at ?
          (Date.now() - new Date(artwork.updated_at).getTime()) / (1000 * 60 * 60 * 24) : 999
      });
    }

    const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height, artwork.updated_at, artwork.created_at, artwork.file_id, artwork.version_count);
    frag.appendChild(card);
  }

  gridEl.appendChild(frag);
  DISPLAYED_COUNT = endIdx;

  // Return whether there are more to load
  return DISPLAYED_COUNT < DISPLAYED_ARTWORKS.length;
}

// ---------- INFINITE SCROLL ----------
function setupInfiniteScroll() {
  let isLoading = false;

  window.addEventListener("scroll", () => {
    // Don't load more for search, artists, or collections tabs
    if (CURRENT_TAB === 'search' || CURRENT_TAB === 'artists' || CURRENT_TAB === 'collections') {
      return;
    }

    if (isLoading) return;

    // Check if user has scrolled near bottom
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.documentElement.scrollHeight - 500; // 500px before bottom

    if (scrollPosition >= threshold) {
      isLoading = true;
      const hasMore = showArtworks(false);
      isLoading = false;

      // If no more items, remove scroll listener
      if (!hasMore) {
        // Optional: Could show a "No more artworks" message
      }
    }
  });
}

// ---------- INIT SEARCH PAGE ----------
(async function initSearchPage() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  const searchInputContainer = document.querySelector(".search-input-container");
  const tabButtons = document.querySelectorAll(".tab-button");
  const statusEl = document.getElementById("searchStatus");

  // Load all artworks
  statusEl.innerHTML = 'Loading artworks<span class="spinner"></span>';

  try {
    ALL_ARTWORKS = await fetchAllArtworks();

    // Update placeholder text with artwork count
    searchInput.placeholder = `Search through ${ALL_ARTWORKS.length} artworks`;

    // Set initial active tab based on URL hash or default to 'recent'
    const hash = window.location.hash.substring(1); // Remove '#'
    const validTabs = ['recent', 'random', 'artists', 'collections', 'search'];
    const initialTabName = validTabs.includes(hash) ? hash : 'recent';

    CURRENT_TAB = initialTabName;
    const initialTab = document.querySelector(`[data-tab="${initialTabName}"]`);
    if (initialTab) {
      initialTab.classList.add('active');
    }

    // Show initial content based on tab
    if (initialTabName === 'collections') {
      loadAndRenderCollections();
    } else if (initialTabName === 'search') {
      searchInputContainer.classList.remove('hidden');
      searchInput.focus();
    } else {
      // Show artworks for regular tabs
      showArtworks(true);
    }

    // Setup infinite scroll
    setupInfiniteScroll();

    // Handle tab clicks
    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;

        // Handle search tab special case
        if (tab === 'search') {
          // Toggle search input visibility
          if (CURRENT_TAB === 'search') {
            // Already in search, do nothing or could collapse
            return;
          }

          CURRENT_TAB = 'search';
          window.location.hash = tab;

          // Update active states
          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');

          // Show search input
          searchInputContainer.classList.remove('hidden');
          searchInput.focus();

          // Clear any existing results
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
          // Handle collections tab
          CURRENT_TAB = 'collections';
          window.location.hash = tab;

          // Update active states
          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');

          // Hide search input
          searchInputContainer.classList.add('hidden');

          // Load and render collections
          loadAndRenderCollections();
        } else {
          // Regular tabs (recent, random, grouped)
          CURRENT_TAB = tab;
          window.location.hash = tab;

          // Update active states
          tabButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');

          // Hide search input for non-search tabs
          searchInputContainer.classList.add('hidden');

          // Show artworks for this tab
          showArtworks(true);
        }
      });
    });

    // Handle search input with debouncing
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);

      const query = e.target.value;

      // Show/hide clear button
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
          // Show search results with sorting applied
          const sorted = applySorting(results, query.trim());
          renderSearchResults(sorted);
        }
      }, 300); // 300ms debounce
    });

    // Handle clear button
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      clearButton.style.display = "none";
      document.getElementById("searchGrid").innerHTML = "";
      statusEl.textContent = "";
      searchInput.focus();
    });

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading artworks: " + err.message;
  }
})();

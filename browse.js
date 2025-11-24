// assumes config.js and shared.js are loaded before this script
// config.js provides: IMAGEKIT_URL_ENDPOINT, CACHE_TTL_MS
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, humanizePublicId, createArtworkCard, extractArtistFromTitle, getThumbnailUrlWithCrop, fetchFileVersionCount

// ============ BROWSE SECTION (TABS + FUNCTIONALITY) ============

function renderBrowseSection(container) {
  const section = document.createElement("section");
  section.id = "browse";

  const tabs = document.createElement("div");
  tabs.className = "browse-tabs";
  tabs.innerHTML = `
    <button class="tab-button active" data-tab="new">New</button>
    <button class="tab-button" data-tab="collections">Collections</button>
    <button class="tab-button" data-tab="artists">Artists</button>
    <button class="tab-button" data-tab="vertical">Vertical</button>
    <button class="tab-button tab-search" data-tab="search"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg></button>
  `;
  section.appendChild(tabs);

  const searchInputContainer = document.createElement("div");
  searchInputContainer.className = "search-input-container hidden";
  searchInputContainer.innerHTML = `
    <input
      type="text"
      id="searchInput"
      placeholder="Search by artwork or artist name..."
      autocomplete="off"
    />
    <button id="clearSearch" aria-label="Clear search">&times;</button>
  `;
  section.appendChild(searchInputContainer);

  const tagHeaderRow = document.createElement("div");
  tagHeaderRow.className = "tag-header-row";
  const searchStatus = document.createElement("p");
  searchStatus.id = "searchStatus";
  searchStatus.className = "tag-status";
  tagHeaderRow.appendChild(searchStatus);
  section.appendChild(tagHeaderRow);

  const grid = document.createElement("div");
  grid.id = "searchGrid";
  grid.className = "grid";
  section.appendChild(grid);

  container.appendChild(section);
}

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
    // Return random artworks when search is empty
    const shuffled = [...artworks].sort(() => Math.random() - 0.5);
    return shuffled;
  }

  const searchTerms = query.toLowerCase().trim().split(/\s+/);

  return artworks.filter(artwork => {
    return searchTerms.every(term => artwork.searchName.includes(term));
  });
}

// ---------- RENDER ARTIST ROWS ----------
function renderArtistRows(gridEl, artworks) {
  const groups = groupArtworksByArtist(artworks);
  gridEl.className = "artist-rows";

  for (const [artist, groupArtworks] of groups) {
    const artistTag = artist.replace(/-/g, "%2D").replace(/\s+/g, "-");
    const artistUrl = "/tag/#" + artistTag;

    const row = document.createElement("a");
    row.className = "artist-row";
    row.href = artistUrl;

    const nameSection = document.createElement("div");
    nameSection.className = "artist-row-name";
    nameSection.textContent = artist;
    row.appendChild(nameSection);

    const thumbnailsSection = document.createElement("div");
    thumbnailsSection.className = "artist-thumbnails";

    const artworksToShow = groupArtworks.slice(0, 3);

    for (let i = 0; i < artworksToShow.length; i++) {
      const artwork = artworksToShow[i];
      const thumb = document.createElement("div");
      thumb.className = "artist-thumb";

      if (i === 2 && groupArtworks.length >= 3) {
        thumb.classList.add("half-visible");
      }

      const img = document.createElement("img");
      img.src = getThumbnailUrlWithCrop(artwork.public_id, 200, artwork.updated_at);
      img.alt = humanizePublicId(artwork.public_id);
      img.loading = "lazy";

      thumb.appendChild(img);
      thumbnailsSection.appendChild(thumb);
    }

    row.appendChild(thumbnailsSection);
    gridEl.appendChild(row);
  }
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
    renderArtistRows(gridEl, artworks);
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
    renderArtistRows(gridEl, DISPLAYED_ARTWORKS);
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
    // Remove active class from all tabs first
    tabButtons.forEach(btn => btn.classList.remove('active'));
    // Then add active class to the initial tab
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
            browseSection.scrollIntoView({ behavior: 'auto', block: 'start' });
          }

          const query = searchInput.value.trim();
          const results = searchArtworks(query, ALL_ARTWORKS);
          if (results && results.length > 0) {
            const sorted = query ? applySorting(results, query) : results;
            renderSearchResults(sorted);
          } else {
            document.getElementById("searchGrid").innerHTML = "";
            statusEl.textContent = query ? "No artworks found" : "";
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
            browseSection.scrollIntoView({ behavior: 'auto', block: 'start' });
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
            browseSection.scrollIntoView({ behavior: 'auto', block: 'start' });
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

        if (results.length === 0) {
          document.getElementById("searchGrid").innerHTML = "";
          statusEl.textContent = "No artworks found";
        } else {
          const sorted = query.trim() ? applySorting(results, query.trim()) : results;
          renderSearchResults(sorted);
        }
      }, 300);
    });

    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      clearButton.style.display = "none";

      // Show random artworks when search is cleared
      const results = searchArtworks("", ALL_ARTWORKS);
      renderSearchResults(results);

      searchInput.focus();
    });

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading artworks: " + err.message;
  }
}

// ============ MAIN BROWSE PAGE BOOTSTRAP ============

(async function initBrowsePage() {
  const container = document.getElementById("browseView");

  try {
    // Render browse section
    renderBrowseSection(container);

    // Initialize browse functionality
    initBrowse();
  } catch (error) {
    console.error('Error loading browse page:', error);
  }
})();

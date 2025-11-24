// assumes config.js and shared.js are loaded first
// shared.js provides: fetchAllImageKitFiles, humanizePublicId, getImageUrl, getThumbnailUrl

// ---------- SEARCH CACHE ----------
const SEARCH_CACHE_KEY = "reframed_search_cache_v1";
let ALL_ARTWORKS = null;

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
  const artworks = files.map(file => ({
    public_id: file.filePath.substring(1), // Remove leading slash
    width: file.width,
    height: file.height,
    created_at: file.createdAt,
    tags: file.tags || [],
    searchName: humanizePublicId(file.filePath.substring(1)).toLowerCase()
  }));

  // Sort newest first
  artworks.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Save to cache
  saveSearchCache(artworks);

  return artworks;
}

// ---------- SEARCH FUNCTION ----------
function searchArtworks(query, artworks) {
  if (!query || query.trim() === "") {
    return [];
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

  statusEl.textContent = `${artworks.length} artwork${artworks.length === 1 ? "" : "s"}`;

  const frag = document.createDocumentFragment();

  for (const artwork of artworks) {
    const publicId = artwork.public_id;
    const niceName = humanizePublicId(publicId);
    const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height);
    frag.appendChild(card);
  }

  gridEl.appendChild(frag);
}

// ---------- INIT SEARCH PAGE ----------
(async function initSearchPage() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  const statusEl = document.getElementById("searchStatus");

  // Load all artworks
  statusEl.innerHTML = 'Loading artworks<span class="spinner"></span>';

  try {
    ALL_ARTWORKS = await fetchAllArtworks();
    statusEl.textContent = `${ALL_ARTWORKS.length} artworks available`;

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
        renderSearchResults(results);
      }, 300); // 300ms debounce
    });

    // Handle clear button
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      clearButton.style.display = "none";
      document.getElementById("searchGrid").innerHTML = "";
      statusEl.textContent = `${ALL_ARTWORKS.length} artworks available`;
    });

    // Focus on search input
    searchInput.focus();

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading artworks: " + err.message;
  }
})();

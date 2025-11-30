// assumes config.js and shared.js are loaded first
// shared.js provides: fetchAllImageKitFiles, humanizePublicId, getImageUrl, getThumbnailUrl

// ---------- SEARCH CACHE ----------
const SEARCH_CACHE_KEY = "reframed_search_cache_v2";
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

  // Transform to artwork objects with searchable names, tags, and descriptions
  const artworks = files.map(file => ({
    public_id: file.filePath.substring(1), // Remove leading slash
    width: file.width,
    height: file.height,
    created_at: file.createdAt,
    tags: file.tags || [],
    searchName: humanizePublicId(file.filePath.substring(1)).toLowerCase(),
    description: (file.customMetadata && file.customMetadata.description) ? file.customMetadata.description.toLowerCase() : ''
  }));

  // Sort newest first
  artworks.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Save to cache
  saveSearchCache(artworks);

  return artworks;
}

// ---------- FUZZY MATCH HELPER ----------
function fuzzyMatch(str, pattern) {
  // Simple fuzzy matching: checks if all characters in pattern appear in str in order
  // Allows for characters in between (e.g., "vgh" matches "van gogh")
  let patternIdx = 0;
  let strIdx = 0;

  while (strIdx < str.length && patternIdx < pattern.length) {
    if (str[strIdx] === pattern[patternIdx]) {
      patternIdx++;
    }
    strIdx++;
  }

  return patternIdx === pattern.length;
}

function getLevenshteinDistance(a, b) {
  // Calculate edit distance between two strings
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function fuzzyScore(text, term) {
  // Returns a score for how well the term matches the text
  // Higher score = better match

  // Exact match gets highest score
  if (text.includes(term)) {
    return 100;
  }

  // Check fuzzy match (all characters in order)
  if (fuzzyMatch(text, term)) {
    return 50;
  }

  // Check word boundaries - see if term matches start of any word
  const words = text.split(/\s+/);
  let bestScore = 0;

  for (const word of words) {
    if (word.startsWith(term)) {
      return 75;
    }

    // Fuzzy match on individual words
    if (fuzzyMatch(word, term)) {
      bestScore = Math.max(bestScore, 40);
      continue;
    }

    // Check edit distance for typo tolerance
    const distance = getLevenshteinDistance(term, word);
    const maxLen = Math.max(term.length, word.length);
    const similarity = 1 - (distance / maxLen);

    // Lower threshold to 60% for better typo tolerance
    // Words like "moan" vs "mona" have 50% similarity but same length should get bonus
    if (similarity >= 0.5) {
      // Give bonus if same length (likely just transposed/swapped letters)
      const lengthBonus = term.length === word.length ? 0.15 : 0;
      const adjustedSimilarity = Math.min(1, similarity + lengthBonus);

      if (adjustedSimilarity >= 0.6) {
        const score = Math.floor(adjustedSimilarity * 70);
        bestScore = Math.max(bestScore, score);
      }
    }
  }

  return bestScore;
}

// ---------- SEARCH FUNCTION ----------
function searchArtworks(query, artworks) {
  if (!query || query.trim() === "") {
    return [];
  }

  const searchTerms = query.toLowerCase().trim().split(/\s+/);

  // Score each artwork and filter those with scores above threshold
  const scored = artworks.map(artwork => {
    // Calculate total score across all search terms
    let totalScore = 0;
    let matchCount = 0;
    let hasNameMatch = false;

    for (const term of searchTerms) {
      const nameScore = fuzzyScore(artwork.searchName, term);
      const descScore = fuzzyScore(artwork.description || '', term);

      // Check if term matches any artist tag
      let artistScore = 0;
      for (const tag of artwork.tags) {
        const tagScore = fuzzyScore(tag.toLowerCase(), term);
        if (tagScore > 0) {
          artistScore = Math.max(artistScore, tagScore);
        }
      }

      // Track if we have any matches in the name
      if (nameScore > 0) {
        hasNameMatch = true;
      }

      const maxScore = Math.max(nameScore, artistScore, descScore);

      if (maxScore > 0) {
        matchCount++;
        // Boost score significantly if match is in the name (5x) or artist tag (5x)
        if (nameScore > 0) {
          totalScore += nameScore * 5;
        } else if (artistScore > 0) {
          totalScore += artistScore * 5;
        } else {
          totalScore += descScore;
        }
      }
    }

    // All terms must have at least some match
    if (matchCount < searchTerms.length) {
      return { artwork, score: 0 };
    }

    // Additional boost if all terms match in the name
    const finalScore = hasNameMatch ? totalScore * 1.5 : totalScore;

    return { artwork, score: finalScore / searchTerms.length };
  });

  // Filter results with score > 0 and sort by score (highest first)
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.artwork);
}

// ---------- RENDER RESULTS ----------
function renderSearchResults(artworks) {
  const gridEl = document.getElementById("searchGrid");

  gridEl.innerHTML = "";

  if (!artworks || artworks.length === 0) {
    return;
  }

  const frag = document.createDocumentFragment();

  for (const artwork of artworks) {
    const publicId = artwork.public_id;
    const niceName = humanizePublicId(publicId);
    const card = createArtworkCard(publicId, niceName, artwork.tags, artwork.width, artwork.height);
    frag.appendChild(card);
  }

  gridEl.appendChild(frag);
}

// ---------- RANDOM ARTWORKS ----------
function getRandomArtworks(artworks, count = 30) {
  const shuffled = [...artworks].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function showRandomArtworks() {
  const randomArtworks = getRandomArtworks(ALL_ARTWORKS, 24);
  renderSearchResults(randomArtworks);
}

// ---------- INIT SEARCH PAGE ----------
(async function initSearchPage() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  const gridEl = document.getElementById("searchGrid");

  // Set up transition on grid
  gridEl.style.transition = "opacity 200ms ease-in-out";

  // Load all artworks
  try {
    ALL_ARTWORKS = await fetchAllArtworks();

    // Update placeholder with count
    searchInput.placeholder = `Search through ${ALL_ARTWORKS.length} artworks available`;

    // Show 30 random artworks on initial load
    showRandomArtworks();

    // Handle search input with debouncing
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);

      const query = e.target.value;

      // Show/hide clear button
      if (query) {
        clearButton.style.display = "block";
        // Fade grid immediately when typing starts
        gridEl.style.opacity = "0.3";
      } else {
        clearButton.style.display = "none";
        gridEl.style.opacity = "1";
      }

      searchTimeout = setTimeout(() => {
        if (query.trim()) {
          const results = searchArtworks(query, ALL_ARTWORKS);
          renderSearchResults(results);
          // Restore opacity after results render
          gridEl.style.opacity = "1";
        } else {
          showRandomArtworks();
          gridEl.style.opacity = "1";
        }
      }, 300); // 300ms debounce
    });

    // Handle clear button
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      clearButton.style.display = "none";
      showRandomArtworks();
    });

    // Focus on search input
    searchInput.focus();

  } catch (err) {
    console.error(err);
  }
})();

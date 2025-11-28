// assumes config.js and shared.js are loaded first
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, humanizePublicId, showToast, mobile menu functionality

// ---------- COMMON LOADING STATE ----------
function showLoadingState(gridElement) {
  gridElement.innerHTML = '<div class="loading-spinner-container"><span class="spinner large"></span></div>';
}

// ---------- BROWSE TABS ----------
function renderBrowseTabs(currentPage) {
  const tabs = [
    { id: 'recent', label: 'Recently added', href: '/browse-recent.html' },
    { id: 'collections', label: 'Collections', href: '/browse-collections.html' },
    { id: 'artists', label: 'Artists', href: '/browse-artists.html' },
    { id: 'vertical', label: 'Vertical artworks', href: '/browse-vertical.html' },
    { id: 'search', label: 'Search', href: '/browse-search.html' }
  ];

  const ul = document.createElement('ul');
  ul.className = 'tabs';

  tabs.forEach(tab => {
    const li = document.createElement('li');
    if (tab.id === currentPage) {
      li.className = 'current';
    }

    const a = document.createElement('a');
    a.href = tab.href;
    a.textContent = tab.label;

    li.appendChild(a);
    ul.appendChild(li);
  });

  return ul;
}

// ---------- lightweight in-tab cache ----------
let ARTISTS_CACHE = null; // [{ tag, label, chosenImage, imageCount }, ...]
let ARTISTS_SCROLL_Y = 0;

// cache for each tag's ImageKit listing
const TAG_IMAGES_CACHE = {};
const TAG_TTL_MS = (window.DEBUG ? 2 : 20) * 60 * 1000;

// localStorage cache for artists page
const ARTISTS_LOCALSTORAGE_KEY = "reframed_artists_cache_v4";

// ---------- LOCALSTORAGE CACHE HELPERS ----------
function loadArtistsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(ARTISTS_LOCALSTORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.artists)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed.artists;
  } catch {
    return null;
  }
}

function saveArtistsToLocalStorage(artists) {
  try {
    localStorage.setItem(
      ARTISTS_LOCALSTORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        artists: artists
      })
    );
  } catch {
    // ignore quota errors
  }
}

// ---------- LOAD TAGS FROM IMAGEKIT ----------
async function loadTagsFromImageKit() {
  const files = await fetchAllImageKitFiles();

  // Extract all unique tags (excluding collection tags and thumbnail tag)
  const tagSet = new Set();
  files.forEach(file => {
    if (file.tags && Array.isArray(file.tags)) {
      file.tags.forEach(tag => {
        const trimmedTag = tag.trim();
        const lowerTag = trimmedTag.toLowerCase();
        // Exclude collection tags (format: "collection - NAME") and thumbnail tag
        if (!lowerTag.startsWith('collection - ') && lowerTag !== 'thumbnail') {
          tagSet.add(trimmedTag);
        }
      });
    }
  });

  // Convert to array and sort
  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  // Return in format compatible with rest of code
  return tags.map(tag => ({
    tag: tag,
    label: tag
  }));
}

// ---------- IMAGE HELPERS FOR THUMBS ----------
async function fetchImagesForArtist(tagName) {
  // Check memory cache first
  const cached = TAG_IMAGES_CACHE[tagName];
  if (cached && (Date.now() - cached.lastFetched < TAG_TTL_MS)) {
    return {
      all: cached.all,
      count: cached.count
    };
  }

  // Use shared helper function from shared.js
  const items = await fetchImagesForTag(tagName);

  // newest first
  const all = items.sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  // Count all artworks (both portrait and landscape)
  const count = all.length;

  TAG_IMAGES_CACHE[tagName] = {
    all,
    count,
    lastFetched: Date.now()
  };

  return { all, count };
}

function pickFeaturedImage(imageSets) {
  // First, check if any image has the "thumbnail" tag
  const thumbnailImage = imageSets.all.find(img =>
    img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail')
  );

  if (thumbnailImage) {
    return thumbnailImage;
  }

  // Prefer landscape images for thumbnails
  const landscape = imageSets.all.find(img => {
    const w = img.width;
    const h = img.height;
    return (typeof w === "number" && typeof h === "number") && (w >= h);
  });

  // Fallback to any image if no landscape found
  return landscape || imageSets.all[0] || null;
}

// ---------- RENDER ARTIST GRID ----------
function buildArtistCard(artist) {
  // artist: { tag, label, chosenImage, imageCount }

  const prettyTag = artist.tag.trim()
    .replace(/-/g, "%2D")
    .replace(/\s+/g, "-");

  const card = document.createElement("a");
  card.className = "card artist";
  card.href = "/tag/#" + prettyTag;
  card.setAttribute("aria-label", artist.label);
  card.setAttribute("data-tag", artist.tag);

  const thumbWrapper = document.createElement("div");
  thumbWrapper.className = "thumb";

  if (artist.chosenImage) {
    const niceName = humanizePublicId(artist.chosenImage.public_id);
    const thumbUrl = getThumbnailUrlWithCrop(artist.chosenImage.public_id, 700);
    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = thumbUrl;
    imgEl.alt = niceName;
    thumbWrapper.appendChild(imgEl);
  } else {
    thumbWrapper.classList.add("placeholder");
  }

  card.appendChild(thumbWrapper);

  // label with count
  const labelEl = document.createElement("div");
  labelEl.className = "artist-name";

  const countSpan = document.createElement("span");
  countSpan.className = "art-count";

  if (typeof artist.imageCount === "number") {
    countSpan.textContent = `(${artist.imageCount})`;
  } else {
    countSpan.textContent = "";
  }

  labelEl.textContent = artist.label + " ";
  labelEl.appendChild(countSpan);

  card.__labelEl = labelEl;
  card.__countSpan = countSpan;
  card.appendChild(labelEl);

  // remember scroll position before navigating
  card.addEventListener("click", (ev) => {
    ev.preventDefault();
    ARTISTS_SCROLL_Y = window.scrollY;
    window.location.href = "/tag/#" + prettyTag;
  });

  return card;
}

function getLastName(name) {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1];
}

function getAlphabetSection(name) {
  const lastName = getLastName(name);
  const firstChar = lastName[0].toUpperCase();
  return firstChar;
}

function renderArtistsGrid(artistsList) {
  const grid = document.getElementById("artistsGrid");
  grid.innerHTML = "";

  // Sort artists alphabetically by last name
  const sortedArtists = [...artistsList].sort((a, b) => {
    const lastNameA = getLastName(a.label);
    const lastNameB = getLastName(b.label);
    return lastNameA.localeCompare(lastNameB);
  });

  // Group by individual letters
  const sections = {};
  for (let i = 65; i <= 90; i++) {
    sections[String.fromCharCode(i)] = [];
  }

  for (const artist of sortedArtists) {
    const section = getAlphabetSection(artist.label);
    if (sections[section]) {
      sections[section].push(artist);
    }
  }

  const frag = document.createDocumentFragment();

  // Render each section
  for (const [letter, artists] of Object.entries(sections)) {
    if (artists.length === 0) continue;

    // Add artist cards, assigning section ID to the first one
    artists.forEach((artist, index) => {
      const card = buildArtistCard(artist);

      // Assign section ID to first card in each section for navigation
      if (index === 0) {
        card.id = `section-${letter}`;
      }

      frag.appendChild(card);
    });
  }

  grid.appendChild(frag);
}

function setupLazyThumbObserver() {
  const cards = document.querySelectorAll(".card");

  const obs = new IntersectionObserver(async (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const cardEl = entry.target;
      const tagName = cardEl.getAttribute("data-tag");
      if (!tagName) {
        observer.unobserve(cardEl);
        continue;
      }

      const cacheItem = ARTISTS_CACHE.find(a => a.tag === tagName);
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
      const imageSets = await fetchImagesForArtist(tagName);

      // pick thumb if missing
      if (!alreadyHasThumb) {
        const chosenImage = pickFeaturedImage(imageSets);
        cacheItem.chosenImage = chosenImage;

        const thumbWrapper = cardEl.querySelector(".thumb");
        if (thumbWrapper && chosenImage) {
          thumbWrapper.innerHTML = "";
          const niceName = humanizePublicId(chosenImage.public_id);
          const thumbUrl = getThumbnailUrlWithCrop(chosenImage.public_id, 700);
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
      saveArtistsToLocalStorage(ARTISTS_CACHE);

      observer.unobserve(cardEl);
    }
  }, {
    root: null,
    rootMargin: "200px 0px 200px 0px",
    threshold: 0.01
  });

  cards.forEach(card => obs.observe(card));
}

// ---------- ALPHABET NAVIGATION ----------
function setupAlphabetNavigation() {
  const markers = document.querySelectorAll('.alphabet-marker');
  const scrollbar = document.querySelector('.alphabet-scrollbar');

  markers.forEach(marker => {
    marker.addEventListener('click', (e) => {
      e.preventDefault();
      const letter = marker.textContent.trim();
      let targetId = `section-${letter}`;
      let targetElement = document.getElementById(targetId);

      // If the letter doesn't exist, find the previous letter that does
      if (!targetElement) {
        const letterCode = letter.charCodeAt(0);
        for (let i = letterCode - 1; i >= 65; i--) {
          const prevLetter = String.fromCharCode(i);
          targetElement = document.getElementById(`section-${prevLetter}`);
          if (targetElement) break;
        }
      }

      if (targetElement) {
        const y = targetElement.getBoundingClientRect().top + window.pageYOffset - 100;
        window.scrollTo({
          top: y,
          behavior: 'smooth'
        });
      }
    });
  });

  // Mobile scroll visibility logic
  let scrollTimeout;
  let lastScrollY = window.scrollY;
  let scrollVelocity = 0;
  const VELOCITY_THRESHOLD = 80;

  const handleScroll = () => {
    const currentScrollY = window.scrollY;
    scrollVelocity = Math.abs(currentScrollY - lastScrollY);
    lastScrollY = currentScrollY;

    // Show scrollbar if scrolling fast on mobile
    if (window.innerWidth <= 768 && scrollVelocity > VELOCITY_THRESHOLD) {
      scrollbar.classList.add('visible');

      // Clear existing timeout
      clearTimeout(scrollTimeout);

      // Hide after 3 seconds of no scrolling
      scrollTimeout = setTimeout(() => {
        scrollbar.classList.remove('visible');
      }, 3000);
    }
  };

  // Track active section based on scroll position
  const updateActiveMarker = () => {
    const scrollPos = window.scrollY + 150;
    let activeSection = null;

    // Find all section elements
    const sections = [];
    markers.forEach(marker => {
      const letter = marker.textContent.trim();
      const element = document.getElementById(`section-${letter}`);
      if (element) {
        sections.push({ letter, element, marker });
      }
    });

    // Find which section we're currently in
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const nextSection = sections[i + 1];
      const sectionTop = section.element.offsetTop;
      const sectionBottom = nextSection ? nextSection.element.offsetTop : document.body.scrollHeight;

      if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
        activeSection = section;
        break;
      }
    }

    // Update marker states
    markers.forEach(m => m.classList.remove('active'));
    if (activeSection) {
      activeSection.marker.classList.add('active');
    }

    // Handle mobile visibility
    handleScroll();
  };

  window.addEventListener('scroll', updateActiveMarker, { passive: true });
  updateActiveMarker();
}

// ---------- RECENTLY UPDATED PAGE ----------
const RECENT_CACHE_KEY = "reframed_recent_cache_v1";
let recentCurrentIndex = 0;
const ITEMS_PER_LOAD = 30;
let allRecentArtworks = [];
let isLoadingRecent = false;
let hasMoreRecentItems = true;

function loadRecentFromCache() {
  try {
    const raw = localStorage.getItem(RECENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.artworks)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > TAG_TTL_MS) {
      return null;
    }

    return parsed.artworks;
  } catch {
    return null;
  }
}

function saveRecentToCache(artworks) {
  try {
    localStorage.setItem(
      RECENT_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        artworks: artworks
      })
    );
  } catch {
    // ignore quota errors
  }
}

async function fetchRecentlyUpdated() {
  const files = await fetchAllImageKitFiles();

  // Filter out thumbnails and sort by createdAt (most recent first)
  const artworks = files
    .filter(file => {
      // Exclude files tagged as "thumbnail"
      const tags = file.tags || [];
      return !tags.some(tag => tag.toLowerCase() === 'thumbnail');
    })
    .map(file => ({
      public_id: file.filePath.substring(1), // Remove leading slash
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
      tags: file.tags || []
    }))
    .sort((a, b) => {
      // Sort by createdAt, most recent first
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateB - dateA;
    });

  return artworks;
}

function loadMoreRecentArtworks() {
  if (isLoadingRecent || !hasMoreRecentItems) return;

  isLoadingRecent = true;
  const grid = document.getElementById("recentGrid");

  const endIndex = Math.min(recentCurrentIndex + ITEMS_PER_LOAD, allRecentArtworks.length);
  const batch = allRecentArtworks.slice(recentCurrentIndex, endIndex);

  batch.forEach(img => {
    const publicId = img.public_id;
    const niceName = humanizePublicId(publicId);
    const card = createArtworkCard(publicId, niceName, img.tags, img.width, img.height);
    grid.appendChild(card);
  });

  recentCurrentIndex = endIndex;

  if (recentCurrentIndex >= allRecentArtworks.length) {
    hasMoreRecentItems = false;
  }

  isLoadingRecent = false;
}

function setupRecentInfiniteScroll() {
  const grid = document.getElementById("recentGrid");

  // Create a sentinel element at the bottom of the grid
  const sentinel = document.createElement("div");
  sentinel.id = "scroll-sentinel";
  sentinel.style.height = "1px";
  grid.parentElement.appendChild(sentinel);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && hasMoreRecentItems && !isLoadingRecent) {
          loadMoreRecentArtworks();
        }
      });
    },
    {
      root: null,
      rootMargin: "400px", // Start loading before user reaches the bottom
      threshold: 0
    }
  );

  observer.observe(sentinel);
}

async function initRecentPage() {
  const grid = document.getElementById("recentGrid");

  showLoadingState(grid);

  try {
    // Try cache first
    const cachedArtworks = loadRecentFromCache();

    if (cachedArtworks && Array.isArray(cachedArtworks)) {
      allRecentArtworks = cachedArtworks;
    } else {
      // Fetch fresh data
      allRecentArtworks = await fetchRecentlyUpdated();

      // Save to cache
      saveRecentToCache(allRecentArtworks);
    }

    // Clear loading message
    grid.innerHTML = '';

    // Add grid class for styling
    grid.className = 'tag-grid';

    // Load first batch
    loadMoreRecentArtworks();

    // Set up infinite scroll
    setupRecentInfiniteScroll();

  } catch (err) {
    console.error('Error loading recently updated artworks:', err);
    grid.innerHTML = '<div class="error-message">Error loading artworks. Please try again later.</div>';
  }
}

// ---------- VERTICAL ARTWORKS PAGE ----------
const VERTICAL_CACHE_KEY = "reframed_vertical_cache_v1";
let verticalCurrentIndex = 0;
let allVerticalArtworks = [];
let isLoadingVertical = false;
let hasMoreVerticalItems = true;

function loadVerticalFromCache() {
  try {
    const raw = localStorage.getItem(VERTICAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.artworks)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > TAG_TTL_MS) {
      return null;
    }

    return parsed.artworks;
  } catch {
    return null;
  }
}

function saveVerticalToCache(artworks) {
  try {
    localStorage.setItem(
      VERTICAL_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        artworks: artworks
      })
    );
  } catch {
    // ignore quota errors
  }
}

async function fetchVerticalArtworks() {
  const files = await fetchAllImageKitFiles();

  // Filter portrait artworks and sort by created date
  const artworks = files
    .filter(file => {
      const tags = file.tags || [];
      if (tags.some(tag => tag.toLowerCase() === 'thumbnail')) return false;

      // Check if portrait (height > width)
      return file.height && file.width && file.height > file.width;
    })
    .map(file => ({
      public_id: file.filePath.substring(1),
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
      tags: file.tags || []
    }))
    .sort((a, b) => {
      // Sort by createdAt, most recent first
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateB - dateA;
    });

  return artworks;
}

function loadMoreVerticalArtworks() {
  if (isLoadingVertical || !hasMoreVerticalItems) return;

  isLoadingVertical = true;
  const grid = document.getElementById("recentGrid");

  const endIndex = Math.min(verticalCurrentIndex + ITEMS_PER_LOAD, allVerticalArtworks.length);
  const batch = allVerticalArtworks.slice(verticalCurrentIndex, endIndex);

  batch.forEach(img => {
    const publicId = img.public_id;
    const niceName = humanizePublicId(publicId);
    const card = createArtworkCard(publicId, niceName, img.tags, img.width, img.height);
    grid.appendChild(card);
  });

  verticalCurrentIndex = endIndex;

  if (verticalCurrentIndex >= allVerticalArtworks.length) {
    hasMoreVerticalItems = false;
  }

  isLoadingVertical = false;
}

function setupVerticalInfiniteScroll() {
  const grid = document.getElementById("recentGrid");

  const sentinel = document.createElement("div");
  sentinel.id = "scroll-sentinel-vertical";
  sentinel.style.height = "1px";
  grid.parentElement.appendChild(sentinel);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && hasMoreVerticalItems && !isLoadingVertical) {
          loadMoreVerticalArtworks();
        }
      });
    },
    {
      root: null,
      rootMargin: "400px",
      threshold: 0
    }
  );

  observer.observe(sentinel);
}

async function initVerticalPage() {
  const grid = document.getElementById("recentGrid");

  showLoadingState(grid);

  try {
    const cachedArtworks = loadVerticalFromCache();

    if (cachedArtworks && Array.isArray(cachedArtworks)) {
      allVerticalArtworks = cachedArtworks;
    } else {
      allVerticalArtworks = await fetchVerticalArtworks();
      saveVerticalToCache(allVerticalArtworks);
    }

    grid.innerHTML = '';
    grid.className = 'tag-grid';

    loadMoreVerticalArtworks();
    setupVerticalInfiniteScroll();

  } catch (err) {
    console.error('Error loading vertical artworks:', err);
    grid.innerHTML = '<div class="error-message">Error loading artworks. Please try again later.</div>';
  }
}

// ---------- MAIN INIT ----------
(async function initArtistsPage() {
  const grid = document.getElementById("artistsGrid");

  // Only run on artists page
  if (!grid) return;

  // If we've already got data in this tab, reuse it and restore scroll
  if (ARTISTS_CACHE && Array.isArray(ARTISTS_CACHE)) {
    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    setupAlphabetNavigation();
    window.scrollTo(0, ARTISTS_SCROLL_Y);
    return;
  }

  // Try localStorage cache
  const cachedArtists = loadArtistsFromLocalStorage();
  if (cachedArtists && Array.isArray(cachedArtists)) {
    ARTISTS_CACHE = cachedArtists;
    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    setupAlphabetNavigation();
    return;
  }

  showLoadingState(grid);

  try {
    const tags = await loadTagsFromImageKit();

    ARTISTS_CACHE = tags.map(tagData => ({
      tag: tagData.tag,
      label: tagData.label,
      chosenImage: null,
      imageCount: null
    }));

    // Save to localStorage
    saveArtistsToLocalStorage(ARTISTS_CACHE);

    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    setupAlphabetNavigation();

  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="error-message">Error loading artists. Please try again later.</div>';
  }
})();

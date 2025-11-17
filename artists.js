// assumes config.js and shared.js are loaded first
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, humanizePublicId, showToast, mobile menu functionality

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

  // Extract all unique tags (excluding collection tags)
  const tagSet = new Set();
  files.forEach(file => {
    if (file.tags && Array.isArray(file.tags)) {
      file.tags.forEach(tag => {
        const trimmedTag = tag.trim();
        // Exclude collection tags (format: "collection - NAME")
        if (!trimmedTag.toLowerCase().startsWith('collection - ')) {
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
    const thumbUrl = getThumbnailUrlWithCrop(artist.chosenImage.public_id, 400);
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
  if (firstChar >= 'A' && firstChar <= 'B') return 'A-B';
  if (firstChar >= 'C' && firstChar <= 'D') return 'C-D';
  if (firstChar >= 'E' && firstChar <= 'F') return 'E-F';
  if (firstChar >= 'G' && firstChar <= 'I') return 'G-I';
  if (firstChar >= 'J' && firstChar <= 'L') return 'J-L';
  if (firstChar >= 'M' && firstChar <= 'P') return 'M-P';
  if (firstChar >= 'Q' && firstChar <= 'T') return 'Q-T';
  if (firstChar >= 'U' && firstChar <= 'Z') return 'U-Z';
  return 'A-B'; // default for non-alphabetic
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

  // Group by alphabet sections
  const sections = {
    'A-B': [],
    'C-D': [],
    'E-F': [],
    'G-I': [],
    'J-L': [],
    'M-P': [],
    'Q-T': [],
    'U-Z': []
  };

  for (const artist of sortedArtists) {
    const section = getAlphabetSection(artist.label);
    sections[section].push(artist);
  }

  const frag = document.createDocumentFragment();

  // Render each section
  for (const [sectionName, artists] of Object.entries(sections)) {
    if (artists.length === 0) continue;

    // Add artist cards, assigning section ID to the first one
    artists.forEach((artist, index) => {
      const card = buildArtistCard(artist);

      // Assign section ID to first card in each section for navigation
      if (index === 0) {
        card.id = `section-${sectionName}`;
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
          const thumbUrl = getThumbnailUrlWithCrop(chosenImage.public_id, 400);
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
  const links = document.querySelectorAll('.alphabet-link');
  const sectionElements = Array.from(links).map(link => {
    const targetId = link.getAttribute('href').substring(1);
    return document.getElementById(targetId);
  }).filter(el => el !== null);

  // Handle click navigation
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1); // Remove #
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        // Scroll to the first card in the section with offset
        const yOffset = -120; // Offset for fixed headers/navigation
        const y = targetElement.getBoundingClientRect().top + window.pageYOffset + yOffset;

        window.scrollTo({
          top: y,
          behavior: 'smooth'
        });
      }
    });
  });

  // Track which section is currently in view
  const observer = new IntersectionObserver((entries) => {
    // Find the section that's most visible
    let maxRatio = 0;
    let mostVisibleSection = null;

    entries.forEach(entry => {
      if (entry.intersectionRatio > maxRatio) {
        maxRatio = entry.intersectionRatio;
        mostVisibleSection = entry.target;
      }
    });

    // Update active state if we have a clearly visible section
    if (mostVisibleSection && maxRatio > 0) {
      const sectionId = mostVisibleSection.id;

      // Remove active class from all links
      links.forEach(link => link.classList.remove('active'));

      // Add active class to the corresponding link
      const activeLink = document.querySelector(`.alphabet-link[href="#${sectionId}"]`);
      if (activeLink) {
        activeLink.classList.add('active');
      }
    }
  }, {
    root: null,
    rootMargin: '-150px 0px -50% 0px', // Trigger when section is near the top
    threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
  });

  // Observe all section elements
  sectionElements.forEach(section => observer.observe(section));
}

// ---------- MAIN INIT ----------
(async function initArtistsPage() {
  const status = document.getElementById("artistsStatus");

  // If we've already got data in this tab, reuse it and restore scroll
  if (ARTISTS_CACHE && Array.isArray(ARTISTS_CACHE)) {
    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    setupAlphabetNavigation();
    window.scrollTo(0, ARTISTS_SCROLL_Y);
    status.textContent = `${ARTISTS_CACHE.length} artists`;
    return;
  }

  // Try localStorage cache
  const cachedArtists = loadArtistsFromLocalStorage();
  if (cachedArtists && Array.isArray(cachedArtists)) {
    ARTISTS_CACHE = cachedArtists;
    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    setupAlphabetNavigation();
    status.textContent = `${ARTISTS_CACHE.length} artists`;
    return;
  }

  status.innerHTML = 'Loading<span class="spinner"></span>';

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

    status.textContent = `${ARTISTS_CACHE.length} tags`;
  } catch (err) {
    console.error(err);
    status.textContent = "Error loading tags: " + err.message;
  }
})();

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
  // Use shared helper function
  let items = await fetchImagesForTag(tagName);

  // newest first
  items = items.sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  return items;
}

function chooseFeaturedImage(images) {
  // First, always check for "thumbnail" tagged image (for both collections and artists)
  const thumbnailImage = images.find(img =>
    img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail')
  );

  if (thumbnailImage) {
    return thumbnailImage;
  }

  // Filter out portrait images (height > width)
  const landscapeOrSquare = images.filter(img => img.width >= img.height);

  // Use filtered list if available, otherwise fall back to all images
  const finalList = landscapeOrSquare.length > 0 ? landscapeOrSquare : images;

  const selected = finalList.length > 0 ? finalList[0] : null;
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

async function renderRecentlyAdded(container) {
  try {
    // Fetch all images and sort by created_at
    const allFiles = await fetchAllImageKitFiles();
    const sortedFiles = allFiles
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    // Create recently added section
    const section = document.createElement('div');
    section.className = 'recently-added-section';

    const title = document.createElement('h2');
    title.className = 'recently-added-title';
    title.textContent = 'Recently Added';
    section.appendChild(title);

    // Create grid
    const grid = document.createElement('div');
    grid.className = 'grid';

    // Fetch version counts for all files
    const cardsPromises = sortedFiles.map(async (file) => {
      const versionCount = await fetchFileVersionCount(file.fileId);
      return createArtworkCard(
        file.filePath.substring(1),
        humanizePublicId(file.filePath),
        file.tags || [],
        file.width,
        file.height,
        file.updatedAt,
        file.createdAt,
        file.fileId,
        versionCount
      );
    });

    const cards = await Promise.all(cardsPromises);
    cards.forEach(card => grid.appendChild(card));

    section.appendChild(grid);

    // Add "View More" button
    const btnContainer = document.createElement('div');
    btnContainer.style.textAlign = 'center';
    btnContainer.style.margin = '40px 0';

    const viewMoreBtn = document.createElement('a');
    viewMoreBtn.href = 'browse.html';
    viewMoreBtn.className = 'view-more-button';
    viewMoreBtn.textContent = 'View More';

    btnContainer.appendChild(viewMoreBtn);
    section.appendChild(btnContainer);

    container.appendChild(section);
  } catch (error) {
    console.error('Error rendering recently added:', error);
  }
}

async function renderGroupsInto(container, tiles) {
  // Render the first 3 tiles as a carousel
  const tilesToShow = tiles.slice(0, 3);

  // Create carousel container
  const carouselWrapper = document.createElement('div');
  carouselWrapper.className = 'carousel-wrapper';

  const carousel = document.createElement('div');
  carousel.className = 'carousel';

  const carouselTrack = document.createElement('div');
  carouselTrack.className = 'carousel-track';

  // Add tiles to carousel track
  for (const tileObj of tilesToShow) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    slide.appendChild(tileObj.el);
    carouselTrack.appendChild(slide);
  }

  carousel.appendChild(carouselTrack);

  // Create progress bars indicator
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'carousel-dots';

  for (let i = 0; i < tilesToShow.length; i++) {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot';
    if (i === 0) dot.classList.add('active');
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dotsContainer.appendChild(dot);
  }

  carouselWrapper.appendChild(carousel);
  carouselWrapper.appendChild(dotsContainer);
  container.appendChild(carouselWrapper);

  // Initialize carousel functionality
  initCarousel(carouselTrack, dotsContainer, tilesToShow.length);

  // Render "Recently Added" section
  await renderRecentlyAdded(container);
}

function initCarousel(track, dotsContainer, slideCount) {
  let currentIndex = 0;

  function updateCarousel() {
    const slideWidth = track.offsetWidth;
    track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;

    // Update progress bars - remove and re-add active class to restart animation
    const dots = dotsContainer.querySelectorAll('.carousel-dot');
    dots.forEach((dot, index) => {
      if (index === currentIndex) {
        // Force animation restart by removing and re-adding the class
        dot.classList.remove('active');
        void dot.offsetWidth; // Trigger reflow
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  function goToSlide(index) {
    currentIndex = (index + slideCount) % slideCount;
    updateCarousel();
  }

  // Progress bar navigation
  const dots = dotsContainer.querySelectorAll('.carousel-dot');
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      goToSlide(index);
      // Restart auto-advance after manual click
      clearInterval(autoPlayInterval);
      autoPlayInterval = setInterval(() => {
        goToSlide(currentIndex + 1);
      }, 8000);
    });
  });

  // Auto-advance carousel every 8 seconds
  let autoPlayInterval = setInterval(() => {
    goToSlide(currentIndex + 1);
  }, 8000);

  // Handle window resize
  window.addEventListener('resize', updateCarousel);

  // Initial update
  updateCarousel();
}

async function renderFromTiles(container, tilesData) {
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

  await renderGroupsInto(container, tilesArray);
}



// ============ MAIN HOMEPAGE BOOTSTRAP ============

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

          const chosen = chooseFeaturedImage(images);
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
  } catch (error) {
    console.error('Error loading homepage:', error);
  } finally {
    // Always hide loader when done (success or error)
    if (pageLoader) {
      pageLoader.classList.add('hidden');
    }
  }
})();

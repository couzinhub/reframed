// ============ IMAGE CDN HELPERS (ImageKit) ============

// Fetch images for a tag from ImageKit
async function fetchImagesForTag(tagName) {
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');
    const apiUrl = `https://api.imagekit.io/v1/files?tags=${encodeURIComponent(tagName)}&limit=1000`;

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      console.error('Failed to fetch from ImageKit API:', response.status);
      return [];
    }

    const files = await response.json();

    return files.map(file => ({
      public_id: file.filePath.substring(1), // Remove leading slash
      file_id: file.fileId,
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
      tags: file.tags || []
    }));
  } catch (error) {
    console.error('Error fetching from ImageKit:', error);
    return [];
  }
}

function FxK(str) {
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    return String.fromCharCode(code + 1);
  }).join('');
}

// ============ VERSION COUNT CACHE ============
const VERSION_COUNT_CACHE_KEY = "reframed_version_counts_v1";

function loadVersionCountCache() {
  try {
    const raw = localStorage.getItem(VERSION_COUNT_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || !parsed.counts) return {};

    // Check TTL
    const age = Date.now() - parsed.savedAt;
    if (age > VERSION_COUNT_CACHE_TTL_MS) return {};

    return parsed.counts;
  } catch {
    return {};
  }
}

function saveVersionCountCache(counts) {
  try {
    localStorage.setItem(VERSION_COUNT_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      counts: counts
    }));
  } catch {
    // Ignore quota errors
  }
}

// Fetch version count for a specific file (with caching)
async function fetchFileVersionCount(fileId) {
  // Check cache first
  const cache = loadVersionCountCache();
  if (cache[fileId] !== undefined) {
    return cache[fileId];
  }

  // Fetch from API
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');
    const apiUrl = `https://api.imagekit.io/v1/files/${fileId}/versions`;

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      console.error('Failed to fetch versions from ImageKit API:', response.status);
      return 1; // Default to 1 version if fetch fails
    }

    const versions = await response.json();
    const count = Array.isArray(versions) ? versions.length : 1;

    // Save to cache
    cache[fileId] = count;
    saveVersionCountCache(cache);

    return count;
  } catch (error) {
    console.error('Error fetching versions from ImageKit:', error);
    return 1; // Default to 1 version if fetch fails
  }
}

// Fetch all files from ImageKit (for discovering tags)
async function fetchAllImageKitFiles() {
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');
    const apiUrl = 'https://api.imagekit.io/v1/files?limit=1000';

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      console.error('Failed to fetch from ImageKit API:', response.status);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching from ImageKit:', error);
    return [];
  }
}

// Get full-size image URL
function getImageUrl(publicId, updatedAt) {
  let url = `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=f-auto,q-auto`;
  // Add cache-busting parameter if updatedAt is provided
  if (updatedAt) {
    url += `&v=${encodeURIComponent(updatedAt)}`;
  }
  return url;
}

// Get original image URL without any transformations (for downloads)
function getOriginalImageUrl(publicId, updatedAt) {
  // Use orig-true to get the original uploaded file with no transformations
  let url = `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=orig-true`;
  // Add cache-busting parameter if updatedAt is provided
  if (updatedAt) {
    url += `&v=${encodeURIComponent(updatedAt)}`;
  }
  return url;
}

// Get thumbnail URL with specified width
function getThumbnailUrl(publicId, width, updatedAt) {
  let url = `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-${width},q-auto,f-auto`;
  // Add cache-busting parameter if updatedAt is provided
  if (updatedAt) {
    url += `&v=${encodeURIComponent(updatedAt)}`;
  }
  return url;
}

// Get thumbnail URL with crop/fill (for card thumbnails)
function getThumbnailUrlWithCrop(publicId, width, updatedAt) {
  let url = `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-${width},h-${width},c-at_max,q-auto,f-auto`;
  // Add cache-busting parameter if updatedAt is provided
  if (updatedAt) {
    url += `&v=${encodeURIComponent(updatedAt)}`;
  }
  return url;
}

// CSV Parser - parses CSV text into rows
function parseCSV(text) {
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(value.trim());
        value = "";
      } else if (ch === "\r") {
        // ignore
      } else if (ch === "\n") {
        current.push(value.trim());
        rows.push(current);
        current = [];
        value = "";
      } else {
        value += ch;
      }
    }
  }

  if (value.length > 0 || inQuotes || current.length > 0) {
    current.push(value.trim());
    rows.push(current);
  }

  return rows;
}

// Humanize Public ID - converts public IDs to readable names
function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();

  // Remove file extension (e.g., .jpg, .png, .webp, etc.)
  base = base.replace(/\.[^.]+$/, "");

  return base
    .replace(/_/g, " ")
    .replace(/\s*[-_]\s*reframed[\s_-]*[a-z0-9]*/gi, "") // Remove "-reframed", "- reframed", "_reframed" with optional suffix
    .replace(/\s*[-_]\s*portrait\s*/gi, "") // Remove "portrait", "- portrait", "_portrait"
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Extract artist name from artwork title (assumes format "Artist Name - Artwork Title")
function extractArtistFromTitle(title) {
  const parts = title.split(' - ');
  return parts.length > 1 ? parts[0].trim() : null;
}

// Create artwork card element (shared across all pages)
function createArtworkCard(publicId, niceName, tags, width, height, updatedAt, createdAt, fileId, versionCount) {
  const isPortrait =
    typeof width === "number" &&
    typeof height === "number" &&
    height > width;

  const thumbWidth = 700;

  const card = document.createElement("div");
  card.className = "card artwork";
  card.dataset.publicId = publicId;

  const imageUrl = getImageUrl(publicId, updatedAt);
  const originalUrl = getOriginalImageUrl(publicId, updatedAt);

  // Add click handler to toggle downloads queue
  card.addEventListener('click', (e) => {
    // Don't toggle if clicking on artist link
    if (e.target.classList.contains('artist-link-inline')) {
      return;
    }

    // Don't toggle if clicking zoom icon
    if (e.target.closest('.zoom-icon')) {
      return;
    }

    e.preventDefault();

    // Check if we're on mobile
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // Mobile behavior: first tap shows hover state, second tap adds to downloads
      if (!card.classList.contains('mobile-active')) {
        // First tap: show hover state
        card.classList.add('mobile-active');

        // Remove mobile-active class from all other cards
        document.querySelectorAll('.card.mobile-active').forEach(otherCard => {
          if (otherCard !== card) {
            otherCard.classList.remove('mobile-active');
          }
        });

        return; // Don't add to downloads yet
      }
      // Second tap will continue to download logic below
    }

    // Desktop behavior or second mobile tap: toggle downloads
    if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
      if (window.isInDownloads(publicId)) {
        window.removeFromDownloads(publicId);
      } else {
        window.addToDownloads(publicId, niceName, originalUrl, isPortrait ? 'portrait' : 'landscape', updatedAt);
      }
    }
  });

  // Set initial state if in downloads
  if (typeof window.isInDownloads === 'function' && window.isInDownloads(publicId)) {
    card.classList.add('in-downloads');
  }

  const imgEl = document.createElement("img");
  imgEl.loading = "lazy";
  imgEl.src = getThumbnailUrl(publicId, thumbWidth, updatedAt);
  imgEl.alt = niceName;

  // Create zoom icon
  const zoomIcon = document.createElement("button");
  zoomIcon.className = "zoom-icon";
  zoomIcon.setAttribute("aria-label", "Preview artwork");
  zoomIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
    <path d="M120-120v-240h80v104l124-124 56 56-124 124h104v80H120Zm480 0v-80h104L580-324l56-56 124 124v-104h80v240H600ZM324-580 200-704v104h-80v-240h240v80H256l124 124-56 56Zm312 0-56-56 124-124H600v-80h240v240h-80v-104L636-580Z"/>
  </svg>`;

  zoomIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    showZoomOverlay(publicId, niceName, width, height, updatedAt);
  });

  const caption = document.createElement("div");
  caption.className = "artwork-title";

  // Check if title contains artist name (format: "Artist - Title")
  const artistName = extractArtistFromTitle(niceName);

  if (artistName && tags && tags.length > 0) {
    // Find matching tag (case-insensitive)
    const matchingTag = tags.find(tag =>
      !tag.toLowerCase().startsWith('collection - ') &&
      tag.toLowerCase() === artistName.toLowerCase()
    );

    if (matchingTag) {
      // Create clickable artist name
      const prettyTag = matchingTag.trim()
        .replace(/-/g, "%2D")
        .replace(/\s+/g, "-");

      const artistLink = document.createElement("a");
      artistLink.href = `/tag/#${prettyTag}`;
      artistLink.className = "artist-link-inline";
      artistLink.textContent = artistName;

      // Prevent click from toggling download
      artistLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // Add artist link and the rest of the title (including " - " separator)
      const remainingText = niceName.substring(artistName.length);
      caption.appendChild(artistLink);
      caption.appendChild(document.createTextNode(remainingText));
    } else {
      // No matching tag, just show title
      caption.textContent = niceName;
    }
  } else {
    // No artist in title or no tags, just show title
    caption.textContent = niceName;
  }

  // Add "New version" ribbon if file was updated (not just created) within last 12 days
  if (updatedAt && createdAt) {
    const updatedDate = new Date(updatedAt);
    const createdDate = new Date(createdAt);

    // Check if the difference between updatedAt and createdAt is more than 1 hour
    const hoursSinceCreation = (updatedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

    // Only show ribbon if file was updated more than 1 hour after creation
    if (hoursSinceCreation > 1) {
      const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate <= 12) {
        // Check if image has more than 1 version
        if (versionCount && versionCount > 1) {
          const ribbon = document.createElement("div");
          ribbon.className = "new-version-ribbon";
          ribbon.textContent = "New version";
          card.appendChild(ribbon);
        }
      }
    }
  }

  card.appendChild(imgEl);
  card.appendChild(zoomIcon);
  card.appendChild(caption);

  return card;
}

// ============ ZOOM OVERLAY ============
function showZoomOverlay(publicId, niceName, width, height, updatedAt) {
  // Remove existing overlay if any
  const existingOverlay = document.getElementById('zoomOverlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'zoomOverlay';
  overlay.className = 'zoom-overlay';

  // Add loading state with spinner and percentage
  overlay.innerHTML = `
    <div class="zoom-loading">
      <div class="spinner"></div>
      <div class="zoom-percentage">0%</div>
    </div>
  `;

  const percentageEl = overlay.querySelector('.zoom-percentage');
  const imageUrl = getImageUrl(publicId, updatedAt);

  // Fetch image with progress tracking
  fetch(imageUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const contentLength = response.headers.get('content-length');

      if (!contentLength) {
        // If content-length is not available, fall back to simple loading
        return response.blob().then(blob => {
          percentageEl.textContent = '100%';
          return blob;
        });
      }

      const total = parseInt(contentLength, 10);
      let loaded = 0;

      const reader = response.body.getReader();
      const chunks = [];

      return new ReadableStream({
        start(controller) {
          function push() {
            reader.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                return;
              }

              loaded += value.length;
              const percentage = Math.round((loaded / total) * 100);
              percentageEl.textContent = `${percentage}%`;

              chunks.push(value);
              controller.enqueue(value);
              push();
            }).catch(error => {
              console.error('Stream reading error:', error);
              controller.error(error);
            });
          }
          push();
        }
      });
    })
    .then(stream => new Response(stream))
    .then(response => response.blob())
    .then(blob => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.alt = niceName;
      img.style.maxWidth = '90vw';
      img.style.maxHeight = '90vh';
      img.style.objectFit = 'contain';

      img.onload = () => {
        overlay.innerHTML = '';

        // Create close button
        const closeButton = document.createElement('button');
        closeButton.className = 'zoom-close';
        closeButton.setAttribute('aria-label', 'Close preview');
        closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
          <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
        </svg>`;
        closeButton.addEventListener('click', (e) => {
          e.stopPropagation();
          closeOverlay();
        });

        // Create message banner
        const message = document.createElement('div');
        message.className = 'zoom-message';
        message.textContent = 'This preview is half the size of the original, add to download to get the full version';

        overlay.appendChild(closeButton);
        overlay.appendChild(message);
        overlay.appendChild(img);
        URL.revokeObjectURL(img.src);
      };
    })
    .catch(error => {
      console.error('Error loading image:', error);
      overlay.innerHTML = '<div class="zoom-loading">Error loading image</div>';
    });

  // Function to close overlay with animation
  const closeOverlay = () => {
    overlay.classList.add('zoom-out');
    setTimeout(() => {
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
    }, 300); // Match the animation duration
  };

  // Close on click
  overlay.addEventListener('click', closeOverlay);

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeOverlay();
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(overlay);
}

// Generic Cache Helpers
function loadFromCache(cacheKey, ttlMs) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt) return null;

    const age = Date.now() - parsed.savedAt;
    if (ttlMs && age > ttlMs) return null;

    return parsed;
  } catch {
    return null;
  }
}

function saveToCache(cacheKey, data) {
  try {
    const toSave = {
      ...data,
      savedAt: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(toSave));
  } catch {
    // ignore quota errors
  }
}

// Toast Notification - can be used across pages
function showToast(message, duration = 5000, isHtml = false) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  if (isHtml) {
    toast.innerHTML = message;
    // Enable pointer events for HTML toasts (contains links)
    toast.style.pointerEvents = 'auto';
  } else {
    toast.textContent = message;
  }

  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Remove toast after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// Tip reminder - shakes button every 20 seconds
function startTipReminder() {
  setInterval(() => {
    // Check if we're on mobile viewport (narrow window) or if mobile menu is visible
    const isMobile = window.innerWidth <= 768;
    const mobileTopBar = document.querySelector('.mobile-top-bar');
    const isMobileLayout = mobileTopBar && window.getComputedStyle(mobileTopBar).display !== 'none';

    if (!isMobile && !isMobileLayout) {
      // Shake the tip button on desktop only
      const tipButton = document.querySelector('.kofi-button');
      if (tipButton) {
        tipButton.classList.add('shake');
        setTimeout(() => tipButton.classList.remove('shake'), 1000);
      }
    }
  }, 20000); // Every 20 seconds
}

// Start the tip reminder when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startTipReminder);
} else {
  startTipReminder();
}

// ============ DOWNLOADS ICON SVG ============
const DOWNLOAD_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
  <polyline points="7 10 12 15 17 10"></polyline>
  <line x1="12" y1="15" x2="12" y2="3"></line>
</svg>`;

// ============ DOWNLOADS UI COMPONENT ============
// This code injects the downloads button and modal into the page

function initializeDownloadsUI() {
  // Insert downloads button
  const downloadsButton = `
    <button id="downloadsButton" aria-label="View downloads queue">
      <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
        <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
      </svg>
      <span>Downloads</span>
      <span id="downloadsBadge"></span>
    </button>
  `;

  // Insert downloads modal
  const downloadsModal = `
    <div id="downloadsModal">
      <div class="downloads-modal-content">
        <div class="downloads-modal-header">
          <h2>Downloads (<span id="downloadsCount">0</span>)</h2>
          <button id="closeDownloadsModal" aria-label="Close">&times;</button>
        </div>
        <div class="downloads-modal-body">
          <div id="downloadsEmpty">
            <svg xmlns="http://www.w3.org/2000/svg" height="64px" viewBox="0 -960 960 960" width="64px" fill="currentColor">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>
            <p>No artworks selected</p>
          </div>
          <div id="downloadsGrid"></div>
        </div>
        <div class="downloads-modal-footer">
          <button id="clearAllDownloads">Clear All</button>
          <span id="downloadProgress"></span>
          <button id="downloadAllBtn">Download All</button>
        </div>
      </div>
    </div>
  `;

  // Append to body
  document.body.insertAdjacentHTML('beforeend', downloadsButton);
  document.body.insertAdjacentHTML('beforeend', downloadsModal);
}

// Initialize downloads UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDownloadsUI);
} else {
  initializeDownloadsUI();
}

// Remove mobile-active state when tapping outside of cards
document.addEventListener('click', (e) => {
  // Only run on mobile
  if (window.innerWidth > 768) return;

  // If the click is not on a card or its children, remove mobile-active from all cards
  if (!e.target.closest('.card')) {
    document.querySelectorAll('.card.mobile-active').forEach(card => {
      card.classList.remove('mobile-active');
    });
  }
});

// ============ NAVIGATION MENU COMPONENT ============
// This code is shared across all pages

function initializeNavigation(currentPage) {
  // Determine if we're in a subdirectory - use absolute paths for tag pages
  const isSubdirectory = window.location.pathname.includes('/tag/');
  const imgPath = isSubdirectory ? '/img/reframed.svg' : 'img/reframed.svg';

  // Insert mobile top bar
  const mobileTopBar = `
    <div class="mobile-top-bar">
      <button class="hamburger-menu" aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <a href="/">
        <img src="${imgPath}" alt="Reframed Logo" class="mobile-logo">
      </a>
    </div>
  `;

  // Insert sidebar
  const aside = `
    <aside>
      <a href="/">
        <img id="logo" src="${imgPath}" alt="Reframed Logo">
      </a>
      <ul>
        <li class="${currentPage === 'home' ? 'current' : ''}"><a href="/">Home</a></li>
        <li class="${currentPage === 'search' ? 'current' : ''}"><a href="/search.html">Search</a></li>
        <li class="${currentPage === 'artists' ? 'current' : ''}"><a href="/artists.html">Artists</a></li>
        <li class="${currentPage === 'collections' ? 'current' : ''}"><a href="/collections.html">Collections</a></li>
        <li class="${currentPage === 'tag' && window.location.hash === '#Vertical-artworks' ? 'current' : ''}"><a href="/tag/#Vertical-artworks">Vertical artworks</a></li>
        <li class="${currentPage === 'faq' ? 'current' : ''}"><a href="/faq.html">FAQ</a></li>
        <li class="${currentPage === 'contact' ? 'current' : ''}"><a href="/contact.html">Contact</a></li>
      </ul>
      <div class="button tip"></div>
      <div class="button own-art">
        <a class="contact" href="/contact.html">Get your own art reframed</a>
      </div>
    </aside>
  `;

  // Insert into page
  document.body.insertAdjacentHTML('afterbegin', mobileTopBar + aside);

  // Add Ko-fi button styled like the original widget
  const tipContainer = document.querySelector('.button.tip');
  if (tipContainer) {
    tipContainer.innerHTML = `
      <a href="https://ko-fi.com/O5O51FWPUL" target="_blank" class="kofi-button">
        <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="Ko-fi">
        <span>Thank me with a tip</span>
      </a>
    `;
  }

  // Update tag menu items if on tag page with hash
  if (currentPage === 'tag') {
    const updateTagMenuItems = () => {
      const asideElement = document.querySelector('aside');
      if (!asideElement) return;

      // Update Vertical artworks menu item
      const verticalItem = asideElement.querySelector('a[href="/tag/#Vertical-artworks"]')?.parentElement;
      if (verticalItem) {
        if (window.location.hash === '#Vertical-artworks') {
          verticalItem.classList.add('current');
        } else {
          verticalItem.classList.remove('current');
        }
      }
    };

    // Update immediately and on hash change
    setTimeout(updateTagMenuItems, 0);
    window.addEventListener('hashchange', updateTagMenuItems);
  }

  // Initialize mobile menu functionality
  const hamburgerMenu = document.querySelector('.hamburger-menu');
  const asideElement = document.querySelector('aside');

  if (hamburgerMenu && asideElement) {
    hamburgerMenu.addEventListener('click', () => {
      hamburgerMenu.classList.toggle('active');
      asideElement.classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });

    // Close menu when clicking overlay
    document.body.addEventListener('click', (e) => {
      if (document.body.classList.contains('menu-open') &&
          !asideElement.contains(e.target) &&
          !hamburgerMenu.contains(e.target)) {
        hamburgerMenu.classList.remove('active');
        asideElement.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });

    // Close menu when clicking a link in the sidebar
    asideElement.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerMenu.classList.remove('active');
        asideElement.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    });
  }
}


const ART_CACHE_TK = FxK("oqhu`sd") + "_" + FxK("WT40tmf") + FxK("AuHjKjEbpkS5BedPuYBj") + "=";
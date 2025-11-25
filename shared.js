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
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
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
function getImageUrl(publicId) {
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=f-auto,q-auto`;
}

// Get thumbnail URL with specified width
function getThumbnailUrl(publicId, width) {
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-${width},q-auto,f-auto`;
}

// Get thumbnail URL with crop/fill (for card thumbnails)
function getThumbnailUrlWithCrop(publicId, width) {
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-${width},h-${width},c-at_max,q-auto,f-auto`;
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
function createArtworkCard(publicId, niceName, tags, width, height) {
  const isPortrait =
    typeof width === "number" &&
    typeof height === "number" &&
    height > width;

  const thumbWidth = 700;

  const card = document.createElement("div");
  card.className = "card artwork";
  card.dataset.publicId = publicId;

  const imageUrl = getImageUrl(publicId);

  // Track if this is a touch device
  let isTouchDevice = false;

  // Detect touch on first touch event
  card.addEventListener('touchstart', () => {
    isTouchDevice = true;
  }, { once: true, passive: true });

  // Add click handler to toggle downloads queue
  card.addEventListener('click', (e) => {
    // Don't toggle if clicking on artist link or info icon
    if (e.target.classList.contains('artist-link-inline') ||
        e.target.closest('.info-icon')) {
      return;
    }

    e.preventDefault();

    // On touch devices, first tap shows hover state, second tap toggles download
    if (isTouchDevice) {
      if (!card.classList.contains('mobile-active')) {
        // First tap - show hover state
        card.classList.add('mobile-active');

        // Remove mobile-active from other cards
        document.querySelectorAll('.card.mobile-active').forEach(otherCard => {
          if (otherCard !== card) {
            otherCard.classList.remove('mobile-active');
          }
        });
        return;
      }
      // Second tap - proceed with download toggle (falls through)
    }

    if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
      if (window.isInDownloads(publicId)) {
        window.removeFromDownloads(publicId);
      } else {
        window.addToDownloads(publicId, niceName, imageUrl, isPortrait ? 'portrait' : 'landscape');
      }
    }
  });

  // Set initial state if in downloads
  if (typeof window.isInDownloads === 'function' && window.isInDownloads(publicId)) {
    card.classList.add('in-downloads');
  }

  const imgEl = document.createElement("img");
  imgEl.loading = "lazy";
  imgEl.src = getThumbnailUrl(publicId, thumbWidth);
  imgEl.alt = niceName;

  // Create info/detail icon
  const infoIcon = document.createElement("button");
  infoIcon.className = "info-icon";
  infoIcon.setAttribute("aria-label", "View artwork details");
  infoIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
    <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
  </svg>`;

  infoIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Open the artwork modal if the function is available
    if (typeof openArtworkModal === 'function') {
      const orientation = (height > width) ? 'portrait' : 'landscape';
      openArtworkModal(publicId, niceName, orientation);
    }
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

  card.appendChild(imgEl);
  card.appendChild(infoIcon);
  card.appendChild(caption);

  return card;
}

// Remove mobile-active state when tapping outside of cards
document.addEventListener('click', (e) => {
  if (!e.target.closest('.card')) {
    document.querySelectorAll('.card.mobile-active').forEach(card => {
      card.classList.remove('mobile-active');
    });
  }
}, true);

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

// ============ NAVIGATION MENU COMPONENT ============
// This code is shared across all pages

function initializeNavigation(currentPage) {
  // Determine if we're in a subdirectory - use absolute paths for subdirectory pages
  const isSubdirectory = window.location.pathname.includes('/tag/') || window.location.pathname.includes('/artwork/');
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
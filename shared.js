// ============ GOOGLE ANALYTICS ============
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-14360H9J7X');

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
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}`;
}

// Get thumbnail URL with specified width
function getThumbnailUrl(publicId, width) {
  // Add cache version to ensure latest images are fetched when cache is invalidated
  const version = typeof CACHE_VERSION !== 'undefined' ? CACHE_VERSION : Date.now();
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-${width},q-auto,f-auto&v=${version}`;
}

// Get thumbnail URL with crop/fill (for card thumbnails)
function getThumbnailUrlWithCrop(publicId, width) {
  // Add cache version to ensure latest images are fetched when cache is invalidated
  const version = typeof CACHE_VERSION !== 'undefined' ? CACHE_VERSION : Date.now();
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-${width},h-${width},c-at_max,q-auto,f-auto&v=${version}`;
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

  // Track touch for scroll detection
  let touchStartY = 0;
  let touchMoved = false;
  let justActivated = false;

  // Detect touch on first touch event and show hover state
  card.addEventListener('touchstart', (e) => {
    isTouchDevice = true;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;

    // Don't show hover state if touching the buttons directly
    if (e.target.closest('.artwork-title') || e.target.closest('.download-button')) {
      return;
    }
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    if (Math.abs(touchY - touchStartY) > 10) {
      touchMoved = true;
    }
  }, { passive: true });

  card.addEventListener('touchend', (e) => {
    // Don't show hover state if touching the buttons directly
    if (e.target.closest('.artwork-title') || e.target.closest('.download-button')) {
      return;
    }

    // Only activate if it wasn't a scroll
    if (!touchMoved && !card.classList.contains('mobile-active')) {
      e.preventDefault(); // Prevent click from firing
      justActivated = true;
      card.classList.add('mobile-active');

      // Remove mobile-active from other cards
      document.querySelectorAll('.card.mobile-active').forEach(otherCard => {
        if (otherCard !== card) {
          otherCard.classList.remove('mobile-active');
        }
      });

      // Reset flag after a short delay
      setTimeout(() => {
        justActivated = false;
      }, 100);
    }
  });

  const imgEl = document.createElement("img");
  imgEl.loading = "lazy";
  imgEl.src = getThumbnailUrl(publicId, thumbWidth);
  imgEl.alt = niceName;

  // Create checkmark badge for in-downloads state
  const checkmarkBadge = document.createElement("button");
  checkmarkBadge.className = "in-downloads-checkmark";
  checkmarkBadge.setAttribute("aria-label", "Remove from downloads");
  checkmarkBadge.style.display = "none";

  // Function to update checkmark visibility
  const updateCheckmarkVisibility = () => {
    const inDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);
    checkmarkBadge.style.display = inDownloads ? 'block' : 'none';
  };

  checkmarkBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (typeof window.removeFromDownloads === 'function') {
      window.removeFromDownloads(publicId);
      updateDownloadButton();
      updateCheckmarkVisibility();
    }
  });

  // Create download button
  const downloadButton = document.createElement("button");
  downloadButton.className = "download-button";
  downloadButton.setAttribute("aria-label", "Add to downloads");

  // Function to update button state
  const updateDownloadButton = () => {
    const inDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);

    if (inDownloads) {
      downloadButton.classList.add('in-downloads');
      downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
        <path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
      </svg>
      <div>Added to Downloads</div>`;
      downloadButton.setAttribute("aria-label", "Remove from downloads");
    } else {
      downloadButton.classList.remove('in-downloads');
      downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
        <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
      </svg>
      <div>Add to Downloads</div>`;
      downloadButton.setAttribute("aria-label", "Add to downloads");
    }
  };

  // Set initial state
  updateDownloadButton();
  updateCheckmarkVisibility();

  downloadButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // On touch devices, only work if card is already active
    if (isTouchDevice && !card.classList.contains('mobile-active')) {
      return;
    }

    if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
      if (window.isInDownloads(publicId)) {
        window.removeFromDownloads(publicId);
      } else {
        window.addToDownloads(publicId, niceName, imageUrl, isPortrait ? 'portrait' : 'landscape');
      }
      // Update button state after toggling
      updateDownloadButton();
      updateCheckmarkVisibility();
    }
  });

  const caption = document.createElement("button");
  caption.className = "artwork-title";
  caption.setAttribute("aria-label", "View artwork details");

  // Add info icon to caption
  const infoIcon = document.createElement("span");
  infoIcon.className = "caption-info-icon";
  infoIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
    <path d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
  </svg>`;

  // Check if title contains artist name (format: "Artist - Title")
  const artistName = extractArtistFromTitle(niceName);
  const artworkTitle = artistName ? niceName.substring(artistName.length).replace(/^\s*-\s*/, '') : niceName;

  // Create caption content container
  const captionText = document.createElement("span");
  captionText.className = "caption-text";

  if (artistName && artworkTitle) {
    // Format as "[artwork]\nby [artist]"
    // Truncate artwork title to 90 characters
    const truncatedTitle = artworkTitle.length > 90
      ? artworkTitle.substring(0, 90) + '...'
      : artworkTitle;

    captionText.appendChild(document.createTextNode(truncatedTitle));
    captionText.appendChild(document.createElement('br'));

    const artistLine = document.createElement('span');
    artistLine.className = 'artist-line';
    artistLine.textContent = 'by ' + artistName;
    captionText.appendChild(artistLine);
  } else {
    // No artist in title, just show title
    // Truncate to 90 characters
    const truncatedTitle = niceName.length > 90
      ? niceName.substring(0, 90) + '...'
      : niceName;
    captionText.textContent = truncatedTitle;
  }

  caption.appendChild(infoIcon);
  caption.appendChild(captionText);

  // Make caption clickable to open modal
  caption.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // On touch devices, only work if card is already active
    if (isTouchDevice && !card.classList.contains('mobile-active')) {
      return;
    }

    // Open the artwork modal if the function is available
    if (typeof openArtworkModal === 'function') {
      const orientation = (height > width) ? 'portrait' : 'landscape';
      openArtworkModal(publicId, niceName, orientation);
    }
  });

  card.appendChild(imgEl);
  card.appendChild(downloadButton);
  card.appendChild(caption);
  card.appendChild(checkmarkBadge);

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
        <li class="${currentPage === 'browse' ? 'current' : ''}"><a href="/browse-recent.html">Browse & Search</a></li>
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
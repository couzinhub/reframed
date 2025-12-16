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
    // Use type=file to get only current versions, excluding old file-version entries
    const apiUrl = `https://api.imagekit.io/v1/files?tags=${encodeURIComponent(tagName)}&type=file&limit=1000`;

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
    // Use type=file to get only current versions, excluding old file-version entries
    const apiUrl = 'https://api.imagekit.io/v1/files?type=file&limit=1000';

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

// Get blur preview URL (tiny blurred thumbnail for instant loading)
function getBlurPreviewUrl(publicId) {
  const version = typeof CACHE_VERSION !== 'undefined' ? CACHE_VERSION : Date.now();
  return `${IMAGEKIT_URL_ENDPOINT}/${publicId}?tr=w-100,bl-3,q-20,f-auto&v=${version}`;
}

// Create image wrapper with blur-up loading for simple image cards (artists/collections)
function createImageWithLoading(publicId, thumbUrl, alt) {
  const wrapper = document.createElement("div");
  wrapper.className = "artwork-image-wrapper";

  // Blur preview
  const blurPreview = document.createElement("div");
  blurPreview.className = "artwork-blur-preview";
  const blurUrl = getBlurPreviewUrl(publicId);
  blurPreview.style.backgroundImage = `url("${blurUrl}")`;

  // Full image
  const imgEl = document.createElement("img");
  imgEl.loading = "lazy";
  imgEl.alt = alt;
  imgEl.className = "artwork-full-image";

  // Test blur preview load
  const blurPreviewTestImg = new Image();
  blurPreviewTestImg.onload = () => {
    blurPreview.classList.add('loaded');
  };
  blurPreviewTestImg.onerror = () => {
    blurPreview.classList.add('failed');
  };
  blurPreviewTestImg.src = blurUrl;

  // Set src first
  imgEl.src = thumbUrl;

  // Check if already cached - if so, skip blur entirely
  if (imgEl.complete && imgEl.naturalHeight !== 0) {
    // Image is cached, show it immediately without blur
    imgEl.classList.add('loaded');
    blurPreview.classList.add('failed'); // Don't show blur at all
  } else {
    // Image needs to load, show blur preview
    imgEl.addEventListener('load', () => {
      // Small delay to ensure blur is visible first
      setTimeout(() => {
        imgEl.classList.add('loaded');
        blurPreview.classList.add('hidden');
      }, 100);
    });

    imgEl.addEventListener('error', () => {
      blurPreview.classList.add('error');
    });
  }

  // Assemble
  wrapper.appendChild(blurPreview);
  wrapper.appendChild(imgEl);

  return wrapper;
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
  card.className = isPortrait ? "card artwork portrait" : "card artwork";
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
  imgEl.alt = niceName;

  // Create wrapper for image loading layers
  const imageWrapper = document.createElement("div");
  imageWrapper.className = "artwork-image-wrapper";

  // Layer 1: Blur preview (loads instantly)
  const blurPreview = document.createElement("div");
  blurPreview.className = "artwork-blur-preview";
  const blurUrl = getBlurPreviewUrl(publicId);
  blurPreview.style.backgroundImage = `url("${blurUrl}")`;

  // Layer 2: Progress bar (fallback if blur fails)
  const progressBar = document.createElement("div");
  progressBar.className = "artwork-progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "artwork-progress-fill";
  progressBar.appendChild(progressFill);

  // Layer 3: Full image - set class before src
  imgEl.className = "artwork-full-image";

  // Loading state management
  let progressInterval = null;

  // Start simulated progress animation
  const startProgress = () => {
    progressBar.classList.add('active');
    progressFill.style.width = '0%';

    // Animate 0-90% over 2 seconds
    const duration = 2000;
    const targetProgress = 90;
    const startTime = Date.now();

    progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * targetProgress, targetProgress);
      progressFill.style.width = `${progress}%`;

      if (progress >= targetProgress) {
        clearInterval(progressInterval);
      }
    }, 50);
  };

  // Complete progress and hide bar
  const completeProgress = () => {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    progressFill.style.width = '100%';
    setTimeout(() => {
      progressBar.classList.remove('active');
    }, 300);
  };

  // Test if blur preview loads successfully
  const blurPreviewTestImg = new Image();
  blurPreviewTestImg.onload = () => {
    blurPreview.classList.add('loaded');
  };
  blurPreviewTestImg.onerror = () => {
    // Blur failed, show progress bar instead
    blurPreview.classList.add('failed');
    startProgress();
  };
  blurPreviewTestImg.src = getBlurPreviewUrl(publicId);

  // Now set the src to trigger loading
  imgEl.src = getThumbnailUrl(publicId, thumbWidth);

  // Check if image is already loaded (from cache) - after setting src
  if (imgEl.complete && imgEl.naturalHeight !== 0) {
    // Image is cached, show it immediately without blur
    imgEl.classList.add('loaded');
    blurPreview.classList.add('failed'); // Don't show blur at all
  } else {
    // Image needs to load, show blur preview
    imgEl.addEventListener('load', () => {
      completeProgress();
      // Start both transitions simultaneously for smooth crossfade
      imgEl.classList.add('loaded');
      blurPreview.classList.add('hidden');
    });

    imgEl.addEventListener('error', () => {
      completeProgress();
      blurPreview.classList.add('error');
    });
  }

  // Assemble layers
  imageWrapper.appendChild(blurPreview);
  imageWrapper.appendChild(progressBar);
  imageWrapper.appendChild(imgEl);

  // Cleanup intervals on card removal
  const cleanupObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === card && progressInterval) {
          clearInterval(progressInterval);
        }
      });
    });
  });
  if (card.parentNode) {
    cleanupObserver.observe(card.parentNode, { childList: true });
  }

  // Create button container
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "button-container";

  // Create detail button as a link to artwork page
  const detailButton = document.createElement("a");
  detailButton.className = "action-button detail-button";
  detailButton.setAttribute("aria-label", "View artwork details");
  detailButton.innerHTML = `<span>About</span>`;

  // Create artwork page URL
  const humanizeFn = typeof humanizePublicId === 'function' ? humanizePublicId : ((pid) => {
    let base = pid.split("/").pop();
    base = base.replace(/\.[^.]+$/, "");
    return base
      .replace(/_/g, " ")
      .replace(/\s*[-_]\s*reframed[\s_-]*[a-z0-9]*/gi, "")
      .replace(/\s*[-_]\s*portrait\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  });
  const cleanSlug = humanizeFn(publicId).replace(/\s/g, '_');
  detailButton.href = `/artwork/#${cleanSlug}`;

  // On touch devices, only work if card is already active
  detailButton.addEventListener('click', (e) => {
    if (isTouchDevice && !card.classList.contains('mobile-active')) {
      e.preventDefault();
      return;
    }
  });

  // Create download button
  const downloadButton = document.createElement("button");
  downloadButton.className = "action-button download-button";
  downloadButton.setAttribute("aria-label", "Add to downloads");

  // Function to update download button state
  const updateDownloadButton = () => {
    const inDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);

    if (inDownloads) {
      downloadButton.classList.add('in-downloads');
      downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
        <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
      </svg>
      <span>Added</span>`;
      downloadButton.setAttribute("aria-label", "Added to downloads");
    } else {
      downloadButton.classList.remove('in-downloads');
      downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
        <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
      </svg>
      <span>Add to downloads</span>`;
      downloadButton.setAttribute("aria-label", "Add to downloads");
    }
  };

  // Set initial state
  updateDownloadButton();

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
    }
  });

  // Add buttons to container
  buttonContainer.appendChild(detailButton);
  buttonContainer.appendChild(downloadButton);

  card.appendChild(imageWrapper);
  card.appendChild(buttonContainer);

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
        <li class="${currentPage === 'browse' ? 'current' : ''}"><a href="/browse-recent.html">Browse</a></li>
        <li class="${currentPage === 'search' ? 'current' : ''}"><a href="/search.html">Search</a></li>
        <li class="${currentPage === 'faq' ? 'current' : ''}"><a href="/faq.html">FAQ</a></li>
        <li class="${currentPage === 'contact' ? 'current' : ''}"><a href="/contact.html">Contact</a></li>
      </ul>
      <div class="button tip"></div>
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
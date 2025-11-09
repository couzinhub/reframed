// ============ SHARED UTILITY FUNCTIONS ============

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

// Humanize Public ID - converts Cloudinary public IDs to readable names
function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
        <li class="${currentPage === 'artists' ? 'current' : ''}"><a href="/artists.html">Artists</a></li>
        <li class="${currentPage === 'collections' ? 'current' : ''}"><a href="/collections.html">Collections</a></li>
        <li class="${currentPage === 'tag' && window.location.hash === '#Vertical%20artworks' ? 'current' : ''}"><a href="/tag/#Vertical%20artworks">Vertical artworks</a></li>
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

  // Update Vertical artworks menu item if on tag page with hash
  if (currentPage === 'tag') {
    const updateVerticalMenuItem = () => {
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
    setTimeout(updateVerticalMenuItem, 0);
    window.addEventListener('hashchange', updateVerticalMenuItem);
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

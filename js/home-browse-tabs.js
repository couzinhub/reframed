// assumes shared.js and home.js are loaded first
// Manages tab switching and lazy loading for browse sections on homepage

// ---------- TAB CONTROLLER ----------
const BrowseTabsController = {
  currentTab: 'recent',
  initialized: {
    recent: false,
    collections: false,
    artists: false,
    vertical: false
  },
  browseScriptsLoaded: false,
  collectionsScriptLoaded: false,
  isLoadingScripts: false,
  isSwitchingTabs: false, // Flag to prevent saving during tab switches

  // Scroll position tracking for each tab (null = never visited)
  scrollPositions: {
    recent: null,
    collections: null,
    artists: null,
    vertical: null
  },

  // Session storage key for scroll positions
  STORAGE_KEY_SCROLL: 'reframed_tab_scroll_positions',

  // Initialize the tab system
  init() {
    const tabsContainer = document.getElementById('browseTabs');
    if (!tabsContainer) {
      console.error('Browse tabs container not found');
      return;
    }

    // Restore saved scroll positions from sessionStorage
    this.restoreState();

    // Determine initial tab from URL hash (defaults to 'recent' if no hash)
    this.currentTab = this.getTabFromHash();

    // Render tabs
    const tabsElement = this.renderBrowseTabsForHome();
    tabsContainer.appendChild(tabsElement);

    // Set up scroll tracking for all tabs
    this.setupScrollTracking();

    // Listen for hash changes (browser back/forward)
    window.addEventListener('hashchange', () => {
      this.handleHashChange();
    });

    // Save state before page unload
    window.addEventListener('beforeunload', () => {
      this.saveState();
    });

    // Update UI to show the active tab
    if (this.currentTab !== 'recent') {
      // Update tab UI to match current state
      const tabsElement = tabsContainer.querySelector('.tabs');
      if (tabsElement) {
        tabsElement.querySelectorAll('li').forEach(li => {
          li.classList.remove('current');
        });
        const targetTab = Array.from(tabsElement.querySelectorAll('li')).find(li => {
          const link = li.querySelector('a');
          return link && link.href.endsWith('#' + this.currentTab);
        });
        if (targetTab) {
          targetTab.classList.add('current');
        }
      }

      // Show the active tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      const targetContent = document.getElementById(this.currentTab + 'TabContent');
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Show/hide alphabet navigation based on active tab
      const alphabetNav = document.querySelector('.alphabet-scrollbar');
      if (alphabetNav) {
        if (this.currentTab === 'artists') {
          alphabetNav.classList.add('visible');
        } else {
          alphabetNav.classList.remove('visible');
        }
      }
    } else {
      // On initial load with 'recent' tab, hide alphabet nav
      const alphabetNav = document.querySelector('.alphabet-scrollbar');
      if (alphabetNav) {
        alphabetNav.classList.remove('visible');
      }
    }

    // Initialize the active tab
    this.initTab(this.currentTab).then(() => {
      // Only restore scroll position if there's a hash in URL (returning to browse mode)
      // If no hash, it's a fresh visit - stay at top
      const hasHash = window.location.hash !== '';
      if (hasHash && this.scrollPositions[this.currentTab] !== null) {
        this.restoreScrollPosition(this.currentTab, false);
      } else if (hasHash) {
        // Has hash but no saved position - scroll to tabs
        const browseSection = document.getElementById('browseTabsSection');
        if (browseSection) {
          const rect = browseSection.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + scrollTop;
          window.scrollTo({
            top: targetPosition,
            behavior: 'instant'
          });
        }
      }
      // else: no hash, fresh visit - stay at top
    });
  },

  // Get tab ID from URL hash
  getTabFromHash() {
    const hash = window.location.hash.substring(1); // Remove the '#'

    // Empty hash means default "recent" tab
    if (!hash) {
      return 'recent';
    }

    const validTabs = ['recent', 'collections', 'artists', 'vertical'];
    // #recent explicitly means recent tab (user scrolled down)
    return validTabs.includes(hash) ? hash : 'recent'; // Default to recent for invalid hashes
  },

  // Handle hash change events (browser back/forward)
  handleHashChange() {
    const hashTab = this.getTabFromHash();
    if (hashTab !== this.currentTab) {
      // Switch to the tab specified in the hash (or "recent" if no hash)
      this.switchTab(hashTab, true);
    }
  },

  // Restore state from sessionStorage
  restoreState() {
    try {
      // Only restore scroll positions from sessionStorage
      // Active tab is determined by URL hash
      const savedScrollPositions = sessionStorage.getItem(this.STORAGE_KEY_SCROLL);
      if (savedScrollPositions) {
        this.scrollPositions = JSON.parse(savedScrollPositions);
      }
    } catch (err) {
      console.error('Error restoring tab state:', err);
    }
  },

  // Save state to sessionStorage
  saveState() {
    try {
      // Save current scroll position before saving
      this.saveCurrentScrollPosition();

      // Save scroll positions (active tab is in URL hash)
      sessionStorage.setItem(this.STORAGE_KEY_SCROLL, JSON.stringify(this.scrollPositions));
    } catch (err) {
      console.error('Error saving tab state:', err);
    }
  },

  // Save current tab's scroll position
  saveCurrentScrollPosition() {
    // Don't save during tab switches to prevent race conditions
    if (this.isSwitchingTabs) return;

    // Only save scroll position for tabs that have been initialized
    // This prevents accidentally saving scroll positions during tab switches
    if (this.initialized[this.currentTab]) {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      this.scrollPositions[this.currentTab] = scrollY;
    }
  },

  // Set up scroll tracking for all tabs
  setupScrollTracking() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      // Debounce scroll events
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.saveCurrentScrollPosition();
        // Also save to sessionStorage periodically
        this.saveState();

        // Update URL hash based on scroll position
        this.updateHashBasedOnScroll();
      }, 100);
    });

    // Also save state when clicking on links (before navigation)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && !link.href.startsWith('#')) {
        // User is navigating away, save state
        this.saveState();
      }
    });
  },

  // Update URL hash based on whether user has scrolled to browse section
  updateHashBasedOnScroll() {
    const browseSection = document.getElementById('browseTabsSection');
    if (!browseSection) return;

    const rect = browseSection.getBoundingClientRect();
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const tabsStickyPosition = rect.top + currentScrollY;

    const alphabetNav = document.querySelector('.alphabet-scrollbar');

    // If scrolled to or past tabs (tabs are sticky at top), add hash
    // Only remove hash if scrolled significantly above tabs (viewing homepage tiles)
    // Use a 100px buffer to prevent flickering when at tabs position
    if (currentScrollY >= tabsStickyPosition - 50) {
      // User is browsing - add hash if not present (except for 'recent' default)
      const currentHash = window.location.hash.substring(1);
      const expectedHash = this.currentTab === 'recent' ? '' : this.currentTab;

      if (this.currentTab === 'recent') {
        // For recent tab, add #recent when browsing
        if (currentHash !== 'recent') {
          history.replaceState(null, '', '#recent');
        }
      } else {
        // For other tabs, keep their hash
        if (currentHash !== this.currentTab) {
          history.replaceState(null, '', '#' + this.currentTab);
        }
      }

      // Show alphabet nav only if on artists tab and browsing
      if (alphabetNav) {
        if (this.currentTab === 'artists') {
          alphabetNav.classList.add('visible');
        } else {
          alphabetNav.classList.remove('visible');
        }
      }
    } else {
      // User is viewing homepage tiles - remove hash
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
      }

      // Hide alphabet nav when viewing homepage tiles
      if (alphabetNav) {
        alphabetNav.classList.remove('visible');
      }
    }
  },

  // Create tab navigation UI
  renderBrowseTabsForHome() {
    const tabs = [
      { id: 'recent', label: 'Recently added' },
      { id: 'collections', label: 'Collections' },
      { id: 'artists', label: 'Artists' },
      { id: 'vertical', label: 'Vertical artworks' }
    ];

    const ul = document.createElement('ul');
    ul.className = 'tabs';

    tabs.forEach(tab => {
      const li = document.createElement('li');
      if (tab.id === this.currentTab) {
        li.className = 'current';
      }

      const a = document.createElement('a');
      a.href = '#' + tab.id;
      a.textContent = tab.label;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(tab.id);
      });

      li.appendChild(a);
      ul.appendChild(li);
    });

    // Setup mobile dropdown functionality
    this.setupMobileTabsToggle(ul);

    return ul;
  },

  // Setup mobile dropdown toggle (adapted from browse.js)
  setupMobileTabsToggle(tabsElement) {
    const currentTab = tabsElement.querySelector('li.current');
    if (!currentTab) return;

    const currentLink = currentTab.querySelector('a');
    let dropdownContainer = null;

    const reorganizeForMobile = () => {
      if (window.innerWidth <= 768 && !dropdownContainer) {
        // Create dropdown and add all tabs in order
        const allTabs = Array.from(tabsElement.querySelectorAll('li'));
        dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'tabs-dropdown';

        allTabs.forEach(tab => {
          if (tab.classList.contains('current')) {
            // Clone current tab for dropdown
            const clone = tab.cloneNode(true);
            clone.classList.remove('current');
            clone.classList.add('current-in-dropdown');
            // Re-attach click handler
            const link = clone.querySelector('a');
            link.addEventListener('click', (e) => {
              e.preventDefault();
              const tabId = link.href.split('#')[1];
              this.switchTab(tabId);
            });
            dropdownContainer.appendChild(clone);
          } else {
            // Move non-current tabs
            dropdownContainer.appendChild(tab);
          }
        });

        tabsElement.appendChild(dropdownContainer);
      } else if (window.innerWidth > 768 && dropdownContainer) {
        // Restore original structure for desktop
        const tabs = Array.from(dropdownContainer.querySelectorAll('li:not(.current-in-dropdown)'));
        tabs.forEach(tab => {
          tabsElement.appendChild(tab);
        });
        dropdownContainer.remove();
        dropdownContainer = null;
      }
    };

    reorganizeForMobile();
    window.addEventListener('resize', reorganizeForMobile);

    currentLink.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        tabsElement.classList.toggle('open');
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && !tabsElement.contains(e.target)) {
        tabsElement.classList.remove('open');
      }
    });
  },

  // Switch to a different tab
  async switchTab(tabId, fromHashChange = false) {
    // If clicking on already active tab, scroll to top of tab content
    if (this.currentTab === tabId) {
      const browseSection = document.getElementById('browseTabsSection');
      if (browseSection) {
        const rect = browseSection.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetPosition = rect.top + scrollTop;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
      return;
    }

    // Save current tab's scroll position BEFORE setting the switching flag
    this.saveCurrentScrollPosition();

    // Set flag to prevent scroll position saves during transition
    this.isSwitchingTabs = true;

    // Update current tab tracking
    const previousTab = this.currentTab;
    this.currentTab = tabId;

    // Update URL hash (only if not triggered by hash change to avoid loops)
    // Note: updateHashBasedOnScroll will update hash based on actual scroll position
    if (!fromHashChange) {
      // For user-initiated tab switches, set the hash
      // The scroll handler will adjust it based on position
      if (tabId === 'recent') {
        // Start with no hash for recent, will be added if they scroll
        history.pushState(null, '', window.location.pathname);
      } else {
        // For non-recent tabs, add hash
        history.pushState(null, '', '#' + tabId);
      }
    }

    // Update tab UI
    const tabsElement = document.querySelector('.tabs');
    if (tabsElement) {
      // Close mobile dropdown if open
      tabsElement.classList.remove('open');

      tabsElement.querySelectorAll('li').forEach(li => {
        li.classList.remove('current');
        li.classList.remove('current-in-dropdown');
      });

      // Find and mark the target tab as current
      const allTabs = Array.from(tabsElement.querySelectorAll('li'));
      const targetTab = allTabs.find(li => {
        const link = li.querySelector('a');
        return link && link.href.endsWith('#' + tabId);
      });

      if (targetTab) {
        targetTab.classList.add('current');

        // On mobile, reorganize dropdown
        if (window.innerWidth <= 768) {
          const dropdownContainer = tabsElement.querySelector('.tabs-dropdown');
          if (dropdownContainer) {
            // Move current tab out of dropdown
            tabsElement.insertBefore(targetTab, dropdownContainer);

            // Update dropdown to mark the current tab
            const cloneInDropdown = Array.from(dropdownContainer.querySelectorAll('li')).find(li => {
              const link = li.querySelector('a');
              return link && link.href.endsWith('#' + tabId);
            });
            if (cloneInDropdown) {
              cloneInDropdown.classList.add('current-in-dropdown');
            }
          }
        }
      }
    }

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    // Show target tab content
    const targetContent = document.getElementById(tabId + 'TabContent');
    if (targetContent) {
      targetContent.classList.add('active');
    }

    // Show/hide alphabet navigation based on active tab
    const alphabetNav = document.querySelector('.alphabet-scrollbar');
    if (alphabetNav) {
      if (tabId === 'artists') {
        alphabetNav.classList.add('visible');
      } else {
        alphabetNav.classList.remove('visible');
      }
    }

    // Initialize tab if not already initialized
    if (!this.initialized[tabId]) {
      await this.initTab(tabId);
      // Give content a moment to render before scrolling
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Restore scroll position for the new tab (this is an active switch)
    this.restoreScrollPosition(tabId, true);

    // Clear the switching flag after scroll completes (smooth scroll takes ~300ms)
    setTimeout(() => {
      this.isSwitchingTabs = false;
      // Now save state after scroll is complete
      this.saveState();
      // Update hash based on scroll position after restore
      this.updateHashBasedOnScroll();
    }, 400);
  },

  // Restore scroll position for a specific tab
  restoreScrollPosition(tabId, isActiveSwitch = false) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const browseSection = document.getElementById('browseTabsSection');
      if (!browseSection) return;

      // Calculate the position where tabs stick to the top
      const rect = browseSection.getBoundingClientRect();
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
      const tabsStickyPosition = rect.top + currentScrollY;

      const savedPosition = this.scrollPositions[tabId];

      // Smart scroll logic:
      // If user is above the tabs sticky position, scroll to at least that position
      // If user is already past that point, restore saved position or stay put
      if (currentScrollY < tabsStickyPosition) {
        // User is above tabs
        if (savedPosition !== null) {
          // Tab was visited before - restore saved position (but at least to tabs)
          window.scrollTo({
            top: Math.max(savedPosition, tabsStickyPosition),
            behavior: 'smooth'
          });
        } else if (isActiveSwitch) {
          // First visit during active tab switch - scroll to tabs position
          window.scrollTo({
            top: tabsStickyPosition,
            behavior: 'smooth'
          });
        }
        // else: first visit on page load - stay at current position (top)
      } else {
        // User is already scrolled past tabs
        if (savedPosition !== null) {
          // Tab was visited before - restore its saved position
          window.scrollTo({
            top: savedPosition,
            behavior: 'instant'
          });
        } else if (isActiveSwitch) {
          // First visit to this tab during active switch - scroll to tabs position
          // This ensures thumbnails load properly and user sees content from the beginning
          window.scrollTo({
            top: tabsStickyPosition,
            behavior: 'smooth'
          });
        }
        // else: first visit on page load while scrolled - stay at current position
      }
    });
  },

  // Initialize a tab's content
  async initTab(tabId) {
    if (this.initialized[tabId]) return;

    // Show loading spinner
    const targetContent = document.getElementById(tabId + 'TabContent');
    if (targetContent) {
      const grid = targetContent.querySelector('.tag-grid');
      if (grid) {
        grid.innerHTML = '<div class="loading-spinner-container"><span class="spinner large"></span></div>';
      }
    }

    // For non-recent tabs, ensure browse.js is loaded
    if (tabId !== 'recent' && !this.browseScriptsLoaded) {
      await this.loadBrowseScripts();
    }

    // For collections tab, also load collections.js
    if (tabId === 'collections' && !this.collectionsScriptLoaded) {
      await this.loadCollectionsScript();
    }

    // Call the appropriate init function
    try {
      switch (tabId) {
        case 'recent':
          await this.initRecentTab();
          break;
        case 'collections':
          await this.initCollectionsTab();
          break;
        case 'artists':
          await this.initArtistsTab();
          break;
        case 'vertical':
          await this.initVerticalTab();
          break;
      }
      this.initialized[tabId] = true;
    } catch (err) {
      console.error(`Error initializing ${tabId} tab:`, err);
      if (targetContent) {
        const grid = targetContent.querySelector('.tag-grid');
        if (grid) {
          grid.innerHTML = '<div class="error-message">Error loading content. Please try again.</div>';
        }
      }
    }
  },

  // Initialize Recent tab
  async initRecentTab() {
    // Load browse.js if not already loaded (Recent tab needs it for infinite scroll)
    if (!this.browseScriptsLoaded) {
      await this.loadBrowseScripts();
    }

    // Now call the proper init function from browse.js
    if (typeof initRecentPage === 'function') {
      await initRecentPage();
    } else {
      console.error('initRecentPage function not found');
    }
  },

  // Initialize Collections tab (requires browse.js and collections.js)
  async initCollectionsTab() {
    // Manually call initCollectionsPage since it won't auto-run on homepage
    if (typeof initCollectionsPage === 'function') {
      await initCollectionsPage();
    } else {
      console.error('initCollectionsPage function not found');
    }
  },

  // Initialize Artists tab (requires browse.js)
  async initArtistsTab() {
    // Manually call initArtistsPage since it won't auto-run on homepage
    if (typeof initArtistsPage === 'function') {
      await initArtistsPage();
    } else {
      console.error('initArtistsPage function not found');
    }
  },

  // Initialize Vertical tab (requires browse.js)
  async initVerticalTab() {
    // Manually call initVerticalPage since it won't auto-run on homepage
    if (typeof initVerticalPage === 'function') {
      await initVerticalPage();
    } else {
      console.error('initVerticalPage function not found');
    }
  },

  // Dynamically load browse.js
  async loadBrowseScripts() {
    if (this.browseScriptsLoaded || this.isLoadingScripts) {
      // Wait for loading to complete if in progress
      while (this.isLoadingScripts) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isLoadingScripts = true;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/browse.js';
      script.async = true;

      script.onload = () => {
        this.browseScriptsLoaded = true;
        this.isLoadingScripts = false;
        resolve();
      };

      script.onerror = () => {
        this.isLoadingScripts = false;
        reject(new Error('Failed to load browse.js'));
      };

      document.body.appendChild(script);
    });
  },

  // Dynamically load collections.js
  async loadCollectionsScript() {
    if (this.collectionsScriptLoaded) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/collections.js';
      script.async = true;

      script.onload = () => {
        this.collectionsScriptLoaded = true;
        resolve();
      };

      script.onerror = () => {
        reject(new Error('Failed to load collections.js'));
      };

      document.body.appendChild(script);
    });
  }
};

// Make controller globally available
window.BrowseTabsController = BrowseTabsController;

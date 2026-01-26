// ============ DOWNLOADS QUEUE SYSTEM ============
// Manages a persistent queue of artworks to download
// Works across all pages with localStorage persistence

const DOWNLOADS_QUEUE_KEY = 'reframed_downloads_queue';

// Global downloads queue state
window.DOWNLOADS_QUEUE = [];

// ============ QUEUE MANAGEMENT ============

function loadDownloadsQueue() {
  try {
    const raw = localStorage.getItem(DOWNLOADS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDownloadsQueue(queue) {
  try {
    localStorage.setItem(DOWNLOADS_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore quota errors
  }
}

function addToDownloads(publicId, niceName, imageUrl, aspectRatio = 'landscape') {
  const queue = loadDownloadsQueue();

  // Check if already in queue
  const exists = queue.some(item => item.publicId === publicId);
  if (exists) return false;

  // Add to queue
  queue.push({
    publicId,
    niceName,
    imageUrl,
    aspectRatio,
    addedAt: Date.now()
  });

  saveDownloadsQueue(queue);
  window.DOWNLOADS_QUEUE = queue;

  // Update UI
  updateAllArtworkStates();

  // Update downloads menu
  if (typeof window.updateDownloadsMenu === 'function') {
    window.updateDownloadsMenu();
  }

  return true;
}

function removeFromDownloads(publicId) {
  let queue = loadDownloadsQueue();
  queue = queue.filter(item => item.publicId !== publicId);

  saveDownloadsQueue(queue);
  window.DOWNLOADS_QUEUE = queue;

  // Update UI
  updateAllArtworkStates();

  // Update downloads menu
  if (typeof window.updateDownloadsMenu === 'function') {
    window.updateDownloadsMenu();
  }
}

function clearDownloadsQueue() {
  saveDownloadsQueue([]);
  window.DOWNLOADS_QUEUE = [];
  updateAllArtworkStates();

  // Update downloads menu
  if (typeof window.updateDownloadsMenu === 'function') {
    window.updateDownloadsMenu();
  }
}

function isInDownloads(publicId) {
  const queue = loadDownloadsQueue();
  return queue.some(item => item.publicId === publicId);
}

// ============ UI UPDATES ============

function updateAllArtworkStates() {
  // Update download buttons on all artwork cards
  const artworks = document.querySelectorAll('.card.artwork');
  artworks.forEach(card => {
    const publicId = card.dataset.publicId;
    if (publicId) {
      const inDownloads = isInDownloads(publicId);

      // Update download button state
      const downloadButton = card.querySelector('.download-button');
      const buttonText = downloadButton?.querySelector('.download-button-text');

      if (downloadButton && buttonText) {
        if (inDownloads) {
          downloadButton.classList.add('in-downloads');
          buttonText.textContent = "Added to downloads";
          downloadButton.setAttribute("aria-label", "Added to downloads - Click to remove");
        } else {
          downloadButton.classList.remove('in-downloads');
          buttonText.textContent = "";
          downloadButton.setAttribute("aria-label", "Add to downloads");
        }
      }
    }
  });
}

// ============ INITIALIZATION ============

function initializeDownloads() {
  // Load queue from localStorage
  window.DOWNLOADS_QUEUE = loadDownloadsQueue();

  // Update artwork states
  updateAllArtworkStates();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDownloads);
} else {
  initializeDownloads();
}

// Export functions for use in other scripts
window.loadDownloadsQueue = loadDownloadsQueue;
window.saveDownloadsQueue = saveDownloadsQueue;
window.clearDownloadsQueue = clearDownloadsQueue;
window.addToDownloads = addToDownloads;
window.removeFromDownloads = removeFromDownloads;
window.isInDownloads = isInDownloads;
window.updateAllArtworkStates = updateAllArtworkStates;

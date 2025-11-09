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

function addToDownloads(publicId, niceName, cloudinaryUrl, aspectRatio = 'landscape') {
  const queue = loadDownloadsQueue();

  // Check if already in queue
  const exists = queue.some(item => item.publicId === publicId);
  if (exists) return false;

  // Add to queue
  queue.push({
    publicId,
    niceName,
    cloudinaryUrl,
    aspectRatio,
    addedAt: Date.now()
  });

  saveDownloadsQueue(queue);
  window.DOWNLOADS_QUEUE = queue;

  // Update UI
  updateDownloadsButton();
  updateAllArtworkStates();

  return true;
}

function removeFromDownloads(publicId) {
  let queue = loadDownloadsQueue();
  queue = queue.filter(item => item.publicId !== publicId);

  saveDownloadsQueue(queue);
  window.DOWNLOADS_QUEUE = queue;

  // Update UI
  updateDownloadsButton();
  updateAllArtworkStates();

  // If we're in the downloads modal and paused, re-render the modal
  const modal = document.getElementById('downloadsModal');
  if (modal && modal.classList.contains('show')) {
    if (isPaused) {
      renderDownloadsModal(queue);
    }
    // Also update progress text if downloading
    if (isDownloading) {
      updateDownloadProgress();
    }
  }
}

function clearDownloadsQueue() {
  // If currently downloading, abort it
  if (isDownloading) {
    downloadAborted = true;
    isDownloading = false;
    isPaused = false;
  }

  // Clear completed IDs tracking
  completedIds.clear();

  saveDownloadsQueue([]);
  window.DOWNLOADS_QUEUE = [];
  updateDownloadsButton();
  updateAllArtworkStates();

  // Re-render modal if it's open
  const modal = document.getElementById('downloadsModal');
  if (modal && modal.classList.contains('show')) {
    renderDownloadsModal([]);
  }
}

function isInDownloads(publicId) {
  const queue = loadDownloadsQueue();
  return queue.some(item => item.publicId === publicId);
}

// ============ UI UPDATES ============

function updateDownloadsButton() {
  const queue = loadDownloadsQueue();
  const button = document.getElementById('downloadsButton');
  const badge = document.getElementById('downloadsBadge');

  if (button && badge) {
    if (queue.length > 0) {
      badge.textContent = queue.length;
      badge.style.display = 'flex';
      button.classList.add('has-items');
    } else {
      badge.style.display = 'none';
      button.classList.remove('has-items');
    }
  }
}

function triggerDownloadsButtonPulse() {
  const button = document.getElementById('downloadsButton');
  if (button) {
    button.classList.add('pulse');
    setTimeout(() => {
      button.classList.remove('pulse');
    }, 1000);
  }
}

function triggerBadgePulse() {
  const badge = document.getElementById('downloadsBadge');
  if (badge) {
    badge.classList.remove('pulse'); // Remove first to restart animation
    // Force reflow to restart animation
    void badge.offsetWidth;
    badge.classList.add('pulse');
    setTimeout(() => {
      badge.classList.remove('pulse');
    }, 300);
  }
}

function updateAllArtworkStates() {
  // Update checkmarks on all artwork cards
  const artworks = document.querySelectorAll('.card.artwork');
  artworks.forEach(card => {
    const publicId = card.dataset.publicId;
    if (publicId) {
      if (isInDownloads(publicId)) {
        card.classList.add('in-downloads');
      } else {
        card.classList.remove('in-downloads');
      }
    }
  });
}

// ============ MODAL UI ============

function openDownloadsModal() {
  const modal = document.getElementById('downloadsModal');
  if (!modal) return;

  const queue = loadDownloadsQueue();
  renderDownloadsModal(queue);

  modal.classList.add('show');
  document.body.classList.add('modal-open');
}

function closeDownloadsModal() {
  const modal = document.getElementById('downloadsModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');

    // Clear queue if flagged (after successful download)
    if (shouldClearOnClose) {
      clearDownloadsQueue();
      shouldClearOnClose = false;
    }
  }
}

function renderDownloadsModal(queue) {
  const gridEl = document.getElementById('downloadsGrid');
  const emptyEl = document.getElementById('downloadsEmpty');
  const footerEl = document.querySelector('.downloads-modal-footer');
  const countEl = document.getElementById('downloadsCount');

  if (!gridEl || !emptyEl || !footerEl) return;

  // Update count
  if (countEl) {
    countEl.textContent = `${queue.length} artwork${queue.length === 1 ? '' : 's'}`;
  }

  if (queue.length === 0) {
    emptyEl.style.display = 'flex';
    gridEl.style.display = 'none';
    footerEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  gridEl.style.display = 'grid';
  footerEl.style.display = 'flex';

  // Update footer buttons based on download state
  updateFooterButtons();

  gridEl.innerHTML = '';

  queue.forEach(item => {
    const card = document.createElement('div');
    card.className = 'downloads-item';
    card.dataset.publicId = item.publicId;

    // Restore completed state if this item was already downloaded
    if (completedIds.has(item.publicId)) {
      card.classList.add('completed');
    }

    const thumbWidth = item.aspectRatio === 'portrait' ? 200 : 300;
    const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto,w_${thumbWidth}/${encodeURIComponent(item.publicId)}`;

    card.innerHTML = `
      <div class="downloads-item-image">
        <img src="${thumbUrl}" alt="${item.niceName}" loading="lazy">
      </div>
      <div class="downloads-item-name">${item.niceName}</div>
      <button class="downloads-item-remove" data-public-id="${item.publicId}" aria-label="Remove from downloads">
        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
          <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
        </svg>
      </button>
      <div class="downloads-item-status"></div>
    `;

    gridEl.appendChild(card);
  });

  // Add event listeners for remove buttons
  gridEl.querySelectorAll('.downloads-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const publicId = btn.dataset.publicId;
      removeFromDownloads(publicId);
      renderDownloadsModal(loadDownloadsQueue());
    });
  });
}

// ============ FOOTER BUTTON MANAGEMENT ============

function updateFooterButtons() {
  const clearAllBtn = document.getElementById('clearAllDownloads');
  const downloadAllBtn = document.getElementById('downloadAllBtn');

  if (!clearAllBtn || !downloadAllBtn) return;

  if (shouldClearOnClose) {
    // After successful completion: hide both buttons
    clearAllBtn.style.display = 'none';
    downloadAllBtn.style.display = 'none';
  } else if (isDownloading && !isPaused) {
    // During download: show Pause button, hide Clear All
    clearAllBtn.style.display = 'none';
    downloadAllBtn.style.display = 'block';
    downloadAllBtn.textContent = 'Pause Download';
    downloadAllBtn.disabled = false;
  } else if (isPaused) {
    // When paused: show both Clear All and Resume
    clearAllBtn.style.display = 'block';
    downloadAllBtn.style.display = 'block';
    downloadAllBtn.textContent = 'Resume Download';
    downloadAllBtn.disabled = false;
  } else {
    // Not downloading: show Clear All and Download All
    clearAllBtn.style.display = 'block';
    downloadAllBtn.style.display = 'block';
    downloadAllBtn.textContent = 'Download All';
    downloadAllBtn.disabled = false;
  }
}

function pauseDownload() {
  if (!isDownloading || isPaused) return;

  isPaused = true;

  // Remove downloading class to show remove buttons
  const modalContent = document.querySelector('.downloads-modal-content');
  if (modalContent) {
    modalContent.classList.remove('downloading');
  }

  updateFooterButtons();
  showToast('Download paused');
}

function resumeDownload() {
  if (!isDownloading || !isPaused) return;

  isPaused = false;

  // Add downloading class to hide remove buttons
  const modalContent = document.querySelector('.downloads-modal-content');
  if (modalContent) {
    modalContent.classList.add('downloading');
  }

  updateFooterButtons();
  showToast('Download resumed');
}

// ============ SEQUENTIAL DOWNLOAD LOGIC ============

let isDownloading = false;
let downloadAborted = false;
let isPaused = false;
let completedIds = new Set(); // Track completed downloads across re-renders
let processedIds = new Set(); // Track which items we've already processed
let shouldClearOnClose = false; // Flag to clear queue when modal closes

function updateDownloadProgress() {
  const progressEl = document.getElementById('downloadProgress');
  if (!progressEl || !isDownloading) return;

  const queue = loadDownloadsQueue();
  const remaining = queue.filter(item => !processedIds.has(item.publicId)).length;

  if (remaining > 0) {
    progressEl.textContent = `Downloading ${queue.length - remaining + 1} of ${queue.length}...`;
  }
}

async function startSequentialDownload() {
  // Handle pause/resume
  if (isDownloading && isPaused) {
    resumeDownload();
    return;
  }

  if (isDownloading && !isPaused) {
    pauseDownload();
    return;
  }

  let queue = loadDownloadsQueue();
  if (queue.length === 0) {
    showToast('No artworks to download');
    return;
  }

  isDownloading = true;
  downloadAborted = false;
  isPaused = false;

  // Clear completed IDs and processed IDs when starting fresh
  completedIds.clear();
  processedIds.clear();

  const progressEl = document.getElementById('downloadProgress');
  const modalContent = document.querySelector('.downloads-modal-content');

  // Add downloading class to hide remove buttons
  if (modalContent) {
    modalContent.classList.add('downloading');
  }

  updateFooterButtons();

  if (progressEl) {
    progressEl.style.display = 'block';
  }

  let successCount = 0;
  let failCount = 0;

  while (true) {
    if (downloadAborted) {
      break;
    }

    // Reload queue to get any changes made while paused
    queue = loadDownloadsQueue();

    // Find next item to download (not yet processed)
    const nextItem = queue.find(item => !processedIds.has(item.publicId));

    if (!nextItem) {
      // No more items to download
      break;
    }

    // Wait while paused
    while (isPaused && !downloadAborted) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (downloadAborted) {
      break;
    }

    // Reload queue again after pause in case items were removed
    queue = loadDownloadsQueue();

    // Check if this item still exists in queue
    if (!queue.some(item => item.publicId === nextItem.publicId)) {
      // Item was removed while paused, skip it
      processedIds.add(nextItem.publicId);
      continue;
    }

    // Update progress - count remaining items
    const remaining = queue.filter(item => !processedIds.has(item.publicId)).length;
    if (progressEl) {
      progressEl.textContent = `Downloading ${queue.length - remaining + 1} of ${queue.length}...`;
    }

    // Highlight current item being downloaded
    const itemCard = document.querySelector(`.downloads-item[data-public-id="${nextItem.publicId}"]`);
    if (itemCard) {
      itemCard.classList.add('downloading');

      // Scroll the item into view
      const modalBody = document.querySelector('.downloads-modal-body');
      if (modalBody) {
        itemCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    try {
      await downloadArtwork(nextItem.cloudinaryUrl, nextItem.niceName);
      successCount++;

      // Mark as completed
      if (itemCard) {
        itemCard.classList.remove('downloading');
        itemCard.classList.add('completed');
      }

      // Mark as processed and completed (for state preservation)
      processedIds.add(nextItem.publicId);
      completedIds.add(nextItem.publicId);

      // Delay between downloads (helps with mobile restrictions)
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error('Download failed:', error);
      failCount++;

      // Remove downloading state on failure
      if (itemCard) {
        itemCard.classList.remove('downloading');
      }

      // Mark as processed even on failure
      processedIds.add(nextItem.publicId);
    }
  }

  // Done
  isDownloading = false;
  isPaused = false;

  // Remove downloading class to show remove buttons again
  if (modalContent) {
    modalContent.classList.remove('downloading');
  }

  updateFooterButtons();

  // Show completion message
  if (downloadAborted) {
    if (progressEl) {
      progressEl.style.display = 'none';
    }
    showToast('Download cancelled');
  } else if (failCount === 0) {
    // Show completion message in progress area
    if (progressEl) {
      progressEl.textContent = `Successfully downloaded ${successCount} artwork${successCount === 1 ? '' : 's'}`;
      progressEl.style.display = 'block';
    }
    showToast(`Successfully downloaded ${successCount} artwork${successCount === 1 ? '' : 's'}`);
    // Clear completed IDs
    completedIds.clear();
    // Set flag to clear queue when user closes modal
    shouldClearOnClose = true;
    // Update buttons to hide them
    updateFooterButtons();
  } else {
    if (progressEl) {
      progressEl.textContent = `Downloaded ${successCount} artworks, ${failCount} failed`;
      progressEl.style.display = 'block';
    }
    showToast(`Downloaded ${successCount} artworks, ${failCount} failed`);
  }
}

async function downloadArtwork(url, filename) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename || 'artwork';
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);

      downloadLink.click();

      // Clean up after a delay
      setTimeout(() => {
        if (downloadLink.parentNode) {
          document.body.removeChild(downloadLink);
        }
        URL.revokeObjectURL(blobUrl);
        resolve();
      }, 1000);
    } catch (error) {
      reject(error);
    }
  });
}

// ============ INITIALIZATION ============

function initializeDownloads() {
  // Load queue from localStorage
  window.DOWNLOADS_QUEUE = loadDownloadsQueue();

  // Update button
  updateDownloadsButton();

  // Update artwork states
  updateAllArtworkStates();

  // Add event listeners
  const downloadsBtn = document.getElementById('downloadsButton');
  if (downloadsBtn) {
    downloadsBtn.addEventListener('click', openDownloadsModal);
  }

  const closeBtn = document.getElementById('closeDownloadsModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDownloadsModal);
  }

  const downloadAllBtn = document.getElementById('downloadAllBtn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', startSequentialDownload);
  }

  const clearAllBtn = document.getElementById('clearAllDownloads');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Remove all artworks from downloads?')) {
        clearDownloadsQueue();
        renderDownloadsModal([]);
      }
    });
  }

  // Close modal when clicking overlay
  const modal = document.getElementById('downloadsModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeDownloadsModal();
      }
    });
  }

  // ESC key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
      closeDownloadsModal();
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDownloads);
} else {
  initializeDownloads();
}

// Export functions for use in other scripts
window.addToDownloads = addToDownloads;
window.removeFromDownloads = removeFromDownloads;
window.isInDownloads = isInDownloads;
window.updateDownloadsButton = updateDownloadsButton;
window.updateAllArtworkStates = updateAllArtworkStates;

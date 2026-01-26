// ============ DOWNLOADS PAGE ============
// Page-specific logic for the downloads page

// Download state variables
var isDownloading = false;
var downloadAborted = false;
var isPaused = false;
var completedIds = new Set(); // Track completed downloads across re-renders
var processedIds = new Set(); // Track which items we've already processed

// Render the downloads page content
function renderDownloadsPage(queue) {
  const gridEl = document.getElementById('downloadsGrid');
  const emptyEl = document.getElementById('downloadsEmpty');
  const footerEl = document.querySelector('.downloads-footer');
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
  updatePageFooterButtons();

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
    const thumbUrl = getThumbnailUrl(item.publicId, thumbWidth);

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
      renderDownloadsPage(loadDownloadsQueue());
    });
  });
}

// Update footer buttons for page
function updatePageFooterButtons() {
  const clearAllBtn = document.getElementById('clearAllDownloads');
  const downloadAllBtn = document.getElementById('downloadAllBtn');

  if (!clearAllBtn || !downloadAllBtn) return;

  if (isDownloading && !isPaused) {
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

function pausePageDownload() {
  if (!isDownloading || isPaused) return;

  isPaused = true;

  // Remove downloading class to show remove buttons
  const mainEl = document.querySelector('.downloads-page');
  if (mainEl) {
    mainEl.classList.remove('downloading');
  }

  updatePageFooterButtons();
  showToast('Download paused');
}

function resumePageDownload() {
  if (!isDownloading || !isPaused) return;

  isPaused = false;

  // Add downloading class to hide remove buttons
  const mainEl = document.querySelector('.downloads-page');
  if (mainEl) {
    mainEl.classList.add('downloading');
  }

  updatePageFooterButtons();
  showToast('Download resumed');
}

function updatePageDownloadProgress() {
  const progressEl = document.getElementById('downloadProgress');
  if (!progressEl || !isDownloading) return;

  const queue = loadDownloadsQueue();
  const remaining = queue.filter(item => !processedIds.has(item.publicId)).length;

  if (remaining > 0) {
    progressEl.textContent = `Downloading ${queue.length - remaining + 1} of ${queue.length}...`;
  }
}

async function downloadArtwork(url, filename) {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure we download the original file by adding tr=orig-true parameter
      const urlObj = new URL(url);
      urlObj.searchParams.set('tr', 'orig-true');
      const originalUrl = urlObj.toString();

      const response = await fetch(originalUrl);
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

async function startPageSequentialDownload() {
  // Handle pause/resume
  if (isDownloading && isPaused) {
    resumePageDownload();
    return;
  }

  if (isDownloading && !isPaused) {
    pausePageDownload();
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
  const mainEl = document.querySelector('.downloads-page');

  // Add downloading class to hide remove buttons
  if (mainEl) {
    mainEl.classList.add('downloading');
  }

  updatePageFooterButtons();

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
      const mainBody = document.querySelector('.downloads-page');
      if (mainBody) {
        itemCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    try {
      // Extract original filename from publicId
      const originalFilename = nextItem.publicId.split('/').pop();
      await downloadArtwork(nextItem.imageUrl, originalFilename);
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
  if (mainEl) {
    mainEl.classList.remove('downloading');
  }

  updatePageFooterButtons();

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
    // Clear the queue after successful completion
    setTimeout(() => {
      clearDownloadsQueue();
      renderDownloadsPage([]);
    }, 2000);
  } else {
    if (progressEl) {
      progressEl.textContent = `Downloaded ${successCount} artworks, ${failCount} failed`;
      progressEl.style.display = 'block';
    }
    showToast(`Downloaded ${successCount} artworks, ${failCount} failed`);
  }
}

// Initialize downloads page
function initializeDownloadsPage() {
  // Load queue from localStorage
  const queue = loadDownloadsQueue();

  // Render the page
  renderDownloadsPage(queue);

  // Add event listeners
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', startPageSequentialDownload);
  }

  const clearAllBtn = document.getElementById('clearAllDownloads');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Remove all artworks from downloads?')) {
        clearDownloadsQueue();
        renderDownloadsPage([]);
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDownloadsPage);
} else {
  initializeDownloadsPage();
}

// Override the removeFromDownloads function to update page view
const originalRemoveFromDownloads = window.removeFromDownloads;
window.removeFromDownloads = function(publicId) {
  originalRemoveFromDownloads(publicId);
  // Re-render the page after removal
  renderDownloadsPage(loadDownloadsQueue());
};

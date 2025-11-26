// Artwork Detail Modal
// Full-page overlay for viewing artwork details

let currentArtworkModal = null;

// Fetch artwork details by public ID
async function fetchArtworkByPublicId(publicId) {
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');
    const apiUrl = 'https://api.imagekit.io/v1/files?limit=1000';

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      console.error('Failed to fetch from ImageKit API:', response.status);
      return null;
    }

    const files = await response.json();

    // Find the artwork by public ID
    const artwork = files.find(f => {
      const filePath = f.filePath.startsWith('/') ? f.filePath.substring(1) : f.filePath;
      return filePath === publicId;
    });

    if (artwork) {
      return {
        ...artwork,
        publicId: artwork.filePath.startsWith('/') ? artwork.filePath.substring(1) : artwork.filePath
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching artwork:', error);
    return null;
  }
}

// Create and show the artwork modal
async function openArtworkModal(publicId, niceName, orientation) {
  // Prevent multiple modals
  if (currentArtworkModal) {
    closeArtworkModal();
  }

  // Show loading state
  const modal = document.createElement('div');
  modal.id = 'artworkModal';
  modal.className = 'artwork-modal';
  modal.innerHTML = `
    <div class="artwork-modal-loading">
      <div class="spinner"></div>
      <p>Loading artwork...</p>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  currentArtworkModal = modal;

  // Show modal with fade-in
  setTimeout(() => {
    modal.classList.add('show');
  }, 10);

  // Fetch artwork details
  const artwork = await fetchArtworkByPublicId(publicId);

  if (!artwork) {
    modal.innerHTML = `
      <div class="artwork-modal-error">
        <p>Failed to load artwork details</p>
        <button class="btn-close-modal">Close</button>
      </div>
    `;
    modal.querySelector('.btn-close-modal').addEventListener('click', closeArtworkModal);
    return;
  }

  // Get description from custom metadata
  const description = (artwork.customMetadata && artwork.customMetadata.description)
    ? artwork.customMetadata.description
    : null;

  // Extract artist name and artwork title
  const artistName = extractArtistFromTitle(niceName);
  let artworkTitle = niceName;
  let artistInfo = '';
  let artistTagUrl = '';

  if (artistName) {
    // Split "Artist - Title" into separate parts
    const titleParts = niceName.split(' - ');
    if (titleParts.length > 1) {
      artworkTitle = titleParts.slice(1).join(' - ').trim();
      artistInfo = artistName;
      // Create tag URL for artist
      const prettyTag = artistName.trim()
        .replace(/-/g, "%2D")
        .replace(/\s+/g, "-");
      artistTagUrl = `/tag/#${prettyTag}`;
    }
  }

  // Build the modal content
  const imageUrl = getImageUrl(publicId);
  const thumbnailUrl = getThumbnailUrl(publicId, 1400);
  const isInDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);

  modal.innerHTML = `
    <button class="artwork-modal-close" aria-label="Close">
      <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
      </svg>
    </button>

    <div class="artwork-modal-content">
      <div class="artwork-modal-image-container">
        <img src="${thumbnailUrl}" alt="${niceName}" loading="eager" class="artwork-modal-image">
      </div>

      <div class="artwork-modal-info">
        <h1 class="artwork-modal-title">${artworkTitle}</h1>
        <div class="artwork-modal-subtitle">
          ${artistInfo ? `<a href="${artistTagUrl}" class="artwork-modal-artist" id="artistLink">${artistInfo}</a>` : ''}
          ${artistInfo && artwork.size ? '<span class="artwork-modal-separator"> • </span>' : ''}
          ${artwork.size ? `<span class="artwork-modal-file-size">${formatFileSize(artwork.size)}</span>` : ''}
        </div>

        <div class="artwork-modal-actions">
          <button id="modalDownloadBtn" class="btn-modal-action btn-modal-primary">
            ${isInDownloads ? 'Remove from Downloads' : 'Add to Downloads'}
          </button>
          <button id="modalShareBtn" class="btn-modal-action btn-modal-secondary">
            Copy link
          </button>
        </div>

        ${description ? `
          <div class="artwork-modal-description">
            <div class="artwork-modal-description-text">
              ${description.split('\n').filter(p => p.trim().length > 0).map(p => `<p>${p}</p>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Add image load handler for animations
  const artworkImage = modal.querySelector('.artwork-modal-image');
  const contentDiv = modal.querySelector('.artwork-modal-content');

  artworkImage.addEventListener('load', () => {
    // Add loaded class to trigger zoom animation
    artworkImage.classList.add('loaded');

    // Animate text in from bottom after image loads
    setTimeout(() => {
      contentDiv.classList.add('visible');
    }, 300);
  });

  // Add scroll handler for background effect when scrolling down
  const handleScroll = () => {
    const scrollY = contentDiv.scrollTop;
    const info = contentDiv.querySelector('.artwork-modal-info');

    if (!info) return;

    // Gradual background based on scroll position (only when scrolling down)
    const maxScrollDown = 500;
    if (scrollY > 0) {
      const scrollProgress = Math.min(scrollY / maxScrollDown, 1);
      const bgOpacity = 0.6 * scrollProgress;
      info.style.background = `rgba(0, 0, 0, ${bgOpacity})`;
      info.style.backdropFilter = scrollProgress > 0.1 ? 'blur(6px)' : 'none';
    } else {
      info.style.background = 'transparent';
      info.style.backdropFilter = 'none';
    }
  };

  contentDiv.addEventListener('scroll', handleScroll);
  // Store the handler for cleanup
  contentDiv.dataset.scrollHandler = 'attached';

  // Add event listeners
  const closeBtn = modal.querySelector('.artwork-modal-close');
  closeBtn.addEventListener('click', closeArtworkModal);

  // Close on background click (clicking outside image or content)
  modal.addEventListener('click', (e) => {
    // Check if click is directly on the modal background (not on children)
    if (e.target === modal ||
        e.target.classList.contains('artwork-modal-image-container') ||
        e.target.classList.contains('artwork-modal-content')) {
      closeArtworkModal();
    }
  });

  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeArtworkModal();
    }
  };
  document.addEventListener('keydown', escapeHandler);
  modal.dataset.escapeHandler = 'attached';

  // Download button handler
  const downloadBtn = modal.querySelector('#modalDownloadBtn');
  downloadBtn.addEventListener('click', () => {
    if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
      if (window.isInDownloads(publicId)) {
        window.removeFromDownloads(publicId);
        downloadBtn.textContent = 'Add to Downloads';
        downloadBtn.classList.remove('btn-modal-primary');
        downloadBtn.classList.add('btn-modal-secondary');
      } else {
        window.addToDownloads(publicId, niceName, imageUrl, orientation || 'landscape');
        downloadBtn.textContent = 'Added to Downloads';
        downloadBtn.classList.remove('btn-modal-secondary');
        downloadBtn.classList.add('btn-modal-primary');
      }
    }
  });

  // Share button handler
  const shareBtn = modal.querySelector('#modalShareBtn');
  shareBtn.addEventListener('click', async () => {
    const cleanSlug = niceName.replace(/\s/g, '_');
    const artworkUrl = `${window.location.origin}/artwork/#${cleanSlug}`;

    try {
      await navigator.clipboard.writeText(artworkUrl);

      // Show feedback
      const originalContent = shareBtn.innerHTML;
      shareBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
          <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
        </svg>
        Copied!
      `;

      setTimeout(() => {
        shareBtn.innerHTML = originalContent;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      showToast('Failed to copy URL');
    }
  });

  // Artist link handler - close modal when clicked
  const artistLink = modal.querySelector('#artistLink');
  if (artistLink) {
    artistLink.addEventListener('click', () => {
      closeArtworkModal();
    });
  }
}

// Close the artwork modal
function closeArtworkModal() {
  if (!currentArtworkModal) return;

  // Trigger zoom-out animation on image
  const artworkImage = currentArtworkModal.querySelector('.artwork-modal-image');
  if (artworkImage) {
    artworkImage.classList.add('closing');
  }

  currentArtworkModal.classList.remove('show');

  // Remove escape handler
  document.removeEventListener('keydown', arguments.callee);

  setTimeout(() => {
    if (currentArtworkModal && currentArtworkModal.parentNode) {
      currentArtworkModal.parentNode.removeChild(currentArtworkModal);
    }
    currentArtworkModal = null;
    document.body.classList.remove('modal-open');
  }, 300);
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

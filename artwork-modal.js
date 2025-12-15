// Artwork Detail Modal
// Full-page overlay for viewing artwork details

let currentArtworkModal = null;

// Fetch artwork details by public ID
async function fetchArtworkByPublicId(publicId) {
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');
    // Use type=file to get only current versions, excluding old file-version entries
    const apiUrl = 'https://api.imagekit.io/v1/files?type=file&limit=1000';

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
  let modal = currentArtworkModal;
  let isNewModal = false;

  // If modal doesn't exist, create it
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'artworkModal';
    modal.className = 'artwork-modal';
    document.body.appendChild(modal);
    currentArtworkModal = modal;
    isNewModal = true;

    // Show modal with slide-up animation
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
  } else {
    // Modal exists, fade out current content
    const content = modal.querySelector('.artwork-modal-content');
    if (content) {
      content.style.opacity = '0';
      content.style.transition = 'opacity 0.2s ease';
    }
    // Wait for fade out before updating content
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Fetch artwork details
  const artwork = await fetchArtworkByPublicId(publicId);

  if (!artwork) {
    modal.innerHTML = `
      <button class="artwork-modal-close" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
          <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
        </svg>
      </button>
      <div class="artwork-modal-content">
        <div class="artwork-modal-info">
          <p>Failed to load artwork details</p>
        </div>
      </div>
    `;
    modal.querySelector('.artwork-modal-close').addEventListener('click', closeArtworkModal);
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

  // Build the modal content (no image)
  const imageUrl = getImageUrl(publicId);
  const isInDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);

  // Create artwork page URL for preview
  // Use the publicId to get the actual filename-based slug to match how artwork page searches
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
  const artworkUrl = `/artwork/#${cleanSlug}`;

  modal.innerHTML = `
    <button class="artwork-modal-close" aria-label="Close">
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
      </svg>
    </button>

    <div class="artwork-modal-content" style="opacity: 0; transition: opacity 0.3s ease;">
      <div class="artwork-modal-info">
        <h1 class="artwork-modal-title">${artworkTitle}</h1>
        <div class="artwork-modal-subtitle">
          ${artistInfo ? `<a href="${artistTagUrl}" class="artwork-modal-artist" id="artistLink">${artistInfo}</a>` : ''}
          ${artistInfo && (artwork.width || artwork.size) ? '<span class="artwork-modal-separator"> • </span>' : ''}
          ${artwork.width && artwork.height ? `<span class="artwork-modal-dimensions">${artwork.width} × ${artwork.height}</span>` : ''}
          ${artwork.width && artwork.size ? '<span class="artwork-modal-separator"> • </span>' : ''}
          ${artwork.size ? `<span class="artwork-modal-file-size">${formatFileSize(artwork.size)}</span>` : ''}
        </div>

        <div class="artwork-modal-actions">
          <button id="modalPreviewBtn" class="btn-modal-action btn-modal-secondary" data-artwork-url="${artworkUrl}">
            Preview
          </button>
          <button id="modalDownloadBtn" class="btn-modal-action btn-modal-primary">
            ${isInDownloads ? 'Remove from Downloads' : 'Add to Downloads'}
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

  // Fade in the new content
  setTimeout(() => {
    const content = modal.querySelector('.artwork-modal-content');
    if (content) {
      content.style.opacity = '1';
    }
  }, 50);


  // Add event listeners
  const closeBtn = modal.querySelector('.artwork-modal-close');
  closeBtn.addEventListener('click', closeArtworkModal);

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
      } else {
        window.addToDownloads(publicId, niceName, imageUrl, orientation || 'landscape');
        downloadBtn.textContent = 'Added to Downloads';
      }
    }
  });

  // Preview button handler - navigate using window.location to preserve special characters
  const previewBtn = modal.querySelector('#modalPreviewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const url = previewBtn.getAttribute('data-artwork-url');
      closeArtworkModal();
      window.location.href = url;
    });
  }

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

  currentArtworkModal.classList.remove('show');

  setTimeout(() => {
    if (currentArtworkModal && currentArtworkModal.parentNode) {
      currentArtworkModal.parentNode.removeChild(currentArtworkModal);
    }
    currentArtworkModal = null;
  }, 400);
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

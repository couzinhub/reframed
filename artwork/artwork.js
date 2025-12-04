// Artwork Detail Page
// Displays detailed information about a single artwork

function getSlugFromHash() {
  // Get the raw hash without #
  let raw = window.location.hash.replace(/^#/, "").trim();

  // Convert underscores back to spaces
  return raw.replace(/_/g, ' ');
}

// Local copy of humanizePublicId in case it's not loaded yet
function localHumanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  base = base.replace(/\.[^.]+$/, "");
  return base
    .replace(/_/g, " ")
    .replace(/\s*[-_]\s*reframed[\s_-]*[a-z0-9]*/gi, "")
    .replace(/\s*[-_]\s*portrait\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchArtworkDetailsByName(searchName) {
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');

    // Fetch all files and search for the specific one
    // This is the most reliable approach with ImageKit API
    const apiUrl = 'https://api.imagekit.io/v1/files?limit=1000';

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      console.error('Failed to fetch from ImageKit API:', response.status);
      return null;
    }

    const files = await response.json();

    // Use either global or local humanize function
    const humanizeFn = typeof humanizePublicId === 'function' ? humanizePublicId : localHumanizePublicId;

    console.log('Searching for:', searchName);

    // Search through all files by matching humanized name
    const artwork = files.find(f => {
      const filePath = f.filePath.startsWith('/') ? f.filePath.substring(1) : f.filePath;
      const humanizedName = humanizeFn(filePath);
      const matches = humanizedName.toLowerCase() === searchName.toLowerCase();

      if (matches) {
        console.log('Found match:', filePath, '→', humanizedName);
      }

      return matches;
    });

    if (!artwork) {
      console.log('No match found. Sample names:');
      files.slice(0, 5).forEach(f => {
        const filePath = f.filePath.startsWith('/') ? f.filePath.substring(1) : f.filePath;
        console.log(humanizeFn(filePath));
      });
    }

    if (artwork) {
      // Return the artwork with its filePath as publicId
      return {
        ...artwork,
        publicId: artwork.filePath.startsWith('/') ? artwork.filePath.substring(1) : artwork.filePath
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching artwork details:', error);
    return null;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }

  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

function formatDimensions(width, height) {
  if (!width || !height) return 'Unknown';
  return `${width} × ${height} px`;
}

function getOrientation(width, height) {
  if (!width || !height) return 'Unknown';
  if (height > width) return 'Portrait';
  if (width > height) return 'Landscape';
  return 'Square';
}

// Get description from ImageKit custom field
function getDescriptionFromCustomField(artwork) {
  // Check if customMetadata exists and has a description field
  if (artwork.customMetadata && artwork.customMetadata.description) {
    return artwork.customMetadata.description;
  }
  return null;
}

function renderArtworkDetail(artwork, publicId) {
  const container = document.getElementById('artworkDetailView');
  const humanizeFn = typeof humanizePublicId === 'function' ? humanizePublicId : localHumanizePublicId;
  const niceName = humanizeFn(publicId);

  // Update page title and meta tags
  const pageTitle = `${niceName} - Reframed`;
  document.title = pageTitle;
  document.getElementById('pageTitle').textContent = pageTitle;

  const pageUrl = `https://reframed.gallery/artwork/#${niceName.replace(/\s/g, '_')}`;
  document.getElementById('pageCanonical').setAttribute('href', pageUrl);
  document.getElementById('ogUrl').setAttribute('content', pageUrl);
  document.getElementById('twitterUrl').setAttribute('content', pageUrl);
  document.getElementById('ogTitle').setAttribute('content', pageTitle);
  document.getElementById('twitterTitle').setAttribute('content', pageTitle);

  // Update OG image to the actual artwork
  const imageUrl = getImageUrl(publicId);
  const orientation = getOrientation(artwork.width, artwork.height);
  const thumbnailWidth = orientation === 'Portrait' ? 500 : 1200;
  const thumbnailUrl = getThumbnailUrl(publicId, thumbnailWidth);
  document.getElementById('ogImage').setAttribute('content', thumbnailUrl);

  const metaDescription = `View and download "${niceName}" for your Samsung Frame TV.`;
  document.getElementById('pageDescription').setAttribute('content', metaDescription);
  document.getElementById('ogDescription').setAttribute('content', metaDescription);
  document.getElementById('twitterDescription').setAttribute('content', metaDescription);

  // Extract artist name and artwork title (similar to modal)
  const artistName = extractArtistFromTitle(niceName);
  let artworkTitle = niceName;
  let artistInfo = '';
  let artistTagUrl = '';

  if (artistName) {
    const titleParts = niceName.split(' - ');
    if (titleParts.length > 1) {
      artworkTitle = titleParts.slice(1).join(' - ').trim();
      artistInfo = artistName;
      const prettyTag = artistName.trim()
        .replace(/-/g, "%2D")
        .replace(/\s+/g, "-");
      artistTagUrl = `/tag/#${prettyTag}`;
    }
  }

  // Check if artwork is already in downloads
  const isInDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);

  // Get description from ImageKit custom field
  const description = getDescriptionFromCustomField(artwork);

  container.innerHTML = `
    <div class="artwork-image-container">
      <img src="${thumbnailUrl}" alt="${niceName}" loading="eager">
    </div>

    <div class="artwork-detail-info">
      <h1 class="artwork-modal-title">${artworkTitle}</h1>
      <div class="artwork-modal-subtitle">
        ${artistInfo ? `<a href="${artistTagUrl}" class="artwork-modal-artist">${artistInfo}</a>` : ''}
        ${artistInfo && (artwork.width || artwork.size) ? '<span class="artwork-modal-separator"> • </span>' : ''}
        ${artwork.width && artwork.height ? `<span class="artwork-modal-dimensions">${artwork.width} × ${artwork.height}</span>` : ''}
        ${artwork.width && artwork.size ? '<span class="artwork-modal-separator"> • </span>' : ''}
        ${artwork.size ? `<span class="artwork-modal-file-size">${formatFileSize(artwork.size)}</span>` : ''}
      </div>

      <div class="artwork-modal-actions">
        <button id="shareBtn" class="btn-modal-action btn-modal-secondary">
          Copy link
        </button>
        <button id="downloadNowBtn" class="btn-modal-action btn-modal-secondary">
          Download now
        </button>
        <button id="toggleDownloadBtn" class="btn-modal-action btn-modal-primary">
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
  `;

  // Add event listener for toggle download button
  const toggleBtn = document.getElementById('toggleDownloadBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
        if (window.isInDownloads(publicId)) {
          window.removeFromDownloads(publicId);
          toggleBtn.textContent = 'Add to Downloads';
        } else {
          window.addToDownloads(publicId, niceName, imageUrl, orientation.toLowerCase());
          toggleBtn.textContent = 'Remove from Downloads';
        }
      }
    });
  }

  // Share button handler
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
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
        if (typeof showToast === 'function') {
          showToast('Failed to copy URL');
        }
      }
    });
  }

  // Download now button handler - downloads immediately without adding to queue
  const downloadNowBtn = document.getElementById('downloadNowBtn');
  if (downloadNowBtn) {
    downloadNowBtn.addEventListener('click', async () => {
      try {
        // Extract original filename from publicId
        const originalFilename = publicId.split('/').pop();

        // Show downloading feedback
        const originalContent = downloadNowBtn.textContent;
        downloadNowBtn.textContent = 'Downloading...';
        downloadNowBtn.disabled = true;

        // Use the same download logic as the downloads queue
        const urlObj = new URL(imageUrl);
        urlObj.searchParams.set('tr', 'orig-true');
        const originalUrl = urlObj.toString();

        const response = await fetch(originalUrl);
        if (!response.ok) throw new Error('Network response was not ok');

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = originalFilename || 'artwork';
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);

        downloadLink.click();

        // Clean up
        setTimeout(() => {
          if (downloadLink.parentNode) {
            document.body.removeChild(downloadLink);
          }
          URL.revokeObjectURL(blobUrl);
        }, 1000);

        // Show success feedback
        downloadNowBtn.textContent = 'Downloaded!';
        setTimeout(() => {
          downloadNowBtn.textContent = originalContent;
          downloadNowBtn.disabled = false;
        }, 2000);
      } catch (error) {
        console.error('Download failed:', error);
        downloadNowBtn.textContent = 'Download failed';
        setTimeout(() => {
          downloadNowBtn.textContent = 'Download now';
          downloadNowBtn.disabled = false;
        }, 2000);
        if (typeof showToast === 'function') {
          showToast('Download failed');
        }
      }
    });
  }
}

function showError(message) {
  const container = document.getElementById('artworkDetailView');
  container.innerHTML = `
    <div class="error-state">
      <h2>Artwork Not Found</h2>
      <p>${message}</p>
      <br>
      <a href="/" class="btn-primary" style="display: inline-block; max-width: 200px; margin: 0 auto;">
        Back to Home
      </a>
    </div>
  `;
}

async function loadArtworkDetail() {
  const searchName = getSlugFromHash();

  if (!searchName) {
    showError('No artwork specified in URL.');
    return;
  }

  try {
    const artwork = await fetchArtworkDetailsByName(searchName);

    if (!artwork) {
      showError('Could not load artwork details. Please try again later.');
      return;
    }

    renderArtworkDetail(artwork, artwork.publicId);
  } catch (error) {
    console.error('Error loading artwork:', error);
    showError('An error occurred while loading the artwork.');
  }
}

// Load on page load
loadArtworkDetail();

// Reload if hash changes
window.addEventListener('hashchange', loadArtworkDetail);

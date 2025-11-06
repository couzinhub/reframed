// ============ NAVIGATION MENU COMPONENT ============
// This code is shared across all pages

function initializeNavigation(currentPage) {
  // Determine if we're in a subdirectory
  const isSubdirectory = window.location.pathname.includes('/tag/');
  const imgPrefix = isSubdirectory ? '/' : '';

  // Insert mobile top bar
  const mobileTopBar = `
    <div class="mobile-top-bar">
      <button class="hamburger-menu" aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <a href="/">
        <img src="${imgPrefix}/img/reframed.svg" alt="Reframed Logo" class="mobile-logo">
      </a>
    </div>
  `;

  // Insert sidebar
  const aside = `
    <aside>
      <a href="/">
        <img id="logo" src="${imgPrefix}/img/reframed.svg" alt="Reframed Logo">
      </a>
      <ul>
        <li class="${currentPage === 'home' ? 'current' : ''}"><a href="/">Home</a></li>
        <li class="${currentPage === 'artists' ? 'current' : ''}"><a href="/artists.html">Artists</a></li>
        <li class="${currentPage === 'collections' ? 'current' : ''}"><a href="/collections.html">Collections</a></li>
        <li class="${currentPage === 'vertical' ? 'current' : ''}"><a href="/tag/#Vertical-artworks">Vertical artworks</a></li>
        <li class="${currentPage === 'faq' ? 'current' : ''}"><a href="/faq.html">FAQ</a></li>
        <li class="${currentPage === 'contact' ? 'current' : ''}"><a href="/contact.html">Contact</a></li>
      </ul>
      <div class="button tip">
        <script src="https://storage.ko-fi.com/cdn/widget/Widget_2.js"><\/script>
        <script>
          kofiwidget2.init('Thank me with a tip', '#00488c', 'O5O51FWPUL');
          kofiwidget2.draw();
        <\/script>
      </div>
      <div class="button own-art">
        <a class="contact" href="/contact.html">Get your own art reframed</a>
      </div>
    </aside>
  `;

  // Insert into page
  document.body.insertAdjacentHTML('afterbegin', mobileTopBar + aside);

  // Initialize mobile menu functionality
  const hamburgerMenu = document.querySelector('.hamburger-menu');
  const asideElement = document.querySelector('aside');

  if (hamburgerMenu) {
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

// Sidebar navigation for Go Course
(function() {
    // All pages in order - projects appear after their parent module
    var pages = (window.CourseConfigHelper && window.CourseConfigHelper.sidebarPages) || [];

    // Get current page
    function getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';
        return page;
    }


    // Check if sidebar should be open by default (desktop only)
    function shouldBeOpen() {
        if (window.innerWidth <= 900) return false;
        const saved = localStorage.getItem(window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('sidebar') : 'go-course-sidebar');
        return saved === 'open';
    }

    // Get sections from current page (h2 elements inside .lesson)
    function getPageSections() {
        const sections = [];
        const headings = document.querySelectorAll('.lesson h2');
        headings.forEach((h2, index) => {
            // Create an ID if it doesn't have one
            if (!h2.id) {
                h2.id = 'section-' + index;
            }
            sections.push({
                id: h2.id,
                title: h2.textContent.replace(/^#\s*/, '').trim()
            });
        });
        return sections;
    }

    // Create sidebar HTML
    function createSidebar() {
        const currentPage = getCurrentPage();
        const sections = getPageSections();

        // Hide the old nav element
        const oldNav = document.querySelector('.container > nav');
        if (oldNav) {
            oldNav.style.display = 'none';
        }

        // Create backdrop for mobile
        const backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.addEventListener('click', toggleSidebar);
        document.body.appendChild(backdrop);

        // Create sidebar
        const sidebar = document.createElement('aside');
        sidebar.className = 'sidebar';
        if (shouldBeOpen()) {
            sidebar.classList.add('open');
            document.body.classList.add('sidebar-open');
        }

        // Header with home link (padded to avoid toggle overlap)
        let html = `
            <div class="sidebar-header">
                <a href="index.html">← Course Home</a>
            </div>
            <div class="sidebar-content">
        `;

        // Plugin feature links (read from CourseConfig.plugins)
        var plugins = (window.CourseConfig && window.CourseConfig.plugins) || [];
        plugins.forEach(function(plugin) {
            var pluginFile = plugin.file || (plugin.name + '.html');
            var isActive = currentPage === pluginFile;
            var color = plugin.sidebarColor || 'var(--text-dim)';
            html += '\n            <a href="' + pluginFile + '" class="sidebar-link' + (isActive ? ' active' : '') + '" style="border-left-color: ' + (isActive ? color : 'transparent') + '; color: ' + (isActive ? color : 'var(--text-dim)') + ';">' +
                '<span class="sidebar-module-num" style="color: ' + color + ';">' + plugin.shortLabel + '</span>' +
                plugin.label +
            '</a>';
        });
        if (plugins.length > 0) {
            html += '\n            <hr style="border: none; border-top: 1px solid var(--border); margin: 0.5rem 0;">';
        }

        // All pages - with sections nested under active page
        // Skip feature items (DP, FC, WC) — already rendered above
        pages.filter(page => page.type !== 'feature').forEach(page => {
            const isActive = currentPage === page.file;
            const linkClass = page.isProject ? 'sidebar-link sidebar-project-link' : 'sidebar-link';

            const displayTitle = page.isProject ? `🔨 ${page.title}` : page.title;
            html += `
                <a href="${page.file}" class="${linkClass}${isActive ? ' active' : ''}">
                    <span class="sidebar-module-num">${page.num}</span>
                    ${displayTitle}
                </a>
            `;

            // If this page is active, show its sections
            if (isActive && sections.length > 0) {
                html += `<div class="sidebar-sections">`;
                sections.forEach(section => {
                    html += `
                        <a href="#${section.id}" class="sidebar-section-link">
                            ${section.title}
                        </a>
                    `;
                });
                html += `</div>`;
            }
        });

        html += `</div>`; // close sidebar-content

        sidebar.innerHTML = html;
        document.body.appendChild(sidebar);

        // Create toggle button (inside sidebar when open)
        const toggle = document.createElement('button');
        toggle.className = 'sidebar-toggle';
        toggle.setAttribute('aria-label', 'Toggle navigation');
        toggle.innerHTML = '☰';
        toggle.addEventListener('click', toggleSidebar);
        document.body.appendChild(toggle);
    }

    // Toggle sidebar
    function toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const isOpen = sidebar.classList.toggle('open');
        document.body.classList.toggle('sidebar-open', isOpen);

        // Save state (desktop only)
        if (window.innerWidth > 900) {
            localStorage.setItem(window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('sidebar') : 'go-course-sidebar', isOpen ? 'open' : 'closed');
        }
    }

    // Track scroll position to highlight current section
    function setupScrollTracking() {
        const sectionLinks = document.querySelectorAll('.sidebar-section-link');
        if (sectionLinks.length === 0) return;

        const headings = [];
        sectionLinks.forEach(link => {
            const id = link.getAttribute('href').slice(1);
            const el = document.getElementById(id);
            if (el) headings.push({ id, el, link });
        });

        function updateActiveSection() {
            const scrollPos = window.scrollY + 100; // offset for header
            let current = null;

            for (const h of headings) {
                if (h.el.offsetTop <= scrollPos) {
                    current = h;
                }
            }

            sectionLinks.forEach(link => link.classList.remove('active'));
            if (current) {
                current.link.classList.add('active');
            }
        }

        window.addEventListener('scroll', updateActiveSection, { passive: true });
        updateActiveSection(); // Initial call
    }

    // Initialize
    function init() {
        // Don't add sidebar to index page
        const currentPage = getCurrentPage();
        if (currentPage === 'index.html' || currentPage === '') {
            return;
        }
        // Add class to body to indicate sidebar is available (for CSS padding)
        document.body.classList.add('has-sidebar');
        createSidebar();
        setupScrollTracking();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Handle resize
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && window.innerWidth <= 900) {
                // Close sidebar on mobile by default
                sidebar.classList.remove('open');
                document.body.classList.remove('sidebar-open');
            }
        }, 250);
    });
})();

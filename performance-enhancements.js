/**
 * Performance Enhancements Module
 * - Collapsible Form Sections
 * - Lazy Loading (IntersectionObserver)
 * - Swipe Gesture Navigation for Sidebar
 * - Deferred Script Loading
 */

document.addEventListener('DOMContentLoaded', () => {
    initCollapsibleSections();
    initLazyLoading();
    initSwipeGesture();
    initDeferredScripts();
});

/* =============================================
   1. COLLAPSIBLE FORM SECTIONS
   ============================================= */
function initCollapsibleSections() {
    const forms = document.querySelectorAll('#surveyForm, #monitoringForm, #attendanceForm');

    forms.forEach(form => {
        const formGrid = form.querySelector('.form-grid');
        if (!formGrid) return;

        // Add collapse-all button before the form grid
        const collapseAllBtn = document.createElement('button');
        collapseAllBtn.type = 'button';
        collapseAllBtn.className = 'collapse-all-btn';
        collapseAllBtn.innerHTML = '🔽 सबै सेक्सन संक्षिप्त गर्नुहोस्';
        collapseAllBtn.style.cssText = 'background: linear-gradient(90deg, #2c5282 0%, #3182ce 100%); color: white; border: none; padding: 6px 16px; border-radius: 8px; font-size: 0.75rem; cursor: pointer; font-family: "Kalimati", sans-serif; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(74,144,164,0.2); width: auto; display: inline-block;';
        formGrid.insertBefore(collapseAllBtn, formGrid.firstChild);

        let allCollapsed = false;
        collapseAllBtn.addEventListener('click', () => {
            allCollapsed = !allCollapsed;
            const sectionTitles = formGrid.querySelectorAll('.section-title');
            const sectionContents = formGrid.querySelectorAll('.section-content');

            if (allCollapsed) {
                sectionTitles.forEach(t => t.classList.add('collapsed'));
                sectionContents.forEach(c => c.classList.add('collapsed'));
                collapseAllBtn.innerHTML = '🔼 सबै सेक्सन विस्तार गर्नुहोस्';
            } else {
                sectionTitles.forEach(t => t.classList.remove('collapsed'));
                sectionContents.forEach(c => c.classList.remove('collapsed'));
                collapseAllBtn.innerHTML = '🔽 सबै सेक्सन संक्षिप्त गर्नुहोस्';
            }
        });

        // Wrap fields between section-titles into section-content divs
        wrapFormSections(formGrid);
    });
}

function wrapFormSections(formGrid) {
    const children = Array.from(formGrid.children);
    const sectionTitles = [];

    children.forEach(child => {
        if (child.classList.contains('section-title')) {
            sectionTitles.push(child);
        }
    });

    // If no section titles found, skip
    if (sectionTitles.length === 0) return;

    // For each section title, collect sibling elements until the next section-title
    // and wrap them in a section-content div
    sectionTitles.forEach((title, index) => {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'section-content';

        let sibling = title.nextElementSibling;
        const elementsToMove = [];

        while (sibling && !sibling.classList.contains('section-title') && !sibling.classList.contains('collapse-all-btn')) {
            elementsToMove.push(sibling);
            sibling = sibling.nextElementSibling;
        }

        elementsToMove.forEach(el => contentDiv.appendChild(el));

        // Insert the content div after the title
        title.insertAdjacentElement('afterend', contentDiv);

        // Make title clickable
        title.addEventListener('click', () => {
            title.classList.toggle('collapsed');
            contentDiv.classList.toggle('collapsed');
        });
    });

    // Also wrap any remaining fields before the first section title
    // and after the last section content into their own wrapper
    // Check if there are fields before the first section title
    const firstSectionTitle = formGrid.querySelector('.section-title');
    if (firstSectionTitle) {
        let prevSibling = firstSectionTitle.previousElementSibling;
        const preElements = [];
        while (prevSibling && !prevSibling.classList.contains('section-title') && !prevSibling.classList.contains('collapse-all-btn')) {
            preElements.unshift(prevSibling);
            prevSibling = prevSibling.previousElementSibling;
        }

        if (preElements.length > 0) {
            const preContentDiv = document.createElement('div');
            preContentDiv.className = 'section-content';
            preElements.forEach(el => preContentDiv.appendChild(el));
            firstSectionTitle.insertAdjacentElement('beforebegin', preContentDiv);
        }
    }
}

/* =============================================
   2. LAZY LOADING WITH INTERSECTION OBSERVER
   ============================================= */
function initLazyLoading() {
    // Add lazy-section class to non-critical dashboard sections
    const lazyTargets = [
        document.getElementById('surveyChartsRow'),
        document.getElementById('monitoringChartsRow'),
        document.getElementById('monitoringDetailsSection'),
        document.getElementById('aiDashboardSummaryBox'),
        document.getElementById('topOfficesRow'),
        document.getElementById('monitoringAlertsSection'),
        document.getElementById('surveyDynamicAnalysis'),
    ];

    lazyTargets.forEach(el => {
        if (el) {
            el.classList.add('lazy-section');
        }
    });

    // Create IntersectionObserver for lazy sections
    if ('IntersectionObserver' in window) {
        const lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('loaded');
                    lazyObserver.unobserve(entry.target);
                }
            });
        }, {
            root: document.getElementById('main-scroll-area'),
            rootMargin: '100px',
            threshold: 0.1
        });

        lazyTargets.forEach(el => {
            if (el) lazyObserver.observe(el);
        });
    } else {
        // Fallback: show everything immediately
        lazyTargets.forEach(el => {
            if (el) el.classList.add('loaded');
        });
    }

    // Lazy load images
    document.querySelectorAll('img:not([loading])').forEach(img => {
        img.setAttribute('loading', 'lazy');
    });
}

/* =============================================
   3. SWIPE GESTURE NAVIGATION FOR SIDEBAR
   ============================================= */
function initSwipeGesture() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let isSwiping = false;
    let swipeDirection = null;
    const sidebarWidth = 180;
    const swipeThreshold = 60;

    // Create swipe indicator
    const indicator = document.createElement('div');
    indicator.className = 'swipe-indicator';
    document.body.appendChild(indicator);

    // Show swipe hint on first mobile visit
    if (window.innerWidth < 768 && !sessionStorage.getItem('swipeHintShown')) {
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.textContent = '← स्वाइप गरेर साइडबार खोल्नुहोस्';
        document.body.appendChild(hint);
        sessionStorage.setItem('swipeHintShown', 'true');
    }

    // Touch start - detect swipe from left edge
    document.addEventListener('touchstart', (e) => {
        if (window.innerWidth >= 768) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchCurrentX = touchStartX;
        isSwiping = false;
        swipeDirection = null;

        // Show indicator when touching near left edge
        if (touchStartX < 30) {
            indicator.classList.add('active');
        }
    }, { passive: true });

    // Touch move - track swipe direction
    document.addEventListener('touchmove', (e) => {
        if (window.innerWidth >= 768) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartX;
        const diffY = currentY - touchStartY;

        // Determine swipe direction on first significant move
        if (!swipeDirection && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
            swipeDirection = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical';
        }

        // Only process horizontal swipes
        if (swipeDirection !== 'horizontal') return;

        touchCurrentX = currentX;

        const isSidebarOpen = !sidebar.classList.contains('-translate-x-full');

        // Swipe right to open sidebar from left edge
        if (!isSidebarOpen && touchStartX < 50 && diffX > 0) {
            isSwiping = true;
            sidebar.classList.add('sidebar-swiping');
            const translateX = Math.min(diffX, sidebarWidth);
            sidebar.style.transform = `translateX(${-sidebarWidth + translateX}px)`;

            // Move backdrop opacity based on progress
            if (backdrop) {
                const progress = translateX / sidebarWidth;
                backdrop.style.opacity = progress * 0.5;
                backdrop.classList.remove('hidden');
            }
        }

        // Swipe left to close sidebar
        if (isSidebarOpen && diffX < -20) {
            isSwiping = true;
            sidebar.classList.add('sidebar-swiping');
            const translateX = Math.max(diffX, -sidebarWidth);
            sidebar.style.transform = `translateX(${translateX}px)`;

            if (backdrop) {
                const progress = 1 - (Math.abs(translateX) / sidebarWidth);
                backdrop.style.opacity = progress * 0.5;
            }
        }
    }, { passive: true });

    // Touch end - complete or cancel swipe
    document.addEventListener('touchend', (e) => {
        if (window.innerWidth >= 768) return;

        indicator.classList.remove('active');
        sidebar.classList.remove('sidebar-swiping');

        if (!isSwiping) {
            // Reset styles if we didn't swipe
            sidebar.style.transform = '';
            return;
        }

        const diffX = touchCurrentX - touchStartX;
        const isSidebarOpen = !sidebar.classList.contains('-translate-x-full');

        if (!isSidebarOpen && diffX > swipeThreshold) {
            // Open sidebar
            openSidebar();
        } else if (isSidebarOpen && diffX < -swipeThreshold) {
            // Close sidebar
            closeSidebar();
        } else {
            // Snap back
            if (isSidebarOpen) {
                sidebar.style.transform = '';
                sidebar.classList.remove('-translate-x-full');
            } else {
                sidebar.style.transform = '';
                sidebar.classList.add('-translate-x-full');
            }
            if (backdrop) {
                backdrop.style.opacity = '';
                backdrop.classList.add('hidden');
            }
        }

        // Clean up inline styles after transition
        setTimeout(() => {
            sidebar.style.transform = '';
        }, 350);

        isSwiping = false;
        swipeDirection = null;
    }, { passive: true });

    // Helper functions (reuse from existing mobile menu script)
    function openSidebar() {
        sidebar.classList.remove('-translate-x-full');
        sidebar.style.transform = '';
        if (backdrop) {
            backdrop.classList.remove('hidden');
            setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
        }
    }

    function closeSidebar() {
        sidebar.classList.add('-translate-x-full');
        sidebar.style.transform = '';
        if (backdrop) {
            backdrop.classList.add('opacity-0');
            setTimeout(() => backdrop.classList.add('hidden'), 300);
        }
    }
}

/* =============================================
   4. DEFERRED / LAZY SCRIPT LOADING
   ============================================= */
function initDeferredScripts() {
    // Lazy load heavy libraries only when needed
    const lazyLibraries = {
        'xlsx': 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.full.min.js',
        'html2pdf': 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
        'leaflet': 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    };

    // Track which libraries are loaded
    window._loadedLibraries = window._loadedLibraries || {};

    // Function to lazy load a library
    window.loadLibrary = function (name) {
        return new Promise((resolve, reject) => {
            if (window._loadedLibraries[name]) {
                resolve();
                return;
            }

            const url = lazyLibraries[name];
            if (!url) {
                reject(new Error(`Unknown library: ${name}`));
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.defer = true;
            script.onload = () => {
                window._loadedLibraries[name] = true;
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    // Preconnect to CDN domains for faster loading
    const cdnDomains = [
        'https://cdn.jsdelivr.net',
        'https://cdnjs.cloudflare.com',
        'https://unpkg.com'
    ];

    cdnDomains.forEach(domain => {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = domain;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
    });
}
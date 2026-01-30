// Generic module data loader
// Loads module-specific data and sets window globals for course.js
// Works with file:// protocol by loading generated JS files

(function() {
    // Determine which module we're on
    const moduleNum = document.body?.dataset?.module ||
                      window.location.pathname.match(/module(\d+)/)?.[1] ||
                      '1';

    // Load the generated JS file
    const script = document.createElement('script');
    script.src = `data/module${moduleNum}-variants.js`;
    script.onload = function() {
        if (window.moduleData) {
            window.conceptLinks = window.moduleData.conceptLinks || {};
            window.sharedContent = window.moduleData.sharedContent || {};
            window.variantsDataEmbedded = window.moduleData.variants || {};
            window.dispatchEvent(new CustomEvent('moduleDataLoaded'));
        } else {
            console.error('Module data not found after loading script');
        }
    };
    script.onerror = function() {
        console.error(`Failed to load data/module${moduleNum}-variants.js`);
        console.error('Run: node build.js');
    };
    document.head.appendChild(script);
})();

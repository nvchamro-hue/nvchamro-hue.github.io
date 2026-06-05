const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Reduce sizes further (15%)
// Coat of arms: w-16 h-16 -> w-14 h-14
html = html.replace('class="w-16 h-16 mb-2', 'class="w-14 h-14 mb-2');

// Headings
html = html.replace('class="font-bold text-xs text-blue-200 tracking-wide"', 'class="font-bold text-[10px] text-blue-200 tracking-wide sidebar-text"');
html = html.replace('class="font-bold text-[15px] text-center leading-tight mb-1 text-white drop-shadow-md"', 'class="font-bold text-[13px] text-center leading-tight mb-1 text-white drop-shadow-md sidebar-text"');
html = html.replace('class="text-[10px] text-blue-200/80 text-center leading-tight"', 'class="text-[9px] text-blue-200/80 text-center leading-tight sidebar-text"');

// Button padding/gap/text
// Old: gap-3 px-4 py-2.5 text-[13px]
// New: gap-2 px-3 py-2 text-xs
html = html.replace(/gap-3 px-4 py-2\.5 text-\[13px\]/g, 'gap-2 px-3 py-2 text-xs');

// Icon wrapper: p-1.5 -> p-1
html = html.replace(/p-1\.5 rounded-md/g, 'p-1 rounded-md');

// Icon size: text-base -> text-sm
html = html.replace(/text-base"><\/i>/g, 'text-sm"></i>');


// 2. Wrap button text in <span class="sidebar-text">
// We have to match the buttons and wrap the bare text.
// E.g., </div> ड्यासबोर्ड / तथ्याङ्क -> </div> <span class="sidebar-text whitespace-nowrap">ड्यासबोर्ड / तथ्याङ्क</span>

html = html.replace(/<\/div>\s*ड्यासबोर्ड \/ तथ्याङ्क/g, '</div> <span class="sidebar-text whitespace-nowrap">ड्यासबोर्ड / तथ्याङ्क</span>');
html = html.replace(/<\/div>\s*सर्वेक्षण फारम/g, '</div> <span class="sidebar-text whitespace-nowrap">सर्वेक्षण फारम</span>');
html = html.replace(/<\/div>\s*अनुगमन फारम/g, '</div> <span class="sidebar-text whitespace-nowrap">अनुगमन फारम</span>');
html = html.replace(/<\/div>\s*समय पालना\/पोशाक/g, '</div> <span class="sidebar-text whitespace-nowrap">समय पालना/पोशाक</span>');


// 3. Update the Desktop Toggle logic
// Remove the old md:-ml-60 toggle logic
const oldJS = `// For desktop, we can just toggle the width or margin
                    if (sidebar.classList.contains('md:-ml-60')) {
                        sidebar.classList.remove('md:-ml-60');
                    } else {
                        sidebar.classList.add('md:-ml-60');
                    }`;

const newJS = `// For desktop, toggle between w-60 and w-20
                    sidebar.classList.toggle('w-60');
                    sidebar.classList.toggle('w-20');
                    
                    // Hide/show text
                    document.querySelectorAll('.sidebar-text').forEach(el => el.classList.toggle('hidden'));
                    
                    // Adjust padding/justification on buttons
                    document.querySelectorAll('.nav-btn').forEach(btn => {
                        btn.classList.toggle('px-3');
                        btn.classList.toggle('justify-center');
                    });
                    
                    // Hide the offline badge text if it's there
                    const badge = document.getElementById('offlineBadge');
                    if(badge) badge.classList.toggle('text-transparent');`;

html = html.replace(oldJS, newJS);

// Ensure the offline badge can handle being collapsed (we just toggle a class or we can add sidebar-text to it)
html = html.replace('id="offlineBadge" class="mt-3', 'id="offlineBadge" class="sidebar-text mt-3');

fs.writeFileSync('index.html', html);
console.log('Sidebar collapsed logic and sizes updated.');

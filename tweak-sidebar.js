const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Tweak Coat of Arms logo
html = html.replace('class="w-20 h-20 mb-3', 'class="w-16 h-16 mb-2');

// 2. Tweak Sidebar Headings
html = html.replace('class="font-bold text-sm text-blue-200 tracking-wide"', 'class="font-bold text-xs text-blue-200 tracking-wide"');
html = html.replace('class="font-bold text-lg text-center leading-tight mb-2 text-white drop-shadow-md"', 'class="font-bold text-[15px] text-center leading-tight mb-1 text-white drop-shadow-md"');
html = html.replace('class="text-xs text-blue-200/80 text-center"', 'class="text-[10px] text-blue-200/80 text-center leading-tight"');

// 3. Tweak Button overall padding, gap, and text size
// Add text-[13px] to the button classes and reduce padding/gap
html = html.replace(/gap-4 px-5 py-3\.5/g, 'gap-3 px-4 py-2.5 text-[13px]');

// 4. Tweak Icon wrapper padding and radius
html = html.replace(/p-2 rounded-lg/g, 'p-1.5 rounded-md');

// 5. Tweak Icon size
html = html.replace(/text-lg"><\/i>/g, 'text-base"></i>');

fs.writeFileSync('index.html', html);
console.log('Sidebar tweaked successfully.');

const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Change sidebar width w-72 to w-60 and add an ID/classes for collapsing
html = html.replace('w-72', 'w-60 transition-all duration-300 ease-in-out');

// 2. Remove flag from sidebar footer
const flagFooterOld = `<div class="p-6 border-t border-white/10 text-center bg-white/5">
                <img src="./nepal-flag.gif" alt="Flag of Nepal" class="h-12 mx-auto drop-shadow-lg opacity-90 hover:opacity-100 transition-opacity">
            </div>`;
html = html.replace(flagFooterOld, '');

// 3. Fix the active tab text color in HTML (add text-white to the first tab, ensure others have text-slate-300)
// First, make sure the dashboard tab has text-white
html = html.replace('tab-btn active group"', 'tab-btn active group text-white"');

// 4. Update the Mobile Header to be a Global Header (Desktop + Mobile) and add the flag there
const oldHeader = `<header class="md:hidden flex items-center justify-between p-4 bg-white shadow-sm border-b z-30">
                <div class="flex items-center gap-3">
                    <img src="coa.png" alt="Logo" class="w-10 h-10 drop-shadow-sm">
                    <div>
                        <h1 class="font-bold text-sm leading-tight text-slate-800">राष्ट्रिय सतर्कता केन्द्र</h1>
                        <p class="text-[10px] text-slate-500 font-medium">सेवाग्राही सर्वेक्षण</p>
                    </div>
                </div>
                <button id="mobileMenuBtn" class="text-2xl p-2 text-slate-600 hover:text-blue-600 focus:outline-none transition-colors">
                    <i class="fas fa-bars"></i>
                </button>
            </header>`;

const newHeader = `<header class="flex items-center justify-between p-4 bg-white/90 backdrop-blur-md shadow-sm border-b z-30">
                <div class="flex items-center gap-4">
                    <!-- Desktop Toggle -->
                    <button id="desktopToggleBtn" class="hidden md:block text-2xl p-2 text-slate-600 hover:text-blue-600 focus:outline-none transition-colors">
                        <i class="fas fa-bars"></i>
                    </button>
                    <!-- Mobile Toggle -->
                    <button id="mobileMenuBtn" class="md:hidden text-2xl p-2 text-slate-600 hover:text-blue-600 focus:outline-none transition-colors">
                        <i class="fas fa-bars"></i>
                    </button>
                    
                    <div class="md:hidden flex items-center gap-3">
                        <img src="coa.png" alt="Logo" class="w-10 h-10 drop-shadow-sm">
                        <div>
                            <h1 class="font-bold text-sm leading-tight text-slate-800">राष्ट्रिय सतर्कता केन्द्र</h1>
                            <p class="text-[10px] text-slate-500 font-medium">सेवाग्राही सर्वेक्षण</p>
                        </div>
                    </div>
                </div>
                
                <!-- Nepal Flag Top Right -->
                <div class="flex items-center">
                    <img src="./nepal-flag.gif" alt="Flag of Nepal" class="h-10 drop-shadow-md">
                </div>
            </header>`;

html = html.replace(oldHeader, newHeader);

// 5. Update the inline script for tab text color and desktop sidebar toggle
const oldScript = `// Close sidebar on mobile when a tab is clicked`;
const newScript = `// Desktop Sidebar Toggle Logic
            const desktopToggleBtn = document.getElementById('desktopToggleBtn');
            if(desktopToggleBtn) {
                desktopToggleBtn.addEventListener('click', () => {
                    // For desktop, we can just toggle the width or margin
                    if (sidebar.classList.contains('md:-ml-60')) {
                        sidebar.classList.remove('md:-ml-60');
                    } else {
                        sidebar.classList.add('md:-ml-60');
                    }
                });
            }

            // Close sidebar on mobile when a tab is clicked`;

html = html.replace(oldScript, newScript);

// Also we need to add the margin toggle class logic to the sidebar. 
// The sidebar has class w-60. md:-ml-60 will hide it completely by pulling it left.
// Actually, let's just make sure the sidebar class list has no conflicting margins.
// In the sidebar aside classes:
// "fixed md:static inset-y-0 left-0 w-60 ..." -> we just add "md:-ml-60" dynamically and it works because it's flex.
// Wait, to make md:-ml-60 work, we need to ensure the parent is flex (it is) and we just add negative margin.

// Update the tab active class manipulation to properly add text-white
const oldTabClassLogic = `btn.classList.add('active', 'bg-blue-600/30', 'border-blue-400/30', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]');
                    btn.classList.remove('hover:bg-white/5', 'border-transparent', 'text-slate-300');`;

const newTabClassLogic = `btn.classList.add('active', 'bg-blue-600/30', 'border-blue-400/30', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]', 'text-white');
                    btn.classList.remove('hover:bg-white/5', 'border-transparent', 'text-slate-300');`;

html = html.replace(oldTabClassLogic, newTabClassLogic);

const oldTabInactiveLogic = `b.classList.remove('active', 'bg-blue-600/30', 'border-blue-400/30', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]');
                        b.classList.add('hover:bg-white/5', 'border-transparent', 'text-slate-300');`;

const newTabInactiveLogic = `b.classList.remove('active', 'bg-blue-600/30', 'border-blue-400/30', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]', 'text-white');
                        b.classList.add('hover:bg-white/5', 'border-transparent', 'text-slate-300');`;

html = html.replace(oldTabInactiveLogic, newTabInactiveLogic);


fs.writeFileSync('index.html', html);
console.log('index.html updated successfully.');

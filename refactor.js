const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Add Tailwind CSS and config
const headInsertion = `
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#2b6cb0',
                        glass: 'rgba(255, 255, 255, 0.7)',
                    },
                    fontFamily: {
                        sans: ['Kalimati', 'Mukta', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="style.css">`;

html = html.replace('<link rel="stylesheet" href="style.css">', headInsertion);

// 2. Replace body tag and everything up to the first panel
const oldBodyStart = html.indexOf('<body>');
const oldPanelStart = html.indexOf('<!-- FORM PANEL -->');

const newBodyStart = `
<body class="bg-slate-50 text-slate-800 antialiased overflow-hidden font-sans">
    <div class="flex h-screen w-full relative">
        
        <!-- Mobile Sidebar Backdrop -->
        <div id="sidebarBackdrop" class="fixed inset-0 bg-black/50 z-40 hidden md:hidden transition-opacity opacity-0 backdrop-blur-sm"></div>

        <!-- Sidebar -->
        <aside class="fixed md:static inset-y-0 left-0 w-72 bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 text-white shadow-2xl z-50 transform -translate-x-full md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col border-r border-white/10" id="sidebar">
            <div class="p-6 flex flex-col items-center border-b border-white/10 bg-white/5 relative">
                <button id="closeMobileMenuBtn" class="md:hidden absolute top-4 right-4 text-white/70 hover:text-white p-2">
                    <i class="fas fa-times text-xl"></i>
                </button>
                <img src="coa.png" alt="Coat of Arms" class="w-20 h-20 mb-3 drop-shadow-xl hover:scale-105 transition-transform duration-300">
                <h5 class="font-bold text-sm text-blue-200 tracking-wide">नेपाल सरकार</h5>
                <h1 class="font-bold text-lg text-center leading-tight mb-2 text-white drop-shadow-md">राष्ट्रिय सतर्कता केन्द्र</h1>
                <p class="text-xs text-blue-200/80 text-center">सेवाग्राही सर्वेक्षण प्रणाली</p>
                <span id="offlineBadge" class="mt-3 bg-red-500/90 backdrop-blur-sm border border-red-400 text-white text-xs px-3 py-1 rounded-full hidden shadow-lg animate-pulse">अफ्लाइन मोड सक्रिय</span>
            </div>
            
            <nav class="flex-1 px-4 py-6 space-y-3 overflow-y-auto custom-scrollbar" id="sidebar-nav">
                <button class="w-full flex items-center gap-4 px-5 py-3.5 bg-blue-600/30 hover:bg-blue-500/40 rounded-xl transition-all font-medium border border-blue-400/30 shadow-[0_0_15px_rgba(59,130,246,0.15)] tab-btn active group" data-tab="dashboard-tab">
                    <div class="bg-blue-500/20 p-2 rounded-lg group-hover:bg-blue-500/40 transition-colors"><i class="fas fa-chart-pie text-blue-300 text-lg"></i></div> ड्यासबोर्ड / तथ्याङ्क
                </button>
                <button class="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 rounded-xl transition-all font-medium border border-transparent hover:border-white/10 text-slate-300 hover:text-white tab-btn group" data-tab="form-tab">
                    <div class="bg-white/5 p-2 rounded-lg group-hover:bg-white/10 transition-colors"><i class="fas fa-poll-h text-slate-400 group-hover:text-blue-300 text-lg"></i></div> सर्वेक्षण फारम
                </button>
                <button class="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 rounded-xl transition-all font-medium border border-transparent hover:border-white/10 text-slate-300 hover:text-white tab-btn group" data-tab="monitoring-tab">
                    <div class="bg-white/5 p-2 rounded-lg group-hover:bg-white/10 transition-colors"><i class="fas fa-clipboard-check text-slate-400 group-hover:text-blue-300 text-lg"></i></div> अनुगमन फारम
                </button>
                <button class="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 rounded-xl transition-all font-medium border border-transparent hover:border-white/10 text-slate-300 hover:text-white tab-btn group" data-tab="attendance-tab">
                    <div class="bg-white/5 p-2 rounded-lg group-hover:bg-white/10 transition-colors"><i class="fas fa-user-clock text-slate-400 group-hover:text-blue-300 text-lg"></i></div> समय पालना/पोशाक
                </button>
            </nav>
            
            <div class="p-6 border-t border-white/10 text-center bg-white/5">
                <img src="./nepal-flag.gif" alt="Flag of Nepal" class="h-12 mx-auto drop-shadow-lg opacity-90 hover:opacity-100 transition-opacity">
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 flex flex-col h-screen overflow-hidden relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNCkiLz48L3N2Zz4=')]">
            
            <!-- Mobile Header -->
            <header class="md:hidden flex items-center justify-between p-4 bg-white shadow-sm border-b z-30">
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
            </header>

            <!-- Scrollable Content Container -->
            <div class="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth" id="main-scroll-area">
                <div class="max-w-7xl mx-auto w-full glass-panel">
`;

html = html.substring(0, oldBodyStart) + newBodyStart + html.substring(oldPanelStart);

// 3. Close the new layout wrappers at the end of the body
const oldBodyEnd = html.lastIndexOf('</body>');
const newBodyEnd = `
                </div>
            </div>
        </main>
    </div>

    <!-- Mobile Menu Script -->
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const sidebar = document.getElementById('sidebar');
            const mobileMenuBtn = document.getElementById('mobileMenuBtn');
            const closeMobileMenuBtn = document.getElementById('closeMobileMenuBtn');
            const sidebarBackdrop = document.getElementById('sidebarBackdrop');
            const tabBtns = document.querySelectorAll('.tab-btn');

            function openSidebar() {
                sidebar.classList.remove('-translate-x-full');
                sidebarBackdrop.classList.remove('hidden');
                // Small delay to allow display:block to apply before changing opacity
                setTimeout(() => sidebarBackdrop.classList.remove('opacity-0'), 10);
            }

            function closeSidebar() {
                sidebar.classList.add('-translate-x-full');
                sidebarBackdrop.classList.add('opacity-0');
                setTimeout(() => sidebarBackdrop.classList.add('hidden'), 300);
            }

            if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSidebar);
            if(closeMobileMenuBtn) closeMobileMenuBtn.addEventListener('click', closeSidebar);
            if(sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

            // Close sidebar on mobile when a tab is clicked
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.innerWidth < 768) {
                        closeSidebar();
                    }
                    
                    // Update active state styling for sidebar tabs
                    tabBtns.forEach(b => {
                        b.classList.remove('active', 'bg-blue-600/30', 'border-blue-400/30', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]');
                        b.classList.add('hover:bg-white/5', 'border-transparent', 'text-slate-300');
                        b.querySelector('div').classList.remove('bg-blue-500/20');
                        b.querySelector('div').classList.add('bg-white/5');
                        b.querySelector('i').classList.remove('text-blue-300');
                        b.querySelector('i').classList.add('text-slate-400');
                    });
                    
                    btn.classList.add('active', 'bg-blue-600/30', 'border-blue-400/30', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]');
                    btn.classList.remove('hover:bg-white/5', 'border-transparent', 'text-slate-300');
                    btn.querySelector('div').classList.remove('bg-white/5');
                    btn.querySelector('div').classList.add('bg-blue-500/20');
                    btn.querySelector('i').classList.remove('text-slate-400');
                    btn.querySelector('i').classList.add('text-blue-300');
                });
            });
        });
    </script>
</body>`;

html = html.substring(0, oldBodyEnd) + newBodyEnd + html.substring(oldBodyEnd + 7);

fs.writeFileSync('index.html', html);
console.log('index.html refactored successfully.');

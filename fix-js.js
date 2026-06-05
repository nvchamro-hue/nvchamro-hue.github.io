const fs=require('fs'); 
let js=fs.readFileSync('script.js', 'utf8'); 
js = js.replace(/document\.querySelectorAll\(\"\.tab-btn\"\)/g, 'document.querySelectorAll(\".nav-btn\")'); 
js = js.replace(/\.tab-btn\[data-tab/g, '.nav-btn[data-tab'); 
fs.writeFileSync('script.js', js);
console.log('script.js fixed.');

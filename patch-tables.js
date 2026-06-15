const fs = require('fs');

const path = 'c:/Users/acer/Desktop/surrvey2-30/script.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add btn-edit next to btn-delete everywhere
content = content.replace(
    /<td data-label="कार्य"><button class="action-btn btn-delete" onclick="deleteRecord\('\${(.*?).timestamp}', '(.*?)'\)" title="मेटाउनुहोस्"><i class="fas fa-trash"><\/i><\/button><\/td>/g,
    `<td data-label="कार्य">
        <button class="action-btn btn-edit" onclick="editRecord('\${$1.timestamp}', '$2')" title="सम्पादन"><i class="fas fa-edit"></i></button>
        <button class="action-btn btn-delete" onclick="deleteRecord('\${$1.timestamp}', '$2')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
    </td>`
);

// attendance var uses e.timestamp
content = content.replace(
    /<td data-label="कार्य"><button class="action-btn btn-delete" onclick="deleteRecord\('\${e.timestamp}', 'attendance'\)" title="मेटाउनुहोस्"><i class="fas fa-trash"><\/i><\/button><\/td>/g,
    `<td data-label="कार्य">
        <button class="action-btn btn-edit" onclick="editRecord('\${e.timestamp}', 'attendance')" title="सम्पादन"><i class="fas fa-edit"></i></button>
        <button class="action-btn btn-delete" onclick="deleteRecord('\${e.timestamp}', 'attendance')" title="मेटाउनुहोस्"><i class="fas fa-trash"></i></button>
    </td>`
);

fs.writeFileSync(path, content);
console.log('script.js patched for table rows.');

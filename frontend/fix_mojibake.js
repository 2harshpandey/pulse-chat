const fs = require('fs');

function fixMojibake(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace known mojibake with their correct Unicode equivalents
    content = content.replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â/g, '—'); // em dash
    content = content.replace(/ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢/g, '→'); // right arrow
    content = content.replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢/g, '•'); // bullet
    content = content.replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦/g, '…'); // ellipsis
    content = content.replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“/g, '–'); // en dash
    content = content.replace(/ÃƒÂ¢Ã¢â‚¬Â Ã¢â€šÂ¬/g, '─'); // horizontal box drawing
    content = content.replace(/Ã¢â‚¬â„¢/g, "'"); // Right single quote
    content = content.replace(/â€™/g, "'"); // Right single quote variant
    content = content.replace(/Ã¢â‚¬Ëœ/g, "'"); // Left single quote
    content = content.replace(/â€˜/g, "'"); // Left single quote variant
    content = content.replace(/Ã¢â‚¬Å“/g, '"'); // Left double quote
    content = content.replace(/â€œ/g, '"'); // Left double quote variant
    content = content.replace(/Ã¢â‚¬Â /g, '"'); // Right double quote
    content = content.replace(/Ã¢â‚¬ï¿½/g, '"'); // Right double quote variant
    content = content.replace(/â€ /g, '"'); // Right double quote variant 2
    
    // Also the quotes in Chat.tsx: "popstateÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢React RouterÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢404"
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed mojibake in ${filePath}`);
}

const targetFiles = [
    'd:/New folder/frontend/src/Chat.tsx',
    'd:/New folder/frontend/src/chat/utils.tsx',
    'd:/New folder/frontend/src/chat/constants.ts'
];

for (const file of targetFiles) {
    if (fs.existsSync(file)) {
        fixMojibake(file);
    }
}

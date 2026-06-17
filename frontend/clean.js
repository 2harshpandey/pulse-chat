const fs = require('fs');
const path = require('path');

function cleanFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let count = 0;
    // Replace any character starting with U+00C3 and any following non-ASCII characters with a simple dash
    content = content.replace(/\u00C3[^\x00-\x7F]*/g, () => {
        count++;
        return '-';
    });
    if (count > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Cleaned ${count} mojibake occurrences in ${path.basename(filePath)}`);
    }
}

cleanFile('d:/New folder/frontend/src/Chat.tsx');
cleanFile('d:/New folder/frontend/src/chat/utils.tsx');
cleanFile('d:/New folder/frontend/src/chat/constants.ts');
cleanFile('d:/New folder/frontend/src/chat/VideoPlayer.tsx');
cleanFile('d:/New folder/frontend/src/chat/renderMessage.tsx');
cleanFile('d:/New folder/frontend/src/chat/MessageItem.tsx');
cleanFile('d:/New folder/frontend/src/chat/ChatStyledComponents.tsx');

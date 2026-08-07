import fs from 'node:fs';

const file = 'frontend/js/utils.js';
let text = fs.readFileSync(file, 'utf8');

const broken = 'for (const player of SUPPORTED_PLAYERS) { if (targetChess) break; {';
if (text.includes(broken)) {
  text = text.replace(broken, 'for (const player of SUPPORTED_PLAYERS) {\n        if (targetChess) break;');
}

// Keep collision/finish-lane checks board-aware without changing the rule flow.
text = text.replaceAll('absolutePosition >= 51', 'absolutePosition >= getCurrentBoardDefinition().finishStart');
text = text.replaceAll('position >= 51', 'position >= getCurrentBoardDefinition().finishStart');
text = text.replaceAll('position < 51', 'position < getCurrentBoardDefinition().finishStart');
text = text.replaceAll('chess.position < 51', 'chess.position < getCurrentBoardDefinition().finishStart');

fs.writeFileSync(file, text);
console.log('utils.js migration fixups applied');

import fs from 'node:fs';

const file = 'frontend/js/botController.js';
let text = fs.readFileSync(file, 'utf8');

text = text.replaceAll('chess.position >= 51 && chess.position <= 56', 'chess.position >= gameState.getFinishStart() && chess.position <= gameState.getFinishEnd()');
text = text.replaceAll('pos >= 51 && pos <= 56', 'pos >= gameState.getFinishStart() && pos <= gameState.getFinishEnd()');
text = text.replaceAll('70 + (pos - 50) * 5', '70 + (pos - gameState.getOuterTrackEnd()) * 5');
text = text.replace('return position >= 56;', 'return position >= gameState.getFinishEnd();');
text = text.replace('return position === 56;', 'return position === gameState.getFinishEnd();');
text = text.replace('if (currentPosition >= 51 && currentPosition < 56) {', 'if (currentPosition >= gameState.getFinishStart() && currentPosition < gameState.getFinishEnd()) {');
text = text.replace('if (targetPosition > 56) {', 'if (targetPosition > gameState.getFinishEnd()) {');
text = text.replace('const overflow = targetPosition - 56;', 'const overflow = targetPosition - gameState.getFinishEnd();');
text = text.replace('const finalPosition = 56 - overflow;', 'const finalPosition = gameState.getFinishEnd() - overflow;');
text = text.replace('if (position >= 51 && position <= 56) {', 'if (position >= gameState.getFinishStart() && position <= gameState.getFinishEnd()) {');
text = text.replaceAll('const activePlayers = activePlayerManager ? activePlayerManager.getActivePlayers() : [1, 2, 3, 4];', 'const activePlayers = activePlayerManager ? activePlayerManager.getActivePlayers() : gameState.getBoardDefinition().players;');

// Hard AI move analysis also treats normal track/finish lane as board data.
text = text.replaceAll('position >= 0 && position <= 50', 'position >= 0 && position <= gameState.getOuterTrackEnd()');
text = text.replaceAll('position >= 51 && position < 56', 'position >= gameState.getFinishStart() && position < gameState.getFinishEnd()');
text = text.replaceAll('targetPosition > 50', 'targetPosition > gameState.getOuterTrackEnd()');

fs.writeFileSync(file, text);
console.log('six-player bot board-bound fixups applied');

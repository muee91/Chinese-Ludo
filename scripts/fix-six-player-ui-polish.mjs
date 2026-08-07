import fs from 'node:fs';

const patch = (file, fn) => {
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, fn(text));
};

patch('frontend/js/uiUpdater.js', text => {
  text = text.replace('for (let i = 1; i <= 4; i++) {\n            const startArea = document.getElementById(`player${i}-start`);', 'for (const i of gameState.getBoardDefinition().players) {\n            const startArea = document.getElementById(`player${i}-start`);');
  text = text.replace("if (gamePhase === 'selecting' && diceValue === 6) {", "if (gamePhase === 'selecting' && diceValue % 2 === 0) {");
  text = text.replace('if (chess.position >= 51 && chess.position < 56) {', 'if (chess.position >= gameState.getFinishStart() && chess.position < gameState.getFinishEnd()) {');
  text = text.replace('if (chess.position >= 0 && chess.position <= 50) {', 'if (chess.position >= 0 && chess.position <= gameState.getOuterTrackEnd()) {');
  return text;
});

patch('frontend/js/sixPlayerBoardRenderer.js', text => {
  text = text.replace("href: '#start',\n            class: `player-${player}`,", "href: '#start',\n            id: `player${player}-start`,\n            class: `player-${player}`," );
  return text;
});

patch('frontend/js/chessPiece.js', text => {
  const old = `        [fromAbsPos, targetAbsPos].forEach(absPos => {
            if (absPos === undefined || absPos === null) return;
            const sel = absPos >= 51
                ? \`[data-cpos="\${absPos}"].player-\${player}\`
                : \`[data-cpos="\${absPos}"]\`;
            const els = svg.querySelectorAll(sel);
            els.forEach(el => el.classList.add('teleport-grid-highlight'));
        });`;
  const next = `        [fromAbsPos, targetAbsPos].forEach(absPos => {
            if (absPos === undefined || absPos === null) return;
            const isEncodedFinish = absPos >= 1000;
            const relativeFinishPosition = isEncodedFinish ? absPos % 100 : absPos;
            const sel = isEncodedFinish || relativeFinishPosition >= this.gameState.getFinishStart()
                ? \`[data-cpos="\${relativeFinishPosition}"].player-\${player}\`
                : \`[data-cpos="\${relativeFinishPosition}"]\`;
            const els = svg.querySelectorAll(sel);
            els.forEach(el => el.classList.add('teleport-grid-highlight'));
        });`;
  if (text.includes(old)) text = text.replace(old, next);
  return text;
});

patch('frontend/js/settlementModal.js', text => {
  text = text.replace("            4: getComputedStyle(document.documentElement).getPropertyValue('--player-4-color').trim() || '#F1C40F'",
    "            4: getComputedStyle(document.documentElement).getPropertyValue('--player-4-color').trim() || '#F1C40F',\n            5: getComputedStyle(document.documentElement).getPropertyValue('--player-5-color').trim() || '#c7b9df',\n            6: getComputedStyle(document.documentElement).getPropertyValue('--player-6-color').trim() || '#d9cf98'");
  return text;
});

console.log('six-player UI integration polish applied');

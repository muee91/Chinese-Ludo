import fs from 'node:fs';

const patch = (file, fn) => {
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, fn(text));
};

patch('frontend/js/chessPiece.js', text => {
  text = text.replaceAll('bounceSteps = targetPosition - 56;', 'bounceSteps = targetPosition - this.gameState.getFinishEnd();');
  text = text.replaceAll('currentPosition + steps > 56', 'currentPosition + steps > this.gameState.getFinishEnd()');
  text = text.replaceAll('${56 - bounceSteps}', '${this.gameState.getFinishEnd() - bounceSteps}');
  text = text.replaceAll('if (chess.position >= 51 && chess.position < 56) {', 'if (chess.position >= this.gameState.getFinishStart() && chess.position < this.gameState.getFinishEnd()) {');
  text = text.replaceAll('if (chess.position >= 0 && chess.position <= 50) {', 'if (chess.position >= 0 && chess.position <= this.gameState.getOuterTrackEnd()) {');
  // Comments/log strings are updated too so debug output no longer claims the four-player endpoint.
  text = text.replaceAll('位置0-56', '位置0-当前棋盘终点');
  text = text.replaceAll('位置51-56', '终点通道');
  text = text.replaceAll('位置为56（终点）', '位于终点');
  text = text.replaceAll('从位置56反弹', '从终点反弹');
  text = text.replaceAll('最终位置${56 - bounceSteps}', '最终位置${this.gameState.getFinishEnd() - bounceSteps}');
  return text;
});

patch('frontend/js/gameState.js', text => {
  text = text.replace('// 如果棋子在起始区域，只有摇到6才能出发', '// 如果棋子在起始区域，按原中国飞行棋规则：偶数可起飞');
  text = text.replace('this.currentPlayer = null; // 当前玩家 (1-4)', 'this.currentPlayer = null; // 当前玩家 (1-6，实际参与者由 activePlayerManager 控制)');
  return text;
});

patch('frontend/js/progressDisplay.js', text => {
  if (!text.startsWith("import { activePlayerManager")) {
    text = "import { activePlayerManager } from './activePlayerManager.js';\n" + text;
  }
  text = text.replaceAll('for (let player = 1; player <= 6; player++) {', 'for (const player of activePlayerManager.getActivePlayers()) {');
  text = text.replace('const initialOrder = [1, 2, 3, 4, 5, 6];', 'const initialOrder = activePlayerManager.getActivePlayers();');
  return text;
});

fs.writeFileSync('frontend/js/boards/classic4Compatibility.test.mjs', `import assert from 'node:assert/strict';
import { getBoardDefinition, getAbsolutePositionForBoard, isJumpPointForBoard, getOpponentForBoard } from './boardConfig.js';
const b = getBoardDefinition('classic4');
assert.equal(getAbsolutePositionForBoard(1, 0, b), 0);
assert.equal(getAbsolutePositionForBoard(1, 50, b), 50);
assert.equal(getAbsolutePositionForBoard(2, 1, b), 14);
assert.equal(getAbsolutePositionForBoard(2, 38, b), -3);
assert.equal(getAbsolutePositionForBoard(2, 39, b), -2);
assert.equal(getAbsolutePositionForBoard(2, 40, b), 1);
assert.equal(getAbsolutePositionForBoard(3, 25, b), -3);
assert.equal(getAbsolutePositionForBoard(3, 26, b), -2);
assert.equal(getAbsolutePositionForBoard(3, 27, b), 1);
assert.equal(getAbsolutePositionForBoard(4, 12, b), -3);
assert.equal(getAbsolutePositionForBoard(4, 13, b), -2);
assert.equal(getAbsolutePositionForBoard(4, 14, b), 1);
assert.equal(getAbsolutePositionForBoard(4, 1, b), 40);
assert.equal(getAbsolutePositionForBoard(2, 51, b), 51);
assert.equal(getOpponentForBoard(1, b), 3);
assert.equal(getOpponentForBoard(2, b), 4);
assert.equal(isJumpPointForBoard(2, b), true);
assert.equal(isJumpPointForBoard(6, b), true);
assert.equal(isJumpPointForBoard(50, b), false);
console.log('classic4 compatibility tests passed');
`);

patch('frontend/package.json', text => {
  const pkg = JSON.parse(text);
  pkg.scripts['test:six-player'] = 'node js/boards/classic4Compatibility.test.mjs && node js/boards/classic6.test.mjs';
  return JSON.stringify(pkg, null, 2) + '\n';
});

console.log('six-player core hardcode fixups applied');

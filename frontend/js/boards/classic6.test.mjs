import assert from 'node:assert/strict';
import {
  getBoardDefinition,
  getAbsolutePositionForBoard,
  isJumpPointForBoard,
  getOpponentForBoard,
  getFlightCrossPositionForBoard
} from './boardConfig.js';

const b = getBoardDefinition('classic6');
assert.equal(b.playerCount, 6);
assert.equal(b.sectorLength, 13);
assert.equal(b.ringLength, 78);
assert.equal(b.outerEnd, 76);
assert.equal(b.finishStart, 77);
assert.equal(b.finishEnd, 82);
assert.deepEqual(b.players, [1, 2, 3, 4, 5, 6]);
assert.deepEqual(b.opponents, { 1:4, 2:5, 3:6, 4:1, 5:2, 6:3 });

// 六个阵营沿公共环道保持原版13格相位差。
assert.equal(getAbsolutePositionForBoard(1, 1, b), 1);
assert.equal(getAbsolutePositionForBoard(2, 1, b), 14);
assert.equal(getAbsolutePositionForBoard(3, 1, b), 27);
assert.equal(getAbsolutePositionForBoard(4, 1, b), 40);
assert.equal(getAbsolutePositionForBoard(5, 1, b), 53);
assert.equal(getAbsolutePositionForBoard(6, 1, b), 66);

// 六色棋盘的自身颜色格每6格出现一次；第5个自身颜色格保持为飞行格。
assert.equal(isJumpPointForBoard(2, b), true);
assert.equal(isJumpPointForBoard(8, b), true);
assert.equal(isJumpPointForBoard(14, b), true);
assert.equal(isJumpPointForBoard(6, b), false);
assert.equal(b.flightPredecessor, 20);
assert.equal(b.flightPoint, 26);
assert.equal(b.flightTarget, 56);
assert.equal(b.flightPostJump, 62);
assert.equal(b.flightTarget - b.flightPoint, (b.playerCount - 1) * b.jumpInterval);

// 飞行路径继续与对家的第3个终点航道格发生交叉判定。
assert.equal(getOpponentForBoard(1, b), 4);
assert.equal(getOpponentForBoard(2, b), 5);
assert.equal(getOpponentForBoard(3, b), 6);
assert.equal(getFlightCrossPositionForBoard(b), 79);

const track = b.createMainTrack();
assert.equal(track.length, 83);
assert.notDeepEqual(track[0], track[1], '起飞点必须独立于公共外圈第一格');
assert.equal(b.getBaseSlotPositions().length, 4);

// 环道颜色必须让各玩家的相对位置2落在自己的颜色格。
for (const player of b.players) {
  const absolute = getAbsolutePositionForBoard(player, 2, b);
  assert.equal(b.getRingColorPlayer(absolute), player);
}

console.log('classic6 board tests passed');

import assert from 'node:assert/strict';
import {
  getBoardDefinition,
  getAbsolutePositionForBoard,
  isJumpPointForBoard,
  getOpponentForBoard,
  getFlightCrossPositionForBoard,
  resolveBoardIdForPlayers
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

// 棋盘类型由实际参与人数/阵营决定，不由“房间最大容量”决定。
assert.equal(resolveBoardIdForPlayers([1, 2, 3, 4], 4), 'classic4');
assert.equal(resolveBoardIdForPlayers([1, 5], 2), 'classic6');
assert.equal(resolveBoardIdForPlayers([{ id: 'player_x', color: 5 }, { id: 'player_y', color: 1 }], 2), 'classic6');
assert.equal(resolveBoardIdForPlayers([{ id: 'player_x', playerNumber: 6 }, { id: 'player_y', playerNumber: 2 }], 2), 'classic6');
assert.equal(resolveBoardIdForPlayers([1, 2, 3, 4, 1], 5), 'classic6');

// 六个阵营沿公共环道保持原版13格相位差。
assert.equal(getAbsolutePositionForBoard(1, 1, b), 1);
assert.equal(getAbsolutePositionForBoard(2, 1, b), 14);
assert.equal(getAbsolutePositionForBoard(3, 1, b), 27);
assert.equal(getAbsolutePositionForBoard(4, 1, b), 40);
assert.equal(getAbsolutePositionForBoard(5, 1, b), 53);
assert.equal(getAbsolutePositionForBoard(6, 1, b), 66);
assert.equal(getAbsolutePositionForBoard(6, 12, b), -3);
assert.equal(getAbsolutePositionForBoard(6, 13, b), -2);

// 六色棋盘的自身颜色格每6格出现一次；第5个自身颜色格保持为飞行格。
assert.equal(isJumpPointForBoard(2, b), true);
assert.equal(isJumpPointForBoard(8, b), true);
assert.equal(isJumpPointForBoard(14, b), true);
assert.equal(isJumpPointForBoard(6, b), false);
assert.equal(b.flightPredecessor, 20);
assert.equal(b.flightPoint, 26);
assert.equal(b.flightTarget, 50);
assert.equal(b.flightPostJump, 56);

// 飞行路径继续与对家的第3个终点航道格发生交叉判定。
assert.equal(getOpponentForBoard(1, b), 4);
assert.equal(getOpponentForBoard(2, b), 5);
assert.equal(getOpponentForBoard(3, b), 6);
assert.equal(getFlightCrossPositionForBoard(b), 79);

const track = b.createMainTrack();
assert.equal(track.length, 83);
assert.notDeepEqual(track[0], track[1], '起飞点必须独立于公共外圈第一格');
assert.equal(b.getBaseSlotPositions().length, 4);

// 视觉几何与规则编号解耦：放大六边形但不改变逻辑位置数量。
assert.equal(b.visual.ringRadius, 112);
assert.equal(b.visual.viewBoxRadius, 172);
assert.equal(b.visual.ringCellScale, 0.72);
assert.equal(b.visual.laneCellScale, 0.76);
assert.deepEqual(b.visual.flightArrowFractions, [0.30, 0.58]);
const ring = b.getRingPoints();
assert.equal(ring.length, 78);
const firstSpacing = Math.hypot(ring[1].x - ring[0].x, ring[1].y - ring[0].y);
assert.ok(firstSpacing > 8.5, '六边形相邻格必须留出足够中心距，避免原SVG格子重叠');
const baseRadius = Math.hypot(...Object.values(b.getBaseSlotPositions()[0]));
assert.ok(baseRadius > b.visual.ringRadius + 20, '基地必须明显位于公共环道外侧');

// 参考玩家4的飞行线应近似水平，并穿过对家玩家1的第3个终点航道格。
const start = track[b.flightPoint];
const target = track[b.flightTarget];
assert.ok(Math.abs(start.y - target.y) < 1e-6, '飞行起终点应形成横向跨盘线路');
const crossLocal = track[getFlightCrossPositionForBoard(b)];
const opponentCross = b.rotatePoint(crossLocal, 180);
const crossDistanceToLine = Math.abs(opponentCross.y - start.y);
assert.ok(crossDistanceToLine < 2, '飞行线路必须经过对家终点航道交叉格');
assert.ok(opponentCross.x > Math.min(start.x, target.x) && opponentCross.x < Math.max(start.x, target.x));

// 环道颜色必须让各玩家的相对位置2落在自己的颜色格。
for (const player of b.players) {
  const absolute = getAbsolutePositionForBoard(player, 2, b);
  assert.equal(b.getRingColorPlayer(absolute), player);
}

console.log('classic6 board tests passed');

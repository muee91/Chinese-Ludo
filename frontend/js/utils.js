import { SUPPORTED_PLAYERS, getCurrentBoardDefinition, getAbsolutePositionForBoard, isJumpPointForBoard, getNextJumpPointForBoard, getOpponentForBoard, getFlightCrossPositionForBoard } from './boards/boardConfig.js';
// 工具函数模块
// 包含位置转换、特殊位置判断、绝对位置计算等纯函数

// 判断是否为起跳点
export function isJumpPoint(position) { return isJumpPointForBoard(position, getCurrentBoardDefinition()); }

// 获取下一个起跳点（跳到下一个起跳点位置）
export function getNextJumpPoint(currentPosition) { return getNextJumpPointForBoard(currentPosition, getCurrentBoardDefinition()); }

// 根据棋子在轨道上的位置计算应该的旋转角度
export function getChessRotationAtPosition(playerOrPosition, maybePosition = null, gameState = null) {
    const position = Number(maybePosition === null ? playerOrPosition : maybePosition);
    const board = gameState?.getBoardDefinition?.() || getCurrentBoardDefinition();
    if (board.id === 'classic6') {
        const track = board.createMainTrack();
        const clamp = value => Math.max(1, Math.min(board.finishEnd, value));
        const heading = pos => {
            const p = clamp(pos);
            const before = track[Math.max(1, p - 1)] || track[p];
            const after = track[Math.min(board.finishEnd, p + 1)] || track[p];
            return Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
        };
        const base = heading(1);
        let result = heading(position) - base;
        while (result > 180) result -= 360;
        while (result < -180) result += 360;
        return result;
    }

    // classic4 原始转向表保持不变。
    const specificRotations = {
        1: -90, 5: -90, 8: 90, 14: 90, 19: -90, 21: 90,
        27: 90, 30: -90, 34: 90, 40: 90, 44: -90, 47: 90, 50: 90
    };
    let totalRotation = 0;
    for (let pos = 1; pos <= position; pos++) {
        if (Object.prototype.hasOwnProperty.call(specificRotations, pos)) totalRotation += specificRotations[pos];
    }
    return totalRotation;
}

// 将玩家的相对位置转换为绝对轨道位置（以玩家1为参考）
export function getAbsolutePosition(player, relativePosition) { return getAbsolutePositionForBoard(player, relativePosition, getCurrentBoardDefinition()); }

// 检查指定绝对 position 是否有其他玩家的棋子
export function getChessAtAbsolutePosition(absolutePosition, gameState) {
    if (absolutePosition === -1) return null; // 起始区域不会发生碰撞

    // 兼容处理：如果gameState有getPlayerChess方法，使用它；否则直接使用playerChess属性
    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4

    for (const player of SUPPORTED_PLAYERS) {
        for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
            const chess = playerChess[player][chessIndex];
            if (chess.finished || chess.position === -1) continue;

            const chessAbsolutePos = getAbsolutePosition(player, chess.position);

            if (chessAbsolutePos === absolutePosition) {
                return { player, chessIndex, chess };
            }
        }
    }
    return null;
}
// 执行beat操作：将目标位置的对手棋子打回起点
// isRemoteDiceMove 用于标记本次移动是否来源于遥控/道具骰子
export async function beatChessAtPosition(absolutePosition, currentPlayer, gameState = null, moveChessToStartCallback = null, showBeatInfo = true, executeStateUpdate = true, isRemoteDiceMove = false, allowFinishLaneBeat = false, energyDelay = 0) {
    // 如果没有传入gameState，使用全局gameState
    if (!gameState) {
        const { gameState: globalGameState } = await import('./gameState.js');
        gameState = globalGameState;
    }

    // 欢乐模式：跳过所有 beat 操作
    if (gameState && typeof gameState.isHappyMode === 'function' && gameState.isHappyMode()) {
        return { hasBeat: false };
    }

    // 导入gameInfo用于显示beat信息
    const { gameInfo } = await import('./gameInfo.js');

    // 只在外圈轨道（0-50 以及玩家1到不了的位置-2和-3，排除基地-1）检查beat操作
    // 位置51及以上（终点航道）每个玩家独立，不应该有beat检测
    if (absolutePosition === -1 || (!allowFinishLaneBeat && absolutePosition >= getCurrentBoardDefinition().finishStart)) {
        return { hasBeat: false };
    }

    // 直接遍历查找"其他玩家"的棋子，避免把当前玩家刚落下的棋子误判为目标
    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4
    let targetChess = null;
    for (const player of SUPPORTED_PLAYERS) {
        if (targetChess) break;
        if (player === currentPlayer) continue; // 跳过当前玩家
        for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
            const chess = playerChess[player][chessIndex];
            if (chess.finished || chess.position === -1) continue;
            const chessAbsolutePos = getAbsolutePosition(player, chess.position);
            if (chessAbsolutePos === absolutePosition) {
                targetChess = { player, chessIndex, chess };
                break;
            }
        }
    }

    if (targetChess) {
        console.log(`[Beat检测] 玩家${currentPlayer}打败玩家${targetChess.player}的棋子${targetChess.chessIndex}`);

        // 检查是否在网络回放模式
        const isReplayMode = window.gameInstance && window.gameInstance.chessPiece && window.gameInstance.chessPiece._isNetworkReplayMode;

        // 只有在executeStateUpdate为true时才执行状态更新和动画
        if (executeStateUpdate) {
            // 添加beat信息到游戏信息面板（非回放模式）
            if (showBeatInfo && !isReplayMode) {
                gameInfo.addChessBeat(currentPlayer, targetChess.player, targetChess.chessIndex, false, isRemoteDiceMove);
            }

            // 增加击败次数统计（非回放模式）
            if (!isReplayMode) {
                gameState.incrementDefeatCount(currentPlayer, targetChess.player);
            }

            // 计算并增加积分（如果启用道具模式，且非回放模式）
            // 遥控/道具骰子击败不获得积分，以免过强
            if (!isRemoteDiceMove && !isReplayMode) {
                // 需要在棋子重置之前计算完成度损失
                const targetChessObj = gameState.getPlayerChess()[targetChess.player][targetChess.chessIndex];
                const progressBeforeBeat = calculateChessProgress(targetChessObj, targetChess.player);

                // 导入积分管理器
                const { energyManager } = await import('./energyManager.js');
                if (energyManager.isSkillModeEnabled()) {
                    // 被击败后的进度为0（回到起点）
                    const progressAfterBeat = 0;
                    const progressLoss = progressBeforeBeat - progressAfterBeat;

                    // 增加积分
                    energyManager.addEnergyFromBeat(currentPlayer, progressLoss, targetChess.player, targetChess.chessIndex, energyDelay);

                    console.log(`[积分系统] 玩家${currentPlayer}击败玩家${targetChess.player}的棋子，完成度损失${progressLoss.toFixed(2)}%，获得积分`);
                }
            }

            // 将对手棋子重置到起始区域
            gameState.updateChessPosition(targetChess.player, targetChess.chessIndex, -1);
            gameState.setChessFinished(targetChess.player, targetChess.chessIndex, false);

            // 调用回调函数移动棋子到起始位置
            if (moveChessToStartCallback) {
                moveChessToStartCallback(targetChess.player, targetChess.chessIndex);
            }
        }

        return { hasBeat: true, targetPlayer: targetChess.player, targetChessIndex: targetChess.chessIndex }; // 返回beat信息
    } else {
        return { hasBeat: false }; // 没有发生beat操作
    }
}
/**
 * 计算单个棋子的完成度（百分比）
 * @param {Object} chess - 棋子对象
 * @param {number} player - 玩家编号
 * @returns {number} 完成度（0-100）
 */
export function calculateChessProgress(chess, player) {
    if (chess.finished) return 100;
    if (chess.position === -1) return 0;
    const board = getCurrentBoardDefinition();
    const totalSteps = board.finishEnd + 1;
    return Math.min(100, Math.max(0, (chess.position / totalSteps) * 100));
}

// 获取对家玩家编号（1-3, 2-4对应关系）
export function getOpponentPlayer(player) { return getOpponentForBoard(player, getCurrentBoardDefinition()); }

/**
 * 检查指定位置是否有其他玩家的棋子（含叠子）
 * 用于欢乐模式碰撞奖励检测
 * 使用绝对坐标比较，因为不同玩家的路径位置映射到不同的绝对位置
 */
export function hasOtherPlayerChessAtPosition(currentPlayer, position, gameState) {
    if (!gameState || !gameState.playerChess) return -1;
    // 终点通道（>=51）每玩家独立，不参与碰撞检测
    if (position >= getCurrentBoardDefinition().finishStart) return -1;
    const currentAbsolutePos = getAbsolutePosition(currentPlayer, position);
    if (currentAbsolutePos < 0) return -1;

    const players = Object.keys(gameState.playerChess).map(Number);
    for (const p of players) {
        if (p === currentPlayer) continue;
        const chesses = gameState.playerChess[p];
        if (!Array.isArray(chesses)) continue;
        for (const chess of chesses) {
            if (chess && !chess.finished && chess.position >= 0 && chess.position < getCurrentBoardDefinition().finishStart) {
                const otherAbsolutePos = getAbsolutePosition(p, chess.position);
                if (otherAbsolutePos === currentAbsolutePos) {
                    return p; // 返回被撞的玩家编号
                }
            }
        }
    }
    return -1; // 没有其他玩家棋子
}

/**
 * 获取指定位置其他玩家的棋子总数（含叠子）
 * 用于欢乐模式碰撞奖励计算
 */
export function getEnemyChessCountAtPosition(currentPlayer, position, gameState) {
    if (!gameState || !gameState.playerChess) return 0;
    if (position >= getCurrentBoardDefinition().finishStart) return 0;
    const currentAbsolutePos = getAbsolutePosition(currentPlayer, position);
    if (currentAbsolutePos < 0) return 0;

    let count = 0;
    const players = Object.keys(gameState.playerChess).map(Number);
    for (const p of players) {
        if (p === currentPlayer) continue;
        const chesses = gameState.playerChess[p];
        if (!Array.isArray(chesses)) continue;
        for (const chess of chesses) {
            if (chess && !chess.finished && chess.position >= 0 && chess.position < getCurrentBoardDefinition().finishStart) {
                const otherAbsolutePos = getAbsolutePosition(p, chess.position);
                if (otherAbsolutePos === currentAbsolutePos) {
                    count++;
                }
            }
        }
    }
    return count;
}

// 检查指定玩家的位置53是否有棋子
export function hasChessAtPosition53(player, gameState = null) {
    if (!gameState) return { hasChess: false };
    const crossPosition = getFlightCrossPositionForBoard(gameState.getBoardDefinition?.() || getCurrentBoardDefinition());
    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4;
    for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
        const chess = playerChess[player]?.[chessIndex];
        if (chess && !chess.finished && chess.position === crossPosition) return { hasChess: true, chessIndex, chess };
    }
    return { hasChess: false };
}

/**
 * 检查位置53是否有对家的叠子（用于飞棋阻挡检测）
 * @param {string} currentPlayer - 当前玩家
 * @param {Object} gameState - 游戏状态
 * @returns {Object} - 返回检测结果 { hasStack: boolean, stackInfo: Object|null }
 */
export function hasOpponentStackAtPosition53(currentPlayer, gameState) {
    const board = gameState?.getBoardDefinition?.() || getCurrentBoardDefinition();
    const opponentPlayer = getOpponentPlayer(currentPlayer);
    if (!opponentPlayer) return { hasStack: false, stackInfo: null };
    const crossPosition = getFlightCrossPositionForBoard(board);
    const absolutePosition = getAbsolutePosition(opponentPlayer, crossPosition);
    const stackInfo = isStackAtAbsolutePosition(absolutePosition, gameState);
    if (stackInfo && stackInfo.chessList.length >= 2 && stackInfo.chessList.every(item => item.player === opponentPlayer)) {
        return { hasStack: true, stackInfo };
    }
    return { hasStack: false, stackInfo: null };
}

// 判断指定绝对位置是否为叠子（同一玩家的两个或多个棋子在同一位置）
export function isStackAtAbsolutePosition(absolutePosition, gameState) {
    if (absolutePosition === -1 || absolutePosition < 0) return null;

    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4; // 获取当前棋子个数，默认为4

    // 统计每个玩家在该位置的棋子数量
    for (const player of SUPPORTED_PLAYERS) {
        const chessAtPosition = [];

        for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
            const chess = playerChess[player][chessIndex];
            if (chess.finished || chess.position === -1) continue;

            const chessAbsolutePos = getAbsolutePosition(player, chess.position);
            if (chessAbsolutePos === absolutePosition) {
                chessAtPosition.push({ player, chessIndex, chess });
            }
        }

        // 如果该玩家在此位置有2个或以上棋子，则为叠子
        if (chessAtPosition.length >= 2) {
            return {
                isStack: true,
                player: player,
                chessCount: chessAtPosition.length,
                chessList: chessAtPosition
            };
        }
    }

    return null;
}

// 检测前方路径上是否有其他玩家的叠子
export function checkStackInPath(currentPlayer, currentPosition, steps, gameState) {
    // 只检测外圈轨道（1-50）上的叠子，但允许从位置0出发进行检测
    // 如果当前位置小于0或大于等于51，且不是从位置0出发，则跳过检测
    if (currentPosition < 0 || (currentPosition >= getCurrentBoardDefinition().finishStart && currentPosition !== 0)) {
        return null;
    }

    // 检查路径上的每一步
    for (let step = 1; step <= steps; step++) {
        const nextPosition = currentPosition + step;

        // 如果超出外圈轨道或到达位置0，停止检测
        if (nextPosition <= 0 || nextPosition > getCurrentBoardDefinition().outerEnd) {
            break;
        }

        const nextAbsolutePos = getAbsolutePosition(currentPlayer, nextPosition);
        const stackInfo = isStackAtAbsolutePosition(nextAbsolutePos, gameState);

        if (stackInfo && stackInfo.player !== currentPlayer) {
            console.log(`[叠子阻挡] 在位置${nextPosition}发现玩家${stackInfo.player}的叠子`);

            // 判断是刚好到达叠子位置还是需要反弹
            const isExactHit = (step === steps); // 刚好到达叠子位置，撞机
            const needsBounce = (step < steps); // 摇到点数大于叠子距离，需要反弹

            return {
                stackPosition: nextPosition,
                stackAbsolutePosition: nextAbsolutePos,
                stackPlayer: stackInfo.player,
                stackInfo: stackInfo, // 包含叠子的详细信息
                distanceToStack: step,
                remainingSteps: steps - step,
                isExactHit: isExactHit, // 是否刚好到达叠子位置（撞机）
                needsBounce: needsBounce // 是否需要反弹
            };
        }
    }

    return null;
}

// 创建工具函数对象并导出
// 检测跳子路径中是否有叠子（不包括起点和终点）
export function checkStackInJumpPath(currentPlayer, startPosition, endPosition, gameState) {
    // 位置0不检测
    if (startPosition <= 0 || endPosition <= 0) {
        return null;
    }

    // 检查跳子路径中的每一个位置（不包括起点和终点）
    const minPos = Math.min(startPosition, endPosition);
    const maxPos = Math.max(startPosition, endPosition);

    for (let position = minPos + 1; position < maxPos; position++) {
        const absolutePos = getAbsolutePosition(currentPlayer, position);
        const stackInfo = isStackAtAbsolutePosition(absolutePos, gameState);

        if (stackInfo && stackInfo.player !== currentPlayer) {
            console.log(`[跳子阻挡] 在位置${position}发现玩家${stackInfo.player}的叠子`);
            return {
                hasStack: true,
                stackPosition: position,
                stackAbsolutePosition: absolutePos,
                stackPlayer: stackInfo.player,
                stackInfo: stackInfo
            };
        }
    }

    return null;
}

// 飞棋是跨越公共环道的捷径，路径上的叠子（包括当前玩家自己的同色叠子）
// 都会使捷径失效，改走普通跳子。与普通行进路径不同，这里必须检查所有玩家。
export function checkStackInFlightPath(currentPlayer, startPosition, endPosition, gameState) {
    if (startPosition <= 0 || endPosition <= 0) return null;

    const minPos = Math.min(startPosition, endPosition);
    const maxPos = Math.max(startPosition, endPosition);
    for (let position = minPos + 1; position < maxPos; position++) {
        const absolutePos = getAbsolutePosition(currentPlayer, position);
        const stackInfo = isStackAtAbsolutePosition(absolutePos, gameState);
        if (stackInfo) {
            return {
                hasStack: true,
                stackPosition: position,
                stackAbsolutePosition: absolutePos,
                stackPlayer: stackInfo.player,
                stackInfo
            };
        }
    }

    return null;
}

export const utils = {
    isJumpPoint,
    getNextJumpPoint,
    getChessRotationAtPosition,
    getAbsolutePosition,
    getChessAtAbsolutePosition,
    beatChessAtPosition,
    getOpponentPlayer,
    hasChessAtPosition53,
    hasOpponentStackAtPosition53,
    isStackAtAbsolutePosition,
    checkStackInPath,
    checkStackInJumpPath,
    checkStackInFlightPath,
    hasOtherPlayerChessAtPosition,
    getEnemyChessCountAtPosition
};

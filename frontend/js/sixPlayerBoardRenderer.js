import '../css/sixPlayerBoard.css';
import { getCurrentBoardDefinition } from './boards/boardConfig.js';

const NS = 'http://www.w3.org/2000/svg';
const PLAYERS = [1, 2, 3, 4, 5, 6];
const make = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
};
const rotate = (point, degrees) => {
    const r = degrees * Math.PI / 180;
    return { x: point.x * Math.cos(r) - point.y * Math.sin(r), y: point.x * Math.sin(r) + point.y * Math.cos(r) };
};

function readSessionJson(key) {
    try {
        return JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
}

function findPlayerInPayload(payload, player) {
    const numericPlayer = Number(player);
    const candidates = [
        payload?.players,
        payload?.room?.players,
        payload?.gameSession?.players,
        payload?.gameData?.players
    ];
    for (const players of candidates) {
        if (!Array.isArray(players)) continue;
        const match = players.find(item => [item?.color, item?.playerNumber, item?.id]
            .some(value => Number(value) === numericPlayer));
        if (match) return match;
    }
    return null;
}

function getConfiguredPlayerName(player) {
    if (typeof sessionStorage === 'undefined') return `玩家${player}`;
    const sources = [readSessionJson('gameConfig'), readSessionJson('multiplayerGameData')];
    for (const source of sources) {
        const match = findPlayerInPayload(source, player);
        const name = match?.name || match?.nickname || match?.username;
        if (name) return String(name);
    }

    // AI 对战配置只保存 humanUsername/bots，Bot 名称由
    // playerNameManager 在 handleUrlParameters 中生成；此时六人卡片
    // 还未创建，不能依赖 updatePlayerName 的 DOM 扫描来补写名称。
    const managedName = globalThis.window?.playerNameManager?.getPlayerName?.(player);
    if (managedName) return String(managedName);

    return `玩家${player}`;
}

function defeatCounterId(player, opponent, mobile) {
    return `defeat-count-${mobile ? 'mobile-' : ''}${player}-${opponent}`;
}

function ensureDefeatCounters(card, player, mobile = false) {
    if (!card) return;
    let container = card.querySelector('.defeat-counts');
    if (!container) {
        container = document.createElement('div');
        container.className = `defeat-counts${mobile ? ' defeat-counts-mobile' : ''}`;
        card.appendChild(container);
    }
    PLAYERS.filter(opponent => opponent !== player).forEach(opponent => {
        const id = defeatCounterId(player, opponent, mobile);
        if (card.querySelector(`#${id}`)) return;
        const counter = document.createElement('div');
        counter.className = `defeat-count player-${opponent}-defeat`;
        counter.id = id;
        counter.textContent = '0';
        container.appendChild(counter);
    });
}

function ensurePlayerCard(container, player, mobile = false) {
    if (!container) return null;
    const configuredName = getConfiguredPlayerName(player);
    let card = container.querySelector(`.player-${player}-info`);
    if (!card) {
        card = document.createElement('div');
        card.className = `player-info player-${player}-info`;
        card.innerHTML = `
            <div class="player-main">
                <div class="player-avatar player-${player}-avatar">
                    <div class="player-emoji" id="player-${player}-emoji${mobile ? '-mobile' : ''}"></div>
                </div>
                <div class="player-name"></div>
            </div>`;
        card.querySelector('.player-name').textContent = configuredName;
        container.appendChild(card);
    } else {
        const nameElement = card.querySelector('.player-name');
        const currentName = nameElement?.textContent?.trim() || '';
        const isGenericName = /^Player\s+\d+$/i.test(currentName) || /^玩家\d+$/.test(currentName);
        if (nameElement && isGenericName) {
            nameElement.textContent = configuredName;
        }
    }
    ensureDefeatCounters(card, player, mobile);
    return card;
}

function ensureProgressItems() {
    const content = document.querySelector('.progress-panel .progress-content');
    if (!content) return;
    PLAYERS.forEach(player => {
        let item = content.querySelector(`.progress-item[data-player="${player}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'progress-item';
            item.dataset.player = String(player);
            content.appendChild(item);
        }

        let avatar = item.querySelector('.progress-avatar');
        if (!avatar) {
            avatar = document.createElement('div');
            item.prepend(avatar);
        }
        avatar.className = `progress-avatar player-${player}`;

        let details = item.querySelector('.progress-details');
        if (!details) {
            details = document.createElement('div');
            details.className = 'progress-details';
            const existingBar = item.querySelector('.progress-bar');
            if (existingBar) existingBar.remove();
            item.appendChild(details);
        }

        let header = details.querySelector('.progress-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'progress-header';
            details.prepend(header);
        }

        let name = header.querySelector('.progress-player-name');
        if (!name) {
            name = document.createElement('span');
            name.className = 'progress-player-name';
            header.prepend(name);
        }
        name.textContent = getConfiguredPlayerName(player);

        let percentage = header.querySelector('.progress-percentage');
        if (!percentage) {
            percentage = document.createElement('span');
            percentage.className = 'progress-percentage';
            header.appendChild(percentage);
        }
        if (!percentage.textContent) percentage.textContent = '0%';

        let bar = details.querySelector('.progress-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'progress-bar';
            details.appendChild(bar);
        }

        let fill = bar.querySelector('.progress-fill');
        if (!fill) {
            fill = document.createElement('div');
            bar.appendChild(fill);
        }
        fill.className = `progress-fill player-${player}`;
    });
}

function ensureDebugPlayers() {
    document.querySelectorAll('.debug-player-radio-group').forEach(group => {
        const inputName = group.querySelector('input[type="radio"]')?.name;
        if (!inputName) return;
        [5, 6].forEach(player => {
            if (group.querySelector(`input[value="${player}"]`)) return;
            const label = document.createElement('label');
            label.className = 'debug-radio-option';
            label.innerHTML = `<input type="radio" name="${inputName}" value="${player}"><span class="debug-radio-label" style="border-color:var(--player-${player}-color);color:var(--player-${player}-color)">${player}</span>`;
            group.appendChild(label);
        });
    });
}

function ensureSixPlayerPanels() {
    const desktop = document.querySelector('.players-info');
    const top = document.querySelector('.players-top');
    const bottom = document.querySelector('.players-bottom');
    const boardContainer = document.querySelector('.board-container');

    PLAYERS.forEach(player => ensurePlayerCard(desktop, player, false));
    [4, 1, 6].forEach(player => ensurePlayerCard(top, player, true));
    [3, 2, 5].forEach(player => ensurePlayerCard(bottom, player, true));

    if (desktop) {
        [...desktop.querySelectorAll('.player-info')].forEach(el => {
            const match = el.className.match(/player-(\d+)-info/);
            if (match) el.classList.add(`six-seat-${match[1]}`);
        });
        if (boardContainer && desktop.parentElement !== boardContainer) {
            boardContainer.appendChild(desktop);
        }
    }
    ensureProgressItems();
    ensureDebugPlayers();
}

function ringCellAngle(ring, index) {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    return Math.atan2(next.y - previous.y, next.x - previous.x) * 180 / Math.PI + 90;
}

function pointAlongLine(start, end, fraction) {
    return {
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction
    };
}

export function prepareBoardForCurrentMode() {
    const board = getCurrentBoardDefinition();
    if (board.id !== 'classic6') return board;

    document.body.classList.add('six-player-mode');
    ensureSixPlayerPanels();

    const svg = document.getElementById('board-svg');
    if (!svg || svg.dataset.boardId === 'classic6') return board;

    const visual = board.visual;
    const viewBoxRadius = visual.viewBoxRadius;
    svg.setAttribute('viewBox', `${-viewBoxRadius} ${-viewBoxRadius} ${viewBoxRadius * 2} ${viewBoxRadius * 2}`);

    const defs = svg.querySelector('defs');
    [...svg.children].forEach(child => { if (child !== defs) child.remove(); });
    svg.dataset.boardId = 'classic6';

    const layer = make('g', { id: 'classic6-board-layer' });
    svg.appendChild(layer);

    const ring = board.getRingPoints();
    ring.forEach((point, absoluteIndex) => {
        const color = board.getRingColorPlayer(absoluteIndex);
        const angle = ringCellAngle(ring, absoluteIndex);
        const cell = make('use', {
            href: '#vr2',
            class: `player-${color} six-ring-cell`,
            transform: `translate(${point.x} ${point.y}) rotate(${angle}) scale(${visual.ringCellScale})`,
            'data-ring-pos': absoluteIndex,
            'data-cpos': absoluteIndex
        });
        layer.appendChild(cell);
    });

    const baseTrack = board.createMainTrack();
    const baseSlots = board.getBaseSlotPositions();
    const baseCenter = {
        x: baseSlots.reduce((sum, point) => sum + point.x, 0) / baseSlots.length,
        y: baseSlots.reduce((sum, point) => sum + point.y, 0) / baseSlots.length
    };

    board.players.forEach(player => {
        const angle = board.playerAngles[player];
        const rotatedBaseCenter = rotate(baseCenter, angle);

        layer.appendChild(make('use', {
            href: '#start',
            id: `player${player}-start`,
            class: `player-${player}`,
            transform: `translate(${rotatedBaseCenter.x} ${rotatedBaseCenter.y}) rotate(${angle}) scale(${visual.baseScale})`
        }));

        const launch = rotate(baseTrack[0], angle);
        layer.appendChild(make('use', {
            href: '#vr2',
            class: `player-${player} six-launch-cell`,
            transform: `translate(${launch.x} ${launch.y}) rotate(${angle}) scale(${visual.laneCellScale})`,
            'data-cpos': 0,
            'data-player': player
        }));

        for (let pos = board.finishStart; pos <= board.finishEnd; pos++) {
            const point = rotate(baseTrack[pos], angle);
            layer.appendChild(make('use', {
                href: '#vr2',
                class: `player-${player} six-finish-cell`,
                transform: `translate(${point.x} ${point.y}) rotate(${angle}) scale(${visual.laneCellScale})`,
                'data-cpos': pos,
                'data-player': player
            }));
        }

        layer.appendChild(make('use', {
            href: '#end',
            class: `player-${player}`,
            transform: `rotate(${angle} 0 0) scale(${visual.endScale})`,
            'data-cpos': board.finishEnd
        }));

        const flightStart = rotate(baseTrack[board.flightPoint], angle);
        const flightEnd = rotate(baseTrack[board.flightTarget], angle);
        const arrowAngle = Math.atan2(flightEnd.y - flightStart.y, flightEnd.x - flightStart.x) * 180 / Math.PI;

        visual.flightArrowFractions.forEach((fraction, index) => {
            const marker = pointAlongLine(flightStart, flightEnd, fraction);
            layer.appendChild(make('use', {
                href: '#arrow',
                class: `player-${player} six-flight-arrow six-flight-arrow-${index + 1}`,
                transform: `translate(${marker.x} ${marker.y}) rotate(${arrowAngle}) translate(-7 -7)`
            }));
        });

        for (let index = 0; index < 4; index++) {
            layer.appendChild(make('use', {
                href: '#chess',
                class: `player-${player}`,
                'data-player': player,
                'data-chess': index
            }));
        }
    });

    return board;
}

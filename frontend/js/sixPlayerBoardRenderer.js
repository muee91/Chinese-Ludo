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
    let card = container.querySelector(`.player-${player}-info`);
    if (!card) {
        card = document.createElement('div');
        card.className = `player-info player-${player}-info`;
        card.innerHTML = `
            <div class="player-main">
                <div class="player-avatar player-${player}-avatar">
                    <div class="player-emoji" id="player-${player}-emoji${mobile ? '-mobile' : ''}"></div>
                </div>
                <div class="player-name">Player ${player}</div>
            </div>`;
        container.appendChild(card);
    }
    ensureDefeatCounters(card, player, mobile);
    return card;
}

function ensureProgressItems() {
    const content = document.querySelector('.progress-panel .progress-content');
    if (!content) return;
    PLAYERS.forEach(player => {
        if (content.querySelector(`.progress-item[data-player="${player}"]`)) return;
        const item = document.createElement('div');
        item.className = 'progress-item';
        item.dataset.player = String(player);
        item.innerHTML = `<div class="progress-bar"><div class="progress-fill player-${player}"></div></div>`;
        content.appendChild(item);
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

    PLAYERS.forEach(player => ensurePlayerCard(desktop, player, false));
    [4, 1, 6].forEach(player => ensurePlayerCard(top, player, true));
    [3, 2, 5].forEach(player => ensurePlayerCard(bottom, player, true));

    if (desktop) {
        [...desktop.querySelectorAll('.player-info')].forEach(el => {
            const match = el.className.match(/player-(\d+)-info/);
            if (match) el.classList.add(`six-seat-${match[1]}`);
        });
    }
    ensureProgressItems();
    ensureDebugPlayers();
}

function ringCellAngle(ring, index) {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    return Math.atan2(next.y - previous.y, next.x - previous.x) * 180 / Math.PI + 90;
}

export function prepareBoardForCurrentMode() {
    const board = getCurrentBoardDefinition();
    if (board.id !== 'classic6') return board;

    document.body.classList.add('six-player-mode');
    ensureSixPlayerPanels();

    const svg = document.getElementById('board-svg');
    if (!svg || svg.dataset.boardId === 'classic6') return board;
    svg.setAttribute('viewBox', '-115 -115 230 230');

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
            x: point.x,
            y: point.y,
            class: `player-${color} six-ring-cell`,
            transform: `rotate(${angle} ${point.x} ${point.y})`,
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
        // #start 自身以(0,0)为中心，使用 translate+rotate 避免 x/y 与 transform 双重旋转。
        layer.appendChild(make('use', {
            href: '#start',
            id: `player${player}-start`,
            class: `player-${player}`,
            transform: `translate(${rotatedBaseCenter.x} ${rotatedBaseCenter.y}) rotate(${angle})`
        }));

        // 独立起飞跑道：对应逻辑位置0，不参与公共环道碰撞。
        const launch = rotate(baseTrack[0], angle);
        layer.appendChild(make('use', {
            href: '#vr2', x: launch.x, y: launch.y,
            class: `player-${player} six-launch-cell`,
            transform: `rotate(${angle} ${launch.x} ${launch.y})`,
            'data-cpos': 0, 'data-player': player
        }));

        for (let pos = board.finishStart; pos <= board.finishEnd; pos++) {
            const point = rotate(baseTrack[pos], angle);
            layer.appendChild(make('use', {
                href: '#vr2', x: point.x, y: point.y,
                class: `player-${player} six-finish-cell`,
                transform: `rotate(${angle} ${point.x} ${point.y})`,
                'data-cpos': pos, 'data-player': player
            }));
        }

        // 六个终点三角继续使用原版 #end，围绕中心旋转。
        layer.appendChild(make('use', {
            href: '#end',
            class: `player-${player}`,
            transform: `rotate(${angle} 0 0) scale(.58)`
        }));

        const flightStart = rotate(baseTrack[board.flightPoint], angle);
        const flightEnd = rotate(baseTrack[board.flightTarget], angle);
        const arrowAngle = Math.atan2(flightEnd.y - flightStart.y, flightEnd.x - flightStart.x) * 180 / Math.PI;
        layer.appendChild(make('use', {
            href: '#arrow',
            x: flightStart.x - 5,
            y: flightStart.y - 5,
            class: `player-${player} six-flight-arrow`,
            transform: `rotate(${arrowAngle} ${flightStart.x} ${flightStart.y})`
        }));

        // 保留原版飞机棋子图元；setupChessElements 会把它们绑定到原 GameState。
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

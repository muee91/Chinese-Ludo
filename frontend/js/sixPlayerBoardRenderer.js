import { getCurrentBoardDefinition } from './boards/boardConfig.js';

const NS = 'http://www.w3.org/2000/svg';
const make = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
};
const rotate = (point, degrees) => {
    const r = degrees * Math.PI / 180;
    return { x: point.x * Math.cos(r) - point.y * Math.sin(r), y: point.x * Math.sin(r) + point.y * Math.cos(r) };
};

function ensurePlayerCard(container, player, mobile = false) {
    if (!container || container.querySelector('.player-' + player + '-info')) return;
    const card = document.createElement('div');
    card.className = 'player-info player-' + player + '-info';
    const defeats = [1,2,3,4,5,6].filter(p => p !== player).map(p =>
        '<div class="defeat-count player-' + p + '-defeat" id="defeat-count-' + (mobile ? 'mobile-' : '') + player + '-' + p + '">0</div>'
    ).join('');
    card.innerHTML = '<div class="player-main"><div class="player-avatar player-' + player + '-avatar"><div class="player-emoji" id="player-' + player + '-emoji' + (mobile ? '-mobile' : '') + '"></div></div><div class="player-name">Player ' + player + '</div></div><div class="defeat-counts' + (mobile ? ' defeat-counts-mobile' : '') + '">' + defeats + '</div>';
    container.appendChild(card);
}

function ensureSixPlayerPanels() {
    const desktop = document.querySelector('.players-info');
    const top = document.querySelector('.players-top');
    const bottom = document.querySelector('.players-bottom');
    ensurePlayerCard(desktop, 5, false);
    ensurePlayerCard(desktop, 6, false);
    ensurePlayerCard(top, 6, true);
    ensurePlayerCard(bottom, 5, true);
    if (desktop) {
        [...desktop.querySelectorAll('.player-info')].forEach((el) => {
            const m = el.className.match(/player-(\d+)-info/);
            if (m) el.classList.add('six-seat-' + m[1]);
        });
    }
}

export function prepareBoardForCurrentMode() {
    const board = getCurrentBoardDefinition();
    if (board.id !== 'classic6') return board;
    document.body.classList.add('six-player-mode');
    ensureSixPlayerPanels();
    const svg = document.getElementById('board-svg');
    if (!svg || svg.dataset.boardId === 'classic6') return board;
    const defs = svg.querySelector('defs');
    [...svg.children].forEach(child => { if (child !== defs) child.remove(); });
    svg.dataset.boardId = 'classic6';

    const ring = board.getRingPoints();
    const layer = make('g', { id: 'classic6-board-layer' });
    svg.appendChild(layer);
    ring.forEach((point, index) => {
        const color = (index % 6) + 1;
        const cell = make('use', { href: '#vr2', x: point.x, y: point.y, class: 'player-' + color + ' six-ring-cell', 'data-ring-pos': index });
        layer.appendChild(cell);
    });

    const baseTrack = board.createMainTrack();
    board.players.forEach(player => {
        const angle = board.playerAngles[player] - board.playerAngles[1];
        const launch = rotate(baseTrack[0], angle);
        const baseCenter = rotate({ x: 0, y: -91 }, angle);
        layer.appendChild(make('use', { href: '#start', x: baseCenter.x, y: baseCenter.y, class: 'player-' + player, transform: 'rotate(' + angle + ' ' + baseCenter.x + ' ' + baseCenter.y + ') scale(.72)' }));
        for (let pos = board.finishStart; pos <= board.finishEnd; pos++) {
            const p = rotate(baseTrack[pos], angle);
            layer.appendChild(make('use', { href: '#vr2', x: p.x, y: p.y, class: 'player-' + player + ' six-finish-cell', 'data-cpos': pos }));
        }
        const endPos = rotate({ x: 0, y: -5 }, angle);
        layer.appendChild(make('use', { href: '#end', x: endPos.x, y: endPos.y, class: 'player-' + player, transform: 'rotate(' + (angle + 180) + ' ' + endPos.x + ' ' + endPos.y + ') scale(.65)' }));

        // 飞行箭头：仍使用原版 arrow 图元；位置由规则中的飞行格决定。
        const fp = rotate(baseTrack[board.flightPoint], angle);
        layer.appendChild(make('use', { href: '#arrow', x: fp.x - 5, y: fp.y - 5, class: 'player-' + player + ' six-flight-arrow', transform: 'rotate(' + angle + ' ' + fp.x + ' ' + fp.y + ')' }));

        for (let i = 0; i < 4; i++) {
            const piece = make('use', { href: '#chess', class: 'player-' + player, 'data-player': player, 'data-chess': i });
            layer.appendChild(piece);
        }
    });
    return board;
}

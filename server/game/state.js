const {
    MAP_TOWN,
    PLAYER_MAX_HP,
    PLAYER_MAX_AMMO,
    PLAYER_RADIUS,
    TAME_HP_RATIO,
    TAME_RANGE,
    ENEMY_TYPES
} = require("./constants");
const { clamp, random } = require("./helpers");
const {
    getMapBounds,
    getReloadAreas,
    getBeastAreas,
    getMapsWithBeastAreas,
    pickRandomPointInAreas,
    getReloadSpawn,
    getFallbackSpawn
} = require("./maps");

function createState() {
    return {
        players: {},
        arrows: [],
        bossShots: [],
        beasts: [],
        bosses: [],
        nextArrowId: 1,
        nextBeastId: 1,
        nextBossShotId: 1
    };
}

function allocateSlot(state) {
    const used = new Set(Object.values(state.players).map((p) => p.slot));
    const zones = getReloadAreas(MAP_TOWN);
    const total = Math.max(1, zones.length);
    for (let i = 0; i < total; i++) {
        if (!used.has(i)) return i;
    }
    return Object.keys(state.players).length % total;
}

function isInAnySafe(map, x, y) {
    if (!map) return false;
    const zones = getReloadAreas(map);
    if (!zones.length) return false;
    return zones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

function spawnBeasts(state) {
    state.beasts = [];
    const maps = getMapsWithBeastAreas();
    if (!maps.length) return;
    const total = Math.round(12 * 1.5);
    const base = Math.floor(total / maps.length);
    const extra = total % maps.length;
    const keys = ["wolf", "tiger", "spider"];
    let index = 0;
    maps.forEach((meta, idx) => {
        const count = base + (idx < extra ? 1 : 0);
        const bounds = getMapBounds(meta.name);
        for (let i = 0; i < count; i++) {
            const key = keys[index % keys.length];
            const type = ENEMY_TYPES[key];
            const pos = pickRandomPointInAreas(meta.beastAreas, bounds);
            state.beasts.push({
                id: `b${state.nextBeastId++}`,
                key,
                map: meta.name,
                x: pos.x,
                y: pos.y,
                vx: random(-1, 1) * type.speed,
                vy: random(-1, 1) * type.speed,
                hp: type.hp,
                maxHp: type.hp,
                tamedBy: null,
                slowTimer: 0,
                stunTimer: 0
            });
            index += 1;
        }
    });
}

function spawnBosses(state) {
    const { getMapBounds } = require("./maps");
    const interiorMaps = ["interior_door_a", "interior_door_b"];
    state.bosses = interiorMaps.map((mapName, idx) => {
        const bounds = getMapBounds(mapName);
        const cx = bounds.width / 2;
        const cy = bounds.height / 2;
        return {
            id: `boss${idx + 1}`,
            map: mapName,
            x: cx,
            y: cy,
            cx,
            cy,
            hp: 1200,
            maxHp: 1200,
            fireCooldown: 0.8,
            spin: 0
        };
    });
}

function getBossInMap(state, mapName) {
    return state.bosses.find((b) => b.map === mapName);
}

function respawnBeast(beast) {
    const type = ENEMY_TYPES[beast.key];
    const bounds = getMapBounds(beast.map);
    const areas = getBeastAreas(beast.map);
    const pos = pickRandomPointInAreas(areas, bounds);
    beast.x = pos.x;
    beast.y = pos.y;
    beast.vx = random(-1, 1) * type.speed;
    beast.vy = random(-1, 1) * type.speed;
    beast.hp = type.hp;
    beast.maxHp = type.hp;
    beast.tamedBy = null;
    beast.slowTimer = 0;
    beast.stunTimer = 0;
}

function releasePlayerTames(state, playerId) {
    for (const b of state.beasts) {
        if (b.tamedBy === playerId) {
            b.tamedBy = null;
        }
    }
}

function getNearestPlayerInMap(state, map, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const p of Object.values(state.players)) {
        if (p.map !== map || p.hp <= 0 || p.dead) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
            best = p;
            bestD = d;
        }
    }
    return { player: best, dist: bestD };
}

function killPlayer(state, player, options = {}) {
    player.hp = 0;
    player.dead = true;
    if (options && options.respawnMap) {
        player.map = options.respawnMap;
    }
    releasePlayerTames(state, player.sessionId);
}

function respawnPlayer(state, player) {
    const mapName = player.map || MAP_TOWN;
    const reloadSpawn = getReloadSpawn(mapName, player.slot);
    const fallback = getFallbackSpawn(mapName);
    const spawn = reloadSpawn || fallback || { x: 352, y: 1216 };
    player.x = spawn.x;
    player.y = spawn.y;
    player.map = mapName;
    player.hp = PLAYER_MAX_HP;
    player.ammo = PLAYER_MAX_AMMO;
    player.dir = "front";
    player.dead = false;
    releasePlayerTames(state, player.sessionId);
}

function tryTame(state, player) {
    const ownedTypes = new Set();
    for (const b of state.beasts) {
        if (b.tamedBy === player.sessionId) ownedTypes.add(b.key);
    }

    let best = null;
    let bestD = Infinity;
    for (const b of state.beasts) {
        if (b.tamedBy !== null) continue;
        if (ownedTypes.has(b.key)) continue;
        if (b.hp / b.maxHp > TAME_HP_RATIO) continue;
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if (d > TAME_RANGE || d >= bestD) continue;
        best = b;
        bestD = d;
    }

    if (best) {
        best.tamedBy = player.sessionId;
        best.hp = best.maxHp;
    }
}

function clampBeastPosition(beast) {
    const bounds = getMapBounds(beast.map);
    beast.x = clamp(beast.x, 24, bounds.width - 24);
    beast.y = clamp(beast.y, 24, bounds.height - 24);
}

function clampArrowPosition(arrow) {
    const bounds = getMapBounds(arrow.map);
    return arrow.x < -20 || arrow.x > bounds.width + 20 || arrow.y < -20 || arrow.y > bounds.height + 20;
}

module.exports = {
    createState,
    allocateSlot,
    isInAnySafe,
    spawnBeasts,
    spawnBosses,
    respawnBeast,
    releasePlayerTames,
    getNearestPlayerInMap,
    getBossInMap,
    killPlayer,
    respawnPlayer,
    tryTame,
    clampBeastPosition,
    clampArrowPosition
};

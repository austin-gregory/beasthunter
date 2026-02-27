const {
    MAP_TOWN,
    PLAYER_MAX_HP,
    PLAYER_MAX_AMMO,
    TAME_HP_RATIO,
    TAME_RANGE,
    ARROW_MIN_SPEED,
    ARROW_MAX_SPEED,
    ARROW_MIN_DMG,
    ARROW_MAX_DMG,
    ARROW_LIFE
} = require("../constants");
const { lerp, random, clamp } = require("../helpers");
const { getReloadAreas, getMapBounds, getMapsWithBeastAreas, getReloadSpawn, getFallbackSpawn } = require("../maps");
const { isInAnySafe, respawnPlayer, tryTame, releasePlayerTames } = require("../state");

// ─── tunables ────────────────────────────────────────────────────────────────
const BOT_NAMES  = ["Aria", "Koda", "Fenwick", "Zephyr", "Morrigan"];
const BOT_MODELS = ["knight", "ninja", "red", "femaletrainer", "professor"];
const BOT_COUNT  = 3;
const BOT_SPEED  = 90;          // px / s
const SHOOT_RANGE = 300;
const CHASE_RANGE = 180;
const TAME_SEEK_RANGE = 200;
const BOT_SHOOT_COOLDOWN = 0.9;
const BOT_RESPAWN_DELAY  = 4.0;
const BOT_WANDER_SPEED_MULT = 0.55;
const HEAL_HP_THRESHOLD  = 35;

// ─── helpers ─────────────────────────────────────────────────────────────────
function _dirFromVec(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx < 0 ? "left" : "right";
    }
    return dy < 0 ? "back" : "front";
}

function _moveToward(bot, tx, ty, speed, dt) {
    const dx = tx - bot.x;
    const dy = ty - bot.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    const step = Math.min(speed * dt, d);
    bot.x += (dx / d) * step;
    bot.y += (dy / d) * step;
    bot.dir = _dirFromVec(dx, dy);
}

function _clampToMap(bot) {
    const bounds = getMapBounds(bot.map);
    bot.x = clamp(bot.x, 24, bounds.width - 24);
    bot.y = clamp(bot.y, 24, bounds.height - 24);
}

function _pickWanderTarget(bot) {
    const bounds = getMapBounds(bot.map);
    bot._wanderTargetX = random(80, bounds.width - 80);
    bot._wanderTargetY = random(80, bounds.height - 80);
    bot._wanderTimer   = random(2, 4);
}

// ─── target finders ──────────────────────────────────────────────────────────
function _findShootTarget(bot, state) {
    let best = null;
    let bestD = Infinity;

    // prefer real players
    for (const p of Object.values(state.players)) {
        if (p.sessionId === bot.sessionId) continue;
        if (p.isBot) continue;
        if (p.dead || p.hp <= 0) continue;
        if (p.map !== bot.map) continue;
        if (isInAnySafe(p.map, p.x, p.y)) continue;
        const d = Math.hypot(p.x - bot.x, p.y - bot.y);
        if (d < SHOOT_RANGE && d < bestD) { best = p; bestD = d; }
    }
    if (best) return { target: best, dist: bestD };

    // fall back to untamed beasts
    for (const b of state.beasts) {
        if (b.tamedBy) continue;
        if (b.map !== bot.map) continue;
        const d = Math.hypot(b.x - bot.x, b.y - bot.y);
        if (d < SHOOT_RANGE && d < bestD) { best = b; bestD = d; }
    }
    return best ? { target: best, dist: bestD } : null;
}

function _findTameTarget(bot, state) {
    const ownedTypes = new Set(
        state.beasts.filter((b) => b.tamedBy === bot.sessionId).map((b) => b.key)
    );

    let best = null;
    let bestD = Infinity;
    for (const b of state.beasts) {
        if (b.tamedBy !== null) continue;
        if (b.map !== bot.map) continue;
        if (ownedTypes.has(b.key)) continue;
        if (b.hp / b.maxHp > TAME_HP_RATIO) continue;
        const d = Math.hypot(b.x - bot.x, b.y - bot.y);
        if (d < TAME_SEEK_RANGE && d < bestD) { best = b; bestD = d; }
    }
    return best ? { beast: best, dist: bestD } : null;
}

// ─── firing ──────────────────────────────────────────────────────────────────
function _botFireArrow(bot, state, charge, targetX, targetY) {
    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const speed = lerp(ARROW_MIN_SPEED, ARROW_MAX_SPEED, charge);
    const dmg   = Math.round(lerp(ARROW_MIN_DMG, ARROW_MAX_DMG, charge));

    bot.ammo -= 1;
    state.arrows.push({
        id: `a${state.nextArrowId++}`,
        owner: bot.sessionId,
        map: bot.map,
        x: bot.x + nx * 34,
        y: bot.y + ny * 34,
        vx: nx * speed,
        vy: ny * speed,
        dmg,
        life: ARROW_LIFE
    });
    bot.dir = _dirFromVec(nx, ny);
}

// ─── map-change ───────────────────────────────────────────────────────────────
function _maybeChangeMap(bot) {
    if (bot._mapChangeTimer > 0) return;
    const options = getMapsWithBeastAreas();
    if (!options.length) return;
    const pick = options[Math.floor(random(0, options.length))];
    bot.map = pick.name;
    const bounds = getMapBounds(pick.name);
    bot.x = random(80, bounds.width - 80);
    bot.y = random(80, bounds.height - 80);
    bot._mapChangeTimer = 30 + random(0, 30);
    bot._state = "WANDER";
    _pickWanderTarget(bot);
}

// ─── state handlers ───────────────────────────────────────────────────────────
function _stateWander(bot, state, dt) {
    bot._wanderTimer -= dt;

    // check for shoot target
    const shootResult = _findShootTarget(bot, state);
    if (shootResult) {
        const { target, dist } = shootResult;
        bot._targetId = target.id || target.sessionId;
        bot._state = dist <= CHASE_RANGE ? "SHOOT" : "CHASE_TARGET";
        return;
    }

    // check for tameable beast
    const tameResult = _findTameTarget(bot, state);
    if (tameResult) {
        bot._targetId = tameResult.beast.id;
        bot._state = "CHASE_BEAST";
        return;
    }

    if (bot._wanderTimer <= 0) {
        _pickWanderTarget(bot);
    }

    _moveToward(bot, bot._wanderTargetX, bot._wanderTargetY, BOT_SPEED * BOT_WANDER_SPEED_MULT, dt);
    _clampToMap(bot);

    bot._mapChangeTimer -= dt;
    if (bot._mapChangeTimer <= 0) {
        _maybeChangeMap(bot);
    }
}

function _stateHeal(bot, state, dt) {
    if (bot.hp >= PLAYER_MAX_HP && bot.ammo >= PLAYER_MAX_AMMO) {
        bot._state = "WANDER";
        _pickWanderTarget(bot);
        return;
    }

    const zones = getReloadAreas(bot.map);
    if (!zones.length) {
        // no safe zone on this map — wander back to town
        bot.map = MAP_TOWN;
        bot._state = "WANDER";
        _pickWanderTarget(bot);
        return;
    }

    const zone = zones[0];
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h / 2;
    _moveToward(bot, cx, cy, BOT_SPEED, dt);
    _clampToMap(bot);
}

function _stateChaseTarget(bot, state, dt) {
    // resolve target — could be a player or beast
    const target =
        state.players[bot._targetId] ||
        state.beasts.find((b) => b.id === bot._targetId);

    if (!target || target.dead || target.hp <= 0 || target.map !== bot.map) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }
    if (target.sessionId && isInAnySafe(target.map, target.x, target.y)) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }

    const d = Math.hypot(target.x - bot.x, target.y - bot.y);
    if (d <= CHASE_RANGE) {
        bot._state = "SHOOT";
        return;
    }

    _moveToward(bot, target.x, target.y, BOT_SPEED, dt);
    _clampToMap(bot);
}

function _stateShoot(bot, state, dt) {
    const target =
        state.players[bot._targetId] ||
        state.beasts.find((b) => b.id === bot._targetId);

    if (!target || target.dead || target.hp <= 0 || target.map !== bot.map) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }
    if (target.sessionId && isInAnySafe(target.map, target.x, target.y)) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }

    const d = Math.hypot(target.x - bot.x, target.y - bot.y);
    if (d > SHOOT_RANGE) {
        bot._state = "CHASE_TARGET";
        return;
    }

    if (bot.ammo <= 0) {
        bot._state = "HEAL";
        return;
    }

    bot.dir = _dirFromVec(target.x - bot.x, target.y - bot.y);

    bot._shootCooldown -= dt;
    if (bot._shootCooldown <= 0) {
        const charge = random(0.3, 0.7);
        _botFireArrow(bot, state, charge, target.x, target.y);
        bot._shootCooldown = BOT_SHOOT_COOLDOWN + random(0, 0.3);
    }
}

function _stateChaseBeast(bot, state, dt) {
    const beast = state.beasts.find((b) => b.id === bot._targetId);

    if (!beast || beast.tamedBy || beast.map !== bot.map || beast.hp / beast.maxHp > TAME_HP_RATIO) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }

    const d = Math.hypot(beast.x - bot.x, beast.y - bot.y);
    if (d <= TAME_RANGE) {
        bot._state = "TAME";
        return;
    }

    _moveToward(bot, beast.x, beast.y, BOT_SPEED, dt);
    _clampToMap(bot);
}

function _stateTame(bot, state, dt) {
    const beast = state.beasts.find((b) => b.id === bot._targetId);

    if (!beast || beast.map !== bot.map || beast.hp / beast.maxHp > TAME_HP_RATIO) {
        // lost or already tamed by someone else
        if (beast && beast.tamedBy === bot.sessionId) {
            bot._state = "WANDER";
        } else {
            bot._state = "WANDER";
        }
        bot._targetId = null;
        return;
    }

    if (beast.tamedBy === bot.sessionId) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }

    bot._tameCooldown -= dt;
    if (bot._tameCooldown <= 0) {
        tryTame(state, bot);
        bot._tameCooldown = 0.5;
    }
}

// ─── per-bot tick ─────────────────────────────────────────────────────────────
function tickBot(bot, state, dt) {
    // respawn countdown
    if (bot.dead) {
        bot._respawnTimer += dt;
        if (bot._respawnTimer >= BOT_RESPAWN_DELAY) {
            bot.map = MAP_TOWN;
            respawnPlayer(state, bot);
            bot._state = "WANDER";
            bot._targetId = null;
            bot._respawnTimer = 0;
            _pickWanderTarget(bot);
        }
        return;
    }

    // HEAL override
    if (bot.hp < HEAL_HP_THRESHOLD || bot.ammo === 0) {
        if (bot._state !== "HEAL") bot._state = "HEAL";
    }

    switch (bot._state) {
        case "WANDER":       _stateWander(bot, state, dt);      break;
        case "HEAL":         _stateHeal(bot, state, dt);         break;
        case "CHASE_TARGET": _stateChaseTarget(bot, state, dt);  break;
        case "SHOOT":        _stateShoot(bot, state, dt);        break;
        case "CHASE_BEAST":  _stateChaseBeast(bot, state, dt);   break;
        case "TAME":         _stateTame(bot, state, dt);         break;
        default:
            bot._state = "WANDER";
    }
}

// ─── public API ───────────────────────────────────────────────────────────────
function createBotEntry(index, state) {
    const { allocateSlot } = require("../state");
    const slot = allocateSlot(state);
    const sp =
        getReloadSpawn(MAP_TOWN, slot) ||
        getFallbackSpawn(MAP_TOWN) ||
        { x: 352, y: 1216 };

    const bot = {
        sessionId: `bot_${index}`,
        name:  BOT_NAMES[index % BOT_NAMES.length],
        model: BOT_MODELS[index % BOT_MODELS.length],
        bow:   0,
        slot,
        map:   MAP_TOWN,
        x:     sp.x,
        y:     sp.y,
        hp:    PLAYER_MAX_HP,
        ammo:  PLAYER_MAX_AMMO,
        score: 0,
        dir:   "front",
        dead:  false,
        isBot: true,
        // AI-private fields (not serialised by net.js)
        _state:          "WANDER",
        _targetId:       null,
        _shootCooldown:  index * 0.5,
        _tameCooldown:   0,
        _wanderTimer:    0,
        _wanderTargetX:  sp.x,
        _wanderTargetY:  sp.y,
        _respawnTimer:   0,
        _mapChangeTimer: 10 + index * 15
    };

    _pickWanderTarget(bot);
    return bot;
}

function updateBots(state, dt) {
    for (const p of Object.values(state.players)) {
        if (p.isBot) tickBot(p, state, dt);
    }
}

module.exports = { createBotEntry, updateBots };

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
const { getMapBounds, getMapsWithBeastAreas, getTeamAreas, getTeamSpawn, getReloadAreas, isInTeamArea } = require("../maps");
const { isInAnySafe, isInTeamSafe, respawnPlayer, tryTame, releasePlayerTames } = require("../state");

// ─── tunables ────────────────────────────────────────────────────────────────
const BOT_NAMES  = ["Aria", "Koda", "Fenwick", "Zephyr", "Morrigan"];
const BOT_MODELS = ["knight", "ninja", "red", "femaletrainer", "professor"];
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

    for (const p of Object.values(state.players)) {
        if (p.sessionId === bot.sessionId) continue;
        if (p.team === bot.team) continue;        // no friendly fire
        if (p.dead || p.hp <= 0) continue;
        if (p.map !== bot.map) continue;
        if (isInTeamSafe(p.map, p.x, p.y, p.team)) continue;
        const d = Math.hypot(p.x - bot.x, p.y - bot.y);
        if (d < SHOOT_RANGE && d < bestD) { best = p; bestD = d; }
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
        team: bot.team,
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

    // check if holding beasts — go cash in (only if not already at reload zone)
    const myBeasts = state.beasts.filter(b => b.tamedBy === bot.sessionId);
    if (myBeasts.length && !isInAnySafe(bot.map, bot.x, bot.y)) {
        bot._state = "CASH_IN";
        return;
    }

    if (bot._wanderTimer <= 0) {
        _pickWanderTarget(bot);
    }

    _moveToward(bot, bot._wanderTargetX, bot._wanderTargetY, BOT_SPEED * BOT_WANDER_SPEED_MULT, dt);
    _clampToMap(bot);
}

function _stateHeal(bot, state, dt) {
    if (bot.hp >= PLAYER_MAX_HP && bot.ammo >= PLAYER_MAX_AMMO) {
        bot._state = "WANDER";
        _pickWanderTarget(bot);
        return;
    }

    const areas = getTeamAreas(MAP_TOWN, bot.team);
    if (!areas.length) {
        bot.map = MAP_TOWN;
        bot._state = "WANDER";
        _pickWanderTarget(bot);
        return;
    }

    const zone = areas[0];
    bot.map = MAP_TOWN;
    _moveToward(bot, zone.x + zone.w / 2, zone.y + zone.h / 2, BOT_SPEED, dt);
    _clampToMap(bot);
}

function _stateChaseTarget(bot, state, dt) {
    const target =
        state.players[bot._targetId] ||
        state.beasts.find((b) => b.id === bot._targetId);

    if (!target || target.dead || target.hp <= 0 || target.map !== bot.map) {
        bot._state = "WANDER";
        bot._targetId = null;
        return;
    }
    if (target.sessionId && isInTeamSafe(target.map, target.x, target.y, target.team)) {
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
    if (target.sessionId && isInTeamSafe(target.map, target.x, target.y, target.team)) {
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

function _stateCashIn(bot, state, dt) {
    const myBeasts = state.beasts.filter(b => b.tamedBy === bot.sessionId);
    if (!myBeasts.length) { bot._state = "WANDER"; return; }

    // Find the reload area that sits inside this bot's team area
    const reloadAreas = getReloadAreas(MAP_TOWN);
    const zone = reloadAreas.find(r =>
        isInTeamArea(MAP_TOWN, r.x + r.w / 2, r.y + r.h / 2, bot.team)
    );
    if (!zone) { bot._state = "WANDER"; return; }

    bot.map = MAP_TOWN;
    _moveToward(bot, zone.x + zone.w / 2, zone.y + zone.h / 2, BOT_SPEED, dt);
    _clampToMap(bot);
    // tryCashIn() in the game loop handles actual point award when bot reaches the reload zone
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
        case "CASH_IN":      _stateCashIn(bot, state, dt);       break;
        default:
            bot._state = "WANDER";
    }
}

// ─── public API ───────────────────────────────────────────────────────────────
function createBotEntry(index, state, team) {
    const sp = getTeamSpawn(team) || { x: 352, y: 1216 };

    const bot = {
        sessionId: `bot_${index}`,
        name:  BOT_NAMES[index % BOT_NAMES.length],
        model: BOT_MODELS[index % BOT_MODELS.length],
        bow:   0,
        slot:  index,
        map:   MAP_TOWN,
        x:     sp.x,
        y:     sp.y,
        hp:    PLAYER_MAX_HP,
        ammo:  PLAYER_MAX_AMMO,
        score: 0,
        team,
        wolfHp: 0,
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

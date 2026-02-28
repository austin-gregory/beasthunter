const {
    ARROW_RADIUS, PLAYER_RADIUS, ENEMY_TYPES, MAP_TOWN,
    WOLF_COMPANION_OFFSET, WOLF_COMPANION_RADIUS, SCORE_KILL
} = require("../constants");
const { vecFromDir } = require("../helpers");
const { isInAnySafe, isInTeamSafe, respawnBeast, clampArrowPosition, killPlayer } = require("../state");

function _getWolfPos(player) {
    const d = vecFromDir(player.dir || "front");
    return { x: player.x - d.x * WOLF_COMPANION_OFFSET, y: player.y - d.y * WOLF_COMPANION_OFFSET };
}

function simulateArrows(state, dt) {
    const survivors = [];

    for (const a of state.arrows) {
        a.life -= dt;
        if (a.life <= 0) continue;

        a.x += a.vx * dt;
        a.y += a.vy * dt;
        if (clampArrowPosition(a)) continue;

        let hit = false;

        for (const b of state.beasts) {
            if (b.map !== a.map) continue;
            const type = ENEMY_TYPES[b.key];
            if (b.tamedBy === a.owner) continue;
            if (isInAnySafe(a.map, b.x, b.y)) continue;
            if (Math.hypot(b.x - a.x, b.y - a.y) > type.size + ARROW_RADIUS) continue;

            b.hp -= a.dmg;
            b.slowTimer = Math.max(b.slowTimer || 0, 1.2);
            b.stunTimer = Math.max(b.stunTimer || 0, 1.0);
            if (b.hp <= 0) {
                if (a.team === 1) state.team1Score += SCORE_KILL;
                else if (a.team === 2) state.team2Score += SCORE_KILL;
                respawnBeast(b);
            }
            hit = true;
            break;
        }
        if (hit) continue;

        // PvP: arrows can hit enemy players outside their team area.
        for (const p of Object.values(state.players)) {
            if (!p || p.sessionId === a.owner) continue;
            if (p.team && a.team && p.team === a.team) continue;   // no friendly fire
            if (p.map !== a.map || p.hp <= 0 || p.dead) continue;
            if (isInTeamSafe(p.map, p.x, p.y, p.team)) continue;

            // Check wolf hitbox first
            if (p.wolfHp > 0) {
                const wp = _getWolfPos(p);
                if (Math.hypot(wp.x - a.x, wp.y - a.y) <= WOLF_COMPANION_RADIUS + ARROW_RADIUS) {
                    p.wolfHp = Math.max(0, p.wolfHp - a.dmg);
                    hit = true; break;
                }
            }

            if (Math.hypot(p.x - a.x, p.y - a.y) > PLAYER_RADIUS + ARROW_RADIUS) continue;

            p.hp -= a.dmg;
            if (p.hp <= 0) {
                killPlayer(state, p, { respawnMap: MAP_TOWN });
                if (a.team === 1) state.team1Score += SCORE_KILL;
                else if (a.team === 2) state.team2Score += SCORE_KILL;
            }
            hit = true; break;
        }

        if (!hit) survivors.push(a);
    }

    state.arrows = survivors;
}

module.exports = { simulateArrows };

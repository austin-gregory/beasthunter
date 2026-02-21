const { ARROW_RADIUS, PLAYER_RADIUS, ENEMY_TYPES } = require("../constants");
const { isInAnySafe, respawnBeast, clampArrowPosition, killPlayer } = require("../state");

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

            const shooter = state.players[a.owner];
            b.hp -= a.dmg;
            b.slowTimer = Math.max(b.slowTimer || 0, 1.2);
            b.stunTimer = Math.max(b.stunTimer || 0, 1.0);
            if (b.hp <= 0) {
                if (shooter) shooter.score += type.score;
                respawnBeast(b);
            }
            hit = true;
            break;
        }
        if (hit) continue;

        // Boss: arrows can damage but cannot finish the kill.
        for (const boss of state.bosses) {
            if (boss.map !== a.map || boss.hp <= 0) continue;
            const dx = boss.x - a.x;
            const dy = boss.y - a.y;
            const d = Math.hypot(dx, dy);
            if (d > 42) continue;
            boss.hp = Math.max(1, boss.hp - a.dmg);
            hit = true;
            break;
        }
        if (hit) continue;

        // PvP: arrows can hit other players outside safe zones.
        for (const p of Object.values(state.players)) {
            if (!p || p.sessionId === a.owner) continue;
            if (p.map !== a.map || p.hp <= 0 || p.dead) continue;
            if (isInAnySafe(p.map, p.x, p.y)) continue;
            if (Math.hypot(p.x - a.x, p.y - a.y) > PLAYER_RADIUS + ARROW_RADIUS) continue;

            p.hp -= a.dmg;
            if (p.hp <= 0) {
                killPlayer(state, p);
            }
            hit = true;
            break;
        }

        if (!hit) survivors.push(a);
    }

    state.arrows = survivors;
}

module.exports = { simulateArrows };

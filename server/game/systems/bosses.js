const { PLAYER_RADIUS, BOSS_FIREBALL_SPEED, BOSS_FIREBALL_DMG, BOSS_FIREBALL_LIFE } = require("../constants");
const { clamp } = require("../helpers");
const { respawnBeast } = require("../state");
const { getMapBounds } = require("../maps");

function updateBosses(state, dt) {
    for (const boss of state.bosses) {
        if (!boss || boss.hp <= 0) continue;

        boss.x = boss.cx || boss.x;
        boss.y = boss.cy || boss.y;
        boss.spin = (boss.spin || 0) + dt * 1.4;

        // Target players only.
        let target = null;
        let bestD = Infinity;

        for (const p of Object.values(state.players)) {
            if (!p || p.dead || p.hp <= 0) continue;
            if (p.map !== boss.map) continue;
            const d = Math.hypot(p.x - boss.x, p.y - boss.y);
            if (d < bestD) {
                bestD = d;
                target = p;
            }
        }

        if (target) {
            const dx = target.x - boss.x;
            const dy = target.y - boss.y;
            const d = Math.max(1, Math.hypot(dx, dy));

            boss.fireCooldown = (boss.fireCooldown || 0) - dt;
            if (boss.fireCooldown <= 0) {
                boss.fireCooldown = 1.4;
                state.bossShots.push({
                    id: `bf${state.nextBossShotId++}`,
                    owner: boss.id,
                    map: boss.map,
                    x: boss.x,
                    y: boss.y,
                    vx: (dx / d) * BOSS_FIREBALL_SPEED,
                    vy: (dy / d) * BOSS_FIREBALL_SPEED,
                    dmg: BOSS_FIREBALL_DMG,
                    life: BOSS_FIREBALL_LIFE
                });
            }
        } else {
            boss.fireCooldown = Math.max(0, (boss.fireCooldown || 0) - dt);
        }

        const bounds = getMapBounds(boss.map);
        boss.x = clamp(boss.x, 32, bounds.width - 32);
        boss.y = clamp(boss.y, 32, bounds.height - 32);
    }
}

module.exports = { updateBosses };

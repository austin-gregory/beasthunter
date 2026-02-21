const {
    PLAYER_RADIUS,
    BEAST_MELEE_RANGE_BONUS,
    TAME_HP_RATIO,
    FOLLOW_BACK_BASE,
    FOLLOW_BACK_ROW,
    FOLLOW_SIDE_GAP,
    FOLLOW_OWNER_MIN_GAP,
    ENEMY_TYPES
} = require("../constants");
const { clamp, lerp, random, vecFromDir } = require("../helpers");
const { getMapBounds } = require("../maps");
const { isInAnySafe, getNearestPlayerInMap, getBossInMap, killPlayer, clampBeastPosition } = require("../state");

function updateBeasts(state, dt) {
    for (const b of state.beasts) {
        const type = ENEMY_TYPES[b.key];
        b.slowTimer = Math.max(0, (b.slowTimer || 0) - dt);
        b.stunTimer = Math.max(0, (b.stunTimer || 0) - dt);
        const slowMult = b.slowTimer > 0 ? 0.45 : 1;
        if (b.stunTimer > 0) {
            b.vx = 0;
            b.vy = 0;
            continue;
        }

        if (b.tamedBy) {
            const owner = state.players[b.tamedBy];
            if (!owner || owner.dead) {
                b.tamedBy = null;
            } else {
                const ownerDir = vecFromDir(owner.dir || "front");
                if (b.map !== owner.map) {
                    b.map = owner.map;
                    b.x = owner.x - ownerDir.x * 38;
                    b.y = owner.y - ownerDir.y * 38;
                    b.vx = 0;
                    b.vy = 0;
                }
                const boss = getBossInMap(state, b.map);
                if (boss) {
                    const dx = boss.x - b.x;
                    const dy = boss.y - b.y;
                    const d = Math.max(1, Math.hypot(dx, dy));
                    const followSpeed = type.speed * 2.2 * slowMult;
                    b.vx = (dx / d) * followSpeed;
                    b.vy = (dy / d) * followSpeed;
                    if (d < type.size + 28) {
                        boss.hp -= 40 * dt;
                        boss.lastHitByTame = true;
                    }
                    // Skip formation when boss exists.
                    continue;
                }
                const siblings = state.beasts
                    .filter((x) => x.tamedBy === owner.sessionId)
                    .sort((a, c) => a.id.localeCompare(c.id));
                const slot = Math.max(0, siblings.findIndex((x) => x.id === b.id));
                // Train formation: keep a steady position behind the player.
                const lane = 0;
                const row = slot;
                const sideOffset = lane * FOLLOW_SIDE_GAP;
                const backOffset = FOLLOW_BACK_BASE + row * FOLLOW_BACK_ROW * 1.15;

                const tx = owner.x - ownerDir.x * backOffset - ownerDir.y * sideOffset;
                const ty = owner.y - ownerDir.y * backOffset + ownerDir.x * sideOffset;

                const dx = tx - b.x;
                const dy = ty - b.y;
                const d = Math.max(1, Math.hypot(dx, dy));
                const near = clamp(d / 80, 0.35, 1);
                const rubber = d > 120 ? clamp(1 + (d - 120) / 140, 1, 2.6) : 1;
                const followSpeed = type.speed * 2.6 * near * slowMult * rubber;
                b.vx = lerp(b.vx, (dx / d) * followSpeed, 0.6);
                b.vy = lerp(b.vy, (dy / d) * followSpeed, 0.6);

                if (d < 12) {
                    b.vx *= 0.5;
                    b.vy *= 0.5;
                }

                // Hard catch-up only if they are extremely far (stuck on geometry).
                if (d > 520) {
                    b.x = tx;
                    b.y = ty;
                    b.vx = 0;
                    b.vy = 0;
                }
            }
        } else {
            const { player: target, dist: targetDist } = getNearestPlayerInMap(state, b.map, b.x, b.y);
            if (target && targetDist < 220 && !isInAnySafe(target.map, target.x, target.y)) {
                const n = Number(String(b.id).replace(/\D+/g, "")) || 0;
                const orbitA = ((n % 12) / 12) * Math.PI * 2;
                const desiredDist = type.size + PLAYER_RADIUS + 24;
                const tx = target.x + Math.cos(orbitA) * desiredDist;
                const ty = target.y + Math.sin(orbitA) * desiredDist;
                const dx = tx - b.x;
                const dy = ty - b.y;
                const d = Math.max(1, Math.hypot(dx, dy));
                const weakBoost = b.hp / b.maxHp <= TAME_HP_RATIO ? 1.2 : 1.0;
                b.vx = (dx / d) * type.speed * weakBoost * slowMult * 0.82;
                b.vy = (dy / d) * type.speed * weakBoost * slowMult * 0.82;
            } else {
                b.vx += random(-20, 20) * dt;
                b.vy += random(-20, 20) * dt;
                const v = Math.hypot(b.vx, b.vy) || 1;
                const maxV = type.speed * 0.85 * slowMult;
                if (v > maxV) {
                    b.vx = (b.vx / v) * maxV;
                    b.vy = (b.vy / v) * maxV;
                }
            }
        }

        // Local separation to reduce stacking.
        let sepX = 0;
        let sepY = 0;
        for (const o of state.beasts) {
            if (o.id === b.id) continue;
            const dx = b.x - o.x;
            const dy = b.y - o.y;
            const d = Math.hypot(dx, dy) || 0.001;
            let minGap = (type.size + ENEMY_TYPES[o.key].size) * 0.95;
            if (b.tamedBy && o.tamedBy && b.tamedBy === o.tamedBy) {
                minGap += 6;
            }
            if (d >= minGap) continue;
            const push = (minGap - d) / minGap;
            sepX += (dx / d) * push * 90;
            sepY += (dy / d) * push * 90;
        }
        b.vx += sepX * dt;
        b.vy += sepY * dt;

        // Keep followers from collapsing onto owner when owner is idle.
        if (b.tamedBy) {
            const owner = state.players[b.tamedBy];
            if (owner) {
                const odx = b.x - owner.x;
                const ody = b.y - owner.y;
                const od = Math.hypot(odx, ody) || 0.001;
                if (od < FOLLOW_OWNER_MIN_GAP) {
                    const push = (FOLLOW_OWNER_MIN_GAP - od) / FOLLOW_OWNER_MIN_GAP;
                    b.vx += (odx / od) * push * 140 * dt;
                    b.vy += (ody / od) * push * 140 * dt;
                }
            }
        }

        const bounds = getMapBounds(b.map);
        b.x = clamp(b.x + b.vx * dt, 24, bounds.width - 24);
        b.y = clamp(b.y + b.vy * dt, 24, bounds.height - 24);
        clampBeastPosition(b);

        // PvE contact damage from untamed beasts
        if (b.tamedBy) continue;
        for (const p of Object.values(state.players)) {
            if (p.map !== b.map || p.hp <= 0 || p.dead) continue;
            if (isInAnySafe(p.map, p.x, p.y)) continue;
            if (Math.hypot(b.x - p.x, b.y - p.y) > type.size + PLAYER_RADIUS + BEAST_MELEE_RANGE_BONUS) continue;
            p.hp -= 18 * dt;
            if (p.hp <= 0) killPlayer(state, p);
        }
    }

    // Clamp boss HP
    for (const boss of state.bosses) {
        if (boss.hp < 0) boss.hp = 0;
        if (boss.hp > boss.maxHp) boss.hp = boss.maxHp;
    }
}

module.exports = { updateBeasts };

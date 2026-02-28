const {
    ARROW_MIN_SPEED,
    ARROW_MAX_SPEED,
    ARROW_MIN_DMG,
    ARROW_MAX_DMG,
    ARROW_LIFE,
    WOLF_DAMAGE_MULTIPLIER
} = require("../constants");
const { clamp, lerp, vecFromDir } = require("../helpers");

function handleShoot(room, state, client, data) {
    const p = state.players[client.sessionId];
    if (!p || p.dead || p.hp <= 0 || p.ammo <= 0) return;

    const charge = clamp((data && data.charge) || 0, 0, 1);
    const shotPos = data && typeof data.position === "string" ? data.position : p.dir;
    if (shotPos === "left" || shotPos === "right" || shotPos === "back" || shotPos === "front") {
        p.dir = shotPos;
    }
    const dir = vecFromDir(p.dir || "front");
    const speed = lerp(ARROW_MIN_SPEED, ARROW_MAX_SPEED, charge);
    const baseDmg = Math.round(lerp(ARROW_MIN_DMG, ARROW_MAX_DMG, charge));
    const dmg = p.wolfHp > 0 ? baseDmg * WOLF_DAMAGE_MULTIPLIER : baseDmg;

    p.ammo -= 1;
    state.arrows.push({
        id: `a${state.nextArrowId++}`,
        owner: p.sessionId,
        team: p.team || 0,
        map: p.map,
        x: p.x + dir.x * 34,
        y: p.y + dir.y * 34,
        vx: dir.x * speed,
        vy: dir.y * speed,
        dmg,
        life: ARROW_LIFE
    });

    room.broadcast("PLAYER_SHOT", {
        sessionId: p.sessionId,
        map: p.map,
        facing: p.dir || shotPos || "front"
    });
}

module.exports = { handleShoot };

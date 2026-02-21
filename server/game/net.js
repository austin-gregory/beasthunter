const { getAllSafeZones } = require("./maps");

function buildGameStatePayload(state) {
    const players = Object.values(state.players).map((p) => ({
        sessionId: p.sessionId,
        name: p.name,
        model: p.model,
        bow: Number.isFinite(p.bow) ? p.bow : 0,
        map: p.map,
        x: p.x,
        y: p.y,
        hp: Math.round(p.hp),
        ammo: p.ammo,
        score: p.score,
        dead: !!p.dead
    }));

    const beasts = state.beasts.map((b) => ({
        id: b.id,
        key: b.key,
        map: b.map,
        x: b.x,
        y: b.y,
        hp: Math.round(b.hp),
        maxHp: b.maxHp,
        tamedBy: b.tamedBy
    }));

    const bosses = state.bosses.map((b) => ({
        id: b.id,
        map: b.map,
        x: b.x,
        y: b.y,
        hp: Math.round(b.hp),
        maxHp: b.maxHp,
        spin: b.spin || 0
    }));

    const arrows = state.arrows.map((a) => ({
        id: a.id,
        map: a.map,
        x: a.x,
        y: a.y,
        angle: Math.atan2(a.vy, a.vx)
    }));

    const bossShots = state.bossShots.map((s) => ({
        id: s.id,
        map: s.map,
        x: s.x,
        y: s.y,
        angle: Math.atan2(s.vy, s.vx)
    }));

    return {
        players,
        beasts,
        bosses,
        arrows,
        bossShots,
        safeZones: getAllSafeZones()
    };
}

function sendGameState(room, state) {
    room.broadcast("GAME_STATE", buildGameStatePayload(state));
}

module.exports = { buildGameStatePayload, sendGameState };

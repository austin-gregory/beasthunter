const colyseus = require("colyseus");

const {
    VALID_MODELS,
    MAP_TOWN,
    PLAYER_MAX_HP,
    PLAYER_MAX_AMMO
} = require("../game/constants");
const { createState, allocateSlot, spawnBeasts, spawnBosses, spawnBots, releasePlayerTames } = require("../game/state");
const { updateBots } = require("../game/systems/bots");
const { getReloadSpawn, getFallbackSpawn } = require("../game/maps");
const { updatePlayers } = require("../game/systems/players");
const { updateBeasts } = require("../game/systems/beasts");
const { updateBosses } = require("../game/systems/bosses");
const { simulateArrows, simulateBossShots } = require("../game/systems/projectiles");
const { tryCashIn } = require("../game/systems/score");
const { sendGameState } = require("../game/net");

const { handlePlayerMoved } = require("../game/messages/playerMoved");
const { handlePlayerMovementEnded } = require("../game/messages/playerMovementEnded");
const { handlePlayerChangedMap } = require("../game/messages/playerChangedMap");
const { handleShoot } = require("../game/messages/shoot");
const { handleTame } = require("../game/messages/tame");
const { handleRespawn } = require("../game/messages/respawn");

exports.PokeWorld = class extends colyseus.Room {
    onCreate() {
        this.gameState = createState();
        spawnBeasts(this.gameState);
        spawnBosses(this.gameState);
        spawnBots(this.gameState);

        this.onMessage("PLAYER_MOVED", (client, data) => handlePlayerMoved(this, this.gameState, client, data));
        this.onMessage("PLAYER_MOVEMENT_ENDED", (client, data) =>
            handlePlayerMovementEnded(this, this.gameState, client, data)
        );
        this.onMessage("PLAYER_CHANGED_MAP", (client, data) =>
            handlePlayerChangedMap(this, this.gameState, client, data)
        );
        this.onMessage("SHOOT", (client, data) => handleShoot(this, this.gameState, client, data));
        this.onMessage("TAME", (client) => handleTame(this, this.gameState, client));
        this.onMessage("RESPAWN", (client) => handleRespawn(this, this.gameState, client));

        this.setSimulationInterval((dt) => this.simulate(dt / 1000), 50);
    }

    onJoin(client, options) {
        const slot = allocateSlot(this.gameState);
        const sp = getReloadSpawn(MAP_TOWN, slot) || getFallbackSpawn(MAP_TOWN) || { x: 352, y: 1216 };
        const name = (options && typeof options.name === "string" ? options.name : "").trim().slice(0, 16) || "Player";
        const model = options && VALID_MODELS.has(options.model) ? options.model : "misa";
        const bow = Number.isFinite(options && options.bow) ? Math.max(0, Math.min(options.bow, 35)) : 0;

        this.gameState.players[client.sessionId] = {
            sessionId: client.sessionId,
            name,
            model,
            slot,
            map: MAP_TOWN,
            x: sp.x,
            y: sp.y,
            hp: PLAYER_MAX_HP,
            ammo: PLAYER_MAX_AMMO,
            score: 0,
            dir: "front",
            dead: false,
            bow
        };

        setTimeout(() => client.send("CURRENT_PLAYERS", { players: this.gameState.players }), 100);
        this.broadcast("PLAYER_JOINED", { ...this.gameState.players[client.sessionId] }, { except: client });
    }

    onLeave(client) {
        const p = this.gameState.players[client.sessionId];
        if (!p) return;

        releasePlayerTames(this.gameState, client.sessionId);
        this.broadcast("PLAYER_LEFT", { sessionId: p.sessionId, map: p.map });
        delete this.gameState.players[client.sessionId];
    }

    onDispose() {}

    simulate(dt) {
        updateBots(this.gameState, dt);
        updatePlayers(this.gameState, dt);
        updateBeasts(this.gameState, dt);
        updateBosses(this.gameState, dt);
        simulateArrows(this.gameState, dt);
        simulateBossShots(this.gameState, dt);
        tryCashIn(this.gameState);
        sendGameState(this, this.gameState);
    }
};

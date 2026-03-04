import Phaser from "phaser";
import { onlinePlayers, getRoom } from "./SocketServer";

import OnlinePlayer from "./OnlinePlayer";
import Player from "./Player";

let cursors;
const PLAYER_MAX_AMMO = 30;

function beastColor(beastKey) {
    if (beastKey === "wolf") return 0x94a3b8;
    if (beastKey === "tiger") return 0xf59e0b;
    return 0x8b5cf6;
}

export class Scene2 extends Phaser.Scene {
    constructor() {
        super("playGame");
    }

    init(data) {
        this.mapName = data.map;
        this.fromMap = data.fromMap || null;
        this.playerTexturePosition = data.playerTexturePosition;
        this.mapSpawn = data.spawn || null;
        this.playerName = (data.playerProfile && data.playerProfile.name) || "Player";
        this.playerModel = (data.playerProfile && data.playerProfile.model) || "misa";
        this.playerBowIndex = Number.isFinite(data.playerProfile && data.playerProfile.bow)
            ? data.playerProfile.bow
            : 0;

        this.localStats = { hp: 100, ammo: 0, score: 0, wolfHp: 0, team: 0 };
        this.team1Score = 0;
        this.team2Score = 0;
        this.wolfSprite = null;
        this.remoteWolfSprites = new Map();
        this.beastViews = new Map();
        this.bossViews = new Map();
        this.bossShotViews = new Map();
        this.arrowViews = new Map();
        this.chargeTime = 0;
        this.maxChargeSeconds = 1.2;
        this.socketKey = true;
        this.lastStatePlayers = [];
        this.lastStateBeasts = [];
        this.localSessionId = null;
        this.safeZoneGraphics = [];
        this.beastHpMemory = new Map();
        this.beastTameMemory = new Map();
        this.bossHpMemory = new Map();
        this.playerHpMemory = new Map();
        this.bloodFx = [];
        this.sparkleFx = [];
        this.trailFx = [];
        this.summoningRitual = null;
        this.ammoPopups = [];
        this.safeZonesData = [];
        this.isDead = false;
        this.lastServerPos = null;
        this.lastServerMap = this.mapName;
        this.playerBow = null;
        this.isChargingShot = false;
        this.damagePopups = [];
        this.lastStateBosses = [];
        this.lastStateBossShots = [];
    }

    create() {
        this.setupMap();
        this.setupPlayer();
        this.setupControls();
        this.setupHudRefs();
        this.setupNetworking();

        this.events.once("shutdown", () => {
            if (this.socketInterval) {
                clearInterval(this.socketInterval);
                this.socketInterval = null;
            }
            this.input.removeAllListeners("pointerdown");
            if (this.respawnBtn && this.onRespawnClick) {
                this.respawnBtn.removeEventListener("click", this.onRespawnClick);
            }
            this.destroyTransientViews();
        });
    }

    setupMap() {
        this.map = this.make.tilemap({ key: this.mapName });
        this.scene.scene.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

        const tileset = this.map.addTilesetImage("tuxmon-sample-32px-extruded", "TilesTown");
        this.belowLayer = this.map.createLayer("Below Player", tileset, 0, 0);
        this.worldLayer = this.map.createLayer("World", tileset, 0, 0);
        this.grassLayer = this.map.createLayer("Grass", tileset, 0, 0);
        this.aboveLayer = this.map.createLayer("Above Player", tileset, 0, 0);
        this.worldLayer.setCollisionByProperty({ collides: true });
        this.aboveLayer.setDepth(10);
        this.doorZoneViews = [];
        this.worldZones = [];
        this._mapChangeCooldown = 0;
        this.setupInteriorWeb();

        let spawnPoint = null;
        if (this.mapSpawn && Number.isFinite(this.mapSpawn.x) && Number.isFinite(this.mapSpawn.y)) {
            spawnPoint = this.mapSpawn;
        } else if (this.fromMap) {
            // Coming from another world map — find the SpawnPoint whose 'map' property matches
            const spLayer = this.map.getObjectLayer("SpawnPoints");
            const spObjs = spLayer && Array.isArray(spLayer.objects) ? spLayer.objects : [];
            const fromMap = this.fromMap;
            const match = spObjs.find((o) =>
                Array.isArray(o.properties) &&
                o.properties.some((p) => p.name === "map" && p.value === fromMap)
            );
            if (match) {
                spawnPoint = { x: match.x, y: match.y };
            } else {
                const first = spObjs.find((o) => o.name === "Spawn Point");
                if (first) spawnPoint = { x: first.x, y: first.y };
            }
        } else {
            const reloadLayer = this.map.getObjectLayer("Reload Area");
            const reloadObj = reloadLayer && Array.isArray(reloadLayer.objects) ? reloadLayer.objects[0] : null;
            if (reloadObj && Number.isFinite(reloadObj.x) && Number.isFinite(reloadObj.y)) {
                const rw = Number.isFinite(reloadObj.width) ? reloadObj.width : 0;
                const rh = Number.isFinite(reloadObj.height) ? reloadObj.height : 0;
                spawnPoint = { x: reloadObj.x + rw / 2, y: reloadObj.y + rh / 2 };
            } else {
                spawnPoint = this.map.findObject("SpawnPoints", (obj) => obj.name === "Spawn Point");
            }
        }
        this.spawnPoint = spawnPoint || { x: 352, y: 1216 };

        const doorsLayer = this.map.getObjectLayer("Doors");
        const doors = (doorsLayer && Array.isArray(doorsLayer.objects)) ? doorsLayer.objects : [];
        doors.forEach((doorObj) => {
            if (!doorObj || !Number.isFinite(doorObj.x) || !Number.isFinite(doorObj.y)) return;
            const w = Number.isFinite(doorObj.width) && doorObj.width > 0 ? doorObj.width : 24;
            const h = Number.isFinite(doorObj.height) && doorObj.height > 0 ? doorObj.height : 24;
            const marker = this.add.rectangle(doorObj.x + w / 2, doorObj.y + h / 2, w, h, 0x2563eb, 0.2)
                .setStrokeStyle(2, 0x1d4ed8, 0.9)
                .setDepth(11);
            this.doorZoneViews.push(marker);
        });

        // ── World transition zones (route1, route2, town, etc.) ──────────────
        const worldsLayer = this.map.getObjectLayer("Worlds");
        const worldObjs = (worldsLayer && Array.isArray(worldsLayer.objects)) ? worldsLayer.objects : [];
        worldObjs.forEach((obj) => {
            if (!obj || !obj.name || !Number.isFinite(obj.x) || !Number.isFinite(obj.y)) return;
            const w = Number.isFinite(obj.width) && obj.width > 0 ? obj.width : 32;
            const h = Number.isFinite(obj.height) && obj.height > 0 ? obj.height : 32;
            const textureProp = Array.isArray(obj.properties)
                ? obj.properties.find((p) => p.name === "playerTexturePosition")
                : null;
            this.worldZones.push({
                x: obj.x, y: obj.y, w, h,
                name: obj.name,
                playerTexturePosition: textureProp ? textureProp.value : "front"
            });
        });
    }

    setupPlayer() {
        this.player = new Player({
            scene: this,
            worldLayer: this.worldLayer,
            key: "player",
            x: this.spawnPoint.x,
            y: this.spawnPoint.y
        });
        this.player.bowIndex = this.playerBowIndex;
        this.ensureShootAnimations(this.playerModel, this.playerBowIndex);
        if (this.textures.exists("bows")) {
            this.playerBow = this.add.sprite(this.player.x, this.player.y, "bows", this.playerBowIndex)
                .setScale(1.2)
                .setDepth(6);
        }
        this.localDeadX = this.add.text(this.player.x, this.player.y, "X", {
            font: "92px monospace",
            fill: "#dc2626",
            stroke: "#7f1d1d",
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(15);
        this.localDeadX.visible = false;

        if (this.textures.exists("beast-wolf")) {
            this.wolfSprite = this.add.sprite(0, 0, "beast-wolf").setScale(1.5).setDepth(4);
            this.wolfSprite.visible = false;
            if (this.anims.exists("beast-wolf-walk")) this.wolfSprite.play("beast-wolf-walk");
        }

        const camera = this.cameras.main;
        camera.startFollow(this.player);
        camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    }

    setupInteriorWeb() {
        const inInterior = this.mapName === "interior_door_a" || this.mapName === "interior_door_b";
        if (!inInterior || !this.textures.exists("spiderweb")) return;
        const w = this.map.widthInPixels;
        const h = this.map.heightInPixels;
        const tile = this.add.image(0, 0, "spiderweb").setOrigin(0).setAlpha(0.25).setDepth(-1);
        const tex = this.textures.get("spiderweb");
        const src = tex && tex.getSourceImage();
        if (src && src.width && src.height) {
            const cols = Math.ceil(w / src.width);
            const rows = Math.ceil(h / src.height);
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    if (x === 0 && y === 0) {
                        tile.setPosition(0, 0);
                        continue;
                    }
                    this.add.image(x * src.width, y * src.height, "spiderweb")
                        .setOrigin(0)
                        .setAlpha(0.25)
                        .setDepth(-1);
                }
            }
        } else {
            tile.setDisplaySize(w, h);
        }
    }

    setupControls() {
        cursors = this.input.keyboard.createCursorKeys();
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.input.keyboard.enabled = true;
        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.UP,
            Phaser.Input.Keyboard.KeyCodes.DOWN,
            Phaser.Input.Keyboard.KeyCodes.LEFT,
            Phaser.Input.Keyboard.KeyCodes.RIGHT,
            Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.SHIFT
        ]);

        this.game.canvas.setAttribute("tabindex", "0");
        this.game.canvas.focus();
        this.input.on("pointerdown", () => this.game.canvas.focus());

        this.doorHint = this.add.text(16, 16, "Door nearby: press E or Enter", {
            font: "16px monospace",
            fill: "#ffffff",
            padding: { x: 12, y: 6 },
            backgroundColor: "#1d4ed8"
        }).setScrollFactor(0).setDepth(30);
        this.doorHint.setVisible(false);

        this.debugGraphics();
        this.socketInterval = setInterval(() => {
            this.socketKey = true;
        }, 50);
    }

    setupHudRefs() {
        this.hudWrap = document.getElementById("game-hud");
        this.hudHp = document.getElementById("hud-hp");
        this.hudHpFill = document.getElementById("hud-hp-fill");
        this.hudAmmo = document.getElementById("hud-ammo");
        this.hudScore = document.getElementById("hud-score");
        this.hudWolfFill = document.getElementById("hud-wolf-fill");
        this.hudCharge = document.getElementById("hud-charge");
        this.hudChargeFill = document.getElementById("hud-charge-fill");
        this.hudBeasts = document.getElementById("hud-beasts");
        this.hudBoard = document.getElementById("hud-board");
        this.hudTeam1Card = document.getElementById("hud-team1-card");
        this.hudTeam2Card = document.getElementById("hud-team2-card");
        this.hudTeam1Score = document.getElementById("hud-team1-score");
        this.hudTeam2Score = document.getElementById("hud-team2-score");
        if (this.hudWrap) this.hudWrap.style.display = "block";

        // Extract the player's bow sprite from Phaser texture and set as icon
        const bowsTex = this.textures.get("bows");
        if (bowsTex) {
            const frame = bowsTex.get(this.playerBowIndex || 0);
            if (frame && frame.source && frame.source.image) {
                const tmp = document.createElement("canvas");
                tmp.width = frame.cutWidth;
                tmp.height = frame.cutHeight;
                tmp.getContext("2d").drawImage(
                    frame.source.image,
                    frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
                    0, 0, frame.cutWidth, frame.cutHeight
                );
                const bowIcon = document.getElementById("hud-bow-icon");
                if (bowIcon) bowIcon.src = tmp.toDataURL("image/png");
            }
        }
        this.deathOverlay = document.getElementById("death-overlay");
        this.respawnBtn = document.getElementById("respawn-btn");
        this.onRespawnClick = () => {
            if (!this.isDead || !this.room) return;
            this.room.then((r) => r.send("RESPAWN"));
        };
        if (this.respawnBtn) {
            this.respawnBtn.addEventListener("click", this.onRespawnClick);
        }
    }

    setupNetworking() {
        const room = getRoom();
        if (!room) return;
        this.room = room;

        room.then((joinedRoom) => {
            this.localSessionId = joinedRoom.sessionId;
            joinedRoom.removeAllListeners("CURRENT_PLAYERS");
            joinedRoom.removeAllListeners("PLAYER_JOINED");
            joinedRoom.removeAllListeners("PLAYER_LEFT");
            joinedRoom.removeAllListeners("PLAYER_MOVED");
            joinedRoom.removeAllListeners("PLAYER_MOVEMENT_ENDED");
            joinedRoom.removeAllListeners("PLAYER_CHANGED_MAP");
            joinedRoom.removeAllListeners("PLAYER_SHOT");
            joinedRoom.removeAllListeners("GAME_STATE");
            joinedRoom.removeAllListeners("BEAST_SUMMONED");
            joinedRoom.removeAllListeners("BEAST_SUMMONING");

            joinedRoom.onMessage("CURRENT_PLAYERS", (data) => {
                Object.keys(data.players || {}).forEach((playerId) => {
                    const player = data.players[playerId];
                    if (!player || playerId === joinedRoom.sessionId) return;
                    if (!onlinePlayers[player.sessionId]) {
                        onlinePlayers[player.sessionId] = new OnlinePlayer({
                            scene: this,
                            playerId: player.sessionId,
                            key: player.sessionId,
                            worldLayer: this.worldLayer,
                            map: player.map,
                            model: player.model,
                            bow: player.bow,
                            name: player.name,
                            team: player.team || 0,
                            x: player.x,
                            y: player.y
                        });
                        this.ensureShootAnimations(player.model, Number.isFinite(player.bow) ? player.bow : 0);
                    }
                });
            });

            joinedRoom.onMessage("PLAYER_JOINED", (data) => {
                if (!data || data.sessionId === joinedRoom.sessionId) return;
                if (!onlinePlayers[data.sessionId]) {
                    onlinePlayers[data.sessionId] = new OnlinePlayer({
                        scene: this,
                        playerId: data.sessionId,
                        key: data.sessionId,
                        worldLayer: this.worldLayer,
                        map: data.map,
                        model: data.model,
                        bow: data.bow,
                        name: data.name,
                        team: data.team || 0,
                        x: data.x,
                        y: data.y
                    });
                    this.ensureShootAnimations(data.model, Number.isFinite(data.bow) ? data.bow : 0);
                }
            });

            joinedRoom.onMessage("PLAYER_LEFT", (data) => {
                if (!data) return;
                if (onlinePlayers[data.sessionId]) {
                    onlinePlayers[data.sessionId].destroy();
                    delete onlinePlayers[data.sessionId];
                }
            });

            joinedRoom.onMessage("PLAYER_MOVED", (data) => {
                // Movement is synced via GAME_STATE snapshots to avoid jitter.
            });

            joinedRoom.onMessage("PLAYER_MOVEMENT_ENDED", (data) => {
                // Movement is synced via GAME_STATE snapshots to avoid jitter.
            });

            joinedRoom.onMessage("PLAYER_CHANGED_MAP", (data) => {
                if (!data || data.sessionId === joinedRoom.sessionId) return;
                if (onlinePlayers[data.sessionId]) {
                    onlinePlayers[data.sessionId].destroy();
                    delete onlinePlayers[data.sessionId];
                }
                if (data.map === this.mapName) {
                    onlinePlayers[data.sessionId] = new OnlinePlayer({
                        scene: this,
                        playerId: data.sessionId,
                        key: data.sessionId,
                        worldLayer: this.worldLayer,
                        map: data.map,
                        model: data.model,
                        bow: data.bow,
                        name: data.name,
                        team: data.team || 0,
                        x: data.x,
                        y: data.y
                    });
                    this.ensureShootAnimations(data.model, Number.isFinite(data.bow) ? data.bow : 0);
                }
            });

            joinedRoom.onMessage("PLAYER_SHOT", (data) => {
                if (!data || data.sessionId === joinedRoom.sessionId) return;
                const p = onlinePlayers[data.sessionId];
                if (p && p.map === this.mapName) {
                    p.triggerShoot();
                }
            });

            joinedRoom.onMessage("GAME_STATE", (data) => {
                this.lastStatePlayers = Array.isArray(data.players) ? data.players : [];
                this.lastStateBeasts = Array.isArray(data.beasts) ? data.beasts : [];
                this.lastStateBosses = Array.isArray(data.bosses) ? data.bosses : [];
                this.lastStateBossShots = Array.isArray(data.bossShots) ? data.bossShots : [];
                this.team1Score = data.team1Score || 0;
                this.team2Score = data.team2Score || 0;
                this.syncRemotePlayersFromState(this.lastStatePlayers, joinedRoom.sessionId);
                this.syncSafeZones(Array.isArray(data.safeZones) ? data.safeZones : []);
                this.syncBeasts(Array.isArray(data.beasts) ? data.beasts : []);
                this.syncBosses();
                this.syncArrows(Array.isArray(data.arrows) ? data.arrows : []);
                this.syncBossShots();
                this.syncLocalStats(this.lastStatePlayers, joinedRoom.sessionId);
                this.updateHud();
            });

            joinedRoom.onMessage("BEAST_SUMMONING", (data) => {
                this.startSummoningRitual((data && data.duration) || 15);
            });

            joinedRoom.onMessage("BEAST_SUMMONED", (data) => {
                if (data && data.sessionId === joinedRoom.sessionId) {
                    this.clearSummoningRitual();
                    this.showSummonEffect && this.showSummonEffect();
                }
            });
        });
    }

    update() {
        const room = this.room;
        if (!room || !this.player) return;

        if (this.isDead) {
            this.player.body.setVelocity(0, 0);
            this.player.visible = false;
            this.player.playerNickname.visible = false;
            this.localDeadX.visible = true;
            this.localDeadX.x = this.player.x;
            this.localDeadX.y = this.player.y;
            if (this.playerBow) this.playerBow.visible = false;
            this.updateBloodFx();
            this.updateSparkleFx();
            this.updateTrailFx();
            this.updateAmmoPopups();
            return;
        }
        this.player.visible = true;
        this.player.playerNickname.visible = true;
        this.localDeadX.visible = false;
        if (this.playerBow) this.playerBow.visible = true;

        this.player.update();
        this.checkWorldZoneTransition();
        this.updateLocalBow();
        this.updateWolfCompanion();
        this.updateSummoningRitual();
        for (const remote of Object.values(onlinePlayers)) {
            if (remote && remote.map === this.mapName && typeof remote.updateRemote === "function") {
                remote.updateRemote(this.game.loop.delta);
            }
        }
        this.handleMovementMessages();
        this.handleCombatInputs();
        this.updateBloodFx();
        this.updateSparkleFx();
        this.updateTrailFx();
        this.updateAmmoPopups();
        this.updateDamagePopups();
    }

    handleMovementMessages() {
        if (cursors.left.isDown || this.player.wasd.A.isDown) {
            if (this.socketKey && this.player.isMoved()) {
                this.room.then((r) => r.send("PLAYER_MOVED", { position: "left", x: this.player.x, y: this.player.y }));
                this.socketKey = false;
            }
        } else if (cursors.right.isDown || this.player.wasd.D.isDown) {
            if (this.socketKey && this.player.isMoved()) {
                this.room.then((r) => r.send("PLAYER_MOVED", { position: "right", x: this.player.x, y: this.player.y }));
                this.socketKey = false;
            }
        }

        if (cursors.up.isDown || this.player.wasd.W.isDown) {
            if (this.socketKey && this.player.isMoved()) {
                this.room.then((r) => r.send("PLAYER_MOVED", { position: "back", x: this.player.x, y: this.player.y }));
                this.socketKey = false;
            }
        } else if (cursors.down.isDown || this.player.wasd.S.isDown) {
            if (this.socketKey && this.player.isMoved()) {
                this.room.then((r) => r.send("PLAYER_MOVED", { position: "front", x: this.player.x, y: this.player.y }));
                this.socketKey = false;
            }
        }

        const stillMoving =
            cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown ||
            this.player.wasd.A.isDown || this.player.wasd.D.isDown || this.player.wasd.W.isDown || this.player.wasd.S.isDown;

        if (!stillMoving && (Phaser.Input.Keyboard.JustUp(cursors.left) || Phaser.Input.Keyboard.JustUp(this.player.wasd.A))) {
            this.room.then((r) => r.send("PLAYER_MOVEMENT_ENDED", { position: "left" }));
        } else if (!stillMoving && (Phaser.Input.Keyboard.JustUp(cursors.right) || Phaser.Input.Keyboard.JustUp(this.player.wasd.D))) {
            this.room.then((r) => r.send("PLAYER_MOVEMENT_ENDED", { position: "right" }));
        }

        if (!stillMoving && (Phaser.Input.Keyboard.JustUp(cursors.up) || Phaser.Input.Keyboard.JustUp(this.player.wasd.W))) {
            this.room.then((r) => r.send("PLAYER_MOVEMENT_ENDED", { position: "back" }));
        } else if (!stillMoving && (Phaser.Input.Keyboard.JustUp(cursors.down) || Phaser.Input.Keyboard.JustUp(this.player.wasd.S))) {
            this.room.then((r) => r.send("PLAYER_MOVEMENT_ENDED", { position: "front" }));
        }
    }

    handleCombatInputs() {
        const spaceDown = this.player.spacebar.isDown;
        this.isChargingShot = !!spaceDown;
        if (spaceDown && this.localStats.ammo > 0) {
            this.chargeTime = clamp(this.chargeTime + this.game.loop.delta / 1000, 0, this.maxChargeSeconds);
        }

        if (Phaser.Input.Keyboard.JustUp(this.player.spacebar) && this.localStats.ammo > 0) {
            const charge = clamp(this.chargeTime / this.maxChargeSeconds, 0, 1);
            if (this.player && this.player.triggerShootAnimation) {
                this.player.triggerShootAnimation();
            }
            this.triggerBowShoot(this.playerBow);
            this.room.then((r) => r.send("SHOOT", { charge, position: this.player.facing || "front" }));
            this.chargeTime = 0;
        }

        if (!spaceDown && this.chargeTime > 0 && this.localStats.ammo <= 0) {
            this.chargeTime = 0;
        }

        if (Phaser.Input.Keyboard.JustDown(this.shiftKey)) {
            this.room.then((r) => r.send("TAME"));
        }
    }

    updateWolfCompanion() {
        if (!this.wolfSprite || !this.player) return;
        const wolfHp = this.localStats && this.localStats.wolfHp || 0;
        this.wolfSprite.visible = wolfHp > 0 && !this.isDead;
        if (this.wolfSprite.visible) {
            const facing = this.player.facing || "front";
            const offsets = { left: { x: 1, y: 0 }, right: { x: -1, y: 0 }, back: { x: 0, y: 1 }, front: { x: 0, y: -1 } };
            const o = offsets[facing] || offsets.front;
            this.wolfSprite.setPosition(
                this.player.x + o.x * 48,
                this.player.y + o.y * 48
            );

            const vel = this.player.body && this.player.body.velocity;
            const isMoving = vel && (Math.abs(vel.x) > 1 || Math.abs(vel.y) > 1);
            if (isMoving) {
                if (!this.wolfSprite.anims.isPlaying && this.anims.exists("beast-wolf-walk")) {
                    this.wolfSprite.play("beast-wolf-walk");
                }
            } else {
                if (this.wolfSprite.anims.isPlaying) this.wolfSprite.anims.stop();
            }
        }
    }

    checkWorldZoneTransition() {
        if (!this.player || this.isDead) return;
        if (this._mapChangeCooldown > 0) {
            this._mapChangeCooldown -= this.game.loop.delta / 1000;
            return;
        }
        const body = this.player.body;
        if (!body) return;
        for (const zone of this.worldZones) {
            // Use physics body bounds so zones at map edges (within last 32px) are reachable
            if (body.right >= zone.x && body.left <= zone.x + zone.w &&
                body.bottom >= zone.y && body.top <= zone.y + zone.h) {
                this._mapChangeCooldown = 2.0;
                this.room.then((r) => r.send("PLAYER_CHANGED_MAP", { map: zone.name }));
                this.scene.restart({
                    map: zone.name,
                    fromMap: this.mapName,
                    playerTexturePosition: zone.playerTexturePosition,
                    playerProfile: {
                        name: this.playerName,
                        model: this.playerModel,
                        bow: this.playerBowIndex
                    }
                });
                return;
            }
        }
    }

    startSummoningRitual(duration) {
        this.clearSummoningRitual();
        // Three orbiting circles: wolf (blue), tiger (orange), spider (purple)
        const colors = [0x60a5fa, 0xfb923c, 0xa855f7];
        const circles = colors.map((color, i) => ({
            sprite: this.add.circle(0, 0, 11, color).setDepth(16).setAlpha(0.9),
            phase: (i / colors.length) * Math.PI * 2
        }));
        const text = this.add.text(0, 0, "", {
            font: "bold 14px monospace",
            fill: "#e879f9",
            stroke: "#1a0a2e",
            strokeThickness: 5
        }).setOrigin(0.5).setDepth(17);
        this.summoningRitual = { circles, text, elapsed: 0, duration };
    }

    updateSummoningRitual() {
        if (!this.summoningRitual || !this.player) return;
        const r = this.summoningRitual;
        r.elapsed += this.game.loop.delta / 1000;

        const radius = 52;
        const speed = Math.PI * 1.4; // rad/s
        for (const c of r.circles) {
            const angle = c.phase + r.elapsed * speed;
            c.sprite.setPosition(
                this.player.x + Math.cos(angle) * radius,
                this.player.y + Math.sin(angle) * radius
            );
            c.sprite.alpha = 0.5 + 0.4 * Math.sin(r.elapsed * 6 + c.phase);
        }

        const remaining = Math.ceil(Math.max(0, r.duration - r.elapsed));
        r.text.setPosition(this.player.x, this.player.y - 72);
        r.text.setText(`✦ Summoning... ${remaining}s`);
    }

    clearSummoningRitual() {
        if (!this.summoningRitual) return;
        for (const c of this.summoningRitual.circles) c.sprite.destroy();
        this.summoningRitual.text.destroy();
        this.summoningRitual = null;
    }

    syncLocalStats(players, localSessionId) {
        const me = players.find((p) => p.sessionId === localSessionId);
        if (!me) return;
        const prevAmmo = this.localStats.ammo;
        const wasDead = this.isDead;
        const prevHp = this.localStats.hp;
        this.localStats.hp = me.hp;
        this.localStats.ammo = me.ammo;
        this.localStats.score = me.score;
        this.localStats.wolfHp = me.wolfHp || 0;
        this.localStats.team = me.team || 0;
        this.isDead = !!me.dead;

        if (this.player && this.player.setTeamColor) {
            this.player.setTeamColor(me.team || 0);
        }

        if (Number.isFinite(prevHp) && me.hp < prevHp && this.player) {
            const hitCount = Math.min(20, Math.max(6, Math.round((prevHp - me.hp) * 0.9)));
            this.spawnBloodFx(this.player.x, this.player.y - 6, hitCount);
            this.spawnDamagePopup(this.player.x, this.player.y - 20, Math.round(prevHp - me.hp), "#ef4444");
        }

        if (this.deathOverlay) {
            this.deathOverlay.style.display = this.isDead ? "flex" : "none";
        }

        if (!wasDead && this.isDead) {
            this.chargeTime = 0;
        }

        const mapChanged = this.lastServerMap !== me.map;
        if (this.player && this.mapName === me.map && (!this.lastServerPos || wasDead !== this.isDead || mapChanged)) {
            this.player.setPosition(me.x, me.y);
            this.localDeadX.x = me.x;
            this.localDeadX.y = me.y;
        }
        this.lastServerPos = { x: me.x, y: me.y };
        this.lastServerMap = me.map;

        if (prevAmmo < this.localStats.ammo && this.localStats.ammo === PLAYER_MAX_AMMO && this.isPlayerInSafeZone(me)) {
            this.spawnAmmoPopup("+Arrows");
        }
    }

    syncBeasts(beasts) {
        beasts = beasts.filter((b) => !b.map || b.map === this.mapName);
        const inInterior = this.mapName === "interior_door_a" || this.mapName === "interior_door_b";
        const now = this.time.now;
        const seen = new Set();
        beasts.forEach((b) => {
            if (inInterior && !b.tamedBy) return;
            seen.add(b.id);
            let view = this.beastViews.get(b.id);
            if (!view) {
                const circle = this.createCircleBeastView(b.x, b.y, b);
                view = {
                    type: "circle",
                    body: circle.body,
                    eyeLeft: circle.eyeLeft,
                    eyeRight: circle.eyeRight,
                    mouth: circle.mouth,
                    armLeft: circle.armLeft,
                    armRight: circle.armRight,
                    hpBack: circle.hpBack,
                    hpFill: circle.hpFill,
                    tameDots: circle.tameDots,
                    phase: circle.phase
                };
                this.beastViews.set(b.id, view);
            }

            const bobY = Math.sin(now * 0.006 + view.phase) * 3;
            const renderX = b.x;
            const renderY = b.y + bobY;
            const tameable = !b.tamedBy && b.hp / Math.max(1, b.maxHp) <= 0.2;
            const prevHp = this.beastHpMemory.get(b.id);
            const prevTame = this.beastTameMemory.get(b.id);
            if (Number.isFinite(prevHp) && b.hp < prevHp) {
                this.spawnBloodFx(renderX, renderY, Math.min(18, Math.max(6, Math.round((prevHp - b.hp) * 0.8))));
                this.spawnDamagePopup(renderX, renderY - 18, Math.round(prevHp - b.hp), "#f59e0b");
            }
            this.beastHpMemory.set(b.id, b.hp);
            this.beastTameMemory.set(b.id, b.tamedBy || null);

            if (prevTame === this.localSessionId && !b.tamedBy && this.isPointInSafeZone(renderX, renderY)) {
                this.spawnSparkleFx(renderX, renderY, 14);
            }

            if (view.type === "wolf") {
                view.sprite.setPosition(renderX, renderY);
            } else {
                view.body.setPosition(renderX, renderY);
                view.body.fillColor = beastColor(b.key);
                view.body.alpha = b.tamedBy ? 0.78 : 1;
                view.body.setStrokeStyle(2, b.tamedBy ? 0x60a5fa : 0x0f172a, 0.85);
                view.eyeLeft.setPosition(renderX - 4, renderY - 3);
                view.eyeRight.setPosition(renderX + 4, renderY - 3);
                view.mouth.setPosition(renderX, renderY + 4);
                view.armLeft.setPosition(renderX - 10, renderY + 1);
                view.armRight.setPosition(renderX + 10, renderY + 1);
                view.eyeLeft.visible = view.eyeRight.visible = view.mouth.visible = true;
                view.armLeft.visible = view.armRight.visible = true;
                view.eyeLeft.alpha = view.eyeRight.alpha = view.mouth.alpha = view.body.alpha;
                view.armLeft.alpha = view.armRight.alpha = view.body.alpha;
            }

            if (tameable && view.tameDots) {
                const r = 18;
                for (let i = 0; i < view.tameDots.length; i++) {
                    const a = (Math.PI * 2 * i) / view.tameDots.length;
                    const dot = view.tameDots[i];
                    dot.fillColor = 0xef4444;
                    dot.visible = true;
                    dot.setPosition(renderX + Math.cos(a) * r, renderY + Math.sin(a) * r);
                }
            } else if (view.tameDots) {
                for (const dot of view.tameDots) {
                    dot.visible = false;
                }
            }

            view.hpBack.setPosition(renderX, renderY - 24);
            view.hpFill.setPosition(renderX - 15, renderY - 24);
            view.hpFill.width = Math.max(0, 30 * clamp(b.hp / Math.max(1, b.maxHp), 0, 1));
            view.hpFill.fillColor = b.tamedBy ? 0x93c5fd : 0x4ade80;
        });

        for (const [id, v] of this.beastViews.entries()) {
            if (seen.has(id)) continue;
            if (v.type === "wolf") {
                v.sprite.destroy();
            } else {
                v.body.destroy();
                v.eyeLeft.destroy();
                v.eyeRight.destroy();
                v.mouth.destroy();
                v.armLeft.destroy();
                v.armRight.destroy();
            }
            v.hpBack.destroy();
            v.hpFill.destroy();
            if (v.tameDots) {
                for (const dot of v.tameDots) {
                    dot.destroy();
                }
            }
            if (v.pendingWolf) {
                v.pendingWolf.destroy();
            }
            this.beastViews.delete(id);
            this.beastHpMemory.delete(id);
            this.beastTameMemory.delete(id);
        }
    }

    syncRemotePlayersFromState(players, localSessionId) {
        const seen = new Set();
        for (const p of players) {
            if (!p || p.sessionId === localSessionId) continue;
            seen.add(p.sessionId);

            if (p.map !== this.mapName) {
                if (onlinePlayers[p.sessionId]) {
                    onlinePlayers[p.sessionId].destroy();
                    delete onlinePlayers[p.sessionId];
                }
                continue;
            }

            if (!onlinePlayers[p.sessionId]) {
                onlinePlayers[p.sessionId] = new OnlinePlayer({
                    scene: this,
                    playerId: p.sessionId,
                    key: p.sessionId,
                    worldLayer: this.worldLayer,
                    map: p.map,
                    model: p.model,
                    bow: p.bow,
                    name: p.name,
                    team: p.team || 0,
                    x: p.x,
                    y: p.y
                });
                this.ensureShootAnimations(p.model, Number.isFinite(p.bow) ? p.bow : 0);
            }

            const prevHp = this.playerHpMemory.get(p.sessionId);
            if (Number.isFinite(prevHp) && p.hp < prevHp) {
                const hitCount = Math.min(16, Math.max(5, Math.round((prevHp - p.hp) * 0.8)));
                this.spawnBloodFx(p.x, p.y - 6, hitCount);
                this.spawnDamagePopup(p.x, p.y - 20, Math.round(prevHp - p.hp), "#ef4444");
            }
            this.playerHpMemory.set(p.sessionId, p.hp);
            onlinePlayers[p.sessionId].setServerState(p);

            // Remote wolf companion rendering
            if (p.wolfHp > 0 && this.textures.exists("beast-wolf")) {
                const dirOffsets = { left: { x: 1, y: 0 }, right: { x: -1, y: 0 }, back: { x: 0, y: 1 }, front: { x: 0, y: -1 } };
                const o = dirOffsets[p.dir || "front"] || dirOffsets.front;
                let ws = this.remoteWolfSprites.get(p.sessionId);
                if (!ws) {
                    ws = this.add.sprite(p.x + o.x * 48, p.y + o.y * 48, "beast-wolf").setScale(1.5).setDepth(4);
                    ws._prevX = p.x;
                    ws._prevY = p.y;
                    this.remoteWolfSprites.set(p.sessionId, ws);
                }
                ws.setPosition(p.x + o.x * 48, p.y + o.y * 48);
                ws.visible = true;

                const remoteMoved = Math.hypot(p.x - ws._prevX, p.y - ws._prevY) > 1.5;
                ws._prevX = p.x;
                ws._prevY = p.y;
                if (remoteMoved) {
                    if (!ws.anims.isPlaying && this.anims.exists("beast-wolf-walk")) ws.play("beast-wolf-walk");
                } else {
                    if (ws.anims.isPlaying) ws.anims.stop();
                }
            } else {
                const ws = this.remoteWolfSprites.get(p.sessionId);
                if (ws) ws.visible = false;
            }
        }

        for (const id of Object.keys(onlinePlayers)) {
            if (!seen.has(id)) {
                onlinePlayers[id].destroy();
                delete onlinePlayers[id];
                const ws = this.remoteWolfSprites.get(id);
                if (ws) { ws.destroy(); this.remoteWolfSprites.delete(id); }
            }
        }

        for (const id of Array.from(this.playerHpMemory.keys())) {
            if (!seen.has(id)) {
                this.playerHpMemory.delete(id);
            }
        }
    }

    syncBosses() {
        const bosses = Array.isArray(this.lastStateBosses) ? this.lastStateBosses : [];
        const seen = new Set();
        bosses.forEach((boss) => {
            if (!boss || boss.map !== this.mapName || boss.hp <= 0) return;
            seen.add(boss.id);
            let view = this.bossViews.get(boss.id);
            if (!view) {
                const sprite = this.add.sprite(boss.x, boss.y, "beast-spider").setScale(1.6).setDepth(6);
                const hpBack = this.add.rectangle(boss.x, boss.y - 50, 100, 7, 0x111111).setDepth(7);
                const hpFill = this.add.rectangle(boss.x - 50, boss.y - 50, 100, 7, 0x22c55e).setOrigin(0, 0.5).setDepth(8);
                view = { sprite, hpBack, hpFill };
                this.bossViews.set(boss.id, view);
            }

            const prevHp = this.bossHpMemory.get(boss.id);
            if (Number.isFinite(prevHp) && boss.hp < prevHp) {
                const dmg = Math.round(prevHp - boss.hp);
                this.spawnDamagePopup(boss.x, boss.y - 40, dmg, "#22c55e");
                this.spawnGreenBloodFx(boss.x, boss.y - 10, Math.min(26, Math.max(10, dmg)));
            }
            this.bossHpMemory.set(boss.id, boss.hp);

            view.sprite.setPosition(boss.x, boss.y);
            view.sprite.setRotation(boss.spin || 0);
            view.hpBack.setPosition(boss.x, boss.y - 50);
            view.hpFill.setPosition(boss.x - 50, boss.y - 50);
            view.hpFill.width = Math.max(0, 100 * clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1));
        });

        for (const [id, v] of this.bossViews.entries()) {
            if (seen.has(id)) continue;
            v.sprite.destroy();
            v.hpBack.destroy();
            v.hpFill.destroy();
            this.bossViews.delete(id);
            this.bossHpMemory.delete(id);
        }
    }

    syncBossShots() {
        const shots = Array.isArray(this.lastStateBossShots) ? this.lastStateBossShots : [];
        const seen = new Set();

        shots.forEach((s) => {
            if (!s || s.map !== this.mapName) return;
            seen.add(s.id);
            let view = this.bossShotViews.get(s.id);
            if (!view) {
                const core = this.add.circle(s.x, s.y, 5, 0x22c55e).setDepth(9);
                const glow = this.add.circle(s.x, s.y, 8, 0x86efac, 0.35).setDepth(8);
                view = { core, glow };
                this.bossShotViews.set(s.id, view);
            }
            view.core.setPosition(s.x, s.y);
            view.glow.setPosition(s.x, s.y);
        });

        for (const [id, v] of this.bossShotViews.entries()) {
            if (seen.has(id)) continue;
            v.core.destroy();
            v.glow.destroy();
            this.bossShotViews.delete(id);
        }
    }

    updateLocalBow() {
        if (!this.playerBow || !this.player) return;
        const shooting = this.player.shootLockUntil && this.time.now < this.player.shootLockUntil;
        const charging = this.isChargingShot && this.localStats.ammo > 0;
        this.playerBow.visible = shooting || charging;
        if (!this.playerBow.visible) return;
        const pose = getBowPose(this.player.facing || "front");
        this.playerBow.setPosition(this.player.x + pose.x, this.player.y + pose.y);
        this.playerBow.setRotation(pose.r);
    }

    triggerBowShoot(bow) {
        if (!bow) return;
        this.tweens.add({
            targets: bow,
            scale: { from: 1.35, to: 1.2 },
            duration: 160,
            ease: "Quad.out"
        });
    }

    showSummonEffect() {
        this.cameraShake();
        this.spawnSummonBeams();
        // slight delay before text so beams appear first
        this.time.delayedCall(220, () => {
            if (this.cameras && this.cameras.main) this.spawnSummonText();
        });
        // second wave of beams for extra drama
        this.time.delayedCall(600, () => {
            if (this.cameras && this.cameras.main) {
                this.spawnSummonBeams();
                this.cameraShake();
            }
        });
    }

    spawnTransformFx(x, y) {
        this.spawnSummonBeams();
        for (let i = 0; i < 8; i++) {
            const p = this.add.rectangle(x, y, 2, 2, 0xfb7185).setDepth(12);
            this.sparkleFx.push({
                p,
                vx: (Math.random() - 0.5) * 120,
                vy: -40 - Math.random() * 80,
                life: 0.35 + Math.random() * 0.25
            });
        }
        for (let i = 0; i < 6; i++) {
            const p = this.add.rectangle(x, y, 3, 3, 0x94a3b8).setDepth(11);
            this.sparkleFx.push({
                p,
                vx: (Math.random() - 0.5) * 90,
                vy: -20 - Math.random() * 60,
                life: 0.35 + Math.random() * 0.25
            });
        }
    }

    spawnSummonBeams() {
        const cam = this.cameras.main;
        const w = cam.width;
        const h = cam.height;

        // brief purple screen flash
        const flash = this.add.rectangle(w / 2, h / 2, w, h, 0x7c3aed, 0.18)
            .setDepth(29).setScrollFactor(0);
        this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 500,
            ease: "Quad.out",
            onComplete: () => flash.destroy()
        });

        // horizontal beams across the screen
        const beamCount = 5;
        for (let i = 0; i < beamCount; i++) {
            const y = (h / beamCount) * i + (h / beamCount / 2) + (Math.random() - 0.5) * 30;
            const thickness = 6 + Math.random() * 8;
            const beam = this.add.rectangle(w / 2, y, w, thickness, 0xa855f7)
                .setDepth(30).setScrollFactor(0).setAlpha(0.9);
            this.tweens.add({
                targets: beam,
                alpha: 0,
                scaleX: 1.1,
                duration: 900 + Math.random() * 600,
                ease: "Quad.out",
                onComplete: () => beam.destroy()
            });
        }
    }

    cameraShake() {
        this.cameras.main.shake(240, 0.008);
    }

    spawnSummonText() {
        const cam = this.cameras.main;
        // subtitle line
        const sub = this.add.text(cam.centerX, cam.centerY - 80, "✦  WOLF COMPANION AWAKENED  ✦", {
            font: "13px monospace",
            fill: "#e879f9",
            stroke: "#1f1333",
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(31).setScrollFactor(0).setAlpha(0);
        // main title
        const text = this.add.text(cam.centerX, cam.centerY - 120, "BEAST SUMMONED!", {
            font: "bold 32px monospace",
            fill: "#c084fc",
            stroke: "#1f1333",
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(31).setScrollFactor(0).setAlpha(0);

        // fade in then drift up and out
        this.tweens.add({
            targets: [text, sub],
            alpha: { from: 0, to: 1 },
            duration: 250,
            ease: "Quad.in",
            onComplete: () => {
                this.tweens.add({
                    targets: [text, sub],
                    y: `-=40`,
                    alpha: 0,
                    delay: 800,
                    duration: 1600,
                    ease: "Quad.out",
                    onComplete: () => { text.destroy(); sub.destroy(); }
                });
            }
        });
    }

    createCircleBeastView(x, y, beast) {
        const body = this.add.circle(x, y, 12, beastColor(beast.key)).setDepth(6);
        body.setStrokeStyle(2, 0x0f172a, 0.75);
        const eyeLeft = this.add.circle(x - 4, y - 3, 1.6, 0x0f172a).setDepth(7);
        const eyeRight = this.add.circle(x + 4, y - 3, 1.6, 0x0f172a).setDepth(7);
        const mouth = this.add.rectangle(x, y + 4, 5, 1.6, 0x0f172a).setDepth(7);
        const armLeft = this.add.rectangle(x - 10, y + 1, 4, 2, 0x0f172a).setDepth(6.5);
        const armRight = this.add.rectangle(x + 10, y + 1, 4, 2, 0x0f172a).setDepth(6.5);
        const hpBack = this.add.rectangle(x, y - 24, 30, 4, 0x111111).setDepth(7);
        const hpFill = this.add.rectangle(x - 15, y - 24, 30, 4, 0x4ade80).setOrigin(0, 0.5).setDepth(8);
        const tameDots = [];
        for (let i = 0; i < 16; i++) {
            const d = this.add.circle(x, y, 1.6, 0x22c55e).setDepth(7.5);
            d.visible = false;
            tameDots.push(d);
        }
        return {
            body,
            eyeLeft,
            eyeRight,
            mouth,
            armLeft,
            armRight,
            hpBack,
            hpFill,
            tameDots,
            phase: Math.random() * Math.PI * 2
        };
    }

    hideCircleView(view) {
        if (!view || !view.body) return;
        view.body.visible = false;
        view.eyeLeft.visible = false;
        view.eyeRight.visible = false;
        view.mouth.visible = false;
        view.armLeft.visible = false;
        view.armRight.visible = false;
        if (view.tameDots) {
            for (const dot of view.tameDots) {
                dot.visible = false;
            }
        }
    }

    ensureShootAnimations(model, bowIndex) {
        const dirs = ["left", "right", "front", "back"];
        const playersTex = this.textures.get("players");
        const bowsTex = this.textures.get("bows");
        if (!playersTex || !bowsTex) return;

        const bowFrame = bowsTex.get(bowIndex);
        if (!bowFrame) return;

        const bowSize = 16;
        const bowHalf = bowSize / 2;
        // Strong draw: pull the bow further along the facing direction.
        const frameOffsets = {
            left: [
                { x: -1, y: 12 },
                { x: 1, y: 12 },
                { x: 3, y: 12 }
            ],
            right: [
                { x: 5, y: 12 },
                { x: 3, y: 12 },
                { x: 1, y: 12 }
            ],
            front: [
                { x: 3, y: 16 },
                { x: 3, y: 19 },
                { x: 3, y: 22 }
            ],
            back: [
                { x: 3, y: 8 },
                { x: 3, y: 5 },
                { x: 3, y: 3 }
            ]
        };

        // Force bow to be vertical in all directions.
        const rotations = {
            left: Math.PI / 2,
            right: Math.PI / 2,
            front: Math.PI / 2,
            back: Math.PI / 2
        };

        dirs.forEach((dir) => {
            const animKey = `${model}-${dir}-shoot-b${bowIndex}`;
            if (this.anims.exists(animKey)) return;

            const baseName = `${model}_${dir}.png`;
            const baseFrame = playersTex.get(baseName);
            if (!baseFrame) return;

            const src = baseFrame.source.image;
            const baseW = baseFrame.data.sourceSize.w;
            const baseH = baseFrame.data.sourceSize.h;

            const frames = [];
            for (let i = 0; i < 3; i++) {
                const texKey = `shoot_${model}_${dir}_b${bowIndex}_${i}`;
                if (!this.textures.exists(texKey)) {
                    const canvasTex = this.textures.createCanvas(texKey, baseW, baseH);
                    const ctx = canvasTex.getContext();
                    ctx.clearRect(0, 0, baseW, baseH);

                    ctx.drawImage(
                        src,
                        baseFrame.cutX,
                        baseFrame.cutY,
                        baseFrame.cutWidth,
                        baseFrame.cutHeight,
                        baseFrame.x,
                        baseFrame.y,
                        baseFrame.cutWidth,
                        baseFrame.cutHeight
                    );

                    const bowSrc = bowFrame.source.image;
                    const bx = frameOffsets[dir][i].x;
                    const by = frameOffsets[dir][i].y;
                    const rot = rotations[dir];

                    ctx.save();
                    ctx.translate(bx + bowHalf, by + bowHalf);
                    ctx.rotate(rot);
                    ctx.drawImage(
                        bowSrc,
                        bowFrame.cutX,
                        bowFrame.cutY,
                        bowFrame.cutWidth,
                        bowFrame.cutHeight,
                        -bowHalf,
                        -bowHalf,
                        bowSize,
                        bowSize
                    );
                    ctx.restore();
                    canvasTex.refresh();
                }
                frames.push({ key: texKey });
            }

            this.anims.create({
                key: animKey,
                frames,
                frameRate: 14,
                repeat: 0
            });
        });
    }

    spawnBloodFx(x, y, count) {
        for (let i = 0; i < count; i++) {
            const p = this.add.rectangle(x, y, 2, 2, 0xdc2626).setDepth(11);
            this.bloodFx.push({
                p,
                vx: (Math.random() - 0.5) * 90,
                vy: -20 - Math.random() * 70,
                life: 0.35 + Math.random() * 0.45
            });
        }
    }

    spawnSparkleFx(x, y, count) {
        for (let i = 0; i < count; i++) {
            const p = this.add.circle(x, y, 1.6, 0xfef08a).setDepth(12);
            this.sparkleFx.push({
                p,
                vx: (Math.random() - 0.5) * 70,
                vy: -40 - Math.random() * 80,
                life: 0.45 + Math.random() * 0.35
            });
        }
    }

    updateBloodFx() {
        const dt = this.game.loop.delta / 1000;
        for (let i = this.bloodFx.length - 1; i >= 0; i--) {
            const fx = this.bloodFx[i];
            fx.life -= dt;
            if (fx.life <= 0) {
                fx.p.destroy();
                this.bloodFx.splice(i, 1);
                continue;
            }
            fx.vy += 120 * dt;
            fx.p.x += fx.vx * dt;
            fx.p.y += fx.vy * dt;
            fx.p.alpha = Math.max(0, fx.life / 0.8);
        }
    }

    updateSparkleFx() {
        const dt = this.game.loop.delta / 1000;
        for (let i = this.sparkleFx.length - 1; i >= 0; i--) {
            const fx = this.sparkleFx[i];
            fx.life -= dt;
            if (fx.life <= 0) {
                fx.p.destroy();
                this.sparkleFx.splice(i, 1);
                continue;
            }
            fx.vy += 40 * dt;
            fx.p.x += fx.vx * dt;
            fx.p.y += fx.vy * dt;
            fx.p.alpha = Math.max(0, fx.life / 0.7);
        }
    }

    updateTrailFx() {
        const dt = this.game.loop.delta / 1000;
        for (let i = this.trailFx.length - 1; i >= 0; i--) {
            const fx = this.trailFx[i];
            fx.life -= dt;
            if (fx.life <= 0) {
                fx.p.destroy();
                this.trailFx.splice(i, 1);
                continue;
            }
            fx.p.alpha = fx.life / fx.maxLife;
        }
    }

    isPlayerInSafeZone(player) {
        if (!player || player.map !== this.mapName || !this.safeZonesData.length) {
            return false;
        }
        return this.safeZonesData.some((z) => (
            player.x >= z.x &&
            player.x <= z.x + z.w &&
            player.y >= z.y &&
            player.y <= z.y + z.h
        ));
    }

    isPointInSafeZone(x, y) {
        if (!this.safeZonesData.length) {
            return false;
        }
        return this.safeZonesData.some((z) => (
            x >= z.x &&
            x <= z.x + z.w &&
            y >= z.y &&
            y <= z.y + z.h
        ));
    }

    spawnAmmoPopup(text) {
        if (!this.player) return;
        const t = this.add.text(this.player.x, this.player.y - 34, text, {
            font: "18px monospace",
            fill: "#16a34a",
            backgroundColor: "#ecfdf5",
            padding: { x: 4, y: 2 }
        }).setOrigin(0.5).setDepth(20);
        this.ammoPopups.push({ t, vy: -32, life: 0.9 });
    }

    spawnDamagePopup(x, y, amount, color) {
        if (!Number.isFinite(amount) || amount <= 0) return;
        const t = this.add.text(x, y, `-${amount}`, {
            font: "16px monospace",
            fill: color || "#ef4444",
            stroke: "#0b1220",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(18);
        this.damagePopups.push({ t, vy: -24, life: 0.9 });
    }

    spawnGreenBloodFx(x, y, count) {
        for (let i = 0; i < count; i++) {
            const p = this.add.rectangle(x, y, 2, 2, 0x22c55e).setDepth(11);
            this.bloodFx.push({
                p,
                vx: (Math.random() - 0.5) * 110,
                vy: -30 - Math.random() * 80,
                life: 0.45 + Math.random() * 0.45
            });
        }
    }

    updateAmmoPopups() {
        const dt = this.game.loop.delta / 1000;
        for (let i = this.ammoPopups.length - 1; i >= 0; i--) {
            const p = this.ammoPopups[i];
            p.life -= dt;
            if (p.life <= 0) {
                p.t.destroy();
                this.ammoPopups.splice(i, 1);
                continue;
            }
            p.t.y += p.vy * dt;
            p.t.alpha = Math.max(0, p.life / 0.9);
        }
    }

    updateDamagePopups() {
        const dt = this.game.loop.delta / 1000;
        for (let i = this.damagePopups.length - 1; i >= 0; i--) {
            const p = this.damagePopups[i];
            p.life -= dt;
            if (p.life <= 0) {
                p.t.destroy();
                this.damagePopups.splice(i, 1);
                continue;
            }
            p.t.y += p.vy * dt;
            p.t.alpha = Math.max(0, p.life / 0.9);
        }
    }

    syncSafeZones(zones) {
        const mapZones = zones.filter((z) => !z.map || z.map === this.mapName);
        this.safeZonesData = mapZones;
        if (this.safeZoneGraphics.length > 0) return;
        mapZones.forEach((z) => {
            const g = this.add.graphics().setDepth(4).setAlpha(0.22);
            g.fillStyle(0x60a5fa, 0.35);
            g.fillRect(z.x, z.y, z.w, z.h);
            g.lineStyle(2, 0x1d4ed8, 0.85);
            g.strokeRect(z.x, z.y, z.w, z.h);
            const t = this.add.text(z.x + 6, z.y + 6, "SAFE / RELOAD", {
                font: "12px monospace",
                fill: "#0b2447",
                backgroundColor: "#dbeafe"
            }).setDepth(5);
            this.safeZoneGraphics.push(g, t);
        });
    }

    syncArrows(arrows) {
        arrows = arrows.filter((a) => !a.map || a.map === this.mapName);
        const seen = new Set();
        arrows.forEach((a) => {
            seen.add(a.id);
            let view = this.arrowViews.get(a.id);
            if (!view) {
                if (this.textures.exists("arrow")) {
                    const sprite = this.add.image(a.x, a.y, "arrow").setDepth(14);
                    sprite.setScale(0.12);
                    view = { sprite };
                } else {
                    const tri = this.add.triangle(a.x, a.y, 9, 0, -7, 4.2, -7, -4.2, 0x0f172a).setDepth(14);
                    tri.setStrokeStyle(1, 0xffffff, 0.65);
                    const trail = this.add.line(a.x, a.y, -12, 0, -2, 0, 0x0f172a, 0.35).setDepth(13);
                    trail.setLineWidth(2, 2);
                    view = { tri, trail };
                }
                view._prevX = a.x;
                view._prevY = a.y;
                this.arrowViews.set(a.id, view);
            }

            // Spawn colored trail particles along the path since last tick
            const dx = a.x - view._prevX;
            const dy = a.y - view._prevY;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.5) {
                const charge = Math.min(1, Math.max(0, ((a.dmg || 8) - 8) / 24));
                const color = _arrowTrailColor(charge);
                const innerSize = 2 + charge * 4;
                const outerSize = innerSize * 2.8;
                const life = 0.18 + charge * 0.22;
                const count = 2 + Math.round(charge * 3);
                for (let i = 0; i < count; i++) {
                    const t = i / count;
                    const px = view._prevX + dx * t;
                    const py = view._prevY + dy * t;
                    // glow halo
                    const glow = this.add.rectangle(px, py, outerSize, outerSize, color)
                        .setDepth(11).setAlpha(0.28 + charge * 0.12);
                    this.trailFx.push({ p: glow, life, maxLife: life });
                    // bright core
                    const core = this.add.rectangle(px, py, innerSize, innerSize, color)
                        .setDepth(12).setAlpha(0.9);
                    this.trailFx.push({ p: core, life: life * 0.6, maxLife: life * 0.6 });
                }
            }
            view._prevX = a.x;
            view._prevY = a.y;

            const angle = Number.isFinite(a.angle) ? a.angle : 0;
            if (view.sprite) {
                view.sprite.setPosition(a.x, a.y);
                view.sprite.rotation = angle + Math.PI;
            } else {
                view.tri.setPosition(a.x, a.y);
                view.tri.rotation = angle;
                view.trail.setPosition(a.x, a.y);
                view.trail.rotation = angle;
            }
        });

        for (const [id, v] of this.arrowViews.entries()) {
            if (seen.has(id)) continue;
            if (v.sprite) {
                v.sprite.destroy();
            } else {
                v.tri.destroy();
                v.trail.destroy();
            }
            this.arrowViews.delete(id);
        }
    }

    updateHud() {
        if (!this.hudWrap) return;

        const hp = Math.round(this.localStats.hp || 0);
        const ammo = this.localStats.ammo || 0;
        const wolfHp = this.localStats.wolfHp || 0;
        const team = this.localStats.team || 0;
        const chargePct = Math.round((this.chargeTime / this.maxChargeSeconds) * 100);

        // HP bar + value
        if (this.hudHp) this.hudHp.textContent = String(hp);
        if (this.hudHpFill) {
            this.hudHpFill.style.width = `${hp}%`;
            this.hudHpFill.style.background = hp >= 60 ? "#22c55e" : hp >= 30 ? "#eab308" : "#ef4444";
        }

        // Ammo
        if (this.hudAmmo) this.hudAmmo.textContent = String(ammo);

        // Wolf HP bar + value
        if (this.hudScore) this.hudScore.textContent = wolfHp > 0 ? String(wolfHp) : "—";
        if (this.hudWolfFill) this.hudWolfFill.style.width = `${wolfHp}%`;

        // Charge bar + value
        if (this.hudCharge) this.hudCharge.textContent = `${chargePct}%`;
        if (this.hudChargeFill) {
            this.hudChargeFill.style.width = `${chargePct}%`;
            this.hudChargeFill.style.background =
                chargePct <= 33 ? "#93c5fd" :
                chargePct <= 66 ? "#fde047" :
                chargePct <= 83 ? "#f97316" : "#ef4444";
        }

        // Beasts
        if (this.hudBeasts) {
            const mine = this.lastStateBeasts.filter((b) => b.tamedBy === this.localSessionId).length;
            this.hudBeasts.textContent = String(mine);
        }

        // Team scores + active team highlight
        if (this.hudTeam1Score) this.hudTeam1Score.textContent = String(this.team1Score || 0);
        if (this.hudTeam2Score) this.hudTeam2Score.textContent = String(this.team2Score || 0);
        if (this.hudTeam1Card) this.hudTeam1Card.classList.toggle("is-you", team === 1);
        if (this.hudTeam2Card) this.hudTeam2Card.classList.toggle("is-you", team === 2);
    }

    destroyTransientViews() {
        for (const b of this.beastViews.values()) {
            if (b.type === "wolf") {
                b.sprite.destroy();
            } else {
                b.body.destroy();
                b.eyeLeft.destroy();
                b.eyeRight.destroy();
                b.mouth.destroy();
                b.armLeft.destroy();
                b.armRight.destroy();
            }
            b.hpBack.destroy();
            b.hpFill.destroy();
            if (b.tameDots) {
                for (const dot of b.tameDots) {
                    dot.destroy();
                }
            }
            if (b.pendingWolf) {
                b.pendingWolf.destroy();
            }
        }
        this.beastViews.clear();
        this.beastHpMemory.clear();
        this.beastTameMemory.clear();
        this.playerHpMemory.clear();
        for (const a of this.arrowViews.values()) {
            if (a.sprite) {
                a.sprite.destroy();
            } else {
                a.tri.destroy();
                a.trail.destroy();
            }
        }
        this.arrowViews.clear();
        for (const fx of this.bloodFx) {
            fx.p.destroy();
        }
        this.bloodFx = [];
        for (const fx of this.sparkleFx) {
            fx.p.destroy();
        }
        this.sparkleFx = [];
        for (const fx of this.trailFx) {
            fx.p.destroy();
        }
        this.trailFx = [];
        for (const p of this.ammoPopups) {
            p.t.destroy();
        }
        this.ammoPopups = [];
        for (const p of this.damagePopups) {
            p.t.destroy();
        }
        this.damagePopups = [];
        for (const b of this.bossViews.values()) {
            b.sprite.destroy();
            b.hpBack.destroy();
            b.hpFill.destroy();
        }
        this.bossViews.clear();
        this.bossHpMemory.clear();
        for (const s of this.bossShotViews.values()) {
            s.core.destroy();
            s.glow.destroy();
        }
        this.bossShotViews.clear();
        if (this.localDeadX) {
            this.localDeadX.destroy();
        }
        for (const s of this.safeZoneGraphics) {
            s.destroy();
        }
        this.safeZoneGraphics = [];
        for (const s of this.bossShotViews.values()) {
            s.core.destroy();
            s.glow.destroy();
        }
        this.bossShotViews.clear();
        if (this.wolfSprite) {
            this.wolfSprite.destroy();
            this.wolfSprite = null;
        }
        for (const ws of this.remoteWolfSprites.values()) {
            ws.destroy();
        }
        this.remoteWolfSprites.clear();
        for (const id of Object.keys(onlinePlayers)) {
            delete onlinePlayers[id];
        }
        this.clearSummoningRitual();
    }

    debugGraphics() {
        this.input.keyboard.once("keydown_D", () => {
            this.physics.world.createDebugGraphic();
            const graphics = this.add.graphics().setAlpha(0.75).setDepth(20);
            this.worldLayer.renderDebug(graphics, {
                tileColor: null,
                collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255),
                faceColor: new Phaser.Display.Color(40, 39, 37, 255)
            });
        });
    }
}

function getBowPose(facing) {
    switch (facing) {
        case "left":
            return { x: -11, y: 2, r: Math.PI / 2 };
        case "right":
            return { x: 5, y: 2, r: Math.PI / 2 };
        case "back":
            return { x: 3, y: -4, r: Math.PI / 2 };
        default:
            return { x: 3, y: 10, r: Math.PI / 2 };
    }
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// Arrow trail color: blue (uncharged) → yellow → orange → red (full charge)
function _arrowTrailColor(charge) {
    const stops = [0x93c5fd, 0xfde047, 0xf97316, 0xef4444];
    const t = Math.min(1, Math.max(0, charge)) * (stops.length - 1);
    const i = Math.min(Math.floor(t), stops.length - 2);
    const f = t - i;
    const a = stops[i], b = stops[i + 1];
    const ch = (ca, cb) => Math.round(ca + (cb - ca) * f);
    return (ch((a >> 16) & 0xff, (b >> 16) & 0xff) << 16) |
           (ch((a >>  8) & 0xff, (b >>  8) & 0xff) <<  8) |
            ch( a        & 0xff,  b        & 0xff);
}

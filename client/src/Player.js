import Phaser from "phaser";
import { getRoom } from "./SocketServer";

const DOOR_TRANSITIONS = {
    town: {
        DoorA: { map: "interior_door_a", playerTexturePosition: "front" },
        DoorB: { map: "interior_door_b", playerTexturePosition: "front" }
    },
    interior_door_a: {
        ExitDoor: { map: "town", playerTexturePosition: "front" }
    },
    interior_door_b: {
        ExitDoor: { map: "town", playerTexturePosition: "front" }
    }
};

function readDoorTransition(obj, mapTransitions) {
    if (mapTransitions && mapTransitions[obj.name]) {
        return mapTransitions[obj.name];
    }

    const props = Array.isArray(obj.properties) ? obj.properties : [];
    const targetMapProp = props.find((p) => p && (p.name === "targetMap" || p.name === "map"));
    const facingProp = props.find((p) => p && (p.name === "facing" || p.name === "playerTexturePosition"));
    if (!targetMapProp || !targetMapProp.value) {
        return null;
    }

    return {
        map: targetMapProp.value,
        playerTexturePosition: (facingProp && facingProp.value) || "front"
    };
}

export default class Player extends Phaser.GameObjects.Sprite {
    constructor(config) {
        super(config.scene, config.x, config.y, config.key);

        this.scene.add.existing(this);
        this.scene.physics.world.enableBody(this);
        this.scene.physics.add.collider(this, config.worldLayer);

        this.model = this.scene.playerModel || "misa";
        this.setTexture("players", `${this.model}_${this.scene.playerTexturePosition}.png`).setScale(1.9, 2.1);
        this.facing = this.scene.playerTexturePosition || "front";
        this.bowIndex = Number.isFinite(this.scene.playerBowIndex) ? this.scene.playerBowIndex : 0;

        // Register cursors for player movement
        this.cursors = this.scene.input.keyboard.createCursorKeys();
        this.wasd = this.scene.input.keyboard.addKeys("W,A,S,D");

        // Player Offset
        this.body.setOffset(0, 24);

        // Player can't go out of the world
        this.body.setCollideWorldBounds(true)

        // Set depth (z-index)
        this.setDepth(5);

        // Container to store old data
        this.container = [];

        // Player speed
        this.speed = 150;

        this.canChangeMap = true;
        this.nextDoorUseAt = 0;
        this.shootLockUntil = 0;

        this._team = 0;

        // Player nickname text
        this.playerNickname = this.scene.add.text(
            (this.x - this.width * 1.4), (this.y - (this.height / 2) - 30),
            this.scene.playerName || "Player",
            { color: "#ffffff", stroke: "#000000", strokeThickness: 2 }
        );

        // Interaction key (combat uses SPACE)
        this.interactKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.enterKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.spacebar = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    update(time, delta) {
        const prevVelocity = this.body.velocity.clone();

        // Show player nickname above player
        this.showPlayerNickname();

        // Player door interaction
        this.doorInteraction();

        // Stop any previous movement from the last frame
        this.body.setVelocity(0);

        // Horizontal movement
        if (this.cursors.left.isDown || this.wasd.A.isDown) {
            this.body.setVelocityX(-this.speed);
        } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
            this.body.setVelocityX(this.speed);
        }

        // Vertical movement
        if (this.cursors.up.isDown || this.wasd.W.isDown) {
            this.body.setVelocityY(-this.speed);
        } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
            this.body.setVelocityY(this.speed);
        }

        // Normalize and scale the velocity so that player can't move faster along a diagonal
        this.body.velocity.normalize().scale(this.speed);

        const shootLocked = this.shootLockUntil && this.scene.time.now < this.shootLockUntil;

        // Update the animation last and give left/right animations precedence over up/down animations
        if (!shootLocked) {
            if (this.cursors.left.isDown || this.wasd.A.isDown) {
                this.anims.play(`${this.model}-left-walk`, true);
                this.facing = "left";
            } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
                this.anims.play(`${this.model}-right-walk`, true);
                this.facing = "right";
            } else if (this.cursors.up.isDown || this.wasd.W.isDown) {
                this.anims.play(`${this.model}-back-walk`, true);
                this.facing = "back";
            } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
                this.anims.play(`${this.model}-front-walk`, true);
                this.facing = "front";
            } else {
                this.anims.stop();

                // If we were moving, pick and idle frame to use
                if (prevVelocity.x < 0) {
                    this.setTexture("players", `${this.model}_left.png`);
                    this.facing = "left";
                } else if (prevVelocity.x > 0) {
                    this.setTexture("players", `${this.model}_right.png`);
                    this.facing = "right";
                } else if (prevVelocity.y < 0) {
                    this.setTexture("players", `${this.model}_back.png`);
                    this.facing = "back";
                } else if (prevVelocity.y > 0) {
                    this.setTexture("players", `${this.model}_front.png`);
                    this.facing = "front";
                }
            }
        } else {
            const shootKey = `${this.model}-${this.facing}-shoot-b${this.bowIndex}`;
            if (this.anims.exists(shootKey)) {
                this.anims.play(shootKey, true);
            } else {
                const fallback = `${this.model}-${this.facing}-shoot`;
                if (this.anims.exists(fallback)) {
                    this.anims.play(fallback, true);
                    return;
                }
                this.anims.stop();
                this.setTexture("players", `${this.model}_${this.facing}.png`);
            }
        }
    }

    setTeamColor(team) {
        if (team === this._team) return;
        this._team = team;
        const color = team === 1 ? "#60a5fa" : team === 2 ? "#f87171" : "#ffffff";
        this.playerNickname.setColor(color);
    }

    showPlayerNickname() {
        this.playerNickname.x = this.x - (this.playerNickname.width / 2);
        this.playerNickname.y = this.y - (this.height / 2);
    }

    isMoved() {
        if (this.container.oldPosition && (this.container.oldPosition.x !== this.x || this.container.oldPosition.y !== this.y)) {
            this.container.oldPosition = {x: this.x, y: this.y};
            return true;
        } else {
            this.container.oldPosition = {x: this.x, y: this.y};
            return false;
        }
    }

    doorInteraction() {
        const transitionMap = DOOR_TRANSITIONS[this.scene.mapName] || {};

        const now = this.scene.time.now;
        if (now < this.nextDoorUseAt) {
            return;
        }

        const pressedDoorKey =
            Phaser.Input.Keyboard.JustDown(this.interactKey) ||
            Phaser.Input.Keyboard.JustDown(this.enterKey);

        const px = this.body && this.body.center ? this.body.center.x : this.x;
        const py = this.body && this.body.center ? this.body.center.y : this.y;
        let usedDoor = false;
        let nearDoor = false;

        const doorsLayer = this.scene.map.getObjectLayer("Doors");
        const doorObjects = (doorsLayer && Array.isArray(doorsLayer.objects)) ? doorsLayer.objects : [];

        doorObjects.some((obj) => {
            const transition = readDoorTransition(obj, transitionMap);
            if (!transition) {
                return false;
            }

            // Expanded interaction bounds makes door use reliable with sprite/body offsets.
            const pad = 34;
            const minX = obj.x - pad;
            const maxX = obj.x + obj.width + pad;
            const minY = obj.y - pad;
            const maxY = obj.y + obj.height + pad;

            if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                nearDoor = true;
                if (!pressedDoorKey) {
                    return false;
                }
                this.nextDoorUseAt = now + 350;
                this.changeMap(transition.map, transition.playerTexturePosition);
                usedDoor = true;
                return true;
            }
            return false;
        });

        if (this.scene.doorHint) {
            this.scene.doorHint.setVisible(nearDoor);
        }

        if (!usedDoor) {
            return;
        }
    }

    worldInteraction() {
        this.scene.map.findObject("Worlds", world => {
            if ((this.y >= world.y && this.y <= (world.y + world.height)) && (this.x >= world.x && this.x <= (world.x + world.width))) {
                console.log('Player is by world entry: ' + world.name);

                const props = Array.isArray(world.properties) ? world.properties : [];
                const mapKeys = new Set(this.scene.cache.tilemap.getKeys());

                // Get playerTexturePosition from from Worlds object property
                const playerTexturePosition = props.find((property) => property.name === "playerTexturePosition");
                if (playerTexturePosition) this.playerTexturePosition = playerTexturePosition.value;

                const mapByName = props.find((property) => mapKeys.has(property.name));
                const mapByValue = props.find((property) => mapKeys.has(property.value));
                const targetProp = props.find((property) => (
                    property.name === "targetMap" || property.name === "map" || property.name === "world"
                ));
                const targetMap = (mapByName && mapByName.name)
                    || (mapByValue && mapByValue.value)
                    || (targetProp && targetProp.value)
                    || world.name;
                if (!targetMap) return;

                // Load new level (tiles map)
                this.changeMap(targetMap, this.playerTexturePosition);
            }
        });
    }

    getMapSpawn(mapName, fromMap) {
        const tilemap = this.scene.cache.tilemap.get(mapName);
        const data = tilemap && tilemap.data;
        if (!data || !Array.isArray(data.layers)) {
            return { x: this.x, y: this.y };
        }

        const spawnLayer = data.layers.find((layer) => layer.name === "SpawnPoints" && layer.type === "objectgroup");
        const spawns = spawnLayer && Array.isArray(spawnLayer.objects)
            ? spawnLayer.objects.filter((o) => o.name === "Spawn Point")
            : [];

        const matchesFromMap = (obj) => {
            if (!fromMap) return false;
            const props = Array.isArray(obj.properties) ? obj.properties : [];
            return props.some((p) => {
                if (!p) return false;
                if (p.name === "map" || p.name === "fromMap" || p.name === "targetMap") {
                    return p.value === fromMap;
                }
                return p.name === fromMap || p.value === fromMap;
            });
        };

        const spawn = spawns.find(matchesFromMap) || spawns[0] || null;

        if (!spawn || !Number.isFinite(spawn.x) || !Number.isFinite(spawn.y)) {
            return { x: this.x, y: this.y };
        }

        return { x: spawn.x, y: spawn.y };
    }

    changeMap(targetMap, targetFacing) {
        const spawn = this.getMapSpawn(targetMap, this.scene.mapName);
        this.scene.registry.destroy();
        this.scene.events.off();
        this.scene.scene.restart({
            map: targetMap,
            playerTexturePosition: targetFacing || this.playerTexturePosition || "front",
            playerProfile: {
                name: this.scene.playerName,
                model: this.scene.playerModel,
                bow: this.scene.playerBowIndex
            },
            spawn
        });

        const room = getRoom();
        if (room) {
            room.then((joinedRoom) => joinedRoom.send("PLAYER_CHANGED_MAP", {
                map: targetMap,
                x: spawn.x,
                y: spawn.y
            }));
        }
    }

    triggerShootAnimation() {
        this.shootLockUntil = this.scene.time.now + 180;
        const shootKey = `${this.model}-${this.facing}-shoot-b${this.bowIndex}`;
        if (this.anims.exists(shootKey)) {
            this.anims.play(shootKey, true);
            return;
        }
        const fallback = `${this.model}-${this.facing}-shoot`;
        if (this.anims.exists(fallback)) {
            this.anims.play(fallback, true);
        }
    }
}

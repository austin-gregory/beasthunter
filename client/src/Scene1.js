import TownJSON from "./assets/tilemaps/town.json";
import TilesTown from "./assets/tilesets/tuxmon-sample-32px-extruded.png";

import Route1JSON from "./assets/tilemaps/route1";
import Route2JSON from "./assets/tilemaps/route2";
import InteriorDoorAJSON from "./assets/tilemaps/interior_door_a.json";
import InteriorDoorBJSON from "./assets/tilemaps/interior_door_b.json";

import PlayersAtlasJSON from "./assets/atlas/players";
import PlayersAtlasPNG from "./assets/images/players/players.png";
import BeastWolfPNG from "./assets/images/wolf_gray_full.png";
import BeastTigerPNG from "./assets/images/OrangeTabby-Idle.png";
import BeastTigerRunPNG from "./assets/images/OrangeTabby-Run.png";
import BeastSpiderPNG from "./assets/images/spider.png";
import BowPackPNG from "./assets/images/Bow Pack Black.png";
import ArrowPNG from "./assets/images/arrow.png";
import SpiderwebPNG from "./assets/images/spiderweb.png";
import { PLAYER_MODELS } from "./playerModels";

export class Scene1 extends Phaser.Scene {
    constructor() {
        super("bootGame");
    }

    init(data) {
        this.playerProfile = data.playerProfile || { name: "Player", model: "misa" };
    }

    preload() {
        // Load Town
        this.load.image("TilesTown", TilesTown);
        this.load.tilemapTiledJSON("town", TownJSON);

        // Load Route1
        this.load.tilemapTiledJSON("route1", Route1JSON);
        this.load.tilemapTiledJSON("route2", Route2JSON);
        this.load.tilemapTiledJSON("interior_door_a", InteriorDoorAJSON);
        this.load.tilemapTiledJSON("interior_door_b", InteriorDoorBJSON);

        // Load player atlas
        this.load.atlas("players", PlayersAtlasPNG, PlayersAtlasJSON);
        this.load.spritesheet("bows", BowPackPNG, { frameWidth: 24, frameHeight: 24 });
        this.load.spritesheet("beast-wolf", BeastWolfPNG, { frameWidth: 32, frameHeight: 36 });
        this.load.spritesheet("beast-tiger", BeastTigerPNG, { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet("beast-tiger-run", BeastTigerRunPNG, { frameWidth: 48, frameHeight: 48 });
        this.load.image("beast-spider", BeastSpiderPNG);
        this.load.image("arrow", ArrowPNG);
        this.load.image("spiderweb", SpiderwebPNG);
    }

    create() {
        this.add.text(20, 20, "Loading game...");

        this.createModelAnimations();
        this.createBeastAnimations();

        this.scene.start("playGame", {
            map: "town",
            playerTexturePosition: "front",
            playerProfile: this.playerProfile
        });
    }

    createModelAnimations() {
        const directions = ["left", "right", "front", "back"];

        PLAYER_MODELS.forEach((model) => {
            directions.forEach((direction) => {
                const animationKey = `${model}-${direction}-walk`;
                if (this.anims.exists(animationKey)) {
                    return;
                }

                this.anims.create({
                    key: animationKey,
                    frames: this.anims.generateFrameNames("players", {
                        start: 0,
                        end: 3,
                        zeroPad: 3,
                        prefix: `${model}_${direction}_walk.`,
                        suffix: ".png"
                    }),
                    frameRate: 10,
                    repeat: -1
                });

                const shootKey = `${model}-${direction}-shoot`;
                if (!this.anims.exists(shootKey)) {
                    const tex = this.textures.get("players");
                    const hasShoot = tex && tex.has(`${model}_${direction}_shoot.000.png`);
                    if (hasShoot) {
                        this.anims.create({
                            key: shootKey,
                            frames: this.anims.generateFrameNames("players", {
                                start: 0,
                                end: 2,
                                zeroPad: 3,
                                prefix: `${model}_${direction}_shoot.`,
                                suffix: ".png"
                            }),
                            frameRate: 14,
                            repeat: 0
                        });
                    } else if (tex && tex.has(`${model}_${direction}_shoot.png`)) {
                        this.anims.create({
                            key: shootKey,
                            frames: [{ key: "players", frame: `${model}_${direction}_shoot.png` }],
                            frameRate: 12,
                            repeat: 0
                        });
                    }
                }
            });
        });
    }

    createBeastAnimations() {
        if (!this.anims.exists("beast-wolf-walk")) {
            this.anims.create({
                key: "beast-wolf-walk",
                frames: this.anims.generateFrameNumbers("beast-wolf", { start: 0, end: 5 }),
                frameRate: 8,
                repeat: -1
            });
        }
        if (!this.anims.exists("beast-tiger-idle")) {
            this.anims.create({
                key: "beast-tiger-idle",
                frames: this.anims.generateFrameNumbers("beast-tiger", { start: 0, end: 11 }),
                frameRate: 10,
                repeat: -1
            });
        }
        if (!this.anims.exists("beast-tiger-run")) {
            this.anims.create({
                key: "beast-tiger-run",
                frames: this.anims.generateFrameNumbers("beast-tiger-run", { start: 0, end: 5 }),
                frameRate: 10,
                repeat: -1
            });
        }
    }
}

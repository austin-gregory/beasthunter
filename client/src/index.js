import Phaser from "phaser";
import { SceneMenu } from "./SceneMenu";
import { Scene1 } from "./Scene1";
import { Scene2 } from "./Scene2";

const Config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720
    },
    parent: "game-view",
    pixelArt: true,
    physics: {
        default: "arcade",
        arcade: {
            gravity: {y: 0}
        }
    },
    scene: [SceneMenu, Scene1, Scene2],
};

export default new Phaser.Game(Config);

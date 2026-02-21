import Phaser from "phaser";
import { connectPlayer } from "./SocketServer";
import { PLAYER_MODELS, sanitizePlayerName } from "./playerModels";
import PlayersAtlasJSON from "./assets/atlas/players";
import PlayersAtlasPNG from "./assets/images/players/players.png";
import BowPackPNG from "./assets/images/Bow Pack Black.png";
import BeastHunterMenuPNG from "./assets/images/beasthuntermenu.png";

const MODEL_CARD_W = 260;
const MODEL_CARD_H = 200;
const MODEL_ICON_SCALE = 2.8;
const BOW_CARD_W = 200;
const BOW_CARD_H = 160;
const BOW_ICON_SCALE = 2.0;
const TOTAL_BOWS = 36;

export class SceneMenu extends Phaser.Scene {
    constructor() {
        super("menuScene");
    }

    init() {
        this.selectedModelIndex = 0;
        this.selectedBowIndex = 0;
        this.playerName = "";
        this.isConnecting = false;
        this.cursorVisible = true;
    }

    preload() {
        this.load.atlas("players", PlayersAtlasPNG, PlayersAtlasJSON);
        this.load.spritesheet("bows", BowPackPNG, { frameWidth: 24, frameHeight: 24 });
        this.load.image("beasthunter-logo", BeastHunterMenuPNG);
    }

    create() {
        const { width, height } = this.cameras.main;
        const centerX = width / 2;

        this.drawBackground(width, height);

        this.add.image(centerX, 120, "beasthunter-logo").setScale(0.65);

        this.add.text(centerX, 135, "Choose your hunter", {
            fontFamily: "Trebuchet MS",
            fontSize: "20px",
            color: "#0f766e"
        }).setOrigin(0.5);

        this.nameLabel = this.add.text(centerX, 175, "Your name", {
            fontFamily: "Trebuchet MS",
            fontSize: "16px",
            color: "#0f172a"
        }).setOrigin(0.5);

        this.nameBox = this.add.rectangle(centerX, 215, 420, 48, 0xf0fdf4)
            .setStrokeStyle(3, 0x22c55e)
            .setOrigin(0.5);

        this.nameText = this.add.text(centerX, 215, "", {
            fontFamily: "Trebuchet MS",
            fontSize: "22px",
            color: "#0f172a"
        }).setOrigin(0.5);

        const modelX = centerX - 180;
        const bowX = centerX + 220;
        const cardY = 380;

        this.add.text(modelX, 290, "Model", {
            fontFamily: "Trebuchet MS",
            fontSize: "18px",
            color: "#0f172a"
        }).setOrigin(0.5);

        this.add.text(bowX, 290, "Bow", {
            fontFamily: "Trebuchet MS",
            fontSize: "18px",
            color: "#0f172a"
        }).setOrigin(0.5);

        this.modelCard = this.add.rectangle(modelX, cardY, MODEL_CARD_W, MODEL_CARD_H, 0xf8fafc)
            .setStrokeStyle(3, 0x94a3b8)
            .setOrigin(0.5);

        this.modelSprite = this.add.sprite(modelX, cardY - 10, "players", "misa_front.png")
            .setScale(MODEL_ICON_SCALE)
            .setOrigin(0.5);

        this.modelLabel = this.add.text(modelX, cardY + 70, "", {
            fontFamily: "Trebuchet MS",
            fontSize: "16px",
            color: "#334155"
        }).setOrigin(0.5);

        this.modelLeft = this.makeArrowButton(modelX - MODEL_CARD_W / 2 - 24, cardY, "<", () => {
            this.selectedModelIndex = (this.selectedModelIndex - 1 + PLAYER_MODELS.length) % PLAYER_MODELS.length;
            this.updateModelSelection();
        });
        this.modelRight = this.makeArrowButton(modelX + MODEL_CARD_W / 2 + 24, cardY, ">", () => {
            this.selectedModelIndex = (this.selectedModelIndex + 1) % PLAYER_MODELS.length;
            this.updateModelSelection();
        });

        this.bowCard = this.add.rectangle(bowX, cardY, BOW_CARD_W, BOW_CARD_H, 0xf8fafc)
            .setStrokeStyle(3, 0x94a3b8)
            .setOrigin(0.5);

        this.bowSprite = this.add.sprite(bowX, cardY - 6, "bows", 0)
            .setScale(BOW_ICON_SCALE)
            .setOrigin(0.5);

        this.bowLabel = this.add.text(bowX, cardY + 52, "Style 1", {
            fontFamily: "Trebuchet MS",
            fontSize: "14px",
            color: "#334155"
        }).setOrigin(0.5);

        this.bowLeft = this.makeArrowButton(bowX - BOW_CARD_W / 2 - 24, cardY, "<", () => {
            this.selectedBowIndex = (this.selectedBowIndex - 1 + TOTAL_BOWS) % TOTAL_BOWS;
            this.updateBowSelection();
        });
        this.bowRight = this.makeArrowButton(bowX + BOW_CARD_W / 2 + 24, cardY, ">", () => {
            this.selectedBowIndex = (this.selectedBowIndex + 1) % TOTAL_BOWS;
            this.updateBowSelection();
        });

        this.helpText = this.add.text(centerX, height - 36, "Model: ←/→  Bow: A/D  •  Type name  •  Enter: join", {
            fontFamily: "Trebuchet MS",
            fontSize: "16px",
            color: "#0f766e"
        }).setOrigin(0.5);

        this.statusText = this.add.text(centerX, height - 14, "", {
            fontFamily: "Trebuchet MS",
            fontSize: "15px",
            color: "#b91c1c"
        }).setOrigin(0.5);

        this.updateNameText();
        this.updateModelSelection();
        this.updateBowSelection();

        this.keyHandler = (event) => this.onKeyDown(event);
        this.input.keyboard.on("keydown", this.keyHandler);

        this.cursorTimer = this.time.addEvent({
            delay: 450,
            loop: true,
            callback: () => {
                this.cursorVisible = !this.cursorVisible;
                this.updateNameText();
            }
        });

        this.events.once("shutdown", () => {
            this.input.keyboard.off("keydown", this.keyHandler);
            if (this.cursorTimer) this.cursorTimer.destroy();
        });
    }

    drawBackground(width, height) {
        const g = this.add.graphics();
        g.fillGradientStyle(0xc7f9cc, 0x86efac, 0x22c55e, 0x16a34a, 1);
        g.fillRect(0, 0, width, height);
        const ribbon = this.add.rectangle(width / 2, 110, width, 120, 0xffffff, 0.35);
        ribbon.setOrigin(0.5);
    }

    makeArrowButton(x, y, label, onClick) {
        const box = this.add.rectangle(x, y, 36, 36, 0xf8fafc)
            .setStrokeStyle(2, 0x94a3b8)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x, y - 2, label, {
            fontFamily: "Trebuchet MS",
            fontSize: "22px",
            color: "#0f172a"
        }).setOrigin(0.5);
        box.on("pointerdown", onClick);
        txt.on("pointerdown", onClick);
        return { box, txt };
    }

    updateNameText() {
        const displayName = this.playerName || "";
        const cursor = this.cursorVisible ? "▌" : "";
        this.nameText.setText(displayName ? `${displayName}${cursor}` : `_${cursor}`);
    }

    updateModelSelection() {
        const model = PLAYER_MODELS[this.selectedModelIndex];
        this.modelSprite.setTexture("players", `${model}_front.png`);
        this.modelLabel.setText(model);
        this.modelCard.setStrokeStyle(3, 0x16a34a);
    }

    updateBowSelection() {
        this.bowSprite.setFrame(this.selectedBowIndex);
        this.bowLabel.setText(`Style ${this.selectedBowIndex + 1}`);
        this.bowCard.setStrokeStyle(3, 0x16a34a);
    }

    onKeyDown(event) {
        if (this.isConnecting) {
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.BACKSPACE) {
            this.playerName = this.playerName.slice(0, -1);
            this.updateNameText();
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.LEFT) {
            this.selectedModelIndex = (this.selectedModelIndex - 1 + PLAYER_MODELS.length) % PLAYER_MODELS.length;
            this.updateModelSelection();
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.RIGHT) {
            this.selectedModelIndex = (this.selectedModelIndex + 1) % PLAYER_MODELS.length;
            this.updateModelSelection();
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.A) {
            this.selectedBowIndex = (this.selectedBowIndex - 1 + TOTAL_BOWS) % TOTAL_BOWS;
            this.updateBowSelection();
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.D) {
            this.selectedBowIndex = (this.selectedBowIndex + 1) % TOTAL_BOWS;
            this.updateBowSelection();
            return;
        }

        if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER) {
            this.startGame();
            return;
        }

        if (event.key && event.key.length === 1 && this.playerName.length < 16) {
            if (/^[a-zA-Z0-9 _-]$/.test(event.key)) {
                this.playerName += event.key;
                this.updateNameText();
            }
        }
    }

    startGame() {
        this.isConnecting = true;
        this.statusText.setText("Connecting...");

        const playerProfile = {
            name: sanitizePlayerName(this.playerName),
            model: PLAYER_MODELS[this.selectedModelIndex],
            bow: this.selectedBowIndex
        };

        connectPlayer(playerProfile)
            .then(() => {
                this.scene.start("bootGame", { playerProfile });
            })
            .catch(() => {
                this.isConnecting = false;
                this.statusText.setText("Connection failed. Press Enter to retry.");
            });
    }
}

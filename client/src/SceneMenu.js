import Phaser from "phaser";
import { connectPlayer } from "./SocketServer";
import { PLAYER_MODELS, sanitizePlayerName } from "./playerModels";
import PlayersAtlasJSON from "./assets/atlas/players";
import PlayersAtlasPNG from "./assets/images/players/players.png";
import BowPackPNG from "./assets/images/Bow Pack Black.png";
import BeastHunterMenuPNG from "./assets/images/beasthuntermenu.png";

const CARD_W         = 148;
const CARD_H         = 152;
const MODEL_ICON_SCALE = 3.0;
const BOW_ICON_SCALE   = 2.6;
const TOTAL_BOWS       = 36;
const ARROW_OFFSET     = CARD_W / 2 + 22;   // px from card center to arrow btn

export class SceneMenu extends Phaser.Scene {
    constructor() {
        super("menuScene");
    }

    init() {
        this.selectedModelIndex = 0;
        this.selectedBowIndex   = 0;
        this.selectedTeam       = 1;
        this.playerName         = "";
        this.isConnecting       = false;
        this.cursorVisible      = true;
    }

    preload() {
        this.load.atlas("players", PlayersAtlasPNG, PlayersAtlasJSON);
        this.load.spritesheet("bows", BowPackPNG, { frameWidth: 24, frameHeight: 24 });
        this.load.image("beasthunter-logo", BeastHunterMenuPNG);
    }

    create() {
        const { width, height } = this.cameras.main;
        const cx = width / 2;

        // ── Full-screen logo background ──────────────────────────────────────
        const logo = this.add.image(cx, height / 2, "beasthunter-logo").setDepth(0);
        const logoTex = this.textures.get("beasthunter-logo");
        if (logoTex && logoTex.getSourceImage()) {
            const img = logoTex.getSourceImage();
            const scale = Math.max(width / img.width, height / img.height);
            logo.setScale(scale);
        } else {
            logo.setDisplaySize(width, height);
        }

        // ── Dark overlay covering the bottom half for UI readability ─────────
        this.overlay = this.add.rectangle(cx, height, width, height * 0.52, 0x0a0f1a, 0.82)
            .setOrigin(0.5, 1).setDepth(1);

        // ── Name input ───────────────────────────────────────────────────────
        const nameY = height * 0.545;
        this.nameLabel = this.add.text(cx, nameY, "Your Name", {
            fontFamily: "Trebuchet MS",
            fontSize: "15px",
            color: "#64748b",
            letterSpacing: 2
        }).setOrigin(0.5).setDepth(2);

        this.nameBox = this.add.rectangle(cx, nameY + 32, 320, 42, 0x1e293b)
            .setStrokeStyle(2, 0x334155).setOrigin(0.5).setDepth(2);

        this.nameText = this.add.text(cx, nameY + 32, "", {
            fontFamily: "Trebuchet MS",
            fontSize: "20px",
            color: "#e2e8f0"
        }).setOrigin(0.5).setDepth(3);

        // ── Three pickers, evenly spaced ─────────────────────────────────────
        const pickerXL = width * 0.20;
        const pickerXC = cx;
        const pickerXR = width * 0.80;
        const cardY    = height * 0.785;
        const labelY   = cardY - CARD_H / 2 - 20;

        // ── Hunter picker ────────────────────────────────────────────────────
        this.hunterLabel = this.add.text(pickerXL, labelY, "Hunter", {
            fontFamily: "Trebuchet MS", fontSize: "15px",
            color: "#94a3b8", letterSpacing: 1
        }).setOrigin(0.5).setDepth(2);

        this.modelCard = this.add.rectangle(pickerXL, cardY, CARD_W, CARD_H, 0x1e293b)
            .setStrokeStyle(3, 0xa855f7).setOrigin(0.5).setDepth(2);
        this.modelGlow = this.add.rectangle(pickerXL, cardY, CARD_W + 12, CARD_H + 12, 0xa855f7, 0.12)
            .setOrigin(0.5).setDepth(1);

        this.modelSprite = this.add.sprite(pickerXL, cardY - 12, "players", "misa_front.png")
            .setScale(MODEL_ICON_SCALE).setOrigin(0.5).setDepth(3);

        this.modelLabel = this.add.text(pickerXL, cardY + CARD_H / 2 - 22, "", {
            fontFamily: "Trebuchet MS", fontSize: "13px", color: "#94a3b8"
        }).setOrigin(0.5).setDepth(3);

        this.modelLeft  = this.makeArrowButton(pickerXL - ARROW_OFFSET, cardY, "<", () => {
            this.selectedModelIndex = (this.selectedModelIndex - 1 + PLAYER_MODELS.length) % PLAYER_MODELS.length;
            this.updateModelSelection();
        });
        this.modelRight = this.makeArrowButton(pickerXL + ARROW_OFFSET, cardY, ">", () => {
            this.selectedModelIndex = (this.selectedModelIndex + 1) % PLAYER_MODELS.length;
            this.updateModelSelection();
        });

        // ── Bow picker ───────────────────────────────────────────────────────
        this.bowPickerLabel = this.add.text(pickerXC, labelY, "Bow", {
            fontFamily: "Trebuchet MS", fontSize: "15px",
            color: "#94a3b8", letterSpacing: 1
        }).setOrigin(0.5).setDepth(2);

        this.bowCard = this.add.rectangle(pickerXC, cardY, CARD_W, CARD_H, 0x1e293b)
            .setStrokeStyle(3, 0xa855f7).setOrigin(0.5).setDepth(2);
        this.bowGlow = this.add.rectangle(pickerXC, cardY, CARD_W + 12, CARD_H + 12, 0xa855f7, 0.12)
            .setOrigin(0.5).setDepth(1);

        this.bowSprite = this.add.sprite(pickerXC, cardY - 6, "bows", 0)
            .setScale(BOW_ICON_SCALE).setOrigin(0.5).setDepth(3);

        this.bowLabel = this.add.text(pickerXC, cardY + CARD_H / 2 - 22, "Style 1", {
            fontFamily: "Trebuchet MS", fontSize: "13px", color: "#94a3b8"
        }).setOrigin(0.5).setDepth(3);

        this.bowLeft  = this.makeArrowButton(pickerXC - ARROW_OFFSET, cardY, "<", () => {
            this.selectedBowIndex = (this.selectedBowIndex - 1 + TOTAL_BOWS) % TOTAL_BOWS;
            this.updateBowSelection();
        });
        this.bowRight = this.makeArrowButton(pickerXC + ARROW_OFFSET, cardY, ">", () => {
            this.selectedBowIndex = (this.selectedBowIndex + 1) % TOTAL_BOWS;
            this.updateBowSelection();
        });

        // ── Team picker ──────────────────────────────────────────────────────
        this.teamPickerLabel = this.add.text(pickerXR, labelY, "Team", {
            fontFamily: "Trebuchet MS", fontSize: "15px",
            color: "#94a3b8", letterSpacing: 1
        }).setOrigin(0.5).setDepth(2);

        this.teamCard = this.add.rectangle(pickerXR, cardY, CARD_W, CARD_H, 0x1e293b)
            .setStrokeStyle(3, 0x3b82f6).setOrigin(0.5).setDepth(2);
        this.teamGlow = this.add.rectangle(pickerXR, cardY, CARD_W + 12, CARD_H + 12, 0x3b82f6, 0.12)
            .setOrigin(0.5).setDepth(1);

        this.teamNameText = this.add.text(pickerXR, cardY - 18, "Team 1", {
            fontFamily: "Trebuchet MS", fontSize: "22px",
            fontStyle: "bold", color: "#60a5fa"
        }).setOrigin(0.5).setDepth(3);

        this.teamDot = this.add.circle(pickerXR, cardY + 18, 18, 0x3b82f6)
            .setDepth(3);

        this.teamSubLabel = this.add.text(pickerXR, cardY + CARD_H / 2 - 22, "Blue", {
            fontFamily: "Trebuchet MS", fontSize: "13px", color: "#94a3b8"
        }).setOrigin(0.5).setDepth(3);

        const cycleTeam = () => {
            this.selectedTeam = this.selectedTeam === 1 ? 2 : 1;
            this.updateTeamSelection();
        };
        this.teamLeft  = this.makeArrowButton(pickerXR - ARROW_OFFSET, cardY, "<", cycleTeam);
        this.teamRight = this.makeArrowButton(pickerXR + ARROW_OFFSET, cardY, ">", cycleTeam);

        // ── Join button ──────────────────────────────────────────────────────
        const joinY = height * 0.945;
        this.joinButton = this.add.rectangle(cx, joinY, 200, 46, 0x22c55e)
            .setStrokeStyle(2, 0x15803d).setOrigin(0.5).setDepth(2)
            .setInteractive({ useHandCursor: true });
        this.joinText = this.add.text(cx, joinY, "JOIN GAME", {
            fontFamily: "Trebuchet MS", fontSize: "18px",
            fontStyle: "bold", color: "#0f172a"
        }).setOrigin(0.5).setDepth(3);

        this.joinButton.on("pointerdown", () => this.startGame());
        this.joinText.on("pointerdown", () => this.startGame());

        this.statusText = this.add.text(cx, height - 6, "", {
            fontFamily: "Trebuchet MS", fontSize: "14px", color: "#f87171"
        }).setOrigin(0.5, 1).setDepth(3);

        // ── UI objects for exit animation ────────────────────────────────────
        this._uiObjects = [
            this.nameLabel, this.nameBox, this.nameText,
            this.hunterLabel, this.modelCard, this.modelGlow, this.modelSprite, this.modelLabel,
            this.modelLeft.box, this.modelLeft.txt, this.modelRight.box, this.modelRight.txt,
            this.bowPickerLabel, this.bowCard, this.bowGlow, this.bowSprite, this.bowLabel,
            this.bowLeft.box, this.bowLeft.txt, this.bowRight.box, this.bowRight.txt,
            this.teamPickerLabel, this.teamCard, this.teamGlow, this.teamNameText, this.teamDot, this.teamSubLabel,
            this.teamLeft.box, this.teamLeft.txt, this.teamRight.box, this.teamRight.txt,
            this.joinButton, this.joinText, this.statusText,
        ];

        // ── Init ─────────────────────────────────────────────────────────────
        this.updateNameText();
        this.updateModelSelection();
        this.updateBowSelection();
        this.updateTeamSelection();

        this.keyHandler = (event) => this.onKeyDown(event);
        this.input.keyboard.on("keydown", this.keyHandler);

        this.cursorTimer = this.time.addEvent({
            delay: 450,
            loop: true,
            callback: () => { this.cursorVisible = !this.cursorVisible; this.updateNameText(); }
        });

        this.events.once("shutdown", () => {
            this.input.keyboard.off("keydown", this.keyHandler);
            if (this.cursorTimer) this.cursorTimer.destroy();
        });
    }

    makeArrowButton(x, y, label, onClick) {
        const box = this.add.rectangle(x, y, 32, 32, 0x1e293b)
            .setStrokeStyle(2, 0x475569).setOrigin(0.5).setDepth(2)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x, y - 1, label, {
            fontFamily: "Trebuchet MS", fontSize: "20px", color: "#94a3b8"
        }).setOrigin(0.5).setDepth(3);
        box.on("pointerdown", onClick);
        txt.on("pointerdown", onClick);
        return { box, txt };
    }

    updateNameText() {
        const cursor = this.cursorVisible ? "▌" : "";
        this.nameText.setText(this.playerName ? `${this.playerName}${cursor}` : `_${cursor}`);
    }

    updateModelSelection() {
        const model = PLAYER_MODELS[this.selectedModelIndex];
        this.modelSprite.setTexture("players", `${model}_front.png`);
        this.modelLabel.setText(model);
    }

    updateBowSelection() {
        this.bowSprite.setFrame(this.selectedBowIndex);
        this.bowLabel.setText(`Style ${this.selectedBowIndex + 1}`);
    }

    updateTeamSelection() {
        const isTeam1  = this.selectedTeam === 1;
        const color    = isTeam1 ? 0x3b82f6 : 0xef4444;
        const textCol  = isTeam1 ? "#60a5fa" : "#f87171";
        const label    = isTeam1 ? "Team 1"  : "Team 2";
        const sublabel = isTeam1 ? "Blue"    : "Red";

        if (this.teamCard)      this.teamCard.setStrokeStyle(3, color);
        if (this.teamGlow)      this.teamGlow.setFillStyle(color, 0.12);
        if (this.teamDot)       this.teamDot.setFillStyle(color);
        if (this.teamNameText)  this.teamNameText.setText(label).setColor(textCol);
        if (this.teamSubLabel)  this.teamSubLabel.setText(sublabel);
    }

    onKeyDown(event) {
        if (this.isConnecting) return;

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
        if (this.isConnecting) return;
        this.isConnecting = true;

        // Stop input and cursor blink immediately
        this.input.keyboard.off("keydown", this.keyHandler);
        if (this.cursorTimer) { this.cursorTimer.destroy(); this.cursorTimer = null; }
        this.nameText.setText(this.playerName || "_");

        this.playExitAnimation(() => {
            const playerProfile = {
                name:  sanitizePlayerName(this.playerName),
                model: PLAYER_MODELS[this.selectedModelIndex],
                bow:   this.selectedBowIndex,
                team:  this.selectedTeam
            };

            connectPlayer(playerProfile)
                .then(() => this.scene.start("bootGame", { playerProfile }))
                .catch(() => this.scene.restart());
        });
    }

    playExitAnimation(onComplete) {
        const { height } = this.cameras.main;

        // Slide all UI elements down off screen
        this.tweens.add({
            targets: this._uiObjects,
            y: `+=${height * 0.65}`,
            duration: 600,
            ease: "Cubic.easeIn",
        });

        // Fade overlay out at the same time
        this.tweens.add({
            targets: this.overlay,
            alpha: 0,
            duration: 600,
            ease: "Cubic.easeIn",
        });

        // Pause on the bare logo for 500ms, then proceed
        this.time.delayedCall(1100, onComplete);
    }
}

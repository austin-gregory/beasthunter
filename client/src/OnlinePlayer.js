import Phaser from "phaser";

export default class OnlinePlayer extends Phaser.GameObjects.Sprite {
    constructor(config) {
        super(config.scene, config.x, config.y, config.playerId);

        this.scene.add.existing(this);
        this.scene.physics.world.enableBody(this);
        if (config.worldLayer) {
            this.scene.physics.add.collider(this, config.worldLayer);
        }

        this.model = config.model || "misa";
        this.map = config.map;
        this.bowIndex = Number.isFinite(config.bow) ? config.bow : 0;
        this.lastFacing = "front";
        this.dead = false;
        this.targetX = config.x;
        this.targetY = config.y;

        this.setTexture("players", `${this.model}_front.png`).setScale(1.9, 2.1);
        this.body.setOffset(0, 24);

        this.bow = null;
        this.shootLockUntil = 0;
        if (this.scene.textures.exists("bows")) {
            this.bow = this.scene.add.sprite(this.x, this.y, "bows", this.bowIndex)
                .setScale(1.2)
                .setDepth(6);
        }

        this.playerNickname = this.scene.add.text(this.x - 40, this.y - 25, config.name || "Player");
        this.deadX = this.scene.add.text(this.x, this.y, "X", {
            font: "72px monospace",
            fill: "#dc2626",
            stroke: "#7f1d1d",
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(14);
        this.deadX.visible = false;
    }

    setServerState(data) {
        this.map = data.map;
        this.targetX = data.x;
        this.targetY = data.y;
        if (Number.isFinite(data.bow) && data.bow !== this.bowIndex) {
            this.bowIndex = data.bow;
            if (this.bow) this.bow.setFrame(this.bowIndex);
        }
        this.setDead(!!data.dead);
    }

    setDead(dead) {
        this.dead = dead;
        this.visible = !dead;
        this.playerNickname.visible = !dead;
        this.deadX.visible = dead;
        if (this.bow) this.bow.visible = !dead;
    }

    updateRemote(deltaMs) {
        const t = Math.min(1, (deltaMs || 16) / 50);
        const nextX = Phaser.Math.Linear(this.x, this.targetX, 0.45 * t + 0.2);
        const nextY = Phaser.Math.Linear(this.y, this.targetY, 0.45 * t + 0.2);
        const dx = nextX - this.x;
        const dy = nextY - this.y;

        this.x = nextX;
        this.y = nextY;

        if (this.dead) {
            this.deadX.x = this.x;
            this.deadX.y = this.y;
            return;
        }

        const moved = Math.hypot(dx, dy) > 0.3;
        const shootLocked = this.shootLockUntil && this.scene.time.now < this.shootLockUntil;

        if (moved) {
            const dir = Math.abs(dx) > Math.abs(dy)
                ? (dx > 0 ? "right" : "left")
                : (dy > 0 ? "front" : "back");
            this.lastFacing = dir;
            if (!shootLocked) {
                this.anims.play(`${this.model}-${dir}-walk`, true);
            }
        }

        if (!moved && !shootLocked) {
            this.anims.stop();
            this.setTexture("players", `${this.model}_${this.lastFacing}.png`);
        }

        if (shootLocked) {
            const shootKey = `${this.model}-${this.lastFacing}-shoot-b${this.bowIndex}`;
            if (this.anims.exists(shootKey)) {
                this.anims.play(shootKey, true);
            }
        }

        if (this.bow) {
            this.bow.visible = !!shootLocked;
            if (shootLocked) {
                const pose = getBowPose(this.lastFacing);
                this.bow.setPosition(this.x + pose.x, this.y + pose.y);
                this.bow.setRotation(pose.r);
            }
        }

        this.playerNickname.x = this.x - 40;
        this.playerNickname.y = this.y - 25;
        this.deadX.x = this.x;
        this.deadX.y = this.y;
    }

    destroy() {
        super.destroy();
        this.playerNickname.destroy();
        this.deadX.destroy();
        if (this.bow) this.bow.destroy();
    }

    triggerShoot() {
        this.shootLockUntil = this.scene.time.now + 180;
        if (!this.bow) return;
        this.scene.tweens.add({
            targets: this.bow,
            scale: { from: 1.35, to: 1.2 },
            duration: 160,
            ease: "Quad.out"
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

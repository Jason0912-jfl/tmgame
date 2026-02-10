/**
 * shootingGame.js
 * 키보드 조작 슈팅 게임 (Space Shooter) 로직
 * 고급 메커니즘: 다양한 무기, 탄창, 아이템 드롭, 사운드 (개선됨)
 */

// --- 무기 데이터베이스 ---
const WEAPONS = {
    "ak47": { name: "AK-47", damage: 10, cooldown: 8, ammo: 100, speed: 15, color: "#ff9f43", size: 4, type: "auto" },
    "pistol": { name: "Pistol", damage: 50, cooldown: 30, ammo: 20, speed: 12, color: "#c8d6e5", size: 5, type: "semi" },
    "sniper": { name: "Sniper", damage: 100, cooldown: 60, ammo: 15, speed: 25, color: "#1dd1a1", size: 3, type: "semi" }, // 관통?
    "shotgun": { name: "Shotgun", damage: 20, cooldown: 40, ammo: 50, speed: 12, color: "#ff6b6b", size: 4, type: "spread", count: 5 },
    "gatling": { name: "Gatling", damage: 15, cooldown: 4, ammo: 150, speed: 18, color: "#54a0ff", size: 3, type: "auto" },
    "laser": { name: "Laser", damage: 25, cooldown: 5, ammo: 75, speed: 20, color: "#ff9ff3", size: 2, type: "laser" }
};

window.ShootingGameEngine = class ShootingGameEngine {
    constructor() {
        this.score = 0;
        this.level = 1;
        this.timeLimit = 999; // 시간 제한 사실상 없음 (생존 게임)
        this.isGameActive = false;

        // 플레이어
        this.playerX = 100;
        this.playerY = 180;
        this.playerWidth = 40;
        this.playerHeight = 40;
        this.playerSpeed = 5;

        // 무기 시스템
        this.currentWeapon = null;
        this.fireTimer = 0;

        // 키보드 상태
        this.keys = { ArrowLeft: false, ArrowRight: false, Space: false };

        this.missiles = [];
        this.enemies = [];
        this.items = []; // 드롭된 아이템들
        this.spawnTimer = 0;
        this.spawnInterval = 60;

        this.onScoreChange = null;
        this.onGameEnd = null;

        this.soundBoard = new SoundBoard(); // Main.js의 SoundBoard 확장 필요 가능성 있음

        // 이벤트 리스너
        window.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.code)) this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.code)) this.keys[e.code] = false;
        });
    }

    start(config = {}) {
        this.isGameActive = true;
        this.score = 0;
        this.level = 1;
        this.timeLimit = 999;
        this.missiles = [];
        this.enemies = [];
        this.items = [];
        this.playerX = 100;
        this.spawnInterval = 60;

        // 랜덤 무기 지급
        this.equipRandomWeapon();

        this.soundBoard.playGameStart();

        if (this.gameTimer) clearInterval(this.gameTimer);
    }

    stop() {
        this.isGameActive = false;
        if (this.gameTimer) clearInterval(this.gameTimer); // 타이머 사용 시

        this.soundBoard.playGameOver();

        if (this.onGameEnd) {
            this.onGameEnd(this.score, this.level);
        }
    }

    // 메인 루프 (Main.js에서 호출하거나 자체적으로 돌림) -> Main.js에서 호출함
    update() {
        if (!this.isGameActive) return;

        // 1. 플레이어 이동
        if (this.keys.ArrowLeft) this.playerX -= this.playerSpeed;
        if (this.keys.ArrowRight) this.playerX += this.playerSpeed;
        if (this.playerX < 0) this.playerX = 0;
        if (this.playerX > 200 - this.playerWidth) this.playerX = 200 - this.playerWidth;

        // 2. 발사 (스페이스바 유지 시 연사 무기는 계속 발사)
        if (this.fireTimer > 0) this.fireTimer--;
        if (this.keys.Space) {
            this.attemptShoot();
        }

        // 3. 미사일 이동
        for (let i = this.missiles.length - 1; i >= 0; i--) {
            let m = this.missiles[i];
            m.y -= m.speed;
            if (m.y < -20) this.missiles.splice(i, 1);
        }

        // 4. 아이템 이동 및 획득
        for (let i = this.items.length - 1; i >= 0; i--) {
            let item = this.items[i];
            item.y += 2; // 천천히 떨어짐

            // 아이템 획득 충돌 검사
            if (
                this.playerX < item.x + item.size &&
                this.playerX + this.playerWidth > item.x &&
                this.playerY < item.y + item.size &&
                this.playerY + this.playerHeight > item.y
            ) {
                this.equipWeapon(item.weaponKey);
                this.soundBoard.startOsc(600, "sine"); // 획득음
                this.soundBoard.stopOsc(0.1);
                this.items.splice(i, 1);
                continue;
            }

            if (item.y > 200) this.items.splice(i, 1);
        }

        // 5. 적 생성
        this.spawnTimer++;
        if (this.spawnTimer > this.spawnInterval) {
            this.spawnEnemy();
            this.spawnTimer = 0;
            if (this.spawnInterval > 30) this.spawnInterval -= 0.2;
        }

        // 6. 적 이동 및 충돌
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            let enemy = this.enemies[i];
            enemy.y += enemy.speed;

            // 미사일 피격
            for (let j = this.missiles.length - 1; j >= 0; j--) {
                let m = this.missiles[j];
                if (
                    m.x < enemy.x + enemy.size &&
                    m.x + m.size > enemy.x &&
                    m.y < enemy.y + enemy.size &&
                    m.y + m.size > enemy.y
                ) {
                    // 데미지 처리
                    enemy.hp -= m.damage;

                    // 관통 여부 확인 (스나이퍼는 관통 가능하게 할 수도 있음)
                    if (this.currentWeapon.name !== "Sniper") {
                        this.missiles.splice(j, 1);
                    }

                    // 적 사망
                    if (enemy.hp <= 0) {
                        this.killEnemy(enemy, i);
                    }
                    break;
                }
            }

            // 플레이어 충돌
            if (enemy.hp > 0 &&
                this.playerX < enemy.x + enemy.size &&
                this.playerX + this.playerWidth > enemy.x &&
                this.playerY < enemy.y + enemy.size &&
                this.playerY + this.playerHeight > enemy.y
            ) {
                this.soundBoard.playBad();
                this.stop(); // 게임 오버
                return;
            }

            if (enemy.y > 200) {
                this.enemies.splice(i, 1); // 놓친 적
            }
        }
    }

    equipRandomWeapon() {
        const keys = Object.keys(WEAPONS);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        this.equipWeapon(randomKey);
    }

    equipWeapon(key) {
        const w = WEAPONS[key];
        // 깊은 복사로 새 인스턴스 생성 (탄창 관리를 위해)
        this.currentWeapon = { ...w, key: key };
        // UI 업데이트 알림 (필요 시)
    }

    attemptShoot() {
        if (this.fireTimer > 0) return;
        if (this.currentWeapon.ammo <= 0) return; // 탄창 없음

        this.currentWeapon.ammo--;
        this.fireTimer = this.currentWeapon.cooldown;

        // 발사 로직
        if (this.currentWeapon.type === "spread") {
            // 샷건: 부채꼴 발사
            for (let i = -2; i <= 2; i++) {
                this.missiles.push({
                    x: this.playerX + this.playerWidth / 2,
                    y: this.playerY,
                    size: this.currentWeapon.size,
                    speed: this.currentWeapon.speed,
                    damage: this.currentWeapon.damage,
                    color: this.currentWeapon.color,
                    vx: i * 1.5 // 가로 속도
                });
            }
        } else {
            // 일반 발사
            this.missiles.push({
                x: this.playerX + this.playerWidth / 2,
                y: this.playerY,
                size: this.currentWeapon.size,
                speed: this.currentWeapon.speed,
                damage: this.currentWeapon.damage,
                color: this.currentWeapon.color,
                vx: 0
            });
        }

        // 발사음
        this.playShootSound(this.currentWeapon.key);
    }

    spawnEnemy() {
        let isBoss = Math.random() < 0.05; // 5% 확률 보스
        let hp = isBoss ? 2000 : 100;
        let size = isBoss ? 60 : 30;
        let speed = isBoss ? 0.5 : (2 + this.level * 0.1);

        this.enemies.push({
            x: Math.random() * (200 - size),
            y: -size,
            size: size,
            hp: hp,
            maxHp: hp,
            speed: speed,
            type: isBoss ? "boss" : "zombie"
        });
    }

    killEnemy(enemy, index) {
        this.enemies.splice(index, 1);
        this.addScore(enemy.type === "boss" ? 500 : 10);
        this.soundBoard.playTone(200, 0.1, "sawtooth"); // 폭발음

        // 아이템 드롭 (20% 확률)
        if (Math.random() < 0.2) {
            const keys = Object.keys(WEAPONS);
            const dropKey = keys[Math.floor(Math.random() * keys.length)];
            this.items.push({
                x: enemy.x,
                y: enemy.y,
                size: 20,
                weaponKey: dropKey
            });
        }
    }

    addScore(points) {
        this.score += points;
        this.level = Math.floor(this.score / 500) + 1;
        if (this.onScoreChange) this.onScoreChange(this.score, this.level);
    }

    // --- 렌더링 ---
    render(ctx) {
        if (!this.isGameActive) return;

        // 플레이어
        this.drawShip(ctx, this.playerX, this.playerY, this.playerWidth, this.playerHeight);

        // 미사일
        for (const m of this.missiles) {
            if (m.vx) m.x += m.vx; // 가로 이동 (샷건)

            ctx.fillStyle = m.color;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // 아이템
        for (const item of this.items) {
            // 무기 박스
            ctx.fillStyle = "#00cec9";
            ctx.fillRect(item.x, item.y, item.size, item.size);
            ctx.fillStyle = "white";
            ctx.font = "12px Arial";
            ctx.fillText("?", item.x + 5, item.y + 15);
        }

        // 적
        for (const enemy of this.enemies) {
            let emoji = enemy.type === "boss" ? "👹" : "🧟";
            this.drawEmoji(ctx, emoji, enemy.x, enemy.y, enemy.size);

            // HP Bar
            ctx.fillStyle = "red";
            ctx.fillRect(enemy.x, enemy.y - 5, enemy.size, 3);
            ctx.fillStyle = "#00ff00";
            ctx.fillRect(enemy.x, enemy.y - 5, enemy.size * (enemy.hp / enemy.maxHp), 3);
        }

        // UI (무기 정보)
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "left";

        // 왼쪽 상단: 점수
        ctx.fillText(`Score: ${this.score}`, 10, 20);

        // 오른쪽 상단: 무기 & 탄창
        ctx.textAlign = "right";
        const weaponInfo = `${this.currentWeapon.name} [${this.currentWeapon.ammo}]`;
        ctx.fillStyle = this.currentWeapon.ammo > 0 ? "#ffff00" : "#ff0000";
        ctx.fillText(weaponInfo, 190, 20);

        // 조작 가이드
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "10px Arial";
        ctx.fillText("Move: Arrows | Shoot: Space", 10, 190);
    }

    drawShip(ctx, x, y, w, h) {
        ctx.fillStyle = "#00d2d3";
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w / 2, y + h - 10);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
    }

    drawEmoji(ctx, emoji, x, y, size) {
        ctx.font = `${size}px Arial`;
        ctx.fillText(emoji, x, y + size * 0.8);
    }

    playShootSound(key) {
        // 간단한 톤 생성 (실제 파일 대신)
        // 소리를 좀 더 부드럽게 (sine/triangle 위주, sawtooth는 필터링 필요하나 여기선 제외)
        let freq = 440;
        let type = "sine";
        let dur = 0.1;

        switch (key) {
            case "ak47": freq = 200; type = "triangle"; dur = 0.08; break; // 낮은 퉁퉁 소리
            case "pistol": freq = 400; type = "triangle"; break; // 일반 뿅
            case "sniper": freq = 800; type = "sine"; dur = 0.2; break; // 핑- (레이저 느낌)
            case "shotgun": freq = 150; type = "square"; dur = 0.15; break; // 퍽 (둔탁함)
            case "gatling": freq = 600; type = "sawtooth"; dur = 0.04; break; // 드르륵 (빠르게)
            case "laser": freq = 1200; type = "sine"; dur = 0.1; break; // 삐- (고주파)
        }
        this.soundBoard.playTone(freq, dur, type);
    }

    setScoreChangeCallback(callback) { this.onScoreChange = callback; }
    setGameEndCallback(callback) { this.onGameEnd = callback; }
};

// Simple Sound Helper (AudioContext Wrapper update)
window.SoundBoard = window.SoundBoard || class SoundBoard {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    }

    // 개선된 playTone: Attack/Decay Envelope 적용
    playTone(freq, dur, type = "sine") {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        // Envelope: 0 -> Max -> 0 (클릭 노이즈 방지)
        const now = this.ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.01); // Attack
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur); // Decay

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + dur);
    }
    playGameStart() { this.playTone(600, 0.5); }
    playGameOver() { this.playTone(100, 1.0, "sawtooth"); }
    startOsc(freq, type) { /* sustain logic if needed */ this.playTone(freq, 0.1, type); }
    stopOsc() { }
    playBad() { this.playTone(100, 0.3, "sawtooth"); }
};

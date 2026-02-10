/**
 * gameEngine.js
 * 과일 받기 게임 (Fruit Catcher) 로직
 */

window.GameEngine = class GameEngine {
  constructor() {
    this.score = 0;
    this.level = 1;
    this.timeLimit = 60;
    this.isGameActive = false;

    // 3-Lane 시스템 설정
    // 캔버스 너비 200px 기준. 레인 중심점: 33, 100, 166
    this.lanes = [33, 100, 167];
    this.laneWidth = 66;

    // 바구니 상태
    this.basketX = this.lanes[1]; // 중앙에서 시작
    this.basketWidth = 40;
    this.basketHeight = 20;
    this.currentLaneIndex = 1; // 0: Left, 1: Center, 2: Right

    this.items = [];
    this.spawnTimer = 0;
    this.spawnInterval = 60;

    this.currentPose = "정면";

    this.onScoreChange = null;
    this.onGameEnd = null;

    // 효과음 관리자 생성
    this.soundBoard = new SoundBoard();
  }

  start(config = {}) {
    this.isGameActive = true;
    this.score = 0;
    this.level = 1;
    this.timeLimit = config.timeLimit || 60;
    this.items = [];
    this.currentLaneIndex = 1;
    this.basketX = this.lanes[1];
    this.spawnInterval = 60;

    // 게임 시작 효과음
    this.soundBoard.playGameStart();

    if (this.gameTimer) clearInterval(this.gameTimer);
    this.gameTimer = setInterval(() => {
      if (this.isGameActive) {
        this.timeLimit--;
        if (this.timeLimit <= 0) {
          this.stop();
        }
      }
    }, 1000);
  }

  stop() {
    this.isGameActive = false;
    if (this.gameTimer) clearInterval(this.gameTimer);

    // 게임 종료 효과음
    this.soundBoard.playGameOver();

    if (this.onGameEnd) {
      this.onGameEnd(this.score, this.level);
    }
  }

  update(detectedPose) {
    if (!this.isGameActive) return;

    this.currentPose = detectedPose;

    // 1. 바구니 이동 (Lane Snap)
    if (this.currentPose === "왼쪽") {
      this.currentLaneIndex = 0;
    } else if (this.currentPose === "오른쪽") {
      this.currentLaneIndex = 2;
    } else {
      // 그 외 모든 포즈(정면, 위, 아래 등)는 중앙으로 간주
      this.currentLaneIndex = 1;
    }

    this.basketX = this.lanes[this.currentLaneIndex];

    // 2. 아이템 생성
    this.spawnTimer++;
    if (this.spawnTimer > this.spawnInterval) {
      this.spawnItem();
      this.spawnTimer = 0;
      // 레벨이 오를수록 생성 주기 빨라짐 (최소 15프레임)
      if (this.spawnInterval > 15) {
        this.spawnInterval -= 0.5;
      }
    }

    // 3. 아이템 이동 및 충돌
    for (let i = this.items.length - 1; i >= 0; i--) {
      let item = this.items[i];
      item.y += item.speed;

      // 충돌 로직
      if (item.y > 180 && item.y < 200) {
        if (item.laneIndex === this.currentLaneIndex) {
          this.handleItemCollection(item);
          this.items.splice(i, 1);
          continue;
        }
      }

      if (item.y > 200) {
        this.items.splice(i, 1);
      }
    }
  }

  spawnItem() {
    const typeRoll = Math.random();
    let type = "apple";

    // 속도 상향: 기본 15 + 레벨당 1.5 증가 (매우 빠름)
    let speed = 15 + (this.level * 1.5);

    if (typeRoll < 0.2) { // 폭탄 확률
      type = "bomb";
      speed *= 1.2; // 폭탄은 더 빠름
    } else if (typeRoll < 0.4) {
      type = "banana";
      speed *= 1.3; // 바나나도 조금 빠름
    }

    const laneIndex = Math.floor(Math.random() * 3);
    const laneX = this.lanes[laneIndex];

    this.items.push({
      x: laneX,
      y: -20,
      laneIndex: laneIndex,
      type: type,
      speed: speed
    });
  }

  handleItemCollection(item) {
    let points = 0;
    switch (item.type) {
      case "apple":
        points = 50;
        this.soundBoard.playGood();
        break;
      case "banana":
        points = 100;
        this.soundBoard.playGood();
        break;
      case "bomb":
        points = -100;
        this.soundBoard.playBad();
        break;
    }
    this.addScore(points);
  }

  addScore(points) {
    this.score += points;
    if (this.score < 0) this.score = 0;
    this.level = Math.floor(this.score / 200) + 1; // 레벨업 기준 200점 (4사과 or 2바나나 = 레벨업)
    if (this.onScoreChange) {
      this.onScoreChange(this.score, this.level);
    }
  }

  render(ctx) {
    if (!this.isGameActive) return;

    // 1. 레인 가이드라인
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(66, 0); ctx.lineTo(66, 200);
    ctx.moveTo(133, 0); ctx.lineTo(133, 200);
    ctx.stroke();

    // 2. 바구니 그리기 (업그레이드!)
    this.drawCoolBasket(ctx, this.basketX, 180, this.basketWidth, this.basketHeight);

    // 3. 아이템
    for (const item of this.items) {
      let emoji = "🍎";
      if (item.type === "banana") emoji = "🍌";
      if (item.type === "bomb") emoji = "💣";
      this.drawEmoji(ctx, emoji, item.x - 10, item.y);
    }

    // 4. UI Text
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";

    // 점수 & 레벨
    const infoText = `점수: ${this.score}  Lv.${this.level}`;
    ctx.strokeText(infoText, 10, 25);
    ctx.fillText(infoText, 10, 25);

    // 시간
    const timeText = `시간: ${this.timeLimit}`;
    ctx.strokeText(timeText, 130, 25);
    ctx.fillText(timeText, 130, 25);

    // 디버그용 (포즈)
    ctx.font = "12px Arial";
    ctx.fillStyle = "yellow";
    ctx.fillText(`${this.currentPose}`, 10, 190);
  }

  drawEmoji(ctx, emoji, x, y) {
    ctx.font = "20px Arial";
    ctx.fillText(emoji, x, y + 20);
  }

  drawCoolBasket(ctx, x, y, w, h) {
    const halfW = w / 2;

    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + h + 5, halfW, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 바구니 몸통 (사다리꼴)
    const gradient = ctx.createLinearGradient(x - halfW, y, x + halfW, y + h);
    gradient.addColorStop(0, "#e67e22"); // 갈색/주황 계열
    gradient.addColorStop(1, "#d35400");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - halfW, y); // 좌상
    ctx.lineTo(x + halfW, y); // 우상
    ctx.lineTo(x + halfW - 5, y + h); // 우하
    ctx.lineTo(x - halfW + 5, y + h); // 좌하
    ctx.closePath();
    ctx.fill();

    // 바구니 패턴 (가로 선)
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - halfW + 2, y + h / 3);
    ctx.lineTo(x + halfW - 2, y + h / 3);
    ctx.moveTo(x - halfW + 4, y + 2 * h / 3);
    ctx.lineTo(x + halfW - 4, y + 2 * h / 3);
    ctx.stroke();

    // 손잡이 (반원)
    ctx.strokeStyle = "#a04000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, halfW - 5, Math.PI, 0); // 위로 볼록한 반원
    ctx.stroke();
  }

  setScoreChangeCallback(callback) { this.onScoreChange = callback; }
  setGameEndCallback(callback) { this.onGameEnd = callback; }
};

// --- Sound Board (Web Audio API) ---
class SoundBoard {
  constructor() {
    // AudioContext는 사용자 인터랙션이 있을 때 resume() 해줘야 함 (보통 startBtn 클릭 시 해결됨)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContext();
  }

  playTone(frequency, duration, type = "sine") {
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    osc.start();

    // 볼륨 페이드 아웃
    gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

    osc.stop(this.audioCtx.currentTime + duration);
  }

  playGood() {
    this.playTone(880, 0.1, "sine"); // High pitch
    setTimeout(() => this.playTone(1760, 0.1, "sine"), 100);
  }

  playBad() {
    this.playTone(150, 0.4, "sawtooth"); // Low buzz
  }

  playGameStart() {
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();
    this.playTone(523.25, 0.1); // Do
    setTimeout(() => this.playTone(659.25, 0.1), 100); // Mi
    setTimeout(() => this.playTone(783.99, 0.3), 200); // Sol
  }

  playGameOver() {
    this.playTone(783.99, 0.1, "triangle");
    setTimeout(() => this.playTone(659.25, 0.1, "triangle"), 100);
    setTimeout(() => this.playTone(523.25, 0.5, "triangle"), 200);
  }
}

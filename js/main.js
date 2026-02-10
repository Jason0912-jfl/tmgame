/**
 * main.js
 * 포즈 인식과 게임 로직을 초기화하고 서로 연결하는 진입점
 *
 * PoseEngine, GameEngine, Stabilizer를 조합하여 애플리케이션을 구동
 */

// main.js

const URL = "./my_model/";
let poseModel, webcam, ctx, labelContainer, maxPredictions;
let stabilizer;
let gameEngine;
let poseEngine;
let currentGameMode = 'pose'; // 'pose' or 'shooting'
let isInitialized = false;

// 게임 선택
window.selectGame = function (mode) {
  currentGameMode = mode;
  document.getElementById('game-selector').style.display = 'none';
  document.getElementById('game-play-area').style.display = 'block';

  // Canvas 설정
  const canvas = document.getElementById("canvas");
  canvas.width = 200;
  canvas.height = 200;
  ctx = canvas.getContext("2d");

  // Start 버튼 설정
  const startBtn = document.getElementById('start-btn');
  startBtn.onclick = init;
}

window.goBack = function () {
  if (gameEngine) gameEngine.stop();
  if (webcam) webcam.stop();
  document.getElementById('game-play-area').style.display = 'none';
  document.getElementById('game-selector').style.display = 'flex';
  isInitialized = false;
  document.getElementById('start-btn').style.display = 'inline-block';
}

/**
 * 애플리케이션 초기화
 */
async function init() {
  if (isInitialized) return;

  if (currentGameMode === 'pose') {
    await initPoseGame();
  } else if (currentGameMode === 'shooting') {
    initShootingGame();
  }

  isInitialized = true;
  document.getElementById('start-btn').style.display = 'none';
}

// 1. 포즈 게임 초기화
async function initPoseGame() {
  const modelURL = URL + "model.json";
  const metadataURL = URL + "metadata.json";

  poseModel = await tmPose.load(modelURL, metadataURL);
  maxPredictions = poseModel.getTotalClasses();

  const size = 200;
  const flip = true;
  webcam = new tmPose.Webcam(size, size, flip);
  await webcam.setup();
  await webcam.play();
  window.requestAnimationFrame(loop);

  // 엔진 초기화
  poseEngine = new PoseEngine(poseModel, webcam);
  stabilizer = new PredictionStabilizer({ threshold: 0.5, smoothingFrames: 1 });
  gameEngine = new GameEngine();

  gameEngine.setScoreChangeCallback((score, level) => { });

  gameEngine.setGameEndCallback((score, level) => {
    alert(`게임 종료! \n점수: ${score}\n레벨: ${level}`);
    window.goBack();
  });

  labelContainer = document.getElementById("label-container");
  labelContainer.innerHTML = "";
  for (let i = 0; i < maxPredictions; i++) {
    labelContainer.appendChild(document.createElement("div"));
  }

  gameEngine.start();
}

// 2. 슈팅 게임 초기화
function initShootingGame() {
  gameEngine = new ShootingGameEngine();

  gameEngine.setGameEndCallback((score, level) => {
    alert(`미션 실패! \n점수: ${score}\n레벨: ${level}`);
    window.goBack();
  });

  gameEngine.start();
  window.requestAnimationFrame(loopShooting);
}

function stop() {
  if (gameEngine) gameEngine.stop();
  if (webcam) webcam.stop();
  document.getElementById('start-btn').disabled = false;
}

/**
 * 예측 결과 처리 콜백
 * @param {Array} predictions - TM 모델의 예측 결과
 * @param {Object} pose - PoseNet 포즈 데이터
 */
// 포즈 게임 루프
async function loop(timestamp) {
  if (currentGameMode !== 'pose') return;

  webcam.update();
  const { pose, prediction } = await poseEngine.predict();

  handlePosePrediction(prediction);
  drawPoseGame(pose);

  window.requestAnimationFrame(loop);
}

// 슈팅 게임 루프
function loopShooting(timestamp) {
  if (currentGameMode !== 'shooting') return;

  gameEngine.update();

  // 캔버스 클리어
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 200, 200);

  gameEngine.render(ctx);

  window.requestAnimationFrame(loopShooting);
}

function handlePosePrediction(predictions) {
  const stabilized = stabilizer.stabilize(predictions);

  const allowedLabels = ["왼쪽", "오른쪽", "정면"];
  for (let i = 0; i < predictions.length; i++) {
    const className = predictions[i].className;
    if (allowedLabels.includes(className)) {
      const classPrediction = className + ": " + predictions[i].probability.toFixed(2);
      labelContainer.childNodes[i].innerHTML = classPrediction;
      labelContainer.childNodes[i].style.display = "block";
    } else {
      labelContainer.childNodes[i].style.display = "none";
    }
  }

  let displayPose = stabilized.className || "감지 중...";
  if (displayPose === "위" || displayPose === "아래") displayPose = "정면"; // 중앙 강제

  const maxPredictionDiv = document.getElementById("max-prediction");
  if (maxPredictionDiv) maxPredictionDiv.innerHTML = displayPose;

  if (gameEngine && gameEngine.isGameActive) {
    gameEngine.update(displayPose);
  }
}

function drawPoseGame(pose) {
  ctx.drawImage(webcam.canvas, 0, 0);

  if (pose) {
    const minPartConfidence = 0.5;
    tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
    tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
  }

  if (gameEngine) {
    gameEngine.render(ctx);
  }
}



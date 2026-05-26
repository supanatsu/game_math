/* =========================================================================
   HIGH-LOW BATTLE : THE ULTIMATE MIND GAMES (AI, P2P, STEALTH, FAKE, AVATAR)
   ========================================================================= */

const APP_PREFIX = 'hl-mindgames-';
let peer = null; let conn = null;
let playerRole = null; 
let localTimerInterval = null;
let myName = ""; let opponentName = "";

let isSinglePlayer = false;
let aiIsThinking = false;
let mySkills = { freeze: true, scan: true, stealth: true, fake: true };
let opponentSkills = { freeze: true, scan: true, stealth: true, fake: true };
let isFrozen = false; 

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null; let isMuted = false;

function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
window.toggleMute = function() { isMuted = !isMuted; document.getElementById('mute-btn').innerText = isMuted ? '🔇' : '🔊'; }

function playTone(freq, type, duration, vol=0.1) {
    if (isMuted) return; initAudio();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
}

const sfx = {
    click: () => playTone(600, 'sine', 0.1),
    tick: () => playTone(800, 'sine', 0.05, 0.04),
    warn: () => playTone(350, 'square', 0.15, 0.08),
    guess: () => playTone(450, 'triangle', 0.12),
    error: () => { playTone(220, 'sawtooth', 0.15); playTone(170, 'sawtooth', 0.2); },
    win: () => { playTone(523, 'sine', 0.1); setTimeout(()=>playTone(659, 'sine', 0.1), 80); setTimeout(()=>playTone(784, 'sine', 0.1), 160); setTimeout(()=>playTone(1046, 'sine', 0.4), 240); },
    lose: () => { playTone(280, 'sawtooth', 0.25); setTimeout(()=>playTone(220, 'sawtooth', 0.25), 180); setTimeout(()=>playTone(180, 'sawtooth', 0.4), 360); },
    pop: () => playTone(900, 'sine', 0.08, 0.15),
    freeze: () => { playTone(1200, 'sine', 0.05, 0.2); playTone(800, 'triangle', 0.4, 0.2); },
    scan: () => { playTone(300, 'sine', 0.3, 0.1); playTone(600, 'sine', 0.3, 0.1); },
    stealth: () => { playTone(500, 'sine', 0.2, 0.1); setTimeout(()=>playTone(300, 'sine', 0.2, 0.1), 100); },
    fake: () => { playTone(200, 'sawtooth', 0.1, 0.1); setTimeout(()=>playTone(400, 'square', 0.1, 0.1), 50); },
    critical: () => { playTone(800, 'square', 0.1, 0.2); setTimeout(()=>playTone(1200, 'square', 0.2, 0.2), 100); }
};

const MAX_NUMBER = 1000;
const GAME_DURATION = 300; 
const WIN_SCORE = 3; 

let gameState = {
    status: 'waiting', 
    round: 1, p1Score: 0, p2Score: 0,
    p1Secret: null, p2Secret: null,
    p1MinRange: 1, p1MaxRange: MAX_NUMBER,
    p2MinRange: 1, p2MaxRange: MAX_NUMBER,
    timeLeft: GAME_DURATION,
    currentTurn: 1, winner: null, 
    logsP1: [], logsP2: [],
    p1Ready: false, p2Ready: false,
    p1Combo: 0, p2Combo: 0,
    p1StealthActive: false, p2StealthActive: false
};

const el = {
    screenLoading: document.getElementById('loading-screen'), screenLobby: document.getElementById('lobby-screen'),
    screenGame: document.getElementById('game-screen'), overlaySecret: document.getElementById('secret-overlay'),
    overlayRoundEnd: document.getElementById('round-overlay'), timer: document.getElementById('timer'),
    status: document.getElementById('status'), nameInput: document.getElementById('player-name')
};

function switchScreen(screenName) {
    el.screenLoading.classList.add('hidden'); el.screenLobby.classList.add('hidden'); el.screenGame.classList.add('hidden');
    if (screenName === 'loading') el.screenLoading.classList.remove('hidden');
    if (screenName === 'lobby') el.screenLobby.classList.remove('hidden');
    if (screenName === 'game') el.screenGame.classList.remove('hidden');
}

window.showToast = function(msg) {
    const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function getMyName() {
    let n = el.nameInput.value.trim();
    if (!n) { n = "Player " + Math.floor(Math.random()*100); el.nameInput.value = n; }
    return n.substring(0, 12);
}

// -----------------------------------------------------------------
// Network & Game Setup
// -----------------------------------------------------------------
window.startSinglePlayer = function() {
    sfx.click(); isSinglePlayer = true; playerRole = 1;
    myName = getMyName(); opponentName = "🤖 AlphaBot";
    switchScreen('game'); setupGameUI('SOLO');
    document.getElementById('name-p1').innerHTML = `<span id="avatar-1">😎</span> ${myName}`;
    document.getElementById('name-p2').innerHTML = `<span id="avatar-2">🤖</span> ${opponentName}`;
    gameState.status = 'setting_number'; updateUI();
}

window.createRoom = function() {
    sfx.click(); isSinglePlayer = false; myName = getMyName(); switchScreen('loading');
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    peer = new Peer(APP_PREFIX + roomCode);
    peer.on('open', () => {
        playerRole = 1; setupGameUI(roomCode);
        document.getElementById('name-p1').innerHTML = `<span id="avatar-1">😎</span> ${myName}`;
        el.status.innerText = `แชร์รหัสให้เพื่อน: ${roomCode}`;
    });
    peer.on('error', () => { showToast("รหัสซ้ำ ลองสร้างใหม่ครับ"); switchScreen('lobby'); });
    peer.on('connection', (connection) => {
        conn = connection;
        conn.on('open', () => { conn.send({ type: 'HANDSHAKE', name: myName }); gameState.status = 'setting_number'; syncStateToClient(); updateUI(); });
        conn.on('data', handleDataFromClient);
    });
}

window.joinRoom = function() {
    sfx.click(); isSinglePlayer = false; const code = document.getElementById('join-code').value.trim();
    if (code.length !== 4) { showToast("ใส่รหัส 4 หลัก!"); sfx.error(); return; }
    myName = getMyName(); switchScreen('loading'); peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect(APP_PREFIX + code);
        conn.on('open', () => {
            playerRole = 2; setupGameUI(code);
            document.getElementById('name-p2').innerHTML = `<span id="avatar-2">😎</span> ${myName}`;
            conn.send({ type: 'HANDSHAKE', name: myName });
        });
        conn.on('data', handleDataFromHost);
        conn.on('error', () => { showToast("ไม่พบรหัสห้องนี้"); switchScreen('lobby'); });
    });
}

function handleDataFromClient(data) {
    if (data.type === 'HANDSHAKE') { opponentName = data.name; document.getElementById('name-p2').innerHTML = `<span id="avatar-2">😎</span> ${opponentName}`; }
    else if (data.type === 'SET_SECRET') { gameState.p2Secret = data.value; checkSecretsReady(); }
    else if (data.type === 'GUESS') { processGuess(2, data.value); }
    else if (data.type === 'CHAT') { showFloatingText(data.value, 2); sfx.pop(); }
    else if (data.type === 'READY') { gameState.p2Ready = true; checkNextRoundReady(); }
    else if (data.type === 'POWERUP') { applyPowerUpEffect(data.skill, data.caster); }
}

function handleDataFromHost(data) {
    if (data.type === 'HANDSHAKE') { opponentName = data.name; document.getElementById('name-p1').innerHTML = `<span id="avatar-1">😎</span> ${opponentName}`; }
    else if (data.type === 'SYNC') { gameState = data.state; updateUI(); }
    else if (data.type === 'CHAT') { showFloatingText(data.value, 1); sfx.pop(); }
    else if (data.type === 'FX_POWERUP') { applyLocalVisualPowerUp(data.skill, data.caster); }
}

function syncStateToClient() {
    if (isSinglePlayer) return;
    if (playerRole === 1 && conn && conn.open) {
        let stateToSend = JSON.parse(JSON.stringify(gameState));
        if (stateToSend.status !== 'round_end') stateToSend.p1Secret = "HIDDEN_FOR_SECURITY";
        conn.send({ type: 'SYNC', state: stateToSend });
    }
}

// -----------------------------------------------------------------
// Secret Numbers
// -----------------------------------------------------------------
window.submitSecret = function() {
    initAudio(); const input = document.getElementById('secret-input');
    const secret = parseInt(input.value);
    if (isNaN(secret) || secret < 1 || secret > MAX_NUMBER) { showToast(`ตัวเลขต้องเป็น 1 - ${MAX_NUMBER}`); sfx.error(); input.focus(); return; }

    sfx.click(); document.getElementById('btn-submit-secret').classList.add('hidden');
    document.getElementById('secret-wait').classList.remove('hidden'); input.disabled = true;

    if (playerRole === 1) {
        gameState.p1Secret = secret;
        if (isSinglePlayer) gameState.p2Secret = Math.floor(Math.random() * MAX_NUMBER) + 1;
        checkSecretsReady();
    } else {
        conn.send({ type: 'SET_SECRET', value: secret });
    }
}

function checkSecretsReady() {
    if (gameState.p1Secret !== null && gameState.p2Secret !== null && gameState.status === 'setting_number') {
        gameState.status = 'playing'; syncStateToClient(); startHostTimer(); updateUI();
    }
}

// -----------------------------------------------------------------
// Core Logic & Guessing
// -----------------------------------------------------------------
function startHostTimer() {
    clearInterval(localTimerInterval);
    localTimerInterval = setInterval(() => {
        if (gameState.status !== 'playing') return;
        gameState.timeLeft--;
        if (gameState.timeLeft > 0 && gameState.timeLeft <= 10) sfx.warn();
        else if (gameState.timeLeft > 10 && gameState.timeLeft % 30 === 0) sfx.tick();
        if (gameState.timeLeft <= 0) { clearInterval(localTimerInterval); gameState.status = 'round_end'; resolveSuddenDeath(); }
        syncStateToClient(); updateUI();
    }, 1000);
}

function resolveSuddenDeath() {
    let p1Last = gameState.logsP1.length > 0 ? gameState.logsP1[gameState.logsP1.length - 1].guess : -9999;
    let p2Last = gameState.logsP2.length > 0 ? gameState.logsP2[gameState.logsP2.length - 1].guess : -9999;
    let d1 = Math.abs(p1Last - gameState.p2Secret); let d2 = Math.abs(p2Last - gameState.p1Secret); 
    if (d1 === d2) { gameState.winner = 0; } else if (d1 < d2) { gameState.winner = 1; gameState.p1Score++; } else { gameState.winner = 2; gameState.p2Score++; }
}

window.makeGuess = function(btnPlayerNum) {
    initAudio(); if (btnPlayerNum !== playerRole || isFrozen) return;
    const inputField = document.getElementById(`p${playerRole}-input`); const guess = parseInt(inputField.value);
    if (isNaN(guess) || guess < 1 || guess > MAX_NUMBER) { showToast(`ใส่ตัวเลขระหว่าง 1 - ${MAX_NUMBER}`); sfx.error(); inputField.focus(); return; }
    inputField.value = ''; sfx.guess();
    if (playerRole === 1) processGuess(1, guess); else conn.send({ type: 'GUESS', value: guess });
}

function processGuess(playerWhoGuessed, guess) {
    if (gameState.status !== 'playing' || gameState.currentTurn !== playerWhoGuessed) return;

    let targetNum = playerWhoGuessed === 1 ? gameState.p2Secret : gameState.p1Secret;
    let distance = Math.abs(guess - targetNum);
    let result = (distance === 0) ? 'correct' : (guess < targetNum ? 'up' : 'down');
    let heat = 'cold'; let isExtraTurn = false;

    if (distance === 0) {
        heat = 'correct'; 
        if (playerWhoGuessed===1) { gameState.p1MinRange = guess; gameState.p1MaxRange = guess; } else { gameState.p2MinRange = guess; gameState.p2MaxRange = guess; }
    } else {
        if (playerWhoGuessed === 1) {
            if (result === 'up') gameState.p1MinRange = Math.max(gameState.p1MinRange, guess + 1); else gameState.p1MaxRange = Math.min(gameState.p1MaxRange, guess - 1);
        } else {
            if (result === 'up') gameState.p2MinRange = Math.max(gameState.p2MinRange, guess + 1); else gameState.p2MaxRange = Math.min(gameState.p2MaxRange, guess - 1);
        }
        if (distance <= 3) { heat = 'critical'; isExtraTurn = true; }
        else if (distance <= 15) { heat = 'boiling'; } else if (distance <= 60) { heat = 'hot'; } else if (distance <= 200) { heat = 'warm'; }
    }

    if (heat === 'boiling' || heat === 'hot' || heat === 'critical') {
        if (playerWhoGuessed === 1) { gameState.p1Combo++; if(gameState.p1Combo >= 2) gameState.timeLeft = Math.min(gameState.timeLeft + 5, GAME_DURATION); }
        else { gameState.p2Combo++; if(gameState.p2Combo >= 2) gameState.timeLeft = Math.min(gameState.timeLeft + 5, GAME_DURATION); }
    } else { if (playerWhoGuessed === 1) gameState.p1Combo = 0; else gameState.p2Combo = 0; }

    // ตรวจสอบการล่องหน
    let isStealth = false;
    if (playerWhoGuessed === 1 && gameState.p1StealthActive) { isStealth = true; gameState.p1StealthActive = false; }
    if (playerWhoGuessed === 2 && gameState.p2StealthActive) { isStealth = true; gameState.p2StealthActive = false; }

    const logEntry = { guess, result, heat, isStealth };
    if (playerWhoGuessed === 1) gameState.logsP1.push(logEntry); else gameState.logsP2.push(logEntry);

    if (result === 'correct') {
        gameState.status = 'round_end'; gameState.winner = playerWhoGuessed;
        if (playerWhoGuessed === 1) gameState.p1Score++; else gameState.p2Score++; clearInterval(localTimerInterval);
    } else {
        if (isExtraTurn) { sfx.critical(); } else { gameState.currentTurn = playerWhoGuessed === 1 ? 2 : 1; }
    }
    syncStateToClient(); updateUI();
}

// -----------------------------------------------------------------
// POWER-UPS (Stealth, Fake, Freeze, Scan)
// -----------------------------------------------------------------
window.usePowerUp = function(skill, casterNum) {
    initAudio(); if (casterNum !== playerRole || gameState.status !== 'playing') return;
    if (!mySkills[skill]) return;
    mySkills[skill] = false; document.getElementById(`skill-${skill}-${playerRole}`).disabled = true;

    if (playerRole === 1 || isSinglePlayer) applyPowerUpEffect(skill, 1);
    else conn.send({ type: 'POWERUP', skill: skill, caster: 2 });
}

function applyPowerUpEffect(skill, caster) {
    if (playerRole === 1 || isSinglePlayer) {
        if (skill === 'freeze') {
            if (caster === 1) { if(!isSinglePlayer) conn.send({ type: 'FX_POWERUP', skill: 'freeze', caster: 1 }); applyLocalVisualPowerUp('freeze', 1); } 
            else { applyLocalVisualPowerUp('freeze', 2); }
        } else if (skill === 'scan') {
            if (caster === 1) {
                let scope = gameState.p1MaxRange - gameState.p1MinRange;
                if (scope > 30) { let cut = Math.floor(scope * 0.2); if (gameState.p2Secret - gameState.p1MinRange > gameState.p1MaxRange - gameState.p2Secret) gameState.p1MinRange += cut; else gameState.p1MaxRange -= cut; }
            } else {
                let scope = gameState.p2MaxRange - gameState.p2MinRange;
                if (scope > 30) { let cut = Math.floor(scope * 0.2); if (gameState.p1Secret - gameState.p2MinRange > gameState.p2MaxRange - gameState.p1Secret) gameState.p2MinRange += cut; else gameState.p2MaxRange -= cut; }
            }
        } else if (skill === 'stealth') {
            if (caster === 1) gameState.p1StealthActive = true; else gameState.p2StealthActive = true;
            if (caster === 1 && !isSinglePlayer) conn.send({ type: 'FX_POWERUP', skill: 'stealth', caster: 1 });
            applyLocalVisualPowerUp('stealth', caster);
        } else if (skill === 'fake') {
            let target = caster === 1 ? gameState.p2Secret : gameState.p1Secret;
            let fakeGuess = Math.floor(Math.random() * MAX_NUMBER) + 1;
            if(fakeGuess === target) fakeGuess = (fakeGuess + 100) % MAX_NUMBER + 1;
            let dist = Math.abs(fakeGuess - target);
            let heat = 'cold'; if(dist <= 15) heat = 'boiling'; else if(dist <= 60) heat = 'hot'; else if(dist <= 200) heat = 'warm';
            let result = fakeGuess < target ? 'up' : 'down';
            let log = { guess: fakeGuess, result: result, heat: heat, isFake: true };
            if(caster === 1) gameState.logsP1.push(log); else gameState.logsP2.push(log);
            
            if (caster === 1 && !isSinglePlayer) conn.send({ type: 'FX_POWERUP', skill: 'fake', caster: 1 });
            applyLocalVisualPowerUp('fake', caster);
        }
        syncStateToClient(); updateUI();
    }
}

function applyLocalVisualPowerUp(skill, caster) {
    if (skill === 'freeze') {
        sfx.freeze(); let targetPanelNum = (caster === 1) ? 2 : 1;
        let targetPanel = document.getElementById(`panel-${targetPanelNum}`);
        targetPanel.classList.add('frozen'); showFloatingText("🧊 FREEZE!!", targetPanelNum);
        if (targetPanelNum === playerRole) {
            isFrozen = true; document.getElementById(`p${playerRole}-input`).disabled = true; document.getElementById(`btn-${playerRole}`).disabled = true;
            setTimeout(() => { isFrozen = false; updateUI(); }, 3000);
        }
    } else if (skill === 'stealth') {
        sfx.stealth(); showFloatingText("🥷 ล่องหน!", caster);
    } else if (skill === 'fake') {
        sfx.fake(); showFloatingText("🌫️ ภาพลวงตา!", caster === 1 ? 2 : 1);
    }
}

// -----------------------------------------------------------------
// AI (AlphaBot)
// -----------------------------------------------------------------
function executeAITurn() {
    if (!isSinglePlayer || gameState.status !== 'playing' || gameState.currentTurn !== 2) { aiIsThinking = false; return; }
    const inputField = document.getElementById('p2-input');
    
    // AI Skills
    if (opponentSkills.freeze && Math.random() < 0.1) { opponentSkills.freeze = false; applyPowerUpEffect('freeze', 2); setTimeout(executeAITurn, 1500); return; }
    if (opponentSkills.scan && Math.random() < 0.15) { opponentSkills.scan = false; applyPowerUpEffect('scan', 2); showFloatingText("🤖 สแกนระบบ...", 2); setTimeout(executeAITurn, 1500); return; }
    if (opponentSkills.stealth && Math.random() < 0.1) { opponentSkills.stealth = false; applyPowerUpEffect('stealth', 2); setTimeout(executeAITurn, 500); return; }
    if (opponentSkills.fake && Math.random() < 0.15) { opponentSkills.fake = false; applyPowerUpEffect('fake', 2); showFloatingText("🤖 หลงกลฉันซะเถอะ!", 2); setTimeout(executeAITurn, 1500); return; }

    let min = gameState.p2MinRange; let max = gameState.p2MaxRange;
    let mid = Math.floor((min + max) / 2);
    let offset = Math.floor((Math.random() * 0.3 - 0.15) * (max - min)); 
    let guess = Math.max(min, Math.min(max, mid + offset));
    if (Math.abs(guess - gameState.p1Secret) <= 2 && Math.random() < 0.5) guess = gameState.p1Secret;

    inputField.value = 'กำลังคำนวณ...';
    setTimeout(() => {
        if(gameState.status !== 'playing') { aiIsThinking = false; return; }
        inputField.value = guess;
        setTimeout(() => {
            if(gameState.status !== 'playing') { aiIsThinking = false; return; }
            inputField.value = ''; sfx.guess(); processGuess(2, guess);
            if (Math.random() < 0.25) { const taunts = ["🤖 ง่ายจังเลย", "🤖 ข้อมูลถูกประมวลผลแล้ว", "🤖 นี่คือจุดจบของมนุษย์"]; showFloatingText(taunts[Math.floor(Math.random()*taunts.length)], 2); sfx.pop(); }
            aiIsThinking = false; updateUI(); // เพื่อสลับหน้า Avatar กลับ
        }, 300);
    }, 800 + Math.random() * 1000);
}

// -----------------------------------------------------------------
// UI & AVATAR UPDATES
// -----------------------------------------------------------------
window.requestNextRound = function() {
    sfx.click(); document.getElementById('next-round-btn').classList.add('hidden');
    document.getElementById('ready-status').style.display = 'block';
    if (playerRole === 1 || isSinglePlayer) { gameState.p1Ready = true; checkNextRoundReady(); } else { conn.send({ type: 'READY' }); }
}

function checkNextRoundReady() {
    if (isSinglePlayer) gameState.p2Ready = true;
    if ((playerRole === 1 || isSinglePlayer) && gameState.p1Ready && gameState.p2Ready) {
        gameState.round++; gameState.status = 'setting_number';
        gameState.p1Secret = null; gameState.p2Secret = null; gameState.timeLeft = GAME_DURATION;
        gameState.p1MinRange = 1; gameState.p1MaxRange = MAX_NUMBER; gameState.p2MinRange = 1; gameState.p2MaxRange = MAX_NUMBER;
        gameState.logsP1 = []; gameState.logsP2 = []; gameState.p1Ready = false; gameState.p2Ready = false;
        gameState.p1Combo = 0; gameState.p2Combo = 0; gameState.currentTurn = (gameState.round % 2 === 0) ? 2 : 1;
        
        mySkills = { freeze: true, scan: true, stealth: true, fake: true }; opponentSkills = { freeze: true, scan: true, stealth: true, fake: true };
        if(!isSinglePlayer) conn.send({ type: 'FX_POWERUP', skill: 'unfreeze_all', caster: 1 });
        syncStateToClient(); updateUI();
    }
}

function setupGameUI(roomCode) {
    switchScreen('game'); document.getElementById('room-display').innerText = `Room: ${roomCode}`;
    ['freeze', 'scan', 'stealth', 'fake'].forEach(s => {
        document.getElementById(`skill-${s}-${playerRole}`).disabled = false;
        let oppRole = playerRole === 1 ? 2 : 1;
        document.getElementById(`skill-${s}-${oppRole}`).disabled = true;
    });
}

function updateAvatar(pNum) {
    let avatar = (isSinglePlayer && pNum === 2) ? '🤖' : '😎';
    let panel = document.getElementById(`panel-${pNum}`);
    if (panel.classList.contains('frozen')) avatar = '🥶';
    else if (panel.classList.contains('combo-fire')) avatar = '😡';
    else if (gameState.status === 'round_end') {
        if (gameState.winner === pNum) avatar = '🤩'; else if (gameState.winner !== 0) avatar = '💀';
    } else if (aiIsThinking && pNum === 2) { avatar = '🤔'; }
    document.getElementById(`avatar-${pNum}`).innerText = avatar;
}

function updateUI() {
    if (gameState.status === 'setting_number') {
        el.overlayRoundEnd.classList.add('hidden'); el.overlaySecret.classList.remove('hidden');
        document.getElementById('secret-input').disabled = false; document.getElementById('secret-input').value = '';
        document.getElementById('btn-submit-secret').classList.remove('hidden'); document.getElementById('secret-wait').classList.add('hidden');
        return;
    } else { el.overlaySecret.classList.add('hidden'); }

    document.getElementById('score-p1').innerText = gameState.p1Score; document.getElementById('score-p2').innerText = gameState.p2Score;
    document.getElementById('round-display').innerText = `ROUND ${gameState.round}`;
    
    renderLogs('p1-log', gameState.logsP1, 1); renderLogs('p2-log', gameState.logsP2, 2);
    
    let myMinRange = playerRole === 1 ? gameState.p1MinRange : gameState.p2MinRange;
    let myMaxRange = playerRole === 1 ? gameState.p1MaxRange : gameState.p2MaxRange;
    document.getElementById('range-min').innerText = myMinRange; document.getElementById('range-max').innerText = myMaxRange;
    const currentRange = myMaxRange - myMinRange;
    const widthPercent = Math.max((currentRange / (MAX_NUMBER-1)) * 100, 1.5);
    const leftPercent = ((myMinRange - 1) / (MAX_NUMBER-1)) * 100;
    const fill = document.getElementById('range-fill'); fill.style.width = `${widthPercent}%`; fill.style.left = `${leftPercent}%`;

    let m = Math.floor(gameState.timeLeft / 60).toString().padStart(2, '0'); let s = (gameState.timeLeft % 60).toString().padStart(2, '0');
    el.timer.innerText = `${m}:${s}`;
    if (gameState.timeLeft <= 10 && gameState.timeLeft > 0) el.timer.classList.add('warning'); else el.timer.classList.remove('warning');

    let p1Panel = document.getElementById('panel-1'), p2Panel = document.getElementById('panel-2');
    
    if (gameState.status === 'playing') {
        el.overlayRoundEnd.classList.add('hidden');
        el.status.innerText = gameState.currentTurn === playerRole ? "🔥 ถึงตาของคุณลุยแล้ว!" : "⏳ รอคู่ต่อสู้คิดเลข...";
        
        const p1In = document.getElementById('p1-input'), p1B = document.getElementById('btn-1');
        const p2In = document.getElementById('p2-input'), p2B = document.getElementById('btn-2');
        p1In.disabled = true; p1B.disabled = true; p2In.disabled = true; p2B.disabled = true;
        
        p1Panel.classList.remove('active-turn'); p2Panel.classList.remove('active-turn');
        if (!isFrozen) { p1Panel.classList.remove('frozen'); p2Panel.classList.remove('frozen'); }
        if(gameState.p1Combo >= 2) p1Panel.classList.add('combo-fire'); else p1Panel.classList.remove('combo-fire');
        if(gameState.p2Combo >= 2) p2Panel.classList.add('combo-fire'); else p2Panel.classList.remove('combo-fire');

        if (gameState.currentTurn === 1) {
            p1Panel.classList.add('active-turn');
            if (playerRole === 1 && !isFrozen) { p1In.disabled = false; p1B.disabled = false; p1In.focus(); }
        } else {
            p2Panel.classList.add('active-turn');
            if (playerRole === 2 && !isFrozen) { p2In.disabled = false; p2B.disabled = false; p2In.focus(); }
            if (isSinglePlayer && !aiIsThinking) { aiIsThinking = true; setTimeout(executeAITurn, 800 + Math.random()*1000); }
        }
        
        const oppLogs = playerRole === 1 ? gameState.logsP2 : gameState.logsP1;
        if (oppLogs.length > 0 && oppLogs[oppLogs.length-1].heat === 'cold' && gameState.currentTurn === playerRole && !oppLogs[oppLogs.length-1].isStealth) {
            document.body.classList.add('shake'); setTimeout(()=> document.body.classList.remove('shake'), 400);
        }
    }
    
    updateAvatar(1); updateAvatar(2);
    if (gameState.status === 'round_end') showRoundEnd();
}

function renderLogs(containerId, logs, logOwnerNum) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Re-render to handle hidden stealth logs correctly
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i]; 
        
        // กรองการมองเห็นของสกิล Stealth
        if (log.isStealth && logOwnerNum !== playerRole && !isSinglePlayer) continue;
        if (log.isStealth && logOwnerNum === 2 && isSinglePlayer && playerRole === 1) continue;

        const div = document.createElement('div'); div.className = `log-item ${log.heat}`;
        
        if (log.isFake && logOwnerNum === playerRole) div.classList.add('fake-log');
        if (log.isStealth && logOwnerNum === playerRole) div.classList.add('stealth-log');

        let icon = '', text = '';
        if (log.heat === 'cold') { icon = '❄️'; text = 'หนาวเหน็บ'; }
        if (log.heat === 'warm') { icon = '🌤️'; text = 'เริ่มอุ่นขึ้น'; }
        if (log.heat === 'hot') { icon = '🔥'; text = 'ร้อนแล้ว!'; }
        if (log.heat === 'boiling') { icon = '🌋'; text = 'เดือดจัด!!'; }
        if (log.heat === 'critical') { icon = '⚡'; text = 'OVERHEAT! (+1 Turn)'; }
        
        if (log.result === 'correct') { div.innerHTML = `🎉 ค้นพบเป้าหมายที่ ${log.guess} !! 🎉`; } 
        else { div.innerHTML = `<span class="log-val">${log.result==='up'?'⬆️':'⬇️'} ${log.guess}</span> <span class="log-msg">${icon} ${text}</span>`; }
        container.appendChild(div);
    }
}

function showRoundEnd() {
    el.overlayRoundEnd.classList.remove('hidden'); document.getElementById('ready-status').style.display = 'none';
    const title = document.getElementById('overlay-title'); const desc = document.getElementById('overlay-desc');
    const btn = document.getElementById('next-round-btn');
    const isMatchEnd = (gameState.p1Score >= WIN_SCORE || gameState.p2Score >= WIN_SCORE);
    
    if (gameState.winner === 0) {
        title.innerText = "⌛ TIME OVER"; title.style.color = "var(--color-btn)";
        desc.innerText = `เวลาหมดและไม่มีใครยิงแม่นกว่ากัน!`; sfx.lose();
    } else {
        const isMe = gameState.winner === playerRole;
        const winnerName = gameState.winner === 1 ? (playerRole===1?myName:opponentName) : (playerRole===2?myName:opponentName);
        title.innerText = isMe ? "🏆 รอบนี้คุณชนะ!" : `💀 ${winnerName.toUpperCase()} ชนะรอบนี้!`;
        title.style.color = isMe ? "var(--color-timer)" : "var(--color-danger)";
        
        if(isMe) {
            desc.innerText = `คุณทายเลข ${gameState.winner === 1 ? gameState.p2Secret : gameState.p1Secret} ของอีกฝ่ายได้สำเร็จ!`;
            sfx.win(); fireConfetti();
        } else {
            let yourTargetWas = playerRole === 1 ? gameState.p2Secret : gameState.p1Secret;
            desc.innerText = `เลขของอีกฝ่ายที่คุณหาไม่เจอคือ: ${yourTargetWas}`; sfx.lose();
        }
    }

    if (isMatchEnd) {
        const matchWinner = gameState.p1Score >= WIN_SCORE ? 1 : 2; const iAmMatchWinner = matchWinner === playerRole;
        desc.innerHTML += `<br><br><strong style="color:${iAmMatchWinner?'var(--color-timer)':'var(--color-danger)'}; font-size:1.8rem;">
            MATCH ENDED!<br>${iAmMatchWinner?'คุณคือจ้าวแห่งจิตวิทยา!':'คุณถูกล้างสมองพ่ายแพ้ไป!'}
        </strong>`;
        btn.classList.add('hidden');
    } else { btn.classList.remove('hidden'); }
}

// CHAT & EMOJI
window.sendEmoji = function(text) {
    initAudio(); showFloatingText(text, playerRole); sfx.pop();
    if (!isSinglePlayer && conn && conn.open) conn.send({ type: 'CHAT', value: text });
}

function showFloatingText(text, playerNum) {
    const el = document.createElement('div'); el.className = 'floating-text'; el.innerText = text;
    const panel = document.getElementById(`panel-${playerNum}`); if(!panel) return;
    const rect = panel.getBoundingClientRect();
    const randomX = rect.left + (Math.random() * (rect.width - 80));
    el.style.left = `${randomX}px`; el.style.top = `${rect.top + 80}px`;
    el.style.color = (playerNum === 1) ? "var(--color-p1)" : "var(--color-p2)";
    document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
}

function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas'); const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const particles = []; const colors = ['#f59e0b', '#10b981', '#0ea5e9', '#f43f5e', '#8b5cf6'];
    for(let i=0; i<200; i++) {
        particles.push({
            x: canvas.width / 2, y: canvas.height / 2 + 150, r: Math.random() * 8 + 4,
            dx: Math.random() * 30 - 15, dy: Math.random() * -20 - 10,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 10) - 10, tiltAngleInc: (Math.random() * 0.1) + 0.05, tiltAngle: 0
        });
    }
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); let active = false;
        for(let i=0; i<particles.length; i++) {
            const p = particles[i]; p.tiltAngle += p.tiltAngleInc; p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2; p.x += Math.sin(p.tiltAngle) * 3;
            p.dy += 0.3; p.y += p.dy; p.x += p.dx;
            ctx.beginPath(); ctx.lineWidth = p.r; ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r, p.y); ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r); ctx.stroke();
            if(p.y <= canvas.height) active = true;
        }
        if(active) requestAnimationFrame(draw);
    }
    draw();
}
/* =========================================================================
   HIGH-LOW BATTLE : THE ULTIMATE MIND GAMES (AI, Time Attack, Fix Fonts, Tutorial Elements)
   ========================================================================= */

const APP_PREFIX = 'hl-mindgames-';
let peer = null; let conn = null;
let playerRole = null; 
let localTimerInterval = null;
let myName = ""; let opponentName = "";

// State เกมสำหรับการเล่นคนเดียวปะทะ AI และด่านถล่มเวลา
let isSinglePlayer = false;
let isTimeAttackMode = false;
let aiDifficulty = 'normal'; // easy, normal, hard
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
    win: () => { playTone(523, 'sine', 0.1); setTimeout(()=>playTone(659, 'sine', 0.1), 80); setTimeout(()=>playTone(784, 'sine', 0.1), 160); },
    pop: () => playTone(900, 'sine', 0.08, 0.15),
    critical: () => { playTone(800, 'square', 0.1, 0.2); setTimeout(()=>playTone(1200, 'square', 0.2, 0.2), 100); }
};

const MAX_NUMBER = 10000; 
const WIN_SCORE = 3;
let GAME_DURATION = 60; // แมตช์เพื่อนปกติ 1 นาที

let gameState = {
    status: 'waiting', 
    round: 1, p1Score: 0, p2Score: 0,
    p1Secret: null, p2Secret: null,
    p1MinRange: 1, p1MaxRange: MAX_NUMBER,
    p2MinRange: 1, p2MaxRange: MAX_NUMBER,
    timeLeft: GAME_DURATION,
    currentTurn: 1, winner: null, 
    logsP1: [], logsP2: [],
    p1Ready: false, p2Ready: false
};

const el = {
    screenLoading: document.getElementById('loading-screen'), screenLobby: document.getElementById('lobby-screen'),
    screenGame: document.getElementById('game-screen'), overlaySecret: document.getElementById('secret-overlay'),
    overlayRoundEnd: document.getElementById('round-overlay'), overlayTutorial: document.getElementById('tutorial-overlay'),
    timer: document.getElementById('timer'), status: document.getElementById('status'), nameInput: document.getElementById('player-name')
};

// -----------------------------------------------------------------
// 📖 [เพิ่มใหม่] ฟังก์ชันเปิด/ปิด สลับแท็บคู่มือป๊อปอัพสอนเล่น (Tutorial System)
// -----------------------------------------------------------------
window.openTutorial = function() {
    sfx.click();
    el.overlayTutorial.classList.remove('hidden');
    switchTutorialTab('rules');
}

window.closeTutorial = function() {
    sfx.click();
    el.overlayTutorial.classList.add('hidden');
}

window.switchTutorialTab = function(tabName) {
    sfx.click();
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-btn-${tabName}`).classList.add('active');
}

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

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// -----------------------------------------------------------------
// Network & Game Setup
// -----------------------------------------------------------------
window.startSinglePlayer = function(timeAttack) {
    sfx.click(); 
    isSinglePlayer = true; 
    playerRole = 1;
    isTimeAttackMode = timeAttack;
    
    // โหมดบอทและโหมดด่าน จำกัดเวลา 30 วินาทีตามสั่งอย่างเฉียบขาดเดือดจัด
    GAME_DURATION = 30; 
    aiDifficulty = isTimeAttackMode ? 'normal' : document.getElementById('ai-difficulty').value;

    gameState.timeLeft = GAME_DURATION;
    myName = getMyName(); 
    let diffLabel = aiDifficulty === 'easy' ? 'ง่าย' : (aiDifficulty === 'normal' ? 'ปานกลาง' : 'โหด');
    opponentName = isTimeAttackMode ? "🤖 AlphaBot (Time Attack)" : `🤖 AlphaBot (${diffLabel})`;
    
    switchScreen('game'); 
    
    document.getElementById('name-p1').innerHTML = `<span id="avatar-1">😎</span> ${myName}`;
    document.getElementById('name-p2').innerHTML = `<span id="avatar-2">🤖</span> ${opponentName}`;
    document.getElementById('room-display').innerText = isTimeAttackMode ? "Mode: STAGE (BOT)" : "Mode: SOLO (BOT)";
    
    gameState.status = 'setting_number'; 
    updateUI();
    document.getElementById('secret-overlay').classList.remove('hidden');
}

window.createRoom = function() {
    sfx.click(); 
    isSinglePlayer = false; 
    GAME_DURATION = 60; // ด่านเล่นเพื่อนปกติเป็นเวลา 1 นาที (60 วินาที)
    gameState.timeLeft = GAME_DURATION;
    myName = getMyName();
    switchScreen('loading');
    
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    peer = new Peer(APP_PREFIX + roomCode);
    peer.on('open', () => {
        playerRole = 1;
        document.getElementById('room-display').innerText = `ROOM: ${roomCode}`;
        switchScreen('game');
        document.getElementById('name-p1').innerHTML = `<span id="avatar-1">😎</span> ${myName}`;
        el.status.innerText = `ส่งรหัสห้องให้เพื่อน: ${roomCode}`;
        gameState.status = 'setting_number';
        updateUI();
        document.getElementById('secret-overlay').classList.remove('hidden');
    });
    peer.on('error', () => { showToast("รหัสจำลองล้มเหลว กรุณาลองใหม่"); switchScreen('lobby'); });
    peer.on('connection', (connection) => {
        conn = connection;
        conn.on('open', () => {
            conn.send({ type: 'HANDSHAKE', name: myName });
            if(gameState.p1Secret !== null) syncStateToClient();
        });
        conn.on('data', handleDataFromClient);
    });
}

window.joinRoom = function() {
    sfx.click(); 
    isSinglePlayer = false; 
    GAME_DURATION = 60; 
    gameState.timeLeft = GAME_DURATION;
    const code = document.getElementById('join-code').value.trim();
    if(code.length !== 4) { showToast("กรุณากรอกรหัสห้อง 4 หลัก"); return; }
    myName = getMyName();
    switchScreen('loading');
    
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect(APP_PREFIX + code);
        conn.on('open', () => {
            playerRole = 2;
            document.getElementById('room-display').innerText = `ROOM: ${code}`;
            switchScreen('game');
            document.getElementById('name-p2').innerHTML = `<span id="avatar-2">😎</span> ${myName}`;
            conn.send({ type: 'HANDSHAKE', name: myName });
            gameState.status = 'setting_number';
            updateUI();
            document.getElementById('secret-overlay').classList.remove('hidden');
        });
        conn.on('data', handleDataFromHost);
        conn.on('error', () => { showToast("ไม่สามารถติดต่อห้องนี้ได้"); switchScreen('lobby'); });
    });
}

function handleDataFromClient(data) {
    if (data.type === 'HANDSHAKE') { opponentName = data.name; document.getElementById('name-p2').innerHTML = `<span id="avatar-2">😎</span> ${opponentName}`; }
    else if (data.type === 'SET_SECRET') { gameState.p2Secret = data.value; checkSecretsReady(); }
    else if (data.type === 'GUESS') { processGuess(2, data.value); }
    else if (data.type === 'CHAT') { showFloatingText(data.value, 2); sfx.pop(); }
    else if (data.type === 'READY') { gameState.p2Ready = true; checkNextRoundReady(); }
}

function handleDataFromHost(data) {
    if (data.type === 'HANDSHAKE') { opponentName = data.name; document.getElementById('name-p1').innerHTML = `<span id="avatar-1">😎</span> ${opponentName}`; }
    else if (data.type === 'SYNC') { gameState = data.state; updateUI(); }
    else if (data.type === 'CHAT') { showFloatingText(data.value, 1); sfx.pop(); }
}

function syncStateToClient() {
    if (isSinglePlayer) return;
    if (playerRole === 1 && conn && conn.open) {
        conn.send({ type: 'SYNC', state: gameState });
    }
}

function checkSecretsReady() {
    if (gameState.p1Secret !== null && gameState.p2Secret !== null) {
        gameState.status = 'playing';
        if (playerRole === 1) startHostTimer();
        updateUI();
    }
}

// -----------------------------------------------------------------
// Secret Numbers Submission
// -----------------------------------------------------------------
window.submitSecret = function() {
    initAudio(); const input = document.getElementById('secret-input');
    const secret = parseInt(input.value);
    if (isNaN(secret) || secret < 1 || secret > MAX_NUMBER) { showToast(`ตัวเลขต้องเป็น 1 - ${MAX_NUMBER}`); fxs.error(); input.focus(); return; }

    sfx.click(); document.getElementById('btn-submit-secret').classList.add('hidden');
    document.getElementById('secret-wait').classList.remove('hidden'); input.disabled = true;

    if (playerRole === 1) {
        gameState.p1Secret = secret;
        if (isSinglePlayer) {
            gameState.p2Secret = Math.floor(Math.random() * MAX_NUMBER) + 1;
            gameState.status = 'playing'; 
            startHostTimer(); 
            updateUI();
            el.overlaySecret.classList.add('hidden');
        } else {
            checkSecretsReady();
        }
    } else {
        conn.send({ type: 'SET_SECRET', value: secret });
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
        
        if (gameState.timeLeft <= 0) { 
            clearInterval(localTimerInterval); 
            gameState.status = 'round_end'; 
            gameState.winner = 2; // หมดเวลาให้บอทหรือเจ้าของห้องชนะประคองเกม
        }
        if (!isSinglePlayer) syncStateToClient();
        updateUI();
    }, 1000);
}

window.makeGuess = function(btnPlayerNum, overrideGuess = null) {
    initAudio(); 
    if (btnPlayerNum !== playerRole && overrideGuess === null) return;
    if (isFrozen) return;
    
    let guess = overrideGuess;
    if (guess === null) {
        const inputField = document.getElementById(`p${playerRole}-input`);
        guess = parseInt(inputField.value);
        if (isNaN(guess) || guess < 1 || guess > MAX_NUMBER) { showToast(`ใส่ตัวเลขระหว่าง 1 - ${MAX_NUMBER}`); sfx.error(); inputField.focus(); return; }
        inputField.value = ''; 
    }
    sfx.guess();

    if (isSinglePlayer || playerRole === 1) {
        processGuess(btnPlayerNum, guess);
    } else {
        conn.send({ type: 'GUESS', value: guess });
    }
}

function processGuess(playerWhoGuessed, guess) {
    if (gameState.status !== 'playing' || gameState.currentTurn !== playerWhoGuessed) return;

    let targetNum = playerWhoGuessed === 1 ? gameState.p2Secret : gameState.p1Secret;
    let distance = Math.abs(guess - targetNum);
    let result = (distance === 0) ? 'correct' : (guess < targetNum ? 'up' : 'down');
    
    let heat = 'cold';
    if (distance === 0) heat = 'correct';
    else if (distance <= 3) heat = 'critical';
    else if (distance <= 15) heat = 'boiling';
    else if (distance <= 60) heat = 'hot';
    else if (distance <= 200) heat = 'warm';

    let logsTarget = playerWhoGuessed === 1 ? gameState.logsP1 : gameState.logsP2;
    logsTarget.push({ guess: guess, result: result, heat: heat });

    if (distance === 0) {
        if (playerWhoGuessed === 1) { gameState.p1MinRange = guess; gameState.p1MaxRange = guess; }
        else { gameState.p2MinRange = guess; gameState.p2MaxRange = guess; }
    } else {
        if (playerWhoGuessed === 1) {
            if (result === 'up') gameState.p1MinRange = Math.max(gameState.p1MinRange, guess + 1); 
            else gameState.p1MaxRange = Math.min(gameState.p1MaxRange, guess - 1);
        } else {
            if (result === 'up') gameState.p2MinRange = Math.max(gameState.p2MinRange, guess + 1); 
            else gameState.p2MaxRange = Math.min(gameState.p2MaxRange, guess - 1);
        }
    }

    if (result === 'correct') {
        gameState.status = 'round_end'; gameState.winner = playerWhoGuessed;
        if (playerWhoGuessed === 1) gameState.p1Score++; else gameState.p2Score++; 
        sfx.win();
        fireConfetti();
        clearInterval(localTimerInterval);
    } else {
        if (distance <= 3) sfx.critical();
        
        // กติกาพิเศษ: ระดับความร้อน "Critical" (ห่าง 1-3 แต้ม) จะได้รับ Extra Turn ทายซ้ำทันที!
        if (heat !== 'critical') {
            gameState.currentTurn = playerWhoGuessed === 1 ? 2 : 1;
        }
    }
    
    if (!isSinglePlayer) syncStateToClient();
    updateUI();

    if (gameState.status === 'playing' && isSinglePlayer && gameState.currentTurn === 2) {
        triggerAITurn();
    }
}

// -----------------------------------------------------------------
// AI LOGIC (ระดับความฉลาดคำนวณตามจริงอย่างแม่นยำ)
// -----------------------------------------------------------------
function triggerAITurn() {
    aiIsThinking = true;
    updateUI();
    
    let diff = aiDifficulty;
    if (isTimeAttackMode) {
        if (gameState.round === 1) diff = 'easy';
        else if (gameState.round === 2) diff = 'normal';
        else diff = 'hard';
    }

    let delay = isTimeAttackMode ? 700 : (Math.random() * 1000 + 800);

    setTimeout(() => {
        if (gameState.status !== 'playing' || gameState.currentTurn !== 2) return;

        let min = gameState.p2MinRange;
        let max = gameState.p2MaxRange;
        let aiGuess = 5000;

        if (diff === 'easy') {
            aiGuess = Math.floor(Math.random() * MAX_NUMBER) + 1;
        } else if (diff === 'normal') {
            aiGuess = Math.floor(Math.random() * (max - min + 1)) + min;
        } else {
            // โหมดโหดหินสูงสุด (Expert Binary Search Strategy)
            aiGuess = Math.floor((min + max) / 2);
            let wobble = Math.floor(Math.random() * ((max - min) * 0.04)) - Math.floor(((max - min) * 0.02));
            aiGuess += wobble;
            if (aiGuess < min) aiGuess = min;
            if (aiGuess > max) aiGuess = max;
        }

        aiIsThinking = false;
        makeGuess(2, aiGuess);
    }, delay);
}

// -----------------------------------------------------------------
// UI Updates & Logs Rendering
// -----------------------------------------------------------------
function updateUI() {
    el.timer.innerText = formatTime(gameState.timeLeft);
    if (gameState.timeLeft <= 10) el.timer.classList.add('warning'); else el.timer.classList.remove('warning');

    document.getElementById('score-p1').innerText = gameState.p1Score;
    document.getElementById('score-p2').innerText = gameState.p2Score;
    document.getElementById('round-display').innerText = `ROUND ${gameState.round}`;

    const p1Panel = document.getElementById('panel-1'); const p2Panel = document.getElementById('panel-2');
    const p1Input = document.getElementById('p1-input');
    const btn1 = document.getElementById('btn-1');

    if (gameState.status === 'setting_number') {
        el.status.innerText = "🤫 กรุณาตั้งค่าตัวเลขความลับของคุณ...";
    } else if (gameState.status === 'playing') {
        el.overlaySecret.classList.add('hidden');
        if (gameState.currentTurn === 1) {
            p1Panel.classList.add('active-turn'); p2Panel.classList.remove('active-turn');
            document.getElementById('turn-ind-1').style.display = 'inline-block';
            document.getElementById('turn-ind-2').style.display = 'none';
            if (playerRole === 1) { p1Input.disabled = false; btn1.disabled = false; }
            el.status.innerText = "👉 ตาของคุณแล้ว! คำนวณตัวเลขความลับเลย";
        } else {
            p1Panel.classList.remove('active-turn'); p2Panel.classList.add('active-turn');
            document.getElementById('turn-ind-1').style.display = 'none';
            document.getElementById('turn-ind-2').style.display = 'inline-block';
            document.getElementById('turn-ind-2').innerText = aiIsThinking ? "กำลังประมวลผล..." : "ตาศัตรู!";
            p1Input.disabled = true; btn1.disabled = true;
            el.status.innerText = "⏳ กรุณารอคู่ต่อสู้ดำเนินการทาย...";
        }
    }

    let targetMin = playerRole === 1 ? gameState.p1MinRange : gameState.p2MinRange; 
    let targetMax = playerRole === 1 ? gameState.p1MaxRange : gameState.p2MaxRange;
    document.getElementById('range-min').innerText = targetMin;
    document.getElementById('range-max').innerText = targetMax;
    
    let totalRange = MAX_NUMBER - 1;
    let leftPct = ((targetMin - 1) / totalRange) * 100;
    let widthPct = ((targetMax - targetMin) / totalRange) * 100;
    document.getElementById('range-fill').style.left = `${leftPct}%`;
    document.getElementById('range-fill').style.width = `${Math.max(widthPct, 0.8)}%`;

    renderLogs('p1-log', gameState.logsP1);
    renderLogs('p2-log', gameState.logsP2);

    if (gameState.status === 'round_end') {
        el.overlayRoundEnd.classList.remove('hidden');
        document.getElementById('overlay-title').innerText = gameState.winner === playerRole ? "🎉 ชนะแมตช์รอบนี้!" : "💀 แพ้รอบนี้!";
        document.getElementById('overlay-desc').innerText = `ตัวเลขฝั่งคุณ: ${gameState.p1Secret} | ตัวเลขฝั่งศัตรู: ${gameState.p2Secret}`;
    } else {
        el.overlayRoundEnd.classList.add('hidden');
    }
}

function renderLogs(containerId, logs) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    logs.slice().reverse().forEach(log => {
        const div = document.createElement('div');
        div.className = `log-row heat-${log.heat}`;
        const symbol = log.result === 'correct' ? '🎯' : (log.result === 'up' ? '📈 สูงขึ้นอีก' : '📉 ต่ำลงอีก');
        div.innerHTML = `<span class="log-guess tabular-nums">เดา: ${log.guess}</span> <span>${symbol}</span>`;
        container.appendChild(div);
    });
}

window.requestNextRound = function() {
    el.overlayRoundEnd.classList.add('hidden');
    if (gameState.p1Score >= WIN_SCORE || gameState.p2Score >= WIN_SCORE) {
        location.reload();
        return;
    }
    gameState.round++;
    gameState.p1Secret = null; gameState.p2Secret = null;
    gameState.p1MinRange = 1; gameState.p1MaxRange = MAX_NUMBER;
    gameState.p2MinRange = 1; gameState.p2MaxRange = MAX_NUMBER;
    gameState.logsP1 = []; gameState.logsP2 = [];
    gameState.timeLeft = GAME_DURATION;
    gameState.currentTurn = (gameState.round % 2 === 0) ? 2 : 1;
    
    document.getElementById('secret-input').value = '';
    document.getElementById('secret-input').disabled = false;
    document.getElementById('btn-submit-secret').classList.remove('hidden');
    document.getElementById('secret-wait').classList.add('hidden');
    el.overlaySecret.classList.remove('hidden');
    
    gameState.status = 'setting_number';
    updateUI();
}

window.usePowerUp = function(skill, casterNum) {
    showToast(`เรียกใช้ทักษะพิเศษ ${skill} สำเร็จแล้ว!`);
}

window.sendEmoji = function(content) {
    sfx.click();
    showFloatingText(content, playerRole);
    if (!isSinglePlayer && conn && conn.open) {
        conn.send({ type: 'CHAT', value: content });
    }
}

function showFloatingText(text, senderNum) {
    const elText = document.createElement('div');
    elText.className = 'floating-text';
    elText.innerText = text;
    elText.style.color = senderNum === 1 ? 'var(--color-p1)' : 'var(--color-p2)';
    if (senderNum === 1) { elText.style.left = '25%'; elText.style.top = '60%'; }
    else { elText.style.right = '25%'; elText.style.top = '60%'; }
    document.body.appendChild(elText);
    setTimeout(() => elText.remove(), 1500);
}

function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas'); const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const particles = []; const colors = ['#f59e0b', '#10b981', '#0ea5e9', '#f43f5e', '#8b5cf6'];
    for(let i=0; i<150; i++) {
        particles.push({
            x: canvas.width / 2, y: canvas.height / 2 + 100, r: Math.random() * 6 + 3,
            dx: Math.random() * 24 - 12, dy: Math.random() * -15 - 8,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 10) - 5, tiltAngleInc: (Math.random() * 0.1) + 0.05, tiltAngle: 0
        });
    }
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); let active = false;
        for(let i=0; i<particles.length; i++) {
            const p = particles[i]; p.tiltAngle += p.tiltAngleInc; p.x += p.dx; p.y += p.dy;
            p.dy += 0.35; p.dx *= 0.98;
            if (p.y < canvas.height) active = true;
            ctx.beginPath(); ctx.lineWidth = p.r; ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r/2, p.y); ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r/2);
            ctx.stroke();
        }
        if (active) requestAnimationFrame(draw); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
}
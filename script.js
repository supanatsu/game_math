// --- ตัวแปรหลักของระบบ P2P ---
const APP_PREFIX = 'hl-battle-';
let peer = null;
let conn = null;
let playerRole = null; // 1 = Host, 2 = Client
let localTimerInterval = null;

// --- ข้อมูลเกม (เก็บไว้ที่เครื่อง Host) ---
const MAX_NUMBER = 1000;
const GAME_DURATION = 60;
let gameState = {
    status: 'waiting', // waiting, playing, finished
    targetNumber: null,
    timeLeft: GAME_DURATION,
    currentTurn: 1,
    winner: null,
    minRange: 1,
    maxRange: MAX_NUMBER,
    logsP1: [],
    logsP2: [],
    latestEmoji: null
};

// UI Elements
const screens = {
    loading: document.getElementById('loading-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};
const timerDisplay = document.getElementById('timer');
const statusDisplay = document.getElementById('status');
const roomDisplay = document.getElementById('room-display');
const p1Input = document.getElementById('p1-input');
const p2Input = document.getElementById('p2-input');
const p1Btn = document.getElementById('btn-1');
const p2Btn = document.getElementById('btn-2');

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ----------------------------------------------------
// ระบบเชื่อมต่อ Peer-to-Peer
// ----------------------------------------------------

// 1. สร้างห้อง (เครื่องนี้จะเป็น Host)
window.createRoom = function() {
    switchScreen('loading');
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = APP_PREFIX + roomCode;

    // สร้าง Peer และจอง ID
    peer = new Peer(peerId);

    peer.on('open', (id) => {
        playerRole = 1;
        gameState.targetNumber = Math.floor(Math.random() * MAX_NUMBER) + 1;
        setupGameUI(roomCode);
        statusDisplay.innerText = `ส่งรหัส ${roomCode} ให้เพื่อนเลย!`;
    });

    peer.on('error', (err) => {
        showToast("สร้างห้องไม่สำเร็จ! ลองกดใหม่");
        switchScreen('lobby');
    });

    // เมื่อมี Player 2 กดเชื่อมต่อเข้ามา
    peer.on('connection', (connection) => {
        conn = connection;
        
        conn.on('open', () => {
            // เริ่มเกม!
            gameState.status = 'playing';
            syncStateToClient(); // ส่งข้อมูลเริ่มต้นไปให้ Client
            startHostTimer(); // เริ่มจับเวลา
            updateUI();
        });

        // รอรับคำสั่ง (ทายเลข หรือ ส่งอีโมจิ) จาก Player 2
        conn.on('data', (data) => {
            if (data.type === 'GUESS') {
                processGuess(2, data.value);
            } else if (data.type === 'EMOJI') {
                showFloatingEmoji(data.value, 2);
            }
        });
    });
}

// 2. เข้าร่วมห้อง (เครื่องนี้จะเป็น Client)
window.joinRoom = function() {
    const code = document.getElementById('join-code').value.trim();
    if (code.length !== 4) { showToast("ใส่รหัส 4 หลัก!"); return; }

    switchScreen('loading');
    peer = new Peer(); // Client ไม่ต้องกำหนด ID ตัวเอง

    peer.on('open', () => {
        // วิ่งไปขอเชื่อมต่อกับ Host
        conn = peer.connect(APP_PREFIX + code);

        conn.on('open', () => {
            playerRole = 2;
            setupGameUI(code);
        });

        // รับข้อมูลอัปเดตจาก Host
        conn.on('data', (data) => {
            if (data.type === 'SYNC') {
                gameState = data.state;
                updateUI();
            } else if (data.type === 'EMOJI') {
                showFloatingEmoji(data.value, 1);
            }
        });

        conn.on('error', () => {
            showToast("หาห้องไม่เจอ หรือห้องอาจจะถูกปิดไปแล้ว");
            switchScreen('lobby');
        });
    });
}

function syncStateToClient() {
    if (playerRole === 1 && conn && conn.open) {
        conn.send({ type: 'SYNC', state: gameState });
    }
}

// ----------------------------------------------------
// ระบบ Game Logic (ส่วนนี้ประมวลผลที่ Host อย่างเดียว)
// ----------------------------------------------------

function startHostTimer() {
    localTimerInterval = setInterval(() => {
        if (gameState.status !== 'playing') return;
        
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            clearInterval(localTimerInterval);
            gameState.status = 'finished';
            gameState.winner = 0;
            gameState.timeLeft = 0;
        }
        syncStateToClient();
        updateUI();
    }, 1000);
}

window.makeGuess = function(btnPlayerNum) {
    if (btnPlayerNum !== playerRole) return;
    
    const inputField = playerRole === 1 ? p1Input : p2Input;
    const guess = parseInt(inputField.value);

    if (isNaN(guess) || guess < 1 || guess > MAX_NUMBER) {
        showToast(`กรุณาใส่เลข 1 - ${MAX_NUMBER}`);
        inputField.focus(); return;
    }

    inputField.value = '';
    
    if (playerRole === 1) {
        // Host ประมวลผลเองได้เลย
        processGuess(1, guess);
    } else {
        // Client ต้องส่งตัวเลขไปให้ Host ประมวลผล
        conn.send({ type: 'GUESS', value: guess });
    }
}

function processGuess(playerWhoGuessed, guess) {
    if (gameState.status !== 'playing' || gameState.currentTurn !== playerWhoGuessed) return;

    let result = '';
    let isCorrect = false;

    if (guess === gameState.targetNumber) { 
        result = 'correct'; isCorrect = true; 
        gameState.minRange = guess; gameState.maxRange = guess;
    } else if (guess < gameState.targetNumber) { 
        result = 'up'; 
        gameState.minRange = Math.max(gameState.minRange, guess + 1); 
    } else { 
        result = 'down'; 
        gameState.maxRange = Math.min(gameState.maxRange, guess - 1); 
    }

    const logEntry = { guess, result };
    if (playerWhoGuessed === 1) { gameState.logsP1.push(logEntry); } 
    else { gameState.logsP2.push(logEntry); }

    if (isCorrect) { 
        gameState.status = 'finished'; 
        gameState.winner = playerWhoGuessed; 
        clearInterval(localTimerInterval);
    } else { 
        gameState.currentTurn = playerWhoGuessed === 1 ? 2 : 1; 
    }

    syncStateToClient();
    updateUI();
}

window.sendEmoji = function(emoji) {
    showFloatingEmoji(emoji, playerRole);
    if (playerRole === 1 && conn && conn.open) {
        conn.send({ type: 'EMOJI', value: emoji });
    } else if (playerRole === 2 && conn && conn.open) {
        conn.send({ type: 'EMOJI', value: emoji });
    }
}

// ----------------------------------------------------
// ระบบ UI
// ----------------------------------------------------

function setupGameUI(roomCode) {
    switchScreen('game');
    roomDisplay.innerText = `รหัสห้อง: ${roomCode}`;
    document.getElementById('panel-1').classList.remove('is-me');
    document.getElementById('panel-2').classList.remove('is-me');
    document.getElementById(`panel-${playerRole}`).classList.add('is-me');
}

function updateUI() {
    renderLogs('p1-log', gameState.logsP1);
    renderLogs('p2-log', gameState.logsP2);
    updateRangeTracker(gameState.minRange, gameState.maxRange);

    // Update Timer
    let m = Math.floor(gameState.timeLeft / 60).toString().padStart(2, '0');
    let s = (gameState.timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;

    if (gameState.timeLeft <= 10 && gameState.timeLeft > 0) timerDisplay.classList.add('warning');
    else timerDisplay.classList.remove('warning');

    if (gameState.status === 'playing') {
        document.getElementById('range-tracker-container').style.display = 'block';
        statusDisplay.innerText = gameState.currentTurn === playerRole ? "🔥 ตาของคุณแล้ว ทายเลขเลย!" : "⏳ รออีกฝ่ายทาย...";
        updateTurnUI(gameState.currentTurn);
    }

    if (gameState.status === 'finished') {
        updateTurnUI(0); 
        document.getElementById('leave-btn').classList.remove('hidden');

        if (gameState.winner === 0) {
            statusDisplay.innerText = "หมดเวลา! ไม่มีใครชนะ ⌛";
            timerDisplay.classList.add('warning');
        } else {
            const isWinner = gameState.winner === playerRole;
            // เฉพาะคนที่ชนะและ Host จะรู้เฉลยเป๊ะๆ Client จะรู้ผ่าน UI
            statusDisplay.innerText = isWinner ? `🏆 คุณชนะ!` : `💀 คุณแพ้!`;
            statusDisplay.style.color = isWinner ? 'var(--color-timer)' : 'var(--color-danger)';
            document.getElementById(`panel-${gameState.winner}`).classList.add('active-turn');
            if (isWinner) fireConfetti(); 
        }
    }
}

function updateRangeTracker(min, max) {
    document.getElementById('range-min').innerText = min;
    document.getElementById('range-max').innerText = max;
    const totalRange = MAX_NUMBER - 1;
    const currentRange = max - min;
    const widthPercent = Math.max((currentRange / totalRange) * 100, 2); 
    const leftPercent = ((min - 1) / totalRange) * 100;
    const fill = document.getElementById('range-fill');
    fill.style.width = `${widthPercent}%`;
    fill.style.left = `${leftPercent}%`;
}

function showFloatingEmoji(emoji, playerNum) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.innerText = emoji;
    const panel = document.getElementById(`panel-${playerNum}`);
    const rect = panel.getBoundingClientRect();
    const randomX = rect.left + (Math.random() * (rect.width - 50));
    el.style.left = `${randomX}px`;
    el.style.top = `${rect.top + 50}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function renderLogs(containerId, logs) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        const div = document.createElement('div');
        let className = 'log-item ';
        let text = '';
        if (log.result === 'correct') { className += 'correct'; text = `🎉 ${log.guess} ถูกต้อง!`; }
        else if (log.result === 'up') { className += 'up'; text = `⬆️ ${log.guess} (มากกว่านี้)`; }
        else { className += 'down'; text = `⬇️ ${log.guess} (น้อยกว่านี้)`; }
        div.className = className;
        div.innerText = text;
        container.appendChild(div);
    }
}

function updateTurnUI(currentTurn) {
    const p1Panel = document.getElementById('panel-1');
    const p2Panel = document.getElementById('panel-2');
    p1Panel.classList.remove('active-turn'); p2Panel.classList.remove('active-turn');
    p1Input.disabled = true; p1Btn.disabled = true; p2Input.disabled = true; p2Btn.disabled = true;

    if (currentTurn === 1) {
        p1Panel.classList.add('active-turn');
        if (playerRole === 1) { p1Input.disabled = false; p1Btn.disabled = false; p1Input.focus(); }
    } else if (currentTurn === 2) {
        p2Panel.classList.add('active-turn');
        if (playerRole === 2) { p2Input.disabled = false; p2Btn.disabled = false; p2Input.focus(); }
    }
}

p1Input.addEventListener('keypress', e => { if (e.key === 'Enter') makeGuess(1); });
p2Input.addEventListener('keypress', e => { if (e.key === 'Enter') makeGuess(2); });

function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const colors = ['#f59e0b', '#34d399', '#38bdf8', '#fb7185', '#8b5cf6'];
    
    for(let i=0; i<150; i++) {
        particles.push({
            x: canvas.width / 2, y: canvas.height / 2 + 100, r: Math.random() * 6 + 4,
            dx: Math.random() * 20 - 10, dy: Math.random() * -15 - 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 10) - 10, tiltAngleInc: (Math.random() * 0.07) + 0.05, tiltAngle: 0
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let active = false;
        for(let i=0; i<particles.length; i++) {
            const p = particles[i];
            p.tiltAngle += p.tiltAngleInc; p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2; p.x += Math.sin(p.tiltAngle) * 2;
            p.dy += 0.2; p.y += p.dy; p.x += p.dx;
            ctx.beginPath(); ctx.lineWidth = p.r; ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r, p.y); ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r); ctx.stroke();
            if(p.y <= canvas.height) active = true;
        }
        if(active) requestAnimationFrame(draw);
    }
    draw();
}
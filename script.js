// ตั้งค่าตัวแปรหลัก
const MAX_NUMBER = 1000; 
const GAME_DURATION = 60; 

let targetNumber;
let timeLeft;
let timerInterval;
let isGameOver = false;

// Element References
const timerDisplay = document.getElementById('timer');
const statusDisplay = document.getElementById('status');
const p1Input = document.getElementById('p1-input');
const p2Input = document.getElementById('p2-input');
const p1Log = document.getElementById('p1-log');
const p2Log = document.getElementById('p2-log');
const p1Panel = document.getElementById('panel-1');
const p2Panel = document.getElementById('panel-2');

// ฟังก์ชันเริ่มต้น/รีเซ็ตเกม
function initGame() {
    targetNumber = Math.floor(Math.random() * MAX_NUMBER) + 1;
    timeLeft = GAME_DURATION;
    isGameOver = false;

    // เคลียร์ UI
    p1Log.innerHTML = '';
    p2Log.innerHTML = '';
    p1Input.value = '';
    p2Input.value = '';
    p1Input.disabled = false;
    p2Input.disabled = false;
    p1Panel.classList.remove('winner');
    p2Panel.classList.remove('winner');
    timerDisplay.classList.remove('warning');
    
    statusDisplay.innerText = `เกมเริ่มแล้ว! สุ่มเลขตั้งแต่ 1 ถึง ${MAX_NUMBER}`;
    updateTimerDisplay();

    // จัดการ Timer
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        // แจ้งเตือนเมื่อเวลาน้อยกว่า 10 วิ
        if (timeLeft <= 10 && timeLeft > 0) {
            timerDisplay.classList.add('warning');
        }
        
        if (timeLeft <= 0) {
            endGame('หมดเวลา! ไม่มีใครตอบถูก ⌛', `เฉลยคือ ${targetNumber}`, 0);
        }
    }, 1000);
    
    p1Input.focus();
}

// แปลงวินาทีเป็นรูปแบบ MM:SS
function updateTimerDisplay() {
    let minutes = Math.floor(timeLeft / 60);
    let seconds = timeLeft % 60;
    timerDisplay.innerText = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ฟังก์ชันเมื่อกดส่งตัวเลข
function makeGuess(playerNum) {
    if (isGameOver) return;

    const inputField = playerNum === 1 ? p1Input : p2Input;
    const logContainer = playerNum === 1 ? p1Log : p2Log;
    const guess = parseInt(inputField.value);

    if (isNaN(guess)) {
        inputField.focus();
        return;
    }

    let logMessage = "";
    let logClass = "";

    // ตรรกะการตรวจสอบ
    if (guess === targetNumber) {
        logMessage = `🎉 ${guess} ถูกต้อง!`;
        logClass = "correct";
        endGame(`🏆 Player ${playerNum} ชนะ!`, `ทายเลข ${targetNumber} ได้ถูกต้อง`, playerNum);
    } else if (guess < targetNumber) {
        logMessage = `⬆️ ${guess} (มากกว่านี้)`;
        logClass = "up";
    } else {
        logMessage = `⬇️ ${guess} (น้อยกว่านี้)`;
        logClass = "down";
    }

    // สร้าง Element กล่องประวัติ
    const logItem = document.createElement('div');
    logItem.className = `log-item ${logClass}`;
    logItem.innerText = logMessage;
    
    // แทรกข้อความใหม่ไว้ด้านบนสุด
    logContainer.prepend(logItem);

    // เคลียร์ช่อง input และกลับไป focus ใหม่
    inputField.value = '';
    inputField.focus();
}

// จบเกมและแสดงผล
function endGame(mainStatus, subStatus, winnerNum) {
    isGameOver = true;
    clearInterval(timerInterval);
    timerDisplay.classList.remove('warning');
    
    statusDisplay.innerText = `${mainStatus} - ${subStatus}`;
    p1Input.disabled = true;
    p2Input.disabled = true;

    // Highlight ผู้ชนะ
    if (winnerNum === 1) p1Panel.classList.add('winner');
    if (winnerNum === 2) p2Panel.classList.add('winner');
}

// Event Listeners สำหรับการกด Enter
p1Input.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') makeGuess(1);
});
p2Input.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') makeGuess(2);
});

// รันเกมทันทีที่เปิดหน้าเว็บ
window.onload = initGame;
// ===== Canvas =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const rows = 15;
const cols = 20;
const cellSize = 47.5;
canvas.width = 950;
canvas.height = 680;

// ===== Játék állapot =====
let maze = [];
let px = 0, py = 0, speed = 5, facing = "right";
let hp = 100, score = 0, gameOver = false;
let attackTimer = 0, hitCooldown = 0;
let w = false, a = false, s = false, d = false;
let female = false;
let choosingCharacter = true;

// ===== Sebzés növekedési mechanika =====
let enemyDamage = 2; // Alap sebzés

// ===== Szívek (Gyógyítás) állapot =====
let hearts = []; 
let killsSinceLastHeart = 0;
const KILLS_REQUIRED_FOR_HEART = 7;
const HEART_HEAL_AMOUNT = 15; 
const HEART_SIZE = 25;

// ===== NPC =====
class NPC {
    constructor(x, y) {
        this.x = x; this.y = y; this.size = 40;
        this.dx = 0; this.dy = 0;
        this.setRandomDirection();
    }
    setRandomDirection() {
        const dir = Math.floor(Math.random() * 4);
        this.dx = 0; this.dy = 0;
        if (dir === 0) this.dy = -2;
        if (dir === 1) this.dy = 2;
        if (dir === 2) this.dx = -2;
        if (dir === 3) this.dx = 2;
    }
    move() {
        if (!isColliding(this.x + this.dx, this.y + this.dy)) {
            this.x += this.dx; this.y += this.dy;
        } else this.setRandomDirection();
    }
}
let npcs = [];

// ===== Labirintus =====
function generateMaze() {
    maze = Array.from({ length: rows }, () => Array(cols).fill(true));
    function dfs(r, c) {
        maze[r][c] = false;
        const dr = [-2, 2, 0, 0], dc = [0, 0, -2, 2];
        const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        dirs.forEach(d => {
            const nr = r + dr[d], nc = c + dc[d];
            if (nr > 0 && nr < rows && nc > 0 && nc < cols && maze[nr][nc]) {
                maze[r + dr[d] / 2][c + dc[d] / 2] = false;
                dfs(nr, nc);
            }
        });
    }
    dfs(1, 1);
}

// ===== Spawn =====
function placePlayer() {
    px = cellSize; py = cellSize;
    npcs = [];
    for (let i = 0; i < 8; i++) { // NPC-k száma
        let nx, ny, tries = 0;
        do {
            nx = Math.floor(Math.random() * cols) * cellSize;
            ny = Math.floor(Math.random() * rows) * cellSize;
            tries++; if (tries > 100) break;
        } while (
            maze[Math.floor(ny / cellSize)][Math.floor(nx / cellSize)] ||
            (Math.abs(nx - px) < cellSize * 2 && Math.abs(ny - py) < cellSize * 2)
        );
        npcs.push(new NPC(nx, ny));
    }
}

// ===== Kollízió =====
function isColliding(x, y) {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellX2 = Math.floor((x + 40) / cellSize);
    const cellY2 = Math.floor((y + 40) / cellSize);
    if (cellX < 0 || cellY < 0 || cellX2 >= cols || cellY2 >= rows) return true;
    for (let i = cellY; i <= cellY2; i++)
        for (let j = cellX; j <= cellX2; j++)
            if (maze[i][j]) return true;
    return false;
}

// ===== Mozgás =====
function movePlayer() {
    let dx = 0, dy = 0;
    if (w) dy -= 1;
    if (s) dy += 1;
    if (a) dx -= 1;
    if (d) dx += 1;

    if (dx === 0 && dy === 0) return;

    const length = Math.sqrt(dx * dx + dy * dy);
    dx = (dx / length) * speed;
    dy = (dy / length) * speed;

    if (Math.abs(dx) > Math.abs(dy)) {
        facing = dx > 0 ? "right" : "left";
    } else {
        facing = dy > 0 ? "down" : "up";
    }

    const nx = px + dx;
    const ny = py + dy;

    if (!isColliding(nx, ny)) {
        px = nx; py = ny;
    }
}

function moveNPCs() { npcs.forEach(n => n.move()); }

// ===== Támadás =====
function getAttackRect() {
    if (attackTimer <= 0) return null;
    if (facing === "right") return { x: px + 40, y: py + 12, w: 40, h: 16 };
    if (facing === "left") return { x: px - 40, y: py + 12, w: 40, h: 16 };
    if (facing === "up") return { x: px + 12, y: py - 40, w: 16, h: 40 };
    return { x: px + 12, y: py + 40, w: 16, h: 40 };
}

function attackNPCs() {
    const atk = getAttackRect();
    if (!atk) return;
    npcs.forEach(npc => {
        if (atk.x < npc.x + 40 &&
            atk.x + atk.w > npc.x &&
            atk.y < npc.y + 40 &&
            atk.y + atk.h > npc.y) {

            let nx, ny;
            do {
                nx = Math.floor(Math.random() * cols) * cellSize;
                ny = Math.floor(Math.random() * rows) * cellSize;
            } while (
                maze[Math.floor(ny / cellSize)][Math.floor(nx / cellSize)] ||
                (Math.abs(nx - px) < cellSize * 2 && Math.abs(ny - py) < cellSize * 2)
            );

            npc.x = nx; npc.y = ny;
            score++;

            enemyDamage = Math.min(15, 2 + Math.floor(score / 75));

            killsSinceLastHeart++;
            if (killsSinceLastHeart >= KILLS_REQUIRED_FOR_HEART) {
                if (hearts.length < 3) {
                    let hx, hy;
                    do {
                        hx = Math.floor(Math.random() * cols) * cellSize + (cellSize - HEART_SIZE) / 2;
                        hy = Math.floor(Math.random() * rows) * cellSize + (cellSize - HEART_SIZE) / 2;
                    } while (maze[Math.floor(hy / cellSize)][Math.floor(hx / cellSize)]);
                    
                    hearts.push({ x: hx, y: hy });
                }
                killsSinceLastHeart = 0;
            }
        }
    });
}

// ===== Sebzés =====
function checkHits() {
    if (hitCooldown > 0) hitCooldown--;
    for (let npc of npcs) {
        if (px + 40 > npc.x && px < npc.x + 40 && py + 40 > npc.y && py < npc.y + 40) {
            if (hitCooldown === 0) { 
                hp -= enemyDamage;
                hitCooldown = 15; 
            }
        }
    }
    if (hp <= 0) gameOver = true; 
    if (attackTimer > 0) attackTimer--;
}

// ===== Szívek felszedésének ellenőrzése =====
function checkHeartPickup() {
    for (let i = hearts.length - 1; i >= 0; i--) {
        let h = hearts[i];
        if (px + 40 > h.x && px < h.x + HEART_SIZE &&
            py + 40 > h.y && py < h.y + HEART_SIZE) {
            
            let currentHeal = 15 + Math.floor(score / 100) * 5;
            
            currentHeal = Math.min(40, currentHeal);

            hp = Math.min(100, hp + currentHeal);
            
            hearts.splice(i, 1);
        }
    }
}

// ===== Karakter rajzolás =====
function drawCharacter(x, y, isPlayer, femaleOption) {
    ctx.fillStyle = "darkgray";
    ctx.fillRect(x + 5, y + 30, 10, 10);
    ctx.fillRect(x + 25, y + 30, 10, 10);

    if (isPlayer) {
        ctx.fillStyle = femaleOption ? "#cf48bd" : "#245cd5";
        ctx.fillRect(x + 5, y + 10, 30, 25);
        ctx.fillStyle = "#e6c395";
        ctx.beginPath();
        ctx.arc(x + 20, y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = "green"; // Átírva pirosról ZÖLDRE
        ctx.fillRect(x + 5, y + 10, 30, 25);
        ctx.fillStyle = "#e6c395";
        ctx.beginPath();
        ctx.arc(x + 20, y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ===== Rajzolás =====
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (choosingCharacter) {
        ctx.fillStyle = "#eee";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const y = canvas.height / 2;
        drawCharacter(centerX - 80, y, true, false);
        drawCharacter(centerX + 40, y, true, true);
        return;
    }

    // Labirintus falak
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (maze[r][c]) {
                ctx.fillStyle = "black";
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }
    }

    // Összes aktív szív kirajzolása a listából
    hearts.forEach(h => {
        ctx.fillStyle = "red";
        ctx.beginPath();
        const topCurveHeight = HEART_SIZE * 0.3;
        ctx.moveTo(h.x + HEART_SIZE / 2, h.y + topCurveHeight);
        ctx.bezierCurveTo(h.x + HEART_SIZE / 2, h.y, h.x, h.y, h.x, h.y + topCurveHeight);
        ctx.bezierCurveTo(h.x, h.y + (HEART_SIZE + topCurveHeight) / 2, h.x + HEART_SIZE / 2, h.y + HEART_SIZE, h.x + HEART_SIZE / 2, h.y + HEART_SIZE);
        ctx.bezierCurveTo(h.x + HEART_SIZE / 2, h.y + HEART_SIZE, h.x + HEART_SIZE, h.y + (HEART_SIZE + topCurveHeight) / 2, h.x + HEART_SIZE, h.y + topCurveHeight);
        ctx.bezierCurveTo(h.x + HEART_SIZE, h.y, h.x + HEART_SIZE / 2, h.y, h.x + HEART_SIZE / 2, h.y + topCurveHeight);
        ctx.closePath();
        ctx.fill();
    });

    // Karakterek
    drawCharacter(px, py, true, female);
    npcs.forEach(n => drawCharacter(n.x, n.y, false, false));

    // Támadás
    const atk = getAttackRect();
    if (atk) {
        ctx.fillStyle = "#b5783f";
        ctx.fillRect(atk.x, atk.y, atk.w, atk.h);
    }

    // HP sáv
    ctx.fillStyle = "gray";
    ctx.fillRect(10, 10, 200, 20);
    ctx.fillStyle = "limegreen";
    ctx.fillRect(10, 10, 2 * hp, 20);
    ctx.strokeRect(10, 10, 200, 20);

    // HP és pontszám
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "black";
    ctx.fillText("HP: " + hp, 10 + 200 / 2, 10 + 20 / 2);
    ctx.fillStyle = "goldenrod";
    ctx.fillText("Pont: " + score, 220 + 50, 10 + 20 / 2);

    // Aktuális ellenséges sebzés kijelzése debug / infó jelleggel (opcionális, de jó látni a nehezedést)
    ctx.font = "14px Arial";
    ctx.fillStyle = "darkred";
    ctx.fillText("Dmg: " + enemyDamage, 340, 10 + 20 / 2);

    // Game Over
    if (gameOver) {
        ctx.fillStyle = "red";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Game Over! Press Enter to restart", canvas.width / 2, canvas.height / 2);
    }
}

// ===== Update =====
function update() {
    if (!choosingCharacter) {
        if (!gameOver) {
            movePlayer();
            moveNPCs();
            checkHits();
            checkHeartPickup();
            attackNPCs();
        }
    }
    draw();
    requestAnimationFrame(update);
}

// ===== Teljes Játék Újraindítás =====
function resetWholeGame() {
    hp = 100;
    score = 0;
    enemyDamage = 2; // Újraindításkor a sebzés is visszaáll alaphelyzetbe
    gameOver = false;
    w = false; a = false; s = false; d = false;
    attackTimer = 0;
    hitCooldown = 0;
    hearts = []; 
    killsSinceLastHeart = 0;
    choosingCharacter = true; 
}

// ===== Input =====
document.addEventListener("keydown", e => {
    if (e.key === "r" || e.key === "R") {
        resetWholeGame();
        return;
    }

    if ((e.key === "q" || e.key === "Q") && !choosingCharacter && !gameOver) {
        px = cellSize; 
        py = cellSize;
        facing = "right";
        return;
    }

    if (choosingCharacter) return;

    if (gameOver && e.key === "Enter") {
        hp = 100;
        score = 0;
        enemyDamage = 2; // Újraindításkor a sebzés itt is visszaáll
        px = cellSize; py = cellSize;
        facing = "right";
        gameOver = false;
        hearts = []; 
        killsSinceLastHeart = 0;
        generateMaze();
        placePlayer();
    }

    if (!gameOver) {
        if (e.key === "w") w = true;
        if (e.key === "s") s = true;
        if (e.key === "a") a = true;
        if (e.key === "d") d = true;
        if (e.key === " ") attackTimer = 10;
    }
});

document.addEventListener("keyup", e => {
    if (e.key === "w") w = false;
    if (e.key === "s") s = false;
    if (e.key === "a") a = false;
    if (e.key === "d") d = false;
});

canvas.addEventListener("mousedown", e => {
    if (choosingCharacter) {
        const centerX = canvas.width / 2;
        if (e.offsetX > centerX - 80 && e.offsetX < centerX - 40) {
            female = false; choosingCharacter = false; generateMaze(); placePlayer();
        }
        if (e.offsetX > centerX + 40 && e.offsetX < centerX + 80) {
            female = true; choosingCharacter = false; generateMaze(); placePlayer();
        }
    } else {
        attackTimer = 10;
    }
});

update();
// Frozen published v1 rules: only used to finish existing runs. Do not regenerate.
// Build inserts the actual browser's rule constants and step functions here.
// There is no eval, DOM, random client seed or separate scoring implementation.
const RULES_VERSION = 1, MAX_REPLAY_TICKS = 20000;
const QUEST_POOL = Object.freeze([
            { id: 'q_gold_single', icon: '⭐', title: 'Altın Avcısı', desc: 'Tek oyunda 3 Altın Yıldız topla.', target: 3, xp: 150 },
            { id: 'q_confuse_eat', icon: '🌀', title: 'Girdap Dansı', desc: 'Ters Yön etkisindeyken 2 yem ye.', target: 2, xp: 120 },
            { id: 'q_score_target', icon: '🎯', title: 'Günün Rekoru', desc: 'Tek oyunda 150 puana ulaş.', target: 150, xp: 200 },
            { id: 'q_powerups', icon: '⚡', title: 'Güç Toplayıcı', desc: 'Toplam 4 özel güç yemi topla.', target: 4, xp: 100 },
            { id: 'q_shield_blocks', icon: '🛡️', title: 'Tuzak Savar', desc: 'Kalkan aktifken 2 tuzak engelle.', target: 2, xp: 130 },
            { id: 'q_wide_score', icon: '🚀', title: 'Geniş Alan Koşusu', desc: '3X Geniş Haritada 100 puan yap.', target: 100, xp: 160 },
            { id: 'q_nowall_score', icon: '🌐', title: 'Portal Gezgini', desc: 'Duvarsız Modda 80 puan yap.', target: 80, xp: 140 },
            { id: 'q_apples', icon: '🍎', title: 'Elma Ziyafeti', desc: 'Toplam 15 standart Kırmızı Elma ye.', target: 15, xp: 90 }
]);
const ACHIEVEMENTS = Object.freeze([
            { id: 'first_eat', icon: '🍎', title: 'İlk Lokma', desc: 'Oyundaki ilk elmanı ye.', xp: 50 },
            { id: 'score_100', icon: '💯', title: 'Yüzler Kulübü', desc: 'Tek oyunda 100 puana ulaş.', xp: 150 },
            { id: 'score_300', icon: '👑', title: 'Skor Şampiyonu', desc: 'Tek oyunda 300 puana ulaş.', xp: 300 },
            { id: 'explorer', icon: '🗺️', title: 'Tüm Haritaları Keşfet', desc: '6 farklı harita modunun hepsini oyna.', xp: 200 },
            { id: 'magnet_master', icon: '🧲', title: 'Mıknatıs Ustası', desc: 'Toplamda 3 kez mıknatıs gücünü kullan.', xp: 120 },
            { id: 'shield_hero', icon: '🛡️', title: 'Kalkan Muhafızı', desc: 'Kalkan aktifken 3 tuzak engelle.', xp: 140 },
            { id: 'scissor_cut', icon: '✂️', title: 'Kuyruk Terzisi', desc: 'Kuyruk makası kullanarak yılanı kısalt.', xp: 100 },
            { id: 'bomb_expert', icon: '💣', title: 'Bomba İmha Uzmanı', desc: 'Bomba yiyerek tüm zararlıları temizle.', xp: 120 },
            { id: 'hardcore_survivor', icon: '🔥', title: 'Cesur Yürek', desc: 'Zor modda 100+ puan yap.', xp: 250 },
            { id: 'fashion_icon', icon: '🕶️', title: 'Kozmetik Tutkunu', desc: 'Herhangi bir kostüm veya skin seçip oyna.', xp: 80 }
]);
function seededRandom(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function createReplayEngine(selectedMap,selectedDifficulty,seed){
const DIFFICULTIES = Object.freeze({
            easy: 150,
            medium: 105,
            hard: 70
});
const MAPS = Object.freeze({
            classic: () => [],
            nowall: () => [],
            wide: () => [],
            box: () => {
                let walls = [];
                for (let i = 5; i < 15; i++) {
                    walls.push({ x: i, y: 5 }, { x: i, y: 14 });
                }
                return walls.filter(w => (w.x < 8 || w.x > 11));
            },
            maze: () => {
                let walls = [];
                for (let i = 3; i < 17; i++) {
                    if (i !== 9 && i !== 10) {
                        walls.push({ x: 5, y: i });
                        walls.push({ x: 14, y: i });
                    }
                }
                return walls;
            },
            cross: () => {
                let walls = [];
                for (let i = 2; i < 18; i++) {
                    if (i < 8 || i > 11) {
                        walls.push({ x: 10, y: i });
                        walls.push({ x: i, y: 10 });
                    }
                }
                return walls;
            }
});
const FOOD_TYPES = Object.freeze({
            APPLE:     { type: 'apple', emoji: '🍎', color: '#ef4444', score: 10, grow: 1, duration: null, isHarmful: false },
            GOLD:      { type: 'gold', emoji: '⭐', color: '#eab308', score: 30, grow: 2, duration: null, isHarmful: false },
            ICE:       { type: 'ice', emoji: '❄️', color: '#38bdf8', score: 15, grow: 1, duration: null, isHarmful: false },
            PURPLE:    { type: 'purple', emoji: '💎', color: '#c084fc', score: 50, grow: 1, duration: 90, isHarmful: false },
            MAGNET:    { type: 'magnet', emoji: '🧲', color: '#f43f5e', score: 20, grow: 0, duration: 100, isHarmful: false },
            SCISSORS:  { type: 'scissors', emoji: '✂️', color: '#cbd5e1', score: 15, grow: 0, duration: 100, isHarmful: false },
            SHIELD:    { type: 'shield', emoji: '🛡️', color: '#22c55e', score: 15, grow: 1, duration: 100, isHarmful: false },
            BOMB:      { type: 'bomb', emoji: '💣', color: '#f97316', score: 20, grow: 0, duration: 100, isHarmful: false },
            POISON:    { type: 'poison', emoji: '🍄', color: '#a855f7', score: -25, grow: -1, duration: 80, isHarmful: true },
            CHILI:     { type: 'chili', emoji: '🌶️', color: '#ea580c', score: 5, grow: 1, duration: 80, isHarmful: true },
            CONFUSE:   { type: 'confuse', emoji: '🌀', color: '#ec4899', score: 5, grow: 1, duration: 80, isHarmful: true },
            TRAP_GROW: { type: 'trapgrow', emoji: '🪨', color: '#64748b', score: 0, grow: 3, duration: 80, isHarmful: true },
            FOG:       { type: 'fog', emoji: '🌫️', color: '#475569', score: -10, grow: 0, duration: 80, isHarmful: true },
            THIEF:     { type: 'thief', emoji: '💸', color: '#e11d48', score: -50, grow: 0, duration: 80, isHarmful: true }
});
 let score=0,isGameOver=false,currentInterval=105,highScore=0,gridSize=1;
 const cellCountX=selectedMap==='wide'?35:20,cellCountY=cellCountX;
 const currentRunSettings={training:false},gameRandom=seededRandom(seed),sessionStats={goldEaten:0};
 const stats={magnetsUsed:0,shieldBlocks:0},achievements=new Set(),quests={};
 let effects={slow:0,speed:0,reverse:0,shield:0,fog:0},snake=[{x:Math.floor(cellCountX/2),y:Math.floor(cellCountY/2)-1},{x:Math.floor(cellCountX/2)-1,y:Math.floor(cellCountY/2)-1},{x:Math.floor(cellCountX/2)-2,y:Math.floor(cellCountY/2)-1}];
 let direction={x:1,y:0},prevSnake=[],snakeGrewLastTick=false,headChompScale=1,foods=[],inputQueue=[],obstacles=MAPS[selectedMap]();
 const noop=()=>{},createExplosion=noop,playSound=noop,addFloatingText=noop,saveStats=noop,updateStatusBadges=noop;
 const scoreElement={},highScoreElement={},menuTitle={},lastRunSummary={},storage={setItem:noop},digestionBulges={push:noop};
 const getHighScoreKey=()=>'',recordReplayTick=()=>true,endGame=()=>{isGameOver=true;};
 const unlockAchievement=id=>achievements.add(id);
 const triggerQuestProgress=(id,amount,absolute=false)=>{quests[id]=absolute?Math.max(quests[id]||0,amount):(quests[id]||0)+amount;};
function calculateInterval() {
            let base = DIFFICULTIES[selectedDifficulty];
            if (currentRunSettings?.training) base = Math.floor(base * 1.35);
            if (effects.slow > 0) base = Math.floor(base * 1.5);
            if (effects.speed > 0) base = Math.floor(base * 0.6);
            currentInterval = base;
        }
function getRandomFoodType() {
            const rand = gameRandom();
            if (rand < 0.25) return FOOD_TYPES.APPLE;
            if (rand < 0.38) return FOOD_TYPES.GOLD;
            if (rand < 0.47) return FOOD_TYPES.ICE;
            if (rand < 0.55) return FOOD_TYPES.PURPLE;
            
            if (rand < 0.60) return FOOD_TYPES.MAGNET;
            if (rand < 0.65) return FOOD_TYPES.SCISSORS;
            if (rand < 0.70) return FOOD_TYPES.SHIELD;
            if (rand < 0.75) return FOOD_TYPES.BOMB;
            
            if (rand < 0.80) return FOOD_TYPES.POISON;
            if (rand < 0.84) return FOOD_TYPES.CHILI;
            if (rand < 0.88) return FOOD_TYPES.CONFUSE;
            if (rand < 0.92) return FOOD_TYPES.TRAP_GROW;
            if (rand < 0.96) return FOOD_TYPES.FOG;
            return FOOD_TYPES.THIEF;
        }

        function getFreeCell() {
            const occupied = new Set();
            for (let i = 0; i < snake.length; i++) {
                occupied.add(snake[i].x + ',' + snake[i].y);
            }
            for (let i = 0; i < obstacles.length; i++) {
                occupied.add(obstacles[i].x + ',' + obstacles[i].y);
            }
            for (let i = 0; i < foods.length; i++) {
                occupied.add(foods[i].x + ',' + foods[i].y);
            }

            const free = [];
            for (let y=0; y<cellCountY; y++) for (let x=0; x<cellCountX; x++) {
                if (!occupied.has(x+','+y)) free.push({x,y});
            }
            return free.length ? free[Math.floor(gameRandom()*free.length)] : null;
        }

        function spawnFood(typeTemplate) {
            const pos = getFreeCell();
            if (!pos) return false;
            foods.push({...pos, ...typeTemplate, timer:typeTemplate.duration});
            return true;
        }
function gameTick() {
            const elapsedUnits = currentInterval / 100;
            prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
            snakeGrewLastTick = false;

            if (inputQueue.length > 0) {
                direction = inputQueue.shift();
            }
            if(!recordReplayTick())return;

            let head = {
                x: snake[0].x + direction.x,
                y: snake[0].y + direction.y
            };

            const isNoWall = selectedMap === 'nowall';

            if (isNoWall) {
                head.x = (head.x + cellCountX) % cellCountX;
                head.y = (head.y + cellCountY) % cellCountY;
            } else {
                if (head.x < 0 || head.x >= cellCountX || head.y < 0 || head.y >= cellCountY) {
                    endGame(head.x < 0 ? 0 : (head.x >= cellCountX ? cellCountX - 1 : head.x), head.y < 0 ? 0 : (head.y >= cellCountY ? cellCountY - 1 : head.y));
                    return;
                }
            }

            for (let i = 0; i < obstacles.length; i++) {
                if (obstacles[i].x === head.x && obstacles[i].y === head.y) {
                    endGame(head.x, head.y);
                    return;
                }
            }

            // The tail vacates its cell during this step.
            for (let i = 0; i < snake.length - 1; i++) {
                if (snake[i].x === head.x && snake[i].y === head.y) {
                    endGame(head.x, head.y);
                    return;
                }
            }

            snake.unshift(head);

            let ateFoodIndex = -1;
            for (let i = 0; i < foods.length; i++) {
                if (foods[i].x === head.x && foods[i].y === head.y) {
                    ateFoodIndex = i;
                    break;
                }
            }

            if (ateFoodIndex !== -1) {
                const eaten = foods.splice(ateFoodIndex, 1)[0];
                const blockedByShield = effects.shield > 0 && eaten.isHarmful;
                createExplosion(eaten.x, eaten.y, eaten.color, 18);

                headChompScale = 1.35;
                digestionBulges.push({ distPx: 0, color: eaten.color });

                if (effects.reverse > 0) {
                    triggerQuestProgress('q_confuse_eat', 1);
                }

                if (effects.shield > 0 && eaten.isHarmful) {
                    score += 15;
                    playSound('powerup');
                    addFloatingText(eaten.x, eaten.y, '+15 (ENGEL)', '#22c55e');
                    createExplosion(eaten.x, eaten.y, '#22c55e', 14);
                    
                    if (!currentRunSettings?.training) {
                        stats.shieldBlocks++;
                        saveStats();
                        if (stats.shieldBlocks >= 3) unlockAchievement('shield_hero');
                    }
                    triggerQuestProgress('q_shield_blocks', 1);
                } else {
                    score = Math.max(0, score + eaten.score);

                    if (eaten.score > 0) {
                        addFloatingText(eaten.x, eaten.y, `+${eaten.score}`, eaten.color);
                    } else if (eaten.score < 0) {
                        addFloatingText(eaten.x, eaten.y, `${eaten.score}`, eaten.color);
                    }

                    if (eaten.type === 'apple') {
                        playSound('eat_apple');
                        unlockAchievement('first_eat');
                        triggerQuestProgress('q_apples', 1);
                    }
                    else if (eaten.type === 'gold' || eaten.type === 'purple') {
                        playSound('eat_gold');
                        if (eaten.type === 'gold') {
                            sessionStats.goldEaten++;
                            triggerQuestProgress('q_gold_single', sessionStats.goldEaten, true);
                        }
                    }
                    else if (eaten.type === 'shield' || eaten.type === 'ice') playSound('powerup');
                    else if (eaten.type === 'magnet') {
                        playSound('powerup');
                        addFloatingText(eaten.x, eaten.y, '🧲 MIKNATIS!', '#f43f5e');
                        if (!currentRunSettings?.training) {
                            stats.magnetsUsed++;
                            saveStats();
                            if (stats.magnetsUsed >= 3) unlockAchievement('magnet_master');
                        }
                    }
                    else if (eaten.type === 'scissors') {
                        playSound('scissors');
                        addFloatingText(eaten.x, eaten.y, '✂️ KESİLDİ!', '#cbd5e1');
                        unlockAchievement('scissor_cut');
                    }
                    else if (eaten.type === 'bomb') {
                        playSound('bomb');
                        addFloatingText(eaten.x, eaten.y, '💣 BOMBA!', '#f97316');
                        unlockAchievement('bomb_expert');
                    }
                    else if (eaten.type === 'trapgrow') {
                        playSound('debuff');
                        addFloatingText(eaten.x, eaten.y, '🪨 +3 UZAMA TUZAĞI!', '#64748b');
                    }
                    else if (eaten.type === 'fog') {
                        playSound('debuff');
                        addFloatingText(eaten.x, eaten.y, '🌫️ KÖRLÜK SİSİ!', '#475569');
                    }
                    else if (eaten.type === 'thief') {
                        playSound('debuff');
                        addFloatingText(eaten.x, eaten.y, '💸 -50 PUAN!', '#e11d48');
                    }
                    else if (eaten.isHarmful) playSound('debuff');

                    if (['magnet', 'scissors', 'shield', 'bomb'].includes(eaten.type)) {
                        triggerQuestProgress('q_powerups', 1);
                    }

                    triggerQuestProgress('q_score_target', score, true);
                    if (selectedMap === 'wide') triggerQuestProgress('q_wide_score', score, true);
                    if (selectedMap === 'nowall') triggerQuestProgress('q_nowall_score', score, true);

                    if (score >= 100) {
                        unlockAchievement('score_100');
                        if (selectedDifficulty === 'hard') {
                            unlockAchievement('hardcore_survivor');
                        }
                    }
                    if (score >= 300) {
                        unlockAchievement('score_300');
                    }

                    if (eaten.type === 'ice') effects.slow = 40;
                    if (eaten.type === 'chili') effects.speed = 40;
                    if (eaten.type === 'confuse') effects.reverse = 40;
                    if (eaten.type === 'shield') effects.shield = 50;
                    if (eaten.type === 'fog') effects.fog = 50;

                    if (eaten.type === 'magnet') {
                        for (let i = foods.length - 1; i >= 0; i--) {
                            if (!foods[i].isHarmful) {
                                const goodFood = foods[i];
                                createExplosion(goodFood.x, goodFood.y, goodFood.color, 12);
                                score += goodFood.score;
                                addFloatingText(goodFood.x, goodFood.y, `+${goodFood.score}`, goodFood.color);
                                for (let g = 0; g < (goodFood.grow || 0); g++) {
                                    snake.push({ ...snake[snake.length - 1] });
                                }
                                foods.splice(i, 1);
                            }
                        }
                    }

                    if (eaten.type === 'scissors') {
                        if (snake.length > 4) {
                            const cutAmount = Math.floor(snake.length / 2);
                            const tailPart = snake[snake.length - 1];
                            createExplosion(tailPart.x, tailPart.y, '#cbd5e1', 20);
                            snake.splice(snake.length - cutAmount, cutAmount);
                            score += cutAmount * 10;
                        }
                    }

                    if (eaten.type === 'bomb') {
                        let clearedCount = 0;
                        for (let i = foods.length - 1; i >= 0; i--) {
                            if (foods[i].isHarmful) {
                                createExplosion(foods[i].x, foods[i].y, '#f97316', 15);
                                foods.splice(i, 1);
                                clearedCount++;
                            }
                        }
                        score += clearedCount * 15;
                    }

                    if (eaten.grow > 1) {
                        for (let i = 1; i < eaten.grow; i++) {
                            snake.push({ ...snake[snake.length - 1] });
                        }
                        snakeGrewLastTick = true;
                    } else if (eaten.grow === 1) {
                        snakeGrewLastTick = true;
                    } else if (eaten.grow < 0 && snake.length > 2) {
                        const lostSeg = snake.pop();
                        createExplosion(lostSeg.x, lostSeg.y, '#a855f7', 12);
                    }
                }

                scoreElement.textContent = score;

                if (!currentRunSettings?.training && score > highScore) {
                    highScore = score;
                    highScoreElement.textContent = highScore;
                    storage.setItem(getHighScoreKey(), highScore);
                }

                if (blockedByShield || eaten.grow <= 0) snake.pop();
                while (snake.length < 2) snake.push({...snake[snake.length-1]});

                const minFoods = selectedMap === 'wide' ? 4 : 2;
                while (foods.length < minFoods) {
                    if (!spawnFood(getRandomFoodType())) break;
                }
            } else {
                snake.pop();
            }

            for (let i = foods.length - 1; i >= 0; i--) {
                if (foods[i].timer !== null) {
                    foods[i].timer -= elapsedUnits;
                    if (foods[i].timer <= 0) {
                        foods.splice(i, 1);
                        spawnFood(getRandomFoodType());
                    }
                }
            }

            if (effects.shield > 0) effects.shield = Math.max(0, effects.shield - elapsedUnits);
            if (effects.slow > 0) effects.slow = Math.max(0, effects.slow - elapsedUnits);
            if (effects.speed > 0) effects.speed = Math.max(0, effects.speed - elapsedUnits);
            if (effects.reverse > 0) effects.reverse = Math.max(0, effects.reverse - elapsedUnits);
            if (effects.fog > 0) effects.fog = Math.max(0, effects.fog - elapsedUnits);
            if (snake.length + obstacles.length >= cellCountX * cellCountY) {
                endGame();
                menuTitle.textContent = 'TEBRİKLER!';
                lastRunSummary.textContent = 'Tüm alanı doldurdun! '+lastRunSummary.textContent;
            }
            updateStatusBadges();
            calculateInterval();
        }
 spawnFood(FOOD_TYPES.APPLE);spawnFood(getRandomFoodType());if(selectedMap==='wide'){spawnFood(getRandomFoodType());spawnFood(getRandomFoodType());}calculateInterval();
 let elapsed=0,ticks=0;
 return {step(code){if(isGameOver)throw Error('Oyun bittikten sonra hamle gönderilemez.');if(code!==undefined){const vectors=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}],next=vectors[code];if(!next||next.x===-direction.x&&next.y===-direction.y)throw Error('Geçersiz yön değişikliği.');inputQueue.push(next);}elapsed+=currentInterval;ticks++;gameTick();},state(){return{score,dead:isGameOver,elapsed,ticks,snake,foods,direction,effects,interval:currentInterval,rewards:{achievements:[...achievements],quests,magnets:stats.magnetsUsed,shields:stats.shieldBlocks}};}};
}
function verifyReplay(run,input,now){
 if(run.rules_version!==RULES_VERSION||!Number.isInteger(run.seed)||now-run.started_at>10800000)throw Error('Bu oyun sürümü veya kaydı sona erdi. Yeni bir oyun başlat.');
 if(!Number.isInteger(input.ticks)||input.ticks<0||input.ticks>MAX_REPLAY_TICKS||!Array.isArray(input.moves)||input.moves.length>input.ticks)throw Error('Hamle kaydı geçersiz.');
 let previous=0;for(const move of input.moves){if(!Array.isArray(move)||move.length!==2||!Number.isInteger(move[0])||move[0]<=previous||move[0]>input.ticks||!Number.isInteger(move[1])||move[1]<0||move[1]>3)throw Error('Hamle sırası geçersiz.');previous=move[0];}
 const engine=createReplayEngine(run.map,run.difficulty,run.seed);let index=0;
 for(let tick=1;tick<=input.ticks;tick++){const move=input.moves[index];engine.step(move?.[0]===tick?input.moves[index++][1]:undefined);}
 const state=engine.state();if(state.elapsed>now-run.started_at+250)throw Error('Hamleler oyun süresinden daha hızlı gönderildi.');
 if(input.outcome==='completed'&&!state.dead&&input.ticks!==MAX_REPLAY_TICKS)throw Error('Oyun henüz tamamlanmadı.');
 if(input.outcome==='restarted'&&state.dead)throw Error('Oyun sonucu hamlelerle uyuşmuyor.');
 if(input.score!==undefined&&input.score!==state.score)throw Error('Skor hamlelerle uyuşmuyor.');
 return state;
}

export {createReplayEngine,verifyReplay,RULES_VERSION,MAX_REPLAY_TICKS};

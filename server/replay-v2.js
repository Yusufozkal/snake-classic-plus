// Build inserts the actual browser's rule constants and step functions here.
// There is no eval, DOM, random client seed or separate scoring implementation.
const RULES_VERSION = 2, MAX_REPLAY_TICKS = 20000;
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
            APPLE:     { type:'apple', name:'Elma', group:0, emoji:'🍎', color:'#ef4444', score:10, grow:1, duration:null, isHarmful:false },
            GOLD:      { type:'gold', name:'Altın Yıldız', group:0, emoji:'⭐', color:'#eab308', score:30, grow:2, duration:null, isHarmful:false },
            ICE:       { type:'ice', name:'Buz Meyvesi', group:0, emoji:'❄️', color:'#38bdf8', score:15, grow:1, duration:null, isHarmful:false, effect:'slow', effectDuration:40 },
            PURPLE:    { type:'purple', name:'Mor Elmas', group:0, emoji:'💎', color:'#c084fc', score:50, grow:1, duration:90, isHarmful:false },
            MAGNET:    { type:'magnet', name:'Mıknatıs', group:1, emoji:'🧲', color:'#f43f5e', score:20, grow:0, duration:100, isHarmful:false },
            SCISSORS:  { type:'scissors', name:'Kuyruk Makası', group:1, emoji:'✂️', color:'#cbd5e1', score:15, grow:0, duration:100, isHarmful:false },
            SHIELD:    { type:'shield', name:'Kalkan', group:1, emoji:'🛡️', color:'#22c55e', score:15, grow:1, duration:100, isHarmful:false, effect:'shield', effectDuration:50 },
            BOMB:      { type:'bomb', name:'Bomba', group:1, emoji:'💣', color:'#f97316', score:20, grow:0, duration:100, isHarmful:false },
            POISON:    { type:'poison', name:'Zehirli Mantar', group:2, emoji:'🍄', color:'#a855f7', score:-25, grow:-1, duration:80, isHarmful:true },
            CHILI:     { type:'chili', name:'Ateş Biberi', group:2, emoji:'🌶️', color:'#ea580c', score:5, grow:1, duration:80, isHarmful:true, effect:'speed', effectDuration:40 },
            CONFUSE:   { type:'confuse', name:'Girdap', group:2, emoji:'🌀', color:'#ec4899', score:5, grow:1, duration:80, isHarmful:true, effect:'reverse', effectDuration:40 },
            TRAP_GROW: { type:'trapgrow', name:'Ağır Kaya', group:2, emoji:'🪨', color:'#64748b', score:0, grow:3, duration:80, isHarmful:true },
            FOG:       { type:'fog', name:'Sis Laneti', group:2, emoji:'🌫️', color:'#475569', score:-10, grow:0, duration:80, isHarmful:true, effect:'fog', effectDuration:50 },
            THIEF:     { type:'thief', name:'Puan Hırsızı', group:2, emoji:'💸', color:'#e11d48', score:-50, grow:0, duration:80, isHarmful:true }
});
 let score=0,isGameOver=false,currentInterval=105,highScore=0,gridSize=1;
 const cellCountX=selectedMap==='wide'?35:20,cellCountY=cellCountX;
 const currentRunSettings={training:false},gameRandom=seededRandom(seed),sessionStats={goldEaten:0};
 const stats={magnetsUsed:0,shieldBlocks:0},achievements=new Set(),quests={};
 let effects={slow:0,speed:0,reverse:0,shield:0,fog:0},snake=[{x:Math.floor(cellCountX/2),y:Math.floor(cellCountY/2)-1},{x:Math.floor(cellCountX/2)-1,y:Math.floor(cellCountY/2)-1},{x:Math.floor(cellCountX/2)-2,y:Math.floor(cellCountY/2)-1}];
 let direction={x:1,y:0},prevSnake=[],snakeGrewLastTick=false,snakeCutLastTick=false,headChompScale=1,foods=[],inputQueue=[],obstacles=MAPS[selectedMap]();
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
            const timedFoods = new Set(foods);
            prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
            snakeGrewLastTick = false;
            snakeCutLastTick = false;

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

            const context={tail:snake.pop()};
            snake.unshift(head);
            for(const effect of Object.keys(effects))effects[effect]=Math.max(0,effects[effect]-elapsedUnits);

            const ateFoodIndex=foods.findIndex(food=>food.x===head.x&&food.y===head.y);
            if(ateFoodIndex!==-1){
                applyFood(foods.splice(ateFoodIndex,1)[0],context);
                scoreElement.textContent=score;
                if(!currentRunSettings?.training&&score>highScore){
                    highScore=score;highScoreElement.textContent=highScore;storage.setItem(getHighScoreKey(),highScore);
                }
                const minFoods=selectedMap==='wide'?4:2;
                while(foods.length<minFoods){if(!spawnFood(getRandomFoodType()))break;}
            }
            snakeGrewLastTick=snake.length>prevSnake.length;
            snakeCutLastTick=!!context.cut;
            for(let i=foods.length-1;i>=0;i--){
                const food=foods[i];
                if(timedFoods.has(food)&&food.timer!==null){
                    food.timer-=elapsedUnits;
                    if(food.timer<=0){foods.splice(i,1);spawnFood(getRandomFoodType());}
                }
            }
            if (snake.length + obstacles.length >= cellCountX * cellCountY) {
                endGame();
                menuTitle.textContent = 'TEBRİKLER!';
                lastRunSummary.textContent = 'Tüm alanı doldurdun! '+lastRunSummary.textContent;
            }
            updateStatusBadges();
            calculateInterval();
        }

        function applyFood(eaten,context){
            createExplosion(eaten.x,eaten.y,eaten.color,18);
            headChompScale=1.35;digestionBulges.push({distPx:0,color:eaten.color});
            if(effects.reverse>0)triggerQuestProgress('q_confuse_eat',1);
            if(effects.shield>0&&eaten.isHarmful){
                score+=15;playSound('powerup');addFloatingText(eaten.x,eaten.y,'+15 (ENGEL)','#22c55e');
                if(!currentRunSettings?.training){stats.shieldBlocks++;saveStats();if(stats.shieldBlocks>=3)unlockAchievement('shield_hero');}
                triggerQuestProgress('q_shield_blocks',1);
            }else{
                score=Math.max(0,score+eaten.score);
                if(eaten.score)addFloatingText(eaten.x,eaten.y,(eaten.score>0?'+':'')+eaten.score,eaten.color);
                if(eaten.type==='apple'){playSound('eat_apple');unlockAchievement('first_eat');triggerQuestProgress('q_apples',1);}
                else if(eaten.type==='gold'||eaten.type==='purple'){
                    playSound('eat_gold');
                    if(eaten.type==='gold'){sessionStats.goldEaten++;triggerQuestProgress('q_gold_single',sessionStats.goldEaten,true);}
                }else playSound(eaten.isHarmful?'debuff':eaten.type==='scissors'?'scissors':eaten.type==='bomb'?'bomb':'powerup');
                if(['magnet','scissors','shield','bomb'].includes(eaten.type))triggerQuestProgress('q_powerups',1);
                if(eaten.effect)effects[eaten.effect]=eaten.effectDuration;

                for(let growth=0;growth<eaten.grow;growth++){
                    snake.push(context.tail?{...context.tail}:{...snake[snake.length-1]});context.tail=null;
                }
                if(eaten.grow<0){
                    if(snake.length>2){const lost=snake.pop();context.cut=true;createExplosion(lost.x,lost.y,eaten.color,12);}
                    context.tail=null;
                }
                if(eaten.type==='magnet'){
                    addFloatingText(eaten.x,eaten.y,'🧲 MIKNATIS!',eaten.color);
                    if(!currentRunSettings?.training){stats.magnetsUsed++;saveStats();if(stats.magnetsUsed>=3)unlockAchievement('magnet_master');}
                    // Remove before resolving: chained magnets consume each food exactly once.
                    for(const food of [...foods].reverse())if(!food.isHarmful){
                        const index=foods.indexOf(food);if(index!==-1){foods.splice(index,1);applyFood(food,context);}
                    }
                }
                if(eaten.type==='scissors'){
                    const cut=Math.min(Math.floor(snake.length/2),snake.length-2);
                    if(cut>0){
                        const tail=snake[snake.length-1];snake.splice(snake.length-cut,cut);context.tail=null;context.cut=true;
                        createExplosion(tail.x,tail.y,eaten.color,20);score+=cut*10;
                        addFloatingText(eaten.x,eaten.y,'✂️ −'+cut+' BOY, +'+cut*10,eaten.color);unlockAchievement('scissor_cut');
                    }else addFloatingText(eaten.x,eaten.y,'✂️ EN KISA BOY',eaten.color);
                }
                if(eaten.type==='bomb'){
                    let count=0;
                    for(let i=foods.length-1;i>=0;i--)if(foods[i].isHarmful){const food=foods.splice(i,1)[0];createExplosion(food.x,food.y,eaten.color,15);count++;}
                    score+=count*15;
                    addFloatingText(eaten.x,eaten.y,count?'💣 '+count+' YEM, +'+count*15:'💣 TUZAK YOK',eaten.color);
                    if(count>0)unlockAchievement('bomb_expert');
                }
            }
            // Include every bonus and shield block in score quests and achievements.
            triggerQuestProgress('q_score_target',score,true);
            if(selectedMap==='wide')triggerQuestProgress('q_wide_score',score,true);
            if(selectedMap==='nowall')triggerQuestProgress('q_nowall_score',score,true);
            if(score>=100){unlockAchievement('score_100');if(selectedDifficulty==='hard')unlockAchievement('hardcore_survivor');}
            if(score>=300)unlockAchievement('score_300');
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

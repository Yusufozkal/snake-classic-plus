// Build inserts the actual browser's rule constants and step functions here.
// There is no eval, DOM, random client seed or separate scoring implementation.
const RULES_VERSION = 3, MAX_REPLAY_TICKS = 20000;
/* PROGRESS_CONSTANTS */
function seededRandom(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function createReplayEngine(selectedMap,selectedDifficulty,seed){
/* RULE_CONSTANTS */
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
/* RULE_FUNCTIONS */
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

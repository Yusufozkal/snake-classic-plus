const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
// Test-only fixture injection into the generated rules, never into the shipped game.
const source=fs.readFileSync(path.resolve(__dirname,'../dist/server/replay.js'),'utf8').replace(/export \{[^}]+\};?\s*$/,'').replace('return {step(code)',`return {fixture(config){score=config.score??100;snake=config.snake??[{x:10,y:9},{x:9,y:9},{x:8,y:9}];foods=(config.foods??[]).map(f=>({...Object.values(FOOD_TYPES).find(t=>t.type===f.type),...f,timer:f.timer??Object.values(FOOD_TYPES).find(t=>t.type===f.type).duration}));effects={slow:0,speed:0,reverse:0,shield:0,fog:0,...config.effects};calculateInterval();},step(code)`);
const context={};vm.runInNewContext(source+';globalThis.engine=createReplayEngine;',context);
function run(type,options={}){const engine=context.engine(options.map||'classic',options.diff||'medium',123);engine.fixture({...options,snake:options.snake?.map(p=>({...p})),foods:[{type,x:11,y:9},...(options.extra||[])]});engine.step();return engine.state();}
const cases=[
 ['apple',110,4],['gold',130,5],['ice',115,4,'slow',40],['purple',150,4],
 ['magnet',120,3],['scissors',125,2],['shield',115,4,'shield',50],['bomb',120,3],
 ['poison',75,4],['chili',105,4,'speed',40],['confuse',105,4,'reverse',40],
 ['trapgrow',100,6],['fog',90,3,'fog',50],['thief',50,3]
];
for(const[type,score,length,effect,duration]of cases){const s=run(type);assert.equal(s.score,score,type+' score');assert.equal(s.snake.length,length,type+' length');if(effect)assert.equal(s.effects[effect],duration,type+' full effect duration');assert.equal(s.rewards.quests.q_score_target,score,type+' quest');}
const two=[{x:10,y:9},{x:9,y:9}],five=[...two,{x:8,y:9},{x:7,y:9},{x:6,y:9}];
let s=run('poison',{snake:two});assert.equal(s.snake.length,3);assert.equal(new Set(s.snake.map(p=>p.x+','+p.y)).size,3,'poison must add one distinct body segment');
s=run('scissors',{snake:two});assert.equal(s.score,115);assert.equal(s.snake.length,2);assert(!s.rewards.achievements.includes('scissor_cut'),'no cut means no cut achievement');
s=run('scissors',{snake:five});assert.equal(s.score,135);assert.equal(s.snake.length,3);assert(s.rewards.achievements.includes('scissor_cut'));
s=run('bomb');assert(!s.rewards.achievements.includes('bomb_expert'),'empty board is not a bomb success');
s=run('bomb',{score:90,extra:[{type:'poison',x:1,y:1},{type:'chili',x:2,y:2}]});assert.equal(s.score,140);assert(s.rewards.achievements.includes('bomb_expert'));assert.equal(s.rewards.quests.q_score_target,140);assert(s.rewards.achievements.includes('score_100'));
s=run('magnet',{score:50,extra:[{type:'purple',x:1,y:1},{type:'shield',x:2,y:2},{type:'ice',x:3,y:3}]});assert.equal(s.score,150);assert.equal(s.snake.length,6);assert.equal(s.effects.shield,50);assert.equal(s.effects.slow,40);assert.equal(s.rewards.quests.q_powerups,2);assert.equal(s.rewards.quests.q_score_target,150);assert(s.rewards.achievements.includes('score_100'));
s=run('magnet',{score:0,extra:[{type:'magnet',x:1,y:1},{type:'apple',x:2,y:2},{type:'gold',x:3,y:3}]});assert.equal(s.score,80);assert.equal(s.snake.length,6);assert.equal(s.rewards.magnets,2);assert.equal(s.rewards.quests.q_powerups,2);assert.equal(s.rewards.quests.q_apples,1);assert.equal(s.rewards.quests.q_gold_single,1);assert(s.rewards.achievements.includes('first_eat'));
s=run('magnet',{snake:[...five,{x:5,y:9}],extra:[{type:'gold',x:0,y:0},{type:'scissors',x:1,y:1}]});assert.equal(s.score,195);assert.equal(s.snake.length,5);assert(s.snake.slice(2).every(p=>p.x===9),'regrowth must not resurrect the cut tail');
s=run('scissors',{score:280,snake:five,diff:'hard'});assert.equal(s.score,315);assert(s.rewards.achievements.includes('score_300'));assert(s.rewards.achievements.includes('hardcore_survivor'));
for(const type of ['poison','chili','confuse','trapgrow','fog','thief']){s=run(type,{score:90,effects:{shield:50}});assert.equal(s.score,105,type+' shield score');assert.equal(s.snake.length,3);assert.equal(s.rewards.shields,1);assert.equal(s.rewards.quests.q_shield_blocks,1);assert(s.rewards.achievements.includes('score_100'));for(const e of ['slow','speed','reverse','fog'])assert.equal(s.effects[e],0,type+' blocked effect');}
s=run('poison',{effects:{shield:0.5}});assert.equal(s.score,75,'expired shield must not block');
for(const type of ['poison','fog','thief'])assert.equal(run(type,{score:0}).score,0,'score floor '+type);
s=run('apple',{extra:[{type:'purple',x:0,y:0,timer:90}]});assert.equal(s.foods.find(f=>f.type==='purple'&&f.x===0).timer,88.95,'existing food ages');
for(const food of s.foods.filter(f=>!(f.type==='purple'&&f.x===0)))assert.equal(food.timer,food.duration,'new food keeps full field lifetime');
console.log('PASS: all 14 foods, actual cut/bomb awards, minimum length, magnet effects/chains/quests, bonus thresholds, shield hazards/expiry, full effect and spawn durations.');

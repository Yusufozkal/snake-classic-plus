const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
(async()=>{
const root=path.resolve(__dirname,'..'),worker=(await import(pathToFileURL(root+'/dist/server/index.js'))).default,{createReplayEngine,RULES_VERSION}=await import(pathToFileURL(root+'/dist/server/replay.js'));
const {createReplayEngine:createV1ReplayEngine,RULES_VERSION:V1_RULES_VERSION}=await import(pathToFileURL(root+'/dist/server/replay-v1.js'));
const {createReplayEngine:createV2ReplayEngine,RULES_VERSION:V2_RULES_VERSION}=await import(pathToFileURL(root+'/dist/server/replay-v2.js'));
const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const upgrade=new DatabaseSync(':memory:'),migrations=fs.readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort();for(const f of migrations.slice(0,-1))upgrade.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
upgrade.prepare('INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at,score) VALUES(?,?,?,?,?,?,?,?,?)').run('existing','legacy','old-token','Old Player','classic','hard',1,2,12345);upgrade.prepare('INSERT INTO player_profiles(account_id,data,revision) VALUES(?,?,1)').run('legacy-profile','{"snake_player_xp":"500","snake_nickname":"Old Player"}');upgrade.exec(fs.readFileSync(root+'/drizzle/'+migrations.at(-1),'utf8'));assert.equal(upgrade.prepare('SELECT score,verified FROM game_runs').get().score,12345);assert.equal(upgrade.prepare('SELECT verified FROM game_runs').get().verified,0);assert.equal(JSON.parse(upgrade.prepare('SELECT data FROM player_profiles').get().data).snake_player_xp,'500');upgrade.close();
const env={DB:{prepare(sql){const s=db.prepare(sql);let v=[];return{bind(...args){v=args;return this},async first(){return s.get(...v)||null},async all(){return{results:s.all(...v)}},async run(){return s.run(...v)}}}},ADMIN_EMAIL:'owner@example.test',TRUST_PLATFORM_IDENTITY:'1',SHARED_START_LIMIT_PER_MINUTE:'12'};
const realNow=Date.now;let time=realNow();Date.now=()=>time;
const account=id=>'account:'+createHash('sha256').update(id).digest('hex');
async function api(route,data,options={}){const headers={origin:'https://game.example','content-type':'application/json',...(options.ip?{'cf-connecting-ip':options.ip}:{}),...(options.cookie?{cookie:'snake_player='+options.cookie}:{}),...(options.id?{'oai-authenticated-user-id':options.id}:{}),...options.headers};const r=await worker.fetch(new Request('https://game.example'+route,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify({...data,...(options.id?{accountKey:account(options.id)}:{})})}),env);const type=r.headers.get('content-type');return{status:r.status,data:type?.includes('json')?await r.json():await r.text(),headers:r.headers};}
async function start(options={},map='classic'){const payload={id:randomUUID(),token:randomUUID(),nickname:'Security Test',map,difficulty:'hard',skin:'red',cosmetic:'crown',rulesVersion:RULES_VERSION};const r=await api('/api/runs',payload,options);return{...payload,...r.data,status:r.status,cookie:r.headers.get('set-cookie')?.match(/snake_player=([^;]+)/)?.[1]};}
function storedRewards(state){return{...state.rewards,achievements:Object.fromEntries(state.rewards.achievements.map(id=>[id,1]))};}
function findVersionDifference(oldFactory=createV1ReplayEngine){
 // A fixed serpentine circuit visits every cell without selecting a path from
 // either engine's food state. The archived engine defines the v1 expectation.
 for(let seed=1;seed<=32;seed++){
  const oldEngine=oldFactory('nowall','hard',seed),currentEngine=createReplayEngine('nowall','hard',seed),moves=[];let last=1;
  for(let tick=1;tick<=4000;tick++){
   const head=oldEngine.state().snake[0],right=head.y%2===1,code=right?(head.x===19?2:1):(head.x===0?2:3);
   if(code!==last)moves.push([tick,code]);last=code;oldEngine.step(code);currentEngine.step(code);
   const oldState=oldEngine.state(),currentState=currentEngine.state();
   if(oldState.score>0&&(oldState.score!==currentState.score||oldState.dead!==currentState.dead||JSON.stringify(storedRewards(oldState))!==JSON.stringify(storedRewards(currentState))))return{seed,moves,oldState,currentState};
   if(oldState.dead||currentState.dead)break;
  }
 }
 throw new Error('Expected a reproducible v1/v2 food-rule difference; update the compatibility fixture when changing rules.');
}
function insertVersionedRun({id=randomUUID(),token=randomUUID(),player,version,seed,name,startedAt=time,finishedAt=null,score=null,outcome=null,verified=0,proofHash=null,rewards=null}){
 db.prepare('INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at,score,outcome,seed,rules_version,verified,cosmetic,quest_date,proof_hash,rewards) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,account(player),createHash('sha256').update(token).digest('hex'),name,'nowall','hard',startedAt,finishedAt,score,outcome,seed,version,verified,'plain',new Date(startedAt).toISOString().slice(0,10),proofHash,rewards===null?null:JSON.stringify(rewards));
 return{id,token};
}
try{
assert.equal(RULES_VERSION,3);assert.equal(V1_RULES_VERSION,1);assert.equal(V2_RULES_VERSION,2);
for(const oldVersion of [undefined,1,2]){
 const payload={id:randomUUID(),token:randomUUID(),nickname:'Old tab',map:'classic',difficulty:'hard',...(oldVersion===undefined?{}:{rulesVersion:oldVersion})};
 const rejected=await api('/api/runs',payload,{ip:'203.0.113.100'});assert.equal(rejected.status,409);assert.match(rejected.data.error,/yenile/i);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_runs WHERE id=?').get(payload.id).n,0);
}
let run=await start({ip:'203.0.113.1'});assert.equal(run.status,201);assert.equal(typeof run.seed,'number');assert.equal(run.rulesVersion,3);assert.equal(db.prepare('SELECT rules_version FROM game_runs WHERE id=?').get(run.id).rules_version,3);
let r=await api('/api/runs/'+run.id+'/finish',{token:run.token,score:1000000,outcome:'completed'},{ip:'203.0.113.1',cookie:run.cookie});assert.equal(r.status,400);assert.equal(db.prepare('SELECT score FROM game_runs WHERE id=?').get(run.id).score,null);
const engine=createReplayEngine(run.map,run.difficulty,run.seed);for(let i=0;i<10;i++)engine.step();const valid=engine.state();
r=await api('/api/runs/'+run.id+'/finish',{token:run.token,score:valid.score,ticks:10,moves:[],outcome:'completed'},{cookie:run.cookie});assert.equal(r.status,400);assert.match(r.data.error,/süresinden/);
time+=valid.elapsed+1000;r=await api('/api/runs/'+run.id+'/finish',{token:run.token,score:1000000,ticks:10,moves:[],outcome:'completed'},{cookie:run.cookie});assert.equal(r.status,400);assert.match(r.data.error,/Skor/);
const finish={token:run.token,score:valid.score,ticks:10,moves:[],outcome:'completed'};r=await api('/api/runs/'+run.id+'/finish',finish,{cookie:run.cookie});assert.equal(r.status,200);assert.equal(r.data.score,valid.score);assert.equal(db.prepare('SELECT verified FROM game_runs WHERE id=?').get(run.id).verified,1);const xp=r.data.progress.snake_player_xp;r=await api('/api/runs/'+run.id+'/finish',finish,{cookie:run.cookie});assert.equal(r.data.progress.snake_player_xp,xp);
r=await api('/api/runs/'+run.id+'/finish',{...finish,ticks:11},{cookie:run.cookie});assert.equal(r.status,409);
const results=await Promise.all(Array.from({length:25},(_,i)=>start({ip:'203.0.113.2',cookie:i%2?randomUUID():undefined})));assert.equal(results.filter(r=>r.status===201).length,12);assert.equal(results.filter(r=>r.status===429).length,13);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_runs WHERE rate_key=(SELECT rate_key FROM game_runs WHERE id=?)').get(results.find(r=>r.status===201).id).n,12);
for(let i=0;i<12;i++)assert.equal((await start({ip:'2001:db8::'+(i+1).toString(16)})).status,201);assert.equal((await start({ip:'2001:0db8:0000:0000::ffff'})).status,429);
for(let i=0;i<12;i++)assert.equal((await start()).status,201);assert.equal((await start({headers:{'x-forwarded-for':'198.51.100.199'}})).status,429);
const id='alpha';db.prepare('INSERT INTO player_profiles(account_id,data,revision) VALUES(?,?,1)').run(account(id),JSON.stringify({snake_nickname:'Saved Name',snake_player_xp:'999999999',snake_achievements:'{"score_300":1}',snake_hs_hard_classic:'1000000'}));
r=await api('/api/profile',undefined,{id});assert.equal(r.data.data.snake_player_xp,'0');assert.equal(r.data.data.snake_achievements,'{}');assert.equal(r.data.data.snake_hs_hard_classic,'0');assert.equal(r.data.data.snake_nickname,'Saved Name');
for(const key of ['snake_player_xp','snake_achievements','snake_stats','snake_daily_quests','snake_hs_hard_classic']){r=await api('/api/profile',{revision:1,data:{[key]:'999999'}},{id});assert.equal(r.status,400);}
r=await api('/api/profile',{revision:1,data:{snake_nickname:'Updated',snake_skin:'gold',snake_tutorial_choice_v1:'yes'}},{id});assert.equal(r.status,200);assert.equal(JSON.parse(db.prepare('SELECT data FROM player_profiles WHERE account_id=?').get(account(id)).data).snake_player_xp,'999999999','legacy data preserved separately');
run=await start({id,ip:'203.0.113.3'});const replay=createReplayEngine(run.map,run.difficulty,run.seed);let moves=[],last=1;
// Find a legal path to the initial apple using the same authoritative state.
let target=replay.state().foods[0],dirs=[[0,-1],[1,0],[0,1],[-1,0]],found=false;
for(let i=0;i<300&&!replay.state().dead&&!found;i++){const s=replay.state(),body=new Set(s.snake.slice(0,-1).map(p=>p.x+','+p.y));const queue=[{x:s.snake[0].x,y:s.snake[0].y,steps:[],dir:last}],seen=new Set();let plan;
while(queue.length){const p=queue.shift();if(p.x===target.x&&p.y===target.y){plan=p.steps;break;}for(let code=0;code<4;code++){if(code===(p.dir+2)%4)continue;const x=p.x+dirs[code][0],y=p.y+dirs[code][1],key=x+','+y+','+code;if(x<0||x>=20||y<0||y>=20||body.has(x+','+y)||seen.has(key))continue;seen.add(key);queue.push({x,y,dir:code,steps:[...p.steps,code]});}}
if(!plan?.length)break;const code=plan[0];if(code!==last)moves.push([i+1,code]);last=code;replay.step(code);found=replay.state().rewards.achievements.includes('first_eat');}
assert(found,'apple path must be verified');const state=replay.state();time+=state.elapsed+1000;const proof={token:run.token,ticks:state.ticks,moves,outcome:state.dead?'completed':'restarted',score:state.score};r=await api('/api/runs/'+run.id+'/finish',proof,{id:'beta'});assert.equal(r.status,403);r=await api('/api/runs/'+run.id+'/finish',proof,{id});assert.equal(r.status,200);assert.equal(r.data.score,state.score);assert.equal(JSON.parse(r.data.progress.snake_achievements).first_eat,1);assert(Number(r.data.progress.snake_player_xp)>=130);
const again=await api('/api/runs/'+run.id+'/finish',proof,{id});assert.equal(again.data.progress.snake_player_xp,r.data.progress.snake_player_xp);const fresh=await api('/api/profile',undefined,{id});assert.equal(fresh.data.data.snake_player_xp,r.data.progress.snake_player_xp);
const illegal=await start({id,ip:'203.0.113.3'});time+=10000;r=await api('/api/runs/'+illegal.id+'/finish',{token:illegal.token,ticks:1,moves:[[1,3]],outcome:'restarted'},{id});assert.equal(r.status,400);assert.match(r.data.error,/yön/);
const legacyId=randomUUID();db.prepare('INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at,score,outcome) VALUES(?,?,?,?,?,?,?,?,?,?)').run(legacyId,'legacy','x','Legacy Million','classic','hard',time,time,1000000,'completed');r=await api('/api/leaderboard');assert(!r.data.scores.some(s=>s.name==='Legacy Million'));assert(r.data.scores.some(s=>s.score===state.score));
const admin=await api('/api/admin/runs',undefined,{id:'owner',headers:{'oai-authenticated-user-email':env.ADMIN_EMAIL}});assert.equal(admin.status,200);assert(admin.data.summary.best_score<1000000);assert.equal(admin.data.runs.find(r=>r.id===legacyId).verified,0);
assert.equal((await api('/api/admin/runs')).status,401);assert.equal((await api('/api/admin/runs',undefined,{id:'beta'})).status,403);assert.equal((await api('/api/runs',{id:randomUUID()},{headers:{origin:'https://evil.example'}})).status,403);

// Existing verified v1 history must survive a rules upgrade without replaying it.
const historyToken=randomUUID(),historyProof={token:historyToken,ticks:10,moves:[],outcome:'completed',score:10};
const history=insertVersionedRun({token:historyToken,player:'v1-history',version:1,seed:1,name:'V1 History',startedAt:time-86400000,finishedAt:time-86399000,score:10,outcome:'completed',verified:1,proofHash:createHash('sha256').update(JSON.stringify({ticks:historyProof.ticks,moves:historyProof.moves,outcome:historyProof.outcome,score:historyProof.score})).digest('hex'),rewards:{achievements:{first_eat:1},quests:{},magnets:0,shields:0}});
const historyBefore=db.prepare('SELECT * FROM game_runs WHERE id=?').get(history.id);
const historyProfile=await api('/api/profile',undefined,{id:'v1-history'});assert.equal(historyProfile.data.data.snake_player_xp,'60');assert.equal(historyProfile.data.data.snake_hs_hard_nowall,'10');assert.equal(JSON.parse(historyProfile.data.data.snake_achievements).first_eat,1);
const historyRetry=await api('/api/runs/'+history.id+'/finish',{...historyProof,rulesVersion:2},{id:'v1-history'});assert.equal(historyRetry.status,200);assert.equal(historyRetry.data.progress.snake_player_xp,'60');assert.deepEqual(db.prepare('SELECT * FROM game_runs WHERE id=?').get(history.id),historyBefore);

// Active old runs use their stored version even when the caller claims v2.
const fixture=findVersionDifference(),oldState=fixture.oldState,currentState=fixture.currentState;
const startedAt=time-Math.max(oldState.elapsed,currentState.elapsed)-1000;
const oldRun=insertVersionedRun({player:'v1-active',version:1,seed:fixture.seed,name:'V1 Active',startedAt});
const oldRegistration=await api('/api/runs',{id:oldRun.id,token:oldRun.token,nickname:'V1 Active',map:'nowall',difficulty:'hard',rulesVersion:1},{id:'v1-active'});assert.equal(oldRegistration.status,201);assert.equal(oldRegistration.data.rulesVersion,1);assert.equal(oldRegistration.data.seed,fixture.seed);assert.equal(db.prepare('SELECT started_at FROM game_runs WHERE id=?').get(oldRun.id).started_at,startedAt);
const oldProof={token:oldRun.token,ticks:oldState.ticks,moves:fixture.moves,outcome:oldState.dead?'completed':'restarted',score:oldState.score,rulesVersion:2};
const oldFinished=await api('/api/runs/'+oldRun.id+'/finish',oldProof,{id:'v1-active'});assert.equal(oldFinished.status,200);assert.equal(oldFinished.data.score,oldState.score);
const oldSaved=db.prepare('SELECT * FROM game_runs WHERE id=?').get(oldRun.id);assert.equal(oldSaved.rules_version,1);assert.equal(oldSaved.verified,1);assert.deepEqual(JSON.parse(oldSaved.rewards),storedRewards(oldState));assert.equal(oldFinished.data.progress.snake_hs_hard_nowall,String(oldState.score));
const oldAgain=await api('/api/runs/'+oldRun.id+'/finish',{...oldProof,rulesVersion:1},{id:'v1-active'});assert.equal(oldAgain.status,200);assert.deepEqual(oldAgain.data.progress,oldFinished.data.progress);assert.deepEqual(db.prepare('SELECT * FROM game_runs WHERE id=?').get(oldRun.id),oldSaved);
const oldProfile=await api('/api/profile',undefined,{id:'v1-active'});assert.deepEqual(Object.fromEntries(Object.entries(oldProfile.data.data).filter(([key])=>key.startsWith('snake_'))),oldFinished.data.progress);

// A caller cannot select v1 for a current run to obtain the old food rewards.
const currentRun=insertVersionedRun({player:'v2-version-check',version:RULES_VERSION,seed:fixture.seed,name:'V3 Check',startedAt});
const forgedCurrent=await api('/api/runs/'+currentRun.id+'/finish',{...oldProof,token:currentRun.token,rulesVersion:1},{id:'v2-version-check'});
if(oldState.score!==currentState.score||oldState.dead!==currentState.dead){assert.equal(forgedCurrent.status,400);assert.equal(db.prepare('SELECT verified FROM game_runs WHERE id=?').get(currentRun.id).verified,0);}
else{assert.equal(forgedCurrent.status,200);assert.deepEqual(JSON.parse(db.prepare('SELECT rewards FROM game_runs WHERE id=?').get(currentRun.id).rewards),storedRewards(currentState));assert.notDeepEqual(storedRewards(currentState),storedRewards(oldState));}
const unknownRun=insertVersionedRun({player:'unknown-version',version:999,seed:fixture.seed,name:'Unknown Version',startedAt});
const unknownResult=await api('/api/runs/'+unknownRun.id+'/finish',{...oldProof,token:unknownRun.token,rulesVersion:1},{id:'unknown-version'});assert.equal(unknownResult.status,400);assert.equal(db.prepare('SELECT verified FROM game_runs WHERE id=?').get(unknownRun.id).verified,0);
const retained=await api('/api/leaderboard');assert(retained.data.scores.some(row=>row.name==='V1 History'&&row.score===10));assert(retained.data.scores.some(row=>row.name==='V1 Active'&&row.score===oldState.score));

// The mushroom change must not re-interpret active v2 games or their saved proof.
const v2Fixture=findVersionDifference(createV2ReplayEngine),v2State=v2Fixture.oldState;
const v2Run=insertVersionedRun({player:'v2-active',version:2,seed:v2Fixture.seed,name:'V2 Active',startedAt:time-Math.max(v2State.elapsed,v2Fixture.currentState.elapsed)-1000});
const v2Registration=await api('/api/runs',{id:v2Run.id,token:v2Run.token,nickname:'V2 Active',map:'nowall',difficulty:'hard',rulesVersion:2},{id:'v2-active'});assert.equal(v2Registration.status,201);assert.equal(v2Registration.data.rulesVersion,2);
const v2Proof={token:v2Run.token,ticks:v2State.ticks,moves:v2Fixture.moves,outcome:v2State.dead?'completed':'restarted',score:v2State.score,rulesVersion:3};
const v2Finished=await api('/api/runs/'+v2Run.id+'/finish',v2Proof,{id:'v2-active'});assert.equal(v2Finished.status,200);assert.equal(v2Finished.data.score,v2State.score);assert.deepEqual(JSON.parse(db.prepare('SELECT rewards FROM game_runs WHERE id=?').get(v2Run.id).rewards),storedRewards(v2State));
const v2Again=await api('/api/runs/'+v2Run.id+'/finish',v2Proof,{id:'v2-active'});assert.equal(v2Again.status,200);assert.deepEqual(v2Again.data.progress,v2Finished.data.progress);
const v2Profile=await api('/api/profile',undefined,{id:'v2-active'});assert.equal(v2Profile.data.data.snake_player_xp,v2Finished.data.progress.snake_player_xp);assert.equal(v2Profile.data.data.snake_hs_hard_nowall,String(v2State.score));
const v3Run=insertVersionedRun({player:'v3-mushroom',version:3,seed:v2Fixture.seed,name:'V3 Mushroom',startedAt:time-Math.max(v2State.elapsed,v2Fixture.currentState.elapsed)-1000});
const wrongMushroomProof=await api('/api/runs/'+v3Run.id+'/finish',{...v2Proof,token:v3Run.token,rulesVersion:2},{id:'v3-mushroom'});
if(v2State.score!==v2Fixture.currentState.score||v2State.dead!==v2Fixture.currentState.dead)assert.equal(wrongMushroomProof.status,400);else{assert.equal(wrongMushroomProof.status,200);assert.deepEqual(JSON.parse(db.prepare('SELECT rewards FROM game_runs WHERE id=?').get(v3Run.id).rewards),storedRewards(v2Fixture.currentState));}

time=Date.parse('2026-10-02T23:59:59Z');for(let i=0;i<12;i++)assert.equal((await start({ip:'203.0.113.9'})).status,201);time+=2000;assert.equal((await start({ip:'203.0.113.9'})).status,429,'midnight must not reset the minute quota');
for(let i=0;i<300;i++){time+=61000;assert.equal((await start({ip:'203.0.113.10'})).status,201);}time+=61000;assert.equal((await start({ip:'203.0.113.10'})).status,429,'rolling daily cap');
console.log('PASS: immediate million, speed, forged valid-replay score, legal scoring, idempotency, concurrent/rotated-cookie/IPv6/missing-IP rate caps, protected progression, account ownership, legacy isolation, v1 history/active-run compatibility, stored-version verifier selection, old-tab rejection, admin and origin controls.');
}finally{Date.now=realNow;db.close();}
})().catch(e=>{console.error(e);process.exit(1)});

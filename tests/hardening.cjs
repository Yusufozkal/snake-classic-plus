const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{pathToFileURL}=require('node:url'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),workerURL=pathToFileURL(path.join(root,'dist/server/index.js')).href;
const origin='https://game.example',owner={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'};
const account=id=>'account:'+createHash('sha256').update(id).digest('hex');
const fixtures=[];
let rulesVersion;
async function fixture(settings={}){
 const db=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
 const worker=(await import(workerURL+'?hardening='+randomUUID())).default;
 let count=0,gate;
 const binding={prepare(sql){count++;const statement=db.prepare(sql);let values=[];return{bind(...args){values=args;return this;},async first(){return statement.get(...values)||null;},async all(){const result={results:statement.all(...values)};if(gate&&sql.includes('ROW_NUMBER()')){const current=gate;gate=null;current.snapshot();await current.wait;}return result;},async run(){return statement.run(...values);}};}};
 const env={DB:binding,ADMIN_EMAIL:'owner@example.test',TRUST_PLATFORM_IDENTITY:'1',TRUSTED_IP_HEADER:'cf-connecting-ip',...settings};
 const api=(route,data,headers={},selected=worker)=>selected.fetch(new Request(origin+route,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);
 const insert=({name='Fixture',player=randomUUID(),score=50,finished=true,version=rulesVersion}={})=>{
  const id=randomUUID(),token=randomUUID(),now=Date.now();
  db.prepare('INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at,score,verified,seed,rules_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,player,createHash('sha256').update(token).digest('hex'),name,'classic','hard',now,finished?now:null,finished?score:null,finished?1:0,1,version);
  return{id,token,nickname:name,map:'classic',difficulty:'hard',rulesVersion:version};
 };
 const f={db,env,api,insert,count:()=>count,resetCount:()=>{count=0;},gate:current=>{gate=current;},worker};fixtures.push(f);return f;
}
async function start(f,headers={},changes={}){
 const payload={id:randomUUID(),token:randomUUID(),nickname:'Hardening',map:'classic',difficulty:'hard',rulesVersion,...changes};
 const response=await f.api('/api/runs',payload,headers),data=await response.json();
 return{...payload,...data,status:response.status,cookie:response.headers.get('set-cookie')?.match(/snake_player=([^;]+)/)?.[1]};
}
async function identityChecks(){
 const closed=await fixture({TRUST_PLATFORM_IDENTITY:undefined});
 for(const route of ['/api/profile','/api/admin/runs','/api/admin/security-reports'])assert([401,403].includes((await closed.api(route,undefined,owner)).status),'identity headers must be denied without explicit trust: '+route);
 assert.equal((await closed.api('/api/admin/runs/delete',{ids:[randomUUID()]},owner)).status,401);
 const anonymous=await start(closed,owner);assert.equal(anonymous.status,201);assert(!closed.db.prepare('SELECT player_id FROM game_runs WHERE id=?').get(anonymous.id).player_id.startsWith('account:'),'untrusted identity must not own a run');
 const enabled=await fixture(),alice={'oai-authenticated-user-id':'alice'},bob={'oai-authenticated-user-id':'bob'};
 const aliceProfile=await (await enabled.api('/api/profile',undefined,alice)).json();assert.equal(aliceProfile.key,account('alice'));
 assert.equal((await enabled.api('/api/profile',{accountKey:account('alice'),revision:0,data:{snake_nickname:'Alice'}},alice)).status,200);
 const bobProfile=await (await enabled.api('/api/profile',undefined,bob)).json();assert.equal(bobProfile.key,account('bob'));assert.notEqual(bobProfile.data.snake_nickname,'Alice');
 assert.equal((await enabled.api('/api/admin/runs',undefined,alice)).status,403);assert.equal((await enabled.api('/api/admin/runs',undefined,owner)).status,200);
 assert.equal((await enabled.api('/api/admin/security-reports',undefined,bob)).status,403);
 const privateRun=await start(enabled,alice,{accountKey:account('alice')});assert.equal(privateRun.status,201);
 assert.equal((await enabled.api('/api/runs/'+privateRun.id+'/finish',{token:privateRun.token,ticks:0,moves:[],outcome:'restarted',score:0},bob)).status,403);
}
async function rateChecks(){
 const spoofed=await fixture({TRUSTED_IP_HEADER:undefined});
 const rotated=await Promise.all(Array.from({length:130},(_,i)=>start(spoofed,{'cf-connecting-ip':'198.51.100.'+(i%250+1),'x-forwarded-for':'203.0.113.'+(i%250+1),cookie:'snake_player='+randomUUID()})));
 assert.equal(rotated.filter(r=>r.status===201).length,120,'untrusted IP and rotated cookies share the site minute quota');assert.equal(rotated.filter(r=>r.status===429).length,10);
 const player=await fixture({TRUSTED_IP_HEADER:undefined}),cookie='snake_player='+randomUUID();
 for(let i=0;i<12;i++)assert.equal((await start(player,{cookie,'cf-connecting-ip':'198.51.100.'+(i+1)})).status,201);
 assert.equal((await start(player,{cookie,'cf-connecting-ip':'198.51.100.99'})).status,429,'same player cannot evade quota using spoofed IPs');
 const network=await fixture();const shared=await Promise.all(Array.from({length:16},()=>start(network,{'cf-connecting-ip':'203.0.113.2',cookie:'snake_player='+randomUUID()})));
 assert.equal(shared.filter(r=>r.status===201).length,12);assert.equal(shared.filter(r=>r.status===429).length,4);
 const configured=await fixture({TRUSTED_IP_HEADER:'x-real-ip'});
 for(let i=0;i<12;i++)assert.equal((await start(configured,{'x-real-ip':'203.0.113.30','cf-connecting-ip':'198.51.100.'+(i+1)})).status,201);
 assert.equal((await start(configured,{'x-real-ip':'203.0.113.30','cf-connecting-ip':'198.51.100.99'})).status,429,'only the configured trusted header selects the network bucket');
 const global=await fixture({SITE_RUNS_PER_MINUTE:'7'});const starts=await Promise.all(Array.from({length:20},(_,i)=>start(global,{'cf-connecting-ip':'203.0.113.'+(i+40)})));
 assert.equal(starts.filter(r=>r.status===201).length,7,'global concurrent insert cap must be atomic');assert.equal(starts.filter(r=>r.status===429).length,13);
 const daily=await fixture({SITE_RUNS_PER_DAY:'3'}),realNow=Date.now;let now=Date.parse('2026-11-13T23:59:59Z');Date.now=()=>now;
 try{
  const batch=await Promise.all(Array.from({length:8},(_,i)=>start(daily,{'cf-connecting-ip':'198.51.100.'+(i+20)})));assert.equal(batch.filter(r=>r.status===201).length,3,'daily site cap must be atomic');
  now+=61000;assert.equal((await start(daily,{'cf-connecting-ip':'198.51.100.200'})).status,429,'UTC midnight must not reset daily site quota');
  now+=86400000;assert.equal((await start(daily,{'cf-connecting-ip':'198.51.100.201'})).status,201,'daily site quota expires after the rolling window');
 }finally{Date.now=realNow;}
}
async function queryAndCacheChecks(){
 const bounded=await fixture();for(let i=0;i<50;i++)bounded.insert({name:'Player'+i,score:100+i});
 bounded.resetCount();const admin=await bounded.api('/api/admin/runs',undefined,owner);assert.equal(admin.status,200);assert.equal((await admin.json()).runs.length,50);assert(bounded.count()<=5,'50-row admin page must load the code key once; queries='+bounded.count());
 bounded.resetCount();const first=await bounded.api('/api/leaderboard');assert.equal((await first.json()).scores.length,20);assert(bounded.count()<=5,'20-row ranking must use bounded key and revision queries; queries='+bounded.count());
 bounded.resetCount();await bounded.api('/api/leaderboard');assert(bounded.count()<=1,'cache hits only need the shared revision check');
 const concurrent=await fixture(),target=concurrent.insert({name:'DeletedWhileReading'});let snapshot,release;
 const snapped=new Promise(resolve=>{snapshot=resolve;}),wait=new Promise(resolve=>{release=resolve;});concurrent.gate({snapshot,wait});
 const reading=concurrent.api('/api/leaderboard');await snapped;
 try{assert.equal((await concurrent.api('/api/admin/runs/delete',{ids:[target.id]},owner)).status,200);}finally{release();}
 await reading;const fresh=await (await concurrent.api('/api/leaderboard')).json();assert(!fresh.scores.some(row=>row.name==='DeletedWhileReading'),'an old in-flight query must not repopulate the cache after deletion');
 const isolates=await fixture(),otherWorker=(await import(workerURL+'?other-isolate='+randomUUID())).default;
 const preserved=isolates.insert({name:'CrossIsolate'});assert((await (await isolates.api('/api/leaderboard')).json()).scores.some(row=>row.name==='CrossIsolate'));
 assert.equal((await isolates.api('/api/admin/runs/delete',{ids:[preserved.id]},owner,otherWorker)).status,200);
 assert(!(await (await isolates.api('/api/leaderboard')).json()).scores.some(row=>row.name==='CrossIsolate'),'a deletion in another worker invalidates the cached ranking immediately');
 const updated=isolates.insert({name:'UpdatedElsewhere',score:90});let scores=(await (await isolates.api('/api/leaderboard')).json()).scores;assert.equal(scores.find(row=>row.name==='UpdatedElsewhere').score,90);
 isolates.db.prepare('UPDATE game_runs SET score=91 WHERE id=?').run(updated.id);scores=(await (await isolates.api('/api/leaderboard')).json()).scores;assert.equal(scores.find(row=>row.name==='UpdatedElsewhere').score,91,'verified score updates also change the shared revision');
}
async function legacyAndReplayChecks(){
 const f=await fixture(),oldName='\u2167'.repeat(4),legacy=f.insert({name:oldName,finished:false});assert(oldName.length<=15&&oldName.normalize('NFKC').length>15);
 const retry=await f.api('/api/runs',legacy);assert.equal(retry.status,201,'old accepted nicknames must keep idempotent registrations');assert.equal((await retry.json()).seed,1);
 assert.equal((await start(f,{}, {nickname:oldName})).status,400,'new names must satisfy the normalized length limit');
 const malformed=await f.api('/api/runs/'+legacy.id+'/finish',{token:legacy.token,ticks:1,moves:[[1,{}]],outcome:'restarted',score:0});assert.equal(malformed.status,400);const error=(await malformed.json()).error;assert.equal(typeof error,'string');assert(!/TypeError|ReferenceError|Cannot read|undefined|stack|database/i.test(error),'malformed replay must not disclose implementation errors');
}
(async()=>{
 rulesVersion=(await import(pathToFileURL(path.join(root,'dist/server/replay.js')))).RULES_VERSION;
 try{await identityChecks();await rateChecks();await queryAndCacheChecks();await legacyAndReplayChecks();console.log('PASS: explicit identity trust, account/admin isolation, spoofed-IP and rotated-cookie quotas, atomic site caps, rolling daily window, bounded player-code queries, cross-worker/racing cache invalidation, legacy retries and safe replay errors.');}
 finally{for(const f of fixtures)f.db.close();}
})().catch(error=>{console.error(error);process.exit(1);});

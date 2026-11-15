const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
(async()=>{
 const worker=(await import(pathToFileURL(path.resolve('dist/server/index.js')))).default;
 const db=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let queries=0;
 const env={TRUST_PLATFORM_IDENTITY:'1',TRUSTED_IP_HEADER:'cf-connecting-ip',ADMIN_EMAIL:'owner@example.com',DB:{prepare(sql){queries++;const statement=db.prepare(sql);let values=[];return{bind(...v){values=v;return this},async first(){return statement.get(...values)||null},async all(){return{results:statement.all(...values)}},async run(){return statement.run(...values)}}}}};
 const owner={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'},reporter={'oai-authenticated-user-id':'researcher'};
 const call=(route,method='GET',data,headers={})=>worker.fetch(new Request('https://game.example'+route,{method,headers:{...(data?{Origin:'https://game.example','Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined}),env);
 try{
  for(const [route,headers]of [['/',{}],['/',owner],['/admin',{}],['/admin',owner],['/favicon.svg',{}],['/missing',{}],['/api/profile',{}],['/api/leaderboard',{}],['/security',{}],['/.well-known/security.txt',{}],['/admin/security',owner]]){
   const response=await call(route,'GET',undefined,headers);
   assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000; includeSubDomains');
   assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
   assert.equal(response.headers.get('Server'),null);assert.equal(response.headers.get('X-Powered-By'),null);
   const csp=response.headers.get('Content-Security-Policy');assert(csp.includes("object-src 'none'"));assert(csp.includes("base-uri 'none'"));assert(!csp.includes('unsafe-eval'));
   if(response.headers.get('content-type').startsWith('text/html')){
    const nonce=csp.match(/script-src 'nonce-([0-9a-f]{32})'/)[1],text=await response.text();
    for(const tag of text.matchAll(/<(?:script|style)\b[^>]*>/g))assert(tag[0].includes(`nonce="${nonce}"`));
   }
  }
  const csp1=(await call('/')).headers.get('content-security-policy'),csp2=(await call('/')).headers.get('content-security-policy');assert.notEqual(csp1,csp2);
  const head=await call('/','HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');assert(head.headers.has('content-security-policy'));
  const redirect=await worker.fetch(new Request('http://game.example/a?b=1'),env);assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'https://game.example/a?b=1');assert(!redirect.headers.has('strict-transport-security'));
  const txt=await call('/.well-known/security.txt');assert.equal(txt.headers.get('content-type'),'text/plain; charset=utf-8');const text=await txt.text();assert.match(text,/Contact: https:\/\/game.example\/security\n/);assert.equal((text.match(/^Expires:/gm)||[]).length,1);assert(new Date(text.match(/Expires: (.+)/)[1])>new Date());assert.equal(await (await call('/security.txt')).text(),text);
  const data={id:crypto.randomUUID(),details:'Test-only report: <img src=x onerror=alert(1)>',contact:'test@example.com'};
  assert.equal((await call('/api/security-reports','POST',data)).status,401);
  assert.equal((await call('/api/security-reports','POST',data,{...reporter,Origin:'https://other.example'})).status,403);
  assert.equal((await call('/api/security-reports','POST',{...data,details:'short'},reporter)).status,400);
  assert.equal((await call('/api/security-reports','POST',data,reporter)).status,201);
  assert.equal((await call('/api/security-reports','POST',data,reporter)).status,200);
  assert.equal((await call('/api/admin/security-reports')).status,401);assert.equal((await call('/api/admin/security-reports','GET',undefined,reporter)).status,403);
  const inbox=await (await call('/api/admin/security-reports','GET',undefined,owner)).json();assert.equal(inbox.reports.length,1);assert.equal(inbox.reports[0].details,data.details);assert(!('reporter_key' in inbox.reports[0]));
  for(let i=0;i<2;i++)assert.equal((await call('/api/security-reports','POST',{...data,id:crypto.randomUUID()},reporter)).status,201);
  assert.equal((await call('/api/security-reports','POST',{...data,id:crypto.randomUUID()},reporter)).status,429);
  // Admin pages may only be framed by the site itself; the game stays embeddable.
  assert.match((await call('/admin','GET',undefined,owner)).headers.get('content-security-policy'),/frame-ancestors 'self'(;|$)/);assert.match((await call('/admin/security','GET',undefined,owner)).headers.get('content-security-policy'),/frame-ancestors 'self'(;|$)/);assert.match((await call('/')).headers.get('content-security-policy'),/frame-ancestors 'self' https:\/\/chatgpt\.com/);
  // Invisible and direction-changing characters are removed from nicknames.
  const run={id:crypto.randomUUID(),token:crypto.randomUUID(),nickname:'\u202EAd\u200Bmin\u2066  X',map:'classic',difficulty:'easy',rulesVersion:3};
  assert.equal((await call('/api/runs','POST',run,{'cf-connecting-ip':'198.51.100.7'})).status,201);assert.equal(db.prepare('SELECT nickname FROM game_runs WHERE id=?').get(run.id).nickname,'Admin X');
  assert.equal((await call('/api/runs','POST',{...run,id:crypto.randomUUID(),nickname:'\u200B\u202E'},{'cf-connecting-ip':'198.51.100.7'})).status,400);
  // Public player codes are keyed with a server secret, not a plain hash of the player id.
  const stored=db.prepare('SELECT player_id FROM game_runs WHERE id=?').get(run.id).player_id,listed=(await (await call('/api/admin/runs','GET',undefined,owner)).json()).runs.find(r=>r.id===run.id);
  assert.match(listed.player_code,/^[0-9A-F]{16}$/);assert.notEqual(listed.player_code,require('node:crypto').createHash('sha256').update('snake-player-code:'+stored).digest('hex').slice(0,16).toUpperCase());assert(!('player_id' in listed));
  // The leaderboard is served from a short-lived cache; admin deletion clears it.
  db.prepare("UPDATE game_runs SET finished_at=started_at+1,score=50,verified=1,outcome='completed' WHERE id=?").run(run.id);
  const realNow=Date.now,board=async()=>(await (await call('/api/leaderboard')).json()).scores;assert.equal((await board()).length,1,'verified updates invalidate every cached result');assert.equal((await board())[0].playerCode,listed.player_code);
  db.prepare('UPDATE game_runs SET score=60 WHERE id=?').run(run.id);assert.equal((await board())[0].score,60);
  assert.equal((await call('/api/admin/runs/delete','POST',{ids:[run.id]},owner)).status,200);assert.equal((await board()).length,0);
  // Abandoned runs older than a week are removed; finished and recent rows stay.
  const old=Date.now()-8*86400000,insert=db.prepare('INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('stale','p','t','Old','classic','easy',old,null);insert.run('kept','p','t','Old','classic','easy',old,old+1);
  Date.now=()=>realNow()+2*3600000;
  try{assert.equal((await call('/api/runs','POST',{...run,id:crypto.randomUUID(),nickname:'Fresh'},{'cf-connecting-ip':'198.51.100.8'})).status,201);}finally{Date.now=realNow;}
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_runs WHERE id='stale'").get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_runs WHERE id='kept'").get().n,1);
  // Names stored before the cleaning rule are cleaned when shown; names that become empty are shown as Oyuncu.
  const seedRow=db.prepare("INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at,score,outcome,verified,rate_key) VALUES(?,?,?,?,?,?,?,?,?,?,1,'x')");
  seedRow.run('old-name','old-player','t','‮Eski​ Ad','classic','easy',realNow(),realNow()+1,9000,'completed');seedRow.run('blank-name','blank-player','t','​⁦','classic','easy',realNow(),realNow()+1,8999,'completed');seedRow.run('long-name','long-player','t','Çok Uzun Bir Oyuncu Adı','classic','easy',realNow(),realNow()+1,8998,'completed');
  const named=await board();assert.equal(named[0].name,'Eski Ad');assert.equal(named[1].name,'Oyuncu');assert.equal(named[2].name,'Çok Uzun Bir Oy');
  const adminNames=(await (await call('/api/admin/runs?q=Eski','GET',undefined,owner)).json()).runs;assert.equal(adminNames[0].nickname,'Eski Ad');
  const accountKey='account:'+require('node:crypto').createHash('sha256').update('researcher').digest('hex');db.prepare('INSERT INTO player_profiles(account_id,data,revision) VALUES(?,?,1)').run(accountKey,JSON.stringify({snake_nickname:'‮Saklı​ Ad Uzun Bir İsim'}));
  assert.equal((await (await call('/api/profile','GET',undefined,reporter)).json()).data.snake_nickname,'Saklı Ad Uzun B');
  assert.equal((await call('/api/profile','POST',{accountKey,revision:1,data:{snake_nickname:'Ye​ni‮'}},reporter)).status,200);assert.equal(JSON.parse(db.prepare('SELECT data FROM player_profiles WHERE account_id=?').get(accountKey).data).snake_nickname,'Yeni');
  const longStart={...run,id:crypto.randomUUID(),nickname:'Çok Uzun Bir Oyuncu Adı'};assert.equal((await call('/api/runs','POST',longStart,{'cf-connecting-ip':'198.51.100.10'})).status,201);assert.equal(db.prepare('SELECT nickname FROM game_runs WHERE id=?').get(longStart.id).nickname,'Çok Uzun Bir Oy');
  db.prepare("DELETE FROM game_runs WHERE id IN ('old-name','blank-name','long-name')").run();
  // Guests without a network address share a configurable per-minute bucket with no daily cap; it never blocks others.
  const base=Date.parse('2031-03-05T12:00:00Z'),limited={...env,SHARED_START_LIMIT_PER_MINUTE:'3'};
  const startAs=(headers={})=>worker.fetch(new Request('https://game.example/api/runs',{method:'POST',headers:{Origin:'https://game.example','Content-Type':'application/json',...headers},body:JSON.stringify({...run,id:crypto.randomUUID(),nickname:'Guest'})}),limited);
  Date.now=()=>base;
  for(let i=0;i<3;i++)assert.equal((await startAs()).status,201);assert.equal((await startAs()).status,429);
  assert.equal((await startAs({'oai-authenticated-user-id':'signed-in'})).status,201,'signed-in players are not locked out by guests');
  assert.equal((await startAs({'cf-connecting-ip':'203.0.113.5'})).status,201,'guests with a network address are not locked out');
  const sharedKey=db.prepare("SELECT rate_key FROM game_runs WHERE nickname='Guest' ORDER BY started_at LIMIT 1").get().rate_key,bulk=db.prepare("INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,rate_key) VALUES(?,?,'t','Bulk','classic','easy',?,?)");
  for(let i=0;i<400;i++)bulk.run(crypto.randomUUID(),crypto.randomUUID(),base-3600000,sharedKey);
  Date.now=()=>base+120000;assert.equal((await startAs()).status,201,'no daily cap on the shared bucket');
  const traffic=(await (await worker.fetch(new Request('https://game.example/api/admin/runs',{headers:owner}),limited)).json()).traffic;
  assert.equal(traffic.sharedLimitPerMinute,3);assert.deepEqual(traffic.rejectedToday,{shared:1,network:0});assert.equal(traffic.starts24h,406);assert.equal(traffic.sharedStarts24h,404);assert.equal(traffic.peakPerMinute,400);assert.equal(traffic.sharedPeakPerMinute,400);
  assert.equal((await (await call('/api/admin/runs','GET',undefined,owner)).json()).traffic.sharedLimitPerMinute,120);
  db.prepare("DELETE FROM game_runs WHERE nickname='Bulk'").run();
  // Only high verified scores keep their moves, and only the owner can read them.
  const {createReplayEngine}=await import(pathToFileURL(path.resolve('dist/server/replay.js'))),vectors=[[0,-1],[1,0],[0,1],[-1,0]];
  async function play(target,knownCookie){
   for(let attempt=0;attempt<40;attempt++){
    const game={...run,id:crypto.randomUUID(),token:crypto.randomUUID(),nickname:'Reviewer'},started=await call('/api/runs','POST',game,{'cf-connecting-ip':'198.51.100.'+(20+attempt),...(knownCookie?{cookie:'snake_player='+knownCookie}:{})});assert.equal(started.status,201);
    const cookie=started.headers.get('set-cookie').match(/snake_player=([^;]+)/)[1],engine=createReplayEngine(game.map,game.difficulty,(await started.json()).seed),moves=[];let last=1;
    for(let tick=1;tick<=6000;tick++){
     const state=engine.state();if(state.dead||state.score>=target)break;
     const body=new Set(state.snake.slice(0,-1).map(p=>p.x+','+p.y)),goals=new Set(state.foods.filter(f=>!f.isHarmful).map(f=>f.x+','+f.y)),bad=new Set(state.foods.filter(f=>f.isHarmful).map(f=>f.x+','+f.y));
     const open=(x,y)=>x>=0&&x<20&&y>=0&&y<20&&!body.has(x+','+y),queue=[],seen=new Set();let code;
     for(let c=0;c<4;c++){if(c===(last+2)%4)continue;const x=state.snake[0].x+vectors[c][0],y=state.snake[0].y+vectors[c][1];if(open(x,y)&&!bad.has(x+','+y)){queue.push({x,y,first:c});seen.add(x+','+y);}}
     const fallback=queue[0]?.first;
     while(queue.length){const p=queue.shift();if(goals.has(p.x+','+p.y)){code=p.first;break;}for(const [dx,dy]of vectors){const x=p.x+dx,y=p.y+dy,key=x+','+y;if(open(x,y)&&!bad.has(key)&&!seen.has(key)){seen.add(key);queue.push({x,y,first:p.first});}}}
     code??=fallback??last;if(code!==last)moves.push([tick,code]);last=code;engine.step(code);
    }
    const state=engine.state();if(state.score<target)continue;
    const now=Date.now;Date.now=()=>now()+state.elapsed+1000;
    try{return{game,state,moves,cookie,response:await call('/api/runs/'+game.id+'/finish','POST',{token:game.token,ticks:state.ticks,moves,score:state.score,outcome:state.dead?'completed':'restarted'},{cookie:'snake_player='+cookie})};}finally{Date.now=now;}
   }
   throw new Error('No simulated game reached '+target+' points');
  }
  Date.now=()=>base+4*3600000;
  const low=await play(20);assert.equal(low.response.status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays').get().n,0,'ordinary scores are not recorded');
  Date.now=()=>base+5*3600000;
  const high=await play(100);assert.equal(high.response.status,200);
  const record=db.prepare('SELECT * FROM run_replays WHERE run_id=?').get(high.game.id);assert.equal(record.score,high.state.score);assert.deepEqual(JSON.parse(record.moves),high.moves);assert(record.bytes<=131072);
  const replayRoute='/api/admin/runs/'+high.game.id+'/replay';assert.equal((await call(replayRoute)).status,401);assert.equal((await call(replayRoute,'GET',undefined,reporter)).status,403);
  const review=await (await call(replayRoute,'GET',undefined,owner)).json();assert.deepEqual(review.moves,high.moves);assert.equal(review.ticks,high.state.ticks);assert.equal(typeof review.seed,'number');assert(!('player_id' in review));
  assert.equal((await (await call('/api/admin/runs?q=Reviewer','GET',undefined,owner)).json()).runs.find(r=>r.id===high.game.id).has_replay,true);
  // Review signals are computed on read, never expose the player id, and never change the stored result.
  const sig=review.signals,row=db.prepare('SELECT player_id,started_at,finished_at,duration_seconds,score FROM game_runs WHERE id=?').get(high.game.id);
  assert.equal(sig.ticks,high.state.ticks);assert.equal(sig.directionChanges,high.moves.length);assert.equal(sig.directionChangesPer100Ticks,Math.round(high.moves.length*100/high.state.ticks*10)/10);assert.equal(sig.scorePer100Ticks,Math.round(high.state.score*100/high.state.ticks*10)/10);
  assert.equal(sig.activeSeconds,row.duration_seconds);assert.equal(sig.activeSeconds,Math.floor(high.state.elapsed/1000));assert.equal(sig.wallSeconds,Math.round((row.finished_at-row.started_at)/1000));assert.equal(sig.pausedSeconds,Math.max(0,sig.wallSeconds-sig.activeSeconds));
  assert.equal(sig.startsBeforeLastHour,0);assert.equal(sig.abandonedBeforeLastHour,0);assert.deepEqual(sig.notes,[],'an ordinary simulated game raises no notes');assert(!JSON.stringify(review).includes(row.player_id));assert.equal(db.prepare('SELECT score FROM game_runs WHERE id=?').get(high.game.id).score,row.score);
  // Abandoned starts shortly before this run and long pauses produce notes; runs outside the hour are not counted.
  const prior=db.prepare("INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at,outcome) VALUES(?,?,'t','Prior','classic','easy',?,?,?)");
  for(let i=0;i<3;i++)prior.run('prior-open-'+i,row.player_id,row.started_at-60000*(i+1),null,null);for(let i=0;i<3;i++)prior.run('prior-restart-'+i,row.player_id,row.started_at-60000*(i+10),row.started_at-60000*(i+10)+5000,'restarted');
  for(let i=0;i<2;i++)prior.run('prior-done-'+i,row.player_id,row.started_at-60000*(i+20),row.started_at-60000*(i+20)+5000,'completed');prior.run('prior-old',row.player_id,row.started_at-3600000-1,null,null);prior.run('prior-later',row.player_id,row.started_at+1,null,null);prior.run('prior-other','someone-else',row.started_at-1000,null,null);
  db.prepare('UPDATE game_runs SET finished_at=finished_at+600000 WHERE id=?').run(high.game.id);
  const flagged=(await (await call(replayRoute,'GET',undefined,owner)).json()).signals;assert.equal(flagged.startsBeforeLastHour,8);assert.equal(flagged.abandonedBeforeLastHour,6);assert.equal(flagged.pausedSeconds,sig.pausedSeconds+600);
  assert.equal(flagged.notes.length,2);assert(flagged.notes.some(n=>n.includes('duraklama')));assert(flagged.notes.some(n=>n.includes('8 oyun')&&n.includes('6 tanesi')));
  const saved=db.prepare('SELECT score,ticks,moves FROM run_replays WHERE run_id=?').get(high.game.id),alternating=Array.from({length:150},(_,i)=>[i+1,i%2?1:0]);
  db.prepare('UPDATE run_replays SET score=1000,ticks=300,moves=? WHERE run_id=?').run(JSON.stringify(alternating),high.game.id);
  const extreme=(await (await call(replayRoute,'GET',undefined,owner)).json()).signals;assert.equal(extreme.directionChanges,150);assert.equal(extreme.scorePer100Ticks,333.3);assert(extreme.notes.some(n=>n.includes('Yön değişimi')));assert(extreme.notes.some(n=>n.includes('Adım başına skor')));
  db.prepare('UPDATE run_replays SET score=?,ticks=?,moves=? WHERE run_id=?').run(saved.score,saved.ticks,saved.moves,high.game.id);
  db.prepare("DELETE FROM game_runs WHERE id LIKE 'prior-%'").run();db.prepare('UPDATE game_runs SET finished_at=finished_at-600000 WHERE id=?').run(high.game.id);
  // Repeating the finish request does not store the moves again.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays WHERE run_id=?').get(high.game.id).n,1);
  // At most fifty records are kept, the lowest score goes first, and oversized move lists are not stored.
  const fill=db.prepare('INSERT INTO run_replays(run_id,score,ticks,moves,bytes,stored_at) VALUES(?,?,?,?,?,?)');for(let i=0;i<49;i++)fill.run('filler-'+i,100000+i,1,'[]',2,Date.now());
  Date.now=()=>base+6*3600000;const next=await play(high.state.score+10);assert.equal(next.response.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays').get().n,50);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays WHERE run_id=?').get(high.game.id).n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays WHERE run_id=?').get(next.game.id).n,1);
  assert.equal((await call('/api/admin/runs/delete','POST',{ids:[next.game.id]},owner)).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays WHERE run_id=?').get(next.game.id).n,0,'deleting a run deletes its moves');
  // Records and rejection counters older than thirty days are removed by the hourly housekeeping.
  Date.now=()=>base+31*86400000;assert.equal((await call('/api/runs','POST',{...run,id:crypto.randomUUID(),nickname:'Later'},{'cf-connecting-ip':'198.51.100.9'})).status,201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM run_replays').get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM security_state WHERE key LIKE 'start_rejected:%'").get().n,0);
  // Progress is cached briefly per player; a finished run replaces the cached value at once and the finish response is always fresh.
  Date.now=()=>base+40*86400000;
  const first=await play(20),progressOf=async cookie=>JSON.parse((await (await call('/','GET',undefined,{cookie:'snake_player='+cookie})).text()).match(/const guestProgressBootstrap = (.*?);\n/)[1]),key='snake_hs_'+first.game.difficulty+'_'+first.game.map;
  assert.equal((await progressOf(first.cookie))[key],String(first.state.score));queries=0;assert.equal((await progressOf(first.cookie))[key],String(first.state.score));assert.equal(queries,0,'a repeated home page load for the same guest does not repeat the progress queries');
  const second=await play(first.state.score+8,first.cookie);assert.equal(second.response.status,200);assert(second.state.score>first.state.score);const finished=await second.response.json();assert.equal(finished.progress[key],String(second.state.score));
  assert.equal((await progressOf(first.cookie))[key],String(second.state.score),'after a finish the next read reflects the new run');
  Date.now=realNow;
  const broken=await worker.fetch(new Request('https://game.example/api/profile',{headers:owner}),{TRUST_PLATFORM_IDENTITY:'1'});assert.equal(broken.status,503);assert(broken.headers.has('content-security-policy'));assert(!JSON.stringify(await broken.json()).includes('Database'));
  console.log('PASS: security headers on HTML/JSON/errors/assets/HEAD, nonce rotation, HTTPS redirect, security.txt, private report delivery, authorization, rate limits, admin framing, nickname cleaning (new and stored names), keyed player codes, leaderboard cache, stale-run cleanup, shared guest bucket and traffic summary, bounded move records and housekeeping.');
 }finally{db.close();}
})().catch(error=>{console.error(error);process.exit(1);});

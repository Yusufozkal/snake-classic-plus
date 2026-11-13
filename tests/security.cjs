const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
(async()=>{
 const worker=(await import(pathToFileURL(path.resolve('dist/server/index.js')))).default;
 const db=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const env={ADMIN_EMAIL:'owner@example.com',DB:{prepare(sql){const statement=db.prepare(sql);let values=[];return{bind(...v){values=v;return this},async first(){return statement.get(...values)||null},async all(){return{results:statement.all(...values)}},async run(){return statement.run(...values)}}}}};
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
  const realNow=Date.now,board=async()=>(await (await call('/api/leaderboard')).json()).scores;assert.equal((await board()).length,0,'earlier empty result is still cached');Date.now=()=>realNow()+60000;assert.equal((await board()).length,1);assert.equal((await board())[0].playerCode,listed.player_code);
  db.prepare('UPDATE game_runs SET score=60 WHERE id=?').run(run.id);assert.equal((await board())[0].score,50);
  assert.equal((await call('/api/admin/runs/delete','POST',{ids:[run.id]},owner)).status,200);assert.equal((await board()).length,0);
  // Abandoned runs older than a week are removed; finished and recent rows stay.
  const old=Date.now()-8*86400000,insert=db.prepare('INSERT INTO game_runs(id,player_id,token_hash,nickname,map,difficulty,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('stale','p','t','Old','classic','easy',old,null);insert.run('kept','p','t','Old','classic','easy',old,old+1);
  Date.now=()=>realNow()+2*3600000;
  try{assert.equal((await call('/api/runs','POST',{...run,id:crypto.randomUUID(),nickname:'Fresh'},{'cf-connecting-ip':'198.51.100.8'})).status,201);}finally{Date.now=realNow;}
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_runs WHERE id='stale'").get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_runs WHERE id='kept'").get().n,1);
  const broken=await worker.fetch(new Request('https://game.example/api/profile',{headers:owner}),{});assert.equal(broken.status,503);assert(broken.headers.has('content-security-policy'));assert(!JSON.stringify(await broken.json()).includes('Database'));
  console.log('PASS: security headers on HTML/JSON/errors/assets/HEAD, nonce rotation, HTTPS redirect, security.txt, private report delivery, authorization, rate limits, admin framing, nickname cleaning, keyed player codes, leaderboard cache and stale-run cleanup.');
 }finally{db.close();}
})().catch(error=>{console.error(error);process.exit(1);});

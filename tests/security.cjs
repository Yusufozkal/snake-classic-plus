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
   assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
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
  const broken=await worker.fetch(new Request('https://game.example/api/profile',{headers:owner}),{});assert.equal(broken.status,503);assert(broken.headers.has('content-security-policy'));assert(!JSON.stringify(await broken.json()).includes('Database'));
  console.log('PASS: security headers on HTML/JSON/errors/assets/HEAD, nonce rotation, HTTPS redirect, security.txt, private report delivery, authorization and rate limits.');
 }finally{db.close();}
})().catch(error=>{console.error(error);process.exit(1);});

import { database } from './database.js';
import { gameHTML, adminHTML, securityHTML, securityAdminHTML, favicon } from './assets.js';

const maps = new Set(['classic','nowall','wide','box','maze','cross']);
const difficulties = new Set(['easy','medium','hard']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const baseHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
function json(body, status=200, headers={}) {return new Response(JSON.stringify(body),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...headers}});}
function contentPolicy(nonce){return ["default-src 'none'",nonce?`script-src 'nonce-${nonce}'`:"script-src 'none'","script-src-attr 'none'","style-src 'self' 'unsafe-inline'",nonce?`style-src-elem 'nonce-${nonce}'`:"style-src-elem 'none'","style-src-attr 'unsafe-inline'","img-src 'self' data:","connect-src 'self'","font-src 'self'","media-src 'self'","object-src 'none'","base-uri 'none'","form-action 'self'","frame-ancestors 'self' https://chatgpt.com https://chat.openai.com","upgrade-insecure-requests"].join('; ');}
function html(body,status=200) {
  const nonce=crypto.randomUUID().replaceAll('-','');
  const markup=body.replace(/<(script|style)(?=[\s>])/gi,`<$1 nonce="${nonce}"`);
  return new Response(markup,{status,headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':contentPolicy(nonce)}});
}
function secureResponse(response,request){
  const headers=new Headers(response.headers);
  for(const name of ['Server','X-Powered-By','X-AspNet-Version','X-AspNetMvc-Version','X-Generator'])headers.delete(name);
  if(!headers.has('Content-Security-Policy'))headers.set('Content-Security-Policy',contentPolicy());
  if(new URL(request.url).protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
}
function owner(request,env) {
  return Boolean(env.ADMIN_EMAIL && request.headers.get('oai-authenticated-user-id') && request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.ADMIN_EMAIL.toLowerCase());
}
async function body(request,limit=2048) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(new Error('JSON gerekli.'),{status:415});
  if(Number(request.headers.get('content-length'))>limit) throw Object.assign(new Error('İstek çok büyük.'),{status:413});
  const reader=request.body?.getReader();let bytes=0,chunks=[];
  if(!reader)throw Object.assign(new Error('İstek boş.'),{status:400});
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw Object.assign(new Error('İstek çok büyük.'),{status:413});}chunks.push(value);}
  const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  try {const value=JSON.parse(new TextDecoder().decode(data));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw Object.assign(new Error('Geçersiz istek.'),{status:400});}
}
async function hash(value) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function bad(message,status=400){return json({error:message},status);}
const preferenceKeys=/^snake_(nickname|difficulty|map|skin|cosmetic|sound_enabled|countdown_enabled|touch_sensitivity|reduce_motion|tutorial_choice_v1)$/;
function guestIdentity(request){const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)snake_player=([^;]+)/)?.[1];return uuid.test(cookie||'')?cookie:null;}
function dayString(time=Date.now()){return new Date(time).toISOString().slice(0,10);}
async function networkRateKey(request,db,account){
  // Cloudflare supplies this header; never trust X-Forwarded-For or the player cookie.
  let ip=request.headers.get('cf-connecting-ip')||'';
  if(ip.includes(':')){try{const normalized=new URL('http://['+ip+']/').hostname.replace(/[\[\]]/g,''),halves=normalized.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];const parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;if(parts.length!==8)throw Error();ip=parts.slice(0,4).map(p=>p.padStart(4,'0')).join(':');}catch{ip='';}}
  else if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)||ip.split('.').some(p=>Number(p)>255))ip='';
  const source=ip||account||'guest-network-unavailable';
  await db.prepare("INSERT OR IGNORE INTO security_state (key,value) VALUES ('rate_secret',?)").bind(crypto.randomUUID()+crypto.randomUUID()).run();
  const salt=await db.prepare("SELECT value FROM security_state WHERE key='rate_secret'").first();
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(salt.value),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(source)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function questsForDay(date){const pool=[...QUEST_POOL],random=seededRandom(Number(date.replaceAll('-','')));for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,3);}
async function readProgress(env,player){
  const db=database(env),qsum=new Set(['q_apples','q_powerups','q_confuse_eat','q_shield_blocks']);
  const aggregate=await db.prepare(`SELECT COALESCE(SUM(CASE WHEN outcome='completed' THEN score ELSE 0 END),0) AS xp, COALESCE(SUM(json_extract(rewards,'$.magnets')),0) AS magnets, COALESCE(SUM(json_extract(rewards,'$.shields')),0) AS shields, ${ACHIEVEMENTS.map(a=>`COALESCE(MAX(json_extract(rewards,'$.achievements.${a.id}')),0) AS ${a.id}`).join(',')} FROM game_runs WHERE player_id=? AND verified=1`).bind(player||'').first();
  const modes=await db.prepare('SELECT map,difficulty,MAX(score) AS score FROM game_runs WHERE player_id=? AND verified=1 GROUP BY map,difficulty').bind(player||'').all();
  const days=await db.prepare(`SELECT quest_date, ${QUEST_POOL.map(q=>`COALESCE(${qsum.has(q.id)?'SUM':'MAX'}(json_extract(rewards,'$.quests.${q.id}')),0) AS ${q.id}`).join(',')} FROM game_runs WHERE player_id=? AND verified=1 GROUP BY quest_date`).bind(player||'').all();
  const playedMaps=[...new Set(modes.results.map(r=>r.map))],unlocked={};let xp=Number(aggregate.xp);
  for(const ach of ACHIEVEMENTS){const won=ach.id==='explorer'?playedMaps.length>=6:ach.id==='magnet_master'?aggregate.magnets>=3:ach.id==='shield_hero'?aggregate.shields>=3:aggregate[ach.id];if(won){unlocked[ach.id]=1;xp+=ach.xp;}}
  for(const day of days.results)for(const quest of questsForDay(day.quest_date))if(day[quest.id]>=quest.target)xp+=quest.xp;
  const today=dayString(),current=days.results.find(d=>d.quest_date===today)||{},daily=questsForDay(today).map(q=>({id:q.id,progress:Math.min(q.target,current[q.id]||0),completed:(current[q.id]||0)>=q.target}));
  const data={snake_player_xp:String(xp),snake_achievements:JSON.stringify(unlocked),snake_stats:JSON.stringify({playedMaps,magnetsUsed:Number(aggregate.magnets),shieldBlocks:Number(aggregate.shields)}),snake_quest_date:today,snake_daily_quests:JSON.stringify(daily)};
  for(const map of maps)for(const diff of difficulties)data[`snake_hs_${diff}_${map}`]=String(modes.results.find(r=>r.map===map&&r.difficulty===diff)?.score||0);
  return data;
}
async function start(request,env) {
  const input=await body(request);
  if(Object.hasOwn(input,'accountKey')&&input.accountKey!==await accountId(request))return bad('Açık hesap değişti. Sayfayı yenile.',409);
  const nickname=typeof input.nickname==='string'?input.nickname.trim():'';
  if(input.skin!==undefined&&!['blue','green','red','purple','gold','rainbow'].includes(input.skin)||input.cosmetic!==undefined&&!['none','crown','sunglasses','tophat','cap','bow'].includes(input.cosmetic))return bad('Görünüm seçimi geçersiz.');
  if(!nickname||nickname.length>15||/[\u0000-\u001f\u007f]/.test(nickname)||!maps.has(input.map)||!difficulties.has(input.difficulty)||!uuid.test(input.id||'')||!uuid.test(input.token||''))return bad('Oyuncu adı veya oyun ayarları geçersiz.');
  const db=database(env),now=Date.now(),tokenHash=await hash(input.token);
  const account=await accountId(request),guestId=guestIdentity(request)||crypto.randomUUID(),playerId=account||guestId;
  const responseFor=run=>json({id:input.id,seed:run.seed,rulesVersion:run.rules_version,maxTicks:MAX_REPLAY_TICKS},201,{'Set-Cookie':`snake_player=${run.player_id.startsWith('account:')?guestId:run.player_id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`});
  const existing=await db.prepare('SELECT * FROM game_runs WHERE id=?').bind(input.id).first();
  if(existing){if(existing.token_hash!==tokenHash||existing.map!==input.map||existing.difficulty!==input.difficulty||(existing.player_id.startsWith('account:')?existing.player_id!==account:!!account))return bad('Oyun kimliği kullanımda.',409);if(![1,2,RULES_VERSION].includes(existing.rules_version))return bad('Eski oyun kaydı. Yeni bir oyun başlat.',409);return responseFor(existing);}
  if(input.rulesVersion!==RULES_VERSION)return bad('Oyun güncellendi. Sayfayı yenileyip yeni bir oyun başlat.',409);
  const rateKey=await networkRateKey(request,db,account),seed=crypto.getRandomValues(new Uint32Array(1))[0],cosmetic=input.skin&&input.skin!=='blue'||input.cosmetic&&input.cosmetic!=='none'?'styled':'plain';
  const result=await db.prepare('INSERT OR IGNORE INTO game_runs (id,player_id,token_hash,nickname,map,difficulty,started_at,seed,rules_version,rate_key,cosmetic,quest_date) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM game_runs WHERE rate_key=? AND started_at>?)<12 AND (SELECT COUNT(*) FROM game_runs WHERE player_id=? AND started_at>?)<12 AND (SELECT COUNT(*) FROM game_runs WHERE rate_key=? AND started_at>?)<300').bind(input.id,playerId,tokenHash,nickname,input.map,input.difficulty,now,seed,RULES_VERSION,rateKey,cosmetic,dayString(now),rateKey,now-60000,playerId,now-60000,rateKey,now-86400000).run();
  const stored=await db.prepare('SELECT * FROM game_runs WHERE id=?').bind(input.id).first();
  if(!stored)return bad('Yeni oyun sınırına ulaşıldı. Biraz sonra tekrar dene veya antrenman modunu kullan.',429);
  if(stored.token_hash!==tokenHash)return bad('Oyun kimliği kullanımda.',409);
  return responseFor(stored);
}
async function finish(request,env,id) {
  const input=await body(request,524288);
  if(!uuid.test(id)||!uuid.test(input.token||'')||!['completed','restarted'].includes(input.outcome))return bad('Skor kaydı geçersiz.');
  const db=database(env),run=await db.prepare('SELECT * FROM game_runs WHERE id = ?').bind(id).first();
  if(!run||run.token_hash!==await hash(input.token))return bad('Oyun kaydı bulunamadı.',404);
  const account=await accountId(request);if(run.player_id.startsWith('account:')?run.player_id!==account:!!account)return bad('Bu oyun başka bir hesaba ait.',403);
  const proofHash=await hash(JSON.stringify({ticks:input.ticks,moves:input.moves,outcome:input.outcome,score:input.score}));
  if(run.finished_at!==null){if(!run.verified||run.proof_hash!==proofHash)return bad('Bu oyun zaten kaydedildi.',409);return json({saved:true,score:run.score,progress:await readProgress(env,run.player_id)});}
  const attempt=await db.prepare('UPDATE game_runs SET proof_attempts=proof_attempts+1 WHERE id=? AND proof_attempts<5 AND finished_at IS NULL').bind(id).run();
  if(!Number(attempt.meta?.changes??attempt.changes))return bad('Bu oyunun doğrulama sınırına ulaşıldı. Yeni bir oyun başlat.',429);
  const now=Date.now();let replay;try{replay=(run.rules_version===1?replayV1.verifyReplay:run.rules_version===2?replayV2.verifyReplay:verifyReplay)(run,input,now);}catch(error){return bad(error.message);}
  const rewards={...replay.rewards,achievements:Object.fromEntries(replay.rewards.achievements.map(k=>[k,1]))};if(run.cosmetic==='styled')rewards.achievements.fashion_icon=1;
  await db.prepare('UPDATE game_runs SET finished_at=?,score=?,duration_seconds=?,outcome=?,verified=1,proof_hash=?,rewards=? WHERE id=? AND finished_at IS NULL').bind(now,replay.score,Math.floor(replay.elapsed/1000),input.outcome,proofHash,JSON.stringify(rewards),id).run();
  const saved=await db.prepare('SELECT proof_hash,score FROM game_runs WHERE id=?').bind(id).first();if(saved.proof_hash!==proofHash)return bad('Bu oyun zaten kaydedildi.',409);
  return json({saved:true,score:saved.score,progress:await readProgress(env,run.player_id)});
}
async function admin(request,env,url){
  if(!owner(request,env))return bad('Bu ekran yalnızca site sahibine açıktır.',request.headers.get('oai-authenticated-user-id')?403:401);
  const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page'))||1));
  const search=(url.searchParams.get('q')||'').trim().slice(0,50);
  const map=url.searchParams.get('map')||'';
  if(map&&!maps.has(map))return bad('Geçersiz harita.');
  const where=[],values=[];
  if(search){where.push("nickname LIKE ? ESCAPE '\\'");values.push('%'+search.replace(/[\\%_]/g,'\\$&')+'%');}
  if(map){where.push('map = ?');values.push(map);}
  const clause=where.length?' WHERE '+where.join(' AND '):'';
  const db=database(env);
  const [summary,count,rows]=await Promise.all([
    db.prepare("SELECT COUNT(*) AS total_games, COUNT(DISTINCT player_id) AS players, COUNT(finished_at) AS finished_games, COALESCE(MAX(CASE WHEN verified=1 THEN score END),0) AS best_score FROM game_runs").first(),
    db.prepare('SELECT COUNT(*) AS count FROM game_runs'+clause).bind(...values).first(),
    db.prepare('SELECT id, player_id, nickname, map, difficulty, started_at, finished_at, score, duration_seconds, outcome, verified FROM game_runs'+clause+' ORDER BY started_at DESC, id DESC LIMIT 50 OFFSET ?').bind(...values,(page-1)*50).all(),
  ]);
  const runs=await Promise.all(rows.results.map(async ({player_id,...run})=>({...run,player_code:(await hash('snake-player-code:'+player_id)).slice(0,16).toUpperCase()})));
  return json({summary,total:count.count,page,pageSize:50,runs});
}
async function accountId(request){
  const id=request.headers.get('oai-authenticated-user-id');
  return id?'account:'+await hash(id):null;
}
async function readProfile(request,env){
  const id=await accountId(request);if(!id)return null;
  const row=await database(env).prepare('SELECT data, revision FROM player_profiles WHERE account_id = ?').bind(id).first();
  const preferences=Object.fromEntries(Object.entries(row?JSON.parse(row.data):{}).filter(([key])=>preferenceKeys.test(key)));
  return {key:id,data:{...preferences,...await readProgress(env,id)},revision:row?.revision||0};
}
async function saveProfile(request,env){
  const id=await accountId(request);if(!id)return bad('Hesabına giriş yapmalısın.',401);
  const input=await body(request,65536),data=input.data;
  if(input.accountKey!==id)return bad('Açık hesap değişti. Sayfayı yenile.',409);
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.entries(data).some(([k,v])=>!preferenceKeys.test(k)||typeof v!=='string'||v.length>200)||!Number.isSafeInteger(input.revision)||input.revision<0)return bad('Yalnızca ad ve oyun tercihleri kaydedilebilir. XP, başarımlar ve skor sunucuda hesaplanır.');
  const db=database(env);
  const existing=await db.prepare('SELECT data FROM player_profiles WHERE account_id=?').bind(id).first();
  const preserved={...(existing?JSON.parse(existing.data):{}),...data};
  const result=input.revision===0
    ? await db.prepare('INSERT OR IGNORE INTO player_profiles (account_id,data,revision) VALUES (?,?,1)').bind(id,JSON.stringify(preserved)).run()
    : await db.prepare('UPDATE player_profiles SET data=?, revision=revision+1 WHERE account_id=? AND revision=?').bind(JSON.stringify(preserved),id,input.revision).run();
  if(!Number(result.meta?.changes??result.changes))return bad('Kayıt başka bir cihazda değişti. Sayfayı yenileyerek güncel kaydı yükle.',409);
  return json({revision:input.revision+1});
}
async function leaderboard(env){
  const rows=await database(env).prepare('SELECT player_id, nickname, score, map, difficulty, finished_at FROM (SELECT id, player_id, nickname, score, map, difficulty, finished_at, ROW_NUMBER() OVER (PARTITION BY player_id, map, difficulty ORDER BY score DESC, finished_at ASC, id ASC) AS position FROM game_runs WHERE verified=1 AND finished_at IS NOT NULL AND score > 0) WHERE position = 1 ORDER BY score DESC, finished_at ASC, id ASC LIMIT 20').all();
  const scores=await Promise.all(rows.results.map(async r=>({name:r.nickname,score:r.score,map:r.map,diff:r.difficulty,date:new Date(r.finished_at).toLocaleDateString('tr-TR'),playerCode:(await hash('snake-player-code:'+r.player_id)).slice(0,16).toUpperCase()})));
  return json({scores});
}
async function deleteRuns(request,env){
  if(!owner(request,env))return bad('Bu işlem yalnızca site sahibine açıktır.',request.headers.get('oai-authenticated-user-id')?403:401);
  const input=await body(request);
  if(!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>50||input.ids.some(id=>typeof id!=='string'||!uuid.test(id)))return bad('1 ile 50 arasında geçerli kayıt seçmelisin.');
  const ids=[...new Set(input.ids)];
  const result=await database(env).prepare('DELETE FROM game_runs WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).run();
  return json({deleted:Number(result.meta?.changes??result.changes??0)});
}
async function securityReport(request,env){
  const reporter=await accountId(request);if(!reporter)return bad('Bildirim göndermek için giriş yapmalısın.',401);
  const input=await body(request,16384);
  if(!uuid.test(input.id||'')||typeof input.details!=='string'||input.details.trim().length<20||input.details.length>8000||typeof input.contact!=='string'||input.contact.length>200)return bad('Lütfen 20–8000 karakterlik bir açıklama ve geçerli iletişim bilgisi gir.');
  const db=database(env),now=Date.now();
  const existing=await db.prepare('SELECT reporter_key FROM security_reports WHERE id=?').bind(input.id).first();
  if(existing)return existing.reporter_key===reporter?json({received:true}):bad('Bildirim kimliği kullanımda.',409);
  const result=await db.prepare('INSERT OR IGNORE INTO security_reports (id,reporter_key,contact,details,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM security_reports WHERE reporter_key=? AND created_at>?) < 3').bind(input.id,reporter,input.contact.trim(),input.details.trim(),now,reporter,now-86400000).run();
  if(!Number(result.meta?.changes??result.changes))return bad('24 saatte en fazla 3 bildirim gönderebilirsin. Daha sonra tekrar dene.',429);
  return json({received:true},201);
}
const app = {
 async fetch(request,env){
  const url=new URL(request.url);
  try{
   if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return bad('İstek kaynağı doğrulanamadı.',403);
   if(request.method==='GET'&&['/.well-known/security.txt','/security.txt'].includes(url.pathname))return new Response(`Contact: ${url.origin}/security\nExpires: 2027-03-11T00:00:00Z\nPreferred-Languages: tr, en\nCanonical: ${url.origin}/.well-known/security.txt\nPolicy: ${url.origin}/security\n`,{headers:{...baseHeaders,'Content-Type':'text/plain; charset=utf-8'}});
   if(request.method==='GET'&&url.pathname==='/security')return html(securityHTML.replace('const signedIn = false;',`const signedIn = ${!!request.headers.get('oai-authenticated-user-id')};`));
   if(request.method==='POST'&&url.pathname==='/api/security-reports')return await securityReport(request,env);
   if(['/admin/security','/api/admin/security-reports'].includes(url.pathname)&&request.method==='GET'){
    if(!owner(request,env))return bad('Bu ekran yalnızca site sahibine açıktır.',request.headers.get('oai-authenticated-user-id')?403:401);
    if(url.pathname==='/admin/security')return html(securityAdminHTML);
    const rows=await database(env).prepare('SELECT id,contact,details,created_at FROM security_reports ORDER BY created_at DESC, id DESC LIMIT 50').all();
    return json({reports:rows.results});
   }
   if(request.method==='GET'&&url.pathname==='/'){
    const profile=await readProfile(request,env);
    const guestProgress=profile?null:await readProgress(env,guestIdentity(request));
    return html(gameHTML.replace('const accountBootstrap = null;',()=> 'const accountBootstrap = '+JSON.stringify(profile).replace(/</g,'\\u003c')+';').replace('const guestProgressBootstrap = null;',()=> 'const guestProgressBootstrap = '+JSON.stringify(guestProgress).replace(/</g,'\\u003c')+';'));
   }
   if(request.method==='GET'&&url.pathname==='/api/profile'){const profile=await readProfile(request,env);return profile?json(profile):bad('Hesabına giriş yapmalısın.',401);}
   if(request.method==='POST'&&url.pathname==='/api/profile')return await saveProfile(request,env);
   if(request.method==='GET'&&url.pathname==='/favicon.svg')return new Response(favicon,{headers:{'Content-Type':'image/svg+xml'}});
   if(request.method==='GET'&&url.pathname==='/admin'){
    if(!request.headers.get('oai-authenticated-user-id'))return html('<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width"><title>Yönetici girişi</title><body style="background:#090d16;color:#f8fafc;font:18px system-ui;padding:48px"><h1>Oyun kayıtları</h1><p>Bu sayfayı yalnızca site sahibi görüntüleyebilir.</p><a style="color:#38bdf8" target="_top" href="/signin-with-chatgpt?return_to=%2Fadmin">ChatGPT ile giriş yap</a></body></html>');
    if(!owner(request,env))return html('<!doctype html><html lang="tr"><title>Erişim yok</title><p>Bu ekran yalnızca site sahibine açıktır.</p><a href="/">Oyuna dön</a></html>',403);
    return html(adminHTML);
   }
   if(request.method==='GET'&&url.pathname==='/api/admin/runs')return await admin(request,env,url);
   if(request.method==='GET'&&url.pathname==='/api/leaderboard')return await leaderboard(env);
   if(request.method==='POST'&&url.pathname==='/api/admin/runs/delete')return await deleteRuns(request,env);
   if(request.method==='POST'&&url.pathname==='/api/runs')return await start(request,env);
   const match=url.pathname.match(/^\/api\/runs\/([^/]+)\/finish$/);
   if(request.method==='POST'&&match)return await finish(request,env,match[1]);
   return bad('Sayfa bulunamadı.',404);
  }catch(error){
   if(error.status)return bad(error.message,error.status);
   console.error('Game database request failed',error?.message);
   return bad('Kayıt hizmetine şu anda ulaşılamıyor. Lütfen tekrar dene.',503);
  }
 }
};
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){
    url.protocol='https:';return secureResponse(new Response(null,{status:308,headers:{Location:url.href}}),request);
  }
  const routed=request.method==='HEAD'?new Request(request,{method:'GET'}):request;
  return secureResponse(await app.fetch(routed,env),request);
}};

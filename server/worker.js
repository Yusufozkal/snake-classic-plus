import { database } from './database.js';
import { gameHTML, adminHTML, securityHTML, securityAdminHTML, favicon } from './assets.js';

const maps = new Set(['classic','nowall','wide','box','maze','cross']);
const difficulties = new Set(['easy','medium','hard']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const baseHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
function json(body, status=200, headers={}) {return new Response(JSON.stringify(body),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...headers}});}
function contentPolicy(nonce,embeddable=true){return ["default-src 'none'",nonce?`script-src 'nonce-${nonce}'`:"script-src 'none'","script-src-attr 'none'","style-src 'self' 'unsafe-inline'",nonce?`style-src-elem 'nonce-${nonce}'`:"style-src-elem 'none'","style-src-attr 'unsafe-inline'","img-src 'self' data:","connect-src 'self'","font-src 'self'","media-src 'self'","object-src 'none'","base-uri 'none'","form-action 'self'",embeddable?"frame-ancestors 'self' https://chatgpt.com https://chat.openai.com":"frame-ancestors 'self'","upgrade-insecure-requests"].join('; ');}
function html(body,status=200,embeddable=true) {
  const nonce=crypto.randomUUID().replaceAll('-','');
  const markup=body.replace(/<(script|style)(?=[\s>])/gi,`<$1 nonce="${nonce}"`);
  return new Response(markup,{status,headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':contentPolicy(nonce,embeddable)}});
}
function secureResponse(response,request){
  const headers=new Headers(response.headers);
  for(const name of ['Server','X-Powered-By','X-AspNet-Version','X-AspNetMvc-Version','X-Generator'])headers.delete(name);
  if(!headers.has('Content-Security-Policy'))headers.set('Content-Security-Policy',contentPolicy());
  if(new URL(request.url).protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
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
async function networkRateKey(request,env,db,account){
  // Opt in only to a single-IP header overwritten by the deployment's trusted proxy.
  const header=env.TRUSTED_IP_HEADER;
  let ip=['cf-connecting-ip','true-client-ip','x-real-ip'].includes(header)?request.headers.get(header)||'':'';
  if(ip.includes(':')){try{const normalized=new URL('http://['+ip+']/').hostname.replace(/[\[\]]/g,''),halves=normalized.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];const parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;if(parts.length!==8)throw Error();ip=parts.slice(0,4).map(p=>p.padStart(4,'0')).join(':');}catch{ip='';}}
  else if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)||ip.split('.').some(p=>Number(p)>255))ip='';
  else ip=ip.split('.').map(Number).join('.');
  const source=ip||account||SHARED_NETWORK;
  return {key:await keyedHash(await signingKey(db,'rate_secret'),source),shared:!ip&&!account};
}
// Server-side secrets are created once and stay in the database; they are never sent to clients.
const secretNames=new Set(['rate_secret','player_code_secret']);
async function signingKey(db,name){
  if(!secretNames.has(name))throw new Error('Unknown secret');
  await db.prepare("INSERT OR IGNORE INTO security_state (key,value) VALUES (?,?)").bind(name,crypto.randomUUID()+crypto.randomUUID()).run();
  const secret=await db.prepare("SELECT value FROM security_state WHERE key=?").bind(name).first();
  return crypto.subtle.importKey('raw',new TextEncoder().encode(secret.value),{name:'HMAC',hash:'SHA-256'},false,['sign']);
}
async function keyedHash(key,value){
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// Keyed, so a known account or guest identifier cannot be matched to a public code offline.
async function playerCode(key,playerId){return (await keyedHash(key,playerId)).slice(0,16).toUpperCase();}
// Invisible, direction-changing and control characters allow look-alike names. The same
// cleaning is applied when a name is stored and when an older stored name is shown.
// Over-long names are cut to 15 UTF-16 units without splitting a character.
function cleanNickname(value){
  if(typeof value!=='string')return '';
  const cleaned=value.slice(0,200).normalize('NFKC').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/gu,'').replace(/\s+/g,' ').trim();
  let name='';for(const character of cleaned){if(name.length+character.length>15)break;name+=character;}
  return name.trim();
}
function shownNickname(value){return cleanNickname(value)||'Oyuncu';}
const SHARED_NETWORK='guest-network-unavailable',DEFAULT_SHARED_START_LIMIT=120;
const REVIEW_MIN_SCORE=100,REVIEW_MAX_ROWS=50,REVIEW_MAX_BYTES=131072,REVIEW_RETENTION=30*86400000,COUNTER_RETENTION=30*86400000;
const SHARED_ONLY_MIN_STARTS=20,LEADERBOARD_TTL=30000,STALE_RUN_AGE=7*86400000,CLEANUP_INTERVAL=3600000;
const PROGRESS_TTL=15000,PROGRESS_MAX_ENTRIES=500;
const databaseStates=new WeakMap();
function databaseState(db){let state=databaseStates.get(db);if(!state){state={cache:null,pending:null,lastCleanup:0,progress:new Map(),progressEpoch:0};databaseStates.set(db,state);}return state;}
// Guests without a network address share one bucket. Its per-minute size is a deployment
// setting so it can follow measured traffic (see the admin traffic summary).
function sharedStartLimit(env){const value=Number(env.SHARED_START_LIMIT_PER_MINUTE);return Number.isInteger(value)&&value>=1&&value<=100000?value:DEFAULT_SHARED_START_LIMIT;}
// Hourly housekeeping: abandoned runs cannot be finished after three hours and go after a week;
// stored move records and rejection counters go after thirty days. Each step runs on its own, so a
// missing table (migration not applied) cannot stop the others.
async function removeStaleRuns(db,now){
  const state=databaseState(db);if(now-state.lastCleanup<CLEANUP_INTERVAL)return;state.lastCleanup=now;
  const steps=[
    ['DELETE FROM game_runs WHERE finished_at IS NULL AND started_at<?',now-STALE_RUN_AGE],
    ['DELETE FROM run_replays WHERE stored_at<?',now-REVIEW_RETENTION],
    ["DELETE FROM security_state WHERE key>='start_rejected:' AND key<?",'start_rejected:'+dayString(now-COUNTER_RETENTION)],
  ];
  for(const [sql,value] of steps){
    try{await db.prepare(sql).bind(value).run();}
    catch(error){if(!missingReplayTable(error))console.error('Housekeeping step failed',error?.message);}
  }
}
// Housekeeping must never decide whether a request works.
async function housekeeping(env){try{await removeStaleRuns(database(env),Date.now());}catch(error){console.error('Housekeeping skipped',error?.message);}}
// Databases where migration 0005 is not applied yet have no run_replays table; every reader tolerates that.
function missingReplayTable(error){return /no such table:\s*run_replays/i.test(`${error?.message||''} ${error?.cause?.message||''}`);}
// Keeps the moves of only the highest verified scores so the owner can review suspected bots.
// A failure here must never make the score save fail.
async function storeReview(db,id,score,input,now){
  if(score<REVIEW_MIN_SCORE)return;
  try{
    const kept=await db.prepare('SELECT COUNT(*) AS n, MIN(score) AS low FROM run_replays').first();
    if(kept.n>=REVIEW_MAX_ROWS&&score<=kept.low)return;
    const moves=JSON.stringify(input.moves),bytes=new TextEncoder().encode(moves).length;
    await db.prepare('INSERT OR IGNORE INTO run_replays (run_id,score,ticks,moves,bytes,stored_at) VALUES (?,?,?,?,?,?)').bind(id,score,input.ticks,bytes>REVIEW_MAX_BYTES?null:moves,bytes,now).run();
    await db.prepare('DELETE FROM run_replays WHERE run_id NOT IN (SELECT run_id FROM run_replays ORDER BY score DESC, stored_at DESC, run_id ASC LIMIT ?)').bind(REVIEW_MAX_ROWS).run();
  }catch(error){console.error('Move record not stored',error?.message);}
}
function questsForDay(date){const pool=[...QUEST_POOL],random=seededRandom(Number(date.replaceAll('-','')));for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,3);}
// Progress costs three aggregate queries. A small per-instance cache (short lifetime, bounded, oldest
// entry evicted first) keeps repeated page loads of one player from repeating them. A saved run drops
// its player's entry, an owner deletion drops all of them, and finish() always computes fresh.
// The epoch stops a read that began before an invalidation from storing its older result.
function forgetProgress(db,player){const state=databaseState(db);state.progressEpoch++;if(player===undefined)state.progress.clear();else state.progress.delete(player);}
async function readProgress(env,player,{fresh=false}={}){
  if(!player)return emptyProgress();
  const db=database(env),state=databaseState(db),now=Date.now(),today=dayString(now);
  if(!fresh){const hit=state.progress.get(player);if(hit&&hit.day===today&&now>=hit.time&&now-hit.time<PROGRESS_TTL)return hit.data;}
  const epoch=state.progressEpoch,data=await computeProgress(db,player,today);
  if(epoch===state.progressEpoch){
    state.progress.delete(player);state.progress.set(player,{time:now,day:today,data});
    while(state.progress.size>PROGRESS_MAX_ENTRIES)state.progress.delete(state.progress.keys().next().value);
  }
  return data;
}
async function computeProgress(db,player,today){
  const qsum=new Set(['q_apples','q_powerups','q_confuse_eat','q_shield_blocks']);
  const aggregate=await db.prepare(`SELECT COALESCE(SUM(CASE WHEN outcome='completed' THEN score ELSE 0 END),0) AS xp, COALESCE(SUM(json_extract(rewards,'$.magnets')),0) AS magnets, COALESCE(SUM(json_extract(rewards,'$.shields')),0) AS shields, ${ACHIEVEMENTS.map(a=>`COALESCE(MAX(json_extract(rewards,'$.achievements.${a.id}')),0) AS ${a.id}`).join(',')} FROM game_runs WHERE player_id=? AND verified=1`).bind(player).first();
  const modes=await db.prepare('SELECT map,difficulty,MAX(score) AS score FROM game_runs WHERE player_id=? AND verified=1 GROUP BY map,difficulty').bind(player).all();
  const days=await db.prepare(`SELECT quest_date, ${QUEST_POOL.map(q=>`COALESCE(${qsum.has(q.id)?'SUM':'MAX'}(json_extract(rewards,'$.quests.${q.id}')),0) AS ${q.id}`).join(',')} FROM game_runs WHERE player_id=? AND verified=1 GROUP BY quest_date`).bind(player).all();
  const playedMaps=[...new Set(modes.results.map(r=>r.map))],unlocked={};let xp=Number(aggregate.xp);
  for(const ach of ACHIEVEMENTS){const won=ach.id==='explorer'?playedMaps.length>=6:ach.id==='magnet_master'?aggregate.magnets>=3:ach.id==='shield_hero'?aggregate.shields>=3:aggregate[ach.id];if(won){unlocked[ach.id]=1;xp+=ach.xp;}}
  for(const day of days.results)if(day.quest_date)for(const quest of questsForDay(day.quest_date))if(day[quest.id]>=quest.target)xp+=quest.xp;
  const current=days.results.find(d=>d.quest_date===today)||{},daily=questsForDay(today).map(q=>({id:q.id,progress:Math.min(q.target,current[q.id]||0),completed:(current[q.id]||0)>=q.target}));
  const data={snake_player_xp:String(xp),snake_achievements:JSON.stringify(unlocked),snake_stats:JSON.stringify({playedMaps,magnetsUsed:Number(aggregate.magnets),shieldBlocks:Number(aggregate.shields)}),snake_quest_date:today,snake_daily_quests:JSON.stringify(daily)};
  for(const map of maps)for(const diff of difficulties)data[`snake_hs_${diff}_${map}`]=String(modes.results.find(r=>r.map===map&&r.difficulty===diff)?.score||0);
  return data;
}
// A visitor without a player identity has no stored runs; skip the database.
function emptyProgress(){
  const today=dayString(),data={snake_player_xp:'0',snake_achievements:'{}',snake_stats:JSON.stringify({playedMaps:[],magnetsUsed:0,shieldBlocks:0}),snake_quest_date:today,snake_daily_quests:JSON.stringify(questsForDay(today).map(q=>({id:q.id,progress:0,completed:false})))};
  for(const map of maps)for(const diff of difficulties)data[`snake_hs_${diff}_${map}`]='0';
  return data;
}
async function start(request,env) {
  const input=await body(request);
  if(Object.hasOwn(input,'accountKey')&&input.accountKey!==await accountId(request))return bad('Açık hesap değişti. Sayfayı yenile.',409);
  const nickname=typeof input.nickname==='string'&&input.nickname.length<=200?cleanNickname(input.nickname):'';
  if(!maps.has(input.map)||!difficulties.has(input.difficulty)||!uuid.test(input.id||'')||!uuid.test(input.token||''))return bad('Oyuncu adı veya oyun ayarları geçersiz.');
  const db=database(env),now=Date.now(),tokenHash=await hash(input.token);
  await removeStaleRuns(db,now);
  const account=await accountId(request),guestId=guestIdentity(request)||crypto.randomUUID(),playerId=account||guestId;
  const responseFor=run=>json({id:input.id,seed:run.seed,rulesVersion:run.rules_version,maxTicks:MAX_REPLAY_TICKS},201,{'Set-Cookie':`snake_player=${run.player_id.startsWith('account:')?guestId:run.player_id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`});
  const existing=await db.prepare('SELECT * FROM game_runs WHERE id=?').bind(input.id).first();
  if(existing){if(existing.token_hash!==tokenHash||existing.map!==input.map||existing.difficulty!==input.difficulty||(existing.player_id.startsWith('account:')?existing.player_id!==account:!!account))return bad('Oyun kimliği kullanımda.',409);if(![1,2,RULES_VERSION].includes(existing.rules_version))return bad('Eski oyun kaydı. Yeni bir oyun başlat.',409);return responseFor(existing);}
  // Existing token-bound runs remain retryable even if newer name rules reject their name.
  if(!nickname)return bad('Oyuncu adı veya oyun ayarları geçersiz.');
  if(input.skin!==undefined&&!['blue','green','red','purple','gold','rainbow'].includes(input.skin)||input.cosmetic!==undefined&&!['none','crown','sunglasses','tophat','cap','bow'].includes(input.cosmetic))return bad('Görünüm seçimi geçersiz.');
  if(input.rulesVersion!==RULES_VERSION)return bad('Oyun güncellendi. Sayfayı yenileyip yeni bir oyun başlat.',409);
  const network=await networkRateKey(request,env,db,account),seed=crypto.getRandomValues(new Uint32Array(1))[0],cosmetic=input.skin&&input.skin!=='blue'||input.cosmetic&&input.cosmetic!=='none'?'styled':'plain';
  // All quotas are checked inside the insert, so concurrent requests cannot overbook. Nothing counts
  // all runs of the site: the shared guest bucket has a per-minute size only, and no daily cap.
  await db.prepare(`INSERT OR IGNORE INTO game_runs (id,player_id,token_hash,nickname,map,difficulty,started_at,seed,rules_version,rate_key,cosmetic,quest_date)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE
    (SELECT COUNT(*) FROM game_runs WHERE rate_key=? AND started_at>?)<? AND
    (SELECT COUNT(*) FROM game_runs WHERE player_id=? AND started_at>?)<12 AND
    (SELECT COUNT(*) FROM game_runs WHERE player_id=? AND started_at>?)<300 AND
    (? OR (SELECT COUNT(*) FROM game_runs WHERE rate_key=? AND started_at>?)<300)`).bind(input.id,playerId,tokenHash,nickname,input.map,input.difficulty,now,seed,RULES_VERSION,network.key,cosmetic,dayString(now),network.key,now-60000,network.shared?sharedStartLimit(env):12,playerId,now-60000,playerId,now-86400000,network.shared?1:0,network.key,now-86400000).run();
  const stored=await db.prepare('SELECT * FROM game_runs WHERE id=?').bind(input.id).first();
  if(!stored){
    // Counted per day so the shared limit can be tuned from real traffic.
    try{await db.prepare("INSERT INTO security_state (key,value) VALUES (?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)").bind('start_rejected:'+dayString(now)+(network.shared?':shared':':network')).run();}catch(error){console.error('Rejection not counted',error?.message);}
    return bad('Yeni oyun sınırına ulaşıldı. Biraz sonra tekrar dene veya antrenman modunu kullan.',429);
  }
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
  if(run.finished_at!==null){if(!run.verified||run.proof_hash!==proofHash)return bad('Bu oyun zaten kaydedildi.',409);return json({saved:true,score:run.score,progress:await readProgress(env,run.player_id,{fresh:true})});}
  const attempt=await db.prepare('UPDATE game_runs SET proof_attempts=proof_attempts+1 WHERE id=? AND proof_attempts<5 AND finished_at IS NULL').bind(id).run();
  if(!Number(attempt.meta?.changes??attempt.changes))return bad('Bu oyunun doğrulama sınırına ulaşıldı. Yeni bir oyun başlat.',429);
  const now=Date.now();let replay;try{replay=(run.rules_version===1?replayV1.verifyReplay:run.rules_version===2?replayV2.verifyReplay:verifyReplay)(run,input,now);}catch(error){
    // Only the verifier's own plain Error messages are meant for players.
    if(error?.constructor===Error)return bad(error.message);
    console.error('Replay verification failed unexpectedly',error?.message);return bad('Hamle kaydı doğrulanamadı.');
  }
  const rewards={...replay.rewards,achievements:Object.fromEntries(replay.rewards.achievements.map(k=>[k,1]))};if(run.cosmetic==='styled')rewards.achievements.fashion_icon=1;
  const update=await db.prepare('UPDATE game_runs SET finished_at=?,score=?,duration_seconds=?,outcome=?,verified=1,proof_hash=?,rewards=? WHERE id=? AND finished_at IS NULL').bind(now,replay.score,Math.floor(replay.elapsed/1000),input.outcome,proofHash,JSON.stringify(rewards),id).run();
  const saved=await db.prepare('SELECT proof_hash,score FROM game_runs WHERE id=?').bind(id).first();if(saved.proof_hash!==proofHash)return bad('Bu oyun zaten kaydedildi.',409);
  databaseState(db).cache=null;forgetProgress(db,run.player_id);
  // Only the request that stored the result keeps its moves.
  if(Number(update.meta?.changes??update.changes))await storeReview(db,id,replay.score,input,now);
  return json({saved:true,score:saved.score,progress:await readProgress(env,run.player_id,{fresh:true})});
}
// The admin list asks for has_replay with one subquery; without migration 0005 it is answered as false.
async function listRuns(db,clause,values,offset){
  const sql=replays=>'SELECT id, player_id, nickname, map, difficulty, started_at, finished_at, score, duration_seconds, outcome, verified, '+(replays?'EXISTS(SELECT 1 FROM run_replays WHERE run_id=game_runs.id)':'0')+' AS has_replay FROM game_runs'+clause+' ORDER BY started_at DESC, id DESC LIMIT 50 OFFSET ?';
  try{return await db.prepare(sql(true)).bind(...values,offset).all();}
  catch(error){if(!missingReplayTable(error))throw error;return await db.prepare(sql(false)).bind(...values,offset).all();}
}
const TRUSTED_IP_HEADERS=['cf-connecting-ip','true-client-ip','x-real-ip'],TRIGGER_NAMES=['leaderboard_insert','leaderboard_update','leaderboard_delete'];
// Warnings for the owner about deployment mistakes that are otherwise invisible. Empty when all is well.
// "starts" is the admin traffic query row; no extra query is needed.
function deploymentChecks(env,starts){
  const checks=[],present=new Set(String(starts.triggers||'').split(',')),missing=TRIGGER_NAMES.filter(name=>!present.has(name));
  if(missing.length)checks.push('Veritabanı güncel değil: '+missing.join(', ')+' tetikleyicisi yok (migration 0004 uygulanmamış). Skor listesi önbelleği başka Worker örneklerindeki değişiklikleri hemen görmeyebilir. drizzle/0004 migration dosyasını uygula.');
  if(!Number(starts.replay_table))checks.push('Veritabanı güncel değil: run_replays tablosu yok (migration 0005 uygulanmamış). Yüksek skorların hamle kayıtları saklanmaz ve “Hamleler” bağlantısı görünmez. drizzle/0005 migration dosyasını uygula.');
  if(!TRUSTED_IP_HEADERS.includes(env.TRUSTED_IP_HEADER))checks.push('TRUSTED_IP_HEADER ayarlı değil veya geçersiz: ağ adresi kullanılamadığı için tüm misafirler tek ortak başlatma sınırını paylaşır ve tek bir istemci bu sınırı doldurup diğer misafirlerin oyun başlatmasını engelleyebilir. Sites üzerinde değeri cf-connecting-ip olarak ayarla.');
  else if(Number(starts.total)>=SHARED_ONLY_MIN_STARTS&&Number(starts.shared)===Number(starts.total))checks.push('TRUSTED_IP_HEADER ('+env.TRUSTED_IP_HEADER+') ayarlı ama son 24 saatteki '+starts.total+' başlatmanın hepsi ortak misafir kovasına düştü. Başlık isteklere ulaşmıyor olabilir; platformun bu başlığı gerçekten eklediğini ve değerin doğru yazıldığını kontrol et.');
  return checks;
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
  const db=database(env),now=Date.now(),day=now-86400000,sharedKey=await keyedHash(await signingKey(db,'rate_secret'),SHARED_NETWORK);
  const [summary,count,rows,starts]=await Promise.all([
    db.prepare("SELECT COUNT(*) AS total_games, COUNT(DISTINCT player_id) AS players, COUNT(finished_at) AS finished_games, COALESCE(MAX(CASE WHEN verified=1 THEN score END),0) AS best_score FROM game_runs").first(),
    db.prepare('SELECT COUNT(*) AS count FROM game_runs'+clause).bind(...values).first(),
    listRuns(db,clause,values,(page-1)*50),
    // One query for the whole traffic summary keeps the page's query count constant.
    db.prepare("SELECT (SELECT COUNT(*) FROM game_runs WHERE started_at>?1) AS total, (SELECT COUNT(*) FROM game_runs WHERE started_at>?1 AND rate_key=?2) AS shared, (SELECT COALESCE(MAX(n),0) FROM (SELECT COUNT(*) AS n FROM game_runs WHERE started_at>?1 GROUP BY started_at/60000)) AS peak, (SELECT COALESCE(MAX(n),0) FROM (SELECT COUNT(*) AS n FROM game_runs WHERE started_at>?1 AND rate_key=?2 GROUP BY started_at/60000)) AS shared_peak, (SELECT value FROM security_state WHERE key=?3) AS rejected_shared, (SELECT value FROM security_state WHERE key=?4) AS rejected_network, (SELECT GROUP_CONCAT(name) FROM sqlite_master WHERE type='trigger' AND name IN ('leaderboard_insert','leaderboard_update','leaderboard_delete')) AS triggers, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='run_replays') AS replay_table").bind(day,sharedKey,'start_rejected:'+dayString(now)+':shared','start_rejected:'+dayString(now)+':network').first(),
  ]);
  // Starts in the last 24 hours; "shared" means guests whose network address was not available.
  const traffic={starts24h:starts.total,sharedStarts24h:Number(starts.shared),peakPerMinute:starts.peak,sharedPeakPerMinute:starts.shared_peak,sharedLimitPerMinute:sharedStartLimit(env),rejectedToday:{shared:Number(starts.rejected_shared||0),network:Number(starts.rejected_network||0)}};
  const checks=deploymentChecks(env,starts);
  const codeKey=rows.results.length?await signingKey(db,'player_code_secret'):null;
  const runs=await Promise.all(rows.results.map(async ({player_id,nickname,has_replay,...run})=>({...run,nickname:shownNickname(nickname),has_replay:!!has_replay,player_code:await playerCode(codeKey,player_id)})));
  return json({summary,total:count.count,page,pageSize:50,runs,traffic,checks});
}
// Review signals are heuristics for the owner's manual review. They are informational only: they never
// block, reject or change a score. Thresholds are deliberately conservative (a simple shortest-path bot
// measured 107-222 points and 15-21 turns per 100 ticks in simulation); tune them with real data.
const SIGNAL_MIN_TICKS=200,SIGNAL_TURNS_PER_100_HIGH=40,SIGNAL_SCORE_PER_100_HIGH=250,SIGNAL_PAUSE_MIN_SECONDS=120,SIGNAL_PAUSE_RATIO=1,SIGNAL_ABANDONED_MIN=5,SIGNAL_ABANDONED_SHARE=0.5,SIGNAL_LOOKBACK=3600000;
const oneDecimal=value=>Math.round(value*10)/10;
function reviewSignals(row,moves,before){
  const ticks=row.ticks;let changes=null;
  if(Array.isArray(moves)){changes=0;let direction=1;for(const move of moves)if(move[1]!==direction){changes++;direction=move[1];}}
  const turnRate=changes===null||!ticks?null:oneDecimal(changes*100/ticks),scoreRate=ticks?oneDecimal(row.score*100/ticks):null;
  const activeSeconds=row.duration_seconds??null,wallSeconds=row.finished_at===null?null:Math.round((row.finished_at-row.started_at)/1000);
  const pausedSeconds=activeSeconds===null||wallSeconds===null?null:Math.max(0,wallSeconds-activeSeconds);
  const started=Number(before?.started||0),abandoned=Number(before?.abandoned||0),notes=[];
  if(ticks>=SIGNAL_MIN_TICKS){
    if(turnRate!==null&&turnRate>=SIGNAL_TURNS_PER_100_HIGH)notes.push('Yön değişimi alışılmadık derecede sık: her 100 adımda '+turnRate+'.');
    if(scoreRate!==null&&scoreRate>=SIGNAL_SCORE_PER_100_HIGH)notes.push('Adım başına skor alışılmadık derecede yüksek: her 100 adımda '+scoreRate+' puan.');
  }
  if(pausedSeconds!==null&&pausedSeconds>=SIGNAL_PAUSE_MIN_SECONDS&&pausedSeconds>=activeSeconds*SIGNAL_PAUSE_RATIO)notes.push('Başlangıç ile bitiş arası ('+wallSeconds+' sn) aktif oyun süresinden ('+activeSeconds+' sn) çok uzun; uzun duraklamalar olmuş olabilir.');
  if(abandoned>=SIGNAL_ABANDONED_MIN&&abandoned>=started*SIGNAL_ABANDONED_SHARE)notes.push('Aynı oyuncu bu oyundan önceki saatte '+started+' oyun başlattı, '+abandoned+' tanesi bitirilmedi veya yeniden başlatıldı; uygun bir başlangıç tohumu aranmış olabilir.');
  return {ticks,directionChanges:changes,directionChangesPer100Ticks:turnRate,scorePer100Ticks:scoreRate,activeSeconds,wallSeconds,pausedSeconds,startsBeforeLastHour:started,abandonedBeforeLastHour:abandoned,notes};
}
async function replayRecord(request,env,id){
  if(!owner(request,env))return bad('Bu ekran yalnızca site sahibine açıktır.',request.headers.get('oai-authenticated-user-id')?403:401);
  if(!uuid.test(id))return bad('Geçersiz kayıt.');
  const db=database(env);let row;
  try{row=await db.prepare('SELECT g.id,g.player_id,g.nickname,g.map,g.difficulty,g.seed,g.rules_version,g.outcome,g.started_at,g.finished_at,g.duration_seconds,r.score,r.ticks,r.moves,r.bytes,r.stored_at FROM run_replays r JOIN game_runs g ON g.id=r.run_id WHERE r.run_id=?').bind(id).first();}
  catch(error){if(!missingReplayTable(error))throw error;}
  if(!row)return bad('Bu oyun için saklanan hamle kaydı yok.',404);
  const {player_id,nickname,moves,duration_seconds,...record}=row,parsed=moves===null?null:JSON.parse(moves);
  // Runs the same player started in the hour before this one; the player id itself is never returned.
  const before=await db.prepare('SELECT COUNT(*) AS started, COALESCE(SUM(CASE WHEN finished_at IS NULL OR outcome=\'restarted\' THEN 1 ELSE 0 END),0) AS abandoned FROM game_runs WHERE player_id=? AND started_at>=? AND started_at<? AND id<>?').bind(player_id,row.started_at-SIGNAL_LOOKBACK,row.started_at,id).first();
  return json({...record,nickname:shownNickname(nickname),moves:parsed,note:moves===null?'Hamle kaydı boyut sınırını aştığı için saklanmadı.':undefined,signals:reviewSignals({...row,duration_seconds},parsed,before)});
}
async function accountId(request){
  const id=request.headers.get('oai-authenticated-user-id');
  return id?'account:'+await hash(id):null;
}
async function readProfile(request,env){
  const id=await accountId(request);if(!id)return null;
  const row=await database(env).prepare('SELECT data, revision FROM player_profiles WHERE account_id = ?').bind(id).first();
  const preferences=Object.fromEntries(Object.entries(row?JSON.parse(row.data):{}).filter(([key])=>preferenceKeys.test(key)));
  if(typeof preferences.snake_nickname==='string')preferences.snake_nickname=cleanNickname(preferences.snake_nickname);
  return {key:id,data:{...preferences,...await readProgress(env,id)},revision:row?.revision||0};
}
async function saveProfile(request,env){
  const id=await accountId(request);if(!id)return bad('Hesabına giriş yapmalısın.',401);
  const input=await body(request,65536),data=input.data;
  if(input.accountKey!==id)return bad('Açık hesap değişti. Sayfayı yenile.',409);
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.entries(data).some(([k,v])=>!preferenceKeys.test(k)||typeof v!=='string'||v.length>200)||!Number.isSafeInteger(input.revision)||input.revision<0)return bad('Yalnızca ad ve oyun tercihleri kaydedilebilir. XP, başarımlar ve skor sunucuda hesaplanır.');
  if(Object.hasOwn(data,'snake_nickname'))data.snake_nickname=cleanNickname(data.snake_nickname);
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
  await housekeeping(env);
  const db=database(env),state=databaseState(db),now=Date.now();
  // Database triggers invalidate caches in every Worker instance, including in-flight reads.
  const revision=(await db.prepare("SELECT value FROM security_state WHERE key='leaderboard_revision'").first())?.value??'0';
  if(revision!==undefined&&state.cache?.revision===revision&&now>=state.cache.time&&now-state.cache.time<LEADERBOARD_TTL)return json({scores:state.cache.scores});
  if(revision!==undefined&&state.pending?.revision===revision)return json({scores:await state.pending.promise});
  const pending={revision};
  pending.promise=(async()=>{
    const rows=await db.prepare('SELECT player_id, nickname, score, map, difficulty, finished_at FROM (SELECT id, player_id, nickname, score, map, difficulty, finished_at, ROW_NUMBER() OVER (PARTITION BY player_id, map, difficulty ORDER BY score DESC, finished_at ASC, id ASC) AS position FROM game_runs WHERE verified=1 AND finished_at IS NOT NULL AND score > 0) WHERE position = 1 ORDER BY score DESC, finished_at ASC, id ASC LIMIT 20').all();
    const codeKey=rows.results.length?await signingKey(db,'player_code_secret'):null;
    const scores=await Promise.all(rows.results.map(async r=>({name:shownNickname(r.nickname),score:r.score,map:r.map,diff:r.difficulty,date:new Date(r.finished_at).toLocaleDateString('tr-TR'),playerCode:await playerCode(codeKey,r.player_id)})));
    const after=(await db.prepare("SELECT value FROM security_state WHERE key='leaderboard_revision'").first())?.value??'0';
    if(revision!==undefined&&after===revision)state.cache={time:now,revision,scores};
    return scores;
  })();
  state.pending=pending;
  try{return json({scores:await pending.promise});}finally{if(state.pending===pending)state.pending=null;}
}
async function deleteRuns(request,env){
  if(!owner(request,env))return bad('Bu işlem yalnızca site sahibine açıktır.',request.headers.get('oai-authenticated-user-id')?403:401);
  const input=await body(request);
  if(!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>50||input.ids.some(id=>typeof id!=='string'||!uuid.test(id)))return bad('1 ile 50 arasında geçerli kayıt seçmelisin.');
  const ids=[...new Set(input.ids)];
  const db=database(env),marks=ids.map(()=>'?').join(',');
  try{await db.prepare('DELETE FROM run_replays WHERE run_id IN ('+marks+')').bind(...ids).run();}catch(error){if(!missingReplayTable(error))throw error;}
  const result=await db.prepare('DELETE FROM game_runs WHERE id IN ('+marks+')').bind(...ids).run();
  databaseState(db).cache=null;forgetProgress(db);
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
    if(url.pathname==='/admin/security')return html(securityAdminHTML,200,false);
    const rows=await database(env).prepare('SELECT id,contact,details,created_at FROM security_reports ORDER BY created_at DESC, id DESC LIMIT 50').all();
    return json({reports:rows.results});
   }
   if(request.method==='GET'&&url.pathname==='/'){
    await housekeeping(env);
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
    return html(adminHTML,200,false);
   }
   if(request.method==='GET'&&url.pathname==='/api/admin/runs')return await admin(request,env,url);
   const replayMatch=url.pathname.match(/^\/api\/admin\/runs\/([^/]+)\/replay$/);
   if(request.method==='GET'&&replayMatch)return await replayRecord(request,env,replayMatch[1]);
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
  // Raw HTTP callers and copies of this Worker have no platform identity by default.
  if(env.TRUST_PLATFORM_IDENTITY!=='1'){
    const headers=new Headers(request.headers);
    for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-'))headers.delete(key);
    request=new Request(request,{headers});
  }
  const url=new URL(request.url);
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){
    url.protocol='https:';return secureResponse(new Response(null,{status:308,headers:{Location:url.href}}),request);
  }
  const routed=request.method==='HEAD'?new Request(request,{method:'GET'}):request;
  return secureResponse(await app.fetch(routed,env),request);
}};

const http=require('http'),fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('url');
(async()=>{
 const worker=(await import(pathToFileURL(path.resolve('dist/server/index.js')))).default;
 fs.mkdirSync('.local',{recursive:true});
 const sqlite=new DatabaseSync('.local/preview.sqlite');
 sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
  if(!sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(file)){
   sqlite.exec('BEGIN');try{sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(file);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
  }
 }
 const DB={prepare(sql){const stmt=sqlite.prepare(sql);let values=[];return{bind(...v){values=v;return this},async first(){return stmt.get(...values)||null},async all(){return{results:stmt.all(...values)}},async run(){return stmt.run(...values)}}}};
 http.createServer(async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value)headers.set(key,String(value));
   // Local HTTP must not accept caller-supplied platform identity headers.
   for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-'))headers.delete(key);
   const response=await worker.fetch(new Request('http://localhost:3000'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),{DB,ADMIN_EMAIL:process.env.ADMIN_EMAIL||'',SHARED_START_LIMIT_PER_MINUTE:process.env.SHARED_START_LIMIT_PER_MINUTE||''});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Preview unavailable');}
 }).listen(3000,'127.0.0.1',()=>console.log('Local: http://localhost:3000/'));
})().catch(e=>{console.error(e);process.exit(1);});

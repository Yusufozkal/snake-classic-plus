const http=require('http'),fs=require('fs');
const paths={'/':'public/game.html','/favicon.svg':'public/favicon.svg'};
http.createServer((req,res)=>{
 const path=paths[new URL(req.url,'http://localhost').pathname];
 if(!path){res.writeHead(404);return res.end('Bulunamadı');}
 res.setHeader('Content-Type',path.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8');
 fs.createReadStream(path).pipe(res);
}).listen(3000,'127.0.0.1',()=>console.log('Local: http://localhost:3000/'));

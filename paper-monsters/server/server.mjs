import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {createWorld,setInput,queueAction,stepWorld,snapshot} from '../public/world.mjs';
import {arenas} from '../public/maps.mjs';
const kinds=['vampire','assassin','barbarian'];
export function createArenaServer({port=Number(process.env.PORT||8080),countdownMs=3000,ffaWaitMs=30000,graceMs=15000}={}){
 const sessions=new Map(),rooms=new Map();const allowed=new Set(['https://noam.bot','https://noam-bot.web.app','http://127.0.0.1:8080','http://localhost:8080']);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.url==='/health'){res.end(JSON.stringify({ok:true,version:1}));}else{res.statusCode=404;res.end('{"error":"Not found"}');}});
 const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
 const send=(s,msg)=>{if(s.ws?.readyState===WebSocket.OPEN&&s.ws.bufferedAmount<100000)s.ws.send(JSON.stringify(msg));};
 const error=(s,message)=>send(s,{type:'error',message});
 function view(r){return {code:r.code,mode:r.mode,phase:r.phase,map:r.map,host:r.host,startsAt:r.startsAt,players:[...r.players].map(id=>{const s=sessions.get(id);return {id,kind:s.kind,name:s.name,ready:s.ready,connected:!!s.ws};}),winner:r.world?.winner||null};}
 function announce(r){for(const id of r.players)send(sessions.get(id),{type:'room',room:view(r)});}
 function leave(s){const r=rooms.get(s.room);s.room=null;s.ready=false;if(!r)return;r.players.delete(s.id);if(r.world){const a=r.world.actors.find(a=>a.id===s.id);if(a)a.hp=0;}if(!r.players.size){rooms.delete(r.code);return;}if(r.host===s.id)r.host=r.players.values().next().value;if(r.players.size<2&&r.phase==='countdown'){r.phase='waiting';r.startsAt=null;}announce(r);}
 function newRoom(mode){let code;do code=randomBytes(4).toString('hex').toUpperCase();while(rooms.has(code));const r={code,mode,map:Object.keys(arenas)[Math.floor(Math.random()*3)],host:null,players:new Set(),phase:'waiting',startsAt:null,world:null,events:[]};rooms.set(code,r);return r;}
 function join(s,r){if(r.players.size>=(r.mode==='duel'?2:5))return error(s,'This room is full.');if(!['waiting','finished'].includes(r.phase))return error(s,'This round has already started.');leave(s);r.players.add(s.id);r.host??=s.id;s.room=r.code;s.ready=r.mode!=='friends';if(r.phase==='finished'){r.phase='waiting';r.world=null;}announce(r);}
 function begin(r){r.world=createWorld(r.map,[...r.players].map(id=>sessions.get(id)));r.phase='playing';r.startsAt=null;r.events=[];announce(r);}
 function handle(s,m){if(!m||typeof m!=='object')return;if(m.type==='ping'){send(s,{type:'pong',at:m.at});return;}if(!Number.isSafeInteger(m.seq)||m.seq<=s.seq)return;s.seq=m.seq;
  const r=rooms.get(s.room);s.lastActivity=Date.now();
  if(m.type==='leave'){leave(s);send(s,{type:'left'});return;}
  if(m.type==='queue'){if(!['duel','ffa'].includes(m.mode))return;leave(s);s.kind=kinds.includes(m.kind)?m.kind:'vampire';let target=[...rooms.values()].find(x=>x.mode===m.mode&&x.phase==='waiting'&&x.players.size<(m.mode==='duel'?2:5));join(s,target||newRoom(m.mode));return;}
  if(m.type==='host'){s.kind=kinds.includes(m.kind)?m.kind:'vampire';const room=newRoom('friends');room.map=(typeof m.map==='string'&&Object.hasOwn(arenas,m.map))?m.map:'manor';join(s,room);return;}
  if(m.type==='join'){if(typeof m.code!=='string'||!/^[A-F0-9]{8}$/.test(m.code))return error(s,'Enter an eight-character room code.');const room=rooms.get(m.code);if(!room||room.mode!=='friends')return error(s,'Room not found or expired.');s.kind=kinds.includes(m.kind)?m.kind:'vampire';join(s,room);return;}
  if(!r)return;
  if(m.type==='choose'&&['waiting','finished'].includes(r.phase)){if(kinds.includes(m.kind))s.kind=m.kind;if(r.host===s.id&&r.mode==='friends'&&(typeof m.map==='string'&&Object.hasOwn(arenas,m.map))&&r.map!==m.map){r.map=m.map;for(const id of r.players)sessions.get(id).ready=false;}s.ready=false;announce(r);return;}
  if(m.type==='ready'&&['waiting','finished'].includes(r.phase)){if(r.phase==='finished'){r.phase='waiting';r.world=null;r.startsAt=null;for(const id of r.players)sessions.get(id).ready=false;}s.ready=!s.ready;announce(r);return;}
  if(m.type==='start'&&r.mode==='friends'&&r.host===s.id&&r.phase==='waiting'){if(r.players.size<2||![...r.players].every(id=>sessions.get(id).ready&&sessions.get(id).ws))return error(s,'At least two players must be connected and ready.');r.phase='countdown';r.startsAt=Date.now()+countdownMs;announce(r);return;}
  if(r.phase==='playing'){if(m.type==='input')setInput(r.world,s.id,m);else if(m.type==='action'&&typeof m.move==='string')queueAction(r.world,s.id,m.move,m.angle);}
 }
 server.on('upgrade',(req,socket,head)=>{if(req.url!=='/play'||!allowed.has(req.headers.origin)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}if(wss.clients.size>=100){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
 wss.on('connection',ws=>{let s=null,rate=0,windowAt=Date.now();ws.alive=true;ws.on('pong',()=>ws.alive=true);const handshake=setTimeout(()=>{if(!s)ws.close(1008,'Handshake required');},5000);ws.on('message',raw=>{if(Date.now()-windowAt>=1000){windowAt=Date.now();rate=0;}if(++rate>100){ws.close(1008,'Too many messages');return;}let m;try{m=JSON.parse(raw.toString());}catch{ws.close(1008,'Invalid message');return;}
  if(!m||typeof m!=='object'||Array.isArray(m)){ws.close(1008,'Invalid message');return;}
  if(!s){if(m.type!=='hello')return;const existing=typeof m.token==='string'?[...sessions.values()].find(x=>x.token===m.token&&!x.ws&&Date.now()-x.closedAt<graceMs):null;
   if(!existing&&sessions.size>=200){ws.close(1013,'Server busy');return;}
   s=existing||{id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),kind:'vampire',name:'Player '+randomBytes(2).toString('hex').toUpperCase(),seq:0,room:null,ready:false,lastActivity:Date.now()};s.ws=ws;s.closedAt=null;sessions.set(s.id,s);clearTimeout(handshake);send(s,{type:'welcome',id:s.id,token:s.token,seq:s.seq,resumed:!!existing});if(s.room)announce(rooms.get(s.room));return;
  }handle(s,m);
 });ws.on('close',()=>{clearTimeout(handshake);if(s&&s.ws===ws){s.ws=null;s.closedAt=Date.now();s.ready=false;const r=rooms.get(s.room);if(r){if(r.world){const a=r.world.actors.find(a=>a.id===s.id);if(a){a.input={x:0,y:0,angle:0};a.actions=[];}}announce(r);}}});ws.on('error',()=>{});});
 let last=performance.now(),acc=0,broadcast=0;
 const timer=setInterval(()=>{const now=performance.now();acc+=Math.min((now-last)/1000,.2);last=now;const date=Date.now();for(const s of sessions.values())if(!s.ws&&date-s.closedAt>=graceMs){leave(s);sessions.delete(s.id);}else if(s.ws&&!s.room&&date-s.lastActivity>600000)s.ws.close(1000,'Idle');
  for(const r of rooms.values()){
   const connected=[...r.players].every(id=>!!sessions.get(id).ws);
   if(r.phase==='waiting'&&r.mode!=='friends'){
    if(r.players.size<2||!connected||![...r.players].every(id=>sessions.get(id).ready)){if(r.startsAt){r.startsAt=null;announce(r);}}
    else{if(!r.startsAt){r.startsAt=date+(r.mode==='duel'?countdownMs:ffaWaitMs);announce(r);}const max=r.mode==='duel'?2:5;if(r.players.size>=max&&r.startsAt>date+countdownMs){r.startsAt=date+countdownMs;announce(r);}if(date>=r.startsAt)begin(r);}
   }else if(r.phase==='countdown'){if(!connected||r.players.size<2){r.phase='waiting';r.startsAt=null;announce(r);}else if(date>=r.startsAt)begin(r);}
  }
  while(acc>=1/60){for(const r of rooms.values())if(r.phase==='playing'){stepWorld(r.world,1/60);r.events.push(...r.world.events);if(r.world.done){r.phase='finished';for(const id of r.players)sessions.get(id).ready=false;announce(r);}}acc-=1/60;}
  if(++broadcast%3===0)for(const r of rooms.values())if(r.world){for(const id of r.players){const state=snapshot(r.world,id);state.events=r.events;send(sessions.get(id),{type:'state',state});}r.events=[];}
 },1000/60);
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},10000);
 server.listen(port);return {server,rooms,sessions,close:()=>{clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){createArenaServer();console.log('Paper Monsters multiplayer listening');}

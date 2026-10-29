import {fighter,tickTimers,activate,damage,bloodHit,finishLunge,knifeHit,daggerHit,radius,bodyHeight,moveSpeed,stepAxe,newVolley,volleyHit,projectileHits} from './core.mjs';
import {arenas} from './maps.mjs';
export function createWorld(map,players){return {map:Object.hasOwn(arenas,map)?map:'manor',time:0,done:false,winner:null,events:[],projectiles:[],volleys:[],actors:players.map((s,i)=>({...fighter(false,s.kind),id:s.id,name:s.name,x:180+i*920/Math.max(1,players.length-1),dir:i<players.length/2?1:-1,input:{x:0,y:0,angle:0},actions:[],lastInput:0}))};}
export function setInput(w,id,msg){const a=w.actors.find(a=>a.id===id);if(!a||a.hp<=0||!Number.isFinite(msg.x)||!Number.isFinite(msg.y)||!Number.isFinite(msg.angle))return false;a.input={x:Math.sign(msg.x),y:Math.sign(msg.y),angle:Math.atan2(Math.sin(msg.angle),Math.cos(msg.angle))};a.lastInput=w.time;return true;}
export function queueAction(w,id,move,angle){const a=w.actors.find(a=>a.id===id);if(!a||a.hp<=0||a.actions.length>=6||!Number.isFinite(angle))return false;a.actions.push({move,angle:Math.atan2(Math.sin(angle),Math.cos(angle))});return true;}
function overlap(a,b,reach){return Math.abs(a.x-b.x)<reach+radius(b)&&Math.abs(a.y-bodyHeight(a)/2-b.y+bodyHeight(b)/2)<(bodyHeight(a)+bodyHeight(b))/2;}
function hit(w,a,b,n){w.events.push({type:'hit',target:b.id,attacker:a.id,damage:n});}
function leap(a){if(a.bat||a.stun||a.jumps>=2||a.axe?.type==='combo')return;a.vy=-660;a.ground=false;a.jumps++;}
function cast(w,a,cmd){if(cmd.move==='jump'){leap(a);return;}if(!activate(a,cmd.move))return;const enemies=w.actors.filter(b=>b!==a&&b.hp>0).sort((b,c)=>Math.abs(b.x-a.x)-Math.abs(c.x-a.x));
 if(['knife','katana','dagger'].includes(cmd.move)){const reach=cmd.move==='katana'?115:cmd.move==='dagger'?43:70,b=enemies.find(b=>(b.x-a.x)*a.dir>=-5&&overlap(a,b,reach));if(b)hit(w,a,b,cmd.move==='dagger'?daggerHit(a,b).dealt:cmd.move==='katana'?damage(b,5,a):knifeHit(a,b));}
 if(cmd.move==='volley'){if(Math.abs(Math.cos(cmd.angle))>.01)a.dir=Math.sign(Math.cos(cmd.angle));w.volleys.push(newVolley(a,cmd.angle));}
}
function physics(a,dt,map){const oldY=a.y;if(a.bat){a.vx=a.input.x*285;a.vy=a.input.y*260;}else a.vy+=1250*dt;a.x=Math.max(105,Math.min(1175,a.x+a.vx*dt));a.y+=a.vy*dt;
 if(a.bat)a.y=Math.max(135,Math.min(610,a.y));else{a.ground=false;if(a.vy>=0)for(const q of arenas[map].platforms){if(a.x+18>q.x&&a.x-18<q.x+q.w&&oldY<=q.y+1&&a.y>=q.y){a.y=q.y;a.vy=0;a.ground=true;a.jumps=0;break;}}if(a.y>690){a.y=615;a.vy=0;a.ground=true;a.jumps=0;}}
 if(!a.axe&&Math.abs(a.vx)>1&&a.lunge<=0)a.dir=Math.sign(a.vx);
}
export function stepWorld(w,dt){if(w.done)return;w.time+=dt;w.events=[];
 // Rotate processing order each tick so simultaneous inputs do not always favor the host.
 const shift=Math.floor(w.time*60)%w.actors.length,order=[...w.actors.slice(shift),...w.actors.slice(0,shift)];
 for(const a of order){if(a.hp<=0)continue;tickTimers(a,dt);if(w.time-a.lastInput>.35)a.input={x:0,y:0,angle:a.input.angle};for(const cmd of a.actions.splice(0))cast(w,a,cmd);a.vx=a.stun?0:a.lunge>0?a.dir*980:a.input.x*moveSpeed(a);physics(a,dt,w.map);}
 for(const a of order){if(a.hp<=0)continue;const enemies=order.filter(b=>b!==a&&b.hp>0).sort((b,c)=>Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(c.x-a.x,c.y-a.y));
  if(a.lunge>0){const b=enemies.find(b=>overlap(a,b,37));if(b&&!a.lungeHit){const result=bloodHit(a,b);hit(w,a,b,result.dealt);}a.lunge-=dt;if(a.lunge<=0){finishLunge(a);a.vx=0;}}
  // A committed axe swing hits the closest fighter in its arc, once per swing.
  if(a.axe){const b=enemies.find(b=>(a.axe.type==='combo'||(b.x-a.x)*a.axe.dir>=-12)&&overlap(a,b,a.axe.type==='heavy'?150:135))||enemies[0]||{x:-9999,y:-9999,hp:0};for(const r of stepAxe(a,b,dt))if(r.hit)hit(w,a,b,r.dealt);}
 }
 for(const v of w.volleys){v.elapsed+=dt;while(v.launched<3&&v.elapsed>=v.launched*.14){const dx=Math.cos(v.angle),dy=Math.sin(v.angle);w.projectiles.push({x:v.owner.x+dx*30,y:v.owner.y-42+dy*30,vx:dx*680,vy:dy*680,life:1.35,volley:v});v.launched++;}}w.volleys=w.volleys.filter(v=>v.launched<3);
 for(const k of w.projectiles){const x=k.x,y=k.y;k.x+=k.vx*dt;k.y+=k.vy*dt;k.life-=dt;const targets=w.actors.filter(b=>b!==k.volley.owner&&b.hp>0&&projectileHits(x,y,k.x,k.y,b)).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));if(targets[0]){hit(w,k.volley.owner,targets[0],volleyHit(k.volley,targets[0]));k.life=0;}}
 w.projectiles=w.projectiles.filter(k=>k.life>0&&k.x>20&&k.x<1260&&k.y>70&&k.y<710);const alive=w.actors.filter(a=>a.hp>0);if(alive.length<=1||w.time>=180){w.done=true;w.winner=alive.length===1?alive[0].id:null;}
}
export function snapshot(w,viewer){return {map:w.map,time:w.time,done:w.done,winner:w.winner,actors:w.actors.map(a=>{const {input,actions,lastInput,...state}=a;if(a.cloak>0&&a.id!==viewer&&a.hp>0)return {id:a.id,kind:a.kind,name:a.name,hp:a.hp,max:a.max,hidden:true};return state;}),projectiles:w.projectiles.map(k=>({x:k.x,y:k.y,vx:k.vx,vy:k.vy,owner:k.volley.owner.id})),events:w.events};}

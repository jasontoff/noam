export const platforms = [
  {x:85,y:615,w:1110,h:100}, {x:250,y:455,w:230,h:22},
  {x:800,y:455,w:230,h:22}, {x:530,y:325,w:220,h:22}
];
export const roster={
 vampire:{name:'Vampire',hp:90,max:110,moves:['knife','blood','cloak','bat']},
 assassin:{name:'Assassin',hp:80,max:80,moves:['katana','dagger','volley']},
 dummy:{name:'Patchwork',hp:100,max:100,moves:['knife']}
};
export const cooldowns={knife:2,blood:5,cloak:20,bat:30,katana:1.5,dagger:3,volley:7};
export function fighter(bot=false,kind=bot?'dummy':'vampire') {
  const def=roster[kind];
  return {kind,x:bot?935:345,y:615,vx:0,vy:0,dir:bot?-1:1,hp:def.hp,max:def.max,
    bot,ground:true,jumps:0,cloak:0,bat:0,stun:0,flash:0,attack:0,attackType:'',backstab:0,lunge:0,lungeHit:false,
    cd:Object.fromEntries(def.moves.map(key=>[key,0]))};
}
const countdown=(value,dt)=>value-dt<1e-9?0:value-dt;
export function tickTimers(p,dt) {
  for(const key of Object.keys(p.cd)) p.cd[key]=countdown(p.cd[key],dt);
  for(const key of ['cloak','stun','flash','attack','backstab']) p[key]=countdown(p[key],dt);
  if(p.bat>0){ p.bat=countdown(p.bat,dt); if(!p.bat){p.cd.bat=30;p.vy=0;} }
}
export function damage(target,amount) {
  const dealt=amount*(target.bat>0?1.5:1);
  target.hp=Math.max(0,target.hp-dealt); target.flash=.2; return dealt;
}
export function activate(p,type) {
  if(!roster[p.kind].moves.includes(type)||p.hp<=0||p.bat>0||p.stun>0||p.cd[type]>0)return false;
  if((type==='knife'||type==='blood')&&p.lunge>0)return false;
  if(['katana','dagger','volley'].includes(type)&&p.attack>0)return false;
  if(type==='knife'){p.cd.knife=2;p.attack=.24;}
  if(type==='blood'){p.cd.blood=5;p.lunge=.23;p.lungeHit=false;}
  if(type==='cloak'){p.cd.cloak=20;p.cloak=3;}
  if(type==='bat'){if(p.lunge>0)return false;p.bat=10;p.attack=0;p.vy=-100;p.ground=false;}
  if(['katana','dagger','volley'].includes(type)){p.cd[type]=cooldowns[type];p.attack=type==='volley'?.35:.24;}
  p.attackType=type;return true;
}
export function bloodHit(p,target) {
  if(p.lungeHit)return null;
  p.lungeHit=true;
  const amount=p.cloak>0?3:5;
  const dealt=damage(target,amount);
  const healed=Math.min(amount,p.max-p.hp);p.hp+=healed;
  return {dealt,healed};
}
export function finishLunge(p) {p.lunge=0;if(!p.lungeHit)p.stun=.5;}
export function knifeHit(p,target) {return damage(target,p.cloak>0?2:3);}
export function daggerHit(p,target){
  const backstab=(p.x-target.x)*target.dir<0;
  if(backstab){p.backstab=.5;target.backstab=.5;}
  return {dealt:damage(target,backstab?15:1),backstab};
}
export function radius(p){return p.bat>0?14:25;}
export function bodyHeight(p){return p.bat>0?28:82;}
export function newVolley(owner,angle){return {owner,angle,hits:0,launched:0,elapsed:0};}
export function volleyHit(volley,target){if(volley.hits>=3)return 0;return damage(target,3+volley.hits++);}
// Swept segment/AABB intersection avoids tunneling even at a low frame rate.
export function projectileHits(x0,y0,x1,y1,target){
  let low=0,high=1;
  for(const [start,delta,min,max] of [[x0,x1-x0,target.x-radius(target)-4,target.x+radius(target)+4],[y0,y1-y0,target.y-bodyHeight(target)-4,target.y+4]]){
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue;}
    let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);if(low>high)return false;
  }return true;
}
export function botBrain(){return {turn:0,desired:0,recovery:2,windup:0,pending:null,aim:0,nextSpecial:false,jump:0};}
// All timers use simulation time. Facing stays locked throughout attack windup.
export function thinkBot(brain,b,target,dt){
 brain.jump=countdown(brain.jump,dt);brain.recovery=countdown(brain.recovery,dt);
 if(target.cloak>0||b.stun>0){brain.pending=null;brain.windup=0;brain.turn=0;brain.desired=0;return null;}
 if(brain.pending){brain.windup=countdown(brain.windup,dt);if(brain.windup===0){const move=brain.pending;brain.pending=null;brain.recovery=2.8;brain.nextSpecial=!brain.nextSpecial;return move;}return null;}
 const dx=target.x-b.x,desired=dx>=0?1:-1;
 if(desired!==b.dir){if(brain.desired!==desired){brain.desired=desired;brain.turn=0;}brain.turn+=dt;if(brain.turn>=.8){b.dir=desired;brain.turn=0;}return null;}
 brain.turn=0;brain.desired=desired;
 if(brain.recovery>0)return null;
 const special=b.kind==='assassin'?'volley':'blood',basic=b.kind==='assassin'?'katana':'knife';
 let move=brain.nextSpecial?special:basic;
 const range=move==='volley'?520:move==='blood'?220:move==='katana'?120:90;
 if(b.cd[move]===0&&Math.abs(dx)<range&&Math.abs(target.y-b.y)<(move==='volley'?220:70)){brain.pending=move;brain.windup=.6;brain.aim=Math.atan2((target.y-bodyHeight(target)/2)-(b.y-42),target.x-b.x);}
 return null;
}

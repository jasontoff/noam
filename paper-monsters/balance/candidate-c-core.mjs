export const platforms = [
  {x:85,y:615,w:1110,h:100}, {x:250,y:455,w:230,h:22},
  {x:800,y:455,w:230,h:22}, {x:530,y:325,w:220,h:22}
];
export const roster={
 vampire:{name:'Vampire',hp:90,max:110,moves:['knife','blood','cloak','bat']},
 assassin:{name:'Assassin',hp:80,max:80,moves:['katana','dagger','volley']},
 barbarian:{name:'Barbarian',hp:120,max:120,moves:['heavy','combo','rampage']},
 dummy:{name:'Patchwork',hp:100,max:100,moves:['knife']}
};
export const cooldowns={knife:2,blood:5,cloak:20,bat:30,katana:3,dagger:5,volley:12,heavy:4,combo:45,rampage:60};
export function fighter(bot=false,kind=bot?'dummy':'vampire') {
  const def=roster[kind];
  return {kind,x:bot?935:345,y:615,vx:0,vy:0,dir:bot?-1:1,hp:def.hp,max:def.max,
    bot,ground:true,jumps:0,cloak:0,bat:0,stun:0,flash:0,attack:0,attackType:'',backstab:0,lunge:0,lungeHit:false,rampage:0,rampageHit:false,penaltyStun:0,slow:0,axe:null,axeFlash:0,axeSide:1,
    cd:Object.fromEntries(def.moves.map(key=>[key,0]))};
}
const countdown=(value,dt)=>value-dt<1e-9?0:value-dt;
export function tickTimers(p,dt) {
  for(const key of Object.keys(p.cd)) p.cd[key]=countdown(p.cd[key],dt);
  for(const key of ['cloak','stun','flash','attack','backstab','axeFlash']) p[key]=countdown(p[key],dt);
  const stunnedTime=Math.min(dt,p.penaltyStun);p.penaltyStun=countdown(p.penaltyStun,dt);p.slow=countdown(p.slow,dt-stunnedTime);
  if(p.rampage>0){p.rampage=countdown(p.rampage,dt);if(!p.rampage&&!p.rampageHit){p.stun=Math.max(p.stun,3);p.penaltyStun=3;p.slow=5;p.axe=null;}}
  if(p.bat>0){ p.bat=countdown(p.bat,dt); if(!p.bat){p.cd.bat=30;p.vy=0;} }
}
export function damage(target,amount,attacker=null) {
  const dealt=amount*(attacker?.rampage>0?1.5:1)*(target.rampage>0?.8:1)*(target.bat>0?1.5:1);
  if(attacker?.rampage>0&&target.hp>0&&dealt>0)attacker.rampageHit=true;
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
  if(type==='heavy'||type==='combo'){if(p.axe)return false;p.cd[type]=cooldowns[type];p.axe={type,elapsed:0,swings:0,hits:0,dir:p.dir};p.axeSide=p.dir;}
  if(type==='rampage'){p.cd.rampage=60;p.rampage=3;p.rampageHit=false;}
  if(type!=='rampage')p.attackType=type;return true;
}
export function bloodHit(p,target) {
  if(p.lungeHit)return null;
  p.lungeHit=true;
  const amount=p.cloak>0?3:5;
  const dealt=damage(target,amount,p);
  const healed=Math.min(amount,p.max-p.hp);p.hp+=healed;
  return {dealt,healed};
}
export function finishLunge(p) {p.lunge=0;if(!p.lungeHit)p.stun=.5;}
export function knifeHit(p,target) {return damage(target,p.cloak>0?2:3,p);}
export function daggerHit(p,target){
  const backstab=(p.x-target.x)*target.dir<0;
  if(backstab){p.backstab=.5;target.backstab=.5;}
  return {dealt:damage(target,backstab?15:1,p),backstab};
}
export function radius(p){return p.bat>0?14:25;}
export function bodyHeight(p){return p.bat>0?28:82;}
export function newVolley(owner,angle){return {owner,angle,hits:0,launched:0,elapsed:0};}
export function volleyHit(volley,target){if(volley.hits>=3)return 0;return damage(target,3+volley.hits++,volley.owner);}
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
 if(b.axe)return null;
 if(brain.pending){brain.windup=countdown(brain.windup,dt);if(brain.windup===0){const move=brain.pending;brain.pending=null;brain.recovery=2.8;brain.nextSpecial=!brain.nextSpecial;return move;}return null;}
 const dx=target.x-b.x,desired=dx>=0?1:-1;
 if(desired!==b.dir){if(brain.desired!==desired){brain.desired=desired;brain.turn=0;}brain.turn+=dt;if(brain.turn>=.8){b.dir=desired;brain.turn=0;}return null;}
 brain.turn=0;brain.desired=desired;
 if(brain.recovery>0)return null;
 const special=b.kind==='assassin'?'volley':b.kind==='barbarian'?'combo':'blood',basic=b.kind==='assassin'?'katana':b.kind==='barbarian'?'heavy':'knife';
 let move=brain.nextSpecial&&b.cd[special]===0?special:basic;
 const range=move==='volley'?520:move==='blood'?220:move==='katana'?120:(move==='heavy'||move==='combo')?140:90;
 if(b.cd[move]===0&&Math.abs(dx)<range&&Math.abs(target.y-b.y)<(move==='volley'?220:70)){brain.pending=move;brain.windup=.6;brain.aim=Math.atan2((target.y-bodyHeight(target)/2)-(b.y-42),target.x-b.x);}
 return null;
}

export function moveSpeed(p){
 if(p.stun>0)return 0;
 const base=p.kind==='barbarian'?(p.rampage>0?264:216):240;
 return base*(p.slow>0?.55:1)*(p.axe?.type==='combo'?.3:p.axe?.type==='heavy'?.55:1);
}
// Damage is checked at the impact instant, not activation: targets can leave the arc.
export function stepAxe(p,target,dt){
 const axe=p.axe;if(!axe)return [];
 if(p.hp<=0||p.stun>0){p.axe=null;return [];}
 axe.elapsed+=dt;const impacts=[],total=axe.type==='heavy'?1:5;
 const due=()=>axe.type==='heavy'?.35:.35+axe.swings*.5;
 while(axe.swings<total&&axe.elapsed+1e-9>=due()){
  const side=axe.dir*(axe.type==='combo'&&axe.swings%2?-1:1);
  p.axeSide=side;p.axeFlash=.22;p.attack=.22;
  const dx=target.x-p.x,vertical=Math.abs((p.y-bodyHeight(p)/2)-(target.y-bodyHeight(target)/2));
  const hit=(axe.type==='combo'||dx*side>=-12)&&Math.abs(dx)<(axe.type==='heavy'?150:135)+radius(target)&&vertical<(bodyHeight(p)+bodyHeight(target))*.5+(axe.type==='heavy'&&target.y<p.y?35:0);
  let dealt=0;if(hit){const base=axe.type==='heavy'?10:2+axe.hits*2;axe.hits++;dealt=damage(target,base,p);}
  impacts.push({hit,dealt,side,swing:axe.swings+1});axe.swings++;
 }
 const duration=axe.type==='heavy'?.7:2.65;
 if(axe.elapsed>=duration)p.axe=null;
 return impacts;
}

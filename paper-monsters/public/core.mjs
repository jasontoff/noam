export const platforms = [
  {x:85,y:615,w:1110,h:100}, {x:250,y:455,w:230,h:22},
  {x:800,y:455,w:230,h:22}, {x:530,y:325,w:220,h:22}
];
export function fighter(bot=false) {
  return {x:bot?935:345,y:615,vx:0,vy:0,dir:bot?-1:1,hp:bot?100:90,max:bot?100:110,
    bot,ground:true,jumps:0,cloak:0,bat:0,stun:0,flash:0,attack:0,lunge:0,lungeHit:false,
    cd:{knife:0,blood:0,cloak:0,bat:0}};
}
const countdown=(value,dt)=>value-dt<1e-9?0:value-dt;
export function tickTimers(p,dt) {
  for(const key of Object.keys(p.cd)) p.cd[key]=countdown(p.cd[key],dt);
  for(const key of ['cloak','stun','flash','attack']) p[key]=countdown(p[key],dt);
  if(p.bat>0){ p.bat=countdown(p.bat,dt); if(!p.bat){p.cd.bat=30;p.vy=0;} }
}
export function damage(target,amount) {
  const dealt=amount*(target.bat>0?1.5:1);
  target.hp=Math.max(0,target.hp-dealt); target.flash=.2; return dealt;
}
export function activate(p,type) {
  if(p.hp<=0 || p.bat>0 || p.stun>0 || p.cd[type]>0) return false;
  // Cloak may overlap other attacks. A lunge and knife cannot start together.
  if((type==='knife'||type==='blood') && p.lunge>0) return false;
  if(type==='knife'){p.cd.knife=2;p.attack=.24;}
  if(type==='blood'){p.cd.blood=5;p.lunge=.23;p.lungeHit=false;}
  if(type==='cloak'){p.cd.cloak=20;p.cloak=3;}
  if(type==='bat'){if(p.lunge>0)return false;p.bat=10;p.attack=0;p.vy=-100;p.ground=false;}
  return true;
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
export function radius(p){return p.bat>0?14:25;}
export function bodyHeight(p){return p.bat>0?28:82;}

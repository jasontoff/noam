import fs from 'node:fs';
import vm from 'node:vm';
const mechanics=await import(process.env.MECHANICS|| (process.env.BASELINE?'./baseline-core.mjs':'../public/core.mjs'));

// Uses the shipped game update, physics, projectile, attack, and cooldown functions.
// Replace ONLY practice-bot input with a second scripted player, including its bat controls.
const source=fs.readFileSync(new URL('../public/game.mjs',import.meta.url),'utf8')
 .replace(/^import .*\n/,'')
 .replace("bot.vx=0;\n if(mode==='spar'){","bot.vx=simBotVx;\n if(mode==='spar'){")
 .replace('if(a===p&&a.bat>0){','if(a!==p&&a.bat>0){a.vx=simBotVx;a.vy=simBotVy;}else if(a===p&&a.bat>0){')
 .replace('if(!a.bot&&!a.axe&&Math.abs(a.vx)>1&&a.lunge<=0)', 'if(!a.axe&&Math.abs(a.vx)>1&&a.lunge<=0)')
 .replace('function hitEffect(target,n){','function hitEffect(target,n){recordDamage(target,n);');
const script=new vm.Script(source);
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function environment(){
 const drawing=new Proxy({},{get:(_,key)=>()=>key==='createLinearGradient'?{addColorStop(){}}:undefined,set:()=>true});
 const elements=new Map();const el=s=>{if(!elements.has(s))elements.set(s,{style:{},focus(){},getContext:()=>drawing,classList:{toggle(){}},setAttribute(){},addEventListener(){}});return elements.get(s);};
 const sandbox={...mechanics,console,Math,document:{querySelector:el,querySelectorAll:()=>[],createElement:()=>el('canvas'),addEventListener(){}},window:{addEventListener(){}},requestAnimationFrame(){},simBotVx:0,simBotVy:0,recordDamage:()=>{}};
 vm.createContext(sandbox);script.runInContext(sandbox);
 const api=vm.runInContext(`({
  reset(a,b,side){sound=false;selected=a;botChoice=b;mode='dummy';resetFighters();running=true;paused=false;p.x=side?935:345;bot.x=side?345:935;p.dir=side?-1:1;bot.dir=-p.dir;return [p,bot];},
  step(dt,moveA,moveB,flyA,flyB){keys.clear();if(moveA<0)keys.add('KeyA');if(moveA>0)keys.add('KeyD');if(flyA<0)keys.add('KeyW');if(flyA>0)keys.add('KeyS');simBotVx=moveB*(bot.bat>0?285:moveSpeed(bot));simBotVy=flyB*260;update(dt);particles=[];labels=[];},
  cast(a,b,type,angle){return attackWith(a,b,type,angle);},jump(a){jump(a);}
 })`,sandbox);
 return {api,sandbox};
}
const profiles={
 brawler:{reaction:.16,error:.12,dodge:false,jump:.01,spacing:false},
 tactical:{reaction:.13,error:.07,dodge:true,jump:.06,spacing:true},
 mobile:{reaction:.23,error:.18,dodge:true,jump:.32,spacing:true}
};
function controller(actor,enemy,style,random,api,stats){
 const cfg=profiles[style];let next=0,move=0,fly=0,jumpReady=0,perceivedDir=actor.dir;
 return function decide(t){
  if(t<next)return [move,fly];next=t+cfg.reaction*(.7+random()*.6);fly=0;
  const dx=enemy.x-actor.x,dist=Math.abs(dx),dy=enemy.y-actor.y,sign=Math.sign(dx)||perceivedDir;
  if(actor.stun>0){move=0;return [0,0];}
  if(actor.bat>0){move=actor.x<180?1:actor.x>1100?-1:-sign;fly=actor.y>290?-1:actor.y<230?1:0;return [move,fly];}
  if(enemy.cloak>0){move=0;return [0,0];}
  const ready=type=>actor.cd[type]===0;
  const desired=style==='brawler'?48:actor.kind==='assassin'?105:actor.kind==='barbarian'?70:65;
  move=dist>desired?sign:0;
  const threat=enemy.axe||enemy.lunge>0||enemy.attackType==='volley'&&enemy.attack>0;
  if(cfg.dodge&&threat&&dist<200){move=-sign;if(actor.ground&&t>jumpReady&&random()<.65){api.jump(actor);jumpReady=t+1.1;}}
  if(cfg.spacing&&!actor.axe&&dist<140&&!threat){const primary=actor.kind==='vampire'?'knife':actor.kind==='assassin'?'katana':'heavy';if(!ready(primary)&&!(actor.kind==='vampire'&&ready('blood')))move=dist<110?-sign:0;}
  if(actor.ground&&t>jumpReady&&(dy<-70||(!actor.axe&&random()<cfg.jump))){api.jump(actor);jumpReady=t+1.1;}
  if(actor.axe){move=dist>48?sign:0;}
  if(!actor.axe&&actor.lunge<=0){perceivedDir=sign;actor.dir=sign;}
  const aim=Math.atan2(dy-(mechanics.bodyHeight(enemy)/2-42)+enemy.vy*.08,dx+enemy.vx*.1)+(random()-.5)*cfg.error*2;
  const cast=type=>{if(api.cast(actor,enemy,type,aim)){stats.attempts[type]=(stats.attempts[type]||0)+1;return true;}return false;};
  if(Math.abs(dy)>75&&actor.kind!=='assassin')return [move,fly];
  if(actor.kind==='vampire'){
   if(cfg.dodge&&ready('cloak')&&actor.hp<70&&dist<180&&threat)cast('cloak');
   if(style==='mobile'&&ready('bat')&&actor.hp<30&&actor.cd.blood>2&&enemy.axe)cast('bat');
   if(dist<230&&ready('blood')&&random()>.08)cast('blood');
   if(dist<92&&ready('knife'))cast('knife');
  }else if(actor.kind==='assassin'){
   if(dist<65&&(actor.x-enemy.x)*enemy.dir<0&&ready('dagger'))cast('dagger');
   if(dist<137&&Math.abs(dy)<70&&ready('katana'))cast('katana');
   if(dist<650&&ready('volley'))cast('volley');
   if(dist<65&&Math.abs(dy)<70&&ready('dagger')&&actor.cd.katana>.3)cast('dagger');
  }else{
   if(dist<(cfg.spacing?110:145)&&(ready('heavy')||ready('combo'))&&ready('rampage'))cast('rampage');
   if(dist<(cfg.spacing?95:145)&&ready('combo'))cast('combo');
   if(dist<(cfg.spacing?110:155)&&ready('heavy'))cast('heavy');
  }
  // Do not instantly reverse walking facing after an attack; movement direction uses real physics.
  if(actor.x<125&&move<0||actor.x>1155&&move>0)move=sign;
  return [move,fly];
 };
}
function match(a,b,styleA,styleB,side,seed,role=0){
 const {api,sandbox}=environment(),slots=api.reset(role?b:a,role?a:b,side),actors=role?[slots[1],slots[0]]:slots,random=rng(seed);
 const stats=actors.map(()=>({damage:0,healing:0,attempts:{},penalties:0,bloodMisses:0}));
 sandbox.recordDamage=(target,n)=>{stats[target===actors[0]?1:0].damage+=n;};
 const originalBlood=sandbox.bloodHit;sandbox.bloodHit=(actor,target)=>{const result=originalBlood(actor,target);if(result)stats[actor===actors[0]?0:1].healing+=result.healed;return result;};
 const controls=[controller(actors[0],actors[1],styleA,random,api,stats[0]),controller(actors[1],actors[0],styleB,random,api,stats[1])];
 let t=0;const dt=1/60;for(;t<150&&actors.every(p=>p.hp>0);t+=dt){
  // Alternate input resolution order to avoid assigning every simultaneous strike to one side.
  let input=[];for(const i of ((Math.floor(t/dt)+seed)%2?[1,0]:[0,1]))input[i]=controls[i](t);
  const before=actors.map(p=>[p.penaltyStun,p.stun]);api.step(dt,input[role?1:0][0],input[role?0:1][0],input[role?1:0][1],input[role?0:1][1]);
  actors.forEach((p,i)=>{if(before[i][0]===0&&p.penaltyStun>0)stats[i].penalties++;if(p.kind==='vampire'&&before[i][1]===0&&p.stun>0)stats[i].bloodMisses++;});
 }
 const winner=actors[0].hp<=0?(actors[1].hp<=0?'draw':b):actors[1].hp<=0?a:'timeout';
 return {a,b,styleA,styleB,side,role,seed,winner,seconds:+t.toFixed(2),hp:actors.map(p=>+p.hp.toFixed(2)),stats};
}
const seedOffset=Number(process.env.SEED_OFFSET||0);
const kinds=['vampire','assassin','barbarian'],styles=Object.keys(profiles),samples=Number(process.env.SAMPLES||4),results=[];
for(let i=0;i<kinds.length;i++)for(let j=i+1;j<kinds.length;j++)for(const a of styles)for(const b of styles)for(let side=0;side<2;side++)for(let role=0;role<2;role++)for(let n=1;n<=samples;n++)results.push(match(kinds[i],kinds[j],a,b,side,seedOffset+1700+n*317+side*97,role));
// Mirror checks verify side/order biases, with equal character identities counted by surviving actor.
for(const kind of kinds)for(const style of styles)for(let side=0;side<2;side++)for(let n=1;n<=3;n++)results.push({...match(kind,kind,style,style,side,seedOffset+n*991+17),mirror:true});
const summary={matches:results.length,seedOffset,mechanics:process.env.MECHANICS||'../public/core.mjs',controllerVersion:2,secondsLimit:150,profiles,matchups:{},byStyle:{},mirror:{}};
for(const r of results){
 if(r.mirror){const m=summary.mirror[r.a]??={first:0,second:0,timeout:0};m[r.hp[0]>0&&r.hp[1]<=0?'first':r.hp[1]>0&&r.hp[0]<=0?'second':'timeout']++;continue;}
 const key=r.a+' vs '+r.b;
 for(const [obj,k]of [[summary.matchups,key],[summary.byStyle,key+' | '+r.styleA+' vs '+r.styleB]]){const row=obj[k]??={n:0,winsA:0,winsB:0,timeouts:0,seconds:0,damage:[0,0],healing:[0,0],penalties:[0,0],bloodMisses:[0,0]};row.n++;row[r.winner===r.a?'winsA':r.winner===r.b?'winsB':'timeouts']++;row.seconds+=r.seconds;for(let i=0;i<2;i++){row.damage[i]+=r.stats[i].damage;row.healing[i]+=r.stats[i].healing;row.penalties[i]+=r.stats[i].penalties;row.bloodMisses[i]+=r.stats[i].bloodMisses;}}
}
for(const rows of [summary.matchups,summary.byStyle])for(const row of Object.values(rows)){row.seconds=+(row.seconds/row.n).toFixed(1);row.damage=row.damage.map(n=>+(n/row.n).toFixed(1));row.healing=row.healing.map(n=>+(n/row.n).toFixed(1));}
const output=process.argv[2]||'paper-monsters/balance/results.json';fs.writeFileSync(output,JSON.stringify({summary,results},null,2));console.log(JSON.stringify(summary,null,2));

import {platforms,fighter,tickTimers,damage,activate,bloodHit,finishLunge,knifeHit,radius,bodyHeight,roster,cooldowns,daggerHit,newVolley,volleyHit,projectileHits,botBrain,thinkBot} from './core.mjs';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
const $=s=>document.querySelector(s);
let p=fighter(),bot=fighter(true,'vampire'),running=false,paused=false,mode='spar',time=0,last=0,shake=0;
let particles=[],labels=[],keys=new Set(),sound=true,audio,musicClock=0,musicStep=0;
let selected='vampire',botChoice='random',brain=botBrain(),projectiles=[],volleys=[];
let aim={pointer:false,x:950,y:570,elevation:0};
const rand=(a,b)=>a+Math.random()*(b-a);
// A repeatable paper grain, drawn once and shared by the scenery and cutouts.
let seed=218;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const grain=document.createElement('canvas');grain.width=256;grain.height=256;
const gc=grain.getContext('2d');for(let n=0;n<15000;n++){gc.fillStyle=random()>.5?'#fff2':'#0002';gc.fillRect(random()*256,random()*256,random()*2+.3,.5);}
const pattern=ctx.createPattern(grain,'repeat');
function poly(points,color,stroke=null,shadow=true){ctx.save();if(shadow){ctx.shadowColor='#100b2155';ctx.shadowOffsetX=4;ctx.shadowOffsetY=6;ctx.shadowBlur=3;}ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.shadowColor='transparent';if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}ctx.clip();ctx.globalAlpha=.32;ctx.fillStyle=pattern;ctx.fillRect(-1500,-1500,4000,4000);ctx.restore();}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function line(x,y,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function tower(x,y,w,h,color){poly([[x,y+h],[x,y],[x+w*.5,y-w*.75],[x+w,y],[x+w,y+h]],color,null,false);for(let yy=y+25;yy<y+h-20;yy+=50){ctx.fillStyle='#c6a16b33';ctx.fillRect(x+w*.42,yy,7,19);}}
const bg=document.createElement('canvas');bg.width=1280;bg.height=720;
// Render the static theatre into a cached layer using the same drawing helpers.
function scenery(){
 ctx.fillStyle='#38313e';ctx.fillRect(0,0,1280,720);
 let sky=ctx.createLinearGradient(0,0,0,620);sky.addColorStop(0,'#302c3a');sky.addColorStop(1,'#8f7067');ctx.fillStyle=sky;ctx.fillRect(0,0,1280,650);
 ellipse(670,216,116,116,'#d5c5a4');ellipse(680,210,103,103,'#ddceb0');
 ctx.save();ctx.beginPath();ctx.arc(670,216,116,0,7);ctx.clip();for(let i=0;i<35;i++)ellipse(570+random()*200,115+random()*200,4+random()*17,3+random()*12,'#ac987833');ctx.fillStyle=pattern;ctx.globalAlpha=.3;ctx.fillRect(540,80,260,260);ctx.restore();
 for(let i=0;i<70;i++){let x=random()*1280,y=70+random()*330;ctx.fillStyle='#e5d3ac66';ctx.fillRect(x,y,1.5,1.5);}
 poly([[0,340],[50,300],[130,315],[200,270],[290,310],[380,265],[490,300],[530,270],[580,310],[660,280],[800,300],[870,270],[950,300],[1030,260],[1110,290],[1200,250],[1280,290],[1280,720],[0,720]],'#61525b',null,false);
 for(let i=0;i<10;i++)tower(i*145-30,300+random()*100,55+random()*35,330,'#4b414e');
 poly([[0,480],[170,410],[310,470],[510,415],[700,460],[850,410],[1020,455],[1180,390],[1280,430],[1280,720],[0,720]],'#453a46',null,false);
 tower(10,240,100,450,'#302a37');tower(1150,215,110,500,'#302a37');tower(85,360,75,300,'#3a303d');tower(1090,340,70,310,'#3a303d');
 // Cut-paper trees framing the stage.
 for(const [x,flip]of [[195,1],[1085,-1]]){ctx.save();ctx.translate(x,0);ctx.scale(flip,1);poly([[0,615],[-8,490],[-42,445],[-66,400],[-46,417],[-35,440],[-11,455],[-15,380],[-30,335],[-7,367],[4,420],[35,389],[50,340],[48,390],[17,433],[13,510],[38,482],[61,463],[49,490],[15,528],[20,615]],'#292733');ctx.restore();}
 // Side curtains, visibly layered and not a flat background.
 poly([[0,0],[118,0],[107,99],[91,153],[61,199],[29,227],[0,232]],'#693946');
 poly([[0,0],[37,0],[32,136],[19,193],[0,214]],'#472b39');
 poly([[1280,0],[1162,0],[1174,99],[1188,153],[1217,199],[1252,227],[1280,232]],'#693946');
 poly([[1280,0],[1243,0],[1248,136],[1261,193],[1280,214]],'#472b39');
 for(const a of platforms){
  if(a.h>30){poly([[a.x,a.y],[a.x+a.w,a.y],[a.x+a.w-8,720],[a.x+10,720]],'#51444c');
   for(let yy=a.y+22;yy<720;yy+=29){line(a.x+8,yy,a.x+a.w-8,yy,'#2e283744',2);for(let xx=a.x+(yy%2)*40;xx<a.x+a.w-20;xx+=80)line(xx,yy,xx,yy+29,'#2e283744',2);}
   for(let x=180;x<1150;x+=180){poly([[x-28,645],[x+28,645],[x+28,716],[x,701],[x-28,716]],'#793f50');poly([[x-8,660],[x+8,660],[x+12,678],[x,689],[x-12,678]],'#b99a78');}
  }else{poly([[a.x+5,a.y+8],[a.x+a.w-7,a.y+8],[a.x+a.w-18,a.y+26],[a.x+22,a.y+30]],'#63535a');poly([[a.x+25,a.y+24],[a.x+45,a.y+25],[a.x+37,a.y+46]],'#403540');poly([[a.x+a.w-45,a.y+24],[a.x+a.w-25,a.y+24],[a.x+a.w-37,a.y+46]],'#403540');}
  poly([[a.x-4,a.y],[a.x+30,a.y-5],[a.x+a.w*.55,a.y-2],[a.x+a.w-4,a.y-5],[a.x+a.w+5,a.y+9],[a.x+2,a.y+12]],'#a99580','#c7b399');
  for(let x=a.x+40;x<a.x+a.w;x+=55)line(x,a.y-1,x+3,a.y+10,'#71606b',1);
 }
 for(const x of [125,1155]){poly([[x-9,615],[x-6,548],[x+6,548],[x+9,615]],'#302836');poly([[x-14,549],[x-20,519],[x+20,519],[x+14,549]],'#99765c');ellipse(x,511,9,17,'#cc9c69');ellipse(x,515,4,10,'#edc994');}
 ctx.save();ctx.globalAlpha=.13;ctx.fillStyle=pattern;ctx.fillRect(0,0,1280,720);ctx.restore();
 bg.getContext('2d').drawImage(canvas,0,0);
}
scenery();
function batShape(x,y,dir,alpha=1){ctx.save();ctx.translate(x,y-14);ctx.scale(dir,1);ctx.globalAlpha=alpha;let flap=Math.sin(time*17)*9;
 poly([[-2,0],[-24,-20-flap],[-46,-12-flap],[-36,4],[-26,0],[-17,10],[-8,7]],'#573344','#b07879');
 poly([[2,0],[24,-20-flap],[46,-12-flap],[36,4],[26,0],[17,10],[8,7]],'#794758','#b07879');
 poly([[-10,8],[-11,-10],[-9,-22],[-2,-13],[4,-14],[12,-23],[13,0],[8,12]],'#282330');ellipse(-4,-5,2,3,'#f0d8a8');ellipse(6,-5,2,3,'#f0d8a8');ctx.restore();}
function vampire(a){if(a.bat>0){batShape(a.x,a.y,a.dir,a.cloak>0?.3:1);return;}
 const walk=Math.sin(time*12)*Math.min(Math.abs(a.vx)/180,1),bob=a.ground?Math.abs(walk)*2:0;
 ctx.save();ctx.translate(a.x,a.y-bob);ctx.scale(a.dir,1);ctx.globalAlpha=a.cloak>0?.23:1;
 if(a.flash>0){ctx.shadowColor='#f8dcb7';ctx.shadowBlur=15;}
 // Each limb is a separate paper piece, animated around its joint.
 poly([[-13,-72],[-33,-58],[-44-Math.abs(walk)*6,-12],[-17,-21],[0,-7],[17,-18],[21,-63]],'#76374c','#ab6671');
 poly([[-23,-58],[-30,-26],[-10,-33],[-8,-65]],'#a25561');
 poly([[-10,-30],[-2,-30],[0+walk*7,-4],[-15+walk*7,0],[-15+walk*7,-5]],'#282431');
 poly([[3,-31],[12,-29],[14-walk*7,-6],[26-walk*7,0],[9-walk*7,0],[4-walk*7,-8]],'#302735');
 poly([[-14,-64],[10,-64],[17,-29],[-16,-27]],'#36303b','#65505c');
 poly([[-10,-61],[1,-48],[7,-62]],'#d8c6a9');poly([[-1,-56],[3,-54],[1,-40],[-3,-46]],'#a55262');
 for(let y=-43;y<-30;y+=6)ellipse(2,y,1,1,'#b69a75');
 const arm=a.attack>0?32:14;poly([[8,-60],[18,-56],[arm,-39],[arm-5,-34],[9,-46]],'#332b39');
 poly([[arm-5,-39],[arm+2,-40],[arm+6,-34],[arm,-29],[arm-5,-33]],'#dcc4a2');
 if(a.attack>0){poly([[arm+2,-35],[arm+37,-43],[arm+24,-31],[arm+5,-29]],'#d7d4bf');line(arm+4,-43,arm+8,-25,'#b49b6c',4);}
 poly([[-13,-67],[-21,-83],[-12,-80],[-13,-96],[9,-99],[20,-89],[17,-70],[5,-63]],'#e0cfb1','#aa907e');
 poly([[-13,-87],[-22,-98],[-7,-99],[-12,-107],[4,-103],[12,-109],[23,-100],[20,-84],[11,-92],[0,-86]],'#24222e');
 poly([[14,-81],[25,-77],[16,-75]],'#e0cfb1');line(4,-85,12,-83,'#48323e',2);ellipse(9,-80,2,2,'#8f3e50');line(7,-73,15,-72,'#834d52',1);poly([[12,-73],[16,-73],[14,-67]],'#fff0cf',null,false);
 poly([[-12,-63],[-26,-78],[-23,-59],[-4,-54]],'#8f465b');poly([[8,-61],[21,-70],[16,-54]],'#8f465b');
 ctx.restore();if(a.cloak>0){ellipse(a.x,a.y+2,23,3,'#d6c5e128');}}
function assassin(a){
 const walk=Math.sin(time*12)*Math.min(Math.abs(a.vx)/180,1),thrust=a.attack>0;
 ctx.save();ctx.translate(a.x,a.y);ctx.scale(a.dir,1);
 poly([[-15,-62],[-35,-52],[-45-Math.abs(walk)*5,-24],[-23,-34],[-6,-39]],'#365958','#71958a');
 poly([[-13,-29],[-3,-29],[-2+walk*8,-5],[-18+walk*8,0],[-18+walk*8,-5]],'#252c31');
 poly([[2,-30],[13,-27],[16-walk*8,-6],[29-walk*8,0],[9-walk*8,0]],'#303d40');
 poly([[-16,-66],[11,-67],[21,-30],[-19,-27]],'#34464a','#69847d');
 poly([[-12,-62],[15,-51],[17,-42],[-14,-53]],'#89947a');
 poly([[-18,-36],[18,-38],[20,-30],[-19,-27]],'#b08a67');
 // Hood, mask, and narrow gold eye slit.
 poly([[-20,-72],[-22,-92],[-9,-110],[12,-104],[23,-83],[16,-66]],'#31494b','#7c9b8b');
 poly([[-10,-86],[13,-91],[18,-76],[-6,-70]],'#c8b99c');
 poly([[-10,-80],[20,-82],[13,-67],[-8,-69]],'#293638');
 line(3,-85,13,-85,'#e6c482',2);poly([[-19,-87],[-8,-102],[12,-100],[-3,-91]],'#466765');
 const hand=thrust?36:17;poly([[10,-63],[20,-59],[hand,-40],[hand-5,-33],[8,-49]],'#435b5a');
 poly([[hand-4,-40],[hand+4,-40],[hand+8,-34],[hand,-30]],'#baaa8f');
 // Long katana and a visibly shorter reverse-grip dagger have distinct silhouettes.
 if(a.attackType==='dagger'&&thrust){poly([[hand+4,-36],[hand+35,-39],[hand+26,-31],[hand+4,-31]],a.backstab>0?'#f5ce83':'#b7ccbf');}
 else if(a.attackType!=='volley'||!thrust){const tip=thrust?95:39;poly([[hand+4,-36],[tip,-60],[tip+7,-65],[tip+1,-53],[hand+8,-29]],'#d3dac4','#f1e0b8');line(hand,-42,hand+13,-26,'#bba277',4);}
 poly([[-16,-63],[-22,-57],[-12,-42],[-4,-43]],'#2b3b40');ctx.restore();
}
function drawFighter(a){a.kind==='assassin'?assassin(a):vampire(a);}
function aimAngle(){if(aim.pointer)return Math.atan2(aim.y-(p.y-42),aim.x-p.x);return p.dir===1?aim.elevation:Math.PI-aim.elevation;}
function drawAim(){if(p.kind!=='assassin'||!running)return;const angle=aimAngle(),x=p.x,y=p.y-42;
 ctx.save();ctx.setLineDash([5,7]);line(x,y,x+Math.cos(angle)*155,y+Math.sin(angle)*155,'#bdd5b38c',1.5);ctx.setLineDash([]);
 let tx=x+Math.cos(angle)*155,ty=y+Math.sin(angle)*155;ctx.strokeStyle='#dfd5a9';ctx.beginPath();ctx.arc(tx,ty,7,0,7);ctx.stroke();line(tx-11,ty,tx+11,ty,'#dfd5a9');line(tx,ty-11,tx,ty+11,'#dfd5a9');ctx.restore();}
function textLabel(x,y,text,color='#f1ddba'){labels.push({x,y,text,color,life:1.1});}
function burst(x,y,color,n=10){for(let i=0;i<n;i++)particles.push({x,y,vx:rand(-120,120),vy:rand(-150,20),life:rand(.25,.7),color,rot:rand(0,6)});}
function tone(freq,duration,type='triangle',vol=.06,slide=1){if(!sound||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(25,freq*slide),audio.currentTime+duration);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function noise(duration=.12,vol=.06){if(!sound||!audio)return;let b=audio.createBuffer(1,audio.sampleRate*duration,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);let s=audio.createBufferSource(),g=audio.createGain(),f=audio.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=1600;g.gain.value=vol;s.connect(f);f.connect(g);g.connect(audio.destination);s.start();}
function hitEffect(target,n){burst(target.x,target.y-bodyHeight(target)/2,'#c28d83');textLabel(target.x,target.y-bodyHeight(target)-10,'−'+n,'#f3b1a4');shake=5;noise();tone(90,.1,'triangle',.06,.4);}
function overlap(a,b,reach){return Math.abs(a.x-b.x)<reach+radius(b)&&Math.abs((a.y-bodyHeight(a)/2)-(b.y-bodyHeight(b)/2))<(bodyHeight(a)+bodyHeight(b))*.5;}
function attackWith(a,target,type,angle){if(!activate(a,type))return false;
 if(['knife','katana','dagger'].includes(type)){
  noise(.08,.03);const reach=type==='katana'?115:type==='dagger'?43:70;
  if((target.x-a.x)*a.dir>=-5&&overlap(a,target,reach)){
   if(type==='dagger'){const result=daggerHit(a,target);hitEffect(target,result.dealt);if(result.backstab){textLabel(target.x,target.y-130,'BACKSTAB! · 15','#f4d48b');burst(target.x,target.y-45,'#e6bc74',25);shake=11;tone(760,.22,'triangle',.06,.5);}}
   else hitEffect(target,type==='katana'?damage(target,5):knifeHit(a,target));
  }
 }
 if(type==='blood'){tone(220,.18,'triangle',.05,.4);burst(a.x,a.y-35,'#aa6573',5);}
 if(type==='cloak'){burst(a.x,a.y-40,'#bba9c7',22);tone(420,.5,'sine',.045,.4);}
 if(type==='bat'){burst(a.x,a.y-40,'#c3a3b5',25);tone(300,.3,'triangle',.06,2);}
 if(type==='volley'){if(!a.bot&&Math.abs(Math.cos(angle))>.01)a.dir=Math.sign(Math.cos(angle));volleys.push(newVolley(a,angle));noise(.13,.035);}
 return true;
}
function use(type){if(!running||paused)return;attackWith(p,bot,type,aimAngle());}
function stepProjectiles(dt){
 for(const v of volleys){v.elapsed+=dt;while(v.launched<3&&v.elapsed>=v.launched*.14){const dx=Math.cos(v.angle),dy=Math.sin(v.angle);projectiles.push({x:v.owner.x+dx*30,y:v.owner.y-42+dy*30,vx:dx*680,vy:dy*680,life:1.35,volley:v});v.launched++;}}
 volleys=volleys.filter(v=>v.launched<3);
 for(const knife of projectiles){const x0=knife.x,y0=knife.y;knife.life-=dt;knife.x+=knife.vx*dt;knife.y+=knife.vy*dt;const target=knife.volley.owner===p?bot:p;
  if(projectileHits(x0,y0,knife.x,knife.y,target)){hitEffect(target,volleyHit(knife.volley,target));knife.life=0;}
 }
 projectiles=projectiles.filter(k=>k.life>0&&k.x>20&&k.x<1260&&k.y>70&&k.y<710);
}
function stepLunge(a,target,dt){if(a.lunge<=0)return;
 if(overlap(a,target,37)&&!a.lungeHit){const r=bloodHit(a,target);hitEffect(target,r.dealt);if(r.healed>0){textLabel(a.x,a.y-110,'+'+r.healed,'#c4d5a8');tone(620,.24,'sine',.04,1.5);}burst(a.x,a.y-40,'#8eac83',8);}
 a.lunge-=dt;if(a.lunge<=0){finishLunge(a);a.vx=0;if(a.stun>0){textLabel(a.x,a.y-115,'MISSED · STUNNED','#decba6');tone(100,.15,'triangle',.035,.65);}}
}
function jump(a){if(a.bat>0||a.stun>0||a.jumps>=2)return;a.vy=-660;a.ground=false;a.jumps++;if(a===p)tone(180,.09,'sine',.025,1.5);burst(a.x,a.y,'#b9a88b',5);}
function physics(a,dt){let oldY=a.y;
 if(a===p&&a.bat>0){a.vx=((keys.has('KeyD')||keys.has('ArrowRight'))-(keys.has('KeyA')||keys.has('ArrowLeft')))*285;a.vy=((keys.has('KeyS')||keys.has('ArrowDown'))-(keys.has('KeyW')||keys.has('ArrowUp')||keys.has('Space')))*260;}
 else a.vy+=1250*dt;
 a.x+=a.vx*dt;a.y+=a.vy*dt;a.x=Math.max(105,Math.min(1175,a.x));
 if(a.bat>0){a.y=Math.max(135,Math.min(610,a.y));}
 else{a.ground=false;if(a.vy>=0)for(const plat of platforms){if(a.x+18>plat.x&&a.x-18<plat.x+plat.w&&oldY<=plat.y+1&&a.y>=plat.y){a.y=plat.y;a.vy=0;a.ground=true;a.jumps=0;break;}}
 if(a.y>690){a.y=615;a.vy=0;a.ground=true;a.jumps=0;}}
 if(!a.bot&&Math.abs(a.vx)>1&&a.lunge<=0)a.dir=Math.sign(a.vx);
}
function update(dt){time+=dt;tickTimers(p,dt);tickTimers(bot,dt);
 if(p.kind==='assassin'){
  const vertical=(keys.has('KeyS')||keys.has('ArrowDown'))-(keys.has('KeyW')||keys.has('ArrowUp'));
  if(vertical){aim.pointer=false;aim.elevation=Math.max(-1.35,Math.min(1.35,aim.elevation+vertical*dt*1.8));}
 }
 if(p.stun>0)p.vx=0;else if(p.lunge>0)p.vx=p.dir*980;else p.vx=((keys.has('KeyD')||keys.has('ArrowRight'))-(keys.has('KeyA')||keys.has('ArrowLeft')))*240;
 bot.vx=0;
 if(mode==='spar'){
  const action=thinkBot(brain,bot,p,dt);
  if(action)attackWith(bot,p,action,brain.aim);
  const dx=p.x-bot.x,dy=p.y-bot.y;
  if(p.cloak===0&&!brain.pending&&bot.stun===0&&bot.lunge<=0&&dx*bot.dir>0){
   if(Math.abs(dx)>72)bot.vx=bot.dir*120;
   if(bot.ground&&dy<-55&&brain.jump===0){jump(bot);brain.jump=.95;}
  }
 }
 if(bot.lunge>0)bot.vx=bot.dir*980;
 physics(p,dt);physics(bot,dt);stepLunge(p,bot,dt);stepLunge(bot,p,dt);stepProjectiles(dt);
 if(p.hp<=0||bot.hp<=0)endRound();
 musicClock-=dt;if(musicClock<=0){musicClock=.4;const melody=[293.66,0,440,349.23,0,329.63,261.63,0,293.66,0,523.25,440,349.23,0,329.63,0];let f=melody[musicStep++%melody.length];if(f)tone(f,.35,'sine',.018,.998);if(musicStep%4===0)tone(73.42,.55,'triangle',.012);}
}
function render(dt){ctx.clearRect(0,0,1280,720);ctx.save();if(shake>0){ctx.translate(rand(-shake,shake),rand(-shake,shake));shake=Math.max(0,shake-dt*35);}ctx.drawImage(bg,0,0);
 // Floating dust and distant paper bats.
 for(let i=0;i<16;i++){let x=(i*89+Math.sin(time*.3+i)*28)%1280,y=210+(i*43)%350+Math.cos(time*.6+i)*9;ellipse(x,y,1.4,1.4,'#e5c59744');}
 for(const a of [p,bot]){ellipse(a.x,Math.min(618,a.y+3),a.bat?15:28,5,'#120e2344');}
 drawFighter(bot);drawFighter(p);drawAim();
 if(brain.pending&&mode==='spar'){ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillStyle='#f0c78a';ctx.fillText('! '+(brain.pending==='volley'?'KNIVES':brain.pending.toUpperCase()),bot.x,bot.y-124);line(bot.x,bot.y-115,bot.x+bot.dir*48,bot.y-115,'#f0c78a',2);}
 for(const a of [p,bot])if(a.backstab>0){ctx.save();ctx.strokeStyle='#f0c57a';ctx.lineWidth=3;const size=35+(1-a.backstab/.5)*45;line(a.x-size/2,a.y-40-size/2,a.x+size/2,a.y-40+size/2,'#f0c57a',3);line(a.x-size/2,a.y-40+size/2,a.x+size/2,a.y-40-size/2,'#f0c57a',3);ctx.restore();}
 for(const k of projectiles){ctx.save();ctx.translate(k.x,k.y);ctx.rotate(Math.atan2(k.vy,k.vx));poly([[-13,-3],[12,0],[-13,3],[-8,0]],k.volley.owner===p?'#d7dfbb':'#d9a286');ctx.restore();}
 if(p.lunge>0){for(let i=1;i<5;i++)line(p.x-p.dir*(30+i*12),p.y-50+i*7,p.x-p.dir*(60+i*18),p.y-50+i*7,'#b16a7c88',3);}
 if(p.attack>0){ctx.save();ctx.translate(p.x,p.y-45);ctx.scale(p.dir,1);ctx.beginPath();ctx.arc(22,0,p.attackType==='katana'?95:p.attackType==='dagger'?36:57,-.8,.7);ctx.strokeStyle='#ead7b2aa';ctx.lineWidth=3;ctx.stroke();ctx.restore();}
 if(p.stun>0){for(let i=0;i<3;i++){const angle=time*8+i*2.1;ctx.fillStyle='#e5c58d';ctx.fillRect(p.x+Math.cos(angle)*23,p.y-116+Math.sin(angle)*5,5,5);}}
 if(p.bat>0){ctx.font='12px Arial';ctx.fillStyle='#e2cbb9';ctx.textAlign='center';ctx.fillText(p.bat.toFixed(1)+'s',p.x,p.y-52);}
 if(!paused){for(const a of particles){a.life-=dt;a.x+=a.vx*dt;a.y+=a.vy*dt;a.vy+=260*dt;}for(const l of labels){l.life-=dt;l.y-=26*dt;}}
 particles=particles.filter(a=>a.life>0);labels=labels.filter(a=>a.life>0);
 for(const a of particles){ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.rot);ctx.globalAlpha=Math.min(1,a.life*3);ctx.fillStyle=a.color;ctx.fillRect(-3,-2,6,4);ctx.restore();}
 for(const l of labels){ctx.globalAlpha=Math.min(1,l.life*3);ctx.font='bold 16px Georgia';ctx.fillStyle=l.color;ctx.textAlign='center';ctx.fillText(l.text,l.x,l.y);}ctx.globalAlpha=1;ctx.restore();
}
const moveInfo={
 knife:['Knife','J','↗','A quick cut.','3 damage','2s cooldown'],
 blood:['Bloodsuck','K','♦','Lunge, bite, replenish.','5 damage · +5 HP','5s cooldown'],
 cloak:['Dark Cloak','L','◌','Disappear for 3 seconds.','Half damage & healing','20s cooldown'],
 bat:['Bat Wings','I','⋈','Fly for 10 seconds.','Smaller · 1.5× damage taken','30s after bat form'],
 katana:['Katana','J','╱','A long, sweeping cut.','5 damage · long reach','1.5s cooldown'],
 dagger:['Dagger','K','✦','Find their blind side.','1 front · 15 from behind','3s cooldown'],
 volley:['Throwing Knives','L','⋙','Aim. Release three knives.','Successful hits: 3 → 4 → 5','7s cooldown']
};
function setupCards(){const abilities=$('.abilities');abilities.classList.toggle('assassin',p.kind==='assassin');
 abilities.innerHTML=roster[p.kind].moves.map(key=>{const m=moveInfo[key];return `<button class="ability ${p.kind==='assassin'?'assassin-move':key==='blood'?'blood':''}" data-ability="${key}"><div class="ability-top"><span class="glyph">${m[2]}</span><kbd>${m[1]}</kbd></div><h3>${m[0]}</h3><p>${m[3]}<br><b>${m[4]}</b></p><footer><span>${m[5]}</span><strong>READY</strong></footer><div class="cooldown"></div></button>`;}).join('');
 for(const b of document.querySelectorAll('[data-ability]'))b.onclick=()=>use(b.dataset.ability);
 $('#rules').textContent=p.kind==='assassin'?'Assassin · 80 HP. Point or tap inside the arena to aim, then press L or the Throwing Knives card. Keyboard: W/S or ↑/↓ tilt the guide; A/D sets facing. A volley locks its aim when fired. Misses never advance its 3 → 4 → 5 hit sequence. Dagger backstabs require the enemy to face away. Changing fighter or opponent resets the round.':'Vampire · Bloodsuck misses stun for 0.5s. Face your target to lunge. Cloak permits attacks: knife deals 2; Bloodsuck deals & heals 3. Bat form locks attacks, while cooldowns keep ticking; its 30s cooldown begins when transformation ends. Changing fighter or opponent resets the round.';
}
function ui(){const fmt=n=>Number.isInteger(n)?n:n.toFixed(1);$('#pname').textContent=roster[p.kind].name.toUpperCase();$('#bname').textContent=roster[bot.kind].name.toUpperCase()+' BOT';$('#php').textContent=fmt(p.hp)+' / '+p.max;$('#bhp').textContent=fmt(bot.hp)+' / '+bot.max;$('#pbar').style.width=(p.hp/p.max*100)+'%';$('#bbar').style.width=(bot.hp/bot.max*100)+'%';$('#startmark').style.display=p.kind==='vampire'?'block':'none';
 $('#pstatus').textContent=p.bat>0?'BAT FORM · '+p.bat.toFixed(1)+'s · 1.5× incoming damage':p.stun>0?'STUNNED · '+p.stun.toFixed(1)+'s':p.cloak>0?'INVISIBLE · '+p.cloak.toFixed(1)+'s · half damage & healing':p.kind==='vampire'?'90 starting HP · 110 maximum':'80 HP · precision & positioning';
 $('#bstatus').textContent=p.cloak>0?'Lost sight of you…':mode==='dummy'?'Standing still · facing '+(bot.dir===1?'right':'left'):brain.pending?'WINDUP · '+moveInfo[brain.pending][0]:brain.turn>0?'Turning… backstab window':brain.recovery>0?'Recovering · '+brain.recovery.toFixed(1)+'s':'Watching for an opening';
 for(const b of document.querySelectorAll('[data-ability]')){let key=b.dataset.ability,active=key==='bat'?p.bat:key==='cloak'?p.cloak:0;b.querySelector('strong').textContent=active>0?active.toFixed(1)+'s ACTIVE':p.bat>0?'BAT FORM':p.cd[key]>0?p.cd[key].toFixed(1)+'s':p.stun>0?'STUNNED':'READY';b.querySelector('.cooldown').style.width=100*p.cd[key]/cooldowns[key]+'%';b.classList.toggle('locked',p.bat>0||p.cd[key]>0||p.stun>0);b.classList.toggle('active',active>0);}
 $('#hint').textContent=p.bat>0?'Fly with WASD / arrows. Attacks recharge while you fly.':p.cloak>0?'The bot cannot see you. Your ghost is visible only to you.':p.kind==='assassin'?'Point / tap to aim · W/S adjusts aim · L throws three knives':'Face your target to lunge. Space twice to double-jump.';
}
function resumeAudio(){if(!sound)return;audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();}
function resetFighters(){p=fighter(false,selected);const identity=botChoice==='random'?(Math.random()<.5?'vampire':'assassin'):botChoice;bot=fighter(true,identity);brain=botBrain();particles=[];labels=[];projectiles=[];volleys=[];keys.clear();aim={pointer:false,x:950,y:570,elevation:0};setupCards();}
function start(){resumeAudio();resetFighters();running=true;paused=false;$('#overlay').hidden=true;$('#pause').hidden=true;$('#pausebutton').textContent='Ⅱ';canvas.focus({preventScroll:true});}
function endRound(){running=false;keys.clear();const won=bot.hp<=0;$('#overlay').innerHTML='<div class="ticket"><span class="eyebrow">REHEARSAL COMPLETE</span><h2>'+ (won?'A well-earned victory.':'One more rehearsal?')+'</h2><p>'+(won?'Your practice opponent takes a bow.':'Every fighter starts with practice.')+'<br>Reset and try another approach.</p><button id="again">Play again →</button><small>YOUR ABILITIES AND HEALTH WILL RESET</small></div>';$('#overlay').hidden=false;$('#again').onclick=start;tone(won?587:196,.6,'triangle',.05,won?1.5:.5);}
function pauseToggle(){if(!running)return;paused=!paused;keys.clear();$('#pause').hidden=!paused;$('#pausebutton').textContent=paused?'▶':'Ⅱ';}
$('#play').onclick=start;$('#reset').onclick=start;$('#pausebutton').onclick=pauseToggle;$('#pause').onclick=pauseToggle;
$('#botmode').onchange=e=>{mode=e.target.value;brain=botBrain();bot.vx=0;bot.lunge=0;projectiles=[];volleys=[];$('#mode-label').textContent=mode==='spar'?'SPARRING':'STANDING STILL';canvas.focus({preventScroll:true});};
function selectionChanged(){if(running)start();else{resetFighters();ui();}}
$('#character').onchange=e=>{selected=e.target.value;selectionChanged();};
$('#botidentity').onchange=e=>{botChoice=e.target.value;selectionChanged();};
$('#sound').onclick=()=>{sound=!sound;if(sound){resumeAudio();tone(440,.2,'sine',.04);}$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(sound));};
function mapping(){return p.kind==='assassin'?{KeyJ:'katana',KeyK:'dagger',KeyL:'volley'}:{KeyJ:'knife',KeyK:'blood',KeyL:'cloak',KeyI:'bat'};}
function pointAim(e){if(p.kind!=='assassin')return;const rect=canvas.getBoundingClientRect();aim.pointer=true;aim.x=(e.clientX-rect.left)*1280/rect.width;aim.y=(e.clientY-rect.top)*720/rect.height;}
canvas.addEventListener('pointermove',pointAim);canvas.addEventListener('pointerdown',e=>{pointAim(e);canvas.focus({preventScroll:true});});
window.addEventListener('keydown',e=>{if(e.target.matches('select,input'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&!e.repeat){pauseToggle();return;}if(!running||paused)return;keys.add(e.code);if(!e.repeat){if(e.code==='Space')jump(p);const move=mapping()[e.code];if(move)use(move);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(running&&!paused)pauseToggle();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)pauseToggle();});
for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(!running||paused)return;keys.add(b.dataset.move);if(b.dataset.move==='Space')jump(p);};const release=()=>keys.delete(b.dataset.move);b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
resetFighters();
function frame(now){const dt=Math.min((now-last)/1000||0,1/30);last=now;if(running&&!paused)update(dt);else if(!paused)time+=dt;render(dt);ui();requestAnimationFrame(frame);}requestAnimationFrame(frame);

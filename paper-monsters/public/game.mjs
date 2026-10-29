import {platforms,fighter,tickTimers,damage,activate,bloodHit,finishLunge,knifeHit,radius,bodyHeight} from './core.mjs';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
const $=s=>document.querySelector(s);
let p=fighter(),bot=fighter(true),running=false,paused=false,mode='spar',time=0,last=0,shake=0;
let particles=[],labels=[],keys=new Set(),sound=false,audio,musicClock=0,musicStep=0;
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
function drawBot(a){ctx.save();ctx.translate(a.x,a.y);ctx.scale(a.dir,1);let w=Math.sin(time*10)*Math.min(Math.abs(a.vx)/100,1);
 poly([[-15,-28],[-4,-28],[-6+w*6,-5],[-20+w*6,0],[-20+w*6,-7]],'#625645');poly([[4,-28],[16,-27],[17-w*6,-5],[26-w*6,0],[9-w*6,0]],'#625645');
 poly([[-20,-66],[17,-64],[24,-31],[-21,-26]],a.flash>0?'#e4c695':'#a18b68','#ccb494');
 poly([[-17,-60],[-28,-55],[-32,-34],[-22,-32],[-15,-45]],'#857353');
 let arm=a.attack>0?44:27;poly([[15,-60],[24,-56],[arm,-43],[arm-4,-33],[15,-45]],'#b49a73');if(a.attack>0)poly([[arm,-41],[arm+23,-42],[arm+18,-34],[arm,-34]],'#d7cdb3');
 poly([[-18,-88],[-8,-98],[14,-95],[22,-78],[14,-66],[-13,-67],[-22,-75]],'#c2aa7e','#e0c99b');
 poly([[-17,-87],[-7,-98],[2,-96],[-4,-83]],'#8e795d');
 for(const x of [-6,10]){ellipse(x,-81,3,3,'#3a3035');line(x-2,-83,x+2,-79,'#ddc79c',1);}
 line(-5,-71,12,-72,'#554435',1);for(let x=-2;x<12;x+=5)line(x,-74,x,-69,'#554435');
 line(-5,-59,3,-33,'#5c4b3d',1);for(let y=-54;y<-33;y+=6)line(-7+(y+54)*.3,y,2+(y+54)*.3,y-2,'#5c4b3d');
 poly([[5,-53],[15,-55],[17,-44],[7,-43]],'#745d62');ctx.restore();}
function textLabel(x,y,text,color='#f1ddba'){labels.push({x,y,text,color,life:1.1});}
function burst(x,y,color,n=10){for(let i=0;i<n;i++)particles.push({x,y,vx:rand(-120,120),vy:rand(-150,20),life:rand(.25,.7),color,rot:rand(0,6)});}
function tone(freq,duration,type='triangle',vol=.06,slide=1){if(!sound||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(25,freq*slide),audio.currentTime+duration);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function noise(duration=.12,vol=.06){if(!sound||!audio)return;let b=audio.createBuffer(1,audio.sampleRate*duration,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);let s=audio.createBufferSource(),g=audio.createGain(),f=audio.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=1600;g.gain.value=vol;s.connect(f);f.connect(g);g.connect(audio.destination);s.start();}
function hitEffect(target,n){burst(target.x,target.y-bodyHeight(target)/2,'#c28d83');textLabel(target.x,target.y-bodyHeight(target)-10,'−'+n,'#f3b1a4');shake=5;noise();tone(90,.1,'triangle',.06,.4);}
function overlap(a,b,reach){return Math.abs(a.x-b.x)<reach+radius(b)&&Math.abs((a.y-bodyHeight(a)/2)-(b.y-bodyHeight(b)/2))<(bodyHeight(a)+bodyHeight(b))*.5;}
function use(type){if(!running||paused||!activate(p,type))return;
 if(type==='knife'){noise(.08,.03);if((bot.x-p.x)*p.dir>=-10&&overlap(p,bot,70)){hitEffect(bot,knifeHit(p,bot));bot.vx=p.dir*140;}}
 if(type==='blood'){tone(220,.18,'triangle',.05,.4);burst(p.x,p.y-35,'#aa6573',5);}
 if(type==='cloak'){burst(p.x,p.y-40,'#bba9c7',22);tone(420,.5,'sine',.045,.4);}
 if(type==='bat'){burst(p.x,p.y-40,'#c3a3b5',25);tone(300,.3,'triangle',.06,2);}
}
function jump(a){if(a.bat>0||a.stun>0||a.jumps>=2)return;a.vy=-660;a.ground=false;a.jumps++;if(a===p)tone(180,.09,'sine',.025,1.5);burst(a.x,a.y,'#b9a88b',5);}
function physics(a,dt){let oldY=a.y;
 if(a===p&&a.bat>0){a.vx=((keys.has('KeyD')||keys.has('ArrowRight'))-(keys.has('KeyA')||keys.has('ArrowLeft')))*285;a.vy=((keys.has('KeyS')||keys.has('ArrowDown'))-(keys.has('KeyW')||keys.has('ArrowUp')||keys.has('Space')))*260;}
 else a.vy+=1250*dt;
 a.x+=a.vx*dt;a.y+=a.vy*dt;a.x=Math.max(105,Math.min(1175,a.x));
 if(a.bat>0){a.y=Math.max(135,Math.min(610,a.y));}
 else{a.ground=false;if(a.vy>=0)for(const plat of platforms){if(a.x+18>plat.x&&a.x-18<plat.x+plat.w&&oldY<=plat.y+1&&a.y>=plat.y){a.y=plat.y;a.vy=0;a.ground=true;a.jumps=0;break;}}
 if(a.y>690){a.y=615;a.vy=0;a.ground=true;a.jumps=0;}}
 if(Math.abs(a.vx)>1)a.dir=Math.sign(a.vx);
}
let botJump=0;
function update(dt){time+=dt;tickTimers(p,dt);tickTimers(bot,dt);
 if(p.stun>0)p.vx=0;else if(p.lunge>0)p.vx=p.dir*980;else p.vx=((keys.has('KeyD')||keys.has('ArrowRight'))-(keys.has('KeyA')||keys.has('ArrowLeft')))*240;
 // Invisible means the bot cannot track or attack the player; its last facing remains.
 bot.vx=0;botJump=Math.max(0,botJump-dt);
 if(mode==='spar'&&p.cloak===0){let dx=p.x-bot.x,dy=p.y-bot.y;bot.dir=dx>=0?1:-1;if(Math.abs(dx)>62)bot.vx=Math.sign(dx)*135;
 if(bot.ground&&dy<-55&&botJump===0){jump(bot);botJump=.85;}
 if(overlap(bot,p,65)&&(p.x-bot.x)*bot.dir>=-5&&activate(bot,'knife'))hitEffect(p,knifeHit(bot,p));}
 physics(p,dt);physics(bot,dt);
 if(p.lunge>0){if(overlap(p,bot,37)&&!p.lungeHit){const r=bloodHit(p,bot);hitEffect(bot,r.dealt);if(r.healed>0){textLabel(p.x,p.y-110,'+'+r.healed,'#c4d5a8');tone(620,.24,'sine',.04,1.5);}burst(p.x,p.y-40,'#8eac83',8);}p.lunge-=dt;if(p.lunge<=0){finishLunge(p);p.vx=0;if(p.stun>0){textLabel(p.x,p.y-115,'MISSED · STUNNED','#decba6');tone(100,.15,'triangle',.035,.65);}}}
 if(p.hp<=0||bot.hp<=0)endRound();
 musicClock-=dt;if(musicClock<=0){musicClock=.4;const melody=[293.66,0,440,349.23,0,329.63,261.63,0,293.66,0,523.25,440,349.23,0,329.63,0];let f=melody[musicStep++%melody.length];if(f)tone(f,.35,'sine',.018,.998);if(musicStep%4===0)tone(73.42,.55,'triangle',.012);}
}
function render(dt){ctx.clearRect(0,0,1280,720);ctx.save();if(shake>0){ctx.translate(rand(-shake,shake),rand(-shake,shake));shake=Math.max(0,shake-dt*35);}ctx.drawImage(bg,0,0);
 // Floating dust and distant paper bats.
 for(let i=0;i<16;i++){let x=(i*89+Math.sin(time*.3+i)*28)%1280,y=210+(i*43)%350+Math.cos(time*.6+i)*9;ellipse(x,y,1.4,1.4,'#e5c59744');}
 for(const a of [p,bot]){ellipse(a.x,Math.min(618,a.y+3),a.bat?15:28,5,'#120e2344');}
 drawBot(bot);vampire(p);
 if(p.lunge>0){for(let i=1;i<5;i++)line(p.x-p.dir*(30+i*12),p.y-50+i*7,p.x-p.dir*(60+i*18),p.y-50+i*7,'#b16a7c88',3);}
 if(p.attack>0){ctx.save();ctx.translate(p.x,p.y-45);ctx.scale(p.dir,1);ctx.beginPath();ctx.arc(22,0,57,-.8,.7);ctx.strokeStyle='#ead7b2aa';ctx.lineWidth=3;ctx.stroke();ctx.restore();}
 if(p.stun>0){for(let i=0;i<3;i++){const angle=time*8+i*2.1;ctx.fillStyle='#e5c58d';ctx.fillRect(p.x+Math.cos(angle)*23,p.y-116+Math.sin(angle)*5,5,5);}}
 if(p.bat>0){ctx.font='12px Arial';ctx.fillStyle='#e2cbb9';ctx.textAlign='center';ctx.fillText(p.bat.toFixed(1)+'s',p.x,p.y-52);}
 if(!paused){for(const a of particles){a.life-=dt;a.x+=a.vx*dt;a.y+=a.vy*dt;a.vy+=260*dt;}for(const l of labels){l.life-=dt;l.y-=26*dt;}}
 particles=particles.filter(a=>a.life>0);labels=labels.filter(a=>a.life>0);
 for(const a of particles){ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.rot);ctx.globalAlpha=Math.min(1,a.life*3);ctx.fillStyle=a.color;ctx.fillRect(-3,-2,6,4);ctx.restore();}
 for(const l of labels){ctx.globalAlpha=Math.min(1,l.life*3);ctx.font='bold 16px Georgia';ctx.fillStyle=l.color;ctx.textAlign='center';ctx.fillText(l.text,l.x,l.y);}ctx.globalAlpha=1;ctx.restore();
}
function ui(){const fmt=n=>Number.isInteger(n)?n:n.toFixed(1);$('#php').textContent=fmt(p.hp)+' / 110';$('#bhp').textContent=fmt(bot.hp)+' / 100';$('#pbar').style.width=(p.hp/110*100)+'%';$('#bbar').style.width=bot.hp+'%';
 $('#pstatus').textContent=p.bat>0?'BAT FORM · '+p.bat.toFixed(1)+'s · 1.5× incoming damage':p.stun>0?'STUNNED · '+p.stun.toFixed(1)+'s':p.cloak>0?'INVISIBLE · '+p.cloak.toFixed(1)+'s · half damage & healing':'90 starting HP · 110 maximum';
 $('#bstatus').textContent=p.cloak>0?'Lost sight of you…':mode==='dummy'?'Standing still · try your abilities':'Sparring partner · 100 HP';
 const max={knife:2,blood:5,cloak:20,bat:30};
 for(const b of document.querySelectorAll('[data-ability]')){let key=b.dataset.ability,active=key==='bat'?p.bat:key==='cloak'?p.cloak:0;b.querySelector('strong').textContent=active>0?active.toFixed(1)+'s ACTIVE':p.bat>0?'BAT FORM':p.cd[key]>0?p.cd[key].toFixed(1)+'s':p.stun>0?'STUNNED':'READY';b.querySelector('.cooldown').style.width=100*p.cd[key]/max[key]+'%';b.classList.toggle('locked',p.bat>0||p.cd[key]>0||p.stun>0);b.classList.toggle('active',active>0);}
 $('#hint').textContent=p.bat>0?'Fly with WASD / arrows. Attacks recharge while you fly.':p.cloak>0?'The bot cannot see you. Your ghost is visible only to you.':'Face your target to lunge. Space twice to double-jump.';
}
function start(){p=fighter();bot=fighter(true);particles=[];labels=[];keys.clear();botJump=0;running=true;paused=false;$('#overlay').hidden=true;$('#pause').hidden=true;$('#pausebutton').textContent='Ⅱ';canvas.focus({preventScroll:true});}
function endRound(){running=false;keys.clear();const won=bot.hp<=0;$('#overlay').innerHTML='<div class="ticket"><span class="eyebrow">REHEARSAL COMPLETE</span><h2>'+ (won?'A well-earned victory.':'One more rehearsal?')+'</h2><p>'+(won?'The patchwork bot takes a bow.':'Every fighter starts with practice.')+'<br>Reset and try another approach.</p><button id="again">Play again →</button><small>YOUR ABILITIES AND HEALTH WILL RESET</small></div>';$('#overlay').hidden=false;$('#again').onclick=start;tone(won?587:196,.6,'triangle',.05,won?1.5:.5);}
function pauseToggle(){if(!running)return;paused=!paused;keys.clear();$('#pause').hidden=!paused;$('#pausebutton').textContent=paused?'▶':'Ⅱ';}
$('#play').onclick=start;$('#reset').onclick=start;$('#pausebutton').onclick=pauseToggle;$('#pause').onclick=pauseToggle;
$('#botmode').onchange=e=>{mode=e.target.value;$('#mode-label').textContent=mode==='spar'?'SPARRING':'STANDING STILL';};
$('#sound').onclick=()=>{sound=!sound;if(sound){audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();tone(440,.2,'sine',.04);}$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(sound));};
const mapping={KeyJ:'knife',KeyK:'blood',KeyL:'cloak',KeyI:'bat'};
window.addEventListener('keydown',e=>{if(e.target.matches('select,input'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&!e.repeat){pauseToggle();return;}if(!running||paused)return;keys.add(e.code);if(!e.repeat){if(e.code==='Space')jump(p);if(mapping[e.code])use(mapping[e.code]);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(running&&!paused)pauseToggle();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)pauseToggle();});
for(const b of document.querySelectorAll('[data-ability]'))b.onclick=()=>use(b.dataset.ability);
for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(!running||paused)return;keys.add(b.dataset.move);if(b.dataset.move==='Space')jump(p);};const release=()=>keys.delete(b.dataset.move);b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
function frame(now){const dt=Math.min((now-last)/1000||0,1/30);last=now;if(running&&!paused)update(dt);else if(!paused)time+=dt;render(dt);ui();requestAnimationFrame(frame);}requestAnimationFrame(frame);

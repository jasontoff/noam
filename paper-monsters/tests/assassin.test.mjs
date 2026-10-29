import test from 'node:test';
import assert from 'node:assert/strict';
import {fighter,activate,tickTimers,daggerHit,newVolley,volleyHit,projectileHits,botBrain,thinkBot} from '../public/core.mjs';
test('Assassin has 80 HP and exactly three attacks, with independent cooldowns',()=>{
 const p=fighter(false,'assassin');assert.equal(p.hp,80);assert.equal(p.max,80);assert.deepEqual(Object.keys(p.cd),['katana','dagger','volley']);
 for(const invalid of ['knife','blood','cloak','bat','unknown'])assert.equal(activate(p,invalid),false);
 assert.ok(activate(p,'katana'));assert.equal(p.cd.katana,3);assert.equal(activate(p,'dagger'),false);tickTimers(p,.25);assert.ok(activate(p,'dagger'));assert.equal(p.cd.dagger,5);tickTimers(p,.25);assert.ok(activate(p,'volley'));assert.equal(p.cd.volley,12);
});
test('backstab uses the target facing, from either side; front deals 1, rear 15',()=>{
 for(const facing of [-1,1]){
  const p=fighter(false,'assassin'),b=fighter(true,'assassin');b.x=500;b.dir=facing;p.x=b.x+facing*40;
  assert.deepEqual(daggerHit(p,b),{dealt:1,backstab:false});p.x=b.x-facing*40;
  assert.deepEqual(daggerHit(p,b),{dealt:15,backstab:true});assert.equal(b.hp,64);assert.ok(p.backstab>0);
 }
});
test('volley miss-hit-hit produces 0,3,4 and a new volley resets to 3',()=>{
 const p=fighter(false,'assassin'),b=fighter(true);b.x=500;b.y=615;const volley=newVolley(p,0),results=[];
 for(const y of [400,580,590])results.push(projectileHits(450,y,550,y,b)?volleyHit(volley,b):0);
 assert.deepEqual(results,[0,3,4]);assert.equal(volley.hits,2);assert.equal(b.hp,93);assert.equal(volleyHit(newVolley(p,0),b),3);
});
test('one volley caps at 12 total; separate in-flight volleys keep their own counts',()=>{
 const p=fighter(false,'assassin'),b=fighter(true);const a=newVolley(p,0),c=newVolley(p,0);
 assert.equal(volleyHit(a,b),3);assert.equal(volleyHit(c,b),3);assert.equal(volleyHit(a,b),4);assert.equal(volleyHit(a,b),5);assert.equal(volleyHit(a,b),0);assert.equal(volleyHit(c,b),4);
});
test('swept projectiles catch fast crossings, vertical shots, and smaller bat hitboxes',()=>{
 const b=fighter(true);b.x=500;b.y=615;assert.ok(projectileHits(300,580,700,580,b));assert.ok(projectileHits(500,300,500,700,b));assert.equal(projectileHits(300,400,700,400,b),false);b.bat=10;assert.equal(projectileHits(300,570,700,570,b),false);assert.ok(projectileHits(300,600,700,600,b));
});
test('bot gives a rear attacker a real 0.8-second turning window',()=>{
 const b=fighter(true,'assassin'),p=fighter();b.x=500;b.dir=-1;p.x=540;const brain=botBrain();
 thinkBot(brain,b,p,.4);assert.equal(b.dir,-1);thinkBot(brain,b,p,.39);assert.equal(b.dir,-1);thinkBot(brain,b,p,.02);assert.equal(b.dir,1);
});
test('bot attack has 0.6s windup and 2.8s recovery, then a second attack',()=>{
 for(const kind of ['vampire','assassin']){
  const b=fighter(true,kind),p=fighter();b.x=500;b.dir=-1;p.x=450;const brain=botBrain();brain.recovery=0;
  assert.equal(thinkBot(brain,b,p,.01),null);assert.equal(brain.pending,kind==='vampire'?'knife':'katana');assert.equal(thinkBot(brain,b,p,.59),null);
  assert.equal(thinkBot(brain,b,p,.02),kind==='vampire'?'knife':'katana');assert.equal(brain.recovery,2.8);
  thinkBot(brain,b,p,2.7);assert.equal(brain.pending,null);thinkBot(brain,b,p,.11);assert.equal(brain.pending,kind==='vampire'?'blood':'volley');
 }
});
test('bot cannot instant-turn mid-windup and invisibility cancels its attack',()=>{
 const b=fighter(true,'assassin'),p=fighter();b.x=500;b.dir=-1;p.x=450;const brain=botBrain();brain.recovery=0;thinkBot(brain,b,p,.01);p.x=550;thinkBot(brain,b,p,.3);assert.equal(b.dir,-1);p.cloak=3;thinkBot(brain,b,p,.1);assert.equal(brain.pending,null);assert.equal(brain.windup,0);
});

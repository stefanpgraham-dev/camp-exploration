/* Node smoke tests. These are NOT substitutes for a Foundry multi-client test. */
import assert from "node:assert/strict";
const callbacks={};
let nextRoleChoice = null, nextRestChoice = null, nextCheckChoice=null;
const restCalls=[], rollCalls=[];
globalThis.Hooks={
  once:(name,callback)=>(callbacks[name] ??= []).push(callback),
  on:(name,callback)=>(callbacks[name] ??= []).push(callback)
};
class Base {
  constructor() { Base.last=this; }
  async _prepareContext(){return {};}
  async _preRender(){}
  _onRender(){}
  render(){return this;}
}
globalThis.foundry={
  applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:Base=>Base,DialogV2:{
    input:async ({content})=> content.includes('name="bonus"') ? {bonus:2}
      : content.includes('name="role"') ? (nextRoleChoice ? {role:nextRoleChoice} : null)
      : content.includes('name="restType"') ? (nextRestChoice ? {restType:nextRestChoice} : null)
      : {choice:nextCheckChoice||"prc"},
    confirm:async()=>true
  }}},
  utils:{
    deepClone:o=>structuredClone(o),
    mergeObject:(a,b)=>({...a,...b, supply:{...a.supply,...b.supply},site:{...a.site,...b.site}}),
    escapeHTML:s=>String(s).replaceAll("<","&lt;")
  }
};
const makeActor=(name,skills)=>({id:name,uuid:`Actor.${name}`,type:"character",name,system:{skills:Object.fromEntries(Object.entries(skills).map(([id,value])=>[id,{value}]))},
  async shortRest(options){restCalls.push({name,kind:"short",options});return {completed:true};},
  async longRest(options){restCalls.push({name,kind:"long",options});return {completed:true};},
  async rollSkill({skill,rolls}) {
    const adv=!!rolls[0]?.options?.advantage;
    const dis=!!rolls[0]?.options?.disadvantage;
    assert(!adv || !dis);
    rollCalls.push({name,skill,options:rolls[0].options});
    return [{total:skill === "prc" ? 17:19,dice:[{faces:20,results:[{result:16,active:true}]}]}];
  }
});
const gm={id:"gm",name:"GM",isGM:true,active:true};
const p1={id:"p1",name:"Scout",isGM:false,active:true,character:makeActor("Ranger",{prc:1,sur:1,ste:0,ath:0})};
const p2={id:"p2",name:"Guide",isGM:false,active:true,character:makeActor("Druid",{nat:1,his:1,prc:0,sur:0})};
const users=[gm,p1,p2];users.get=id=>users.find(u=>u.id===id);
let current;
const handlers={};
const module={};
let chat=[];
globalThis.ChatMessage={create:async data=>{chat.push(data);return data;},getSpeaker:({actor})=>({alias:actor.name})};
globalThis.Roll=class {
  constructor(formula){this.formula=formula;this.total=2;this.dice=[{faces:20,results:[{result:2,active:true}]}];}
  async evaluate(){return this;}
  async toMessage(data){chat.push(data);}
};
const warnings=[];
globalThis.ui={notifications:{warn:(s)=>warnings.push(s),error:(s)=>{throw new Error(s);}}};
globalThis.game={user:gm, users,
  settings:{register:(_id,_key,options)=>{current=structuredClone(options.default);},get:()=>structuredClone(current),set:async(_id,_key,value)=>{current=structuredClone(value);}},
  socket:{on:(channel,fn)=>handlers[channel]=fn,emit:(channel,data)=>handlers[channel]?.(data)},
  keybindings:{register:()=>{}},modules:{get:()=>module}
};
await import('../scripts/camp-exploration.mjs');
for(const cb of callbacks.init||[])await cb();
for(const cb of callbacks.ready||[])await cb();
assert(typeof module.api.open==='function');
module.api.open();
const appRef=Base.last;
const context = await appRef._prepareContext();
assert.equal(context.playerCount,2);
assert.equal(context.pace,"normal");
assert.equal(context.paceOptions.length,3);
assert.equal(context.watchNames.length,4);
assert.equal(context.watchNames[3].name,"Fourth watch · hours 7–8");
assert.match(context.explorationRoles[0].guidance,/route/);
assert.match(context.campRoles.find(x=>x.id==="downtime").guidance,/skill/);
assert.match(context.finderRoles[0].guidance,/perimeter/);
assert.equal(context.players.find(p=>p.id==="p1").watchSkill.state, "proficient");
assert.equal(context.players.find(p=>p.id==="p2").watchSkill.state, "untrained");
const template = (await import("node:fs")).readFileSync(new URL("../templates/board.hbs",import.meta.url), "utf8");
assert(template.includes('data-ce-action="pick-role"'));
assert(template.includes('data-ce-action="rest"'));
assert(template.includes('data-ce-action="resetDay"'));
assert(template.includes('name="ce-pace"'));
assert(template.includes('role reference &amp; guidance'));
assert(template.includes("ce-pick--favoured"));
assert(template.includes('class="ce-effect"'));
const socket=handlers['module.camp-exploration'];
const send=async(action,payload)=>{
  socket({kind:'request',action,payload});
  await new Promise(resolve=>setTimeout(resolve,0));
};
await send('assign',{userId:'p1',field:'exploration0',value:'scout'});
await send('assign',{userId:'p2',field:'exploration0',value:'guide'});
await send('assign',{userId:'p1',field:'camp0',value:'keepwatch'});
await send('assign',{userId:'p2',field:'camp0',value:'fullrest'});
await send('assign',{userId:'p1',field:'finder',value:'scout'});
await send('assign',{userId:'p2',field:'finder',value:'guide'});
await send('assign',{userId:'p1',field:'watch',value:'fourth'});
assert.equal(current.assignments.p1.watch,"fourth");
await send('assign',{userId:'p1',field:'watch',value:'first'});
assert.equal(current.assignments.p1.finder,'scout');
assert.equal(current.assignments.p2.finder,'guide');
assert.equal(current.assignments.p1.watch,'first');
assert.equal((await appRef._prepareContext()).players.find(p=>p.id==="p1").exploration0.name,"Scout");
nextRoleChoice="tracker";
await appRef._pickRole("p1","exploration0");
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.assignments.p1.exploration[0],"tracker");
nextRoleChoice="scout";
await appRef._pickRole("p1","exploration0");
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.assignments.p1.exploration[0],"scout");
nextRoleChoice=null;
// Cannot take a role with an untrained first-listed skill.
await send('assign',{userId:'p1',field:'exploration0',value:'guide'});
assert.equal(current.assignments.p1.exploration[0],'scout');
assert.equal(current.day,1);
// A copy of the same site duty must be rejected.
await send('assign',{userId:'p2',field:'finder',value:'scout'});
assert.equal(current.assignments.p2.finder,'guide');
// Access the app's _roll method via its instance in base mock.

await send('recordRoll',{userId:'p1',stage:'finder',slot:0,role:'scout',day:1,total:17,natural:16});
assert.equal(current.site.outcome,null);
await send('recordRoll',{userId:'p2',stage:'finder',slot:0,role:'guide',day:1,total:19,natural:16});
assert.match(current.site.outcome,/Good campsite/);
assert(chat.some(v=>String(v.content||'').includes('Good campsite')));
// Pace is a GM-controlled shared day setting. Player socket requests are not accepted.
await send('pace',{value:'fast',fromGM:true});
assert.equal(current.pace,'normal');
await module.api.setPace('fast');
assert.equal(current.pace,'fast');
// Fast pace shows the trained Ranger's Perception as amber rather than green.
let fastCtx=await appRef._prepareContext();
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.state,'suppressed');
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.effect,'DIS');
assert.equal(fastCtx.players.find(p=>p.id==='p2').watchSkill.state,'untrained');
// Expertise stays eligible, but the pace disadvantage is still on the dice.
p1.character.system.skills.prc.value=2;
fastCtx=await appRef._prepareContext();
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.state,'expertise');
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.effect,'DIS');
p1.character.system.skills.prc.value=1;
// Fast gives disadvantage on a Perception watch check.
await appRef._roll("p1","watch",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).skill,'prc');
assert.equal(rollCalls.at(-1).options.disadvantage,true);
// In the Scout role, paired proficiencies provide advantage, so Fast cancels it.
await appRef._roll("p1","exploration",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).options.advantage,false);
assert.equal(rollCalls.at(-1).options.disadvantage,false);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.history["1:exploration:p1:0"].total,17);
// A role roll can't overwrite a previous roll.
await send('recordRoll',{userId:'p1',stage:'exploration',slot:0,role:'scout',day:1,total:20,natural:20});
await send('recordRoll',{userId:'p1',stage:'exploration',slot:0,role:'scout',day:1,total:1,natural:1});
assert.equal(current.history['1:exploration:p1:0'].total,17);
// A Slow pace grants advantage on Perception and Survival, including camp watches.
await module.api.setPace('slow');
const slowCtx=await appRef._prepareContext();
const slowUntrained=slowCtx.players.find(p=>p.id==='p2').watchSkill;
assert.equal(slowUntrained.state,'favoured');
assert.equal(slowUntrained.prefix,'×'); // keep base training visible
assert.equal(slowUntrained.effect,'ADV');
assert.equal(slowCtx.players.find(p=>p.id==='p1').exploration0.favourable,true);
// Homebrew eligibility: Slow permits an untrained Perception user to select Scout.
nextRoleChoice='scout';
await appRef._pickRole('p2','exploration0');
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.assignments.p2.exploration[0],'scout');
nextRoleChoice='guide';
await appRef._pickRole('p2','exploration0');
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.assignments.p2.exploration[0],'guide');
nextRoleChoice=null;
delete current.history['1:watch:p1:0']; // isolated test for another check
await appRef._roll("p1","watch",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).options.advantage,true);
// Normal pace applies disadvantage on Stealth, including Other Downtime choices.
await module.api.setPace('normal');
// Normal Stealth penalty offsets an ordinary proficiency for role suitability,
// but Expertise remains visibly blue and sufficient.
p1.character.system.skills.ste={value:1};
let normalCtx=await appRef._prepareContext();
let stealthBadge=normalCtx.players.find(p=>p.id==='p1').exploration0.skills.find(x=>x.name==='Stealth');
assert.equal(stealthBadge.state,'suppressed');
assert.equal(stealthBadge.effect,'DIS');
p1.character.system.skills.ste.value=2;
normalCtx=await appRef._prepareContext();
stealthBadge=normalCtx.players.find(p=>p.id==='p1').exploration0.skills.find(x=>x.name==='Stealth');
assert.equal(stealthBadge.state,'expertise');
assert.equal(stealthBadge.effect,'DIS');
p1.character.system.skills.ste.value=0;
await send('assign',{userId:'p2',field:'camp0',value:'downtime'});
nextCheckChoice='ste';
await appRef._roll("p2","camp",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).skill,'ste');
assert.equal(rollCalls.at(-1).options.disadvantage,true);
// N/A does not roll dice, use manual modifier, or create an unmarked roll.
delete current.history['1:camp:p2:0'];
nextCheckChoice='na';
const priorRollCount=rollCalls.length;
await appRef._roll("p2","camp",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.length,priorRollCount);
assert.equal(current.history['1:camp:p2:0'].skipped,true);
assert.equal((await appRef._prepareContext()).players.find(p=>p.id==='p2').campResult0,'N/A');
nextCheckChoice=null;
// Short and long rest call D&D 5e on each unique assigned PC (GM only).
nextRestChoice="short";
await appRef._restParty();
assert.equal(restCalls.length,2);
assert(restCalls.every(r=>r.kind==="short" && r.options.dialog === true));
nextRestChoice="long";
await appRef._restParty();
assert.equal(restCalls.length,4);
assert(restCalls.slice(2).every(r=>r.kind==="long" && r.options.newDay === true));
nextRestChoice=null;
// Reset Day is a GM-only board reset; character resources, supply die and chaos persist.
current.supply.die=6;
current.supply.lastDay=current.day;
current.chaos=4;
await module.api.setPace("slow");
await module.api.resetDay();
assert.equal(current.day,1);
assert.equal(current.supply.die,6);
assert.equal(current.supply.lastDay,0); // Reset Day must unlock Check Supply
assert.equal((await appRef._prepareContext()).canRollSupply,true);
assert.equal(current.chaos,4);
assert.equal(current.pace,"slow"); // Same-day reset retains the day's pace
assert.deepEqual(current.assignments,{});
assert.deepEqual(current.history,{});
assert.equal(current.site.scout,null);
assert.equal(current.site.guide,null);
// The next supply check uses the already depleted d6, once only.
// Resetting twice should consistently unlock the daily check without resupplying.
current.supply.lastDay=current.day;
await module.api.resetDay();
assert.equal(current.supply.lastDay,0);
assert.equal(current.supply.die,6);
assert.equal(current.pace,"slow");
// Re-rendering must preserve vertical/horizontal scroll and expanded references.
const oldBoard={scrollTop:498,scrollLeft:16};
const oldContent={scrollTop:42};
const oldTables=[{scrollLeft:100},{scrollLeft:29},{scrollLeft:75}];
const oldRefs=[{open:false},{open:true},{open:false}];
const elementFor=(board,content,tables,refs)=>({
  querySelector:selector=>selector===".ce-board"?board:selector===".window-content"?content:null,
  querySelectorAll:selector=>selector===".ce-scroll"?tables:selector==="details.ce-reference"?refs:[]
});
appRef.element=elementFor(oldBoard,oldContent,oldTables,oldRefs);
await appRef._preRender({},{});
const nextBoard={scrollTop:0,scrollLeft:0};
const nextContent={scrollTop:0};
const nextTables=[{scrollLeft:0},{scrollLeft:0},{scrollLeft:0}];
const nextRefs=[{open:false},{open:false},{open:false}];
appRef.element=elementFor(nextBoard,nextContent,nextTables,nextRefs);
appRef._restoreBoardView();
assert.equal(nextBoard.scrollTop,498);
assert.equal(nextBoard.scrollLeft,16);
assert.equal(nextContent.scrollTop,42);
assert.deepEqual(nextTables.map(x=>x.scrollLeft),[100,29,75]);
assert.deepEqual(nextRefs.map(x=>x.open),[false,true,false]);
const css=(await import("node:fs")).readFileSync(new URL("../styles/camp-exploration.css",import.meta.url),"utf8");
assert(css.includes(".ce-scroll button.ce-pick") && css.includes("height:auto !important"));
// Socket requests from players must not be able to reset the board.
await send('resetDay',{userId:'p1',fromGM:true});
assert.deepEqual(current.assignments,{});
// After advance, previous results are cleared; assignments persist.
// This would be done via GM-only controls: imitate state directly in the mock.
current.day=2;current.history={};current.site={scout:null,guide:null,outcome:null};
assert.equal(current.assignments.p2?.camp?.[0],undefined);
assert.equal(warnings.length,2);
await module.api.nextDay();
assert.equal(current.day,3);
assert.equal(current.pace,"normal"); // Next Day clears pace-specific effects
console.log('Camp & Exploration smoke tests passed');

/* Node smoke tests. These are NOT substitutes for a Foundry multi-client test. */
import assert from "node:assert/strict";
const callbacks={};
const extraSettings=new Map();
let tokenSequence=0;
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
  render(){this.renders=(this.renders||0)+1;return this;}
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
    escapeHTML:s=>String(s).replaceAll("<","&lt;"),
   randomID:()=>`camp-request-${++tokenSequence}`
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
  settings:{
     register:(_id,key,options)=>{if(key==="state")current=structuredClone(options.default);else extraSettings.set(key,structuredClone(options.default));},
     get:(_id,key)=>structuredClone(key==="state"?current:extraSettings.get(key)),
     set:async(_id,key,value)=>{if(key==="state")current=structuredClone(value);else extraSettings.set(key,structuredClone(value));for(const cb of callbacks.updateSetting||[])cb({key:`${_id}.${key}`});}
   },
  socket:{on:(channel,fn)=>handlers[channel]=fn,emit:(channel,data)=>handlers[channel]?.(data)},
  keybindings:{register:()=>{}},modules:{get:()=>module}
};
const rules=await import('../scripts/camp-exploration.mjs');
for(const cb of callbacks.init||[])await cb();
for(const cb of callbacks.ready||[])await cb();
assert(typeof module.api.open==='function');
assert(typeof module.api.openForPlayers==='function');
module.api.open();
const appRef=Base.last;
// GM signal does not change journey state, and distinct clicks send distinct signals.
const oldState=structuredClone(current);
assert.equal(await module.api.openForPlayers(),2);
assert.equal(extraSettings.get("openRequest"),"camp-request-1");
assert.deepEqual(current,oldState);
const beforeRender=appRef.renders;
game.user=p1;
for(const cb of callbacks.updateSetting||[])cb({key:"camp-exploration.openRequest"});
assert.equal(appRef.renders,beforeRender+1,"player receives broadcast and opens local board");
const oldRequest=extraSettings.get("openRequest");
await module.api.openForPlayers();
assert.equal(extraSettings.get("openRequest"),oldRequest,"non-GM cannot broadcast");
game.user=gm;
assert.equal(await module.api.openForPlayers(),2);
assert.equal(extraSettings.get("openRequest"),"camp-request-2");
warnings.length=0;
const context = await appRef._prepareContext();
assert.equal(context.playerCount,2);
// Verify EVERY role against the supplied exploration/campsite rules sheet.
const catalogueMatrix={
  exploration:[
    ["guide",["nat","his","inv","map"],["nat"],["his","inv","map"]],
    ["scout",["prc","sur","ste"],["prc"],["sur","ste"]],
    ["navigator",["navigator","sur"],["navigator"],["sur"]],
    ["tracker",["prc","nat","sur"],["prc"],["nat","sur"]],
    ["quartermaster",["ath"],["ath"],[]],
    ["cartographer",["tools","his","sur"],["tools"],["his","sur"]],
    ["packmaster",["ani"],["ani"],[]],
    ["entertainer",["prf","instrument"],["prf","instrument"],[]],
    ["rearguard",["dec","sur"],["dec"],["sur"]],
    ["traveller",["sur"],["sur"],[]]
  ],
  camp:[
    ["setcamp",["ath","str"],["ath","str"],[]],
    ["keepwatch",["prc"],["prc"],[]],
    ["fortify",["sur","tinkering"],["sur","tinkering"],[]],
    ["perimeter",["prc","sur","ste"],["prc"],["sur","ste"]],
    ["hunter",["sur","ste","nat"],["sur"],["ste","nat"]],
    ["forage",["herbalism","nat","sur"],["herbalism"],["nat","sur"]],
    ["leader",["per","dec","prf","itm"],["per","dec"],["prf","itm"]],
    ["entertainer",["prf","instrument"],["prf","instrument"],[]],
    ["cook",["cooking"],["cooking"],[]],
    ["downtime",["downtime"],[],[]],
    ["fullrest",[],[],[]]
  ],
  finder:[
    ["scout",["prc","sur","ste"],["prc"],["sur","ste"]],
    ["guide",["nat","his","inv","map"],["nat"],["his","inv","map"]]
  ]
};
for(const [stage,expected] of Object.entries(catalogueMatrix)) {
  const actual=rules.CATALOG[stage];
  assert.equal(actual.length,expected.length,`${stage} role count`);
  for(let i=0;i<expected.length;i++){
    const [id,checks,first,second]=expected[i];
    assert.equal(actual[i].id,id,`${stage} role ${i}`);
    assert.deepEqual(actual[i].checks,checks,`${stage} ${id}: choice list`);
    assert.deepEqual(rules.roleSkillGroups(actual[i]),{first,second},`${stage} ${id}: AND/OR grouping`);
  }
}
// Every paired role grants ADV only when BOTH relevant groups are proficient.
for(const [stage,id,first,second,choice,tool] of [
  ["exploration","guide","nat","his","nat",false],
  ["exploration","scout","prc","sur","prc",false],
  ["exploration","navigator","navigator","sur","sur",true],
  ["exploration","tracker","prc","nat","prc",false],
  ["exploration","cartographer","tools","his","his",true],
  ["exploration","rearguard","dec","sur","dec",false],
  ["camp","perimeter","prc","sur","prc",false],
  ["camp","hunter","sur","nat","sur",false],
  ["camp","forage","herbalism","nat","nat",true],
  ["camp","leader","per","itm","per",false],
  ["finder","scout","prc","sur","prc",false],
  ["finder","guide","nat","his","nat",false]
]) {
  const def=rules.CATALOG[stage].find(r=>r.id===id);
  const actor=makeActor("pair",{[first]:1,[second]:1});
  const positive=rules.modeFor(actor,def,choice,false,"normal",tool);
  assert.equal(positive.advantage,true,`${stage} ${id} must grant two-skill advantage`);
  const absent=makeActor("lone",{[first]:1});
  assert.equal(rules.modeFor(absent,def,choice,false,"normal",tool).advantage,false,`${stage} ${id} must require BOTH skills`);
  if(tool) assert.equal(rules.modeFor(actor,def,choice,false,"normal",false).advantage,false,`${stage} ${id} requires manual tool confirmation`);
}
const getRole=(stage,id)=>rules.CATALOG[stage].find(r=>r.id===id);
const sample=makeActor("Kali",{prc:1,sur:0,ste:1});
assert.equal(rules.modeFor(sample,getRole("exploration","scout"),"prc",false,"normal").advantage,false,
  "Regression: Perception + ordinary Stealth at Normal pace must roll normally");
assert.equal(rules.defaultPreview(sample,getRole("exploration","scout"),"normal").label,"Perception: Normal");
assert.equal(rules.defaultPreview(sample,getRole("exploration","scout"),"normal").pair,"Pair 1/2");
sample.system.skills.ste.value=2;
assert.equal(rules.modeFor(sample,getRole("exploration","scout"),"prc",false,"normal").advantage,true,
  "Stealth Expertise remains eligible after the pace offset");
sample.system.skills.ste.value=0; sample.system.skills.sur.value=1;
assert.equal(rules.modeFor(sample,getRole("exploration","scout"),"prc",false,"normal").advantage,true);
assert.equal(rules.modeFor(sample,getRole("exploration","scout"),"prc",true,"normal").advantage,false,
  "Second duty cancels paired advantage");
// Single-skill and OR alternatives do NOT grant advantage for proficiency alone.
for(const [stage,id,skill] of [
  ["exploration","quartermaster","ath"],["exploration","packmaster","ani"],
  ["exploration","entertainer","prf"],["exploration","traveller","sur"],
  ["camp","setcamp","ath"],["camp","keepwatch","prc"],
  ["camp","fortify","sur"],["camp","entertainer","prf"],
  ["camp","cook","cooking"]
]) assert.equal(rules.modeFor(makeActor("solo",{[skill]:2}),getRole(stage,id),skill,false,"normal").advantage,false,
  `${stage} ${id} is NOT a paired proficiency duty`);
// Manual map as the second Guide skill.
const mapGuide=makeActor("mapper",{nat:1});
assert.equal(rules.modeFor(mapGuide,getRole("exploration","guide"),"nat",false,"normal",false).advantage,false);
assert.equal(rules.modeFor(mapGuide,getRole("exploration","guide"),"nat",false,"normal",true).advantage,true);
// The Leader takes one social skill from EACH of two groups.
const leader=makeActor("leader",{dec:1,itm:1});
assert.equal(rules.modeFor(leader,getRole("camp","leader"),"dec",false,"normal").advantage,true);
assert.equal(rules.modeFor(leader,getRole("camp","leader"),"itm",false,"normal").advantage,true);
assert.equal(rules.modeFor(leader,getRole("camp","leader"),"per",false,"normal").advantage,false);
assert.equal(rules.modeFor(leader,getRole("camp","leader"),"dec",true,"normal").advantage,false);
// Fast offsets EACH ordinary skill in a pair. Slow independently grants
// Perception/Survival ADV, including to characters with no proficiency.
assert.equal(rules.modeFor(makeActor("fast",{prc:1,sur:1}),getRole("exploration","scout"),"prc",false,"fast").advantage,false);
assert.equal(rules.modeFor(makeActor("slow",{}),getRole("camp","keepwatch"),"prc",false,"slow").advantage,true);

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
assert(template.includes('data-ce-action="show-players"'));
assert(template.includes("{{#if gm}}"));
assert(template.includes('data-ce-action="resetDay"'));
assert(template.includes('name="ce-pace"'));
assert(template.includes('role reference &amp; guidance'));
assert(template.includes("ce-pick--favoured"));
assert(template.includes('class="ce-effect"'));
assert(template.includes('ce-role-preview'));
const roleSource=(await import("node:fs")).readFileSync(new URL("../scripts/camp-exploration.mjs",import.meta.url),"utf8");
assert(roleSource.includes('class="ce-role-legend"'),"role picker should group legend chips into a wrapping container");
assert(roleSource.includes('class="ce-role-help"'),"long role help must occupy its own wrapping block");
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
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.effect,'OFFSET');
assert.equal(fastCtx.players.find(p=>p.id==='p2').watchSkill.state,'untrained');
// Expertise retains advantage after one pace penalty.
p1.character.system.skills.prc.value=2;
fastCtx=await appRef._prepareContext();
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.state,'expertise');
assert.equal(fastCtx.players.find(p=>p.id==='p1').watchSkill.effect,'COUNTS');
await appRef._roll("p1","watch",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).options.advantage,false); // Watch is single-skill
assert.equal(rollCalls.at(-1).options.disadvantage,false);
delete current.history["1:watch:p1:0"];
p1.character.system.skills.prc.value=1;
// Fast does not disqualify an ordinarily proficient role.
await send('assign',{userId:'p1',field:'exploration0',value:'tracker'});
assert.equal(current.assignments.p1.exploration[0],'tracker');
await send('assign',{userId:'p1',field:'exploration0',value:'scout'});
assert.equal(current.assignments.p1.exploration[0],'scout');
// Fast cancels ADV from ordinary proficiency, without imposing DIS.
await appRef._roll("p1","watch",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).skill,'prc');
assert.equal(rollCalls.at(-1).options.advantage,false);
assert.equal(rollCalls.at(-1).options.disadvantage,false);
// The same cancellation applies to the Scout check.
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
// Two simultaneous duties impose their own disadvantage, even after pace cancels ADV.
await send('assign',{userId:'p1',field:'exploration1',value:'traveller'});
await appRef._roll("p1","exploration",1);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).skill,'sur');
assert.equal(rollCalls.at(-1).options.disadvantage,true);
await send('assign',{userId:'p1',field:'exploration1',value:''});
// A Slow pace grants advantage on Perception and Survival, including camp watches.
await module.api.setPace('slow');
const slowCtx=await appRef._prepareContext();
const slowUntrained=slowCtx.players.find(p=>p.id==='p2').watchSkill;
assert.equal(slowUntrained.state,'favoured');
assert.equal(slowUntrained.prefix,'×'); // keep base training visible
assert.equal(slowUntrained.effect,'PACE ADV');
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
// Normal pace offsets proficiency ADV on Stealth, never imposing disadvantage by itself.
await module.api.setPace('normal');
// Normal Stealth penalty cancels an ordinary proficiency's ADV,
// while Expertise remains visibly blue with ADV.
p1.character.system.skills.ste={value:1};
let normalCtx=await appRef._prepareContext();
let stealthBadge=normalCtx.players.find(p=>p.id==='p1').exploration0.skills.find(x=>x.name==='Stealth');
assert.equal(stealthBadge.state,'suppressed');
assert.equal(stealthBadge.effect,'OFFSET');
p1.character.system.skills.ste.value=2;
normalCtx=await appRef._prepareContext();
stealthBadge=normalCtx.players.find(p=>p.id==='p1').exploration0.skills.find(x=>x.name==='Stealth');
assert.equal(stealthBadge.state,'expertise');
assert.equal(stealthBadge.effect,'COUNTS');
p1.character.system.skills.ste.value=0;
await send('assign',{userId:'p2',field:'camp0',value:'downtime'});
nextCheckChoice='ste';
await appRef._roll("p2","camp",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(rollCalls.at(-1).skill,'ste');
assert.equal(rollCalls.at(-1).options.advantage,false);
assert.equal(rollCalls.at(-1).options.disadvantage,false);
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
assert(css.includes(".ce-pace-choice::before") && css.includes('input[type="radio"]'));
assert(css.includes("opacity:0") && css.includes("align-self:center"));
assert(css.includes(".ce-role-dialog .ce-role-legend"),"dialog legend must have an explicit wrapping layout");
assert(css.includes("flex-flow:row wrap"),"legend rows must wrap");
assert(css.includes("min-width:0; max-width:100%"),"dialog must not force the Foundry window wider");
assert(!css.includes("min-width:min(540px,70vw)"),"old forced dialog min width causes horizontal clipping");
assert(css.includes("overflow-x:hidden"),"choices should not create horizontal overflow");
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

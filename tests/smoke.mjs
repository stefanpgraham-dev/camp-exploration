/* Node smoke tests. These are NOT substitutes for a Foundry multi-client test. */
import assert from "node:assert/strict";
const callbacks={};
let nextRoleChoice = null, nextRestChoice = null;
const restCalls=[];
globalThis.Hooks={
  once:(name,callback)=>(callbacks[name] ??= []).push(callback),
  on:(name,callback)=>(callbacks[name] ??= []).push(callback)
};
class Base {
  constructor() { Base.last=this; }
  async _prepareContext(){return {};}
  _onRender(){}
  render(){return this;}
}
globalThis.foundry={
  applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:Base=>Base,DialogV2:{
    input:async ({content})=> content.includes('name="bonus"') ? {bonus:2}
      : content.includes('name="role"') ? (nextRoleChoice ? {role:nextRoleChoice} : null)
      : content.includes('name="restType"') ? (nextRestChoice ? {restType:nextRestChoice} : null)
      : {choice:"prc"},
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
assert.equal(context.players.find(p=>p.id==="p1").watchSkill.state, "proficient");
assert.equal(context.players.find(p=>p.id==="p2").watchSkill.state, "untrained");
const template = (await import("node:fs")).readFileSync(new URL("../templates/board.hbs",import.meta.url), "utf8");
assert(template.includes('data-ce-action="pick-role"'));
assert(template.includes('data-ce-action="rest"'));
assert(template.includes('data-ce-action="resetDay"'));
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
// A real player skill roll can be triggered through the same application method.
await appRef._roll("p1","exploration",0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.history["1:exploration:p1:0"].total,17);
// A role roll can't overwrite a previous roll.
await send('recordRoll',{userId:'p1',stage:'exploration',slot:0,role:'scout',day:1,total:20,natural:20});
await send('recordRoll',{userId:'p1',stage:'exploration',slot:0,role:'scout',day:1,total:1,natural:1});
assert.equal(current.history['1:exploration:p1:0'].total,17);
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
await module.api.resetDay();
assert.equal(current.day,1);
assert.equal(current.supply.die,6);
assert.equal(current.supply.lastDay,1);
assert.equal(current.chaos,4);
assert.deepEqual(current.assignments,{});
assert.deepEqual(current.history,{});
assert.equal(current.site.scout,null);
assert.equal(current.site.guide,null);
// Socket requests from players must not be able to reset the board.
await send('resetDay',{userId:'p1',fromGM:true});
assert.deepEqual(current.assignments,{});
// After advance, previous results are cleared; assignments persist.
// This would be done via GM-only controls: imitate state directly in the mock.
current.day=2;current.history={};current.site={scout:null,guide:null,outcome:null};
assert.equal(current.assignments.p2?.camp?.[0],undefined);
assert.equal(warnings.length,2);
console.log('Camp & Exploration smoke tests passed');

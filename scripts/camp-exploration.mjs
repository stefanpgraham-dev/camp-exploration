/* Camp & Exploration — Foundry VTT v14 / D&D 5e */
const ID = "camp-exploration";
const SOCKET = `module.${ID}`;
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const SKILLS = {
  ath: "Athletics", ani: "Animal Handling", dec: "Deception", his: "History",
  itm: "Intimidation", inv: "Investigation", nat: "Nature", prc: "Perception",
  per: "Persuasion", prf: "Performance", ste: "Stealth", sur: "Survival"
};
const OTHER = {
  str: "Strength check", navigator: "Navigator's tools (manual)", map: "Map (manual)",
  tools: "Appropriate tools (manual)", instrument: "Musical instrument (manual)",
  tinkering: "Tinker's tools (manual)", herbalism: "Herbalism kit (manual)",
  cooking: "Cook's utensils (manual)", downtime: "Downtime check (manual)"
};
const CATALOG = {
  exploration: [
    {id:"guide", name:"Guide", required:"nat", checks:["nat","his","inv","map"], pair:["his","inv"], note:"Nature & History or Investigation; map allowed"},
    {id:"scout", name:"Scout", required:"prc", checks:["prc","sur","ste"], pair:["sur","ste"], note:"Perception & Survival or Stealth"},
    {id:"navigator", name:"Navigator", required:"navigator", checks:["navigator","sur"], pair:["sur"], note:"Navigator's tools & Survival"},
    {id:"tracker", name:"Tracker", required:"prc", checks:["prc","nat","sur"], pair:["nat","sur"], note:"Perception & Nature or Survival"},
    {id:"quartermaster", name:"Quartermaster", required:"ath", checks:["ath"], note:"Athletics"},
    {id:"cartographer", name:"Cartographer", required:"tools", checks:["tools","his","sur"], pair:["his","sur"], note:"Tools & History or Survival"},
    {id:"packmaster", name:"Packmaster", required:"ani", checks:["ani"], note:"Animal Handling"},
    {id:"entertainer", name:"Entertainer", required:"prf", checks:["prf","instrument"], pair:["instrument"], note:"Performance or musical instrument"},
    {id:"rearguard", name:"Rear Guard", required:"dec", checks:["dec","sur"], pair:["sur"], note:"Deception & Survival"},
    {id:"traveller", name:"Traveller", required:"sur", checks:["sur"], note:"Survival"}
  ],
  camp: [
    {id:"setcamp", name:"Set Camp", checks:["ath","str"], note:"Athletics or Strength"},
    {id:"keepwatch", name:"Keep Watch", required:"prc", checks:["prc"], note:"Perception"},
    {id:"fortify", name:"Fortify Camp", required:"sur", checks:["sur","tinkering"], note:"Survival or Tinkering"},
    {id:"perimeter", name:"Scout Perimeter", required:"prc", checks:["prc","sur","ste"], pair:["sur","ste"], note:"Perception & Survival or Stealth"},
    {id:"hunter", name:"Hunter or Trapper", required:"sur", checks:["sur","ste","nat"], pair:["ste","nat"], note:"Survival & Stealth or Nature"},
    {id:"forage", name:"Forage", required:"herbalism", checks:["herbalism","nat","sur"], pair:["nat","sur"], note:"Herbalism & Nature or Survival"},
    {id:"leader", name:"Leader", checks:["per","dec","prf","itm"], note:"Persuasion, Deception, Performance or Intimidation"},
    {id:"entertainer", name:"Entertainer", checks:["prf","instrument"], note:"Performance or musical instrument"},
    {id:"cook", name:"Cook", required:"cooking", checks:["cooking"], note:"Cook's utensils"},
    {id:"downtime", name:"Other Downtime", checks:["downtime"], note:"Varies; choose your own check"},
    {id:"fullrest", name:"Full Rest", checks:[], note:"No roll"}
  ],
  finder: [
    {id:"scout", name:"Campsite Scout", required:"prc", checks:["prc","sur","ste"], pair:["sur","ste"], note:"Perception & Survival or Stealth"},
    {id:"guide", name:"Campsite Guide", required:"nat", checks:["nat","his","inv","map"], pair:["his","inv"], note:"Nature & History or Investigation; map allowed"}
  ]
};
const DC_LABELS = [
  {value:0,label:"0 — Inn / established settlement"},
  {value:5,label:"5 — Peaceful countryside"},
  {value:10,label:"10 — Tamed wilderness / city streets"},
  {value:15,label:"15 — Untamed, hazardous or unknown terrain"},
  {value:20,label:"20 — Deadly wilderness / monster-infested caves"},
  {value:25,label:"25 — Utterly inhospitable / untravelled"},
  {value:30,label:"30 — Alien planes / unspeakable horror"}
];
const WATCHES = [{id:"",name:"No watch"},{id:"first",name:"First watch"},{id:"second",name:"Second watch"},{id:"third",name:"Third watch"}];
const SUPPLY_SIZES = [12,10,8,6,4,0];
const DEFAULT_STATE = {
  day:1, dc:15, chaos:3, supply:{die:8, lastDay:0}, assignments:{},
  history:{}, site:{scout:null,guide:null,outcome:null}
};
let app;
let writeQueue = Promise.resolve();

function safeState() {
  const raw = game.settings.get(ID, "state") || {};
  return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_STATE), raw, {inplace:false});
}
function actorFor(userId) { return game.users.get(userId)?.character || null; }
function prof(actor, skill) {
  return !!actor && !!SKILLS[skill] && Number(actor.system?.skills?.[skill]?.value || 0) >= 1;
}
function role(stage, key) { return CATALOG[stage]?.find(r => r.id === key); }
function assignment(state, uid) {
  return state.assignments[uid] || {exploration:["",""],camp:["",""],finder:"",watch:""};
}
function eligible(userId, roleDef) {
  if (!roleDef?.required || !SKILLS[roleDef.required]) return true;
  const actor = actorFor(userId);
  return !!actor && prof(actor, roleDef.required);
}
function modeFor(actor, roleDef, choice, overloaded) {
  const primary = roleDef?.required;
  const pair = roleDef?.pair || [];
  const both = !!primary && prof(actor, primary) && (choice === primary ? pair.some(p => prof(actor, p)) : pair.includes(choice) && prof(actor, choice));
  // Advantage (two proficiencies) and disadvantage (two duties) cancel.
  return {advantage: both && !overloaded, disadvantage: overloaded && !both};
}
function normalizedRoll(maybe) {
  if (Array.isArray(maybe)) return maybe.map(normalizedRoll).find(Boolean);
  if (!maybe || typeof maybe !== "object") return null;
  if (Number.isFinite(maybe.total) && Array.isArray(maybe.dice)) return maybe;
  for (const key of ["roll","rolls","result"]) {
    if (maybe[key]) { const found = normalizedRoll(maybe[key]); if (found) return found; }
  }
  return null;
}
function naturalFrom(roll) {
  const die = roll?.dice?.find(d => Number(d.faces) === 20);
  if (!die) return null;
  const kept = die.results?.find(r => r.active !== false && r.discarded !== true);
  return Number.isFinite(kept?.result) ? kept.result : null;
}
function skillBadges(actor, roleDef) {
  return (roleDef?.checks || []).map(code => {
    const name = SKILLS[code] || OTHER[code] || code;
    const mandatory = roleDef.required === code && !!SKILLS[code];
    let state = "unknown", prefix = "?", explanation = "Check character sheet";
    if (SKILLS[code] && actor) {
      const rank = Number(actor.system?.skills?.[code]?.value || 0);
      if (rank >= 2) { state = "expertise"; prefix = "★"; explanation = "Expertise"; }
      else if (rank >= 1) { state = "proficient"; prefix = "✓"; explanation = "Proficient"; }
      else if (rank > 0) { state = "partial"; prefix = "½"; explanation = "Half proficiency"; }
      else { state = "untrained"; prefix = "×"; explanation = "Not proficient"; }
    } else if (code === "str") {
      state = "ability"; prefix = "–"; explanation = "Ability check; no skill proficiency needed";
    }
    return {name, state, prefix, mandatory, explanation};
  });
}
function roleDisplay(stage, key, actor, placeholder) {
  const def = role(stage, key);
  return {name: def?.name || placeholder, empty: !def, skills:skillBadges(actor, def)};
}
// Skill chips appear both in selected-role buttons and alongside every option in the picker.
function skillBadgesHTML(actor, def) {
  return skillBadges(actor, def).map(({name,state,prefix,mandatory,explanation}) =>
    `<span class="ce-skill ce-skill--${state}" title="${foundry.utils.escapeHTML(explanation)}${mandatory ? " · Required" : ""}"><span aria-hidden="true">${prefix}</span> ${foundry.utils.escapeHTML(name)}${mandatory ? "<b aria-label=\"Required\">*</b>" : ""}</span>`
  ).join("");
}
function selectSimple(options, selected) {
  return options.map(item => ({id:item.id, label:item.name, selected:item.id === selected}));
}
function siteOutcome(state) {
  const a = state.site.scout, b = state.site.guide;
  if (!a || !b || a.day !== state.day || b.day !== state.day) return null;
  const success = Number(a.total >= state.dc) + Number(b.total >= state.dc);
  return {
    successes:success,
    title: success === 2 ? "Good campsite — long rest" : success === 1 ?
      "Reasonable campsite — potential long rest" : "Poor campsite — short rest only",
    description: success === 1 ? "The GM decides whether a long rest is possible." :
      success === 2 ? "The campsite can support a long rest." : "Only a short rest is suitable."
  };
}
function isGMOnline() { return game.users.filter(u => u.active && u.isGM).length > 0; }
function isPrimaryGM() {
  const ids=game.users.filter(u=>u.active && u.isGM).map(u=>u.id).sort();
  return game.user.id === ids[0];
}
function notifyProblem(message) { ui.notifications.warn(message); }

async function save(next) {
  await game.settings.set(ID, "state", next);
  game.socket.emit(SOCKET, {kind:"refresh"});
  app?.render();
}
function mutate(action, payload) {
  // The GM is the sole writer of the shared state. Queue requests to avoid lost updates.
  writeQueue = writeQueue.then(async () => {
    if (!game.user.isGM) return;
    const state = safeState();
    const uid = String(payload.userId || "");
    const user = game.users.get(uid);
    const actor = actorFor(uid);
    const gmOnly = ["dc","chaos","advance","resetDay","supply", "resupply", "reset"].includes(action);
    // Non-GM players are shown controls for their own rows only. Requests are checked
    // for known users and valid values; no client can directly modify world settings.
    if (gmOnly && !payload.fromGM) return;
    if (action === "assign") {
      if (!user || user.isGM) return;
      const field = String(payload.field || "");
      const value = String(payload.value || "");
      const a = structuredClone(assignment(state, uid));
      if (field === "finder") {
        if (value && !role("finder", value)) return;
        if (value && !eligible(uid, role("finder",value))) return notifyProblem(`${user.name} needs the first listed proficiency for this role.`);
        if (value && Object.entries(state.assignments).some(([otherId, other])=> otherId !== uid && other.finder === value)) return notifyProblem(`${role("finder",value).name} is already assigned.`);
        a.finder = value;
        state.site = {scout:null,guide:null,outcome:null};
      } else if (field === "watch") {
        if (!WATCHES.some(w=>w.id === value)) return;
        a.watch=value;
      } else if (/^(exploration|camp)[01]$/.test(field)) {
        const stage=field.replace(/[01]$/, ""), idx=Number(field.slice(-1));
        if (value && !role(stage,value)) return;
        if (value && !eligible(uid,role(stage,value))) return notifyProblem(`${user.name} needs proficiency in ${SKILLS[role(stage,value).required]} for ${role(stage,value).name}.`);
        const selected=[...(a[stage] || ["",""])];
        if (value && selected[1-idx] === value) return;
        if (stage === "camp" && idx === 1 && (selected[0] === "fullrest" || value === "fullrest")) return;
        selected[idx]=value;
        if (!selected[0] || (stage === "camp" && selected[0] === "fullrest")) selected[1]="";
        a[stage]=selected;
        for (let slot=0;slot<2;slot++) delete state.history[`${state.day}:${stage}:${uid}:${slot}`];
      } else return;
      state.assignments[uid]=a;
    } else if (action === "recordRoll") {
      if (!user || user.isGM || !Number.isFinite(payload.total)) return;
      const stage = String(payload.stage || ""), slot = Number(payload.slot);
      const a = assignment(state,uid);
      if (Number(payload.day) !== state.day) return;
      if (stage === "finder") {
        if (!role("finder",a.finder) || payload.role !== a.finder) return;
        if (state.site[a.finder]?.day === state.day) return;
        state.site[a.finder]={uid,day:state.day,total:Number(payload.total),natural:payload.natural ?? null};
        const outcome=siteOutcome(state);
        if (outcome) {
          state.site.outcome=outcome.title;
          await ChatMessage.create({content:`<strong>Find a campsite:</strong> ${foundry.utils.escapeHTML(outcome.title)}. ${foundry.utils.escapeHTML(outcome.description)} (DC ${state.dc}; Scout ${state.site.scout.total}, Guide ${state.site.guide.total}).`});
        }
      } else if ((stage === "exploration" || stage === "camp") && [0,1].includes(slot)) {
        if (a[stage]?.[slot] !== payload.role || !payload.role) return;
        const key=`${state.day}:${stage}:${uid}:${slot}`;
        if (state.history[key]) return;
        state.history[key]={total:Number(payload.total),natural:payload.natural ?? null};
      } else if (stage === "watch") {
        if (!a.watch || payload.role !== a.watch) return;
        const key=`${state.day}:watch:${uid}:0`;
        if (state.history[key]) return;
        state.history[key]={total:Number(payload.total),natural:payload.natural ?? null};
      } else return;
    } else if (action === "dc") {
      const dc=Number(payload.value);
      if (!DC_LABELS.some(v=>v.value===dc)) return;
      state.dc=dc; state.site={scout:null,guide:null,outcome:null};
    } else if (action === "chaos") {
      const chaos=Number(payload.value);
      if (!Number.isInteger(chaos) || chaos < 0 || chaos > 9) return;
      state.chaos=chaos;
    } else if (action === "advance") {
      state.day+=1; state.site={scout:null,guide:null,outcome:null}; state.history={};
    } else if (action === "resetDay") {
      // Re-run the CURRENT day: clear its rolls and assignments, including the
      // once-per-day supply-check lock. Depletion is not undone and no supplies
      // are granted back; the journey day, DC and chaos are also unchanged.
      state.assignments={}; state.history={}; state.site={scout:null,guide:null,outcome:null};
      state.supply.lastDay=0;
    } else if (action === "resupply") {
      const die=Number(payload.value);
      if (![8,10,12].includes(die)) return;
      state.supply.die=die;
      // Resupply does not grant a second supply check on the same day.
    } else if (action === "supply") {
      if (state.supply.lastDay === state.day || state.supply.die === 0) return;
      const die=state.supply.die;
      const roll=await new Roll(`1d${die}`).evaluate();
      await roll.toMessage({flavor:`Journey day ${state.day}: Supply die (d${die})`, speaker:{alias:"Party supplies"}});
      state.supply.lastDay=state.day;
      if (roll.total <= 2) state.supply.die=SUPPLY_SIZES[SUPPLY_SIZES.indexOf(die)+1] ?? 0;
      await ChatMessage.create({content:roll.total <= 2 ? `<strong>Supplies shrink:</strong> d${die} → ${state.supply.die ? `d${state.supply.die}` : "depleted"}.` : `<strong>Supplies hold:</strong> still d${die}.`});
    } else if (action === "reset") {
      state.day=1; state.assignments={}; state.history={};
      state.site={scout:null,guide:null,outcome:null}; state.supply.lastDay=0;
    } else return;
    await save(state);
  }).catch(error => console.error(`${ID} | State update failed`, error));
  return writeQueue;
}
function send(action,payload={}) {
  if (!game.user.isGM && !isGMOnline()) return notifyProblem("A GM must be online to save party assignments or results.");
  // fromGM is only supplied locally by a GM; remote clients cannot request GM actions through the UI.
  if (game.user.isGM) return mutate(action,{...payload,fromGM:true});
  game.socket.emit(SOCKET,{kind:"request",action,payload});
}

class CampBoard extends HandlebarsApplicationMixin(ApplicationV2) {
  // ApplicationV2 replaces the board HTML on every state update, so restore
  // each client's own scroll position and expanded reference sections. This
  // runs for role changes, dice rolls, supply checks, and remote refreshes.
  _captureBoardView() {
    const root=this.element;
    if (!root) return null;
    const board=root.querySelector(".ce-board");
    const content=root.querySelector(".window-content");
    if (!board) return null;
    return {
      boardTop:board.scrollTop, boardLeft:board.scrollLeft,
      contentTop:content?.scrollTop ?? 0,
      tableLefts:[...root.querySelectorAll(".ce-scroll")].map(el=>el.scrollLeft),
      referenceOpen:[...root.querySelectorAll("details.ce-reference")].map(el=>el.open)
    };
  }
  _restoreBoardView() {
    const view=this._boardView;
    this._boardView=null;
    if (!view || !this.element) return;
    const root=this.element;
    // Expand references first: opening details changes document height.
    root.querySelectorAll("details.ce-reference").forEach((el,i)=>{
      if (i < view.referenceOpen.length) el.open=view.referenceOpen[i];
    });
    root.querySelectorAll(".ce-scroll").forEach((el,i)=>{
      if (i < view.tableLefts.length) el.scrollLeft=view.tableLefts[i];
    });
    const content=root.querySelector(".window-content");
    if (content) content.scrollTop=view.contentTop;
    const board=root.querySelector(".ce-board");
    if (board) {
      board.scrollTop=view.boardTop;
      board.scrollLeft=view.boardLeft;
    }
  }
  async _preRender(context, options) {
    this._boardView=this._captureBoardView();
    await super._preRender(context,options);
  }
  static DEFAULT_OPTIONS = {
    id:"camp-exploration-board",
    classes:["camp-exploration"],
    window:{title:"Camp & Exploration",icon:"fa-solid fa-campground",resizable:true},
    position:{width:1040,height:760}
  };
  static PARTS={board:{template:`modules/${ID}/templates/board.hbs`}};
  async _prepareContext(options) {
    const context=await super._prepareContext(options);
    const state=safeState();
    const players=game.users.filter(u=>!u.isGM).sort((a,b)=>a.name.localeCompare(b.name)).map(user=>{
      const a=assignment(state,user.id), actor=actorFor(user.id);
      const editable=game.user.isGM || game.user.id === user.id;
      const hist=(stage,slot)=>state.history[`${state.day}:${stage}:${user.id}:${slot}`];
      const choices=(stage,idx)=>roleDisplay(stage,a[stage]?.[idx] || "",actor,idx ? "— No second duty —" : "— Choose a role —");
      const rolled0=hist("exploration",0),rolled1=hist("exploration",1),rolledC0=hist("camp",0),rolledC1=hist("camp",1);
      return {
        id:user.id,name:user.name,active:user.active,actorName:actor?.name || "No assigned character",
        editable,hasActor:!!actor,watchSkill:skillBadges(actor,{checks:["prc"]})[0],
        canPickExploration1:editable && !!a.exploration?.[0],
        canPickCamp1:editable && !!a.camp?.[0] && a.camp[0]!=="fullrest",
        exploration0:choices("exploration",0),exploration1:choices("exploration",1),
        camp0:choices("camp",0),camp1:choices("camp",1),
        hasExploration0:!!a.exploration?.[0],hasExploration1:!!a.exploration?.[1],
        hasCamp0:!!a.camp?.[0],hasCamp1:!!a.camp?.[1],
        canRollExp0:editable&&!!actor&&!!a.exploration?.[0]&&!rolled0,
        canRollExp1:editable&&!!actor&&!!a.exploration?.[1]&&!rolled1,
        canRollCamp0:editable&&!!actor&&!!a.camp?.[0]&&!rolledC0&&a.camp[0]!=="fullrest",
        canRollCamp1:editable&&!!actor&&!!a.camp?.[1]&&!rolledC1&&a.camp[1]!=="fullrest",
        expResult0:rolled0?.total,expResult1:rolled1?.total,campResult0:rolledC0?.total,campResult1:rolledC1?.total,
        expRolled0:!!rolled0,expRolled1:!!rolled1,campRolled0:!!rolledC0,campRolled1:!!rolledC1,
        finder:roleDisplay("finder",a.finder || "",actor,"— Not finding —"),
        watch:selectSimple(WATCHES,a.watch||""),
        finderSelected:!!a.finder,
        finderRolled:!!(a.finder && state.site[a.finder]?.day===state.day),
        finderTotal:a.finder && state.site[a.finder]?.day === state.day ? state.site[a.finder]?.total : null,
        canRollFinder:editable&&!!actor&&!!a.finder&&!(state.site[a.finder]?.day===state.day),
        canRollWatch:editable&&!!actor&&!!a.watch&&!hist("watch",0),
        watchRolled:!!hist("watch",0),watchResult:hist("watch",0)?.total,
        note: !actor ? "Assign a character in User Configuration to enable rolls." : ""
      };
    });
    const finders=players.filter(p=>p.finderSelected).length;
    const explorationAssigned=players.filter(p=>p.hasExploration0).length;
    const campAssigned=players.filter(p=>p.hasCamp0).length;
    const outcome=siteOutcome(state);
    return {
      ...context, day:state.day,dc:state.dc,chaos:state.chaos,players,gm:game.user.isGM,
      dcOptions:DC_LABELS.map(dc=>({...dc,selected:state.dc===dc.value})),
      supplyDie:state.supply.die,supplyExhausted:!state.supply.die,
      supplyRolled:state.supply.lastDay===state.day,
      supplyOptions:[12,10,8].map(d=>({value:d,label:`d${d}`,selected:state.supply.die===d})),
      canRollSupply:game.user.isGM&&state.supply.lastDay!==state.day&&!!state.supply.die,
      finderCount:finders,findersReady:finders===2,siteOutcome:outcome,
      playerCount:players.length, explorationAssigned, campAssigned,
      explorationRoles:CATALOG.exploration,campRoles:CATALOG.camp,finderRoles:CATALOG.finder,
      watchNames:WATCHES.filter(w=>w.id).map(w=>({
        id:w.id,name:w.name,players:players.filter(p=>assignment(state,p.id).watch===w.id).map(p=>p.name).join(", ") || "Unassigned"
      }))
    };
  }
  _onRender(context, options) {
    super._onRender(context,options);
    this._restoreBoardView();
    const root=this.element;
    root.querySelectorAll("[data-ce-field]").forEach(el=>el.addEventListener("change",event=>{
      const target=event.currentTarget;
      const field=target.dataset.ceField;
      if (field === "dc" || field === "chaos") send(field,{value:target.value});
      else if (field === "resupply") send("resupply",{value:target.value});
      else send("assign",{userId:target.dataset.userId,field,value:target.value});
    }));
    root.querySelectorAll("[data-ce-action]").forEach(el=>el.addEventListener("click",async event=>{
      const target=event.currentTarget;
      const action=target.dataset.ceAction;
      if (action === "pick-role") await this._pickRole(target.dataset.userId,target.dataset.ceField);
      else if (action === "roll") await this._roll(target.dataset.userId,target.dataset.stage,Number(target.dataset.slot||0));
      else if (action === "rest") await this._restParty();
      else if (["supply","advance","resetDay","reset"].includes(action)) {
        if (!game.user.isGM) return;
        if (["resetDay","advance","reset"].includes(action)) {
          const question = action === "resetDay"
            ? "Reset the current day? Clear all role and watch assignments, campsite-finding checks and recorded rolls, and unlock today's supply check? The day number, current supply die size, chaos factor and character resources remain unchanged."
            : action === "reset" ? "Start a new expedition from day 1? This clears all assignments and recorded rolls."
            : "Move to the next journey day? Existing role assignments remain.";
          if (!await DialogV2.confirm({window:{title:"Confirm journey change"},content:`<p>${question}</p>`})) return;
        }
        await send(action);
      }
    }));
  }
  async _pickRole(userId,field) {
    if (!game.user.isGM && userId !== game.user.id) return;
    const state = safeState();
    const match=/^(exploration|camp)([01])$/.exec(field);
    const stage = field === "finder" ? "finder" : match?.[1];
    if (!stage) return;
    const actor=actorFor(userId), a=assignment(state,userId);
    const selected=field === "finder" ? a.finder : a[stage]?.[Number(match[2])] || "";
    const name=game.users.get(userId)?.name || "Player";
    if (match?.[2] === "1" && (!a[stage]?.[0] || (stage === "camp" && a[stage][0] === "fullrest")))
      return notifyProblem("Choose an active primary duty before adding a second duty.");
    const emptyLabel = field === "finder" ? "Not finding campsite" : field.endsWith("1") ? "No second duty" : "Not assigned";
    const options=[{id:"",name:emptyLabel},...CATALOG[stage]];
    const rows=options.map(def=>{
      const allowed=!def.id || eligible(userId,def);
      const conflicting=stage === "finder" && !!def.id && Object.entries(state.assignments)
        .some(([id,entry])=>id!==userId && entry.finder===def.id);
      const duplicate=!!def.id && !!match && a[stage]?.[1-Number(match[2])]===def.id;
      const secondFullRest=!!match && match[1] === "camp" && match[2] === "1" && def.id === "fullrest";
      const blocked=!!def.id && (conflicting || duplicate || !allowed || secondFullRest);
      const reason=conflicting ? "Already assigned" : duplicate ? "Already selected" : !allowed ? "Required skill missing" : secondFullRest ? "Not a second duty" : "";
      return `<label class="ce-role-option${blocked ? " ce-role-unavailable" : ""}">
        <input type="radio" name="role" value="${def.id}" ${def.id === selected ? "checked" : ""} ${blocked ? "disabled" : ""}/>
        <span class="ce-role-option-body"><span class="ce-role-option-head"><strong>${foundry.utils.escapeHTML(def.name)}</strong>${reason ? `<em>${reason}</em>` : ""}</span>
        ${def.note ? `<span class="ce-role-note">${foundry.utils.escapeHTML(def.note)}</span>` : ""}
        <span class="ce-skill-row">${skillBadgesHTML(actor,def)}</span></span>
      </label>`;
    }).join("");
    const result=await DialogV2.input({window:{title:`Choose ${stage === "finder" ? "campsite finder" : stage} role — ${name}`},
      content:`<div class="ce-role-dialog"><p>Skill colours refer to <strong>${foundry.utils.escapeHTML(actor?.name || "an unassigned character")}</strong>. <span class="ce-skill ce-skill--proficient">✓ Proficient</span> <span class="ce-skill ce-skill--untrained">× Not proficient</span> <span class="ce-skill ce-skill--expertise">★ Expertise</span> <span class="ce-skill ce-skill--partial">½ Half proficiency</span> <span class="ce-skill ce-skill--unknown">? Check sheet</span><br/><small>* Required proficiency. Tool proficiencies may need manual checking.</small></p><div class="ce-role-choices">${rows}</div></div>`,
      ok:{label:"Assign role"}});
    if (!result || typeof result.role !== "string") return;
    if (result.role === selected) return;
    const chosen=role(stage,result.role);
    if (chosen && !eligible(userId,chosen)) return notifyProblem("Required skill proficiency is missing.");
    if (chosen && stage === "finder" && Object.entries(safeState().assignments).some(([id,x])=>id!==userId && x.finder===result.role))
      return notifyProblem("This campsite-finding role is already assigned.");
    await send("assign",{userId,field,value:result.role});
  }
  async _restParty() {
    if (!game.user.isGM) return;
    // Unique assigned character documents; never rest NPCs or the same actor twice.
    const actors=[...new Map(game.users.filter(user=>!user.isGM && user.character?.type === "character")
      .map(user=>[user.character.uuid || user.character.id,user.character])).values()];
    if (!actors.length) return notifyProblem("No player characters are assigned to non-GM users.");
    const choice=await DialogV2.input({window:{title:"Party rest — GM only"},
      content:`<div class="form-group"><label>Rest type</label><select name="restType"><option value="short">Short rest</option><option value="long">Long rest</option></select></div><p>Apply the selected D&D 5e rest to ${actors.length} assigned player character(s). Short rests may open each character's Hit Dice dialog. The journey day and assignments are not changed.</p>`,
      ok:{label:"Continue"}});
    const kind=choice?.restType;
    if (!["short","long"].includes(kind)) return;
    const names=actors.map(actor=>foundry.utils.escapeHTML(actor.name)).join(", ");
    const confirmed=await DialogV2.confirm({window:{title:`Confirm ${kind} rest`},
      content:`<p>Apply a <strong>${kind} rest</strong> to ${actors.length} character(s): ${names}?</p><p>This updates character resources and cannot be undone by Reset Day.</p>`});
    if (!confirmed) return;
    let completed=0,skipped=0;
    const failed=[];
    for (const actor of actors) {
      try {
        const method=kind === "short" ? actor.shortRest : actor.longRest;
        if (typeof method !== "function") throw new Error("D&D 5e rest API unavailable");
        const options=kind === "short" ? {dialog:true,chat:true} : {dialog:false,chat:true,newDay:true};
        const result=await method.call(actor,options);
        if (result === false || result === null) skipped++;
        else completed++;
      } catch (error) { failed.push(actor.name); console.error(`${ID} | Rest failed for ${actor.name}`,error); }
    }
    await ChatMessage.create({content:`<strong>Party ${kind} rest:</strong> ${completed} character(s) completed, ${skipped} cancelled${failed.length ? `; failed: ${foundry.utils.escapeHTML(failed.join(", "))}` : ""}. Journey day unchanged.`});
    if (failed.length) notifyProblem(`Rest failed for ${failed.join(", ")}; see console.`);
  }
  async _roll(userId,stage,slot) {
    if (!game.user.isGM && userId !== game.user.id) return;
    const state=safeState();
    const a=assignment(state,userId),actor=actorFor(userId);
    if (!actor) return notifyProblem("Assign a D&D 5e character to this player first.");
    let key=stage==="finder" ? a.finder : stage==="watch" ? a.watch : a[stage]?.[slot];
    if(!key) return;
    const roleDef=stage === "watch" ? {id:"watch",name:"Campsite Watch",checks:["prc"],required:"prc"} : role(stage,key);
    if (!roleDef || roleDef.id === "fullrest") return;
    const day=state.day;
    if(stage === "finder" && Object.entries(state.assignments).filter(([,as])=>!!as.finder).length!==2)
      return notifyProblem("Exactly two players must find the campsite: one Scout and one Guide.");
    if(stage === "finder" && state.site[key]?.day===day) return;
    if(stage !== "finder" && state.history[`${day}:${stage}:${userId}:${slot}`]) return;
    const overloaded=(stage==="exploration" || stage==="camp") && (a[stage]||[]).filter(Boolean).length > 1;
    const checks=roleDef.checks;
    let check=checks[0];
    if (checks.length > 1) {
      const optionsHtml=checks.map(c=>`<option value="${c}">${foundry.utils.escapeHTML(SKILLS[c] || OTHER[c] || c)}</option>`).join("");
      const choice=await DialogV2.input({window:{title:`${roleDef.name} — choose check`},content:`<p>${foundry.utils.escapeHTML(roleDef.note || "")}</p><div class="form-group"><label>Roll using</label><select name="choice">${optionsHtml}</select></div>`,ok:{label:"Continue"}});
      if (!choice?.choice) return;
      check=choice.choice;
    }
    const mode=modeFor(actor,roleDef,check,overloaded);
    // When both proficiency bonus and double duty apply, checks are normal.
    let result;
    try {
      if (SKILLS[check] && typeof actor.rollSkill === "function") {
        result=normalizedRoll(await actor.rollSkill({skill:check,rolls:[{options:mode}]}));
      } else if (check==="str" && typeof actor.rollAbilityCheck === "function") {
        result=normalizedRoll(await actor.rollAbilityCheck({ability:"str",rolls:[{options:mode}]}));
      } else {
        const form=await DialogV2.input({window:{title:`${roleDef.name} — manual modifier`},content:`<p>${foundry.utils.escapeHTML(OTHER[check]||check)}: enter the total modifier, including ability, proficiency and any tool bonuses.</p><div class="form-group"><label>Modifier</label><input type="number" name="bonus" value="0" /></div>`,ok:{label:"Roll"}});
        if(!form) return;
        const bonus=Number(form.bonus);
        if(!Number.isFinite(bonus) || Math.abs(bonus)>100) return notifyProblem("Invalid modifier.");
        const formula=mode.advantage?"2d20kh1+@bonus":mode.disadvantage?"2d20kl1+@bonus":"1d20+@bonus";
        result=await new Roll(formula,{bonus}).evaluate();
        await result.toMessage({flavor:`Day ${day} · ${actor.name} · ${roleDef.name} (${OTHER[check] || check})`,speaker:ChatMessage.getSpeaker({actor})});
      }
    } catch(error) {console.error(`${ID} | Roll failed`,error);return ui.notifications.error(`Unable to roll ${roleDef.name}; see console.`);}
    if(!result || !Number.isFinite(result.total)) return notifyProblem("The roll was cancelled or returned no total.");
    const natural=naturalFrom(result);
    if(natural===1 || natural===20) {
      await ChatMessage.create({content:`<strong>${foundry.utils.escapeHTML(roleDef.name)}:</strong> natural ${natural}. ${natural===1 ? "A complication may occur" : "An opportunity may arise"} — GM adjudicates; no effect applied automatically.`,speaker:ChatMessage.getSpeaker({actor})});
    }
    send("recordRoll",{userId,stage,slot,role:key,day,total:result.total,natural});
  }
}

Hooks.once("init",()=>{
  game.settings.register(ID,"state",{name:"Camp & Exploration state",scope:"world",config:false,type:Object,default:foundry.utils.deepClone(DEFAULT_STATE)});
  game.keybindings.register(ID,"openBoard",{name:"Open Camp & Exploration",editable:[{key:"KeyJ",modifiers:["SHIFT"]}],onDown:()=>{openBoard();return true;},restricted:false});
});
Hooks.once("ready",()=>{
  game.socket.on(SOCKET,(data)=>{
    if (data?.kind==="refresh") {app?.render();return;}
    if (data?.kind==="request" && game.user.isGM && isPrimaryGM()) {
      // Only assignment and completed-roll reports are accepted over the player socket.
      if (["assign","recordRoll"].includes(data.action)) mutate(data.action,data.payload||{});
    }
  });
  Hooks.on("updateSetting",(setting)=>{if(setting.key===`${ID}.state`)app?.render();});
  game.modules.get(ID).api={open:openBoard,resetDay:()=>game.user.isGM ? mutate("resetDay",{fromGM:true}) : notifyProblem("GM only.")};
  // Persistent button beside the chat entry for both GMs and players.
  Hooks.on("renderChatLog",(_app,html)=>addLauncher(html));
  Hooks.on("renderChatPopout",(_app,html)=>addLauncher(html));
  // Foundry v14 uses ChatLogV2 and may not emit the legacy hook.
  Hooks.on("renderChatLogV2",(_app,html)=>addLauncher(html));
  // Also provide a stable macro/API entry point if chat DOM changes.
});
function openBoard() {
  if(!app) app=new CampBoard();
  app.render({force:true});
}
function addLauncher(html) {
  const root=html instanceof HTMLElement ? html : html?.[0];
  if(!root || root.querySelector(".ce-launcher"))return;
  const button=document.createElement("button");
  button.type="button";button.className="ce-launcher";
  button.title="Open Camp & Exploration";
  button.innerHTML='<i class="fa-solid fa-campground"></i> Camp & Exploration';
  button.addEventListener("click",openBoard);
  const footer=root.querySelector(".chat-form, #chat-form, .chat-controls, .chat-input")||root;
  footer.insertAdjacentElement("beforebegin",button);
}

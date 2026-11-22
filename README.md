# Camp & Exploration for Foundry VTT

A small shared party board for a D&D 5e homebrew travel and camping procedure. Designed for **Foundry VTT v14** and modern `dnd5e`.

## What it does

- Each player self-assigns a **primary Exploration** duty and **primary Campsite** duty. A second duty in either phase is optional, and adds disadvantage to both associated duty rolls. Role assignments persist between journey days.
- Exactly two *different* players find a campsite: one **Scout** and one **Guide**, against a GM-chosen terrain DC. Two passes permit a long rest; one pass indicates a reasonable camp where the GM judges whether a long rest is possible; neither pass allows only a short rest. The **GM-only Party rest** button explicitly invokes the D&D 5e short/long rest workflow for each assigned player character after confirmation.
- Players can opt in to **First, Second, Third, or Fourth Watch** (four two-hour slots), or take no watch. Watch checks use Perception. Multiple characters can share a watch, but one person can be assigned to only one watch.
- **Role pickers display each character's proficiency** using green ✓, blue ★ for Expertise, red × for untrained, amber OFFSET for a pace-penalised skill, and grey ? for unverified tool proficiency. A skill's colour shows its eligibility for the pairing; it **does not promise advantage on its own**. Each selected role also displays its default check's final mode (Normal / Advantage / Disadvantage) and the qualifying skill-group count (0/2, 1/2 or 2/2).
- GM-controlled **Travel Pace**: Fast +25%, Normal, Slow −25%, without fixed mileage. At Fast pace, ordinary proficiency in Perception, Survival or Stealth does not count toward the **two-skill advantage pair**; at Normal pace the offset applies only to Stealth. Expertise still counts after one pace offset. Slow pace independently gives all Perception/Survival checks advantage, even for the untrained, and may temporarily permit those required skills for role assignment. Pace does **not remove proficiency bonuses** or impose disadvantage by itself under this homebrew. A separate second-duty penalty can still impose disadvantage; it cancels advantage if present. Matching pace effects extend throughout the exploration, campsite and watch checks. Next Day resets to Normal; Reset Day preserves the chosen pace.
- Each expanded role reference shows a short **guidance description** of what its duty represents, without new rolls or automatic consequences. **Other Downtime** now offers all 18 standard skills and **N/A** on clicking Roll; choosing a skill uses the native character check, and N/A records completion without rolling.
- Journey duties are rolled once per duty per day. D&D 5e's native skill-check API handles regular skills, allowing normal character bonuses and integrations. Natural 1/20 on the kept die posts a narrative prompt, with **no automated mechanical effect**.
- **Paired proficiency advantage:** Roles with two-part requirements need **the required first skill (or first-group alternative) AND one complementary second skill**, both qualifying for today's pace. Only then does a check from one of those qualified skill groups gain advantage. Selecting an untrained alternative does not inherit another skill's proficiency. A single-skill role or a role with **OR** alternatives does not gain automatic advantage merely from proficiency. For tool-based pairs (Navigator, Cartographer, Forage or a Map alternative), players explicitly confirm the relevant tool proficiency in the check dialog to enable the bonus. This avoids assuming tool proficiency from unknown Foundry field layouts.
- A daily **supply die** roll reduces the current die on 1 or 2: d12 → d10 → d8 → d6 → d4 → depleted. GM resupply sets the die to d8 (party), d10 (pack animals), or d12 (wagons).
- The image's **Chaos Factor** starts at 3 and can be adjusted by the GM; it does not itself trigger events.
- GM-only **Party rest** applies a short/long rest to each unique player-assigned D&D 5e character. Short rests open each actor’s native rest/Hit Dice dialog; long rests run the system workflow automatically. A rest does **not** advance/reset the journey day.
- GM-only **Reset day** clears the current day’s exploration, camp, finder and watch assignments, rolls and campsite result, and **unlocks Check Supply** for a new roll, preserving the selected pace for that day. The day number, current depleted supply die, chaos factor and character resources remain unchanged. **Next day** advances the number, clears results but retains role assignments.


### Role catalogue / AND–OR rules

The following role groups were audited against the supplied rules reference:

| Phase | Two-part advantage pairs | One-skill or alternative duties |
|---|---|---|
| Exploration | Guide: Nature + (History / Investigation / Map); Scout: Perception + (Survival / Stealth); Navigator: Navigator's Tools + Survival; Tracker: Perception + (Nature / Survival); Cartographer: Tools + (History / Survival); Rear Guard: Deception + Survival | Quartermaster: Athletics; Packmaster: Animal Handling; Entertainer: Performance **or** Instrument; Traveller: Survival |
| Campsite | Scout Perimeter: Perception + (Survival / Stealth); Hunter: Survival + (Stealth / Nature); Forage: Herbalism + (Nature / Survival); Leader: (Persuasion / Deception) + (Performance / Intimidation) | Set Camp: Athletics **or** Strength; Keep Watch: Perception; Fortify Camp: Survival **or** Tinkering; Entertainer: Performance **or** Instrument; Cook: Cook's Utensils; Other Downtime: any skill / N/A; Full Rest: no roll |
| Find Campsite | Scout and Guide use the same corresponding two-part requirements as Exploration | Two different volunteers are required |

The Leader's paired alternatives are interpreted as two groups based on the conjunction in the supplied sheet. Tool checks have explicit confirmation for proficiency-based paired advantage. This module never adds new mandatory rolls to resolve these duties.

- **GM broadcast launcher:** The **Show to players** button sends a GM-controlled world-setting update to open the board on connected player clients. It does not change assignments.

- **Role-selection dialog layout:** the proficiency key is placed in a responsive wrapping row, with the rule explanation below it. Neither the legend nor long role labels should force a narrow Foundry dialog to overflow horizontally.\n\n## Installation

### Install ZIP locally

1. Download `camp-exploration.zip` (after building/publishing), or use the complete source folder.
2. For a local source install, copy the folder to `<Foundry User Data>/Data/modules/camp-exploration/` so that `module.json` is immediately within that folder.
3. Restart Foundry and enable **Camp & Exploration** in **Manage Modules** for your D&D 5e world.
4. Open the board with **Shift+J**, or make a Script macro:
   ```js
   game.modules.get("camp-exploration").api.open();
   ```
   A launcher also appears in chat where supported by the current Foundry chat sidebar markup.
5. GMs can press **Show to players** in the board header to open or raise the Camp & Exploration window for every connected player, without changing journey progress. Offline players are unaffected.

### GitHub release / manifest URL

Publish this source as the root of a new GitHub repository. On your GitHub repo's **Settings → Actions → General**, allow workflows to read and write contents if needed. Pushing a version change on the `main` branch automatically runs tests and publishes `module.json` and `camp-exploration.zip` as a GitHub release with the tag matching `module.json` (e.g. `v0.3.5`).

**Then use this URL in Foundry's Install Module → Manifest URL:**

```
https://github.com/stefanpgraham-dev/camp-exploration/releases/latest/download/module.json
```

The generated release manifest contains the correct `manifest` and `download` links.

To build without GitHub Actions:

```bash
python tools/package.py --repo stefanpgraham-dev/camp-exploration --version 0.3.5
```

Upload both files from `dist/` as assets on the same GitHub release.

## Usage and assumptions

- Each player must have a **character assigned in Foundry User Configuration**, and a GM must be online for shared updates.
- Standard skill roles require proficiency in the **first-listed skill**; assignments without that proficiency are rejected. Roles whose first proficiency is a **tool** cannot be validated generically across D&D 5e versions and must be checked by the table.
- For tool, map and instrument checks, enter the final roll modifier manually. For **Other Downtime**, pick one of the 18 standard D&D 5e skills for a normal sheet check or N/A for a non-rolled activity. These still produce a proper d20 chat roll and natural-1/20 prompts, but do not automatically include D&D 5e effects. This avoids assuming a tool proficiency the character may not possess.
- Selected role buttons expand to show their proficiency badges without clipping. The party board preserves vertical and horizontal scroll and expanded skill references after any state refresh, including changes made by other players.
- `Full Rest` is a campsite duty choice with no roll. It is a **role label**, not an automated Foundry long rest.
- GM chooses DC 0/5/10/15/20/25/30. Rolls compare against **total >= DC**, independent of any natural 1/20.
- Existing role selections persist after **Next day**. **Reset day** clears current-day selections and results and unlocks **Check Supply**, while preserving the current supply die size and day number. **Start new expedition** clears selections and rolls and resets the day to 1, but deliberately does not resupply. Choose the appropriate resupply size separately.
- The module enforces one campsite Scout and one campsite Guide; watch positions can have more than one volunteer. Four two-hour watch periods cover eight hours; a player is assigned to one period at most.
- A natural 1 or 20 provides a **GM adjudication prompt only**, without an effect table or automatic fatigue/encounter changes.

## Known limits

- Designed for a live game with a GM online. Player assignment requests and completed-roll summaries are relayed to the active GM, who persists the world state. If **multiple GMs** are connected, do not change the board simultaneously: the current lightweight version has no formal elected-GM lock.
- No active multi-user browser test has yet been run against a live Foundry server; please treat this as an initial build and verify normal rolls and role assignments in your world.
- The 1/20 prompt derives from the kept native d20 when the D&D 5e API exposes it. Some third-party rolling replacements may return a different result shape and omit this prompt.
- No integration with Simple Calendar, Rest Recovery, Midi-QOL, or external encounter tables. The scope is intentionally narrow.

## Developer notes

Source module id: `camp-exploration`. No external dependencies. Version `0.3.5`.

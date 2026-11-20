# Camp & Exploration for Foundry VTT

A small shared party board for a D&D 5e homebrew travel and camping procedure. Designed for **Foundry VTT v14** and modern `dnd5e`.

## What it does

- Each player self-assigns a **primary Exploration** duty and **primary Campsite** duty. A second duty in either phase is optional, and adds disadvantage to both associated duty rolls. Role assignments persist between journey days.
- Exactly two *different* players find a campsite: one **Scout** and one **Guide**, against a GM-chosen terrain DC. Two passes permit a long rest; one pass indicates a reasonable camp where the GM judges whether a long rest is possible; neither pass allows only a short rest. The **GM-only Party rest** button explicitly invokes the D&D 5e short/long rest workflow for each assigned player character after confirmation.
- Players can opt in to **First, Second or Third Watch**, or take no watch. Watch checks use Perception.
- **Role pickers display the character’s skills** without leaving the board: green ✓ for proficiency, blue ★ for expertise, amber ½ for half proficiency, red × for no proficiency, and grey ? where a tool/manual check cannot be automatically verified. An asterisk marks required proficiency. Unavailable options explain why they cannot be selected.
- Journey duties are rolled once per duty per day. D&D 5e's native skill-check API handles regular skills, allowing normal character bonuses and integrations. Natural 1/20 on the kept die posts a narrative prompt, with **no automated mechanical effect**.
- If proficient in the first listed skill and a complementary skill, grant advantage; when also serving two duties the advantage and disadvantage cancel. For roles with more than one check, the player chooses which to make.
- A daily **supply die** roll reduces the current die on 1 or 2: d12 → d10 → d8 → d6 → d4 → depleted. GM resupply sets the die to d8 (party), d10 (pack animals), or d12 (wagons).
- The image's **Chaos Factor** starts at 3 and can be adjusted by the GM; it does not itself trigger events.
- GM-only **Party rest** applies a short/long rest to each unique player-assigned D&D 5e character. Short rests open each actor’s native rest/Hit Dice dialog; long rests run the system workflow automatically. A rest does **not** advance/reset the journey day.
- GM-only **Reset day** clears the current day’s exploration, camp, finder and watch assignments, rolls and campsite result. The day number, depleted supplies, whether today’s supply check has already been made, chaos factor and character resources are **not** rewound. **Next day** advances the number, clears results but retains role assignments.

## Installation

### Install ZIP locally

1. Download `camp-exploration.zip` (after building/publishing), or use the complete source folder.
2. For a local source install, copy the folder to `<Foundry User Data>/Data/modules/camp-exploration/` so that `module.json` is immediately within that folder.
3. Restart Foundry and enable **Camp & Exploration** in **Manage Modules** for your D&D 5e world.
4. Open the board with **Shift+J**, or make a Script macro:
   ```js
   game.modules.get("camp-exploration").api.open();
   ```
   A launcher also appears in chat where supported by the current Foundry chat sidebar markup.

### GitHub release / manifest URL

Publish this source as the root of a new GitHub repository. On your GitHub repo's **Settings → Actions → General**, allow workflows to read and write contents if needed. Pushing a version change on the `main` branch automatically runs tests and publishes `module.json` and `camp-exploration.zip` as a GitHub release with the tag matching `module.json` (e.g. `v0.2.0`).

**Then use this URL in Foundry's Install Module → Manifest URL:**

```
https://github.com/stefanpgraham-dev/camp-exploration/releases/latest/download/module.json
```

The generated release manifest contains the correct `manifest` and `download` links.

To build without GitHub Actions:

```bash
python tools/package.py --repo stefanpgraham-dev/camp-exploration --version 0.2.0
```

Upload both files from `dist/` as assets on the same GitHub release.

## Usage and assumptions

- Each player must have a **character assigned in Foundry User Configuration**, and a GM must be online for shared updates.
- Standard skill roles require proficiency in the **first-listed skill**; assignments without that proficiency are rejected. Roles whose first proficiency is a **tool** cannot be validated generically across D&D 5e versions and must be checked by the table.
- For tool, map, instrument, generic downtime checks, enter the final roll modifier manually. These still produce a proper d20 chat roll and natural-1/20 prompts, but do not automatically include D&D 5e effects. This avoids assuming a tool proficiency the character may not possess.
- `Full Rest` is a campsite duty choice with no roll. It is a **role label**, not an automated Foundry long rest.
- GM chooses DC 0/5/10/15/20/25/30. Rolls compare against **total >= DC**, independent of any natural 1/20.
- Existing role selections persist after **Next day**. **Reset day** clears current-day selections and results without changing supply history or the day number. **Start new expedition** clears selections and rolls and resets the day to 1, but deliberately does not resupply. Choose the appropriate resupply size separately.
- The module enforces one campsite Scout and one campsite Guide; watch positions can have more than one volunteer.
- A natural 1 or 20 provides a **GM adjudication prompt only**, without an effect table or automatic fatigue/encounter changes.

## Known limits

- Designed for a live game with a GM online. Player assignment requests and completed-roll summaries are relayed to the active GM, who persists the world state. If **multiple GMs** are connected, do not change the board simultaneously: the current lightweight version has no formal elected-GM lock.
- No active multi-user browser test has yet been run against a live Foundry server; please treat this as an initial build and verify normal rolls and role assignments in your world.
- The 1/20 prompt derives from the kept native d20 when the D&D 5e API exposes it. Some third-party rolling replacements may return a different result shape and omit this prompt.
- No integration with Simple Calendar, Rest Recovery, Midi-QOL, or external encounter tables. The scope is intentionally narrow.

## Developer notes

Source module id: `camp-exploration`. No external dependencies. Version `0.2.0`.

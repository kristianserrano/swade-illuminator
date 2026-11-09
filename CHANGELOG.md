# SWADE Illuminator

## v46.0.2

- Marks the module as verified for all Foundry VTT V14 builds (e.g. 14.370), so future V14 updates no longer show it as unverified.
- Adds manifest, download, changelog, readme and bug-report links pointing to the daggerfortysix fork, so Foundry can install and update the module from its GitHub releases.
- Includes the Better Rolls for SWADE support below (previously labeled v46.1.0, which was never released).

## v46.1.0 (unreleased, shipped in v46.0.2)

- Adds Better Rolls for SWADE support. Better Rolls cards don't fire SWADE's pre-roll hooks, so the module now pre-selects the matching Illumination action (Dim −2, Dark −4 or Pitch Darkness −6) when a new Better Rolls card is created.
  - Uses the same lighting logic as the SWADE roll dialog: scene darkness thresholds, nearby lights and darkness, the token's own light, and the card's targets. Better Rolls takes one Illumination choice, so the worst penalty that would be on by default is selected.
  - Better Rolls' own rules still apply: it only offers Illumination on the skills it applies to, and it removes the options for Low Light Vision, Infravision and Darkvision.
  - Leaves the card alone if a GM Illumination toggle in Better Rolls already selected an option, and never changes a card after it's been posted, so you can untick it.

## v46

- Updates the module for Foundry VTT V14 (tested on 14.369) and SWADE system 6.x (tested on 6.0.4). Drops support for V13 / SWADE 5.x.
- Scene Config: V14 removed the "Lighting" part and moved the Global Illumination threshold to the **Visibility** tab. The Dim Light and Dark threshold pickers are now injected next to the Global Illumination threshold wherever it renders, instead of depending on a part ID.
- Threshold pickers now use the range picker's public `value` API, so keeping Dim < Dark < Pitch Darkness in order no longer rebuilds the elements.
- Light and darkness detection now uses V14's elevation- and level-aware `testPoint()` on each source and elevated token center points, instead of building a new sweep polygon per light.
- Uses the viewed scene (`canvas.scene`) instead of the active scene, and finds the rolling actor's token (synthetic or linked, preferring a controlled one) on that scene.
- Fixes an error when rolling with targets selected but no token for the rolling actor on the scene.
- Fixes the scene-wide Illumination penalty being skipped when the actor has no token and nothing is targeted.
- Unconfigured Dim/Dark thresholds are now skipped instead of producing `NaN` comparisons.
- Uses `game.i18n.localize(key, data)` (V14 merged `format` into `localize`).
- Fixes the hot-reload path for the language file.

## v1.0.3

- Changes application of roll modifiers from using `CONFIG.SWADE.prototypeRollGroups` to `CONFIG.SWADE.rollModifiers` for SWADE system 5.1.0.
- Changes minimum SWADE system requirement from 5.0 to 5.1.

## v1.0.2

- Fixes error when Global Illumination Darkness is set to 0.
- Darkness detection now takes into account if a light source has higher priority than a darkness source in proximity (i.e. *light* power interactin with *dark* power), and sets the modifier for Dim Light (as per the *light/darkness* power description).
  - Note that Foundry VTT does not render this overlap as Dim light but instead prioritizes one source over the other and treats the Token as if it's not in any amount of darkness.
- Correctly ignores inactive sources of darkness or light.

## v1.0.1

- Removes disabling of threshold settings feature when automatic penalty suggestions are disabled.

## v1.0.0

Initial release

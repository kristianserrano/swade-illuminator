# SWADE Illuminator

## v1.0.2

- Fixes error when Global Illumination Darkness is set to 0.
- Darkness detection now takes into account if a light source has higher priority than a darkness source in proximity (i.e. *light* power interactin with *dark* power), and sets the modifier for Dim Light (as per the *light/darkness* power description).
  - Note that Foundry VTT does not render this overlap as Dim light but instead prioritizes one source over the other and treats the Token as if it's not in any amount of darkness.
- Correctly ignores inactive sources of darkness or light.

## v1.0.1

- Removes disabling of threshold settings feature when automatic penalty suggestions are disabled.

## v1.0.0

Initial release

export const MODULE_ID = "swade-illuminator";

//CONFIG.debug.hooks = true;

Hooks.on('init', () => {
    game.settings.register(MODULE_ID, 'auto-illumination-penalties', {
        name: game.i18n.localize('SWADEIlluminator.AutoIlluminationPenalties.Name'),
        hint: game.i18n.localize('SWADEIlluminator.AutoIlluminationPenalties.Hint'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });
});

Hooks.on('renderSceneConfig', (app, html, context, options) => {
    if (!options.parts?.includes('lighting')) return;

    const illuminationThresholds = [
        {
            key: 'dim-light-threshold',
            label: game.i18n.localize('SWADE.Illumination.Dim')
        },
        {
            key: 'dark-threshold',
            label: game.i18n.localize('SWADE.Illumination.Dark'),
        }
    ];

    for (const threshold of illuminationThresholds) {
        const isDim = threshold.key === 'dim-light-threshold';
        const name = `flags.${MODULE_ID}.${threshold.key}`;
        const pitchDarknessGroup = html.querySelector(`.form-group:has(label[for="${app.id}-environment.globalLight.darkness.max"]`);
        const min = isDim ? 0.05 : 0.1;
        const max = isDim ? 0.9 : 0.95;
        const newRangePicker = foundry.applications.elements.HTMLRangePickerElement.create({
            name,
            value: app.document.getFlag(MODULE_ID, threshold.key) ?? min,
            step: 0.05,
            max,
            min,
            id: `${app.id}-${name}`
        });

        const group = foundry.applications.fields.createFormGroup({
            input: newRangePicker,
            label: isDim ? game.i18n.localize('SWADEIlluminator.IlluminationThresholds.DimLight.Label') : game.i18n.localize('SWADEIlluminator.IlluminationThresholds.Darkness.Label'),
            localize: true
        });

        group.querySelector('label').setAttribute('for', newRangePicker.id);
        let p = document.createElement('p');
        p.innerText = isDim ? game.i18n.localize('SWADEIlluminator.IlluminationThresholds.DimLight.Hint') : game.i18n.localize('SWADEIlluminator.IlluminationThresholds.Darkness.Hint');
        p.classList.add('hint');
        group.insertAdjacentElement('beforeend', p);

        function makeChange(rangePicker, changedValue) {
            for (const rangeInput of rangePicker.querySelectorAll('input')) {
                rangeInput.value = changedValue;
            }

            const rangeInput = rangePicker.querySelector('input');
            const name = rangePicker.name;
            const value = changedValue;
            const max = Number(rangeInput.max);
            const min = Number(rangeInput.min);
            const step = Number(rangeInput.step);
            const id = rangePicker.id;
            rangePicker.replaceWith(foundry.applications.elements.HTMLRangePickerElement.create({ name, value, step, max, min, id }));
            const replacementRangePicker = html.querySelector(`range-picker[name="${name}"]`);
            replacementRangePicker.addEventListener('change', (event) => adjustThresholds(event));
            replacementRangePicker.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function adjustThresholds(event) {
            const step = Number(event.target.getAttribute('step'));
            // Get the input's new value
            const newValue = Number(event.target._value);
            // Get the range pickers
            const dimLightRangePicker = html.querySelector(`range-picker[name="flags.${MODULE_ID}.dim-light-threshold"]`);
            const darkRangePicker = html.querySelector(`range-picker[name="flags.${MODULE_ID}.dark-threshold"]`);
            const pitchDarknessRangePicker = pitchDarknessGroup.querySelector('range-picker');
            // Get the current values from each threshold setting
            const dimLightValue = Number(dimLightRangePicker.querySelector('input').value);
            const darkValue = Number(darkRangePicker.querySelector('input').value);
            const pitchDarknessValue = Number(pitchDarknessGroup.querySelector('input').value);
            const newHigherValue = Math.round((newValue + step) * 20) / 20;
            const newLowerValue = Math.round((newValue - step) * 20) / 20;

            if (event.target.name.includes('dim-light-threshold')) {
                if (darkValue <= newValue) makeChange(darkRangePicker, newHigherValue);
            } else if (event.target.name.includes('dark-threshold')) {
                if (pitchDarknessValue <= newValue) makeChange(pitchDarknessRangePicker, newHigherValue);
                if (dimLightValue >= newValue) makeChange(dimLightRangePicker, newLowerValue);
            } else if (event.target.name.includes('global')) {
                if (darkValue >= newValue) makeChange(darkRangePicker, newLowerValue);
            }
        }

        newRangePicker.addEventListener('change', (event) => adjustThresholds(event));
        newRangePicker.classList.add('slim');
        pitchDarknessGroup.querySelector('range-picker')?.addEventListener('change', (event) => adjustThresholds(event));

        for (const pitchDarknessInput of pitchDarknessGroup.querySelectorAll('range-picker input')) {
            pitchDarknessInput.min = 0.15;
        }

        pitchDarknessGroup.querySelector('label').innerText = game.i18n.localize('SWADEIlluminator.IlluminationThresholds.PitchDark.Label');
        pitchDarknessGroup.querySelector('p').innerText = game.i18n.localize('SWADEIlluminator.IlluminationThresholds.PitchDark.Hint');
        pitchDarknessGroup.insertAdjacentElement("beforebegin", group);
    }
});

for (const hookEvent of ['swadePreRollSkill', 'swadePreRollAttribute']) {
    Hooks.on(hookEvent, (actor, skill, roll, modifiers, options) => {
        // Ignore all of this if the feature is disabled in settings.
        if (!game.settings.get(MODULE_ID, 'auto-illumination-penalties')) return;

        // Get the system's Illumination roll modifiers.
        const illuminationRollModifiers = foundry.utils.deepClone(CONFIG.SWADE.prototypeRollGroups.find((rollGroup) => rollGroup.name === game.i18n.localize('SWADE.Illumination._name'))?.modifiers);
        // Get the tokens that the user is targeting.
        // Check each one using the same script for the actor's token but label them as (Target) instead.
        const targetedTokenIDs = game.user.targets.ids;
        // If there's a token associated with this actor, get its contextual darkness level; this includes scene region contexts. Otherwise, use the scene's current global darkness level.
        const token = game.scenes.current.tokens.find((t) => t.actorId === actor.id);
        const pointDarknessLevel = canvas.effects.getDarknessLevel(token?.position);
        // Get the scene's thresholds for Dim Light, Darkness, and Pitch Dark (Global Illumination Threshold in FVTT terms).
        const pitchDarknessLevel = game.scenes.current.environment.globalLight.darkness.max;
        const dimLevel = Number(game.scenes.current.getFlag(MODULE_ID, 'dim-light-threshold'));
        const darkLevel = Number(game.scenes.current.getFlag(MODULE_ID, 'dark-threshold'));
        // Add darkness level ranges to each Illumination modifiers.
        const dimIlluminationModifier = illuminationRollModifiers?.find((m) => m.label === game.i18n.localize('SWADE.Illumination.Dim'));
        dimIlluminationModifier.threshold = dimLevel;
        const darkIlluminationModifier = illuminationRollModifiers?.find((m) => m.label === game.i18n.localize('SWADE.Illumination.Dark'));
        darkIlluminationModifier.threshold = darkLevel;
        const pitchDarknessIlluminationModifier = illuminationRollModifiers?.find((m) => m.label === game.i18n.localize('SWADE.Illumination.Pitch'));
        pitchDarknessIlluminationModifier.threshold = pitchDarknessLevel;
        // Get an illumination modifier based on the scene's current darkness level.
        const sceneIlluminationModifier = illuminationRollModifiers.reduce((maxModifier, currentModifier) => {
            if (pointDarknessLevel > currentModifier.threshold) {
                if (!maxModifier || currentModifier.threshold > maxModifier.threshold) {
                    return currentModifier;
                }
            }

            return pointDarknessLevel > dimLevel ? maxModifier : null;
        });

        // If there's a darkness level set, and there's the Actor's token to consider, begin evaluating its own light source as well as nearby light sources.
        if (token || targetedTokenIDs.length) {
            // This function checks the distance between two points and whether the radius of the darkness is greater than or equal to that distance. This is necessary to determine if the Token is actually still within the darkness source's radius as Foundry will simply report that it's not within the darkness' shape at all.
            function sourceRadiusContains(radius, x1, y1, x2, y2) {
                let xDiff = x2 - x1;
                let yDiff = y2 - y1;
                return radius >= Math.sqrt(Math.pow(xDiff, 2) + Math.pow(yDiff, 2));
            }

            // This function determines what kind of illumination from nearby light sources the token is in.
            function getProximityLight(token) {
                const c = Object.values(token.object.center);
                const lights = canvas.effects.lightSources.filter((s) => !(s instanceof foundry.canvas.sources.GlobalLightSource) && s.active && !s.isPreview && s.shape.contains(...c));
                const darkness = canvas.effects.darknessSources.filter((s) => s.active && !s.isPreview && s.shape.contains(...c));
                const [cx, cy] = c;

                // If there are no light or darkness sources, just return false;
                if (!lights.length && !darkness.length) return false;

                // Determine if the token is in any bright light.
                const inBright = lights.some(light => {
                    const { data: { x, y }, ratio } = light;
                    const bright = foundry.canvas.geometry.ClockwiseSweepPolygon.create({ x, y }, {
                        type: 'light',
                        boundaryShapes: [new PIXI.Circle(x, y, ratio * light.shape.config.radius)]
                    });
                    return bright.contains(...c);
                });
                const inDarkness = !!darkness.length;

                // If it's in bright light, return 'bright'.
                if (inBright && !inDarkness) {
                    // If the token has bright light we need to check if there is any darkness sources (pitch darkness) in range. If so, the overlap of bright light in pitch darkness becomes dim. Also ensure that there's no obstruction (i.e. a wall) for any darkness.
                    const isInLightDarknessOverlap = canvas.effects.darknessSources.some((s) => s.active && !s.isPreview && sourceRadiusContains(s.radius, cx, cy, s.x, s.y) && !foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision(s.origin, { x: cx, y: cy }, { type: 'light', mode: 'any' }));
                    return isInLightDarknessOverlap ? 'dim' : 'bright';
                } else if (inDarkness) {
                    // If it's within a darkness source
                    return 'pitch darkness';
                } else {
                    // Otherwise, the assumption at this point is that it's in dim light.
                    return 'dim';
                }
            }

            // This function checks the Token's lighting conditions by checking the Token's own light as well as calling functions above to determine if the Token is within the radius of a nearby Ambient or Token's light/darkness.
            function checkTokenLighting(token, options = { isTargeted: false }) {
                // Get the dim and bright light sources the token might have.
                const hasBrightLight = token.light.bright > 0;
                const hasDimLight = token.light.dim > 0;
                // Get any proximity light conditions that the token might be in. This will include token and ambient light sources.
                let proximityLight = getProximityLight(token);
                const label = `${proximityLight === 'dim' ? dimIlluminationModifier.label : pitchDarknessIlluminationModifier.label} ${game.i18n.format("SWADEIlluminator.IlluminationModifierLabels.Contexts.AroundToken", { name: token.name })}`;

                // If the token does not have bright light, check the type of proximity lighting, and adjust the modifier to be pushed in.
                if (!hasBrightLight) {
                    // If the token is in any light that's in proximity, make the scene darkness penalty optional.
                    if (proximityLight && sceneIlluminationModifier) sceneIlluminationModifier.ignore = true;

                    // If the token doesn't have any light source, then let's define which Illumination penalty to apply, if any.
                    if (((hasDimLight && proximityLight !== 'pitch darkness') || proximityLight === 'dim') && !modifiers.some((m) => m.label === label)) {
                        // If the token is in Dim lighting, push in that option for a possible modifier.
                        const dimLightModifier = foundry.utils.deepClone(dimIlluminationModifier);
                        // Set the label.
                        dimLightModifier.label = label;

                        // If the user is targeting a token, it's likely not necessary to apply any Illumination penalties for where the Actor is since its the target's lighting that matters, so set its modifier to be inactive by default. Additionally, if the token is targeted and the user has multiple targets selected, do the same thing.
                        if ((!options.isTargeted && game.user.targets.size) || (options.isTargeted && game.user.targets.size > 1)) {
                            dimLightModifier.ignore = true;
                        }

                        modifiers.push(dimLightModifier);
                    } else if (proximityLight === 'pitch darkness' && !modifiers.some((m) => m.label === label)) {
                        // If the token is in Pitch Darkness, push in that option for a possible modifier.
                        const pitchDarknessModifier = foundry.utils.deepClone(pitchDarknessIlluminationModifier);
                        // Set the label.
                        pitchDarknessModifier.label = label;

                        // If the user is targeting a token, it's likely not necessary to apply any Illumination penalties for where the Actor is since its the target's lighting that matters, so set its modifier to be inactive by default. Additionally, if the token is targeted and the user has multiple targets selected, do the same thing.
                        if ((!options.isTargeted && game.user.targets.size) || (options.isTargeted && game.user.targets.size > 1)) {
                            pitchDarknessModifier.ignore = true;
                        }

                        modifiers.push(pitchDarknessModifier);
                    }

                } else {
                    if (proximityLight === 'dim' && !modifiers.some((m) => m.label === label)) {
                        // If the token is in Dim Light, push in that option for a possible modifier.
                        const dimLightModifier = foundry.utils.deepClone(dimIlluminationModifier);
                        // Set the label.
                        dimLightModifier.label = label;
                        modifiers.push(dimLightModifier);
                    } else if (proximityLight === 'pitch darkness') {
                        // If the token is in Pitch Darkness, push in that option for a possible modifier.
                        const pitchDarknessModifier = foundry.utils.deepClone(pitchDarknessIlluminationModifier);
                        // Set the label.
                        pitchDarknessModifier.label = label;
                        modifiers.push(pitchDarknessModifier);
                    }

                    // If it has bright light, set the scene's illumination penalty to be optional.
                    if (sceneIlluminationModifier) sceneIlluminationModifier.ignore = true;
                }
            }

            // First check the Actor's token lighting situation using the functions above.
            checkTokenLighting(token);

            // Now check the user's targets lighting situations.
            for (const targetID of targetedTokenIDs) {
                const target = game.scenes.current.tokens.get(targetID);
                checkTokenLighting(target, { isTargeted: true });
            }

            if (sceneIlluminationModifier) {
                // Append the source to the label
                sceneIlluminationModifier.label = `${sceneIlluminationModifier.label} ${game.i18n.format("SWADEIlluminator.IlluminationModifierLabels.Contexts.GlobalIllumination", { name: token.name })}`;
                // Finally push in the scene's illumination modifier.
                modifiers.push(sceneIlluminationModifier);
            }
        }
    });
}

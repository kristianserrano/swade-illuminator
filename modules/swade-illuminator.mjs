export const MODULE_ID = "swade-illuminator";

const DARKNESS_MAX_FIELD = "environment.globalLight.darkness.max";
const THRESHOLDS = {
    dim: { key: "dim-light-threshold", min: 0.05, max: 0.9 },
    dark: { key: "dark-threshold", min: 0.1, max: 0.95 },
};
const PITCH_DARKNESS_MIN = 0.15;

/** Read a stored threshold flag from a Scene. */
const getThresholdFlag = (scene, key) => scene.flags?.[MODULE_ID]?.[key];

Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "auto-illumination-penalties", {
        name: "SWADEIlluminator.AutoIlluminationPenalties.Name",
        hint: "SWADEIlluminator.AutoIlluminationPenalties.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });
});

/* -------------------------------------------- */
/*  Scene Configuration                          */
/* -------------------------------------------- */

/**
 * In Foundry V14 the SceneConfig sheet no longer has a "lighting" part; the Global Illumination fields moved
 * (currently to the "visibility" part). Rather than depend on a part ID, locate the Global Illumination
 * darkness-max range picker wherever it is rendered and inject the Dim/Dark threshold pickers above it.
 */
Hooks.on("renderSceneConfig", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const pitchDarknessPicker = root.querySelector(`range-picker[name="${DARKNESS_MAX_FIELD}"]`);
    const pitchDarknessGroup = pitchDarknessPicker?.closest(".form-group");
    if (!pitchDarknessGroup) return;

    // Avoid duplicating our fields if this part was re-rendered without being replaced.
    if (root.querySelector(`range-picker[name="flags.${MODULE_ID}.${THRESHOLDS.dim.key}"]`)) return;

    const scene = app.document;
    const getPicker = (key) => root.querySelector(`range-picker[name="flags.${MODULE_ID}.${key}"]`);
    const round = (v) => Math.round(v * 20) / 20;

    /**
     * Keep the thresholds ordered: Dim < Dark < Pitch Darkness.
     * Setting a picker's value dispatches a change event, so adjustments cascade naturally.
     */
    function adjustThresholds(event) {
        const picker = event.currentTarget;
        const name = picker.name ?? picker.getAttribute("name");
        const step = Number(picker.getAttribute("step")) || 0.05;
        const newValue = Number(picker.value);
        const dimPicker = getPicker(THRESHOLDS.dim.key);
        const darkPicker = getPicker(THRESHOLDS.dark.key);
        if (!dimPicker || !darkPicker) return;
        const dimValue = Number(dimPicker.value);
        const darkValue = Number(darkPicker.value);
        const pitchValue = Number(pitchDarknessPicker.value);
        const higher = round(newValue + step);
        const lower = round(newValue - step);

        if (name.endsWith(THRESHOLDS.dim.key)) {
            if (darkValue <= newValue) darkPicker.value = Math.min(higher, THRESHOLDS.dark.max);
        } else if (name.endsWith(THRESHOLDS.dark.key)) {
            if (pitchValue <= newValue) pitchDarknessPicker.value = Math.min(higher, 1);
            if (dimValue >= newValue) dimPicker.value = Math.max(lower, THRESHOLDS.dim.min);
        } else if (name === DARKNESS_MAX_FIELD) {
            if (darkValue >= newValue) darkPicker.value = Math.max(lower, THRESHOLDS.dark.min);
        }
    }

    const fields = [
        { ...THRESHOLDS.dim, i18n: "DimLight" },
        { ...THRESHOLDS.dark, i18n: "Darkness" },
    ];

    for (const { key, min, max, i18n } of fields) {
        const name = `flags.${MODULE_ID}.${key}`;
        const picker = foundry.applications.elements.HTMLRangePickerElement.create({
            name,
            value: getThresholdFlag(scene, key) ?? min,
            step: 0.05,
            min,
            max,
            id: `${app.id}-${name}`,
        });
        picker.classList.add("slim");
        picker.addEventListener("change", adjustThresholds);

        const group = foundry.applications.fields.createFormGroup({
            input: picker,
            label: `SWADEIlluminator.IlluminationThresholds.${i18n}.Label`,
            hint: `SWADEIlluminator.IlluminationThresholds.${i18n}.Hint`,
            localize: true,
        });
        group.querySelector("label")?.setAttribute("for", picker.id);
        pitchDarknessGroup.insertAdjacentElement("beforebegin", group);
    }

    // Repurpose the core Global Illumination threshold as the Pitch Darkness threshold.
    pitchDarknessPicker.addEventListener("change", adjustThresholds);
    for (const input of pitchDarknessPicker.querySelectorAll("input")) input.min = PITCH_DARKNESS_MIN;
    const pitchLabel = pitchDarknessGroup.querySelector("label");
    if (pitchLabel) pitchLabel.innerText = game.i18n.localize("SWADEIlluminator.IlluminationThresholds.PitchDark.Label");
    const pitchHint = pitchDarknessGroup.querySelector("p.hint");
    if (pitchHint) pitchHint.innerText = game.i18n.localize("SWADEIlluminator.IlluminationThresholds.PitchDark.Hint");
});

/* -------------------------------------------- */
/*  Trait Roll Modifiers                         */
/* -------------------------------------------- */

/**
 * Get an elevated center point for a TokenDocument (V14 lighting tests are elevation/level aware).
 * @param {TokenDocument} tokenDoc
 * @returns {{x: number, y: number, elevation: number}|null}
 */
function getElevatedCenter(tokenDoc) {
    if (!tokenDoc) return null;
    if (typeof tokenDoc.getCenterPoint === "function") return tokenDoc.getCenterPoint();
    const center = tokenDoc.object?.center;
    if (!center) return null;
    return { x: center.x, y: center.y, elevation: tokenDoc.elevation ?? 0 };
}

/**
 * Find the TokenDocument on the viewed scene that represents this actor.
 * @param {Actor} actor
 * @returns {TokenDocument|undefined}
 */
function getActorToken(actor) {
    if (actor.isToken && actor.token?.parent === canvas.scene) return actor.token;
    const tokens = actor.getActiveTokens(false, true);
    return tokens.find((t) => t.object?.controlled) ?? tokens[0];
}

/**
 * Determine what kind of illumination from nearby light/darkness sources a point is in.
 * @param {{x: number, y: number, elevation: number}} point
 * @returns {false|"bright"|"dim"|"pitch darkness"}
 */
function getProximityLight(point) {
    const GlobalLightSource = foundry.canvas.sources.GlobalLightSource;
    const isLive = (s) => s.active && !s.isPreview;
    const lights = canvas.effects.lightSources.filter((s) => !(s instanceof GlobalLightSource) && isLive(s) && s.testPoint(point));
    const darkness = canvas.effects.darknessSources.filter((s) => isLive(s) && s.testPoint(point));

    if (!lights.length && !darkness.length) return false;

    // The token is in bright light if it is inside a light's (wall-constrained) shape and within its bright radius.
    const inBright = lights.some((light) => {
        const brightRadius = light.ratio * light.radius;
        return Math.hypot(point.x - light.x, point.y - light.y) <= brightRadius;
    });
    const inDarkness = darkness.length > 0;

    if (inBright && !inDarkness) {
        // Bright light overlapping pitch darkness (e.g. a lower-priority darkness source suppressed by a light) becomes Dim.
        const polygonBackend = CONFIG.Canvas.polygonBackends?.light ?? foundry.canvas.geometry.ClockwiseSweepPolygon;
        const isInLightDarknessOverlap = canvas.effects.darknessSources.some((s) => {
            if (!isLive(s)) return false;
            if (Math.hypot(point.x - s.x, point.y - s.y) > s.radius) return false;
            return !polygonBackend.testCollision(s.origin, point, { type: "light", mode: "any" });
        });
        return isInLightDarknessOverlap ? "dim" : "bright";
    }
    if (inDarkness) return "pitch darkness";
    return "dim";
}

/**
 * Pick the scene-wide Illumination modifier for a given darkness level.
 * @returns {object|null}
 */
function getSceneIlluminationModifier(illuminationModifiers, darknessLevel, thresholds) {
    let result = null;
    for (const tier of ["dim", "dark", "pitch"]) {
        const threshold = thresholds[tier];
        const modifier = illuminationModifiers[tier];
        if (!modifier || !Number.isFinite(threshold)) continue;
        if (darknessLevel > threshold && (!result || threshold > result.threshold)) {
            result = modifier;
            result.threshold = threshold;
        }
    }
    return result;
}

function onPreRoll(actor, _trait, _roll, modifiers) {
    // Ignore all of this if the feature is disabled in settings.
    if (!game.settings.get(MODULE_ID, "auto-illumination-penalties")) return;
    const scene = canvas.scene;
    if (!scene || !canvas.ready || !Array.isArray(modifiers)) return;

    // Get the system's Illumination roll modifiers.
    const illuminationModifiers = foundry.utils.deepClone(CONFIG.SWADE?.rollModifiers?.illumination?.modifiers ?? {});
    const dimModifier = illuminationModifiers.dim;
    const pitchModifier = illuminationModifiers.pitch;
    if (!dimModifier || !pitchModifier) return;

    const token = getActorToken(actor);
    const targets = Array.from(game.user.targets ?? []).map((t) => t.document).filter((t) => t?.parent === scene);
    const targetCount = targets.length;

    // Contextual darkness level at the actor's token (includes Scene Region darkness), else the scene's global level.
    const tokenPoint = getElevatedCenter(token);
    const pointDarknessLevel = tokenPoint ? canvas.effects.getDarknessLevel(tokenPoint) : scene.environment.darknessLevel;

    const sceneModifier = getSceneIlluminationModifier(illuminationModifiers, pointDarknessLevel, {
        dim: Number(getThresholdFlag(scene, THRESHOLDS.dim.key)),
        dark: Number(getThresholdFlag(scene, THRESHOLDS.dark.key)),
        pitch: Number(scene.environment.globalLight.darkness.max),
    });

    const hasLabel = (label) => modifiers.some((m) => m.label === label);

    // Checks a token's own light and the light/darkness sources it is standing in.
    function checkTokenLighting(tokenDoc, { isTargeted = false } = {}) {
        const point = getElevatedCenter(tokenDoc);
        if (!point) return;
        const hasBrightLight = tokenDoc.light.bright > 0;
        const hasDimLight = tokenDoc.light.dim > 0;
        const proximityLight = getProximityLight(point);
        const baseLabel = proximityLight === "dim" ? dimModifier.label : pitchModifier.label;
        const label = `${baseLabel} ${game.i18n.localize("SWADEIlluminator.IlluminationModifierLabels.Contexts.AroundToken", { name: tokenDoc.name })}`;
        // When targeting, the target's lighting is usually what matters, so suggest the roller's own penalty as inactive.
        const suggestInactive = (!isTargeted && targetCount > 0) || (isTargeted && targetCount > 1);

        const push = (source, ignore) => {
            const modifier = foundry.utils.deepClone(source);
            modifier.label = label;
            delete modifier.threshold;
            if (ignore) modifier.ignore = true;
            modifiers.push(modifier);
        };

        if (!hasBrightLight) {
            // Being in any nearby light makes the scene darkness penalty optional.
            if (proximityLight && sceneModifier) sceneModifier.ignore = true;

            if (((hasDimLight && proximityLight !== "pitch darkness") || proximityLight === "dim") && !hasLabel(label)) {
                push(dimModifier, suggestInactive);
            } else if (proximityLight === "pitch darkness" && !hasLabel(label)) {
                push(pitchModifier, suggestInactive);
            }
        } else {
            if (proximityLight === "dim" && !hasLabel(label)) push(dimModifier, false);
            else if (proximityLight === "pitch darkness" && !hasLabel(label)) push(pitchModifier, false);
            // The token's own bright light makes the scene penalty optional.
            if (sceneModifier) sceneModifier.ignore = true;
        }
    }

    if (token) checkTokenLighting(token);
    for (const target of targets) checkTokenLighting(target, { isTargeted: true });

    if (sceneModifier) {
        sceneModifier.label = `${sceneModifier.label} ${game.i18n.localize("SWADEIlluminator.IlluminationModifierLabels.Contexts.GlobalIllumination")}`;
        delete sceneModifier.threshold;
        modifiers.push(sceneModifier);
    }
}

for (const hookEvent of ["swadePreRollSkill", "swadePreRollAttribute"]) {
    Hooks.on(hookEvent, (...args) => {
        try {
            onPreRoll(...args);
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to evaluate Illumination penalties`, err);
        }
    });
}

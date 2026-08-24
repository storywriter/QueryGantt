define([], function () {
    const custom = "custom";
    const percent100 = "100";
    const percent200 = "200";
    const percent300 = "300";
    const percent400 = "400";
    const presets = [percent100, percent200, percent300, percent400];

    /**
     * Returns a supported zoom preset. The previous preset names are migrated
     * without losing an explicitly saved custom window.
     */
    const normalizePreset = function (value) {
        value = (value === null || typeof(value) === "undefined") ? "" : value + "";
        if (presets.includes(value) || value === custom) {
            return value;
        }
        if (value === "500") {
            return percent400;
        }
        return value === "fit" ? percent100 : custom;
    };


    /**
     * Converts a value to a valid Date or null.
     */
    const toDate = function (value) {
        if (value === null || typeof(value) === "undefined") {
            return null;
        }

        const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        return isNaN(result.getTime()) ? null : result;
    };


    /**
     * Normalizes a persisted or live zoom view.
     */
    const normalizeView = function (value) {
        value = value || {};
        const start = toDate(value.start);
        const end = toDate(value.end);
        let preset = normalizePreset(value.preset);

        // Old Month/Week/Day settings already contain the exact window. Treat
        // those as Custom so existing users retain their last visible range.
        if (["month", "week", "day"].includes(value.preset) && start && end) {
            preset = custom;
        }

        if (start && end && start.getTime() < end.getTime()) {
            return { preset, start, end };
        }

        return {
            preset: preset === custom ? percent100 : preset,
            start: null,
            end: null
        };
    };


    /**
     * Converts a zoom view to JSON-safe browser data. Percentage presets are
     * data-relative; Custom retains the exact visible window.
     */
    const serializeView = function (value) {
        const view = normalizeView(value);
        const result = { preset: view.preset };

        if (view.preset === custom && view.start && view.end) {
            result.start = view.start.toISOString();
            result.end = view.end.toISOString();
        }

        return result;
    };


    /**
     * Gets the numeric magnification represented by a preset.
     */
    const getFactor = function (preset) {
        preset = normalizePreset(preset);
        return presets.includes(preset) ? Number(preset) / 100 : null;
    };


    /**
     * Gets a percentage window from the fitted data range while retaining the
     * current visible center.
     */
    const getPresetWindow = function (preset, fittedRange, center) {
        const factor = getFactor(preset);
        const start = toDate((fittedRange || {}).start);
        const end = toDate((fittedRange || {}).end);
        const normalizedCenter = toDate(center);
        if (!factor || !start || !end || start.getTime() >= end.getTime()) {
            return null;
        }

        const duration = (end.getTime() - start.getTime()) / factor;
        const centerTime = normalizedCenter
            ? normalizedCenter.getTime()
            : (start.getTime() + end.getTime()) / 2;
        return {
            start: new Date(centerTime - duration / 2),
            end: new Date(centerTime + duration / 2)
        };
    };


    /**
     * Identifies a percentage from the visible range relative to the fitted
     * data range. Arbitrary wheel, button, or pinch zooms are Custom.
     */
    const identifyPreset = function (start, end, fittedRange) {
        const normalizedStart = toDate(start);
        const normalizedEnd = toDate(end);
        const fittedStart = toDate((fittedRange || {}).start);
        const fittedEnd = toDate((fittedRange || {}).end);
        if (!normalizedStart || !normalizedEnd || !fittedStart || !fittedEnd
            || normalizedStart.getTime() >= normalizedEnd.getTime()
            || fittedStart.getTime() >= fittedEnd.getTime()) {
            return custom;
        }

        const duration = normalizedEnd.getTime() - normalizedStart.getTime();
        const fittedDuration = fittedEnd.getTime() - fittedStart.getTime();
        const match = presets.find((preset) => {
            const expected = fittedDuration / getFactor(preset);
            return Math.abs(duration - expected) <= expected * 0.005;
        });
        return match || custom;
    };


    return {
        custom,
        percent100,
        percent200,
        percent300,
        percent400,
        presets,
        normalizePreset,
        normalizeView,
        serializeView,
        getFactor,
        getPresetWindow,
        identifyPreset
    };
});

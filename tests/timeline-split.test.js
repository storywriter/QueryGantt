"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let service = null;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/services/timeline-split.js"), "utf8"), {
    Number: Number,
    define: function (dependencies, factory) { service = factory(); }
});

assert.strictEqual(service.normalize("481.4"), 481);
assert.strictEqual(service.normalize(0), null);
assert.strictEqual(service.normalize("invalid"), null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(service.getBounds(1000))), { min: 240, max: 680 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(service.getBounds(500))), { min: 150, max: 350 }, "narrow screens should retain usable space for both panes");
assert.strictEqual(service.clamp(100, 1000), 240);
assert.strictEqual(service.clamp(900, 1000), 680);

const loadService = function (name) {
    let result = null;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/services/" + name + ".js"), "utf8"), {
        Date: Date,
        Number: Number,
        isNaN: isNaN,
        define: function (dependencies, factory) { result = factory(); }
    });
    return result;
};
const dateGranularityService = loadService("date-granularity");
const fieldColumnsService = loadService("field-columns");
const timelineZoomService = loadService("timeline-zoom");

const observable = function (initial) {
    const result = function (value) {
        if (arguments.length) {
            initial = value;
            return result;
        }
        return initial;
    };
    result.__observable = true;
    result.peek = function () { return initial; };
    return result;
};
const ko = {
    observable: observable,
    observableArray: observable,
    isObservable: function (value) { return Boolean(value && value.__observable); },
    isObservableArray: function (value) { return Boolean(value && value.__observable); },
    computed: function () {
        const result = { dispose: function () {} };
        result.extend = function () { return result; };
        return result;
    },
    components: {
        register: function (name, registration) {
            if (name === "my-timeline") {
                ko.registration = registration;
            }
        }
    }
};
const makeClassList = function () {
    const values = new Set();
    return {
        add: function () { Array.from(arguments).forEach((value) => values.add(value)); },
        remove: function () { Array.from(arguments).forEach((value) => values.delete(value)); },
        contains: function (value) { return values.has(value); }
    };
};

let componentWidth = 1000;
let leftWidth = 500;
const rootLeft = 100;
const chartListeners = {};
const chart = {
    get clientWidth() { return componentWidth; },
    getBoundingClientRect: function () { return { width: componentWidth }; },
    addEventListener: function (name, callback) { chartListeners[name] = callback; },
    removeEventListener: function (name, callback) { if (chartListeners[name] === callback) { delete chartListeners[name]; } },
    querySelector: function () { return null; }
};
const left = {
    style: {},
    getBoundingClientRect: function () { return { width: leftWidth }; }
};
Object.defineProperty(left.style, "width", {
    get: function () { return leftWidth + "px"; },
    set: function (value) { leftWidth = parseFloat(value); }
});
const center = {
    getBoundingClientRect: function () { return { left: rootLeft + leftWidth }; }
};
const splitterListeners = {};
const splitterAttributes = {};
const splitter = {
    style: {}, captured: null,
    addEventListener: function (name, callback) { splitterListeners[name] = callback; },
    removeEventListener: function (name, callback) { if (splitterListeners[name] === callback) { delete splitterListeners[name]; } },
    setAttribute: function (name, value) { splitterAttributes[name] = value + ""; },
    setPointerCapture: function (id) { this.captured = id; },
    hasPointerCapture: function (id) { return this.captured === id; },
    releasePointerCapture: function () { this.captured = null; }
};
const rootDropZone = { classList: makeClassList(), style: {} };
const root = {
    classList: makeClassList(),
    getBoundingClientRect: function () { return { left: rootLeft }; },
    closest: function () { return null; },
    querySelectorAll: function () { return []; },
    querySelector: function (selector) {
        if (selector === ".my-timeline__chart") { return chart; }
        if (selector === ".my-timeline__splitter") { return splitter; }
        if (selector === ".my-timeline__root-drop-zone") { return rootDropZone; }
        return null;
    }
};
const documentBody = {
    appendChild: function (element) { element.parentNode = this; },
    removeChild: function (element) { element.parentNode = null; }
};
const document = {
    body: documentBody,
    head: { querySelectorAll: function () { return []; }, appendChild: function () {} },
    createElement: function () {
        return {
            classList: makeClassList(), style: {}, parentNode: null, innerHTML: "",
            setAttribute: function () {}, querySelectorAll: function () { return []; }
        };
    }
};
let animationFrame = null;
let animationFrameId = 0;
const windowListeners = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/components/timeline.js"), "utf8"), {
    Array: Array,
    Date: Date,
    Map: Map,
    Number: Number,
    Promise: Promise,
    Set: Set,
    console: { debug: function () {}, log: function () {}, warn: function () {} },
    document: document,
    isNaN: isNaN,
    addEventListener: function (name, callback) { windowListeners[name] = callback; },
    removeEventListener: function (name, callback) { if (windowListeners[name] === callback) { delete windowListeners[name]; } },
    requestAnimationFrame: function (callback) { animationFrame = callback; animationFrameId += 1; return animationFrameId; },
    cancelAnimationFrame: function () { animationFrame = null; },
    define: function (dependencies, factory) {
        factory.apply(null, dependencies.map(function (name) {
            if (name === "knockout") { return ko; }
            if (name === "services/date-granularity") { return dateGranularityService; }
            if (name === "services/field-columns") { return fieldColumnsService; }
            if (name === "services/timeline-split") { return service; }
            if (name === "services/timeline-zoom") { return timelineZoomService; }
            if (name === "vis-timeline") { return {}; }
            return function () {};
        }));
    }
});

let savedWidth = null;
const preferredWidth = observable(null);
const viewModel = ko.registration.viewModel.createViewModel({
    items: observable([]), states: observable([]), priorities: observable([]), types: observable([]),
    typesOther: observable([]), icons: observable({}), showFields: observable([]),
    listWidth: preferredWidth,
    callbacks: { listWidthChanged: function (width) { savedWidth = width; } }, actions: {}
}, { element: { firstChild: root, querySelector: function () {} } });

let redrawCount = 0;
let destroyed = false;
viewModel.timeline = {
    body: {
        dom: { leftContainer: left, centerContainer: center },
        domProps: { center: { get width() { return componentWidth - leftWidth; } } }
    },
    redraw: function () { redrawCount += 1; },
    setOptions: function () {},
    destroy: function () { destroyed = true; }
};

viewModel._positionSplitter();
assert.strictEqual(splitter.style.left, "500px");
assert.strictEqual(splitterAttributes["aria-valuemin"], "240");
assert.strictEqual(splitterAttributes["aria-valuemax"], "680");

const pointerEvent = function (type, clientX) {
    return {
        type: type, button: 0, pointerId: 7, clientX: clientX,
        preventDefault: function () {}
    };
};
splitterListeners.pointerdown(pointerEvent("pointerdown", 500));
splitterListeners.pointermove(pointerEvent("pointermove", 420));
assert.strictEqual(savedWidth, null, "drag movement must not persist on every pixel");
assert.ok(animationFrame, "drag redraws should be coalesced through requestAnimationFrame");
animationFrame();
animationFrame = null;
assert.strictEqual(leftWidth, 420);
assert.strictEqual(savedWidth, null, "redrawing during a drag must not persist the preference");
splitterListeners.pointerup(pointerEvent("pointerup", 420));
assert.strictEqual(leftWidth, 420);
assert.strictEqual(savedWidth, 420, "the final width should be saved once on pointer release");
assert.strictEqual(preferredWidth(), 420);
assert.ok(redrawCount >= 2, "both the live drag and final commit should redraw the existing timeline");

let keyPrevented = false;
splitterListeners.keydown({ key: "ArrowLeft", shiftKey: false, preventDefault: function () { keyPrevented = true; } });
assert.strictEqual(leftWidth, 404);
assert.strictEqual(savedWidth, 404);
assert.strictEqual(keyPrevented, true, "the separator should support keyboard resizing");

preferredWidth(680);
componentWidth = 500;
windowListeners.resize();
assert.strictEqual(leftWidth, 350, "the saved preference should be clamped on a narrow screen");
assert.strictEqual(preferredWidth(), 680, "responsive clamping must not overwrite the user's preferred width");
componentWidth = 1000;
windowListeners.resize();
assert.strictEqual(leftWidth, 680, "the preferred width should return when space becomes available again");

const appSource = fs.readFileSync(path.join(__dirname, "../js/querygantt-tab-app.js"), "utf8");
const appHtml = fs.readFileSync(path.join(__dirname, "../html/querygantt-tab.html"), "utf8");
const timelineLess = fs.readFileSync(path.join(__dirname, "../less/components/timeline.less"), "utf8");
assert.ok(appSource.includes('"timelineListWidth", null'), "the split should be persisted as a project-level browser preference");
assert.ok(appHtml.includes("listWidthChanged: listWidthChanged.bind($root)"));
assert.ok(timelineLess.includes("touch-action: none;"));

viewModel.dispose();
assert.strictEqual(destroyed, true);
assert.strictEqual(windowListeners.resize, undefined, "global resize listeners must be removed on disposal");

console.log("timeline split tests passed");

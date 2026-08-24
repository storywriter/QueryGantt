"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const makeClassList = function () {
    const values = new Set();
    return {
        add: function () { Array.from(arguments).forEach((value) => values.add(value)); },
        remove: function () { Array.from(arguments).forEach((value) => values.delete(value)); },
        contains: function (value) { return values.has(value); }
    };
};

const observable = function (initial) {
    const result = function (value) { if (arguments.length) { initial = value; return result; } return initial; };
    result.__observable = true;
    result.peek = function () { return initial; };
    result.dispose = function () {};
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
    components: { register: function (name, registration) { if (name === "my-timeline") { ko.registration = registration; } } }
};

let zoomService = null;
let dateService = null;
const loadService = function (filename, set) {
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        Date: Date, Number: Number, isNaN: isNaN,
        define: function (dependencies, factory) { set(factory()); }
    });
};
loadService(path.join(__dirname, "../js/services/timeline-zoom.js"), (value) => zoomService = value);
loadService(path.join(__dirname, "../js/services/date-granularity.js"), (value) => dateService = value);

const listeners = {};
const chartListeners = {};
let hitElement = null;
const filter = { getBoundingClientRect: function () { return { top: 0, bottom: 48 }; } };
const document = {
    addEventListener: function (name, callback) { listeners[name] = callback; },
    removeEventListener: function (name, callback) { if (listeners[name] === callback) { delete listeners[name]; } },
    elementFromPoint: function () { return hitElement; },
    querySelector: function (selector) { return selector === ".querygantt-tab__filter" ? filter : null; },
    head: { querySelectorAll: function () { return []; }, appendChild: function () {} },
    body: {
        appendChild: function (element) { element.parentNode = this; },
        removeChild: function (element) { element.parentNode = null; }
    },
    createElement: function () {
        return {
            classList: makeClassList(), style: {}, innerHTML: "", firstChild: null,
            setAttribute: function () {}, removeAttribute: function () {},
            appendChild: function (element) { this.firstChild = element; },
            querySelectorAll: function () { return []; }
        };
    }
};

const attributes = {};
const targetElement = {
    classList: makeClassList(),
    getAttribute: function (name) { return attributes[name] || null; },
    setAttribute: function (name, value) { attributes[name] = value; },
    removeAttribute: function (name) { delete attributes[name]; },
    getBoundingClientRect: function () { return { top: 100, height: 30 }; },
    closest: function (selector) { return selector === ".my-timeline-group" ? this : null; }
};
attributes["data-work-item-id"] = "2";

const dropZone = { classList: makeClassList(), style: {} };
let axisTop = -20;
const axis = {
    getBoundingClientRect: function () { return { top: axisTop, left: 420, width: 600, height: 44 }; },
    cloneNode: function () {
        return {
            classList: makeClassList(), style: {}, removeAttribute: function () {},
            querySelectorAll: function () { return []; }
        };
    }
};
const chart = {
    clientWidth: 600,
    addEventListener: function (name, callback) { chartListeners[name] = callback; },
    removeEventListener: function (name, callback) { if (chartListeners[name] === callback) { delete chartListeners[name]; } },
    querySelector: function (selector) { return selector === ".vis-panel.vis-top" ? axis : null; },
    getBoundingClientRect: function () { return { bottom: 500, width: 600 }; }
};
const scrollContainer = {
    scrollTop: 200,
    addEventListener: function () {},
    removeEventListener: function () {}
};
const root = {
    classList: makeClassList(),
    closest: function (selector) { return selector === ".v-scroll-auto" ? scrollContainer : null; },
    contains: function (element) { return element === targetElement; },
    getBoundingClientRect: function () { return { left: 80 }; },
    querySelectorAll: function (selector) { return selector === "[data-backlog-drop-position]" && attributes["data-backlog-drop-position"] ? [targetElement] : []; },
    querySelector: function (selector) {
        if (selector === ".my-timeline__root-drop-zone") { return dropZone; }
        if (selector === ".my-timeline__chart") { return chart; }
        if (selector === "[data-backlog-drop-position]") { return attributes["data-backlog-drop-position"] ? targetElement : null; }
        return null;
    }
};

let source = "String.prototype.truncate = function () { return this.toString(); };\n" + fs.readFileSync(path.join(__dirname, "../js/components/timeline.js"), "utf8");
vm.runInNewContext(source, {
    Array: Array, Date: Date, Map: Map, Number: Number, Promise: Promise, Set: Set,
    console: { debug: function () {}, log: function () {}, warn: function () {} },
    document: document, isNaN: isNaN,
    define: function (dependencies, factory) {
        factory.apply(null, dependencies.map(function (name) {
            if (name === "knockout") { return ko; }
            if (name === "services/date-granularity") { return dateService; }
            if (name === "services/timeline-zoom") { return zoomService; }
            if (name === "vis-timeline") { return {}; }
            return function () {};
        }));
    }
});

let move = null;
const viewModel = ko.registration.viewModel.createViewModel({
    items: observable([]), backlogOrder: observable(true), states: observable([]), priorities: observable([]),
    types: observable([]), typesOther: observable([]), icons: observable({}), showFields: observable([]),
    callbacks: { reorderWit: function (value) { move = value; return Promise.resolve(true); } }, actions: {}
}, { element: { firstChild: root, querySelector: function () {} } });

const dragged = { id: 1, originalId: 1, backlogEligible: true, backlogId: "stories", backlogRank: 1, isCompleted: true };
const target = { id: 2, originalId: 2, backlogEligible: true, backlogId: "stories", backlogRank: 1 };
viewModel.groups = { get: function (id) { return Number(id) === 1 ? dragged : Number(id) === 2 ? target : null; } };
const handle = {
    captured: null,
    setPointerCapture: function (id) { this.captured = id; },
    hasPointerCapture: function (id) { return this.captured === id; },
    releasePointerCapture: function () { this.captured = null; }
};
const pointerEvent = function (type, clientY) {
    return {
        type: type, pointerId: 7, pointerType: "mouse", button: 0, clientX: 100, clientY: clientY,
        preventDefault: function () {}, stopPropagation: function () {}, stopImmediatePropagation: function () {}
    };
};

viewModel._onBacklogPointerDown(dragged, handle, pointerEvent("pointerdown", 100));
assert.strictEqual(viewModel._backlogDraggedId, 1, "completed work items should start the same pointer drag as active items");
assert.ok(listeners.pointermove && listeners.pointerup, "the drag should track pointer movement outside the handle");

hitElement = targetElement;
viewModel._onBacklogPointerMove(pointerEvent("pointermove", 124));
assert.strictEqual(attributes["data-backlog-drop-position"], "after");
viewModel._onBacklogPointerUp(pointerEvent("pointerup", 124));
assert.deepStrictEqual(JSON.parse(JSON.stringify(move)), { draggedId: 1, targetId: 2, position: "after" });
assert.strictEqual(viewModel._backlogDraggedId, null);

viewModel.timeline = {};
viewModel._syncFloatingAxis(true);
assert.ok(viewModel.floatingAxis.classList.contains("my-timeline__floating-axis--visible"), "the cloned top axis should float below the sticky filter");
assert.strictEqual(viewModel.floatingAxis.style.top, "48px");
assert.strictEqual(viewModel.floatingAxis.style.left, "420px");
assert.ok(viewModel.floatingAxis.firstChild, "the live top date labels should be mirrored into the floating layer");

axisTop = 80;
viewModel._syncFloatingAxis(false);
assert.strictEqual(viewModel.floatingAxis.classList.contains("my-timeline__floating-axis--visible"), false, "the floating mirror should hide while the original axis is visible");

const originalStart = new Date("2026-08-01T00:00:00.000Z");
const originalEnd = new Date("2026-08-31T00:00:00.000Z");
let visibleWindow = { start: originalStart, end: originalEnd };
viewModel.timeline = {
    range: { options: { moveable: true } },
    getWindow: function () { return visibleWindow; },
    setWindow: function (start, end) { visibleWindow = { start: start, end: end }; }
};

let prevented = false;
viewModel._onTimelineWheel({
    deltaX: 0, deltaY: 120, shiftKey: false, ctrlKey: false, cancelable: true,
    preventDefault: function () { prevented = true; }, stopPropagation: function () {}
});
assert.strictEqual(prevented, false, "a vertical wheel should remain available to the page scroll container");
assert.strictEqual(visibleWindow.start.getTime(), originalStart.getTime(), "a vertical wheel must not pan the date range");

viewModel._onTimelineWheel({
    deltaX: 60, deltaY: 0, shiftKey: false, ctrlKey: false, cancelable: true,
    preventDefault: function () { prevented = true; }, stopPropagation: function () {}
});
assert.strictEqual(prevented, true, "horizontal trackpad input should be consumed by the timeline");
assert.ok(visibleWindow.start.getTime() > originalStart.getTime(), "horizontal trackpad input should pan the date range horizontally");

const gestureTarget = { closest: function () { return null; } };
viewModel._onTimelinePointerDown({
    pointerId: 20, pointerType: "mouse", button: 0, clientX: 300, clientY: 300, target: gestureTarget
});
viewModel._onTimelinePointerMove({
    pointerId: 20, clientX: 302, clientY: 250, cancelable: true, preventDefault: function () {}
});
assert.strictEqual(scrollContainer.scrollTop, 250, "a vertical background drag should scroll the page in the matching direction");
assert.strictEqual(viewModel.timeline.range.options.moveable, false, "vis horizontal panning should be suspended during a vertical drag");
viewModel._onTimelinePointerUp({ pointerId: 20 });
assert.strictEqual(viewModel.timeline.range.options.moveable, true, "vis panning should be restored after the vertical drag");

console.log("timeline interaction tests passed");

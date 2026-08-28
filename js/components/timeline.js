define([
    "knockout",
    "services/date-granularity",
    "services/timeline-zoom",
    "services/timeline-split",
    "vis-timeline",
    "vis-timeline-arrow"
], function (ko, dateGranularityService, timelineZoomService, timelineSplitService, VisTimeline) {
    //#region [ Fields ]
    
    let global = (function() { return this; })();

    //#endregion


    //#region [ Constructors ]
    
    /**
     * Constructor.
     * 
     * @param {object} args Arguments.
     */
    let Timeline = function (args = {}) {
        console.debug("Timeline()");

        this.root = args.element.firstChild;
        this.node = this.root.querySelector(".my-timeline__chart");
        this.rootDropZone = this.root.querySelector(".my-timeline__root-drop-zone");
        this.splitter = this.root.querySelector(".my-timeline__splitter");
        this.items = ko.isObservable(args.items) ? args.items : ko.observable(args.items || []);
        this.backlogOrder = ko.isObservable(args.backlogOrder) ? args.backlogOrder : ko.observable(Boolean(args.backlogOrder));
        this.states = ko.isObservable(args.states) ? args.states : ko.observable(args.states || []);
        this.priorities = ko.isObservable(args.priorities) ? args.priorities : ko.observable(args.priorities || []);
        this.types = ko.isObservable(args.types) ? args.types : ko.observable(args.types || []);
        this.typesOther = ko.isObservable(args.typesOther) ? args.typesOther : ko.observable(args.typesOther || []);
        this.icons = ko.isObservable(args.icons) ? args.icons : ko.observable(args.icons || []);
        this.showFields = ko.isObservableArray(args.showFields) ? args.showFields : ko.observableArray(args.showFields || []);
        this.dateGranularity = ko.isObservable(args.dateGranularity) ? args.dateGranularity : ko.observable(dateGranularityService.normalize(args.dateGranularity));
        this.zoomView = ko.isObservable(args.zoomView) ? args.zoomView : ko.observable(timelineZoomService.normalizeView(args.zoomView));
        this.listWidth = ko.isObservable(args.listWidth) ? args.listWidth : ko.observable(timelineSplitService.normalize(args.listWidth));
        this.selectedItem = ko.isObservable(args.selectedItem) ? args.selectedItem : ko.observable(args.selectedItem || null);
        this.selectedItemId = ko.isObservable(args.selectedItemId) ? args.selectedItemId : ko.observable(args.selectedItemId || null);

        this.selectedId = ko.observable(null);
        
        this.timeline = null;
        this.groups = null;
        this.records = null;
        this.arrows = null;
        this._backlogDraggedId = null;
        this._backlogPointerId = null;
        this._backlogPointerHandle = null;
        this._timelinePointer = null;
        this._pendingZoomPreset = null;
        this._ignoredRange = null;
        this._fitRange = null;
        this._initialZoomRestored = false;
        this._renderContext = null;
        this._dependenciesKey = null;
        this._pendingListWidth = null;
        this._splitFrame = null;
        this._splitPointerId = null;
        this._splitStartX = null;
        this._splitStartWidth = null;
        this._onBacklogPointerMoveBound = this._onBacklogPointerMove.bind(this);
        this._onBacklogPointerUpBound = this._onBacklogPointerUp.bind(this);
        this._onTimelineWheelBound = this._onTimelineWheel.bind(this);
        this._onTimelinePointerDownBound = this._onTimelinePointerDown.bind(this);
        this._onTimelinePointerMoveBound = this._onTimelinePointerMove.bind(this);
        this._onTimelinePointerUpBound = this._onTimelinePointerUp.bind(this);
        this._syncFloatingAxisBound = this._syncFloatingAxis.bind(this);
        this._resizeTimelineBound = this._resizeTimeline.bind(this);
        this._onSplitPointerDownBound = this._onSplitPointerDown.bind(this);
        this._onSplitPointerMoveBound = this._onSplitPointerMove.bind(this);
        this._onSplitPointerUpBound = this._onSplitPointerUp.bind(this);
        this._onSplitPointerCancelBound = this._onSplitPointerCancel.bind(this);
        this._onSplitKeyDownBound = this._onSplitKeyDown.bind(this);
        this._timelineChangedBound = () => {
            this._syncRangeItemVisibility();
            this._syncFloatingAxis(true);
            this._positionSplitter();
        };
        this.scrollContainer = typeof(this.root.closest) === "function" ? this.root.closest(".v-scroll-auto") : null;
        this.floatingAxis = global.document.createElement("div");
        this.floatingAxis.classList.add("my-timeline", "my-timeline__floating-axis");
        this.floatingAxis.setAttribute("aria-hidden", "true");
        if (global.document.body && typeof(global.document.body.appendChild) === "function") {
            global.document.body.appendChild(this.floatingAxis);
        }
        if (this.scrollContainer && typeof(this.scrollContainer.addEventListener) === "function") {
            this.scrollContainer.addEventListener("scroll", this._syncFloatingAxisBound, false);
        }
        if (this.node && typeof(this.node.addEventListener) === "function") {
            this.node.addEventListener("wheel", this._onTimelineWheelBound, { capture: true, passive: false });
            this.node.addEventListener("pointerdown", this._onTimelinePointerDownBound, true);
        }
        this.splitter.addEventListener("pointerdown", this._onSplitPointerDownBound);
        this.splitter.addEventListener("pointermove", this._onSplitPointerMoveBound);
        this.splitter.addEventListener("pointerup", this._onSplitPointerUpBound);
        this.splitter.addEventListener("pointercancel", this._onSplitPointerCancelBound);
        this.splitter.addEventListener("keydown", this._onSplitKeyDownBound);
        if (typeof(global.addEventListener) === "function") {
            global.addEventListener("resize", this._resizeTimelineBound, false);
        }

        // Callbacks
        this.callbacks = args.callbacks;

        // Actions
        Object.entries(args.actions || {}).forEach(([name, action]) => typeof (action) === "function" && action(this[name].bind(this)));

        // Subscribes
        this._onItemsChangedSubscribe = ko.computed(this._onItemsChanged, this).extend({ deferred: true });
        this._onSelectedIdChangedSubscribe = ko.computed(this._onSelectedIdChanged, this);
    };

    //#endregion


    //#region [ Methods : Public ]

    /**
     * Direct method to receive a descendantsComplete notification.
     * Knockout will call it with the component’s node once all descendants are bound.
     * 
     * @param {element} node Html element. 
     */
    Timeline.prototype.koDescendantsComplete = function (node) {
        // Replace custom element placehoder
        let root = node.firstElementChild;
        node.replaceWith(root);
    };


    /**
     * Expands one visible hierarchy level.
     */
    Timeline.prototype.expand = function () {
        if (!this.timeline || !this.groups) {
            return;
        }

        const groups = [];
        this.groups.forEach((g) => {
            groups.push(g);
        });
        const collapsed = groups.filter((group) => group.visible !== false
            && group.nestedGroups instanceof Array
            && group.nestedGroups.length
            && group.showNested === false);
        if (!collapsed.length) {
            return;
        }

        const level = Math.min.apply(null, collapsed.map((group) => group.treeLevel || 1));
        const updates = new Map();
        collapsed.filter((group) => (group.treeLevel || 1) === level).forEach((group) => {
            updates.set(group.id, { id: group.id, showNested: true });
            group.nestedGroups.forEach((id) => {
                const child = this.groups.get(id);
                if (!child) {
                    return;
                }
                const update = { id: child.id, visible: true };
                if (child.nestedGroups instanceof Array && child.nestedGroups.length) {
                    update.showNested = false;
                }
                updates.set(child.id, update);
            });
        });
        if (updates.size) {
            this.groups.update(Array.from(updates.values()));
        }
    };


    /**
     * Collapses one visible hierarchy level.
     */
    Timeline.prototype.collapse = function () {
        if (!this.timeline || !this.groups) {
            return;
        }

        const groups = [];
        this.groups.forEach((g) => {
            groups.push(g);
        });
        const expanded = groups.filter((group) => group.visible !== false
            && group.nestedGroups instanceof Array
            && group.nestedGroups.length
            && group.showNested !== false);
        if (!expanded.length) {
            return;
        }

        const level = Math.max.apply(null, expanded.map((group) => group.treeLevel || 1));
        const updates = new Map();
        const hideDescendants = (group) => {
            (group.nestedGroups || []).forEach((id) => {
                const child = this.groups.get(id);
                if (!child) {
                    return;
                }
                const update = { id: child.id, visible: false };
                if (child.nestedGroups instanceof Array && child.nestedGroups.length) {
                    update.showNested = false;
                    hideDescendants(child);
                }
                updates.set(child.id, update);
            });
        };
        expanded.filter((group) => (group.treeLevel || 1) === level).forEach((group) => {
            updates.set(group.id, { id: group.id, showNested: false });
            hideDescendants(group);
        });
        if (updates.size) {
            this.groups.update(Array.from(updates.values()));
        }
    };


    /**
     * Moves the timeline by the given percentage to left or right.
     * 
     * @param {number} percentage For example 0.1 (left) or -0.1 (right).
     */
    Timeline.prototype.move = function (percentage) {
        if (!this.timeline) {
            return;
        }

        var range = this.timeline.getWindow();
        var interval = range.end - range.start;

        this.timeline.setWindow({
            start: range.start.valueOf() - interval * percentage,
            end: range.end.valueOf() - interval * percentage
        });
    };


    /**
     * Move left.
     */
    Timeline.prototype.moveLeft = function () {
        if (this.timeline) {
            this.move(0.2);
        }
    };


    /**
     * Move right.
     */
    Timeline.prototype.moveRight = function () {
        if (this.timeline) {
            this.move(-0.2);
        }
    };


    /**
     * Zooms out.
     */
    Timeline.prototype.zoomOut = function () {
        if (this.timeline) {
            this._pendingZoomPreset = timelineZoomService.custom;
            this.timeline.zoomOut(0.2);
        }
    };


    /**
     * Zooms int.
     */
    Timeline.prototype.zoomIn = function () {
        if (this.timeline) {
            this._pendingZoomPreset = timelineZoomService.custom;
            this.timeline.zoomIn(0.2);
        }
    };


    /**
     * Resets zoom.
     */
    Timeline.prototype.zoomReset = function () {
        this.setZoomPreset(timelineZoomService.percent100);
    };


    /**
     * Applies a named zoom preset around the current visible center.
     *
     * @param {string} preset Zoom preset.
     */
    Timeline.prototype.setZoomPreset = function (preset) {
        if (!this.timeline) {
            return;
        }

        preset = timelineZoomService.normalizePreset(preset);
        if (preset === timelineZoomService.custom) {
            return;
        }

        this._pendingZoomPreset = preset;
        const before = this.timeline.getWindow();

        if (preset === timelineZoomService.percent100) {
            this.timeline.fit({ animation: false });
            this._fitRange = this.timeline.getWindow();
        }
        else {
            const center = new Date((before.start.getTime() + before.end.getTime()) / 2);
            const range = timelineZoomService.getPresetWindow(preset, this._fitRange, center, this._getTimelineWidth());
            if (!range) {
                this._pendingZoomPreset = null;
                return;
            }
            this.timeline.setWindow(range.start, range.end, { animation: false });
        }

        const after = this.timeline.getWindow();
        if ((before.start.getTime() === after.start.getTime()) && (before.end.getTime() === after.end.getTime())) {
            this._pendingZoomPreset = null;
            this.callback("zoomChanged", timelineZoomService.normalizeView({ preset, start: after.start, end: after.end }));
        }
    };


    /**
     * Zooms the current timeline's selection.
     */
    Timeline.prototype.focus = function () {
        if (this.timeline) {
            this._pendingZoomPreset = timelineZoomService.custom;
            this.timeline.focus(this.timeline.getSelection());
        }
    };


    /**
     * Closes the selection.
     */
    Timeline.prototype.close = function () {
        this._onSelect({
            items: []
        });
        
        if (this.timeline) {
            this.timeline.setSelection([]);
        }
    };


    /**
     * Reloads the data.
     */
    Timeline.prototype.refresh = function () {
        this.selectedId(null);
        this._destroyTimeline();
    };


    /**
     * Runs an image renderer against the naturally expanded timeline.
     *
     * @param {function} renderer Function that receives the timeline element and returns a promise.
     * @returns Promise containing the renderer result.
     */
    Timeline.prototype.exportImage = function (renderer) {
        if (!this.timeline || typeof (renderer) !== "function") {
            return Promise.reject(new Error("Timeline is not ready for image export."));
        }

        return Promise.resolve().then(() => renderer(this.node));
    };


    /**
     * Updates the timeline record.
     * 
     * @param {number} id Record id. 
     * @param {object} data Data to update.
     */
    Timeline.prototype.update = function(id, data) {
        const item = this.timeline.itemSet.items[id];

        if (!item || !data) {
            return;
        }
        
        const d = item.data;
        Object.entries(data).forEach(([key, value]) => d[key] = value);
        this.timeline.itemsData.update(d);
    };


    /**
     * Executes the callback.
     * 
     * @param {string} name The name of the callback.
     * @param {array} args Callback arguemnts.
     */
    Timeline.prototype.callback = function (name, ...args) {
        if (!this.callbacks) {
            return;
        }

        if (typeof (this.callbacks[name]) !== "function") {
            console.warn("Timeline : callback(): Callback '%s' is not defined.", name);
            return;
        }

        return this.callbacks[name](...args);
    };


    /**
     * Dispose.
     */
    Timeline.prototype.dispose = function () {
        console.log("~Timeline()");

        this._onItemsChangedSubscribe.dispose();
        this._onSelectedIdChangedSubscribe.dispose();
        this._clearBacklogDrag();
        this._clearTimelinePointer();
        this._destroyTimeline();
        if (this.scrollContainer && typeof(this.scrollContainer.removeEventListener) === "function") {
            this.scrollContainer.removeEventListener("scroll", this._syncFloatingAxisBound, false);
        }
        if (this.node && typeof(this.node.removeEventListener) === "function") {
            this.node.removeEventListener("wheel", this._onTimelineWheelBound, true);
            this.node.removeEventListener("pointerdown", this._onTimelinePointerDownBound, true);
        }
        this.splitter.removeEventListener("pointerdown", this._onSplitPointerDownBound);
        this.splitter.removeEventListener("pointermove", this._onSplitPointerMoveBound);
        this.splitter.removeEventListener("pointerup", this._onSplitPointerUpBound);
        this.splitter.removeEventListener("pointercancel", this._onSplitPointerCancelBound);
        this.splitter.removeEventListener("keydown", this._onSplitKeyDownBound);
        this._cancelSplitFrame();
        if (typeof(global.removeEventListener) === "function") {
            global.removeEventListener("resize", this._resizeTimelineBound, false);
        }
        if (this.floatingAxis && this.floatingAxis.parentNode) {
            this.floatingAxis.parentNode.removeChild(this.floatingAxis);
        }
    };

    //#endregion


    //#region [ Methods : Private ]

    /**
     * Keeps both the floating axis geometry and the Day zoom cap correct after
     * Azure DevOps resizes the extension host.
     */
    Timeline.prototype._resizeTimeline = function () {
        if (!this.timeline) {
            return;
        }

        const preferredWidth = timelineSplitService.normalize(this.listWidth());
        if (preferredWidth !== null) {
            this._setListWidth(preferredWidth, true);
        }
        else {
            this._positionSplitter();
        }
        this._syncFloatingAxis();
        this._refreshTimelineScaleAfterListResize();
    };


    /**
     * Keeps the existing granularity and named zoom behavior correct after the
     * splitter changes the drawable center width.
     */
    Timeline.prototype._refreshTimelineScaleAfterListResize = function () {
        if (!this.timeline) {
            return;
        }

        const width = this._getTimelineWidth();
        if (dateGranularityService.normalize(this.dateGranularity()) === dateGranularityService.day) {
            this.timeline.setOptions({
                zoomMin: dateGranularityService.getZoomMin(dateGranularityService.day, width)
            });
        }

        const value = (this.zoomView && typeof(this.zoomView.peek) === "function") ? this.zoomView.peek() : this.zoomView();
        if (timelineZoomService.normalizeView(value).preset === timelineZoomService.daily) {
            this.setZoomPreset(timelineZoomService.daily);
        }
    };


    /**
     * Gets the drawable timeline width without the variable row-label panel.
     */
    Timeline.prototype._getTimelineWidth = function () {
        const center = this.timeline && this.timeline.body && this.timeline.body.domProps && this.timeline.body.domProps.center;
        return (center && Number(center.width)) || this.node.clientWidth || 1;
    };


    /**
     * Gets the full component width used to bound the list/timeline split.
     */
    Timeline.prototype._getComponentWidth = function () {
        if (this.node.clientWidth) {
            return this.node.clientWidth;
        }
        const rect = this.node.getBoundingClientRect();
        return rect ? rect.width : null;
    };


    /**
     * Gets the vis-timeline panes used by the splitter.
     */
    Timeline.prototype._getSplitElements = function () {
        const dom = this.timeline && this.timeline.body && this.timeline.body.dom;
        if (!dom || !dom.leftContainer || !dom.centerContainer) {
            return null;
        }
        return {
            left: dom.leftContainer,
            center: dom.centerContainer
        };
    };


    /**
     * Gets the rendered list/timeline boundary relative to the component.
     */
    Timeline.prototype._getRenderedListWidth = function () {
        const elements = this._getSplitElements();
        if (!elements) {
            return null;
        }

        const rootRect = this.root.getBoundingClientRect();
        const centerRect = elements.center.getBoundingClientRect();
        const width = centerRect.left - rootRect.left;
        if (Number.isFinite(width) && width > 0) {
            return Math.round(width);
        }

        const leftRect = elements.left.getBoundingClientRect();
        return leftRect && leftRect.width > 0 ? Math.round(leftRect.width) : null;
    };


    /**
     * Places the splitter over the real panel boundary after a redraw.
     */
    Timeline.prototype._positionSplitter = function () {
        const width = this._getRenderedListWidth();
        const bounds = timelineSplitService.getBounds(this._getComponentWidth());
        if (width === null || bounds === null) {
            this.splitter.style.display = "none";
            return;
        }

        this.splitter.style.display = "block";
        this.splitter.style.left = width + "px";
        this.splitter.setAttribute("aria-valuemin", bounds.min);
        this.splitter.setAttribute("aria-valuemax", bounds.max);
        this.splitter.setAttribute("aria-valuenow", width);
    };


    /**
     * Applies a list width without rebuilding the timeline or reloading data.
     */
    Timeline.prototype._setListWidth = function (width, redraw) {
        const elements = this._getSplitElements();
        width = timelineSplitService.clamp(width, this._getComponentWidth());
        if (!elements || width === null) {
            return null;
        }

        elements.left.style.width = width + "px";
        if (redraw && typeof(this.timeline.redraw) === "function") {
            this.timeline.redraw();
        }
        this._positionSplitter();
        return width;
    };


    Timeline.prototype._cancelSplitFrame = function () {
        if (this._splitFrame !== null && typeof(global.cancelAnimationFrame) === "function") {
            global.cancelAnimationFrame(this._splitFrame);
        }
        this._splitFrame = null;
        this._pendingListWidth = null;
    };


    /**
     * Coalesces pointer movement to one redraw per animation frame.
     */
    Timeline.prototype._scheduleListWidth = function (width) {
        width = timelineSplitService.clamp(width, this._getComponentWidth());
        if (width === null) {
            return null;
        }

        this._pendingListWidth = width;
        if (this._splitFrame !== null) {
            return width;
        }

        const apply = () => {
            const pendingWidth = this._pendingListWidth;
            this._splitFrame = null;
            this._pendingListWidth = null;
            if (pendingWidth !== null) {
                this._setListWidth(pendingWidth, true);
            }
        };

        if (typeof(global.requestAnimationFrame) === "function") {
            this._splitFrame = global.requestAnimationFrame(apply);
        }
        else {
            apply();
        }
        return width;
    };


    Timeline.prototype._commitListWidth = function (width) {
        width = this._setListWidth(width, true);
        if (width === null) {
            return;
        }

        this.listWidth(width);
        this.callback("listWidthChanged", width);
        this._refreshTimelineScaleAfterListResize();
    };


    Timeline.prototype._onSplitPointerDown = function (e) {
        if ((typeof(e.button) === "number" && e.button !== 0) || !this.timeline) {
            return;
        }

        const width = this._getRenderedListWidth();
        if (width === null) {
            return;
        }

        this._splitPointerId = e.pointerId;
        this._splitStartX = e.clientX;
        this._splitStartWidth = width;
        if (typeof(this.splitter.setPointerCapture) === "function") {
            this.splitter.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
    };


    Timeline.prototype._onSplitPointerMove = function (e) {
        if (e.pointerId !== this._splitPointerId) {
            return;
        }
        this._scheduleListWidth(this._splitStartWidth + e.clientX - this._splitStartX);
        e.preventDefault();
    };


    Timeline.prototype._finishSplitPointer = function (e, persist) {
        if (e.pointerId !== this._splitPointerId) {
            return;
        }

        this._cancelSplitFrame();
        const width = persist
            ? this._splitStartWidth + e.clientX - this._splitStartX
            : this._splitStartWidth;

        if (typeof(this.splitter.hasPointerCapture) !== "function" || this.splitter.hasPointerCapture(e.pointerId)) {
            if (typeof(this.splitter.releasePointerCapture) === "function") {
                this.splitter.releasePointerCapture(e.pointerId);
            }
        }

        this._splitPointerId = null;
        this._splitStartX = null;
        this._splitStartWidth = null;
        if (persist) {
            this._commitListWidth(width);
        }
        else {
            this._setListWidth(width, true);
        }
        e.preventDefault();
    };


    Timeline.prototype._onSplitPointerUp = function (e) {
        this._finishSplitPointer(e, true);
    };


    Timeline.prototype._onSplitPointerCancel = function (e) {
        this._finishSplitPointer(e, false);
    };


    Timeline.prototype._onSplitKeyDown = function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
            return;
        }

        const width = this._getRenderedListWidth();
        if (width === null) {
            return;
        }

        const direction = e.key === "ArrowLeft" ? -1 : 1;
        const step = timelineSplitService.keyboardStep * (e.shiftKey ? 5 : 1);
        this._commitListWidth(width + direction * step);
        e.preventDefault();
    };

    /**
     * Create styles for the input types.
     * 
     * @param {array} types List of supported project types.
     * @param {array} typesOther List of supported types for other projects in the query.
     */
    Timeline.prototype._createStyles = function(types, typesOther) {
        // Remove any custom styles
        global.document.head
            .querySelectorAll("style[data-mytimeline-styles='true']")
            .forEach((el) => (el.parentNode !== null) && el.parentNode.removeChild(el));

        if (!types.length) {
            return;
        }

        // Create styles
        var el = global.document.createElement("style");
        el.setAttribute("data-mytimeline-styles", "true");
        el.innerHTML = types.map((t) => 
            `.my-timeline-item--${t.name.toLowerCase().replace(/\s+/g,"-")} { 
                background-color: #${t.color};
                color: #${textColorForBackground(t.color)};
             }
             
             .my-timeline-item--${t.name.toLowerCase().replace(/\s+/g,"-")}.vis-selected {
                background: #${darkenColor(t.color, 55)};
             }`).join("\n\n");

        if(typesOther.length) {
            el.innerHTML += "\n\n";
            el.innerHTML += typesOther.map((to) => to.types.map((t) => 
                `.my-timeline-item--${to.project.toLowerCase().replace(/\s+/g,"")}-${t.name.toLowerCase().replace(/\s+/g,"-")} { 
                   background-color: #${t.color};
                   color: #${textColorForBackground(t.color)};
                 }
                    
                 .my-timeline-item--${to.project.toLowerCase().replace(/\s+/g,"")}-${t.name.toLowerCase().replace(/\s+/g,"-")}.vis-selected {
                    background: #${darkenColor(t.color, 55)};
                 }`).join("\n\n")).join("\n\n");
        }
        global.document.head.appendChild(el);
    };

    
    /**
     * Destroys timeline if it exists.
     */
    Timeline.prototype._destroyTimeline = function () {
        this._cancelSplitFrame();
        this.splitter.style.display = "none";

        if (!this.timeline) {
            return;
        }

        this.timeline.destroy();
        this.timeline = null;
        this.groups = null;
        this.records = null;
        this._pendingZoomPreset = null;
        this._ignoredRange = null;
        this._fitRange = null;
        this._initialZoomRestored = false;
        this._renderContext = null;
        this._dependenciesKey = null;
        if (this.floatingAxis) {
            this.floatingAxis.classList.remove("my-timeline__floating-axis--visible");
            this.floatingAxis.innerHTML = "";
        }
    };


    /**
     * Restores the last view after the timeline has fitted its items.
     */
    Timeline.prototype._restoreZoom = function () {
        if (!this.timeline || this._initialZoomRestored) {
            return;
        }

        const value = (this.zoomView && typeof(this.zoomView.peek) === "function") ? this.zoomView.peek() : this.zoomView();
        const view = timelineZoomService.normalizeView(value);
        // onInitialDrawComplete runs after vis-timeline has performed its own
        // fit. That window is the authoritative 100% range.
        this._fitRange = this.timeline.getWindow();
        this._initialZoomRestored = true;

        if (view.preset === timelineZoomService.custom && view.start && view.end) {
            this._pendingZoomPreset = timelineZoomService.custom;
            this._ignoredRange = { start: new Date(view.start), end: new Date(view.end) };
            this.timeline.setWindow(view.start, view.end, { animation: false });
        }
        else if (view.preset !== timelineZoomService.percent100) {
            const center = new Date((this._fitRange.start.getTime() + this._fitRange.end.getTime()) / 2);
            const range = timelineZoomService.getPresetWindow(view.preset, this._fitRange, center, this._getTimelineWidth());
            if (range) {
                this._pendingZoomPreset = view.preset;
                this._ignoredRange = range;
                this.timeline.setWindow(range.start, range.end, { animation: false });
            }
        }
    };


    /**
     * Persists a completed timeline range change.
     *
     * @param {object} e Range event.
     */
    Timeline.prototype._onRangeChanged = function (e) {
        if (!e || !(e.start instanceof Date) || !(e.end instanceof Date)) {
            return;
        }

        if (this._ignoredRange) {
            const matchesIgnored = Math.abs(this._ignoredRange.start.getTime() - e.start.getTime()) <= 1
                && Math.abs(this._ignoredRange.end.getTime() - e.end.getTime()) <= 1;
            this._ignoredRange = null;
            if (matchesIgnored) {
                this._pendingZoomPreset = null;
                return;
            }
        }

        const identifiedPreset = timelineZoomService.identifyPreset(e.start, e.end, this._fitRange);
        // A directly selected percentage remains the selected preset even if
        // zoomMin (Day granularity) has to clamp the requested window.
        const preset = this._pendingZoomPreset || identifiedPreset;
        this._pendingZoomPreset = null;
        this.callback("zoomChanged", timelineZoomService.normalizeView({ preset, start: e.start, end: e.end }));
        this._syncFloatingAxis(true);
    };


    /**
     * Gets the viewport position immediately below the sticky filter bar.
     */
    Timeline.prototype._getFloatingAxisTop = function () {
        const filter = global.document.querySelector(".querygantt-tab__filter");
        if (!filter || typeof(filter.getBoundingClientRect) !== "function") {
            return 0;
        }

        const bounds = filter.getBoundingClientRect();
        return bounds.top <= 0 && bounds.bottom > 0 ? bounds.bottom : 0;
    };


    /**
     * Mirrors vis-timeline's top axis into a fixed, read-only layer while the
     * page scrolls through naturally expanded work item rows. A DOM mirror is
     * used because vis-timeline's required overflow containers prevent CSS
     * position: sticky from working reliably.
     *
     * @param {boolean} refreshContent Re-clone labels after range changes.
     */
    Timeline.prototype._syncFloatingAxis = function (refreshContent) {
        if (!this.timeline || !this.floatingAxis || typeof(this.node.querySelector) !== "function") {
            return;
        }

        const axis = this.node.querySelector(".vis-panel.vis-top");
        if (!axis || typeof(axis.getBoundingClientRect) !== "function" || typeof(this.node.getBoundingClientRect) !== "function") {
            this.floatingAxis.classList.remove("my-timeline__floating-axis--visible");
            return;
        }

        const axisBounds = axis.getBoundingClientRect();
        const timelineBounds = this.node.getBoundingClientRect();
        const top = this._getFloatingAxisTop();
        const visible = axisBounds.top < top && timelineBounds.bottom > top + axisBounds.height;
        if (!visible) {
            this.floatingAxis.classList.remove("my-timeline__floating-axis--visible");
            return;
        }

        if (refreshContent === true || !this.floatingAxis.firstChild) {
            const clone = axis.cloneNode(true);
            [clone].concat(Array.from(clone.querySelectorAll("[id]"))).forEach((element) => element.removeAttribute("id"));
            clone.classList.add("my-timeline__floating-axis-content");
            clone.style.position = "relative";
            clone.style.top = "0";
            clone.style.left = "0";
            clone.style.width = axisBounds.width + "px";
            clone.style.height = axisBounds.height + "px";
            this.floatingAxis.innerHTML = "";
            this.floatingAxis.appendChild(clone);
        }

        this.floatingAxis.style.top = top + "px";
        this.floatingAxis.style.left = axisBounds.left + "px";
        this.floatingAxis.style.width = axisBounds.width + "px";
        this.floatingAxis.style.height = axisBounds.height + "px";
        this.floatingAxis.classList.add("my-timeline__floating-axis--visible");
    };


    /**
     * Hides stale item DOM that vis-timeline can briefly retain after a saved
     * range is restored. Only records overlapping the current date window may
     * remain visible; moving the window back clears the guard automatically.
     */
    Timeline.prototype._syncRangeItemVisibility = function () {
        if (!this.timeline || !this.timeline.itemSet || !this.timeline.itemSet.items
            || typeof(this.timeline.getWindow) !== "function") {
            return;
        }

        const range = this.timeline.getWindow();
        const rangeStart = range && range.start instanceof Date ? range.start.getTime() : NaN;
        const rangeEnd = range && range.end instanceof Date ? range.end.getTime() : NaN;
        if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
            return;
        }

        Object.keys(this.timeline.itemSet.items).forEach((id) => {
            const item = this.timeline.itemSet.items[id];
            const data = (item || {}).data || {};
            const start = data.start instanceof Date ? data.start.getTime() : new Date(data.start).getTime();
            const end = data.end instanceof Date ? data.end.getTime() : new Date(data.end).getTime();
            const element = ((item || {}).dom || {}).box || ((item || {}).dom || {}).point;
            if (!Number.isFinite(start) || !element || !element.style) {
                return;
            }

            const visible = Number.isFinite(end)
                ? start < rangeEnd && end > rangeStart
                : start >= rangeStart && start < rangeEnd;
            element.style.visibility = visible ? "" : "hidden";
        });
    };


    /**
     * Leaves ordinary vertical wheel input to the page while retaining native
     * horizontal trackpad input (and Shift + wheel) for timeline panning.
     */
    Timeline.prototype._onTimelineWheel = function (e) {
        if (!this.timeline || e.ctrlKey) {
            return;
        }

        const deltaX = Number(e.deltaX) || 0;
        const deltaY = Number(e.deltaY) || 0;
        const horizontalDelta = Math.abs(deltaX) > Math.abs(deltaY)
            ? deltaX
            : (e.shiftKey ? deltaY : 0);
        if (!horizontalDelta) {
            return;
        }

        const range = this.timeline.getWindow();
        const width = this.node.clientWidth || (typeof(this.node.getBoundingClientRect) === "function" && this.node.getBoundingClientRect().width) || 1;
        const interval = range.end.getTime() - range.start.getTime();
        const offset = interval * horizontalDelta / width;
        this.timeline.setWindow(
            new Date(range.start.getTime() + offset),
            new Date(range.end.getTime() + offset),
            { animation: false }
        );

        if (e.cancelable !== false) {
            e.preventDefault();
        }
        e.stopPropagation();
    };


    /**
     * Starts direction detection for a background drag. Item bars, row labels,
     * and controls keep their existing edit/select/drag behavior.
     */
    Timeline.prototype._onTimelinePointerDown = function (e) {
        if (!this.timeline || !this.scrollContainer || (e.pointerType === "mouse" && e.button !== 0)) {
            return;
        }
        if (e.target && typeof(e.target.closest) === "function"
            && e.target.closest(".vis-item, .my-timeline-group, button, a, input, select, textarea")) {
            return;
        }

        this._clearTimelinePointer();
        this._timelinePointer = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startScrollTop: this.scrollContainer.scrollTop,
            direction: null,
            previousMoveable: null
        };
        if (typeof(global.document.addEventListener) === "function") {
            global.document.addEventListener("pointermove", this._onTimelinePointerMoveBound, true);
            global.document.addEventListener("pointerup", this._onTimelinePointerUpBound, true);
            global.document.addEventListener("pointercancel", this._onTimelinePointerUpBound, true);
        }
    };


    /**
     * Locks a background drag to its dominant direction. Horizontal movement
     * remains owned by vis-timeline; vertical movement scrolls the page.
     */
    Timeline.prototype._onTimelinePointerMove = function (e) {
        const pointer = this._timelinePointer;
        if (!pointer || e.pointerId !== pointer.id) {
            return;
        }

        const deltaX = e.clientX - pointer.startX;
        const deltaY = e.clientY - pointer.startY;
        if (!pointer.direction) {
            if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 5) {
                return;
            }
            pointer.direction = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
            if (pointer.direction === "vertical" && this.timeline.range && this.timeline.range.options) {
                pointer.previousMoveable = this.timeline.range.options.moveable;
                this.timeline.range.options.moveable = false;
            }
        }

        if (pointer.direction !== "vertical") {
            return;
        }

        this.scrollContainer.scrollTop = pointer.startScrollTop - deltaY;
        if (e.cancelable !== false) {
            e.preventDefault();
        }
    };


    /**
     * Finishes a direction-locked background drag.
     */
    Timeline.prototype._onTimelinePointerUp = function (e) {
        if (!this._timelinePointer || e.pointerId !== this._timelinePointer.id) {
            return;
        }
        this._clearTimelinePointer();
    };


    /**
     * Removes page-drag listeners and restores vis-timeline panning.
     */
    Timeline.prototype._clearTimelinePointer = function () {
        if (typeof(global.document.removeEventListener) === "function") {
            global.document.removeEventListener("pointermove", this._onTimelinePointerMoveBound, true);
            global.document.removeEventListener("pointerup", this._onTimelinePointerUpBound, true);
            global.document.removeEventListener("pointercancel", this._onTimelinePointerUpBound, true);
        }
        if (this._timelinePointer && this._timelinePointer.previousMoveable !== null
            && this.timeline && this.timeline.range && this.timeline.range.options) {
            this.timeline.range.options.moveable = this._timelinePointer.previousMoveable;
        }
        this._timelinePointer = null;
    };


    /**
     * Starts a pointer-driven row drag. vis-timeline handles mouse gestures on
     * its root element, so native HTML Drag and Drop is unreliable inside the
     * label panel. Pointer events are stopped at the handle and tracked by this
     * component instead.
     */
    Timeline.prototype._onBacklogPointerDown = function (record, handle, e) {
        if (!this.backlogOrder() || !record.backlogEligible || (e.pointerType === "mouse" && e.button !== 0)) {
            return;
        }

        this._clearBacklogDrag();
        this._backlogDraggedId = record.id;
        this._backlogPointerId = e.pointerId;
        this._backlogPointerHandle = handle;
        this.root.classList.add("my-timeline--dragging");

        const rootBounds = typeof(this.root.getBoundingClientRect) === "function" ? this.root.getBoundingClientRect() : { left: 0 };
        this.rootDropZone.style.top = (this._getFloatingAxisTop() + 4) + "px";
        this.rootDropZone.style.left = (rootBounds.left + 4) + "px";
        if (typeof(global.document.addEventListener) === "function") {
            global.document.addEventListener("pointermove", this._onBacklogPointerMoveBound, true);
            global.document.addEventListener("pointerup", this._onBacklogPointerUpBound, true);
            global.document.addEventListener("pointercancel", this._onBacklogPointerUpBound, true);
        }

        if (typeof(handle.setPointerCapture) === "function") {
            try {
                handle.setPointerCapture(e.pointerId);
            }
            catch (error) {
            }
        }

        e.preventDefault();
        e.stopPropagation();
        if (typeof(e.stopImmediatePropagation) === "function") {
            e.stopImmediatePropagation();
        }
    };


    /**
     * Updates the drop target beneath the active pointer.
     */
    Timeline.prototype._onBacklogPointerMove = function (e) {
        if (this._backlogDraggedId === null || e.pointerId !== this._backlogPointerId) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        this._clearBacklogDropClasses();
        this.rootDropZone.classList.remove("my-timeline__root-drop-zone--active");

        const hit = global.document.elementFromPoint(e.clientX, e.clientY);
        if (!hit || typeof(hit.closest) !== "function") {
            return;
        }

        if (hit.closest(".my-timeline__root-drop-zone") === this.rootDropZone) {
            this.rootDropZone.classList.add("my-timeline__root-drop-zone--active");
            return;
        }

        const element = hit.closest(".my-timeline-group");
        if (!element || !this.root.contains(element)) {
            return;
        }

        const id = element.getAttribute("data-work-item-id");
        const target = this.groups && (this.groups.get(id) || this.groups.get(Number(id)));
        const dragged = this.groups && this.groups.get(this._backlogDraggedId);
        const position = this._getBacklogDropPosition(dragged, target, element, e);
        if (!position) {
            return;
        }

        const drop = this._canonicalizeBacklogDrop(dragged, target, element, position);
        drop.element.classList.add(`my-timeline-group--drop-${drop.position}`);
        drop.element.setAttribute("data-backlog-drop-position", drop.position);
    };


    /**
     * Commits the highlighted pointer drop, or cancels when no valid target is
     * highlighted.
     */
    Timeline.prototype._onBacklogPointerUp = function (e) {
        if (this._backlogDraggedId === null || e.pointerId !== this._backlogPointerId) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        if (e.type === "pointercancel") {
            this._clearBacklogDrag();
            return;
        }

        if (this.rootDropZone.classList.contains("my-timeline__root-drop-zone--active")) {
            this._runBacklogMove(null, "root");
            return;
        }

        const element = this.root.querySelector("[data-backlog-drop-position]");
        if (!element) {
            this._clearBacklogDrag();
            return;
        }

        const id = element.getAttribute("data-work-item-id");
        const target = this.groups && (this.groups.get(id) || this.groups.get(Number(id)));
        if (!target) {
            this._clearBacklogDrag();
            return;
        }

        this._runBacklogMove(target.id, element.getAttribute("data-backlog-drop-position"));
    };


    /**
     * Resolves the meaning of a row drop from the participating backlog levels.
     */
    Timeline.prototype._getBacklogDropPosition = function (dragged, target, element, e) {
        if (!dragged || !target || !dragged.backlogEligible || !target.backlogEligible
            || target.backlogTargetEligible === false || (dragged.id === target.id)) {
            return null;
        }

        if (dragged.backlogId === target.backlogId) {
            if (target.backlogParentValid === false) {
                return null;
            }
            const bounds = element.getBoundingClientRect();
            return e.clientY < bounds.top + (bounds.height / 2) ? "before" : "after";
        }

        if (target.backlogRank === dragged.backlogRank + 1) {
            return "inside";
        }

        return null;
    };


    /**
     * Uses one DOM boundary for one logical insertion point. The lower half of
     * a row and the upper half of its next sibling otherwise produce two blue
     * lines for the same backlog position.
     */
    Timeline.prototype._canonicalizeBacklogDrop = function (dragged, target, element, position) {
        const result = { target: target, element: element, position: position };
        if (position !== "after" || !this.groups || typeof(this.root.querySelectorAll) !== "function") {
            return result;
        }

        const elements = Array.from(this.root.querySelectorAll(".my-timeline-group"));
        const currentIndex = elements.indexOf(element);
        const nextElement = currentIndex >= 0 ? elements[currentIndex + 1] : null;
        if (!nextElement) {
            return result;
        }

        const id = nextElement.getAttribute("data-work-item-id");
        const next = this.groups.get(id) || this.groups.get(Number(id));
        if (!next || next.id === dragged.id || !next.backlogEligible || next.backlogParentValid === false
            || next.backlogId !== target.backlogId
            || (next.backlogParentId || 0) !== (target.backlogParentId || 0)) {
            return result;
        }

        return { target: next, element: nextElement, position: "before" };
    };


    /**
     * Sends a backlog move to the application model.
     */
    Timeline.prototype._runBacklogMove = function (targetId, position) {
        const draggedId = this._backlogDraggedId;
        this._clearBacklogDrag();

        const result = this.callback("reorderWit", {
            draggedId: draggedId,
            targetId: targetId,
            position: position
        });
        if (result && (typeof (result.catch) === "function")) {
            result.catch((error) => {
                console.warn("Timeline : _runBacklogMove() : Unable to reorder work item.");
                console.warn(error);
            });
        }
    };


    /**
     * Clears drag state and all drop indicators.
     */
    Timeline.prototype._clearBacklogDrag = function () {
        if (typeof(global.document.removeEventListener) === "function") {
            global.document.removeEventListener("pointermove", this._onBacklogPointerMoveBound, true);
            global.document.removeEventListener("pointerup", this._onBacklogPointerUpBound, true);
            global.document.removeEventListener("pointercancel", this._onBacklogPointerUpBound, true);
        }
        if (this._backlogPointerHandle && this._backlogPointerId !== null
            && typeof(this._backlogPointerHandle.releasePointerCapture) === "function") {
            try {
                if (typeof(this._backlogPointerHandle.hasPointerCapture) !== "function"
                    || this._backlogPointerHandle.hasPointerCapture(this._backlogPointerId)) {
                    this._backlogPointerHandle.releasePointerCapture(this._backlogPointerId);
                }
            }
            catch (error) {
            }
        }
        this._backlogDraggedId = null;
        this._backlogPointerId = null;
        this._backlogPointerHandle = null;
        this.root.classList.remove("my-timeline--dragging");
        this.rootDropZone.classList.remove("my-timeline__root-drop-zone--active");
        this.rootDropZone.style.top = "";
        this.rootDropZone.style.left = "";
        this._clearBacklogDropClasses();
    };


    /**
     * Clears row drop indicators.
     */
    Timeline.prototype._clearBacklogDropClasses = function () {
        this.root.querySelectorAll("[data-backlog-drop-position]").forEach((element) => {
            element.classList.remove("my-timeline-group--drop-before", "my-timeline-group--drop-after", "my-timeline-group--drop-inside");
            element.removeAttribute("data-backlog-drop-position");
        });
    };


    /**
     * Keeps native target=_blank navigation isolated from vis-timeline's row
     * selection handlers. Native anchor navigation avoids rendering an Azure
     * DevOps work-item page inside the extension iframe.
     * 
     * @param {object} e Event arguments. 
     */
    Timeline.prototype._onGroupTitleSelect = function (e) {
        e.stopPropagation();
    };


    /**
     * Handles the group checkbox click event.
     * 
     * @param {object} e Argumenty.
     **/
    Timeline.prototype._onGroupSelect = function (e) {
        e.stopPropagation();
        e.preventDefault();

        const id = parseInt(e.target.getAttribute("data-group-id"));
        if (isNaN(id)) {
            return;
        }

        if(id === this.selectedId()) {
            this._onSelect({
                items: []
            });
            this.timeline.setSelection([]);
            return;
        }

        this.timeline.setSelection([ id ], { focus: false });
        this._onSelect({
            items: [id]
        });
    };


    /**
     * Handles the group edit click event.
     * 
     * @param {object} e Argumenty.
     **/
    Timeline.prototype._onGroupEdit = function (e) {
        e.stopPropagation();
        e.preventDefault();

        const id = parseInt(e.target.getAttribute("data-group-id"));
        if (isNaN(id)) {
            return;
        }

        this.timeline.setSelection([ id ], { focus: false });
        this._onSelect({
            items: [id]
        });
        this.selectedItemId(id);
    };


    /**
     * Handles the item double click event.
     * 
     * @param {object} e Arguments.
     */
    Timeline.prototype._onDoubleClick = function (e) {
        // if ((e.event.type !== "dblclick") || isNaN(e.item)) {
        //     return;
        // }
        // const id = e.item;
        // this.timeline.setSelection([ id ], { focus: false });
        // this._onSelect({
        //     items: [id]
        // });
        // this.selectedItemId(id);
    };


    /**
     * Handles the item select event.
     * 
     * @param {object} e Arguments.
     **/
    Timeline.prototype._onSelect = function (e) {
        let id = this.selectedId();
        if (id) {
            if (this.groups.getIds().includes(id)) {
                this.groups.update({ id, selected: false });
            }
        }

        if (!e.items.length) {
            this.selectedId(null);
            return;
        }

        id = e.items[0];
        this.selectedId(id);
        if (this.groups.getIds().includes(id)) {
            this.groups.update({ id, selected: true });
        }
    };


    /**
     * Checks whether non-item rendering inputs still match the live timeline.
     */
    Timeline.prototype._hasSameRenderContext = function (context) {
        if (!this._renderContext) {
            return false;
        }

        return Object.keys(context).every((name) => this._renderContext[name] === context[name]);
    };


    /**
     * Gets a stable signature for dependency arrows. A changed relationship
     * requires rebuilding the arrow helper, while a hierarchy-only reorder
     * can safely update the existing DataSets in place.
     */
    Timeline.prototype._getDependenciesKey = function (items) {
        return items
            .map((item) => `${item.id}:${(item.dependencies || []).map((id) => id + "").sort().join(",")}`)
            .sort()
            .join("|");
    };


    /**
     * Checks whether the next data can replace the current DataSets without
     * constructing another vis-timeline instance.
     */
    Timeline.prototype._hasSameTimelineIds = function (groups, records) {
        if (!this.groups || !this.records || (typeof(this.groups.getIds) !== "function") || (typeof(this.records.getIds) !== "function")) {
            return false;
        }

        const sameIds = (current, next) => {
            const currentIds = current.getIds().map((id) => id + "").sort();
            const nextIds = next.map((item) => item.id + "").sort();
            return currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index]);
        };

        return sameIds(this.groups, groups) && sameIds(this.records, records);
    };


    /**
     * Updates hierarchy/order data while preserving the live timeline, the
     * user's expanded/collapsed nodes, the visible date window, and page
     * scroll position.
     */
    Timeline.prototype._syncTimelineData = function (groups, records) {
        const scrollTop = this.scrollContainer ? this.scrollContainer.scrollTop : null;
        const previous = new Map();
        this.groups.forEach((group) => previous.set(group.id + "", group));

        const parentByChild = new Map();
        groups.forEach((group) => (group.nestedGroups || []).forEach((id) => parentByChild.set(id + "", group.id)));

        const groupsById = new Map();
        groups.forEach((group) => {
            const oldGroup = previous.get(group.id + "");
            group.nestedInGroup = parentByChild.has(group.id + "") ? parentByChild.get(group.id + "") : null;
            group.selected = oldGroup ? Boolean(oldGroup.selected) : Boolean(group.selected);

            if (group.nestedGroups && group.nestedGroups.length) {
                group.showNested = oldGroup ? oldGroup.showNested !== false : true;
            }
            else {
                // DataSet.update merges objects, so explicit null/true values
                // clear hierarchy state left over from an earlier parent role.
                group.nestedGroups = null;
                group.showNested = true;
            }

            groupsById.set(group.id + "", group);
        });

        const visited = new Set();
        const updateVisibility = (id, visible) => {
            const key = id + "";
            const group = groupsById.get(key);
            if (!group || visited.has(key)) {
                return;
            }

            visited.add(key);
            group.visible = visible;
            const childrenVisible = visible && group.showNested !== false;
            (group.nestedGroups || []).forEach((childId) => updateVisibility(childId, childrenVisible));
        };
        groups
            .filter((group) => group.nestedInGroup === null)
            .forEach((group) => updateVisibility(group.id, true));
        groups
            .filter((group) => !visited.has(group.id + ""))
            .forEach((group) => updateVisibility(group.id, true));

        const nextGroupIds = new Set(groups.map((group) => group.id + ""));
        const nextRecordIds = new Set(records.map((record) => record.id + ""));
        const removedGroups = this.groups.getIds().filter((id) => !nextGroupIds.has(id + ""));
        const removedRecords = this.records.getIds().filter((id) => !nextRecordIds.has(id + ""));
        if (removedGroups.length) {
            this.groups.remove(removedGroups);
        }
        if (removedRecords.length) {
            this.records.remove(removedRecords);
        }

        this.groups.update(groups);
        this.records.update(records);
        if (this.scrollContainer && Number.isFinite(scrollTop)) {
            this.scrollContainer.scrollTop = scrollTop;
        }
        this._syncRangeItemVisibility();
        this._syncFloatingAxis(true);
    };


    /**
     * Initializes or destroys the timeline after the items are ready.
     **/
    Timeline.prototype._onItemsChanged = function () {
        var items = this.items();
        var states = this.states();
        var priorities = this.priorities();
        var types = this.types();
        var typesOther = this.typesOther();
        var icons = this.icons();
        var showFields = this.showFields();
        var backlogOrder = this.backlogOrder();
        var dateGranularity = dateGranularityService.normalize(this.dateGranularity());
        var now = new Date();
        var renderContext = {
            states: states,
            priorities: priorities,
            types: types,
            typesOther: typesOther,
            icons: icons,
            showFields: showFields,
            backlogOrder: backlogOrder,
            dateGranularity: dateGranularity
        };

        if (!items || !items.length) {
            this._createStyles(types, typesOther);
            this._destroyTimeline();
            return;
        }

        // Create groups
        var markerGroup = null;
        var groups = items
            .map((wit, index) => {
                if (isMarker(wit)) {
                    markerGroup = markerGroup || createMarkerGroup(-1);
                    return null;
                }

                return createGroup(wit, items, now, dateGranularity, index);
            })
            .filter((group) => group !== null);

        // Add marker group to group list
        if(markerGroup) {
            groups.unshift(markerGroup);
        }
        
        // Create items
        var records = items
            .map((wit) => createRecord(wit, now, dateGranularity))
            .filter((record) => record !== null);
        var dependenciesKey = this._getDependenciesKey(items);

        if (this.timeline && this._hasSameRenderContext(renderContext) && this._dependenciesKey === dependenciesKey && this._hasSameTimelineIds(groups, records)) {
            this._syncTimelineData(groups, records);
            return;
        }

        this._createStyles(types, typesOther);
        this._destroyTimeline();
        this._renderContext = renderContext;
        this._dependenciesKey = dependenciesKey;

        // Options for the Timeline
        var options = {
            // moment: VisTimeline.moment.utc,
            // moment: moment,
            // locales: {
            //     sk: {
            //         current: "current",
            //         time: "time",
            //         deleteSelected: "Delete selected"
            //     }
            // },
            // locale: "sk",
            xss: {
                disabled: true
            },
            groupOrder: "order",
            groupHeightMode: "fixed",
            orientation: {
                axis: "top",
                // Long schedules should open at the first work item.
                item: "top"
            },
            // Vertical wheel input belongs to the page. Horizontal trackpad
            // input is handled directionally by _onTimelineWheel.
            horizontalScroll: false,
            // Let the Azure DevOps page scroll all work item rows. The top axis
            // is mirrored by _syncFloatingAxis while its original scrolls out.
            verticalScroll: false,
            zoomKey: "ctrlKey",
            editable: {
                remove: false,
                updateGroup: false,
                updateTime: true
            },
            groupTemplate: (record, element) => createGroupTemplate(this, record, element, states, priorities, types, typesOther, icons, showFields, backlogOrder),
            visibleFrameTemplate: (record, element) => createVisibleFrameTemplate(this, record, element),
            onMove: (record, callback) => updateWit(this, record, callback),
            // Restore browser-local zoom only after vis-timeline has completed
            // its automatic initial fit; its earlier default window is not the
            // data-relative 100% range.
            onInitialDrawComplete: () => {
                this._restoreZoom();
                this._syncRangeItemVisibility();
                this._syncFloatingAxis(true);
            }
            //template: function (item, element, data) { return '<h1>' + item.header + data.moving?' '+ data.start:'' + '</h1><p>' + item.description + '</p>'; }
        };

        if (dateGranularity === dateGranularityService.day) {
            options.snap = dateGranularityService.startOfDay;
            options.zoomMin = dateGranularityService.getZoomMin(dateGranularity, this.node.clientWidth);
        }

        this.groups = new VisTimeline.DataSet(groups);
        this.records = new VisTimeline.DataSet(records);

        // Create an Timeline
        this.timeline = new VisTimeline.Timeline(this.node, this.records, this.groups, options);
        
        // Create an Arrow
        const dependencies = items
            .filter((i) => i.dependencies.length)
            .map((i) => i.dependencies.map((d) => ({ 
                id: `${i.id}_${d}`, 
                id_item_1: i.id, 
                id_item_2: d,
                //title: "Custom title",
                color: "#83A44A",
                direction: 1,   // arrow always at id_item_2
                line: 0,        // solid
                type: 2,        // cornered
                align: "center" // straight center-to-center (if type: 1)                
            })))
            .flat(1);
        if (dependencies.length) {
            this.arrows = new VisTimelineArrow(this.timeline, dependencies, { 
                followRelationships: true,
                color: "rgba(var(--palette-accent2), .8)" 
            });
        }
        
        // Events
        this.timeline.on("select", this._onSelect.bind(this));
        this.timeline.on("doubleClick", this._onDoubleClick.bind(this));
        this.timeline.on("rangechanged", this._onRangeChanged.bind(this));
        this.timeline.on("rangechange", this._timelineChangedBound);
        this.timeline.on("changed", this._timelineChangedBound);
        const preferredWidth = timelineSplitService.normalize(this.listWidth());
        if (preferredWidth !== null) {
            this._setListWidth(preferredWidth, true);
            this._refreshTimelineScaleAfterListResize();
        }
        else {
            this._positionSplitter();
        }
        this._syncFloatingAxis(true);
    };


    /**
     * Gets the selected item.
     */
    Timeline.prototype._onSelectedIdChanged = function () {
        let id = this.selectedId();
        let items = this.items();
        
        if (ko.computedContext.isInitial()) {
            return;
        }

        if (!id) {
            this.selectedItem(null);
            return;
        }

        this.selectedItem(items.find((w) => w.id === id) || null);
    };    

    //#endregion


    //#region [ Methods : Static ]

    /**
     * Factory method.
     *
     * @param {object} params Parameters.
     * @param {object} componentInfo Component into.
     * @returns {object} Instance of the model.
     */
    Timeline.createViewModel = function (params, componentInfo) {
        params = params || {};
        params.element = componentInfo.element.querySelector ? componentInfo.element : componentInfo.element.parentElement || componentInfo.element.parentNode;

        return new Timeline(params);
    };

    //#endregion


    //#region [ Methods : Internal ]
    
    /**
     * Creates and gets marker group.
     * 
     * @returns Returns object, which represents marker group.
     * @param {number} order Stable visual position in the group DataSet.
     */
    let createMarkerGroup = function (order) {
        return {
            id: "markers",
            order: order,
            treeLevel: 1,
            content: "MARKERS",
            type: "markers",
            selected: false
        };
    };


    /**
     * Creates group representation for the current work item.
     * 
     * @param {object} wit Current work item.
     * @param {array} items List of all work items. 
     * @param {number} now Current date. 
     * @param {string} dateGranularity Smallest supported timeline unit.
     * @param {number} order Stable visual position in the group DataSet.
     */
    let createGroup = function (wit, items, now, dateGranularity, order) {
        var group = {
            id: wit.id,
            order: order,
            originalId: wit.originalId,
            parentId: wit.parentId,
            parentTitle: wit.parentTitle,
            project: wit.project,
            areaPath: wit.areaPath,
            nodeName: wit.nodeName,
            remainingWork: wit.remainingWork,
            completedWork: wit.completedWork,
            effort: wit.effort,
            iterationPath: wit.iterationPath,
            isCompleted: wit.isCompleted,
            childCount: wit.childCount,
            childCompletedCount: wit.childCompletedCount,
            assignedTo: wit.assignedTo,
            url: wit.url,
            treeLevel: wit.level,
            content: wit.title,
            title: wit.title,
            type: wit.type,
            state: wit.state,
            priority: wit.priority,
            duration: getDuration(wit, dateGranularity),
            selected: false,
            tags: wit.tags,
            startDate: wit.startDate,
            endDate: wit.targetDate,
            backlogEligible: Boolean(wit.backlogOrder && wit.backlogOrder.eligible),
            backlogTargetEligible: Boolean(wit.backlogOrder && wit.backlogOrder.targetEligible !== false),
            backlogId: wit.backlogOrder && wit.backlogOrder.backlogId,
            backlogRank: wit.backlogOrder && wit.backlogOrder.backlogRank,
            backlogParentId: wit.backlogOrder && wit.backlogOrder.parentId,
            backlogParentValid: !wit.backlogOrder || wit.backlogOrder.parentValid !== false,
            nestedGroups: items
                .filter((child) => (child.parent === wit.path) && !isMarker(child))
                .map((child) => child.id)
        };

        if (!group.nestedGroups.length) {
            delete group["nestedGroups"];
        }

        return group;
    };


    /**
     * Creates record for the current work item.
     * 
     * @param {object} wit Current work item. 
     * @param {Date} now Current date.
     */
    let createRecord = function (wit, now, dateGranularity) {
        var subtitle = [
            getFormattedDate(wit.startDate) || "×",
            getFormattedDate(wit.targetDate) || "×"
        ];

        const range = dateGranularityService.getTimelineRange(wit.startDate, wit.targetDate, now, dateGranularity);

        return {
            id: wit.id,
            parentId: wit.parentId,
            parentTitle: wit.parentTitle,
            assignedTo: wit.assignedTo,
            isCompleted: wit.isCompleted,
            childCount: wit.childCount,
            childCompletedCount: wit.childCompletedCount,
            group: isMarker(wit) ? "markers" : wit.id,
            className: `my-timeline-item my-timeline-item--${wit.type.toLowerCase().replace(/\s+/g,"-")} my-timeline-item--${wit.project.toLowerCase().replace(/\s+/g,"")}-${wit.type.toLowerCase().replace(/\s+/g,"-")}`,
            title: wit.title + "<br/>(" + subtitle.join(", ") + ")",
            content: isMarker(wit) ? wit.title : wit.childCount ? `${wit.childCompletedCount}/${wit.childCount} (${Math.ceil((wit.childCompletedCount/wit.childCount) * 100)}%)` : "&nbsp;",
            selectable: true,
            type: isMarker(wit) ? "box" : "range",
            start: range.start,
            end: isMarker(wit) ? range.start : range.end
        };
    };


    /**
     * Creates template for group.
     * 
     * @param {object} vm View model.
     * @param {object} record Current record.
     * @param {HTMLElement} element Parent element.
     * @param {array} states List of supported states.
     * @param {array} priorities List of supported priorities.
     * @param {array} types List of supported types.
     * @param {array} typesOthers List of supported types for other projects in the across project query.
     * @param {array} icons List of icons.
     * @param {array} showFields List of fields which should be rendered.
     * @param {boolean} backlogOrder True when backlog ordering is active.
     */
    let createGroupTemplate = function (vm, record, element, states, priorities, types, typesOther, icons, showFields, backlogOrder) {
        // Do not create group label for markers group
        if (!record || (record.type === "markers")) {
            return "";
        }

        const type = ((typesOther.find((to) => to.project === record.project) || {}).types || types).find((t) => t.name === record.type) || {};
        const state = type.states.find((s) => s.name === record.state) || {};

        const result = [
            `${icons[type.icon.url] || ""}`,
            `<a class="my-timeline-group__title ${record.isCompleted ? "my-timeline-group__title--completed" : ""}" data-id="${record.id}" title="${record.title}" href="${record.url.replace('/_apis/wit/workItems/', '/_workitems/edit/')}" target="_blank" rel="noopener noreferrer">${showFields.includes("id") ? "<span class='font-weight-semibold'>#" + record.id + "</span>&nbsp" : ""}${record.content}</a>`,
            `<div class="my-timeline-group__state" title="${record.state}" style="background-color: #${state.color}"></div>`
        ];

        if (backlogOrder && record.backlogEligible) {
            result.unshift(
                `<div class="my-timeline-group__button my-timeline-group__button--drag fluent-icons-enabled text-center" title="Drag to reorder in the team backlog" role="button" aria-label="Drag to reorder in the team backlog" data-noexport="true">
                    <span aria-hidden="true" class="flex-noshrink fabric-icon ms-Icon--GripperDotsVertical large"></span>
                 </div>`
            );
        }

        if (showFields.includes("tags")) {
            const tags = record.tags.length ? record.tags.map((t) => `<div>${t}</div>`).join("") : "";
            result.push(`<div class="my-timeline-group__tags">${tags}</div>`);
        }

        result.push(`<div class="my-timeline-group__dividier"></div>`);

        if (showFields.includes("assignedTo")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--assignedto text-left text-ellipsis margin-left-8">${record.assignedTo || ""}</div>`);
        }
        
        if (showFields.includes("project")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--project text-left text-ellipsis margin-left-8" title="Project">${record.project}</div>`);
        }
        
        if (showFields.includes("areaPath")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--areapath text-left text-ellipsis margin-left-8" title="Area Path">${record.areaPath}</div>`);
        }
        
        if (showFields.includes("nodeName")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--nodename text-left text-ellipsis margin-left-8" title="Node Name">${record.nodeName}</div>`);
        }

        if (showFields.includes("iterationPath")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--iterationpath text-left text-ellipsis margin-left-8" title="Iteration Path">${record.iterationPath}</div>`);
        }
        
        if (showFields.includes("parentTitle")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--parent text-left text-ellipsis margin-left-8" title="Parent">${record.parentTitle || ""}</div>`);
        }

        if (showFields.includes("effort")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--effort justify-end margin-left-8 flex-row flex-center" title="Effort">
                            ${record.effort + " h" || ""}
                            <div class="bolt-pill bolt-pill--timeline flex-row flex-center outlined compact margin-left-4">
                                <div class="bolt-pill-content text-ellipsis" role="presentation">EFF</div>
                            </div>
                        </div>`);
        }

        if (showFields.includes("remainingWork")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--remainingwork justify-end margin-left-8 flex-row flex-center" title="Remaining Work">
                            ${record.remainingWork + " h" || ""}
                            <div class="bolt-pill bolt-pill--timeline flex-row flex-center outlined compact margin-left-4">
                                <div class="bolt-pill-content text-ellipsis" role="presentation">RW</div>
                            </div>
                        </div>`);
        }

        if (showFields.includes("completedWork")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--completedwork justify-end margin-left-8 flex-row flex-center" title="Completed Work">
                            <div>${record.completedWork + " h" || "×"}</div>
                            <div class="bolt-pill bolt-pill--timeline flex-row flex-center outlined compact margin-left-4">
                                <div class="bolt-pill-content text-ellipsis" role="presentation">CW</div>
                            </div>
                        </div>`);
        }

        if (showFields.includes("dates")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--dates text-right margin-left-8" title="Dates">${getFormattedDate(record.startDate) || "×"} - ${getFormattedDate(record.endDate) || "×"}</div>`);
        }

        if (showFields.includes("duration")) {
            result.push(`<div class="my-timeline-group__content my-timeline-group__content--duration text-right margin-left-8" title="Duration">${record.duration} day(s)</div>`);
        }

        const priority = priorities.find((p) => p.value === record.priority) || {};
        result.push(`<div class="my-timeline-group__state my-timeline-group__state--square" title="${priority.name}" style="background-color: #${priority.color}"></div>`);

        result.push(
            `<div class="my-timeline-group__button my-timeline-group__button--checkbox fluent-icons-enabled text-center ${record.selected ? "my-timeline-group__button--selected" : ""}" title="Select item" data-group-id="${record.id}" data-noexport="true">
                <span aria-hidden="true" class="flex-noshrink fabric-icon large"></span>
             </div>`);
        result.push(
            `<div class="my-timeline-group__button my-timeline-group__button--edit fluent-icons-enabled text-center ${record.selected ? "my-timeline-group__button--selected" : ""}" title="Edit item" data-group-id="${record.id}" data-noexport="true">
                <span aria-hidden="true" class="flex-noshrink fabric-icon large"></span>
             </div>`);

        // Create element
        let el = global.document.createElement("div");
        el.classList.add("my-timeline-group");
        el.setAttribute("data-work-item-id", record.id);
        el.innerHTML = result.join("");

        el.querySelector(".my-timeline-group__title").addEventListener("pointerdown", vm._onGroupTitleSelect.bind(vm), false);
        el.querySelector(".my-timeline-group__title").addEventListener("click", vm._onGroupTitleSelect.bind(vm), false);
        el.querySelector(".my-timeline-group__button--checkbox").addEventListener("pointerdown", vm._onGroupSelect.bind(vm), false);
        el.querySelector(".my-timeline-group__button--edit").addEventListener("pointerdown", vm._onGroupEdit.bind(vm), false);

        const dragHandle = el.querySelector(".my-timeline-group__button--drag");
        if (dragHandle) {
            dragHandle.addEventListener("pointerdown", vm._onBacklogPointerDown.bind(vm, record, dragHandle), false);
        }

        return el;
    };

    /**
     * Creates template for the visible frame.
     * 
     * @param {object} vm View model.
     * @param {object} record Current record.
     * @param {HTMLElement} element Parent element.
     */
    let createVisibleFrameTemplate = function (vm, record, element) {
        let el = global.document.createElement("div");
        el.classList.add("vis-item-visible-frame__progress");
        el.style.width = (record.childCount ? Math.ceil((record.childCompletedCount/record.childCount) * 100) : 0) + "%";
        return el;
    };


    /**
     * Fired when an item has been moved.
     * 
     * @param {object} vm View model.
     * @param {object} record The item being manipulated.
     * @param {function} callback A callback function which must be invoked to report back. The callback must be invoked as callback(item) or callback(null).
     */
    let updateWit = function (vm, record, callback) {
        vm.callback.call(vm, "updateWit", record).then((result) => callback(result));
    };


    /**
     * Returns true if the wit's start and target date is the same date.
     * 
     * @param {object} wit Work item. 
     */
    let isMarker = function (wit) {
        return !wit.startDate && wit.targetDate;
    };


    /**
     * Gets the work item duration.
     * 
     * @param {object} wit Work item.
     */
    let getDuration = function (wit, dateGranularity) {
        return dateGranularityService.getDuration(wit.startDate, wit.targetDate, dateGranularity);
    };


    /**
     * Gets date formatted as string.
     * 
     * @param {Date} d Date object.
     */
    let getFormattedDate = function (d) {
        if (!(d instanceof Date) || isNaN(d)) {
            return "";
        }
        
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        
        return `${day}/${month}/${year}`;
    };


    /**
     * Makes the input color lighter or darker.
     * 
     * @param {string} col Color. 
     * @param {number} amt Amount. 
     * @returns String representing the new color.
     */
    const darkenColor = function (col, amt) {
        let usePound = false;
        if (col[0] == "#") {
            col = col.slice(1);
            usePound = true;
        }
    
        const num = parseInt(col,16);
    
        let r = (num >> 16) + amt;
    
        if ( r > 255 ) r = 255;
        else if  (r < 0) r = 0;
    
        let b = ((num >> 8) & 0x00FF) + amt;
    
        if ( b > 255 ) b = 255;
        else if  (b < 0) b = 0;
        
        let g = (num & 0x0000FF) + amt;
    
        if ( g > 255 ) g = 255;
        else if  ( g < 0 ) g = 0;
    
        return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
    };


    /**
     * Gets the right text color according to the background color.
     * 
     * @param {string} col Color of the background.
     */
    const textColorForBackground = function (col) {
        let usePound = false;
        if (col[0] == "#") {
            col = col.slice(1);
            usePound = true;
        }

        // Make the color 6 character long
        if (col.length === 3) {
            col = col.split("").map(c => c + c).join("");
        }

        // Convert to RGB
        const r = parseInt(col.substr(0, 2), 16);
        const g = parseInt(col.substr(2, 2), 16);
        const b = parseInt(col.substr(4, 2), 16);

        // Calculate the brightnes accroding to  W3C
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        // Threshold value ~128
        return (usePound ? "#" : "") + (brightness > 128 ? "000" : "fff");
    };
    
    //#endregion


    //#region [ Registration ]

    ko.components.register("my-timeline", {
        viewModel: { 
            createViewModel: Timeline.createViewModel 
        },
        template: 
            `<div class="my-timeline">
                <div class="my-timeline__root-drop-zone" data-noexport="true">Move to backlog root</div>
                <div class="my-timeline__chart"></div>
                <div class="my-timeline__splitter" role="separator" aria-orientation="vertical" aria-label="Resize the work item list and timeline" tabindex="0" title="Drag to resize the work item list and timeline" data-noexport="true"></div>
             </div>`
    });

    //#endregion
});

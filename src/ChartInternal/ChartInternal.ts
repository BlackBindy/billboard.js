/**
 * Copyright (c) 2017 ~ present NAVER Corp.
 * billboard.js project is licensed under the MIT license
 * @ignore
 */
import {
	timeParse as d3TimeParse,
	timeFormat as d3TimeFormat,
	utcParse as d3UtcParse,
	utcFormat as d3UtcFormat
} from "d3-time-format";
import {select as d3Select} from "d3-selection";
import CLASS from "../config/classes";
import Store from "../config/Store";
import Options from "../config/Options/Options";
import {document, window} from "../module/browser";
import Cache from "../module/Cache";
import {generateResize} from "../module/generator";
import {extend, notEmpty, convertInputType, getOption, isFunction, isObject, isString, callFn, sortValue} from "../module/util";

// for Types
import {d3Selection} from "../../types/types";

// Axis
import Axis from "./Axis/Axis";

// data
import dataConvert from "./data/data.convert";
import data from "./data/data";
import dataLoad from "./data/data.load";

// interactions
import interaction from "./interactions/interaction";

// internals
import classModule from "./internals/class";
import color from "./internals/color";
import domain from "./internals/domain";
import format from "./internals/format";
import legend from "./internals/legend";
import redraw from "./internals/redraw";
import scale from "./internals/scale";
import size from "./internals/size";
import text from "./internals/text";
import title from "./internals/title";
import tooltip from "./internals/tooltip";
import transform from "./internals/transform";
import type from "./internals/type";

import {internal as axisInternal} from "../config/resolver/axis";
import {internal as arcInternal} from "../config/resolver/arc";

type N = d3Selection|null;
type F = Function|null;

/**
 * Internal chart class.
 * - Note: Instantiated internally, not exposed for public.
 * @class ChartInternal
 * @ignore
 * @private
 */
export default class ChartInternal {
	public api;	// API interface
	public config; // config object
	public cache; // cache instance
	public state; // state variables
	public charts; // all Chart instances array within page (equivalent of 'bb.instances')
	public isArc = false; // if is Arc type chart

	// data object
	public data = {
		xs: {},
		targets: []
	};

	// selections
	public $el: {
		[key: string]: N | {[key: string]: N}
	} = {
		chart: null,
		main: null,
		svg: null,
		axis: { // axes
			x: null,
			y: null,
			y2: null,
			subX: null
		},
		defs: null,
		tooltip: null,
		legend: null,
		title: null,
		subchart: {
			main: null, // $$.context
			bar: null, // $$.contextBar
			line: null, // $$.contextLine
			area: null // $$.contextArea
		},

		arcs: null,
		bar: null, // mainBar,
		line: null, // mainLine,
		area: null, // mainArea,
		circle: null, // mainCircle,
		radars: null,
		text: null, // mainText,
		grid: {
			main: null, // grid (also focus)
			x: null, // xgrid,
			y: null, // ygrid,
		},
		gridLines: {
			main: null, // gridLines
			x: null, // xgridLines,
			y: null, // ygridLines
		},
		region: {
			main: null, // region
			list: null // mainRegion
		},
		eventRect: null
	};

	// Axis
	public axis; // Axis

	// scales
	public scale = {
		x: null,
		y: null,
		y2: null,
		subX: null,
		subY: null,
		subY2: null,
		zoom: null
	}

	// original values
	public org = {
		xScale: null,
		xDomain: null
	};

	// formatter function
	public color;
	public patterns;
	public levelColor;
	public point;
	public brush;

	// format function
	public format = {
		extraLineClasses: null,
		xAxisTick: null,
		dataTime: null, // dataTimeFormat
		defaultAxisTime: null, // defaultAxisTimeFormat
		axisTime: null // axisTimeFormat
	};

	constructor(api) {
		const $$ = this;

		$$.api = api; // Chart instance
		$$.config = new Options();
		$$.cache = new Cache();
		$$.state = new Store(); // status variables
	}

	beforeInit() {
		const $$ = this;

		$$.callPluginHook("$beforeInit");

		// can do something
		callFn($$.config.onbeforeinit, $$.api);
	}

	afterInit() {
		const $$ = this;

		$$.callPluginHook("$afterInit");

		// can do something
		callFn($$.config.onafterinit, $$.api);
	}

	init() {
		const $$ = this;
		const {config, state, $el} = $$;

		state.hasAxis = !$$.hasArcType();
		state.hasRadar = !state.hasAxis && $$.hasType("radar");

		$$.initParams();

		const bindto = {
			element: config.bindto,
			classname: "bb"
		};

		if (isObject(config.bindto)) {
			bindto.element = config.bindto.element || "#chart";
			bindto.classname = config.bindto.classname || bindto.classname;
		}

		// select bind element
		$el.chart = isFunction(bindto.element.node) ?
			config.bindto.element : d3Select(bindto.element || []);

		if ($el.chart.empty()) {
			$el.chart = d3Select(document.body.appendChild(document.createElement("div")));
		}

		$el.chart.html("").classed(bindto.classname, true);

		$$.initToRender();
	}

	/**
	 * Initialize the rendering process
	 * @param {Boolean} forced Force to render process
	 * @private
	 */
	initToRender(forced?: boolean) {
		const $$ = this;
		const {config, state, $el: {chart}} = $$;
		const isHidden = () => chart.style("display") === "none" || chart.style("visibility") === "hidden";

		const isLazy = config.render.lazy || isHidden();
		const MutationObserver = window.MutationObserver;

		if (isLazy && MutationObserver && config.render.observe !== false && !forced) {
			new MutationObserver((mutation, observer) => {
				if (!isHidden()) {
					observer.disconnect();
					!state.rendered && $$.initToRender(true);
				}
			}).observe(chart.node(), {
				attributes: true,
				attributeFilter: ["class", "style"]
			});
		}

		if (!isLazy || forced) {
			const convertedData = $$.convertData(config, $$.initWithData);

			convertedData && $$.initWithData(convertedData);
			$$.afterInit();
		}
	}

	initParams() {
		const $$ = this;
		const {config, format, state} = $$;
		const isRotated = config.axis_rotated;

		// datetime to be used for uniqueness
		state.datetimeId = `bb-${+new Date()}`;

		$$.color = $$.generateColor();
		$$.levelColor = $$.generateLevelColor();

		if ($$.hasPointType()) {
			$$.point = $$.generatePoint();
		}

		if (state.hasAxis) {
			$$.initClip();

			format.extraLineClasses = $$.generateExtraLineClass();
			format.dataTime = config.data_xLocaltime ? d3TimeParse : d3UtcParse;
			format.axisTime = config.axis_x_localtime ? d3TimeFormat : d3UtcFormat;

			const isDragZoom = $$.config.zoom_enabled && $$.config.zoom_enabled.type === "drag";

			format.defaultAxisTime = d => {
				const {x, zoom} = $$.scale;
				const isZoomed = isDragZoom ? zoom :
					zoom && x.orgDomain().toString() !== zoom.domain().toString();

				const specifier: string = (d.getMilliseconds() && ".%L") ||
					(d.getSeconds() && ".:%S") ||
					(d.getMinutes() && "%I:%M") ||
					(d.getHours() && "%I %p") ||
					(d.getDate() !== 1 && "%b %d") ||
					(isZoomed && d.getDate() === 1 && "%b\'%y") ||
					(d.getMonth() && "%-m/%-d") || "%Y";

				return format.axisTime(specifier)(d);
			};
		}

		state.isLegendRight = config.legend_position === "right";
		state.isLegendInset = config.legend_position === "inset";

		state.isLegendTop = config.legend_inset_anchor === "top-left" ||
			config.legend_inset_anchor === "top-right";

		state.isLegendLeft = config.legend_inset_anchor === "top-left" ||
			config.legend_inset_anchor === "bottom-left";

		state.rotatedPaddingRight = isRotated && !config.axis_x_show ? 0 : 30;

		state.inputType = convertInputType(
			config.interaction_inputType_mouse,
			config.interaction_inputType_touch
		);
	}

	initWithData(data) {
		const $$ = this;
		const {
			config, state, $el,
			scale: {
				x, y, y2, subX, subY, subY2
			},
			org
		} = $$;
		const {hasAxis} = state;

		// for arc type, set axes to not be shown
		// $$.hasArcType() && ["x", "y", "y2"].forEach(id => (config[`axis_${id}_show`] = false));

		if (hasAxis) {
			$$.axis = new Axis($$);
			config.zoom_enabled && $$.initZoom();
		}

		// Init data as targets
		$$.data.xs = {};
		$$.data.targets = $$.convertDataToTargets(data);

		if (config.data_filter) {
			$$.data.targets = $$.data.targets.filter(config.data_filter.bind($$.api));
		}

		// Set targets to hide if needed
		if (config.data_hide) {
			$$.addHiddenTargetIds(
				config.data_hide === true ?
					$$.mapToIds($$.data.targets) : config.data_hide
			);
		}
		if (config.legend_hide) {
			$$.addHiddenLegendIds(
				config.legend_hide === true ?
					$$.mapToIds($$.data.targets) : config.legend_hide
			);
		}

		// Init sizes and scales
		$$.updateSizes();
		$$.updateScales(true);

		// Set domains for each scale
		if (x) {
			x.domain(sortValue($$.getXDomain($$.data.targets)));
			subX.domain(x.domain());

			// Save original x domain for zoom update
			org.xDomain = x.domain();
		}

		if (y) {
			y.domain($$.getYDomain($$.data.targets, "y"));
			subY.domain(y.domain());
		}

		if (y2) {
			y2.domain($$.getYDomain($$.data.targets, "y2"));
			subY2 && subY2.domain(y2.domain());
		}

		// -- Basic Elements --
		$el.svg = $el.chart.append("svg")
			.style("overflow", "hidden")
			.style("display", "block");

		if (config.interaction_enabled && state.inputType) {
			const isTouch = state.inputType === "touch";

			$el.svg.on(isTouch ? "touchstart" : "mouseenter", () => callFn(config.onover, $$.api))
				.on(isTouch ? "touchend" : "mouseleave", () => callFn(config.onout, $$.api));
		}

		config.svg_classname && $el.svg.attr("class", config.svg_classname);

		// Define defs
		const hasColorPatterns = (isFunction(config.color_tiles) && $$.patterns);

		if (hasAxis || hasColorPatterns) {
			$el.defs = $el.svg.append("defs");

			if (hasAxis) {
				["id", "idXAxis", "idYAxis", "idXAxisTickTexts", "idGrid"].forEach(v => {
					$$.appendClip($el.defs, state.clip[v]);
				});
			}

			// set color patterns
			if (hasColorPatterns) {
				$$.patterns.forEach(p => $el.defs.append(() => p.node));
			}
		}

		$$.updateSvgSize();

		// Bind resize event
		$$.bindResize();

		// Define regions
		const main = $el.svg.append("g").attr("transform", $$.getTranslate("main"));

		$el.main = main;

		// initialize subchart when subchart show option is set
		config.subchart_show && $$.initSubchart();

		config.tooltip_show && $$.initTooltip();
		config.title_text && $$.initTitle();
		config.legend_show && $$.initLegend();

		// -- Main Region --

		// text when empty
		if (config.data_empty_label_text) {
			main.append("text")
				.attr("class", `${CLASS.text} ${CLASS.empty}`)
				.attr("text-anchor", "middle") // horizontal centering of text at x position in all browsers.
				.attr("dominant-baseline", "middle"); // vertical centering of text at y position in all browsers, except IE.
		}

		if (hasAxis) {
			// Regions
			config.regions.length && $$.initRegion();

			// Add Axis here, when clipPath is 'false'
			!config.clipPath && $$.axis.init();
		}

		// Define g for chart area
		main.append("g").attr("class", CLASS.chart)
			.attr("clip-path", state.clip.path);

		$$.callPluginHook("$init");

		if (hasAxis) {
			// Cover whole with rects for events
			$$.initEventRect && $$.initEventRect();

			// Grids
			$$.initGrid();

			// if zoom privileged, insert rect to forefront
			// if (config.zoom_enabled) {
			// 	main.insert("rect", config.zoom_privileged ? null : `g.${CLASS.regions}`)
			// 		.attr("class", CLASS.zoomRect)
			// 		.attr("width", $$.state.width)
			// 		.attr("height", $$.state.height)
			// 		.style("opacity", "0")
			// 		.on("dblclick.zoom", null);
			// }

			// Add Axis here, when clipPath is 'true'
			config.clipPath && $$.axis && $$.axis.init();
		}

		$$.initChartElements();

		// Set targets
		$$.updateTargets($$.data.targets);

		// Draw with targets
		$$.updateDimension();

		// oninit callback
		callFn(config.oninit, $$.api);

		// Set background
		$$.setBackground();

		$$.redraw({
			withTransition: false,
			withTransform: true,
			withUpdateXDomain: true,
			withUpdateOrgXDomain: true,
			withTransitionForAxis: false,
			initializing: true
		});

		// data.onmin/max callback
		if (config.data_onmin || config.data_onmax) {
			const minMax = $$.getMinMaxData();

			callFn(config.data_onmin, $$.api, minMax.min);
			callFn(config.data_onmax, $$.api, minMax.max);
		}

		state.rendered = true;
	}

	initChartElements() {
		const $$ = this;
		const {hasAxis, hasRadar} = $$.state;
		const types = [];

		if (hasAxis) {
			$$.hasType("bar") && types.push("Bar");
			$$.hasType("bubble") && types.push("Bubble");
			$$.hasTypeOf("Line") && types.push("Line");
		} else {
			if (!hasRadar) {
				types.push("Arc", "Pie");
			}

			if ($$.hasType("gauge")) {
				types.push("Gauge");
			} else if (hasRadar) {
				types.push("Radar");
			}
		}

		types.forEach(v => {
			$$[`init${v}`]();
		});

		notEmpty($$.config.data_labels) && $$.initText();
	}

	setChartElements() {
		const $$ = this;
		const {$el} = $$;

		$$.api.$ = {
			chart: $el.chart,
			svg: $el.svg,
			defs: $el.defs,
			main: $el.main,
			tooltip: $el.tooltip,
			legend: $el.legend,
			title: $el.title,
			grid: $el.grid,
			arc: $el.arcs,
			circles: $el.circle,
			bar: {
				bars: $el.bar
			},
			line: {
				lines: $el.line,
				areas: $el.area
			},
			text: {
				texts: $el.text
			}
		};
	}

	/**
	 * Set background element/image
	 * @private
	 */
	setBackground() {
		const $$ = this;
		const {config: {background: bg}, state, $el: {svg}} = $$;

		if (notEmpty(bg)) {
			const element = svg.select("g")
				.insert(bg.imgUrl ? "image" : "rect", ":first-child");

			if (bg.imgUrl) {
				element.attr("href", bg.imgUrl);
			} else if (bg.color) {
				element
					.style("fill", bg.color)
					.attr("clip-path", state.clip.path);
			}

			element
				.attr("class", bg.class || null)
				.attr("width", "100%")
				.attr("height", "100%");
		}
	}

	/**
	 * Update targeted element with given data
	 * @param {Object} targets Data object formatted as 'target'
	 * @private
	 */
	updateTargets(targets) {
		const $$ = this;
		const {hasAxis, hasRadar} = $$.state;

		// Text
		$$.updateTargetsForText(targets);

		// circle
		if ($$.hasPointType() || hasRadar) {
			$$.updateTargetForCircle();
		}

		if (hasAxis) {
			$$.hasType("bar") && $$.updateTargetsForBar(targets); // Bar
			$$.hasTypeOf("Line") && $$.updateTargetsForLine(targets); // Line

			// Sub Chart
			$$.updateTargetsForSubchart &&
				$$.updateTargetsForSubchart(targets);
		} else {
			// Arc & Radar
			$$.hasArcType(targets) && (
				hasRadar ?
					$$.updateTargetsForRadar(targets) :
					$$.updateTargetsForArc(targets)
			);
		}

		// Fade-in each chart
		$$.showTargets();
	}

	/**
	 * Display targeted elements
	 * @private
	 */
	showTargets() {
		const $$ = this;
		const {config, $el: {svg}} = $$;

		svg.selectAll(`.${CLASS.target}`)
			.filter(d => $$.isTargetToShow(d.id))
			.transition()
			.duration(config.transition_duration)
			.style("opacity", "1");
	}

	getWithOption(options) {
		const withOptions = {
			Y: true,
			Subchart: true,
			Transition: true,
			EventRect: true,
			Dimension: true,
			TrimXDomain: true,
			Transform: false,
			UpdateXDomain: false,
			UpdateOrgXDomain: false,
			Legend: false,
			UpdateXAxis: "UpdateXDomain",
			TransitionForExit: "Transition",
			TransitionForAxis: "Transition"
		};

		Object.keys(withOptions).forEach(key => {
			let defVal = withOptions[key];

			if (isString(defVal)) {
				defVal = withOptions[defVal];
			}

			withOptions[key] = getOption(options, `with${key}`, defVal);
		});

		return withOptions;
	}

	// isCategorized() {
	// 	return this.config.axis_x_type.indexOf("category") >= 0 || this.state.hasRadar;
	// }

	// isCustomX() {
	// 	const $$ = this;
	// 	const {config} = $$;

	// 	return !$$.axis.isTimeSeries() && (config.data_x || notEmpty(config.data_xs));
	// }

	// isTimeSeries(id = "x") {
	// 	return this.config[`axis_${id}_type`] === "timeseries";
	// }

	// isTimeSeriesY() {
	// 	return this.isTimeSeries("y");
	// }

	initialOpacity(d) {
		const {withoutFadeIn} = this.state;

		return this.getBaseValue(d) !== null &&
			withoutFadeIn[d.id] ? "1" : "0";
	}

	bindResize() {
		const $$ = this;
		const config = $$.config;
		const resizeFunction = generateResize();
		const list = [];

		list.push(() => callFn(config.onresize, $$, $$.api));

		if (config.resize_auto) {
			list.push(() => $$.api.flush(false, true));
		}

		list.push(() => callFn(config.onresized, $$, $$.api));

		// add resize functions
		list.forEach(v => resizeFunction.add(v));

		// attach resize event
		window.addEventListener("resize", $$.resizeFunction = resizeFunction);
	}

	/**
	 * Call plugin hook
	 * @param {String} phase The lifecycle phase
	 * @private
	 */
	callPluginHook(phase, ...args) {
		this.config.plugins.forEach(v => {
			if (phase === "$beforeInit") {
				v.$$ = this;
				this.api.plugins.push(v);
			}

			v[phase](...args);
		});
	}
}

extend(ChartInternal.prototype, [
	// common
	dataConvert,
	data,
	dataLoad,
	classModule,
	color,
	domain,
	interaction,
	format,
	legend,
	redraw,
	scale,
	size,
	text,
	title,
	tooltip,
	transform,
	type,
	...arcInternal,
	...axisInternal
]);

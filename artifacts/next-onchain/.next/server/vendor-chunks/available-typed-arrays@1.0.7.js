"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/available-typed-arrays@1.0.7";
exports.ids = ["vendor-chunks/available-typed-arrays@1.0.7"];
exports.modules = {

/***/ "(ssr)/../../node_modules/.pnpm/available-typed-arrays@1.0.7/node_modules/available-typed-arrays/index.js":
/*!**********************************************************************************************************!*\
  !*** ../../node_modules/.pnpm/available-typed-arrays@1.0.7/node_modules/available-typed-arrays/index.js ***!
  \**********************************************************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nvar possibleNames = __webpack_require__(/*! possible-typed-array-names */ \"(ssr)/../../node_modules/.pnpm/possible-typed-array-names@1.1.0/node_modules/possible-typed-array-names/index.js\");\n\nvar g = typeof globalThis === 'undefined' ? global : globalThis;\n\n/** @type {import('.')} */\nmodule.exports = function availableTypedArrays() {\n\tvar /** @type {ReturnType<typeof availableTypedArrays>} */ out = [];\n\tfor (var i = 0; i < possibleNames.length; i++) {\n\t\tif (typeof g[possibleNames[i]] === 'function') {\n\t\t\t// @ts-expect-error\n\t\t\tout[out.length] = possibleNames[i];\n\t\t}\n\t}\n\treturn out;\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL2F2YWlsYWJsZS10eXBlZC1hcnJheXNAMS4wLjcvbm9kZV9tb2R1bGVzL2F2YWlsYWJsZS10eXBlZC1hcnJheXMvaW5kZXguanMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWIsb0JBQW9CLG1CQUFPLENBQUMsb0pBQTRCOztBQUV4RDs7QUFFQSxXQUFXLGFBQWE7QUFDeEI7QUFDQSxnQkFBZ0IseUNBQXlDO0FBQ3pELGlCQUFpQiwwQkFBMEI7QUFDM0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzIjpbIi9ob21lL3J1bm5lci93b3Jrc3BhY2Uvbm9kZV9tb2R1bGVzLy5wbnBtL2F2YWlsYWJsZS10eXBlZC1hcnJheXNAMS4wLjcvbm9kZV9tb2R1bGVzL2F2YWlsYWJsZS10eXBlZC1hcnJheXMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcG9zc2libGVOYW1lcyA9IHJlcXVpcmUoJ3Bvc3NpYmxlLXR5cGVkLWFycmF5LW5hbWVzJyk7XG5cbnZhciBnID0gdHlwZW9mIGdsb2JhbFRoaXMgPT09ICd1bmRlZmluZWQnID8gZ2xvYmFsIDogZ2xvYmFsVGhpcztcblxuLyoqIEB0eXBlIHtpbXBvcnQoJy4nKX0gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXZhaWxhYmxlVHlwZWRBcnJheXMoKSB7XG5cdHZhciAvKiogQHR5cGUge1JldHVyblR5cGU8dHlwZW9mIGF2YWlsYWJsZVR5cGVkQXJyYXlzPn0gKi8gb3V0ID0gW107XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgcG9zc2libGVOYW1lcy5sZW5ndGg7IGkrKykge1xuXHRcdGlmICh0eXBlb2YgZ1twb3NzaWJsZU5hbWVzW2ldXSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0b3V0W291dC5sZW5ndGhdID0gcG9zc2libGVOYW1lc1tpXTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn07XG4iXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbMF0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/.pnpm/available-typed-arrays@1.0.7/node_modules/available-typed-arrays/index.js\n");

/***/ })

};
;
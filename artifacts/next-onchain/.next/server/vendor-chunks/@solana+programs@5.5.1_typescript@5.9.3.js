"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/@solana+programs@5.5.1_typescript@5.9.3";
exports.ids = ["vendor-chunks/@solana+programs@5.5.1_typescript@5.9.3"];
exports.modules = {

/***/ "(ssr)/../../node_modules/.pnpm/@solana+programs@5.5.1_typescript@5.9.3/node_modules/@solana/programs/dist/index.node.mjs":
/*!**************************************************************************************************************************!*\
  !*** ../../node_modules/.pnpm/@solana+programs@5.5.1_typescript@5.9.3/node_modules/@solana/programs/dist/index.node.mjs ***!
  \**************************************************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   isProgramError: () => (/* binding */ isProgramError)\n/* harmony export */ });\n/* harmony import */ var _solana_errors__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @solana/errors */ \"(ssr)/../../node_modules/.pnpm/@solana+errors@5.5.1_typescript@5.9.3/node_modules/@solana/errors/dist/index.node.mjs\");\n\n\n// src/program-error.ts\nfunction isProgramError(error, transactionMessage, programAddress, code) {\n  if (!(0,_solana_errors__WEBPACK_IMPORTED_MODULE_0__.isSolanaError)(error, _solana_errors__WEBPACK_IMPORTED_MODULE_0__.SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {\n    return false;\n  }\n  const instructionProgramAddress = transactionMessage.instructions[error.context.index]?.programAddress;\n  if (!instructionProgramAddress || instructionProgramAddress !== programAddress) {\n    return false;\n  }\n  return typeof code === \"undefined\" || error.context.code === code;\n}\n\n\n//# sourceMappingURL=index.node.mjs.map\n//# sourceMappingURL=index.node.mjs.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0Bzb2xhbmErcHJvZ3JhbXNANS41LjFfdHlwZXNjcmlwdEA1LjkuMy9ub2RlX21vZHVsZXMvQHNvbGFuYS9wcm9ncmFtcy9kaXN0L2luZGV4Lm5vZGUubWpzIiwibWFwcGluZ3MiOiI7Ozs7O0FBQXdGOztBQUV4RjtBQUNBO0FBQ0EsT0FBTyw2REFBYSxRQUFRLG1GQUF1QztBQUNuRTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUUwQjtBQUMxQjtBQUNBIiwic291cmNlcyI6WyIvaG9tZS9ydW5uZXIvd29ya3NwYWNlL25vZGVfbW9kdWxlcy8ucG5wbS9Ac29sYW5hK3Byb2dyYW1zQDUuNS4xX3R5cGVzY3JpcHRANS45LjMvbm9kZV9tb2R1bGVzL0Bzb2xhbmEvcHJvZ3JhbXMvZGlzdC9pbmRleC5ub2RlLm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBpc1NvbGFuYUVycm9yLCBTT0xBTkFfRVJST1JfX0lOU1RSVUNUSU9OX0VSUk9SX19DVVNUT00gfSBmcm9tICdAc29sYW5hL2Vycm9ycyc7XG5cbi8vIHNyYy9wcm9ncmFtLWVycm9yLnRzXG5mdW5jdGlvbiBpc1Byb2dyYW1FcnJvcihlcnJvciwgdHJhbnNhY3Rpb25NZXNzYWdlLCBwcm9ncmFtQWRkcmVzcywgY29kZSkge1xuICBpZiAoIWlzU29sYW5hRXJyb3IoZXJyb3IsIFNPTEFOQV9FUlJPUl9fSU5TVFJVQ1RJT05fRVJST1JfX0NVU1RPTSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgaW5zdHJ1Y3Rpb25Qcm9ncmFtQWRkcmVzcyA9IHRyYW5zYWN0aW9uTWVzc2FnZS5pbnN0cnVjdGlvbnNbZXJyb3IuY29udGV4dC5pbmRleF0/LnByb2dyYW1BZGRyZXNzO1xuICBpZiAoIWluc3RydWN0aW9uUHJvZ3JhbUFkZHJlc3MgfHwgaW5zdHJ1Y3Rpb25Qcm9ncmFtQWRkcmVzcyAhPT0gcHJvZ3JhbUFkZHJlc3MpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHR5cGVvZiBjb2RlID09PSBcInVuZGVmaW5lZFwiIHx8IGVycm9yLmNvbnRleHQuY29kZSA9PT0gY29kZTtcbn1cblxuZXhwb3J0IHsgaXNQcm9ncmFtRXJyb3IgfTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWluZGV4Lm5vZGUubWpzLm1hcFxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXgubm9kZS5tanMubWFwIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6WzBdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/.pnpm/@solana+programs@5.5.1_typescript@5.9.3/node_modules/@solana/programs/dist/index.node.mjs\n");

/***/ })

};
;
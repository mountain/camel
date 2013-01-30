/*jslint */
/*global self, console, exports, module, process, require, setTimeout, closing */

var args = process.argv.slice(0),
    target = args.pop();

require('./camel').run(target, []);





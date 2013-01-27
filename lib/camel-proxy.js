/*jslint */
/*global exports, module, process, require */

var args = process.argv.slice(0),
    target = args.pop();

require('./camel').run(target);



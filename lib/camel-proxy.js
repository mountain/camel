/*jslint */
/*global self, console, exports, module, process, require */

var args = self.argv.slice(0),
    target = args.pop();

require('./camel').run(target, []);




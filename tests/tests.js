/*jslint */
/*global console, exports, module, process, require, setTimeout */

var path = require('path');

function test(file, args, result) {
    var target = path.join(process.cwd(), 'tests', file);
    console.log(target);
    return require('../lib/camel').assert(target, args, result);
}

function run(file) {
    var target = path.join(process.cwd(), 'tests', file);
    console.log(target);
    return require('../lib/camel').run(target);
}


test('test-sanity.coffee', [], true);
test('test-hello.coffee', [], 'hello world');

test('test-main-simple.coffee', [], 16);
test('test-main-standard.coffee', [], [1, 4, 9]);
test('test-main-args.coffee', [3, 7, 9], [9, 49, 81]);

run('test-worker-simple.coffee');
run('test-worker-error.coffee');




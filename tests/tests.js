var assert = require('assert'),
    path = require('path');

function test(file, args, result) {
    var target = path.join(process.cwd(), file);
    console.log(target);
    return require('../lib/camel').assert(target, args, result);
}

test('sanity.coffee', [], true);
test('hello.coffee', [], 'hello world');

test('mainSimple.coffee', [], 16);
test('mainStandard.coffee', [], [1, 4, 9]);
test('mainArgs.coffee', [3, 7, 9], [9, 49, 81]);


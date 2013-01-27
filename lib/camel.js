/*jslint */
/*global exports, module, process, require */

var assert    = require('assert'),
    path      = require('path'),
    util      = require('util'),
    net       = require('net'),
    requirejs = require('requirejs');
var WebWorker = require('./webworker');

function isFunction(obj) {
    return Object.prototype.toString.call(obj) === '[object Function]';
}

function runCamel(target, args) {
    if (!target) {
        return;
    }

    module.filename = target;

    //remove ext '.coffee'
    target = target.substring(0, target.length - 7);

    requirejs.config({
        nodeRequire: require,
        isBuild: false,
        paths: {
            cs: path.join(__dirname, 'cs'),
            baseUrl: process.cwd()
        }
    });

    requirejs(['cs!' + target], function (target) {
        if (isFunction(target)) {
            return target.apply(this, args);
        } else {
            if (target) {
                if (target.main && isFunction(target.main)) {
                    return target.main.apply(this, args);
                } else {
                    return target;
                }
            }
        }
    });
}

function assertCamel(target, args, result) {
    if (!target) {
        return;
    }

    module.filename = target;

    //remove ext '.coffee'
    target = target.substring(0, target.length - 7);

    requirejs.config({
        nodeRequire: require,
        isBuild: false,
        paths: {
            cs: path.join(__dirname, 'cs'),
            baseUrl: process.cwd()
        }
    });

    requirejs(['cs!' + target], function (target) {
        if (isFunction(target)) {
            assert.deepEqual(target.apply(this, args), result);
        } else {
            if (target) {
                if (target.main && isFunction(target.main)) {
                    assert.deepEqual(target.main.apply(this, args), result);
                } else {
                    assert.deepEqual(target, result);
                }
            }
        }
    });
}

exports.build = function (target) {
};

var Worker = function (src, opts) {
    opts = opts || {};
    opts.args = opts.args || [];
    opts.args.push(src);
    WebWorker.call(this, path.join(__dirname, 'camel-proxy.js'), opts);
};

util.inherits(Worker, WebWorker);

exports.run = runCamel;
exports.assert = assertCamel;
exports.Worker = Worker;



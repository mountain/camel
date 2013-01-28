/*jslint */
/*global global, exports, module, process, require */

var assert    = require('assert'),
    fs        = require('fs'),
    path      = require('path'),
    util      = require('util'),
    net       = require('net'),
    requirejs = require('requirejs');

var WebWorker = require('./webworker').Worker;

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


var Worker = function (src, opts) {
    opts = opts || {};
    opts.args = opts.args || [];

    src = path.normalize(path.join(process.cwd(), src));
    if (fs.existsSync(src)) {
        opts.args.push(src);
        WebWorker.call(this, path.join(__dirname, 'camel-proxy.js'), opts);
    } else {
        throw "WebWorker could not be found at given path: " + src;
    }

};

util.inherits(Worker, WebWorker);

global.Worker = Worker;

exports.run = runCamel;
exports.assert = assertCamel;
exports.build = function (target) {
};



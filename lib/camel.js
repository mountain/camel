var assert = require('assert'),
    requirejs = require('requirejs');

function isFunction(obj) {
    return Object.prototype.toString.call(obj) === '[object Function]';
}

exports.run = function (target, args) {
    if (!target) return;

    module.filename = target;

    //remove ext '.coffee'
    target = target.substring(0, target.length - 7);

    requirejs.config({
        nodeRequire: require,
        isBuild: false,
        paths: {
            cs: require('path').join(__dirname, 'cs'),
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
};

exports.assert = function (target, args, result) {
    if (!target) return;

    module.filename = target;

    //remove ext '.coffee'
    target = target.substring(0, target.length - 7);

    requirejs.config({
        nodeRequire: require,
        isBuild: false,
        paths: {
            cs: require('path').join(__dirname, 'cs'),
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
};

exports.build = function (target) {
};

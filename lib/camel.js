var requirejs = require('requirejs');

function isFunction(obj) {
    return Object.prototype.toString.call(obj) === '[object Function]';
}

exports.run = function (target) {
    if (!target) return;

    requirejs.config({
        nodeRequire: require,
        isBuild: false,
        paths: {
            cs: '/home/mingli/dev/coffescripts/camel/lib/cs'
        }
    });

    requirejs(['cs!' + target], function (target) {
        if (isFunction(target)) {
            target();
        } else {
            if (target && target.main && isFunction(target.main)) {
                target.main();
            }
        }
    });
};

exports.build = function (target) {
};

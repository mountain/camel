var requirejs = require('requirejs');

function isFunction(obj) {
    return Object.prototype.toString.call(obj) === '[object Function]';
}

exports.run = function (target) {
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

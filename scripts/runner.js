#!/usr/bin/env node

var path = require('path');

var pwd  = process.cwd(),
    file = process.argv[2],
    ext = path.extname(file),
    args = process.argv.slice(3),
    target;

if (file && ext === '.coffee') {
    if (file[0] !== '/') {
        target = path.join(pwd, file);
    } else {
        target = file;
    }

    require('../lib/camel').run(target, args);
}


#!/usr/bin/env node

var path = require('path');

var pwd  = process.cwd(),
    file = process.argv[2],
    base = path.basename(file),
    target = path.join(pwd, base);

require('../lib/camel').run(target);


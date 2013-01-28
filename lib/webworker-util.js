/*global console, exports, module, process, require, setTimeout, clearTimeout, setInterval, clearInterval */

// Utilies and other common gook shared between the WebWorker master and
// its constituent Workers.

var events = require('events');
var path = require('path');
var util = require('util');
var urllib = require('url');

// Some debugging functions
var debugLevel = parseInt(process.env.NODE_DEBUG, 16);
var debug = function() { util.error.apply(this, arguments); };
exports.debug = debug;

// Extract meaning from stack traces
var STACK_FRAME_RE = /.* \(?(.+:\d+:\d+)\)?$/;

// Symbolic names for our messages types
exports.MSGTYPE_NOOP = 0;
exports.MSGTYPE_ERROR = 1;
exports.MSGTYPE_CLOSE = 2;
exports.MSGTYPE_USER = 100;

var WorkerLocation = function(url) {
    var u = urllib.parse(url);

    var portForProto = function(proto) {
        switch (proto) {
        case 'http':
            return 80;

        case 'https':
            return 443;

        case 'file':
            return undefined;

        default:
            util.debug(
                'Unknown protocol \'' + proto + '\'; returning undefined'
            );
            return undefined;
        };
    };

    this.href = u.href;
    this.protocol = u.protocol.substring(0, u.protocol.length - 1);
    this.host = u.host;
    this.hostname = u.hostname;
    this.port = (u.port) ? u.port : portForProto(this.protocol);
    this.pathname = (u.pathname) ? path.normalize(u.pathname) : '/';
    this.search = (u.search) ? u.search : '';
    this.hash = (u.hash) ? u.hash : '';
};

exports.WorkerLocation = WorkerLocation;

// Get the error message for a given exception
//
// The first line of the stack trace seems to always be the message itself.
exports.getErrorMessage = function(e) {
    try {
        return e.message || e.stack.split('\n')[0].trim();
    } catch (e) {
        return 'WebWorkers: failed to get error message';
    }
};

// Get the filename for a given exception
exports.getErrorFilename = function(e) {
    try {
        var m = e.stack.split('\n')[1].match(STACK_FRAME_RE);
        return m[1].substring(
            0,
            m[1].lastIndexOf(':', m[1].lastIndexOf(':') - 1)
        );
    } catch (e) {
        return 'WebWorkers: failed to get error filename';
    }
};

// Get the line number for a given exception
exports.getErrorLine = function(e) {
    try {
        var m = e.stack.split('\n')[1].match(STACK_FRAME_RE);
        var parts = m[1].split(':');
        return parseInt(parts[parts.length - 2]);
    } catch (e) {
        return -1;
    }
};

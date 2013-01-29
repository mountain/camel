/*global define, self, console, exports, global, module, process, require, setTimeout, clearTimeout, setInterval, clearInterval */

// usage: node worker.js <port> <script>

var assert = require('assert'),
    events = require('events'),
    fs     = require('fs'),
    net    = require('net'),
    path   = require('path'),
    vm     = require('vm'),
    util   = require('util'),
    urllib = require('url');

var WebSocketClient = require('websocket').client;

var MSGTYPE_NOOP = 0;
var MSGTYPE_ERROR = 1;
var MSGTYPE_CLOSE = 2;
var MSGTYPE_USER = 100;

function WorkerLocation(url) {
    var u = urllib.parse(url);

    var portForProto = function (proto) {
        switch (proto) {
        case 'http':
            return 80;

        case 'https':
            return 443;

        case 'file':
            return undefined;

        default:
            return undefined;
        }
    };

    this.href = u.href;
    this.protocol = u.protocol.substring(0, u.protocol.length - 1);
    this.host = u.host;
    this.hostname = u.hostname;
    this.port = (u.port) ? u.port : portForProto(this.protocol);
    this.pathname = (u.pathname) ? path.normalize(u.pathname) : '/';
    this.search = (u.search) ? u.search : '';
    this.hash = (u.hash) ? u.hash : '';
}


function getErrorMessage(e) {
    try {
        return e.message || e.stack.split('\n')[0].trim();
    } catch (ex) {
        return 'WebWorkers: failed to get error message';
    }
}

var STACK_FRAME_RE = /.* \(?(.+:\d+:\d+)\)?$/;

function getErrorFilename(e) {
    try {
        var m = e.stack.split('\n')[1].match(STACK_FRAME_RE);
        return m[1].substring(
            0,
            m[1].lastIndexOf(':', m[1].lastIndexOf(':') - 1)
        );
    } catch (ex) {
        return 'WebWorkers: failed to get error filename';
    }
}

function getErrorLine(e) {
    try {
        var m = e.stack.split('\n')[1].match(STACK_FRAME_RE);
        var parts = m[1].split(':');
        return parseInt(parts[parts.length - 2], 10);
    } catch (ex) {
        return -1;
    }
}

var writeError = console.error,
    inErrorHandler = false;

if (process.argv.length < 4) {
    throw new Error('usage: node worker.js <ws-port> <worker-script>');
}
var wsPort = process.argv[2];
var scriptLoc = new WorkerLocation(process.argv[3]);

var ws = new WebSocketClient(), msgQueue = [], conn;

var workerCtx = {
    argv: process.argv,
    require: require,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    location: scriptLoc,
    closing: false,
    close: function () {
        process.exit(0);
    },
    postMessage: function (msg) {
        if (conn) {
            conn.send(JSON.stringify([MSGTYPE_USER, msg]));
        }
    }
};

workerCtx.self = workerCtx;
global.self = workerCtx;

var source = fs.readFileSync(scriptLoc.pathname);
vm.runInNewContext(source, workerCtx, scriptLoc.pathname);

var delay = 0;
function clearQueue() {
    setTimeout(function () {
        if (msgQueue.length > 0) {
            if (self.onmessage) {
                console.log('[' + process.pid + ']', 'fire', util.inspect(msgQueue[0]));
                self.onmessage(msgQueue.shift());
                delay = 0;
            } else {
                delay++;
                if (delay > 50) {
                    throw new Error('could not find onmessage handler after delaying ~5 secs');
                }
            }
            setTimeout(clearQueue, 100);
        }
    }, 100);
}

ws.on('connect', function (connection) {

    conn = connection;

    connection.on('message', function (msg) {
        msg = JSON.parse(msg.utf8Data);
        console.log('[' + process.pid + ']', 'receive', msg[0], util.inspect(msg[1]));
        switch (parseInt(msg[0].toString(), 10)) {
        case MSGTYPE_NOOP:
            break;

        case MSGTYPE_CLOSE:
            workerCtx.closing = true;
            connection.close();
            if (workerCtx.onclose) {
                workerCtx.onclose();
            }
            break;

        case MSGTYPE_USER:
            if (self.onmessage) {
                console.log('[' + process.pid + ']', 'fire', util.inspect({data: msg[1]}));
                self.onmessage({data: msg[1]});
            } else {
                msgQueue.push({data: msg[1]});
                console.log('[' + process.pid + ']', 'queue', util.inspect({data: msg[1]}));
                clearQueue();
            }
            break;
        }

    });

    process.on('uncaughtException', function (e) {
        if (!inErrorHandler && workerCtx && workerCtx.onerror) {
            inErrorHandler = true;
            workerCtx.onerror(e);
            inErrorHandler = false;
        } else {
            connection.send(JSON.stringify([MSGTYPE_ERROR, {
                'message' : getErrorMessage(e),
                'filename' : getErrorFilename(e),
                'lineno' : getErrorLine(e)
            }]));
        }
    });
});

ws.connect('ws://127.0.0.1:' + wsPort, 'webwroker');


/*global console, exports, module, process, require, setTimeout, clearTimeout, setInterval, clearInterval */

// Launcher script for WebWorkers.
//
// Sets up context and runs a worker script. This is not intended to be
// invoked directly. Rather, it is invoked automatically when constructing a
// new Worker() object.
//
//      usage: node worker.js <sock> <script>
//
//      The <sock> parameter is the fileutiltem path to a UNIX domain socket
//      that is listening for connections. The <script> parameter is the
//      path to the JavaScript source to be executed as the body of the
//      worker.

var assert = require('assert'),
    events = require('events'),
    fs     = require('fs'),
    net    = require('net'),
    path   = require('path'),
    vm     = require('vm'),
    util   = require('util');

var WebSocketClient = require('websocket').client;

var wwutil = require('./webworker-util');

var writeError = console.error,
    inErrorHandler = false;

if (process.argv.length < 4) {
    throw new Error('usage: node worker.js <ws-port> <worker-script>');
}
var wsPort = process.argv[2];
var scriptLoc = new wwutil.WorkerLocation(process.argv[3]);

var ws = new WebSocketClient(), msgQueue = [], conn;

var scriptObj;
if (scriptLoc.protocol === 'file') {
    scriptObj = vm.createScript(fs.readFileSync(scriptLoc.pathname), scriptLoc.href);
} else {
    writeError('Cannot load script from unknown protocol ' + scriptLoc.protocol);
    process.exit(1);
}

var workerCtx = {
    global: workerCtx,
    self: workerCtx,
    process: process,
    require: require,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    location: scriptLoc,
    __filename: scriptLoc.pathname,
    __dirname: path.dirname(scriptLoc.pathname),
    closing: false,
    close: function () {
        process.exit(0);
    },
    postMessage: function (msg) {
        if (conn) {
            conn.send(JSON.stringify([wwutil.MSGTYPE_USER, msg]));
        }
    },
    onmessage: null,
    onclose: null
};

ws.on('connect', function (connection) {

    conn = connection;

    connection.on('message', function (msg) {
        msg = JSON.parse(msg['utf8Data']);
        console.log('[' + process.pid + ']', 'receive', msg[0], util.inspect(msg[1]));
        switch (msg[0]) {
            case wwutil.MSGTYPE_NOOP:
                break;

            case wwutil.MSGTYPE_CLOSE:
                workerCtx.closing = true;
                connection.close();
                if (workerCtx.onclose) {
                    workerCtx.onclose();
                }
                break;

            case wwutil.MSGTYPE_USER:
                if (workerCtx.onmessage) {
                    workerCtx.onmessage({data: msg[1]});
                } else {
                    msgQueue.push({data: msg[1]});
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
            connection.send(JSON.stringify([wwutil.MSGTYPE_ERROR, {
                'message' : wwutil.getErrorMessage(e),
                'filename' : wwutil.getErrorFilename(e),
                'lineno' : wwutil.getErrorLine(e)
            }]));
        }
    });

    scriptObj.runInNewContext(workerCtx);

    console.log(workerCtx.onmessage.toString())

    for(idx in msgQueue) {
        workerCtx.onmessage(msgQueue[idx]);
    }
    msgQueue = [];
});

ws.connect('ws://localhost:' + wsPort, 'webwroker');


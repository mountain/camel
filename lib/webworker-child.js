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

// Connect to the parent process
var ws = new WebSocketClient();

// Construt the Script object to host the worker's code
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
    postMessage: function (msg, port) {
        ms.send([wwutil.MSGTYPE_USER, msg], port);
    }
};

ws.on('connect', function (connection) {
    var ms = new wwutil.MsgStream(connection);

    ms.on('msg', function (msg, port) {
        if (!wwutil.isValidMessage(msg)) {
            wwutil.debug('Received invalid message: ' + util.inspect(msg));
        } else {
            switch (msg[0]) {
            case wwutil.MSGTYPE_NOOP:
                break;

            case wwutil.MSGTYPE_CLOSE:
                // Conform to the Web Workers API for termination
                workerCtx.closing = true;

                // Close down the event sources that we know about
                connection.close();

                // Request that the worker perform any application-level shutdown
                if (workerCtx.onclose) {
                    workerCtx.onclose();
                }

                break;

            case wwutil.MSGTYPE_USER:
                // XXX: I have no idea what the event object here should really look
                //      like. I do know that it needs a 'data' elements, though.
                if (workerCtx.onmessage) {
                    var e = {
                        data: msg[1]
                    };

                    if (port) {
                        e.port = port;
                    }

                    workerCtx.onmessage(e);
                }

                break;

            default:
                wwutil.debug('Received unexpected message: ' + util.inspect(msg));
                break;
            }
        }
    });

    // Register for uncaught events for delivery to workerCtx.onerror
    process.on('uncaughtException', function (e) {
        if (!inErrorHandler && workerCtx && workerCtx.onerror) {
            inErrorHandler = true;
            workerCtx.onerror(e);
            inErrorHandler = false;
        } else {
            // Don't bother setting inErrorHandler here, as we're already delivering
            // the event to the master anyway
            ms.send([wwutil.MSGTYPE_ERROR, {
                'message' : wwutil.getErrorMessage(e),
                'filename' : wwutil.getErrorFilename(e),
                'lineno' : wwutil.getErrorLine(e)
            }]);
        }
    });

    // Execute the worker
    scriptObj.runInNewContext(workerCtx);
});

ws.connect('ws://localhost:' + wsPort, 'webworker');



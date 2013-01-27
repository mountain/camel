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

var assert = require('assert');
var fs = require('fs');
var net = require('net');
var path = require('path');
var script = require('vm');
var util = require('util');
var wwutil = require('./webworker-util');
var WebSocketClient = require('./websocket').WebSocket;

var writeError = console.error;

if (process.argv.length < 4) {
    throw new Error('usage: node worker.js <ws-addr> <worker-script>');
}

var inErrorHandler = false;

var sockPath = process.argv[2];
var scriptLoc = new wwutil.WorkerLocation(process.argv[3]);

// Connect to the parent process
var ws = new WebSocketClient(sockPath);
var ms = new wwutil.MsgStream(ws);

var workerCtx;

// Construt the Script object to host the worker's code
var scriptObj;
if (scriptLoc.protocol === 'file') {
    scriptObj = new script.Script(fs.readFileSync(scriptLoc.pathname), scriptLoc.href);
} else {
    writeError('Cannot load script from unknown protocol \'' + scriptLoc.protocol);
    process.exit(1);
}

function exceptionHandler(e) {
    if (!inErrorHandler && workerCtx && workerCtx.onerror) {
        inErrorHandler = true;
        workerCtx.onerror(e);
        inErrorHandler = false;

        return;
    }

    // Don't bother setting inErrorHandler here, as we're already delivering
    // the event to the master anyway
    ms.send([wwutil.MSGTYPE_ERROR, {
        'message' : wwutil.getErrorMessage(e),
        'filename' : wwutil.getErrorFilename(e),
        'lineno' : wwutil.getErrorLine(e)
    }]);
}

// Message handling function for messages from the master
function handleMessage(msg, fd) {
    if (!wwutil.isValidMessage(msg)) {
        wwutil.debug('Received invalid message: ' + util.inspect(msg));
        return;
    }

    switch (msg[0]) {
    case wwutil.MSGTYPE_NOOP:
        break;

    case wwutil.MSGTYPE_CLOSE:
        // Conform to the Web Workers API for termination
        workerCtx.closing = true;

        // Close down the event sources that we know about
        ws.close();

        // Request that the worker perform any application-level shutdown
        if (workerCtx.onclose) {
            workerCtx.onclose();
        }

        break;

    case wwutil.MSGTYPE_USER:
        // XXX: I have no idea what the event object here should really look
        //      like. I do know that it needs a 'data' elements, though.
        if (workerCtx.onmessage) {
            var e = { data : msg[1] };

            if (fd) {
                e.fd = fd;
            }

            workerCtx.onmessage(e);
        }

        break;

    default:
        wwutil.debug('Received unexpected message: ' + util.inspect(msg));
        break;
    }
}

workerCtx = {
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
    postMessage: function (msg, fd) {
        ms.send([wwutil.MSGTYPE_USER, msg], fd);
    }
};

// Once we connect successfully, set up the rest of the world
ws.addListener('open', function () {
    // When we receive a message from the master, react and possibly
    // dispatch it to the worker context
    ms.addListener('msg', handleMessage);

    // Register for uncaught events for delivery to workerCtx.onerror
    process.addListener('uncaughtException', exceptionHandler);

    // Execute the worker
    scriptObj.runInNewContext(workerCtx);
});




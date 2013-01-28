/*global console, exports, module, process, require, setTimeout, clearTimeout, setInterval, clearInterval */

// o Message Types
//
//      MSGTYPE_NOOP        No-op. The payload of this message is discarded.
//
//      MSGTYPE_ERROR       An error has occurred. Used for bubbling up
//                          error events from the child process.
//
//      MSGTYPE_CLOSE       Graceful shut-down. Used to request that the
//                          child terminate gracefully.
//
//      MSGTYPE_USER        A user-specified message. All messages sent
//                          via the WebWorker API generate this type of
//                          message.

var assert = require('assert');
var child_process = require('child_process');
var events = require('events');
var fs = require('fs');
var net = require('net');
var http = require('http');
var path = require('path');
var util = require('util');

var WebSocketServer = require('websocket').server;

var wwutil = require('./webworker-util');

// The number of workers created so far
var numWorkersCreated = 0;

// A Web Worker
function Worker(src, opts) {
    opts = opts || {};

    var self = this;
    events.EventEmitter.call(self);

    var killTimeoutID;
    var pid, child, conn;
    var port = 13000 + (numWorkersCreated++);

    var msgQueue = [];

    function postMessage(msgType, msgObj) {
        if (conn) {
            conn.send(JSON.stringify([msgType, msgObj]));
        } else {
            msgQueue.push([msgType, msgObj]);
        }
    }

    // Post a message to the worker
    self.postMessage = function (msg) {
        postMessage(wwutil.MSGTYPE_USER, msg);
    };

    // Terminate the worker
    //
    // Takes a timeout value for forcibly killing off the worker if it does
    // not shut down gracefully on its own. By default, this timeout is
    // 5 seconds. A value of 0 indicates infinite timeout.
    self.terminate = function (timeout) {
        assert.notEqual(pid, undefined);
        assert.ok(child.pid === pid || !child.pid);

        timeout = (timeout === undefined) ?  5000 : timeout;

        // The child process is already shut down; no-op
        if (!child.pid) {
            return;
        }

        // The termination process has already been initiated for this
        // process
        if (killTimeoutID) {
            return;
        }

        // Request graceful shutdown of the child process
        postMessage(wwutil.MSGTYPE_CLOSE);

        // Optionally set a timer to kill off the child process forcefully if
        // it has not shut down by itself.
        if (timeout > 0) {
            killTimeoutID = setTimeout(function () {
                // Clear our ID since we're now running
                killTimeoutID = undefined;

                if (!child.pid) {
                    return;
                }

                console.log('[' + process.pid + ']', 'kill', pid);

                child.kill('SIGTERM');
            }, timeout);
        }
    };

    // Server instance for our communication socket with the child process
    // Doesn't begin listening until start() is called.
    var httpServer = http.createServer();
    httpServer.listen(port);

    var wsServer = new WebSocketServer({
        httpServer: httpServer,
        autoAcceptConnections: false
    });

    httpServer.on('listening', function () {
        var execPath = opts.path || process.execPath || process.argv[0];

        var args = [
            path.join(__dirname, 'webworker-child.js'),
            port,
            'file://' + src
        ];
        if (opts.args) {
            if (Array.isArray(opts.args)) {
                for (var ii = opts.args.length; ii >= 0; ii--) {
                    args.push(opts.args[ii]);
                }
            } else {
                args.push(opts.args.toString());
            }
        }

        child = child_process.spawn(execPath, args, {cwd: process.cwd()});

        // Save off the PID of the child process, as this value gets
        // undefined once the process exits.
        pid = child.pid;

        console.log('[' + process.pid + ']', 'spawn', pid, args[args.length - 1]);

        child.stdout.on('data', function (d) {
            process.stdout.write(d);
        });
        child.stderr.on('data', function (d) {
            process.stderr.write(d);
        });
        child.on('exit', function (code, signal) {
            console.log('[' + pid + ']', 'exiting');

            // If we have an outstanding timeout for killing off this process,
            // abort it.
            if (killTimeoutID) {
                clearTimeout(killTimeoutID);
            }

            if (conn) {
                conn.close();
            } else {
                console.log('[' + pid + ']', 'exit', 'no_handshaking');
            }

            httpServer.close();

            if (self.onexit) {
                process.nextTick(function () {
                    self.onexit(code, signal);
                });
            }
        });
    });

    wsServer.on('request', function (request) {
        var connection = request.accept('webwroker', request.origin);

        conn = connection;
        for(idx in msgQueue) {
            var msg = msgQueue.pop();
            postMessage(msg[0], msg[1]);
        }

        connection.on('message', function (msg) {
            msg = JSON.parse(msg['utf8Data']);
            console.log('[' + process.pid + ']', 'receive', msg[0], util.inspect(msg[1]));

            switch (msg[0]) {
                case wwutil.MSGTYPE_NOOP:
                    break;

                case wwutil.MSGTYPE_ERROR:
                    if (self.onerror) {
                        self.onerror(msg[1]);
                    }
                    break;

                case wwutil.MSGTYPE_USER:
                    if (self.onmessage) {
                        self.onmessage({data : msg[1]});
                    }
                    break;
            }
        });
    });
}

util.inherits(Worker, events.EventEmitter);

exports.Worker = Worker;


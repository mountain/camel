/*global console, exports, module, process, require, setTimeout, clearTimeout, setInterval, clearInterval */

// WebWorkers implementation.
//
// The master and workers communite over a UNIX domain socket at
//
//      /tmp/node-webworker-<master PID>.sock
//
// This socket is used as a full-duplex channel for exchanging messages.
// Messages are objects encoded using the MessagePack format. Each message
// being exchanged is wrapped in an array envelope, the first element of
// which indicates the type of message being sent. For example take the
// following message (expresed in JSON)
//
//      [999, {'foo' : 'bar'}]
//
// This represents a message of type 999 with an object payload.
//
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

    // The timeout ID for killing off this worker if it is unresponsive to a
    // graceful shutdown request
    var killTimeoutID = undefined;

    // Process ID of child process running this worker
    // This value persists even once the child process itself has
    // terminated; it is used as a key into datastructures managed by the
    // Master object.
    var pid = undefined;

    // Child process object
    // This value is 'undefined' until the child process itself is spawned
    // and defined forever after.
    var child = undefined;

    // The stream associated with this worker and wwutil.MsgStream that
    // wraps it.
    var stream = undefined;
    var msgStream = undefined;

    // Outbound message queue
    // This queue is only written to when we don't yet have a stream to
    // talk to the worker. It contains [type, data, port] tuples.
    var msgQueue = [];

    // The path to our socket
    var socketPort = 13000 + (numWorkersCreated++);

    // Do the heavy lifting of posting a message
    function postMessage(msgType, msg, port) {
        assert.ok(msgQueue.length === 0 || !msgStream);

        var m = [msgType, msg];

        if (msgStream) {
            msgStream.send(m, port);
        } else {
            m.push(port);
            msgQueue.push(m);
        }
    }

    // Post a message to the worker
    self.postMessage = function (msg, port) {
        postMessage(wwutil.MSGTYPE_USER, msg, port);
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

                wwutil.debug('Forcibily terminating worker process ' + pid + ' with SIGTERM');

                child.kill('SIGTERM');
            }, timeout);
        }
    };

    // Server instance for our communication socket with the child process
    // Doesn't begin listening until start() is called.
    var httpServer = http.createServer();
    httpServer.listen(socketPort);

    var wsServer = new WebSocketServer({
        httpServer: httpServer,
        autoAcceptConnections: false
    });

    httpServer.on('listening', function () {
        var execPath = opts.path || process.execPath || process.argv[0];

        var args = [
            path.join(__dirname, 'webworker-child.js'),
            socketPort,
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

        wwutil.debug('Spawned process ' + pid + ' for worker \'' + src + '\': ' + execPath + ' ' + args.join(' '));

        child.stdout.on('data', function (d) {
            process.stdout.write(d);
        });
        child.stderr.on('data', function (d) {
            process.stderr.write(d);
        });
        child.on('exit', function (code, signal) {
            wwutil.debug('Process ' + pid + ' for worker ' + src + ' exited with status ' + code + ', signal ' + signal);

            // If we have an outstanding timeout for killing off this process,
            // abort it.
            if (killTimeoutID) {
                clearTimeout(killTimeoutID);
            }

            if (stream) {
                stream.close();
            } else {
                wwutil.debug('Process ' + pid + ' exited without completing handshaking');
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
        var connection = request.accept('webworker', request.origin);

        assert.equal(stream, undefined);
        assert.equal(msgStream, undefined);

        stream = connection;
        msgStream = new wwutil.MsgStream(connection);

        // Process any messages waiting to be sent
        msgQueue.forEach(function (m) {
            var port = m.pop();
            msgStream.send(m, port);
        });

        msgQueue = [];

        // Process incoming messages with handleMessage()
        msgStream.on('msg', function (msg, port) {
            if (!wwutil.isValidMessage(msg)) {
                wwutil.debug('Received invalid message: ' + util.inspect(msg));
                return;
            }

            wwutil.debug(
                'Received message type=' + msg[0] + ', data=' + util.inspect(msg[1])
            );

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
                    var e = { data : msg[1] };

                    if (port) {
                        e.port = port;
                    }

                    self.onmessage(e);
                }
                break;

            default:
                wwutil.debug(
                    'Received unexpected message: ' + util.inspect(msg)
                );
                break;
            }
        });
    });
}

exports.Worker = Worker;


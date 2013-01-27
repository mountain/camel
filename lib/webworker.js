/*jslint */
/*global exports, module, process, require, clearTimeout, setTimeout */

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
var path = require('path');
var util = require('util');
var wwutil = require('./webworker-util');
var WebSocketServer = require('./ws').Server;

// Directory for our UNIX domain sockets
var SOCK_DIR_PATH = '/tmp/node-webworker-' + process.pid;

// The number of workers created so far
var numWorkersCreated = 0;

// A Web Worker
//
// Each worker communicates with the master over a UNIX domain socket rooted
// in SOCK_DIR_PATH.
var Worker = function (src, opts) {
    var self = this;

    opts = opts || {};

    // The timeout ID for killing off this worker if it is unresponsive to a
    // graceful shutdown request
    var killTimeoutID = undefined;

    // Process ID of child process running this worker
    //
    // This value persists even once the child process itself has
    // terminated; it is used as a key into datastructures managed by the
    // Master object.
    var pid = undefined;

    // Child process object
    //
    // This value is 'undefined' until the child process itself is spawned
    // and defined forever after.
    var cp = undefined;

    // The stream associated with this worker and wwutil.MsgStream that
    // wraps it.
    var stream = undefined;
    var msgStream = undefined;

    // Outbound message queue
    //
    // This queue is only written to when we don't yet have a stream to
    // talk to the worker. It contains [type, data, fd] tuples.
    var msgQueue = [];

    // The path to our socket
    var sockPath = path.join(SOCK_DIR_PATH, '' + numWorkersCreated++);


    // The primary message handling function for the worker.
    //
    // This is only invoked after handshaking has occurred.
    var handleMessage = function (msg, fd) {
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

                if (fd) {
                    e.fd = fd;
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
    };

    // Server instance for our communication socket with the child process
    //
    // Doesn't begin listening until start() is called.
    var wsSrv = new WebSocketServer();
    wsSrv.addListener('connection', function (s) {
        assert.equal(stream, undefined);
        assert.equal(msgStream, undefined);

        stream = s._req.socket;
        msgStream = new wwutil.MsgStream(s);

        // Process any messages waiting to be sent
        msgQueue.forEach(function (m) {
            var fd = m.pop();
            msgStream.send(m, fd);
        });

        msgQueue = [];

        // Process incoming messages with handleMessage()
        msgStream.addListener('msg', handleMessage);
    });

    // Begin worker execution
    //
    // First fires up the UNIX socket server, then spawns the child process
    // and away we go.
    var start = function () {
        wsSrv.addListener('listening', function () {
            var execPath = opts.path || process.execPath || process.argv[0];

            var args = [
                path.join(__dirname, 'webworker-child.js'),
                sockPath,
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

            cp = child_process.spawn(
                execPath,
                args,
                undefined,
                [0, 1, 2]
            );

            // Save off the PID of the child process, as this value gets
            // undefined once the process exits.
            pid = cp.pid;

            wwutil.debug(
                'Spawned process ' + pid + ' for worker \'' + src + '\': ' +
                execPath + ' ' + args.join(' ')
            );

            cp.addListener('exit', function (code, signal) {
                wwutil.debug(
                    'Process ' + pid + ' for worker \'' + src +
                        '\' exited with status ' + code + ', signal ' + signal);

                // If we have an outstanding timeout for killing off this process,
                // abort it.
                if (killTimeoutID) {
                    clearTimeout(killTimeoutID);
                }

                if (stream) {
                    stream.destroy();
                } else {
                    wwutil.debug('Process ' + pid + ' exited without completing handshaking');
                }

                wsSrv.close();

                if (self.onexit) {
                    process.nextTick(function () {
                        self.onexit(code, signal);
                    });
                }
            });
        });

        wsSrv.listen(sockPath);
    };

    // Do the heavy lifting of posting a message
    var postMessageImpl = function (msgType, msg, fd) {
        assert.ok(msgQueue.length === 0 || !msgStream);

        var m = [msgType, msg];

        if (msgStream) {
            msgStream.send(m, fd);
        } else {
            m.push(fd);
            msgQueue.push(m);
        }
    };

    // Post a message to the worker
    self.postMessage = function (msg, fd) {
        postMessageImpl(wwutil.MSGTYPE_USER, msg, fd);
    };

    // Terminate the worker
    //
    // Takes a timeout value for forcibly killing off the worker if it does
    // not shut down gracefully on its own. By default, this timeout is
    // 5 seconds. A value of 0 indicates infinite timeout.
    self.terminate = function (timeout) {
        assert.notEqual(pid, undefined);
        assert.ok(cp.pid === pid || !cp.pid);

        timeout = (timeout === undefined) ?  5000 : timeout;

        // The child process is already shut down; no-op
        if (!cp.pid) {
            return;
        }

        // The termination process has already been initiated for this
        // process
        if (killTimeoutID) {
            return;
        }

        // Request graceful shutdown of the child process
        postMessageImpl(wwutil.MSGTYPE_CLOSE);

        // Optionally set a timer to kill off the child process forcefully if
        // it has not shut down by itself.
        if (timeout > 0) {
            killTimeoutID = setTimeout(function () {
                // Clear our ID since we're now running
                killTimeoutID = undefined;

                if (!cp.pid) {
                    return;
                }

                wwutil.debug('Forcibily terminating worker process ' + pid + ' with SIGTERM');

                cp.kill('SIGTERM');
            }, timeout);
        }
    };

    start();
};
module.exports = Worker;

// Perform any one-time initialization
fs.mkdirSync(SOCK_DIR_PATH, 0700);
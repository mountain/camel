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

// Is the given message well-formed?
var isValidMessage = function(msg) {
    return (Array.isArray(msg) && msg.length == 2);
}
exports.isValidMessage = isValidMessage;

// A simple messaging stream.
//
// This class is constructed around an existing stream net.Stream. This class
// emits 'msg' events when a message is received. Each emitted 'msg' event
// may come with a second 'port' parameter if the message was sent with  file
// descriptor. A sent file descriptor is guaranteed to be received with the
// message with which it was sent.
//
// Sending messages is done with the send() method.
var MsgStream = function(s) {
    var self = this;

    events.EventEmitter.call(self);

    // Sequence numbers for outgoing and incoming PORTs
    var ports_seqno_sent = 0;
    var ports_seqno_recvd = 0;

    // Collections of messages waiting for PORTs and vice-versa. These
    // are keyed by PORT seqno.
    var msg_waiting_for_port = {};
    var port_waiting_for_msg = {};

    // Get the JS object representing message 'v' with port 'port'.
    var getMsgObj = function(v, port) {
        return [(port != undefined) ? ++ports_seqno_sent : 0, v];
    };

    self.send = function (v, port) {
        var ms = getMsgObj(v, port);
        debug('Process ' + process.pid + ' sending message: ' + util.inspect(ms));

        s.send(JSON.stringify(ms), port)
    };

    s.on('message', function (ms) {
        debug('Process ' + process.pid + ' received message: ' +  util.inspect(ms));

        var mo = JSON.parse(ms['utf8Data']);

        // Ignore invalid messages; this is probably worth an error, though
        if (!isValidMessage(mo)) {
            return;
        }

        var port = undefined;

        var port_seq = mo[0];
        var msg = mo[1];

        // If our message has an associated file descriptor that we
        // have not yet received, queue it for later delivery.
        if (port_seq) {
            if (!(port = port_waiting_for_msg[port_seq])) {
                msg_waiting_for_port[port_seq] = msg;
                return;
            }

            delete port_waiting_for_msg[port_seq];
        }

        // We're complete; emit
        self.emit('msg', msg, port);
    });

    s.on('port', function(port) {
        // Look for a message that's waiting for our arrival. If we don't
        // have one, enqueu the received PORT for later delivery.
        var msg = msg_waiting_for_port[++ports_seqno_recvd];
        if (!msg) {
            port_waiting_for_msg[ports_seqno_recvd] = port;
            return;
        }

        // There was a message waiting for us; emit
        delete msg_waiting_for_port[ports_seqno_recvd];
        self.emit('msg', msg, port);
    });
};

util.inherits(MsgStream, events.EventEmitter);
exports.MsgStream = MsgStream;

// Implement the WorkerLocation interface described in
// http://www.whatwg.org/specs/web-workers/current-work/#dom-workerlocation-href
//
// XXX: None of these properties are readonly as required by the spec.
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

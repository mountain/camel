###
  test-simple.coffee

  rewrite of the tests from https://github.com/pgriess/node-webworker into
  coffeescripts and amd style
###
define [
  'assert'
  'path'
  '../lib/camel'
], (assert, path, camel) ->

    receivedMsg  = false
    receivedExit = false
    receivedErr  = false

    w = new Worker(path.join("tests", "workers", "simple.coffee"))

    w.onmessage = (e) ->
      assert.ok "data" of e
      assert.equal e.data.bar, "foo"
      assert.equal e.data.bunkle, "baz"
      receivedMsg = true
      w.terminate()

    w.onerror = (e) ->
      receivedErr = true
      w.terminate()

    w.onexit = (c, s) ->
      assert.equal c, 0
      assert.equal s, null
      receivedExit = true

    w.postMessage
      foo: "bar"
      baz: "bunkle"

    process.addListener "exit", ->
      assert.equal receivedErr, false
      assert.equal receivedMsg, true
      assert.equal receivedExit, true


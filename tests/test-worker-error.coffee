###
  test-error.coffee

  rewrite of the tests from https://github.com/pgriess/node-webworker into
  coffeescripts and amd style
###
define [
  'assert'
  'path'
  '../lib/camel'
], (assert, path, camel) ->

    w = new camel.Worker(path.join("tests", "workers", "error.coffee"))
    receivedError = false
    w.onerror = (e) ->
      assert.equal "AssertionError: false == true", e.message
      assert.equal e.filename.substring(e.filename.lastIndexOf("/") + 1), "error.coffee"
      assert.equal 14, e.lineno
      receivedError = true
      w.terminate()

    process.addListener "exit", (e) ->
      assert.equal receivedError, true


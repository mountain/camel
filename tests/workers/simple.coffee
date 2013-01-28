###
  test-simple.coffee

  rewrite of the tests from https://github.com/pgriess/node-webworker into
  coffeescripts and amd style
###
define [
  'assert'
], (assert) ->

    global.onmessage = (e) ->
      console.log "----------------------"
      console.log "worker"
      assert.ok "data" of e
      assert.ok "foo" of e.data
      assert.equal e.data.foo, "bar"
      msg = {}
      for k of e.data
        msg[e.data[k]] = k
      postMessage msg

    global.onclose = ->
      process.exit 0


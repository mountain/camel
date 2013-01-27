###
  test-simple.coffee

  rewrite of the tests from https://github.com/pgriess/node-webworker into
  coffeescripts and amd style
###
define [
  'assert'
], (assert) ->

    onmessage = (e) ->
      assert.ok "data" of e
      assert.ok "foo" of e.data
      assert.equal e.data.foo, "bar"
      msg = {}
      for k of e.data
        msg[e.data[k]] = k
      postMessage msg

    onclose = ->
      #process.exit 0

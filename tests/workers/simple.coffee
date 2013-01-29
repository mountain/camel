###
  test-simple.coffee

  rewrite of the tests from https://github.com/pgriess/node-webworker into
  coffeescripts and amd style
###
define [
  'assert'
], (assert) ->

    self.onmessage = (e) ->
      assert.ok "data" of e
      assert.ok "foo" of e.data
      assert.equal e.data.foo, "bar"
      msg = {}
      for k of e.data
        msg[e.data[k]] = k
      self.postMessage msg

    self.onclose = ->
        process.exit 0

    console.log("")


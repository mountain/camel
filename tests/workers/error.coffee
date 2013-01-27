###
  error.coffee

  rewrite of the tests from https://github.com/pgriess/node-webworker into
  coffeescripts and amd style
###
define [
  'assert'
], (assert) ->

    setTimeout (->
      assert.ok false
    ), 5000


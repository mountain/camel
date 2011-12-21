define [
  'exports'
  'underscore'
  'cs!./module'
], (t, _, m) ->

    t.main = ->
       _.map([1, 2, 3], ((x) -> m.sqr(x)))

    t



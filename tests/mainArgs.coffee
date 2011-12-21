define [
  'exports'
  'underscore'
  'cs!./module'
], (t, _, m) ->

    t.main = (args...)->
       _.map(args, ((x) -> m.sqr(x)))

    t



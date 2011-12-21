define [
  'exports'
  'cs!./module'
], (t, m) ->

    t.main = ->
       m.sqr(4)

    t



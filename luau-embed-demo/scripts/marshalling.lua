--[[
  scripts/marshalling.lua

  This file is read from disk by main(), compiled at runtime and executed with
  a protected call (lua_pcall). It exists to prove the "load from a file" path
  in addition to the "load from a string" path.

  Everything here is written in plain Lua 5.1 syntax so the exact same file
  runs on Luau and on stock Lua 5.1.
]]

local tag = "lua-file"

-- Build an array the C side will read back with lua_objlen + lua_rawgeti.
local squares = {}
for i = 1, 6 do
  squares[i] = i * i
end

-- 1) A table goes into C++, four numbers come back out.
local count, sum, mean, best = cpp_stats(squares)
print("    [" .. tag .. "] cpp_stats(squares)      -> count=" .. count ..
      " sum=" .. sum .. " mean=" .. mean .. " best=" .. best)

-- 2) The C side walks the same table with lua_next and reports each pair.
print("    [" .. tag .. "] cpp_dumpTable(squares)  -> " .. cpp_dumpTable(squares))

-- 3) A nested table: values of every Lua type reach the C function.
local mixed = {
  name = "marshalling",
  ok = true,
  depth = 3,
  limits = { min = 1, max = 99 },
}
print("    [" .. tag .. "] cpp_dumpTable(mixed)    -> " .. cpp_dumpTable(mixed))

-- 4) A Lua closure is handed to C++, which calls it back with lua_pcall.
local double = function(value)
  return value * 2
end
print("    [" .. tag .. "] cpp_apply(double, 21)   -> " .. cpp_apply(double, 21))

-- 5) Return several values of different types: main() reads all of them and
--    prints each stack slot, which shows how lua_pcall with LUA_MULTRET works.
return "file chunk finished", #squares, true, mixed.limits

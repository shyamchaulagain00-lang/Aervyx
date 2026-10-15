-- Aervyx Studio Test server handler.
-- Receives only versioned, allowlisted data passed by StudioTestService.
-- Never loads or evaluates source code from Aervyx.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StudioTestService = game:GetService("StudioTestService")

local testFolder = ReplicatedStorage:WaitForChild("AervyxTest")
local readyEvent = testFolder:WaitForChild("Ready")
local outputEvent = testFolder:WaitForChild("Output")
local acknowledgeEvent = testFolder:WaitForChild("Acknowledge")

local function ensureFolder(parent, name)
	local folder = parent:FindFirstChild(name)
	if folder and folder:IsA("Folder") then return folder end
	if folder then folder:Destroy() end
	folder = Instance.new("Folder")
	folder.Name = name
	folder.Parent = parent
	return folder
end

local testObjects = ensureFolder(workspace, "AervyxTestObjects")
local testPart = testObjects:FindFirstChild("AervyxTestPart")
if not testPart or not testPart:IsA("Part") then
	if testPart then testPart:Destroy() end
	testPart = Instance.new("Part")
	testPart.Name = "AervyxTestPart"
	testPart.Size = Vector3.new(4, 1, 4)
	testPart.Position = Vector3.new(0, 5, 0)
	testPart.Anchored = true
	testPart.Color = Color3.fromRGB(80, 150, 255)
	testPart.Parent = testObjects
end

local validColors = {
	red = Color3.fromRGB(255, 70, 70),
	green = Color3.fromRGB(75, 220, 120),
	blue = Color3.fromRGB(80, 150, 255),
	white = Color3.fromRGB(245, 245, 245),
	black = Color3.fromRGB(25, 25, 30),
	yellow = Color3.fromRGB(255, 220, 70),
}

local function hasOnlyKeys(value, expected)
	if typeof(value) ~= "table" then return false end
	local count = 0
	local expectedCount = 0
	for _ in pairs(expected) do expectedCount += 1 end
	for key in pairs(value) do
		count += 1
		if not expected[key] then return false end
	end
	for key in pairs(expected) do
		if value[key] == nil then return false end
	end
	return count == expectedCount
end

local function validate(command)
	if typeof(command) ~= "table" or command.version ~= 1 then return false, "Malformed command or unsupported protocol version." end
	if not hasOnlyKeys(command, { id = true, version = true, command = true, args = true }) then return false, "Command has missing or unexpected fields." end
	if typeof(command.id) ~= "string" or #command.id < 1 or #command.id > 64 or not string.match(command.id, "^[%w_%-]+$") then
		return false, "Invalid request id."
	end
	local args = command.args
	if typeof(args) ~= "table" then return false, "Command args must be a table." end
	if command.command == "print" then
		if not hasOnlyKeys(args, { message = true }) or typeof(args.message) ~= "string" or #args.message > 500 then return false, "print requires a message up to 500 characters." end
	elseif command.command == "getPlayerName" or command.command == "getPlayerPosition" or command.command == "createTestPart" or command.command == "removeTestPart" then
		if next(args) ~= nil then return false, command.command .. " does not accept arguments." end
	elseif command.command == "moveTestObject" then
		if not hasOnlyKeys(args, { x = true, y = true, z = true }) then return false, "moveTestObject requires exactly x, y, and z." end
		for _, axis in ipairs({ "x", "y", "z" }) do
			local value = args[axis]
			if typeof(value) ~= "number" or value ~= value or math.abs(value) > 10000 then return false, "Coordinates must be finite numbers within ±10000." end
		end
	elseif command.command == "setTestObjectProperty" then
		if not hasOnlyKeys(args, { property = true, value = true }) then return false, "setTestObjectProperty requires property and value." end
		if args.property == "Transparency" then
			if typeof(args.value) ~= "number" or args.value ~= args.value or args.value < 0 or args.value > 1 then return false, "Transparency must be from 0 through 1." end
		elseif args.property == "Anchored" then
			if typeof(args.value) ~= "boolean" then return false, "Anchored must be boolean." end
		elseif args.property == "Color" then
			if typeof(args.value) ~= "string" or not validColors[args.value] then return false, "Color must be a supported color name." end
		else
			return false, "Only Transparency, Anchored, and Color can be changed."
		end
	else
		return false, "Unsupported command: " .. tostring(command.command)
	end
	return true
end

local function runCommand(command, player)
	local args = command.args
	if command.command == "print" then
		return true, args.message
	elseif command.command == "getPlayerName" then
		return true, player.Name
	elseif command.command == "getPlayerPosition" then
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if not root then return false, "Player character position is unavailable." end
		local p = root.Position
		return true, string.format("x=%.2f, y=%.2f, z=%.2f", p.X, p.Y, p.Z)
	elseif command.command == "moveTestObject" then
		testPart.Position = Vector3.new(args.x, args.y, args.z)
		return true, string.format("AervyxTestPart moved to (%.2f, %.2f, %.2f).", args.x, args.y, args.z)
	elseif command.command == "setTestObjectProperty" then
		if args.property == "Color" then
			testPart.Color = validColors[args.value]
		else
			testPart[args.property] = args.value
		end
		return true, "AervyxTestPart." .. args.property .. " updated."
	elseif command.command == "createTestPart" then
		local part = testObjects:FindFirstChild("AervyxBridgePart")
		if part and part:IsA("Part") then return true, "AervyxBridgePart already exists." end
		if part then part:Destroy() end
		part = Instance.new("Part")
		part.Name = "AervyxBridgePart"
		part.Size = Vector3.new(2, 2, 2)
		part.Position = Vector3.new(5, 5, 0)
		part.Anchored = true
		part.Color = validColors.green
		part.Parent = testObjects
		return true, "Created AervyxBridgePart."
	elseif command.command == "removeTestPart" then
		local part = testObjects:FindFirstChild("AervyxBridgePart")
		if not part then return true, "AervyxBridgePart was already absent." end
		part:Destroy()
		return true, "Removed AervyxBridgePart."
	end
	return false, "Unsupported command."
end

local readyPlayers = {}
local currentPlayer
local readySignal = Instance.new("BindableEvent")
readyEvent.OnServerEvent:Connect(function(player)
	readyPlayers[player] = true
	if player == currentPlayer then readySignal:Fire() end
end)

local response
local args = StudioTestService:GetTestArgs()
print("[AERVYX TEST] Command received... validating Studio test arguments")
if typeof(args) ~= "table" then
	response = { id = "invalid", ok = false, output = "No Aervyx Studio Test command was supplied." }
else
	local valid, validationError = validate(args)
	if not valid then
		response = { id = typeof(args.id) == "string" and args.id or "invalid", ok = false, output = validationError }
	else
		print("[AERVYX TEST] Validated " .. args.command .. " (" .. args.id .. ")")
		currentPlayer = Players:GetPlayers()[1] or Players.PlayerAdded:Wait()
		while not readyPlayers[currentPlayer] do readySignal.Event:Wait() end
		local ok, output = runCommand(args, currentPlayer)
		response = { id = args.id, ok = ok, output = tostring(output) }
		if ok and args.command == "print" then print("[AERVYX TEST] " .. response.output) end
		print("[AERVYX TEST] Command completed... " .. args.id .. " (" .. (ok and "ok" or "error") .. ")")
	end
end

if currentPlayer and response then
	local acknowledged = false
	local acknowledgedEvent = Instance.new("BindableEvent")
	local connection = acknowledgeEvent.OnServerEvent:Connect(function(player, requestId)
		if player == currentPlayer and requestId == response.id then
			acknowledged = true
			acknowledgedEvent:Fire()
		end
	end)
	outputEvent:FireClient(currentPlayer, response)
	if not acknowledged then
		task.delay(3, function() acknowledgedEvent:Fire() end)
		acknowledgedEvent.Event:Wait()
	end
	connection:Disconnect()
	acknowledgedEvent:Destroy()
	readySignal:Destroy()
	StudioTestService:EndTest(response)
else
	readySignal:Destroy()
	StudioTestService:EndTest(response or { id = "invalid", ok = false, output = "Test command did not complete." })
end

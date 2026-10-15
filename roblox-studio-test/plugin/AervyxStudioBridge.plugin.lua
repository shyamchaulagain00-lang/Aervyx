-- Aervyx Studio Bridge is a local Studio plugin.
-- It polls only the loopback Aervyx bridge and invokes StudioTestService with
-- validated, data-only commands. It never evaluates Lua source from Aervyx.

local HttpService = game:GetService("HttpService")
local StudioTestService = game:GetService("StudioTestService")
local BASE_URL = "http://127.0.0.1:43827"
local MAX_MESSAGE_LENGTH = 500
local MAX_COORDINATE = 10000

local toolbar = plugin:CreateToolbar("Aervyx")
local toggleButton = toolbar:CreateButton("AervyxStudioTest", "Connect to Aervyx's local Studio test bridge", "")
toggleButton.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, false, 360, 210, 300, 180)
local widget = plugin:CreateDockWidgetPluginGuiAsync("AervyxStudioTestBridge", widgetInfo)
widget.Title = "Aervyx Studio Test"

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(24, 26, 36)
root.BorderSizePixel = 0
root.Parent = widget

local tokenBox = Instance.new("TextBox")
tokenBox.Name = "PairingToken"
tokenBox.PlaceholderText = "Paste Aervyx pairing token"
tokenBox.Text = plugin:GetSetting("AervyxPairingToken") or ""
tokenBox.ClearTextOnFocus = false
tokenBox.Size = UDim2.new(1, -24, 0, 32)
tokenBox.Position = UDim2.fromOffset(12, 12)
tokenBox.BackgroundColor3 = Color3.fromRGB(13, 15, 22)
tokenBox.TextColor3 = Color3.fromRGB(230, 233, 243)
tokenBox.PlaceholderColor3 = Color3.fromRGB(110, 116, 132)
tokenBox.Font = Enum.Font.Code
tokenBox.TextSize = 12
tokenBox.Parent = root

local statusLabel = Instance.new("TextLabel")
statusLabel.Name = "Status"
statusLabel.Size = UDim2.new(1, -24, 0, 26)
statusLabel.Position = UDim2.fromOffset(12, 52)
statusLabel.BackgroundTransparency = 1
statusLabel.Text = "DISCONNECTED"
statusLabel.TextColor3 = Color3.fromRGB(145, 150, 165)
statusLabel.Font = Enum.Font.GothamBold
statusLabel.TextSize = 12
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.Parent = root

local outputLabel = Instance.new("TextLabel")
outputLabel.Size = UDim2.new(1, -24, 0, 54)
outputLabel.Position = UDim2.fromOffset(12, 82)
outputLabel.BackgroundTransparency = 1
outputLabel.Text = "Connects only to Aervyx on this computer."
outputLabel.TextColor3 = Color3.fromRGB(188, 193, 208)
outputLabel.Font = Enum.Font.Code
outputLabel.TextSize = 11
outputLabel.TextWrapped = true
outputLabel.TextXAlignment = Enum.TextXAlignment.Left
outputLabel.TextYAlignment = Enum.TextYAlignment.Top
outputLabel.Parent = root

local connectButton = Instance.new("TextButton")
connectButton.Name = "Connect"
connectButton.Size = UDim2.new(1, -24, 0, 34)
connectButton.Position = UDim2.new(0, 12, 1, -46)
connectButton.BackgroundColor3 = Color3.fromRGB(83, 96, 204)
connectButton.TextColor3 = Color3.new(1, 1, 1)
connectButton.Text = "Connect to Aervyx"
connectButton.Font = Enum.Font.GothamBold
connectButton.TextSize = 12
connectButton.Parent = root

local running = false
local session = 0
local resultCache = {}

local function setStatus(status, message)
	statusLabel.Text = status
	if status == "CONNECTED" then
		statusLabel.TextColor3 = Color3.fromRGB(92, 210, 150)
	elseif status == "ERROR" then
		statusLabel.TextColor3 = Color3.fromRGB(244, 115, 133)
	elseif status == "CONNECTING" then
		statusLabel.TextColor3 = Color3.fromRGB(236, 190, 104)
	else
		statusLabel.TextColor3 = Color3.fromRGB(145, 150, 165)
	end
	if message then outputLabel.Text = message end
end

local function post(path, body, token)
	local response = HttpService:RequestAsync({
		Url = BASE_URL .. path,
		Method = "POST",
		Headers = {
			["Content-Type"] = "application/json",
			["x-aervyx-token"] = token,
		},
		Body = HttpService:JSONEncode(body or {}),
		Timeout = 5,
	})
	if not response.Success then error("Aervyx bridge returned HTTP " .. tostring(response.StatusCode)) end
	return HttpService:JSONDecode(response.Body)
end

local function validCommand(command)
	if typeof(command) ~= "table" or command.version ~= 1 then return false, "Malformed command or protocol version." end
	for key in pairs(command) do if key ~= "id" and key ~= "version" and key ~= "command" and key ~= "args" then return false, "Unexpected command field." end end
	if typeof(command.id) ~= "string" or #command.id < 1 or #command.id > 64 or not string.match(command.id, "^[%w_%-]+$") then return false, "Invalid command id." end
	if typeof(command.args) ~= "table" then return false, "Command args must be a table." end
	local args = command.args
	if command.command == "print" then
		if typeof(args.message) ~= "string" or #args.message > MAX_MESSAGE_LENGTH then return false, "Invalid print message." end
		for key in pairs(args) do if key ~= "message" then return false, "Unexpected print argument." end end
	elseif command.command == "getPlayerName" or command.command == "getPlayerPosition" or command.command == "createTestPart" or command.command == "removeTestPart" then
		if next(args) ~= nil then return false, "Command does not accept arguments." end
	elseif command.command == "moveTestObject" then
		if typeof(args.x) ~= "number" or typeof(args.y) ~= "number" or typeof(args.z) ~= "number" then return false, "Invalid coordinates." end
		for key in pairs(args) do if key ~= "x" and key ~= "y" and key ~= "z" then return false, "Unexpected coordinate field." end end
		for _, value in ipairs({ args.x, args.y, args.z }) do if value ~= value or math.abs(value) > MAX_COORDINATE then return false, "Coordinates out of range." end end
	elseif command.command == "setTestObjectProperty" then
		if args.property == "Transparency" then
			if typeof(args.value) ~= "number" or args.value ~= args.value or args.value < 0 or args.value > 1 then return false, "Invalid Transparency." end
		elseif args.property == "Anchored" then
			if typeof(args.value) ~= "boolean" then return false, "Invalid Anchored value." end
		elseif args.property == "Color" then
			if typeof(args.value) ~= "string" or not ({ red = true, green = true, blue = true, white = true, black = true, yellow = true })[args.value] then return false, "Invalid Color." end
		else
			return false, "Property is not allowlisted."
		end
		for key in pairs(args) do if key ~= "property" and key ~= "value" then return false, "Unexpected property argument." end end
	else
		return false, "Command is not allowlisted."
	end
	return true
end

local function runStudioTest(command)
	local valid, validationError = validCommand(command)
	if not valid then
		local requestId = typeof(command) == "table" and typeof(command.id) == "string" and command.id or "invalid"
		return { id = requestId, ok = false, output = validationError }
	end
	print("[AERVYX TEST] Command received... " .. command.command .. " (" .. command.id .. ")")
	local ok, result = pcall(function()
		return StudioTestService:ExecutePlayModeAsync(command)
	end)
	if not ok then
		local output = "Studio test failed: " .. tostring(result)
		print("[AERVYX TEST] Command completed... " .. command.id .. " (error)")
		return { id = command.id, ok = false, output = output }
	end
	if typeof(result) ~= "table" or result.id ~= command.id or typeof(result.ok) ~= "boolean" or typeof(result.output) ~= "string" then
		return { id = command.id, ok = false, output = "Studio test returned a malformed response." }
	end
	print("[AERVYX TEST] Command completed... " .. command.id .. " (" .. (result.ok and "ok" or "error") .. ")")
	return result
end

local function stop()
	running = false
	session += 1
	connectButton.Text = "Connect to Aervyx"
	setStatus("DISCONNECTED", "Bridge polling stopped.")
end

connectButton.Activated:Connect(function()
	if running then stop(); return end
	local token = tokenBox.Text:gsub("%s", "")
	if #token < 32 then setStatus("ERROR", "Paste the pairing token shown in Aervyx, then retry."); return end
	plugin:SetSetting("AervyxPairingToken", token)
	running = true
	session += 1
	local thisSession = session
	connectButton.Text = "Disconnect"
	setStatus("CONNECTING", "Requesting permission to contact Aervyx on 127.0.0.1...")

	task.spawn(function()
		while running and session == thisSession do
			local ok, err = pcall(function() post("/v1/heartbeat", { protocol = 1 }, token) end)
			if ok then
				setStatus("CONNECTED", "Connected to the loopback Aervyx test bridge.")
				break
			end
			setStatus("ERROR", tostring(err) .. " Retrying...")
			task.wait(2)
		end
	end)

	-- Keep the broker heartbeat fresh while StudioTestService runs a test.
	task.spawn(function()
		while running and session == thisSession do
			local ok, err = pcall(function() post("/v1/heartbeat", { protocol = 1 }, token) end)
			if not ok then setStatus("ERROR", tostring(err) .. " Retrying...") end
			task.wait(1.2)
		end
	end)

	task.spawn(function()
		while running and session == thisSession do
			local ok, result = pcall(function() return post("/v1/next", {}, token) end)
			if not ok then
				setStatus("ERROR", tostring(result) .. " Retrying...")
				task.wait(2)
			else
				setStatus("CONNECTED", "Connected to the loopback Aervyx test bridge.")
				local command = result.command
				if command then
					local response = resultCache[command.id]
					if not response then
						response = runStudioTest(command)
						resultCache[command.id] = response
					end
					local sent, sendError = pcall(function() post("/v1/result", response, token) end)
					if not sent then setStatus("ERROR", "Response delivery failed: " .. tostring(sendError) .. "; retrying the cached response.") end
					local cacheSize = 0
					for _ in pairs(resultCache) do cacheSize += 1 end
					if cacheSize > 100 then resultCache = { [command.id] = response } end
				else
					task.wait(0.6)
				end
			end
		end
	end)
end)

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
plugin.Unloading:Connect(stop)

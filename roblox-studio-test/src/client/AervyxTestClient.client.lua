-- Small Studio-only output panel. It receives only the server's test response.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local testFolder = ReplicatedStorage:WaitForChild("AervyxTest")
local readyEvent = testFolder:WaitForChild("Ready")
local outputEvent = testFolder:WaitForChild("Output")
local acknowledgeEvent = testFolder:WaitForChild("Acknowledge")

local gui = Instance.new("ScreenGui")
gui.Name = "AervyxStudioTestOutput"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local frame = Instance.new("Frame")
frame.Name = "Panel"
frame.AnchorPoint = Vector2.new(1, 0)
frame.Position = UDim2.new(1, -20, 0, 20)
frame.Size = UDim2.fromOffset(360, 100)
frame.BackgroundColor3 = Color3.fromRGB(18, 20, 30)
frame.BorderSizePixel = 0
frame.Parent = gui

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -20, 0, 28)
title.Position = UDim2.fromOffset(10, 6)
title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamBold
title.Text = "AERVYX STUDIO TEST"
title.TextColor3 = Color3.fromRGB(145, 160, 255)
title.TextSize = 13
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = frame

local output = Instance.new("TextLabel")
output.Name = "Output"
output.Size = UDim2.new(1, -20, 0, 52)
output.Position = UDim2.fromOffset(10, 36)
output.BackgroundTransparency = 1
output.Font = Enum.Font.Code
output.Text = "Waiting for an Aervyx test command..."
output.TextColor3 = Color3.fromRGB(225, 228, 240)
output.TextSize = 12
output.TextWrapped = true
output.TextXAlignment = Enum.TextXAlignment.Left
output.TextYAlignment = Enum.TextYAlignment.Top
output.Parent = frame

outputEvent.OnClientEvent:Connect(function(response)
	if typeof(response) ~= "table" or typeof(response.id) ~= "string" or typeof(response.output) ~= "string" then
		output.Text = "Malformed test result received from server."
		return
	end
	output.Text = "[AERVYX TEST] " .. response.output
	acknowledgeEvent:FireServer(response.id)
end)

readyEvent:FireServer()

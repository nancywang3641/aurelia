# ============================================================================
# 奧瑞亞控制塔 (Aurelia Tower) — SoVITS + ComfyUI 托盤管家
# ----------------------------------------------------------------------------
# 功能：
#   • 系統匣圖示：一鍵啟動/停止 SoVITS(9880) 與 ComfyUI(8188)，全程隱藏黑框、
#     ComfyUI 不彈瀏覽器（--disable-auto-launch）
#   • HTTP 控制端點 http://127.0.0.1:9890（帶 CORS header，給奧瑞亞「控制室」面板輪詢）：
#       GET  /status                    狀態聚合（含 ComfyUI VRAM/佇列，由本機代抓免 CORS）
#       POST /start|/stop|/restart?svc=sovits|comfy|all
#       POST /open                      開 ComfyUI 網頁
#   • 啟動時自動帶起兩個服務（-NoAutoStart 可關）
# 使用：雙擊同資料夾的 aurelia_tower.vbs（無窗啟動）；右鍵托盤圖示操作
# 朋友改路徑：只需改下面 $CFG 三行
# ============================================================================
param([switch]$NoAutoStart)

$ErrorActionPreference = 'SilentlyContinue'

$CFG = @{
    SovitsDir  = 'D:\GPT-SoVITS-1007-cu124\GPT-SoVITS-1007-cu124'
    ComfyDir   = 'D:\ComfyUI_windows_portable'
    TowerPort  = 9890
    SovitsPort = 9880
    ComfyPort  = 8188
}

# ── 單例守門：9890 已被佔＝控制塔已在跑 ──
try {
    $probe = New-Object Net.Sockets.TcpClient
    $iar = $probe.BeginConnect('127.0.0.1', $CFG.TowerPort, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(300) -and $probe.Connected) { $probe.Close(); exit }
    $probe.Close()
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── 共享狀態（托盤執行緒 ↔ HTTP 執行緒）──
$sync = [hashtable]::Synchronized(@{ cfg = $CFG; pids = @{ sovits = 0; comfy = 0 }; stop = $false })

# ── HTTP 伺服器（背景 runspace；進程管理邏輯都在這裡，托盤選單走自家端點）──
$serverScript = {
    param($sync)
    $cfg = $sync.cfg

    function Test-Port($port) {
        try {
            $c = New-Object Net.Sockets.TcpClient
            $iar = $c.BeginConnect('127.0.0.1', $port, $null, $null)
            $ok = $iar.AsyncWaitHandle.WaitOne(400) -and $c.Connected
            $c.Close(); return [bool]$ok
        } catch { return $false }
    }

    function Start-Sovits {
        if (Test-Port $cfg.SovitsPort) { return 'already' }
        $oldPath = $env:PATH
        try {
            $env:PATH = "$($cfg.SovitsDir)\runtime;$($cfg.SovitsDir)\runtime\Library\bin;$($cfg.SovitsDir)\runtime\Scripts;$env:PATH"
            $p = Start-Process -FilePath "$($cfg.SovitsDir)\runtime\python.exe" `
                -ArgumentList "api_v2.py -a 0.0.0.0 -p $($cfg.SovitsPort)" `
                -WorkingDirectory $cfg.SovitsDir -WindowStyle Hidden -PassThru
            $sync.pids.sovits = $p.Id
            return 'started'
        } finally { $env:PATH = $oldPath }
    }

    function Start-Comfy {
        if (Test-Port $cfg.ComfyPort) { return 'already' }
        $oldPath = $env:PATH; $oldCuda = $env:CUDA_PATH
        try {
            # 複製 comfy_launch.ps1 的 cuDNN 隔離：torch 內建函式庫優先、剔除系統 CUDA/CUDNN
            $torchlib = Join-Path $cfg.ComfyDir 'python_embeded\Lib\site-packages\torch\lib'
            $cleanPath = ($env:PATH -split ';' | Where-Object { $_ -and ($_ -notmatch 'CUDA' -and $_ -notmatch 'CUDNN') }) -join ';'
            $env:PATH = "$torchlib;$cleanPath"
            $env:CUDA_PATH = ''
            $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
            if (-not $gitExe) { foreach ($c in @('C:\Program Files\Git\cmd\git.exe','C:\Program Files\Git\bin\git.exe')) { if (Test-Path $c) { $gitExe = $c; break } } }
            if ($gitExe) { $env:GIT_PYTHON_GIT_EXECUTABLE = $gitExe; $env:PATH = (Split-Path $gitExe) + ';' + $env:PATH }
            $p = Start-Process -FilePath "$($cfg.ComfyDir)\python_embeded\python.exe" `
                -ArgumentList "-s ComfyUI\main.py --windows-standalone-build --disable-auto-launch" `
                -WorkingDirectory $cfg.ComfyDir -WindowStyle Hidden -PassThru
            $sync.pids.comfy = $p.Id
            return 'started'
        } finally { $env:PATH = $oldPath; $env:CUDA_PATH = $oldCuda }
    }

    function Stop-Svc($name, $port) {
        $killed = $false
        $procId = $sync.pids[$name]
        if ($procId -gt 0) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; $killed = $true } catch {} }
        # 後備：照埠號抓（控制塔重啟後 pids 會遺失）
        try {
            Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | ForEach-Object {
                try { Stop-Process -Id $_.OwningProcess -Force; $killed = $true } catch {}
            }
        } catch {}
        $sync.pids[$name] = 0
        if ($killed) { return 'stopped' } else { return 'not-running' }
    }

    function Get-StatusJson {
        $sovitsUp = Test-Port $cfg.SovitsPort
        $comfyUp  = Test-Port $cfg.ComfyPort
        $comfy = @{ up = $comfyUp; port = $cfg.ComfyPort }
        if ($comfyUp) {
            try {
                $ss = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg.ComfyPort)/system_stats" -TimeoutSec 2
                $dev = $ss.devices[0]
                $comfy.gpu        = $dev.name
                $comfy.vram_total = [math]::Round($dev.vram_total / 1GB, 1)
                $comfy.vram_free  = [math]::Round($dev.vram_free  / 1GB, 1)
            } catch {}
            try {
                $q = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg.ComfyPort)/queue" -TimeoutSec 2
                $comfy.queue_running = @($q.queue_running).Count
                $comfy.queue_pending = @($q.queue_pending).Count
            } catch {}
        }
        return (@{ tower = $true; sovits = @{ up = $sovitsUp; port = $cfg.SovitsPort }; comfy = $comfy } | ConvertTo-Json -Depth 4)
    }

    $listener = New-Object Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$($cfg.TowerPort)/")
    $listener.Start()
    $sync.listener = $listener

    while (-not $sync.stop) {
        try { $ctx = $listener.GetContext() } catch { break }
        $req = $ctx.Request; $res = $ctx.Response
        $res.Headers.Add('Access-Control-Allow-Origin', '*')
        $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        $res.Headers.Add('Access-Control-Allow-Headers', '*')
        $body = ''
        try {
            if ($req.HttpMethod -eq 'OPTIONS') {
                $res.StatusCode = 204
            } else {
                $path = $req.Url.AbsolutePath.ToLower()
                $svc  = ($req.QueryString['svc'] + '').ToLower()
                switch ($path) {
                    '/status' { $body = Get-StatusJson }
                    '/start' {
                        $r = @{}
                        if ($svc -in @('sovits','all','')) { $r.sovits = Start-Sovits }
                        if ($svc -in @('comfy','all',''))  { $r.comfy  = Start-Comfy }
                        $body = ($r | ConvertTo-Json)
                    }
                    '/stop' {
                        $r = @{}
                        if ($svc -in @('sovits','all','')) { $r.sovits = Stop-Svc 'sovits' $cfg.SovitsPort }
                        if ($svc -in @('comfy','all',''))  { $r.comfy  = Stop-Svc 'comfy'  $cfg.ComfyPort }
                        $body = ($r | ConvertTo-Json)
                    }
                    '/restart' {
                        $r = @{}
                        if ($svc -in @('sovits','all','')) { Stop-Svc 'sovits' $cfg.SovitsPort | Out-Null; Start-Sleep -Seconds 1; $r.sovits = Start-Sovits }
                        if ($svc -in @('comfy','all',''))  { Stop-Svc 'comfy'  $cfg.ComfyPort  | Out-Null; Start-Sleep -Seconds 1; $r.comfy  = Start-Comfy }
                        $body = ($r | ConvertTo-Json)
                    }
                    '/open' { Start-Process "http://127.0.0.1:$($cfg.ComfyPort)"; $body = '{"ok":true}' }
                    default { $res.StatusCode = 404; $body = '{"error":"not found"}' }
                }
            }
        } catch { $res.StatusCode = 500; $body = '{"error":"' + $_.Exception.Message.Replace('"','') + '"}' }
        if ($body) {
            $buf = [Text.Encoding]::UTF8.GetBytes($body)
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
        }
        $res.Close()
    }
    try { $listener.Stop() } catch {}
}

$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$ps = [powershell]::Create()
$ps.Runspace = $rs
$ps.AddScript($serverScript).AddArgument($sync) | Out-Null
$serverHandle = $ps.BeginInvoke()

# ── 托盤選單動作：全部走自家 HTTP 端點（單一事實來源）──
function Invoke-Tower($path) {
    try { Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($CFG.TowerPort)$path" -TimeoutSec 30 | Out-Null } catch {}
}

# ── 托盤圖示 ──
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Shield
$tray.Text = '奧瑞亞控制塔 (SoVITS + ComfyUI)'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$null = $menu.Items.Add('▶ 全部啟動').add_Click({ Invoke-Tower '/start?svc=all'; $tray.ShowBalloonTip(2000, '奧瑞亞控制塔', '正在帶起 SoVITS 與 ComfyUI…', 'Info') })
$null = $menu.Items.Add('■ 全部停止').add_Click({ Invoke-Tower '/stop?svc=all'; $tray.ShowBalloonTip(2000, '奧瑞亞控制塔', '已送出停止指令', 'Info') })
$null = $menu.Items.Add('-')
$null = $menu.Items.Add('🎙️ 重啟語音 (SoVITS)').add_Click({ Invoke-Tower '/restart?svc=sovits' })
$null = $menu.Items.Add('🎨 重啟生圖 (ComfyUI)').add_Click({ Invoke-Tower '/restart?svc=comfy' })
$null = $menu.Items.Add('🌐 開 ComfyUI 網頁').add_Click({ Start-Process "http://127.0.0.1:$($CFG.ComfyPort)" })
$null = $menu.Items.Add('-')
$null = $menu.Items.Add('結束控制塔（服務照跑）').add_Click({
    $sync.stop = $true; try { $sync.listener.Stop() } catch {}
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
$null = $menu.Items.Add('結束並停止全部服務').add_Click({
    Invoke-Tower '/stop?svc=all'
    $sync.stop = $true; try { $sync.listener.Stop() } catch {}
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
$tray.ContextMenuStrip = $menu

# 開塔自動帶起服務
if (-not $NoAutoStart) {
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 800
    $timer.add_Tick({
        $this.Stop()
        Invoke-Tower '/start?svc=all'
        $tray.ShowBalloonTip(2500, '奧瑞亞控制塔', 'SoVITS 與 ComfyUI 正在背景啟動（無黑框）', 'Info')
    })
    $timer.Start()
}

[System.Windows.Forms.Application]::Run()

# 收尾
$sync.stop = $true
try { $sync.listener.Stop() } catch {}
try { $ps.Stop(); $ps.Dispose(); $rs.Close() } catch {}

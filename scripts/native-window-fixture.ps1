param([switch]$CompileOnly)
$ErrorActionPreference = 'Stop'
$production = Get-Content -Raw (Join-Path $PSScriptRoot '..\electron\windows-system-control.ps1')
$match = [regex]::Match($production, "(?s)Add-Type @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) { throw 'Could not extract production FixedSystemKeys source.' }
$productionSource = $match.Groups[1].Value -replace '(?m)^using\s+[^;]+;\r?\n', ''
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$fixtureSource = @'
public static class NativeWindowFixture {
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int c); [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
 const int RESTORE=9; const ushort F24=0x87; sealed class F:Form { public int keys; public F(string t,Color c){Text=t;Width=420;Height=180;StartPosition=FormStartPosition.CenterScreen;BackColor=c;KeyPreview=true;FormBorderStyle=FormBorderStyle.FixedSingle;Controls.Add(new Label{Dock=DockStyle.Fill,Text=t+"\r\nOwned native fixture",TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Segoe UI",16)});KeyDown+=(s,e)=>{if(e.KeyCode==Keys.F24)keys++;};} }
 static F a,b; static readonly object gate=new object(); static void Out(string s){lock(gate){Console.WriteLine(s);Console.Out.Flush();}}
 static string Snap(F f,uint sent=0,bool include=false){var h=f.Handle;var fg=GetForegroundWindow();var s="{\"ok\":true,\"handle\":\""+h.ToInt64()+"\",\"foreground\":\""+fg.ToInt64()+"\",\"iconic\":"+(IsIconic(h)?"true":"false")+",\"zoomed\":"+(IsZoomed(h)?"true":"false")+",\"keyDownCount\":"+f.keys;if(include)s+=",\"sent\":"+sent;return s+"}";}
 static void Activate(F f){f.Show();f.Activate();SetForegroundWindow(f.Handle);} static void Focus(F f){Activate(f);Out(Snap(f));} static void Restore(F f){ShowWindow(f.Handle,RESTORE);Focus(f);}
 static void Probe(){a.keys=0;Activate(a);var sent=FixedSystemKeys.Press(F24,a.Handle);var t=new System.Windows.Forms.Timer{Interval=150};t.Tick+=(s,e)=>{t.Stop();t.Dispose();Out(Snap(a,sent,true));};t.Start();}
 static void Action(F f, string cmd, bool max) {
   var expected = f.Handle;
   if (GetForegroundWindow() != expected) { Out("{\"ok\":false,\"reason\":\"foreground-mismatch\"}"); return; }
   var p = cmd.Split('\t'); int excluded;
   if (!Int32.TryParse(p[1], out excluded)) { Out("{\"ok\":false,\"reason\":\"invalid-excluded-pid\"}"); return; }
   var sent = cmd.StartsWith("reject\t")
     ? FixedSystemKeys.MinimizeActiveWindow(excluded, expected)
     : (max ? FixedSystemKeys.ToggleMaximizeActiveWindow(excluded, expected) : FixedSystemKeys.MinimizeActiveWindow(excluded, expected));
   Out(Snap(f, sent, true));
 }
 public static void Run() {
   a = new F("Codex Native Fixture A", Color.LightSteelBlue);
   b = new F("Codex Native Fixture B", Color.MistyRose);
   a.Show(); b.Show();
   Out("{\"ready\":true,\"pid\":" + Process.GetCurrentProcess().Id + ",\"a\":\"" + a.Handle.ToInt64() + "\",\"b\":\"" + b.Handle.ToInt64() + "\"}");
   var r = new Thread(() => {
     string l;
     while ((l = Console.ReadLine()) != null) {
       var c = l.Trim().ToLowerInvariant();
       if (c == "quit") { a.BeginInvoke(new Action(() => { Out("{\"quit\":true}"); Application.ExitThread(); })); return; }
       if (c == "focusa") a.BeginInvoke(new Action(() => Focus(a)));
       else if (c == "focusb") a.BeginInvoke(new Action(() => Focus(b)));
       else if (c == "snapa") a.BeginInvoke(new Action(() => Out(Snap(a))));
       else if (c == "snapb") a.BeginInvoke(new Action(() => Out(Snap(b))));
       else if (c == "restorea") a.BeginInvoke(new Action(() => Restore(a)));
       else if (c == "restoreb") a.BeginInvoke(new Action(() => Restore(b)));
       else if (c == "probe-key") a.BeginInvoke(new Action(Probe));
       else if (c.StartsWith("maxa\t")) a.BeginInvoke(new Action(() => Action(a, c, true)));
       else if (c.StartsWith("minb\t")) a.BeginInvoke(new Action(() => Action(b, c, false)));
       else if (c.StartsWith("reject\t")) a.BeginInvoke(new Action(() => Action(b, c, false)));
     }
   });
   r.IsBackground = true; r.Start(); Application.Run();
 }
}
'@
$combined = "using System;`nusing System.Diagnostics;`nusing System.Drawing;`nusing System.Threading;`nusing System.Windows.Forms;`nusing System.Runtime.InteropServices;`n" + $productionSource + "`n" + $fixtureSource
Add-Type -TypeDefinition $combined -ReferencedAssemblies @('System.Windows.Forms','System.Drawing')
if ($CompileOnly) { Write-Output '{"ok":true,"compileOnly":true,"source":"production-fixed-system-keys"}'; exit 0 }
[NativeWindowFixture]::Run()

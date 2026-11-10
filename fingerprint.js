'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FP_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace Gammick {
public static class Fp {
  const string L = "libzkfp.dll";
  [DllImport(L)] static extern int ZKFPM_Init();
  [DllImport(L)] static extern int ZKFPM_Terminate();
  [DllImport(L)] static extern int ZKFPM_GetDeviceCount();
  [DllImport(L)] static extern IntPtr ZKFPM_OpenDevice(int index);
  [DllImport(L)] static extern int ZKFPM_CloseDevice(IntPtr h);
  [DllImport(L)] static extern int ZKFPM_GetParameters(IntPtr h, int code, byte[] val, ref int cb);
  [DllImport(L)] static extern int ZKFPM_AcquireFingerprint(IntPtr h, byte[] img, int cbImg, byte[] tpl, ref int cbTpl);
  [DllImport(L)] static extern IntPtr ZKFPM_DBInit();
  [DllImport(L)] static extern int ZKFPM_DBFree(IntPtr db);
  [DllImport(L)] static extern int ZKFPM_DBMerge(IntPtr db, byte[] t1, byte[] t2, byte[] t3, byte[] reg, ref int cbReg);
  [DllImport(L)] static extern int ZKFPM_DBAdd(IntPtr db, int fid, byte[] t, int cb);
  [DllImport(L)] static extern int ZKFPM_DBDel(IntPtr db, int fid);
  [DllImport(L)] static extern int ZKFPM_DBClear(IntPtr db);
  [DllImport(L)] static extern int ZKFPM_DBIdentify(IntPtr db, byte[] t, int cb, ref int fid, ref int score);
  [DllImport(L)] static extern int ZKFPM_DBMatch(IntPtr db, byte[] t1, int cb1, byte[] t2, int cb2);

  const int MAX_TPL = 2048;
  static readonly object outLock = new object();
  static readonly object sdk = new object();
  static IntPtr dev = IntPtr.Zero;
  static IntPtr db = IntPtr.Zero;
  static int imgSize = 0;
  static readonly Dictionary<int, byte[]> cache = new Dictionary<int, byte[]>();
  static bool enrolling = false;
  static int step = 0;
  static readonly byte[][] regs = new byte[3][];
  static readonly int[] regLen = new int[3];

  static void Emit(string json) {
    lock (outLock) { Console.Out.WriteLine(json); Console.Out.Flush(); }
  }

  public static void Start() {
    try {
      int r = ZKFPM_Init();
      if (r != 0 && r != 1) Emit("{\"type\":\"error\",\"message\":\"init " + r + "\"}");
    } catch (DllNotFoundException) {
      Emit("{\"type\":\"driver\",\"installed\":false}");
      return;
    }
    Thread t = new Thread(Loop);
    t.IsBackground = true;
    t.Start();
  }

  static int Param(int code) {
    byte[] v = new byte[4];
    int cb = 4;
    ZKFPM_GetParameters(dev, code, v, ref cb);
    return BitConverter.ToInt32(v, 0);
  }

  static bool TryOpen() {
    lock (sdk) {
      if (ZKFPM_GetDeviceCount() <= 0) return false;
      dev = ZKFPM_OpenDevice(0);
      if (dev == IntPtr.Zero) return false;
      imgSize = Param(1) * Param(2);
      if (imgSize <= 0) imgSize = 300 * 400;
      db = ZKFPM_DBInit();
      foreach (KeyValuePair<int, byte[]> e in cache) ZKFPM_DBAdd(db, e.Key, e.Value, e.Value.Length);
    }
    Emit("{\"type\":\"status\",\"connected\":true}");
    return true;
  }

  static void CloseDevice() {
    lock (sdk) {
      if (db != IntPtr.Zero) ZKFPM_DBFree(db);
      if (dev != IntPtr.Zero) ZKFPM_CloseDevice(dev);
      db = IntPtr.Zero;
      dev = IntPtr.Zero;
      enrolling = false;
      step = 0;
      ZKFPM_Terminate();
      ZKFPM_Init();
    }
    Emit("{\"type\":\"status\",\"connected\":false}");
  }

  static void Loop() {
    Emit("{\"type\":\"status\",\"connected\":false}");
    bool lifted = true;
    int misses = 0;
    int ticks = 0;
    while (true) {
      try {
        if (dev == IntPtr.Zero) {
          if (!TryOpen()) { Thread.Sleep(2000); continue; }
          lifted = true;
        }
        byte[] img = new byte[imgSize];
        byte[] tpl = new byte[MAX_TPL];
        int cb = MAX_TPL;
        int r;
        lock (sdk) { r = ZKFPM_AcquireFingerprint(dev, img, imgSize, tpl, ref cb); }
        if (r == 0) {
          misses = 0;
          if (lifted) { lifted = false; OnFinger(tpl, cb); }
        } else {
          if (++misses >= 3) lifted = true;
        }
        if (++ticks % 20 == 0) {
          int n;
          lock (sdk) { n = ZKFPM_GetDeviceCount(); }
          if (n <= 0) CloseDevice();
        }
      } catch (Exception ex) {
        Emit("{\"type\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}");
        Thread.Sleep(1000);
      }
      Thread.Sleep(150);
    }
  }

  static void OnFinger(byte[] tpl, int cb) {
    lock (sdk) {
      if (db == IntPtr.Zero) return;
      if (enrolling) { EnrollTouch(tpl, cb); return; }
      int fid = 0, score = 0;
      if (ZKFPM_DBIdentify(db, tpl, cb, ref fid, ref score) == 0) {
        Emit("{\"type\":\"match\",\"fid\":" + fid + ",\"score\":" + score + "}");
      } else {
        Emit("{\"type\":\"nomatch\"}");
      }
    }
  }

  static void EnrollTouch(byte[] tpl, int cb) {
    if (step == 0) {
      int fid = 0, score = 0;
      if (ZKFPM_DBIdentify(db, tpl, cb, ref fid, ref score) == 0) {
        Emit("{\"type\":\"enrollDuplicate\",\"fid\":" + fid + "}");
        return;
      }
    } else if (ZKFPM_DBMatch(db, tpl, cb, regs[step - 1], regLen[step - 1]) <= 0) {
      Emit("{\"type\":\"enrollRetry\"}");
      return;
    }
    regs[step] = new byte[MAX_TPL];
    Array.Copy(tpl, regs[step], cb);
    regLen[step] = cb;
    step++;
    Emit("{\"type\":\"enrollStep\",\"step\":" + step + "}");
    if (step < 3) return;

    byte[] reg = new byte[MAX_TPL];
    int cbReg = MAX_TPL;
    int r = ZKFPM_DBMerge(db, regs[0], regs[1], regs[2], reg, ref cbReg);
    enrolling = false;
    step = 0;
    if (r == 0) {
      Emit("{\"type\":\"enrolled\",\"template\":\"" + Convert.ToBase64String(reg, 0, cbReg) + "\"}");
    } else {
      Emit("{\"type\":\"enrollFailed\"}");
    }
  }

  public static void Command(string line) {
    if (line == null) return;
    string[] p = line.Trim().Split(' ');
    try {
      lock (sdk) {
        switch (p[0]) {
          case "ADD": {
            int fid = int.Parse(p[1]);
            byte[] t = Convert.FromBase64String(p[2]);
            cache[fid] = t;
            if (db != IntPtr.Zero) { ZKFPM_DBDel(db, fid); ZKFPM_DBAdd(db, fid, t, t.Length); }
            break;
          }
          case "DEL": {
            int fid = int.Parse(p[1]);
            cache.Remove(fid);
            if (db != IntPtr.Zero) ZKFPM_DBDel(db, fid);
            break;
          }
          case "CLEAR":
            cache.Clear();
            if (db != IntPtr.Zero) ZKFPM_DBClear(db);
            break;
          case "ENROLL":
            enrolling = true;
            step = 0;
            Emit("{\"type\":\"enrollStep\",\"step\":0}");
            break;
          case "CANCEL":
            enrolling = false;
            step = 0;
            break;
          case "STATUS":
            Emit("{\"type\":\"status\",\"connected\":" + (dev != IntPtr.Zero ? "true" : "false") + "}");
            break;
        }
      }
    } catch (Exception ex) {
      Emit("{\"type\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}");
    }
  }

  static string Esc(string s) {
    return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
  }
}
}
`;

const FP_PS = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition ([System.IO.File]::ReadAllText($env:GAMMICK_FP_CS))
[Gammick.Fp]::Start()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  [Gammick.Fp]::Command($line)
}`;

const driverDll = () =>
  path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'libzkfp.dll');

function bundledDriver() {
  const installed = path.join(process.resourcesPath || '', 'zk-driver-setup.exe');
  if (fs.existsSync(installed)) return installed;
  return path.join(__dirname, 'build', 'zk-driver-setup.exe');
}

const DRIVER_ARGS = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART';

function createFingerprint({ dir, onEvent }) {
  let proc = null;
  let connected = false;
  let driver = fs.existsSync(driverDll()) ? 'ok' : 'missing';
  let installTried = false;
  let lastError = '';
  const templates = new Map();

  const status = () => ({ type: 'status', driver, connected, error: lastError || undefined });
  const pushStatus = () => onEvent(status());

  function write(line) {
    if (proc && proc.stdin.writable) proc.stdin.write(line + '\n');
  }

  function startHelper() {
    if (proc) return;
    const cs = path.join(dir, 'fingerprint.cs');
    const ps = path.join(dir, 'fingerprint.ps1');
    try {
      fs.writeFileSync(cs, FP_CS);
      fs.writeFileSync(ps, FP_PS);
    } catch (e) {
      lastError = 'לא ניתן להכין את רכיב טביעת האצבע';
      pushStatus();
      return;
    }
    proc = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps],
      { env: { ...process.env, GAMMICK_FP_CS: cs }, windowsHide: true }
    );
    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch (e) {
          continue;
        }
        if (ev.type === 'status') {
          connected = !!ev.connected;
          lastError = '';
          pushStatus();
          continue;
        }
        if (ev.type === 'driver' && !ev.installed) {
          driver = 'missing';
          pushStatus();
          installDriver();
          continue;
        }
        if (ev.type === 'error') lastError = String(ev.message || '');
        onEvent(ev);
      }
    });
    let err = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (c) => {
      err += c;
    });
    proc.on('exit', () => {
      proc = null;
      connected = false;
      if (err.trim()) lastError = err.trim().split('\n')[0].slice(0, 200);
      pushStatus();
    });
    for (const [fid, b64] of templates) write(`ADD ${fid} ${b64}`);
  }

  function installDriver() {
    if (installTried || driver === 'installing') return;
    installTried = true;
    const setup = bundledDriver();
    if (!fs.existsSync(setup)) {
      driver = 'missing';
      pushStatus();
      return;
    }
    driver = 'installing';
    pushStatus();
    const cmd =
      '$p = Start-Process -FilePath $env:GAMMICK_SETUP -ArgumentList $env:GAMMICK_ARGS -Verb RunAs -Wait -PassThru; exit $p.ExitCode';
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      env: { ...process.env, GAMMICK_SETUP: setup, GAMMICK_ARGS: DRIVER_ARGS },
      windowsHide: true,
    });
    child.on('exit', () => {
      driver = fs.existsSync(driverDll()) ? 'ok' : 'failed';
      pushStatus();
      if (driver === 'ok') {
        if (proc) proc.kill();
        proc = null;
        startHelper();
      }
    });
  }

  return {
    start() {
      if (driver !== 'ok' && fs.existsSync(driverDll())) driver = 'ok';
      if (driver === 'ok') startHelper();
      else installDriver();
      return status();
    },
    status,
    add(fid, b64) {
      const id = Number(fid);
      const t = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
      if (!Number.isInteger(id) || id <= 0 || !t) return;
      templates.set(id, t);
      write(`ADD ${id} ${t}`);
    },
    remove(fid) {
      const id = Number(fid);
      templates.delete(id);
      write(`DEL ${id}`);
    },
    enroll() {
      write('ENROLL');
    },
    cancel() {
      write('CANCEL');
    },
    stop() {
      if (proc) proc.kill();
      proc = null;
    },
  };
}

module.exports = { createFingerprint };

const { app, BrowserWindow, ipcMain, session, dialog } = require('electron')
const fs = require('fs')
let mainWindow
const path = require('path');
const { initializeDatabase, readData, writeData, getDatabasePath, closeDatabase } = require('./sqlite-storage');

const ERROR_DIALOG_COOLDOWN_MS = 5000;
let lastErrorDialogAt = 0;

function shouldShowUserErrorDialog() {
  // In the installed app, avoid disruptive popups for transient/storage edge cases.
  // Keep diagnostics in logs instead.
  return !app.isPackaged;
}

function notifySqliteTableFailure(operationLabel, datasetName, error) {
  console.error(`SQLite ${operationLabel} failed for ${datasetName}.`, error);

  if (!shouldShowUserErrorDialog()) {
    return;
  }

  // Read requests can happen frequently during startup/navigation.
  // Avoid interrupting the user with popups for these recoverable cases.
  if (operationLabel === 'העלאת') {
    return;
  }

  const now = Date.now();
  if (now - lastErrorDialogAt < ERROR_DIALOG_COOLDOWN_MS) {
    return;
  }
  lastErrorDialogAt = now;

  dialog.showErrorBox(
    'הודעת מערכת',
    'בעיה בשמירת נתונים במחשב. נא לבדוק הרשאות וגישה לתיקיית הנתונים ומקום פנוי בדיסק.'
  );
}

function notifySqliteInitializationFailure(error) {
  console.error('SQLite initialization failed.', error);

  if (!shouldShowUserErrorDialog()) {
    return;
  }

  const now = Date.now();
  if (now - lastErrorDialogAt < ERROR_DIALOG_COOLDOWN_MS) {
    return;
  }
  lastErrorDialogAt = now;

  dialog.showErrorBox(
    'הודעת מערכת',
    'בעיה בשמירת נתונים במחשב. נא לבדוק הרשאות וגישה לתיקיית הנתונים ומקום פנוי בדיסק.'
  );
}


function createWindow() {
  let ses = session.defaultSession

  mainWindow = new BrowserWindow({
    width: 800, height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: __dirname + '/preload.js'
    }
  })
  mainWindow.loadFile('pages/main/user.html')
  mainWindow.menuBarVisible = false
  mainWindow.fullScreen = true;

  if (!app.isPackaged) {
    mainWindow.menuBarVisible = true
  }

  ses.on('will-download', (e, downloadItem, webContents) => {
    let name = downloadItem.getFilename()
    const existingFilePath = app.getPath('desktop') + `\\ניקוד תלמידים` + `/${name}`

    if (fs.existsSync(existingFilePath)) {
      fs.unlink(existingFilePath, (err) => {
        if (err) {
          console.error('Error removing the file:', err);
        } else {
          downloadItem.setSavePath(existingFilePath)
        }
      });
    }
    else {
      downloadItem.setSavePath(existingFilePath)
    }

    downloadItem.once('done', (event, state) => {
      if (state === 'completed') {
        dialog.showMessageBox({
          type: 'info',
          title: 'הודעת מערכת',
          message: 'הקובץ נשמר בהצלחה בשולחן העבודה בתקיית ניקוד תלמידים! '
        })
      } else {
        dialog.showErrorBox('הודעת מערכת', 'הקובץ לא נשמר')
      }
    })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', async () => {
  try {
    const databasePath = await initializeDatabase(app);
    console.log('SQLite database ready at:', databasePath || getDatabasePath());
  } catch (error) {
    notifySqliteInitializationFailure(error);
  }

  createWindow();
})

ipcMain.on("sendPrint", (event, args) => {
  let printWindow = new BrowserWindow({ show: false });
  printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args));
  printWindow.webContents.once('did-finish-load', () => {
    printWindow.webContents.print(
      { silent: true, printBackground: true },
      (success, errorType) => {
        mainWindow.webContents.send("receivePrint", success);
      }
    );
  });
});

ipcMain.on("sendReadExcel", async (event, args) => {
  try {
    const data = await readData(args);
    mainWindow.webContents.send("receiveReadExcel" + args, data);
  } catch (error) {
    notifySqliteTableFailure('העלאת', args, error);
    mainWindow.webContents.send("receiveReadExcel" + args, 0);
  }
});

ipcMain.on("getBackground", (event, args) => {
  fs.readFile(args + '.png', { encoding: 'base64', flag: 'r' }, function (err, data) {
    if (err) {
      console.log("background read error", err);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("receiveGetBackground" + args, 0);
      }
    } else {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("receiveGetBackground" + args, data);
      }
    }
  });
});

ipcMain.on("sendWriteExcel", async (event, args) => {
  if (args[1] && typeof args[1] === "string" && args[1].trim() !== "") {
    try {
      JSON.parse(args[1]);
      await writeData(args[0], args[1]);
      mainWindow.webContents.send("receiveWriteExcel" + args[0], 1);
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error("Invalid JSON data:", e);
      } else {
        notifySqliteTableFailure('שמירת', args[0], e);
      }
      mainWindow.webContents.send("receiveWriteExcel" + args[0], 0);
    }
  } else {
    console.error("Empty or invalid data.");
    mainWindow.webContents.send("receiveWriteExcel" + args[0], 0);
  }
});

ipcMain.on("sendUploadBackground", (event, args) => {
  const fileData = args;
  const buffer = Buffer.from(fileData, "base64");
  fs.writeFile("personalBackground.png", buffer, (err) => {
    if (err) {
      console.log(err)
    }
    mainWindow.webContents.send("recieveUploadBackground", 1);
  });
});

ipcMain.on('close', () => {
  app.quit()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  try {
    closeDatabase();
  } catch (error) {
    console.error('Failed to close SQLite database cleanly.', error);
  }
})

// When app icon is clicked and app is running, (macOS) recreate the BrowserWindow
app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
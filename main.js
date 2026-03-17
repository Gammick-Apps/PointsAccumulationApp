const { app, BrowserWindow, ipcMain, session, dialog } = require('electron')
const fs = require('fs')
let mainWindow
const path = require('path');

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

app.on('ready', createWindow)

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

ipcMain.on("sendReadExcel", (event, args) => {
  fs.readFile(args + '.txt',
    { encoding: 'utf8', flag: 'r' },
    function (err, data) {
      if (err) {
        mainWindow.webContents.send("receiveReadExcel" + args, 0);
      }
      else {
        mainWindow.webContents.send("receiveReadExcel" + args, data);
      }
    });
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

ipcMain.on("sendWriteExcel", (event, args) => {
  if (args[1] && typeof args[1] === "string" && args[1].trim() !== "") {
    try {
      JSON.parse(args[1]);
      fs.writeFile(args[0] + '.txt', args[1], err => {
        if (err) {
          console.error(err);
        } else {
          mainWindow.webContents.send("receiveWriteExcel" + args[0], 1);
        }
      });
    } catch (e) {
      console.error("Invalid JSON data:", e);
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

// When app icon is clicked and app is running, (macOS) recreate the BrowserWindow
app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
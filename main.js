const { app, BrowserWindow, ipcMain, session, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
let mainWindow
const { initDatabase, waitDB, readData, readSystem, updateSystem, closeDatabase, insertExcelToDB,
  addStudent, updateStudent, addTask, updateTask, addProduct, updateProduct, getStudentById, getTaskByCode,
  isTaskUsed, isProductUsed, markProductAsUsed, hasStudentDoneSelected, setDefaultTask, getDefaultTask, saveStudentTask, saveStudentProduct, resetDatabase, getProductByCode, getTestByCode, getStudentParentByCode, updateStudentText, getStatistics, addPrize, updatePrize, deletePrize, readPrizes, readPrizeWinners, updatePrizeWinner, drawPrize, DB_FLAG_INCONSISTENT_ERROR_CODE } = require('./db/sqlite-storage');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800, height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: __dirname + '/preload.js'
    }
  })
  mainWindow.loadFile('pages/main/user.html')
  mainWindow.fullScreen = true;
  mainWindow.menuBarVisible = false;

  if (!app.isPackaged) {
    mainWindow.menuBarVisible = true
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', async () => {
  createWindow();
  registerDownloadHandler();
  try {
    await initDatabase(app);
  } catch (error) {
    console.error('Failed to initialize SQLite database.', error);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.loadFile('pages/main/dbError.html');
    }
    return;
  }
})

// -------------- general ---------------- //

ipcMain.on("sendGetDataByTable", async (event, args) => {
  try {
    const data = await readData(args);
    mainWindow.webContents.send("receiveGetDataByTable" + args, data);
  } catch (error) {
    mainWindow.webContents.send("receiveGetDataByTable" + args, []);
  }
});

ipcMain.on("sendInsertExcelToDB", async (event, args) => {
  if (args[1] && typeof args[1] === "string" && args[1].trim() !== "") {
    try {
      JSON.parse(args[1]);
      const data = await insertExcelToDB(args[0], args[1]);
      mainWindow.webContents.send("receiveInsertExcelToDB" + args[0], data);
    } catch (e) {
      console.error("Invalid JSON data:", e);
      mainWindow.webContents.send("receiveInsertExcelToDB" + args[0], false);
    }
  } else {
    console.error("Empty or invalid data.");
    mainWindow.webContents.send("receiveInsertExcelToDB" + args[0], false);
  }
});

ipcMain.on("sendResetDatabase", async (event, args) => {
  try {
    const data = await resetDatabase();
    mainWindow.webContents.send("receiveResetDatabase", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveResetDatabase", false);
  }
});

// -------------- system ---------------- //

ipcMain.on("sendReadSystem", async (event, args) => {
  try {
    const data = await readSystem();
    mainWindow.webContents.send("receiveReadSystem" + args, data);
  } catch (error) {
    mainWindow.webContents.send("receiveReadSystem" + args, null);
  }
});

ipcMain.on("sendUpdateSystem", async (event, args) => {
  try {
    const systemConfig = JSON.parse(args);
    const data = await updateSystem(systemConfig);
    mainWindow.webContents.send("receiveUpdateSystem", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdateSystem", false);
  }
});

// -------------- students ---------------- //

ipcMain.on("sendInsertStudent", async () => {
  try {
    const data = await addStudent();
    mainWindow.webContents.send("receiveInsertStudent", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveInsertStudent", false);
  }
});

ipcMain.on("sendUpdateStudent", async (event, args) => {
  try {
    const payload = JSON.parse(args);
    const data = await updateStudent(payload.id, payload.field, payload.value);
    mainWindow.webContents.send("receiveUpdateStudent", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdateStudent", false);
  }
});

ipcMain.on("sendGetStudentById", async (event, args) => {
  try {
    const data = await getStudentById(args);   
    mainWindow.webContents.send("receiveGetStudentById", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetStudentById", null);
  }
});

ipcMain.on("sendGetStudentParentByCode", async (event, args) => {
  try {
    const data = await getStudentParentByCode(args);
    mainWindow.webContents.send("receiveGetStudentParentByCode", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetStudentParentByCode", null);
  }
});

ipcMain.on("sendSaveStudentParentText", async (event, args) => {
  try {
    const data = await updateStudentText(args.studentId, args.text);
    mainWindow.webContents.send("receiveSaveStudentParentText", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveSaveStudentParentText", false);
  }
});

// -------------- tasks ---------------- //

ipcMain.on("sendInsertTask", async () => {
  try {
    const data = await addTask();
    mainWindow.webContents.send("receiveInsertTask", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveInsertTask", false);
  }
});

ipcMain.on("sendUpdateTask", async (event, args) => {  
  try {
    const payload = JSON.parse(args);
    const data = await updateTask(payload.code, payload.field, payload.value);
    mainWindow.webContents.send("receiveUpdateTask", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdateTask", false);
  }
});

ipcMain.on("sendGetTaskByCode", async (event, args) => {
  try {
    const data = await getTaskByCode(args);
    mainWindow.webContents.send("receiveGetTaskByCode", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetTaskByCode", null);
  }
});

// -------------- products ---------------- //

ipcMain.on("sendInsertProduct", async () => {
  try {
    const data = await addProduct();
    mainWindow.webContents.send("receiveInsertProduct", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveInsertProduct", false);
  }
});

ipcMain.on("sendUpdateProduct", async (event, args) => {  
  try {
    const payload = JSON.parse(args);
    const data = await updateProduct(payload.code, payload.field, payload.value);
    mainWindow.webContents.send("receiveUpdateProduct", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdateProduct", false);
  }
});

ipcMain.on("sendGetProductByCode", async (event, args) => {
  try {
    const data = await getProductByCode(args);
    mainWindow.webContents.send("receiveGetProductByCode", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetProductByCode", null);
  }
});

// -------------- tests ---------------- //

ipcMain.on("sendGetTestByCode", async (event, args) => {
  try {
    const data = await getTestByCode(args);
    mainWindow.webContents.send("receiveGetTestByCode", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetTestByCode", null);
  }
});
// -------------- studentsTasks ---------------- //

ipcMain.on("sendIsTaskUsed", async (event, args) => {
  try {
    const { currentResult } = args;
    
    const data = await isTaskUsed(currentResult.id);
    mainWindow.webContents.send("receiveIsTaskUsed", data);
    
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveIsTaskUsed", null);
  }
});

ipcMain.on("sendIsProductUsed", async (event, args) => {
  try {
    const data = await isProductUsed(args);
    mainWindow.webContents.send("receiveIsProductUsed", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveIsProductUsed", null);
  }
});

ipcMain.on("sendMarkProductAsUsed", async (event, args) => {
  try {
    const data = await markProductAsUsed(args);
    mainWindow.webContents.send("receiveMarkProductAsUsed", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveMarkProductAsUsed", false);
  }
});

ipcMain.on("sendHasStudentDoneSelected", async (event, args) => {
  try {
    const { currentStudent, currentResult } = args;
    
    const data = await hasStudentDoneSelected(currentStudent.id, currentResult.id, currentResult.multiple);
    mainWindow.webContents.send("receiveHasStudentDoneSelected", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveHasStudentDoneSelected", null);
  }
});

ipcMain.on("sendSaveStudentTask", async (event, args) => {
  try {
    const { currentStudent, currentResult, currentTable } = args;
    const points = await saveStudentTask(currentStudent.id, currentResult.id, currentTable);
    mainWindow.webContents.send("receiveSaveStudentData", points);
  } catch (error) {
    console.error("Error saving student data:", error);
    mainWindow.webContents.send("receiveSaveStudentData", false);
  }
});


ipcMain.on("sendSaveStudentProduct", async (event, args) => {
  try {
    const { currentStudent, currentResult} = args;
    const points = await saveStudentProduct(currentStudent.id, currentResult.id);
    mainWindow.webContents.send("receiveSaveStudentData", points);
  } catch (error) {
    console.error("Error saving student product:", error);
    mainWindow.webContents.send("receiveSaveStudentData", false);
  }
});

ipcMain.on("sendGetStatistics", async () => {
  try {
    const data = await getStatistics();
    mainWindow.webContents.send("receiveGetStatistics", data);
  } catch (error) {
    console.error("Error reading statistics:", error);
    mainWindow.webContents.send("receiveGetStatistics", null);
  }
});

ipcMain.on("sendSetDefaultTask", async (event, args) => {
  try {
    await setDefaultTask(args);
    mainWindow.webContents.send("receiveSetDefaultTask", await readData('tasks'));
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveSetDefaultTask", null);
  }
});

ipcMain.on("sendGetDefaultTask", async () => {
  try {
    mainWindow.webContents.send("receiveGetDefaultTask", await getDefaultTask());
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetDefaultTask", null);
  }
});

// -------------- prizes ---------------- //

ipcMain.on("sendAddPrize", async () => {
  try {
    await addPrize();
    mainWindow.webContents.send("receiveAddPrize", await readPrizes());
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveAddPrize", null);
  }
});

ipcMain.on("sendUpdatePrize", async (event, args) => {
  try {
    await updatePrize(args.id, args.field, args.value);
    mainWindow.webContents.send("receiveUpdatePrize", await readPrizes());
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdatePrize", null);
  }
});

ipcMain.on("sendDeletePrize", async (event, args) => {
  try {
    await deletePrize(args);
    mainWindow.webContents.send("receiveDeletePrize", await readPrizes());
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveDeletePrize", null);
  }
});

ipcMain.on("sendReadPrizes", async () => {
  try {
    mainWindow.webContents.send("receiveReadPrizes", await readPrizes());
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveReadPrizes", []);
  }
});

ipcMain.on("sendReadPrizeWinners", async () => {
  try {
    mainWindow.webContents.send("receiveReadPrizeWinners", await readPrizeWinners());
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveReadPrizeWinners", []);
  }
});

ipcMain.on("sendUpdatePrizeWinner", async (event, args) => {
  try {
    await updatePrizeWinner(args.id, args.given);
    mainWindow.webContents.send("receiveUpdatePrizeWinner", true);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdatePrizeWinner", false);
  }
});

ipcMain.on("sendDrawPrize", async (event, args) => {
  try {
    mainWindow.webContents.send("receiveDrawPrize", await drawPrize(args));
  } catch (error) {
    console.error("Error drawing prize:", error);
    mainWindow.webContents.send("receiveDrawPrize", null);
  }
});

// -------------- station hours ---------------- //

// נשמר בקובץ ליד המסד ולא בתוכו, כדי לא לגעת בסכימה של מוסד שכבר מותקן
// ברירת המחדל לפתיחה היא חצות, כדי שעמדה שלא הוגדרה לה שעה תתנהג כמו קודם
const DEFAULT_OPENING_TIME = '00:00';
const DEFAULT_CLOSING_TIME = '08:30';
const TIME_FORMAT = /^\d{2}:\d{2}$/;

function stationHoursPath() {
  return path.join(app.getPath('userData'), 'stationHours.json');
}

function readStationHours() {
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(stationHoursPath(), 'utf8'));
  } catch (error) {
    // אין קובץ עדיין - נשארים עם ברירות המחדל
  }
  return {
    openingTime: TIME_FORMAT.test(parsed.openingTime) ? parsed.openingTime : DEFAULT_OPENING_TIME,
    closingTime: TIME_FORMAT.test(parsed.closingTime) ? parsed.closingTime : DEFAULT_CLOSING_TIME
  };
}

ipcMain.on("sendReadStationHours", () => {
  mainWindow.webContents.send("receiveReadStationHours", readStationHours());
});

ipcMain.on("sendSaveStationHours", (event, args) => {
  try {
    if (!TIME_FORMAT.test(args.openingTime) || !TIME_FORMAT.test(args.closingTime)) {
      throw new Error('Invalid station hours: ' + JSON.stringify(args));
    }
    fs.writeFileSync(stationHoursPath(), JSON.stringify({
      openingTime: args.openingTime,
      closingTime: args.closingTime
    }), 'utf8');
    mainWindow.webContents.send("receiveSaveStationHours", true);
  } catch (error) {
    console.error('Failed to save station hours:', error);
    mainWindow.webContents.send("receiveSaveStationHours", false);
  }
});

// -------------- utils ---------------- //

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

ipcMain.on("sendPrint", (event, args) => {
  let printWindow = new BrowserWindow({ show: false, width: 302, height: 600 });
  let printFinished = false;
  const fontData = fs.readFileSync(path.join(__dirname, 'fonts', 'FbMagnolia-Regular.otf')).toString('base64');
  const receiptHtml = String(args).replace('</head>', `
    <style>
      @font-face {
        font-family: mainFont;
        src: url("data:font/otf;base64,${fontData}") format("opentype");
      }
      @page { size: 80mm auto; margin: 0; }
      html, body {
        width: 80mm;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      body {
        box-sizing: border-box;
        padding: 2mm 5mm 2mm 2mm;
        direction: rtl;
        font-family: mainFont, Arial, sans-serif;
      }
      * { box-sizing: border-box; }
    </style>
  </head>`);

  const finishPrint = (success) => {
    if (printFinished) {
      return;
    }
    printFinished = true;
    if (mainWindow) {
      mainWindow.webContents.send("receivePrint", success);
    }
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
      printWindow = null;
    }
  };

  printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHtml));
  printWindow.webContents.once('did-finish-load', async () => {
    // רשת ביטחון: אם ההדפסה לא מחזירה תשובה (למשל כשהמדפסת מנותקת),
    // נחזיר receivePrint בכל מקרה אחרי 5 שניות.
    setTimeout(() => finishPrint(false), 5000);
    try {
      await printWindow.webContents.executeJavaScript('document.fonts ? document.fonts.ready : Promise.resolve()');
      const printers = await printWindow.webContents.getPrintersAsync();
      if (!printers || printers.length === 0) {
        finishPrint(false);
        return;
      }
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: 80000, height: 200000 },
          scaleFactor: 100
        },
        (success, errorType) => {
          finishPrint(success);
        }
      );
    } catch (err) {
      console.error('Print error:', err);
      finishPrint(false);
    }
  });
});

function registerDownloadHandler() {
  session.defaultSession.on('will-download', (e, downloadItem, webContents) => {
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
}

// -------------- electron ---------------- //

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

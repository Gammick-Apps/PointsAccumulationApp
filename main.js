const { app, BrowserWindow, ipcMain, session, dialog } = require('electron')
const fs = require('fs')
let mainWindow
const { initDatabase, waitDB, readData, readSystem, writeSystem, closeDatabase, insertExcelToDB,
  addStudents, updateStudents, addTask, updateTask, addProduct, updateProducts, getStudentsById, getTaskByCode,
  isTaskUsed, hasStudentDoneTask,saveStudentTask, saveStudentProduct,saveStudentData, DB_FLAG_INCONSISTENT_ERROR_CODE } = require('./db/sqlite-storage');

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
  createWindow();
  try {
    await initDatabase(app);
  } catch (error) {
    if (error && error.code === DB_FLAG_INCONSISTENT_ERROR_CODE) {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.loadFile('pages/main/dbError.html');
      }
      return;
    }
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
  if (args[1] && typeof args[1] === "string" && args[1].trim() !== "") {
    try {
      JSON.parse(args[1]);
      const data = await writeSystem(args[1]);
      mainWindow.webContents.send("receiveUpdateSystem" + args[0], data);
    } catch (e) {
      console.error(e instanceof SyntaxError ? "Invalid JSON data:" : "Save failed:", e);
      mainWindow.webContents.send("receiveUpdateSystem" + args[0], false);
    }
  } else {
    console.error("Empty or invalid data.");
    mainWindow.webContents.send("receiveUpdateSystem" + args[0], false);
  }
});

// -------------- students ---------------- //

ipcMain.on("sendInsertStudent", async () => {
  try {
    const data = await addStudents();
    mainWindow.webContents.send("receiveInsertStudent", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveInsertStudent", false);
  }
});

ipcMain.on("sendUpdateStudent", async (event, args) => {
  try {
    const payload = JSON.parse(args);
    const data = await updateStudents(payload.tz, payload.field, payload.value);
    mainWindow.webContents.send("receiveUpdateStudent", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdateStudent", false);
  }
});

ipcMain.on("sendGetStudentById", async (event, args) => {
  try {
    const data = await getStudentsById(args);   
    mainWindow.webContents.send("receiveGetStudentById", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveGetStudentById", null);
  }
});

// -------------- uniqTasks ---------------- //

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
    const data = await updateProducts(payload.code, payload.field, payload.value);
    mainWindow.webContents.send("receiveUpdateProduct", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveUpdateProduct", false);
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

ipcMain.on("sendHasStudentDoneTask", async (event, args) => {
  try {
    const { currentStudent, currentResult } = args;
    const data = await hasStudentDoneTask(currentStudent.id, currentResult.id);
    mainWindow.webContents.send("receiveHasStudentDoneTask", data);
  } catch (error) {
    console.error(error);
    mainWindow.webContents.send("receiveHasStudentDoneTask", null);
  }
});

ipcMain.on("sendSaveStudentData", async (event, args) => {
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
  let printWindow = new BrowserWindow({ show: false });
  let printFinished = false;

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

  printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args));
  printWindow.webContents.once('did-finish-load', async () => {
    // רשת ביטחון: אם ההדפסה לא מחזירה תשובה (למשל כשהמדפסת מנותקת),
    // נחזיר receivePrint בכל מקרה אחרי 5 שניות.
    setTimeout(() => finishPrint(false), 5000);
    try {
      const printers = await printWindow.webContents.getPrintersAsync();
      if (!printers || printers.length === 0) {
        finishPrint(false);
        return;
      }
      printWindow.webContents.print(
        { silent: true, printBackground: true },
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

//-----------------------//

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

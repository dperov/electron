const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Логирование в файл ---
const appName = app.getName ? app.getName() : 'electron-img-viewer';
const logPath = path.join(app.getPath('userData'), `${appName}.log`);
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function logToFile(...args) {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
}

console.log = logToFile;
console.warn = logToFile;
console.error = logToFile;

const SETTINGS_SUFFIX = '.coords.json';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile('index.html');

  // --- Открытие файла из командной строки ---
  // process.argv[1] — путь к main.js, process.argv[2] — первый пользовательский аргумент
  const imageArg = process.argv.slice(1).find(arg =>
    /\.(png|jpg|jpeg|gif|bmp)$/i.test(arg)
  );
  if (imageArg && fs.existsSync(imageArg)) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => { // небольшой таймаут для полной инициализации
        win.webContents.send('load-image', imageArg);
      }, 100);
    });
  }

  // Меню "Открыть файл"
  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Открыть...',
          accelerator: 'Ctrl+O',
          click: async () => {
            const { filePaths } = await dialog.showOpenDialog(win, {
              properties: ['openFile'],
              filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','gif','bmp'] }]
            });
            if (filePaths && filePaths[0]) {
              win.webContents.send('load-image', filePaths[0]);
            }
          }
        },
        {type:'separator'},
        {role: 'quit'},
        {
            role: 'toggleDevTools',
            label: 'Открыть DevTools',
            accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I'
        },        
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // IPC: Приём из renderer — когда нужно выбрать файл через кнопку
  ipcMain.handle('choose-file', async () => {
    const { filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{name:'Images',extensions:['png','jpg','jpeg','gif','bmp']}]
    });
    return (filePaths && filePaths[0]) ? filePaths[0] : null;
  });

  // IPC: Чтение картинки
  ipcMain.handle('read-image', (event, filepath) => {
    const ext = path.extname(filepath).slice(1);
    const base64 = fs.readFileSync(filepath).toString('base64');
    return `data:image/${ext};base64,${base64}`;
  });

  // IPC: Сохранение пользовательских координат
  ipcMain.handle('save-coords', async (event, imagePath, coordsObj) => {
    try {
      const settingsPath = imagePath + SETTINGS_SUFFIX;
      fs.writeFileSync(settingsPath, JSON.stringify(coordsObj, null, 2), 'utf8');
      return true;
    } catch (e) {
      return false;
    }
  });

  // IPC: Загрузка пользовательских координат
  ipcMain.handle('load-coords', async (event, imagePath) => {
    try {
      const settingsPath = imagePath + SETTINGS_SUFFIX;
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (e) {
      return null;
    }
  });
}

app.disableHardwareAcceleration();
app.whenReady().then(createWindow);


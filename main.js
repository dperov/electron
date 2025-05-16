const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  win.loadFile('index.html');

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
}


console.log("Starting...");

app.whenReady().then(createWindow);


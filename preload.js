const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  readImage: (fp) => ipcRenderer.invoke('read-image', fp),
  onLoadImage: (callback) => ipcRenderer.on('load-image', (event, fp) => callback(fp))
});


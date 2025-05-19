let tabs = [];
let current = -1;

const tabsDiv = document.getElementById('tabs');
const viewerArea = document.getElementById('viewerArea');
const dropZone = document.getElementById('dropzone');
const coordX = document.getElementById('coordX');
const coordY = document.getElementById('coordY');
const modeMoveBtn = document.getElementById('mode-move');
const modeRectBtn = document.getElementById('mode-rect');
const copyRectBtn = document.getElementById('copy-rect');
const statusLine = document.getElementById('statusline');
const setTransformBtn = document.getElementById('set-transform');
const userXField = document.getElementById('userX');
const userYField = document.getElementById('userY');
const transformModal = document.getElementById('transform-modal');
const applyTransformBtn = document.getElementById('apply-transform');
const cancelTransformBtn = document.getElementById('cancel-transform');
const ux0 = document.getElementById('ux0'), uy0 = document.getElementById('uy0');
const ux1 = document.getElementById('ux1'), uy1 = document.getElementById('uy1');
const ux2 = document.getElementById('ux2'), uy2 = document.getElementById('uy2');
const ux3 = document.getElementById('ux3'), uy3 = document.getElementById('uy3');

const toolLineBtn = document.getElementById('tool-line');
const toolClearBtn = document.getElementById('tool-clear');

const statusMode = document.getElementById('status-mode');
const statusMsg = document.getElementById('status-msg');

const modeDebugBtn = document.getElementById('mode-debug');
let imgHidden = false;

const userWField = document.getElementById('userW');
const userHField = document.getElementById('userH');

modeDebugBtn.onclick = () => {
  imgHidden = !imgHidden;
  modeDebugBtn.classList.toggle('active', imgHidden);
  modeDebugBtn.title = imgHidden ? 'Показать картинку' : 'Отладка SVG-слоя';
  //tabs.forEach(tab => {
  //  const img = tab.imgbox.querySelector('img');
  //  if (img) img.style.display = imgHidden ? 'none' : '';
  //});
  if (tabs[current]) fitUserRectToViewer(tabs[current]);
};

let drawMode = null; // null | 'line'
let lines = []; // [{tabIdx, x0, y0, x1, y1}]
let currentLine = null;

let crosshairDiv = document.createElement('div');
crosshairDiv.className = 'crosshair-lines';
crosshairDiv.innerHTML = `<div class="hline"></div><div class="vline"></div>`;
viewerArea.appendChild(crosshairDiv);

let cursorMode = 'move'; // 'move' | 'rect'
let transformActive = false;
let transformMatrix = null;
let rectImageCorners = null; // [{x,y},...]
let currentImagePath = null;

modeMoveBtn.onclick = () => setCursorMode('move');
modeRectBtn.onclick = () => setCursorMode('rect');

toolLineBtn.onclick = () => {
  drawMode = 'line';
  cursorMode = null; // явно, чтобы не было конфликтов
  toolLineBtn.classList.add('active');
  modeMoveBtn.classList.remove('active');
  modeRectBtn.classList.remove('active');
  updateStatusMode();
};

toolClearBtn.onclick = () => {
  lines = [];
  redrawLines();
  setCursorMode('move');
  drawMode = null;
  toolLineBtn.classList.remove('active');
  setStatusMsg('Все линии удалены');
};

function setCursorMode(mode) {
  cursorMode = mode;
  drawMode = null;
  toolLineBtn.classList.remove('active');
  modeMoveBtn.classList.toggle('active', mode === 'move');
  modeRectBtn.classList.toggle('active', mode === 'rect');
  copyRectBtn.disabled = mode !== 'rect';
  setTransformBtn.disabled = mode !== 'rect';
  if (mode === 'move') {
    crosshairDiv.style.display = 'block';
  } else {
    crosshairDiv.style.display = 'none';
  }
  // Скрыть прямоугольник выделения во всех imgbox
  if (mode === 'move') {
    tabs.forEach(tab => {
      const rectDiv = tab.imgbox.querySelector('div[style*="dashed"]');
      if (rectDiv) rectDiv.style.display = 'none';
    });
  }
  updateStatusMode();
  setStatusMsg(''); // <--- очищаем сообщение при смене режима!
}

// --- Обновление строки статуса ---
function updateStatusMode() {
  let modeStr = '';
  if (drawMode === 'line') modeStr = 'Рисование линии';
  else if (cursorMode === 'rect') modeStr = 'Выделение';
  else modeStr = 'Перемещение';
  statusMode.textContent = modeStr;
}

function setStatusMsg(msg) {
  statusMsg.textContent = msg || '';
}

// --- Переопределить setStatus для вывода в статусбар ---
function setStatus(msg) {
  setStatusMsg(msg);
}

// Горячие клавиши V и R
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key.toLowerCase() === 'v') setCursorMode('move');
  if (e.key.toLowerCase() === 'r') setCursorMode('rect');
}); // ← добавлена закрывающая скобка и точка с запятой

// 1. TAB MANAGER

function redrawTabs() {
  tabsDiv.innerHTML = "";
  tabs.forEach((t, idx) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (current === idx ? ' active' : ''); // <-- пробел перед active!
    tab.innerText = t.name;
    const closer = document.createElement('span');
    closer.className = 'tab-close';
    closer.innerText = '×';
    closer.onclick = (e) => {e.stopPropagation(); closeTab(idx);};
    tab.appendChild(closer);
    tab.onclick = () => { selectTab(idx);};
    tabsDiv.appendChild(tab);
  });
  const addTab = document.createElement("div");
  addTab.id = "addtab";
  addTab.innerText = "+";
  addTab.onclick = openImage;
  tabsDiv.appendChild(addTab);
}

function selectTab(idx) {
  if (idx < 0 || idx >= tabs.length) return;
  tabs.forEach((tab, i) => {
    tab.imgbox.classList.toggle('active', i===idx);
    tab.imgbox.style.zIndex = (i===idx) ? 10 : 1;
  });
  current = idx;
  redrawTabs();
}

function closeTab(idx) {
  if (idx < 0 || idx >= tabs.length) return;
  viewerArea.removeChild(tabs[idx].imgbox);
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    current = -1;
    redrawTabs();
    return;
  }
  if (current >= tabs.length) current = tabs.length-1;
  selectTab(current);
  redrawTabs();
}

// 2. FILE LOADING (via menu/btn)

async function openImage() {
  const fp = await window.api.chooseFile();
  if (!fp) return;
  showImage(fp);
}

window.api.onLoadImage((fp) => { showImage(fp); });

// 3. Добавление картинки

async function showImage(filepath) {
  const dataurl = await window.api.readImage(filepath);
  const name = filepath.split(/[\\/]/).pop();

  // Создание контейнера imgbox
  const imgbox = document.createElement('div');
  imgbox.className = 'imgbox active';
  const img = document.createElement('img');
  img.src = dataurl;
  imgbox.appendChild(img);

  // --- Новый canvas-слой для линий и креста ---
  const overlay = document.createElement('canvas');
  overlay.className = 'overlay-canvas';
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = 30;
  imgbox.appendChild(overlay);

  viewerArea.appendChild(imgbox);

  // Сбросить активность прошлых картинок
  tabs.forEach(tab => { tab.imgbox.classList.remove('active'); });

  // Добавить новый таб
  tabs.push({ name, filepath, imgbox, scale:1, offsetX:0, offsetY:0, drag:false, lastX:0, lastY:0 });
  current = tabs.length-1;
  activatePanZoom(tabs[tabs.length-1]);
  selectTab(current);
  redrawTabs();

  currentImagePath = filepath;

  // Загружаем настройки координат, если есть
  const coords = await window.api.loadCoords(filepath);
  if (
    coords &&
    typeof coords.image_x0 === 'number' &&
    typeof coords.image_x1 === 'number' &&
    typeof coords.image_y0 === 'number' &&
    typeof coords.image_y1 === 'number' &&
    typeof coords.user_x0 === 'number' &&
    typeof coords.user_x1 === 'number' &&
    typeof coords.user_y0 === 'number' &&
    typeof coords.user_y1 === 'number'
  ) {
    rectImageCorners = [
      { x: coords.image_x0, y: coords.image_y0 }, // левый нижний
      { x: coords.image_x1, y: coords.image_y0 }, // правый нижний
      { x: coords.image_x1, y: coords.image_y1 }, // правый верхний
      { x: coords.image_x0, y: coords.image_y1 }  // левый верхний
    ];
    userCorners = [
      { x: coords.user_x0, y: coords.user_y0 }, // левый нижний
      { x: coords.user_x1, y: coords.user_y0 }, // правый нижний
      { x: coords.user_x1, y: coords.user_y1 }, // правый верхний
      { x: coords.user_x0, y: coords.user_y1 }  // левый верхний
    ];
    transformMatrix = computeQuadTransform(rectImageCorners, userCorners);
    transformActive = true;
    setStatusMsg('Загружены пользовательские координаты');
    // Восстановить значения в модальном окне (если нужно)
    ux0.value = new Date(coords.user_x0).toISOString().slice(0,16);
    ux1.value = new Date(coords.user_x1).toISOString().slice(0,16);
    uy0.value = coords.user_y0;
    uy1.value = coords.user_y1;

    // --- ВЫЗОВ ФУНКЦИИ АВТОМАСШТАБИРОВАНИЯ ---
    fitUserRectToViewer(tabs[current]);
  }
}

// 4. Масштаб+drag для каждой картинки

function activatePanZoom(tab) {
  const img = tab.imgbox.querySelector('img');
  let {imgbox} = tab;
  
  function updateTransform() {
    img.style.transform = 
      `translate(${tab.offsetX}px,${tab.offsetY}px) scale(${tab.scale})`;
    // canvas overlay должен получать тот же transform:
    const overlay = tab.imgbox.querySelector('canvas.overlay-canvas');
    if (overlay) {
        overlay.style.transform = img.style.transform;
    }
    redrawLines();
  }

  // --- Режим выделения прямоугольника ---
  let rectSelect = null;
  let rectStart = null;
  let autoScrollTimer = null;

  imgbox.addEventListener('mousedown', (e) => {
    if (drawMode === 'line' && e.button === 0 && tabs[current].imgbox === imgbox) {
      const rect = img.getBoundingClientRect();
      // SVG-система: X слева направо, Y сверху вниз
      const x = (e.clientX - rect.left) / tab.scale;
      const y = (e.clientY - rect.top) / tab.scale;
      currentLine = { tabIdx: current, x0: x, y0: y, x1: x, y1: y };
      redrawLines();

      function onMove(ev) {
        const x2 = (ev.clientX - rect.left) / tab.scale;
        const y2 = (ev.clientY - rect.top) / tab.scale;
        currentLine.x1 = x2;
        currentLine.y1 = y2;
        redrawLines();
        updateUserLineWH(currentLine.x0, currentLine.y0, currentLine.x1, currentLine.y1);
      }
      function onUp(ev) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (
          currentLine &&
          (Math.abs(currentLine.x1 - currentLine.x0) > 1 ||
           Math.abs(currentLine.y1 - currentLine.y0) > 1)
        ) {
          lines.push({ ...currentLine, color: currentLineColor }); // сохраняем цвет
          setStatusMsg(
            `Нарисована линия: x₀=${currentLine.x0.toFixed(1)}, y₀=${currentLine.y0.toFixed(1)} — x₁=${currentLine.x1.toFixed(1)}, y₁=${currentLine.y1.toFixed(1)}`
          );
        }
        currentLine = null;
        redrawLines();
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
      return;
    }
    if (cursorMode === 'rect') {
      const rect = img.getBoundingClientRect();
      // Проверяем, что клик по картинке
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom
      ) return;

      rectStart = {
        x: (e.clientX - rect.left) / tab.scale,
        y: (rect.bottom - e.clientY) / tab.scale // исправлено!
      };

      if (!rectSelect) {
        rectSelect = document.createElement('div');
        rectSelect.style.position = 'absolute';
        rectSelect.style.border = '2px dashed #4af';
        rectSelect.style.background = 'rgba(80,160,255,0.15)';
        rectSelect.style.pointerEvents = 'none';
        rectSelect.style.zIndex = 20;
        imgbox.appendChild(rectSelect);
      }
      rectSelect.style.display = 'block';
      updateRect(e);

      function onMouseMove(ev) {
        updateRect(ev);
        handleAutoScroll(ev, tab, img, imgbox);
      }
      function onMouseUp(ev) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        stopAutoScroll();
      }
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    } else if (cursorMode === 'move' && e.ctrlKey) {
      tab.drag = true;
      tab.lastX = e.clientX; tab.lastY = e.clientY;
      imgbox.style.cursor = 'grabbing';
      crosshairDiv.style.display = 'none';
      function onDragMove(ev) {
        if (!tab.drag) return;
        tab.offsetX += ev.clientX - tab.lastX;
        tab.offsetY += ev.clientY - tab.lastY;
        tab.lastX = ev.clientX;
        tab.lastY = ev.clientY;
        updateTransform();
      }
      function onDragUp(ev) {
        tab.drag = false;
        imgbox.style.cursor = 'grab';
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragUp);
      }
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragUp);
    } else {
      // --- Обычный режим перемещения ---
      tab.drag = true;
      tab.lastX = e.clientX; tab.lastY = e.clientY;
      imgbox.style.cursor = 'grabbing';

      function onDragMove(ev) {
        if (!tab.drag) return;
        tab.offsetX += ev.clientX - tab.lastX;
        tab.offsetY += ev.clientY - tab.lastY;
        tab.lastX = ev.clientX;
        tab.lastY = ev.clientY;
        updateTransform();
      }
      function onDragUp(ev) {
        tab.drag = false;
        imgbox.style.cursor = 'grab';
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragUp);
      }
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragUp);
    }
  });

  function updateRect(e) {
    const rect = img.getBoundingClientRect();
    // X — слева направо, Y — снизу вверх!
    const x = (e.clientX - rect.left) / tab.scale;
    const y = (rect.bottom - e.clientY) / tab.scale;
  
    // rectStart.x/y — координаты начала выделения (в той же системе)
    const x0 = Math.min(rectStart.x, x);
    const y0 = Math.min(rectStart.y, y);
    const x1 = Math.max(rectStart.x, x);
    const y1 = Math.max(rectStart.y, y);
  
    // Преобразуем координаты в px относительно imgbox
    rectSelect.style.left = (x0 * tab.scale + rect.left - imgbox.getBoundingClientRect().left) + 'px';
    rectSelect.style.top = ((rect.bottom - y1 * tab.scale) - imgbox.getBoundingClientRect().top) + 'px';
    rectSelect.style.width = ((x1 - x0) * tab.scale) + 'px';
    rectSelect.style.height = ((y1 - y0) * tab.scale) + 'px';
  
    // Сохраняем выделение в новой системе координат
    lastRectSelection = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    lastRectTab = tab;
  
    // --- Заполнение userW и userH ---
    if (transformActive && transformMatrix) {
      // corners: левый нижний и правый верхний
      const [ux0, uy0] = applyQuadTransform(transformMatrix, x0, y0);
      const [ux1, uy1] = applyQuadTransform(transformMatrix, x1, y1);
      userWField.value = formatDuration(ux1 - ux0);      // userW = разница по X как длительность
      setUserHField(uy0, uy1);                           // userH = разница по Y + %
    } else {
      userWField.value = '';
      userHField.value = '';
    }
  }

  function handleAutoScroll(e, tab, img, imgbox) {
    const boxRect = imgbox.getBoundingClientRect();
    const margin = 30; // px от края, где начинается автоскролл
    let dx = 0, dy = 0;
    if (e.clientX < boxRect.left + margin) dx = 15;
    if (e.clientX > boxRect.right - margin) dx = -15;
    if (e.clientY < boxRect.top + margin) dy = 15;
    if (e.clientY > boxRect.bottom - margin) dy = -15;
    if (dx !== 0 || dy !== 0) {
      if (!autoScrollTimer) {
        autoScrollTimer = setInterval(() => {
          tab.offsetX += dx;
          tab.offsetY += dy;
          img.style.transform = `translate(${tab.offsetX}px,${tab.offsetY}px) scale(${tab.scale})`;
        }, 16);
      }
    } else {
      stopAutoScroll();
    }
  }
  function stopAutoScroll() {
    if (autoScrollTimer) {
      clearInterval(autoScrollTimer);
      autoScrollTimer = null;
    }
  }

  imgbox.addEventListener('mousemove', (e) => {
    const rect = img.getBoundingClientRect();
    // Координаты мыши относительно картинки
    const x = ((e.clientX - rect.left) / tab.scale);
    // Инвертируем Y: снизу вверх
    const y = ((rect.bottom - e.clientY) / tab.scale);

    // Проверяем, что курсор действительно над картинкой
    if (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    ) {
      coordX.value = x.toFixed(1);
      coordY.value = y.toFixed(1);
    } else {
      coordX.value = '';
      coordY.value = '';
    }
    // Меняем курсор в зависимости от режима
    if (drawMode === 'line') {
      imgbox.style.cursor = 'crosshair'; // курсор-точка для рисования линии
    } else if (cursorMode === 'rect') {
      imgbox.style.cursor = 'crosshair';
    } else if (cursorMode === 'move') {
      if (e.ctrlKey) {
        imgbox.style.cursor = 'grab';
        crosshairDiv.style.display = 'none';
      } else {
        imgbox.style.cursor = 'none';
        crosshairDiv.style.display = 'block';
      }
    } else {
      imgbox.style.cursor = tab.drag ? 'grabbing' : 'grab';
    }
    // --- Крестовые линии ---
    if (cursorMode === 'move' && !e.ctrlKey) {
      crosshairDiv.style.display = 'block';
      const rect = viewerArea.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      crosshairDiv.querySelector('.hline').style.top = y + 'px';
      crosshairDiv.querySelector('.vline').style.left = x + 'px';
    } else {
      crosshairDiv.style.display = 'none';
    }
    showUserCoords(Number(x), Number(y));
  });

  imgbox.addEventListener('mouseleave', () => {
    coordX.value = '';
    coordY.value = '';
    stopAutoScroll();
    crosshairDiv.style.display = 'none';
  });

  imgbox.addEventListener('wheel', (e) => {
    // Масштаб только при зажатом Ctrl!
    if (!e.ctrlKey) return;
    e.preventDefault();

    // Получаем позицию мыши относительно imgbox
    const rect = imgbox.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Переводим в координаты изображения (до масштабирования)
    const imgX = (mx - tab.offsetX) / tab.scale;
    const imgY = (my - tab.offsetY) / tab.scale;

    // Меняем масштаб
    const oldScale = tab.scale;
    if (e.deltaY < 0) tab.scale *= 1.07;
    else tab.scale /= 1.07;
    tab.scale = Math.max(0.04, Math.min(tab.scale, 40));

    updateTransform();
}, { passive: false });

  img.onload = () => {
    tab.scale = 1;
    tab.offsetX = (viewerArea.clientWidth-img.width)/2;
    tab.offsetY = (viewerArea.clientHeight-img.height)/2;
    updateTransform();
  };
}

function drawDebugCrossOnImage(img) {
  // Создаём временный canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');

  // Рисуем исходное изображение
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Рисуем крест-накрест
  ctx.save();
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.moveTo(canvas.width, 0);
  ctx.lineTo(0, canvas.height);
  ctx.stroke();
  ctx.restore();

  // Подменяем src картинки на canvas
  img.src = canvas.toDataURL();
}

// --- Функция для отрисовки всех линий на активном imgbox ---
function redrawLines() {
  tabs.forEach((tab, idx) => {
    if (!tab.imgbox.classList.contains('active')) return;

    const img = tab.imgbox.querySelector('img');
    const overlay = tab.imgbox.querySelector('canvas.overlay-canvas');
    if (!img || !overlay) return;

    // Установить размеры canvas под картинку
    overlay.width = img.naturalWidth || img.width;
    overlay.height = img.naturalHeight || img.height;
    overlay.style.width = img.width + 'px';
    overlay.style.height = img.height + 'px';

    // --- ВАЖНО: синхронизировать transform canvas и img ---
    overlay.style.transform = img.style.transform;

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // --- Линии пользователя ---
    ctx.save();
    ctx.strokeStyle = '#ff6';
    ctx.lineWidth = 2;
    lines.filter(l => l.tabIdx === idx).forEach(l => {
      ctx.beginPath();
      ctx.strokeStyle = l.color || "#ff6";
      ctx.moveTo(l.x0, l.y0);
      ctx.lineTo(l.x1, l.y1);
      ctx.stroke();
    });

    // --- Текущая линия ---
    if (currentLine && currentLine.tabIdx === idx) {
      ctx.strokeStyle = currentLineColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentLine.x0, currentLine.y0);
      ctx.lineTo(currentLine.x1, currentLine.y1);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// --- Для хранения последнего выделения ---
let lastRectSelection = null;
let lastRectTab = null;

// Чтобы картинки не скроллили страницу (suppress дефолт wheel/page scroll)
window.addEventListener('wheel', (e) => {
  if (e.target.closest('.imgbox')) e.preventDefault();
}, {passive:false});

// --- Кнопка "Скопировать выделенное" ---
copyRectBtn.onclick = async () => {
  if (
    cursorMode !== 'rect' ||
    !lastRectSelection ||
    !lastRectTab ||
    !lastRectTab.imgbox
  ) return;

  const img = lastRectTab.imgbox.querySelector('img');
  const { x, y, w, h } = lastRectSelection;
  if (w < 1 || h < 1) return;

  const image = new window.Image();
  image.src = img.src;
  await new Promise(res => { image.onload = res; });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);

  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setStatusMsg(`Скопирована область: x=${Math.round(x)}, y=${Math.round(y)}, w=${Math.round(w)}, h=${Math.round(h)}`);
    } catch (err) {
      setStatusMsg('Не удалось скопировать выделение в буфер обмена');
      alert('Не удалось скопировать выделение в буфер обмена: ' + err);
    }
  }, 'image/png');
};

function setStatus(msg) {
  setStatusMsg(msg);
}

// Drag'n'drop файлов (не обязательно)
viewerArea.ondragover = (e)=>{e.preventDefault(); dropZone.style.display="flex";}
viewerArea.ondragleave = (e)=>{e.preventDefault();dropZone.style.display="none";}
viewerArea.ondrop = async (e)=> {
  e.preventDefault(); dropZone.style.display="none";
  for (let f of e.dataTransfer.files) showImage(f.path);
};

dropZone.ondragover = (e)=>e.preventDefault();
dropZone.ondragleave = (e)=>dropZone.style.display="none";
dropZone.ondrop = (e)=> { dropZone.style.display="none"; };

// --- Кнопка "Задать преобразование" ---
setTransformBtn.onclick = () => {
  if (
    cursorMode !== 'rect' ||
    !lastRectSelection ||
    !lastRectTab ||
    !lastRectTab.imgbox
  ) return;

  // corners: [левый нижний, правый нижний, правый верхний, левый верхний]
  // (Y снизу вверх, X слева направо)
  const { x, y, w, h } = lastRectSelection;
  rectImageCorners = [
    { x: x,     y: y+h }, // левый нижний
    { x: x+w,   y: y+h }, // правый нижний
    { x: x+w,   y: y   }, // правый верхний
    { x: x,     y: y   }  // левый верхний
  ];
  // Очистить поля
  ux0.value = '';
  ux1.value = '';
  uy0.value = '';
  uy1.value = '';
  transformModal.style.display = 'flex';
};

applyTransformBtn.onclick = () => {
  // Получаем время в миллисекундах UTC для X
  const xminDate = ux0.value ? new Date(ux0.value) : null;
  const xmaxDate = ux1.value ? new Date(ux1.value) : null;
  const ymin = parseFloat(uy0.value);
  const ymax = parseFloat(uy1.value);

  if ([ymin, ymax].some(v => isNaN(v)) || !xminDate || !xmaxDate || isNaN(xminDate.getTime()) || isNaN(xmaxDate.getTime())) {
    alert('Заполните все координаты!');
    return;
  }
  // Время в миллисекундах UTC
  const xmin = xminDate.getTime();
  const xmax = xmaxDate.getTime();

  // corners: [левый нижний, правый нижний, правый верхний, левый верхний]
  const userCorners = [
    { x: xmin, y: ymin }, // левый нижний
    { x: xmax, y: ymin }, // правый нижний
    { x: xmax, y: ymax }, // правый верхний
    { x: xmin, y: ymax }  // левый верхний
  ];
  transformMatrix = computeQuadTransform(rectImageCorners, userCorners);
  transformActive = true;

  // Сохраняем только 4 координаты для image и user
  const img = rectImageCorners;
  const usr = userCorners;
  window.api.saveCoords(
    currentImagePath,
    {
      image_x0: img[0].x,
      image_x1: img[1].x,
      image_y0: img[0].y,
      image_y1: img[2].y,
      user_x0: usr[0].x,
      user_x1: usr[1].x,
      user_y0: usr[0].y,
      user_y1: usr[2].y
    }
  );

  setStatus('Режим пользовательских координат включён');
  transformModal.style.display = 'none';
};

cancelTransformBtn.onclick = () => {
  transformModal.style.display = 'none';
};

// --- Пересчёт координат курсора ---
function showUserCoords(imgX, imgY) {
  if (transformActive && transformMatrix) {
    const [uX, uY] = applyQuadTransform(transformMatrix, imgX, imgY);
    userXField.value = formatDateTimeFromMillis(uX);
    userYField.value = uY.toFixed(2);
  } else {
    userXField.value = '';
    userYField.value = '';
  }
}

// Новая функция для миллисекунд UTC
function formatDateTimeFromMillis(ms) {
  if (!isFinite(ms)) return '';
  const d = new Date(Math.round(ms));
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

let currentLineColor = "#ff6"; // цвет по умолчанию

// Палитра цветов
const palette = document.getElementById('color-palette');
if (palette) {
  palette.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (swatch) {
      // Снять выделение со всех
      palette.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
      // Выделить выбранный
      swatch.classList.add('selected');
      currentLineColor = swatch.dataset.color;

      // Перейти в режим рисования линии
      drawMode = 'line';
      cursorMode = null;
      toolLineBtn.classList.add('active');
      modeMoveBtn.classList.remove('active');
      modeRectBtn.classList.remove('active');
      updateStatusMode();
    }
  });
  // Выделить первый цвет по умолчанию
  palette.querySelector('.color-swatch').classList.add('selected');
}

/**
 * Выводит значение userH: абсолютная разница + процент изменения (если возможно)
 * @param {number} oldVal - начальное значение
 * @param {number} newVal - конечное значение
 */
function setUserHField(oldVal, newVal) {
  const absDiff = Math.abs(newVal - oldVal);
  let percent = '';
  if (Math.abs(oldVal) > 1e-8) {
    percent = ((absDiff / Math.abs(oldVal)) * 100).toFixed(1) + '%';
  }
  userHField.value = absDiff.toFixed(2) + (percent ? ` (${percent})` : '');
}

function updateUserLineWH(x0, y0, x1, y1) {
  if (transformActive && transformMatrix) {
    const [ux0, uy0] = applyQuadTransform(transformMatrix, x0, y0);
    const [ux1, uy1] = applyQuadTransform(transformMatrix, x1, y1);

    // userW: разница по X (время)
    userWField.value = formatDuration(ux1 - ux0);

    // userH: абсолютная разница по Y + процент изменения
    setUserHField(uy0, uy1);
  } else {
    userWField.value = '';
    userHField.value = '';
  }
}

function formatDuration(ms) {
  if (!isFinite(ms)) return '';
  let totalMinutes = Math.abs(Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  totalMinutes -= days * 24 * 60;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${days}д ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Устанавливает масштаб и позицию так, чтобы пользовательский прямоугольник полностью помещался в окно viewerArea.
 * rectImageCorners — массив [{x,y}, ...] (левый нижний, правый нижний, правый верхний, левый верхний)
 * tab — объект текущей вкладки
 */
function fitUserRectToViewer(tab) {
  if (!rectImageCorners || rectImageCorners.length !== 4) return;
  const img = tab.imgbox.querySelector('img');
  if (!img) return;

  // Найти границы прямоугольника в координатах изображения
  const xs = rectImageCorners.map(c => c.x);
  const ys = rectImageCorners.map(c => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rectW = maxX - minX;
  const rectH = maxY - minY;

  // Размеры области просмотра
  const areaW = viewerArea.clientWidth;
  const areaH = viewerArea.clientHeight;

  // Вычислить масштаб так, чтобы прямоугольник полностью влезал в viewerArea
  const scaleX = areaW / rectW;
  const scaleY = areaH / rectH;
  const scale = Math.min(scaleX, scaleY);

  // Центр прямоугольника в координатах изображения
  const rectCenterX = (minX + maxX) / 2;
  const rectCenterY = (minY + maxY) / 2;

  // Центр области просмотра
  const areaCenterX = areaW / 2;
  const areaCenterY = areaH / 2;

  // Смещение: чтобы центр прямоугольника совпал с центром viewerArea
  tab.scale = scale;
  //tab.offsetX = areaCenterX - rectCenterX * scale;
  //tab.offsetY = areaCenterY - rectCenterY * scale;

  // Применить трансформацию
  if (typeof tab.imgbox.updateTransform === 'function') {
    tab.imgbox.updateTransform();
  } else if (typeof tab.updateTransform === 'function') {
    tab.updateTransform();
  } else {
    const img = tab.imgbox.querySelector('img');
    if (img) {
      img.style.transform = `translate(${tab.offsetX}px,${tab.offsetY}px) scale(${tab.scale})`;
      const overlay = tab.imgbox.querySelector('canvas.overlay-canvas');
      if (overlay) overlay.style.transform = img.style.transform;
    }
    redrawLines();
  }
}

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

function setCursorMode(mode) {
  cursorMode = mode;
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
    tab.className = 'tab' + (current === idx ? ' active' : '');
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
  if (coords && coords.rectImageCorners && coords.userCorners) {
    rectImageCorners = coords.rectImageCorners;
    transformMatrix = computeQuadTransform(rectImageCorners, coords.userCorners);
    transformActive = true;
    setStatus('Загружены пользовательские координаты');
    // Заполнить поля модального окна (если нужно)
    if (coords.y0str) uy0.value = coords.y0str;
    if (coords.y1str) uy1.value = coords.y1str;
    if (coords.x0str) ux0.value = coords.x0str;
    if (coords.x1str) ux1.value = coords.x1str;
  }
}

// 4. Масштаб+drag для каждой картинки

function activatePanZoom(tab) {
  const img = tab.imgbox.querySelector('img');
  let {imgbox} = tab;
  
  function updateTransform() {
    img.style.transform = 
      `translate(${tab.offsetX}px,${tab.offsetY}px) scale(${tab.scale})`;
  }

  // --- Режим выделения прямоугольника ---
  let rectSelect = null;
  let rectStart = null;
  let autoScrollTimer = null;

  imgbox.addEventListener('mousedown', (e) => {
    if (cursorMode === 'rect') {
      const rect = img.getBoundingClientRect();
      // Проверяем, что клик по картинке
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom
      ) return;

      rectStart = {
        x: (e.clientX - rect.left) / tab.scale,
        y: (e.clientY - rect.top) / tab.scale
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
    const x = (e.clientX - rect.left) / tab.scale;
    const y = (e.clientY - rect.top) / tab.scale;
    const x0 = Math.max(0, Math.min(rectStart.x, x));
    const y0 = Math.max(0, Math.min(rectStart.y, y));
    const x1 = Math.max(0, Math.max(rectStart.x, x));
    const y1 = Math.max(0, Math.max(rectStart.y, y));
    // Преобразуем координаты в px относительно imgbox
    rectSelect.style.left = (x0 * tab.scale + rect.left - imgbox.getBoundingClientRect().left) + 'px';
    rectSelect.style.top = (y0 * tab.scale + rect.top - imgbox.getBoundingClientRect().top) + 'px';
    rectSelect.style.width = ((x1 - x0) * tab.scale) + 'px';
    rectSelect.style.height = ((y1 - y0) * tab.scale) + 'px';
    // Сохраняем выделение
    lastRectSelection = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    lastRectTab = tab;
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
    // Получаем координаты мыши относительно imgbox
    const rect = img.getBoundingClientRect();
    // Координаты мыши относительно левого верхнего угла картинки
    const x = ((e.clientX - rect.left) / tab.scale).toFixed(1);
    const y = ((e.clientY - rect.top) / tab.scale).toFixed(1);
    // Проверяем, что курсор действительно над картинкой
    if (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    ) {
      coordX.value = x;
      coordY.value = y;
    } else {
      coordX.value = '';
      coordY.value = '';
    }
    // Меняем курсор в зависимости от режима
    if (cursorMode === 'rect') {
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
    console.log("wheel");
    // Масштаб только при зажатом Ctrl!
    if (!e.ctrlKey) return;
    e.preventDefault();
    const oldScale = tab.scale;
    if (e.deltaY<0) tab.scale *= 1.07;
    else tab.scale /= 1.07;
    tab.scale = Math.max(0.04, Math.min(tab.scale, 40));
    //const rect = imgbox.getBoundingClientRect();
    //let mx = e.clientX-rect.left, my = e.clientY-rect.top;
    //tab.offsetX = mx - (mx-tab.offsetX)*(tab.scale/oldScale);
    //tab.offsetY = my - (my-tab.offsetY)*(tab.scale/oldScale);
    updateTransform();
  }, {passive:false});

  img.onload = () => {
    tab.scale = 1;
    tab.offsetX = (viewerArea.clientWidth-img.width)/2;
    tab.offsetY = (viewerArea.clientHeight-img.height)/2;
    updateTransform();
  };
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
      setStatus(`Скопирована область: x=${Math.round(x)}, y=${Math.round(y)}, w=${Math.round(w)}, h=${Math.round(h)}`);
    } catch (err) {
      setStatus('Не удалось скопировать выделение в буфер обмена');
      alert('Не удалось скопировать выделение в буфер обмена: ' + err);
    }
  }, 'image/png');
};

function setStatus(msg) {
  if (statusLine) {
    statusLine.textContent = msg || '';
  }
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
  // Получаем время в миллисекундах, затем в минутах для X
  const xminDate = ux0.value ? new Date(ux0.value) : null;
  const xmaxDate = ux1.value ? new Date(ux1.value) : null;
  const ymin = parseFloat(uy0.value);
  const ymax = parseFloat(uy1.value);

  if ([ymin, ymax].some(v => isNaN(v)) || !xminDate || !xmaxDate || isNaN(xminDate.getTime()) || isNaN(xmaxDate.getTime())) {
    alert('Заполните все координаты!');
    return;
  }
  // Используем минуты с начала эпохи для X
  const xmin = Math.floor(xminDate.getTime() / 60000);
  const xmax = Math.floor(xmaxDate.getTime() / 60000);

  // corners: [левый нижний, правый нижний, правый верхний, левый верхний]
  const userCorners = [
    { x: xmin, y: ymin }, // левый нижний
    { x: xmax, y: ymin }, // правый нижний
    { x: xmax, y: ymax }, // правый верхний
    { x: xmin, y: ymax }  // левый верхний
  ];
  transformMatrix = computeQuadTransform(rectImageCorners, userCorners);
  transformActive = true;

  // Сохраняем настройки, сохраняем исходные строки дат для удобства
  window.api.saveCoords(
    currentImagePath,
    {
      rectImageCorners,
      userCorners,
      x0str: ux0.value,
      x1str: ux1.value
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
    userXField.value = formatDateTimeFromMinutes(uX);
    userYField.value = uY.toFixed(2);
  } else {
    userXField.value = '';
    userYField.value = '';
  }
}

// Вспомогательная функция
function formatDateTimeFromMinutes(mins) {
  if (!isFinite(mins)) return '';
  const ms = Math.round(mins) * 60000;
  const d = new Date(ms);
  // YYYY-MM-DD HH:mm
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


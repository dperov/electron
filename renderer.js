let tabs = [];
let current = -1;

const tabsDiv = document.getElementById('tabs');
const viewerArea = document.getElementById('viewerArea');
const dropZone = document.getElementById('dropzone');
const coordX = document.getElementById('coordX');
const coordY = document.getElementById('coordY');
const modeMoveBtn = document.getElementById('mode-move');
const modeRectBtn = document.getElementById('mode-rect');

let cursorMode = 'move'; // 'move' | 'rect'

modeMoveBtn.onclick = () => setCursorMode('move');
modeRectBtn.onclick = () => setCursorMode('rect');

function setCursorMode(mode) {
  cursorMode = mode;
  modeMoveBtn.classList.toggle('active', mode === 'move');
  modeRectBtn.classList.toggle('active', mode === 'rect');
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
    } else {
      imgbox.style.cursor = tab.drag ? 'grabbing' : 'grab';
    }
  });

  imgbox.addEventListener('mouseleave', () => {
    coordX.value = '';
    coordY.value = '';
    stopAutoScroll();
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

// Чтобы картинки не скроллили страницу (suppress дефолт wheel/page scroll)
window.addEventListener('wheel', (e) => {
  if (e.target.closest('.imgbox')) e.preventDefault();
}, {passive:false});

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

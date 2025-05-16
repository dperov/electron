// Решение системы 4x4 методом Гаусса
function solve4x4(A, B) {
  // Копируем матрицу и вектор, чтобы не портить исходные
  let M = A.map(row => row.slice());
  let b = B.slice();

  // Прямой ход
  for (let i = 0; i < 4; ++i) {
    // Поиск максимального по модулю элемента в столбце
    let maxRow = i;
    for (let j = i + 1; j < 4; ++j) {
      if (Math.abs(M[j][i]) > Math.abs(M[maxRow][i])) maxRow = j;
    }
    // Перестановка строк
    if (maxRow !== i) {
      [M[i], M[maxRow]] = [M[maxRow], M[i]];
      [b[i], b[maxRow]] = [b[maxRow], b[i]];
    }
    // Нормализация строки
    let f = M[i][i];
    if (Math.abs(f) < 1e-12) throw new Error("Система вырождена");
    for (let j = i; j < 4; ++j) M[i][j] /= f;
    b[i] /= f;
    // Вычитание из следующих строк
    for (let j = i + 1; j < 4; ++j) {
      let f2 = M[j][i];
      for (let k = i; k < 4; ++k) M[j][k] -= f2 * M[i][k];
      b[j] -= f2 * b[i];
    }
  }
  // Обратный ход
  let x = Array(4);
  for (let i = 3; i >= 0; --i) {
    x[i] = b[i];
    for (let j = i + 1; j < 4; ++j) x[i] -= M[i][j] * x[j];
  }
  return x;
}

// Вычисление коэффициентов билинейного преобразования
function computeQuadTransform(src, dst) {
  // src, dst: массивы из 4 точек {x,y}
  const X = [], Y = [], U = [], V = [];
  for (let i = 0; i < 4; ++i) {
    X.push(src[i].x);
    Y.push(src[i].y);
    U.push(dst[i].x);
    V.push(dst[i].y);
  }
  const M = [
    [1, X[0], Y[0], X[0]*Y[0]],
    [1, X[1], Y[1], X[1]*Y[1]],
    [1, X[2], Y[2], X[2]*Y[2]],
    [1, X[3], Y[3], X[3]*Y[3]],
  ];
  const a = solve4x4(M, U);
  const b = solve4x4(M, V);
  return { a, b };
}

// Применение билинейного преобразования
function applyQuadTransform(matrix, x, y) {
  const { a, b } = matrix;
  const u = a[0] + a[1]*x + a[2]*y + a[3]*x*y;
  const v = b[0] + b[1]*x + b[2]*y + b[3]*x*y;
  return [u, v];
}

// Для использования в других файлах
window.computeQuadTransform = computeQuadTransform;
window.applyQuadTransform = applyQuadTransform;
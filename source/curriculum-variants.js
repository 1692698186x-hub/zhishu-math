(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CurriculumVariants = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const supported = ['cnm_p001', 'cnm_p037', 'cnm_p061', 'cnm_p096', 'cnm_p132', 'cnm_p210', 'cnm_001', 'cnm_002', 'cnm_003', 'cnm_120', 'cnm_219'];
  function choices(texts, correct, shift) {
    const moved = texts.map((text, i) => ({ text, correct: i === correct }));
    const rotated = moved.slice(shift % moved.length).concat(moved.slice(0, shift % moved.length));
    return { choices: rotated.map((c, i) => ({ key: 'ABCD'[i], text: c.text })), answer: 'ABCD'[rotated.findIndex(c => c.correct)] };
  }
  function item(topicId, level, index) {
    if (!supported.includes(topicId) || !Number.isInteger(level) || level < 0 || level > 2 || !Number.isInteger(index) || index < 0 || index >= 120) throw Error('unsupported variation');
    const a = 2 + index % 8, b = 3 + Math.floor(index / 8) % 9, k = 2 + Math.floor(index / 3) % 6;
    let prompt, answer, explanation, choice;
    if (topicId === 'cnm_p001') {
      const missing = 1 + index % 5;
      prompt = '按从 1 到 5 的顺序数：' + [1, 2, 3, 4, 5].map(n => n === missing ? '□' : n).join('，') + '。□ 中应填几？'; answer = String(missing);
      explanation = '从 1 开始依次数 1、2、3、4、5，空缺的数是 ' + missing + '。';
    } else if (topicId === 'cnm_p037') {
      const color = index % 2 === 0, count = 2 + index;
      prompt = '小明正在按' + (color ? '颜色' : '形状') + '给 ' + count + ' 块积木分类。两块积木的' + (color ? '颜色相同、形状不同' : '形状相同、颜色不同') + '，应该怎样放？';
      choice = choices(['放在同一类，因为分类标准相同', '分成两类，因为其他特点不同', '不能分类，必须所有特点都相同'], 0, index);
      explanation = '一次分类先确定同一个标准。按' + (color ? '颜色' : '形状') + '分类时，只比较' + (color ? '颜色' : '形状') + '，其他特点不同不影响这次分类。';
    } else if (topicId === 'cnm_p061') {
      const minutes = 2 + index;
      prompt = minutes + ' 分是多少秒？（只填秒数）'; answer = String(minutes * 60);
      explanation = '1 分 = 60 秒，所以 ' + minutes + ' × 60 = ' + answer + ' 秒。';
    } else if (topicId === 'cnm_p096') {
      const digit = index % 10, value = (1 + Math.floor(index / 10)) * 10000 + digit * 1000 + 302;
      prompt = '数 ' + value + ' 的千位上是几？'; answer = String(digit);
      explanation = '从右向左依次是个位、十位、百位、千位，千位上的数字是 ' + digit + '。';
    } else if (topicId === 'cnm_p132') {
      const tenths = 1 + index % 49, copies = 2 + Math.floor(index / 7) % 8, price = tenths / 10;
      prompt = '每份材料重 ' + price + ' 千克，' + copies + ' 份共重多少千克？计算：' + price + ' × ' + copies + ' = ？'; answer = String(tenths * copies / 10);
      explanation = '先算 ' + tenths + ' × ' + copies + ' = ' + tenths * copies + '，再按一位小数确定小数点，得到 ' + answer + ' 千克。';
    } else if (topicId === 'cnm_p210') {
      const c = a * k, d = b * k + index % 2, outer = a * d, inner = b * c, equal = outer === inner;
      prompt = '比 ' + a + ':' + b + ' 与 ' + c + ':' + d + ' 能否组成比例？哪一项理由正确？';
      choice = choices([(equal ? '能' : '不能') + '，因为外项积 ' + outer + ' 与内项积 ' + inner + (equal ? ' 相等' : ' 不相等'), (equal ? '不能' : '能') + '，因为只要四个数不同就可以判断', '能，因为四个数都是正数'], 0, index);
      explanation = '判断比例要比较外项积与内项积：' + a + ' × ' + d + ' = ' + outer + '，' + b + ' × ' + c + ' = ' + inner + '。两积' + (equal ? '相等，所以能组成比例。' : '不相等，所以不能组成比例。');
    } else if (topicId === 'cnm_001') {
      const value = 1 + index;
      prompt = '已知 a = -' + value + '，下列各式中哪一个的值是正数？';
      choice = choices(['-a', 'a', 'a - ' + a, '0'], 0, index);
      explanation = 'a 是负数，-a = ' + value + ' 是正数；a 与 a - ' + a + ' 都为负，0 不是正数。';
    } else if (topicId === 'cnm_002') {
      const up = 2 + index % 23, down = 3 + Math.floor(index / 5) % 19;
      prompt = '规定水位上升记为正。水位先上升 ' + up + ' 厘米，再下降 ' + down + ' 厘米，与最初相比变化了多少厘米？（上升为正，下降为负）'; answer = String(up - down);
      explanation = '上升记作 +' + up + '，下降记作 -' + down + '，总变化为 ' + up + ' - ' + down + ' = ' + answer + ' 厘米。';
    } else if (topicId === 'cnm_003') {
      const n = 2 + index, odd = 2 * n + 1, values = [-n, 0, n + 3, odd + '/2', '-1/3'];
      prompt = '把 ' + values.join('，') + ' 按整数与分数分类，其中整数共有几个？'; answer = '3';
      explanation = '整数是 ' + -n + '、0、' + (n + 3) + '，共 3 个。' + odd + '/2 与 -1/3 都不是整数。';
    } else if (topicId === 'cnm_120') {
      const labels = ['DEF', 'DFE', 'EDF', 'EFD', 'FDE', 'FED'][index % 6], sides = [labels.slice(0, 2), labels[0] + labels[2], labels.slice(1, 3)];
      prompt = '已知 △ABC ≌ △' + labels + '，边 AB = ' + (2 + index) + ' 厘米。与 AB 对应的边是哪一条？';
      choice = choices(sides, 0, index);
      explanation = '全等式按对应顶点顺序书写，A 对应 ' + labels[0] + '，B 对应 ' + labels[1] + '，所以 AB 对应 ' + sides[0] + '。';
    } else {
      const coefficient = 2 + index % 11, linear = -(1 + Math.floor(index / 3) % 17), constant = 1 + index;
      prompt = '一元二次方程 ' + coefficient + 'x² - ' + -linear + 'x + ' + constant + ' = 0 中，二次项系数、一次项系数和常数项依次是多少？（用逗号分隔）'; answer = [coefficient, linear, constant].join(',');
      explanation = '对照 ax² + bx + c = 0，得到 a = ' + coefficient + '，b = ' + linear + '，c = ' + constant + '，一次项系数要连同符号一起写。';
    }
    return { id: 'cv2_' + topicId + '_' + level + '_' + index, topicId, difficulty: ['basic', 'standard', 'advanced'][level], type: choice ? 'choice' : 'numeric', prompt, answer, explanation, ...choice, source: 'controlled-template', variantIndex: index, experimentalDifficulty: true };
  }
  function seed(topicId) {
    const items = supported.includes(topicId) ? [item(topicId, 0, 0), item(topicId, 1, 1), item(topicId, 1, 2)] : [];
    if (topicId === 'cnm_p001') {
      const replacement = item(topicId, 1, 3); replacement.replaces = 'cnm_p001_q4'; items.push(replacement);
    }
    if (topicId === 'cnm_p210') {
      const replacement = item(topicId, 1, 3); replacement.replaces = 'cnm_p210_q4'; items.push(replacement);
    }
    return items;
  }
  return { supported, item, seed, deprecated: ['cnm_p001_q4', 'cnm_p210_q4'] };
});

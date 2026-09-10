export function moveItem(items, fromIndex, toIndex) {
  if (
    !Array.isArray(items) ||
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return Array.isArray(items) ? [...items] : [];
  }

  const result = [...items];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}

export function nextIndex(length, currentIndex) {
  if (length <= 0) return -1;
  if (currentIndex < 0) return 0;
  return currentIndex + 1 < length ? currentIndex + 1 : -1;
}

export function previousIndex(length, currentIndex) {
  if (length <= 0) return -1;
  if (currentIndex < 0) return 0;
  return currentIndex - 1 >= 0 ? currentIndex - 1 : -1;
}

export function removeItem(items, index) {
  if (!Array.isArray(items) || index < 0 || index >= items.length) {
    return Array.isArray(items) ? [...items] : [];
  }

  return items.filter((_, itemIndex) => itemIndex !== index);
}

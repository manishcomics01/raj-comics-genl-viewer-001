const CATALOG_URL = 'data/comics.json';
let comics = [];
let currentComic = null;
let pageIndex = 0;
const $ = id => document.getElementById(id);

function updateUrl(number) {
  const url = new URL(window.location.href);
  url.searchParams.set('comic', number);
  history.replaceState(null, '', url);
}
function showPage() {
  const images = currentComic?.images || [];
  const total = images.length;
  $('pageCounter').textContent = `Page ${total ? pageIndex + 1 : 0} of ${total}`;
  $('comicMeta').textContent = [currentComic.number, currentComic.language, `Page ${pageIndex + 1} of ${(currentComic.images || []).length}`].filter(Boolean).join(' · ');
  $('prevButton').disabled = total === 0 || pageIndex <= 0;
  $('nextButton').disabled = total === 0 || pageIndex >= total - 1;
  $('pageInput').max = String(Math.max(total, 1));
  $('pageInput').value = total ? String(pageIndex + 1) : '1';
  $('emptyState').hidden = total !== 0;
  $('imageError').hidden = true;
  const image = $('pageImage');
  if (!total) {
    image.hidden = true;
    image.removeAttribute('src');
    return;
  }
  image.hidden = false;
  image.alt = `${currentComic.title} — page ${pageIndex + 1}`;
  image.onerror = () => { image.hidden = true; $('imageError').hidden = false; };
  image.onload = () => { $('imageError').hidden = true; image.hidden = false;// Scroll to the top after the image loads
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    }); };
  image.src = images[pageIndex];
}
function selectComic(number, resetPage = true) {
  const found = comics.find(comic => comic.number === number) || comics[0];
  if (!found) return;
  currentComic = found;
  if (resetPage) pageIndex = 0;
  $('comicPicker').value = currentComic.number;
  $('comicTitle').textContent = currentComic.title || currentComic.number;
  //$('comicMeta').textContent = [currentComic.number, currentComic.year, currentComic.language, `${(currentComic.images || []).length} images`].filter(Boolean).join(' · ');
  $('comicMeta').textContent = [currentComic.number, currentComic.language, `Page ${pageIndex + 1} of ${(currentComic.images || []).length}`].filter(Boolean).join(' · ');
  updateUrl(currentComic.number);
  showPage();
}
async function init() {
  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) throw new Error(`Could not load comic catalog (${response.status})`);
    const data = await response.json();
    comics = Array.isArray(data.comics) ? data.comics : [];
    const picker = $('comicPicker');
    comics.forEach(comic => {
      const option = document.createElement('option');
      option.value = comic.number;
      option.textContent = `${comic.number} — ${comic.title}`;
      picker.appendChild(option);
    });
    if (!comics.length) {
      $('comicTitle').textContent = 'No comics configured';
      $('emptyState').hidden = false;
      return;
    }
    picker.addEventListener('change', () => selectComic(picker.value));
    $('prevButton').addEventListener('click', () => { if (pageIndex > 0) { pageIndex--; showPage(); } });
    $('nextButton').addEventListener('click', () => { if (currentComic && pageIndex < currentComic.images.length - 1) { pageIndex++; showPage(); } });
    $('goButton').addEventListener('click', () => {
      const target = Number.parseInt($('pageInput').value, 10) - 1;
      if (currentComic && Number.isInteger(target) && target >= 0 && target < currentComic.images.length) { pageIndex = target; showPage(); }
    });
    document.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' && pageIndex > 0) { pageIndex--; showPage(); }
      if (event.key === 'ArrowRight' && currentComic && pageIndex < currentComic.images.length - 1) { pageIndex++; showPage(); }
    });
    const requestedComic = new URLSearchParams(window.location.search).get('comic');
    selectComic(requestedComic || comics[0].number);
  } catch (error) {
    $('comicTitle').textContent = 'Viewer could not be loaded';
    $('emptyState').hidden = false;
    $('emptyState').textContent = `${error.message}. Run the website through a local web server and check data/comics.json.`;
  }
}
init();

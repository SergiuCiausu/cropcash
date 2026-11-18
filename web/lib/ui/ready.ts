/* The page is on screen: the skeleton fades out (styles/skeleton.css). Every way a page can end up
   showing something calls this: the scripts finishing, a React screen's farm arriving, the guard's
   own cards, and a page that failed to start. */
export function markReady() {
  document.documentElement.dataset.ready = '';
}

/*! SignFlow — confidential demo watermark */
(function () {
  var wm = document.createElement('div');
  wm.id = 'sf-wm';
  var tile = ('CONFIDENTIAL DEMO          ').repeat(6);
  var rows = '';
  for (var i = 0; i < 14; i++) {
    rows += '<div style="position:absolute;white-space:nowrap;left:-60%;width:220%;margin-top:' + (i*80) + 'px">'
      + '<span style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.18em;color:#fff;user-select:none;-webkit-user-select:none">' + tile + '</span></div>';
  }
  wm.innerHTML = rows;
  wm.setAttribute('style','position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99998;overflow:hidden;transform:rotate(-28deg);transform-origin:50% 50%;opacity:0.045;');
  function inject(){ document.body.appendChild(wm); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', inject) : inject();
})();

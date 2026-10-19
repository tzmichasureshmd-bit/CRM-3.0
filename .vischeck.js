(function(){
  var results = [];
  var walk = function(el){
    if (el.nodeType !== 1) return;
    var cs = getComputedStyle(el);
    var text = el.innerText || el.textContent || '';
    var trim = text.trim();
    if (trim.length > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0){
      results.push({tag: el.tagName, cls: el.className, text: trim.slice(0,40), color: cs.color, bg: cs.backgroundColor, opacity: cs.opacity});
    }
    for (var i = 0; i < el.children.length; i++) walk(el.children[i]);
  };
  walk(document.body);
  var inv = results.filter(function(r){ return r.color === r.bg && r.color !== 'rgba(0, 0, 0, 0)'; });
  var wow = results.filter(function(r){ return /255,\s*255,\s*255/.test(r.color) && /255,\s*255,\s*255/.test(r.bg); });
  return {total: results.length, invisible: inv, whiteOnWhite: wow};
})();

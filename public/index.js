document.querySelectorAll('.crypt-mail').forEach(e => {
  e.addEventListener("click", event => {
    event.preventDefault();
    t = event.target;
    v = t.dataset.tld + '\u002E' + t.dataset.domain + '\u0040' + t.dataset.user;
    v = v.split("").reverse().join("");
    window.location.href = "mailto:" + v;
  })
});
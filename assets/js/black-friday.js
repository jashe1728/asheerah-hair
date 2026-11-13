/* Temporary Black Friday announcement. Ends after 1 December, Lisbon time. */
(function () {
  'use strict';
  var deadline = Date.parse('2026-12-02T00:00:00Z');
  var header = document.querySelector('.site-header');
  if (!header || Date.now() >= deadline) return;
  var copy = {
    pt: ['Black Friday', 'Termina em'], en: ['Black Friday', 'Ends in'],
    es: ['Black Friday', 'Termina en'], fr: ['Black Friday', 'Se termine dans'],
    de: ['Black Friday', 'Endet in'], it: ['Black Friday', 'Termina tra']
  };
  var logo = new URL('../img/asheerah-logo-beige-banner.png', document.currentScript.src).href;
  var banner = document.createElement('section');
  banner.className = 'black-friday-banner';
  banner.setAttribute('aria-label', 'Black Friday');
  banner.innerHTML = '<div class="bf-inner"><div class="bf-brand"><img class="bf-logo" alt="Asheerah Hair"><span class="bf-brand-rule" aria-hidden="true"></span></div><div class="bf-heading"><span class="bf-eyebrow">THE COUNTDOWN IS ON</span><div class="bf-title">BLACK <em>FRIDAY</em><span class="bf-period">.</span></div></div><div class="bf-countdown"><span class="bf-label black-friday-label"></span><span class="bf-clock black-friday-clock" aria-live="off"></span><span class="bf-date">01 / 12 / 2026</span></div></div>';
  banner.querySelector('.bf-logo').src = logo;
  header.insertBefore(banner, header.firstChild);
  var label = banner.querySelector('.black-friday-label');
  var clock = banner.querySelector('.black-friday-clock');
  function update() {
    var remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (!remaining) { banner.remove(); clearInterval(timer); return; }
    var lang = (document.documentElement.lang || 'pt').slice(0, 2);
    label.textContent = (copy[lang] || copy.pt)[1];
    var messages = {pt:'A contagem decrescente começou', en:'The countdown is on', es:'Comienza la cuenta atrás', fr:'Le compte à rebours a commencé', de:'Der Countdown läuft', it:'Il conto alla rovescia è iniziato'};
    banner.querySelector('.bf-eyebrow').textContent = messages[lang] || messages.pt;
    var days = Math.floor(remaining / 86400);
    var hours = Math.floor(remaining % 86400 / 3600);
    var minutes = Math.floor(remaining % 3600 / 60);
    var seconds = remaining % 60;
    function pad(value) { return String(value).padStart(2, '0'); }
    clock.textContent = days + 'd ' + pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds) + 's';
    clock.setAttribute('aria-label', clock.textContent);
  }
  var timer = setInterval(update, 1000);
  update();
}());
